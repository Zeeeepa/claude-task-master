/**
 * Recovery Strategies
 * 
 * Implements various recovery mechanisms for different types of failures
 * in the AI CI/CD system.
 */

import { ErrorTypes, SystemError } from './error_types.js';

/**
 * Base Recovery Strategy Interface
 */
export class RecoveryStrategy {
  constructor(config = {}) {
    this.config = config;
    this.name = config.name || 'UnnamedStrategy';
    this.metrics = {
      attempts: 0,
      successes: 0,
      failures: 0
    };
  }

  /**
   * Execute recovery strategy
   * @param {Error} error - The error to recover from
   * @param {Object} context - Recovery context
   * @returns {Promise<any>} - Recovery result
   */
  async execute(error, context = {}) {
    this.metrics.attempts++;
    
    try {
      const result = await this.recover(error, context);
      this.metrics.successes++;
      return result;
    } catch (recoveryError) {
      this.metrics.failures++;
      throw recoveryError;
    }
  }

  /**
   * Abstract recovery method to be implemented by subclasses
   */
  async recover(error, context) {
    throw new Error('Recovery method must be implemented by subclass');
  }

  /**
   * Get strategy metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.attempts > 0 
        ? this.metrics.successes / this.metrics.attempts 
        : 0
    };
  }
}

/**
 * Fallback Recovery Strategy
 * Executes a fallback function when the primary operation fails
 */
export class FallbackRecoveryStrategy extends RecoveryStrategy {
  constructor(fallbackFunction, config = {}) {
    super({ ...config, name: 'FallbackRecovery' });
    this.fallbackFunction = fallbackFunction;
  }

  async recover(error, context) {
    if (!this.fallbackFunction) {
      throw new SystemError(
        'No fallback function provided',
        ErrorTypes.CONFIGURATION_ERROR,
        false,
        { originalError: error.message }
      );
    }

    console.log(`🔄 Executing fallback recovery for: ${error.message}`);
    
    try {
      const result = await this.fallbackFunction(error, context);
      console.log(`✅ Fallback recovery successful`);
      return result;
    } catch (fallbackError) {
      console.log(`❌ Fallback recovery failed: ${fallbackError.message}`);
      throw new SystemError(
        `Fallback recovery failed: ${fallbackError.message}`,
        ErrorTypes.WORKFLOW_ERROR,
        false,
        { 
          originalError: error.message,
          fallbackError: fallbackError.message
        }
      );
    }
  }
}

/**
 * Cache Recovery Strategy
 * Returns cached data when the primary operation fails
 */
export class CacheRecoveryStrategy extends RecoveryStrategy {
  constructor(cacheProvider, config = {}) {
    super({ ...config, name: 'CacheRecovery' });
    this.cacheProvider = cacheProvider;
    this.maxAge = config.maxAge || 3600000; // 1 hour default
  }

  async recover(error, context) {
    if (!this.cacheProvider) {
      throw new SystemError(
        'No cache provider configured',
        ErrorTypes.CONFIGURATION_ERROR,
        false,
        { originalError: error.message }
      );
    }

    const cacheKey = context.cacheKey || context.operationId;
    if (!cacheKey) {
      throw new SystemError(
        'No cache key provided for cache recovery',
        ErrorTypes.CONFIGURATION_ERROR,
        false,
        { originalError: error.message }
      );
    }

    console.log(`🔄 Attempting cache recovery for key: ${cacheKey}`);

    try {
      const cachedData = await this.cacheProvider.get(cacheKey);
      
      if (!cachedData) {
        throw new SystemError(
          'No cached data available',
          ErrorTypes.NOT_FOUND_ERROR,
          false,
          { cacheKey, originalError: error.message }
        );
      }

      // Check cache age
      const cacheAge = Date.now() - cachedData.timestamp;
      if (cacheAge > this.maxAge) {
        throw new SystemError(
          'Cached data is too old',
          ErrorTypes.VALIDATION_ERROR,
          false,
          { cacheKey, cacheAge, maxAge: this.maxAge }
        );
      }

      console.log(`✅ Cache recovery successful for key: ${cacheKey}`);
      return {
        ...cachedData.data,
        fromCache: true,
        cacheAge
      };
    } catch (cacheError) {
      console.log(`❌ Cache recovery failed: ${cacheError.message}`);
      throw cacheError;
    }
  }
}

/**
 * Degraded Service Recovery Strategy
 * Returns a simplified/degraded response when full service is unavailable
 */
export class DegradedServiceRecoveryStrategy extends RecoveryStrategy {
  constructor(degradedResponseProvider, config = {}) {
    super({ ...config, name: 'DegradedServiceRecovery' });
    this.degradedResponseProvider = degradedResponseProvider;
  }

  async recover(error, context) {
    console.log(`🔄 Providing degraded service response for: ${error.message}`);

    try {
      const degradedResponse = await this.degradedResponseProvider(error, context);
      
      return {
        ...degradedResponse,
        degraded: true,
        originalError: error.message,
        message: 'Service is running in degraded mode'
      };
    } catch (degradedError) {
      throw new SystemError(
        `Degraded service recovery failed: ${degradedError.message}`,
        ErrorTypes.WORKFLOW_ERROR,
        false,
        { originalError: error.message }
      );
    }
  }
}

/**
 * Alternative Service Recovery Strategy
 * Switches to an alternative service when the primary service fails
 */
export class AlternativeServiceRecoveryStrategy extends RecoveryStrategy {
  constructor(alternativeServices, config = {}) {
    super({ ...config, name: 'AlternativeServiceRecovery' });
    this.alternativeServices = Array.isArray(alternativeServices) 
      ? alternativeServices 
      : [alternativeServices];
    this.currentServiceIndex = 0;
  }

  async recover(error, context) {
    console.log(`🔄 Attempting alternative service recovery`);

    for (let i = 0; i < this.alternativeServices.length; i++) {
      const serviceIndex = (this.currentServiceIndex + i) % this.alternativeServices.length;
      const alternativeService = this.alternativeServices[serviceIndex];

      try {
        console.log(`🔄 Trying alternative service ${serviceIndex + 1}/${this.alternativeServices.length}`);
        
        const result = await alternativeService(context);
        
        // Update current service index for next time
        this.currentServiceIndex = serviceIndex;
        
        console.log(`✅ Alternative service ${serviceIndex + 1} successful`);
        return {
          ...result,
          alternativeService: true,
          serviceIndex
        };
      } catch (altError) {
        console.log(`❌ Alternative service ${serviceIndex + 1} failed: ${altError.message}`);
        
        // Continue to next alternative
        if (i === this.alternativeServices.length - 1) {
          // All alternatives failed
          throw new SystemError(
            'All alternative services failed',
            ErrorTypes.SERVER_ERROR,
            false,
            { 
              originalError: error.message,
              alternativeErrors: altError.message
            }
          );
        }
      }
    }
  }
}

/**
 * Queue Recovery Strategy
 * Queues failed operations for later retry
 */
export class QueueRecoveryStrategy extends RecoveryStrategy {
  constructor(queueProvider, config = {}) {
    super({ ...config, name: 'QueueRecovery' });
    this.queueProvider = queueProvider;
    this.retryDelay = config.retryDelay || 60000; // 1 minute default
  }

  async recover(error, context) {
    if (!this.queueProvider) {
      throw new SystemError(
        'No queue provider configured',
        ErrorTypes.CONFIGURATION_ERROR,
        false,
        { originalError: error.message }
      );
    }

    console.log(`🔄 Queuing operation for later retry: ${context.operationId}`);

    try {
      const queueItem = {
        operationId: context.operationId,
        operation: context.operation,
        context,
        error: error.message,
        queuedAt: new Date().toISOString(),
        retryAt: new Date(Date.now() + this.retryDelay).toISOString()
      };

      await this.queueProvider.enqueue(queueItem);

      console.log(`✅ Operation queued for retry at: ${queueItem.retryAt}`);
      
      return {
        queued: true,
        operationId: context.operationId,
        retryAt: queueItem.retryAt,
        message: 'Operation has been queued for retry'
      };
    } catch (queueError) {
      throw new SystemError(
        `Queue recovery failed: ${queueError.message}`,
        ErrorTypes.WORKFLOW_ERROR,
        false,
        { originalError: error.message }
      );
    }
  }
}

/**
 * Notification Recovery Strategy
 * Sends notifications about failures while providing a default response
 */
export class NotificationRecoveryStrategy extends RecoveryStrategy {
  constructor(notificationProvider, defaultResponse, config = {}) {
    super({ ...config, name: 'NotificationRecovery' });
    this.notificationProvider = notificationProvider;
    this.defaultResponse = defaultResponse;
  }

  async recover(error, context) {
    console.log(`🔄 Sending failure notification and providing default response`);

    // Send notification (don't wait for it)
    this.sendNotification(error, context).catch(notifError => {
      console.log(`⚠️ Failed to send notification: ${notifError.message}`);
    });

    // Return default response
    const response = typeof this.defaultResponse === 'function'
      ? await this.defaultResponse(error, context)
      : this.defaultResponse;

    return {
      ...response,
      notificationSent: true,
      message: 'Default response provided, notification sent'
    };
  }

  async sendNotification(error, context) {
    if (!this.notificationProvider) {
      return;
    }

    const notification = {
      type: 'error',
      severity: error.metadata?.severity || 'MEDIUM',
      error: error.message,
      context: {
        operationId: context.operationId,
        component: context.component,
        timestamp: new Date().toISOString()
      }
    };

    await this.notificationProvider.send(notification);
  }
}

/**
 * Composite Recovery Strategy
 * Combines multiple recovery strategies with fallback chain
 */
export class CompositeRecoveryStrategy extends RecoveryStrategy {
  constructor(strategies, config = {}) {
    super({ ...config, name: 'CompositeRecovery' });
    this.strategies = strategies;
  }

  async recover(error, context) {
    console.log(`🔄 Attempting composite recovery with ${this.strategies.length} strategies`);

    let lastError = error;

    for (let i = 0; i < this.strategies.length; i++) {
      const strategy = this.strategies[i];
      
      try {
        console.log(`🔄 Trying recovery strategy ${i + 1}/${this.strategies.length}: ${strategy.name}`);
        
        const result = await strategy.execute(lastError, context);
        
        console.log(`✅ Recovery strategy ${i + 1} successful: ${strategy.name}`);
        return result;
      } catch (strategyError) {
        console.log(`❌ Recovery strategy ${i + 1} failed: ${strategy.name} - ${strategyError.message}`);
        lastError = strategyError;
        
        // Continue to next strategy
      }
    }

    // All strategies failed
    throw new SystemError(
      'All recovery strategies failed',
      ErrorTypes.WORKFLOW_ERROR,
      false,
      { 
        originalError: error.message,
        strategiesTried: this.strategies.length
      }
    );
  }

  getMetrics() {
    const baseMetrics = super.getMetrics();
    const strategyMetrics = this.strategies.map(strategy => ({
      name: strategy.name,
      metrics: strategy.getMetrics()
    }));

    return {
      ...baseMetrics,
      strategies: strategyMetrics
    };
  }
}

/**
 * Recovery Strategy Factory
 */
export class RecoveryStrategyFactory {
  /**
   * Create a fallback recovery strategy
   */
  static createFallback(fallbackFunction, config = {}) {
    return new FallbackRecoveryStrategy(fallbackFunction, config);
  }

  /**
   * Create a cache recovery strategy
   */
  static createCache(cacheProvider, config = {}) {
    return new CacheRecoveryStrategy(cacheProvider, config);
  }

  /**
   * Create a degraded service recovery strategy
   */
  static createDegradedService(degradedResponseProvider, config = {}) {
    return new DegradedServiceRecoveryStrategy(degradedResponseProvider, config);
  }

  /**
   * Create an alternative service recovery strategy
   */
  static createAlternativeService(alternativeServices, config = {}) {
    return new AlternativeServiceRecoveryStrategy(alternativeServices, config);
  }

  /**
   * Create a queue recovery strategy
   */
  static createQueue(queueProvider, config = {}) {
    return new QueueRecoveryStrategy(queueProvider, config);
  }

  /**
   * Create a notification recovery strategy
   */
  static createNotification(notificationProvider, defaultResponse, config = {}) {
    return new NotificationRecoveryStrategy(notificationProvider, defaultResponse, config);
  }

  /**
   * Create a composite recovery strategy
   */
  static createComposite(strategies, config = {}) {
    return new CompositeRecoveryStrategy(strategies, config);
  }

  /**
   * Create a recovery strategy chain
   */
  static createChain(...strategies) {
    return new CompositeRecoveryStrategy(strategies);
  }
}

export default {
  RecoveryStrategy,
  FallbackRecoveryStrategy,
  CacheRecoveryStrategy,
  DegradedServiceRecoveryStrategy,
  AlternativeServiceRecoveryStrategy,
  QueueRecoveryStrategy,
  NotificationRecoveryStrategy,
  CompositeRecoveryStrategy,
  RecoveryStrategyFactory
};

