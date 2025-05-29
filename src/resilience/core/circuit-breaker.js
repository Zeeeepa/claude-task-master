/**
 * circuit-breaker.js
 * Circuit breaker patterns and fault isolation
 * Implements circuit breaker pattern for preventing cascade failures
 */

import { errorClassifier } from './error-classifier.js';

// Circuit breaker states
export const CIRCUIT_STATES = {
  CLOSED: 'closed',     // Normal operation
  OPEN: 'open',         // Circuit is open, failing fast
  HALF_OPEN: 'half_open' // Testing if service has recovered
};

// Default circuit breaker configuration
export const DEFAULT_CIRCUIT_CONFIG = {
  failureThreshold: 5,        // Number of failures before opening
  successThreshold: 3,        // Number of successes to close from half-open
  timeoutMs: 60000,          // Time to wait before trying half-open
  monitoringPeriodMs: 60000, // Period to monitor for failures
  volumeThreshold: 10        // Minimum requests before considering failure rate
};

/**
 * Circuit breaker implementation for fault isolation
 */
export class CircuitBreaker {
  constructor(name, config = {}) {
    this.name = name;
    this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
    this.state = CIRCUIT_STATES.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.requestCount = 0;
    this.stats = {
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      circuitOpenCount: 0,
      lastStateChange: Date.now()
    };
  }

  /**
   * Execute a function through the circuit breaker
   * @param {Function} fn - Function to execute
   * @param {Object} options - Execution options
   * @returns {Promise} Function result
   */
  async execute(fn, options = {}) {
    this.stats.totalRequests++;
    this.requestCount++;

    // Check if circuit should be opened
    if (this.state === CIRCUIT_STATES.CLOSED) {
      this._checkForCircuitOpen();
    }

    // Handle different circuit states
    switch (this.state) {
      case CIRCUIT_STATES.OPEN:
        return this._handleOpenState(fn, options);
      
      case CIRCUIT_STATES.HALF_OPEN:
        return this._handleHalfOpenState(fn, options);
      
      case CIRCUIT_STATES.CLOSED:
      default:
        return this._handleClosedState(fn, options);
    }
  }

  /**
   * Handle execution when circuit is closed (normal operation)
   * @param {Function} fn - Function to execute
   * @param {Object} options - Execution options
   * @returns {Promise} Function result
   */
  async _handleClosedState(fn, options) {
    try {
      const result = await fn();
      this._recordSuccess();
      return result;
    } catch (error) {
      this._recordFailure(error);
      throw error;
    }
  }

  /**
   * Handle execution when circuit is open (failing fast)
   * @param {Function} fn - Function to execute
   * @param {Object} options - Execution options
   * @returns {Promise} Function result or circuit open error
   */
  async _handleOpenState(fn, options) {
    // Check if enough time has passed to try half-open
    if (Date.now() >= this.nextAttemptTime) {
      this._transitionToHalfOpen();
      return this._handleHalfOpenState(fn, options);
    }

    // Circuit is still open, fail fast
    const error = new Error(
      `Circuit breaker '${this.name}' is OPEN. ` +
      `Next attempt allowed at ${new Date(this.nextAttemptTime).toISOString()}`
    );
    error.circuitBreakerOpen = true;
    error.nextAttemptTime = this.nextAttemptTime;
    throw error;
  }

  /**
   * Handle execution when circuit is half-open (testing recovery)
   * @param {Function} fn - Function to execute
   * @param {Object} options - Execution options
   * @returns {Promise} Function result
   */
  async _handleHalfOpenState(fn, options) {
    try {
      const result = await fn();
      this._recordSuccess();
      
      // Check if we should close the circuit
      if (this.successCount >= this.config.successThreshold) {
        this._transitionToClosed();
      }
      
      return result;
    } catch (error) {
      this._recordFailure(error);
      this._transitionToOpen();
      throw error;
    }
  }

  /**
   * Record a successful execution
   */
  _recordSuccess() {
    this.successCount++;
    this.stats.totalSuccesses++;
    
    // Reset failure count on success in closed state
    if (this.state === CIRCUIT_STATES.CLOSED) {
      this.failureCount = 0;
    }
  }

  /**
   * Record a failed execution
   * @param {Error} error - The error that occurred
   */
  _recordFailure(error) {
    this.failureCount++;
    this.stats.totalFailures++;
    this.lastFailureTime = Date.now();
    
    // Classify error to determine if it should count towards circuit breaking
    const classification = errorClassifier.classify(error);
    
    // Only count certain types of errors towards circuit breaking
    if (this._shouldCountFailure(classification)) {
      // Failure is already recorded above
    } else {
      // Don't count this failure towards circuit breaking
      this.failureCount--;
      this.stats.totalFailures--;
    }
  }

  /**
   * Determine if a failure should count towards circuit breaking
   * @param {Object} classification - Error classification
   * @returns {boolean} Whether failure should count
   */
  _shouldCountFailure(classification) {
    // Don't break circuit for validation errors or authentication issues
    return ![
      'validation',
      'authentication', 
      'authorization'
    ].includes(classification.category);
  }

  /**
   * Check if circuit should be opened based on failure rate
   */
  _checkForCircuitOpen() {
    // Need minimum volume before considering failure rate
    if (this.requestCount < this.config.volumeThreshold) {
      return;
    }

    // Check if failure threshold exceeded
    if (this.failureCount >= this.config.failureThreshold) {
      this._transitionToOpen();
    }
  }

  /**
   * Transition circuit to OPEN state
   */
  _transitionToOpen() {
    this.state = CIRCUIT_STATES.OPEN;
    this.nextAttemptTime = Date.now() + this.config.timeoutMs;
    this.stats.circuitOpenCount++;
    this.stats.lastStateChange = Date.now();
    
    if (this.config.onStateChange) {
      this.config.onStateChange(this.name, CIRCUIT_STATES.OPEN, this.getStats());
    }
  }

  /**
   * Transition circuit to HALF_OPEN state
   */
  _transitionToHalfOpen() {
    this.state = CIRCUIT_STATES.HALF_OPEN;
    this.successCount = 0;
    this.stats.lastStateChange = Date.now();
    
    if (this.config.onStateChange) {
      this.config.onStateChange(this.name, CIRCUIT_STATES.HALF_OPEN, this.getStats());
    }
  }

  /**
   * Transition circuit to CLOSED state
   */
  _transitionToClosed() {
    this.state = CIRCUIT_STATES.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.requestCount = 0;
    this.stats.lastStateChange = Date.now();
    
    if (this.config.onStateChange) {
      this.config.onStateChange(this.name, CIRCUIT_STATES.CLOSED, this.getStats());
    }
  }

  /**
   * Get current circuit breaker statistics
   * @returns {Object} Circuit breaker stats
   */
  getStats() {
    const now = Date.now();
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      requestCount: this.requestCount,
      nextAttemptTime: this.nextAttemptTime,
      uptime: now - this.stats.lastStateChange,
      ...this.stats,
      failureRate: this.stats.totalRequests > 0 
        ? this.stats.totalFailures / this.stats.totalRequests 
        : 0
    };
  }

  /**
   * Reset circuit breaker to initial state
   */
  reset() {
    this.state = CIRCUIT_STATES.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.requestCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.stats.lastStateChange = Date.now();
  }

  /**
   * Force circuit to specific state (for testing)
   * @param {string} state - Target state
   */
  forceState(state) {
    if (Object.values(CIRCUIT_STATES).includes(state)) {
      this.state = state;
      this.stats.lastStateChange = Date.now();
    }
  }
}

/**
 * Circuit breaker registry for managing multiple circuit breakers
 */
export class CircuitBreakerRegistry {
  constructor() {
    this.breakers = new Map();
  }

  /**
   * Get or create a circuit breaker
   * @param {string} name - Circuit breaker name
   * @param {Object} config - Configuration
   * @returns {CircuitBreaker} Circuit breaker instance
   */
  getBreaker(name, config = {}) {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, config));
    }
    return this.breakers.get(name);
  }

  /**
   * Get all circuit breaker statistics
   * @returns {Array} Array of circuit breaker stats
   */
  getAllStats() {
    return Array.from(this.breakers.values()).map(breaker => breaker.getStats());
  }

  /**
   * Reset all circuit breakers
   */
  resetAll() {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Remove a circuit breaker
   * @param {string} name - Circuit breaker name
   */
  removeBreaker(name) {
    this.breakers.delete(name);
  }
}

// Export singleton registry
export const circuitBreakerRegistry = new CircuitBreakerRegistry();

