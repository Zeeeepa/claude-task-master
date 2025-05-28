/**
 * Advanced Retry Manager
 * 
 * Implements sophisticated retry logic with exponential backoff, jitter,
 * timeout handling, and intelligent retry policies for the AI CI/CD system.
 */

import { ErrorTypes, ErrorClassifier, SystemError } from '../utils/error_types.js';

/**
 * Retry policies for different operation types
 */
export const RetryPolicies = {
  DEFAULT: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitterEnabled: true,
    timeoutMs: 60000
  },
  
  NETWORK_OPERATIONS: {
    maxRetries: 5,
    baseDelay: 500,
    maxDelay: 15000,
    backoffMultiplier: 1.5,
    jitterEnabled: true,
    timeoutMs: 30000
  },
  
  API_CALLS: {
    maxRetries: 4,
    baseDelay: 1000,
    maxDelay: 60000,
    backoffMultiplier: 2,
    jitterEnabled: true,
    timeoutMs: 120000
  },
  
  DATABASE_OPERATIONS: {
    maxRetries: 3,
    baseDelay: 2000,
    maxDelay: 20000,
    backoffMultiplier: 2,
    jitterEnabled: true,
    timeoutMs: 45000
  },
  
  FILE_OPERATIONS: {
    maxRetries: 2,
    baseDelay: 500,
    maxDelay: 5000,
    backoffMultiplier: 2,
    jitterEnabled: false,
    timeoutMs: 10000
  },
  
  CRITICAL_OPERATIONS: {
    maxRetries: 1,
    baseDelay: 1000,
    maxDelay: 5000,
    backoffMultiplier: 1,
    jitterEnabled: false,
    timeoutMs: 30000
  }
};

/**
 * Advanced Retry Manager with comprehensive retry logic
 */
export class RetryManager {
  constructor(config = {}) {
    this.config = {
      maxRetries: config.maxRetries || 3,
      baseDelay: config.baseDelay || 1000,
      maxDelay: config.maxDelay || 30000,
      backoffMultiplier: config.backoffMultiplier || 2,
      jitterEnabled: config.jitterEnabled !== false,
      timeoutMs: config.timeoutMs || 60000,
      retryableErrors: config.retryableErrors || [
        ErrorTypes.NETWORK_ERROR,
        ErrorTypes.TIMEOUT_ERROR,
        ErrorTypes.RATE_LIMIT_ERROR,
        ErrorTypes.SERVER_ERROR,
        ErrorTypes.TEMPORARY_UNAVAILABLE,
        ErrorTypes.CONNECTION_RESET,
        ErrorTypes.DATABASE_ERROR
      ],
      nonRetryableErrors: config.nonRetryableErrors || [
        ErrorTypes.AUTHENTICATION_ERROR,
        ErrorTypes.AUTHORIZATION_ERROR,
        ErrorTypes.VALIDATION_ERROR,
        ErrorTypes.NOT_FOUND_ERROR,
        ErrorTypes.MALFORMED_REQUEST,
        ErrorTypes.QUOTA_EXCEEDED
      ],
      onRetry: config.onRetry || null,
      onSuccess: config.onSuccess || null,
      onFailure: config.onFailure || null
    };
    
    this.metrics = {
      totalAttempts: 0,
      successfulRetries: 0,
      failedRetries: 0,
      totalDelay: 0
    };
  }

  /**
   * Execute an operation with retry logic
   */
  async executeWithRetry(operation, context = {}) {
    const operationId = context.operationId || `op_${Date.now()}`;
    const startTime = Date.now();
    let lastError;
    let attempt = 1;
    
    // Validate operation
    if (typeof operation !== 'function') {
      throw new SystemError(
        'Operation must be a function',
        ErrorTypes.VALIDATION_ERROR,
        false,
        { operationId }
      );
    }

    for (attempt = 1; attempt <= this.config.maxRetries + 1; attempt++) {
      this.metrics.totalAttempts++;
      
      try {
        // Execute operation with timeout
        const result = await this.executeWithTimeout(operation, context, attempt);
        
        // Success callback
        if (this.config.onSuccess) {
          await this.config.onSuccess({
            attempt,
            operationId,
            duration: Date.now() - startTime,
            result
          });
        }
        
        if (attempt > 1) {
          this.metrics.successfulRetries++;
          console.log(`✅ Operation ${operationId} succeeded on attempt ${attempt}`);
        }
        
        return result;
        
      } catch (error) {
        lastError = this.enhanceError(error, attempt, context, operationId);
        
        // Check if we should retry
        if (attempt <= this.config.maxRetries && this.isRetryable(lastError)) {
          const delay = this.calculateDelay(attempt, lastError);
          this.metrics.totalDelay += delay;
          
          // Retry callback
          if (this.config.onRetry) {
            await this.config.onRetry({
              attempt,
              operationId,
              error: lastError,
              delay,
              willRetry: true
            });
          }
          
          console.log(
            `⏳ Retrying operation ${operationId} in ${delay}ms ` +
            `(attempt ${attempt}/${this.config.maxRetries}) - ${lastError.message}`
          );
          
          await this.delay(delay);
          continue;
        }
        
        // No more retries
        break;
      }
    }
    
    // All retries exhausted
    this.metrics.failedRetries++;
    
    // Failure callback
    if (this.config.onFailure) {
      await this.config.onFailure({
        attempt: attempt - 1,
        operationId,
        error: lastError,
        totalDuration: Date.now() - startTime
      });
    }
    
    console.log(`❌ Operation ${operationId} failed after ${attempt - 1} attempts`);
    throw lastError;
  }

  /**
   * Execute operation with timeout
   */
  async executeWithTimeout(operation, context, attempt) {
    const timeoutMs = context.timeoutMs || this.config.timeoutMs;
    
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new SystemError(
          `Operation timed out after ${timeoutMs}ms`,
          ErrorTypes.TIMEOUT_ERROR,
          true,
          { 
            timeoutMs,
            attempt,
            operationId: context.operationId
          }
        ));
      }, timeoutMs);

      try {
        const result = await operation(context, attempt);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Enhance error with retry context
   */
  enhanceError(error, attempt, context, operationId) {
    const classified = ErrorClassifier.classifyError(error);
    
    // Add retry context to metadata
    classified.metadata = {
      ...classified.metadata,
      retryContext: {
        attempt,
        operationId,
        context: context.errorContext || {},
        timestamp: new Date().toISOString()
      }
    };
    
    return classified;
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  calculateDelay(attempt, error = null) {
    // Check if error has specific retry delay (e.g., rate limit)
    if (error && error.type === ErrorTypes.RATE_LIMIT_ERROR && error.metadata.retryAfter) {
      return parseInt(error.metadata.retryAfter) * 1000;
    }
    
    // Exponential backoff
    let delay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);
    delay = Math.min(delay, this.config.maxDelay);
    
    // Add jitter to prevent thundering herd
    if (this.config.jitterEnabled) {
      const jitterRange = delay * 0.1; // ±10% jitter
      const jitter = (Math.random() - 0.5) * 2 * jitterRange;
      delay = Math.max(0, delay + jitter);
    }
    
    return Math.floor(delay);
  }

  /**
   * Check if error is retryable
   */
  isRetryable(error) {
    // Check if it's a SystemError with retryable flag
    if (error instanceof SystemError) {
      // Explicit non-retryable errors
      if (this.config.nonRetryableErrors.includes(error.type)) {
        return false;
      }
      
      // Use the error's retryable flag
      return error.retryable;
    }
    
    // Classify unknown errors and check
    const classified = ErrorClassifier.classifyError(error);
    return this.isRetryable(classified);
  }

  /**
   * Simple delay utility
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a retry manager with predefined policy
   */
  static withPolicy(policyName, overrides = {}) {
    const policy = RetryPolicies[policyName];
    if (!policy) {
      throw new SystemError(
        `Unknown retry policy: ${policyName}`,
        ErrorTypes.CONFIGURATION_ERROR,
        false
      );
    }
    
    return new RetryManager({ ...policy, ...overrides });
  }

  /**
   * Get retry metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      averageDelay: this.metrics.totalAttempts > 0 
        ? this.metrics.totalDelay / this.metrics.totalAttempts 
        : 0,
      successRate: this.metrics.totalAttempts > 0
        ? (this.metrics.totalAttempts - this.metrics.failedRetries) / this.metrics.totalAttempts
        : 0
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      totalAttempts: 0,
      successfulRetries: 0,
      failedRetries: 0,
      totalDelay: 0
    };
  }

  /**
   * Execute multiple operations with retry in parallel
   */
  async executeParallel(operations, context = {}) {
    const promises = operations.map((operation, index) => 
      this.executeWithRetry(operation, {
        ...context,
        operationId: context.operationId ? `${context.operationId}_${index}` : `parallel_${index}`
      })
    );
    
    return Promise.all(promises);
  }

  /**
   * Execute operations with retry in sequence
   */
  async executeSequential(operations, context = {}) {
    const results = [];
    
    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];
      const operationContext = {
        ...context,
        operationId: context.operationId ? `${context.operationId}_${i}` : `sequential_${i}`
      };
      
      const result = await this.executeWithRetry(operation, operationContext);
      results.push(result);
    }
    
    return results;
  }

  /**
   * Create a retryable wrapper for a function
   */
  wrap(operation, context = {}) {
    return (...args) => {
      const wrappedOperation = () => operation(...args);
      return this.executeWithRetry(wrappedOperation, context);
    };
  }
}

/**
 * Utility functions for common retry scenarios
 */
export class RetryUtils {
  /**
   * Create a retry manager for API calls
   */
  static forApiCalls(overrides = {}) {
    return RetryManager.withPolicy('API_CALLS', overrides);
  }

  /**
   * Create a retry manager for network operations
   */
  static forNetworkOps(overrides = {}) {
    return RetryManager.withPolicy('NETWORK_OPERATIONS', overrides);
  }

  /**
   * Create a retry manager for database operations
   */
  static forDatabaseOps(overrides = {}) {
    return RetryManager.withPolicy('DATABASE_OPERATIONS', overrides);
  }

  /**
   * Create a retry manager for file operations
   */
  static forFileOps(overrides = {}) {
    return RetryManager.withPolicy('FILE_OPERATIONS', overrides);
  }

  /**
   * Retry a simple async function with default settings
   */
  static async retry(operation, maxRetries = 3) {
    const retryManager = new RetryManager({ maxRetries });
    return retryManager.executeWithRetry(operation);
  }

  /**
   * Retry with exponential backoff
   */
  static async retryWithBackoff(operation, config = {}) {
    const retryManager = new RetryManager(config);
    return retryManager.executeWithRetry(operation);
  }
}

export default RetryManager;

