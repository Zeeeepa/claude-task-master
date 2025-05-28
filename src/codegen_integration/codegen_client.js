/**
 * @fileoverview Codegen API client for PR creation and management
 * Handles communication with codegen API, response parsing, and error handling
 */

import { CODEGEN_STATUS } from './types.js';

/**
 * CodegenClient class for interacting with the codegen API
 */
export class CodegenClient {
    constructor(options = {}) {
        this.options = {
            apiUrl: options.apiUrl || process.env.CODEGEN_API_URL || 'https://api.codegen.sh',
            apiKey: options.apiKey || process.env.CODEGEN_API_KEY,
            timeout: options.timeout || 30000,
            retryAttempts: options.retryAttempts || 3,
            retryDelay: options.retryDelay || 1000,
            ...options
        };

        if (!this.options.apiKey) {
            console.warn('Codegen API key not provided. Using mock mode.');
            this.mockMode = true;
        }
    }

    /**
     * Send a codegen request to create a PR
     * @param {CodegenPrompt} prompt - The prompt to send
     * @param {string} taskId - Associated task ID
     * @returns {Promise<CodegenResponse>} Response from codegen API
     */
    async sendCodegenRequest(prompt, taskId) {
        if (this.mockMode) {
            return this._createMockResponse(prompt, taskId);
        }

        const requestPayload = {
            prompt: prompt.content,
            task_id: taskId,
            task_type: prompt.task_type,
            metadata: prompt.metadata,
            options: {
                create_pr: true,
                include_tests: true,
                follow_standards: true
            }
        };

        try {
            const response = await this._makeRequest('/api/v1/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.options.apiKey}`,
                    'X-Client-Version': '1.0.0'
                },
                body: JSON.stringify(requestPayload)
            });

            return this._parseCodegenResponse(response);
        } catch (error) {
            return this._createErrorResponse(error, taskId);
        }
    }

    /**
     * Get the status of a codegen request
     * @param {string} requestId - The request ID to check
     * @returns {Promise<CodegenStatus>} Current status of the request
     */
    async getCodegenStatus(requestId) {
        if (this.mockMode) {
            return this._createMockStatus(requestId);
        }

        try {
            const response = await this._makeRequest(`/api/v1/status/${requestId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.options.apiKey}`
                }
            });

            return response;
        } catch (error) {
            return {
                request_id: requestId,
                status: CODEGEN_STATUS.FAILED,
                progress: 0,
                error_message: error.message,
                estimated_completion: null
            };
        }
    }

    /**
     * Retry a failed codegen request
     * @param {string} requestId - The request ID to retry
     * @param {number} maxRetries - Maximum number of retry attempts
     * @returns {Promise<CodegenResponse>} Response from retry attempt
     */
    async retryFailedRequest(requestId, maxRetries = 3) {
        if (this.mockMode) {
            return this._createMockRetryResponse(requestId);
        }

        try {
            const response = await this._makeRequest(`/api/v1/retry/${requestId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.options.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ max_retries: maxRetries })
            });

            return this._parseCodegenResponse(response);
        } catch (error) {
            return this._createErrorResponse(error, requestId);
        }
    }

    /**
     * Cancel a pending codegen request
     * @param {string} requestId - The request ID to cancel
     * @returns {Promise<boolean>} Whether cancellation was successful
     */
    async cancelRequest(requestId) {
        if (this.mockMode) {
            return true;
        }

        try {
            await this._makeRequest(`/api/v1/cancel/${requestId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.options.apiKey}`
                }
            });
            return true;
        } catch (error) {
            console.error('Failed to cancel request:', error);
            return false;
        }
    }

    /**
     * Get usage statistics and quotas
     * @returns {Promise<Object>} Usage statistics
     */
    async getUsageStats() {
        if (this.mockMode) {
            return {
                requests_made: 42,
                requests_remaining: 958,
                quota_reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            };
        }

        try {
            const response = await this._makeRequest('/api/v1/usage', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.options.apiKey}`
                }
            });

            return response;
        } catch (error) {
            console.error('Failed to get usage stats:', error);
            return null;
        }
    }

    /**
     * Make an HTTP request with retry logic
     * @private
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Request options
     * @returns {Promise<Object>} Response data
     */
    async _makeRequest(endpoint, options) {
        const url = `${this.options.apiUrl}${endpoint}`;
        let lastError;

        for (let attempt = 1; attempt <= this.options.retryAttempts; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                return await response.json();
            } catch (error) {
                lastError = error;
                
                if (attempt < this.options.retryAttempts) {
                    await this._delay(this.options.retryDelay * attempt);
                }
            }
        }

        throw lastError;
    }

    /**
     * Parse codegen API response
     * @private
     * @param {Object} response - Raw API response
     * @returns {CodegenResponse} Parsed response
     */
    _parseCodegenResponse(response) {
        return {
            request_id: response.request_id || this._generateRequestId(),
            status: response.status || CODEGEN_STATUS.COMPLETED,
            pr_info: response.pr_info ? this._parsePRInfo(response.pr_info) : null,
            error_message: response.error_message || null,
            metadata: response.metadata || {},
            timestamp: Date.now()
        };
    }

    /**
     * Parse PR information from response
     * @private
     * @param {Object} prData - Raw PR data
     * @returns {PRInfo} Parsed PR information
     */
    _parsePRInfo(prData) {
        return {
            pr_url: prData.pr_url || prData.url,
            pr_number: prData.pr_number || prData.number,
            branch_name: prData.branch_name || prData.head?.ref,
            title: prData.title,
            description: prData.description || prData.body,
            modified_files: prData.modified_files || [],
            status: prData.status || 'open'
        };
    }

    /**
     * Create mock response for testing
     * @private
     * @param {CodegenPrompt} prompt - The prompt
     * @param {string} taskId - Task ID
     * @returns {CodegenResponse} Mock response
     */
    _createMockResponse(prompt, taskId) {
        const requestId = this._generateRequestId();
        const prNumber = Math.floor(Math.random() * 1000) + 1;
        
        return {
            request_id: requestId,
            status: CODEGEN_STATUS.COMPLETED,
            pr_info: {
                pr_url: `https://github.com/example/repo/pull/${prNumber}`,
                pr_number: prNumber,
                branch_name: `codegen/${taskId}-${Date.now()}`,
                title: `Implement: ${prompt.task_type} task`,
                description: `Auto-generated PR for task ${taskId}`,
                modified_files: ['src/example.js', 'tests/example.test.js'],
                status: 'open'
            },
            error_message: null,
            metadata: {
                mock_mode: true,
                generated_at: new Date().toISOString()
            },
            timestamp: Date.now()
        };
    }

    /**
     * Create mock status response
     * @private
     * @param {string} requestId - Request ID
     * @returns {CodegenStatus} Mock status
     */
    _createMockStatus(requestId) {
        return {
            request_id: requestId,
            status: CODEGEN_STATUS.COMPLETED,
            progress: 100,
            error_message: null,
            estimated_completion: Date.now()
        };
    }

    /**
     * Create mock retry response
     * @private
     * @param {string} requestId - Request ID
     * @returns {CodegenResponse} Mock retry response
     */
    _createMockRetryResponse(requestId) {
        return {
            request_id: requestId,
            status: CODEGEN_STATUS.PROCESSING,
            pr_info: null,
            error_message: null,
            metadata: {
                retry_attempt: true,
                mock_mode: true
            },
            timestamp: Date.now()
        };
    }

    /**
     * Create error response
     * @private
     * @param {Error} error - The error that occurred
     * @param {string} taskId - Task ID
     * @returns {CodegenResponse} Error response
     */
    _createErrorResponse(error, taskId) {
        return {
            request_id: this._generateRequestId(),
            status: CODEGEN_STATUS.FAILED,
            pr_info: null,
            error_message: error.message,
            metadata: {
                error_type: error.constructor.name,
                task_id: taskId
            },
            timestamp: Date.now()
        };
    }

    /**
     * Generate a unique request ID
     * @private
     * @returns {string} Unique request ID
     */
    _generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Delay execution for specified milliseconds
     * @private
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise<void>} Promise that resolves after delay
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Create a new codegen client instance
 * @param {Object} options - Configuration options
 * @returns {CodegenClient} New codegen client instance
 */
export function createCodegenClient(options = {}) {
    return new CodegenClient(options);
}

export default CodegenClient;

