/**
 * @fileoverview Codegen Integration Client
 * @description Main client for Codegen API integration with database task retrieval
 */

import { EventEmitter } from 'events';
import { CodegenAuth } from './auth.js';
import { PromptGenerator } from './prompt_generator.js';
import { PRManager } from './pr_manager.js';
import { FeedbackHandler } from './feedback_handler.js';

/**
 * Main Codegen Integration Client
 * Handles database task retrieval and PR creation workflow
 */
export class CodegenClient extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            cloudflareApi: {
                baseUrl: config.cloudflareApi?.baseUrl || process.env.CLOUDFLARE_API_URL || 'https://db.your-domain.workers.dev',
                apiKey: config.cloudflareApi?.apiKey || process.env.CLOUDFLARE_API_KEY
            },
            github: {
                token: config.github?.token || process.env.GITHUB_TOKEN,
                repository: config.github?.repository || 'Zeeeepa/claude-task-master'
            },
            processing: {
                maxRetries: config.processing?.maxRetries || 3,
                timeout: config.processing?.timeout || 300000, // 5 minutes
                batchSize: config.processing?.batchSize || 10,
                pollInterval: config.processing?.pollInterval || 30000 // 30 seconds
            },
            ...config
        };

        // Initialize components
        this.auth = new CodegenAuth(config.auth);
        this.promptGenerator = new PromptGenerator(config.promptGenerator);
        this.prManager = new PRManager(config.prManager);
        this.feedbackHandler = new FeedbackHandler(config.feedbackHandler);

        // State management
        this.isInitialized = false;
        this.isProcessing = false;
        this.activeTasks = new Map();
        this.processingQueue = [];
        this.pollTimer = null;

        // Metrics
        this.metrics = {
            tasksProcessed: 0,
            prsCreated: 0,
            errors: 0,
            successRate: 0,
            averageProcessingTime: 0,
            lastProcessedAt: null
        };

        this._setupEventHandlers();
    }

    /**
     * Initialize the Codegen client
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            throw new Error('Codegen client already initialized');
        }

        try {
            console.log('🚀 Initializing Codegen integration client...');

            // Validate configuration
            this._validateConfig();

            // Initialize components
            await this.auth.initialize();
            await this.promptGenerator.initialize();
            await this.prManager.initialize();
            await this.feedbackHandler.initialize();

            // Test Cloudflare API connection
            await this._testCloudflareConnection();

            // Start task polling
            this._startTaskPolling();

            this.isInitialized = true;
            this.emit('initialized');
            
            console.log('✅ Codegen integration client initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize Codegen client:', error);
            throw error;
        }
    }

    /**
     * Validate configuration
     * @private
     */
    _validateConfig() {
        const required = [
            'cloudflareApi.baseUrl',
            'cloudflareApi.apiKey',
            'github.token',
            'github.repository'
        ];

        for (const path of required) {
            const value = this._getNestedValue(this.config, path);
            if (!value) {
                throw new Error(`Missing required configuration: ${path}`);
            }
        }
    }

    /**
     * Get nested configuration value
     * @param {Object} obj - Configuration object
     * @param {string} path - Dot-separated path
     * @returns {*} Configuration value
     * @private
     */
    _getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }

    /**
     * Test Cloudflare API connection
     * @private
     */
    async _testCloudflareConnection() {
        try {
            const response = await fetch(`${this.config.cloudflareApi.baseUrl}/health`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.config.cloudflareApi.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Cloudflare API health check failed: ${response.status}`);
            }

            console.log('✅ Cloudflare API connection verified');
            
        } catch (error) {
            console.error('❌ Cloudflare API connection test failed:', error);
            throw new Error(`Failed to connect to Cloudflare API: ${error.message}`);
        }
    }

    /**
     * Retrieve tasks from database via Cloudflare API
     * @param {Object} filters - Task filters
     * @returns {Promise<Array>} Array of tasks
     */
    async retrieveTasks(filters = {}) {
        try {
            const queryParams = new URLSearchParams({
                status: filters.status || 'pending',
                limit: filters.limit || this.config.processing.batchSize,
                ...filters
            });

            const response = await fetch(`${this.config.cloudflareApi.baseUrl}/tasks?${queryParams}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.config.cloudflareApi.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to retrieve tasks: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            return data.tasks || [];
            
        } catch (error) {
            console.error('Error retrieving tasks from database:', error);
            throw error;
        }
    }

    /**
     * Process a single task
     * @param {Object} task - Task object from database
     * @returns {Promise<Object>} Processing result
     */
    async processTask(task) {
        const startTime = Date.now();
        const taskId = task.id;

        try {
            console.log(`📋 Processing task ${taskId}: ${task.title}`);

            // Mark task as processing
            this.activeTasks.set(taskId, {
                task,
                startTime,
                status: 'processing'
            });

            // Update task status in database
            await this._updateTaskStatus(taskId, 'processing');

            // Generate Codegen prompt
            const prompt = await this.promptGenerator.generatePrompt(task);
            console.log(`🤖 Generated prompt for task ${taskId}`);

            // Create PR using PR Manager
            const prResult = await this.prManager.createPR(prompt, task);
            console.log(`🔀 Created PR for task ${taskId}: ${prResult.url}`);

            // Update task with PR information
            await this._updateTaskWithPR(taskId, prResult);

            // Record success metrics
            const processingTime = Date.now() - startTime;
            this._updateMetrics(true, processingTime);

            const result = {
                success: true,
                taskId,
                prUrl: prResult.url,
                prNumber: prResult.number,
                processingTime,
                timestamp: new Date().toISOString()
            };

            this.activeTasks.set(taskId, {
                ...this.activeTasks.get(taskId),
                status: 'completed',
                result
            });

            this.emit('task_completed', result);
            return result;

        } catch (error) {
            console.error(`❌ Failed to process task ${taskId}:`, error);

            // Handle error with feedback system
            await this.feedbackHandler.handleError(taskId, error, task);

            // Record error metrics
            const processingTime = Date.now() - startTime;
            this._updateMetrics(false, processingTime);

            const result = {
                success: false,
                taskId,
                error: error.message,
                processingTime,
                timestamp: new Date().toISOString()
            };

            this.activeTasks.set(taskId, {
                ...this.activeTasks.get(taskId),
                status: 'failed',
                result,
                error
            });

            this.emit('task_failed', result);
            throw error;
        }
    }

    /**
     * Process multiple tasks in batch
     * @param {Array} tasks - Array of tasks
     * @returns {Promise<Array>} Array of processing results
     */
    async processBatch(tasks) {
        console.log(`📦 Processing batch of ${tasks.length} tasks`);

        const results = [];
        const promises = tasks.map(async (task) => {
            try {
                const result = await this.processTask(task);
                results.push(result);
                return result;
            } catch (error) {
                const errorResult = {
                    success: false,
                    taskId: task.id,
                    error: error.message,
                    timestamp: new Date().toISOString()
                };
                results.push(errorResult);
                return errorResult;
            }
        });

        await Promise.allSettled(promises);
        
        console.log(`✅ Batch processing completed: ${results.filter(r => r.success).length}/${results.length} successful`);
        
        return results;
    }

    /**
     * Start automatic task polling
     * @private
     */
    _startTaskPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
        }

        this.pollTimer = setInterval(async () => {
            if (!this.isProcessing) {
                try {
                    await this._pollAndProcessTasks();
                } catch (error) {
                    console.error('Error during task polling:', error);
                }
            }
        }, this.config.processing.pollInterval);

        console.log(`🔄 Started task polling every ${this.config.processing.pollInterval}ms`);
    }

    /**
     * Poll for new tasks and process them
     * @private
     */
    async _pollAndProcessTasks() {
        try {
            this.isProcessing = true;

            // Retrieve pending tasks
            const tasks = await this.retrieveTasks({ status: 'pending' });

            if (tasks.length > 0) {
                console.log(`📥 Found ${tasks.length} pending tasks`);
                await this.processBatch(tasks);
            }

        } catch (error) {
            console.error('Error polling and processing tasks:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Update task status in database
     * @param {string} taskId - Task ID
     * @param {string} status - New status
     * @private
     */
    async _updateTaskStatus(taskId, status) {
        try {
            const response = await fetch(`${this.config.cloudflareApi.baseUrl}/tasks/${taskId}/status`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.config.cloudflareApi.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status })
            });

            if (!response.ok) {
                throw new Error(`Failed to update task status: ${response.status}`);
            }

        } catch (error) {
            console.error(`Error updating task ${taskId} status:`, error);
            // Don't throw - this is not critical for the main workflow
        }
    }

    /**
     * Update task with PR information
     * @param {string} taskId - Task ID
     * @param {Object} prResult - PR creation result
     * @private
     */
    async _updateTaskWithPR(taskId, prResult) {
        try {
            const response = await fetch(`${this.config.cloudflareApi.baseUrl}/tasks/${taskId}/pr`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.config.cloudflareApi.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    pr_url: prResult.url,
                    pr_number: prResult.number,
                    branch_name: prResult.branchName,
                    status: 'completed',
                    completed_at: new Date().toISOString()
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to update task with PR info: ${response.status}`);
            }

        } catch (error) {
            console.error(`Error updating task ${taskId} with PR info:`, error);
            // Don't throw - this is not critical for the main workflow
        }
    }

    /**
     * Update metrics
     * @param {boolean} success - Whether the task was successful
     * @param {number} processingTime - Processing time in milliseconds
     * @private
     */
    _updateMetrics(success, processingTime) {
        this.metrics.tasksProcessed++;
        
        if (success) {
            this.metrics.prsCreated++;
        } else {
            this.metrics.errors++;
        }

        this.metrics.successRate = this.metrics.tasksProcessed > 0 ? 
            (this.metrics.prsCreated / this.metrics.tasksProcessed) * 100 : 0;

        // Update average processing time
        if (this.metrics.averageProcessingTime === 0) {
            this.metrics.averageProcessingTime = processingTime;
        } else {
            this.metrics.averageProcessingTime = 
                (this.metrics.averageProcessingTime + processingTime) / 2;
        }

        this.metrics.lastProcessedAt = new Date().toISOString();
    }

    /**
     * Setup event handlers
     * @private
     */
    _setupEventHandlers() {
        // Auth events
        this.auth.on('auth_error', (error) => {
            this.emit('auth_error', error);
        });

        // PR Manager events
        this.prManager.on('pr_created', (data) => {
            this.emit('pr_created', data);
        });

        this.prManager.on('pr_failed', (data) => {
            this.emit('pr_failed', data);
        });

        // Feedback Handler events
        this.feedbackHandler.on('retry_scheduled', (data) => {
            this.emit('retry_scheduled', data);
        });
    }

    /**
     * Get client status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            processing: this.isProcessing,
            activeTasks: this.activeTasks.size,
            metrics: { ...this.metrics },
            auth: this.auth.getStatus(),
            config: {
                cloudflareApi: {
                    baseUrl: this.config.cloudflareApi.baseUrl,
                    hasApiKey: !!this.config.cloudflareApi.apiKey
                },
                github: {
                    repository: this.config.github.repository,
                    hasToken: !!this.config.github.token
                },
                processing: this.config.processing
            }
        };
    }

    /**
     * Get metrics
     * @returns {Object} Current metrics
     */
    getMetrics() {
        return { ...this.metrics };
    }

    /**
     * Shutdown the client
     */
    async shutdown() {
        console.log('🛑 Shutting down Codegen integration client...');

        // Stop polling
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }

        // Wait for active tasks to complete
        if (this.activeTasks.size > 0) {
            console.log(`⏳ Waiting for ${this.activeTasks.size} active tasks to complete...`);
            // Give tasks up to 30 seconds to complete
            const timeout = setTimeout(() => {
                console.log('⚠️ Forcing shutdown - some tasks may be incomplete');
            }, 30000);

            while (this.activeTasks.size > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            clearTimeout(timeout);
        }

        // Shutdown components
        await this.auth.shutdown();
        await this.promptGenerator.shutdown();
        await this.prManager.shutdown();
        await this.feedbackHandler.shutdown();

        this.isInitialized = false;
        this.removeAllListeners();

        console.log('✅ Codegen integration client shutdown complete');
    }
}

export default CodegenClient;

