/**
 * Error Handler for AgentAPI Integration
 * 
 * Provides comprehensive error handling, retry logic, and recovery
 * mechanisms for AgentAPI operations and Claude Code execution.
 */

import { EventEmitter } from 'events';
import { SimpleLogger } from '../ai_cicd_system/utils/simple_logger.js';

export class ErrorHandler extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      maxRetryAttempts: config.maxRetryAttempts || 3,
      baseRetryDelay: config.baseRetryDelay || 1000,
      maxRetryDelay: config.maxRetryDelay || 30000,
      exponentialBackoff: config.exponentialBackoff !== false,
      jitterEnabled: config.jitterEnabled !== false,
      circuitBreakerEnabled: config.circuitBreakerEnabled !== false,
      circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
      circuitBreakerTimeout: config.circuitBreakerTimeout || 60000,
      errorCategories: {
        network: ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'],
        authentication: ['UNAUTHORIZED', 'FORBIDDEN', 'INVALID_TOKEN'],
        rateLimit: ['RATE_LIMITED', 'TOO_MANY_REQUESTS'],
        resource: ['INSUFFICIENT_RESOURCES', 'INSTANCE_UNAVAILABLE'],
        validation: ['INVALID_INPUT', 'SCHEMA_VALIDATION_ERROR'],
        system: ['INTERNAL_ERROR', 'SERVICE_UNAVAILABLE'],
        ...config.errorCategories
      },
      ...config
    };

    this.logger = new SimpleLogger('ErrorHandler');
    
    this.errorStats = {
      total: 0,
      byCategory: {},
      byCode: {},
      retries: 0,
      recoveries: 0
    };
    
    this.circuitBreakers = new Map();
    this.retryQueues = new Map();
  }

  /**
   * Handle an error with automatic retry and recovery logic
   * @param {Error} error - Error to handle
   * @param {Object} context - Error context
   * @returns {Promise<Object>} Handling result
   */
  async handleError(error, context = {}) {
    const errorInfo = this._analyzeError(error, context);
    
    this.logger.error('Handling error', {
      errorCode: errorInfo.code,
      category: errorInfo.category,
      message: errorInfo.message,
      context: context.taskId || context.operation
    });

    // Update error statistics
    this._updateErrorStats(errorInfo);

    // Emit error event
    this.emit('errorOccurred', errorInfo);

    // Check circuit breaker
    if (this.config.circuitBreakerEnabled && this._isCircuitOpen(errorInfo.category)) {
      return {
        success: false,
        error: errorInfo,
        action: 'circuit_breaker_open',
        retryAfter: this.config.circuitBreakerTimeout
      };
    }

    // Determine if error is retryable
    if (!this._isRetryableError(errorInfo)) {
      return {
        success: false,
        error: errorInfo,
        action: 'no_retry',
        reason: 'Error is not retryable'
      };
    }

    // Check retry attempts
    const attempts = context.attempts || 0;
    if (attempts >= this.config.maxRetryAttempts) {
      this._updateCircuitBreaker(errorInfo.category, false);
      
      return {
        success: false,
        error: errorInfo,
        action: 'max_retries_exceeded',
        attempts
      };
    }

    // Calculate retry delay
    const retryDelay = this._calculateRetryDelay(attempts, errorInfo);
    
    // Schedule retry
    const retryResult = await this._scheduleRetry(errorInfo, context, retryDelay);
    
    return retryResult;
  }

  /**
   * Recover from a specific error condition
   * @param {string} errorCategory - Error category to recover from
   * @param {Function} recoveryAction - Recovery function
   * @returns {Promise<boolean>} Recovery success
   */
  async recover(errorCategory, recoveryAction) {
    try {
      this.logger.info(`Attempting recovery for error category: ${errorCategory}`);
      
      const result = await recoveryAction();
      
      if (result) {
        this.errorStats.recoveries++;
        this._resetCircuitBreaker(errorCategory);
        
        this.logger.info(`Recovery successful for category: ${errorCategory}`);
        this.emit('recoverySuccessful', { category: errorCategory });
        
        return true;
      }
      
      return false;
    } catch (error) {
      this.logger.error(`Recovery failed for category ${errorCategory}:`, error);
      this.emit('recoveryFailed', { category: errorCategory, error });
      
      return false;
    }
  }

  /**
   * Register a custom error recovery strategy
   * @param {string} errorCategory - Error category
   * @param {Function} recoveryStrategy - Recovery function
   */
  registerRecoveryStrategy(errorCategory, recoveryStrategy) {
    if (!this.recoveryStrategies) {
      this.recoveryStrategies = new Map();
    }
    
    this.recoveryStrategies.set(errorCategory, recoveryStrategy);
    
    this.logger.info(`Recovery strategy registered for category: ${errorCategory}`);
  }

  /**
   * Get error statistics
   * @returns {Object} Error statistics
   */
  getErrorStats() {
    return {
      ...this.errorStats,
      circuitBreakers: this._getCircuitBreakerStats(),
      retryQueues: this._getRetryQueueStats()
    };
  }

  /**
   * Reset error statistics
   */
  resetStats() {
    this.errorStats = {
      total: 0,
      byCategory: {},
      byCode: {},
      retries: 0,
      recoveries: 0
    };
    
    this.circuitBreakers.clear();
    this.retryQueues.clear();
    
    this.logger.info('Error statistics reset');
    this.emit('statsReset');
  }

  /**
   * Analyze error and categorize it
   * @param {Error} error - Error to analyze
   * @param {Object} context - Error context
   * @returns {Object} Error analysis
   */
  _analyzeError(error, context) {
    const errorInfo = {
      originalError: error,
      message: error.message || 'Unknown error',
      code: error.code || error.name || 'UNKNOWN_ERROR',
      stack: error.stack,
      timestamp: new Date().toISOString(),
      context
    };

    // Categorize error
    errorInfo.category = this._categorizeError(errorInfo.code);
    
    // Determine severity
    errorInfo.severity = this._determineSeverity(errorInfo);
    
    // Add retry information
    errorInfo.retryable = this._isRetryableError(errorInfo);
    
    return errorInfo;
  }

  /**
   * Categorize error based on error code
   * @param {string} errorCode - Error code
   * @returns {string} Error category
   */
  _categorizeError(errorCode) {
    for (const [category, codes] of Object.entries(this.config.errorCategories)) {
      if (codes.includes(errorCode)) {
        return category;
      }
    }
    
    return 'unknown';
  }

  /**
   * Determine error severity
   * @param {Object} errorInfo - Error information
   * @returns {string} Severity level
   */
  _determineSeverity(errorInfo) {
    switch (errorInfo.category) {
      case 'authentication':
      case 'validation':
        return 'high';
      case 'network':
      case 'rateLimit':
        return 'medium';
      case 'resource':
        return 'medium';
      case 'system':
        return 'high';
      default:
        return 'low';
    }
  }

  /**
   * Check if error is retryable
   * @param {Object} errorInfo - Error information
   * @returns {boolean} Retryable status
   */
  _isRetryableError(errorInfo) {
    const retryableCategories = ['network', 'rateLimit', 'resource', 'system'];
    return retryableCategories.includes(errorInfo.category);
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   * @param {number} attempt - Attempt number
   * @param {Object} errorInfo - Error information
   * @returns {number} Delay in milliseconds
   */
  _calculateRetryDelay(attempt, errorInfo) {
    let delay = this.config.baseRetryDelay;
    
    if (this.config.exponentialBackoff) {
      delay = Math.min(
        this.config.baseRetryDelay * Math.pow(2, attempt),
        this.config.maxRetryDelay
      );
    }
    
    // Add category-specific delay adjustments
    switch (errorInfo.category) {
      case 'rateLimit':
        delay *= 2; // Longer delay for rate limits
        break;
      case 'resource':
        delay *= 1.5; // Moderate delay for resource issues
        break;
    }
    
    // Add jitter to prevent thundering herd
    if (this.config.jitterEnabled) {
      const jitter = Math.random() * 0.3 * delay; // Up to 30% jitter
      delay += jitter;
    }
    
    return Math.round(delay);
  }

  /**
   * Schedule a retry operation
   * @param {Object} errorInfo - Error information
   * @param {Object} context - Operation context
   * @param {number} delay - Retry delay
   * @returns {Promise<Object>} Retry result
   */
  async _scheduleRetry(errorInfo, context, delay) {
    return new Promise((resolve) => {
      const retryId = `retry_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      this.logger.info(`Scheduling retry in ${delay}ms`, {
        retryId,
        attempt: (context.attempts || 0) + 1,
        errorCategory: errorInfo.category,
        delay
      });

      // Add to retry queue
      if (!this.retryQueues.has(errorInfo.category)) {
        this.retryQueues.set(errorInfo.category, []);
      }
      
      const retryItem = {
        id: retryId,
        errorInfo,
        context: { ...context, attempts: (context.attempts || 0) + 1 },
        scheduledAt: new Date().toISOString(),
        executeAt: new Date(Date.now() + delay).toISOString()
      };
      
      this.retryQueues.get(errorInfo.category).push(retryItem);
      
      setTimeout(() => {
        this._executeRetry(retryItem, resolve);
      }, delay);
    });
  }

  /**
   * Execute a retry operation
   * @param {Object} retryItem - Retry item
   * @param {Function} resolve - Promise resolver
   */
  async _executeRetry(retryItem, resolve) {
    try {
      this.errorStats.retries++;
      
      this.logger.info(`Executing retry: ${retryItem.id}`, {
        retryId: retryItem.id,
        attempt: retryItem.context.attempts,
        category: retryItem.errorInfo.category
      });

      // Remove from retry queue
      const categoryQueue = this.retryQueues.get(retryItem.errorInfo.category);
      if (categoryQueue) {
        const index = categoryQueue.findIndex(item => item.id === retryItem.id);
        if (index !== -1) {
          categoryQueue.splice(index, 1);
        }
      }

      // Check if we have a recovery strategy
      const recoveryStrategy = this.recoveryStrategies?.get(retryItem.errorInfo.category);
      
      if (recoveryStrategy) {
        const recoveryResult = await this.recover(retryItem.errorInfo.category, recoveryStrategy);
        
        if (recoveryResult) {
          resolve({
            success: true,
            action: 'retry_with_recovery',
            attempt: retryItem.context.attempts,
            recoveryUsed: true
          });
          return;
        }
      }

      // Emit retry event for external handling
      this.emit('retryExecuted', retryItem);
      
      resolve({
        success: false,
        action: 'retry_scheduled',
        attempt: retryItem.context.attempts,
        nextRetryIn: this._calculateRetryDelay(retryItem.context.attempts, retryItem.errorInfo)
      });
      
    } catch (error) {
      this.logger.error(`Retry execution failed: ${retryItem.id}`, error);
      
      resolve({
        success: false,
        action: 'retry_failed',
        error: error.message,
        attempt: retryItem.context.attempts
      });
    }
  }

  /**
   * Update error statistics
   * @param {Object} errorInfo - Error information
   */
  _updateErrorStats(errorInfo) {
    this.errorStats.total++;
    
    // Update by category
    if (!this.errorStats.byCategory[errorInfo.category]) {
      this.errorStats.byCategory[errorInfo.category] = 0;
    }
    this.errorStats.byCategory[errorInfo.category]++;
    
    // Update by code
    if (!this.errorStats.byCode[errorInfo.code]) {
      this.errorStats.byCode[errorInfo.code] = 0;
    }
    this.errorStats.byCode[errorInfo.code]++;
  }

  /**
   * Check if circuit breaker is open for a category
   * @param {string} category - Error category
   * @returns {boolean} Circuit breaker status
   */
  _isCircuitOpen(category) {
    const breaker = this.circuitBreakers.get(category);
    
    if (!breaker) {
      return false;
    }
    
    if (breaker.state === 'open') {
      // Check if timeout has passed
      if (Date.now() - breaker.openedAt > this.config.circuitBreakerTimeout) {
        breaker.state = 'half-open';
        this.logger.info(`Circuit breaker half-open for category: ${category}`);
      } else {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Update circuit breaker state
   * @param {string} category - Error category
   * @param {boolean} success - Operation success
   */
  _updateCircuitBreaker(category, success) {
    if (!this.config.circuitBreakerEnabled) {
      return;
    }
    
    if (!this.circuitBreakers.has(category)) {
      this.circuitBreakers.set(category, {
        state: 'closed',
        failures: 0,
        successes: 0,
        openedAt: null
      });
    }
    
    const breaker = this.circuitBreakers.get(category);
    
    if (success) {
      breaker.successes++;
      breaker.failures = 0;
      
      if (breaker.state === 'half-open') {
        breaker.state = 'closed';
        this.logger.info(`Circuit breaker closed for category: ${category}`);
      }
    } else {
      breaker.failures++;
      breaker.successes = 0;
      
      if (breaker.failures >= this.config.circuitBreakerThreshold) {
        breaker.state = 'open';
        breaker.openedAt = Date.now();
        
        this.logger.warn(`Circuit breaker opened for category: ${category}`, {
          failures: breaker.failures,
          threshold: this.config.circuitBreakerThreshold
        });
        
        this.emit('circuitBreakerOpened', { category, failures: breaker.failures });
      }
    }
  }

  /**
   * Reset circuit breaker for a category
   * @param {string} category - Error category
   */
  _resetCircuitBreaker(category) {
    if (this.circuitBreakers.has(category)) {
      this.circuitBreakers.set(category, {
        state: 'closed',
        failures: 0,
        successes: 0,
        openedAt: null
      });
      
      this.logger.info(`Circuit breaker reset for category: ${category}`);
    }
  }

  /**
   * Get circuit breaker statistics
   * @returns {Object} Circuit breaker stats
   */
  _getCircuitBreakerStats() {
    const stats = {};
    
    for (const [category, breaker] of this.circuitBreakers.entries()) {
      stats[category] = {
        state: breaker.state,
        failures: breaker.failures,
        successes: breaker.successes,
        openedAt: breaker.openedAt
      };
    }
    
    return stats;
  }

  /**
   * Get retry queue statistics
   * @returns {Object} Retry queue stats
   */
  _getRetryQueueStats() {
    const stats = {};
    
    for (const [category, queue] of this.retryQueues.entries()) {
      stats[category] = {
        queueLength: queue.length,
        oldestRetry: queue.length > 0 ? queue[0].scheduledAt : null
      };
    }
    
    return stats;
  }

  /**
   * Create a standardized error response
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {Object} details - Additional details
   * @returns {Error} Standardized error
   */
  createError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    error.details = details;
    error.timestamp = new Date().toISOString();
    
    return error;
  }

  /**
   * Wrap a function with error handling
   * @param {Function} fn - Function to wrap
   * @param {Object} context - Error context
   * @returns {Function} Wrapped function
   */
  wrapFunction(fn, context = {}) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        const result = await this.handleError(error, context);
        
        if (!result.success) {
          throw error;
        }
        
        return result;
      }
    };
  }
}

export default ErrorHandler;

