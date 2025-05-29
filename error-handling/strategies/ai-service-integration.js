/**
 * ai-service-integration.js
 * 
 * Integration strategies for enhancing the existing AI services with
 * intelligent error handling and retry logic.
 */

import { log } from '../../scripts/modules/utils.js';
import { globalErrorHandler, createErrorContext } from '../../middleware/error-handler.js';
import { retryManager } from '../../utils/retry-manager.js';
import { errorClassifier } from '../core/error-classifier.js';

/**
 * Enhanced AI service wrapper with intelligent error handling
 */
export class EnhancedAIService {
  constructor(originalService, options = {}) {
    this.originalService = originalService;
    this.serviceName = options.serviceName || 'ai_service';
    this.enableRetry = options.retry !== false;
    this.enableClassification = options.classification !== false;
    this.enableAnalytics = options.analytics !== false;
    
    this.retryConfig = {
      maxRetries: options.maxRetries || 3,
      baseDelay: options.baseDelay || 1000,
      strategy: options.retryStrategy || 'exponential_backoff',
      operationType: 'ai_service_call'
    };
  }

  /**
   * Enhanced generateText with error handling
   */
  async generateText(params) {
    const context = createErrorContext()
      .operation('ai_generate_text')
      .component(this.serviceName)
      .metadata('role', params.role)
      .metadata('provider', this._extractProvider(params))
      .metadata('model', this._extractModel(params))
      .build();

    if (this.enableRetry) {
      return await globalErrorHandler.handleErrorWithRetry(
        async (retryContext) => {
          return await this._executeWithErrorHandling(
            () => this.originalService.generateTextService(params),
            context,
            retryContext
          );
        },
        {
          ...this.retryConfig,
          operationName: 'ai_generate_text',
          context
        }
      );
    } else {
      return await this._executeWithErrorHandling(
        () => this.originalService.generateTextService(params),
        context
      );
    }
  }

  /**
   * Enhanced streamText with error handling
   */
  async streamText(params) {
    const context = createErrorContext()
      .operation('ai_stream_text')
      .component(this.serviceName)
      .metadata('role', params.role)
      .metadata('provider', this._extractProvider(params))
      .metadata('model', this._extractModel(params))
      .build();

    // Streaming operations are more complex for retry logic
    // We'll handle errors but not retry the entire stream
    return await this._executeWithErrorHandling(
      () => this.originalService.streamTextService(params),
      context
    );
  }

  /**
   * Enhanced generateObject with error handling
   */
  async generateObject(params) {
    const context = createErrorContext()
      .operation('ai_generate_object')
      .component(this.serviceName)
      .metadata('role', params.role)
      .metadata('provider', this._extractProvider(params))
      .metadata('model', this._extractModel(params))
      .metadata('schema', params.schema?.constructor?.name)
      .build();

    if (this.enableRetry) {
      return await globalErrorHandler.handleErrorWithRetry(
        async (retryContext) => {
          return await this._executeWithErrorHandling(
            () => this.originalService.generateObjectService(params),
            context,
            retryContext
          );
        },
        {
          ...this.retryConfig,
          operationName: 'ai_generate_object',
          context
        }
      );
    } else {
      return await this._executeWithErrorHandling(
        () => this.originalService.generateObjectService(params),
        context
      );
    }
  }

  /**
   * Execute operation with error handling
   * @private
   */
  async _executeWithErrorHandling(operation, context, retryContext = null) {
    try {
      const result = await operation();
      
      // Log successful operation
      if (retryContext?.retryCount > 0) {
        log('info', `AI service operation succeeded after ${retryContext.retryCount} retries`);
      }
      
      return result;
    } catch (error) {
      // Enhance error with AI service context
      const enhancedError = this._enhanceAIError(error, context);
      
      // Handle through error pipeline
      const handlingResult = await globalErrorHandler.handleError(enhancedError, {
        ...context,
        retryAttempt: retryContext?.retryCount || 0
      });

      // If error was successfully handled, return the result
      if (handlingResult.success && handlingResult.result) {
        return handlingResult.result;
      }

      // Re-throw enhanced error
      throw enhancedError;
    }
  }

  /**
   * Enhance AI service errors with additional context
   * @private
   */
  _enhanceAIError(error, context) {
    const enhancedError = new Error(error.message);
    enhancedError.name = error.name;
    enhancedError.stack = error.stack;
    enhancedError.originalError = error;
    
    // Add AI service specific properties
    enhancedError.aiService = this.serviceName;
    enhancedError.operation = context.operation;
    enhancedError.provider = context.metadata?.provider;
    enhancedError.model = context.metadata?.model;
    
    // Copy relevant properties from original error
    if (error.status) enhancedError.status = error.status;
    if (error.code) enhancedError.code = error.code;
    if (error.data) enhancedError.data = error.data;
    
    return enhancedError;
  }

  /**
   * Extract provider from params
   * @private
   */
  _extractProvider(params) {
    // This would extract provider information from the params
    // Implementation depends on the structure of the AI service params
    return params.provider || 'unknown';
  }

  /**
   * Extract model from params
   * @private
   */
  _extractModel(params) {
    // This would extract model information from the params
    return params.model || params.modelId || 'unknown';
  }
}

/**
 * AI service error patterns and handling strategies
 */
export const AIServiceErrorPatterns = {
  RATE_LIMIT: {
    patterns: [
      /rate\s+limit/i,
      /too\s+many\s+requests/i,
      /quota\s+exceeded/i,
      /429/
    ],
    strategy: 'retry-with-backoff',
    maxRetries: 5,
    baseDelay: 2000,
    backoffMultiplier: 2.0
  },
  
  TOKEN_LIMIT: {
    patterns: [
      /token\s+limit/i,
      /context\s+length/i,
      /maximum\s+tokens/i,
      /input\s+too\s+long/i
    ],
    strategy: 'reduce-context',
    maxRetries: 2,
    baseDelay: 1000
  },
  
  MODEL_OVERLOADED: {
    patterns: [
      /model\s+overloaded/i,
      /service\s+unavailable/i,
      /temporarily\s+unavailable/i,
      /503/
    ],
    strategy: 'retry-with-backoff',
    maxRetries: 3,
    baseDelay: 5000,
    backoffMultiplier: 2.0
  },
  
  AUTHENTICATION: {
    patterns: [
      /invalid\s+api\s+key/i,
      /unauthorized/i,
      /authentication\s+failed/i,
      /401/
    ],
    strategy: 'escalate',
    maxRetries: 0
  },
  
  NETWORK_TIMEOUT: {
    patterns: [
      /timeout/i,
      /network\s+error/i,
      /connection\s+refused/i,
      /socket\s+hang\s+up/i
    ],
    strategy: 'retry-with-backoff',
    maxRetries: 3,
    baseDelay: 1000,
    backoffMultiplier: 1.5
  }
};

/**
 * AI service specific error classifier
 */
export class AIServiceErrorClassifier {
  constructor() {
    this.patterns = AIServiceErrorPatterns;
  }

  /**
   * Classify AI service specific errors
   */
  classify(error, context = {}) {
    const errorMessage = error.message?.toLowerCase() || '';
    
    for (const [errorType, config] of Object.entries(this.patterns)) {
      for (const pattern of config.patterns) {
        if (pattern.test(errorMessage)) {
          return {
            type: `AI_${errorType}`,
            severity: this._determineSeverity(errorType, context),
            strategy: config.strategy,
            maxRetries: config.maxRetries,
            baseDelay: config.baseDelay,
            backoffMultiplier: config.backoffMultiplier || 2.0,
            confidence: 0.9,
            aiSpecific: true,
            originalType: errorType
          };
        }
      }
    }

    // Fallback to general classification
    return errorClassifier.classify(error, context);
  }

  /**
   * Determine severity for AI service errors
   * @private
   */
  _determineSeverity(errorType, context) {
    const severityMap = {
      RATE_LIMIT: 'medium',
      TOKEN_LIMIT: 'medium',
      MODEL_OVERLOADED: 'high',
      AUTHENTICATION: 'critical',
      NETWORK_TIMEOUT: 'medium'
    };

    let severity = severityMap[errorType] || 'medium';

    // Adjust based on context
    if (context.production) {
      severity = severity === 'medium' ? 'high' : severity;
    }

    return severity;
  }
}

/**
 * AI service retry strategies
 */
export class AIServiceRetryStrategies {
  constructor() {
    this.strategies = new Map();
    this._initializeStrategies();
  }

  /**
   * Initialize AI service specific retry strategies
   * @private
   */
  _initializeStrategies() {
    // Context reduction strategy for token limit errors
    this.strategies.set('reduce-context', async (operation, error, context, attempt) => {
      log('info', `Attempting context reduction for token limit error (attempt ${attempt})`);
      
      // This would implement context reduction logic
      // For now, we'll simulate the process
      const reductionFactor = Math.pow(0.8, attempt); // Reduce by 20% each attempt
      
      return {
        success: true,
        modifiedParams: {
          contextReduction: reductionFactor,
          maxTokens: Math.floor((context.originalMaxTokens || 4000) * reductionFactor)
        }
      };
    });

    // Model fallback strategy
    this.strategies.set('model-fallback', async (operation, error, context, attempt) => {
      log('info', `Attempting model fallback (attempt ${attempt})`);
      
      const fallbackModels = context.fallbackModels || [];
      if (attempt <= fallbackModels.length) {
        return {
          success: true,
          modifiedParams: {
            model: fallbackModels[attempt - 1],
            fallbackUsed: true
          }
        };
      }
      
      return { success: false, reason: 'No more fallback models available' };
    });

    // Provider fallback strategy
    this.strategies.set('provider-fallback', async (operation, error, context, attempt) => {
      log('info', `Attempting provider fallback (attempt ${attempt})`);
      
      const fallbackProviders = context.fallbackProviders || [];
      if (attempt <= fallbackProviders.length) {
        return {
          success: true,
          modifiedParams: {
            provider: fallbackProviders[attempt - 1],
            providerFallbackUsed: true
          }
        };
      }
      
      return { success: false, reason: 'No more fallback providers available' };
    });
  }

  /**
   * Execute AI service specific retry strategy
   */
  async executeStrategy(strategyName, operation, error, context, attempt) {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new Error(`Unknown AI service retry strategy: ${strategyName}`);
    }

    return await strategy(operation, error, context, attempt);
  }

  /**
   * Add custom retry strategy
   */
  addStrategy(name, implementation) {
    this.strategies.set(name, implementation);
  }
}

/**
 * Factory function to create enhanced AI service
 */
export function createEnhancedAIService(originalService, options = {}) {
  return new EnhancedAIService(originalService, options);
}

/**
 * Wrapper function to enhance existing AI services module
 */
export function enhanceAIServices(aiServicesModule, options = {}) {
  const enhanced = createEnhancedAIService(aiServicesModule, {
    serviceName: 'ai-services-unified',
    ...options
  });

  return {
    // Enhanced service methods
    generateTextService: enhanced.generateText.bind(enhanced),
    streamTextService: enhanced.streamText.bind(enhanced),
    generateObjectService: enhanced.generateObject.bind(enhanced),
    
    // Original methods for backward compatibility
    ...aiServicesModule,
    
    // Error handling utilities
    errorHandler: globalErrorHandler,
    createErrorContext,
    
    // AI service specific utilities
    aiErrorClassifier: new AIServiceErrorClassifier(),
    retryStrategies: new AIServiceRetryStrategies()
  };
}

// Export instances
export const aiErrorClassifier = new AIServiceErrorClassifier();
export const aiRetryStrategies = new AIServiceRetryStrategies();

