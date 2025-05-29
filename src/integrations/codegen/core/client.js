/**
 * @fileoverview Codegen API Client
 * @description Core client for Codegen API communication with authentication and rate limiting
 */

import { EventEmitter } from 'events';
import { log } from '../../../utils/logger.js';

/**
 * Codegen API Client
 * Handles authentication, rate limiting, and API communication
 */
export class CodegenClient extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            apiKey: config.apiKey || process.env.CODEGEN_API_KEY,
            orgId: config.orgId || process.env.CODEGEN_ORG_ID,
            baseURL: config.baseURL || 'https://api.codegen.sh',
            timeout: config.timeout || 30000,
            retries: config.retries || 3,
            enableMock: config.enableMock || false,
            ...config
        };
        
        this.authenticated = false;
        this.rateLimiter = null;
        this.requestQueue = [];
        this.activeRequests = 0;
        this.maxConcurrentRequests = config.maxConcurrentRequests || 3;
        
        // Rate limiting state
        this.rateLimitState = {
            requests: 0,
            window: 60000, // 1 minute
            limit: config.requestsPerMinute || 60,
            resetTime: Date.now() + 60000
        };
        
        // Metrics
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTime: 0,
            rateLimitHits: 0,
            lastRequestAt: null
        };
        
        log('debug', 'Codegen client initialized', {
            baseURL: this.config.baseURL,
            enableMock: this.config.enableMock,
            timeout: this.config.timeout
        });
    }

    /**
     * Initialize the client
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            log('info', 'Initializing Codegen client...');
            
            if (this.config.enableMock) {
                log('info', 'Mock mode enabled - skipping authentication');
                this.authenticated = true;
                return;
            }
            
            // Validate configuration
            this._validateConfig();
            
            // Authenticate with API
            await this._authenticate();
            
            // Start rate limiter
            this._startRateLimiter();
            
            this.emit('initialized');
            log('info', 'Codegen client initialized successfully');
            
        } catch (error) {
            log('error', 'Failed to initialize Codegen client', { error: error.message });
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
        try {
            log('info', 'Creating PR via Codegen API', {
                repository: request.repository,
                hasDescription: !!request.description
            });
            
            const startTime = Date.now();
            
            if (this.config.enableMock) {
                return this._mockCreatePR(request);
            }
            
            const response = await this._makeRequest('POST', '/v1/prs', {
                description: request.description,
                repository: request.repository,
                context: request.context || {},
                options: request.options || {}
            });
            
            const responseTime = Date.now() - startTime;
            this._updateMetrics(true, responseTime);
            
            log('info', 'PR created successfully', {
                taskId: response.taskId,
                repository: request.repository,
                responseTime
            });
            
            return {
                success: true,
                taskId: response.taskId,
                status: response.status,
                repository: request.repository,
                description: request.description,
                metadata: {
                    createdAt: new Date().toISOString(),
                    responseTime,
                    tokensUsed: response.tokensUsed
                }
            };
            
        } catch (error) {
            this._updateMetrics(false);
            log('error', 'Failed to create PR', { error: error.message });
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
            if (this.config.enableMock) {
                return this._mockGetTaskStatus(taskId);
            }
            
            const response = await this._makeRequest('GET', `/v1/tasks/${taskId}`);
            
            return {
                taskId,
                status: response.status,
                progress: response.progress || 0,
                result: response.result,
                error: response.error,
                metadata: response.metadata
            };
            
        } catch (error) {
            log('error', 'Failed to get task status', { taskId, error: error.message });
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
            if (this.config.enableMock) {
                return { success: true, taskId, status: 'cancelled' };
            }
            
            const response = await this._makeRequest('DELETE', `/v1/tasks/${taskId}`);
            
            return {
                success: true,
                taskId,
                status: response.status
            };
            
        } catch (error) {
            log('error', 'Failed to cancel task', { taskId, error: error.message });
            throw error;
        }
    }

    /**
     * Get client health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        try {
            if (this.config.enableMock) {
                return { healthy: true, authenticated: true, mock: true };
            }
            
            const response = await this._makeRequest('GET', '/v1/health');
            
            return {
                healthy: response.status === 'healthy',
                authenticated: this.authenticated,
                quota: response.quota,
                rateLimits: response.rateLimits
            };
            
        } catch (error) {
            return {
                healthy: false,
                authenticated: this.authenticated,
                error: error.message
            };
        }
    }

    /**
     * Get client status
     * @returns {Object} Client status
     */
    getStatus() {
        return {
            authenticated: this.authenticated,
            healthy: this.authenticated,
            activeRequests: this.activeRequests,
            queuedRequests: this.requestQueue.length,
            rateLimitState: this.rateLimitState,
            metrics: this.metrics,
            config: {
                baseURL: this.config.baseURL,
                enableMock: this.config.enableMock,
                timeout: this.config.timeout
            }
        };
    }

    /**
     * Shutdown the client
     * @returns {Promise<void>}
     */
    async shutdown() {
        try {
            log('info', 'Shutting down Codegen client...');
            
            // Clear rate limiter
            if (this.rateLimiter) {
                clearInterval(this.rateLimiter);
                this.rateLimiter = null;
            }
            
            // Wait for active requests to complete
            while (this.activeRequests > 0) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            this.authenticated = false;
            this.emit('shutdown');
            
            log('info', 'Codegen client shutdown completed');
            
        } catch (error) {
            log('error', 'Error during client shutdown', { error: error.message });
            throw error;
        }
    }

    /**
     * Validate configuration
     * @private
     */
    _validateConfig() {
        if (!this.config.apiKey) {
            throw new Error('Codegen API key is required');
        }
        
        if (!this.config.orgId) {
            throw new Error('Codegen organization ID is required');
        }
        
        if (!this.config.baseURL) {
            throw new Error('Codegen API base URL is required');
        }
    }

    /**
     * Authenticate with Codegen API
     * @private
     */
    async _authenticate() {
        try {
            const response = await fetch(`${this.config.baseURL}/v1/auth/validate`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'X-Org-ID': this.config.orgId,
                    'Content-Type': 'application/json'
                },
                timeout: this.config.timeout
            });

            if (!response.ok) {
                throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            this.authenticated = true;
            
            log('info', 'Authentication successful', {
                orgId: this.config.orgId,
                quotaRemaining: data.quota_remaining
            });
            
        } catch (error) {
            throw new Error(`Authentication failed: ${error.message}`);
        }
    }

    /**
     * Make authenticated API request
     * @param {string} method - HTTP method
     * @param {string} path - API path
     * @param {Object} data - Request data
     * @returns {Promise<Object>} Response data
     * @private
     */
    async _makeRequest(method, path, data = null) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ method, path, data, resolve, reject });
            this._processQueue();
        });
    }

    /**
     * Process request queue with rate limiting
     * @private
     */
    async _processQueue() {
        if (this.requestQueue.length === 0 || this.activeRequests >= this.maxConcurrentRequests) {
            return;
        }
        
        // Check rate limit
        if (!this._checkRateLimit()) {
            return;
        }
        
        const request = this.requestQueue.shift();
        this.activeRequests++;
        
        try {
            const result = await this._executeRequest(request.method, request.path, request.data);
            request.resolve(result);
        } catch (error) {
            request.reject(error);
        } finally {
            this.activeRequests--;
            // Process next request
            setTimeout(() => this._processQueue(), 100);
        }
    }

    /**
     * Execute HTTP request
     * @param {string} method - HTTP method
     * @param {string} path - API path
     * @param {Object} data - Request data
     * @returns {Promise<Object>} Response data
     * @private
     */
    async _executeRequest(method, path, data) {
        const url = `${this.config.baseURL}${path}`;
        const options = {
            method,
            headers: {
                'Authorization': `Bearer ${this.config.apiKey}`,
                'X-Org-ID': this.config.orgId,
                'Content-Type': 'application/json',
                'User-Agent': 'claude-task-master/1.0.0'
            },
            timeout: this.config.timeout
        };
        
        if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            options.body = JSON.stringify(data);
        }
        
        const response = await fetch(url, options);
        
        if (!response.ok) {
            if (response.status === 429) {
                this.metrics.rateLimitHits++;
                throw new Error('Rate limit exceeded');
            }
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }
        
        return await response.json();
    }

    /**
     * Check rate limit
     * @returns {boolean} Whether request is allowed
     * @private
     */
    _checkRateLimit() {
        const now = Date.now();
        
        // Reset window if needed
        if (now >= this.rateLimitState.resetTime) {
            this.rateLimitState.requests = 0;
            this.rateLimitState.resetTime = now + this.rateLimitState.window;
        }
        
        // Check if under limit
        if (this.rateLimitState.requests >= this.rateLimitState.limit) {
            return false;
        }
        
        this.rateLimitState.requests++;
        return true;
    }

    /**
     * Start rate limiter
     * @private
     */
    _startRateLimiter() {
        this.rateLimiter = setInterval(() => {
            this._processQueue();
        }, 1000);
    }

    /**
     * Update metrics
     * @param {boolean} success - Request success
     * @param {number} responseTime - Response time
     * @private
     */
    _updateMetrics(success, responseTime = 0) {
        this.metrics.totalRequests++;
        
        if (success) {
            this.metrics.successfulRequests++;
            
            // Update average response time
            const totalTime = this.metrics.averageResponseTime * (this.metrics.successfulRequests - 1) + responseTime;
            this.metrics.averageResponseTime = totalTime / this.metrics.successfulRequests;
        } else {
            this.metrics.failedRequests++;
        }
        
        this.metrics.lastRequestAt = new Date().toISOString();
    }

    /**
     * Mock PR creation for testing
     * @param {Object} request - PR request
     * @returns {Object} Mock response
     * @private
     */
    _mockCreatePR(request) {
        const taskId = `mock-task-${Date.now()}`;
        
        log('debug', 'Mock PR creation', { taskId, repository: request.repository });
        
        return {
            success: true,
            taskId,
            status: 'completed',
            repository: request.repository,
            description: request.description,
            prUrl: `https://github.com/${request.repository}/pull/123`,
            prNumber: 123,
            metadata: {
                createdAt: new Date().toISOString(),
                responseTime: 1000,
                tokensUsed: 500,
                mock: true
            }
        };
    }

    /**
     * Mock task status for testing
     * @param {string} taskId - Task ID
     * @returns {Object} Mock status
     * @private
     */
    _mockGetTaskStatus(taskId) {
        return {
            taskId,
            status: 'completed',
            progress: 100,
            result: {
                prUrl: `https://github.com/mock-org/mock-repo/pull/123`,
                prNumber: 123,
                branch: 'codegen/mock-feature'
            },
            metadata: {
                mock: true,
                completedAt: new Date().toISOString()
            }
        };
    }
}

export default CodegenClient;

