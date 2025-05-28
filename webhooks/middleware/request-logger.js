/**
 * Request Logging Middleware
 * Logs all incoming requests with relevant details for monitoring and debugging
 */

/**
 * Request logging middleware
 * Logs request details and response times
 */
export function requestLogger(req, res, next) {
  const startTime = Date.now();
  const requestId = generateRequestId();
  
  // Add request ID to request object for use in other middleware
  req.requestId = requestId;
  
  // Log incoming request
  logRequest(req, requestId);
  
  // Capture original res.end to log response
  const originalEnd = res.end;
  
  res.end = function(chunk, encoding) {
    // Calculate response time
    const responseTime = Date.now() - startTime;
    
    // Log response
    logResponse(req, res, responseTime, requestId);
    
    // Call original end method
    originalEnd.call(this, chunk, encoding);
  };
  
  next();
}

/**
 * Log incoming request details
 */
function logRequest(req, requestId) {
  const logData = {
    requestId,
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    path: req.path,
    query: req.query,
    ip: getClientIP(req),
    userAgent: req.headers['user-agent'],
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length'],
    webhookHeaders: extractWebhookHeaders(req),
    hasAuth: hasAuthentication(req)
  };
  
  // Different log levels based on endpoint type
  if (req.path.includes('/health') || req.path.includes('/test')) {
    console.log(`📊 ${req.method} ${req.path} [${requestId}]`);
  } else if (req.path.includes('/webhooks/')) {
    console.log(`🪝 Webhook ${req.method} ${req.path} [${requestId}]`, {
      webhookType: getWebhookType(req.path),
      event: logData.webhookHeaders.event,
      delivery: logData.webhookHeaders.delivery,
      ip: logData.ip
    });
  } else {
    console.log(`📥 ${req.method} ${req.path} [${requestId}]`, {
      ip: logData.ip,
      userAgent: logData.userAgent?.substring(0, 50)
    });
  }
  
  // Log detailed info in development
  if (process.env.NODE_ENV === 'development') {
    console.debug('Request Details:', logData);
  }
}

/**
 * Log response details
 */
function logResponse(req, res, responseTime, requestId) {
  const logData = {
    requestId,
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    responseTime: `${responseTime}ms`,
    contentLength: res.get('content-length'),
    rateLimitRemaining: res.get('x-ratelimit-remaining')
  };
  
  // Choose log level based on status code
  const statusCode = res.statusCode;
  let logLevel = 'log';
  let emoji = '✅';
  
  if (statusCode >= 400 && statusCode < 500) {
    logLevel = 'warn';
    emoji = '⚠️';
  } else if (statusCode >= 500) {
    logLevel = 'error';
    emoji = '❌';
  } else if (statusCode >= 300) {
    emoji = '🔄';
  }
  
  console[logLevel](`${emoji} ${req.method} ${req.path} ${statusCode} ${responseTime}ms [${requestId}]`);
  
  // Log slow requests
  if (responseTime > 5000) {
    console.warn(`🐌 Slow request detected: ${req.method} ${req.path} took ${responseTime}ms [${requestId}]`);
  }
  
  // Log detailed response info in development
  if (process.env.NODE_ENV === 'development') {
    console.debug('Response Details:', logData);
  }
}

/**
 * Extract webhook-specific headers
 */
function extractWebhookHeaders(req) {
  return {
    // GitHub webhook headers
    event: req.headers['x-github-event'],
    delivery: req.headers['x-github-delivery'],
    signature: req.headers['x-hub-signature-256'] ? '[PRESENT]' : '[MISSING]',
    
    // Linear webhook headers
    linearSignature: req.headers['linear-signature'] ? '[PRESENT]' : '[MISSING]',
    linearTimestamp: req.headers['linear-timestamp'],
    
    // Codegen webhook headers
    codegenEvent: req.headers['x-codegen-event'],
    codegenSignature: req.headers['x-codegen-signature'] ? '[PRESENT]' : '[MISSING]',
    codegenTimestamp: req.headers['x-codegen-timestamp']
  };
}

/**
 * Check if request has authentication
 */
function hasAuthentication(req) {
  return !!(
    req.headers.authorization ||
    req.headers['x-api-key'] ||
    req.headers['x-hub-signature-256'] ||
    req.headers['linear-signature'] ||
    req.headers['x-codegen-signature']
  );
}

/**
 * Get client IP address
 */
function getClientIP(req) {
  return req.ip ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         'unknown';
}

/**
 * Get webhook type from path
 */
function getWebhookType(path) {
  if (path.includes('/github')) return 'github';
  if (path.includes('/linear')) return 'linear';
  if (path.includes('/codegen')) return 'codegen';
  return 'unknown';
}

/**
 * Generate unique request ID
 */
function generateRequestId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Structured logging for webhook events
 */
export function logWebhookEvent(eventType, eventData, requestId) {
  console.log(`🪝 Webhook Event: ${eventType} [${requestId}]`, {
    eventType,
    timestamp: new Date().toISOString(),
    requestId,
    eventId: eventData.id || eventData.delivery,
    source: eventData.source,
    processed: eventData.processed
  });
}

/**
 * Log webhook processing results
 */
export function logWebhookResult(eventType, result, requestId, processingTime) {
  const emoji = result.success ? '✅' : '❌';
  const level = result.success ? 'log' : 'error';
  
  console[level](`${emoji} Webhook ${eventType} ${result.success ? 'processed' : 'failed'} in ${processingTime}ms [${requestId}]`, {
    eventType,
    success: result.success,
    processingTime: `${processingTime}ms`,
    eventId: result.eventId,
    error: result.error,
    requestId
  });
}

/**
 * Log external service calls
 */
export function logExternalCall(service, operation, duration, success, requestId) {
  const emoji = success ? '🔗' : '💥';
  const level = success ? 'log' : 'warn';
  
  console[level](`${emoji} External call: ${service}.${operation} ${duration}ms [${requestId}]`, {
    service,
    operation,
    duration: `${duration}ms`,
    success,
    requestId
  });
}

/**
 * Log database operations
 */
export function logDatabaseOperation(operation, table, duration, success, requestId) {
  const emoji = success ? '💾' : '💥';
  const level = success ? 'log' : 'error';
  
  console[level](`${emoji} DB ${operation} on ${table} ${duration}ms [${requestId}]`, {
    operation,
    table,
    duration: `${duration}ms`,
    success,
    requestId
  });
}

/**
 * Security event logging
 */
export function logSecurityEvent(eventType, details, requestId, severity = 'warn') {
  const emoji = severity === 'error' ? '🚨' : '⚠️';
  
  console[severity](`${emoji} Security Event: ${eventType} [${requestId}]`, {
    eventType,
    severity,
    details: sanitizeSecurityDetails(details),
    timestamp: new Date().toISOString(),
    requestId
  });
}

/**
 * Sanitize security details for logging
 */
function sanitizeSecurityDetails(details) {
  const sanitized = { ...details };
  
  // Remove sensitive information
  const sensitiveFields = ['signature', 'token', 'key', 'password'];
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });
  
  return sanitized;
}

