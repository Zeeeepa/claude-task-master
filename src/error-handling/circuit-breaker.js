/**
 * @fileoverview Circuit Breaker Implementation
 * @description Circuit breaker pattern to prevent cascade failures
 */

import { log } from '../scripts/modules/utils.js';

/**
 * Circuit breaker states
 */
export const CircuitBreakerState = {
    CLOSED: 'CLOSED',
    OPEN: 'OPEN',
    HALF_OPEN: 'HALF_OPEN'
};

/**
 * Circuit breaker implementation to prevent cascade failures
 */
export class CircuitBreaker {
    constructor(config = {}) {
        this.config = {
            failureThreshold: config.failureThreshold || 5,
            resetTimeout: config.resetTimeout || 60000,
            monitoringPeriod: config.monitoringPeriod || 300000, // 5 minutes
            halfOpenMaxCalls: config.halfOpenMaxCalls || 3,
            successThreshold: config.successThreshold || 2,
            ...config
        };

        // Per-operation type circuit breakers
        this.circuits = new Map();
        this.globalStats = {
            totalCalls: 0,
            totalFailures: 0,
            totalSuccesses: 0,
            circuitsOpened: 0,
            circuitsClosed: 0
        };
    }

    /**
     * Check if circuit breaker is open for operation type
     * @param {string} operationType - Type of operation
     * @returns {boolean} Whether circuit is open
     */
    isOpen(operationType = 'default') {
        const circuit = this._getCircuit(operationType);
        
        if (circuit.state === CircuitBreakerState.OPEN) {
            // Check if reset timeout has passed
            if (Date.now() - circuit.lastFailureTime > this.config.resetTimeout) {
                this._transitionToHalfOpen(circuit, operationType);
                return false;
            }
            return true;
        }

        return false;
    }

    /**
     * Check if circuit breaker is in half-open state
     * @param {string} operationType - Type of operation
     * @returns {boolean} Whether circuit is half-open
     */
    isHalfOpen(operationType = 'default') {
        const circuit = this._getCircuit(operationType);
        return circuit.state === CircuitBreakerState.HALF_OPEN;
    }

    /**
     * Record a successful operation
     * @param {string} operationType - Type of operation
     */
    recordSuccess(operationType = 'default') {
        const circuit = this._getCircuit(operationType);
        
        circuit.successCount++;
        circuit.consecutiveFailures = 0;
        this.globalStats.totalCalls++;
        this.globalStats.totalSuccesses++;

        // Clean old entries
        this._cleanOldEntries(circuit);

        if (circuit.state === CircuitBreakerState.HALF_OPEN) {
            // Check if we should close the circuit
            if (circuit.successCount >= this.config.successThreshold) {
                this._transitionToClosed(circuit, operationType);
            }
        }

        log('debug', 'Circuit breaker recorded success', {
            operationType,
            state: circuit.state,
            successCount: circuit.successCount,
            consecutiveFailures: circuit.consecutiveFailures
        });
    }

    /**
     * Record a failed operation
     * @param {string} operationType - Type of operation
     */
    recordFailure(operationType = 'default') {
        const circuit = this._getCircuit(operationType);
        
        circuit.failureCount++;
        circuit.consecutiveFailures++;
        circuit.lastFailureTime = Date.now();
        this.globalStats.totalCalls++;
        this.globalStats.totalFailures++;

        // Add failure to recent failures
        circuit.recentFailures.push({
            timestamp: Date.now(),
            operationType
        });

        // Clean old entries
        this._cleanOldEntries(circuit);

        // Check if we should open the circuit
        if (circuit.state === CircuitBreakerState.CLOSED) {
            if (this._shouldOpenCircuit(circuit)) {
                this._transitionToOpen(circuit, operationType);
            }
        } else if (circuit.state === CircuitBreakerState.HALF_OPEN) {
            // Any failure in half-open state opens the circuit
            this._transitionToOpen(circuit, operationType);
        }

        log('debug', 'Circuit breaker recorded failure', {
            operationType,
            state: circuit.state,
            failureCount: circuit.failureCount,
            consecutiveFailures: circuit.consecutiveFailures,
            recentFailures: circuit.recentFailures.length
        });
    }

    /**
     * Get circuit for operation type
     * @param {string} operationType - Type of operation
     * @returns {Object} Circuit state
     * @private
     */
    _getCircuit(operationType) {
        if (!this.circuits.has(operationType)) {
            this.circuits.set(operationType, {
                state: CircuitBreakerState.CLOSED,
                failureCount: 0,
                successCount: 0,
                consecutiveFailures: 0,
                lastFailureTime: null,
                lastStateChange: Date.now(),
                recentFailures: [],
                halfOpenCalls: 0
            });
        }
        return this.circuits.get(operationType);
    }

    /**
     * Check if circuit should be opened
     * @param {Object} circuit - Circuit state
     * @returns {boolean} Whether to open circuit
     * @private
     */
    _shouldOpenCircuit(circuit) {
        // Check consecutive failures
        if (circuit.consecutiveFailures >= this.config.failureThreshold) {
            return true;
        }

        // Check failure rate in monitoring period
        const now = Date.now();
        const periodStart = now - this.config.monitoringPeriod;
        const recentFailures = circuit.recentFailures.filter(
            failure => failure.timestamp > periodStart
        );

        if (recentFailures.length >= this.config.failureThreshold) {
            return true;
        }

        return false;
    }

    /**
     * Transition circuit to open state
     * @param {Object} circuit - Circuit state
     * @param {string} operationType - Operation type
     * @private
     */
    _transitionToOpen(circuit, operationType) {
        circuit.state = CircuitBreakerState.OPEN;
        circuit.lastStateChange = Date.now();
        circuit.halfOpenCalls = 0;
        this.globalStats.circuitsOpened++;

        log('warn', 'Circuit breaker opened', {
            operationType,
            failureCount: circuit.failureCount,
            consecutiveFailures: circuit.consecutiveFailures,
            recentFailures: circuit.recentFailures.length
        });
    }

    /**
     * Transition circuit to half-open state
     * @param {Object} circuit - Circuit state
     * @param {string} operationType - Operation type
     * @private
     */
    _transitionToHalfOpen(circuit, operationType) {
        circuit.state = CircuitBreakerState.HALF_OPEN;
        circuit.lastStateChange = Date.now();
        circuit.halfOpenCalls = 0;
        circuit.successCount = 0;

        log('info', 'Circuit breaker transitioned to half-open', {
            operationType,
            timeSinceOpen: Date.now() - circuit.lastFailureTime
        });
    }

    /**
     * Transition circuit to closed state
     * @param {Object} circuit - Circuit state
     * @param {string} operationType - Operation type
     * @private
     */
    _transitionToClosed(circuit, operationType) {
        circuit.state = CircuitBreakerState.CLOSED;
        circuit.lastStateChange = Date.now();
        circuit.consecutiveFailures = 0;
        circuit.halfOpenCalls = 0;
        this.globalStats.circuitsClosed++;

        log('info', 'Circuit breaker closed', {
            operationType,
            successCount: circuit.successCount
        });
    }

    /**
     * Clean old entries from circuit
     * @param {Object} circuit - Circuit state
     * @private
     */
    _cleanOldEntries(circuit) {
        const now = Date.now();
        const cutoff = now - this.config.monitoringPeriod;
        
        circuit.recentFailures = circuit.recentFailures.filter(
            failure => failure.timestamp > cutoff
        );
    }

    /**
     * Can execute operation in half-open state
     * @param {string} operationType - Operation type
     * @returns {boolean} Whether operation can be executed
     */
    canExecuteInHalfOpen(operationType = 'default') {
        const circuit = this._getCircuit(operationType);
        
        if (circuit.state !== CircuitBreakerState.HALF_OPEN) {
            return true;
        }

        if (circuit.halfOpenCalls >= this.config.halfOpenMaxCalls) {
            return false;
        }

        circuit.halfOpenCalls++;
        return true;
    }

    /**
     * Get circuit breaker status for operation type
     * @param {string} operationType - Operation type
     * @returns {Object} Circuit status
     */
    getStatus(operationType = 'default') {
        const circuit = this._getCircuit(operationType);
        
        return {
            operationType,
            state: circuit.state,
            failureCount: circuit.failureCount,
            successCount: circuit.successCount,
            consecutiveFailures: circuit.consecutiveFailures,
            lastFailureTime: circuit.lastFailureTime,
            lastStateChange: circuit.lastStateChange,
            recentFailures: circuit.recentFailures.length,
            halfOpenCalls: circuit.halfOpenCalls,
            timeUntilHalfOpen: circuit.state === CircuitBreakerState.OPEN ? 
                Math.max(0, this.config.resetTimeout - (Date.now() - circuit.lastFailureTime)) : 0,
            config: {
                failureThreshold: this.config.failureThreshold,
                resetTimeout: this.config.resetTimeout,
                monitoringPeriod: this.config.monitoringPeriod
            }
        };
    }

    /**
     * Get all circuit breaker statuses
     * @returns {Object} All circuit statuses
     */
    getAllStatuses() {
        const statuses = {};
        
        for (const operationType of this.circuits.keys()) {
            statuses[operationType] = this.getStatus(operationType);
        }

        return statuses;
    }

    /**
     * Get circuit breaker statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        const stats = {
            ...this.globalStats,
            activeCircuits: this.circuits.size,
            circuitsByState: {
                [CircuitBreakerState.CLOSED]: 0,
                [CircuitBreakerState.OPEN]: 0,
                [CircuitBreakerState.HALF_OPEN]: 0
            },
            operationTypes: []
        };

        for (const [operationType, circuit] of this.circuits.entries()) {
            stats.circuitsByState[circuit.state]++;
            stats.operationTypes.push({
                operationType,
                state: circuit.state,
                failureCount: circuit.failureCount,
                successCount: circuit.successCount,
                consecutiveFailures: circuit.consecutiveFailures
            });
        }

        // Calculate success rate
        if (stats.totalCalls > 0) {
            stats.successRate = stats.totalSuccesses / stats.totalCalls;
            stats.failureRate = stats.totalFailures / stats.totalCalls;
        } else {
            stats.successRate = 0;
            stats.failureRate = 0;
        }

        return stats;
    }

    /**
     * Force open circuit for operation type
     * @param {string} operationType - Operation type
     */
    forceOpen(operationType = 'default') {
        const circuit = this._getCircuit(operationType);
        this._transitionToOpen(circuit, operationType);
        
        log('warn', 'Circuit breaker force opened', { operationType });
    }

    /**
     * Force close circuit for operation type
     * @param {string} operationType - Operation type
     */
    forceClose(operationType = 'default') {
        const circuit = this._getCircuit(operationType);
        this._transitionToClosed(circuit, operationType);
        
        log('info', 'Circuit breaker force closed', { operationType });
    }

    /**
     * Reset circuit breaker for operation type
     * @param {string} operationType - Operation type (optional, resets all if not provided)
     */
    reset(operationType = null) {
        if (operationType) {
            // Reset specific circuit
            if (this.circuits.has(operationType)) {
                const circuit = this._getCircuit(operationType);
                circuit.state = CircuitBreakerState.CLOSED;
                circuit.failureCount = 0;
                circuit.successCount = 0;
                circuit.consecutiveFailures = 0;
                circuit.lastFailureTime = null;
                circuit.lastStateChange = Date.now();
                circuit.recentFailures = [];
                circuit.halfOpenCalls = 0;
                
                log('info', 'Circuit breaker reset', { operationType });
            }
        } else {
            // Reset all circuits
            this.circuits.clear();
            this.globalStats = {
                totalCalls: 0,
                totalFailures: 0,
                totalSuccesses: 0,
                circuitsOpened: 0,
                circuitsClosed: 0
            };
            
            log('info', 'All circuit breakers reset');
        }
    }

    /**
     * Export circuit breaker state
     * @returns {Object} Exported state
     */
    exportState() {
        const exported = {
            config: this.config,
            globalStats: this.globalStats,
            circuits: {}
        };

        for (const [operationType, circuit] of this.circuits.entries()) {
            exported.circuits[operationType] = {
                ...circuit,
                recentFailures: circuit.recentFailures.slice(-100) // Keep last 100 failures
            };
        }

        return exported;
    }

    /**
     * Import circuit breaker state
     * @param {Object} state - State to import
     */
    importState(state) {
        if (state.config) {
            this.config = { ...this.config, ...state.config };
        }

        if (state.globalStats) {
            this.globalStats = { ...state.globalStats };
        }

        if (state.circuits) {
            this.circuits.clear();
            for (const [operationType, circuit] of Object.entries(state.circuits)) {
                this.circuits.set(operationType, { ...circuit });
            }
        }

        log('info', 'Circuit breaker state imported', {
            circuitCount: this.circuits.size,
            totalCalls: this.globalStats.totalCalls
        });
    }
}

export default CircuitBreaker;

