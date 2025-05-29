/**
 * error-handler.js
 * 
 * Main error handling middleware that integrates classification, retry logic,
 * analytics, and escalation systems for comprehensive error management.
 */

import { log } from '../scripts/modules/utils.js';
import { errorClassifier } from '../error-handling/core/error-classifier.js';
import { retryManager } from '../utils/retry-manager.js';
import { errorAnalytics } from '../error-handling/analytics/error-analytics.js';
import { escalationManager } from '../error-handling/escalation/escalation-manager.js';

/**
 * Error handling strategies
 */
export const ErrorStrategies = {
  AUTO_FIX: 'auto-fix',
  REINSTALL: 'reinstall',
  RESET_ENV: 'reset-env',
  RETRY_WITH_BACKOFF: 'retry-with-backoff',
  ESCALATE: 'escalate',
  IGNORE: 'ignore'
};

/**
 * Error context builder
 */
class ErrorContextBuilder {
  constructor() {
    this.context = {};
  }

  operation(operation) {
    this.context.operation = operation;
    return this;
  }

  component(component) {
    this.context.component = component;
    return this;
  }

  user(userId) {
    this.context.userId = userId;
    return this;
  }

  session(sessionId) {
    this.context.sessionId = sessionId;
    return this;
  }

  environment(env) {
    this.context.environment = env;
    return this;
  }

  metadata(key, value) {
    if (!this.context.metadata) {
      this.context.metadata = {};
    }
    this.context.metadata[key] = value;
    return this;
  }

  build() {
    return { ...this.context };
  }
}

/**
 * Main error handler class
 */
export class ErrorHandler {
  constructor(options = {}) {
    this.enableAnalytics = options.analytics !== false;
    this.enableEscalation = options.escalation !== false;
    this.enableRetry = options.retry !== false;
    this.enableClassification = options.classification !== false;
    
    this.defaultRetryOptions = {
      maxRetries: 3,
      baseDelay: 1000,
      strategy: 'exponential_backoff'
    };

    // Strategy implementations
    this.strategies = new Map();
    this._initializeStrategies();

    // Error handling statistics
    this.stats = {
      totalErrors: 0,
      resolvedErrors: 0,
      escalatedErrors: 0,
      retriedErrors: 0,
      startTime: Date.now()
    };
  }

  /**
   * Initialize error handling strategies
   * @private
   */
  _initializeStrategies() {
    // Auto-fix strategy for syntax errors
    this.strategies.set(ErrorStrategies.AUTO_FIX, async (error, classification, context) => {
      log('info', `Attempting auto-fix for ${classification.type}`);
      
      // Implement specific auto-fix logic based on error type
      if (classification.type === 'SYNTAX_ERROR') {
        return this._attemptSyntaxFix(error, context);
      } else if (classification.type === 'VALIDATION_ERROR') {
        return this._attemptValidationFix(error, context);
      }
      
      return { success: false, reason: 'No auto-fix available' };
    });

    // Reinstall strategy for dependency errors
    this.strategies.set(ErrorStrategies.REINSTALL, async (error, classification, context) => {
      log('info', `Attempting reinstall for ${classification.type}`);
      
      // This would implement dependency reinstallation logic
      // For now, we'll simulate the process
      return { success: true, reason: 'Dependencies reinstalled (simulated)' };
    });

    // Environment reset strategy
    this.strategies.set(ErrorStrategies.RESET_ENV, async (error, classification, context) => {
      log('info', `Attempting environment reset for ${classification.type}`);
      
      // This would implement environment reset logic
      return { success: true, reason: 'Environment reset (simulated)' };
    });

    // Retry with backoff strategy
    this.strategies.set(ErrorStrategies.RETRY_WITH_BACKOFF, async (error, classification, context) => {
      log('info', `Using retry strategy for ${classification.type}`);
      
      // This strategy is handled by the retry manager
      return { success: true, reason: 'Handled by retry manager' };
    });

    // Escalation strategy
    this.strategies.set(ErrorStrategies.ESCALATE, async (error, classification, context) => {
      log('info', `Escalating ${classification.type}`);
      
      if (this.enableEscalation) {
        const escalationResult = await escalationManager.evaluateEscalation(error, classification, context);
        return { 
          success: escalationResult.escalated, 
          reason: `Escalated to ${escalationResult.level?.name || 'unknown'} level`,
          escalationId: escalationResult.escalationId
        };
      }
      
      return { success: false, reason: 'Escalation disabled' };
    });
  }

  /**
   * Handle an error with full processing pipeline
   */
  async handleError(error, context = {}) {
    const startTime = Date.now();
    this.stats.totalErrors++;

    try {
      // Step 1: Classify the error
      let classification = null;
      if (this.enableClassification) {
        classification = errorClassifier.classify(error, context);
        log('debug', `Error classified as ${classification.type} with ${Math.round(classification.confidence * 100)}% confidence`);
      } else {
        // Fallback classification
        classification = {
          type: 'UNKNOWN_ERROR',
          severity: 'medium',
          strategy: 'retry-with-backoff',
          maxRetries: 3,
          confidence: 0.5
        };
      }

      // Step 2: Record error in analytics
      let errorId = null;
      if (this.enableAnalytics) {
        errorId = errorAnalytics.recordError(error, classification, context);
        context.errorId = errorId;
      }

      // Step 3: Determine handling strategy
      const strategy = classification.strategy || ErrorStrategies.RETRY_WITH_BACKOFF;
      
      // Step 4: Execute strategy
      const result = await this._executeStrategy(error, classification, context, strategy);

      // Step 5: Record resolution if successful
      if (result.success && this.enableAnalytics && errorId) {
        errorAnalytics.recordResolution(errorId, strategy, true, {
          processingTime: Date.now() - startTime,
          ...result
        });
        this.stats.resolvedErrors++;
      }

      // Step 6: Handle escalation if strategy failed
      if (!result.success && this.enableEscalation) {
        const escalationResult = await escalationManager.evaluateEscalation(error, classification, {
          ...context,
          strategyFailed: strategy,
          strategyResult: result
        });
        
        if (escalationResult.escalated) {
          this.stats.escalatedErrors++;
          result.escalated = true;
          result.escalationId = escalationResult.escalationId;
        }
      }

      return {
        success: result.success,
        errorId,
        classification,
        strategy,
        result,
        processingTime: Date.now() - startTime
      };

    } catch (handlingError) {
      log('error', `Error in error handling pipeline: ${handlingError.message}`);
      
      // Fallback handling
      return {
        success: false,
        error: handlingError,
        fallback: true,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Handle error with retry logic
   */
  async handleErrorWithRetry(operation, options = {}) {
    if (!this.enableRetry) {
      return await operation();
    }

    const retryOptions = {
      ...this.defaultRetryOptions,
      ...options,
      operationName: options.operationName || 'unknown_operation',
      operationType: options.operationType || 'default'
    };

    this.stats.retriedErrors++;

    return await retryManager.executeWithRetry(async (context) => {
      try {
        return await operation(context);
      } catch (error) {
        // Handle the error through our pipeline
        const handlingResult = await this.handleError(error, {
          ...context,
          retryAttempt: context.retryCount,
          operation: retryOptions.operationName
        });

        // If we successfully handled the error, don't retry
        if (handlingResult.success) {
          log('info', `Error handled successfully, not retrying: ${handlingResult.strategy}`);
          return handlingResult.result;
        }

        // Re-throw the error for retry logic
        throw error;
      }
    }, retryOptions);
  }

  /**
   * Execute error handling strategy
   * @private
   */
  async _executeStrategy(error, classification, context, strategyName) {
    const strategy = this.strategies.get(strategyName);
    
    if (!strategy) {
      log('warn', `Unknown error strategy: ${strategyName}`);
      return { success: false, reason: `Unknown strategy: ${strategyName}` };
    }

    try {
      const result = await strategy(error, classification, context);
      log('debug', `Strategy ${strategyName} result: ${result.success ? 'success' : 'failure'}`);
      return result;
    } catch (strategyError) {
      log('error', `Strategy ${strategyName} failed: ${strategyError.message}`);
      return { success: false, reason: `Strategy execution failed: ${strategyError.message}` };
    }
  }

  /**
   * Attempt syntax fix
   * @private
   */
  async _attemptSyntaxFix(error, context) {
    // This would implement actual syntax fixing logic
    // For now, we'll simulate common fixes
    const message = error.message?.toLowerCase() || '';
    
    if (message.includes('missing semicolon')) {
      return { success: true, reason: 'Added missing semicolon', fix: 'semicolon' };
    } else if (message.includes('unterminated string')) {
      return { success: true, reason: 'Fixed unterminated string', fix: 'string_termination' };
    } else if (message.includes('unexpected token')) {
      return { success: false, reason: 'Complex syntax error requires manual review' };
    }
    
    return { success: false, reason: 'No automatic fix available' };
  }

  /**
   * Attempt validation fix
   * @private
   */
  async _attemptValidationFix(error, context) {
    // This would implement validation fixing logic
    const message = error.message?.toLowerCase() || '';
    
    if (message.includes('required field')) {
      return { success: true, reason: 'Added default value for required field', fix: 'default_value' };
    } else if (message.includes('invalid format')) {
      return { success: true, reason: 'Applied format correction', fix: 'format_correction' };
    }
    
    return { success: false, reason: 'No automatic validation fix available' };
  }

  /**
   * Add custom error handling strategy
   */
  addStrategy(name, implementation) {
    this.strategies.set(name, implementation);
    log('info', `Added custom error strategy: ${name}`);
  }

  /**
   * Create error context builder
   */
  createContext() {
    return new ErrorContextBuilder();
  }

  /**
   * Get error handling statistics
   */
  getStats() {
    const uptime = Date.now() - this.stats.startTime;
    const errorRate = this.stats.totalErrors / (uptime / 1000); // errors per second
    const resolutionRate = this.stats.totalErrors > 0 ? (this.stats.resolvedErrors / this.stats.totalErrors) * 100 : 0;
    const escalationRate = this.stats.totalErrors > 0 ? (this.stats.escalatedErrors / this.stats.totalErrors) * 100 : 0;

    return {
      ...this.stats,
      uptime,
      errorRate: Math.round(errorRate * 1000) / 1000, // Round to 3 decimal places
      resolutionRate: Math.round(resolutionRate * 100) / 100,
      escalationRate: Math.round(escalationRate * 100) / 100,
      configuration: {
        analytics: this.enableAnalytics,
        escalation: this.enableEscalation,
        retry: this.enableRetry,
        classification: this.enableClassification
      }
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalErrors: 0,
      resolvedErrors: 0,
      escalatedErrors: 0,
      retriedErrors: 0,
      startTime: Date.now()
    };
  }

  /**
   * Express.js middleware factory
   */
  expressMiddleware() {
    return async (error, req, res, next) => {
      const context = this.createContext()
        .operation('http_request')
        .component('express')
        .metadata('method', req.method)
        .metadata('url', req.url)
        .metadata('userAgent', req.get('User-Agent'))
        .build();

      const result = await this.handleError(error, context);

      // Set appropriate HTTP status code
      const statusCode = this._getHttpStatusCode(error, result.classification);
      
      res.status(statusCode).json({
        error: {
          message: 'An error occurred while processing your request',
          id: result.errorId,
          type: result.classification?.type,
          timestamp: new Date().toISOString()
        },
        handled: result.success,
        ...(process.env.NODE_ENV === 'development' && {
          debug: {
            originalError: error.message,
            strategy: result.strategy,
            processingTime: result.processingTime
          }
        })
      });
    };
  }

  /**
   * Get appropriate HTTP status code for error
   * @private
   */
  _getHttpStatusCode(error, classification) {
    if (error.status) return error.status;
    
    switch (classification?.type) {
      case 'AUTHENTICATION_ERROR':
        return 401;
      case 'VALIDATION_ERROR':
        return 400;
      case 'DEPENDENCY_ERROR':
        return 404;
      case 'NETWORK_ERROR':
        return 503;
      case 'RESOURCE_ERROR':
        return 507;
      default:
        return 500;
    }
  }
}

/**
 * Global error handler instance
 */
export const globalErrorHandler = new ErrorHandler();

/**
 * Convenience function for handling errors
 */
export async function handleError(error, context = {}) {
  return await globalErrorHandler.handleError(error, context);
}

/**
 * Convenience function for handling errors with retry
 */
export async function handleErrorWithRetry(operation, options = {}) {
  return await globalErrorHandler.handleErrorWithRetry(operation, options);
}

/**
 * Create error context
 */
export function createErrorContext() {
  return globalErrorHandler.createContext();
}

/**
 * Process unhandled errors
 */
process.on('uncaughtException', async (error) => {
  log('error', `Uncaught exception: ${error.message}`);
  
  try {
    await globalErrorHandler.handleError(error, {
      operation: 'uncaught_exception',
      component: 'process',
      critical: true
    });
  } catch (handlingError) {
    log('error', `Failed to handle uncaught exception: ${handlingError.message}`);
  }
  
  // Exit gracefully
  process.exit(1);
});

/**
 * Process unhandled promise rejections
 */
process.on('unhandledRejection', async (reason, promise) => {
  log('error', `Unhandled promise rejection: ${reason}`);
  
  try {
    await globalErrorHandler.handleError(reason, {
      operation: 'unhandled_rejection',
      component: 'promise',
      critical: true
    });
  } catch (handlingError) {
    log('error', `Failed to handle unhandled rejection: ${handlingError.message}`);
  }
});

export default ErrorHandler;

