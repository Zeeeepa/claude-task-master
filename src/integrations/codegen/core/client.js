/**
 * @fileoverview Unified Codegen Client
 * @description Consolidated Codegen API client from PRs #52, #86, #87
 */

import { EventEmitter } from 'events';
import { log } from '../../../utils/logger.js';

/**
 * Codegen API error
 */
export class CodegenAPIError extends Error {
    constructor(message, code = null, statusCode = null) {
        super(message);
        this.name = 'CodegenAPIError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

/**
 * Unified Codegen Client
 * Consolidates API communication patterns from multiple PRs
 */
export class CodegenClient extends EventEmitter {
    constructor(config = {}, dependencies = {}) {
        super();
        
        this.config = {
            baseUrl: config.baseUrl || 'https://api.codegen.sh',
            timeout: config.timeout || 30000,
            retries: config.retries || 3,
            version: config.version || 'v1',
            enableMock: config.enableMock || false,
            ...config
        };

        // Dependencies
        this.auth = dependencies.auth;
        this.rateLimiter = dependencies.rateLimiter;
        this.errorHandler = dependencies.errorHandler;
        
        // State
        this.isConnected = false;
        this.activeTasks = new Map();
        this.requestStats = {
            total: 0,
            successful: 0,
            failed: 0,
            averageResponseTime: 0
        };
        
        log('debug', 'Codegen Client initialized', {
            baseUrl: this.config.baseUrl,
            enableMock: this.config.enableMock,
            hasAuth: !!this.auth,
            hasRateLimiter: !!this.rateLimiter
        });
    }

    /**
     * Initialize the client
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            log('info', 'Initializing Codegen Client...');
            
            // Test connection if not in mock mode
            if (!this.config.enableMock) {
                await this._testConnection();
            }
            
            this.isConnected = true;
            this.emit('connected');
            
            log('info', 'Codegen Client initialized successfully');
            
        } catch (error) {
            log('error', 'Failed to initialize Codegen Client', { error: error.message });
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Create a PR from natural language description
     * @param {Object} request - PR creation request
     * @returns {Promise<Object>} PR creation result
     */
    async createPR(request) {
        const requestId = `req-${Date.now()}`;
        const startTime = Date.now();
        
        try {
            log('info', `Creating PR via Codegen API`, { requestId });
            
            // Validate request
            this._validatePRRequest(request);
            
            // Track active request
            this.activeTasks.set(requestId, {
                type: 'create_pr',
                startTime,
                status: 'processing'
            });

            this.emit('request:start', { requestId, type: 'create_pr' });

            // Apply rate limiting
            if (this.rateLimiter) {
                await this.rateLimiter.acquire();
            }

            // Prepare request payload
            const payload = this._preparePRPayload(request);
            
            // Make API request
            const response = await this._makeRequest('/pr/create', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            // Process response
            const result = await this._processPRResponse(response, requestId);
            
            // Update statistics
            const responseTime = Date.now() - startTime;
            this._updateRequestStats(true, responseTime);
            
            // Clean up
            this.activeTasks.delete(requestId);
            
            this.emit('request:complete', { 
                requestId, 
                type: 'create_pr', 
                responseTime,
                success: true 
            });
            
            log('info', `PR creation completed`, { 
                requestId, 
                responseTime,
                taskId: result.taskId 
            });

            return result;
            
        } catch (error) {
            const responseTime = Date.now() - startTime;
            this._updateRequestStats(false, responseTime);
            
            // Update active task status
            if (this.activeTasks.has(requestId)) {
                this.activeTasks.get(requestId).status = 'failed';
                this.activeTasks.get(requestId).error = error.message;
            }

            this.emit('request:complete', { 
                requestId, 
                type: 'create_pr', 
                responseTime,
                success: false,
                error: error.message 
            });
            
            log('error', `PR creation failed`, { 
                requestId, 
                error: error.message,
                responseTime 
            });

            // Handle error through error handler if available
            if (this.errorHandler) {
                const handledError = await this.errorHandler.handleError(error, {
                    requestId,
                    type: 'create_pr',
                    request
                });
                throw handledError;
            }

            throw error;
        }
    }

    /**
     * Get task status
     * @param {string} taskId - Task ID
     * @returns {Promise<Object>} Task status
     */
    async getTaskStatus(taskId) {
        try {
            log('debug', `Getting task status`, { taskId });
            
            if (this.config.enableMock) {
                return this._getMockTaskStatus(taskId);
            }

            const response = await this._makeRequest(`/tasks/${taskId}/status`);
            const data = await response.json();
            
            log('debug', `Task status retrieved`, { 
                taskId, 
                status: data.status 
            });
            
            return data;
            
        } catch (error) {
            log('error', `Failed to get task status`, { 
                taskId, 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * Cancel a task
     * @param {string} taskId - Task ID
     * @returns {Promise<Object>} Cancellation result
     */
    async cancelTask(taskId) {
        try {
            log('info', `Cancelling task`, { taskId });
            
            if (this.config.enableMock) {
                return { success: true, taskId, status: 'cancelled' };
            }

            const response = await this._makeRequest(`/tasks/${taskId}/cancel`, {
                method: 'POST'
            });
            
            const data = await response.json();
            
            log('info', `Task cancelled`, { taskId });
            
            return data;
            
        } catch (error) {
            log('error', `Failed to cancel task`, { 
                taskId, 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * Get client health status
     * @returns {Promise<Object>} Health status
     */
    async healthCheck() {
        try {
            if (this.config.enableMock) {
                return {
                    status: 'healthy',
                    message: 'Mock mode enabled'
                };
            }

            const response = await this._makeRequest('/health');
            const data = await response.json();
            
            return {
                status: 'healthy',
                ...data
            };
            
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message
            };
        }
    }

    /**
     * Get client statistics
     * @returns {Object} Client statistics
     */
    getStatistics() {
        return {
            ...this.requestStats,
            activeTasks: this.activeTasks.size,
            isConnected: this.isConnected,
            successRate: this.requestStats.total > 0 ? 
                (this.requestStats.successful / this.requestStats.total * 100).toFixed(2) + '%' : '0%'
        };
    }

    /**
     * Check if client is connected
     * @returns {boolean} Connection status
     */
    isConnected() {
        return this.isConnected;
    }

    /**
     * Shutdown the client
     * @returns {Promise<void>}
     */
    async shutdown() {
        try {
            log('info', 'Shutting down Codegen Client...');
            
            // Wait for active tasks to complete (with timeout)
            await this._waitForActiveTasks(30000);
            
            this.isConnected = false;
            this.emit('disconnected');
            
            log('info', 'Codegen Client shutdown completed');
            
        } catch (error) {
            log('error', 'Error during client shutdown', { error: error.message });
            throw error;
        }
    }

    /**
     * Test API connection
     * @returns {Promise<void>}
     * @private
     */
    async _testConnection() {
        try {
            log('debug', 'Testing API connection...');
            
            const response = await this._makeRequest('/health');
            
            if (!response.ok) {
                throw new CodegenAPIError(
                    `API connection test failed: ${response.status}`,
                    'CONNECTION_FAILED',
                    response.status
                );
            }
            
            log('debug', 'API connection test successful');
            
        } catch (error) {
            if (error instanceof CodegenAPIError) {
                throw error;
            }
            throw new CodegenAPIError(
                `Failed to connect to Codegen API: ${error.message}`,
                'CONNECTION_ERROR'
            );
        }
    }

    /**
     * Make HTTP request to API
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Request options
     * @returns {Promise<Response>} Response object
     * @private
     */
    async _makeRequest(endpoint, options = {}) {
        const url = `${this.config.baseUrl}/${this.config.version}${endpoint}`;
        
        const requestOptions = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'claude-task-master/2.0.0'
            },
            timeout: this.config.timeout,
            ...options
        };

        // Add authentication headers
        if (this.auth) {
            const authHeaders = this.auth.getAuthHeaders();
            requestOptions.headers = { ...requestOptions.headers, ...authHeaders };
        }

        let lastError;
        
        for (let attempt = 1; attempt <= this.config.retries; attempt++) {
            try {
                log('debug', `Making API request`, {
                    url,
                    method: requestOptions.method,
                    attempt
                });
                
                const response = await fetch(url, requestOptions);
                
                // Handle specific error codes
                if (response.status === 401) {
                    throw new CodegenAPIError(
                        'Authentication failed',
                        'AUTHENTICATION_FAILED',
                        401
                    );
                }
                
                if (response.status === 403) {
                    throw new CodegenAPIError(
                        'Insufficient permissions',
                        'INSUFFICIENT_PERMISSIONS',
                        403
                    );
                }
                
                if (response.status === 429) {
                    throw new CodegenAPIError(
                        'Rate limit exceeded',
                        'RATE_LIMIT_EXCEEDED',
                        429
                    );
                }
                
                if (response.status >= 500) {
                    throw new CodegenAPIError(
                        `Server error: ${response.status}`,
                        'SERVER_ERROR',
                        response.status
                    );
                }
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new CodegenAPIError(
                        errorData.message || `Request failed: ${response.status}`,
                        errorData.code || 'REQUEST_FAILED',
                        response.status
                    );
                }
                
                return response;
                
            } catch (error) {
                lastError = error;
                
                // Don't retry certain errors
                if (error.statusCode && [401, 403, 422].includes(error.statusCode)) {
                    break;
                }
                
                if (attempt < this.config.retries) {
                    const delay = 1000 * Math.pow(2, attempt - 1); // Exponential backoff
                    log('debug', `Request failed, retrying in ${delay}ms`, {
                        attempt,
                        error: error.message
                    });
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    log('error', 'Request failed after all retries', {
                        attempts: this.config.retries,
                        error: error.message
                    });
                }
            }
        }
        
        throw lastError;
    }

    /**
     * Validate PR creation request
     * @param {Object} request - Request to validate
     * @private
     */
    _validatePRRequest(request) {
        if (!request) {
            throw new CodegenAPIError('Request is required', 'INVALID_REQUEST');
        }

        if (!request.prompt || typeof request.prompt !== 'string') {
            throw new CodegenAPIError('Prompt is required and must be a string', 'INVALID_PROMPT');
        }

        if (request.prompt.length < 10) {
            throw new CodegenAPIError('Prompt must be at least 10 characters', 'PROMPT_TOO_SHORT');
        }

        if (request.prompt.length > 50000) {
            throw new CodegenAPIError('Prompt must be less than 50000 characters', 'PROMPT_TOO_LONG');
        }
    }

    /**
     * Prepare PR creation payload
     * @param {Object} request - Original request
     * @returns {Object} API payload
     * @private
     */
    _preparePRPayload(request) {
        return {
            prompt: request.prompt,
            context: request.context || '',
            metadata: {
                source: 'claude-task-master',
                version: '2.0.0',
                timestamp: new Date().toISOString(),
                ...request.metadata
            },
            options: {
                repository: request.metadata?.repository,
                baseBranch: request.metadata?.baseBranch || 'main',
                ...request.options
            }
        };
    }

    /**
     * Process PR creation response
     * @param {Response} response - API response
     * @param {string} requestId - Request ID
     * @returns {Promise<Object>} Processed result
     * @private
     */
    async _processPRResponse(response, requestId) {
        const data = await response.json();
        
        return {
            success: true,
            requestId,
            taskId: data.task_id || data.id,
            status: data.status || 'pending',
            prUrl: data.pr_url,
            prNumber: data.pr_number,
            repository: data.repository,
            branch: data.branch,
            estimatedCompletion: data.estimated_completion,
            metadata: {
                apiVersion: this.config.version,
                responseTime: Date.now(),
                ...data.metadata
            }
        };
    }

    /**
     * Get mock task status
     * @param {string} taskId - Task ID
     * @returns {Object} Mock status
     * @private
     */
    _getMockTaskStatus(taskId) {
        const statuses = ['pending', 'processing', 'completed', 'failed'];
        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
        
        return {
            taskId,
            status: randomStatus,
            progress: randomStatus === 'processing' ? Math.floor(Math.random() * 100) : 
                     randomStatus === 'completed' ? 100 : 0,
            prUrl: randomStatus === 'completed' ? 
                   `https://github.com/example/repo/pull/${Math.floor(Math.random() * 1000)}` : null,
            updatedAt: new Date().toISOString(),
            mock: true
        };
    }

    /**
     * Update request statistics
     * @param {boolean} success - Success status
     * @param {number} responseTime - Response time in ms
     * @private
     */
    _updateRequestStats(success, responseTime) {
        this.requestStats.total++;
        
        if (success) {
            this.requestStats.successful++;
        } else {
            this.requestStats.failed++;
        }

        // Update average response time
        const totalTime = this.requestStats.averageResponseTime * 
            (this.requestStats.total - 1) + responseTime;
        this.requestStats.averageResponseTime = totalTime / this.requestStats.total;
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
            log('debug', `Waiting for ${this.activeTasks.size} active requests to complete...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (this.activeTasks.size > 0) {
            log('warn', `Forced shutdown with ${this.activeTasks.size} active requests remaining`);
        }
    }
}

