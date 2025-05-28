/**
 * @fileoverview Main codegen integration orchestrator
 * Coordinates prompt generation, API communication, and PR tracking
 */

import { PromptGenerator } from '../prompt_generation/prompt_generator.js';
import { CodegenClient } from './codegen_client.js';
import { PRTracker } from './pr_tracker.js';
import { CODEGEN_STATUS, TASK_TYPES } from './types.js';

/**
 * CodegenIntegration class - Main orchestrator for codegen workflow
 */
export class CodegenIntegration {
    constructor(options = {}) {
        this.options = {
            maxRetries: options.maxRetries || 3,
            retryDelay: options.retryDelay || 2000,
            enableTracking: options.enableTracking !== false,
            ...options
        };

        // Initialize components
        this.promptGenerator = new PromptGenerator(options.promptGenerator);
        this.codegenClient = new CodegenClient(options.codegenClient);
        this.prTracker = options.enableTracking ? new PRTracker(options.prTracker) : null;

        // Request tracking
        this.activeRequests = new Map();
        this.requestHistory = new Map();
    }

    /**
     * Generate a prompt from task and context
     * @param {AtomicTask} task - The task to generate a prompt for
     * @param {TaskContext} context - Task context information
     * @returns {CodegenPrompt} Generated prompt
     */
    generatePrompt(task, context) {
        try {
            const prompt = this.promptGenerator.generatePrompt(task, context);
            prompt.task_id = task.id;
            
            console.log(`Generated prompt for task ${task.id} (${task.type})`);
            return prompt;
        } catch (error) {
            console.error('Failed to generate prompt:', error);
            throw new Error(`Prompt generation failed: ${error.message}`);
        }
    }

    /**
     * Send a codegen request and track the response
     * @param {CodegenPrompt} prompt - The prompt to send
     * @returns {Promise<CodegenResponse>} Response from codegen API
     */
    async sendCodegenRequest(prompt) {
        const taskId = prompt.task_id;
        
        if (!taskId) {
            throw new Error('Task ID is required for codegen requests');
        }

        try {
            // Mark request as active
            this.activeRequests.set(taskId, {
                status: CODEGEN_STATUS.PENDING,
                started_at: new Date().toISOString(),
                prompt: prompt
            });

            console.log(`Sending codegen request for task ${taskId}`);
            
            const response = await this.codegenClient.sendCodegenRequest(prompt, taskId);
            
            // Update request status
            this.activeRequests.set(taskId, {
                status: response.status,
                started_at: this.activeRequests.get(taskId).started_at,
                completed_at: new Date().toISOString(),
                response: response
            });

            // Track PR if created successfully
            if (response.pr_info && this.prTracker) {
                await this.prTracker.trackPRCreation(taskId, response.pr_info);
            }

            // Move to history
            this.requestHistory.set(taskId, this.activeRequests.get(taskId));
            this.activeRequests.delete(taskId);

            console.log(`Codegen request completed for task ${taskId}: ${response.status}`);
            return response;
            
        } catch (error) {
            // Update request status with error
            this.activeRequests.set(taskId, {
                status: CODEGEN_STATUS.FAILED,
                started_at: this.activeRequests.get(taskId)?.started_at || new Date().toISOString(),
                completed_at: new Date().toISOString(),
                error: error.message
            });

            console.error(`Codegen request failed for task ${taskId}:`, error);
            throw error;
        }
    }

    /**
     * Track PR creation manually (for external PR creation)
     * @param {string} taskId - Task ID
     * @param {PRInfo} prInfo - PR information
     * @returns {Promise<void>}
     */
    async trackPRCreation(taskId, prInfo) {
        if (!this.prTracker) {
            console.warn('PR tracking is disabled');
            return;
        }

        try {
            await this.prTracker.trackPRCreation(taskId, prInfo);
            console.log(`Manually tracked PR ${prInfo.pr_number} for task ${taskId}`);
        } catch (error) {
            console.error('Failed to track PR creation:', error);
            throw error;
        }
    }

    /**
     * Get the status of a codegen request
     * @param {string} requestId - Request ID or task ID
     * @returns {Promise<CodegenStatus>} Current status
     */
    async getCodegenStatus(requestId) {
        // Check if it's an active request
        const activeRequest = this.activeRequests.get(requestId);
        if (activeRequest) {
            if (activeRequest.status === CODEGEN_STATUS.PENDING) {
                // Query the API for updated status
                try {
                    const status = await this.codegenClient.getCodegenStatus(activeRequest.response?.request_id);
                    return status;
                } catch (error) {
                    console.error('Failed to get status from API:', error);
                }
            }
            
            return {
                request_id: requestId,
                status: activeRequest.status,
                progress: activeRequest.status === CODEGEN_STATUS.COMPLETED ? 100 : 50,
                error_message: activeRequest.error || null,
                estimated_completion: null
            };
        }

        // Check request history
        const historicalRequest = this.requestHistory.get(requestId);
        if (historicalRequest) {
            return {
                request_id: requestId,
                status: historicalRequest.status,
                progress: 100,
                error_message: historicalRequest.error || null,
                estimated_completion: null
            };
        }

        throw new Error(`Request not found: ${requestId}`);
    }

    /**
     * Retry a failed codegen request
     * @param {string} requestId - Request ID or task ID
     * @param {number} maxRetries - Maximum retry attempts
     * @returns {Promise<CodegenResponse>} Response from retry
     */
    async retryFailedRequest(requestId, maxRetries = null) {
        const retries = maxRetries || this.options.maxRetries;
        
        // Get the original request
        const request = this.activeRequests.get(requestId) || this.requestHistory.get(requestId);
        if (!request) {
            throw new Error(`Request not found: ${requestId}`);
        }

        if (request.status !== CODEGEN_STATUS.FAILED) {
            throw new Error(`Request ${requestId} is not in failed state`);
        }

        console.log(`Retrying failed request ${requestId} (max retries: ${retries})`);

        // If we have the original prompt, resend it
        if (request.prompt) {
            return await this.sendCodegenRequest(request.prompt);
        }

        // Otherwise, try to retry via API
        try {
            const response = await this.codegenClient.retryFailedRequest(requestId, retries);
            
            // Update tracking
            if (response.pr_info && this.prTracker) {
                await this.prTracker.trackPRCreation(requestId, response.pr_info);
            }

            return response;
        } catch (error) {
            console.error(`Retry failed for request ${requestId}:`, error);
            throw error;
        }
    }

    /**
     * Get PR status for a task
     * @param {string} taskId - Task ID
     * @returns {Promise<PRStatus|null>} PR status or null
     */
    async getPRStatus(taskId) {
        if (!this.prTracker) {
            console.warn('PR tracking is disabled');
            return null;
        }

        try {
            return await this.prTracker.getPRStatus(taskId);
        } catch (error) {
            console.error('Failed to get PR status:', error);
            return null;
        }
    }

    /**
     * Process a complete task workflow
     * @param {AtomicTask} task - Task to process
     * @param {TaskContext} context - Task context
     * @returns {Promise<Object>} Workflow result
     */
    async processTask(task, context) {
        const workflowId = `workflow_${task.id}_${Date.now()}`;
        
        console.log(`Starting workflow ${workflowId} for task ${task.id}`);

        try {
            // Step 1: Generate prompt
            const prompt = this.generatePrompt(task, context);
            
            // Step 2: Send to codegen
            const response = await this.sendCodegenRequest(prompt);
            
            // Step 3: Return workflow result
            const result = {
                workflow_id: workflowId,
                task_id: task.id,
                status: response.status,
                pr_info: response.pr_info,
                error_message: response.error_message,
                completed_at: new Date().toISOString()
            };

            console.log(`Workflow ${workflowId} completed with status: ${response.status}`);
            return result;
            
        } catch (error) {
            console.error(`Workflow ${workflowId} failed:`, error);
            
            return {
                workflow_id: workflowId,
                task_id: task.id,
                status: CODEGEN_STATUS.FAILED,
                pr_info: null,
                error_message: error.message,
                completed_at: new Date().toISOString()
            };
        }
    }

    /**
     * Get integration statistics
     * @returns {Promise<Object>} Integration statistics
     */
    async getStatistics() {
        const stats = {
            active_requests: this.activeRequests.size,
            completed_requests: this.requestHistory.size,
            success_rate: 0,
            pr_stats: null
        };

        // Calculate success rate
        const completed = Array.from(this.requestHistory.values());
        if (completed.length > 0) {
            const successful = completed.filter(req => req.status === CODEGEN_STATUS.COMPLETED).length;
            stats.success_rate = (successful / completed.length) * 100;
        }

        // Get PR statistics if tracking is enabled
        if (this.prTracker) {
            try {
                stats.pr_stats = await this.prTracker.getPRStatistics();
            } catch (error) {
                console.error('Failed to get PR statistics:', error);
            }
        }

        return stats;
    }

    /**
     * Clean up old data and requests
     * @param {number} daysOld - Remove data older than this many days
     * @returns {Promise<Object>} Cleanup results
     */
    async cleanup(daysOld = 7) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);
        
        let cleanedRequests = 0;
        
        // Clean up request history
        for (const [requestId, request] of this.requestHistory.entries()) {
            const completedAt = new Date(request.completed_at);
            if (completedAt < cutoffDate) {
                this.requestHistory.delete(requestId);
                cleanedRequests++;
            }
        }

        // Clean up PR tracking data
        let cleanedPRs = 0;
        if (this.prTracker) {
            cleanedPRs = await this.prTracker.cleanupOldData(daysOld);
        }

        console.log(`Cleanup completed: ${cleanedRequests} requests, ${cleanedPRs} PR records`);
        
        return {
            cleaned_requests: cleanedRequests,
            cleaned_prs: cleanedPRs,
            cleanup_date: new Date().toISOString()
        };
    }
}

/**
 * Create a new codegen integration instance
 * @param {Object} options - Configuration options
 * @returns {CodegenIntegration} New integration instance
 */
export function createCodegenIntegration(options = {}) {
    return new CodegenIntegration(options);
}

// Convenience functions for common operations

/**
 * Generate a task prompt
 * @param {AtomicTask} task - Task to generate prompt for
 * @param {TaskContext} context - Task context
 * @returns {CodegenPrompt} Generated prompt
 */
export function generateTaskPrompt(task, context) {
    const integration = new CodegenIntegration();
    return integration.generatePrompt(task, context);
}

/**
 * Send a prompt to codegen
 * @param {string} prompt - Prompt content
 * @param {string} taskId - Task ID
 * @returns {Promise<CodegenResponse>} Codegen response
 */
export async function sendToCodegen(prompt, taskId) {
    const integration = new CodegenIntegration();
    const codegenPrompt = {
        content: prompt,
        task_id: taskId,
        task_type: TASK_TYPES.IMPLEMENTATION,
        metadata: {
            generated_at: new Date().toISOString()
        }
    };
    
    return await integration.sendCodegenRequest(codegenPrompt);
}

/**
 * Parse codegen response and extract PR info
 * @param {CodegenResponse} response - Codegen response
 * @returns {PRInfo|null} Extracted PR information
 */
export function parseCodegenResponse(response) {
    return response.pr_info || null;
}

/**
 * Track PR creation
 * @param {string} taskId - Task ID
 * @param {string} prUrl - PR URL
 * @param {number} prNumber - PR number
 * @returns {Promise<void>}
 */
export async function trackPRCreation(taskId, prUrl, prNumber) {
    const integration = new CodegenIntegration();
    const prInfo = {
        pr_url: prUrl,
        pr_number: prNumber,
        branch_name: `task-${taskId}`,
        title: `Task ${taskId} implementation`,
        description: `Auto-generated PR for task ${taskId}`,
        modified_files: [],
        status: 'open'
    };
    
    await integration.trackPRCreation(taskId, prInfo);
}

export default CodegenIntegration;

