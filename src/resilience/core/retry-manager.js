/**
 * retry-manager.js
 * Unified retry mechanisms with exponential backoff
 * Consolidates retry logic from ai-services-unified.js and other modules
 */

import { errorClassifier, RECOVERY_STRATEGIES } from './error-classifier.js';

// Default retry configuration
export const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterEnabled: true,
  timeoutMs: 60000
};

/**
 * Unified retry manager with exponential backoff and jitter
 * Replaces scattered retry logic across the codebase
 */
export class RetryManager {
  constructor(config = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
    this.activeRetries = new Map();
    this.retryStats = {
      totalAttempts: 0,
      successfulRetries: 0,
      failedRetries: 0,
      averageRetryCount: 0
    };
  }

  /**
   * Execute a function with retry logic
   * @param {Function} fn - Function to execute
   * @param {Object} options - Retry options
   * @returns {Promise} Result of function execution
   */
  async executeWithRetry(fn, options = {}) {
    const retryConfig = { ...this.config, ...options };
    const operationId = this._generateOperationId();
    
    let lastError;
    let attempt = 0;

    this.activeRetries.set(operationId, {
      startTime: Date.now(),
      attempts: 0,
      config: retryConfig
    });

    try {
      while (attempt <= retryConfig.maxRetries) {
        try {
          this.retryStats.totalAttempts++;
          this.activeRetries.get(operationId).attempts = attempt + 1;

          // Set timeout for the operation
          const result = await this._executeWithTimeout(fn, retryConfig.timeoutMs);
          
          if (attempt > 0) {
            this.retryStats.successfulRetries++;
          }

          return result;
        } catch (error) {
          lastError = error;
          attempt++;

          // Classify the error to determine if it's retryable
          const classification = errorClassifier.classify(error);
          
          if (!classification.retryable || attempt > retryConfig.maxRetries) {
            break;
          }

          // Calculate delay with exponential backoff and jitter
          const delay = this._calculateDelay(attempt, retryConfig);
          
          // Log retry attempt
          if (options.logger) {
            options.logger.warn(
              `Retry attempt ${attempt}/${retryConfig.maxRetries} for operation ${operationId}. ` +
              `Error: ${error.message}. Retrying in ${delay}ms...`
            );
          }

          await this._delay(delay);
        }
      }

      // All retries exhausted
      this.retryStats.failedRetries++;
      throw lastError;
    } finally {
      this.activeRetries.delete(operationId);
    }
  }

  /**
   * Execute function with timeout
   * @param {Function} fn - Function to execute
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {Promise} Function result or timeout error
   */
  async _executeWithTimeout(fn, timeoutMs) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        const result = await fn();
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   * @param {number} attempt - Current attempt number
   * @param {Object} config - Retry configuration
   * @returns {number} Delay in milliseconds
   */
  _calculateDelay(attempt, config) {
    // Exponential backoff: delay = initialDelay * (backoffMultiplier ^ (attempt - 1))
    let delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
    
    // Cap at maximum delay
    delay = Math.min(delay, config.maxDelayMs);
    
    // Add jitter to prevent thundering herd
    if (config.jitterEnabled) {
      const jitter = delay * 0.1 * Math.random(); // 10% jitter
      delay += jitter;
    }
    
    return Math.floor(delay);
  }

  /**
   * Create a delay promise
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} Delay promise
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate unique operation ID
   * @returns {string} Operation ID
   */
  _generateOperationId() {
    return `retry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current retry statistics
   * @returns {Object} Retry statistics
   */
  getStats() {
    const activeCount = this.activeRetries.size;
    const stats = { ...this.retryStats, activeRetries: activeCount };
    
    if (stats.totalAttempts > 0) {
      stats.averageRetryCount = (stats.successfulRetries + stats.failedRetries) / stats.totalAttempts;
    }
    
    return stats;
  }

  /**
   * Get information about active retries
   * @returns {Array} Active retry operations
   */
  getActiveRetries() {
    const active = [];
    for (const [operationId, info] of this.activeRetries) {
      active.push({
        operationId,
        duration: Date.now() - info.startTime,
        attempts: info.attempts,
        maxRetries: info.config.maxRetries
      });
    }
    return active;
  }

  /**
   * Cancel all active retries
   */
  cancelAllRetries() {
    this.activeRetries.clear();
  }

  /**
   * Update retry configuration
   * @param {Object} newConfig - New configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }
}

// Export singleton instance
export const retryManager = new RetryManager();

