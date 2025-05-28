/**
 * Central Error Handler
 * 
 * Provides comprehensive error handling, recovery strategies, and integration
 * with retry logic and circuit breakers for the AI CI/CD system.
 */

import { ErrorTypes, ErrorClassifier, SystemError } from '../utils/error_types.js';
import { RetryManager, RetryUtils } from './retry_manager.js';
import { CircuitBreaker, CircuitBreakerManager } from './circuit_breaker.js';

/**
 * Recovery strategies for different error types
 */
export const RecoveryStrategies = {
  RETRY_WITH_BACKOFF: 'RETRY_WITH_BACKOFF',
  CIRCUIT_BREAKER: 'CIRCUIT_BREAKER',
  FALLBACK_ONLY: 'FALLBACK_ONLY',
  FAIL_FAST: 'FAIL_FAST',
  GRACEFUL_DEGRADATION: 'GRACEFUL_DEGRADATION',
  ESCALATE: 'ESCALATE'
};

/**
 * Error handling policies for different components
 */
export const ErrorHandlingPolicies = {
  API_CALLS: {
    strategy: RecoveryStrategies.CIRCUIT_BREAKER,
    retryConfig: {
      maxRetries: 3,
      baseDelay: 1000,
      backoffMultiplier: 2
    },
    circuitBreakerConfig: {
      failureThreshold: 5,
      recoveryTimeout: 60000
    }
  },
  
  DATABASE_OPERATIONS: {
    strategy: RecoveryStrategies.RETRY_WITH_BACKOFF,
    retryConfig: {
      maxRetries: 3,
      baseDelay: 2000,
      backoffMultiplier: 2
    }
  },
  
  FILE_OPERATIONS: {
    strategy: RecoveryStrategies.RETRY_WITH_BACKOFF,
    retryConfig: {
      maxRetries: 2,
      baseDelay: 500,
      backoffMultiplier: 1.5
    }
  },
  
  CRITICAL_OPERATIONS: {
    strategy: RecoveryStrategies.ESCALATE,
    retryConfig: {
      maxRetries: 1,
      baseDelay: 1000
    }
  },
  
  USER_OPERATIONS: {
    strategy: RecoveryStrategies.GRACEFUL_DEGRADATION,
    retryConfig: {
      maxRetries: 2,
      baseDelay: 1000
    }
  }
};

/**
 * Central Error Handler
 */
export class ErrorHandler {
  constructor(config = {}) {
    this.config = {
      enableRetry: config.enableRetry !== false,
      enableCircuitBreaker: config.enableCircuitBreaker !== false,
      enableErrorTracking: config.enableErrorTracking !== false,
      enableAlerting: config.enableAlerting !== false,
      defaultPolicy: config.defaultPolicy || 'API_CALLS',
      ...config
    };
    
    // Initialize components
    this.retryManager = new RetryManager(config.retry || {});
    this.circuitBreakerManager = new CircuitBreakerManager();
    
    // Error tracking and alerting (will be implemented in monitoring)
    this.errorTracker = config.errorTracker || null;
    this.alertManager = config.alertManager || null;
    
    // Recovery strategies
    this.recoveryStrategies = new Map();
    this.initializeRecoveryStrategies();
    
    // Metrics
    this.metrics = {
      errorsHandled: 0,
      errorsRecovered: 0,
      errorsByType: {},
      errorsByComponent: {},
      recoveryStrategiesUsed: {}
    };
  }

  /**
   * Initialize recovery strategies
   */
  initializeRecoveryStrategies() {
    this.recoveryStrategies.set(RecoveryStrategies.RETRY_WITH_BACKOFF, 
      this.createRetryStrategy());
    this.recoveryStrategies.set(RecoveryStrategies.CIRCUIT_BREAKER, 
      this.createCircuitBreakerStrategy());
    this.recoveryStrategies.set(RecoveryStrategies.FALLBACK_ONLY, 
      this.createFallbackStrategy());
    this.recoveryStrategies.set(RecoveryStrategies.FAIL_FAST, 
      this.createFailFastStrategy());
    this.recoveryStrategies.set(RecoveryStrategies.GRACEFUL_DEGRADATION, 
      this.createGracefulDegradationStrategy());
    this.recoveryStrategies.set(RecoveryStrategies.ESCALATE, 
      this.createEscalationStrategy());
  }

  /**
   * Main error handling entry point
   */
  async handleError(error, context = {}) {
    this.metrics.errorsHandled++;
    
    // Enhance error with context
    const enhancedError = this.enhanceError(error, context);
    
    // Update metrics
    this.updateErrorMetrics(enhancedError, context);
    
    // Track error for monitoring
    if (this.config.enableErrorTracking && this.errorTracker) {
      await this.trackError(enhancedError, context);
    }
    
    // Determine if alert is needed
    if (this.config.enableAlerting && this.shouldAlert(enhancedError, context)) {
      await this.sendAlert(enhancedError, context);
    }
    
    // Apply recovery strategy
    const policy = this.getErrorPolicy(context.component || this.config.defaultPolicy);
    const strategy = this.recoveryStrategies.get(policy.strategy);
    
    if (strategy) {
      this.metrics.recoveryStrategiesUsed[policy.strategy] = 
        (this.metrics.recoveryStrategiesUsed[policy.strategy] || 0) + 1;
      
      try {
        const result = await strategy.execute(enhancedError, context, policy);
        this.metrics.errorsRecovered++;
        return result;
      } catch (recoveryError) {
        // Recovery failed, escalate or re-throw
        console.log(`❌ Error recovery failed: ${recoveryError.message}`);
        throw recoveryError;
      }
    }
    
    // No recovery strategy available
    throw enhancedError;
  }

  /**
   * Execute operation with comprehensive error protection
   */
  async executeWithProtection(operation, context = {}) {
    const component = context.component || 'default';
    const operationId = context.operationId || `op_${Date.now()}`;
    
    try {
      // Get policy for this component
      const policy = this.getErrorPolicy(component);
      
      if (policy.strategy === RecoveryStrategies.CIRCUIT_BREAKER) {
        // Use circuit breaker
        const circuitBreaker = this.circuitBreakerManager.getCircuitBreaker(
          component, 
          policy.circuitBreakerConfig
        );
        
        return await circuitBreaker.execute(
          operation,
          context.fallback,
          { operationId }
        );
      } else {
        // Direct execution with error handling
        return await operation();
      }
    } catch (error) {
      return await this.handleError(error, { ...context, operationId });
    }
  }

  /**
   * Enhance error with additional context
   */
  enhanceError(error, context) {
    const classified = ErrorClassifier.classifyError(error);
    
    // Add error handling context
    classified.metadata = {
      ...classified.metadata,
      errorHandlingContext: {
        component: context.component,
        operationId: context.operationId,
        userId: context.userId,
        requestId: context.requestId,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        version: context.version || '1.0.0'
      }
    };
    
    return classified;
  }

  /**
   * Update error metrics
   */
  updateErrorMetrics(error, context) {
    // Count by error type
    this.metrics.errorsByType[error.type] = 
      (this.metrics.errorsByType[error.type] || 0) + 1;
    
    // Count by component
    const component = context.component || 'unknown';
    this.metrics.errorsByComponent[component] = 
      (this.metrics.errorsByComponent[component] || 0) + 1;
  }

  /**
   * Get error handling policy for component
   */
  getErrorPolicy(component) {
    return ErrorHandlingPolicies[component] || ErrorHandlingPolicies[this.config.defaultPolicy];
  }

  /**
   * Check if error should trigger an alert
   */
  shouldAlert(error, context) {
    // Alert on critical errors
    if (error.metadata.severity === 'CRITICAL') {
      return true;
    }
    
    // Alert on high-frequency errors
    const errorCount = this.metrics.errorsByType[error.type] || 0;
    if (errorCount > 10) {
      return true;
    }
    
    // Alert on authentication/authorization errors
    if ([ErrorTypes.AUTHENTICATION_ERROR, ErrorTypes.AUTHORIZATION_ERROR].includes(error.type)) {
      return true;
    }
    
    return false;
  }

  /**
   * Track error for monitoring
   */
  async trackError(error, context) {
    if (this.errorTracker) {
      try {
        await this.errorTracker.track(error, context);
      } catch (trackingError) {
        console.log(`⚠️ Failed to track error: ${trackingError.message}`);
      }
    }
  }

  /**
   * Send alert for error
   */
  async sendAlert(error, context) {
    if (this.alertManager) {
      try {
        await this.alertManager.sendAlert(error, context);
      } catch (alertError) {
        console.log(`⚠️ Failed to send alert: ${alertError.message}`);
      }
    }
  }

  /**
   * Create retry recovery strategy
   */
  createRetryStrategy() {
    return {
      execute: async (error, context, policy) => {
        if (!this.config.enableRetry) {
          throw error;
        }
        
        const retryManager = new RetryManager(policy.retryConfig);
        
        // Create operation that throws the original error
        const operation = () => {
          throw error;
        };
        
        // This will always fail, but demonstrates the pattern
        // In real usage, you'd pass the original operation to retry
        throw error;
      }
    };
  }

  /**
   * Create circuit breaker recovery strategy
   */
  createCircuitBreakerStrategy() {
    return {
      execute: async (error, context, policy) => {
        if (!this.config.enableCircuitBreaker) {
          throw error;
        }
        
        // Circuit breaker is handled in executeWithProtection
        // This strategy is for when circuit breaker itself fails
        if (context.fallback) {
          console.log(`🔄 Executing fallback for ${context.component}`);
          return await context.fallback();
        }
        
        throw error;
      }
    };
  }

  /**
   * Create fallback-only recovery strategy
   */
  createFallbackStrategy() {
    return {
      execute: async (error, context, policy) => {
        if (context.fallback) {
          console.log(`🔄 Executing fallback for error: ${error.message}`);
          return await context.fallback();
        }
        
        throw error;
      }
    };
  }

  /**
   * Create fail-fast recovery strategy
   */
  createFailFastStrategy() {
    return {
      execute: async (error, context, policy) => {
        // Immediately re-throw without any recovery attempt
        throw error;
      }
    };
  }

  /**
   * Create graceful degradation recovery strategy
   */
  createGracefulDegradationStrategy() {
    return {
      execute: async (error, context, policy) => {
        // Return a degraded response instead of failing
        console.log(`⚠️ Graceful degradation for: ${error.message}`);
        
        return {
          success: false,
          error: error.getUserMessage(),
          degraded: true,
          fallbackData: context.fallbackData || null
        };
      }
    };
  }

  /**
   * Create escalation recovery strategy
   */
  createEscalationStrategy() {
    return {
      execute: async (error, context, policy) => {
        // Log for escalation and re-throw
        console.log(`🚨 ESCALATING ERROR: ${error.message}`);
        
        // Send immediate alert
        if (this.config.enableAlerting && this.alertManager) {
          await this.sendAlert(error, { ...context, escalated: true });
        }
        
        throw error;
      }
    };
  }

  /**
   * Get circuit breaker for service
   */
  getCircuitBreaker(service, config = {}) {
    return this.circuitBreakerManager.getCircuitBreaker(service, config);
  }

  /**
   * Execute with retry protection
   */
  async executeWithRetry(operation, context = {}) {
    const component = context.component || 'default';
    const policy = this.getErrorPolicy(component);
    const retryManager = new RetryManager(policy.retryConfig);
    
    return retryManager.executeWithRetry(operation, context);
  }

  /**
   * Execute with circuit breaker protection
   */
  async executeWithCircuitBreaker(operation, service, fallback = null, config = {}) {
    const circuitBreaker = this.circuitBreakerManager.getCircuitBreaker(service, config);
    return circuitBreaker.execute(operation, fallback);
  }

  /**
   * Get error handler metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      circuitBreakerMetrics: this.circuitBreakerManager.getAggregatedMetrics(),
      retryMetrics: this.retryManager.getMetrics(),
      recoveryRate: this.metrics.errorsHandled > 0 
        ? this.metrics.errorsRecovered / this.metrics.errorsHandled 
        : 0
    };
  }

  /**
   * Get system health status
   */
  getHealthStatus() {
    const metrics = this.getMetrics();
    const circuitBreakerHealth = metrics.circuitBreakerMetrics.systemHealth;
    const recoveryRate = metrics.recoveryRate;
    
    let status = 'HEALTHY';
    
    if (circuitBreakerHealth === 'CRITICAL' || recoveryRate < 0.5) {
      status = 'CRITICAL';
    } else if (circuitBreakerHealth === 'DEGRADED' || recoveryRate < 0.8) {
      status = 'DEGRADED';
    }
    
    return {
      status,
      recoveryRate,
      circuitBreakerHealth,
      totalErrors: metrics.errorsHandled,
      recentErrors: this.getRecentErrorSummary()
    };
  }

  /**
   * Get recent error summary
   */
  getRecentErrorSummary() {
    // This would typically look at recent time windows
    // For now, return current error counts
    return {
      byType: this.metrics.errorsByType,
      byComponent: this.metrics.errorsByComponent
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      errorsHandled: 0,
      errorsRecovered: 0,
      errorsByType: {},
      errorsByComponent: {},
      recoveryStrategiesUsed: {}
    };
    
    this.retryManager.resetMetrics();
    this.circuitBreakerManager.resetAll();
  }
}

/**
 * Global error handler instance
 */
let globalErrorHandler = null;

/**
 * Error handler utilities
 */
export class ErrorHandlerUtils {
  /**
   * Get or create global error handler
   */
  static getGlobalHandler(config = {}) {
    if (!globalErrorHandler) {
      globalErrorHandler = new ErrorHandler(config);
    }
    return globalErrorHandler;
  }

  /**
   * Handle error with global handler
   */
  static async handleError(error, context = {}) {
    const handler = this.getGlobalHandler();
    return handler.handleError(error, context);
  }

  /**
   * Execute with global error protection
   */
  static async executeWithProtection(operation, context = {}) {
    const handler = this.getGlobalHandler();
    return handler.executeWithProtection(operation, context);
  }

  /**
   * Create error handler for specific component
   */
  static forComponent(component, config = {}) {
    return new ErrorHandler({
      ...config,
      defaultPolicy: component
    });
  }
}

export default ErrorHandler;

