/**
 * resilience-handler.js
 * Main handler that orchestrates all resilience components
 * Provides a unified interface for error handling and recovery
 */

import { RECOVERY_STRATEGIES } from '../core/error-classifier.js';

/**
 * Main resilience handler that coordinates all resilience components
 */
export class ResilienceHandler {
  constructor(config = {}) {
    this.logger = config.logger;
    this.errorClassifier = config.errorClassifier;
    this.retryManager = config.retryManager;
    this.circuitBreakerRegistry = config.circuitBreakerRegistry;
    
    this.config = {
      defaultRetryConfig: {
        maxRetries: 3,
        initialDelayMs: 1000,
        backoffMultiplier: 2
      },
      defaultCircuitConfig: {
        failureThreshold: 5,
        timeoutMs: 60000
      },
      ...config
    };
  }

  /**
   * Handle an operation with full resilience protection
   * @param {Function} operation - Operation to execute
   * @param {Object} options - Handler options
   * @returns {Promise} Operation result
   */
  async handle(operation, options = {}) {
    const {
      operationName = 'unknown_operation',
      context = 'system',
      retryConfig = {},
      circuitConfig = {},
      enableFallback = true,
      fallbackOperation = null
    } = options;

    const startTime = Date.now();
    let lastError = null;

    try {
      // Create operation-specific logger
      const operationLogger = this.logger.child(context, { 
        operationName,
        startTime: new Date(startTime).toISOString()
      });

      operationLogger.debug(`Starting operation: ${operationName}`);

      // Get or create circuit breaker for this operation
      const circuitBreaker = this.circuitBreakerRegistry.getBreaker(
        operationName,
        { ...this.config.defaultCircuitConfig, ...circuitConfig }
      );

      // Execute operation with circuit breaker protection
      const result = await circuitBreaker.execute(async () => {
        // Execute with retry protection
        return await this.retryManager.executeWithRetry(
          operation,
          {
            ...this.config.defaultRetryConfig,
            ...retryConfig,
            logger: operationLogger
          }
        );
      });

      const duration = Date.now() - startTime;
      operationLogger.info(
        `Operation completed successfully: ${operationName}`,
        { duration, success: true }
      );

      return result;

    } catch (error) {
      lastError = error;
      const duration = Date.now() - startTime;
      
      // Classify the error
      const classification = this.errorClassifier.classify(error);
      
      const operationLogger = this.logger.child(context, { 
        operationName,
        classification,
        duration,
        success: false
      });

      operationLogger.error(
        `Operation failed: ${operationName}`,
        { error: error.message, classification }
      );

      // Try fallback if enabled and available
      if (enableFallback && fallbackOperation && this._shouldUseFallback(classification)) {
        try {
          operationLogger.info(`Attempting fallback for operation: ${operationName}`);
          
          const fallbackResult = await this._executeFallback(
            fallbackOperation,
            operationName,
            operationLogger
          );
          
          operationLogger.info(
            `Fallback succeeded for operation: ${operationName}`,
            { fallbackUsed: true }
          );
          
          return fallbackResult;
        } catch (fallbackError) {
          operationLogger.error(
            `Fallback failed for operation: ${operationName}`,
            { error: fallbackError.message, fallbackUsed: true }
          );
          
          // Return original error, not fallback error
          throw this._enhanceError(lastError, classification, {
            operationName,
            duration,
            fallbackAttempted: true,
            fallbackError: fallbackError.message
          });
        }
      }

      // No fallback or fallback not applicable
      throw this._enhanceError(lastError, classification, {
        operationName,
        duration,
        fallbackAttempted: false
      });
    }
  }

  /**
   * Determine if fallback should be used based on error classification
   * @param {Object} classification - Error classification
   * @returns {boolean} Whether to use fallback
   */
  _shouldUseFallback(classification) {
    // Use fallback for certain recovery strategies
    return [
      RECOVERY_STRATEGIES.FALLBACK,
      RECOVERY_STRATEGIES.GRACEFUL_DEGRADE,
      RECOVERY_STRATEGIES.CIRCUIT_BREAK
    ].includes(classification.strategy);
  }

  /**
   * Execute fallback operation with protection
   * @param {Function} fallbackOperation - Fallback operation
   * @param {string} operationName - Original operation name
   * @param {Object} logger - Logger instance
   * @returns {Promise} Fallback result
   */
  async _executeFallback(fallbackOperation, operationName, logger) {
    const fallbackName = `${operationName}_fallback`;
    
    // Execute fallback with limited retries
    return await this.retryManager.executeWithRetry(
      fallbackOperation,
      {
        maxRetries: 1, // Limited retries for fallback
        initialDelayMs: 500,
        logger
      }
    );
  }

  /**
   * Enhance error with additional context and classification
   * @param {Error} error - Original error
   * @param {Object} classification - Error classification
   * @param {Object} context - Additional context
   * @returns {Error} Enhanced error
   */
  _enhanceError(error, classification, context) {
    // Create enhanced error that preserves original
    const enhancedError = new Error(error.message);
    enhancedError.name = error.name;
    enhancedError.stack = error.stack;
    
    // Add resilience context
    enhancedError.resilience = {
      classification,
      context,
      timestamp: new Date().toISOString(),
      framework: 'claude-task-master-resilience'
    };

    // Preserve original error properties
    Object.keys(error).forEach(key => {
      if (!enhancedError[key]) {
        enhancedError[key] = error[key];
      }
    });

    return enhancedError;
  }

  /**
   * Handle multiple operations with coordination
   * @param {Array} operations - Array of operations to execute
   * @param {Object} options - Coordination options
   * @returns {Promise} Results array
   */
  async handleMultiple(operations, options = {}) {
    const {
      mode = 'parallel', // parallel, sequential, race
      failFast = false,
      context = 'system'
    } = options;

    const results = [];
    const errors = [];

    switch (mode) {
      case 'parallel':
        return await this._handleParallel(operations, options);
      
      case 'sequential':
        return await this._handleSequential(operations, options);
      
      case 'race':
        return await this._handleRace(operations, options);
      
      default:
        throw new Error(`Unknown execution mode: ${mode}`);
    }
  }

  /**
   * Handle operations in parallel
   * @param {Array} operations - Operations to execute
   * @param {Object} options - Options
   * @returns {Promise} Results array
   */
  async _handleParallel(operations, options) {
    const promises = operations.map((op, index) => 
      this.handle(op.operation, {
        ...options,
        operationName: op.name || `parallel_op_${index}`,
        ...op.options
      }).catch(error => ({ error, index }))
    );

    const results = await Promise.all(promises);
    
    // Separate successful results from errors
    const successResults = [];
    const errorResults = [];
    
    results.forEach((result, index) => {
      if (result && result.error) {
        errorResults.push({ index, error: result.error });
      } else {
        successResults.push({ index, result });
      }
    });

    if (options.failFast && errorResults.length > 0) {
      throw errorResults[0].error;
    }

    return {
      results: successResults,
      errors: errorResults,
      totalOperations: operations.length,
      successCount: successResults.length,
      errorCount: errorResults.length
    };
  }

  /**
   * Handle operations sequentially
   * @param {Array} operations - Operations to execute
   * @param {Object} options - Options
   * @returns {Promise} Results array
   */
  async _handleSequential(operations, options) {
    const results = [];
    const errors = [];

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      try {
        const result = await this.handle(op.operation, {
          ...options,
          operationName: op.name || `sequential_op_${i}`,
          ...op.options
        });
        results.push({ index: i, result });
      } catch (error) {
        errors.push({ index: i, error });
        
        if (options.failFast) {
          throw error;
        }
      }
    }

    return {
      results,
      errors,
      totalOperations: operations.length,
      successCount: results.length,
      errorCount: errors.length
    };
  }

  /**
   * Handle operations in race mode (first to complete wins)
   * @param {Array} operations - Operations to execute
   * @param {Object} options - Options
   * @returns {Promise} First successful result
   */
  async _handleRace(operations, options) {
    const promises = operations.map((op, index) => 
      this.handle(op.operation, {
        ...options,
        operationName: op.name || `race_op_${index}`,
        ...op.options
      })
    );

    return await Promise.race(promises);
  }

  /**
   * Get handler statistics
   * @returns {Object} Handler statistics
   */
  getStats() {
    return {
      circuitBreakers: this.circuitBreakerRegistry.getAllStats(),
      retryManager: this.retryManager.getStats(),
      errorMetrics: this.logger.getErrorMetrics(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Reset handler state
   */
  reset() {
    this.circuitBreakerRegistry.resetAll();
    this.logger.clearLogs();
  }
}

export default ResilienceHandler;

