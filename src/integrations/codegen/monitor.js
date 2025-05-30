/**
 * @fileoverview Codegen Progress Monitoring System
 * @description Real-time monitoring and progress tracking for Codegen tasks
 */

import { log } from '../../scripts/modules/utils.js';

/**
 * Codegen Monitor - Handles progress tracking and status updates
 */
export class CodegenMonitor {
    constructor(codegenClient, database, linearClient, options = {}) {
        this.codegen = codegenClient;
        this.db = database;
        this.linear = linearClient;
        this.options = {
            defaultPollInterval: 10000, // 10 seconds
            maxPollInterval: 60000, // 1 minute
            exponentialBackoff: true,
            maxRetries: 5,
            enableLinearUpdates: true,
            enableDatabaseUpdates: true,
            ...options
        };

        // Track active monitoring tasks
        this.activeTasks = new Map();
        this.statistics = {
            tasksMonitored: 0,
            tasksCompleted: 0,
            tasksFailed: 0,
            totalPolls: 0,
            averageCompletionTime: 0
        };

        log('debug', 'Codegen Monitor initialized');
    }

    /**
     * Start monitoring a Codegen task
     * @param {string} codegenTaskId - Codegen task ID
     * @param {string} taskId - Internal task ID
     * @param {Object} options - Monitoring options
     */
    startMonitoring(codegenTaskId, taskId, options = {}) {
        if (this.activeTasks.has(codegenTaskId)) {
            log('warning', `Task ${codegenTaskId} is already being monitored`);
            return;
        }

        const monitorConfig = {
            taskId,
            codegenTaskId,
            startTime: Date.now(),
            lastUpdate: Date.now(),
            pollCount: 0,
            retryCount: 0,
            pollInterval: options.pollInterval || this.options.defaultPollInterval,
            maxRetries: options.maxRetries || this.options.maxRetries,
            onProgress: options.onProgress,
            onComplete: options.onComplete,
            onError: options.onError
        };

        this.activeTasks.set(codegenTaskId, monitorConfig);
        this.statistics.tasksMonitored++;

        log('info', `Started monitoring Codegen task ${codegenTaskId} for task ${taskId}`);
        
        // Start polling immediately
        this.pollTask(codegenTaskId);
    }

    /**
     * Stop monitoring a task
     * @param {string} codegenTaskId - Codegen task ID
     */
    stopMonitoring(codegenTaskId) {
        const monitor = this.activeTasks.get(codegenTaskId);
        if (!monitor) {
            return;
        }

        // Clear any pending timeouts
        if (monitor.timeoutId) {
            clearTimeout(monitor.timeoutId);
        }

        this.activeTasks.delete(codegenTaskId);
        log('debug', `Stopped monitoring Codegen task ${codegenTaskId}`);
    }

    /**
     * Poll a specific task for updates
     * @param {string} codegenTaskId - Codegen task ID
     */
    async pollTask(codegenTaskId) {
        const monitor = this.activeTasks.get(codegenTaskId);
        if (!monitor) {
            return; // Task was stopped
        }

        try {
            log('debug', `Polling Codegen task ${codegenTaskId} (attempt ${monitor.pollCount + 1})`);
            
            // Get task status from Codegen
            const task = await this.codegen.monitorTask(codegenTaskId);
            
            // Update monitor state
            monitor.pollCount++;
            monitor.lastUpdate = Date.now();
            monitor.retryCount = 0; // Reset retry count on successful poll
            this.statistics.totalPolls++;

            // Update progress in database and Linear
            await this.updateProgress(monitor.taskId, task);

            // Call progress callback if provided
            if (monitor.onProgress) {
                try {
                    await monitor.onProgress(task, monitor);
                } catch (callbackError) {
                    log('warning', `Progress callback error for task ${codegenTaskId}: ${callbackError.message}`);
                }
            }

            // Check if task is complete
            if (task.status === 'completed' || task.status === 'failed') {
                await this.handleTaskCompletion(codegenTaskId, task);
            } else {
                // Schedule next poll
                this.scheduleNextPoll(codegenTaskId);
            }

        } catch (error) {
            log('error', `Error polling Codegen task ${codegenTaskId}: ${error.message}`);
            await this.handlePollError(codegenTaskId, error);
        }
    }

    /**
     * Update progress in database and Linear
     * @param {string} taskId - Internal task ID
     * @param {Object} codegenTask - Codegen task data
     */
    async updateProgress(taskId, codegenTask) {
        const updatePromises = [];

        // Update database if enabled
        if (this.options.enableDatabaseUpdates) {
            updatePromises.push(this.updateDatabaseProgress(taskId, codegenTask));
        }

        // Update Linear if enabled
        if (this.options.enableLinearUpdates) {
            updatePromises.push(this.updateLinearProgress(taskId, codegenTask));
        }

        // Execute updates in parallel
        try {
            await Promise.allSettled(updatePromises);
        } catch (error) {
            log('error', `Failed to update progress for task ${taskId}: ${error.message}`);
        }
    }

    /**
     * Update database with progress
     * @param {string} taskId - Internal task ID
     * @param {Object} codegenTask - Codegen task data
     */
    async updateDatabaseProgress(taskId, codegenTask) {
        try {
            await this.db.updateTask(taskId, {
                codegenStatus: codegenTask.status,
                codegenProgress: codegenTask.progress || 0,
                lastCodegenUpdate: new Date(),
                codegenLogs: codegenTask.logs || [],
                codegenMetadata: {
                    estimatedCompletion: codegenTask.estimatedCompletion,
                    resourceUsage: codegenTask.resourceUsage,
                    currentStep: codegenTask.currentStep
                }
            });

            log('debug', `Database updated for task ${taskId}: ${codegenTask.status}`);

        } catch (error) {
            log('error', `Failed to update database for task ${taskId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update Linear with progress
     * @param {string} taskId - Internal task ID
     * @param {Object} codegenTask - Codegen task data
     */
    async updateLinearProgress(taskId, codegenTask) {
        try {
            const taskData = await this.db.getTask(taskId);
            if (!taskData || !taskData.linearIssueId) {
                return;
            }

            // Only post progress updates at certain intervals to avoid spam
            if (this.shouldPostProgressUpdate(taskData, codegenTask)) {
                const progressComment = this.formatProgressComment(codegenTask);
                
                await this.linear.createComment(taskData.linearIssueId, {
                    body: progressComment
                });

                // Update last progress post time
                await this.db.updateTask(taskId, {
                    lastLinearProgressUpdate: new Date()
                });

                log('debug', `Linear progress updated for task ${taskId}`);
            }

        } catch (error) {
            log('error', `Failed to update Linear progress for task ${taskId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Determine if a progress update should be posted to Linear
     * @param {Object} taskData - Task data
     * @param {Object} codegenTask - Codegen task data
     * @returns {boolean} Whether to post update
     */
    shouldPostProgressUpdate(taskData, codegenTask) {
        // Always post on status changes
        if (taskData.codegenStatus !== codegenTask.status) {
            return true;
        }

        // Post on significant progress milestones (every 25%)
        const currentProgress = codegenTask.progress || 0;
        const lastProgress = taskData.codegenProgress || 0;
        const progressDiff = currentProgress - lastProgress;
        
        if (progressDiff >= 25) {
            return true;
        }

        // Post if it's been more than 5 minutes since last update
        const lastUpdate = taskData.lastLinearProgressUpdate;
        if (!lastUpdate || (Date.now() - new Date(lastUpdate).getTime()) > 300000) {
            return true;
        }

        return false;
    }

    /**
     * Handle task completion (success or failure)
     * @param {string} codegenTaskId - Codegen task ID
     * @param {Object} task - Completed task data
     */
    async handleTaskCompletion(codegenTaskId, task) {
        const monitor = this.activeTasks.get(codegenTaskId);
        if (!monitor) {
            return;
        }

        const completionTime = Date.now() - monitor.startTime;
        
        log('info', `Codegen task ${codegenTaskId} completed with status: ${task.status} (${completionTime}ms)`);

        try {
            // Update final progress
            await this.updateProgress(monitor.taskId, task);

            // Update statistics
            if (task.status === 'completed') {
                this.statistics.tasksCompleted++;
            } else {
                this.statistics.tasksFailed++;
            }

            // Update average completion time
            this.updateAverageCompletionTime(completionTime);

            // Call completion callback if provided
            if (monitor.onComplete) {
                try {
                    await monitor.onComplete(task, monitor, completionTime);
                } catch (callbackError) {
                    log('warning', `Completion callback error for task ${codegenTaskId}: ${callbackError.message}`);
                }
            }

        } catch (error) {
            log('error', `Error handling completion for task ${codegenTaskId}: ${error.message}`);
        } finally {
            // Clean up monitoring
            this.stopMonitoring(codegenTaskId);
        }
    }

    /**
     * Handle polling errors with retry logic
     * @param {string} codegenTaskId - Codegen task ID
     * @param {Error} error - Polling error
     */
    async handlePollError(codegenTaskId, error) {
        const monitor = this.activeTasks.get(codegenTaskId);
        if (!monitor) {
            return;
        }

        monitor.retryCount++;

        // Check if we should retry
        if (monitor.retryCount <= monitor.maxRetries) {
            const delay = this.calculateRetryDelay(monitor.retryCount);
            
            log('warning', `Polling error for task ${codegenTaskId}, retrying in ${delay}ms (attempt ${monitor.retryCount}/${monitor.maxRetries})`);
            
            // Schedule retry with exponential backoff
            monitor.timeoutId = setTimeout(() => {
                this.pollTask(codegenTaskId);
            }, delay);

        } else {
            log('error', `Max retries exceeded for task ${codegenTaskId}, stopping monitoring`);
            
            // Call error callback if provided
            if (monitor.onError) {
                try {
                    await monitor.onError(error, monitor);
                } catch (callbackError) {
                    log('warning', `Error callback error for task ${codegenTaskId}: ${callbackError.message}`);
                }
            }

            // Update statistics
            this.statistics.tasksFailed++;

            // Stop monitoring
            this.stopMonitoring(codegenTaskId);
        }
    }

    /**
     * Schedule the next poll for a task
     * @param {string} codegenTaskId - Codegen task ID
     */
    scheduleNextPoll(codegenTaskId) {
        const monitor = this.activeTasks.get(codegenTaskId);
        if (!monitor) {
            return;
        }

        // Calculate next poll interval (with optional exponential backoff)
        let pollInterval = monitor.pollInterval;
        
        if (this.options.exponentialBackoff && monitor.pollCount > 10) {
            // Gradually increase poll interval for long-running tasks
            pollInterval = Math.min(
                monitor.pollInterval * Math.pow(1.1, Math.floor(monitor.pollCount / 10)),
                this.options.maxPollInterval
            );
        }

        monitor.timeoutId = setTimeout(() => {
            this.pollTask(codegenTaskId);
        }, pollInterval);

        log('debug', `Next poll for task ${codegenTaskId} scheduled in ${pollInterval}ms`);
    }

    /**
     * Calculate retry delay with exponential backoff
     * @param {number} retryCount - Current retry count
     * @returns {number} Delay in milliseconds
     */
    calculateRetryDelay(retryCount) {
        if (!this.options.exponentialBackoff) {
            return this.options.defaultPollInterval;
        }

        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
        const baseDelay = 1000;
        const maxDelay = 30000;
        
        return Math.min(baseDelay * Math.pow(2, retryCount - 1), maxDelay);
    }

    /**
     * Format progress comment for Linear
     * @param {Object} codegenTask - Codegen task data
     * @returns {string} Formatted comment
     */
    formatProgressComment(codegenTask) {
        const progress = codegenTask.progress || 0;
        const status = codegenTask.status;
        
        let comment = `🤖 **Codegen Progress Update**\n\n`;
        comment += `**Status**: ${this.formatStatus(status)}\n`;
        comment += `**Progress**: ${this.formatProgressBar(progress)} ${progress}%\n`;
        comment += `**Last Update**: ${new Date().toISOString()}\n`;

        if (codegenTask.currentStep) {
            comment += `**Current Step**: ${codegenTask.currentStep}\n`;
        }

        if (codegenTask.estimatedCompletion) {
            comment += `**Estimated Completion**: ${new Date(codegenTask.estimatedCompletion).toLocaleString()}\n`;
        }

        if (codegenTask.logs && codegenTask.logs.length > 0) {
            comment += `\n**Latest Activity**:\n\`\`\`\n`;
            comment += codegenTask.logs.slice(-3).join('\n');
            comment += `\n\`\`\``;
        }

        return comment;
    }

    /**
     * Format status with emoji
     * @param {string} status - Task status
     * @returns {string} Formatted status
     */
    formatStatus(status) {
        const statusMap = {
            'pending': '⏳ Pending',
            'running': '🔄 Running',
            'completed': '✅ Completed',
            'failed': '❌ Failed',
            'cancelled': '🚫 Cancelled'
        };

        return statusMap[status] || `🔍 ${status}`;
    }

    /**
     * Format progress bar
     * @param {number} progress - Progress percentage
     * @returns {string} Progress bar
     */
    formatProgressBar(progress) {
        const barLength = 10;
        const filledLength = Math.round((progress / 100) * barLength);
        const emptyLength = barLength - filledLength;
        
        return '█'.repeat(filledLength) + '░'.repeat(emptyLength);
    }

    /**
     * Update average completion time
     * @param {number} completionTime - Completion time in milliseconds
     */
    updateAverageCompletionTime(completionTime) {
        const totalCompleted = this.statistics.tasksCompleted + this.statistics.tasksFailed;
        
        if (totalCompleted === 1) {
            this.statistics.averageCompletionTime = completionTime;
        } else {
            // Calculate running average
            this.statistics.averageCompletionTime = 
                (this.statistics.averageCompletionTime * (totalCompleted - 1) + completionTime) / totalCompleted;
        }
    }

    /**
     * Get monitoring statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        return {
            ...this.statistics,
            activeTasks: this.activeTasks.size,
            successRate: this.statistics.tasksMonitored > 0 
                ? (this.statistics.tasksCompleted / this.statistics.tasksMonitored) * 100 
                : 0,
            averageCompletionTimeMinutes: Math.round(this.statistics.averageCompletionTime / 60000 * 100) / 100
        };
    }

    /**
     * Get health status
     * @returns {Object} Health status
     */
    getHealth() {
        const activeTasks = Array.from(this.activeTasks.values());
        const now = Date.now();
        
        return {
            status: 'healthy',
            activeTasks: activeTasks.length,
            statistics: this.getStatistics(),
            oldestActiveTask: activeTasks.length > 0 
                ? Math.max(...activeTasks.map(task => now - task.startTime))
                : 0,
            configuration: this.options
        };
    }

    /**
     * Shutdown the monitor
     */
    async shutdown() {
        log('info', 'Shutting down Codegen Monitor...');

        // Stop all active monitoring
        for (const [codegenTaskId, monitor] of this.activeTasks) {
            if (monitor.timeoutId) {
                clearTimeout(monitor.timeoutId);
            }
        }

        // Clear active tasks
        this.activeTasks.clear();

        log('info', `Codegen Monitor shutdown complete. Final statistics: ${JSON.stringify(this.getStatistics())}`);
    }
}

export default CodegenMonitor;

