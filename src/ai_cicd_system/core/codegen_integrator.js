/**
 * @fileoverview Codegen Integrator
 * @description Unified codegen integration with real Python SDK implementation
 */

import { log } from '../../scripts/modules/utils.js';
import { CodegenClient } from './codegen_client.js';
import { PromptOptimizer } from '../utils/prompt_optimizer.js';
import { RetryManager } from '../utils/retry_manager.js';
import { createCodegenConfig } from '../config/codegen_config.js';

/**
 * Codegen integrator that handles prompt generation and PR creation using real SDK
 */
export class CodegenIntegrator {
    constructor(config = {}) {
        // Create comprehensive configuration
        this.codegenConfig = createCodegenConfig(config, config.environment || 'development');
        this.config = this.codegenConfig.getAll();
        
        // Initialize components with real implementations
        this.promptOptimizer = new PromptOptimizer(this.codegenConfig.getPromptConfig());
        this.codegenClient = new CodegenClient(this.codegenConfig.getSDKConfig());
        this.retryManager = new RetryManager(this.codegenConfig.getRetryConfig());
        this.prTracker = new PRTracker(this.config);
        
        // Request tracking
        this.activeRequests = new Map();
        this.requestHistory = [];
        
        log('info', `CodegenIntegrator initialized in ${this.codegenConfig.isMockMode() ? 'mock' : 'production'} mode`);
    }

    /**
     * Initialize the codegen integrator
     */
    async initialize() {
        log('debug', 'Initializing codegen integrator...');
        
        try {
            // Initialize the real Codegen client
            await this.codegenClient.initialize();
            
            // Test connection if not in mock mode
            if (!this.codegenConfig.isMockMode()) {
                const isConnected = await this.codegenClient.validateConnection();
                if (!isConnected) {
                    throw new Error('Failed to connect to Codegen API');
                }
                log('info', 'Real Codegen API connection established');
            } else {
                log('info', 'Using mock codegen integration');
            }
            
            log('debug', 'Codegen integrator initialized successfully');
            
        } catch (error) {
            log('error', `Failed to initialize codegen integrator: ${error.message}`);
            throw error;
        }
    }

    /**
     * Process task with codegen using real SDK
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
                request_id: requestId,
                started_at: new Date(),
                status: 'processing'
            });

            // Step 1: Optimize prompt for Codegen API
            const optimizedPrompt = await this.promptOptimizer.enhance(task, taskContext);
            log('debug', `Prompt optimized for task ${task.id}: ${optimizedPrompt.content.length} characters`);
            
            // Step 2: Execute real Codegen API call
            const codegenResponse = await this.codegenClient.sendCodegenRequest(optimizedPrompt, task.id);
            
            // Step 3: Parse response and extract PR info
            const prInfo = await this._parseCodegenResponse(codegenResponse);
            
            // Step 4: Track PR creation
            if (prInfo && this.codegenConfig.isFeatureEnabled('tracking')) {
                await this.prTracker.trackPRCreation(task.id, prInfo);
            }
            
            // Step 5: Compile comprehensive result
            const result = {
                request_id: requestId,
                task_id: task.id,
                status: codegenResponse.success ? 'completed' : 'failed',
                prompt: optimizedPrompt,
                codegen_response: codegenResponse,
                pr_info: prInfo,
                task_context: taskContext,
                metrics: {
                    prompt_length: optimizedPrompt.content.length,
                    processing_time_ms: Date.now() - this.activeRequests.get(requestId).started_at.getTime(),
                    api_response_time_ms: codegenResponse.response_time_ms,
                    optimization_level: optimizedPrompt.metadata.optimization_level,
                    complexity_score: optimizedPrompt.metadata.complexity
                },
                completed_at: new Date(),
                sdk_version: 'real', // Indicate this used real SDK
                environment: this.codegenConfig.environment
            };

            // Update request tracking
            this.activeRequests.get(requestId).status = 'completed';
            this.activeRequests.get(requestId).result = result;
            
            // Move to history
            this.requestHistory.push(this.activeRequests.get(requestId));
            this.activeRequests.delete(requestId);

            log('info', `Task ${task.id} processed successfully with real SDK (${result.status})`);
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
     * Generate optimized prompt for task
     * @param {Object} task - Task object
     * @param {Object} context - Task context
     * @returns {Promise<Object>} Generated prompt
     */
    async generatePrompt(task, context) {
        return await this.promptOptimizer.enhance(task, context);
    }

    /**
     * Send codegen request using real SDK
     * @param {Object} prompt - Generated prompt
     * @param {string} taskId - Task identifier
     * @returns {Promise<Object>} Codegen response
     */
    async sendCodegenRequest(prompt, taskId) {
        return await this.codegenClient.sendCodegenRequest(prompt, taskId);
    }

    /**
     * Validate connection to Codegen API
     * @returns {Promise<boolean>} Connection status
     */
    async validateConnection() {
        return await this.codegenClient.validateConnection();
    }

    /**
     * Track PR creation
     * @param {string} taskId - Task identifier
     * @param {Object} prInfo - PR information
     */
    async trackPRCreation(taskId, prInfo) {
        if (this.codegenConfig.isFeatureEnabled('tracking')) {
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
            pr_stats: await this.prTracker.getPRStatistics(),
            sdk_stats: await this.codegenClient.getHealth(),
            retry_stats: this.retryManager.getStatistics(),
            prompt_stats: this.promptOptimizer.getHealth()
        };
    }

    /**
     * Get health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        const stats = await this.getStatistics();
        const clientHealth = await this.codegenClient.getHealth();
        
        return {
            status: clientHealth.connected ? 'healthy' : 'unhealthy',
            mode: this.codegenConfig.isMockMode() ? 'mock' : 'production',
            environment: this.codegenConfig.environment,
            api_url: this.config.api_url,
            connected: clientHealth.connected,
            active_requests: stats.active_requests,
            success_rate: stats.success_rate,
            components: {
                prompt_optimizer: this.promptOptimizer.getHealth(),
                codegen_client: clientHealth,
                pr_tracker: this.prTracker.getHealth(),
                retry_manager: this.retryManager.getHealth(),
                config: this.codegenConfig.getHealth()
            }
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
            task_id: response.data.task_id
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

