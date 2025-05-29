/**
 * Unified Security Middleware
 * 
 * Comprehensive security middleware that integrates authentication, authorization,
 * input validation, and security headers. Consolidates middleware functionality.
 */

import { EventEmitter } from 'events';

export class SecurityMiddleware extends EventEmitter {
    constructor(config, authenticationManager, authorizationManager, inputValidator, auditLogger) {
        super();
        
        this.config = config;
        this.authenticationManager = authenticationManager;
        this.authorizationManager = authorizationManager;
        this.inputValidator = inputValidator;
        this.auditLogger = auditLogger;
        
        // Rate limiting storage
        this.rateLimitStore = new Map();
        
        // Security headers configuration
        this.securityHeaders = this._getSecurityHeaders();
        
        this.initialized = false;
    }

    /**
     * Initialize security middleware
     */
    async initialize() {
        try {
            this.initialized = true;
            this.emit('initialized');
            
            if (this.auditLogger) {
                await this.auditLogger.logSecurityEvent('SECURITY_MIDDLEWARE_INITIALIZED', {
                    features: this._getEnabledFeatures()
                });
            }
            
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Get enabled features
     */
    _getEnabledFeatures() {
        return {
            cors: this.config.cors?.enabled || false,
            helmet: this.config.helmet?.enabled || false,
            rateLimiting: this.config.rateLimiting?.enabled || false,
            authentication: !!this.authenticationManager,
            authorization: !!this.authorizationManager,
            inputValidation: !!this.inputValidator
        };
    }

    /**
     * Get security headers configuration
     */
    _getSecurityHeaders() {
        const helmetConfig = this.config.helmet || {};
        
        return {
            // Content Security Policy
            'Content-Security-Policy': this._buildCSP(helmetConfig.contentSecurityPolicy),
            
            // Security headers
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
            
            // Remove server information
            'Server': '',
            'X-Powered-By': ''
        };
    }

    /**
     * Build Content Security Policy
     */
    _buildCSP(cspConfig) {
        const defaultDirectives = {
            'default-src': ["'self'"],
            'script-src': ["'self'"],
            'style-src': ["'self'", "'unsafe-inline'"],
            'img-src': ["'self'", "data:", "https:"],
            'font-src': ["'self'"],
            'connect-src': ["'self'"],
            'frame-src': ["'none'"],
            'object-src': ["'none'"],
            'base-uri': ["'self'"],
            'form-action': ["'self'"]
        };

        const directives = { ...defaultDirectives, ...cspConfig?.directives };
        
        return Object.entries(directives)
            .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
            .join('; ');
    }

    /**
     * Main middleware function
     */
    middleware() {
        return async (req, res, next) => {
            try {
                // Apply security headers
                this._applySecurityHeaders(req, res);
                
                // Handle CORS
                if (this.config.cors?.enabled) {
                    this._handleCORS(req, res);
                }
                
                // Rate limiting
                if (this.config.rateLimiting?.enabled) {
                    const rateLimitResult = await this._checkRateLimit(req);
                    if (!rateLimitResult.allowed) {
                        return this._sendRateLimitResponse(res, rateLimitResult);
                    }
                }
                
                // Input validation
                if (this.inputValidator) {
                    const validationResult = await this._validateInput(req);
                    if (!validationResult.valid) {
                        return this._sendValidationErrorResponse(res, validationResult);
                    }
                }
                
                // Authentication
                if (this.authenticationManager) {
                    const authResult = await this._authenticate(req);
                    if (!authResult.success && this._requiresAuthentication(req)) {
                        return this._sendAuthenticationErrorResponse(res, authResult);
                    }
                    req.user = authResult.user;
                    req.authMethod = authResult.method;
                }
                
                // Authorization
                if (this.authorizationManager && req.user) {
                    const authzResult = await this._authorize(req);
                    if (!authzResult.authorized) {
                        return this._sendAuthorizationErrorResponse(res, authzResult);
                    }
                }
                
                // Log request
                if (this.auditLogger) {
                    await this._logRequest(req);
                }
                
                next();
                
            } catch (error) {
                this.emit('middlewareError', { error: error.message, path: req.path });
                
                if (this.auditLogger) {
                    await this.auditLogger.logSecurityEvent('MIDDLEWARE_ERROR', {
                        error: error.message,
                        path: req.path,
                        method: req.method,
                        ip: req.ip
                    });
                }
                
                res.status(500).json({
                    error: 'Internal security error',
                    code: 'SECURITY_ERROR'
                });
            }
        };
    }

    /**
     * Apply security headers
     */
    _applySecurityHeaders(req, res) {
        for (const [header, value] of Object.entries(this.securityHeaders)) {
            if (value) {
                res.setHeader(header, value);
            } else {
                res.removeHeader(header);
            }
        }
    }

    /**
     * Handle CORS
     */
    _handleCORS(req, res) {
        const corsConfig = this.config.cors;
        
        // Set CORS headers
        const origin = req.headers.origin;
        if (this._isAllowedOrigin(origin, corsConfig.origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin || '*');
        }
        
        if (corsConfig.credentials) {
            res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
        
        res.setHeader('Access-Control-Allow-Methods', corsConfig.methods.join(', '));
        res.setHeader('Access-Control-Allow-Headers', corsConfig.allowedHeaders.join(', '));
        
        // Handle preflight requests
        if (req.method === 'OPTIONS') {
            res.status(204).end();
            return;
        }
    }

    /**
     * Check if origin is allowed
     */
    _isAllowedOrigin(origin, allowedOrigins) {
        if (!allowedOrigins || allowedOrigins === '*') {
            return true;
        }
        
        if (Array.isArray(allowedOrigins)) {
            return allowedOrigins.includes(origin);
        }
        
        if (typeof allowedOrigins === 'string') {
            return allowedOrigins === origin;
        }
        
        if (allowedOrigins instanceof RegExp) {
            return allowedOrigins.test(origin);
        }
        
        return false;
    }

    /**
     * Check rate limit
     */
    async _checkRateLimit(req) {
        const rateLimitConfig = this.config.rateLimiting;
        const identifier = this._getRateLimitIdentifier(req);
        const now = Date.now();
        const windowMs = rateLimitConfig.windowMs;
        const maxRequests = rateLimitConfig.maxRequests;
        
        if (!this.rateLimitStore.has(identifier)) {
            this.rateLimitStore.set(identifier, {
                count: 1,
                resetTime: now + windowMs,
                firstRequest: now
            });
            return { allowed: true, remaining: maxRequests - 1 };
        }
        
        const limitData = this.rateLimitStore.get(identifier);
        
        // Reset if window has passed
        if (now > limitData.resetTime) {
            limitData.count = 1;
            limitData.resetTime = now + windowMs;
            limitData.firstRequest = now;
            return { allowed: true, remaining: maxRequests - 1 };
        }
        
        // Check if limit exceeded
        if (limitData.count >= maxRequests) {
            return {
                allowed: false,
                remaining: 0,
                resetTime: limitData.resetTime,
                retryAfter: Math.ceil((limitData.resetTime - now) / 1000)
            };
        }
        
        limitData.count++;
        return {
            allowed: true,
            remaining: maxRequests - limitData.count
        };
    }

    /**
     * Get rate limit identifier
     */
    _getRateLimitIdentifier(req) {
        // Use IP address as default identifier
        return req.ip || req.connection.remoteAddress || 'unknown';
    }

    /**
     * Validate input
     */
    async _validateInput(req) {
        try {
            // Validate request body
            if (req.body && Object.keys(req.body).length > 0) {
                const bodyValidation = await this.inputValidator.validate(req.body, {
                    context: 'request_body',
                    path: req.path,
                    method: req.method
                });
                
                if (!bodyValidation.valid) {
                    return bodyValidation;
                }
            }
            
            // Validate query parameters
            if (req.query && Object.keys(req.query).length > 0) {
                const queryValidation = await this.inputValidator.validate(req.query, {
                    context: 'query_params',
                    path: req.path,
                    method: req.method
                });
                
                if (!queryValidation.valid) {
                    return queryValidation;
                }
            }
            
            return { valid: true };
            
        } catch (error) {
            return {
                valid: false,
                errors: [{ message: 'Input validation failed', code: 'VALIDATION_ERROR' }]
            };
        }
    }

    /**
     * Authenticate request
     */
    async _authenticate(req) {
        try {
            // Extract credentials from request
            const credentials = this._extractCredentials(req);
            
            if (!credentials) {
                return { success: false, error: 'No credentials provided' };
            }
            
            // Authenticate using authentication manager
            const result = await this.authenticationManager.authenticate(credentials);
            return result;
            
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Extract credentials from request
     */
    _extractCredentials(req) {
        // Check Authorization header for Bearer token
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return { token: authHeader.substring(7) };
        }
        
        // Check for API key in header
        const apiKey = req.headers['x-api-key'];
        if (apiKey) {
            return { apiKey };
        }
        
        // Check for session ID in cookies
        const sessionId = req.cookies?.sessionId;
        if (sessionId) {
            return { sessionId };
        }
        
        return null;
    }

    /**
     * Check if route requires authentication
     */
    _requiresAuthentication(req) {
        // Define public routes that don't require authentication
        const publicRoutes = [
            '/health',
            '/status',
            '/login',
            '/register',
            '/docs'
        ];
        
        return !publicRoutes.some(route => req.path.startsWith(route));
    }

    /**
     * Authorize request
     */
    async _authorize(req) {
        try {
            // Determine required permission based on route and method
            const permission = this._getRequiredPermission(req);
            
            if (!permission) {
                return { authorized: true }; // No specific permission required
            }
            
            // Check if user has permission
            const hasPermission = await this.authorizationManager.hasPermission(
                req.user.id,
                permission,
                req.path
            );
            
            return {
                authorized: hasPermission,
                permission,
                user: req.user
            };
            
        } catch (error) {
            return { authorized: false, error: error.message };
        }
    }

    /**
     * Get required permission for route
     */
    _getRequiredPermission(req) {
        const { method, path } = req;
        
        // Define permission mappings
        const permissionMappings = {
            'GET /api/users': 'users:read',
            'POST /api/users': 'users:write',
            'PUT /api/users': 'users:write',
            'DELETE /api/users': 'users:delete',
            'GET /api/tasks': 'tasks:read',
            'POST /api/tasks': 'tasks:write',
            'PUT /api/tasks': 'tasks:write',
            'DELETE /api/tasks': 'tasks:delete',
            'GET /api/admin': 'system:admin',
            'POST /api/admin': 'system:admin'
        };
        
        const key = `${method} ${path}`;
        return permissionMappings[key];
    }

    /**
     * Log request
     */
    async _logRequest(req) {
        await this.auditLogger.logSecurityEvent('REQUEST_PROCESSED', {
            method: req.method,
            path: req.path,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            userId: req.user?.id,
            authMethod: req.authMethod
        });
    }

    /**
     * Send rate limit response
     */
    _sendRateLimitResponse(res, rateLimitResult) {
        res.setHeader('X-RateLimit-Limit', this.config.rateLimiting.maxRequests);
        res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining);
        res.setHeader('X-RateLimit-Reset', rateLimitResult.resetTime);
        res.setHeader('Retry-After', rateLimitResult.retryAfter);
        
        res.status(429).json({
            error: 'Too many requests',
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfter: rateLimitResult.retryAfter
        });
    }

    /**
     * Send validation error response
     */
    _sendValidationErrorResponse(res, validationResult) {
        res.status(400).json({
            error: 'Input validation failed',
            code: 'VALIDATION_ERROR',
            details: validationResult.errors
        });
    }

    /**
     * Send authentication error response
     */
    _sendAuthenticationErrorResponse(res, authResult) {
        res.status(401).json({
            error: 'Authentication required',
            code: 'AUTHENTICATION_REQUIRED',
            message: authResult.error
        });
    }

    /**
     * Send authorization error response
     */
    _sendAuthorizationErrorResponse(res, authzResult) {
        res.status(403).json({
            error: 'Access denied',
            code: 'ACCESS_DENIED',
            permission: authzResult.permission
        });
    }

    /**
     * Health check
     */
    async healthCheck() {
        return {
            status: 'ok',
            features: this._getEnabledFeatures(),
            rateLimitEntries: this.rateLimitStore.size
        };
    }

    /**
     * Shutdown
     */
    async shutdown() {
        this.rateLimitStore.clear();
        this.initialized = false;
    }
}

export default SecurityMiddleware;

