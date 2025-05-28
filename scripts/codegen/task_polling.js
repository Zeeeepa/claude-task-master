#!/usr/bin/env node

/**
 * @fileoverview Task Polling Script
 * @description Automated task polling from PostgreSQL database with intelligent processing
 */

import { log } from '../modules/utils.js';
import { DatabaseConnection } from '../../src/ai_cicd_system/database/connection.js';
import { TaskProcessor } from '../../src/ai_cicd_system/core/task_processor.js';
import { PromptGenerator } from '../../src/ai_cicd_system/core/prompt_generator.js';
import { PRCreator } from '../../src/ai_cicd_system/core/pr_creator.js';
import { CodegenIntegrator } from '../../src/ai_cicd_system/core/codegen_integrator.js';

/**
 * Task polling service for automated task processing
 */
class TaskPollingService {
    constructor(config = {}) {
        this.config = {
            pollingInterval: config.pollingInterval || 30000, // 30 seconds
            batchSize: config.batchSize || 5,
            maxRetries: config.maxRetries || 3,
            enableConcurrentProcessing: config.enableConcurrentProcessing !== false,
            maxConcurrentTasks: config.maxConcurrentTasks || 3,
            ...config
        };
        
        this.isRunning = false;
        this.pollingTimer = null;
        this.activeProcessing = new Map();
        this.processingStats = {
            totalProcessed: 0,
            successfullyProcessed: 0,
            failedProcessing: 0,
            averageProcessingTime: 0
        };
        
        // Initialize components
        this.database = new DatabaseConnection(config.database);
        this.taskProcessor = new TaskProcessor(config.taskProcessor);
        this.promptGenerator = new PromptGenerator(config.promptGenerator);
        this.prCreator = new PRCreator(config.prCreator);
        this.codegenIntegrator = new CodegenIntegrator(config.codegen);
        
        log('info', 'Task polling service initialized');
    }

    /**
     * Start the polling service
     */
    async start() {
        try {
            if (this.isRunning) {
                log('warn', 'Task polling service is already running');
                return;
            }

            log('info', 'Starting task polling service...');
            
            // Initialize database connection
            await this.database.connect();
            
            // Initialize other components
            await this.taskProcessor.initialize?.();
            await this.codegenIntegrator.initialize();
            
            this.isRunning = true;
            
            // Start polling
            await this._startPolling();
            
            log('info', 'Task polling service started successfully');
            
        } catch (error) {
            log('error', `Failed to start task polling service: ${error.message}`);
            throw error;
        }
    }

    /**
     * Stop the polling service
     */
    async stop() {
        try {
            log('info', 'Stopping task polling service...');
            
            this.isRunning = false;
            
            // Clear polling timer
            if (this.pollingTimer) {
                clearTimeout(this.pollingTimer);
                this.pollingTimer = null;
            }
            
            // Wait for active processing to complete
            await this._waitForActiveProcessing();
            
            // Cleanup components
            await this.database.disconnect();
            await this.codegenIntegrator.shutdown();
            
            log('info', 'Task polling service stopped successfully');
            
        } catch (error) {
            log('error', `Error stopping task polling service: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get service statistics
     * @returns {Object} Service statistics
     */
    getStatistics() {
        return {
            ...this.processingStats,
            isRunning: this.isRunning,
            activeProcessing: this.activeProcessing.size,
            pollingInterval: this.config.pollingInterval,
            lastPolled: this.lastPolled
        };
    }

    /**
     * Start the polling loop
     * @private
     */
    async _startPolling() {
        const poll = async () => {
            if (!this.isRunning) return;
            
            try {
                await this._pollAndProcessTasks();
            } catch (error) {
                log('error', `Error during polling cycle: ${error.message}`);
            }
            
            // Schedule next poll
            if (this.isRunning) {
                this.pollingTimer = setTimeout(poll, this.config.pollingInterval);
            }
        };
        
        // Start first poll immediately
        await poll();
    }

    /**
     * Poll database and process available tasks
     * @private
     */
    async _pollAndProcessTasks() {
        try {
            this.lastPolled = new Date();
            log('debug', 'Polling for new tasks...');
            
            // Get pending tasks from database
            const pendingTasks = await this._getPendingTasks();
            
            if (pendingTasks.length === 0) {
                log('debug', 'No pending tasks found');
                return;
            }
            
            log('info', `Found ${pendingTasks.length} pending tasks`);
            
            // Process tasks
            if (this.config.enableConcurrentProcessing) {
                await this._processConcurrentTasks(pendingTasks);
            } else {
                await this._processSequentialTasks(pendingTasks);
            }
            
        } catch (error) {
            log('error', `Error polling tasks: ${error.message}`);
        }
    }

    /**
     * Get pending tasks from database
     * @returns {Array} Pending tasks
     * @private
     */
    async _getPendingTasks() {
        const query = `
            SELECT 
                id,
                title,
                description,
                priority,
                status,
                created_at,
                updated_at,
                metadata
            FROM tasks 
            WHERE status = 'pending' 
            AND (processing_attempts IS NULL OR processing_attempts < $1)
            ORDER BY priority DESC, created_at ASC 
            LIMIT $2
        `;
        
        const result = await this.database.query(query, [this.config.maxRetries, this.config.batchSize]);
        return result.rows || [];
    }

    /**
     * Process tasks concurrently
     * @param {Array} tasks - Tasks to process
     * @private
     */
    async _processConcurrentTasks(tasks) {
        const chunks = this._chunkArray(tasks, this.config.maxConcurrentTasks);
        
        for (const chunk of chunks) {
            const promises = chunk.map(task => this._processTask(task));
            await Promise.allSettled(promises);
        }
    }

    /**
     * Process tasks sequentially
     * @param {Array} tasks - Tasks to process
     * @private
     */
    async _processSequentialTasks(tasks) {
        for (const task of tasks) {
            await this._processTask(task);
        }
    }

    /**
     * Process a single task
     * @param {Object} task - Task to process
     * @private
     */
    async _processTask(task) {
        const startTime = Date.now();
        const taskId = task.id;
        
        try {
            log('info', `Processing task ${taskId}: ${task.title}`);
            
            // Mark task as processing
            await this._updateTaskStatus(taskId, 'processing');
            this.activeProcessing.set(taskId, { startTime, task });
            
            // Step 1: Process natural language requirements
            const processedTask = await this.taskProcessor.processNaturalLanguageTask(task);
            log('debug', `Task ${taskId} processed with complexity ${processedTask.complexity}`);
            
            // Step 2: Generate intelligent prompt
            const prompt = await this.promptGenerator.generateCodePrompt(processedTask);
            log('debug', `Generated prompt for task ${taskId} (${prompt.metadata.prompt_length} chars)`);
            
            // Step 3: Send to Codegen for implementation
            const codegenResponse = await this.codegenIntegrator.processTask(processedTask, {
                prompt: prompt.content,
                instructions: prompt.instructions,
                constraints: prompt.constraints
            });
            
            if (!codegenResponse.success) {
                throw new Error(`Codegen processing failed: ${codegenResponse.error}`);
            }
            
            log('debug', `Codegen completed for task ${taskId}`);
            
            // Step 4: Create PR with comprehensive description
            const prInfo = await this.prCreator.createPR(processedTask, {
                files: codegenResponse.data?.modified_files || [],
                summary: codegenResponse.data?.summary || 'Code generated by Codegen AI'
            });
            
            log('info', `PR created for task ${taskId}: ${prInfo.url}`);
            
            // Step 5: Update task status and link PR
            await this._updateTaskWithPR(taskId, prInfo, processedTask);
            
            // Update statistics
            this._updateStatistics(taskId, startTime, true);
            
            log('info', `Task ${taskId} completed successfully`);
            
        } catch (error) {
            log('error', `Failed to process task ${taskId}: ${error.message}`);
            
            // Update task with error
            await this._updateTaskError(taskId, error);
            
            // Update statistics
            this._updateStatistics(taskId, startTime, false);
            
        } finally {
            // Remove from active processing
            this.activeProcessing.delete(taskId);
        }
    }

    /**
     * Update task status in database
     * @param {string} taskId - Task ID
     * @param {string} status - New status
     * @private
     */
    async _updateTaskStatus(taskId, status) {
        const query = `
            UPDATE tasks 
            SET status = $1, updated_at = NOW()
            WHERE id = $2
        `;
        
        await this.database.query(query, [status, taskId]);
    }

    /**
     * Update task with PR information
     * @param {string} taskId - Task ID
     * @param {Object} prInfo - PR information
     * @param {Object} processedTask - Processed task data
     * @private
     */
    async _updateTaskWithPR(taskId, prInfo, processedTask) {
        const query = `
            UPDATE tasks 
            SET 
                status = 'completed',
                pr_url = $1,
                pr_number = $2,
                branch_name = $3,
                completed_at = NOW(),
                updated_at = NOW(),
                processing_metadata = $4
            WHERE id = $5
        `;
        
        const metadata = {
            complexity: processedTask.complexity,
            priority: processedTask.priority,
            estimated_effort: processedTask.estimatedEffort,
            processing_time_ms: Date.now() - this.activeProcessing.get(taskId)?.startTime,
            codegen_version: '2.0'
        };
        
        await this.database.query(query, [
            prInfo.url,
            prInfo.number,
            prInfo.branch,
            JSON.stringify(metadata),
            taskId
        ]);
    }

    /**
     * Update task with error information
     * @param {string} taskId - Task ID
     * @param {Error} error - Error object
     * @private
     */
    async _updateTaskError(taskId, error) {
        const query = `
            UPDATE tasks 
            SET 
                status = 'failed',
                error_message = $1,
                processing_attempts = COALESCE(processing_attempts, 0) + 1,
                updated_at = NOW()
            WHERE id = $2
        `;
        
        await this.database.query(query, [error.message, taskId]);
    }

    /**
     * Update processing statistics
     * @param {string} taskId - Task ID
     * @param {number} startTime - Start time
     * @param {boolean} success - Success status
     * @private
     */
    _updateStatistics(taskId, startTime, success) {
        const processingTime = Date.now() - startTime;
        
        this.processingStats.totalProcessed++;
        
        if (success) {
            this.processingStats.successfullyProcessed++;
        } else {
            this.processingStats.failedProcessing++;
        }
        
        // Update average processing time
        const totalTime = this.processingStats.averageProcessingTime * (this.processingStats.totalProcessed - 1) + processingTime;
        this.processingStats.averageProcessingTime = totalTime / this.processingStats.totalProcessed;
    }

    /**
     * Wait for active processing to complete
     * @private
     */
    async _waitForActiveProcessing() {
        const maxWaitTime = 60000; // 1 minute
        const checkInterval = 1000; // 1 second
        let waitTime = 0;
        
        while (this.activeProcessing.size > 0 && waitTime < maxWaitTime) {
            log('info', `Waiting for ${this.activeProcessing.size} active tasks to complete...`);
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            waitTime += checkInterval;
        }
        
        if (this.activeProcessing.size > 0) {
            log('warn', `Forced shutdown with ${this.activeProcessing.size} tasks still processing`);
        }
    }

    /**
     * Chunk array into smaller arrays
     * @param {Array} array - Array to chunk
     * @param {number} size - Chunk size
     * @returns {Array} Chunked arrays
     * @private
     */
    _chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
}

/**
 * CLI interface for the task polling service
 */
class TaskPollingCLI {
    constructor() {
        this.service = null;
    }

    /**
     * Run the CLI
     */
    async run() {
        const args = process.argv.slice(2);
        const command = args[0] || 'start';
        
        try {
            switch (command) {
                case 'start':
                    await this._startService();
                    break;
                case 'stop':
                    await this._stopService();
                    break;
                case 'status':
                    await this._showStatus();
                    break;
                case 'stats':
                    await this._showStatistics();
                    break;
                case 'help':
                    this._showHelp();
                    break;
                default:
                    log('error', `Unknown command: ${command}`);
                    this._showHelp();
                    process.exit(1);
            }
        } catch (error) {
            log('error', `Command failed: ${error.message}`);
            process.exit(1);
        }
    }

    /**
     * Start the service
     * @private
     */
    async _startService() {
        const config = this._loadConfig();
        this.service = new TaskPollingService(config);
        
        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            log('info', 'Received SIGINT, shutting down gracefully...');
            await this.service.stop();
            process.exit(0);
        });
        
        process.on('SIGTERM', async () => {
            log('info', 'Received SIGTERM, shutting down gracefully...');
            await this.service.stop();
            process.exit(0);
        });
        
        await this.service.start();
        
        // Keep the process running
        log('info', 'Task polling service is running. Press Ctrl+C to stop.');
    }

    /**
     * Stop the service
     * @private
     */
    async _stopService() {
        if (this.service) {
            await this.service.stop();
        } else {
            log('info', 'No service instance found');
        }
    }

    /**
     * Show service status
     * @private
     */
    async _showStatus() {
        if (this.service) {
            const stats = this.service.getStatistics();
            console.log('Service Status:', JSON.stringify(stats, null, 2));
        } else {
            log('info', 'Service not running');
        }
    }

    /**
     * Show service statistics
     * @private
     */
    async _showStatistics() {
        if (this.service) {
            const stats = this.service.getStatistics();
            console.log('\n=== Task Polling Service Statistics ===');
            console.log(`Status: ${stats.isRunning ? 'Running' : 'Stopped'}`);
            console.log(`Total Processed: ${stats.totalProcessed}`);
            console.log(`Successfully Processed: ${stats.successfullyProcessed}`);
            console.log(`Failed Processing: ${stats.failedProcessing}`);
            console.log(`Success Rate: ${stats.totalProcessed > 0 ? ((stats.successfullyProcessed / stats.totalProcessed) * 100).toFixed(2) : 0}%`);
            console.log(`Average Processing Time: ${stats.averageProcessingTime.toFixed(2)}ms`);
            console.log(`Active Processing: ${stats.activeProcessing}`);
            console.log(`Polling Interval: ${stats.pollingInterval}ms`);
            console.log(`Last Polled: ${stats.lastPolled || 'Never'}`);
        } else {
            log('info', 'Service not running');
        }
    }

    /**
     * Show help information
     * @private
     */
    _showHelp() {
        console.log(`
Task Polling Service CLI

Usage: node task_polling.js [command]

Commands:
  start     Start the task polling service (default)
  stop      Stop the task polling service
  status    Show current service status
  stats     Show detailed statistics
  help      Show this help message

Environment Variables:
  DB_HOST              Database host (default: localhost)
  DB_PORT              Database port (default: 5432)
  DB_NAME              Database name (default: codegen-taskmaster-db)
  DB_USER              Database user (default: software_developer)
  DB_PASSWORD          Database password
  POLLING_INTERVAL     Polling interval in ms (default: 30000)
  BATCH_SIZE           Batch size for processing (default: 5)
  MAX_CONCURRENT       Max concurrent tasks (default: 3)
  GITHUB_TOKEN         GitHub token for PR creation

Examples:
  node task_polling.js start
  node task_polling.js stats
  POLLING_INTERVAL=10000 node task_polling.js start
        `);
    }

    /**
     * Load configuration from environment
     * @returns {Object} Configuration object
     * @private
     */
    _loadConfig() {
        return {
            pollingInterval: parseInt(process.env.POLLING_INTERVAL) || 30000,
            batchSize: parseInt(process.env.BATCH_SIZE) || 5,
            maxConcurrentTasks: parseInt(process.env.MAX_CONCURRENT) || 3,
            enableConcurrentProcessing: process.env.ENABLE_CONCURRENT !== 'false',
            
            database: {
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT) || 5432,
                database: process.env.DB_NAME || 'codegen-taskmaster-db',
                user: process.env.DB_USER || 'software_developer',
                password: process.env.DB_PASSWORD || 'password',
                ssl: process.env.DB_SSL === 'true'
            },
            
            codegen: {
                githubToken: process.env.GITHUB_TOKEN,
                apiUrl: process.env.CODEGEN_API_URL,
                enableMock: process.env.CODEGEN_MOCK === 'true'
            },
            
            prCreator: {
                githubToken: process.env.GITHUB_TOKEN,
                autoAssignReviewers: process.env.AUTO_ASSIGN_REVIEWERS !== 'false',
                autoAddLabels: process.env.AUTO_ADD_LABELS !== 'false'
            }
        };
    }
}

// Run CLI if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const cli = new TaskPollingCLI();
    cli.run().catch(error => {
        log('error', `CLI error: ${error.message}`);
        process.exit(1);
    });
}

export { TaskPollingService, TaskPollingCLI };

