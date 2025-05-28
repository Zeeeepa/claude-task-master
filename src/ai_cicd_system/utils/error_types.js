/**
 * Error Types and Classification System
 * 
 * Provides comprehensive error classification and custom error classes
 * for the AI CI/CD system with proper categorization for retry logic.
 */

import { randomBytes } from 'crypto';

/**
 * Comprehensive error type definitions
 */
export const ErrorTypes = {
  // Retryable errors - These can be retried with backoff
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  TEMPORARY_UNAVAILABLE: 'TEMPORARY_UNAVAILABLE',
  CONNECTION_RESET: 'CONNECTION_RESET',
  
  // Non-retryable errors - These should not be retried
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND_ERROR: 'NOT_FOUND_ERROR',
  MALFORMED_REQUEST: 'MALFORMED_REQUEST',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  
  // System errors - Internal system issues
  DATABASE_ERROR: 'DATABASE_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  RESOURCE_EXHAUSTED: 'RESOURCE_EXHAUSTED',
  FILE_SYSTEM_ERROR: 'FILE_SYSTEM_ERROR',
  MEMORY_ERROR: 'MEMORY_ERROR',
  
  // Business logic errors
  TASK_PROCESSING_ERROR: 'TASK_PROCESSING_ERROR',
  WORKFLOW_ERROR: 'WORKFLOW_ERROR',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  DEPENDENCY_ERROR: 'DEPENDENCY_ERROR',
  
  // External service errors
  CODEGEN_API_ERROR: 'CODEGEN_API_ERROR',
  GITHUB_API_ERROR: 'GITHUB_API_ERROR',
  CLAUDE_API_ERROR: 'CLAUDE_API_ERROR',
  
  // Circuit breaker states
  CIRCUIT_BREAKER_OPEN: 'CIRCUIT_BREAKER_OPEN',
  SERVICE_DEGRADED: 'SERVICE_DEGRADED'
};

/**
 * Error severity levels
 */
export const ErrorSeverity = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

/**
 * Error categories for grouping and analysis
 */
export const ErrorCategories = {
  INFRASTRUCTURE: 'INFRASTRUCTURE',
  AUTHENTICATION: 'AUTHENTICATION',
  BUSINESS_LOGIC: 'BUSINESS_LOGIC',
  EXTERNAL_SERVICE: 'EXTERNAL_SERVICE',
  USER_INPUT: 'USER_INPUT',
  SYSTEM_RESOURCE: 'SYSTEM_RESOURCE'
};

/**
 * Generate a unique error ID
 */
export function generateErrorId() {
  return `err_${Date.now()}_${randomBytes(4).toString('hex')}`;
}

/**
 * Enhanced SystemError class with comprehensive metadata
 */
export class SystemError extends Error {
  constructor(message, type, retryable = false, metadata = {}) {
    super(message);
    this.name = 'SystemError';
    this.type = type;
    this.retryable = retryable;
    this.metadata = {
      ...metadata,
      timestamp: new Date().toISOString(),
      id: generateErrorId(),
      severity: this.determineSeverity(type),
      category: this.determineCategory(type)
    };
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SystemError);
    }
  }

  /**
   * Determine error severity based on type
   */
  determineSeverity(type) {
    const criticalErrors = [
      ErrorTypes.DATABASE_ERROR,
      ErrorTypes.RESOURCE_EXHAUSTED,
      ErrorTypes.MEMORY_ERROR,
      ErrorTypes.CONFIGURATION_ERROR
    ];
    
    const highErrors = [
      ErrorTypes.AUTHENTICATION_ERROR,
      ErrorTypes.AUTHORIZATION_ERROR,
      ErrorTypes.QUOTA_EXCEEDED
    ];
    
    const mediumErrors = [
      ErrorTypes.RATE_LIMIT_ERROR,
      ErrorTypes.SERVER_ERROR,
      ErrorTypes.TIMEOUT_ERROR
    ];
    
    if (criticalErrors.includes(type)) return ErrorSeverity.CRITICAL;
    if (highErrors.includes(type)) return ErrorSeverity.HIGH;
    if (mediumErrors.includes(type)) return ErrorSeverity.MEDIUM;
    return ErrorSeverity.LOW;
  }

  /**
   * Determine error category based on type
   */
  determineCategory(type) {
    const infrastructureErrors = [
      ErrorTypes.NETWORK_ERROR,
      ErrorTypes.TIMEOUT_ERROR,
      ErrorTypes.CONNECTION_RESET,
      ErrorTypes.SERVER_ERROR
    ];
    
    const authErrors = [
      ErrorTypes.AUTHENTICATION_ERROR,
      ErrorTypes.AUTHORIZATION_ERROR
    ];
    
    const businessLogicErrors = [
      ErrorTypes.TASK_PROCESSING_ERROR,
      ErrorTypes.WORKFLOW_ERROR,
      ErrorTypes.VALIDATION_FAILED,
      ErrorTypes.DEPENDENCY_ERROR
    ];
    
    const externalServiceErrors = [
      ErrorTypes.CODEGEN_API_ERROR,
      ErrorTypes.GITHUB_API_ERROR,
      ErrorTypes.CLAUDE_API_ERROR,
      ErrorTypes.RATE_LIMIT_ERROR
    ];
    
    const userInputErrors = [
      ErrorTypes.VALIDATION_ERROR,
      ErrorTypes.MALFORMED_REQUEST,
      ErrorTypes.NOT_FOUND_ERROR
    ];
    
    const systemResourceErrors = [
      ErrorTypes.DATABASE_ERROR,
      ErrorTypes.RESOURCE_EXHAUSTED,
      ErrorTypes.MEMORY_ERROR,
      ErrorTypes.FILE_SYSTEM_ERROR
    ];
    
    if (infrastructureErrors.includes(type)) return ErrorCategories.INFRASTRUCTURE;
    if (authErrors.includes(type)) return ErrorCategories.AUTHENTICATION;
    if (businessLogicErrors.includes(type)) return ErrorCategories.BUSINESS_LOGIC;
    if (externalServiceErrors.includes(type)) return ErrorCategories.EXTERNAL_SERVICE;
    if (userInputErrors.includes(type)) return ErrorCategories.USER_INPUT;
    if (systemResourceErrors.includes(type)) return ErrorCategories.SYSTEM_RESOURCE;
    
    return ErrorCategories.BUSINESS_LOGIC; // Default category
  }

  /**
   * Convert error to JSON for logging/tracking
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      retryable: this.retryable,
      metadata: this.metadata,
      stack: this.stack
    };
  }

  /**
   * Create a user-friendly error message
   */
  getUserMessage() {
    const userFriendlyMessages = {
      [ErrorTypes.NETWORK_ERROR]: 'Network connection issue. Please check your internet connection.',
      [ErrorTypes.TIMEOUT_ERROR]: 'Request timed out. Please try again.',
      [ErrorTypes.RATE_LIMIT_ERROR]: 'Too many requests. Please wait a moment and try again.',
      [ErrorTypes.AUTHENTICATION_ERROR]: 'Authentication failed. Please check your credentials.',
      [ErrorTypes.AUTHORIZATION_ERROR]: 'You do not have permission to perform this action.',
      [ErrorTypes.VALIDATION_ERROR]: 'Invalid input provided. Please check your data.',
      [ErrorTypes.NOT_FOUND_ERROR]: 'The requested resource was not found.',
      [ErrorTypes.SERVER_ERROR]: 'Server error occurred. Please try again later.',
      [ErrorTypes.DATABASE_ERROR]: 'Database error occurred. Please contact support.',
      [ErrorTypes.CONFIGURATION_ERROR]: 'System configuration error. Please contact support.'
    };
    
    return userFriendlyMessages[this.type] || this.message;
  }
}

/**
 * Specialized error classes for specific scenarios
 */
export class NetworkError extends SystemError {
  constructor(message, metadata = {}) {
    super(message, ErrorTypes.NETWORK_ERROR, true, metadata);
  }
}

export class TimeoutError extends SystemError {
  constructor(message, metadata = {}) {
    super(message, ErrorTypes.TIMEOUT_ERROR, true, metadata);
  }
}

export class RateLimitError extends SystemError {
  constructor(message, retryAfter = null, metadata = {}) {
    super(message, ErrorTypes.RATE_LIMIT_ERROR, true, {
      ...metadata,
      retryAfter
    });
  }
}

export class AuthenticationError extends SystemError {
  constructor(message, metadata = {}) {
    super(message, ErrorTypes.AUTHENTICATION_ERROR, false, metadata);
  }
}

export class ValidationError extends SystemError {
  constructor(message, validationErrors = [], metadata = {}) {
    super(message, ErrorTypes.VALIDATION_ERROR, false, {
      ...metadata,
      validationErrors
    });
  }
}

export class CircuitBreakerError extends SystemError {
  constructor(service, state, metadata = {}) {
    super(
      `Service ${service} is unavailable - circuit breaker is ${state}`,
      ErrorTypes.CIRCUIT_BREAKER_OPEN,
      false,
      {
        ...metadata,
        service,
        circuitBreakerState: state
      }
    );
  }
}

/**
 * Error classification utilities
 */
export class ErrorClassifier {
  /**
   * Classify a generic error into our error type system
   */
  static classifyError(error) {
    if (error instanceof SystemError) {
      return error;
    }

    // Network-related errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ECONNABORTED' || 
        error.code === 'ENOTFOUND' || error.code === 'ENETUNREACH') {
      return new NetworkError(error.message, { originalError: error });
    }

    // Timeout errors
    if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      return new TimeoutError(error.message, { originalError: error });
    }

    // HTTP status code based classification
    if (error.response?.status) {
      const status = error.response.status;
      
      if (status === 401) {
        return new AuthenticationError(error.message, { 
          originalError: error,
          statusCode: status 
        });
      }
      
      if (status === 403) {
        return new SystemError(error.message, ErrorTypes.AUTHORIZATION_ERROR, false, {
          originalError: error,
          statusCode: status
        });
      }
      
      if (status === 404) {
        return new SystemError(error.message, ErrorTypes.NOT_FOUND_ERROR, false, {
          originalError: error,
          statusCode: status
        });
      }
      
      if (status === 429) {
        const retryAfter = error.response.headers?.['retry-after'];
        return new RateLimitError(error.message, retryAfter, {
          originalError: error,
          statusCode: status
        });
      }
      
      if (status >= 500) {
        return new SystemError(error.message, ErrorTypes.SERVER_ERROR, true, {
          originalError: error,
          statusCode: status
        });
      }
      
      if (status >= 400) {
        return new ValidationError(error.message, [], {
          originalError: error,
          statusCode: status
        });
      }
    }

    // Default to generic system error
    return new SystemError(error.message || 'Unknown error occurred', ErrorTypes.SERVER_ERROR, true, {
      originalError: error
    });
  }

  /**
   * Check if an error is retryable
   */
  static isRetryable(error) {
    if (error instanceof SystemError) {
      return error.retryable;
    }
    
    // Classify and check
    const classified = this.classifyError(error);
    return classified.retryable;
  }

  /**
   * Get retry delay based on error type
   */
  static getRetryDelay(error, attempt = 1) {
    const classified = error instanceof SystemError ? error : this.classifyError(error);
    
    // Rate limit errors might have specific retry-after headers
    if (classified.type === ErrorTypes.RATE_LIMIT_ERROR && classified.metadata.retryAfter) {
      return parseInt(classified.metadata.retryAfter) * 1000; // Convert to milliseconds
    }
    
    // Default exponential backoff
    const baseDelay = 1000; // 1 second
    const maxDelay = 30000; // 30 seconds
    const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
    
    // Add jitter (±25%)
    const jitter = delay * 0.25 * (Math.random() - 0.5);
    return Math.floor(delay + jitter);
  }
}

export default {
  ErrorTypes,
  ErrorSeverity,
  ErrorCategories,
  SystemError,
  NetworkError,
  TimeoutError,
  RateLimitError,
  AuthenticationError,
  ValidationError,
  CircuitBreakerError,
  ErrorClassifier,
  generateErrorId
};

