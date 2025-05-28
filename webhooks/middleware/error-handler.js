/**
 * Error Handling Middleware
 * Centralized error handling for webhook endpoints
 */

/**
 * Main error handling middleware
 * Catches and formats all errors in a consistent way
 */
export function errorHandler(error, req, res, next) {
  // Log the error
  console.error('❌ Webhook Error:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    headers: sanitizeHeaders(req.headers),
    body: sanitizeBody(req.body),
    timestamp: new Date().toISOString()
  });

  // Determine error type and status code
  const errorInfo = categorizeError(error);
  
  // Send error response
  res.status(errorInfo.statusCode).json({
    error: errorInfo.type,
    message: errorInfo.message,
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'] || generateRequestId(),
    ...(process.env.NODE_ENV === 'development' && { 
      stack: error.stack,
      details: errorInfo.details 
    })
  });
}

/**
 * Categorize error and determine appropriate response
 */
function categorizeError(error) {
  // Validation errors
  if (error.name === 'ValidationError' || error.code === 'VALIDATION_FAILED') {
    return {
      type: 'Validation Error',
      message: error.message || 'Request validation failed',
      statusCode: 400,
      details: error.details
    };
  }

  // Authentication errors
  if (error.name === 'AuthenticationError' || error.code === 'AUTH_FAILED') {
    return {
      type: 'Authentication Error',
      message: 'Authentication failed',
      statusCode: 401,
      details: null
    };
  }

  // Authorization errors
  if (error.name === 'AuthorizationError' || error.code === 'FORBIDDEN') {
    return {
      type: 'Authorization Error',
      message: 'Insufficient permissions',
      statusCode: 403,
      details: null
    };
  }

  // Rate limiting errors
  if (error.name === 'RateLimitError' || error.code === 'RATE_LIMIT_EXCEEDED') {
    return {
      type: 'Rate Limit Error',
      message: 'Rate limit exceeded',
      statusCode: 429,
      details: {
        retryAfter: error.retryAfter,
        limit: error.limit
      }
    };
  }

  // Database errors
  if (error.name === 'DatabaseError' || error.code?.startsWith('DB_')) {
    return {
      type: 'Database Error',
      message: 'Database operation failed',
      statusCode: 500,
      details: process.env.NODE_ENV === 'development' ? error.details : null
    };
  }

  // External service errors
  if (error.name === 'ExternalServiceError' || error.code?.startsWith('EXT_')) {
    return {
      type: 'External Service Error',
      message: 'External service unavailable',
      statusCode: 502,
      details: {
        service: error.service,
        operation: error.operation
      }
    };
  }

  // Webhook processing errors
  if (error.name === 'WebhookProcessingError' || error.code?.startsWith('WEBHOOK_')) {
    return {
      type: 'Webhook Processing Error',
      message: error.message || 'Webhook processing failed',
      statusCode: 422,
      details: {
        webhookType: error.webhookType,
        eventType: error.eventType
      }
    };
  }

  // Timeout errors
  if (error.name === 'TimeoutError' || error.code === 'TIMEOUT') {
    return {
      type: 'Timeout Error',
      message: 'Request timeout',
      statusCode: 408,
      details: {
        timeout: error.timeout
      }
    };
  }

  // JSON parsing errors
  if (error instanceof SyntaxError && error.message.includes('JSON')) {
    return {
      type: 'JSON Parse Error',
      message: 'Invalid JSON in request body',
      statusCode: 400,
      details: null
    };
  }

  // Default server error
  return {
    type: 'Internal Server Error',
    message: 'An unexpected error occurred',
    statusCode: 500,
    details: process.env.NODE_ENV === 'development' ? {
      originalMessage: error.message,
      name: error.name
    } : null
  };
}

/**
 * Sanitize headers for logging (remove sensitive information)
 */
function sanitizeHeaders(headers) {
  const sanitized = { ...headers };
  
  // Remove sensitive headers
  const sensitiveHeaders = [
    'authorization',
    'x-api-key',
    'x-hub-signature-256',
    'linear-signature',
    'x-codegen-signature',
    'cookie',
    'x-codegen-internal-key'
  ];
  
  sensitiveHeaders.forEach(header => {
    if (sanitized[header]) {
      sanitized[header] = '[REDACTED]';
    }
  });
  
  return sanitized;
}

/**
 * Sanitize request body for logging (remove sensitive information)
 */
function sanitizeBody(body) {
  if (!body || typeof body !== 'object') {
    return body;
  }
  
  const sanitized = { ...body };
  
  // Remove sensitive fields
  const sensitiveFields = [
    'password',
    'token',
    'secret',
    'key',
    'credentials',
    'authorization'
  ];
  
  function sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }
    
    const result = Array.isArray(obj) ? [] : {};
    
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      
      if (sensitiveFields.some(field => lowerKey.includes(field))) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        result[key] = sanitizeObject(value);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }
  
  return sanitizeObject(sanitized);
}

/**
 * Generate a unique request ID for error tracking
 */
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Async error wrapper for route handlers
 * Automatically catches async errors and passes them to error handler
 */
export function asyncErrorHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      'GET /health',
      'POST /webhooks/github',
      'POST /webhooks/linear',
      'POST /webhooks/codegen',
      'GET /webhooks/status'
    ]
  });
}

/**
 * Custom error classes for better error handling
 */
export class WebhookError extends Error {
  constructor(message, code, statusCode = 500, details = null) {
    super(message);
    this.name = 'WebhookError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ValidationError extends WebhookError {
  constructor(message, details = null) {
    super(message, 'VALIDATION_FAILED', 400, details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends WebhookError {
  constructor(message = 'Authentication failed') {
    super(message, 'AUTH_FAILED', 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends WebhookError {
  constructor(message = 'Insufficient permissions') {
    super(message, 'FORBIDDEN', 403);
    this.name = 'AuthorizationError';
  }
}

export class RateLimitError extends WebhookError {
  constructor(message, retryAfter, limit) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, { retryAfter, limit });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
    this.limit = limit;
  }
}

export class DatabaseError extends WebhookError {
  constructor(message, details = null) {
    super(message, 'DB_ERROR', 500, details);
    this.name = 'DatabaseError';
  }
}

export class ExternalServiceError extends WebhookError {
  constructor(message, service, operation) {
    super(message, 'EXT_SERVICE_ERROR', 502, { service, operation });
    this.name = 'ExternalServiceError';
    this.service = service;
    this.operation = operation;
  }
}

export class WebhookProcessingError extends WebhookError {
  constructor(message, webhookType, eventType) {
    super(message, 'WEBHOOK_PROCESSING_ERROR', 422, { webhookType, eventType });
    this.name = 'WebhookProcessingError';
    this.webhookType = webhookType;
    this.eventType = eventType;
  }
}

