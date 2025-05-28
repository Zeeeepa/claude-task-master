/**
 * @fileoverview Advanced Retry Strategies
 * @description Implements intelligent retry mechanisms with exponential backoff, jitter, and adaptive strategies
 */

import { log } from '../../../scripts/modules/utils.js';
import { ERROR_CATEGORIES } from './error_analyzer.js';

/**
 * Retry strategy types
 */
export const RETRY_STRATEGIES = {
    FIXED_DELAY: 'FIXED_DELAY',
    LINEAR_BACKOFF: 'LINEAR_BACKOFF',
    EXPONENTIAL_BACKOFF: 'EXPONENTIAL_BACKOFF',
    EXPONENTIAL_BACKOFF_WITH_JITTER: 'EXPONENTIAL_BACKOFF_WITH_JITTER',
    ADAPTIVE: 'ADAPTIVE',
    CIRCUIT_BREAKER: 'CIRCUIT_BREAKER',
    BULKHEAD: 'BULKHEAD'
};

/**
 * Retry states
 */
export const RETRY_STATES = {
    IDLE: 'IDLE',
    RETRYING: 'RETRYING',
    WAITING: 'WAITING',
    EXHAUSTED: 'EXHAUSTED',
    SUCCEEDED: 'SUCCEEDED',
    FAILED: 'FAILED'
};

/**
 * Advanced Retry Strategy Manager
 */
export class RetryStrategyManager {
    constructor(config = {}) {
        this.config = {
            enableRetry: config.enableRetry !== false,
            defaultMaxRetries: config.defaultMaxRetries || 3,
            defaultBaseDelay: config.defaultBaseDelay || 1000,
            defaultMaxDelay: config.defaultMaxDelay || 30000,
            defaultTimeout: config.defaultTimeout || 60000,
            enableAdaptive: config.enableAdaptive !== false,
            enableCircuitBreaker: config.enableCircuitBreaker !== false,
            jitterFactor: config.jitterFactor || 0.1,
            ...config
        };

        this.retryHistory = [];
        this.adaptiveStrategies = new Map();
        this.circuitBreakers = new Map();
        this.bulkheads = new Map();
        this.retryMetrics = new RetryMetrics();
    }

    /**
     * Execute operation with retry strategy
     * @param {Function} operation - Operation to retry
     * @param {Object} retryConfig - Retry configuration
     * @param {Object} context - Execution context
     * @returns {Promise<Object>} Operation result
     */
    async executeWithRetry(operation, retryConfig = {}, context = {}) {
        if (!this.config.enableRetry) {
            return await operation();
        }

        const config = this._mergeConfig(retryConfig);
        const strategy = this._selectStrategy(config, context);
        const retryId = this._generateRetryId();

        const retrySession = {
            id: retryId,
            startTime: Date.now(),
            strategy: strategy.type,
            config,
            context,
            attempts: [],
            state: RETRY_STATES.IDLE
        };

        try {
            log('debug', 'Starting retry session', {
                retryId,
                strategy: strategy.type,
                maxRetries: config.maxRetries
            });

            const result = await this._executeWithStrategy(operation, strategy, retrySession);
            
            retrySession.state = RETRY_STATES.SUCCEEDED;
            retrySession.endTime = Date.now();
            retrySession.duration = retrySession.endTime - retrySession.startTime;

            this._recordRetrySession(retrySession);
            this.retryMetrics.recordSuccess(retrySession);

            return result;

        } catch (error) {
            retrySession.state = RETRY_STATES.FAILED;
            retrySession.endTime = Date.now();
            retrySession.duration = retrySession.endTime - retrySession.startTime;
            retrySession.finalError = error;

            this._recordRetrySession(retrySession);
            this.retryMetrics.recordFailure(retrySession);

            throw error;
        }
    }

    /**
     * Execute operation with specific strategy
     * @param {Function} operation - Operation to execute
     * @param {Object} strategy - Retry strategy
     * @param {Object} retrySession - Retry session
     * @returns {Promise<any>} Operation result
     * @private
     */
    async _executeWithStrategy(operation, strategy, retrySession) {
        let lastError;
        let attempt = 0;

        retrySession.state = RETRY_STATES.RETRYING;

        while (attempt <= strategy.maxRetries) {
            const attemptStart = Date.now();
            
            try {
                // Check circuit breaker if enabled
                if (strategy.circuitBreaker && strategy.circuitBreaker.isOpen()) {
                    throw new Error('Circuit breaker is open');
                }

                // Execute operation
                const result = await this._executeAttempt(operation, attempt, retrySession);
                
                // Record successful attempt
                const attemptRecord = {
                    number: attempt,
                    startTime: attemptStart,
                    endTime: Date.now(),
                    duration: Date.now() - attemptStart,
                    success: true,
                    result
                };

                retrySession.attempts.push(attemptRecord);

                // Update circuit breaker on success
                if (strategy.circuitBreaker) {
                    strategy.circuitBreaker.recordSuccess();
                }

                log('debug', 'Operation succeeded', {
                    retryId: retrySession.id,
                    attempt,
                    duration: attemptRecord.duration
                });

                return result;

            } catch (error) {
                lastError = error;
                
                // Record failed attempt
                const attemptRecord = {
                    number: attempt,
                    startTime: attemptStart,
                    endTime: Date.now(),
                    duration: Date.now() - attemptStart,
                    success: false,
                    error: {
                        message: error.message,
                        name: error.name,
                        code: error.code
                    }
                };

                retrySession.attempts.push(attemptRecord);

                // Update circuit breaker on failure
                if (strategy.circuitBreaker) {
                    strategy.circuitBreaker.recordFailure();
                }

                // Check if we should retry
                if (attempt >= strategy.maxRetries || !this._shouldRetry(error, strategy, retrySession)) {
                    log('warning', 'Retry attempts exhausted', {
                        retryId: retrySession.id,
                        attempts: attempt + 1,
                        finalError: error.message
                    });
                    
                    retrySession.state = RETRY_STATES.EXHAUSTED;
                    throw error;
                }

                // Calculate delay for next attempt
                const delay = this._calculateDelay(attempt, strategy, retrySession);
                
                log('debug', 'Operation failed, retrying', {
                    retryId: retrySession.id,
                    attempt,
                    error: error.message,
                    nextDelay: delay
                });

                // Wait before next attempt
                if (delay > 0) {
                    retrySession.state = RETRY_STATES.WAITING;
                    await this._delay(delay);
                    retrySession.state = RETRY_STATES.RETRYING;
                }

                attempt++;
            }
        }

        throw lastError;
    }

    /**
     * Execute single attempt with timeout and monitoring
     * @param {Function} operation - Operation to execute
     * @param {number} attempt - Attempt number
     * @param {Object} retrySession - Retry session
     * @returns {Promise<any>} Operation result
     * @private
     */
    async _executeAttempt(operation, attempt, retrySession) {
        const timeout = retrySession.config.timeout;
        
        if (timeout > 0) {
            return await Promise.race([
                operation(),
                new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Operation timeout')), timeout);
                })
            ]);
        } else {
            return await operation();
        }
    }

    /**
     * Select appropriate retry strategy
     * @param {Object} config - Retry configuration
     * @param {Object} context - Execution context
     * @returns {Object} Selected strategy
     * @private
     */
    _selectStrategy(config, context) {
        let strategyType = config.strategy || RETRY_STRATEGIES.EXPONENTIAL_BACKOFF;

        // Use adaptive strategy if enabled and available
        if (this.config.enableAdaptive && context.errorCategory) {
            const adaptiveStrategy = this.adaptiveStrategies.get(context.errorCategory);
            if (adaptiveStrategy) {
                strategyType = adaptiveStrategy.type;
                config = { ...config, ...adaptiveStrategy.config };
            }
        }

        const strategy = {
            type: strategyType,
            maxRetries: config.maxRetries,
            baseDelay: config.baseDelay,
            maxDelay: config.maxDelay,
            multiplier: config.multiplier || 2,
            jitterFactor: config.jitterFactor || this.config.jitterFactor
        };

        // Add circuit breaker if enabled
        if (this.config.enableCircuitBreaker) {
            const breakerKey = context.operationKey || 'default';
            strategy.circuitBreaker = this._getCircuitBreaker(breakerKey);
        }

        return strategy;
    }

    /**
     * Calculate delay for next retry attempt
     * @param {number} attempt - Current attempt number
     * @param {Object} strategy - Retry strategy
     * @param {Object} retrySession - Retry session
     * @returns {number} Delay in milliseconds
     * @private
     */
    _calculateDelay(attempt, strategy, retrySession) {
        let delay;

        switch (strategy.type) {
            case RETRY_STRATEGIES.FIXED_DELAY:
                delay = strategy.baseDelay;
                break;

            case RETRY_STRATEGIES.LINEAR_BACKOFF:
                delay = strategy.baseDelay * (attempt + 1);
                break;

            case RETRY_STRATEGIES.EXPONENTIAL_BACKOFF:
                delay = strategy.baseDelay * Math.pow(strategy.multiplier, attempt);
                break;

            case RETRY_STRATEGIES.EXPONENTIAL_BACKOFF_WITH_JITTER:
                delay = strategy.baseDelay * Math.pow(strategy.multiplier, attempt);
                delay = this._addJitter(delay, strategy.jitterFactor);
                break;

            case RETRY_STRATEGIES.ADAPTIVE:
                delay = this._calculateAdaptiveDelay(attempt, strategy, retrySession);
                break;

            default:
                delay = strategy.baseDelay * Math.pow(strategy.multiplier, attempt);
        }

        // Cap delay at maximum
        return Math.min(delay, strategy.maxDelay);
    }

    /**
     * Calculate adaptive delay based on historical performance
     * @param {number} attempt - Current attempt number
     * @param {Object} strategy - Retry strategy
     * @param {Object} retrySession - Retry session
     * @returns {number} Adaptive delay
     * @private
     */
    _calculateAdaptiveDelay(attempt, strategy, retrySession) {
        const category = retrySession.context.errorCategory;
        const metrics = this.retryMetrics.getMetrics(category);

        if (!metrics || metrics.totalAttempts < 10) {
            // Fall back to exponential backoff if insufficient data
            return strategy.baseDelay * Math.pow(strategy.multiplier, attempt);
        }

        // Adjust delay based on success rate and average duration
        const successRate = metrics.successRate;
        const avgDuration = metrics.averageDuration;

        let adaptiveMultiplier = strategy.multiplier;

        // Increase delay if success rate is low
        if (successRate < 0.5) {
            adaptiveMultiplier *= 1.5;
        } else if (successRate > 0.8) {
            adaptiveMultiplier *= 0.8;
        }

        // Adjust based on average duration
        if (avgDuration > 10000) { // 10 seconds
            adaptiveMultiplier *= 1.2;
        }

        const delay = strategy.baseDelay * Math.pow(adaptiveMultiplier, attempt);
        return this._addJitter(delay, strategy.jitterFactor);
    }

    /**
     * Add jitter to delay to prevent thundering herd
     * @param {number} delay - Base delay
     * @param {number} jitterFactor - Jitter factor (0-1)
     * @returns {number} Delay with jitter
     * @private
     */
    _addJitter(delay, jitterFactor) {
        const jitter = delay * jitterFactor * (Math.random() - 0.5) * 2;
        return Math.max(0, delay + jitter);
    }

    /**
     * Determine if operation should be retried
     * @param {Error} error - Last error
     * @param {Object} strategy - Retry strategy
     * @param {Object} retrySession - Retry session
     * @returns {boolean} Whether to retry
     * @private
     */
    _shouldRetry(error, strategy, retrySession) {
        // Don't retry certain error types
        const nonRetryableErrors = [
            'AUTHENTICATION_FAILED',
            'AUTHORIZATION_FAILED',
            'INVALID_REQUEST',
            'NOT_FOUND'
        ];

        if (nonRetryableErrors.includes(error.code)) {
            return false;
        }

        // Don't retry if circuit breaker is open
        if (strategy.circuitBreaker && strategy.circuitBreaker.isOpen()) {
            return false;
        }

        // Check error category specific rules
        const category = retrySession.context.errorCategory;
        if (category) {
            return this._shouldRetryForCategory(error, category, retrySession);
        }

        return true;
    }

    /**
     * Check if error should be retried for specific category
     * @param {Error} error - Error to check
     * @param {string} category - Error category
     * @param {Object} retrySession - Retry session
     * @returns {boolean} Whether to retry
     * @private
     */
    _shouldRetryForCategory(error, category, retrySession) {
        const retryableCategories = [
            ERROR_CATEGORIES.NETWORK,
            ERROR_CATEGORIES.TIMEOUT,
            ERROR_CATEGORIES.RATE_LIMIT,
            ERROR_CATEGORIES.RESOURCE
        ];

        return retryableCategories.includes(category);
    }

    /**
     * Get or create circuit breaker for operation
     * @param {string} key - Circuit breaker key
     * @returns {Object} Circuit breaker
     * @private
     */
    _getCircuitBreaker(key) {
        if (!this.circuitBreakers.has(key)) {
            this.circuitBreakers.set(key, new CircuitBreaker({
                threshold: 5,
                timeout: 60000,
                monitoringPeriod: 10000
            }));
        }
        return this.circuitBreakers.get(key);
    }

    /**
     * Merge configuration with defaults
     * @param {Object} config - User configuration
     * @returns {Object} Merged configuration
     * @private
     */
    _mergeConfig(config) {
        return {
            maxRetries: config.maxRetries || this.config.defaultMaxRetries,
            baseDelay: config.baseDelay || this.config.defaultBaseDelay,
            maxDelay: config.maxDelay || this.config.defaultMaxDelay,
            timeout: config.timeout || this.config.defaultTimeout,
            strategy: config.strategy || RETRY_STRATEGIES.EXPONENTIAL_BACKOFF,
            ...config
        };
    }

    /**
     * Create delay promise
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise<void>} Delay promise
     * @private
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Record retry session for analysis
     * @param {Object} retrySession - Retry session to record
     * @private
     */
    _recordRetrySession(retrySession) {
        this.retryHistory.push(retrySession);
        this._pruneHistory();

        // Update adaptive strategies if enabled
        if (this.config.enableAdaptive && retrySession.context.errorCategory) {
            this._updateAdaptiveStrategy(retrySession);
        }
    }

    /**
     * Update adaptive strategy based on session results
     * @param {Object} retrySession - Completed retry session
     * @private
     */
    _updateAdaptiveStrategy(retrySession) {
        const category = retrySession.context.errorCategory;
        const currentStrategy = this.adaptiveStrategies.get(category) || {
            type: RETRY_STRATEGIES.EXPONENTIAL_BACKOFF,
            config: {},
            performance: { successRate: 0.5, averageDuration: 5000 }
        };

        // Analyze session performance
        const sessionSuccess = retrySession.state === RETRY_STATES.SUCCEEDED;
        const sessionDuration = retrySession.duration;
        const attemptCount = retrySession.attempts.length;

        // Update performance metrics
        const alpha = 0.1; // Learning rate
        currentStrategy.performance.successRate = 
            (1 - alpha) * currentStrategy.performance.successRate + 
            alpha * (sessionSuccess ? 1 : 0);
        
        currentStrategy.performance.averageDuration = 
            (1 - alpha) * currentStrategy.performance.averageDuration + 
            alpha * sessionDuration;

        // Adjust strategy based on performance
        if (currentStrategy.performance.successRate < 0.3 && attemptCount > 2) {
            // Poor success rate, try more aggressive backoff
            currentStrategy.type = RETRY_STRATEGIES.EXPONENTIAL_BACKOFF_WITH_JITTER;
            currentStrategy.config.multiplier = 3;
        } else if (currentStrategy.performance.successRate > 0.8) {
            // Good success rate, try faster retries
            currentStrategy.type = RETRY_STRATEGIES.LINEAR_BACKOFF;
            currentStrategy.config.multiplier = 1.5;
        }

        this.adaptiveStrategies.set(category, currentStrategy);
    }

    /**
     * Generate unique retry ID
     * @returns {string} Unique ID
     * @private
     */
    _generateRetryId() {
        return `retry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Prune retry history to prevent memory leaks
     * @private
     */
    _pruneHistory() {
        const maxHistory = 1000;
        if (this.retryHistory.length > maxHistory) {
            this.retryHistory = this.retryHistory.slice(-maxHistory);
        }
    }

    /**
     * Get retry statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        const strategyStats = {};
        const outcomeStats = {};
        
        for (const session of this.retryHistory) {
            strategyStats[session.strategy] = (strategyStats[session.strategy] || 0) + 1;
            outcomeStats[session.state] = (outcomeStats[session.state] || 0) + 1;
        }

        const totalSessions = this.retryHistory.length;
        const successfulSessions = this.retryHistory.filter(s => s.state === RETRY_STATES.SUCCEEDED).length;

        return {
            totalSessions,
            successfulSessions,
            successRate: totalSessions > 0 ? successfulSessions / totalSessions : 0,
            strategyStats,
            outcomeStats,
            averageDuration: this.retryHistory.reduce((sum, s) => sum + (s.duration || 0), 0) / totalSessions || 0,
            averageAttempts: this.retryHistory.reduce((sum, s) => sum + s.attempts.length, 0) / totalSessions || 0,
            adaptiveStrategies: Array.from(this.adaptiveStrategies.entries()),
            circuitBreakerStats: this._getCircuitBreakerStats(),
            retryMetrics: this.retryMetrics.getAllMetrics()
        };
    }

    /**
     * Get circuit breaker statistics
     * @returns {Object} Circuit breaker stats
     * @private
     */
    _getCircuitBreakerStats() {
        const stats = {};
        for (const [key, breaker] of this.circuitBreakers.entries()) {
            stats[key] = breaker.getStats();
        }
        return stats;
    }

    /**
     * Reset retry strategy manager
     */
    reset() {
        this.retryHistory = [];
        this.adaptiveStrategies.clear();
        this.circuitBreakers.clear();
        this.bulkheads.clear();
        this.retryMetrics.reset();
    }
}

/**
 * Circuit Breaker implementation for preventing cascading failures
 */
class CircuitBreaker {
    constructor(config = {}) {
        this.threshold = config.threshold || 5;
        this.timeout = config.timeout || 60000;
        this.monitoringPeriod = config.monitoringPeriod || 10000;
        
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.failures = 0;
        this.successes = 0;
        this.lastFailureTime = null;
        this.lastSuccessTime = null;
        this.requestCount = 0;
    }

    /**
     * Check if circuit breaker is open
     * @returns {boolean} Whether circuit is open
     */
    isOpen() {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime > this.timeout) {
                this.state = 'HALF_OPEN';
                this.requestCount = 0;
                return false;
            }
            return true;
        }
        return false;
    }

    /**
     * Record successful operation
     */
    recordSuccess() {
        this.successes++;
        this.lastSuccessTime = Date.now();
        
        if (this.state === 'HALF_OPEN') {
            this.requestCount++;
            if (this.requestCount >= 3) { // Require 3 successes to close
                this.state = 'CLOSED';
                this.failures = 0;
            }
        } else if (this.state === 'CLOSED') {
            this.failures = Math.max(0, this.failures - 1);
        }
    }

    /**
     * Record failed operation
     */
    recordFailure() {
        this.failures++;
        this.lastFailureTime = Date.now();
        
        if (this.state === 'HALF_OPEN' || this.failures >= this.threshold) {
            this.state = 'OPEN';
        }
    }

    /**
     * Get circuit breaker statistics
     * @returns {Object} Statistics
     */
    getStats() {
        return {
            state: this.state,
            failures: this.failures,
            successes: this.successes,
            threshold: this.threshold,
            lastFailureTime: this.lastFailureTime,
            lastSuccessTime: this.lastSuccessTime,
            timeUntilHalfOpen: this.state === 'OPEN' ? 
                Math.max(0, this.timeout - (Date.now() - this.lastFailureTime)) : 0
        };
    }

    /**
     * Reset circuit breaker
     */
    reset() {
        this.state = 'CLOSED';
        this.failures = 0;
        this.successes = 0;
        this.lastFailureTime = null;
        this.lastSuccessTime = null;
        this.requestCount = 0;
    }
}

/**
 * Retry Metrics for tracking performance
 */
class RetryMetrics {
    constructor() {
        this.metrics = new Map();
    }

    /**
     * Record successful retry session
     * @param {Object} retrySession - Retry session
     */
    recordSuccess(retrySession) {
        this._updateMetrics(retrySession, true);
    }

    /**
     * Record failed retry session
     * @param {Object} retrySession - Retry session
     */
    recordFailure(retrySession) {
        this._updateMetrics(retrySession, false);
    }

    /**
     * Update metrics for category
     * @param {Object} retrySession - Retry session
     * @param {boolean} success - Whether session succeeded
     * @private
     */
    _updateMetrics(retrySession, success) {
        const category = retrySession.context.errorCategory || 'default';
        
        if (!this.metrics.has(category)) {
            this.metrics.set(category, {
                totalAttempts: 0,
                successfulAttempts: 0,
                totalDuration: 0,
                totalRetries: 0,
                successRate: 0,
                averageDuration: 0,
                averageRetries: 0
            });
        }

        const metrics = this.metrics.get(category);
        metrics.totalAttempts++;
        metrics.totalDuration += retrySession.duration || 0;
        metrics.totalRetries += retrySession.attempts.length;

        if (success) {
            metrics.successfulAttempts++;
        }

        // Update calculated metrics
        metrics.successRate = metrics.successfulAttempts / metrics.totalAttempts;
        metrics.averageDuration = metrics.totalDuration / metrics.totalAttempts;
        metrics.averageRetries = metrics.totalRetries / metrics.totalAttempts;
    }

    /**
     * Get metrics for specific category
     * @param {string} category - Error category
     * @returns {Object} Metrics
     */
    getMetrics(category) {
        return this.metrics.get(category);
    }

    /**
     * Get all metrics
     * @returns {Object} All metrics
     */
    getAllMetrics() {
        const result = {};
        for (const [category, metrics] of this.metrics.entries()) {
            result[category] = { ...metrics };
        }
        return result;
    }

    /**
     * Reset metrics
     */
    reset() {
        this.metrics.clear();
    }
}

export default RetryStrategyManager;

