/**
 * @fileoverview Retry Manager
 * @description Intelligent retry logic implementation with adaptive strategies
 */

import { log } from '../utils/getVersion.js';
import { EventEmitter } from 'events';

/**
 * Retry strategies
 */
export const RetryStrategy = {
    FIXED_DELAY: 'fixed_delay',
    LINEAR_BACKOFF: 'linear_backoff',
    EXPONENTIAL_BACKOFF: 'exponential_backoff',
    FIBONACCI_BACKOFF: 'fibonacci_backoff',
    ADAPTIVE: 'adaptive',
    CUSTOM: 'custom'
};

/**
 * Retry policies based on error types
 */
export const RetryPolicy = {
    AGGRESSIVE: {
        maxRetries: 5,
        baseDelay: 500,
        maxDelay: 30000,
        strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
        jitter: true
    },
    MODERATE: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 15000,
        strategy: RetryStrategy.LINEAR_BACKOFF,
        jitter: true
    },
    CONSERVATIVE: {
        maxRetries: 2,
        baseDelay: 2000,
        maxDelay: 10000,
        strategy: RetryStrategy.FIXED_DELAY,
        jitter: false
    },
    RATE_LIMITED: {
        maxRetries: 3,
        baseDelay: 60000,
        maxDelay: 300000,
        strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
        jitter: true
    }
};

/**
 * Intelligent Retry Manager with adaptive strategies
 */
export class RetryManager extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            enableAdaptive: config.enableAdaptive !== false,
            enableJitter: config.enableJitter !== false,
            enableDeadLetterQueue: config.enableDeadLetterQueue !== false,
            maxConcurrentRetries: config.maxConcurrentRetries || 10,
            deadLetterQueueSize: config.deadLetterQueueSize || 1000,
            adaptiveWindow: config.adaptiveWindow || 300000, // 5 minutes
            ...config
        };

        this.activeRetries = new Map(); // operationId -> retryInfo
        this.retryHistory = new Map(); // operationId -> attempts[]
        this.deadLetterQueue = [];
        this.successRates = new Map(); // strategy -> success rate
        this.adaptiveStrategies = new Map(); // errorType -> optimal strategy
        
        // Initialize success rates
        Object.values(RetryStrategy).forEach(strategy => {
            this.successRates.set(strategy, { successes: 0, attempts: 0 });
        });

        // Periodic cleanup
        this.cleanupInterval = setInterval(() => {
            this._cleanupOldRetries();
        }, 60000);
    }

    /**
     * Execute operation with retry logic
     * @param {Function} operation - Operation to execute
     * @param {Object} options - Retry options
     * @returns {Promise<any>} Operation result
     */
    async executeWithRetry(operation, options = {}) {
        const operationId = options.operationId || this._generateOperationId();
        const retryPolicy = this._getRetryPolicy(options);
        
        log('debug', `Starting operation ${operationId} with retry policy`, retryPolicy);

        let lastError;
        let attempt = 0;
        
        // Initialize retry tracking
        this.retryHistory.set(operationId, []);
        
        while (attempt <= retryPolicy.maxRetries) {
            try {
                // Check if we've exceeded concurrent retry limit
                if (this.activeRetries.size >= this.config.maxConcurrentRetries) {
                    throw new Error('Maximum concurrent retries exceeded');
                }

                // Track active retry
                this.activeRetries.set(operationId, {
                    attempt,
                    startTime: Date.now(),
                    policy: retryPolicy
                });

                // Execute operation
                const result = await operation();
                
                // Success - clean up and return
                this.activeRetries.delete(operationId);
                this._recordSuccess(operationId, attempt, retryPolicy.strategy);
                
                this.emit('retry-success', {
                    operationId,
                    attempts: attempt + 1,
                    strategy: retryPolicy.strategy
                });

                return result;

            } catch (error) {
                lastError = error;
                attempt++;
                
                // Record attempt
                this._recordAttempt(operationId, attempt, error, retryPolicy.strategy);
                
                // Check if we should retry
                if (attempt > retryPolicy.maxRetries || !this._shouldRetry(error, options)) {
                    this.activeRetries.delete(operationId);
                    
                    // Add to dead letter queue if enabled
                    if (this.config.enableDeadLetterQueue) {
                        this._addToDeadLetterQueue(operationId, error, attempt);
                    }
                    
                    this.emit('retry-exhausted', {
                        operationId,
                        attempts: attempt,
                        error: error.message,
                        strategy: retryPolicy.strategy
                    });
                    
                    throw error;
                }

                // Calculate delay
                const delay = this._calculateDelay(attempt, retryPolicy, error);
                
                log('warning', `Operation ${operationId} failed (attempt ${attempt}), retrying in ${delay}ms`, {
                    error: error.message,
                    strategy: retryPolicy.strategy
                });

                this.emit('retry-attempt', {
                    operationId,
                    attempt,
                    error: error.message,
                    delay,
                    strategy: retryPolicy.strategy
                });

                // Wait before retry
                await this._delay(delay);
            }
        }
    }

    /**
     * Get retry policy based on options and adaptive learning
     * @param {Object} options - Retry options
     * @returns {Object} Retry policy
     * @private
     */
    _getRetryPolicy(options) {
        let policy = { ...RetryPolicy.MODERATE }; // Default

        // Use specified policy
        if (options.policy) {
            policy = { ...RetryPolicy[options.policy.toUpperCase()] };
        }

        // Override with custom options
        if (options.maxRetries !== undefined) policy.maxRetries = options.maxRetries;
        if (options.baseDelay !== undefined) policy.baseDelay = options.baseDelay;
        if (options.maxDelay !== undefined) policy.maxDelay = options.maxDelay;
        if (options.strategy !== undefined) policy.strategy = options.strategy;

        // Apply adaptive strategy if enabled
        if (this.config.enableAdaptive && options.errorType) {
            const adaptiveStrategy = this.adaptiveStrategies.get(options.errorType);
            if (adaptiveStrategy) {
                policy.strategy = adaptiveStrategy;
            }
        }

        return policy;
    }

    /**
     * Determine if operation should be retried
     * @param {Error} error - The error that occurred
     * @param {Object} options - Retry options
     * @returns {boolean} Whether to retry
     * @private
     */
    _shouldRetry(error, options) {
        // Check if error is explicitly non-retryable
        if (error.retryable === false) {
            return false;
        }

        // Check for specific error codes that shouldn't be retried
        const nonRetryableCodes = [
            'AUTHENTICATION_FAILED',
            'AUTHORIZATION_FAILED',
            'VALIDATION_ERROR',
            'BAD_REQUEST',
            'NOT_FOUND'
        ];

        if (nonRetryableCodes.includes(error.code)) {
            return false;
        }

        // Check HTTP status codes
        if (error.response?.status) {
            const status = error.response.status;
            // Don't retry client errors (except 408, 429)
            if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
                return false;
            }
        }

        // Custom retry condition
        if (options.shouldRetry && typeof options.shouldRetry === 'function') {
            return options.shouldRetry(error);
        }

        return true;
    }

    /**
     * Calculate delay for next retry attempt
     * @param {number} attempt - Current attempt number
     * @param {Object} policy - Retry policy
     * @param {Error} error - The error that occurred
     * @returns {number} Delay in milliseconds
     * @private
     */
    _calculateDelay(attempt, policy, error) {
        let delay;

        switch (policy.strategy) {
            case RetryStrategy.FIXED_DELAY:
                delay = policy.baseDelay;
                break;

            case RetryStrategy.LINEAR_BACKOFF:
                delay = policy.baseDelay * attempt;
                break;

            case RetryStrategy.EXPONENTIAL_BACKOFF:
                delay = policy.baseDelay * Math.pow(2, attempt - 1);
                break;

            case RetryStrategy.FIBONACCI_BACKOFF:
                delay = policy.baseDelay * this._fibonacci(attempt);
                break;

            case RetryStrategy.ADAPTIVE:
                delay = this._calculateAdaptiveDelay(attempt, policy, error);
                break;

            default:
                delay = policy.baseDelay;
        }

        // Apply maximum delay limit
        delay = Math.min(delay, policy.maxDelay);

        // Apply jitter if enabled
        if (policy.jitter && this.config.enableJitter) {
            delay = this._applyJitter(delay);
        }

        // Special handling for rate limit errors
        if (error.code === 'RATE_LIMIT_EXCEEDED' || error.response?.status === 429) {
            const retryAfter = this._extractRetryAfter(error);
            if (retryAfter) {
                delay = Math.max(delay, retryAfter * 1000);
            }
        }

        return delay;
    }

    /**
     * Calculate adaptive delay based on historical success rates
     * @param {number} attempt - Current attempt number
     * @param {Object} policy - Retry policy
     * @param {Error} error - The error that occurred
     * @returns {number} Delay in milliseconds
     * @private
     */
    _calculateAdaptiveDelay(attempt, policy, error) {
        // Start with exponential backoff as base
        let delay = policy.baseDelay * Math.pow(2, attempt - 1);

        // Adjust based on error type success rates
        const errorType = error.code || error.constructor.name;
        const successRate = this._getSuccessRateForErrorType(errorType);

        if (successRate < 0.3) {
            // Low success rate - increase delay
            delay *= 2;
        } else if (successRate > 0.7) {
            // High success rate - decrease delay
            delay *= 0.5;
        }

        return delay;
    }

    /**
     * Apply jitter to delay to avoid thundering herd
     * @param {number} delay - Base delay
     * @returns {number} Jittered delay
     * @private
     */
    _applyJitter(delay) {
        // Full jitter: random between 0 and delay
        return Math.random() * delay;
    }

    /**
     * Extract retry-after header from error response
     * @param {Error} error - The error
     * @returns {number|null} Retry after seconds
     * @private
     */
    _extractRetryAfter(error) {
        if (error.response?.headers) {
            const retryAfter = error.response.headers['retry-after'] || 
                             error.response.headers['Retry-After'];
            if (retryAfter) {
                return parseInt(retryAfter, 10);
            }
        }
        return null;
    }

    /**
     * Calculate fibonacci number
     * @param {number} n - Position in sequence
     * @returns {number} Fibonacci number
     * @private
     */
    _fibonacci(n) {
        if (n <= 1) return 1;
        if (n === 2) return 1;
        
        let a = 1, b = 1;
        for (let i = 3; i <= n; i++) {
            [a, b] = [b, a + b];
        }
        return b;
    }

    /**
     * Record successful operation
     * @param {string} operationId - Operation ID
     * @param {number} attempts - Number of attempts
     * @param {string} strategy - Retry strategy used
     * @private
     */
    _recordSuccess(operationId, attempts, strategy) {
        const history = this.retryHistory.get(operationId) || [];
        history.push({
            timestamp: Date.now(),
            success: true,
            attempts,
            strategy
        });

        // Update success rates
        const stats = this.successRates.get(strategy);
        if (stats) {
            stats.successes++;
            stats.attempts++;
        }

        // Update adaptive strategies
        if (this.config.enableAdaptive) {
            this._updateAdaptiveStrategies(strategy, true);
        }
    }

    /**
     * Record retry attempt
     * @param {string} operationId - Operation ID
     * @param {number} attempt - Attempt number
     * @param {Error} error - The error
     * @param {string} strategy - Retry strategy
     * @private
     */
    _recordAttempt(operationId, attempt, error, strategy) {
        const history = this.retryHistory.get(operationId) || [];
        history.push({
            timestamp: Date.now(),
            attempt,
            error: error.message,
            errorCode: error.code,
            strategy
        });
        this.retryHistory.set(operationId, history);

        // Update success rates for failed final attempts
        if (attempt > 1) {
            const stats = this.successRates.get(strategy);
            if (stats) {
                stats.attempts++;
            }
        }
    }

    /**
     * Add operation to dead letter queue
     * @param {string} operationId - Operation ID
     * @param {Error} error - Final error
     * @param {number} attempts - Total attempts
     * @private
     */
    _addToDeadLetterQueue(operationId, error, attempts) {
        const deadLetter = {
            operationId,
            error: {
                message: error.message,
                code: error.code,
                stack: error.stack
            },
            attempts,
            timestamp: Date.now(),
            history: this.retryHistory.get(operationId) || []
        };

        this.deadLetterQueue.push(deadLetter);

        // Maintain queue size limit
        if (this.deadLetterQueue.length > this.config.deadLetterQueueSize) {
            this.deadLetterQueue.shift();
        }

        this.emit('dead-letter', deadLetter);
    }

    /**
     * Update adaptive strategies based on success/failure
     * @param {string} strategy - Strategy used
     * @param {boolean} success - Whether operation succeeded
     * @private
     */
    _updateAdaptiveStrategies(strategy, success) {
        // This is a simplified adaptive algorithm
        // In production, you might want more sophisticated ML-based approaches
        
        const stats = this.successRates.get(strategy);
        if (!stats) return;

        const successRate = stats.successes / stats.attempts;
        
        // If this strategy has high success rate, prefer it for similar error types
        if (successRate > 0.8) {
            // Implementation would depend on error type classification
            // For now, just track the best performing strategy
        }
    }

    /**
     * Get success rate for specific error type
     * @param {string} errorType - Error type
     * @returns {number} Success rate (0-1)
     * @private
     */
    _getSuccessRateForErrorType(errorType) {
        // Simplified implementation
        // In practice, you'd track success rates per error type
        const overallStats = Array.from(this.successRates.values());
        const totalSuccesses = overallStats.reduce((sum, stats) => sum + stats.successes, 0);
        const totalAttempts = overallStats.reduce((sum, stats) => sum + stats.attempts, 0);
        
        return totalAttempts > 0 ? totalSuccesses / totalAttempts : 0.5;
    }

    /**
     * Clean up old retry records
     * @private
     */
    _cleanupOldRetries() {
        const cutoff = Date.now() - this.config.adaptiveWindow;
        
        // Clean up retry history
        for (const [operationId, history] of this.retryHistory.entries()) {
            const recentHistory = history.filter(record => record.timestamp > cutoff);
            if (recentHistory.length === 0) {
                this.retryHistory.delete(operationId);
            } else {
                this.retryHistory.set(operationId, recentHistory);
            }
        }

        // Clean up dead letter queue
        this.deadLetterQueue = this.deadLetterQueue.filter(item => 
            item.timestamp > cutoff
        );
    }

    /**
     * Create delay promise
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise} Delay promise
     * @private
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate unique operation ID
     * @returns {string} Operation ID
     * @private
     */
    _generateOperationId() {
        return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get retry statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        const stats = {
            activeRetries: this.activeRetries.size,
            deadLetterQueueSize: this.deadLetterQueue.length,
            successRates: {},
            totalOperations: 0,
            totalSuccesses: 0
        };

        // Calculate success rates
        for (const [strategy, data] of this.successRates.entries()) {
            stats.successRates[strategy] = {
                rate: data.attempts > 0 ? data.successes / data.attempts : 0,
                successes: data.successes,
                attempts: data.attempts
            };
            stats.totalOperations += data.attempts;
            stats.totalSuccesses += data.successes;
        }

        stats.overallSuccessRate = stats.totalOperations > 0 ? 
            stats.totalSuccesses / stats.totalOperations : 0;

        return stats;
    }

    /**
     * Get dead letter queue items
     * @returns {Array} Dead letter queue
     */
    getDeadLetterQueue() {
        return [...this.deadLetterQueue];
    }

    /**
     * Clear dead letter queue
     */
    clearDeadLetterQueue() {
        this.deadLetterQueue = [];
        this.emit('dead-letter-cleared');
    }

    /**
     * Get active retries
     * @returns {Array} Active retry operations
     */
    getActiveRetries() {
        return Array.from(this.activeRetries.entries()).map(([id, info]) => ({
            operationId: id,
            ...info,
            duration: Date.now() - info.startTime
        }));
    }

    /**
     * Cancel active retry
     * @param {string} operationId - Operation ID to cancel
     * @returns {boolean} Whether operation was cancelled
     */
    cancelRetry(operationId) {
        if (this.activeRetries.has(operationId)) {
            this.activeRetries.delete(operationId);
            this.emit('retry-cancelled', { operationId });
            return true;
        }
        return false;
    }

    /**
     * Reset all retry tracking
     */
    reset() {
        this.activeRetries.clear();
        this.retryHistory.clear();
        this.deadLetterQueue = [];
        
        // Reset success rates
        for (const strategy of this.successRates.keys()) {
            this.successRates.set(strategy, { successes: 0, attempts: 0 });
        }
        
        this.adaptiveStrategies.clear();
    }

    /**
     * Cleanup resources
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.removeAllListeners();
    }
}

export default RetryManager;

