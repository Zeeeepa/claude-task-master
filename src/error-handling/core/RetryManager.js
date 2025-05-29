/**
 * @fileoverview Unified Retry Management System
 * @description Consolidates retry logic from all PRs into a single,
 * intelligent retry manager with multiple backoff strategies
 */

/**
 * Retry strategies
 */
export const RetryStrategy = {
    EXPONENTIAL: 'exponential',
    LINEAR: 'linear',
    FIXED: 'fixed',
    FIBONACCI: 'fibonacci',
    ADAPTIVE: 'adaptive'
};

/**
 * Retry result status
 */
export const RetryStatus = {
    SUCCESS: 'success',
    FAILED: 'failed',
    EXHAUSTED: 'exhausted',
    CIRCUIT_OPEN: 'circuit_open',
    TIMEOUT: 'timeout'
};

/**
 * Unified Retry Manager
 * Consolidates retry logic from PRs #45, #88, #90, #91, #93
 */
export class RetryManager {
    constructor(config = {}) {
        this.config = {
            maxRetries: config.maxRetries || 3,
            initialDelayMs: config.initialDelayMs || 1000,
            maxDelayMs: config.maxDelayMs || 30000,
            backoffMultiplier: config.backoffMultiplier || 2,
            jitterEnabled: config.jitterEnabled !== false,
            jitterFactor: config.jitterFactor || 0.1,
            timeoutMs: config.timeoutMs || 60000,
            enableCircuitBreaker: config.enableCircuitBreaker !== false,
            enableAdaptive: config.enableAdaptive !== false,
            maxConcurrentRetries: config.maxConcurrentRetries || 10,
            ...config
        };

        // Active retry operations
        this.activeRetries = new Map();
        this.retryHistory = [];
        this.adaptiveData = new Map(); // operation -> performance data
        
        // Statistics
        this.stats = {
            totalAttempts: 0,
            successfulRetries: 0,
            failedRetries: 0,
            exhaustedRetries: 0,
            circuitBreakerTrips: 0,
            timeouts: 0,
            averageRetryCount: 0,
            activeRetries: 0
        };

        // Cleanup interval
        this.cleanupInterval = setInterval(() => {
            this._cleanupOldData();
        }, 300000); // 5 minutes
    }

    /**
     * Execute operation with retry logic
     * @param {Function} operation - Operation to execute
     * @param {Object} options - Retry options
     * @returns {Promise<any>} Operation result
     */
    async executeWithRetry(operation, options = {}) {
        const retryId = this._generateRetryId();
        const config = { ...this.config, ...options };
        const operationName = options.operationName || 'unknown';
        
        // Check concurrent retry limit
        if (this.activeRetries.size >= config.maxConcurrentRetries) {
            throw new Error('Maximum concurrent retries exceeded');
        }

        // Initialize retry context
        const retryContext = {
            id: retryId,
            operationName,
            startTime: Date.now(),
            attempts: 0,
            maxRetries: config.maxRetries,
            strategy: config.strategy || RetryStrategy.EXPONENTIAL,
            delays: [],
            errors: [],
            config
        };

        this.activeRetries.set(retryId, retryContext);
        this.stats.activeRetries = this.activeRetries.size;

        try {
            const result = await this._executeWithRetryLogic(operation, retryContext);
            
            // Record successful retry
            this._recordRetryResult(retryContext, RetryStatus.SUCCESS, result);
            
            return result;
            
        } catch (error) {
            // Record failed retry
            this._recordRetryResult(retryContext, RetryStatus.FAILED, null, error);
            throw error;
            
        } finally {
            this.activeRetries.delete(retryId);
            this.stats.activeRetries = this.activeRetries.size;
        }
    }

    /**
     * Get retry statistics
     * @returns {Object} Retry statistics
     */
    getStatistics() {
        const successRate = this.stats.totalAttempts > 0 ? 
            this.stats.successfulRetries / this.stats.totalAttempts : 0;

        return {
            ...this.stats,
            successRate,
            failureRate: 1 - successRate,
            adaptiveOperations: this.adaptiveData.size,
            historySize: this.retryHistory.length
        };
    }

    /**
     * Get health status
     * @returns {Object} Health status
     */
    getHealth() {
        const stats = this.getStatistics();
        
        return {
            status: stats.successRate > 0.8 ? 'healthy' : 
                   stats.successRate > 0.6 ? 'degraded' : 'unhealthy',
            successRate: stats.successRate,
            activeRetries: stats.activeRetries,
            totalAttempts: stats.totalAttempts
        };
    }

    /**
     * Get adaptive data for operation
     * @param {string} operationName - Operation name
     * @returns {Object|null} Adaptive data
     */
    getAdaptiveData(operationName) {
        return this.adaptiveData.get(operationName) || null;
    }

    /**
     * Reset retry manager state
     */
    reset() {
        this.activeRetries.clear();
        this.retryHistory = [];
        this.adaptiveData.clear();
        this.stats = {
            totalAttempts: 0,
            successfulRetries: 0,
            failedRetries: 0,
            exhaustedRetries: 0,
            circuitBreakerTrips: 0,
            timeouts: 0,
            averageRetryCount: 0,
            activeRetries: 0
        };
    }

    /**
     * Destroy retry manager
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.reset();
    }

    // Private methods

    /**
     * Execute operation with retry logic
     * @param {Function} operation - Operation to execute
     * @param {Object} retryContext - Retry context
     * @returns {Promise<any>} Operation result
     * @private
     */
    async _executeWithRetryLogic(operation, retryContext) {
        const { config } = retryContext;
        let lastError = null;

        while (retryContext.attempts <= retryContext.maxRetries) {
            try {
                retryContext.attempts++;
                this.stats.totalAttempts++;

                // Execute operation with timeout
                const result = await this._executeWithTimeout(operation, config.timeoutMs);
                
                // Success - update adaptive data
                if (config.enableAdaptive) {
                    this._updateAdaptiveData(retryContext.operationName, true, retryContext.attempts);
                }

                if (retryContext.attempts > 1) {
                    this.stats.successfulRetries++;
                }

                return result;

            } catch (error) {
                lastError = error;
                retryContext.errors.push({
                    attempt: retryContext.attempts,
                    error: error.message,
                    timestamp: new Date()
                });

                // Check if we should retry
                if (!this._shouldRetry(error, retryContext)) {
                    break;
                }

                // Calculate delay for next attempt
                if (retryContext.attempts <= retryContext.maxRetries) {
                    const delay = this._calculateDelay(retryContext);
                    retryContext.delays.push(delay);

                    // Call retry callback if provided
                    if (config.onRetry) {
                        try {
                            await config.onRetry(retryContext.attempts, error, delay);
                        } catch (callbackError) {
                            // Don't let callback errors stop retry process
                        }
                    }

                    // Wait before next attempt
                    await this._delay(delay);
                }
            }
        }

        // All retries exhausted
        if (config.enableAdaptive) {
            this._updateAdaptiveData(retryContext.operationName, false, retryContext.attempts);
        }

        this.stats.exhaustedRetries++;
        throw lastError || new Error('Retry attempts exhausted');
    }

    /**
     * Execute operation with timeout
     * @param {Function} operation - Operation to execute
     * @param {number} timeoutMs - Timeout in milliseconds
     * @returns {Promise<any>} Operation result
     * @private
     */
    async _executeWithTimeout(operation, timeoutMs) {
        if (!timeoutMs || timeoutMs <= 0) {
            return await operation();
        }

        return new Promise(async (resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.stats.timeouts++;
                reject(new Error(`Operation timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            try {
                const result = await operation();
                clearTimeout(timeoutId);
                resolve(result);
            } catch (error) {
                clearTimeout(timeoutId);
                reject(error);
            }
        });
    }

    /**
     * Determine if operation should be retried
     * @param {Error} error - Error that occurred
     * @param {Object} retryContext - Retry context
     * @returns {boolean} Whether to retry
     * @private
     */
    _shouldRetry(error, retryContext) {
        // Check if we have retries left
        if (retryContext.attempts >= retryContext.maxRetries) {
            return false;
        }

        // Check custom retry condition
        if (retryContext.config.retryCondition) {
            return retryContext.config.retryCondition(error, retryContext.attempts);
        }

        // Default retry conditions
        return this._isRetryableError(error);
    }

    /**
     * Check if error is retryable
     * @param {Error} error - Error to check
     * @returns {boolean} Whether error is retryable
     * @private
     */
    _isRetryableError(error) {
        const message = (error.message || '').toLowerCase();
        const code = error.code || '';
        const status = error.status || error.statusCode || 0;

        // Network errors are generally retryable
        if (
            message.includes('network') ||
            message.includes('connection') ||
            message.includes('timeout') ||
            message.includes('econnrefused') ||
            message.includes('enotfound') ||
            message.includes('etimedout') ||
            code === 'ECONNREFUSED' ||
            code === 'ENOTFOUND' ||
            code === 'ETIMEDOUT'
        ) {
            return true;
        }

        // Rate limit errors are retryable
        if (
            message.includes('rate limit') ||
            message.includes('too many requests') ||
            message.includes('throttled') ||
            status === 429
        ) {
            return true;
        }

        // Server errors are generally retryable
        if (status >= 500 && status < 600) {
            return true;
        }

        // Service unavailable
        if (
            message.includes('service unavailable') ||
            message.includes('temporarily unavailable') ||
            status === 503
        ) {
            return true;
        }

        return false;
    }

    /**
     * Calculate delay for next retry attempt
     * @param {Object} retryContext - Retry context
     * @returns {number} Delay in milliseconds
     * @private
     */
    _calculateDelay(retryContext) {
        const { config, attempts } = retryContext;
        let delay = 0;

        switch (config.strategy || RetryStrategy.EXPONENTIAL) {
            case RetryStrategy.EXPONENTIAL:
                delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempts - 1);
                break;

            case RetryStrategy.LINEAR:
                delay = config.initialDelayMs * attempts;
                break;

            case RetryStrategy.FIXED:
                delay = config.initialDelayMs;
                break;

            case RetryStrategy.FIBONACCI:
                delay = this._calculateFibonacciDelay(config.initialDelayMs, attempts);
                break;

            case RetryStrategy.ADAPTIVE:
                delay = this._calculateAdaptiveDelay(retryContext);
                break;

            default:
                delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempts - 1);
        }

        // Apply maximum delay limit
        delay = Math.min(delay, config.maxDelayMs);

        // Apply jitter if enabled
        if (config.jitterEnabled) {
            const jitter = delay * config.jitterFactor * (Math.random() - 0.5) * 2;
            delay = Math.max(0, delay + jitter);
        }

        return Math.round(delay);
    }

    /**
     * Calculate Fibonacci-based delay
     * @param {number} baseDelay - Base delay
     * @param {number} attempt - Attempt number
     * @returns {number} Delay in milliseconds
     * @private
     */
    _calculateFibonacciDelay(baseDelay, attempt) {
        const fibonacci = (n) => {
            if (n <= 1) return 1;
            let a = 1, b = 1;
            for (let i = 2; i <= n; i++) {
                [a, b] = [b, a + b];
            }
            return b;
        };

        return baseDelay * fibonacci(attempt);
    }

    /**
     * Calculate adaptive delay based on historical performance
     * @param {Object} retryContext - Retry context
     * @returns {number} Delay in milliseconds
     * @private
     */
    _calculateAdaptiveDelay(retryContext) {
        const adaptiveData = this.adaptiveData.get(retryContext.operationName);
        
        if (!adaptiveData || adaptiveData.attempts.length === 0) {
            // No historical data, use exponential backoff
            return retryContext.config.initialDelayMs * 
                   Math.pow(retryContext.config.backoffMultiplier, retryContext.attempts - 1);
        }

        // Calculate optimal delay based on historical success rates
        const recentAttempts = adaptiveData.attempts.slice(-10); // Last 10 attempts
        const successfulAttempts = recentAttempts.filter(a => a.success);
        
        if (successfulAttempts.length === 0) {
            // No recent successes, increase delay
            return retryContext.config.maxDelayMs * 0.5;
        }

        // Calculate average delay for successful attempts
        const avgSuccessDelay = successfulAttempts.reduce(
            (sum, attempt) => sum + attempt.delay, 0
        ) / successfulAttempts.length;

        // Adjust based on current attempt number
        const adjustmentFactor = Math.pow(1.5, retryContext.attempts - 1);
        
        return Math.min(
            avgSuccessDelay * adjustmentFactor,
            retryContext.config.maxDelayMs
        );
    }

    /**
     * Update adaptive data for operation
     * @param {string} operationName - Operation name
     * @param {boolean} success - Whether operation succeeded
     * @param {number} attempts - Number of attempts
     * @private
     */
    _updateAdaptiveData(operationName, success, attempts) {
        if (!this.adaptiveData.has(operationName)) {
            this.adaptiveData.set(operationName, {
                attempts: [],
                successRate: 0,
                averageAttempts: 0,
                lastUpdated: new Date()
            });
        }

        const data = this.adaptiveData.get(operationName);
        
        data.attempts.push({
            success,
            attempts,
            timestamp: new Date(),
            delay: attempts > 1 ? this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attempts - 2) : 0
        });

        // Keep only recent attempts (last 100)
        if (data.attempts.length > 100) {
            data.attempts = data.attempts.slice(-100);
        }

        // Recalculate statistics
        const successfulAttempts = data.attempts.filter(a => a.success);
        data.successRate = successfulAttempts.length / data.attempts.length;
        data.averageAttempts = data.attempts.reduce((sum, a) => sum + a.attempts, 0) / data.attempts.length;
        data.lastUpdated = new Date();
    }

    /**
     * Record retry result
     * @param {Object} retryContext - Retry context
     * @param {string} status - Retry status
     * @param {any} result - Operation result
     * @param {Error} error - Error if failed
     * @private
     */
    _recordRetryResult(retryContext, status, result = null, error = null) {
        const duration = Date.now() - retryContext.startTime;
        
        const retryRecord = {
            id: retryContext.id,
            operationName: retryContext.operationName,
            status,
            attempts: retryContext.attempts,
            duration,
            delays: retryContext.delays,
            errors: retryContext.errors,
            strategy: retryContext.strategy,
            timestamp: new Date(),
            success: status === RetryStatus.SUCCESS
        };

        if (error) {
            retryRecord.finalError = error.message;
        }

        // Add to history
        this.retryHistory.push(retryRecord);

        // Update statistics
        if (status === RetryStatus.SUCCESS && retryContext.attempts > 1) {
            this.stats.successfulRetries++;
        } else if (status === RetryStatus.FAILED || status === RetryStatus.EXHAUSTED) {
            this.stats.failedRetries++;
        }

        // Update average retry count
        const totalRetries = this.retryHistory.reduce((sum, record) => sum + record.attempts, 0);
        this.stats.averageRetryCount = this.retryHistory.length > 0 ? 
            totalRetries / this.retryHistory.length : 0;

        // Cleanup old history
        if (this.retryHistory.length > 1000) {
            this.retryHistory = this.retryHistory.slice(-1000);
        }
    }

    /**
     * Delay execution
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise<void>} Promise that resolves after delay
     * @private
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate unique retry ID
     * @returns {string} Retry ID
     * @private
     */
    _generateRetryId() {
        return `retry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Cleanup old data
     * @private
     */
    _cleanupOldData() {
        const cutoff = Date.now() - 3600000; // 1 hour ago

        // Cleanup retry history
        this.retryHistory = this.retryHistory.filter(
            record => record.timestamp.getTime() > cutoff
        );

        // Cleanup adaptive data
        for (const [operationName, data] of this.adaptiveData.entries()) {
            data.attempts = data.attempts.filter(
                attempt => attempt.timestamp.getTime() > cutoff
            );
            
            // Remove operations with no recent data
            if (data.attempts.length === 0) {
                this.adaptiveData.delete(operationName);
            }
        }
    }
}

export default RetryManager;

