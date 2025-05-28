/**
 * @fileoverview Circuit Breaker Pattern Implementation
 * @description Advanced circuit breaker with multiple states and adaptive thresholds
 */

import { log } from '../utils/getVersion.js';
import { EventEmitter } from 'events';

/**
 * Circuit breaker states
 */
export const CircuitState = {
    CLOSED: 'CLOSED',
    OPEN: 'OPEN',
    HALF_OPEN: 'HALF_OPEN'
};

/**
 * Circuit breaker strategies
 */
export const CircuitStrategy = {
    FAILURE_COUNT: 'failure_count',
    FAILURE_RATE: 'failure_rate',
    RESPONSE_TIME: 'response_time',
    HYBRID: 'hybrid'
};

/**
 * Advanced Circuit Breaker with adaptive thresholds and multiple strategies
 */
export class CircuitBreaker extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            name: config.name || 'default',
            strategy: config.strategy || CircuitStrategy.FAILURE_COUNT,
            failureThreshold: config.failureThreshold || 5,
            failureRateThreshold: config.failureRateThreshold || 0.5, // 50%
            responseTimeThreshold: config.responseTimeThreshold || 5000, // 5 seconds
            timeout: config.timeout || 60000, // 1 minute
            halfOpenMaxCalls: config.halfOpenMaxCalls || 3,
            monitoringWindow: config.monitoringWindow || 60000, // 1 minute
            enableAdaptive: config.enableAdaptive !== false,
            enableMetrics: config.enableMetrics !== false,
            ...config
        };

        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.successes = 0;
        this.lastFailureTime = null;
        this.lastSuccessTime = null;
        this.halfOpenCalls = 0;
        this.callHistory = []; // Recent calls for rate calculation
        this.responseTimeHistory = []; // Recent response times
        this.stateChangeHistory = [];
        
        // Adaptive thresholds
        this.adaptiveThresholds = {
            failure: this.config.failureThreshold,
            failureRate: this.config.failureRateThreshold,
            responseTime: this.config.responseTimeThreshold
        };

        // Metrics
        this.metrics = {
            totalCalls: 0,
            totalFailures: 0,
            totalSuccesses: 0,
            totalRejections: 0,
            averageResponseTime: 0,
            stateChanges: 0
        };

        // Periodic cleanup and adaptation
        this.cleanupInterval = setInterval(() => {
            this._cleanup();
            if (this.config.enableAdaptive) {
                this._adaptThresholds();
            }
        }, this.config.monitoringWindow);
    }

    /**
     * Execute operation through circuit breaker
     * @param {Function} operation - Operation to execute
     * @param {Object} options - Execution options
     * @returns {Promise<any>} Operation result
     */
    async execute(operation, options = {}) {
        const startTime = Date.now();
        
        // Check if circuit is open
        if (this.state === CircuitState.OPEN) {
            if (this._shouldAttemptReset()) {
                this._setState(CircuitState.HALF_OPEN);
                log('info', `Circuit breaker ${this.config.name} transitioning to HALF_OPEN`);
            } else {
                this.metrics.totalRejections++;
                const error = new Error(`Circuit breaker ${this.config.name} is OPEN`);
                error.code = 'CIRCUIT_BREAKER_OPEN';
                error.circuitBreaker = this.config.name;
                throw error;
            }
        }

        // Check half-open call limit
        if (this.state === CircuitState.HALF_OPEN) {
            if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
                this.metrics.totalRejections++;
                const error = new Error(`Circuit breaker ${this.config.name} half-open call limit exceeded`);
                error.code = 'CIRCUIT_BREAKER_HALF_OPEN_LIMIT';
                error.circuitBreaker = this.config.name;
                throw error;
            }
            this.halfOpenCalls++;
        }

        this.metrics.totalCalls++;

        try {
            // Execute operation
            const result = await operation();
            const responseTime = Date.now() - startTime;
            
            // Record success
            this._recordSuccess(responseTime);
            
            return result;

        } catch (error) {
            const responseTime = Date.now() - startTime;
            
            // Record failure
            this._recordFailure(error, responseTime);
            
            throw error;
        }
    }

    /**
     * Record successful operation
     * @param {number} responseTime - Response time in milliseconds
     * @private
     */
    _recordSuccess(responseTime) {
        this.successes++;
        this.lastSuccessTime = Date.now();
        this.metrics.totalSuccesses++;
        
        // Record call and response time
        this._recordCall(true, responseTime);
        this._recordResponseTime(responseTime);

        // Handle state transitions
        if (this.state === CircuitState.HALF_OPEN) {
            // Check if we should close the circuit
            if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
                this._setState(CircuitState.CLOSED);
                this.failures = 0;
                this.halfOpenCalls = 0;
                log('info', `Circuit breaker ${this.config.name} closed after successful half-open test`);
            }
        }

        this.emit('success', {
            circuitBreaker: this.config.name,
            responseTime,
            state: this.state
        });
    }

    /**
     * Record failed operation
     * @param {Error} error - The error that occurred
     * @param {number} responseTime - Response time in milliseconds
     * @private
     */
    _recordFailure(error, responseTime) {
        this.failures++;
        this.lastFailureTime = Date.now();
        this.metrics.totalFailures++;
        
        // Record call and response time
        this._recordCall(false, responseTime);
        this._recordResponseTime(responseTime);

        // Check if circuit should open
        if (this.state === CircuitState.CLOSED || this.state === CircuitState.HALF_OPEN) {
            if (this._shouldOpenCircuit()) {
                this._setState(CircuitState.OPEN);
                log('warning', `Circuit breaker ${this.config.name} opened due to failures`, {
                    failures: this.failures,
                    strategy: this.config.strategy
                });
            }
        }

        // Reset half-open state on failure
        if (this.state === CircuitState.HALF_OPEN) {
            this._setState(CircuitState.OPEN);
            this.halfOpenCalls = 0;
            log('warning', `Circuit breaker ${this.config.name} reopened after half-open failure`);
        }

        this.emit('failure', {
            circuitBreaker: this.config.name,
            error: error.message,
            responseTime,
            state: this.state
        });
    }

    /**
     * Record call for rate calculation
     * @param {boolean} success - Whether call was successful
     * @param {number} responseTime - Response time
     * @private
     */
    _recordCall(success, responseTime) {
        const call = {
            timestamp: Date.now(),
            success,
            responseTime
        };
        
        this.callHistory.push(call);
        
        // Keep only recent calls within monitoring window
        const cutoff = Date.now() - this.config.monitoringWindow;
        this.callHistory = this.callHistory.filter(call => call.timestamp > cutoff);
    }

    /**
     * Record response time for analysis
     * @param {number} responseTime - Response time in milliseconds
     * @private
     */
    _recordResponseTime(responseTime) {
        this.responseTimeHistory.push({
            timestamp: Date.now(),
            responseTime
        });
        
        // Keep only recent response times
        const cutoff = Date.now() - this.config.monitoringWindow;
        this.responseTimeHistory = this.responseTimeHistory.filter(
            record => record.timestamp > cutoff
        );
        
        // Update average response time
        if (this.responseTimeHistory.length > 0) {
            const sum = this.responseTimeHistory.reduce((acc, record) => acc + record.responseTime, 0);
            this.metrics.averageResponseTime = sum / this.responseTimeHistory.length;
        }
    }

    /**
     * Determine if circuit should open based on strategy
     * @returns {boolean} Whether circuit should open
     * @private
     */
    _shouldOpenCircuit() {
        switch (this.config.strategy) {
            case CircuitStrategy.FAILURE_COUNT:
                return this.failures >= this.adaptiveThresholds.failure;
                
            case CircuitStrategy.FAILURE_RATE:
                return this._getFailureRate() >= this.adaptiveThresholds.failureRate;
                
            case CircuitStrategy.RESPONSE_TIME:
                return this.metrics.averageResponseTime >= this.adaptiveThresholds.responseTime;
                
            case CircuitStrategy.HYBRID:
                return this._shouldOpenCircuitHybrid();
                
            default:
                return this.failures >= this.adaptiveThresholds.failure;
        }
    }

    /**
     * Hybrid strategy for opening circuit
     * @returns {boolean} Whether circuit should open
     * @private
     */
    _shouldOpenCircuitHybrid() {
        const failureCount = this.failures >= this.adaptiveThresholds.failure;
        const failureRate = this._getFailureRate() >= this.adaptiveThresholds.failureRate;
        const responseTime = this.metrics.averageResponseTime >= this.adaptiveThresholds.responseTime;
        
        // Open if any two conditions are met
        const conditions = [failureCount, failureRate, responseTime];
        const metConditions = conditions.filter(Boolean).length;
        
        return metConditions >= 2;
    }

    /**
     * Get current failure rate
     * @returns {number} Failure rate (0-1)
     * @private
     */
    _getFailureRate() {
        if (this.callHistory.length === 0) return 0;
        
        const failures = this.callHistory.filter(call => !call.success).length;
        return failures / this.callHistory.length;
    }

    /**
     * Check if circuit should attempt reset from OPEN to HALF_OPEN
     * @returns {boolean} Whether to attempt reset
     * @private
     */
    _shouldAttemptReset() {
        if (!this.lastFailureTime) return false;
        return Date.now() - this.lastFailureTime >= this.config.timeout;
    }

    /**
     * Set circuit state and emit events
     * @param {string} newState - New circuit state
     * @private
     */
    _setState(newState) {
        const oldState = this.state;
        this.state = newState;
        this.metrics.stateChanges++;
        
        // Record state change
        this.stateChangeHistory.push({
            timestamp: Date.now(),
            from: oldState,
            to: newState,
            failures: this.failures,
            successes: this.successes
        });
        
        // Keep only recent state changes
        const cutoff = Date.now() - (this.config.monitoringWindow * 10); // Keep 10x monitoring window
        this.stateChangeHistory = this.stateChangeHistory.filter(
            change => change.timestamp > cutoff
        );

        this.emit('state-change', {
            circuitBreaker: this.config.name,
            from: oldState,
            to: newState,
            timestamp: Date.now()
        });
    }

    /**
     * Adapt thresholds based on historical performance
     * @private
     */
    _adaptThresholds() {
        if (this.stateChangeHistory.length < 3) return; // Need some history
        
        const recentChanges = this.stateChangeHistory.slice(-5); // Last 5 changes
        const openings = recentChanges.filter(change => change.to === CircuitState.OPEN);
        
        if (openings.length > 2) {
            // Too many openings - make thresholds more lenient
            this.adaptiveThresholds.failure = Math.min(
                this.adaptiveThresholds.failure + 1,
                this.config.failureThreshold * 2
            );
            this.adaptiveThresholds.failureRate = Math.min(
                this.adaptiveThresholds.failureRate + 0.1,
                0.8
            );
        } else if (openings.length === 0) {
            // No recent openings - make thresholds more strict
            this.adaptiveThresholds.failure = Math.max(
                this.adaptiveThresholds.failure - 1,
                Math.floor(this.config.failureThreshold / 2)
            );
            this.adaptiveThresholds.failureRate = Math.max(
                this.adaptiveThresholds.failureRate - 0.05,
                0.2
            );
        }

        this.emit('thresholds-adapted', {
            circuitBreaker: this.config.name,
            thresholds: { ...this.adaptiveThresholds }
        });
    }

    /**
     * Clean up old data
     * @private
     */
    _cleanup() {
        const cutoff = Date.now() - this.config.monitoringWindow;
        
        // Clean call history
        this.callHistory = this.callHistory.filter(call => call.timestamp > cutoff);
        
        // Clean response time history
        this.responseTimeHistory = this.responseTimeHistory.filter(
            record => record.timestamp > cutoff
        );
    }

    /**
     * Get circuit breaker status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            name: this.config.name,
            state: this.state,
            failures: this.failures,
            successes: this.successes,
            halfOpenCalls: this.halfOpenCalls,
            lastFailureTime: this.lastFailureTime,
            lastSuccessTime: this.lastSuccessTime,
            failureRate: this._getFailureRate(),
            averageResponseTime: this.metrics.averageResponseTime,
            timeUntilRetry: this.state === CircuitState.OPEN && this.lastFailureTime ? 
                Math.max(0, this.config.timeout - (Date.now() - this.lastFailureTime)) : 0,
            thresholds: { ...this.adaptiveThresholds },
            config: { ...this.config }
        };
    }

    /**
     * Get detailed metrics
     * @returns {Object} Metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            currentFailureRate: this._getFailureRate(),
            recentCalls: this.callHistory.length,
            stateHistory: [...this.stateChangeHistory]
        };
    }

    /**
     * Force circuit state (for testing/manual intervention)
     * @param {string} state - State to set
     */
    forceState(state) {
        if (Object.values(CircuitState).includes(state)) {
            this._setState(state);
            if (state === CircuitState.CLOSED) {
                this.failures = 0;
                this.halfOpenCalls = 0;
            }
            log('warning', `Circuit breaker ${this.config.name} state forced to ${state}`);
        }
    }

    /**
     * Reset circuit breaker to initial state
     */
    reset() {
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.successes = 0;
        this.halfOpenCalls = 0;
        this.lastFailureTime = null;
        this.lastSuccessTime = null;
        this.callHistory = [];
        this.responseTimeHistory = [];
        this.stateChangeHistory = [];
        
        // Reset adaptive thresholds
        this.adaptiveThresholds = {
            failure: this.config.failureThreshold,
            failureRate: this.config.failureRateThreshold,
            responseTime: this.config.responseTimeThreshold
        };
        
        // Reset metrics
        this.metrics = {
            totalCalls: 0,
            totalFailures: 0,
            totalSuccesses: 0,
            totalRejections: 0,
            averageResponseTime: 0,
            stateChanges: 0
        };

        this.emit('reset', { circuitBreaker: this.config.name });
    }

    /**
     * Check if circuit is available for calls
     * @returns {boolean} Whether circuit is available
     */
    isAvailable() {
        if (this.state === CircuitState.OPEN) {
            return this._shouldAttemptReset();
        }
        
        if (this.state === CircuitState.HALF_OPEN) {
            return this.halfOpenCalls < this.config.halfOpenMaxCalls;
        }
        
        return true; // CLOSED state
    }

    /**
     * Get health score (0-1, where 1 is healthy)
     * @returns {number} Health score
     */
    getHealthScore() {
        if (this.metrics.totalCalls === 0) return 1;
        
        const successRate = this.metrics.totalSuccesses / this.metrics.totalCalls;
        const responseTimeScore = this.metrics.averageResponseTime > 0 ? 
            Math.max(0, 1 - (this.metrics.averageResponseTime / (this.config.responseTimeThreshold * 2))) : 1;
        
        // Weight success rate more heavily
        return (successRate * 0.7) + (responseTimeScore * 0.3);
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

/**
 * Circuit Breaker Manager for managing multiple circuit breakers
 */
export class CircuitBreakerManager extends EventEmitter {
    constructor() {
        super();
        this.circuitBreakers = new Map();
    }

    /**
     * Create or get circuit breaker
     * @param {string} name - Circuit breaker name
     * @param {Object} config - Configuration
     * @returns {CircuitBreaker} Circuit breaker instance
     */
    getCircuitBreaker(name, config = {}) {
        if (!this.circuitBreakers.has(name)) {
            const circuitBreaker = new CircuitBreaker({ ...config, name });
            
            // Forward events
            circuitBreaker.on('state-change', (event) => this.emit('state-change', event));
            circuitBreaker.on('failure', (event) => this.emit('failure', event));
            circuitBreaker.on('success', (event) => this.emit('success', event));
            
            this.circuitBreakers.set(name, circuitBreaker);
        }
        
        return this.circuitBreakers.get(name);
    }

    /**
     * Execute operation through named circuit breaker
     * @param {string} name - Circuit breaker name
     * @param {Function} operation - Operation to execute
     * @param {Object} config - Circuit breaker config
     * @returns {Promise<any>} Operation result
     */
    async execute(name, operation, config = {}) {
        const circuitBreaker = this.getCircuitBreaker(name, config);
        return circuitBreaker.execute(operation);
    }

    /**
     * Get all circuit breaker statuses
     * @returns {Object} All statuses
     */
    getAllStatuses() {
        const statuses = {};
        for (const [name, circuitBreaker] of this.circuitBreakers.entries()) {
            statuses[name] = circuitBreaker.getStatus();
        }
        return statuses;
    }

    /**
     * Get overall health report
     * @returns {Object} Health report
     */
    getHealthReport() {
        const report = {
            timestamp: Date.now(),
            circuitBreakers: {},
            summary: {
                total: this.circuitBreakers.size,
                open: 0,
                halfOpen: 0,
                closed: 0,
                averageHealth: 0
            }
        };

        let totalHealth = 0;
        
        for (const [name, circuitBreaker] of this.circuitBreakers.entries()) {
            const status = circuitBreaker.getStatus();
            const health = circuitBreaker.getHealthScore();
            
            report.circuitBreakers[name] = {
                ...status,
                healthScore: health
            };
            
            totalHealth += health;
            
            switch (status.state) {
                case CircuitState.OPEN:
                    report.summary.open++;
                    break;
                case CircuitState.HALF_OPEN:
                    report.summary.halfOpen++;
                    break;
                case CircuitState.CLOSED:
                    report.summary.closed++;
                    break;
            }
        }
        
        report.summary.averageHealth = this.circuitBreakers.size > 0 ? 
            totalHealth / this.circuitBreakers.size : 1;
        
        return report;
    }

    /**
     * Reset all circuit breakers
     */
    resetAll() {
        for (const circuitBreaker of this.circuitBreakers.values()) {
            circuitBreaker.reset();
        }
    }

    /**
     * Cleanup all resources
     */
    destroy() {
        for (const circuitBreaker of this.circuitBreakers.values()) {
            circuitBreaker.destroy();
        }
        this.circuitBreakers.clear();
        this.removeAllListeners();
    }
}

export default CircuitBreaker;

