/**
 * @fileoverview Production Codegen Integrator
 * @description Production-grade codegen integration with real Codegen SDK
 */

import { log } from '../../scripts/modules/utils.js';
import { CodegenClient, CodegenTask, CodegenError } from './codegen_client.js';
import { NLPProcessor } from './nlp_processor.js';
import { PromptGenerator } from './prompt_generator.js';
import { ContextEnricher } from './context_enricher.js';
import { QualityValidator } from './quality_validator.js';
import { CodegenErrorHandler } from './error_handler.js';
import { RateLimiter, QuotaManager } from './rate_limiter.js';
import { createCodegenConfig } from '../config/codegen_config.js';

/**
 * Production Codegen integrator with real API integration
 */
export class CodegenIntegrator {
    constructor(config = {}) {
        // Initialize configuration
        this.config = createCodegenConfig(config);
        
        // Initialize components based on configuration
        this._initializeComponents();
        
        // Request tracking
        this.activeRequests = new Map();
        this.requestHistory = [];
        
        log('info', `Codegen integrator initialized in ${this.config.development.mockMode ? 'mock' : 'production'} mode`);
    }

    /**
     * Initialize components based on configuration
     * @private
     */
    _initializeComponents() {
        const apiConfig = this.config.getComponent('api');
        const authConfig = this.config.getComponent('authentication');
        const rateLimitConfig = this.config.getComponent('rateLimiting');
        const errorConfig = this.config.getComponent('errorHandling');
        const quotaConfig = this.config.getComponent('quota');

        // Initialize NLP processor
        this.nlpProcessor = new NLPProcessor(this.config.getComponent('nlp'));

        // Initialize prompt generator
        this.promptGenerator = new PromptGenerator(this.config.getComponent('promptGeneration'));

        // Initialize context enricher
        this.contextEnricher = new ContextEnricher(this.config.getComponent('contextEnrichment'));

        // Initialize quality validator
        this.qualityValidator = new QualityValidator(this.config.getComponent('qualityValidation'));

        // Initialize components based on mock mode
        if (this.config.isMockEnabled()) {
            log('info', 'Using mock codegen integration');
            this.codegenClient = new MockCodegenClient(this.config.getAll());
        } else {
            // Initialize real Codegen client
            this.codegenClient = new CodegenClient({
                apiKey: apiConfig.apiKey,
                baseUrl: apiConfig.baseUrl,
                timeout: apiConfig.timeout,
                retries: apiConfig.retries,
                rateLimit: rateLimitConfig
            });
        }

        // Initialize error handler
        this.errorHandler = new CodegenErrorHandler(errorConfig);

        // Initialize rate limiter
        this.rateLimiter = new RateLimiter(rateLimitConfig);

        // Initialize quota manager
        this.quotaManager = new QuotaManager(quotaConfig);
    }

    /**
     * Process a natural language task through the complete pipeline
     * @param {string} taskDescription - Natural language task description
     * @param {Object} context - Additional context information
     * @param {Object} options - Processing options
     * @returns {Promise<Object>} Processing result
     */
    async processTask(taskDescription, context = {}, options = {}) {
        const requestId = this._generateRequestId();
        
        try {
            log('info', 'Starting task processing', { requestId, taskLength: taskDescription.length });

            // Step 1: Process natural language task
            const structuredTask = await this.nlpProcessor.processTask(taskDescription, context);
            log('debug', 'Task structured', { requestId, taskType: structuredTask.type });

            // Step 2: Enrich context
            const enrichedContext = await this.contextEnricher.enrichContext(context, structuredTask);
            log('debug', 'Context enriched', { requestId, contextSize: JSON.stringify(enrichedContext).length });

            // Step 3: Generate optimized prompt
            const promptData = await this.promptGenerator.generatePrompt(structuredTask, enrichedContext, options);
            log('debug', 'Prompt generated', { requestId, promptLength: promptData.prompt.length });

            // Step 4: Validate prompt quality
            const promptValidation = await this.qualityValidator.validatePrompt(promptData);
            if (!promptValidation.isValid) {
                throw new CodegenError(`Prompt validation failed: ${promptValidation.issues.join(', ')}`, 'PROMPT_VALIDATION_ERROR');
            }
            log('debug', 'Prompt validated', { requestId, score: promptValidation.score });

            // Step 5: Check rate limits and quotas
            await this.rateLimiter.checkLimit();
            await this.quotaManager.checkQuota();

            // Step 6: Send to Codegen API
            const codegenResponse = await this._sendToCodegen(promptData, structuredTask, requestId);
            log('debug', 'Codegen response received', { requestId, success: codegenResponse.success });

            // Step 7: Validate response quality
            const responseValidation = await this.qualityValidator.validateResponse(codegenResponse, structuredTask);
            log('debug', 'Response validated', { requestId, score: responseValidation.overallScore });

            // Step 8: Process and return result
            const result = {
                requestId,
                success: codegenResponse.success,
                task: structuredTask,
                prompt: promptData,
                response: codegenResponse,
                validation: {
                    prompt: promptValidation,
                    response: responseValidation
                },
                metadata: {
                    processedAt: new Date().toISOString(),
                    processingTime: Date.now() - this._getRequestStartTime(requestId),
                    version: '1.0'
                }
            };

            // Update quota usage
            await this.quotaManager.recordUsage(1);

            log('info', 'Task processing completed', {
                requestId,
                success: result.success,
                processingTime: result.metadata.processingTime
            });

            return result;

        } catch (error) {
            log('error', 'Task processing failed', { requestId, error: error.message });
            
            // Handle error through error handler
            const handledError = await this.errorHandler.handleError(error, {
                requestId,
                taskDescription,
                context,
                options
            });

            throw handledError;
        } finally {
            // Cleanup request tracking
            this.activeRequests.delete(requestId);
        }
    }

    /**
     * Send prompt to Codegen API
     * @private
     */
    async _sendToCodegen(promptData, structuredTask, requestId) {
        try {
            // Track active request
            this.activeRequests.set(requestId, {
                startTime: Date.now(),
                taskType: structuredTask.type,
                promptLength: promptData.prompt.length
            });

            // Create Codegen task
            const taskConfig = {
                prompt: promptData.prompt,
                context: promptData.context,
                repository: structuredTask.context?.repository,
                branch: structuredTask.context?.branch,
                options: {
                    taskType: structuredTask.type,
                    complexity: structuredTask.complexity.level,
                    technologies: structuredTask.technologies
                }
            };

            const codegenTask = await this.codegenClient.createTask(taskConfig);
            log('debug', 'Codegen task created', { requestId, taskId: codegenTask.id });

            // Wait for completion with progress tracking
            const result = await codegenTask.waitForCompletion({
                pollInterval: 5000,
                maxWaitTime: 300000, // 5 minutes
                onProgress: (task) => {
                    log('debug', 'Task progress update', {
                        requestId,
                        taskId: task.id,
                        status: task.status
                    });
                }
            });

            return {
                success: true,
                data: result,
                taskId: codegenTask.id,
                metadata: {
                    responseTime: Date.now() - this.activeRequests.get(requestId).startTime,
                    status: codegenTask.status
                }
            };

        } catch (error) {
            log('error', 'Codegen API call failed', { requestId, error: error.message });
            
            return {
                success: false,
                error: error.message,
                errorType: error.code || 'UNKNOWN_ERROR',
                metadata: {
                    responseTime: Date.now() - (this.activeRequests.get(requestId)?.startTime || Date.now())
                }
            };
        }
    }

    /**
     * Get processing statistics
     * @returns {Promise<Object>} Processing statistics
     */
    async getStatistics() {
        try {
            const stats = {
                requests: {
                    total: this.requestHistory.length,
                    active: this.activeRequests.size,
                    successful: this.requestHistory.filter(r => r.success).length,
                    failed: this.requestHistory.filter(r => !r.success).length
                },
                rateLimiting: this.rateLimiter.getUsage(),
                quota: await this.quotaManager.getUsage(),
                performance: {
                    averageProcessingTime: this._calculateAverageProcessingTime(),
                    successRate: this._calculateSuccessRate()
                },
                timestamp: new Date().toISOString()
            };

            // Add Codegen client stats if available
            if (this.codegenClient.getUsageStats) {
                stats.codegenApi = await this.codegenClient.getUsageStats();
            }

            return stats;

        } catch (error) {
            log('error', 'Failed to get statistics', { error: error.message });
            return {
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Validate system health
     * @returns {Promise<Object>} Health status
     */
    async validateHealth() {
        const health = {
            status: 'healthy',
            components: {},
            timestamp: new Date().toISOString()
        };

        try {
            // Check Codegen client health
            const codegenHealth = await this.codegenClient.validateConnection();
            health.components.codegenClient = codegenHealth;

            // Check rate limiter
            health.components.rateLimiter = {
                status: 'healthy',
                usage: this.rateLimiter.getUsage()
            };

            // Check quota manager
            const quotaUsage = await this.quotaManager.getUsage();
            health.components.quotaManager = {
                status: quotaUsage.dailyUsage < quotaUsage.dailyLimit ? 'healthy' : 'warning',
                usage: quotaUsage
            };

            // Check error handler
            health.components.errorHandler = {
                status: 'healthy',
                circuitBreakerOpen: this.errorHandler.isCircuitBreakerOpen()
            };

            // Determine overall health
            const componentStatuses = Object.values(health.components).map(c => c.status);
            if (componentStatuses.includes('unhealthy')) {
                health.status = 'unhealthy';
            } else if (componentStatuses.includes('warning')) {
                health.status = 'warning';
            }

        } catch (error) {
            health.status = 'unhealthy';
            health.error = error.message;
        }

        return health;
    }

    /**
     * Shutdown integrator and cleanup resources
     * @returns {Promise<void>}
     */
    async shutdown() {
        try {
            log('info', 'Shutting down Codegen integrator');

            // Cancel active requests
            for (const [requestId] of this.activeRequests) {
                log('debug', 'Cancelling active request', { requestId });
            }

            // Shutdown components
            if (this.codegenClient && this.codegenClient.shutdown) {
                await this.codegenClient.shutdown();
            }

            if (this.contextEnricher && this.contextEnricher.clearCache) {
                this.contextEnricher.clearCache();
            }

            // Clear tracking data
            this.activeRequests.clear();
            this.requestHistory = [];

            log('info', 'Codegen integrator shutdown complete');

        } catch (error) {
            log('error', 'Error during shutdown', { error: error.message });
            throw error;
        }
    }

    /**
     * Generate unique request ID
     * @private
     */
    _generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get request start time
     * @private
     */
    _getRequestStartTime(requestId) {
        return this.activeRequests.get(requestId)?.startTime || Date.now();
    }

    /**
     * Calculate average processing time
     * @private
     */
    _calculateAverageProcessingTime() {
        if (this.requestHistory.length === 0) return 0;
        
        const totalTime = this.requestHistory.reduce((sum, req) => sum + (req.processingTime || 0), 0);
        return Math.round(totalTime / this.requestHistory.length);
    }

    /**
     * Calculate success rate
     * @private
     */
    _calculateSuccessRate() {
        if (this.requestHistory.length === 0) return 0;
        
        const successfulRequests = this.requestHistory.filter(r => r.success).length;
        return Math.round((successfulRequests / this.requestHistory.length) * 100);
    }
}

/**
 * Mock Codegen client for development and testing
 */
class MockCodegenClient {
    constructor(config) {
        this.config = config;
        this.mockDelay = config.development?.mockDelay || 2000;
        
        log('info', 'Mock Codegen client initialized');
    }

    async createTask(taskConfig) {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, this.mockDelay));
        
        const mockTask = {
            id: `mock_task_${Date.now()}`,
            status: 'pending',
            prompt: taskConfig.prompt,
            context: taskConfig.context,
            repository: taskConfig.repository,
            branch: taskConfig.branch,
            createdAt: new Date(),
            updatedAt: new Date(),
            
            async waitForCompletion(options = {}) {
                const { pollInterval = 5000, maxWaitTime = 300000, onProgress } = options;
                
                // Simulate processing states
                const states = ['pending', 'running', 'completed'];
                let currentStateIndex = 0;
                
                while (currentStateIndex < states.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, pollInterval));
                    
                    currentStateIndex++;
                    this.status = states[currentStateIndex];
                    this.updatedAt = new Date();
                    
                    if (onProgress) {
                        onProgress(this);
                    }
                }
                
                // Generate mock result
                this.result = {
                    pr_url: `https://github.com/mock/repo/pull/${Math.floor(Math.random() * 1000)}`,
                    pr_number: Math.floor(Math.random() * 1000),
                    branch_name: `feature/task-${this.id}`,
                    title: `Mock PR for ${taskConfig.options?.taskType || 'task'}`,
                    status: 'open',
                    created_at: new Date(),
                    modified_files: ['src/mock.js', 'tests/mock.test.js'],
                    repository: taskConfig.repository || 'mock/repo',
                    description: 'Mock implementation generated for development/testing'
                };
                
                return this.result;
            },
            
            async cancel() {
                this.status = 'cancelled';
                this.updatedAt = new Date();
                return true;
            }
        };
        
        return mockTask;
    }

    async validateConnection() {
        return {
            status: 'healthy',
            mode: 'mock',
            timestamp: new Date().toISOString()
        };
    }

    async getUsageStats() {
        return {
            requests: Math.floor(Math.random() * 100),
            successRate: 95 + Math.random() * 5,
            averageResponseTime: 1500 + Math.random() * 1000,
            mode: 'mock'
        };
    }

    async shutdown() {
        log('debug', 'Mock Codegen client shutdown');
    }
}

export default CodegenIntegrator;
