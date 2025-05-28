/**
 * Authentication Middleware
 * Express middleware for authentication and authorization
 */

import { authManager } from '../auth/authentication.js';
import { credentialManager } from '../crypto/credential-manager.js';
import { auditLogger } from '../audit/audit-logger.js';
import { SecurityConfig } from '../config/security-config.js';

/**
 * Authentication middleware
 */
export function authenticate(options = {}) {
  const { required = true, roles = [] } = options;

  return async (req, res, next) => {
    try {
      const token = extractToken(req);
      
      if (!token) {
        if (!required) {
          return next();
        }
        
        auditLogger.log('authentication', 'missing_token', {
          path: req.path,
          method: req.method,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          timestamp: new Date().toISOString()
        });
        
        return res.status(401).json({
          error: 'Authentication required',
          code: 'MISSING_TOKEN'
        });
      }

      const verification = await authManager.verifyToken(token);
      
      if (!verification.valid) {
        auditLogger.log('authentication', 'invalid_token', {
          path: req.path,
          method: req.method,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          error: verification.error,
          timestamp: new Date().toISOString()
        });
        
        return res.status(401).json({
          error: 'Invalid or expired token',
          code: 'INVALID_TOKEN'
        });
      }

      // Check role requirements
      if (roles.length > 0 && !roles.includes(verification.user.role)) {
        auditLogger.log('authorization', 'insufficient_role', {
          userId: verification.user.id,
          userRole: verification.user.role,
          requiredRoles: roles,
          path: req.path,
          method: req.method,
          ip: req.ip,
          timestamp: new Date().toISOString()
        });
        
        return res.status(403).json({
          error: 'Insufficient permissions',
          code: 'INSUFFICIENT_ROLE'
        });
      }

      // Attach user and session to request
      req.user = verification.user;
      req.session = verification.session;
      
      auditLogger.log('authentication', 'request_authenticated', {
        userId: verification.user.id,
        path: req.path,
        method: req.method,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });

      next();
    } catch (error) {
      auditLogger.log('authentication', 'middleware_error', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      res.status(500).json({
        error: 'Authentication error',
        code: 'AUTH_ERROR'
      });
    }
  };
}

/**
 * Authorization middleware
 */
export function authorize(resource, action = 'read') {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'NOT_AUTHENTICATED'
        });
      }

      const hasAccess = await credentialManager.validateAccess(req.user, resource, action);
      
      if (!hasAccess) {
        auditLogger.log('authorization', 'access_denied', {
          userId: req.user.id,
          resource,
          action,
          path: req.path,
          method: req.method,
          ip: req.ip,
          timestamp: new Date().toISOString()
        });
        
        return res.status(403).json({
          error: 'Access denied',
          code: 'ACCESS_DENIED',
          resource,
          action
        });
      }

      auditLogger.log('authorization', 'access_granted', {
        userId: req.user.id,
        resource,
        action,
        path: req.path,
        method: req.method,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });

      next();
    } catch (error) {
      auditLogger.log('authorization', 'middleware_error', {
        userId: req.user?.id,
        resource,
        action,
        path: req.path,
        method: req.method,
        ip: req.ip,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      res.status(500).json({
        error: 'Authorization error',
        code: 'AUTHZ_ERROR'
      });
    }
  };
}

/**
 * Rate limiting middleware
 */
export function rateLimit(options = {}) {
  const config = { ...SecurityConfig.api.rateLimiting, ...options };
  const requests = new Map();

  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Clean old entries
    const userRequests = requests.get(key) || [];
    const validRequests = userRequests.filter(time => time > windowStart);

    if (validRequests.length >= config.maxRequests) {
      auditLogger.log('system', 'rate_limit_exceeded', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        requestCount: validRequests.length,
        windowMs: config.windowMs,
        timestamp: new Date().toISOString()
      });

      return res.status(429).json({
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(config.windowMs / 1000)
      });
    }

    // Add current request
    validRequests.push(now);
    requests.set(key, validRequests);

    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': config.maxRequests,
      'X-RateLimit-Remaining': Math.max(0, config.maxRequests - validRequests.length),
      'X-RateLimit-Reset': new Date(now + config.windowMs).toISOString()
    });

    next();
  };
}

/**
 * Input validation middleware
 */
export function validateInput(schema) {
  return (req, res, next) => {
    try {
      // Validate request body against schema
      const validation = schema.safeParse(req.body);
      
      if (!validation.success) {
        auditLogger.log('system', 'input_validation_failed', {
          path: req.path,
          method: req.method,
          ip: req.ip,
          errors: validation.error.errors,
          timestamp: new Date().toISOString()
        });
        
        return res.status(400).json({
          error: 'Invalid input',
          code: 'VALIDATION_ERROR',
          details: validation.error.errors
        });
      }

      // Check for potential security threats
      const threats = detectSecurityThreats(req.body);
      if (threats.length > 0) {
        auditLogger.log('system', 'security_threat_detected', {
          path: req.path,
          method: req.method,
          ip: req.ip,
          threats,
          timestamp: new Date().toISOString()
        });
        
        return res.status(400).json({
          error: 'Security threat detected',
          code: 'SECURITY_THREAT',
          threats
        });
      }

      req.validatedBody = validation.data;
      next();
    } catch (error) {
      auditLogger.log('system', 'validation_middleware_error', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      res.status(500).json({
        error: 'Validation error',
        code: 'VALIDATION_ERROR'
      });
    }
  };
}

/**
 * Webhook signature validation middleware
 */
export function validateWebhookSignature(secretKey) {
  return async (req, res, next) => {
    try {
      const signature = req.get(SecurityConfig.webhooks.signatureHeader);
      const timestamp = req.get(SecurityConfig.webhooks.timestampHeader);
      
      if (!signature || !timestamp) {
        auditLogger.log('system', 'webhook_missing_headers', {
          path: req.path,
          ip: req.ip,
          hasSignature: !!signature,
          hasTimestamp: !!timestamp,
          timestamp: new Date().toISOString()
        });
        
        return res.status(401).json({
          error: 'Missing webhook headers',
          code: 'MISSING_WEBHOOK_HEADERS'
        });
      }

      // Check timestamp tolerance
      const requestTime = parseInt(timestamp);
      const currentTime = Math.floor(Date.now() / 1000);
      const timeDiff = Math.abs(currentTime - requestTime);
      
      if (timeDiff > SecurityConfig.webhooks.timestampTolerance) {
        auditLogger.log('system', 'webhook_timestamp_invalid', {
          path: req.path,
          ip: req.ip,
          requestTime,
          currentTime,
          timeDiff,
          tolerance: SecurityConfig.webhooks.timestampTolerance,
          timestamp: new Date().toISOString()
        });
        
        return res.status(401).json({
          error: 'Request timestamp outside tolerance',
          code: 'INVALID_TIMESTAMP'
        });
      }

      // Verify signature
      const secret = await credentialManager.getSecret(secretKey);
      if (!secret) {
        throw new Error('Webhook secret not found');
      }

      const payload = JSON.stringify(req.body);
      const expectedSignature = createWebhookSignature(payload, secret, timestamp);
      
      if (!verifySignature(signature, expectedSignature)) {
        auditLogger.log('system', 'webhook_signature_invalid', {
          path: req.path,
          ip: req.ip,
          timestamp: new Date().toISOString()
        });
        
        return res.status(401).json({
          error: 'Invalid webhook signature',
          code: 'INVALID_SIGNATURE'
        });
      }

      auditLogger.log('system', 'webhook_verified', {
        path: req.path,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });

      next();
    } catch (error) {
      auditLogger.log('system', 'webhook_validation_error', {
        path: req.path,
        ip: req.ip,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      res.status(500).json({
        error: 'Webhook validation error',
        code: 'WEBHOOK_ERROR'
      });
    }
  };
}

/**
 * Extract token from request
 */
function extractToken(req) {
  const authHeader = req.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Also check query parameter for WebSocket connections
  return req.query.token || null;
}

/**
 * Detect security threats in input
 */
function detectSecurityThreats(data) {
  const threats = [];
  const dataStr = JSON.stringify(data).toLowerCase();

  // SQL injection patterns
  const sqlPatterns = [
    /union\s+select/i,
    /drop\s+table/i,
    /delete\s+from/i,
    /insert\s+into/i,
    /update\s+set/i,
    /exec\s*\(/i,
    /script\s*>/i
  ];

  for (const pattern of sqlPatterns) {
    if (pattern.test(dataStr)) {
      threats.push('sql_injection');
      break;
    }
  }

  // XSS patterns
  const xssPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /<iframe/i,
    /<object/i,
    /<embed/i
  ];

  for (const pattern of xssPatterns) {
    if (pattern.test(dataStr)) {
      threats.push('xss');
      break;
    }
  }

  // Command injection patterns
  const cmdPatterns = [
    /;\s*rm\s/i,
    /;\s*cat\s/i,
    /;\s*ls\s/i,
    /\|\s*nc\s/i,
    /&&\s*curl/i
  ];

  for (const pattern of cmdPatterns) {
    if (pattern.test(dataStr)) {
      threats.push('command_injection');
      break;
    }
  }

  return threats;
}

/**
 * Create webhook signature
 */
function createWebhookSignature(payload, secret, timestamp) {
  const crypto = require('crypto');
  const data = `${timestamp}.${payload}`;
  return 'sha256=' + crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Verify webhook signature
 */
function verifySignature(received, expected) {
  const crypto = require('crypto');
  return crypto.timingSafeEqual(
    Buffer.from(received),
    Buffer.from(expected)
  );
}

export default {
  authenticate,
  authorize,
  rateLimit,
  validateInput,
  validateWebhookSignature
};

