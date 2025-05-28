/**
 * Circuit Breaker Implementation
 * 
 * Implements the circuit breaker pattern to prevent cascading failures
 * and provide graceful degradation for external service calls.
 */

import { ErrorTypes, SystemError, CircuitBreakerError } from '../utils/error_types.js';

/**
 * Circuit breaker states
 */
export const CircuitBreakerStates = {
  CLOSED: 'CLOSED',     // Normal operation
  OPEN: 'OPEN',         // Failing fast, not calling service
  HALF_OPEN: 'HALF_OPEN' // Testing if service has recovered
};

/**
 * Circuit breaker configuration presets
 */
export const CircuitBreakerPresets = {
  DEFAULT: {
    failureThreshold: 5,
    recoveryTimeout: 60000,
    monitoringPeriod: 10000,
    halfOpenMaxCalls: 3,
    successThreshold: 2
  },
  
  AGGRESSIVE: {
    failureThreshold: 3,
    recoveryTimeout: 30000,
    monitoringPeriod: 5000,
    halfOpenMaxCalls: 2,
    successThreshold: 1
  },
  
  CONSERVATIVE: {
    failureThreshold: 10,
    recoveryTimeout: 120000,
    monitoringPeriod: 20000,
    halfOpenMaxCalls: 5,
    successThreshold: 3
  },
  
  API_SERVICE: {
    failureThreshold: 5,
    recoveryTimeout: 45000,
    monitoringPeriod: 10000,
    halfOpenMaxCalls: 3,
    successThreshold: 2
  },
  
  DATABASE: {
    failureThreshold: 3,
    recoveryTimeout: 30000,
    monitoringPeriod: 5000,
    halfOpenMaxCalls: 2,
    successThreshold: 1
  }
};

/**
 * Circuit Breaker Implementation
 */
export class CircuitBreaker {
  constructor(config = {}) {
    this.config = {
      failureThreshold: config.failureThreshold || 5,
      recoveryTimeout: config.recoveryTimeout || 60000,
      monitoringPeriod: config.monitoringPeriod || 10000,
      halfOpenMaxCalls: config.halfOpenMaxCalls || 3,
      successThreshold: config.successThreshold || 2,
      expectedErrors: config.expectedErrors || [],
      onStateChange: config.onStateChange || null,
      onFailure: config.onFailure || null,
      onSuccess: config.onSuccess || null,
      name: config.name || 'unnamed'
    };
    
    this.state = CircuitBreakerStates.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
    this.halfOpenCalls = 0;
    this.requestCount = 0;
    
    // Metrics
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      circuitOpenCount: 0,
      fallbackExecutions: 0,
      stateChanges: []
    };
    
    // Start monitoring
    this.startMonitoring();
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute(operation, fallback = null, context = {}) {
    this.requestCount++;
    this.metrics.totalRequests++;
    
    const operationId = context.operationId || `cb_${Date.now()}`;
    
    // Check circuit breaker state
    if (this.state === CircuitBreakerStates.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionTo(CircuitBreakerStates.HALF_OPEN);
      } else {
        this.metrics.circuitOpenCount++;
        return this.executeFallback(fallback, operationId);
      }
    }
    
    // In HALF_OPEN state, limit the number of calls
    if (this.state === CircuitBreakerStates.HALF_OPEN) {
      if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
        return this.executeFallback(fallback, operationId);
      }
      this.halfOpenCalls++;
    }

    try {
      const result = await operation();
      this.onSuccess(operationId);
      return result;
      
    } catch (error) {
      this.onFailure(error, operationId);
      
      // If circuit is now open, execute fallback
      if (this.state === CircuitBreakerStates.OPEN) {
        return this.executeFallback(fallback, operationId);
      }
      
      // Re-throw the error if circuit is still closed/half-open
      throw error;
    }
  }

  /**
   * Handle successful operation
   */
  onSuccess(operationId) {
    this.successCount++;
    this.lastSuccessTime = Date.now();
    this.metrics.successfulRequests++;
    
    // Success callback
    if (this.config.onSuccess) {
      this.config.onSuccess({
        operationId,
        state: this.state,
        successCount: this.successCount
      });
    }
    
    if (this.state === CircuitBreakerStates.HALF_OPEN) {
      // Check if we have enough successes to close the circuit
      if (this.successCount >= this.config.successThreshold) {
        this.transitionTo(CircuitBreakerStates.CLOSED);
        this.resetCounts();
      }
    } else if (this.state === CircuitBreakerStates.CLOSED) {
      // Reset failure count on success
      this.failureCount = 0;
    }
  }

  /**
   * Handle failed operation
   */
  onFailure(error, operationId) {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.metrics.failedRequests++;
    
    // Failure callback
    if (this.config.onFailure) {
      this.config.onFailure({
        operationId,
        error,
        state: this.state,
        failureCount: this.failureCount
      });
    }
    
    // Check if error should be ignored (expected errors)
    if (this.isExpectedError(error)) {
      return;
    }
    
    // Check if we should open the circuit
    if (this.failureCount >= this.config.failureThreshold) {
      this.transitionTo(CircuitBreakerStates.OPEN);
    } else if (this.state === CircuitBreakerStates.HALF_OPEN) {
      // Any failure in half-open state opens the circuit
      this.transitionTo(CircuitBreakerStates.OPEN);
    }
  }

  /**
   * Check if error is expected and shouldn't trigger circuit breaker
   */
  isExpectedError(error) {
    if (this.config.expectedErrors.length === 0) {
      return false;
    }
    
    // Check error type
    if (error instanceof SystemError) {
      return this.config.expectedErrors.includes(error.type);
    }
    
    // Check error message patterns
    return this.config.expectedErrors.some(pattern => {
      if (typeof pattern === 'string') {
        return error.message?.includes(pattern);
      }
      if (pattern instanceof RegExp) {
        return pattern.test(error.message || '');
      }
      return false;
    });
  }

  /**
   * Transition to new state
   */
  transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;
    
    // Record state change
    this.metrics.stateChanges.push({
      from: oldState,
      to: newState,
      timestamp: new Date().toISOString(),
      failureCount: this.failureCount,
      successCount: this.successCount
    });
    
    // Reset half-open call count when entering half-open state
    if (newState === CircuitBreakerStates.HALF_OPEN) {
      this.halfOpenCalls = 0;
      this.successCount = 0;
    }
    
    // Log state change
    const stateEmojis = {
      [CircuitBreakerStates.CLOSED]: '✅',
      [CircuitBreakerStates.OPEN]: '🚨',
      [CircuitBreakerStates.HALF_OPEN]: '🔄'
    };
    
    console.log(
      `${stateEmojis[newState]} Circuit breaker '${this.config.name}' ` +
      `transitioned from ${oldState} to ${newState}`
    );
    
    // State change callback
    if (this.config.onStateChange) {
      this.config.onStateChange({
        from: oldState,
        to: newState,
        failureCount: this.failureCount,
        successCount: this.successCount,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Check if we should attempt to reset the circuit breaker
   */
  shouldAttemptReset() {
    if (!this.lastFailureTime) {
      return false;
    }
    
    return Date.now() - this.lastFailureTime >= this.config.recoveryTimeout;
  }

  /**
   * Execute fallback function or throw circuit breaker error
   */
  async executeFallback(fallback, operationId) {
    this.metrics.fallbackExecutions++;
    
    if (typeof fallback === 'function') {
      try {
        console.log(`🔄 Executing fallback for operation ${operationId}`);
        return await fallback();
      } catch (fallbackError) {
        console.log(`❌ Fallback failed for operation ${operationId}: ${fallbackError.message}`);
        throw new CircuitBreakerError(this.config.name, this.state, {
          operationId,
          fallbackError: fallbackError.message
        });
      }
    }
    
    throw new CircuitBreakerError(this.config.name, this.state, {
      operationId,
      message: 'No fallback provided'
    });
  }

  /**
   * Reset failure and success counts
   */
  resetCounts() {
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenCalls = 0;
  }

  /**
   * Start monitoring circuit breaker health
   */
  startMonitoring() {
    setInterval(() => {
      this.performHealthCheck();
    }, this.config.monitoringPeriod);
  }

  /**
   * Perform periodic health check
   */
  performHealthCheck() {
    const now = Date.now();
    
    // Log current state periodically
    if (this.requestCount > 0) {
      const successRate = this.metrics.successfulRequests / this.metrics.totalRequests;
      
      console.log(
        `📊 Circuit breaker '${this.config.name}' health: ` +
        `State=${this.state}, ` +
        `Requests=${this.metrics.totalRequests}, ` +
        `Success Rate=${(successRate * 100).toFixed(1)}%, ` +
        `Failures=${this.failureCount}`
      );
    }
    
    // Auto-recovery logic for OPEN state
    if (this.state === CircuitBreakerStates.OPEN && this.shouldAttemptReset()) {
      console.log(`🔄 Circuit breaker '${this.config.name}' attempting auto-recovery`);
      this.transitionTo(CircuitBreakerStates.HALF_OPEN);
    }
  }

  /**
   * Get current circuit breaker status
   */
  getStatus() {
    return {
      name: this.config.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      requestCount: this.requestCount,
      halfOpenCalls: this.halfOpenCalls,
      config: this.config,
      metrics: this.getMetrics()
    };
  }

  /**
   * Get circuit breaker metrics
   */
  getMetrics() {
    const totalRequests = this.metrics.totalRequests;
    
    return {
      ...this.metrics,
      successRate: totalRequests > 0 ? this.metrics.successfulRequests / totalRequests : 0,
      failureRate: totalRequests > 0 ? this.metrics.failedRequests / totalRequests : 0,
      uptime: this.calculateUptime(),
      currentState: this.state
    };
  }

  /**
   * Calculate uptime percentage
   */
  calculateUptime() {
    const stateChanges = this.metrics.stateChanges;
    if (stateChanges.length === 0) {
      return 1.0; // 100% uptime if no state changes
    }
    
    const now = Date.now();
    const firstChange = new Date(stateChanges[0].timestamp).getTime();
    const totalTime = now - firstChange;
    
    if (totalTime === 0) {
      return 1.0;
    }
    
    let downTime = 0;
    let lastOpenTime = null;
    
    stateChanges.forEach(change => {
      const changeTime = new Date(change.timestamp).getTime();
      
      if (change.to === CircuitBreakerStates.OPEN) {
        lastOpenTime = changeTime;
      } else if (lastOpenTime && change.to === CircuitBreakerStates.CLOSED) {
        downTime += changeTime - lastOpenTime;
        lastOpenTime = null;
      }
    });
    
    // If currently open, add time since last open
    if (this.state === CircuitBreakerStates.OPEN && lastOpenTime) {
      downTime += now - lastOpenTime;
    }
    
    return Math.max(0, (totalTime - downTime) / totalTime);
  }

  /**
   * Reset circuit breaker to initial state
   */
  reset() {
    this.state = CircuitBreakerStates.CLOSED;
    this.resetCounts();
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
    this.requestCount = 0;
    
    console.log(`🔄 Circuit breaker '${this.config.name}' has been reset`);
  }

  /**
   * Force circuit breaker to open state
   */
  forceOpen() {
    this.transitionTo(CircuitBreakerStates.OPEN);
    console.log(`🚨 Circuit breaker '${this.config.name}' forced to OPEN state`);
  }

  /**
   * Force circuit breaker to closed state
   */
  forceClosed() {
    this.transitionTo(CircuitBreakerStates.CLOSED);
    this.resetCounts();
    console.log(`✅ Circuit breaker '${this.config.name}' forced to CLOSED state`);
  }
}

/**
 * Circuit Breaker Manager for managing multiple circuit breakers
 */
export class CircuitBreakerManager {
  constructor() {
    this.circuitBreakers = new Map();
  }

  /**
   * Create or get a circuit breaker for a service
   */
  getCircuitBreaker(serviceName, config = {}) {
    if (!this.circuitBreakers.has(serviceName)) {
      const circuitBreaker = new CircuitBreaker({
        ...config,
        name: serviceName
      });
      this.circuitBreakers.set(serviceName, circuitBreaker);
    }
    
    return this.circuitBreakers.get(serviceName);
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute(serviceName, operation, fallback = null, config = {}) {
    const circuitBreaker = this.getCircuitBreaker(serviceName, config);
    return circuitBreaker.execute(operation, fallback);
  }

  /**
   * Get status of all circuit breakers
   */
  getAllStatus() {
    const status = {};
    this.circuitBreakers.forEach((circuitBreaker, serviceName) => {
      status[serviceName] = circuitBreaker.getStatus();
    });
    return status;
  }

  /**
   * Get aggregated metrics
   */
  getAggregatedMetrics() {
    let totalRequests = 0;
    let totalSuccessful = 0;
    let totalFailed = 0;
    let openCircuits = 0;
    
    this.circuitBreakers.forEach(circuitBreaker => {
      const metrics = circuitBreaker.getMetrics();
      totalRequests += metrics.totalRequests;
      totalSuccessful += metrics.successfulRequests;
      totalFailed += metrics.failedRequests;
      
      if (circuitBreaker.state === CircuitBreakerStates.OPEN) {
        openCircuits++;
      }
    });
    
    return {
      totalCircuitBreakers: this.circuitBreakers.size,
      openCircuits,
      totalRequests,
      totalSuccessful,
      totalFailed,
      overallSuccessRate: totalRequests > 0 ? totalSuccessful / totalRequests : 0,
      systemHealth: openCircuits === 0 ? 'HEALTHY' : 
                   openCircuits < this.circuitBreakers.size ? 'DEGRADED' : 'CRITICAL'
    };
  }

  /**
   * Reset all circuit breakers
   */
  resetAll() {
    this.circuitBreakers.forEach(circuitBreaker => {
      circuitBreaker.reset();
    });
  }
}

/**
 * Utility functions for circuit breaker usage
 */
export class CircuitBreakerUtils {
  /**
   * Create circuit breaker with preset configuration
   */
  static withPreset(presetName, overrides = {}) {
    const preset = CircuitBreakerPresets[presetName];
    if (!preset) {
      throw new SystemError(
        `Unknown circuit breaker preset: ${presetName}`,
        ErrorTypes.CONFIGURATION_ERROR,
        false
      );
    }
    
    return new CircuitBreaker({ ...preset, ...overrides });
  }

  /**
   * Create circuit breaker for API service
   */
  static forApiService(serviceName, overrides = {}) {
    return this.withPreset('API_SERVICE', { name: serviceName, ...overrides });
  }

  /**
   * Create circuit breaker for database
   */
  static forDatabase(dbName, overrides = {}) {
    return this.withPreset('DATABASE', { name: dbName, ...overrides });
  }
}

export default CircuitBreaker;

