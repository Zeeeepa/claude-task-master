/**
 * @fileoverview Production Codegen SDK Client
 * @description Real Codegen SDK integration with comprehensive error handling and rate limiting
 */

import axios from 'axios';
import { log } from '../../scripts/modules/utils.js';

/**
 * Production Codegen SDK Client
 * Provides HTTP-based interface to Codegen services
 */
export class CodegenClient {
    constructor(config = {}) {
        this.config = {
            apiKey: config.apiKey || process.env.CODEGEN_API_KEY,
            baseUrl: config.baseUrl || process.env.CODEGEN_BASE_URL || 'https://api.codegen.com',
            timeout: config.timeout || 30000,
            retries: config.retries || 3,
            rateLimit: {
                requests: config.rateLimit?.requests || 100,
                window: config.rateLimit?.window || 60000 // 1 minute
            },
            ...config
        };

        // Validate required configuration
        if (!this.config.apiKey) {
            throw new CodegenError('API key is required for Codegen client');
        }

        // Initialize HTTP client
        this.httpClient = axios.create({
            baseURL: this.config.baseUrl,
            timeout: this.config.timeout,
            headers: {
                'Authorization': `Bearer ${this.config.apiKey}`,
                'Content-Type': 'application/json',
                'User-Agent': 'claude-task-master/1.0.0'
            }
        });

        // Request tracking for rate limiting
        this.requestHistory = [];
        this.activeRequests = new Map();

        // Setup request/response interceptors
        this._setupInterceptors();

        log('info', 'Codegen client initialized');
    }

    /**
     * Setup HTTP interceptors for logging and error handling
     * @private
     */
    _setupInterceptors() {
        // Request interceptor
        this.httpClient.interceptors.request.use(
            (config) => {
                const requestId = this._generateRequestId();
                config.metadata = { requestId, startTime: Date.now() };
                
                log('debug', `Codegen API request: ${config.method?.toUpperCase()} ${config.url}`, {
                    requestId,
                    headers: this._sanitizeHeaders(config.headers)
                });

                return config;
            },
            (error) => {
                log('error', 'Codegen API request error', { error: error.message });
                return Promise.reject(error);
            }
        );

        // Response interceptor
        this.httpClient.interceptors.response.use(
            (response) => {
                const { requestId, startTime } = response.config.metadata || {};
                const duration = Date.now() - startTime;

                log('debug', `Codegen API response: ${response.status}`, {
                    requestId,
                    duration,
                    status: response.status
                });

                return response;
            },
            (error) => {
                const { requestId, startTime } = error.config?.metadata || {};
                const duration = startTime ? Date.now() - startTime : 0;

                log('error', 'Codegen API error', {
                    requestId,
                    duration,
                    status: error.response?.status,
                    message: error.message
                });

                return Promise.reject(this._handleApiError(error));
            }
        );
    }

    /**
     * Create a new code generation task
     * @param {Object} taskData - Task configuration
     * @returns {Promise<CodegenTask>} Created task
     */
    async createTask(taskData) {
        await this._checkRateLimit();

        try {
            const response = await this.httpClient.post('/v1/tasks', {
                prompt: taskData.prompt,
                context: taskData.context,
                repository: taskData.repository,
                branch: taskData.branch,
                options: taskData.options || {}
            });

            return new CodegenTask(response.data, this);
        } catch (error) {
            throw this._enhanceError(error, 'Failed to create Codegen task');
        }
    }

    /**
     * Get task status and results
     * @param {string} taskId - Task identifier
     * @returns {Promise<Object>} Task status and results
     */
    async getTask(taskId) {
        await this._checkRateLimit();

        try {
            const response = await this.httpClient.get(`/v1/tasks/${taskId}`);
            return response.data;
        } catch (error) {
            throw this._enhanceError(error, `Failed to get task ${taskId}`);
        }
    }

    /**
     * Cancel a running task
     * @param {string} taskId - Task identifier
     * @returns {Promise<boolean>} Success status
     */
    async cancelTask(taskId) {
        await this._checkRateLimit();

        try {
            await this.httpClient.delete(`/v1/tasks/${taskId}`);
            return true;
        } catch (error) {
            throw this._enhanceError(error, `Failed to cancel task ${taskId}`);
        }
    }

    /**
     * Validate API connection and credentials
     * @returns {Promise<Object>} Health status
     */
    async validateConnection() {
        try {
            const response = await this.httpClient.get('/v1/health');
            return {
                status: 'healthy',
                data: response.data,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Get API usage statistics
     * @returns {Promise<Object>} Usage statistics
     */
    async getUsageStats() {
        await this._checkRateLimit();

        try {
            const response = await this.httpClient.get('/v1/usage');
            return response.data;
        } catch (error) {
            throw this._enhanceError(error, 'Failed to get usage statistics');
        }
    }

    /**
     * Check rate limiting before making requests
     * @private
     */
    async _checkRateLimit() {
        const now = Date.now();
        const windowStart = now - this.config.rateLimit.window;

        // Clean old requests
        this.requestHistory = this.requestHistory.filter(time => time > windowStart);

        // Check if we're at the limit
        if (this.requestHistory.length >= this.config.rateLimit.requests) {
            const oldestRequest = Math.min(...this.requestHistory);
            const waitTime = oldestRequest + this.config.rateLimit.window - now;
            
            if (waitTime > 0) {
                log('warn', `Rate limit reached, waiting ${waitTime}ms`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }

        // Record this request
        this.requestHistory.push(now);
    }

    /**
     * Handle API errors with enhanced context
     * @private
     */
    _handleApiError(error) {
        if (error.response) {
            const { status, data } = error.response;
            
            switch (status) {
                case 401:
                    return new CodegenError('Authentication failed - invalid API key', 'AUTHENTICATION_ERROR', error);
                case 403:
                    return new CodegenError('Access forbidden - insufficient permissions', 'AUTHORIZATION_ERROR', error);
                case 429:
                    return new CodegenError('Rate limit exceeded', 'RATE_LIMIT_ERROR', error);
                case 500:
                case 502:
                case 503:
                case 504:
                    return new CodegenError('Codegen service unavailable', 'SERVICE_ERROR', error);
                default:
                    return new CodegenError(data?.message || 'API request failed', 'API_ERROR', error);
            }
        } else if (error.code === 'ECONNREFUSED') {
            return new CodegenError('Cannot connect to Codegen service', 'CONNECTION_ERROR', error);
        } else if (error.code === 'ETIMEDOUT') {
            return new CodegenError('Request timeout', 'TIMEOUT_ERROR', error);
        } else {
            return new CodegenError(error.message || 'Unknown error', 'UNKNOWN_ERROR', error);
        }
    }

    /**
     * Enhance error with additional context
     * @private
     */
    _enhanceError(error, context) {
        if (error instanceof CodegenError) {
            error.context = context;
            return error;
        }
        return new CodegenError(`${context}: ${error.message}`, 'ENHANCED_ERROR', error);
    }

    /**
     * Generate unique request ID
     * @private
     */
    _generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Sanitize headers for logging (remove sensitive data)
     * @private
     */
    _sanitizeHeaders(headers) {
        const sanitized = { ...headers };
        if (sanitized.Authorization) {
            sanitized.Authorization = 'Bearer [REDACTED]';
        }
        return sanitized;
    }

    /**
     * Cleanup resources
     */
    async shutdown() {
        // Cancel any active requests
        for (const [requestId, cancelToken] of this.activeRequests) {
            try {
                cancelToken.cancel(`Shutdown requested for ${requestId}`);
            } catch (error) {
                log('warn', `Failed to cancel request ${requestId}:`, error.message);
            }
        }
        
        this.activeRequests.clear();
        this.requestHistory = [];
        
        log('info', 'Codegen client shutdown complete');
    }
}

/**
 * Represents a Codegen task with status tracking
 */
export class CodegenTask {
    constructor(taskData, client) {
        this.id = taskData.id;
        this.status = taskData.status;
        this.prompt = taskData.prompt;
        this.context = taskData.context;
        this.repository = taskData.repository;
        this.branch = taskData.branch;
        this.createdAt = new Date(taskData.created_at);
        this.updatedAt = new Date(taskData.updated_at);
        this.result = taskData.result;
        this.error = taskData.error;
        this.metadata = taskData.metadata || {};
        
        this._client = client;
    }

    /**
     * Refresh task status from server
     * @returns {Promise<void>}
     */
    async refresh() {
        try {
            const taskData = await this._client.getTask(this.id);
            
            // Update properties
            this.status = taskData.status;
            this.updatedAt = new Date(taskData.updated_at);
            this.result = taskData.result;
            this.error = taskData.error;
            this.metadata = taskData.metadata || {};
            
            log('debug', `Task ${this.id} refreshed, status: ${this.status}`);
        } catch (error) {
            log('error', `Failed to refresh task ${this.id}:`, error.message);
            throw error;
        }
    }

    /**
     * Wait for task completion
     * @param {Object} options - Wait options
     * @returns {Promise<Object>} Final result
     */
    async waitForCompletion(options = {}) {
        const {
            pollInterval = 5000,
            maxWaitTime = 300000, // 5 minutes
            onProgress = null
        } = options;

        const startTime = Date.now();
        
        while (this.status === 'pending' || this.status === 'running') {
            // Check timeout
            if (Date.now() - startTime > maxWaitTime) {
                throw new CodegenError(`Task ${this.id} timed out after ${maxWaitTime}ms`, 'TIMEOUT_ERROR');
            }

            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            
            // Refresh status
            await this.refresh();
            
            // Call progress callback if provided
            if (onProgress) {
                onProgress(this);
            }
        }

        if (this.status === 'failed') {
            throw new CodegenError(`Task ${this.id} failed: ${this.error}`, 'TASK_FAILED');
        }

        return this.result;
    }

    /**
     * Cancel this task
     * @returns {Promise<boolean>}
     */
    async cancel() {
        return await this._client.cancelTask(this.id);
    }

    /**
     * Get task summary
     * @returns {Object} Task summary
     */
    toSummary() {
        return {
            id: this.id,
            status: this.status,
            repository: this.repository,
            branch: this.branch,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            hasResult: !!this.result,
            hasError: !!this.error
        };
    }
}

/**
 * Custom error class for Codegen operations
 */
export class CodegenError extends Error {
    constructor(message, code = 'CODEGEN_ERROR', originalError = null) {
        super(message);
        this.name = 'CodegenError';
        this.code = code;
        this.originalError = originalError;
        this.timestamp = new Date().toISOString();
        
        // Maintain proper stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, CodegenError);
        }
    }

    /**
     * Check if error is retryable
     * @returns {boolean}
     */
    isRetryable() {
        const retryableCodes = [
            'TIMEOUT_ERROR',
            'CONNECTION_ERROR',
            'SERVICE_ERROR',
            'RATE_LIMIT_ERROR'
        ];
        return retryableCodes.includes(this.code);
    }

    /**
     * Get error details for logging
     * @returns {Object}
     */
    toLogObject() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            timestamp: this.timestamp,
            context: this.context,
            originalError: this.originalError?.message
        };
    }
}

/**
 * Rate limiter for Codegen API requests
 */
export class RateLimiter {
    constructor(config = {}) {
        this.requests = config.requests || 100;
        this.window = config.window || 60000; // 1 minute
        this.requestHistory = [];
    }

    /**
     * Check if request is allowed
     * @returns {Promise<boolean>}
     */
    async checkLimit() {
        const now = Date.now();
        const windowStart = now - this.window;

        // Clean old requests
        this.requestHistory = this.requestHistory.filter(time => time > windowStart);

        // Check if we're at the limit
        if (this.requestHistory.length >= this.requests) {
            const oldestRequest = Math.min(...this.requestHistory);
            const waitTime = oldestRequest + this.window - now;
            
            if (waitTime > 0) {
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }

        // Record this request
        this.requestHistory.push(now);
        return true;
    }

    /**
     * Get current usage statistics
     * @returns {Object}
     */
    getUsage() {
        const now = Date.now();
        const windowStart = now - this.window;
        const recentRequests = this.requestHistory.filter(time => time > windowStart);

        return {
            requests: recentRequests.length,
            limit: this.requests,
            window: this.window,
            remaining: Math.max(0, this.requests - recentRequests.length),
            resetTime: recentRequests.length > 0 ? Math.min(...recentRequests) + this.window : now
        };
    }
}

export default CodegenClient;

