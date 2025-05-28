/**
 * @fileoverview Codegen Integrator
 * @description Unified codegen integration with intelligent prompt generation
 */

import { log } from '../../../scripts/modules/utils.js';

/**
 * Codegen integrator that handles prompt generation and PR creation
 */
export class CodegenIntegrator {
    constructor(config = {}) {
        this.config = {
            api_url: config.api_url || 'https://api.codegen.sh',
            api_key: config.api_key,
            timeout: config.timeout || 60000,
            retry_attempts: config.retry_attempts || 3,
            retry_delay: config.retry_delay || 2000,
            enable_tracking: config.enable_tracking !== false,
            max_retries: config.max_retries || 3,
            enable_mock: config.enable_mock || !config.api_key,
            ...config
        };
        
        this.promptGenerator = new PromptGenerator(this.config);
        this.codegenClient = new CodegenClient(this.config);
        this.prTracker = new PRTracker(this.config);
        this.activeRequests = new Map();
        this.requestHistory = [];
    }

    /**
     * Initialize the codegen integrator
     */
    async initialize() {
        log('debug', 'Initializing codegen integrator...');
        
        if (this.config.enable_mock) {
            log('info', 'Using mock codegen integration');
        } else {
            // Validate API connection
            await this.codegenClient.validateConnection();
        }
        
        log('debug', 'Codegen integrator initialized');
    }

    /**
     * Process task with codegen
     * @param {Object} task - Task to process
     * @param {Object} taskContext - Task context
     * @returns {Promise<Object>} Codegen result
     */
    async processTask(task, taskContext) {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        log('info', `Processing task ${task.id} with codegen (request: ${requestId})`);

        try {
            // Track active request
            this.activeRequests.set(requestId, {
                task_id: task.id,
                started_at: new Date(),
                status: 'processing'
            });

            // Step 1: Generate intelligent prompt
            const prompt = await this.promptGenerator.generatePrompt(task, taskContext);
            
            // Step 2: Send to codegen API
            const codegenResponse = await this.codegenClient.sendCodegenRequest(prompt, task.id);
            
            // Step 3: Parse response and extract PR info
            const prInfo = await this._parseCodegenResponse(codegenResponse);
            
            // Step 4: Track PR creation
            if (prInfo && this.config.enable_tracking) {
                await this.prTracker.trackPRCreation(task.id, prInfo);
            }
            
            // Step 5: Compile result
            const result = {
                request_id: requestId,
                task_id: task.id,
                status: codegenResponse.success ? 'completed' : 'failed',
                prompt: prompt,
                codegen_response: codegenResponse,
                pr_info: prInfo,
                task_context: taskContext,
                metrics: {
                    prompt_length: prompt.content.length,
                    processing_time_ms: Date.now() - this.activeRequests.get(requestId).started_at.getTime(),
                    api_response_time_ms: codegenResponse.response_time_ms
                },
                completed_at: new Date()
            };

            // Update request tracking
            this.activeRequests.get(requestId).status = 'completed';
            this.activeRequests.get(requestId).result = result;
            
            // Add to history
            this.requestHistory.push(result);
            
            log('info', `Task ${task.id} processed successfully (${result.metrics.processing_time_ms}ms)`);
            return result;

        } catch (error) {
            log('error', `Failed to process task ${task.id}: ${error.message}`);
            
            const errorResult = {
                request_id: requestId,
                task_id: task.id,
                status: 'failed',
                error: error.message,
                completed_at: new Date()
            };
            
            this.activeRequests.get(requestId).status = 'failed';
            this.activeRequests.get(requestId).result = errorResult;
            this.requestHistory.push(errorResult);
            
            return errorResult;
        }
    }

    /**
     * Process multiple tasks concurrently
     * @param {Array} tasks - Array of tasks to process
     * @param {Object} globalContext - Global context for all tasks
     * @returns {Promise<Array>} Array of codegen results
     */
    async processTasks(tasks, globalContext = {}) {
        log('info', `Processing ${tasks.length} tasks concurrently`);
        
        const promises = tasks.map(task => 
            this.processTask(task, { ...globalContext, task_specific: task.context || {} })
        );
        
        return await Promise.all(promises);
    }

    /**
     * Direct codegen request (for advanced use cases)
     * @param {Object} prompt - Prompt object
     * @param {string} taskId - Task ID
     * @returns {Promise<Object>} Codegen response
     */
    async sendCodegenRequest(prompt, taskId) {
        return await this.codegenClient.sendCodegenRequest(prompt, taskId);
    }

    /**
     * Track PR creation
     * @param {string} taskId - Task ID
     * @param {Object} prInfo - PR information
     */
    async trackPRCreation(taskId, prInfo) {
        if (this.config.enable_tracking) {
            await this.prTracker.trackPRCreation(taskId, prInfo);
        }
    }

    /**
     * Get PR status for a task
     * @param {string} taskId - Task ID
     * @returns {Promise<Object|null>} PR status or null
     */
    async getPRStatus(taskId) {
        return await this.prTracker.getPRStatus(taskId);
    }

    /**
     * Get statistics
     * @returns {Promise<Object>} Statistics object
     */
    async getStatistics() {
        const prStats = await this.prTracker.getPRStatistics();
        
        return {
            requests: {
                total: this.requestHistory.length,
                active: this.activeRequests.size,
                completed: this.requestHistory.filter(r => r.status === 'completed').length,
                failed: this.requestHistory.filter(r => r.status === 'failed').length
            },
            prs: prStats,
            performance: {
                avg_processing_time_ms: this._calculateAverageProcessingTime(),
                avg_api_response_time_ms: this._calculateAverageApiResponseTime()
            }
        };
    }

    /**
     * Get health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        return {
            status: 'healthy',
            components: {
                prompt_generator: this.promptGenerator.getHealth(),
                codegen_client: await this.codegenClient.getHealth(),
                pr_tracker: this.prTracker.getHealth()
            },
            active_requests: this.activeRequests.size,
            total_requests: this.requestHistory.length
        };
    }

    /**
     * Shutdown the integrator
     */
    async shutdown() {
        log('info', 'Shutting down codegen integrator...');
        await this.codegenClient.shutdown();
        this.activeRequests.clear();
        log('info', 'Codegen integrator shut down');
    }

    // Private methods
    async _parseCodegenResponse(response) {
        if (!response.success || !response.data) {
            return null;
        }
        
        return {
            pr_url: response.data.pr_url,
            pr_number: response.data.pr_number,
            branch_name: response.data.branch_name,
            title: response.data.title,
            status: response.data.status,
            created_at: response.data.created_at,
            modified_files: response.data.modified_files || [],
            repository: response.data.repository
        };
    }

    _calculateAverageProcessingTime() {
        const completedRequests = this.requestHistory.filter(r => r.metrics?.processing_time_ms);
        if (completedRequests.length === 0) return 0;
        
        const total = completedRequests.reduce((sum, r) => sum + r.metrics.processing_time_ms, 0);
        return Math.round(total / completedRequests.length);
    }

    _calculateAverageApiResponseTime() {
        const completedRequests = this.requestHistory.filter(r => r.metrics?.api_response_time_ms);
        if (completedRequests.length === 0) return 0;
        
        const total = completedRequests.reduce((sum, r) => sum + r.metrics.api_response_time_ms, 0);
        return Math.round(total / completedRequests.length);
    }
}

/**
 * Codegen Client - handles direct API communication
 */
class CodegenClient {
    constructor(config) {
        this.config = config;
    }

    async validateConnection() {
        if (this.config.enable_mock) {
            return true;
        }
        
        // Real API validation would go here
        log('debug', 'Validating codegen API connection...');
        return true;
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
                    pr_url: `https://github.com/example/repo/pull/${Math.floor(Math.random() * 1000)}`,
                    pr_number: Math.floor(Math.random() * 1000),
                    branch_name: `feature/task-${taskId}`,
                    title: prompt.content.split('\n')[0].replace('# ', ''),
                    status: 'open',
                    created_at: new Date(),
                    modified_files: ['src/main.js', 'tests/main.test.js'],
                    repository: 'example/repo'
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
 * Prompt Generator
 */
class PromptGenerator {
    constructor(config) {
        this.config = config;
        this.templates = {
            bug_fix: {
                version: '1.0.0',
                base: `# Bug Fix: {{TASK_TITLE}}

## Issue Description
{{TASK_DESCRIPTION}}

## Expected Behavior
{{EXPECTED_BEHAVIOR}}

## Current Behavior
{{CURRENT_BEHAVIOR}}

## Steps to Reproduce
{{REPRODUCTION_STEPS}}

## Proposed Solution
{{SOLUTION_APPROACH}}

## Files to Modify
{{TARGET_FILES}}

## Testing Requirements
{{TESTING_REQUIREMENTS}}`
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

## Implementation Approach
{{IMPLEMENTATION_APPROACH}}

## Files to Create/Modify
{{TARGET_FILES}}

## Testing Strategy
{{TESTING_STRATEGY}}`
            },
            refactor: {
                version: '1.0.0',
                base: `# Code Refactoring: {{TASK_TITLE}}

## Refactoring Goal
{{TASK_DESCRIPTION}}

## Current Code Issues
{{CURRENT_ISSUES}}

## Proposed Improvements
{{IMPROVEMENTS}}

## Files to Refactor
{{TARGET_FILES}}

## Backward Compatibility
{{COMPATIBILITY_NOTES}}

## Testing Plan
{{TESTING_PLAN}}`
            }
        };
    }

    async generatePrompt(task, context) {
        const template = this._selectTemplate(task);
        const variables = this._extractVariables(task, context);
        const content = this._populateTemplate(template, variables);
        
        return {
            task_id: task.id,
            template_type: task.type || 'feature',
            content: content,
            variables: variables,
            context: context,
            generated_at: new Date()
        };
    }

    _selectTemplate(task) {
        const taskType = task.type || 'feature';
        return this.templates[taskType] || this.templates.feature;
    }

    _extractVariables(task, context) {
        return {
            TASK_TITLE: task.title || 'Untitled Task',
            TASK_DESCRIPTION: task.description || 'No description provided',
            REQUIREMENTS: task.requirements || context.requirements || 'No specific requirements',
            ACCEPTANCE_CRITERIA: task.acceptance_criteria || context.acceptance_criteria || 'To be defined',
            IMPLEMENTATION_APPROACH: task.approach || context.approach || 'Standard implementation',
            TARGET_FILES: this._formatFileList(task.files || context.files || []),
            TESTING_STRATEGY: task.testing || context.testing || 'Unit and integration tests',
            EXPECTED_BEHAVIOR: task.expected_behavior || 'As specified in requirements',
            CURRENT_BEHAVIOR: task.current_behavior || 'Not working as expected',
            REPRODUCTION_STEPS: task.reproduction_steps || 'Steps to be documented',
            SOLUTION_APPROACH: task.solution || 'To be implemented',
            TESTING_REQUIREMENTS: task.test_requirements || 'Standard testing protocols',
            CURRENT_ISSUES: task.issues || 'Code quality improvements needed',
            IMPROVEMENTS: task.improvements || 'Performance and maintainability',
            COMPATIBILITY_NOTES: task.compatibility || 'Maintain backward compatibility',
            TESTING_PLAN: task.test_plan || 'Comprehensive testing strategy'
        };
    }

    _populateTemplate(template, variables) {
        let content = template.base;
        
        Object.entries(variables).forEach(([key, value]) => {
            const placeholder = `{{${key}}}`;
            content = content.replace(new RegExp(placeholder, 'g'), value);
        });
        
        return content;
    }

    _formatFileList(files) {
        if (!Array.isArray(files) || files.length === 0) {
            return 'Files to be determined during implementation';
        }
        
        return files.map(file => `- ${file}`).join('\n');
    }

    getHealth() {
        return {
            status: 'healthy',
            templates_loaded: Object.keys(this.templates).length
        };
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

export default CodegenIntegrator;
