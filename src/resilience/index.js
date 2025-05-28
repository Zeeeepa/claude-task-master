/**
 * index.js
 * Main entry point for the unified resilience framework
 * Consolidates all error handling, recovery, and resilience components
 */

// Core components
export { 
  ErrorClassifier, 
  errorClassifier,
  ERROR_CATEGORIES,
  ERROR_SEVERITY,
  RECOVERY_STRATEGIES
} from './core/error-classifier.js';

export {
  RetryManager,
  retryManager,
  DEFAULT_RETRY_CONFIG
} from './core/retry-manager.js';

export {
  CircuitBreaker,
  CircuitBreakerRegistry,
  circuitBreakerRegistry,
  CIRCUIT_STATES,
  DEFAULT_CIRCUIT_CONFIG
} from './core/circuit-breaker.js';

export {
  UnifiedLogger,
  unifiedLogger,
  LOG_LEVELS,
  LOG_CONTEXTS
} from './core/unified-logger.js';

// Handlers
export { ResilienceHandler } from './handlers/resilience-handler.js';
export { ErrorResponseFormatter } from './handlers/error-response-formatter.js';

// Recovery
export { AutoRecoveryOrchestrator } from './recovery/auto-recovery-orchestrator.js';
export { HealthMonitor } from './monitoring/health-monitor.js';

/**
 * Main resilience framework class
 * Provides a unified interface to all resilience components
 */
export class ResilienceFramework {
  constructor(config = {}) {
    this.config = {
      enableRetries: true,
      enableCircuitBreaker: true,
      enableAutoRecovery: true,
      enableHealthMonitoring: true,
      ...config
    };

    // Initialize components
    this.logger = unifiedLogger;
    this.errorClassifier = errorClassifier;
    this.retryManager = retryManager;
    this.circuitBreakerRegistry = circuitBreakerRegistry;
    
    // Initialize handlers and recovery systems
    this._initializeHandlers();
    this._initializeRecovery();
    this._initializeMonitoring();
  }

  /**
   * Initialize error handlers
   */
  _initializeHandlers() {
    // Import handlers dynamically to avoid circular dependencies
    import('./handlers/resilience-handler.js').then(({ ResilienceHandler }) => {
      this.resilienceHandler = new ResilienceHandler({
        logger: this.logger,
        errorClassifier: this.errorClassifier,
        retryManager: this.retryManager,
        circuitBreakerRegistry: this.circuitBreakerRegistry
      });
    });

    import('./handlers/error-response-formatter.js').then(({ ErrorResponseFormatter }) => {
      this.errorFormatter = new ErrorResponseFormatter();
    });
  }

  /**
   * Initialize auto-recovery systems
   */
  _initializeRecovery() {
    if (this.config.enableAutoRecovery) {
      import('./recovery/auto-recovery-orchestrator.js').then(({ AutoRecoveryOrchestrator }) => {
        this.autoRecovery = new AutoRecoveryOrchestrator({
          logger: this.logger,
          circuitBreakerRegistry: this.circuitBreakerRegistry
        });
      });
    }
  }

  /**
   * Initialize health monitoring
   */
  _initializeMonitoring() {
    if (this.config.enableHealthMonitoring) {
      import('./monitoring/health-monitor.js').then(({ HealthMonitor }) => {
        this.healthMonitor = new HealthMonitor({
          logger: this.logger,
          circuitBreakerRegistry: this.circuitBreakerRegistry
        });
      });
    }
  }

  /**
   * Execute a function with full resilience protection
   * @param {Function} fn - Function to execute
   * @param {Object} options - Execution options
   * @returns {Promise} Function result
   */
  async executeWithResilience(fn, options = {}) {
    const {
      operationName = 'unknown',
      enableRetries = this.config.enableRetries,
      enableCircuitBreaker = this.config.enableCircuitBreaker,
      retryConfig = {},
      circuitConfig = {},
      context = 'system'
    } = options;

    try {
      let executeFunction = fn;

      // Wrap with circuit breaker if enabled
      if (enableCircuitBreaker) {
        const circuitBreaker = this.circuitBreakerRegistry.getBreaker(
          operationName, 
          circuitConfig
        );
        executeFunction = () => circuitBreaker.execute(fn);
      }

      // Wrap with retry logic if enabled
      if (enableRetries) {
        executeFunction = () => this.retryManager.executeWithRetry(
          executeFunction,
          { ...retryConfig, logger: this.logger.child(context) }
        );
      }

      const result = await executeFunction();
      
      // Log successful execution
      this.logger.debug(
        `Operation '${operationName}' completed successfully`,
        { operationName },
        context
      );

      return result;
    } catch (error) {
      // Classify and log the error
      const classification = this.errorClassifier.classify(error);
      
      this.logger.logError(
        error,
        `Operation '${operationName}' failed`,
        { 
          operationName, 
          classification,
          options 
        },
        context
      );

      // Format error response if formatter is available
      if (this.errorFormatter) {
        throw this.errorFormatter.formatError(error, classification);
      }

      throw error;
    }
  }

  /**
   * Get comprehensive system health status
   * @returns {Object} System health status
   */
  getSystemHealth() {
    const health = {
      timestamp: new Date().toISOString(),
      overall: 'healthy',
      components: {}
    };

    // Circuit breaker health
    const circuitStats = this.circuitBreakerRegistry.getAllStats();
    const openCircuits = circuitStats.filter(stat => stat.state === 'open');
    
    health.components.circuitBreakers = {
      status: openCircuits.length === 0 ? 'healthy' : 'degraded',
      totalCircuits: circuitStats.length,
      openCircuits: openCircuits.length,
      details: circuitStats
    };

    // Retry manager health
    const retryStats = this.retryManager.getStats();
    health.components.retryManager = {
      status: retryStats.failedRetries < retryStats.successfulRetries ? 'healthy' : 'degraded',
      ...retryStats
    };

    // Error metrics
    const errorMetrics = this.logger.getErrorMetrics();
    health.components.errorMetrics = {
      status: errorMetrics.totalErrors < 100 ? 'healthy' : 'degraded', // Arbitrary threshold
      ...errorMetrics
    };

    // Health monitor status (if available)
    if (this.healthMonitor) {
      health.components.healthMonitor = this.healthMonitor.getStatus();
    }

    // Determine overall health
    const componentStatuses = Object.values(health.components).map(c => c.status);
    if (componentStatuses.includes('critical')) {
      health.overall = 'critical';
    } else if (componentStatuses.includes('degraded')) {
      health.overall = 'degraded';
    }

    return health;
  }

  /**
   * Reset all resilience components
   */
  reset() {
    this.circuitBreakerRegistry.resetAll();
    this.logger.clearLogs();
    
    if (this.autoRecovery) {
      this.autoRecovery.reset();
    }
    
    if (this.healthMonitor) {
      this.healthMonitor.reset();
    }
  }

  /**
   * Update framework configuration
   * @param {Object} newConfig - New configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Update component configurations
    if (newConfig.retryConfig) {
      this.retryManager.updateConfig(newConfig.retryConfig);
    }
    
    if (newConfig.loggerConfig) {
      this.logger.updateConfig(newConfig.loggerConfig);
    }
  }
}

// Export singleton instance
export const resilienceFramework = new ResilienceFramework();

