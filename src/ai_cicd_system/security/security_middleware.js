/**
 * Security Middleware
 * Express middleware for comprehensive security protection
 */

import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { AuthManager } from './auth_manager.js';
import { RBACController } from './rbac_controller.js';
import { InputValidator } from './input_validator.js';
import { AuditLogger } from './audit_logger.js';

export class SecurityMiddleware {
    constructor(config = {}) {
        this.config = {
            enableRateLimit: config.enableRateLimit !== false,
            enableSlowDown: config.enableSlowDown !== false,
            enableHelmet: config.enableHelmet !== false,
            enableCors: config.enableCors !== false,
            enableCompression: config.enableCompression !== false,
            enableInputValidation: config.enableInputValidation !== false,
            enableAuditLogging: config.enableAuditLogging !== false,
            ...config
        };

        this.authManager = new AuthManager(config.auth);
        this.rbacController = new RBACController(config.rbac);
        this.inputValidator = new InputValidator(config.inputValidation);
        this.auditLogger = new AuditLogger(config.auditLogging);

        this.initializeMiddleware();
    }

    /**
     * Initialize all middleware components
     */
    initializeMiddleware() {
        this.rateLimitMiddleware = this.createRateLimitMiddleware();
        this.slowDownMiddleware = this.createSlowDownMiddleware();
        this.helmetMiddleware = this.createHelmetMiddleware();
        this.corsMiddleware = this.createCorsMiddleware();
        this.compressionMiddleware = this.createCompressionMiddleware();
    }

    /**
     * Create rate limiting middleware
     */
    createRateLimitMiddleware() {
        if (!this.config.enableRateLimit) {
            return (req, res, next) => next();
        }

        return rateLimit({
            windowMs: this.config.rateLimit?.windowMs || 15 * 60 * 1000, // 15 minutes
            max: this.config.rateLimit?.max || 100, // limit each IP to 100 requests per windowMs
            message: {
                error: 'Too many requests from this IP, please try again later.',
                retryAfter: Math.ceil((this.config.rateLimit?.windowMs || 15 * 60 * 1000) / 1000)
            },
            standardHeaders: true,
            legacyHeaders: false,
            keyGenerator: (req) => {
                // Use user ID if authenticated, otherwise IP
                return req.user?.id || req.ip;
            },
            skip: (req) => {
                // Skip rate limiting for certain endpoints
                const skipPaths = this.config.rateLimit?.skipPaths || [];
                return skipPaths.some(path => req.path.startsWith(path));
            },
            onLimitReached: async (req, res) => {
                await this.auditLogger.logSecurityEvent('RATE_LIMIT_EXCEEDED', {
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    path: req.path,
                    userId: req.user?.id
                });
            }
        });
    }

    /**
     * Create slow down middleware
     */
    createSlowDownMiddleware() {
        if (!this.config.enableSlowDown) {
            return (req, res, next) => next();
        }

        return slowDown({
            windowMs: this.config.slowDown?.windowMs || 15 * 60 * 1000, // 15 minutes
            delayAfter: this.config.slowDown?.delayAfter || 50, // allow 50 requests per windowMs without delay
            delayMs: this.config.slowDown?.delayMs || 500, // add 500ms delay per request after delayAfter
            maxDelayMs: this.config.slowDown?.maxDelayMs || 20000, // max delay of 20 seconds
            keyGenerator: (req) => {
                return req.user?.id || req.ip;
            }
        });
    }

    /**
     * Create Helmet security middleware
     */
    createHelmetMiddleware() {
        if (!this.config.enableHelmet) {
            return (req, res, next) => next();
        }

        return helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: ["'self'", "data:", "https:"],
                    connectSrc: ["'self'"],
                    fontSrc: ["'self'"],
                    objectSrc: ["'none'"],
                    mediaSrc: ["'self'"],
                    frameSrc: ["'none'"],
                    ...this.config.helmet?.contentSecurityPolicy?.directives
                }
            },
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true,
                ...this.config.helmet?.hsts
            },
            noSniff: true,
            frameguard: { action: 'deny' },
            xssFilter: true,
            referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
            ...this.config.helmet
        });
    }

    /**
     * Create CORS middleware
     */
    createCorsMiddleware() {
        if (!this.config.enableCors) {
            return (req, res, next) => next();
        }

        return cors({
            origin: this.config.cors?.origin || ['http://localhost:3000'],
            credentials: this.config.cors?.credentials !== false,
            methods: this.config.cors?.methods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: this.config.cors?.allowedHeaders || [
                'Content-Type',
                'Authorization',
                'X-Requested-With',
                'X-API-Key'
            ],
            exposedHeaders: this.config.cors?.exposedHeaders || ['X-Total-Count'],
            maxAge: this.config.cors?.maxAge || 86400, // 24 hours
            ...this.config.cors
        });
    }

    /**
     * Create compression middleware
     */
    createCompressionMiddleware() {
        if (!this.config.enableCompression) {
            return (req, res, next) => next();
        }

        return compression({
            level: this.config.compression?.level || 6,
            threshold: this.config.compression?.threshold || 1024,
            filter: (req, res) => {
                // Don't compress if the request includes a cache-control header with no-transform
                if (req.headers['cache-control'] && req.headers['cache-control'].includes('no-transform')) {
                    return false;
                }
                
                // Use compression filter function
                return compression.filter(req, res);
            },
            ...this.config.compression
        });
    }

    /**
     * Authentication middleware
     */
    authenticate() {
        return async (req, res, next) => {
            try {
                const token = this.extractToken(req);
                
                if (!token) {
                    return res.status(401).json({
                        error: 'Authentication required',
                        code: 'AUTH_REQUIRED'
                    });
                }

                // Verify token
                const decoded = await this.authManager.verifyToken(token);
                req.user = decoded;

                // Check if session is still active
                const session = this.authManager.getActiveSession(decoded.userId);
                if (!session) {
                    return res.status(401).json({
                        error: 'Session expired',
                        code: 'SESSION_EXPIRED'
                    });
                }

                // Update session activity
                session.lastActivity = new Date();

                await this.auditLogger.logSecurityEvent('AUTH_TOKEN_VERIFIED', {
                    userId: decoded.userId,
                    sessionId: session.id,
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    path: req.path
                });

                next();

            } catch (error) {
                await this.auditLogger.logSecurityEvent('AUTH_TOKEN_INVALID', {
                    error: error.message,
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    path: req.path
                });

                return res.status(401).json({
                    error: 'Invalid authentication token',
                    code: 'AUTH_INVALID'
                });
            }
        };
    }

    /**
     * Authorization middleware
     */
    authorize(permission, resource = null) {
        return async (req, res, next) => {
            try {
                if (!req.user) {
                    return res.status(401).json({
                        error: 'Authentication required',
                        code: 'AUTH_REQUIRED'
                    });
                }

                const context = {
                    userId: req.user.userId,
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    path: req.path,
                    method: req.method
                };

                const hasPermission = await this.rbacController.hasPermission(
                    req.user.userId,
                    permission,
                    resource,
                    context
                );

                if (!hasPermission) {
                    await this.auditLogger.logSecurityEvent('AUTHORIZATION_DENIED', {
                        userId: req.user.userId,
                        permission,
                        resource,
                        context
                    });

                    return res.status(403).json({
                        error: 'Insufficient permissions',
                        code: 'PERMISSION_DENIED',
                        required: permission
                    });
                }

                next();

            } catch (error) {
                await this.auditLogger.logSecurityEvent('AUTHORIZATION_ERROR', {
                    userId: req.user?.userId,
                    permission,
                    resource,
                    error: error.message
                });

                return res.status(500).json({
                    error: 'Authorization check failed',
                    code: 'AUTH_ERROR'
                });
            }
        };
    }

    /**
     * Input validation middleware
     */
    validateInput(schemaName) {
        return async (req, res, next) => {
            try {
                if (!this.config.enableInputValidation) {
                    return next();
                }

                const context = {
                    userId: req.user?.userId,
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    path: req.path,
                    method: req.method
                };

                // Validate request body
                if (req.body && Object.keys(req.body).length > 0) {
                    req.body = await this.inputValidator.validateInput(req.body, schemaName, context);
                }

                // Validate query parameters
                if (req.query && Object.keys(req.query).length > 0) {
                    req.query = await this.inputValidator.validateInput(req.query, 'api', context);
                }

                next();

            } catch (error) {
                if (error.name === 'ValidationError') {
                    return res.status(400).json({
                        error: 'Input validation failed',
                        code: 'VALIDATION_ERROR',
                        violations: error.violations
                    });
                }

                await this.auditLogger.logSecurityEvent('INPUT_VALIDATION_ERROR', {
                    userId: req.user?.userId,
                    schemaName,
                    error: error.message,
                    path: req.path
                });

                return res.status(500).json({
                    error: 'Validation error',
                    code: 'VALIDATION_ERROR'
                });
            }
        };
    }

    /**
     * File upload validation middleware
     */
    validateFileUpload() {
        return async (req, res, next) => {
            try {
                if (!req.file && !req.files) {
                    return next();
                }

                const context = {
                    userId: req.user?.userId,
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    path: req.path
                };

                const files = req.files || [req.file];
                
                for (const file of files) {
                    await this.inputValidator.validateFile(file, context);
                }

                next();

            } catch (error) {
                if (error.name === 'ValidationError') {
                    return res.status(400).json({
                        error: 'File validation failed',
                        code: 'FILE_VALIDATION_ERROR',
                        violations: error.violations
                    });
                }

                return res.status(500).json({
                    error: 'File validation error',
                    code: 'FILE_ERROR'
                });
            }
        };
    }

    /**
     * API key authentication middleware
     */
    authenticateApiKey() {
        return async (req, res, next) => {
            try {
                const apiKey = req.headers['x-api-key'] || req.query.api_key;
                
                if (!apiKey) {
                    return res.status(401).json({
                        error: 'API key required',
                        code: 'API_KEY_REQUIRED'
                    });
                }

                const keyData = await this.authManager.validateApiKey(apiKey);
                if (!keyData) {
                    await this.auditLogger.logSecurityEvent('API_KEY_INVALID', {
                        apiKey: apiKey.substring(0, 10) + '...',
                        ip: req.ip,
                        userAgent: req.get('User-Agent'),
                        path: req.path
                    });

                    return res.status(401).json({
                        error: 'Invalid API key',
                        code: 'API_KEY_INVALID'
                    });
                }

                // Set user context for API key
                req.user = {
                    userId: keyData.userId,
                    apiKeyId: keyData.id,
                    permissions: keyData.permissions,
                    type: 'api_key'
                };

                await this.auditLogger.logSecurityEvent('API_KEY_USED', {
                    apiKeyId: keyData.id,
                    userId: keyData.userId,
                    ip: req.ip,
                    path: req.path
                });

                next();

            } catch (error) {
                await this.auditLogger.logSecurityEvent('API_KEY_AUTH_ERROR', {
                    error: error.message,
                    ip: req.ip,
                    path: req.path
                });

                return res.status(500).json({
                    error: 'API key authentication error',
                    code: 'API_AUTH_ERROR'
                });
            }
        };
    }

    /**
     * Request logging middleware
     */
    logRequests() {
        return async (req, res, next) => {
            if (!this.config.enableAuditLogging) {
                return next();
            }

            const startTime = Date.now();

            // Log request
            await this.auditLogger.logSecurityEvent('HTTP_REQUEST', {
                method: req.method,
                path: req.path,
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                userId: req.user?.userId,
                contentLength: req.get('Content-Length'),
                referer: req.get('Referer')
            });

            // Override res.end to log response
            const originalEnd = res.end;
            res.end = function(...args) {
                const duration = Date.now() - startTime;
                
                // Log response (async, don't wait)
                this.auditLogger.logSecurityEvent('HTTP_RESPONSE', {
                    method: req.method,
                    path: req.path,
                    statusCode: res.statusCode,
                    duration,
                    userId: req.user?.userId,
                    contentLength: res.get('Content-Length')
                }).catch(console.error);

                originalEnd.apply(this, args);
            }.bind(this);

            next();
        };
    }

    /**
     * Error handling middleware
     */
    handleErrors() {
        return async (err, req, res, next) => {
            // Log security-related errors
            if (err.name === 'ValidationError' || err.code === 'SECURITY_ERROR') {
                await this.auditLogger.logSecurityEvent('SECURITY_ERROR', {
                    error: err.message,
                    stack: err.stack,
                    path: req.path,
                    method: req.method,
                    userId: req.user?.userId,
                    ip: req.ip
                });
            }

            // Don't expose internal errors in production
            const isDevelopment = process.env.NODE_ENV === 'development';
            
            if (err.status || err.statusCode) {
                return res.status(err.status || err.statusCode).json({
                    error: err.message,
                    code: err.code || 'ERROR',
                    ...(isDevelopment && { stack: err.stack })
                });
            }

            // Default error response
            res.status(500).json({
                error: isDevelopment ? err.message : 'Internal server error',
                code: 'INTERNAL_ERROR',
                ...(isDevelopment && { stack: err.stack })
            });
        };
    }

    /**
     * Extract authentication token from request
     */
    extractToken(req) {
        const authHeader = req.headers.authorization;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }
        
        // Check for token in query parameter (less secure, for specific use cases)
        if (req.query.token) {
            return req.query.token;
        }
        
        return null;
    }

    /**
     * Get all middleware in correct order
     */
    getAllMiddleware() {
        return [
            this.helmetMiddleware,
            this.corsMiddleware,
            this.compressionMiddleware,
            this.rateLimitMiddleware,
            this.slowDownMiddleware,
            this.logRequests()
        ];
    }

    /**
     * Get authentication middleware stack
     */
    getAuthMiddleware() {
        return [
            this.authenticate(),
            this.logRequests()
        ];
    }

    /**
     * Get API key middleware stack
     */
    getApiKeyMiddleware() {
        return [
            this.authenticateApiKey(),
            this.logRequests()
        ];
    }

    /**
     * Create route-specific middleware
     */
    createRouteMiddleware(options = {}) {
        const middleware = [];

        if (options.auth === 'jwt') {
            middleware.push(this.authenticate());
        } else if (options.auth === 'api_key') {
            middleware.push(this.authenticateApiKey());
        }

        if (options.permission) {
            middleware.push(this.authorize(options.permission, options.resource));
        }

        if (options.validateInput) {
            middleware.push(this.validateInput(options.validateInput));
        }

        if (options.validateFile) {
            middleware.push(this.validateFileUpload());
        }

        return middleware;
    }

    /**
     * Destroy security middleware
     */
    async destroy() {
        await this.auditLogger.destroy();
    }
}

export default SecurityMiddleware;

