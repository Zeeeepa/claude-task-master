/**
 * AgentAPI Express Middleware - Consolidated Implementation
 * 
 * Unified Express middleware stack for AgentAPI integration including
 * authentication, rate limiting, CORS, security headers, and request processing.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import jwt from 'jsonwebtoken';
import { SimpleLogger } from '../../utils/simple_logger.js';

export class AgentMiddleware {
  constructor(config = {}, authManager = null) {
    this.config = {
      enableAuthentication: config.enableAuthentication !== false,
      enableAuthorization: config.enableAuthorization !== false,
      enableRateLimit: config.enableRateLimit !== false,
      enableCors: config.enableCors !== false,
      enableCompression: config.enableCompression !== false,
      enableSecurity: config.enableSecurity !== false,
      ...config
    };

    this.authManager = authManager;
    this.logger = new SimpleLogger('AgentMiddleware');
    
    // Initialize middleware components
    this._initializeMiddleware();
  }

  /**
   * Get CORS middleware
   */
  cors() {
    if (!this.config.enableCors) {
      return (req, res, next) => next();
    }

    const corsOptions = {
      origin: this.config.cors?.origin || ['http://localhost:3000', 'http://localhost:3001'],
      credentials: this.config.cors?.credentials !== false,
      methods: this.config.cors?.methods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: this.config.cors?.allowedHeaders || ['Content-Type', 'Authorization'],
      exposedHeaders: this.config.cors?.exposedHeaders || ['X-Request-ID', 'X-Response-Time'],
      maxAge: this.config.cors?.maxAge || 86400 // 24 hours
    };

    return cors(corsOptions);
  }

  /**
   * Get security headers middleware
   */
  securityHeaders() {
    if (!this.config.enableSecurity) {
      return (req, res, next) => next();
    }

    return helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "ws:", "wss:"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      },
      crossOriginEmbedderPolicy: false,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    });
  }

  /**
   * Get compression middleware
   */
  compression() {
    if (!this.config.enableCompression) {
      return (req, res, next) => next();
    }

    return compression({
      level: this.config.compression?.level || 6,
      threshold: this.config.compression?.threshold || 1024,
      filter: (req, res) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      }
    });
  }

  /**
   * Get rate limiting middleware
   */
  rateLimit() {
    if (!this.config.enableRateLimit) {
      return (req, res, next) => next();
    }

    const rateLimitConfig = {
      windowMs: this.config.rateLimit?.windowMs || 60000, // 1 minute
      max: this.config.rateLimit?.max || 100,
      message: this.config.rateLimit?.message || 'Too many requests, please try again later',
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => {
        // Use API key or IP address for rate limiting
        return req.headers['authorization'] || req.ip;
      },
      skip: (req) => {
        // Skip rate limiting for health checks
        return req.path === '/health' || req.path === '/ping';
      },
      onLimitReached: (req, res) => {
        this.logger.warn('Rate limit exceeded', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path
        });
      }
    };

    return rateLimit(rateLimitConfig);
  }

  /**
   * Get slow down middleware (progressive delay)
   */
  slowDown() {
    if (!this.config.enableRateLimit) {
      return (req, res, next) => next();
    }

    return slowDown({
      windowMs: this.config.slowDown?.windowMs || 60000, // 1 minute
      delayAfter: this.config.slowDown?.delayAfter || 50,
      delayMs: this.config.slowDown?.delayMs || 500,
      maxDelayMs: this.config.slowDown?.maxDelayMs || 20000,
      keyGenerator: (req) => {
        return req.headers['authorization'] || req.ip;
      }
    });
  }

  /**
   * Get authentication middleware
   */
  authenticate() {
    return async (req, res, next) => {
      if (!this.config.enableAuthentication) {
        return next();
      }

      try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Authorization header is required'
          });
        }

        const [scheme, token] = authHeader.split(' ');
        
        if (scheme !== 'Bearer' || !token) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid authorization format. Use: Bearer <token>'
          });
        }

        // Validate token
        let user;
        if (this.authManager) {
          user = await this.authManager.validateToken(token);
        } else {
          // Fallback to JWT validation
          user = this._validateJWT(token);
        }

        if (!user) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid or expired token'
          });
        }

        // Add user to request
        req.user = user;
        req.token = token;
        
        next();
        
      } catch (error) {
        this.logger.error('Authentication error:', error);
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication failed'
        });
      }
    };
  }

  /**
   * Get authorization middleware
   */
  authorize(permissions = []) {
    return (req, res, next) => {
      if (!this.config.enableAuthorization) {
        return next();
      }

      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required'
        });
      }

      // Check permissions
      if (permissions.length > 0) {
        const userPermissions = req.user.permissions || [];
        const hasPermission = permissions.some(permission => 
          userPermissions.includes(permission) || userPermissions.includes('admin')
        );

        if (!hasPermission) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'Insufficient permissions'
          });
        }
      }

      next();
    };
  }

  /**
   * Get request logging middleware
   */
  requestLogging() {
    return (req, res, next) => {
      const startTime = Date.now();
      const requestId = this._generateRequestId();
      
      // Add request metadata
      req.metadata = {
        requestId,
        startTime,
        clientIp: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      };

      // Add request ID to response headers
      res.set('X-Request-ID', requestId);

      // Log request
      this.logger.info('Request started', {
        requestId,
        method: req.method,
        path: req.path,
        ip: req.metadata.clientIp,
        userAgent: req.metadata.userAgent
      });

      // Override res.end to log response
      const originalEnd = res.end;
      res.end = function(chunk, encoding) {
        const duration = Date.now() - startTime;
        res.set('X-Response-Time', `${duration}ms`);
        
        // Log response
        req.app.locals.logger?.info('Request completed', {
          requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
          contentLength: res.get('Content-Length')
        });

        originalEnd.call(this, chunk, encoding);
      };

      next();
    };
  }

  /**
   * Get request validation middleware
   */
  validateRequest() {
    return (req, res, next) => {
      // Validate content type for POST/PUT requests
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        const contentType = req.get('Content-Type');
        
        if (!contentType || !contentType.includes('application/json')) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Content-Type must be application/json'
          });
        }
      }

      // Validate request size
      const contentLength = parseInt(req.get('Content-Length') || '0');
      const maxSize = this.config.maxRequestSize || 10 * 1024 * 1024; // 10MB
      
      if (contentLength > maxSize) {
        return res.status(413).json({
          error: 'Payload Too Large',
          message: `Request size exceeds maximum allowed size of ${maxSize} bytes`
        });
      }

      next();
    };
  }

  /**
   * Get request transformation middleware
   */
  transformRequest() {
    return express.json({
      limit: this.config.maxRequestSize || '10mb',
      verify: (req, res, buf) => {
        // Store raw body for webhook signature verification
        req.rawBody = buf;
      }
    });
  }

  /**
   * Get response transformation middleware
   */
  transformResponse() {
    return (req, res, next) => {
      // Override res.json to add standard response format
      const originalJson = res.json;
      
      res.json = function(data) {
        const response = {
          success: res.statusCode < 400,
          timestamp: new Date().toISOString(),
          requestId: req.metadata?.requestId,
          data: res.statusCode < 400 ? data : undefined,
          error: res.statusCode >= 400 ? data : undefined
        };

        return originalJson.call(this, response);
      };

      next();
    };
  }

  /**
   * Get error handling middleware
   */
  errorHandler() {
    return (error, req, res, next) => {
      this.logger.error('Request error:', {
        requestId: req.metadata?.requestId,
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method
      });

      // Handle specific error types
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          error: 'Validation Error',
          message: error.message,
          details: error.details
        });
      }

      if (error.name === 'UnauthorizedError') {
        return res.status(401).json({
          error: 'Unauthorized',
          message: error.message
        });
      }

      if (error.name === 'ForbiddenError') {
        return res.status(403).json({
          error: 'Forbidden',
          message: error.message
        });
      }

      if (error.name === 'NotFoundError') {
        return res.status(404).json({
          error: 'Not Found',
          message: error.message
        });
      }

      if (error.name === 'ConflictError') {
        return res.status(409).json({
          error: 'Conflict',
          message: error.message
        });
      }

      if (error.name === 'RateLimitError') {
        return res.status(429).json({
          error: 'Too Many Requests',
          message: error.message
        });
      }

      // Default server error
      res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred',
        requestId: req.metadata?.requestId
      });
    };
  }

  /**
   * Get health check middleware
   */
  healthCheck() {
    return (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.env.npm_package_version || '1.0.0'
      });
    };
  }

  // Private methods

  /**
   * Initialize middleware components
   */
  _initializeMiddleware() {
    this.logger.info('Initializing middleware components', {
      authentication: this.config.enableAuthentication,
      rateLimit: this.config.enableRateLimit,
      cors: this.config.enableCors,
      compression: this.config.enableCompression,
      security: this.config.enableSecurity
    });
  }

  /**
   * Validate JWT token
   */
  _validateJWT(token) {
    try {
      const secret = process.env.JWT_SECRET || 'default-secret';
      const decoded = jwt.verify(token, secret);
      return decoded;
    } catch (error) {
      this.logger.warn('JWT validation failed:', error.message);
      return null;
    }
  }

  /**
   * Generate unique request ID
   */
  _generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}

export default AgentMiddleware;

