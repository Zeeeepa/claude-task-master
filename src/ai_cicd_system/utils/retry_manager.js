/**
 * @fileoverview Retry Manager
 * @description Enhanced error handling and retry logic for Codegen API calls
 */

import { log } from '../../../scripts/modules/utils.js';

/**
 * Manages retry logic with exponential backoff and intelligent error handling
 */
export class RetryManager {
    constructor(config = {}) {
        this.config = {
            max_retries: config.max_retries || 3,
            base_delay: config.base_delay || 1000, // 1 second
            max_delay: config.max_delay || 30000, // 30 seconds
            backoff_multiplier: config.backoff_multiplier || 2,
            jitter: config.jitter !== false, // Add randomness to prevent thundering herd
            retry_on_timeout: config.retry_on_timeout !== false,
            retry_on_rate_limit: config.retry_on_rate_limit !== false,
            retry_on_server_error: config.retry_on_server_error !== false,
            ...config
        };
        
        this.retryStats = {
            total_attempts: 0,
            successful_retries: 0,
            failed_retries: 0,
            error_types: {}
        };
        
        log('debug', 'RetryManager initialized with config:', this.config);
    }

    /**
     * Execute operation with retry logic
     * @param {Function} operation - Async operation to execute
     * @param {Object} context - Context for logging and tracking
     * @returns {Promise<any>} Operation result
     */
    async executeWithRetry(operation, context = {}) {
        const operationId = context.operation_id || `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();
        
        log('debug', `Starting retry operation: ${operationId}`);
        
        let lastError;
        let attempt = 0;
        
        while (attempt <= this.config.max_retries) {
            attempt++;
            this.retryStats.total_attempts++;
            
            try {
                log('debug', `Attempt ${attempt}/${this.config.max_retries + 1} for operation: ${operationId}`);
                
                const result = await operation();
                
                if (attempt > 1) {
                    this.retryStats.successful_retries++;
                    log('info', `Operation ${operationId} succeeded on attempt ${attempt}`);
                }
                
                return result;
                
            } catch (error) {
                lastError = error;
                const errorType = this._classifyError(error);
                
                // Track error statistics
                this.retryStats.error_types[errorType] = (this.retryStats.error_types[errorType] || 0) + 1;
                
                log('warning', `Attempt ${attempt} failed for operation ${operationId}: ${error.message} (type: ${errorType})`);
                
                // Check if we should retry this error
                if (!this._shouldRetry(error, attempt)) {
                    log('error', `Operation ${operationId} failed permanently after ${attempt} attempts`);
                    this.retryStats.failed_retries++;
                    throw this._enhanceError(error, attempt, operationId);
                }
                
                // Calculate delay for next attempt
                if (attempt <= this.config.max_retries) {
                    const delay = this._calculateDelay(attempt, errorType);
                    log('debug', `Waiting ${delay}ms before retry ${attempt + 1} for operation ${operationId}`);
                    await this._delay(delay);
                }
            }
        }
        
        // All retries exhausted
        this.retryStats.failed_retries++;
        const totalTime = Date.now() - startTime;
        log('error', `Operation ${operationId} failed after ${attempt} attempts in ${totalTime}ms`);
        throw this._enhanceError(lastError, attempt, operationId);
    }

    /**
     * Check if error should be retried
     * @param {Error} error - The error to check
     * @param {number} attempt - Current attempt number
     * @returns {boolean} Whether to retry
     * @private
     */
    _shouldRetry(error, attempt) {
        // Don't retry if we've exceeded max attempts
        if (attempt > this.config.max_retries) {
            return false;
        }
        
        const errorType = this._classifyError(error);
        
        switch (errorType) {
            case 'timeout':
                return this.config.retry_on_timeout;
                
            case 'rate_limit':
                return this.config.retry_on_rate_limit;
                
            case 'server_error':
                return this.config.retry_on_server_error;
                
            case 'connection':
                return true; // Always retry connection errors
                
            case 'authentication':
                return false; // Never retry auth errors
                
            case 'validation':
                return false; // Never retry validation errors
                
            case 'not_found':
                return false; // Never retry not found errors
                
            case 'python_error':
                return attempt === 1; // Retry once for Python errors
                
            case 'import_error':
                return false; // Never retry import errors
                
            default:
                return true; // Retry unknown errors
        }
    }

    /**
     * Classify error type for retry decisions
     * @param {Error} error - The error to classify
     * @returns {string} Error type
     * @private
     */
    _classifyError(error) {
        const message = error.message.toLowerCase();
        
        // Network and connection errors
        if (message.includes('timeout') || message.includes('etimedout')) {
            return 'timeout';
        }
        if (message.includes('connection') || message.includes('econnrefused') || message.includes('enotfound')) {
            return 'connection';
        }
        
        // HTTP status code errors
        if (message.includes('401') || message.includes('403') || message.includes('unauthorized')) {
            return 'authentication';
        }
        if (message.includes('404') || message.includes('not found')) {
            return 'not_found';
        }
        if (message.includes('429') || message.includes('rate limit')) {
            return 'rate_limit';
        }
        if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) {
            return 'server_error';
        }
        
        // Application-specific errors
        if (message.includes('validation') || message.includes('invalid')) {
            return 'validation';
        }
        if (message.includes('python') || message.includes('spawn')) {
            return 'python_error';
        }
        if (message.includes('import') || message.includes('module')) {
            return 'import_error';
        }
        
        return 'unknown';
    }

    /**
     * Calculate delay for next retry attempt
     * @param {number} attempt - Current attempt number
     * @param {string} errorType - Type of error
     * @returns {number} Delay in milliseconds
     * @private
     */
    _calculateDelay(attempt, errorType) {
        let delay = this.config.base_delay * Math.pow(this.config.backoff_multiplier, attempt - 1);
        
        // Special handling for rate limit errors
        if (errorType === 'rate_limit') {
            delay = Math.max(delay, 60000); // Minimum 1 minute for rate limits
        }
        
        // Cap at max delay
        delay = Math.min(delay, this.config.max_delay);
        
        // Add jitter to prevent thundering herd
        if (this.config.jitter) {
            const jitterAmount = delay * 0.1; // 10% jitter
            delay += (Math.random() - 0.5) * 2 * jitterAmount;
        }
        
        return Math.floor(delay);
    }

    /**
     * Enhance error with retry information
     * @param {Error} originalError - Original error
     * @param {number} attempts - Number of attempts made
     * @param {string} operationId - Operation identifier
     * @returns {Error} Enhanced error
     * @private
     */
    _enhanceError(originalError, attempts, operationId) {
        const errorType = this._classifyError(originalError);
        
        const enhancedError = new Error(
            `Operation failed after ${attempts} attempts: ${originalError.message}`
        );
        
        enhancedError.originalError = originalError;
        enhancedError.attempts = attempts;
        enhancedError.operationId = operationId;
        enhancedError.errorType = errorType;
        enhancedError.retryable = this._shouldRetry(originalError, 1);
        
        // Add specific guidance based on error type
        switch (errorType) {
            case 'authentication':
                enhancedError.guidance = 'Check your API credentials and ensure they are valid';
                break;
            case 'rate_limit':
                enhancedError.guidance = 'API rate limit exceeded. Wait before making more requests';
                break;
            case 'connection':
                enhancedError.guidance = 'Check network connectivity and API endpoint availability';
                break;
            case 'timeout':
                enhancedError.guidance = 'Request timed out. Consider increasing timeout or checking API performance';
                break;
            case 'python_error':
                enhancedError.guidance = 'Check Python installation and Codegen SDK availability';
                break;
            case 'import_error':
                enhancedError.guidance = 'Install the Codegen Python SDK: pip install codegen';
                break;
            default:
                enhancedError.guidance = 'Check error details and API documentation';
        }
        
        return enhancedError;
    }

    /**
     * Delay execution for specified milliseconds
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise<void>} Promise that resolves after delay
     * @private
     */
    async _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get retry statistics
     * @returns {Object} Retry statistics
     */
    getStatistics() {
        const totalAttempts = this.retryStats.total_attempts;
        const successRate = totalAttempts > 0 
            ? ((totalAttempts - this.retryStats.failed_retries) / totalAttempts) * 100 
            : 100;
        
        return {
            total_attempts: totalAttempts,
            successful_retries: this.retryStats.successful_retries,
            failed_retries: this.retryStats.failed_retries,
            success_rate: Math.round(successRate * 100) / 100,
            error_types: { ...this.retryStats.error_types },
            config: { ...this.config }
        };
    }

    /**
     * Reset retry statistics
     */
    resetStatistics() {
        this.retryStats = {
            total_attempts: 0,
            successful_retries: 0,
            failed_retries: 0,
            error_types: {}
        };
        
        log('debug', 'Retry statistics reset');
    }

    /**
     * Get health status
     * @returns {Object} Health status
     */
    getHealth() {
        const stats = this.getStatistics();
        
        return {
            status: 'healthy',
            success_rate: stats.success_rate,
            total_attempts: stats.total_attempts,
            config: {
                max_retries: this.config.max_retries,
                base_delay: this.config.base_delay,
                max_delay: this.config.max_delay
            }
        };
    }
}

export default RetryManager;

