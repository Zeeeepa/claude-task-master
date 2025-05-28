/**
 * @fileoverview Multi-tier Retry Logic with Exponential Backoff
 * @description Advanced retry management with intelligent backoff strategies and circuit breaking
 */

import { log } from '../../scripts/modules/utils.js';

/**
 * Retry Manager with multiple backoff strategies and intelligent retry logic
 */
export class RetryManager {
    constructor(config = {}) {
        this.config = {
            maxRetries: config.maxRetries || 3,
            baseDelay: config.baseDelay || 1000,
            maxDelay: config.maxDelay || 30000,
            backoffMultiplier: config.backoffMultiplier || 2,
            jitterEnabled: config.jitterEnabled !== false,
            jitterFactor: config.jitterFactor || 0.1,
            enableCircuitBreaker: config.enableCircuitBreaker !== false,
            circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
            circuitBreakerTimeout: config.circuitBreakerTimeout || 60000,
            retryStrategies: config.retryStrategies || ['exponential', 'linear', 'fixed'],
            ...config
        };
        
        this.retryHistory = new Map();
        this.circuitBreakers = new Map();
        this.retryStatistics = new RetryStatistics();
    }

    /**
     * Execute operation with retry logic
     * @param {Function} operation - Operation to execute
     * @param {Object} options - Retry options
     * @returns {Promise<any>} Operation result
     */
    async executeWithRetry(operation, options = {}) {
        const retryOptions = {
            maxRetries: options.maxRetries || this.config.maxRetries,
            strategy: options.strategy || 'exponential',
            operationId: options.operationId || this._generateOperationId(),
            context: options.context || {},
            retryCondition: options.retryCondition || this._defaultRetryCondition,
            onRetry: options.onRetry || (() => {}),
            ...options
        };

        const operationId = retryOptions.operationId;
        let lastError = null;
        let attempt = 0;

        // Check circuit breaker
        if (this.config.enableCircuitBreaker) {
            const circuitBreaker = this._getCircuitBreaker(operationId);
            if (circuitBreaker.isOpen()) {
                throw new Error(`Circuit breaker is open for operation ${operationId}`);
            }
        }

        while (attempt <= retryOptions.maxRetries) {
            try {
                const startTime = Date.now();
                const result = await operation();
                
                // Record successful execution
                this._recordSuccess(operationId, attempt, Date.now() - startTime);
                
                if (this.config.enableCircuitBreaker) {
                    this._getCircuitBreaker(operationId).recordSuccess();
                }
                
                return result;
                
            } catch (error) {
                lastError = error;
                attempt++;
                
                // Record failed attempt
                this._recordFailure(operationId, attempt, error);
                
                // Check if we should retry
                if (attempt > retryOptions.maxRetries || !retryOptions.retryCondition(error, attempt)) {
                    if (this.config.enableCircuitBreaker) {
                        this._getCircuitBreaker(operationId).recordFailure();
                    }
                    break;
                }

                // Calculate delay and wait
                const delay = this._calculateDelay(attempt, retryOptions.strategy, retryOptions);
                
                log('warning', `Retry attempt ${attempt} for operation ${operationId} after ${delay}ms`, {
                    error: error.message,
                    strategy: retryOptions.strategy,
                    delay
                });

                // Call retry callback
                await retryOptions.onRetry(error, attempt, delay);
                
                // Wait before retry
                await this._delay(delay);
            }
        }

        // All retries exhausted
        if (this.config.enableCircuitBreaker) {
            this._getCircuitBreaker(operationId).recordFailure();
        }
        
        throw new RetryExhaustedError(
            `Operation ${operationId} failed after ${attempt} attempts`,
            lastError,
            attempt
        );
    }

    /**
     * Calculate delay for retry attempt
     * @param {number} attempt - Current attempt number
     * @param {string} strategy - Retry strategy
     * @param {Object} options - Retry options
     * @returns {number} Delay in milliseconds
     * @private
     */
    _calculateDelay(attempt, strategy, options) {
        let delay;
        
        switch (strategy) {
            case 'exponential':
                delay = this._exponentialBackoff(attempt, options);
                break;
                
            case 'linear':
                delay = this._linearBackoff(attempt, options);
                break;
                
            case 'fixed':
                delay = this._fixedDelay(attempt, options);
                break;
                
            case 'fibonacci':
                delay = this._fibonacciBackoff(attempt, options);
                break;
                
            case 'adaptive':
                delay = this._adaptiveBackoff(attempt, options);
                break;
                
            default:
                delay = this._exponentialBackoff(attempt, options);
        }
        
        // Apply jitter if enabled
        if (this.config.jitterEnabled) {
            delay = this._applyJitter(delay);
        }
        
        // Ensure delay is within bounds
        return Math.min(Math.max(delay, 0), this.config.maxDelay);
    }

    /**
     * Exponential backoff calculation
     * @param {number} attempt - Attempt number
     * @param {Object} options - Options
     * @returns {number} Delay
     * @private
     */
    _exponentialBackoff(attempt, options) {
        const baseDelay = options.baseDelay || this.config.baseDelay;
        const multiplier = options.backoffMultiplier || this.config.backoffMultiplier;
        
        return baseDelay * Math.pow(multiplier, attempt - 1);
    }

    /**
     * Linear backoff calculation
     * @param {number} attempt - Attempt number
     * @param {Object} options - Options
     * @returns {number} Delay
     * @private
     */
    _linearBackoff(attempt, options) {
        const baseDelay = options.baseDelay || this.config.baseDelay;
        const increment = options.linearIncrement || baseDelay;
        
        return baseDelay + (increment * (attempt - 1));
    }

    /**
     * Fixed delay calculation
     * @param {number} attempt - Attempt number
     * @param {Object} options - Options
     * @returns {number} Delay
     * @private
     */
    _fixedDelay(attempt, options) {
        return options.baseDelay || this.config.baseDelay;
    }

    /**
     * Fibonacci backoff calculation
     * @param {number} attempt - Attempt number
     * @param {Object} options - Options
     * @returns {number} Delay
     * @private
     */
    _fibonacciBackoff(attempt, options) {
        const baseDelay = options.baseDelay || this.config.baseDelay;
        const fibNumber = this._fibonacci(attempt);
        
        return baseDelay * fibNumber;
    }

    /**
     * Adaptive backoff based on historical performance
     * @param {number} attempt - Attempt number
     * @param {Object} options - Options
     * @returns {number} Delay
     * @private
     */
    _adaptiveBackoff(attempt, options) {
        const operationId = options.operationId;
        const history = this.retryHistory.get(operationId);
        
        if (!history || history.length === 0) {
            return this._exponentialBackoff(attempt, options);
        }
        
        // Calculate average success delay from history
        const successfulAttempts = history.filter(h => h.success);
        if (successfulAttempts.length === 0) {
            return this._exponentialBackoff(attempt, options);
        }
        
        const avgSuccessDelay = successfulAttempts.reduce((sum, h) => sum + h.delay, 0) / successfulAttempts.length;
        const adaptiveFactor = Math.min(2, Math.max(0.5, avgSuccessDelay / this.config.baseDelay));
        
        return this._exponentialBackoff(attempt, options) * adaptiveFactor;
    }

    /**
     * Apply jitter to delay
     * @param {number} delay - Base delay
     * @returns {number} Jittered delay
     * @private
     */
    _applyJitter(delay) {
        const jitterRange = delay * this.config.jitterFactor;
        const jitter = (Math.random() - 0.5) * 2 * jitterRange;
        
        return Math.max(0, delay + jitter);
    }

    /**
     * Calculate Fibonacci number
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
     * Default retry condition
     * @param {Error} error - Error that occurred
     * @param {number} attempt - Current attempt number
     * @returns {boolean} Whether to retry
     * @private
     */
    _defaultRetryCondition(error, attempt) {
        // Don't retry on certain error types
        const nonRetryableErrors = [
            'AUTHENTICATION_ERROR',
            'AUTHORIZATION_ERROR',
            'VALIDATION_ERROR',
            'BAD_REQUEST'
        ];
        
        if (error.code && nonRetryableErrors.includes(error.code)) {
            return false;
        }
        
        // Don't retry on 4xx errors (except 408, 429)
        if (error.status >= 400 && error.status < 500) {
            return error.status === 408 || error.status === 429;
        }
        
        // Retry on 5xx errors and network errors
        return true;
    }

    /**
     * Get or create circuit breaker for operation
     * @param {string} operationId - Operation identifier
     * @returns {CircuitBreaker} Circuit breaker instance
     * @private
     */
    _getCircuitBreaker(operationId) {
        if (!this.circuitBreakers.has(operationId)) {
            this.circuitBreakers.set(operationId, new CircuitBreaker({
                threshold: this.config.circuitBreakerThreshold,
                timeout: this.config.circuitBreakerTimeout
            }));
        }
        
        return this.circuitBreakers.get(operationId);
    }

    /**
     * Record successful operation
     * @param {string} operationId - Operation ID
     * @param {number} attempts - Number of attempts
     * @param {number} duration - Execution duration
     * @private
     */
    _recordSuccess(operationId, attempts, duration) {
        this.retryStatistics.recordSuccess(operationId, attempts, duration);
        
        if (!this.retryHistory.has(operationId)) {
            this.retryHistory.set(operationId, []);
        }
        
        this.retryHistory.get(operationId).push({
            success: true,
            attempts,
            duration,
            timestamp: new Date()
        });
        
        this._cleanupHistory(operationId);
    }

    /**
     * Record failed operation
     * @param {string} operationId - Operation ID
     * @param {number} attempt - Current attempt
     * @param {Error} error - Error that occurred
     * @private
     */
    _recordFailure(operationId, attempt, error) {
        this.retryStatistics.recordFailure(operationId, attempt, error);
        
        if (!this.retryHistory.has(operationId)) {
            this.retryHistory.set(operationId, []);
        }
        
        this.retryHistory.get(operationId).push({
            success: false,
            attempt,
            error: error.message,
            timestamp: new Date()
        });
        
        this._cleanupHistory(operationId);
    }

    /**
     * Cleanup old history entries
     * @param {string} operationId - Operation ID
     * @private
     */
    _cleanupHistory(operationId) {
        const history = this.retryHistory.get(operationId);
        const maxHistorySize = 100;
        
        if (history.length > maxHistorySize) {
            history.splice(0, history.length - maxHistorySize);
        }
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
     * Delay execution
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise} Promise that resolves after delay
     * @private
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get retry statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        return this.retryStatistics.getStatistics();
    }

    /**
     * Get circuit breaker status for all operations
     * @returns {Object} Circuit breaker statuses
     */
    getCircuitBreakerStatus() {
        const status = {};
        
        for (const [operationId, breaker] of this.circuitBreakers.entries()) {
            status[operationId] = breaker.getStatus();
        }
        
        return status;
    }

    /**
     * Reset circuit breaker for specific operation
     * @param {string} operationId - Operation ID
     */
    resetCircuitBreaker(operationId) {
        const breaker = this.circuitBreakers.get(operationId);
        if (breaker) {
            breaker.reset();
            log('info', `Circuit breaker reset for operation ${operationId}`);
        }
    }

    /**
     * Reset all circuit breakers
     */
    resetAllCircuitBreakers() {
        for (const [operationId, breaker] of this.circuitBreakers.entries()) {
            breaker.reset();
        }
        log('info', 'All circuit breakers reset');
    }

    /**
     * Get operation history
     * @param {string} operationId - Operation ID
     * @returns {Array} Operation history
     */
    getOperationHistory(operationId) {
        return this.retryHistory.get(operationId) || [];
    }

    /**
     * Clear operation history
     * @param {string} operationId - Operation ID (optional, clears all if not provided)
     */
    clearHistory(operationId = null) {
        if (operationId) {
            this.retryHistory.delete(operationId);
        } else {
            this.retryHistory.clear();
        }
    }
}

/**
 * Circuit Breaker implementation
 */
class CircuitBreaker {
    constructor(config = {}) {
        this.threshold = config.threshold || 5;
        this.timeout = config.timeout || 60000;
        this.failures = 0;
        this.successes = 0;
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
        this.successes++;
        
        if (this.state === 'HALF_OPEN') {
            this.state = 'CLOSED';
            this.failures = 0;
        }
    }

    /**
     * Record a failed operation
     */
    recordFailure() {
        this.failures++;
        this.lastFailureTime = Date.now();
        
        if (this.failures >= this.threshold) {
            this.state = 'OPEN';
        }
    }

    /**
     * Reset circuit breaker
     */
    reset() {
        this.failures = 0;
        this.successes = 0;
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
            successes: this.successes,
            threshold: this.threshold,
            lastFailureTime: this.lastFailureTime,
            timeUntilHalfOpen: this.state === 'OPEN' ? 
                Math.max(0, this.timeout - (Date.now() - this.lastFailureTime)) : 0
        };
    }
}

/**
 * Retry Statistics tracking
 */
class RetryStatistics {
    constructor() {
        this.operations = new Map();
        this.globalStats = {
            totalOperations: 0,
            totalSuccesses: 0,
            totalFailures: 0,
            totalRetries: 0,
            totalDuration: 0
        };
    }

    /**
     * Record successful operation
     * @param {string} operationId - Operation ID
     * @param {number} attempts - Number of attempts
     * @param {number} duration - Duration in ms
     */
    recordSuccess(operationId, attempts, duration) {
        this._ensureOperationStats(operationId);
        
        const stats = this.operations.get(operationId);
        stats.successes++;
        stats.totalAttempts += attempts;
        stats.totalDuration += duration;
        stats.lastSuccess = new Date();
        
        this.globalStats.totalOperations++;
        this.globalStats.totalSuccesses++;
        this.globalStats.totalRetries += (attempts - 1);
        this.globalStats.totalDuration += duration;
    }

    /**
     * Record failed operation
     * @param {string} operationId - Operation ID
     * @param {number} attempt - Current attempt
     * @param {Error} error - Error
     */
    recordFailure(operationId, attempt, error) {
        this._ensureOperationStats(operationId);
        
        const stats = this.operations.get(operationId);
        stats.failures++;
        stats.lastFailure = new Date();
        stats.lastError = error.message;
        
        if (attempt === 1) {
            this.globalStats.totalOperations++;
        }
        this.globalStats.totalFailures++;
    }

    /**
     * Ensure operation statistics exist
     * @param {string} operationId - Operation ID
     * @private
     */
    _ensureOperationStats(operationId) {
        if (!this.operations.has(operationId)) {
            this.operations.set(operationId, {
                successes: 0,
                failures: 0,
                totalAttempts: 0,
                totalDuration: 0,
                lastSuccess: null,
                lastFailure: null,
                lastError: null
            });
        }
    }

    /**
     * Get comprehensive statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        const operationStats = {};
        
        for (const [operationId, stats] of this.operations.entries()) {
            operationStats[operationId] = {
                ...stats,
                successRate: stats.successes / (stats.successes + stats.failures),
                averageAttempts: stats.successes > 0 ? stats.totalAttempts / stats.successes : 0,
                averageDuration: stats.successes > 0 ? stats.totalDuration / stats.successes : 0
            };
        }
        
        return {
            global: {
                ...this.globalStats,
                successRate: this.globalStats.totalSuccesses / this.globalStats.totalOperations,
                averageRetries: this.globalStats.totalRetries / this.globalStats.totalOperations,
                averageDuration: this.globalStats.totalDuration / this.globalStats.totalOperations
            },
            operations: operationStats
        };
    }

    /**
     * Reset all statistics
     */
    reset() {
        this.operations.clear();
        this.globalStats = {
            totalOperations: 0,
            totalSuccesses: 0,
            totalFailures: 0,
            totalRetries: 0,
            totalDuration: 0
        };
    }
}

/**
 * Custom error for retry exhaustion
 */
export class RetryExhaustedError extends Error {
    constructor(message, originalError, attempts) {
        super(message);
        this.name = 'RetryExhaustedError';
        this.originalError = originalError;
        this.attempts = attempts;
        this.code = 'RETRY_EXHAUSTED';
    }
}

export default RetryManager;

