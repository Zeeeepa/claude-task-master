/**
 * @fileoverview Codegen Error Handler
 * @description Comprehensive error handling and recovery for Codegen API integration
 */

import { log } from '../../../scripts/modules/utils.js';
import { CodegenError } from './codegen_client.js';

/**
 * Codegen Error Handler with comprehensive error mapping and recovery strategies
 */
export class CodegenErrorHandler {
    constructor(config = {}) {
        this.config = {
            enableRetry: config.enableRetry !== false,
            maxRetries: config.maxRetries || 3,
            baseDelay: config.baseDelay || 1000,
            maxDelay: config.maxDelay || 30000,
            enableCircuitBreaker: config.enableCircuitBreaker !== false,
            circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
            circuitBreakerTimeout: config.circuitBreakerTimeout || 60000,
            ...config
        };
        
        this.circuitBreaker = new CircuitBreaker(this.config);
        this.errorStats = new ErrorStatistics();
    }

    /**
     * Handle and potentially recover from errors
     * @param {Error} error - Original error
     * @param {Object} context - Error context
     * @returns {Promise<Object>} Error handling result
     */
    async handleError(error, context = {}) {
        const errorInfo = this._analyzeError(error, context);
        
        // Record error for statistics
        this.errorStats.recordError(errorInfo);
        
        log('error', `Codegen error: ${errorInfo.type} - ${errorInfo.message}`, {
            code: errorInfo.code,
            retryable: errorInfo.retryable,
            context
        });

        // Check circuit breaker
        if (this.config.enableCircuitBreaker && this.circuitBreaker.isOpen()) {
            throw new CodegenError(
                'CIRCUIT_BREAKER_OPEN',
                'Circuit breaker is open due to repeated failures. Please try again later.'
            );
        }

        // Handle specific error types
        const handlingResult = await this._handleSpecificError(errorInfo, context);
        
        // Update circuit breaker
        if (this.config.enableCircuitBreaker) {
            if (handlingResult.success) {
                this.circuitBreaker.recordSuccess();
            } else {
                this.circuitBreaker.recordFailure();
            }
        }
        
        return handlingResult;
    }

    /**
     * Analyze error and extract relevant information
     * @param {Error} error - Original error
     * @param {Object} context - Error context
     * @returns {Object} Error analysis
     * @private
     */
    _analyzeError(error, context) {
        let errorType = 'UNKNOWN_ERROR';
        let errorCode = 'UNKNOWN';
        let retryable = false;
        let delay = this.config.baseDelay;
        let userMessage = error.message;

        // Handle CodegenError instances
        if (error instanceof CodegenError) {
            errorType = error.code;
            errorCode = error.code;
            retryable = error.isRetryable();
            userMessage = error.getUserMessage();
        }
        // Handle HTTP errors
        else if (error.response) {
            const status = error.response.status;
            const statusInfo = this._getHttpErrorInfo(status);
            errorType = statusInfo.type;
            errorCode = statusInfo.code;
            retryable = statusInfo.retryable;
            delay = statusInfo.delay;
            userMessage = statusInfo.message;
        }
        // Handle network errors
        else if (error.code === 'ECONNREFUSED' || error.code === 'ECONNABORTED') {
            errorType = 'NETWORK_ERROR';
            errorCode = 'CONNECTION_FAILED';
            retryable = true;
            delay = 5000;
            userMessage = 'Network connection failed. Please check your internet connection.';
        }
        // Handle timeout errors
        else if (error.code === 'ETIMEDOUT' || error.name === 'TimeoutError') {
            errorType = 'TIMEOUT_ERROR';
            errorCode = 'REQUEST_TIMEOUT';
            retryable = true;
            delay = 10000;
            userMessage = 'Request timed out. The service may be experiencing high load.';
        }
        // Handle JSON parsing errors
        else if (error instanceof SyntaxError && error.message.includes('JSON')) {
            errorType = 'PARSE_ERROR';
            errorCode = 'INVALID_RESPONSE';
            retryable = false;
            userMessage = 'Received invalid response from the API.';
        }

        return {
            type: errorType,
            code: errorCode,
            message: error.message,
            userMessage,
            retryable,
            delay,
            originalError: error,
            context,
            timestamp: new Date()
        };
    }

    /**
     * Get HTTP error information
     * @param {number} status - HTTP status code
     * @returns {Object} Error information
     * @private
     */
    _getHttpErrorInfo(status) {
        const errorMap = {
            400: {
                type: 'BAD_REQUEST',
                code: 'INVALID_REQUEST',
                retryable: false,
                delay: 0,
                message: 'Invalid request. Please check your parameters.'
            },
            401: {
                type: 'AUTHENTICATION_FAILED',
                code: 'INVALID_CREDENTIALS',
                retryable: false,
                delay: 0,
                message: 'Authentication failed. Please check your API key.'
            },
            403: {
                type: 'AUTHORIZATION_FAILED',
                code: 'ACCESS_DENIED',
                retryable: false,
                delay: 0,
                message: 'Access denied. Please check your permissions.'
            },
            404: {
                type: 'NOT_FOUND',
                code: 'RESOURCE_NOT_FOUND',
                retryable: false,
                delay: 0,
                message: 'Requested resource not found.'
            },
            408: {
                type: 'TIMEOUT_ERROR',
                code: 'REQUEST_TIMEOUT',
                retryable: true,
                delay: 10000,
                message: 'Request timed out. Please try again.'
            },
            429: {
                type: 'RATE_LIMIT_EXCEEDED',
                code: 'TOO_MANY_REQUESTS',
                retryable: true,
                delay: 60000,
                message: 'Rate limit exceeded. Please try again later.'
            },
            500: {
                type: 'SERVER_ERROR',
                code: 'INTERNAL_SERVER_ERROR',
                retryable: true,
                delay: 5000,
                message: 'Internal server error. Please try again later.'
            },
            502: {
                type: 'SERVER_ERROR',
                code: 'BAD_GATEWAY',
                retryable: true,
                delay: 10000,
                message: 'Bad gateway. The service may be temporarily unavailable.'
            },
            503: {
                type: 'SERVER_ERROR',
                code: 'SERVICE_UNAVAILABLE',
                retryable: true,
                delay: 15000,
                message: 'Service temporarily unavailable. Please try again later.'
            },
            504: {
                type: 'TIMEOUT_ERROR',
                code: 'GATEWAY_TIMEOUT',
                retryable: true,
                delay: 20000,
                message: 'Gateway timeout. The service may be experiencing high load.'
            }
        };

        return errorMap[status] || {
            type: 'HTTP_ERROR',
            code: `HTTP_${status}`,
            retryable: status >= 500,
            delay: 5000,
            message: `HTTP error ${status}`
        };
    }

    /**
     * Handle specific error types with custom logic
     * @param {Object} errorInfo - Error analysis result
     * @param {Object} context - Error context
     * @returns {Promise<Object>} Handling result
     * @private
     */
    async _handleSpecificError(errorInfo, context) {
        switch (errorInfo.type) {
            case 'RATE_LIMIT_EXCEEDED':
                return await this._handleRateLimitError(errorInfo, context);
                
            case 'AUTHENTICATION_FAILED':
                return await this._handleAuthError(errorInfo, context);
                
            case 'NETWORK_ERROR':
                return await this._handleNetworkError(errorInfo, context);
                
            case 'TIMEOUT_ERROR':
                return await this._handleTimeoutError(errorInfo, context);
                
            case 'SERVER_ERROR':
                return await this._handleServerError(errorInfo, context);
                
            default:
                return {
                    success: false,
                    error: new CodegenError(errorInfo.code, errorInfo.userMessage, errorInfo.originalError),
                    retryable: errorInfo.retryable,
                    delay: errorInfo.delay
                };
        }
    }

    /**
     * Handle rate limit errors
     * @param {Object} errorInfo - Error information
     * @param {Object} context - Error context
     * @returns {Promise<Object>} Handling result
     * @private
     */
    async _handleRateLimitError(errorInfo, context) {
        log('warning', 'Rate limit exceeded, implementing backoff strategy');
        
        return {
            success: false,
            error: new CodegenError('RATE_LIMIT_EXCEEDED', errorInfo.userMessage),
            retryable: true,
            delay: Math.min(errorInfo.delay, this.config.maxDelay),
            strategy: 'exponential_backoff'
        };
    }

    /**
     * Handle authentication errors
     * @param {Object} errorInfo - Error information
     * @param {Object} context - Error context
     * @returns {Promise<Object>} Handling result
     * @private
     */
    async _handleAuthError(errorInfo, context) {
        log('error', 'Authentication failed - check API credentials');
        
        return {
            success: false,
            error: new CodegenError('AUTHENTICATION_FAILED', errorInfo.userMessage),
            retryable: false,
            requiresUserAction: true,
            actionRequired: 'Check API key and org_id configuration'
        };
    }

    /**
     * Handle network errors
     * @param {Object} errorInfo - Error information
     * @param {Object} context - Error context
     * @returns {Promise<Object>} Handling result
     * @private
     */
    async _handleNetworkError(errorInfo, context) {
        log('warning', 'Network error detected, will retry with backoff');
        
        return {
            success: false,
            error: new CodegenError('NETWORK_ERROR', errorInfo.userMessage),
            retryable: true,
            delay: Math.min(errorInfo.delay * 2, this.config.maxDelay),
            strategy: 'linear_backoff'
        };
    }

    /**
     * Handle timeout errors
     * @param {Object} errorInfo - Error information
     * @param {Object} context - Error context
     * @returns {Promise<Object>} Handling result
     * @private
     */
    async _handleTimeoutError(errorInfo, context) {
        log('warning', 'Request timeout, will retry with increased timeout');
        
        return {
            success: false,
            error: new CodegenError('TIMEOUT_ERROR', errorInfo.userMessage),
            retryable: true,
            delay: errorInfo.delay,
            strategy: 'increase_timeout'
        };
    }

    /**
     * Handle server errors
     * @param {Object} errorInfo - Error information
     * @param {Object} context - Error context
     * @returns {Promise<Object>} Handling result
     * @private
     */
    async _handleServerError(errorInfo, context) {
        log('warning', 'Server error detected, implementing retry strategy');
        
        return {
            success: false,
            error: new CodegenError('SERVER_ERROR', errorInfo.userMessage),
            retryable: true,
            delay: Math.min(errorInfo.delay, this.config.maxDelay),
            strategy: 'exponential_backoff'
        };
    }

    /**
     * Get error statistics
     * @returns {Object} Error statistics
     */
    getStatistics() {
        return this.errorStats.getStatistics();
    }

    /**
     * Reset error statistics
     */
    resetStatistics() {
        this.errorStats.reset();
        this.circuitBreaker.reset();
    }
}

/**
 * Circuit Breaker implementation
 */
class CircuitBreaker {
    constructor(config) {
        this.threshold = config.circuitBreakerThreshold || 5;
        this.timeout = config.circuitBreakerTimeout || 60000;
        this.failures = 0;
        this.lastFailureTime = null;
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    }

    /**
     * Check if circuit breaker is open
     * @returns {boolean} Whether circuit is open
     */
    isOpen() {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime > this.timeout) {
                this.state = 'HALF_OPEN';
                return false;
            }
            return true;
        }
        return false;
    }

    /**
     * Record a successful operation
     */
    recordSuccess() {
        this.failures = 0;
        this.state = 'CLOSED';
    }

    /**
     * Record a failed operation
     */
    recordFailure() {
        this.failures++;
        this.lastFailureTime = Date.now();
        
        if (this.failures >= this.threshold) {
            this.state = 'OPEN';
            log('warning', `Circuit breaker opened after ${this.failures} failures`);
        }
    }

    /**
     * Reset circuit breaker
     */
    reset() {
        this.failures = 0;
        this.lastFailureTime = null;
        this.state = 'CLOSED';
    }

    /**
     * Get circuit breaker status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            state: this.state,
            failures: this.failures,
            threshold: this.threshold,
            lastFailureTime: this.lastFailureTime,
            timeUntilHalfOpen: this.state === 'OPEN' ? 
                Math.max(0, this.timeout - (Date.now() - this.lastFailureTime)) : 0
        };
    }
}

/**
 * Error Statistics tracking
 */
class ErrorStatistics {
    constructor() {
        this.errors = [];
        this.errorCounts = new Map();
        this.startTime = Date.now();
    }

    /**
     * Record an error
     * @param {Object} errorInfo - Error information
     */
    recordError(errorInfo) {
        this.errors.push({
            ...errorInfo,
            timestamp: Date.now()
        });
        
        // Update error counts
        const count = this.errorCounts.get(errorInfo.type) || 0;
        this.errorCounts.set(errorInfo.type, count + 1);
        
        // Keep only recent errors (last hour)
        const oneHourAgo = Date.now() - 3600000;
        this.errors = this.errors.filter(error => error.timestamp > oneHourAgo);
    }

    /**
     * Get error statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        const now = Date.now();
        const oneHourAgo = now - 3600000;
        const recentErrors = this.errors.filter(error => error.timestamp > oneHourAgo);
        
        const errorsByType = {};
        for (const [type, count] of this.errorCounts.entries()) {
            errorsByType[type] = count;
        }
        
        return {
            totalErrors: this.errors.length,
            recentErrors: recentErrors.length,
            errorsByType,
            errorRate: recentErrors.length / ((now - Math.max(this.startTime, oneHourAgo)) / 60000), // errors per minute
            mostCommonError: this._getMostCommonError(),
            uptime: now - this.startTime
        };
    }

    /**
     * Get most common error type
     * @returns {string|null} Most common error type
     * @private
     */
    _getMostCommonError() {
        if (this.errorCounts.size === 0) return null;
        
        let maxCount = 0;
        let mostCommon = null;
        
        for (const [type, count] of this.errorCounts.entries()) {
            if (count > maxCount) {
                maxCount = count;
                mostCommon = type;
            }
        }
        
        return mostCommon;
    }

    /**
     * Reset statistics
     */
    reset() {
        this.errors = [];
        this.errorCounts.clear();
        this.startTime = Date.now();
    }
}

export default CodegenErrorHandler;
export { CircuitBreaker, ErrorStatistics };
