/**
 * @fileoverview Codegen Integrator
 * @description Unified codegen integration with intelligent prompt generation
 */

import { log } from '../../scripts/modules/utils.js';

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
            
            // Move to history
            this.requestHistory.push(this.activeRequests.get(requestId));
            this.activeRequests.delete(requestId);

            log('info', `Task ${task.id} processed successfully (${result.status})`);
            return result;

        } catch (error) {
            log('error', `Failed to process task ${task.id}: ${error.message}`);
            
            // Update request tracking
            if (this.activeRequests.has(requestId)) {
                this.activeRequests.get(requestId).status = 'failed';
                this.activeRequests.get(requestId).error = error.message;
                
                // Move to history
                this.requestHistory.push(this.activeRequests.get(requestId));
                this.activeRequests.delete(requestId);
            }
            
            throw error;
        }
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
        if (this.config.enable_tracking) {
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
        
        return {
            status: 'healthy',
            mode: this.config.enable_mock ? 'mock' : 'production',
            api_url: this.config.api_url,
            active_requests: stats.active_requests,
            success_rate: stats.success_rate,
            prompt_generator: this.promptGenerator.getHealth(),
            codegen_client: await this.codegenClient.getHealth(),
            pr_tracker: this.prTracker.getHealth()
        };
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
        
        await this.codegenClient.shutdown();
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
            repository: response.data.repository || response.data.repo
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
Please implement the new feature according to the specifications, including comprehensive tests and documentation.`
            }
        };
    }

    getTemplate(type) {
        return this.templates[type] || this.templates.implementation;
    }

    getTemplateCount() {
        return Object.keys(this.templates).length;
    }
}

/**
 * Codegen Client
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
            return {
                success: false,
                error: error.message,
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

