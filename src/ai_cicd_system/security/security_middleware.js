/**
 * Unified Security Middleware
 * Consolidates security validation logic from both authentication systems
 */

import { EventEmitter } from 'events';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { AuthManager } from './auth_manager.js';
import { RBACController } from './rbac_controller.js';
import { InputValidator } from './input_validator.js';
import { AuditLogger } from './audit_logger.js';
import { log } from '../utils/simple_logger.js';

/**
 * Unified Security Middleware
 * Provides comprehensive security validation and protection
 */
export class SecurityMiddleware extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      auth: config.auth || {},
      rbac: config.rbac || {},
      rateLimit: config.rateLimit || {
        enabled: true,
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 100,
        skipSuccessfulRequests: false
      },
      cors: config.cors || {
        enabled: true,
        origin: ['http://localhost:3000'],
        credentials: true
      },
      helmet: config.helmet || {
        enabled: true,
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"]
          }
        }
      },
      validation: config.validation || {
        enabled: true,
        maxBodySize: '10mb',
        sanitizeInput: true
      },
      audit: config.audit || {
        enabled: true,
        logLevel: 'info'
      },
      ...config
    };

    // Initialize security components
    this.authManager = new AuthManager(this.config.auth);
    this.rbacController = new RBACController(this.config.rbac);
    this.inputValidator = new InputValidator(this.config.validation);
    this.auditLogger = new AuditLogger(this.config.audit);
    this.logger = new SimpleLogger('SecurityMiddleware');

    // Initialize middleware stack
    this.middlewareStack = [];
    this.setupMiddleware();
    
    this.logger.info('Unified SecurityMiddleware initialized');
  }

  /**
   * Set up the complete middleware stack
   */
  setupMiddleware() {
    // Security headers (Helmet)
    if (this.config.helmet.enabled) {
      this.middlewareStack.push(this.createHelmetMiddleware());
    }

    // Rate limiting
    if (this.config.rateLimit.enabled) {
      this.middlewareStack.push(this.createRateLimitMiddleware());
    }

    // CORS
    if (this.config.cors.enabled) {
      this.middlewareStack.push(this.createCorsMiddleware());
    }

    // Input validation and sanitization
    if (this.config.validation.enabled) {
      this.middlewareStack.push(this.createValidationMiddleware());
    }

    // Audit logging
    if (this.config.audit.enabled) {
      this.middlewareStack.push(this.createAuditMiddleware());
    }
  }

  /**
   * Create Helmet security headers middleware
   */
  createHelmetMiddleware() {
    return helmet({
      contentSecurityPolicy: this.config.helmet.contentSecurityPolicy,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      },
      noSniff: true,
      frameguard: { action: 'deny' },
      xssFilter: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
    });
  }

  /**
   * Create rate limiting middleware
   */
  createRateLimitMiddleware() {
    return rateLimit({
      windowMs: this.config.rateLimit.windowMs,
      max: this.config.rateLimit.maxRequests,
      skipSuccessfulRequests: this.config.rateLimit.skipSuccessfulRequests,
      message: {
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(this.config.rateLimit.windowMs / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        this.auditLogger.logSecurityEvent('rate_limit_exceeded', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path,
          method: req.method
        });
        
        res.status(429).json({
          error: 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil(this.config.rateLimit.windowMs / 1000)
        });
      }
    });
  }

  /**
   * Create CORS middleware
   */
  createCorsMiddleware() {
    return (req, res, next) => {
      const origin = req.headers.origin;
      
      if (this.config.cors.origin.includes(origin) || this.config.cors.origin.includes('*')) {
        res.header('Access-Control-Allow-Origin', origin);
      }
      
      if (this.config.cors.credentials) {
        res.header('Access-Control-Allow-Credentials', 'true');
      }
      
      res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,X-API-Key');
      
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      
      next();
    };
  }

  /**
   * Create input validation middleware
   */
  createValidationMiddleware() {
    return async (req, res, next) => {
      try {
        // Validate and sanitize request body
        if (req.body && Object.keys(req.body).length > 0) {
          const validationResult = await this.inputValidator.validateAndSanitize(req.body);
          
          if (!validationResult.isValid) {
            this.auditLogger.logSecurityEvent('input_validation_failed', {
              ip: req.ip,
              path: req.path,
              errors: validationResult.errors,
              userId: req.user?.id
            });
            
            return res.status(400).json({
              error: 'Invalid input',
              code: 'VALIDATION_FAILED',
              details: validationResult.errors
            });
          }
          
          req.body = validationResult.sanitizedData;
        }

        // Validate query parameters
        if (req.query && Object.keys(req.query).length > 0) {
          const queryValidation = await this.inputValidator.validateAndSanitize(req.query);
          
          if (!queryValidation.isValid) {
            return res.status(400).json({
              error: 'Invalid query parameters',
              code: 'QUERY_VALIDATION_FAILED',
              details: queryValidation.errors
            });
          }
          
          req.query = queryValidation.sanitizedData;
        }

        next();
        
      } catch (error) {
        this.logger.error('Validation middleware error', { error: error.message });
        res.status(500).json({
          error: 'Validation error',
          code: 'VALIDATION_ERROR'
        });
      }
    };
  }

  /**
   * Create audit logging middleware
   */
  createAuditMiddleware() {
    return (req, res, next) => {
      const startTime = Date.now();
      
      // Log request
      this.auditLogger.logRequest({
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user?.id,
        timestamp: new Date().toISOString()
      });

      // Override res.end to log response
      const originalEnd = res.end;
      res.end = function(chunk, encoding) {
        const duration = Date.now() - startTime;
        
        // Log response
        this.auditLogger.logResponse({
          statusCode: res.statusCode,
          duration,
          contentLength: res.get('Content-Length'),
          userId: req.user?.id,
          path: req.path,
          method: req.method
        });

        originalEnd.call(this, chunk, encoding);
      }.bind(this);

      next();
    };
  }

  /**
   * Authentication middleware with unified security framework
   */
  requireAuth(options = {}) {
    return async (req, res, next) => {
      try {
        const token = this.extractToken(req);
        const apiKey = this.extractApiKey(req);
        
        let authResult = null;
        
        // Try token authentication first
        if (token) {
          try {
            const decoded = await this.authManager.verifyToken(token);
            const session = this.authManager.getActiveSession(decoded.userId);
            
            if (session) {
              authResult = {
                user: session.user,
                session,
                authMethod: 'token'
              };
            }
          } catch (error) {
            this.logger.debug('Token authentication failed', { error: error.message });
          }
        }
        
        // Try API key authentication if token failed
        if (!authResult && apiKey) {
          try {
            const keyData = await this.authManager.validateApiKey(apiKey);
            authResult = {
              user: keyData.user,
              apiKey: keyData,
              authMethod: 'api_key'
            };
          } catch (error) {
            this.logger.debug('API key authentication failed', { error: error.message });
          }
        }
        
        if (!authResult) {
          this.auditLogger.logSecurityEvent('authentication_failed', {
            ip: req.ip,
            path: req.path,
            method: req.method,
            reason: 'no_valid_credentials'
          });
          
          return res.status(401).json({
            error: 'Authentication required',
            code: 'AUTHENTICATION_REQUIRED'
          });
        }

        // Check permissions if specified
        if (options.permissions && options.permissions.length > 0) {
          const hasPermission = await this.rbacController.checkPermissions(
            authResult.user,
            options.permissions,
            {
              resource: options.resource,
              action: options.action,
              context: { req, res }
            }
          );
          
          if (!hasPermission) {
            this.auditLogger.logSecurityEvent('authorization_failed', {
              userId: authResult.user.id,
              permissions: options.permissions,
              resource: options.resource,
              action: options.action,
              ip: req.ip,
              path: req.path
            });
            
            return res.status(403).json({
              error: 'Insufficient permissions',
              code: 'AUTHORIZATION_FAILED'
            });
          }
        }

        // Add auth info to request
        req.user = authResult.user;
        req.session = authResult.session;
        req.apiKey = authResult.apiKey;
        req.authMethod = authResult.authMethod;
        
        // Log successful authentication
        this.auditLogger.logSecurityEvent('authentication_success', {
          userId: authResult.user.id,
          authMethod: authResult.authMethod,
          ip: req.ip,
          path: req.path
        });

        next();
        
      } catch (error) {
        this.logger.error('Authentication middleware error', { error: error.message });
        
        this.auditLogger.logSecurityEvent('authentication_error', {
          error: error.message,
          ip: req.ip,
          path: req.path
        });
        
        res.status(500).json({
          error: 'Authentication error',
          code: 'AUTH_ERROR'
        });
      }
    };
  }

  /**
   * Role-based authorization middleware
   */
  requireRole(roles = []) {
    return this.requireAuth({
      permissions: roles.map(role => `role:${role}`)
    });
  }

  /**
   * Resource-based authorization middleware
   */
  requirePermission(permission, resource = null) {
    return this.requireAuth({
      permissions: [permission],
      resource,
      action: permission
    });
  }

  /**
   * Extract token from request
   */
  extractToken(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return req.query.token || req.body.token;
  }

  /**
   * Extract API key from request
   */
  extractApiKey(req) {
    return req.headers['x-api-key'] || 
           req.query.api_key || 
           req.body.api_key;
  }

  /**
   * Get all middleware as Express middleware array
   */
  getMiddleware() {
    return this.middlewareStack;
  }

  /**
   * Apply all security middleware to Express app
   */
  applyToApp(app) {
    this.middlewareStack.forEach(middleware => {
      app.use(middleware);
    });
    
    this.logger.info('Security middleware applied to Express app');
  }

  /**
   * Get security statistics
   */
  getStats() {
    return {
      auth: this.authManager.getStats(),
      rbac: this.rbacController.getStats(),
      validation: this.inputValidator.getStats(),
      audit: this.auditLogger.getStats()
    };
  }

  /**
   * Get health status
   */
  async getHealth() {
    try {
      const [authHealth, rbacHealth, validationHealth, auditHealth] = await Promise.all([
        this.authManager.getHealth(),
        this.rbacController.getHealth(),
        this.inputValidator.getHealth(),
        this.auditLogger.getHealth()
      ]);
      
      return {
        status: 'healthy',
        components: {
          auth: authHealth,
          rbac: rbacHealth,
          validation: validationHealth,
          audit: auditHealth
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  /**
   * Shutdown all security components
   */
  async shutdown() {
    try {
      await Promise.all([
        this.authManager.shutdown(),
        this.rbacController.shutdown(),
        this.inputValidator.shutdown(),
        this.auditLogger.shutdown()
      ]);
      
      this.logger.info('SecurityMiddleware shutdown completed');
    } catch (error) {
      this.logger.error('SecurityMiddleware shutdown error', { error: error.message });
    }
  }
}

export default SecurityMiddleware;
