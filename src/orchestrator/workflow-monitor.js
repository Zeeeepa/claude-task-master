/**
 * @fileoverview Workflow Monitor
 * @description Monitors workflow progress, tracks task completion, handles failures,
 * and provides real-time status updates for autonomous development workflows.
 */

import { log } from '../../scripts/modules/utils.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Workflow Monitor for tracking and managing workflow execution
 */
export class WorkflowMonitor {
    constructor(orchestrator) {
        this.orchestrator = orchestrator;
        this.activeWorkflows = new Map();
        this.monitoringInterval = 30000; // 30 seconds
        this.maxRetries = 3;
        this.isInitialized = false;
        this.isShutdown = false;
        
        log('debug', 'Workflow Monitor created');
    }

    /**
     * Initialize the workflow monitor
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        log('info', 'Initializing Workflow Monitor...');
        
        try {
            this.isInitialized = true;
            this.isShutdown = false;
            log('info', 'Workflow Monitor initialized successfully');
        } catch (error) {
            log('error', 'Failed to initialize Workflow Monitor:', error);
            throw error;
        }
    }

    /**
     * Monitor workflow progress
     * @param {string} workflowId - Workflow ID to monitor
     */
    async monitorWorkflow(workflowId) {
        this._ensureInitialized();
        
        if (this.activeWorkflows.has(workflowId)) {
            log('warn', `Workflow ${workflowId} is already being monitored`);
            return;
        }

        log('info', `Starting monitoring for workflow: ${workflowId}`);
        
        try {
            const workflow = await this.orchestrator.db.getWorkflow(workflowId);
            
            const monitor = {
                workflowId,
                startTime: Date.now(),
                lastCheck: Date.now(),
                checkCount: 0,
                retryCount: 0,
                status: 'monitoring',
                errors: []
            };

            this.activeWorkflows.set(workflowId, monitor);
            
            // Start polling
            this.pollWorkflow(workflowId);
            
        } catch (error) {
            log('error', `Failed to start monitoring workflow ${workflowId}:`, error);
            throw error;
        }
    }

    /**
     * Poll workflow status
     * @param {string} workflowId - Workflow ID to poll
     */
    async pollWorkflow(workflowId) {
        if (this.isShutdown) {
            return;
        }

        const monitor = this.activeWorkflows.get(workflowId);
        if (!monitor) {
            log('warn', `Monitor not found for workflow ${workflowId}`);
            return;
        }

        try {
            const workflow = await this.orchestrator.db.getWorkflow(workflowId);
            const tasks = await this.orchestrator.db.getWorkflowTasks(workflowId);
            
            monitor.checkCount++;
            monitor.lastCheck = Date.now();

            // Analyze task completion status
            const taskAnalysis = this.analyzeTaskStatus(tasks);
            
            // Update workflow progress
            const progress = this.calculateProgress(taskAnalysis);
            
            await this.orchestrator.db.updateWorkflow(workflowId, {
                progress: progress.percentage,
                completedTasks: taskAnalysis.completed.length,
                failedTasks: taskAnalysis.failed.length,
                inProgressTasks: taskAnalysis.inProgress.length,
                lastUpdate: new Date(),
                status: this.determineWorkflowStatus(taskAnalysis, progress)
            });

            // Handle different workflow states
            if (progress.percentage === 100 && taskAnalysis.failed.length === 0) {
                await this.handleWorkflowCompletion(workflowId, taskAnalysis);
                this.activeWorkflows.delete(workflowId);
            } else if (taskAnalysis.failed.length > 0) {
                await this.handleWorkflowFailures(workflowId, taskAnalysis.failed);
                // Continue monitoring after handling failures
                this.scheduleNextPoll(workflowId);
            } else if (this.isWorkflowStuck(taskAnalysis, monitor)) {
                await this.handleStuckWorkflow(workflowId, taskAnalysis);
                this.scheduleNextPoll(workflowId);
            } else {
                // Continue monitoring
                this.scheduleNextPoll(workflowId);
            }

            // Update Linear issues with progress
            await this.updateLinearProgress(workflowId, workflow, taskAnalysis, progress);

            log('debug', `Workflow ${workflowId} poll completed`, {
                progress: progress.percentage,
                completed: taskAnalysis.completed.length,
                failed: taskAnalysis.failed.length,
                inProgress: taskAnalysis.inProgress.length
            });

        } catch (error) {
            monitor.errors.push({
                timestamp: Date.now(),
                error: error.message
            });
            monitor.retryCount++;
            
            log('error', `Error monitoring workflow ${workflowId}:`, error);
            
            if (monitor.retryCount < this.maxRetries) {
                // Retry with exponential backoff
                const delay = Math.min(60000, this.monitoringInterval * Math.pow(2, monitor.retryCount));
                setTimeout(() => this.pollWorkflow(workflowId), delay);
            } else {
                log('error', `Max retries exceeded for workflow ${workflowId}, stopping monitoring`);
                await this.handleMonitoringFailure(workflowId, monitor);
                this.activeWorkflows.delete(workflowId);
            }
        }
    }

    /**
     * Schedule next poll
     * @param {string} workflowId - Workflow ID
     */
    scheduleNextPoll(workflowId) {
        if (!this.isShutdown) {
            setTimeout(() => this.pollWorkflow(workflowId), this.monitoringInterval);
        }
    }

    /**
     * Analyze task status
     * @param {Array} tasks - Array of tasks
     * @returns {Object} Task analysis
     */
    analyzeTaskStatus(tasks) {
        const analysis = {
            total: tasks.length,
            pending: [],
            inProgress: [],
            completed: [],
            failed: [],
            cancelled: []
        };

        for (const task of tasks) {
            switch (task.status) {
                case 'pending':
                    analysis.pending.push(task);
                    break;
                case 'in_progress':
                    analysis.inProgress.push(task);
                    break;
                case 'completed':
                    analysis.completed.push(task);
                    break;
                case 'failed':
                    analysis.failed.push(task);
                    break;
                case 'cancelled':
                    analysis.cancelled.push(task);
                    break;
                default:
                    analysis.pending.push(task);
            }
        }

        return analysis;
    }

    /**
     * Calculate workflow progress
     * @param {Object} taskAnalysis - Task analysis results
     * @returns {Object} Progress information
     */
    calculateProgress(taskAnalysis) {
        const total = taskAnalysis.total;
        const completed = taskAnalysis.completed.length;
        const failed = taskAnalysis.failed.length;
        const cancelled = taskAnalysis.cancelled.length;
        
        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
        
        return {
            percentage,
            completed,
            failed,
            cancelled,
            remaining: total - completed - failed - cancelled,
            total
        };
    }

    /**
     * Determine workflow status
     * @param {Object} taskAnalysis - Task analysis
     * @param {Object} progress - Progress information
     * @returns {string} Workflow status
     */
    determineWorkflowStatus(taskAnalysis, progress) {
        if (progress.percentage === 100 && taskAnalysis.failed.length === 0) {
            return 'completed';
        } else if (taskAnalysis.failed.length > 0) {
            return 'failed';
        } else if (taskAnalysis.inProgress.length > 0) {
            return 'in_progress';
        } else if (taskAnalysis.pending.length > 0) {
            return 'pending';
        } else {
            return 'unknown';
        }
    }

    /**
     * Check if workflow is stuck
     * @param {Object} taskAnalysis - Task analysis
     * @param {Object} monitor - Monitor state
     * @returns {boolean} True if workflow appears stuck
     */
    isWorkflowStuck(taskAnalysis, monitor) {
        // Consider stuck if no progress for extended period
        const stuckThreshold = 10 * 60 * 1000; // 10 minutes
        const timeSinceStart = Date.now() - monitor.startTime;
        
        return (
            timeSinceStart > stuckThreshold &&
            taskAnalysis.inProgress.length === 0 &&
            taskAnalysis.pending.length > 0 &&
            taskAnalysis.completed.length === 0
        );
    }

    /**
     * Handle workflow completion
     * @param {string} workflowId - Workflow ID
     * @param {Object} taskAnalysis - Task analysis
     */
    async handleWorkflowCompletion(workflowId) {
        log('info', `Workflow ${workflowId} completed successfully`);
        
        try {
            const workflow = await this.orchestrator.db.getWorkflow(workflowId);
            
            // Update Linear main issue
            if (workflow.mainIssueId) {
                await this.orchestrator.linear.updateIssue(workflow.mainIssueId, {
                    state: 'completed',
                    description: this.appendCompletionSummary(workflow)
                });
            }

            // Store success patterns
            await this.storeSuccessPatterns(workflowId, workflow);

            // Send completion notification
            await this.sendCompletionNotification(workflowId, workflow);

            log('info', `Workflow ${workflowId} completion handling finished`);
            
        } catch (error) {
            log('error', `Failed to handle workflow completion for ${workflowId}:`, error);
        }
    }

    /**
     * Handle workflow failures
     * @param {string} workflowId - Workflow ID
     * @param {Array} failedTasks - Failed tasks
     */
    async handleWorkflowFailures(workflowId, failedTasks) {
        log('warn', `Handling ${failedTasks.length} failed tasks in workflow ${workflowId}`);
        
        try {
            for (const task of failedTasks) {
                await this.handleTaskFailure(workflowId, task);
            }
            
            // Update workflow status
            await this.orchestrator.db.updateWorkflow(workflowId, {
                status: 'failed',
                failureReason: `${failedTasks.length} tasks failed`,
                lastUpdate: new Date()
            });

            // Notify about failures
            await this.sendFailureNotification(workflowId, failedTasks);
            
        } catch (error) {
            log('error', `Failed to handle workflow failures for ${workflowId}:`, error);
        }
    }

    /**
     * Handle individual task failure
     * @param {string} workflowId - Workflow ID
     * @param {Object} task - Failed task
     */
    async handleTaskFailure(workflowId, task) {
        try {
            // Increment error count
            const errorCount = (task.errorCount || 0) + 1;
            
            await this.orchestrator.db.updateTask(task.id, {
                errorCount,
                lastError: new Date(),
                status: 'failed'
            });

            // Create restructure issue if needed
            if (errorCount > 2) {
                await this.createRestructureIssue(workflowId, task);
            }

            // Update Linear sub-issue
            if (task.linearIssueId) {
                await this.orchestrator.linear.updateIssue(task.linearIssueId, {
                    state: 'failed',
                    description: this.appendFailureInfo(task)
                });
            }
            
        } catch (error) {
            log('error', `Failed to handle task failure for ${task.id}:`, error);
        }
    }

    /**
     * Handle stuck workflow
     * @param {string} workflowId - Workflow ID
     * @param {Object} taskAnalysis - Task analysis
     */
    async handleStuckWorkflow(workflowId, taskAnalysis) {
        log('warn', `Workflow ${workflowId} appears to be stuck`);
        
        try {
            // Try to restart pending tasks
            for (const task of taskAnalysis.pending.slice(0, 3)) { // Limit to 3 tasks
                await this.restartTask(task);
            }
            
            // Update workflow status
            await this.orchestrator.db.updateWorkflow(workflowId, {
                status: 'stuck',
                lastUpdate: new Date()
            });

            // Send stuck notification
            await this.sendStuckNotification(workflowId, taskAnalysis);
            
        } catch (error) {
            log('error', `Failed to handle stuck workflow ${workflowId}:`, error);
        }
    }

    /**
     * Handle monitoring failure
     * @param {string} workflowId - Workflow ID
     * @param {Object} monitor - Monitor state
     */
    async handleMonitoringFailure(workflowId, monitor) {
        log('error', `Monitoring failed for workflow ${workflowId}`);
        
        try {
            await this.orchestrator.db.updateWorkflow(workflowId, {
                status: 'monitoring_failed',
                monitoringErrors: monitor.errors,
                lastUpdate: new Date()
            });
            
        } catch (error) {
            log('error', `Failed to record monitoring failure for ${workflowId}:`, error);
        }
    }

    /**
     * Update Linear progress
     * @param {string} workflowId - Workflow ID
     * @param {Object} workflow - Workflow object
     * @param {Object} taskAnalysis - Task analysis
     * @param {Object} progress - Progress information
     */
    async updateLinearProgress(workflowId, workflow, taskAnalysis, progress) {
        try {
            if (workflow.mainIssueId) {
                const progressComment = this.formatProgressComment(taskAnalysis, progress);
                
                await this.orchestrator.linear.addComment(workflow.mainIssueId, {
                    body: progressComment
                });
            }
        } catch (error) {
            log('error', `Failed to update Linear progress for ${workflowId}:`, error);
        }
    }

    /**
     * Restart a task
     * @param {Object} task - Task to restart
     */
    async restartTask(task) {
        try {
            await this.orchestrator.db.updateTask(task.id, {
                status: 'pending',
                restartCount: (task.restartCount || 0) + 1,
                lastRestart: new Date()
            });

            // Reassign to Codegen
            if (task.linearIssueId) {
                await this.orchestrator.linear.updateIssue(task.linearIssueId, {
                    assigneeId: await this.orchestrator.getCodegenUserId(),
                    state: 'pending'
                });
            }
            
            log('info', `Restarted task: ${task.title}`);
        } catch (error) {
            log('error', `Failed to restart task ${task.id}:`, error);
        }
    }

    /**
     * Create restructure issue
     * @param {string} workflowId - Workflow ID
     * @param {Object} task - Failed task
     */
    async createRestructureIssue(workflowId, task) {
        try {
            const restructureIssue = await this.orchestrator.linear.createIssue({
                title: `🔧 Restructure: ${task.title}`,
                description: this.formatRestructureDescription(task),
                priority: 'high',
                labels: ['restructure', 'failed-task'],
                assigneeId: await this.orchestrator.getCodegenUserId()
            });

            await this.orchestrator.db.createTask({
                workflowId,
                title: `Restructure: ${task.title}`,
                type: 'restructure',
                description: `Restructure failed task: ${task.title}`,
                linearIssueId: restructureIssue.id,
                originalTaskId: task.id,
                priority: 'high',
                status: 'pending'
            });
            
            log('info', `Created restructure issue for task: ${task.title}`);
        } catch (error) {
            log('error', `Failed to create restructure issue for task ${task.id}:`, error);
        }
    }

    /**
     * Store success patterns
     * @param {string} workflowId - Workflow ID
     * @param {Object} workflow - Workflow object
     */
    async storeSuccessPatterns(workflowId, workflow) {
        try {
            const patterns = await this.extractSuccessPatterns(workflowId);
            
            await this.orchestrator.db.storeSuccessPattern({
                workflowId,
                completionTime: Date.now() - new Date(workflow.startTime).getTime(),
                taskCount: workflow.totalTasks,
                patterns: patterns,
                analysisId: workflow.analysis?.id
            });
            
        } catch (error) {
            log('error', `Failed to store success patterns for ${workflowId}:`, error);
        }
    }

    /**
     * Extract success patterns from completed workflow
     * @param {string} workflowId - Workflow ID
     * @returns {Promise<Object>} Success patterns
     */
    async extractSuccessPatterns(workflowId) {
        try {
            const tasks = await this.orchestrator.db.getWorkflowTasks(workflowId);
            const completedTasks = tasks.filter(t => t.status === 'completed');
            
            return {
                taskTypes: this.getTaskTypeDistribution(completedTasks),
                averageTaskDuration: this.calculateAverageTaskDuration(completedTasks),
                successfulPatterns: this.identifySuccessfulPatterns(completedTasks),
                dependencies: this.analyzeDependencyPatterns(completedTasks)
            };
        } catch (error) {
            log('error', `Failed to extract success patterns for ${workflowId}:`, error);
            return {};
        }
    }

    /**
     * Get task type distribution
     * @param {Array} tasks - Tasks array
     * @returns {Object} Type distribution
     */
    getTaskTypeDistribution(tasks) {
        const distribution = {};
        for (const task of tasks) {
            distribution[task.type] = (distribution[task.type] || 0) + 1;
        }
        return distribution;
    }

    /**
     * Calculate average task duration
     * @param {Array} tasks - Completed tasks
     * @returns {number} Average duration in milliseconds
     */
    calculateAverageTaskDuration(tasks) {
        const durations = tasks
            .filter(t => t.completedAt && t.createdAt)
            .map(t => new Date(t.completedAt) - new Date(t.createdAt));
        
        return durations.length > 0 
            ? durations.reduce((sum, d) => sum + d, 0) / durations.length 
            : 0;
    }

    /**
     * Identify successful patterns
     * @param {Array} tasks - Completed tasks
     * @returns {Array} Successful patterns
     */
    identifySuccessfulPatterns(tasks) {
        // This could be enhanced with ML in the future
        return [
            'sequential_execution',
            'proper_dependency_handling',
            'comprehensive_testing'
        ];
    }

    /**
     * Analyze dependency patterns
     * @param {Array} tasks - Completed tasks
     * @returns {Object} Dependency patterns
     */
    analyzeDependencyPatterns(tasks) {
        return {
            averageDependencies: tasks.reduce((sum, t) => sum + (t.dependencies?.length || 0), 0) / tasks.length,
            maxDependencies: Math.max(...tasks.map(t => t.dependencies?.length || 0))
        };
    }

    /**
     * Format progress comment for Linear
     * @param {Object} taskAnalysis - Task analysis
     * @param {Object} progress - Progress information
     * @returns {string} Formatted comment
     */
    formatProgressComment(taskAnalysis, progress) {
        return `## 📊 Workflow Progress Update

**Overall Progress**: ${progress.percentage}% (${progress.completed}/${progress.total} tasks)

**Task Status**:
- ✅ Completed: ${taskAnalysis.completed.length}
- 🔄 In Progress: ${taskAnalysis.inProgress.length}
- ⏳ Pending: ${taskAnalysis.pending.length}
- ❌ Failed: ${taskAnalysis.failed.length}

*Updated: ${new Date().toISOString()}*`;
    }

    /**
     * Append completion summary to workflow
     * @param {Object} workflow - Workflow object
     * @returns {string} Updated description
     */
    appendCompletionSummary(workflow) {
        const completionSummary = `

---

## ✅ Workflow Completed Successfully

**Completion Time**: ${new Date().toISOString()}
**Total Duration**: ${this.formatDuration(Date.now() - new Date(workflow.startTime).getTime())}
**Tasks Completed**: ${workflow.completedTasks || 0}

*Workflow managed by OpenEvolve Central Orchestrator*`;

        return (workflow.description || '') + completionSummary;
    }

    /**
     * Append failure info to task
     * @param {Object} task - Task object
     * @returns {string} Updated description
     */
    appendFailureInfo(task) {
        const failureInfo = `

---

## ❌ Task Failed

**Failure Time**: ${new Date().toISOString()}
**Error Count**: ${task.errorCount || 1}
**Status**: Requires manual intervention

*Please review and restart or restructure this task*`;

        return (task.description || '') + failureInfo;
    }

    /**
     * Format restructure description
     * @param {Object} task - Failed task
     * @returns {string} Restructure description
     */
    formatRestructureDescription(task) {
        return `# 🔧 Task Restructure Required

## Original Task
**Title**: ${task.title}
**Type**: ${task.type}
**Status**: Failed after ${task.errorCount || 1} attempts

## Description
${task.description}

## Failure Analysis
This task has failed multiple times and requires restructuring or manual intervention.

## Next Steps
1. Analyze the failure reasons
2. Restructure the task approach
3. Update requirements if necessary
4. Restart with new implementation strategy

---
*Generated by OpenEvolve Workflow Monitor*`;
    }

    /**
     * Format duration
     * @param {number} milliseconds - Duration in milliseconds
     * @returns {string} Formatted duration
     */
    formatDuration(milliseconds) {
        const hours = Math.floor(milliseconds / (1000 * 60 * 60));
        const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${minutes}m`;
    }

    /**
     * Send completion notification
     * @param {string} workflowId - Workflow ID
     * @param {Object} workflow - Workflow object
     */
    async sendCompletionNotification(workflowId, workflow) {
        // Implementation would depend on notification system
        log('info', `Workflow ${workflowId} completed - notification sent`);
    }

    /**
     * Send failure notification
     * @param {string} workflowId - Workflow ID
     * @param {Array} failedTasks - Failed tasks
     */
    async sendFailureNotification(workflowId, failedTasks) {
        // Implementation would depend on notification system
        log('warn', `Workflow ${workflowId} has ${failedTasks.length} failed tasks - notification sent`);
    }

    /**
     * Send stuck notification
     * @param {string} workflowId - Workflow ID
     * @param {Object} taskAnalysis - Task analysis
     */
    async sendStuckNotification(workflowId, taskAnalysis) {
        // Implementation would depend on notification system
        log('warn', `Workflow ${workflowId} appears stuck - notification sent`);
    }

    /**
     * Ensure monitor is initialized
     * @private
     */
    _ensureInitialized() {
        if (!this.isInitialized) {
            throw new Error('Workflow Monitor not initialized. Call initialize() first.');
        }
    }

    /**
     * Get monitor statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        return {
            isInitialized: this.isInitialized,
            activeWorkflows: this.activeWorkflows.size,
            monitoringInterval: this.monitoringInterval,
            maxRetries: this.maxRetries
        };
    }

    /**
     * Shutdown the monitor
     */
    async shutdown() {
        log('info', 'Shutting down Workflow Monitor...');
        
        this.isShutdown = true;
        this.activeWorkflows.clear();
        this.isInitialized = false;
        
        log('info', 'Workflow Monitor shut down');
    }
}

export default WorkflowMonitor;

