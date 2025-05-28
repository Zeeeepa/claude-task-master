/**
 * Webhook Middleware
 * 
 * Express middleware for webhook request processing,
 * validation, and security checks.
 */

import { SignatureVerifier } from './signature-verifier.js';
import { logger } from '../utils/logger.js';

/**
 * Create webhook middleware with configuration
 */
export function webhookMiddleware(config = {}) {
  const signatureVerifier = config.secret ? new SignatureVerifier(config.secret) : null;
  
  return (req, res, next) => {
    // Add webhook-specific properties to request
    req.webhook = {
      verified: false,
      event: req.get('X-GitHub-Event'),
      delivery: req.get('X-GitHub-Delivery'),
      signature: req.get('X-Hub-Signature-256'),
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    };

    // Validate GitHub headers
    if (!req.webhook.event) {
      return res.status(400).json({
        error: 'Missing X-GitHub-Event header',
        code: 'MISSING_EVENT_HEADER'
      });
    }

    if (!req.webhook.delivery) {
      return res.status(400).json({
        error: 'Missing X-GitHub-Delivery header',
        code: 'MISSING_DELIVERY_HEADER'
      });
    }

    // Validate User-Agent (GitHub webhooks have specific format)
    if (!isValidGitHubUserAgent(req.webhook.userAgent)) {
      logger.warn('Invalid User-Agent for webhook', {
        userAgent: req.webhook.userAgent,
        delivery: req.webhook.delivery
      });
      
      return res.status(400).json({
        error: 'Invalid User-Agent header',
        code: 'INVALID_USER_AGENT'
      });
    }

    // Verify signature if secret is configured
    if (signatureVerifier) {
      if (!req.webhook.signature) {
        return res.status(401).json({
          error: 'Missing webhook signature',
          code: 'MISSING_SIGNATURE'
        });
      }

      try {
        signatureVerifier.verifyRawBody(req.rawBody, req.webhook.signature);
        req.webhook.verified = true;
        
        logger.debug('Webhook signature verified', {
          delivery: req.webhook.delivery
        });
        
      } catch (error) {
        logger.warn('Webhook signature verification failed', {
          delivery: req.webhook.delivery,
          error: error.message
        });
        
        return res.status(401).json({
          error: 'Signature verification failed',
          code: 'INVALID_SIGNATURE'
        });
      }
    } else {
      logger.warn('Webhook signature verification disabled - no secret configured');
    }

    // Validate content type
    if (!req.is('application/json')) {
      return res.status(400).json({
        error: 'Content-Type must be application/json',
        code: 'INVALID_CONTENT_TYPE'
      });
    }

    // Validate payload size
    const contentLength = parseInt(req.get('Content-Length') || '0');
    const maxSize = config.maxPayloadSize ? parseSize(config.maxPayloadSize) : 10 * 1024 * 1024; // 10MB default
    
    if (contentLength > maxSize) {
      return res.status(413).json({
        error: 'Payload too large',
        code: 'PAYLOAD_TOO_LARGE',
        maxSize: formatSize(maxSize)
      });
    }

    // Add request ID for tracking
    req.id = req.webhook.delivery || generateRequestId();

    // Log webhook request
    logger.info('Webhook request validated', {
      id: req.id,
      event: req.webhook.event,
      delivery: req.webhook.delivery,
      verified: req.webhook.verified,
      contentLength,
      ip: req.ip
    });

    next();
  };
}

/**
 * Validate GitHub User-Agent header
 */
function isValidGitHubUserAgent(userAgent) {
  if (!userAgent) {
    return false;
  }

  // GitHub webhook User-Agent patterns
  const validPatterns = [
    /^GitHub-Hookshot\/[a-f0-9]+$/,
    /^GitHub Hookshot [a-f0-9]+$/,
    /^GitHub-Hookshot$/
  ];

  return validPatterns.some(pattern => pattern.test(userAgent));
}

/**
 * Parse size string (e.g., "10mb", "1gb") to bytes
 */
function parseSize(sizeStr) {
  if (typeof sizeStr === 'number') {
    return sizeStr;
  }

  const units = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024
  };

  const match = sizeStr.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
  if (!match) {
    throw new Error(`Invalid size format: ${sizeStr}`);
  }

  const value = parseFloat(match[1]);
  const unit = match[2] || 'b';

  return Math.floor(value * units[unit]);
}

/**
 * Format bytes to human readable string
 */
function formatSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Generate unique request ID
 */
function generateRequestId() {
  return `req-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Error handling middleware for webhooks
 */
export function webhookErrorHandler() {
  return (error, req, res, next) => {
    const requestId = req.id || 'unknown';
    
    logger.error('Webhook middleware error', {
      requestId,
      error: error.message,
      stack: error.stack,
      url: req.url,
      method: req.method
    });

    // Don't expose internal errors to clients
    if (error.code === 'ECONNABORTED') {
      return res.status(408).json({
        error: 'Request timeout',
        code: 'REQUEST_TIMEOUT',
        requestId
      });
    }

    if (error.code === 'EMSGSIZE') {
      return res.status(413).json({
        error: 'Payload too large',
        code: 'PAYLOAD_TOO_LARGE',
        requestId
      });
    }

    // Generic error response
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      requestId
    });
  };
}

/**
 * Request logging middleware
 */
export function webhookLogger() {
  return (req, res, next) => {
    const startTime = Date.now();
    
    // Log request
    logger.info('Webhook request started', {
      id: req.id,
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Override res.end to log response
    const originalEnd = res.end;
    res.end = function(...args) {
      const duration = Date.now() - startTime;
      
      logger.info('Webhook request completed', {
        id: req.id,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        contentLength: res.get('Content-Length')
      });

      originalEnd.apply(this, args);
    };

    next();
  };
}

/**
 * CORS middleware for webhook endpoints
 */
export function webhookCors(config = {}) {
  const allowedOrigins = config.allowedOrigins || [];
  const allowedMethods = config.allowedMethods || ['POST'];
  const allowedHeaders = config.allowedHeaders || [
    'Content-Type',
    'X-GitHub-Event',
    'X-GitHub-Delivery',
    'X-Hub-Signature-256'
  ];

  return (req, res, next) => {
    const origin = req.get('Origin');
    
    // Set CORS headers
    if (allowedOrigins.length === 0 || allowedOrigins.includes('*')) {
      res.set('Access-Control-Allow-Origin', '*');
    } else if (origin && allowedOrigins.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
    }

    res.set('Access-Control-Allow-Methods', allowedMethods.join(', '));
    res.set('Access-Control-Allow-Headers', allowedHeaders.join(', '));
    res.set('Access-Control-Max-Age', '86400'); // 24 hours

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    next();
  };
}

/**
 * Rate limiting middleware specifically for webhooks
 */
export function webhookRateLimit(config = {}) {
  const windowMs = config.windowMs || 15 * 60 * 1000; // 15 minutes
  const maxRequests = config.maxRequests || 1000;
  const keyGenerator = config.keyGenerator || ((req) => req.ip);
  
  const requests = new Map();

  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean old entries
    if (requests.has(key)) {
      const userRequests = requests.get(key);
      const validRequests = userRequests.filter(timestamp => timestamp > windowStart);
      requests.set(key, validRequests);
    }

    // Get current request count
    const currentRequests = requests.get(key) || [];
    
    if (currentRequests.length >= maxRequests) {
      const resetTime = new Date(currentRequests[0] + windowMs);
      
      res.set('X-RateLimit-Limit', maxRequests.toString());
      res.set('X-RateLimit-Remaining', '0');
      res.set('X-RateLimit-Reset', Math.ceil(resetTime.getTime() / 1000).toString());
      
      return res.status(429).json({
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((resetTime.getTime() - now) / 1000)
      });
    }

    // Add current request
    currentRequests.push(now);
    requests.set(key, currentRequests);

    // Set rate limit headers
    res.set('X-RateLimit-Limit', maxRequests.toString());
    res.set('X-RateLimit-Remaining', (maxRequests - currentRequests.length).toString());
    res.set('X-RateLimit-Reset', Math.ceil((windowStart + windowMs) / 1000).toString());

    next();
  };
}

export default {
  webhookMiddleware,
  webhookErrorHandler,
  webhookLogger,
  webhookCors,
  webhookRateLimit
};

