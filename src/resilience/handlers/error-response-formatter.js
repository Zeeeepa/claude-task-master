/**
 * error-response-formatter.js
 * Unified error response formatting across all layers
 * Consolidates error response formats from MCP server and other modules
 */

import { ERROR_CATEGORIES, ERROR_SEVERITY } from '../core/error-classifier.js';

/**
 * Standard error response format
 */
export const ERROR_RESPONSE_FORMAT = {
  success: false,
  error: {
    code: '',
    message: '',
    category: '',
    severity: '',
    timestamp: '',
    requestId: null,
    details: {},
    retryable: false,
    retryAfter: null
  }
};

/**
 * Error response formatter that provides consistent error formats
 * across all layers (CLI, MCP Server, AI Services)
 */
export class ErrorResponseFormatter {
  constructor(config = {}) {
    this.config = {
      includeStackTrace: false,
      includeInternalDetails: false,
      defaultErrorCode: 'UNKNOWN_ERROR',
      ...config
    };
  }

  /**
   * Format an error into a standardized response
   * @param {Error} error - Error to format
   * @param {Object} classification - Error classification
   * @param {Object} context - Additional context
   * @returns {Object} Formatted error response
   */
  formatError(error, classification = null, context = {}) {
    const response = {
      success: false,
      error: {
        code: this._extractErrorCode(error, classification),
        message: this._extractErrorMessage(error),
        category: classification?.category || ERROR_CATEGORIES.UNKNOWN,
        severity: classification?.severity || ERROR_SEVERITY.MEDIUM,
        timestamp: new Date().toISOString(),
        requestId: context.requestId || null,
        details: this._extractErrorDetails(error, classification, context),
        retryable: classification?.retryable || false,
        retryAfter: this._calculateRetryAfter(classification)
      }
    };

    // Add stack trace if enabled and in development
    if (this.config.includeStackTrace && error.stack) {
      response.error.stack = error.stack;
    }

    // Add internal details if enabled
    if (this.config.includeInternalDetails) {
      response.error.internal = {
        originalError: error.name,
        classification: classification,
        context: context
      };
    }

    return response;
  }

  /**
   * Format a success response
   * @param {*} data - Success data
   * @param {Object} meta - Additional metadata
   * @returns {Object} Formatted success response
   */
  formatSuccess(data, meta = {}) {
    return {
      success: true,
      data: data,
      meta: {
        timestamp: new Date().toISOString(),
        ...meta
      }
    };
  }

  /**
   * Format a validation error response
   * @param {Array} validationErrors - Array of validation errors
   * @param {Object} context - Additional context
   * @returns {Object} Formatted validation error response
   */
  formatValidationError(validationErrors, context = {}) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Input validation failed',
        category: ERROR_CATEGORIES.VALIDATION,
        severity: ERROR_SEVERITY.LOW,
        timestamp: new Date().toISOString(),
        requestId: context.requestId || null,
        details: {
          validationErrors: validationErrors,
          fieldCount: validationErrors.length
        },
        retryable: false,
        retryAfter: null
      }
    };
  }

  /**
   * Format a rate limit error response
   * @param {number} retryAfter - Seconds to wait before retry
   * @param {Object} context - Additional context
   * @returns {Object} Formatted rate limit error response
   */
  formatRateLimitError(retryAfter, context = {}) {
    return {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded. Retry after ${retryAfter} seconds.`,
        category: ERROR_CATEGORIES.RATE_LIMIT,
        severity: ERROR_SEVERITY.MEDIUM,
        timestamp: new Date().toISOString(),
        requestId: context.requestId || null,
        details: {
          retryAfter: retryAfter,
          rateLimitType: context.rateLimitType || 'general'
        },
        retryable: true,
        retryAfter: retryAfter
      }
    };
  }

  /**
   * Format a circuit breaker error response
   * @param {string} circuitName - Name of the circuit breaker
   * @param {number} nextAttemptTime - When next attempt is allowed
   * @param {Object} context - Additional context
   * @returns {Object} Formatted circuit breaker error response
   */
  formatCircuitBreakerError(circuitName, nextAttemptTime, context = {}) {
    const retryAfter = Math.ceil((nextAttemptTime - Date.now()) / 1000);
    
    return {
      success: false,
      error: {
        code: 'CIRCUIT_BREAKER_OPEN',
        message: `Service temporarily unavailable. Circuit breaker '${circuitName}' is open.`,
        category: ERROR_CATEGORIES.SYSTEM,
        severity: ERROR_SEVERITY.HIGH,
        timestamp: new Date().toISOString(),
        requestId: context.requestId || null,
        details: {
          circuitName: circuitName,
          nextAttemptTime: new Date(nextAttemptTime).toISOString(),
          circuitState: 'open'
        },
        retryable: true,
        retryAfter: retryAfter > 0 ? retryAfter : null
      }
    };
  }

  /**
   * Extract error code from error and classification
   * @param {Error} error - Error object
   * @param {Object} classification - Error classification
   * @returns {string} Error code
   */
  _extractErrorCode(error, classification) {
    // Check for explicit error code
    if (error.code) {
      return error.code;
    }

    // Check for HTTP status codes
    if (error.status || error.statusCode) {
      const status = error.status || error.statusCode;
      return `HTTP_${status}`;
    }

    // Use classification-based code
    if (classification) {
      return `${classification.category.toUpperCase()}_ERROR`;
    }

    // Default error code
    return this.config.defaultErrorCode;
  }

  /**
   * Extract error message from error
   * @param {Error} error - Error object
   * @returns {string} Error message
   */
  _extractErrorMessage(error) {
    if (error.message) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    return 'An unknown error occurred';
  }

  /**
   * Extract error details from error, classification, and context
   * @param {Error} error - Error object
   * @param {Object} classification - Error classification
   * @param {Object} context - Additional context
   * @returns {Object} Error details
   */
  _extractErrorDetails(error, classification, context) {
    const details = {};

    // Add error-specific details
    if (error.details) {
      details.errorDetails = error.details;
    }

    // Add HTTP-specific details
    if (error.status || error.statusCode) {
      details.httpStatus = error.status || error.statusCode;
    }

    // Add classification details
    if (classification) {
      details.classification = {
        category: classification.category,
        severity: classification.severity,
        strategy: classification.strategy,
        ruleId: classification.ruleId
      };
    }

    // Add resilience context if available
    if (error.resilience) {
      details.resilience = error.resilience;
    }

    // Add operation context
    if (context.operationName) {
      details.operation = context.operationName;
    }

    if (context.duration) {
      details.duration = context.duration;
    }

    return details;
  }

  /**
   * Calculate retry after time based on classification
   * @param {Object} classification - Error classification
   * @returns {number|null} Retry after seconds
   */
  _calculateRetryAfter(classification) {
    if (!classification || !classification.retryable) {
      return null;
    }

    // Different retry delays based on error category
    switch (classification.category) {
      case ERROR_CATEGORIES.RATE_LIMIT:
        return 60; // 1 minute for rate limits
      
      case ERROR_CATEGORIES.NETWORK:
        return 5; // 5 seconds for network errors
      
      case ERROR_CATEGORIES.SYSTEM:
        return 30; // 30 seconds for system errors
      
      default:
        return 10; // 10 seconds default
    }
  }

  /**
   * Convert error response to different formats
   * @param {Object} errorResponse - Formatted error response
   * @param {string} format - Target format (json, text, http)
   * @returns {*} Converted response
   */
  convertFormat(errorResponse, format = 'json') {
    switch (format.toLowerCase()) {
      case 'json':
        return errorResponse;
      
      case 'text':
        return this._convertToText(errorResponse);
      
      case 'http':
        return this._convertToHttp(errorResponse);
      
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Convert error response to text format
   * @param {Object} errorResponse - Error response
   * @returns {string} Text representation
   */
  _convertToText(errorResponse) {
    const error = errorResponse.error;
    let text = `Error: ${error.message}`;
    
    if (error.code !== 'UNKNOWN_ERROR') {
      text += ` (${error.code})`;
    }
    
    if (error.retryable && error.retryAfter) {
      text += ` - Retry after ${error.retryAfter} seconds`;
    }
    
    return text;
  }

  /**
   * Convert error response to HTTP format
   * @param {Object} errorResponse - Error response
   * @returns {Object} HTTP response format
   */
  _convertToHttp(errorResponse) {
    const error = errorResponse.error;
    
    // Map error categories to HTTP status codes
    const statusCodeMap = {
      [ERROR_CATEGORIES.VALIDATION]: 400,
      [ERROR_CATEGORIES.AUTHENTICATION]: 401,
      [ERROR_CATEGORIES.AUTHORIZATION]: 403,
      [ERROR_CATEGORIES.RESOURCE]: 404,
      [ERROR_CATEGORIES.RATE_LIMIT]: 429,
      [ERROR_CATEGORIES.SYSTEM]: 500,
      [ERROR_CATEGORIES.NETWORK]: 502,
      [ERROR_CATEGORIES.TIMEOUT]: 504
    };

    const statusCode = error.details?.httpStatus || 
                      statusCodeMap[error.category] || 
                      500;

    const headers = {
      'Content-Type': 'application/json'
    };

    if (error.retryAfter) {
      headers['Retry-After'] = error.retryAfter.toString();
    }

    return {
      statusCode,
      headers,
      body: JSON.stringify(errorResponse)
    };
  }

  /**
   * Update formatter configuration
   * @param {Object} newConfig - New configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }
}

export default ErrorResponseFormatter;

