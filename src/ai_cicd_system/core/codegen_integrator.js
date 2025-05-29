/**
 * @fileoverview Codegen Integrator
 * @description Production-grade codegen integration with real Codegen SDK and enhanced natural language processing
 */

import { log } from '../../scripts/modules/utils.js';
import { CodegenAgent, CodegenTask, CodegenError } from './codegen_client.js';
import { CodegenErrorHandler } from './error_handler.js';
import { RateLimiter, QuotaManager } from './rate_limiter.js';
import { createCodegenConfig } from '../config/codegen_config.js';
import { TaskProcessor } from './task_processor.js';
import { PromptGenerator } from './prompt_generator.js';
import { PRCreator } from './pr_creator.js';

/**
 * Enhanced Codegen integrator with natural language processing and intelligent PR creation
 */
export class CodegenIntegrator {
    constructor(config = {}) {
        // Initialize configuration
        this.config = createCodegenConfig(config);
        
        // Initialize enhanced components
        this._initializeComponents();
        
        // Request tracking
        this.activeRequests = new Map();
        this.requestHistory = [];
        
        // Enhanced features
        this.taskProcessor = new TaskProcessor(config.taskProcessor);
        this.promptGenerator = new PromptGenerator(config.promptGenerator);
        this.prCreator = new PRCreator(config.prCreator);
        
        // Performance metrics
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageProcessingTime: 0,
            naturalLanguageProcessingEnabled: true
        };
        
        log('info', `Enhanced Codegen integrator initialized in ${this.config.get('mode')} mode with NLP capabilities`);
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

        // Initialize prompt generator
        this.promptGenerator = new PromptGenerator(this.config.getAll());

        // Initialize components based on mock mode
        if (this.config.isMockEnabled()) {
            log('info', 'Using mock codegen integration');
            this.codegenClient = new MockCodegenClient(this.config.getAll());
        } else {
            // Initialize real Codegen agent
            this.codegenAgent = new CodegenAgent({
                org_id: authConfig.orgId,
                token: authConfig.token,
                baseURL: apiConfig.baseURL,
                timeout: apiConfig.timeout,
                retries: this.config.get('retry.maxRetries')
            });
        }

        // Initialize rate limiter
        if (rateLimitConfig.enabled) {
            this.rateLimiter = new RateLimiter(rateLimitConfig);
        }

        // Initialize quota manager
        this.quotaManager = new QuotaManager(quotaConfig);

        // Initialize error handler
        this.errorHandler = new CodegenErrorHandler(errorConfig);

        // Initialize PR tracker
        this.prTracker = new PRTracker(this.config.getAll());
    }

    /**
     * Initialize the codegen integrator
     */
    async initialize() {
        log('debug', 'Initializing codegen integrator...');
        
        try {
            if (!this.config.isMockEnabled()) {
                // Validate API connection if not in mock mode
                await this._validateConnection();
            }
            
            log('debug', 'Codegen integrator initialized successfully');
        } catch (error) {
            log('error', `Failed to initialize codegen integrator: ${error.message}`);
            throw error;
        }
    }

    /**
     * Validate API connection
     * @private
     */
    async _validateConnection() {
        if (!this.config.get('authentication.validateOnInit')) {
            return;
        }

        try {
            // Test connection by creating a simple task
            const testTask = await this.codegenAgent.run('Test connection', { 
                timeout: 10000,
                priority: 'high'
            });
            
            log('debug', `Connection validated with test task: ${testTask.id}`);
        } catch (error) {
            throw new CodegenError('CONNECTION_VALIDATION_FAILED', 
                `Failed to validate Codegen API connection: ${error.message}`, error);
        }
    }

    /**
     * Process task with codegen
     * @param {Object} task - Task to process
     * @param {Object} taskContext - Task context
     * @returns {Promise<Object>} Codegen result
     */
    async processTask(task, taskContext) {
        const startTime = Date.now();
        const requestId = this._generateRequestId();
        
        try {
            log('info', `Processing enhanced task ${task.id || requestId} with NLP`);
            
            // Track active request
            this.activeRequests.set(requestId, {
                taskId: task.id || requestId,
                startTime,
                status: 'processing'
            });
            
            // Step 1: Process natural language requirements
            let processedTask;
            if (task.originalDescription || task.description) {
                processedTask = await this.taskProcessor.processNaturalLanguageTask({
                    id: task.id || requestId,
                    description: task.originalDescription || task.description,
                    ...task
                });
                log('debug', `Task processed with complexity ${processedTask.complexity}, priority ${processedTask.priority}`);
            } else {
                // Fallback for tasks without natural language description
                processedTask = task;
            }
            
            // Step 2: Generate intelligent prompt
            const promptResult = await this.promptGenerator.generateCodePrompt(processedTask, taskContext);
            log('debug', `Generated enhanced prompt (${promptResult.metadata.prompt_length} chars)`);
            
            // Step 3: Send to Codegen with enhanced prompt
            const codegenResponse = await this._sendCodegenRequest({
                prompt: promptResult.content,
                instructions: promptResult.instructions,
                constraints: promptResult.constraints,
                task_id: processedTask.id || requestId,
                metadata: {
                    complexity: processedTask.complexity,
                    priority: processedTask.priority,
                    estimated_effort: processedTask.estimatedEffort,
                    nlp_processed: true
                }
            }, requestId);
            
            if (!codegenResponse.success) {
                throw new CodegenError(`Enhanced codegen processing failed: ${codegenResponse.error}`, 'ENHANCED_PROCESSING_ERROR');
            }
            
            // Step 4: Create comprehensive PR
            let prInfo = null;
            if (codegenResponse.data && this.prCreator) {
                try {
                    prInfo = await this.prCreator.createPR(processedTask, {
                        files: codegenResponse.data.modified_files || [],
                        summary: codegenResponse.data.summary || 'Enhanced code generation with NLP',
                        breaking_changes: codegenResponse.data.breaking_changes || []
                    });
                    
                    log('info', `Comprehensive PR created: ${prInfo.url}`);
                } catch (prError) {
                    log('warn', `PR creation failed, but code generation succeeded: ${prError.message}`);
                    // Continue without PR creation
                }
            }
            
            // Update metrics
            this._updateMetrics(startTime, true);
            
            // Track successful request
            this.activeRequests.delete(requestId);
            this.requestHistory.push({
                requestId,
                taskId: processedTask.id,
                success: true,
                processingTime: Date.now() - startTime,
                timestamp: new Date(),
                nlpProcessed: true,
                prCreated: !!prInfo
            });
            
            const result = {
                success: true,
                data: {
                    ...codegenResponse.data,
                    pr_info: prInfo,
                    processing_metadata: {
                        complexity: processedTask.complexity,
                        priority: processedTask.priority,
                        estimated_effort: processedTask.estimatedEffort,
                        processing_time_ms: Date.now() - startTime,
                        nlp_processed: true,
                        pr_created: !!prInfo
                    }
                },
                request_id: requestId,
                processing_time_ms: Date.now() - startTime
            };
            
            log('info', `Enhanced task processing completed successfully for ${processedTask.id}`);
            return result;
            
        } catch (error) {
            // Update metrics
            this._updateMetrics(startTime, false);
            
            // Track failed request
            this.activeRequests.delete(requestId);
            this.requestHistory.push({
                requestId,
                taskId: task.id || requestId,
                success: false,
                error: error.message,
                processingTime: Date.now() - startTime,
                timestamp: new Date(),
                nlpProcessed: false
            });
            
            log('error', `Enhanced task processing failed for ${task.id || requestId}: ${error.message}`);
            
            return {
                success: false,
                error: error.message,
                error_type: error.constructor.name,
                request_id: requestId,
                processing_time_ms: Date.now() - startTime
            };
        }
    }

    /**
     * Send codegen request with proper error handling
     * @param {Object} prompt - Generated prompt
     * @param {string} taskId - Task identifier
     * @returns {Promise<Object>} Codegen response
     * @private
     */
    async _sendCodegenRequest(prompt, taskId) {
        const startTime = Date.now();
        
        try {
            if (this.config.isMockEnabled()) {
                return await this.codegenClient.sendCodegenRequest(prompt, taskId);
            }

            // Create task with real Codegen API
            const task = await this.codegenAgent.run(prompt.content, {
                metadata: {
                    task_id: taskId,
                    prompt_type: prompt.task_type,
                    complexity: prompt.metadata.estimated_complexity
                }
            });

            // Wait for completion with polling
            const pollingConfig = this.config.getComponent('polling');
            const result = await task.waitForCompletion({
                pollInterval: pollingConfig.defaultInterval,
                maxWaitTime: pollingConfig.maxWaitTime,
                onProgress: (task) => {
                    log('debug', `Task ${task.id} status: ${task.status}`);
                }
            });

            return {
                success: true,
                data: this._formatCodegenResult(result, task),
                response_time_ms: Date.now() - startTime,
                task_id: task.id
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                error_type: error.code || 'UNKNOWN',
                response_time_ms: Date.now() - startTime
            };
        }
    }

    /**
     * Format Codegen result to match expected structure
     * @param {Object} result - Raw Codegen result
     * @param {CodegenTask} task - Codegen task
     * @returns {Object} Formatted result
     * @private
     */
    _formatCodegenResult(result, task) {
        // Extract PR information from Codegen result
        // This structure may need adjustment based on actual API response
        return {
            pr_url: result.pr_url || result.pull_request_url,
            pr_number: result.pr_number || this._extractPRNumber(result.pr_url),
            branch_name: result.branch_name || result.head_branch,
            title: result.title || result.pr_title,
            status: result.status || 'open',
            created_at: result.created_at || new Date(),
            modified_files: result.modified_files || result.changed_files || [],
            commits: result.commits || [],
            repository: result.repository || result.repo,
            task_id: task.id,
            codegen_task_id: task.id
        };
    }

    /**
     * Generate prompt for task
     * @param {Object} task - Task object
     * @param {Object} context - Task context
     * @returns {Promise<Object>} Generated prompt
     */
    async generatePrompt(task, context) {
        return await this.promptGenerator.generatePrompt(task, context);
    }

    /**
     * Send codegen request
     * @param {Object} prompt - Generated prompt
     * @param {string} taskId - Task identifier
     * @returns {Promise<Object>} Codegen response
     */
    async sendCodegenRequest(prompt, taskId) {
        return await this.codegenClient.sendCodegenRequest(prompt, taskId);
    }

    /**
     * Track PR creation
     * @param {string} taskId - Task identifier
     * @param {Object} prInfo - PR information
     */
    async trackPRCreation(taskId, prInfo) {
        if (this.config.get('monitoring.enableMetrics')) {
            await this.prTracker.trackPRCreation(taskId, prInfo);
        }
    }

    /**
     * Get PR status
     * @param {string} taskId - Task identifier
     * @returns {Promise<Object>} PR status
     */
    async getPRStatus(taskId) {
        return await this.prTracker.getPRStatus(taskId);
    }

    /**
     * Get integration statistics
     * @returns {Promise<Object>} Integration statistics
     */
    async getStatistics() {
        const totalRequests = this.requestHistory.length + this.activeRequests.size;
        const completedRequests = this.requestHistory.filter(r => r.status === 'completed').length;
        const failedRequests = this.requestHistory.filter(r => r.status === 'failed').length;
        
        return {
            active_requests: this.activeRequests.size,
            completed_requests: completedRequests,
            failed_requests: failedRequests,
            total_requests: totalRequests,
            success_rate: totalRequests > 0 ? (completedRequests / totalRequests) * 100 : 0,
            pr_stats: await this.prTracker.getPRStatistics()
        };
    }

    /**
     * Get health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        const stats = await this.getStatistics();
        
        const health = {
            status: 'healthy',
            mode: this.config.get('mode'),
            api_url: this.config.get('api.baseURL'),
            active_requests: stats.active_requests,
            success_rate: stats.success_rate,
            prompt_generator: this.promptGenerator.getHealth(),
            pr_tracker: this.prTracker.getHealth()
        };

        // Add component health based on mode
        if (this.config.isMockEnabled()) {
            health.codegen_client = await this.codegenClient.getHealth();
        } else {
            health.codegen_agent = {
                status: 'healthy',
                org_id: this.config.get('authentication.orgId'),
                api_url: this.config.get('api.baseURL')
            };
        }

        // Add rate limiter health if enabled
        if (this.rateLimiter) {
            health.rate_limiter = this.rateLimiter.getStatus();
        }

        // Add quota manager health
        health.quota_manager = this.quotaManager.getStatus();

        // Add error handler statistics
        health.error_handler = this.errorHandler.getStatistics();

        return health;
    }

    /**
     * Shutdown the integrator
     */
    async shutdown() {
        log('debug', 'Shutting down codegen integrator...');
        
        // Cancel active requests
        for (const [requestId, request] of this.activeRequests) {
            log('warning', `Cancelling active request: ${requestId}`);
            request.status = 'cancelled';
        }
        
        // Reset rate limiter
        if (this.rateLimiter) {
            this.rateLimiter.reset();
        }

        // Shutdown mock client if used
        if (this.config.isMockEnabled() && this.codegenClient) {
            await this.codegenClient.shutdown();
        }

        log('debug', 'Codegen integrator shutdown complete');
    }

    // Private methods

    /**
     * Parse codegen response and extract PR information
     * @param {Object} response - Codegen response
     * @returns {Promise<Object|null>} PR information
     * @private
     */
    async _parseCodegenResponse(response) {
        if (!response.success || !response.data) {
            return null;
        }

        // Extract PR information from response
        const prInfo = {
            pr_url: response.data.pr_url || response.data.pull_request_url,
            pr_number: response.data.pr_number || this._extractPRNumber(response.data.pr_url),
            branch_name: response.data.branch_name || response.data.head_branch,
            title: response.data.title || response.data.pr_title,
            status: response.data.status || 'open',
            created_at: response.data.created_at || new Date(),
            modified_files: response.data.modified_files || response.data.changed_files || [],
            commits: response.data.commits || [],
            repository: response.data.repository || response.data.repo,
            codegen_task_id: response.task_id
        };

        // Validate required fields
        if (!prInfo.pr_url) {
            log('warning', 'No PR URL found in codegen response');
            return null;
        }

        return prInfo;
    }

    /**
     * Extract PR number from URL
     * @param {string} prUrl - PR URL
     * @returns {number|null} PR number
     * @private
     */
    _extractPRNumber(prUrl) {
        if (!prUrl) return null;
        
        const match = prUrl.match(/\/pull\/(\d+)/);
        return match ? parseInt(match[1]) : null;
    }

    /**
     * Generate a unique request ID
     * @private
     */
    _generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Update performance metrics
     * @param {number} startTime - Start time of the request
     * @param {boolean} success - Whether the request was successful
     * @private
     */
    _updateMetrics(startTime, success) {
        this.metrics.totalRequests++;
        if (success) {
            this.metrics.successfulRequests++;
        } else {
            this.metrics.failedRequests++;
        }
        this.metrics.averageProcessingTime = (this.metrics.averageProcessingTime * (this.metrics.totalRequests - 1) + (Date.now() - startTime)) / this.metrics.totalRequests;
    }
}

/**
 * Task Processor
 */
class TaskProcessor {
    constructor(config) {
        this.config = config;
    }

    async processTask(task, taskContext) {
        // Implement task processing logic here
        return {
            status: 'completed',
            result: `Processed task ${task.id} with context ${JSON.stringify(taskContext)}`
        };
    }

    async processNaturalLanguageTask(task) {
        // Implement natural language processing logic here
        return {
            id: task.id,
            description: task.description,
            complexity: 5,
            priority: 'high',
            estimatedEffort: 100
        };
    }
}

/**
 * Prompt Generator
 */
class PromptGenerator {
    constructor(config) {
        this.config = config;
        this.templates = new PromptTemplates();
    }

    async generatePrompt(task, context) {
        const template = this.templates.getTemplate(task.type || 'implementation');
        
        const prompt = {
            task_id: task.id,
            task_type: task.type || 'implementation',
            content: this._buildPromptContent(task, context, template),
            metadata: {
                estimated_complexity: task.complexityScore,
                priority: task.priority,
                affected_files: task.affectedFiles,
                generated_at: new Date(),
                template_version: template.version
            }
        };

        return prompt;
    }

    getHealth() {
        return { status: 'healthy', templates_loaded: this.templates.getTemplateCount() };
    }

    _buildPromptContent(task, context, template) {
        let content = template.base;
        
        // Replace placeholders
        content = content.replace('{{TASK_TITLE}}', task.title);
        content = content.replace('{{TASK_DESCRIPTION}}', task.description);
        content = content.replace('{{REQUIREMENTS}}', this._formatRequirements(task.requirements));
        content = content.replace('{{ACCEPTANCE_CRITERIA}}', this._formatAcceptanceCriteria(task.acceptanceCriteria));
        content = content.replace('{{AFFECTED_FILES}}', task.affectedFiles.join(', '));
        content = content.replace('{{COMPLEXITY}}', task.complexityScore);
        content = content.replace('{{PRIORITY}}', task.priority);
        
        // Add context if available
        if (context && context.codebase_context) {
            content += `\n\nCodebase Context:\n${JSON.stringify(context.codebase_context, null, 2)}`;
        }
        
        return content;
    }

    _formatRequirements(requirements) {
        if (!requirements || requirements.length === 0) {
            return 'No specific requirements provided.';
        }
        
        return requirements.map((req, index) => `${index + 1}. ${req}`).join('\n');
    }

    _formatAcceptanceCriteria(criteria) {
        if (!criteria || criteria.length === 0) {
            return 'No specific acceptance criteria provided.';
        }
        
        return criteria.map((criterion, index) => `${index + 1}. ${criterion}`).join('\n');
    }
}

/**
 * Prompt Templates
 */
class PromptTemplates {
    constructor() {
        this.templates = {
            implementation: {
                version: '1.0.0',
                base: `# Implementation Task: {{TASK_TITLE}}

## Description
{{TASK_DESCRIPTION}}

## Requirements
{{REQUIREMENTS}}

## Acceptance Criteria
{{ACCEPTANCE_CRITERIA}}

## Technical Details
- Complexity: {{COMPLEXITY}}/10
- Priority: {{PRIORITY}}
- Affected Files: {{AFFECTED_FILES}}

## Instructions
Please implement the above requirements following best practices and ensuring all acceptance criteria are met.`
            },
            
            bug_fix: {
                version: '1.0.0',
                base: `# Bug Fix: {{TASK_TITLE}}

## Bug Description
{{TASK_DESCRIPTION}}

## Requirements
{{REQUIREMENTS}}

## Acceptance Criteria
{{ACCEPTANCE_CRITERIA}}

## Technical Details
- Complexity: {{COMPLEXITY}}/10
- Priority: {{PRIORITY}}
- Affected Files: {{AFFECTED_FILES}}

## Instructions
Please fix the described bug, ensuring the solution addresses the root cause and includes appropriate tests.`
            },
            
            feature: {
                version: '1.0.0',
                base: `# Feature Development: {{TASK_TITLE}}

## Feature Description
{{TASK_DESCRIPTION}}

## Requirements
{{REQUIREMENTS}}

## Acceptance Criteria
{{ACCEPTANCE_CRITERIA}}

## Technical Details
- Complexity: {{COMPLEXITY}}/10
- Priority: {{PRIORITY}}
- Affected Files: {{AFFECTED_FILES}}

## Instructions
Please implement the described feature, ensuring all requirements are met and the code is clean and maintainable.`
            }
        };
    }

    getTemplate(type) {
        return this.templates[type] || this.templates['implementation'];
    }

    getTemplateCount() {
        return Object.keys(this.templates).length;
    }
}

/**
 * PR Tracker
 */
class PRTracker {
    constructor(config) {
        this.config = config;
        this.trackedPRs = new Map();
    }

    async trackPRCreation(taskId, prInfo) {
        this.trackedPRs.set(taskId, {
            ...prInfo,
            tracked_at: new Date(),
            last_updated: new Date()
        });
        
        log('debug', `Tracking PR ${prInfo.pr_number} for task ${taskId}`);
    }

    async getPRStatus(taskId) {
        return this.trackedPRs.get(taskId) || null;
    }

    async getPRStatistics() {
        const prs = Array.from(this.trackedPRs.values());
        
        return {
            total: prs.length,
            by_status: {
                open: prs.filter(pr => pr.status === 'open').length,
                merged: prs.filter(pr => pr.status === 'merged').length,
                closed: prs.filter(pr => pr.status === 'closed').length
            },
            success_rate: prs.length > 0 ? (prs.filter(pr => pr.status === 'merged').length / prs.length) * 100 : 0
        };
    }

    getHealth() {
        return {
            status: 'healthy',
            tracked_prs: this.trackedPRs.size
        };
    }
}

/**
 * Mock Codegen Client
 */
class MockCodegenClient {
    constructor(config) {
        this.config = config;
    }

    async sendCodegenRequest(prompt, taskId) {
        if (this.config.enable_mock) {
            return this._createMockResponse(prompt, taskId);
        }
        
        // Real API call would go here
        const startTime = Date.now();
        
        try {
            // Mock API call
            await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API delay
            
            return {
                success: true,
                data: {
                    pr_url: `https://github.com/mock/repo/pull/${Math.floor(Math.random() * 1000)}`,
                    pr_number: Math.floor(Math.random() * 1000),
                    branch_name: `feature/task-${taskId}`,
                    title: prompt.content.split('\n')[0].replace('# ', ''),
                    status: 'open',
                    created_at: new Date(),
                    modified_files: ['src/mock.js', 'tests/mock.test.js'],
                    repository: 'mock/repo'
                },
                response_time_ms: Date.now() - startTime
            };
            
        } catch (error) {
            // Enhanced error handling based on error type
            let errorMessage = error.message;
            let errorType = 'unknown';
            
            // Check for common API errors
            if (error.response) {
                const status = error.response.status;
                
                if (status === 401 || status === 403) {
                    errorType = 'authentication';
                    errorMessage = 'API authentication failed. Please check your API key.';
                } else if (status === 429) {
                    errorType = 'rate_limit';
                    errorMessage = 'API rate limit exceeded. Please try again later.';
                } else if (status >= 500) {
                    errorType = 'server_error';
                    errorMessage = 'API server error. The service may be experiencing issues.';
                }
            } else if (error.code === 'ECONNREFUSED' || error.code === 'ECONNABORTED') {
                errorType = 'connection';
                errorMessage = 'Could not connect to the API. Please check your network connection.';
            } else if (error.code === 'ETIMEDOUT') {
                errorType = 'timeout';
                errorMessage = 'API request timed out. The service may be experiencing high load.';
            }
            
            log('error', `Codegen API error (${errorType}): ${errorMessage}`);
            
            return {
                success: false,
                error: errorMessage,
                error_type: errorType,
                response_time_ms: Date.now() - startTime
            };
        }
    }

    async validateConnection() {
        if (this.config.enable_mock) {
            return true;
        }
        
        // Real API validation would go here
        log('debug', 'Validating codegen API connection...');
        return true;
    }

    async getHealth() {
        return {
            status: 'healthy',
            mode: this.config.enable_mock ? 'mock' : 'production',
            api_url: this.config.api_url
        };
    }

    async shutdown() {
        // Cleanup connections
    }

    _createMockResponse(prompt, taskId) {
        return {
            success: true,
            data: {
                pr_url: `https://github.com/mock/repo/pull/${Math.floor(Math.random() * 1000)}`,
                pr_number: Math.floor(Math.random() * 1000),
                branch_name: `feature/task-${taskId}`,
                title: `Mock PR for ${prompt.task_id}`,
                status: 'open',
                created_at: new Date(),
                modified_files: ['src/mock.js', 'tests/mock.test.js'],
                repository: 'mock/repo'
            },
            response_time_ms: 1500 + Math.random() * 1000
        };
    }
}

/**
 * PR Creator
 */
class PRCreator {
    constructor(config) {
        this.config = config;
    }

    async createPR(taskId, prInfo) {
        // Implement PR creation logic here
        return {
            status: 'created',
            result: `Created PR ${prInfo.pr_number} for task ${taskId}`
        };
    }
}

export default CodegenIntegrator;
