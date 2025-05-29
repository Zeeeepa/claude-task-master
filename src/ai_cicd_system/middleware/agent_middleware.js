/**
 * Agent Middleware
 * 
 * Express middleware for agent request processing, authentication,
 * rate limiting, and request transformation.
 */

import { SimpleLogger } from '../utils/simple_logger.js';
import { AGENTAPI_CONFIG } from '../config/agentapi_config.js';

export class AgentMiddleware {
    constructor(config = {}) {
        this.config = {
            ...AGENTAPI_CONFIG.security,
            ...config
        };
        
        this.logger = new SimpleLogger('AgentMiddleware');
        this.rateLimitStore = new Map();
        this.requestMetrics = new Map();
        
        // Initialize rate limiting stores
        this._initializeRateLimiting();
    }

    /**
     * Initialize rate limiting stores
     */
    _initializeRateLimiting() {
        // Clean up rate limit store periodically
        setInterval(() => {
            this._cleanupRateLimitStore();
        }, 60000); // Every minute
    }

    /**
     * Authentication middleware
     */
    authenticate() {
        return async (req, res, next) => {
            try {
                const authHeader = req.headers.authorization;
                const apiKey = req.headers['x-api-key'] || req.query.api_key;
                
                // Skip authentication for health checks
                if (req.path === '/health' || req.path === '/status') {
                    return next();
                }

                // Check for API key
                if (this.config.enable_api_key_validation) {
                    if (!apiKey && !authHeader) {
                        return res.status(401).json({
                            error: 'Unauthorized',
                            message: 'API key or authorization header required'
                        });
                    }

                    // Validate API key
                    if (apiKey && !this._validateApiKey(apiKey)) {
                        return res.status(401).json({
                            error: 'Unauthorized',
                            message: 'Invalid API key'
                        });
                    }

                    // Validate bearer token
                    if (authHeader && !this._validateBearerToken(authHeader)) {
                        return res.status(401).json({
                            error: 'Unauthorized',
                            message: 'Invalid authorization token'
                        });
                    }
                }

                // Add authentication info to request
                req.auth = {
                    apiKey: apiKey,
                    token: authHeader,
                    authenticated: true,
                    timestamp: Date.now()
                };

                next();

            } catch (error) {
                this.logger.error('Authentication error:', error);
                res.status(500).json({
                    error: 'Internal Server Error',
                    message: 'Authentication processing failed'
                });
            }
        };
    }

    /**
     * Rate limiting middleware
     */
    rateLimit() {
        return (req, res, next) => {
            if (!this.config.enable_rate_limiting) {
                return next();
            }

            try {
                const clientId = this._getClientId(req);
                const now = Date.now();
                const windowMs = 60000; // 1 minute window
                
                // Get or create rate limit entry
                let rateLimitEntry = this.rateLimitStore.get(clientId);
                if (!rateLimitEntry) {
                    rateLimitEntry = {
                        requests: [],
                        lastReset: now
                    };
                    this.rateLimitStore.set(clientId, rateLimitEntry);
                }

                // Clean old requests outside the window
                rateLimitEntry.requests = rateLimitEntry.requests.filter(
                    timestamp => now - timestamp < windowMs
                );

                // Check rate limit
                const requestCount = rateLimitEntry.requests.length;
                const limit = this.config.rate_limits.requests_per_minute;

                if (requestCount >= limit) {
                    const resetTime = Math.ceil((rateLimitEntry.requests[0] + windowMs - now) / 1000);
                    
                    res.set({
                        'X-RateLimit-Limit': limit,
                        'X-RateLimit-Remaining': 0,
                        'X-RateLimit-Reset': resetTime,
                        'Retry-After': resetTime
                    });

                    return res.status(429).json({
                        error: 'Too Many Requests',
                        message: `Rate limit exceeded. Try again in ${resetTime} seconds.`,
                        limit: limit,
                        remaining: 0,
                        resetTime: resetTime
                    });
                }

                // Add current request
                rateLimitEntry.requests.push(now);

                // Set rate limit headers
                res.set({
                    'X-RateLimit-Limit': limit,
                    'X-RateLimit-Remaining': Math.max(0, limit - requestCount - 1),
                    'X-RateLimit-Reset': Math.ceil(windowMs / 1000)
                });

                next();

            } catch (error) {
                this.logger.error('Rate limiting error:', error);
                next(); // Continue on error to avoid blocking requests
            }
        };
    }

    /**
     * Request validation middleware
     */
    validateRequest() {
        return (req, res, next) => {
            try {
                // Validate content type for POST/PUT requests
                if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
                    const contentType = req.headers['content-type'];
                    if (!contentType || !contentType.includes('application/json')) {
                        return res.status(400).json({
                            error: 'Bad Request',
                            message: 'Content-Type must be application/json'
                        });
                    }
                }

                // Validate request size
                const contentLength = parseInt(req.headers['content-length'] || '0');
                const maxSize = 10 * 1024 * 1024; // 10MB
                
                if (contentLength > maxSize) {
                    return res.status(413).json({
                        error: 'Payload Too Large',
                        message: `Request size exceeds maximum allowed size of ${maxSize} bytes`
                    });
                }

                // Validate required headers
                const requiredHeaders = ['user-agent'];
                for (const header of requiredHeaders) {
                    if (!req.headers[header]) {
                        return res.status(400).json({
                            error: 'Bad Request',
                            message: `Missing required header: ${header}`
                        });
                    }
                }

                next();

            } catch (error) {
                this.logger.error('Request validation error:', error);
                res.status(500).json({
                    error: 'Internal Server Error',
                    message: 'Request validation failed'
                });
            }
        };
    }

    /**
     * Request transformation middleware
     */
    transformRequest() {
        return (req, res, next) => {
            try {
                // Add request metadata
                req.metadata = {
                    requestId: this._generateRequestId(),
                    timestamp: Date.now(),
                    userAgent: req.headers['user-agent'],
                    clientIp: this._getClientIp(req),
                    method: req.method,
                    path: req.path,
                    query: req.query
                };

                // Transform task data if present
                if (req.body && req.body.task_type) {
                    req.body = this._transformTaskData(req.body);
                }

                // Add correlation ID for tracking
                if (!req.headers['x-correlation-id']) {
                    req.headers['x-correlation-id'] = req.metadata.requestId;
                }

                next();

            } catch (error) {
                this.logger.error('Request transformation error:', error);
                res.status(500).json({
                    error: 'Internal Server Error',
                    message: 'Request transformation failed'
                });
            }
        };
    }

    /**
     * Response transformation middleware
     */
    transformResponse() {
        return (req, res, next) => {
            // Store original json method
            const originalJson = res.json;

            // Override json method to transform response
            res.json = function(data) {
                try {
                    const transformedData = {
                        success: data.success !== false,
                        data: data.data || data,
                        metadata: {
                            requestId: req.metadata?.requestId,
                            timestamp: new Date().toISOString(),
                            processingTime: Date.now() - (req.metadata?.timestamp || Date.now()),
                            version: '1.0.0'
                        },
                        ...(data.errors && { errors: data.errors }),
                        ...(data.warnings && { warnings: data.warnings })
                    };

                    return originalJson.call(this, transformedData);

                } catch (error) {
                    req.logger?.error('Response transformation error:', error);
                    return originalJson.call(this, {
                        success: false,
                        error: 'Response transformation failed',
                        data: data
                    });
                }
            };

            next();
        };
    }

    /**
     * Logging middleware
     */
    requestLogging() {
        return (req, res, next) => {
            const startTime = Date.now();
            
            // Log request
            this.logger.info(`${req.method} ${req.path}`, {
                requestId: req.metadata?.requestId,
                userAgent: req.headers['user-agent'],
                clientIp: this._getClientIp(req),
                contentLength: req.headers['content-length']
            });

            // Log response when finished
            res.on('finish', () => {
                const duration = Date.now() - startTime;
                const level = res.statusCode >= 400 ? 'error' : 'info';
                
                this.logger[level](`${req.method} ${req.path} - ${res.statusCode}`, {
                    requestId: req.metadata?.requestId,
                    statusCode: res.statusCode,
                    duration,
                    contentLength: res.get('Content-Length')
                });

                // Update metrics
                this._updateRequestMetrics(req, res, duration);
            });

            next();
        };
    }

    /**
     * Error handling middleware
     */
    errorHandler() {
        return (error, req, res, next) => {
            const requestId = req.metadata?.requestId || 'unknown';
            
            this.logger.error(`Request error [${requestId}]:`, {
                error: error.message,
                stack: error.stack,
                path: req.path,
                method: req.method
            });

            // Determine error response
            let statusCode = error.statusCode || error.status || 500;
            let message = error.message || 'Internal Server Error';

            // Don't expose internal errors in production
            if (statusCode >= 500 && process.env.NODE_ENV === 'production') {
                message = 'Internal Server Error';
            }

            res.status(statusCode).json({
                success: false,
                error: error.name || 'Error',
                message: message,
                requestId: requestId,
                timestamp: new Date().toISOString(),
                ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
            });
        };
    }

    /**
     * CORS middleware
     */
    cors() {
        return (req, res, next) => {
            if (!this.config.enable_cors) {
                return next();
            }

            const origin = req.headers.origin;
            const allowedOrigins = this.config.allowed_origins;

            // Check if origin is allowed
            if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
                res.set('Access-Control-Allow-Origin', origin || '*');
            }

            res.set({
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-Correlation-ID',
                'Access-Control-Allow-Credentials': 'true',
                'Access-Control-Max-Age': '86400' // 24 hours
            });

            // Handle preflight requests
            if (req.method === 'OPTIONS') {
                return res.status(200).end();
            }

            next();
        };
    }

    /**
     * Security headers middleware
     */
    securityHeaders() {
        return (req, res, next) => {
            res.set({
                'X-Content-Type-Options': 'nosniff',
                'X-Frame-Options': 'DENY',
                'X-XSS-Protection': '1; mode=block',
                'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
                'Referrer-Policy': 'strict-origin-when-cross-origin'
            });

            next();
        };
    }

    /**
     * Helper methods
     */

    _validateApiKey(apiKey) {
        // In a real implementation, this would validate against a database
        // For now, we'll check against environment variable
        const validApiKey = process.env.AGENTAPI_KEY || AGENTAPI_CONFIG.api_key;
        return apiKey === validApiKey;
    }

    _validateBearerToken(authHeader) {
        // Extract token from "Bearer <token>" format
        const token = authHeader.replace(/^Bearer\s+/, '');
        
        // In a real implementation, this would validate JWT tokens
        // For now, we'll do basic validation
        return token && token.length > 10;
    }

    _getClientId(req) {
        // Use API key, IP address, or user agent as client identifier
        return req.auth?.apiKey || 
               this._getClientIp(req) || 
               req.headers['user-agent'] || 
               'unknown';
    }

    _getClientIp(req) {
        return req.headers['x-forwarded-for']?.split(',')[0] ||
               req.headers['x-real-ip'] ||
               req.connection?.remoteAddress ||
               req.socket?.remoteAddress ||
               req.ip;
    }

    _generateRequestId() {
        return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    _transformTaskData(taskData) {
        // Standardize task data format
        return {
            task_id: taskData.task_id || this._generateRequestId(),
            task_type: taskData.task_type,
            repository: taskData.repository || {},
            requirements: Array.isArray(taskData.requirements) ? 
                taskData.requirements : [taskData.requirements].filter(Boolean),
            context: {
                ...taskData.context,
                timestamp: Date.now(),
                source: 'agentapi-middleware'
            },
            priority: taskData.priority || 'normal',
            timeout: taskData.timeout || 300000 // 5 minutes default
        };
    }

    _updateRequestMetrics(req, res, duration) {
        const path = req.route?.path || req.path;
        const method = req.method;
        const key = `${method} ${path}`;
        
        let metrics = this.requestMetrics.get(key);
        if (!metrics) {
            metrics = {
                count: 0,
                totalDuration: 0,
                averageDuration: 0,
                minDuration: Infinity,
                maxDuration: 0,
                statusCodes: new Map(),
                errors: 0
            };
            this.requestMetrics.set(key, metrics);
        }

        metrics.count++;
        metrics.totalDuration += duration;
        metrics.averageDuration = metrics.totalDuration / metrics.count;
        metrics.minDuration = Math.min(metrics.minDuration, duration);
        metrics.maxDuration = Math.max(metrics.maxDuration, duration);

        // Track status codes
        const statusCode = res.statusCode;
        const statusCount = metrics.statusCodes.get(statusCode) || 0;
        metrics.statusCodes.set(statusCode, statusCount + 1);

        // Track errors
        if (statusCode >= 400) {
            metrics.errors++;
        }
    }

    _cleanupRateLimitStore() {
        const now = Date.now();
        const windowMs = 60000; // 1 minute

        for (const [clientId, entry] of this.rateLimitStore.entries()) {
            // Remove entries with no recent requests
            entry.requests = entry.requests.filter(timestamp => now - timestamp < windowMs);
            
            if (entry.requests.length === 0) {
                this.rateLimitStore.delete(clientId);
            }
        }
    }

    /**
     * Get middleware metrics
     */
    getMetrics() {
        const metrics = {
            rateLimitStore: {
                size: this.rateLimitStore.size,
                entries: Array.from(this.rateLimitStore.entries()).map(([clientId, entry]) => ({
                    clientId,
                    requestCount: entry.requests.length,
                    lastRequest: Math.max(...entry.requests)
                }))
            },
            requestMetrics: Object.fromEntries(
                Array.from(this.requestMetrics.entries()).map(([key, metrics]) => [
                    key,
                    {
                        ...metrics,
                        statusCodes: Object.fromEntries(metrics.statusCodes),
                        errorRate: metrics.count > 0 ? metrics.errors / metrics.count : 0
                    }
                ])
            )
        };

        return metrics;
    }

    /**
     * Reset metrics
     */
    resetMetrics() {
        this.requestMetrics.clear();
        this.rateLimitStore.clear();
    }
}

export default AgentMiddleware;

