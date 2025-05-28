/**
 * retry-manager.js
 * 
 * Intelligent retry logic with exponential backoff, circuit breaker pattern,
 * and context preservation across retry attempts.
 */

import { log } from '../scripts/modules/utils.js';
import { errorClassifier } from '../error-handling/core/error-classifier.js';

/**
 * Circuit breaker states
 */
export const CircuitBreakerStates = {
  CLOSED: 'closed',     // Normal operation
  OPEN: 'open',         // Failing, rejecting requests
  HALF_OPEN: 'half_open' // Testing if service recovered
};

/**
 * Retry strategies
 */
export const RetryStrategies = {
  EXPONENTIAL_BACKOFF: 'exponential_backoff',
  LINEAR_BACKOFF: 'linear_backoff',
  FIXED_DELAY: 'fixed_delay',
  IMMEDIATE: 'immediate',
  CUSTOM: 'custom'
};

/**
 * Circuit breaker for preventing cascading failures
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.recoveryTimeout = options.recoveryTimeout || 60000; // 1 minute
    this.monitoringPeriod = options.monitoringPeriod || 10000; // 10 seconds
    
    this.state = CircuitBreakerStates.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
    this.requestCount = 0;
    
    this.listeners = new Map();
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute(operation, context = {}) {
    if (this.state === CircuitBreakerStates.OPEN) {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        this.state = CircuitBreakerStates.HALF_OPEN;
        this.successCount = 0;
        log('info', `Circuit breaker transitioning to HALF_OPEN for ${context.operationName || 'operation'}`);
      } else {
        const error = new Error('Circuit breaker is OPEN - operation rejected');
        error.circuitBreakerState = this.state;
        throw error;
      }
    }

    this.requestCount++;

    try {
      const result = await operation();
      this._onSuccess(context);
      return result;
    } catch (error) {
      this._onFailure(error, context);
      throw error;
    }
  }

  /**
   * Handle successful operation
   * @private
   */
  _onSuccess(context) {
    this.successCount++;
    
    if (this.state === CircuitBreakerStates.HALF_OPEN) {
      if (this.successCount >= 3) { // Require multiple successes to close
        this.state = CircuitBreakerStates.CLOSED;
        this.failureCount = 0;
        log('info', `Circuit breaker CLOSED for ${context.operationName || 'operation'}`);
        this._notifyListeners('closed', context);
      }
    } else if (this.state === CircuitBreakerStates.CLOSED) {
      this.failureCount = Math.max(0, this.failureCount - 1); // Gradually reduce failure count
    }
  }

  /**
   * Handle failed operation
   * @private
   */
  _onFailure(error, context) {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitBreakerStates.HALF_OPEN) {
      this.state = CircuitBreakerStates.OPEN;
      log('warn', `Circuit breaker OPEN again for ${context.operationName || 'operation'}`);
      this._notifyListeners('opened', context);
    } else if (this.state === CircuitBreakerStates.CLOSED && this.failureCount >= this.failureThreshold) {
      this.state = CircuitBreakerStates.OPEN;
      log('warn', `Circuit breaker OPENED for ${context.operationName || 'operation'} after ${this.failureCount} failures`);
      this._notifyListeners('opened', context);
    }
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  /**
   * Notify event listeners
   * @private
   */
  _notifyListeners(event, context) {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach(callback => {
      try {
        callback(context);
      } catch (error) {
        log('error', `Circuit breaker listener error: ${error.message}`);
      }
    });
  }

  /**
   * Get circuit breaker statistics
   */
  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      requestCount: this.requestCount,
      lastFailureTime: this.lastFailureTime,
      failureThreshold: this.failureThreshold
    };
  }

  /**
   * Reset circuit breaker
   */
  reset() {
    this.state = CircuitBreakerStates.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.requestCount = 0;
    this.lastFailureTime = null;
  }
}

/**
 * Intelligent retry manager with multiple strategies and circuit breaker
 */
export class RetryManager {
  constructor(options = {}) {
    this.defaultMaxRetries = options.maxRetries || 3;
    this.defaultStrategy = options.strategy || RetryStrategies.EXPONENTIAL_BACKOFF;
    this.defaultBaseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;
    this.jitterEnabled = options.jitter !== false;
    
    // Circuit breakers per operation type
    this.circuitBreakers = new Map();
    this.retryHistory = new Map();
    this.activeRetries = new Map();
  }

  /**
   * Execute operation with intelligent retry logic
   */
  async executeWithRetry(operation, options = {}) {
    const config = this._buildRetryConfig(options);
    const context = this._buildContext(config);
    
    // Get or create circuit breaker for this operation type
    const circuitBreaker = this._getCircuitBreaker(config.operationType, config.circuitBreakerOptions);
    
    let lastError = null;
    let attempt = 0;
    
    // Track active retry
    const retryId = this._generateRetryId();
    this.activeRetries.set(retryId, {
      startTime: Date.now(),
      operation: config.operationName,
      maxRetries: config.maxRetries,
      currentAttempt: 0
    });

    try {
      while (attempt <= config.maxRetries) {
        try {
          // Update attempt tracking
          this.activeRetries.get(retryId).currentAttempt = attempt;
          
          // Execute with circuit breaker protection
          const result = await circuitBreaker.execute(async () => {
            if (attempt > 0) {
              log('info', `Retry attempt ${attempt}/${config.maxRetries} for ${config.operationName}`);
            }
            
            return await operation(context);
          }, { operationName: config.operationName });

          // Success - log and return
          this._logRetrySuccess(config, attempt, retryId);
          return result;

        } catch (error) {
          lastError = error;
          attempt++;

          // Classify the error to determine if we should retry
          const classification = errorClassifier.classify(error, {
            operation: config.operationType,
            attempt,
            retryId,
            ...config.context
          });

          // Check if we should continue retrying
          if (!this._shouldRetry(error, classification, attempt, config)) {
            break;
          }

          // Calculate delay for next attempt
          if (attempt <= config.maxRetries) {
            const delay = this._calculateDelay(attempt, config, classification);
            
            log('warn', `Operation failed (attempt ${attempt}/${config.maxRetries}): ${error.message}. Retrying in ${delay}ms...`);
            
            // Wait before next attempt
            await this._delay(delay);
          }
        }
      }

      // All retries exhausted
      this._logRetryFailure(config, attempt - 1, lastError, retryId);
      
      // Enhance error with retry information
      const enhancedError = this._enhanceError(lastError, {
        totalAttempts: attempt,
        maxRetries: config.maxRetries,
        operationName: config.operationName,
        retryId
      });

      throw enhancedError;

    } finally {
      // Clean up active retry tracking
      this.activeRetries.delete(retryId);
    }
  }

  /**
   * Build retry configuration from options
   * @private
   */
  _buildRetryConfig(options) {
    return {
      maxRetries: options.maxRetries || this.defaultMaxRetries,
      strategy: options.strategy || this.defaultStrategy,
      baseDelay: options.baseDelay || this.defaultBaseDelay,
      backoffMultiplier: options.backoffMultiplier || 2.0,
      operationType: options.operationType || 'default',
      operationName: options.operationName || 'unknown_operation',
      context: options.context || {},
      retryCondition: options.retryCondition,
      circuitBreakerOptions: options.circuitBreakerOptions || {},
      preserveContext: options.preserveContext !== false
    };
  }

  /**
   * Build execution context
   * @private
   */
  _buildContext(config) {
    return {
      retryCount: 0,
      maxRetries: config.maxRetries,
      operationType: config.operationType,
      operationName: config.operationName,
      startTime: Date.now(),
      preservedState: config.preserveContext ? new Map() : null
    };
  }

  /**
   * Get or create circuit breaker for operation type
   * @private
   */
  _getCircuitBreaker(operationType, options) {
    if (!this.circuitBreakers.has(operationType)) {
      const circuitBreaker = new CircuitBreaker({
        failureThreshold: 5,
        recoveryTimeout: 60000,
        ...options
      });
      
      // Set up event listeners
      circuitBreaker.on('opened', (context) => {
        log('warn', `Circuit breaker opened for ${operationType}`);
      });
      
      circuitBreaker.on('closed', (context) => {
        log('info', `Circuit breaker closed for ${operationType}`);
      });
      
      this.circuitBreakers.set(operationType, circuitBreaker);
    }
    
    return this.circuitBreakers.get(operationType);
  }

  /**
   * Determine if operation should be retried
   * @private
   */
  _shouldRetry(error, classification, attempt, config) {
    // Check if we've exceeded max retries
    if (attempt > config.maxRetries) {
      return false;
    }

    // Check circuit breaker state
    if (error.circuitBreakerState === CircuitBreakerStates.OPEN) {
      return false;
    }

    // Use custom retry condition if provided
    if (config.retryCondition) {
      return config.retryCondition(error, classification, attempt);
    }

    // Use classification-based retry logic
    return this._isRetryableError(error, classification);
  }

  /**
   * Check if error is retryable based on classification
   * @private
   */
  _isRetryableError(error, classification) {
    const nonRetryableTypes = ['LOGIC_ERROR', 'AUTHENTICATION_ERROR'];
    
    if (nonRetryableTypes.includes(classification.type)) {
      return false;
    }

    // Check for specific non-retryable patterns
    const errorMessage = error.message?.toLowerCase() || '';
    const nonRetryablePatterns = [
      /invalid\s+credentials/i,
      /unauthorized/i,
      /forbidden/i,
      /not\s+found/i,
      /bad\s+request/i
    ];

    return !nonRetryablePatterns.some(pattern => pattern.test(errorMessage));
  }

  /**
   * Calculate delay for next retry attempt
   * @private
   */
  _calculateDelay(attempt, config, classification) {
    let delay;

    switch (config.strategy) {
      case RetryStrategies.EXPONENTIAL_BACKOFF:
        delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
        break;
      
      case RetryStrategies.LINEAR_BACKOFF:
        delay = config.baseDelay * attempt;
        break;
      
      case RetryStrategies.FIXED_DELAY:
        delay = config.baseDelay;
        break;
      
      case RetryStrategies.IMMEDIATE:
        delay = 0;
        break;
      
      default:
        delay = config.baseDelay * Math.pow(2, attempt - 1);
    }

    // Apply classification-specific multiplier
    if (classification?.backoffMultiplier) {
      delay *= classification.backoffMultiplier;
    }

    // Cap at maximum delay
    delay = Math.min(delay, this.maxDelay);

    // Add jitter to prevent thundering herd
    if (this.jitterEnabled) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return Math.floor(delay);
  }

  /**
   * Delay execution
   * @private
   */
  async _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate unique retry ID
   * @private
   */
  _generateRetryId() {
    return `retry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Log successful retry completion
   * @private
   */
  _logRetrySuccess(config, attempts, retryId) {
    const duration = Date.now() - (this.activeRetries.get(retryId)?.startTime || 0);
    
    log('info', `Operation ${config.operationName} succeeded after ${attempts} attempts in ${duration}ms`);
    
    // Store in history
    this._recordRetryHistory(retryId, {
      operation: config.operationName,
      success: true,
      attempts,
      duration,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log retry failure
   * @private
   */
  _logRetryFailure(config, attempts, error, retryId) {
    const duration = Date.now() - (this.activeRetries.get(retryId)?.startTime || 0);
    
    log('error', `Operation ${config.operationName} failed after ${attempts} attempts in ${duration}ms: ${error.message}`);
    
    // Store in history
    this._recordRetryHistory(retryId, {
      operation: config.operationName,
      success: false,
      attempts,
      duration,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Record retry attempt in history
   * @private
   */
  _recordRetryHistory(retryId, record) {
    this.retryHistory.set(retryId, record);
    
    // Keep only last 1000 records
    if (this.retryHistory.size > 1000) {
      const oldestKey = this.retryHistory.keys().next().value;
      this.retryHistory.delete(oldestKey);
    }
  }

  /**
   * Enhance error with retry information
   * @private
   */
  _enhanceError(originalError, retryInfo) {
    const enhancedError = new Error(originalError.message);
    enhancedError.name = originalError.name;
    enhancedError.stack = originalError.stack;
    enhancedError.originalError = originalError;
    enhancedError.retryInfo = retryInfo;
    
    return enhancedError;
  }

  /**
   * Get retry statistics
   */
  getStats() {
    const circuitBreakerStats = {};
    for (const [type, breaker] of this.circuitBreakers) {
      circuitBreakerStats[type] = breaker.getStats();
    }

    return {
      activeRetries: this.activeRetries.size,
      historySize: this.retryHistory.size,
      circuitBreakers: circuitBreakerStats,
      configuration: {
        defaultMaxRetries: this.defaultMaxRetries,
        defaultStrategy: this.defaultStrategy,
        maxDelay: this.maxDelay,
        jitterEnabled: this.jitterEnabled
      }
    };
  }

  /**
   * Get retry history
   */
  getHistory(limit = 100) {
    const entries = Array.from(this.retryHistory.entries())
      .slice(-limit)
      .map(([id, record]) => ({ id, ...record }));
    
    return entries.reverse(); // Most recent first
  }

  /**
   * Reset all circuit breakers
   */
  resetCircuitBreakers() {
    for (const breaker of this.circuitBreakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Clear retry history
   */
  clearHistory() {
    this.retryHistory.clear();
  }
}

// Export singleton instance
export const retryManager = new RetryManager();

