/**
 * Error Recovery Manager
 * Handles workflow failures and implements retry mechanisms
 */

import { EventEmitter } from 'events';

/**
 * Error Recovery Manager for handling workflow failures
 */
export class ErrorRecoveryManager extends EventEmitter {
  constructor(orchestrator) {
    super();
    
    this.orchestrator = orchestrator;
    this.retryStrategies = new Map();
    this.failureHistory = new Map();
    this.recoveryAttempts = new Map();
    
    // Default retry configuration
    this.defaultRetryConfig = {
      maxAttempts: 3,
      baseDelay: 1000, // 1 second
      maxDelay: 30000, // 30 seconds
      backoffMultiplier: 2,
      retryableErrors: [
        'NETWORK_ERROR',
        'TIMEOUT_ERROR',
        'TEMPORARY_FAILURE',
        'RATE_LIMIT_ERROR',
        'SERVICE_UNAVAILABLE'
      ]
    };

    this._setupErrorHandlers();
  }

  /**
   * Handle workflow error and attempt recovery
   * @param {string} workflowId - Workflow ID
   * @param {Error} error - Error that occurred
   * @param {Object} context - Additional context
   */
  async handleWorkflowError(workflowId, error, context = {}) {
    try {
      // Record failure
      this._recordFailure(workflowId, error, context);

      // Determine error type and recovery strategy
      const errorType = this._classifyError(error);
      const strategy = this._getRecoveryStrategy(errorType, context);

      this.emit('error:detected', {
        workflowId,
        error: error.message,
        errorType,
        strategy: strategy.name
      });

      // Attempt recovery
      const recoveryResult = await this._executeRecoveryStrategy(
        workflowId,
        error,
        strategy,
        context
      );

      if (recoveryResult.success) {
        this.emit('error:recovered', {
          workflowId,
          strategy: strategy.name,
          attempts: recoveryResult.attempts
        });
        return recoveryResult;
      } else {
        this.emit('error:recovery_failed', {
          workflowId,
          strategy: strategy.name,
          finalError: recoveryResult.error
        });
        throw new Error(`Recovery failed: ${recoveryResult.error}`);
      }

    } catch (recoveryError) {
      this.emit('error:recovery_error', {
        workflowId,
        originalError: error.message,
        recoveryError: recoveryError.message
      });
      throw recoveryError;
    }
  }

  /**
   * Register custom recovery strategy
   * @param {string} errorType - Error type to handle
   * @param {Object} strategy - Recovery strategy configuration
   */
  registerRecoveryStrategy(errorType, strategy) {
    this.retryStrategies.set(errorType, {
      name: strategy.name || `${errorType}_recovery`,
      maxAttempts: strategy.maxAttempts || this.defaultRetryConfig.maxAttempts,
      baseDelay: strategy.baseDelay || this.defaultRetryConfig.baseDelay,
      maxDelay: strategy.maxDelay || this.defaultRetryConfig.maxDelay,
      backoffMultiplier: strategy.backoffMultiplier || this.defaultRetryConfig.backoffMultiplier,
      retryCondition: strategy.retryCondition || (() => true),
      recoveryAction: strategy.recoveryAction || this._defaultRecoveryAction.bind(this),
      ...strategy
    });
  }

  /**
   * Get failure statistics for a workflow
   * @param {string} workflowId - Workflow ID
   */
  getFailureStats(workflowId) {
    const failures = this.failureHistory.get(workflowId) || [];
    const attempts = this.recoveryAttempts.get(workflowId) || 0;

    return {
      totalFailures: failures.length,
      recoveryAttempts: attempts,
      lastFailure: failures[failures.length - 1] || null,
      errorTypes: [...new Set(failures.map(f => f.errorType))],
      averageRecoveryTime: this._calculateAverageRecoveryTime(failures)
    };
  }

  /**
   * Check if workflow should be retried
   * @param {string} workflowId - Workflow ID
   * @param {string} errorType - Error type
   */
  shouldRetry(workflowId, errorType) {
    const attempts = this.recoveryAttempts.get(workflowId) || 0;
    const strategy = this._getRecoveryStrategy(errorType);
    
    return attempts < strategy.maxAttempts && 
           this.defaultRetryConfig.retryableErrors.includes(errorType);
  }

  /**
   * Reset recovery attempts for workflow
   * @param {string} workflowId - Workflow ID
   */
  resetRecoveryAttempts(workflowId) {
    this.recoveryAttempts.delete(workflowId);
    this.emit('recovery:reset', { workflowId });
  }

  /**
   * Get recovery recommendations based on error patterns
   * @param {string} workflowId - Workflow ID
   */
  getRecoveryRecommendations(workflowId) {
    const failures = this.failureHistory.get(workflowId) || [];
    const recommendations = [];

    if (failures.length === 0) {
      return recommendations;
    }

    // Analyze failure patterns
    const errorTypes = failures.map(f => f.errorType);
    const recentFailures = failures.slice(-5); // Last 5 failures

    // Check for recurring patterns
    if (this._hasRecurringPattern(errorTypes)) {
      recommendations.push({
        type: 'pattern_detected',
        message: 'Recurring error pattern detected. Consider reviewing task configuration.',
        priority: 'high'
      });
    }

    // Check for timeout issues
    if (recentFailures.some(f => f.errorType === 'TIMEOUT_ERROR')) {
      recommendations.push({
        type: 'timeout_optimization',
        message: 'Consider increasing timeout values or optimizing task execution.',
        priority: 'medium'
      });
    }

    // Check for dependency issues
    if (recentFailures.some(f => f.errorType === 'DEPENDENCY_ERROR')) {
      recommendations.push({
        type: 'dependency_review',
        message: 'Review task dependencies and execution order.',
        priority: 'high'
      });
    }

    // Check for resource issues
    if (recentFailures.some(f => f.errorType === 'RESOURCE_ERROR')) {
      recommendations.push({
        type: 'resource_scaling',
        message: 'Consider scaling resources or reducing concurrent workflows.',
        priority: 'medium'
      });
    }

    return recommendations;
  }

  /**
   * Private: Record failure in history
   */
  _recordFailure(workflowId, error, context) {
    if (!this.failureHistory.has(workflowId)) {
      this.failureHistory.set(workflowId, []);
    }

    const failure = {
      timestamp: new Date(),
      error: error.message,
      errorType: this._classifyError(error),
      stack: error.stack,
      context,
      recoveryStartTime: Date.now()
    };

    this.failureHistory.get(workflowId).push(failure);

    // Limit history size
    const history = this.failureHistory.get(workflowId);
    if (history.length > 50) {
      history.splice(0, history.length - 50);
    }
  }

  /**
   * Private: Classify error type
   */
  _classifyError(error) {
    const message = error.message.toLowerCase();
    const stack = error.stack?.toLowerCase() || '';

    // Network-related errors
    if (message.includes('network') || message.includes('connection') || 
        message.includes('econnrefused') || message.includes('enotfound')) {
      return 'NETWORK_ERROR';
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('timed out')) {
      return 'TIMEOUT_ERROR';
    }

    // Rate limiting
    if (message.includes('rate limit') || message.includes('too many requests') ||
        message.includes('429')) {
      return 'RATE_LIMIT_ERROR';
    }

    // Service unavailable
    if (message.includes('service unavailable') || message.includes('503') ||
        message.includes('502') || message.includes('504')) {
      return 'SERVICE_UNAVAILABLE';
    }

    // Authentication/authorization
    if (message.includes('unauthorized') || message.includes('forbidden') ||
        message.includes('401') || message.includes('403')) {
      return 'AUTH_ERROR';
    }

    // Dependency errors
    if (message.includes('dependency') || message.includes('circular') ||
        message.includes('not found')) {
      return 'DEPENDENCY_ERROR';
    }

    // Resource errors
    if (message.includes('memory') || message.includes('disk') ||
        message.includes('resource') || message.includes('limit exceeded')) {
      return 'RESOURCE_ERROR';
    }

    // Validation errors
    if (message.includes('validation') || message.includes('invalid') ||
        message.includes('malformed')) {
      return 'VALIDATION_ERROR';
    }

    // Default to temporary failure
    return 'TEMPORARY_FAILURE';
  }

  /**
   * Private: Get recovery strategy for error type
   */
  _getRecoveryStrategy(errorType, context = {}) {
    // Check for custom strategy
    if (this.retryStrategies.has(errorType)) {
      return this.retryStrategies.get(errorType);
    }

    // Return default strategy based on error type
    switch (errorType) {
      case 'NETWORK_ERROR':
      case 'TIMEOUT_ERROR':
      case 'SERVICE_UNAVAILABLE':
        return {
          name: 'exponential_backoff',
          maxAttempts: 5,
          baseDelay: 2000,
          maxDelay: 60000,
          backoffMultiplier: 2,
          recoveryAction: this._networkRecoveryAction.bind(this)
        };

      case 'RATE_LIMIT_ERROR':
        return {
          name: 'rate_limit_backoff',
          maxAttempts: 3,
          baseDelay: 10000,
          maxDelay: 300000, // 5 minutes
          backoffMultiplier: 3,
          recoveryAction: this._rateLimitRecoveryAction.bind(this)
        };

      case 'DEPENDENCY_ERROR':
        return {
          name: 'dependency_resolution',
          maxAttempts: 2,
          baseDelay: 5000,
          maxDelay: 30000,
          backoffMultiplier: 2,
          recoveryAction: this._dependencyRecoveryAction.bind(this)
        };

      case 'RESOURCE_ERROR':
        return {
          name: 'resource_optimization',
          maxAttempts: 2,
          baseDelay: 30000,
          maxDelay: 120000,
          backoffMultiplier: 2,
          recoveryAction: this._resourceRecoveryAction.bind(this)
        };

      default:
        return {
          name: 'default_retry',
          ...this.defaultRetryConfig,
          recoveryAction: this._defaultRecoveryAction.bind(this)
        };
    }
  }

  /**
   * Private: Execute recovery strategy
   */
  async _executeRecoveryStrategy(workflowId, error, strategy, context) {
    const attempts = this.recoveryAttempts.get(workflowId) || 0;
    
    if (attempts >= strategy.maxAttempts) {
      return {
        success: false,
        error: `Maximum recovery attempts (${strategy.maxAttempts}) exceeded`,
        attempts
      };
    }

    this.recoveryAttempts.set(workflowId, attempts + 1);

    try {
      // Calculate delay
      const delay = Math.min(
        strategy.baseDelay * Math.pow(strategy.backoffMultiplier, attempts),
        strategy.maxDelay
      );

      this.emit('recovery:attempt', {
        workflowId,
        attempt: attempts + 1,
        strategy: strategy.name,
        delay
      });

      // Wait before retry
      if (delay > 0) {
        await this._sleep(delay);
      }

      // Execute recovery action
      const recoveryResult = await strategy.recoveryAction(workflowId, error, context);

      return {
        success: true,
        result: recoveryResult,
        attempts: attempts + 1
      };

    } catch (recoveryError) {
      return {
        success: false,
        error: recoveryError.message,
        attempts: attempts + 1
      };
    }
  }

  /**
   * Private: Default recovery action
   */
  async _defaultRecoveryAction(workflowId, error, context) {
    // Simply retry the workflow
    return await this.orchestrator.processTask(context.taskId, context.options);
  }

  /**
   * Private: Network recovery action
   */
  async _networkRecoveryAction(workflowId, error, context) {
    // Check network connectivity before retry
    // For now, just retry with longer timeout
    const extendedContext = {
      ...context,
      options: {
        ...context.options,
        timeout: (context.options?.timeout || 300000) * 1.5
      }
    };
    
    return await this.orchestrator.processTask(context.taskId, extendedContext.options);
  }

  /**
   * Private: Rate limit recovery action
   */
  async _rateLimitRecoveryAction(workflowId, error, context) {
    // Implement exponential backoff for rate limits
    // Could also implement queue management here
    return await this.orchestrator.processTask(context.taskId, context.options);
  }

  /**
   * Private: Dependency recovery action
   */
  async _dependencyRecoveryAction(workflowId, error, context) {
    // Re-analyze dependencies and retry
    // Could implement dependency graph repair here
    return await this.orchestrator.processTask(context.taskId, context.options);
  }

  /**
   * Private: Resource recovery action
   */
  async _resourceRecoveryAction(workflowId, error, context) {
    // Wait for resources to become available
    // Could implement resource monitoring here
    await this._sleep(30000); // Wait 30 seconds
    return await this.orchestrator.processTask(context.taskId, context.options);
  }

  /**
   * Private: Setup error handlers
   */
  _setupErrorHandlers() {
    this.on('error:detected', ({ workflowId, errorType }) => {
      console.log(`🚨 Error detected in workflow ${workflowId}: ${errorType}`);
    });

    this.on('recovery:attempt', ({ workflowId, attempt, strategy, delay }) => {
      console.log(`🔄 Recovery attempt ${attempt} for workflow ${workflowId} using ${strategy} (delay: ${delay}ms)`);
    });

    this.on('error:recovered', ({ workflowId, strategy, attempts }) => {
      console.log(`✅ Workflow ${workflowId} recovered using ${strategy} after ${attempts} attempts`);
    });

    this.on('error:recovery_failed', ({ workflowId, strategy }) => {
      console.log(`❌ Recovery failed for workflow ${workflowId} using ${strategy}`);
    });
  }

  /**
   * Private: Check for recurring error patterns
   */
  _hasRecurringPattern(errorTypes) {
    if (errorTypes.length < 3) return false;
    
    const recent = errorTypes.slice(-3);
    return recent.every(type => type === recent[0]);
  }

  /**
   * Private: Calculate average recovery time
   */
  _calculateAverageRecoveryTime(failures) {
    if (failures.length === 0) return 0;
    
    const recoveryTimes = failures
      .filter(f => f.recoveryEndTime)
      .map(f => f.recoveryEndTime - f.recoveryStartTime);
    
    if (recoveryTimes.length === 0) return 0;
    
    return recoveryTimes.reduce((sum, time) => sum + time, 0) / recoveryTimes.length;
  }

  /**
   * Private: Sleep utility
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup and shutdown
   */
  shutdown() {
    this.failureHistory.clear();
    this.recoveryAttempts.clear();
    this.retryStrategies.clear();
    this.emit('error_recovery:shutdown');
  }
}

export default ErrorRecoveryManager;

