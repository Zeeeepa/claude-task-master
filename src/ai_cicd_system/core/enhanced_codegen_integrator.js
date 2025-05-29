/**
 * @fileoverview Enhanced Codegen Integrator
 * @description Extended integrator building upon PR #22 improvements with database integration,
 *              webhook handling, and advanced prompt generation for complex development scenarios
 */

import { log } from '../../../scripts/modules/utils.js';
import { CodegenIntegrator } from './codegen_integrator.js';
import { DatabasePromptGenerator } from './database_prompt_generator.js';
import { AdvancedErrorRecovery } from './advanced_error_recovery.js';
import { GitHubWebhookHandler } from '../webhooks/github_webhook_handler.js';
import { EventProcessor } from '../webhooks/event_processor.js';
import { TemplateManager } from '../prompts/template_manager.js';
import { ContextEnricher } from '../prompts/context_enricher.js';
import { TaskStorageManager } from './task_storage_manager.js';

/**
 * Enhanced Codegen Integrator with database-driven prompts, webhooks, and advanced error recovery
 */
export class EnhancedCodegenIntegrator extends CodegenIntegrator {
    constructor(config = {}) {
        super(config);
        
        // Enhanced configuration
        this.enhancedConfig = {
            database: {
                enabled: config.database?.enabled !== false,
                connection_pool_size: config.database?.connection_pool_size || 10,
                query_timeout: config.database?.query_timeout || 30000,
                retry_attempts: config.database?.retry_attempts || 3
            },
            webhooks: {
                enabled: config.webhooks?.enabled !== false,
                github_secret: config.webhooks?.github_secret,
                endpoint_path: config.webhooks?.endpoint_path || '/webhooks/github',
                signature_validation: config.webhooks?.signature_validation !== false,
                event_queue_size: config.webhooks?.event_queue_size || 1000,
                processing_timeout: config.webhooks?.processing_timeout || 300000
            },
            prompts: {
                versioning_enabled: config.prompts?.versioning_enabled !== false,
                template_cache_size: config.prompts?.template_cache_size || 100,
                context_enrichment: config.prompts?.context_enrichment !== false,
                max_context_size: config.prompts?.max_context_size || 50000
            },
            error_recovery: {
                max_retry_attempts: config.error_recovery?.max_retry_attempts || 5,
                backoff_strategy: config.error_recovery?.backoff_strategy || 'exponential',
                fallback_providers: config.error_recovery?.fallback_providers || [],
                state_persistence: config.error_recovery?.state_persistence !== false
            },
            ...config
        };

        // Initialize enhanced components
        this._initializeEnhancedComponents();
        
        // Enhanced tracking
        this.webhookEvents = new Map();
        this.promptVersions = new Map();
        this.recoveryAttempts = new Map();
        
        log('info', 'Enhanced Codegen Integrator initialized with database, webhooks, and advanced features');
    }

    /**
     * Initialize enhanced components
     * @private
     */
    _initializeEnhancedComponents() {
        // Database-driven prompt generator
        if (this.enhancedConfig.database.enabled) {
            this.databasePromptGenerator = new DatabasePromptGenerator(this.enhancedConfig.database);
            this.taskStorage = new TaskStorageManager(this.enhancedConfig.database);
        }

        // Template management
        this.templateManager = new TemplateManager(this.enhancedConfig.prompts);
        this.contextEnricher = new ContextEnricher(this.enhancedConfig.prompts);

        // Webhook handling
        if (this.enhancedConfig.webhooks.enabled) {
            this.webhookHandler = new GitHubWebhookHandler(this.enhancedConfig.webhooks);
            this.eventProcessor = new EventProcessor(this.enhancedConfig.webhooks);
        }

        // Advanced error recovery
        this.errorRecovery = new AdvancedErrorRecovery(this.enhancedConfig.error_recovery);
    }

    /**
     * Enhanced initialization with database and webhook setup
     */
    async initialize() {
        await super.initialize();
        
        log('info', 'Initializing enhanced components...');

        // Initialize database components
        if (this.enhancedConfig.database.enabled) {
            await this.databasePromptGenerator.initialize();
            await this.taskStorage.initialize();
            log('info', 'Database components initialized');
        }

        // Initialize template management
        await this.templateManager.initialize();
        await this.contextEnricher.initialize();
        log('info', 'Prompt management components initialized');

        // Initialize webhook handling
        if (this.enhancedConfig.webhooks.enabled) {
            await this.webhookHandler.initialize();
            await this.eventProcessor.initialize();
            log('info', 'Webhook components initialized');
        }

        // Initialize error recovery
        await this.errorRecovery.initialize();
        log('info', 'Advanced error recovery initialized');

        log('info', 'Enhanced Codegen Integrator fully initialized');
    }

    /**
     * Enhanced task processing with database-driven prompts and advanced error recovery
     * @param {Object} task - Task to process
     * @param {Object} taskContext - Task context
     * @returns {Promise<Object>} Enhanced codegen result
     */
    async processTask(task, taskContext = {}) {
        const requestId = `enhanced_req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        log('info', `Processing enhanced task ${task.id} (request: ${requestId})`);

        try {
            // Track enhanced request
            this.activeRequests.set(requestId, {
                task_id: task.id,
                started_at: new Date(),
                status: 'processing',
                enhancement_features: {
                    database_prompts: this.enhancedConfig.database.enabled,
                    webhook_integration: this.enhancedConfig.webhooks.enabled,
                    context_enrichment: this.enhancedConfig.prompts.context_enrichment,
                    error_recovery: true
                }
            });

            // Step 1: Retrieve task context from database
            let enhancedContext = taskContext;
            if (this.enhancedConfig.database.enabled) {
                const dbContext = await this.taskStorage.getTaskContext(task.id);
                enhancedContext = { ...taskContext, ...dbContext };
                log('debug', `Retrieved database context for task ${task.id}`);
            }

            // Step 2: Enrich context with codebase analysis
            if (this.enhancedConfig.prompts.context_enrichment) {
                enhancedContext = await this.contextEnricher.enrichContext(enhancedContext, task);
                log('debug', `Enriched context for task ${task.id}`);
            }

            // Step 3: Generate database-driven prompt
            let prompt;
            if (this.enhancedConfig.database.enabled) {
                prompt = await this.databasePromptGenerator.generatePrompt(task, enhancedContext);
            } else {
                // Fallback to enhanced template-based generation
                const template = await this.templateManager.selectTemplate(task.type, task.complexity);
                prompt = await this.templateManager.generatePrompt(template, task, enhancedContext);
            }

            // Step 4: Version the prompt
            if (this.enhancedConfig.prompts.versioning_enabled) {
                const promptVersion = await this._versionPrompt(prompt, task.id);
                prompt.version = promptVersion;
                this.promptVersions.set(task.id, promptVersion);
            }

            // Step 5: Process with enhanced error recovery
            const result = await this.errorRecovery.executeWithRecovery(
                async () => {
                    const codegenResponse = await this.codegenClient.sendCodegenRequest(prompt, task.id);
                    return await this._processCodegenResponse(codegenResponse, task, enhancedContext);
                },
                {
                    operation: 'codegen_request',
                    task_id: task.id,
                    request_id: requestId
                }
            );

            // Step 6: Store results in database
            if (this.enhancedConfig.database.enabled) {
                await this.taskStorage.storeCodegenResult(task.id, result);
                log('debug', `Stored codegen result for task ${task.id}`);
            }

            // Step 7: Trigger webhook events if PR was created
            if (result.pr_info && this.enhancedConfig.webhooks.enabled) {
                await this.eventProcessor.queueEvent({
                    type: 'pr_created',
                    task_id: task.id,
                    pr_info: result.pr_info,
                    timestamp: new Date()
                });
            }

            // Update tracking
            this.activeRequests.get(requestId).status = 'completed';
            this.activeRequests.get(requestId).result = result;
            this.requestHistory.push(result);

            log('info', `Enhanced task ${task.id} processed successfully (${result.metrics.processing_time_ms}ms)`);
            return result;

        } catch (error) {
            log('error', `Enhanced task processing failed for ${task.id}: ${error.message}`);
            
            const errorResult = {
                request_id: requestId,
                task_id: task.id,
                status: 'failed',
                error: error.message,
                error_type: error.type || 'unknown',
                recovery_attempts: this.recoveryAttempts.get(task.id) || 0,
                completed_at: new Date()
            };

            this.activeRequests.get(requestId).status = 'failed';
            this.activeRequests.get(requestId).result = errorResult;
            this.requestHistory.push(errorResult);

            return errorResult;
        }
    }

    /**
     * Process multiple tasks with enhanced concurrency control
     * @param {Array} tasks - Array of tasks to process
     * @param {Object} globalContext - Global context for all tasks
     * @param {Object} options - Processing options
     * @returns {Promise<Array>} Array of enhanced codegen results
     */
    async processTasks(tasks, globalContext = {}, options = {}) {
        const {
            concurrency = 3,
            batch_size = 10,
            priority_ordering = true,
            failure_threshold = 0.2
        } = options;

        log('info', `Processing ${tasks.length} enhanced tasks with concurrency: ${concurrency}`);

        // Sort by priority if enabled
        const sortedTasks = priority_ordering 
            ? tasks.sort((a, b) => (b.priority || 0) - (a.priority || 0))
            : tasks;

        // Process in batches
        const results = [];
        const failures = [];

        for (let i = 0; i < sortedTasks.length; i += batch_size) {
            const batch = sortedTasks.slice(i, i + batch_size);
            log('info', `Processing batch ${Math.floor(i / batch_size) + 1} (${batch.length} tasks)`);

            // Process batch with concurrency control
            const batchPromises = batch.map(async (task, index) => {
                // Stagger requests to avoid overwhelming the API
                await new Promise(resolve => setTimeout(resolve, index * 100));
                return this.processTask(task, { ...globalContext, batch_index: i + index });
            });

            const batchResults = await Promise.allSettled(batchPromises);
            
            // Collect results and track failures
            for (const result of batchResults) {
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                    if (result.value.status === 'failed') {
                        failures.push(result.value);
                    }
                } else {
                    failures.push({
                        status: 'failed',
                        error: result.reason.message,
                        batch_failure: true
                    });
                }
            }

            // Check failure threshold
            const currentFailureRate = failures.length / results.length;
            if (currentFailureRate > failure_threshold) {
                log('warning', `Failure rate (${(currentFailureRate * 100).toFixed(1)}%) exceeds threshold (${(failure_threshold * 100).toFixed(1)}%)`);
                
                // Implement circuit breaker logic
                if (currentFailureRate > 0.5) {
                    log('error', 'High failure rate detected, stopping batch processing');
                    break;
                }
            }

            // Brief pause between batches
            if (i + batch_size < sortedTasks.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        log('info', `Enhanced batch processing completed: ${results.length} total, ${failures.length} failures`);
        return results;
    }

    /**
     * Handle GitHub webhook events
     * @param {Object} event - Webhook event
     * @returns {Promise<Object>} Processing result
     */
    async handleWebhookEvent(event) {
        if (!this.enhancedConfig.webhooks.enabled) {
            throw new Error('Webhook handling is disabled');
        }

        const eventId = `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        log('info', `Handling webhook event ${event.type} (${eventId})`);

        try {
            // Validate webhook signature
            if (this.enhancedConfig.webhooks.signature_validation) {
                await this.webhookHandler.validateSignature(event);
            }

            // Process event
            const result = await this.webhookHandler.processEvent(event);
            
            // Queue for further processing if needed
            if (result.requires_processing) {
                await this.eventProcessor.queueEvent({
                    ...event,
                    processing_result: result,
                    event_id: eventId
                });
            }

            this.webhookEvents.set(eventId, {
                event,
                result,
                processed_at: new Date()
            });

            return result;

        } catch (error) {
            log('error', `Webhook event processing failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get enhanced statistics including database and webhook metrics
     * @returns {Promise<Object>} Enhanced statistics
     */
    async getEnhancedStatistics() {
        const baseStats = await this.getStatistics();
        
        const enhancedStats = {
            ...baseStats,
            database: this.enhancedConfig.database.enabled ? {
                prompt_generations: await this.databasePromptGenerator?.getStatistics() || {},
                task_storage: await this.taskStorage?.getStatistics() || {}
            } : { enabled: false },
            webhooks: this.enhancedConfig.webhooks.enabled ? {
                events_processed: this.webhookEvents.size,
                event_queue_size: await this.eventProcessor?.getQueueSize() || 0,
                recent_events: Array.from(this.webhookEvents.values()).slice(-10)
            } : { enabled: false },
            prompts: {
                versions_tracked: this.promptVersions.size,
                template_cache_hits: await this.templateManager?.getCacheStatistics() || {},
                context_enrichments: await this.contextEnricher?.getStatistics() || {}
            },
            error_recovery: {
                recovery_attempts: this.recoveryAttempts.size,
                success_rate: await this.errorRecovery?.getSuccessRate() || 0,
                fallback_usage: await this.errorRecovery?.getFallbackStatistics() || {}
            }
        };

        return enhancedStats;
    }

    /**
     * Enhanced health check including all components
     * @returns {Promise<Object>} Enhanced health status
     */
    async getEnhancedHealth() {
        const baseHealth = await this.getHealth();
        
        const enhancedHealth = {
            ...baseHealth,
            enhanced_components: {
                database_prompt_generator: this.enhancedConfig.database.enabled 
                    ? await this.databasePromptGenerator?.getHealth() || { status: 'unknown' }
                    : { status: 'disabled' },
                task_storage: this.enhancedConfig.database.enabled
                    ? await this.taskStorage?.getHealth() || { status: 'unknown' }
                    : { status: 'disabled' },
                template_manager: await this.templateManager?.getHealth() || { status: 'unknown' },
                context_enricher: await this.contextEnricher?.getHealth() || { status: 'unknown' },
                webhook_handler: this.enhancedConfig.webhooks.enabled
                    ? await this.webhookHandler?.getHealth() || { status: 'unknown' }
                    : { status: 'disabled' },
                event_processor: this.enhancedConfig.webhooks.enabled
                    ? await this.eventProcessor?.getHealth() || { status: 'unknown' }
                    : { status: 'disabled' },
                error_recovery: await this.errorRecovery?.getHealth() || { status: 'unknown' }
            }
        };

        return enhancedHealth;
    }

    /**
     * Enhanced shutdown with proper cleanup of all components
     */
    async shutdown() {
        log('info', 'Shutting down Enhanced Codegen Integrator...');

        // Shutdown enhanced components
        if (this.errorRecovery) {
            await this.errorRecovery.shutdown();
        }

        if (this.enhancedConfig.webhooks.enabled) {
            if (this.eventProcessor) {
                await this.eventProcessor.shutdown();
            }
            if (this.webhookHandler) {
                await this.webhookHandler.shutdown();
            }
        }

        if (this.contextEnricher) {
            await this.contextEnricher.shutdown();
        }

        if (this.templateManager) {
            await this.templateManager.shutdown();
        }

        if (this.enhancedConfig.database.enabled) {
            if (this.taskStorage) {
                await this.taskStorage.shutdown();
            }
            if (this.databasePromptGenerator) {
                await this.databasePromptGenerator.shutdown();
            }
        }

        // Clear enhanced tracking
        this.webhookEvents.clear();
        this.promptVersions.clear();
        this.recoveryAttempts.clear();

        // Call parent shutdown
        await super.shutdown();

        log('info', 'Enhanced Codegen Integrator shut down successfully');
    }

    // Private enhanced methods

    /**
     * Version a prompt for tracking and consistency
     * @param {Object} prompt - Prompt to version
     * @param {string} taskId - Task ID
     * @returns {Promise<string>} Prompt version
     * @private
     */
    async _versionPrompt(prompt, taskId) {
        const promptHash = this._generatePromptHash(prompt);
        const version = `v${Date.now()}_${promptHash.substr(0, 8)}`;
        
        if (this.enhancedConfig.database.enabled) {
            await this.databasePromptGenerator.storePromptVersion(taskId, prompt, version);
        }
        
        return version;
    }

    /**
     * Generate hash for prompt content
     * @param {Object} prompt - Prompt object
     * @returns {string} Hash string
     * @private
     */
    _generatePromptHash(prompt) {
        const crypto = require('crypto');
        const content = JSON.stringify(prompt, Object.keys(prompt).sort());
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * Process codegen response with enhanced tracking
     * @param {Object} response - Codegen response
     * @param {Object} task - Original task
     * @param {Object} context - Enhanced context
     * @returns {Promise<Object>} Processed result
     * @private
     */
    async _processCodegenResponse(response, task, context) {
        const prInfo = await this._parseCodegenResponse(response);
        
        // Enhanced result with additional metadata
        const result = {
            task_id: task.id,
            status: response.success ? 'completed' : 'failed',
            codegen_response: response,
            pr_info: prInfo,
            context_used: {
                database_driven: this.enhancedConfig.database.enabled,
                enriched: this.enhancedConfig.prompts.context_enrichment,
                template_version: context.template_version,
                context_size: JSON.stringify(context).length
            },
            metrics: {
                processing_time_ms: response.response_time_ms,
                context_size_bytes: JSON.stringify(context).length,
                prompt_complexity: this._calculatePromptComplexity(context),
                api_response_time_ms: response.response_time_ms
            },
            completed_at: new Date()
        };

        // Track PR if created
        if (prInfo && this.config.enable_tracking) {
            await this.prTracker.trackPRCreation(task.id, prInfo);
        }

        return result;
    }

    /**
     * Calculate prompt complexity score
     * @param {Object} context - Context object
     * @returns {number} Complexity score
     * @private
     */
    _calculatePromptComplexity(context) {
        let complexity = 1;
        
        if (context.codebase_analysis) complexity += 2;
        if (context.dependencies && context.dependencies.length > 0) complexity += 1;
        if (context.test_requirements) complexity += 1;
        if (context.performance_requirements) complexity += 1;
        if (context.security_requirements) complexity += 2;
        
        return Math.min(complexity, 10);
    }
}

export default EnhancedCodegenIntegrator;

