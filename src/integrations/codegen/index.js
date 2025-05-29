/**
 * @fileoverview Consolidated Codegen SDK Integration
 * @description Unified Codegen SDK integration consolidating PRs #52,54,55,82,86,87
 * @version 2.0.0
 */

import { EventEmitter } from 'events';
import { CodegenClient } from './core/client.js';
import { TaskAnalyzer } from './nlp/task-analyzer.js';
import { PromptGenerator } from './core/prompt-generator.js';
import { PRManager } from './core/pr-manager.js';
import { ContextManager } from './core/context-manager.js';
import { ConfigurationManager } from './config/configuration-manager.js';
import { AuthenticationManager } from './auth/authentication-manager.js';
import { RateLimitManager } from './core/rate-limit-manager.js';
import { ErrorHandler } from './core/error-handler.js';
import { MetricsCollector } from './monitoring/metrics-collector.js';
import { log } from '../../utils/logger.js';

/**
 * Consolidated Codegen SDK Integration
 * Provides unified interface for natural language to PR creation
 */
export class CodegenIntegration extends EventEmitter {
    constructor(config = {}) {
        super();
        
        // Initialize configuration manager
        this.config = new ConfigurationManager(config);
        
        // Initialize core components
        this.auth = new AuthenticationManager(this.config.getComponent('authentication'));
        this.rateLimiter = new RateLimitManager(this.config.getComponent('rateLimiting'));
        this.errorHandler = new ErrorHandler(this.config.getComponent('errorHandling'));
        this.metrics = new MetricsCollector(this.config.getComponent('monitoring'));
        
        // Initialize processing components
        this.client = new CodegenClient(this.config.getComponent('api'), {
            auth: this.auth,
            rateLimiter: this.rateLimiter,
            errorHandler: this.errorHandler
        });
        
        this.taskAnalyzer = new TaskAnalyzer(this.config.getComponent('nlp'));
        this.promptGenerator = new PromptGenerator(this.config.getComponent('promptGeneration'));
        this.contextManager = new ContextManager(this.config.getComponent('contextEnrichment'));
        this.prManager = new PRManager(this.config.getComponent('prCreation'));
        
        // State management
        this.isInitialized = false;
        this.activeTasks = new Map();
        this.processingStats = {
            totalProcessed: 0,
            successful: 0,
            failed: 0,
            averageProcessingTime: 0
        };
        
        // Setup event handlers
        this._setupEventHandlers();
        
        log('info', 'Codegen Integration initialized', {
            version: '2.0.0',
            mockMode: this.config.isMockEnabled(),
            components: this._getComponentStatus()
        });
    }

    /**
     * Initialize the integration
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            log('warn', 'Codegen Integration already initialized');
            return;
        }

        try {
            log('info', 'Initializing Codegen Integration...');

            // Initialize authentication
            await this.auth.initialize();
            
            // Initialize client
            await this.client.initialize();
            
            // Initialize other components
            await this.taskAnalyzer.initialize();
            await this.promptGenerator.initialize();
            await this.contextManager.initialize();
            await this.prManager.initialize();
            
            // Start metrics collection
            if (this.config.getComponent('monitoring').enabled) {
                this.metrics.start();
            }

            this.isInitialized = true;
            this.emit('initialized');
            
            log('info', 'Codegen Integration initialized successfully');
            
        } catch (error) {
            log('error', 'Failed to initialize Codegen Integration', { error: error.message });
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Process a natural language task into a PR
     * @param {Object} task - Task description and metadata
     * @param {Object} options - Processing options
     * @returns {Promise<Object>} Processing result
     */
    async processTask(task, options = {}) {
        const startTime = Date.now();
        const taskId = task.id || `task-${Date.now()}`;
        
        try {
            log('info', `Processing task ${taskId}`, { 
                title: task.title?.substring(0, 50),
                type: task.type 
            });

            // Validate input
            this._validateTaskInput(task);
            
            // Track active task
            this.activeTasks.set(taskId, {
                task,
                startTime,
                status: 'processing'
            });

            // Step 1: Analyze natural language requirements
            const analysis = await this.taskAnalyzer.analyzeTask(task.description, {
                context: task.context,
                type: task.type,
                priority: task.priority
            });

            log('debug', `Task analysis completed for ${taskId}`, {
                complexity: analysis.complexity.level,
                intent: analysis.intent.primary,
                confidence: analysis.intent.confidence
            });

            // Step 2: Build context
            const context = await this.contextManager.buildContext(task, analysis, options);
            
            // Step 3: Generate optimized prompt
            const prompt = await this.promptGenerator.generatePrompt(analysis, context, {
                includeExamples: options.includeExamples,
                optimizeForCodegen: true,
                templateVersion: this.config.getComponent('promptGeneration').templateVersion
            });

            log('debug', `Prompt generated for ${taskId}`, {
                length: prompt.content.length,
                template: prompt.metadata.template
            });

            // Step 4: Submit to Codegen API
            const codegenResult = await this.client.createPR({
                prompt: prompt.content,
                context: context.summary,
                metadata: {
                    taskId,
                    analysis: analysis.summary,
                    repository: options.repository,
                    baseBranch: options.baseBranch
                }
            });

            // Step 5: Process and format PR
            const prResult = await this.prManager.processPRResult(codegenResult, {
                task,
                analysis,
                prompt,
                context
            });

            // Update statistics
            const processingTime = Date.now() - startTime;
            this._updateStatistics(taskId, true, processingTime);
            
            // Clean up active task
            this.activeTasks.delete(taskId);

            const result = {
                success: true,
                taskId,
                analysis,
                prompt: prompt.metadata,
                codegenResult,
                prResult,
                processingTime,
                metadata: {
                    version: '2.0.0',
                    timestamp: new Date().toISOString(),
                    components: this._getComponentStatus()
                }
            };

            this.emit('task:completed', { taskId, result });
            
            log('info', `Task ${taskId} completed successfully`, {
                processingTime,
                prUrl: prResult.url
            });

            return result;

        } catch (error) {
            const processingTime = Date.now() - startTime;
            this._updateStatistics(taskId, false, processingTime);
            
            // Update active task status
            if (this.activeTasks.has(taskId)) {
                this.activeTasks.get(taskId).status = 'failed';
                this.activeTasks.get(taskId).error = error.message;
            }

            const errorResult = await this.errorHandler.handleError(error, {
                taskId,
                task,
                processingTime,
                context: 'task_processing'
            });

            this.emit('task:failed', { taskId, error, errorResult });
            
            log('error', `Task ${taskId} failed`, {
                error: error.message,
                processingTime,
                errorType: error.constructor.name
            });

            throw error;
        }
    }

    /**
     * Process multiple tasks in batch
     * @param {Array} tasks - Array of tasks to process
     * @param {Object} options - Batch processing options
     * @returns {Promise<Array>} Array of processing results
     */
    async processBatch(tasks, options = {}) {
        const {
            concurrent = 3,
            failFast = false,
            timeout = 600000 // 10 minutes
        } = options;

        log('info', `Processing batch of ${tasks.length} tasks`, {
            concurrent,
            failFast,
            timeout
        });

        const results = [];
        const chunks = this._chunkArray(tasks, concurrent);

        for (const chunk of chunks) {
            const chunkPromises = chunk.map(task => 
                this.processTask(task, options).catch(error => ({
                    success: false,
                    taskId: task.id,
                    error: error.message
                }))
            );

            if (failFast) {
                const chunkResults = await Promise.all(chunkPromises);
                results.push(...chunkResults);
                
                // Check for failures
                const failures = chunkResults.filter(r => !r.success);
                if (failures.length > 0) {
                    throw new Error(`Batch processing failed: ${failures.length} tasks failed`);
                }
            } else {
                const chunkResults = await Promise.allSettled(chunkPromises);
                results.push(...chunkResults.map(r => 
                    r.status === 'fulfilled' ? r.value : {
                        success: false,
                        error: r.reason.message
                    }
                ));
            }
        }

        const successful = results.filter(r => r.success).length;
        const failed = results.length - successful;

        log('info', `Batch processing completed`, {
            total: tasks.length,
            successful,
            failed,
            successRate: (successful / tasks.length * 100).toFixed(2) + '%'
        });

        return results;
    }

    /**
     * Get processing statistics
     * @returns {Object} Processing statistics
     */
    getStatistics() {
        return {
            ...this.processingStats,
            activeTasks: this.activeTasks.size,
            isInitialized: this.isInitialized,
            uptime: this.metrics.getUptime(),
            componentStatus: this._getComponentStatus(),
            rateLimitStatus: this.rateLimiter.getStatus(),
            authStatus: this.auth.getStatus()
        };
    }

    /**
     * Get health status
     * @returns {Object} Health status
     */
    async getHealth() {
        try {
            const health = {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                components: {}
            };

            // Check authentication
            health.components.auth = await this.auth.healthCheck();
            
            // Check client
            health.components.client = await this.client.healthCheck();
            
            // Check rate limiter
            health.components.rateLimiter = this.rateLimiter.healthCheck();
            
            // Overall health
            const unhealthyComponents = Object.values(health.components)
                .filter(c => c.status !== 'healthy');
            
            if (unhealthyComponents.length > 0) {
                health.status = 'degraded';
                health.issues = unhealthyComponents.map(c => c.error).filter(Boolean);
            }

            return health;
            
        } catch (error) {
            return {
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                error: error.message
            };
        }
    }

    /**
     * Shutdown the integration
     * @returns {Promise<void>}
     */
    async shutdown() {
        try {
            log('info', 'Shutting down Codegen Integration...');

            // Wait for active tasks to complete (with timeout)
            await this._waitForActiveTasks(30000); // 30 seconds

            // Stop metrics collection
            if (this.metrics) {
                this.metrics.stop();
            }

            // Shutdown components
            await this.client.shutdown();
            await this.auth.shutdown();
            
            this.isInitialized = false;
            this.emit('shutdown');
            
            log('info', 'Codegen Integration shutdown completed');
            
        } catch (error) {
            log('error', 'Error during shutdown', { error: error.message });
            throw error;
        }
    }

    /**
     * Setup event handlers
     * @private
     */
    _setupEventHandlers() {
        // Client events
        this.client.on('request:start', (data) => {
            this.metrics.recordRequest(data);
        });

        this.client.on('request:complete', (data) => {
            this.metrics.recordResponse(data);
        });

        this.client.on('error', (error) => {
            this.metrics.recordError(error);
            this.emit('error', error);
        });

        // Rate limiter events
        this.rateLimiter.on('limit:exceeded', (data) => {
            log('warn', 'Rate limit exceeded', data);
            this.emit('rate:limit:exceeded', data);
        });

        // Error handler events
        this.errorHandler.on('error:handled', (data) => {
            this.metrics.recordErrorHandling(data);
        });
    }

    /**
     * Validate task input
     * @param {Object} task - Task to validate
     * @private
     */
    _validateTaskInput(task) {
        if (!task) {
            throw new Error('Task is required');
        }

        if (!task.description || typeof task.description !== 'string') {
            throw new Error('Task description is required and must be a string');
        }

        if (task.description.length < 10) {
            throw new Error('Task description must be at least 10 characters');
        }

        if (task.description.length > 10000) {
            throw new Error('Task description must be less than 10000 characters');
        }
    }

    /**
     * Update processing statistics
     * @param {string} taskId - Task ID
     * @param {boolean} success - Success status
     * @param {number} processingTime - Processing time in ms
     * @private
     */
    _updateStatistics(taskId, success, processingTime) {
        this.processingStats.totalProcessed++;
        
        if (success) {
            this.processingStats.successful++;
        } else {
            this.processingStats.failed++;
        }

        // Update average processing time
        const totalTime = this.processingStats.averageProcessingTime * 
            (this.processingStats.totalProcessed - 1) + processingTime;
        this.processingStats.averageProcessingTime = 
            totalTime / this.processingStats.totalProcessed;
    }

    /**
     * Get component status
     * @returns {Object} Component status
     * @private
     */
    _getComponentStatus() {
        return {
            auth: this.auth?.isAuthenticated() || false,
            client: this.client?.isConnected() || false,
            rateLimiter: this.rateLimiter?.isEnabled() || false,
            metrics: this.metrics?.isRunning() || false
        };
    }

    /**
     * Wait for active tasks to complete
     * @param {number} timeout - Timeout in ms
     * @returns {Promise<void>}
     * @private
     */
    async _waitForActiveTasks(timeout = 30000) {
        const startTime = Date.now();
        
        while (this.activeTasks.size > 0 && (Date.now() - startTime) < timeout) {
            log('debug', `Waiting for ${this.activeTasks.size} active tasks to complete...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (this.activeTasks.size > 0) {
            log('warn', `Forced shutdown with ${this.activeTasks.size} active tasks remaining`);
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

// Export convenience functions
export { CodegenIntegration as default };

/**
 * Create a new Codegen Integration instance
 * @param {Object} config - Configuration options
 * @returns {CodegenIntegration} Integration instance
 */
export function createCodegenIntegration(config = {}) {
    return new CodegenIntegration(config);
}

/**
 * Create a Codegen Integration instance from environment variables
 * @returns {CodegenIntegration} Integration instance
 */
export function createFromEnvironment() {
    return new CodegenIntegration({
        api: {
            apiKey: process.env.CODEGEN_API_KEY,
            baseUrl: process.env.CODEGEN_API_URL,
            timeout: parseInt(process.env.CODEGEN_TIMEOUT) || 30000
        },
        authentication: {
            validateOnInit: process.env.CODEGEN_VALIDATE_ON_INIT !== 'false'
        },
        rateLimiting: {
            enabled: process.env.CODEGEN_RATE_LIMITING !== 'false',
            requests: parseInt(process.env.CODEGEN_RATE_LIMIT_REQUESTS) || 100
        },
        development: {
            mockMode: process.env.CODEGEN_MOCK_MODE === 'true',
            debugMode: process.env.CODEGEN_DEBUG_MODE === 'true'
        }
    });
}

