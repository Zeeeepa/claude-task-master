/**
 * Authentication Middleware
 * 
 * Express middleware for handling authentication and authorization
 * in the API gateway pipeline. Provides:
 * - JWT token validation
 * - Permission checking
 * - Rate limiting
 * - Request context enrichment
 */

import crypto from 'crypto';

/**
 * Authentication middleware factory
 * @param {AuthenticationService} authService - Authentication service instance
 * @param {Object} options - Middleware options
 * @returns {Function} Express middleware function
 */
export function createAuthMiddleware(authService, options = {}) {
  const {
    skipPaths = ['/gateway/health', '/auth/login'],
    requireAuth = true,
    extractUserInfo = true
  } = options;

  return async (req, res, next) => {
    try {
      // Skip authentication for certain paths
      if (skipPaths.some(path => req.path.startsWith(path))) {
        return next();
      }

      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        if (requireAuth) {
          return res.status(401).json({
            error: 'unauthorized',
            message: 'Authorization header is required',
            request_id: req.requestId
          });
        }
        return next();
      }

      // Validate token format
      const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/);
      if (!tokenMatch) {
        return res.status(401).json({
          error: 'invalid_token_format',
          message: 'Authorization header must be in format: Bearer <token>',
          request_id: req.requestId
        });
      }

      const token = tokenMatch[1];

      // Validate token
      const validation = await authService.validateToken(token);
      if (!validation.valid) {
        return res.status(401).json({
          error: 'invalid_token',
          message: validation.message || 'Invalid or expired token',
          request_id: req.requestId
        });
      }

      // Enrich request with user context
      if (extractUserInfo) {
        req.user = {
          id: validation.user_id,
          roles: validation.roles || [],
          permissions: validation.permissions || [],
          token_type: validation.token_type
        };
      }

      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      res.status(500).json({
        error: 'authentication_error',
        message: 'Internal authentication error',
        request_id: req.requestId
      });
    }
  };
}

/**
 * Permission checking middleware factory
 * @param {AuthenticationService} authService - Authentication service instance
 * @param {string|Array<string>} requiredPermissions - Required permissions
 * @returns {Function} Express middleware function
 */
export function requirePermissions(authService, requiredPermissions) {
  const permissions = Array.isArray(requiredPermissions) 
    ? requiredPermissions 
    : [requiredPermissions];

  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'unauthorized',
          message: 'Authentication required',
          request_id: req.requestId
        });
      }

      // Check each required permission
      for (const permission of permissions) {
        const [resource, action] = permission.split(':');
        const hasPermission = await authService.checkPermission(
          req.user.id,
          resource,
          action
        );

        if (!hasPermission) {
          return res.status(403).json({
            error: 'forbidden',
            message: `Missing required permission: ${permission}`,
            request_id: req.requestId
          });
        }
      }

      next();
    } catch (error) {
      console.error('Permission middleware error:', error);
      res.status(500).json({
        error: 'authorization_error',
        message: 'Internal authorization error',
        request_id: req.requestId
      });
    }
  };
}

/**
 * Role checking middleware factory
 * @param {Array<string>} requiredRoles - Required roles
 * @returns {Function} Express middleware function
 */
export function requireRoles(requiredRoles) {
  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'unauthorized',
          message: 'Authentication required',
          request_id: req.requestId
        });
      }

      const userRoles = req.user.roles || [];
      const hasRequiredRole = roles.some(role => userRoles.includes(role));

      if (!hasRequiredRole) {
        return res.status(403).json({
          error: 'forbidden',
          message: `Missing required role. Required: ${roles.join(' or ')}, User has: ${userRoles.join(', ')}`,
          request_id: req.requestId
        });
      }

      next();
    } catch (error) {
      console.error('Role middleware error:', error);
      res.status(500).json({
        error: 'authorization_error',
        message: 'Internal authorization error',
        request_id: req.requestId
      });
    }
  };
}

/**
 * Service authentication middleware for service-to-service calls
 * @param {AuthenticationService} authService - Authentication service instance
 * @returns {Function} Express middleware function
 */
export function serviceAuthMiddleware(authService) {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({
          error: 'unauthorized',
          message: 'Service authentication required',
          request_id: req.requestId
        });
      }

      const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/);
      if (!tokenMatch) {
        return res.status(401).json({
          error: 'invalid_token_format',
          message: 'Authorization header must be in format: Bearer <token>',
          request_id: req.requestId
        });
      }

      const token = tokenMatch[1];
      const validation = await authService.validateToken(token);

      if (!validation.valid || validation.token_type !== 'service') {
        return res.status(401).json({
          error: 'invalid_service_token',
          message: 'Invalid or expired service token',
          request_id: req.requestId
        });
      }

      // Enrich request with service context
      req.service = {
        id: validation.user_id, // For service tokens, user_id is service_id
        permissions: validation.permissions || [],
        token_type: validation.token_type
      };

      next();
    } catch (error) {
      console.error('Service auth middleware error:', error);
      res.status(500).json({
        error: 'service_authentication_error',
        message: 'Internal service authentication error',
        request_id: req.requestId
      });
    }
  };
}

/**
 * Request context middleware - adds request ID and timing
 * @returns {Function} Express middleware function
 */
export function requestContextMiddleware() {
  return (req, res, next) => {
    // Add request ID if not already present
    if (!req.requestId) {
      req.requestId = crypto.randomUUID();
    }

    // Add request start time
    req.startTime = Date.now();

    // Set response headers
    res.setHeader('X-Request-ID', req.requestId);
    res.setHeader('X-API-Version', '1.0.0');

    // Add response time header on finish
    const originalSend = res.send;
    res.send = function(data) {
      const responseTime = Date.now() - req.startTime;
      res.setHeader('X-Response-Time', `${responseTime}ms`);
      return originalSend.call(this, data);
    };

    next();
  };
}

/**
 * Error handling middleware
 * @returns {Function} Express error middleware function
 */
export function errorHandlerMiddleware() {
  return (error, req, res, next) => {
    console.error('API Gateway Error:', {
      error: error.message,
      stack: error.stack,
      request_id: req.requestId,
      path: req.path,
      method: req.method,
      user_id: req.user?.id
    });

    // Don't expose internal errors in production
    const isDevelopment = process.env.NODE_ENV === 'development';

    const errorResponse = {
      error: 'internal_server_error',
      message: isDevelopment ? error.message : 'Internal server error',
      request_id: req.requestId,
      timestamp: new Date().toISOString()
    };

    if (isDevelopment) {
      errorResponse.stack = error.stack;
    }

    res.status(500).json(errorResponse);
  };
}

/**
 * Request validation middleware
 * @param {Object} schema - Validation schema
 * @returns {Function} Express middleware function
 */
export function validateRequestMiddleware(schema) {
  return (req, res, next) => {
    try {
      // Basic request validation
      const errors = [];

      // Validate required headers
      if (schema.headers) {
        for (const [header, config] of Object.entries(schema.headers)) {
          if (config.required && !req.headers[header.toLowerCase()]) {
            errors.push(`Missing required header: ${header}`);
          }
        }
      }

      // Validate request body
      if (schema.body && req.method !== 'GET') {
        if (schema.body.required && !req.body) {
          errors.push('Request body is required');
        }

        if (req.body && schema.body.type === 'object') {
          if (typeof req.body !== 'object') {
            errors.push('Request body must be an object');
          }
        }
      }

      // Validate query parameters
      if (schema.query) {
        for (const [param, config] of Object.entries(schema.query)) {
          if (config.required && !req.query[param]) {
            errors.push(`Missing required query parameter: ${param}`);
          }
        }
      }

      if (errors.length > 0) {
        return res.status(400).json({
          error: 'validation_error',
          message: 'Request validation failed',
          details: errors,
          request_id: req.requestId
        });
      }

      next();
    } catch (error) {
      console.error('Validation middleware error:', error);
      res.status(500).json({
        error: 'validation_error',
        message: 'Internal validation error',
        request_id: req.requestId
      });
    }
  };
}

export default {
  createAuthMiddleware,
  requirePermissions,
  requireRoles,
  serviceAuthMiddleware,
  requestContextMiddleware,
  errorHandlerMiddleware,
  validateRequestMiddleware
};

