/**
 * error-handling/index.js
 * 
 * Main entry point for the intelligent error handling and retry logic system.
 * Provides a unified interface for all error handling components.
 */

// Core components
export { 
  errorClassifier, 
  ErrorTypes, 
  SeverityLevels 
} from './core/error-classifier.js';

export { 
  retryManager, 
  RetryManager, 
  RetryStrategies, 
  CircuitBreakerStates 
} from '../utils/retry-manager.js';

export { 
  errorAnalytics, 
  ErrorAnalytics 
} from './analytics/error-analytics.js';

export { 
  escalationManager, 
  EscalationManager, 
  EscalationLevels, 
  NotificationChannels 
} from './escalation/escalation-manager.js';

// Main error handler
export { 
  globalErrorHandler, 
  ErrorHandler, 
  ErrorStrategies,
  handleError, 
  handleErrorWithRetry, 
  createErrorContext 
} from '../middleware/error-handler.js';

// AI service integration
export { 
  EnhancedAIService,
  createEnhancedAIService,
  enhanceAIServices,
  aiErrorClassifier,
  aiRetryStrategies,
  AIServiceErrorPatterns
} from './strategies/ai-service-integration.js';

// Testing utilities
export { 
  runErrorHandlingTests, 
  TestErrorGenerator 
} from './tests/error-handling-tests.js';

/**
 * Initialize the error handling system with configuration
 */
export function initializeErrorHandling(config = {}) {
  const {
    analytics = true,
    escalation = true,
    retry = true,
    classification = true,
    aiServiceIntegration = true,
    customStrategies = {},
    customRules = {},
    customChannels = {}
  } = config;

  // Configure global error handler
  globalErrorHandler.enableAnalytics = analytics;
  globalErrorHandler.enableEscalation = escalation;
  globalErrorHandler.enableRetry = retry;
  globalErrorHandler.enableClassification = classification;

  // Add custom strategies
  for (const [name, strategy] of Object.entries(customStrategies)) {
    globalErrorHandler.addStrategy(name, strategy);
  }

  // Add custom escalation rules
  for (const [name, rule] of Object.entries(customRules)) {
    escalationManager.addRule(name, rule);
  }

  // Add custom notification channels
  for (const [name, channel] of Object.entries(customChannels)) {
    escalationManager.addNotificationChannel(name, channel);
  }

  return {
    errorHandler: globalErrorHandler,
    retryManager,
    errorAnalytics,
    escalationManager,
    errorClassifier
  };
}

/**
 * Get comprehensive system status
 */
export function getSystemStatus() {
  return {
    timestamp: new Date().toISOString(),
    components: {
      errorHandler: {
        status: 'active',
        stats: globalErrorHandler.getStats()
      },
      retryManager: {
        status: 'active',
        stats: retryManager.getStats()
      },
      errorAnalytics: {
        status: 'active',
        dashboard: errorAnalytics.getDashboardData()
      },
      escalationManager: {
        status: 'active',
        stats: escalationManager.getStats()
      },
      errorClassifier: {
        status: 'active',
        stats: errorClassifier.getStats()
      }
    },
    systemHealth: errorAnalytics.getDashboardData().systemHealth
  };
}

/**
 * Generate comprehensive error handling report
 */
export function generateSystemReport(options = {}) {
  const timeRange = options.timeRange || '24h';
  
  return {
    generatedAt: new Date().toISOString(),
    timeRange,
    summary: getSystemStatus(),
    analytics: errorAnalytics.generateReport({ timeRange }),
    escalations: escalationManager.getHistory(100),
    retryHistory: retryManager.getHistory(100),
    recommendations: _generateSystemRecommendations()
  };
}

/**
 * Generate system recommendations based on current state
 * @private
 */
function _generateSystemRecommendations() {
  const recommendations = [];
  const stats = globalErrorHandler.getStats();
  const analytics = errorAnalytics.getDashboardData();
  
  // High error rate recommendation
  if (stats.errorRate > 1) { // More than 1 error per second
    recommendations.push({
      type: 'high_error_rate',
      priority: 'high',
      message: 'System is experiencing a high error rate',
      action: 'Investigate error patterns and implement preventive measures',
      metric: `${stats.errorRate} errors/second`
    });
  }
  
  // Low resolution rate recommendation
  if (stats.resolutionRate < 80) {
    recommendations.push({
      type: 'low_resolution_rate',
      priority: 'medium',
      message: 'Error resolution rate is below optimal threshold',
      action: 'Review and enhance error handling strategies',
      metric: `${stats.resolutionRate}% resolution rate`
    });
  }
  
  // High escalation rate recommendation
  if (stats.escalationRate > 10) {
    recommendations.push({
      type: 'high_escalation_rate',
      priority: 'medium',
      message: 'High percentage of errors are being escalated',
      action: 'Improve automated error resolution capabilities',
      metric: `${stats.escalationRate}% escalation rate`
    });
  }
  
  // System health recommendation
  if (analytics.systemHealth < 80) {
    recommendations.push({
      type: 'low_system_health',
      priority: 'high',
      message: 'Overall system health score is below acceptable threshold',
      action: 'Immediate investigation and remediation required',
      metric: `${analytics.systemHealth}/100 health score`
    });
  }
  
  return recommendations;
}

/**
 * Quick setup for common use cases
 */
export const quickSetup = {
  /**
   * Setup for development environment
   */
  development: () => initializeErrorHandling({
    analytics: true,
    escalation: false, // Disable escalation in dev
    retry: true,
    classification: true,
    aiServiceIntegration: true
  }),

  /**
   * Setup for production environment
   */
  production: () => initializeErrorHandling({
    analytics: true,
    escalation: true,
    retry: true,
    classification: true,
    aiServiceIntegration: true
  }),

  /**
   * Setup for testing environment
   */
  testing: () => initializeErrorHandling({
    analytics: false, // Disable analytics in tests
    escalation: false,
    retry: true,
    classification: true,
    aiServiceIntegration: false
  }),

  /**
   * Minimal setup with basic error handling
   */
  minimal: () => initializeErrorHandling({
    analytics: false,
    escalation: false,
    retry: true,
    classification: true,
    aiServiceIntegration: false
  })
};

/**
 * Utility functions for common error handling patterns
 */
export const utils = {
  /**
   * Wrap a function with error handling
   */
  withErrorHandling: (fn, options = {}) => {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        const context = createErrorContext()
          .operation(options.operation || fn.name || 'anonymous')
          .component(options.component || 'wrapped_function')
          .build();

        const result = await handleError(error, context);
        
        if (result.success) {
          return result.result;
        }
        
        throw error;
      }
    };
  },

  /**
   * Wrap a function with retry logic
   */
  withRetry: (fn, retryOptions = {}) => {
    return async (...args) => {
      return await handleErrorWithRetry(
        async () => await fn(...args),
        {
          operationName: fn.name || 'anonymous',
          ...retryOptions
        }
      );
    };
  },

  /**
   * Create a circuit breaker for a function
   */
  withCircuitBreaker: (fn, options = {}) => {
    const operationType = options.operationType || fn.name || 'anonymous';
    
    return async (...args) => {
      return await retryManager.executeWithRetry(
        async () => await fn(...args),
        {
          operationType,
          operationName: fn.name || 'anonymous',
          maxRetries: 0, // No retries, just circuit breaker
          ...options
        }
      );
    };
  }
};

// Default export
export default {
  initializeErrorHandling,
  getSystemStatus,
  generateSystemReport,
  quickSetup,
  utils,
  // Re-export main components
  globalErrorHandler,
  retryManager,
  errorAnalytics,
  escalationManager,
  errorClassifier
};

