/**
 * @fileoverview Codegen Authentication Middleware
 * @description Authentication and authorization middleware for Codegen API integration
 */

import { log } from '../scripts/modules/utils.js';
import { createCodegenConfig } from '../config/codegen.js';

/**
 * Codegen Authentication Middleware
 */
export class CodegenAuthMiddleware {
    constructor(options = {}) {
        this.config = createCodegenConfig(options);
        this.tokenCache = new Map();
        this.rateLimitCache = new Map();
        
        this.options = {
            enableTokenValidation: true,
            enableRateLimiting: true,
            enableAuditLogging: true,
            tokenCacheTTL: 3600000, // 1 hour
            rateLimitWindow: 60000, // 1 minute
            ...options
        };

        log('debug', 'Codegen Auth Middleware initialized');
    }

    /**
     * Authentication middleware function
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Function} next - Next middleware function
     */
    async authenticate(req, res, next) {
        try {
            // Extract authentication information
            const authInfo = this.extractAuthInfo(req);
            
            // Validate authentication
            const authResult = await this.validateAuthentication(authInfo);
            
            if (!authResult.isValid) {
                return this.handleAuthFailure(res, authResult.error);
            }

            // Check rate limits
            if (this.options.enableRateLimiting) {
                const rateLimitResult = await this.checkRateLimit(authInfo);
                
                if (!rateLimitResult.allowed) {
                    return this.handleRateLimitExceeded(res, rateLimitResult);
                }
            }

            // Audit logging
            if (this.options.enableAuditLogging) {
                this.logAuthEvent(req, authInfo, 'success');
            }

            // Attach auth info to request
            req.codegenAuth = {
                ...authInfo,
                ...authResult,
                timestamp: new Date()
            };

            next();

        } catch (error) {
            log('error', `Authentication middleware error: ${error.message}`);
            
            if (this.options.enableAuditLogging) {
                this.logAuthEvent(req, null, 'error', error);
            }
            
            return this.handleAuthError(res, error);
        }
    }

    /**
     * Extract authentication information from request
     * @param {Object} req - Request object
     * @returns {Object} Authentication information
     */
    extractAuthInfo(req) {
        const authInfo = {
            token: null,
            orgId: null,
            source: 'unknown',
            userAgent: req.headers['user-agent'] || 'unknown',
            ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
            requestId: req.headers['x-request-id'] || this.generateRequestId()
        };

        // Extract from Authorization header
        const authHeader = req.headers.authorization;
        if (authHeader) {
            const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/);
            if (bearerMatch) {
                authInfo.token = bearerMatch[1];
                authInfo.source = 'header';
            }
        }

        // Extract from query parameters (less secure, for development only)
        if (!authInfo.token && req.query.token) {
            authInfo.token = req.query.token;
            authInfo.source = 'query';
            
            if (this.config.isProduction()) {
                log('warning', 'Token provided via query parameter in production mode');
            }
        }

        // Extract from custom headers
        if (!authInfo.token && req.headers['x-codegen-token']) {
            authInfo.token = req.headers['x-codegen-token'];
            authInfo.source = 'custom-header';
        }

        // Extract org ID
        authInfo.orgId = req.headers['x-codegen-org-id'] || 
                        req.query.orgId || 
                        this.config.get('auth.orgId');

        // Use config defaults if not provided
        if (!authInfo.token) {
            authInfo.token = this.config.get('auth.token');
            authInfo.source = 'config';
        }

        return authInfo;
    }

    /**
     * Validate authentication information
     * @param {Object} authInfo - Authentication information
     * @returns {Promise<Object>} Validation result
     */
    async validateAuthentication(authInfo) {
        // Check if token is provided
        if (!authInfo.token) {
            return {
                isValid: false,
                error: 'No authentication token provided',
                code: 'MISSING_TOKEN'
            };
        }

        // Check if org ID is provided
        if (!authInfo.orgId) {
            return {
                isValid: false,
                error: 'No organization ID provided',
                code: 'MISSING_ORG_ID'
            };
        }

        // Validate token format
        if (!this.isValidTokenFormat(authInfo.token)) {
            return {
                isValid: false,
                error: 'Invalid token format',
                code: 'INVALID_TOKEN_FORMAT'
            };
        }

        // Check token cache
        const cacheKey = `${authInfo.token}:${authInfo.orgId}`;
        const cachedResult = this.tokenCache.get(cacheKey);
        
        if (cachedResult && !this.isCacheExpired(cachedResult)) {
            log('debug', 'Using cached token validation result');
            return {
                isValid: true,
                cached: true,
                ...cachedResult.data
            };
        }

        // Validate token with Codegen API (if not in mock mode)
        if (!this.config.isMockEnabled() && this.options.enableTokenValidation) {
            const validationResult = await this.validateTokenWithAPI(authInfo);
            
            // Cache the result
            this.tokenCache.set(cacheKey, {
                data: validationResult,
                timestamp: Date.now()
            });
            
            return validationResult;
        }

        // Mock validation for development
        return {
            isValid: true,
            mock: true,
            permissions: ['read', 'write'],
            quotas: {
                daily: { used: 0, limit: 1000 },
                monthly: { used: 0, limit: 10000 }
            }
        };
    }

    /**
     * Validate token with Codegen API
     * @param {Object} authInfo - Authentication information
     * @returns {Promise<Object>} Validation result
     */
    async validateTokenWithAPI(authInfo) {
        try {
            log('debug', `Validating token with Codegen API for org ${authInfo.orgId}`);

            // This would make an actual API call to validate the token
            // For now, we'll simulate the validation
            const response = await this.makeAPIRequest('/auth/validate', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authInfo.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    orgId: authInfo.orgId
                })
            });

            if (response.ok) {
                const data = await response.json();
                return {
                    isValid: true,
                    permissions: data.permissions || ['read'],
                    quotas: data.quotas || {},
                    userInfo: data.user || {},
                    orgInfo: data.organization || {}
                };
            } else {
                const errorData = await response.json().catch(() => ({}));
                return {
                    isValid: false,
                    error: errorData.message || 'Token validation failed',
                    code: errorData.code || 'VALIDATION_FAILED'
                };
            }

        } catch (error) {
            log('error', `Token validation API error: ${error.message}`);
            return {
                isValid: false,
                error: 'Token validation service unavailable',
                code: 'SERVICE_UNAVAILABLE'
            };
        }
    }

    /**
     * Check rate limits for the request
     * @param {Object} authInfo - Authentication information
     * @returns {Promise<Object>} Rate limit result
     */
    async checkRateLimit(authInfo) {
        const rateLimitKey = `${authInfo.orgId}:${authInfo.ipAddress}`;
        const now = Date.now();
        const windowStart = now - this.options.rateLimitWindow;

        // Get or create rate limit entry
        let rateLimitEntry = this.rateLimitCache.get(rateLimitKey);
        if (!rateLimitEntry) {
            rateLimitEntry = {
                requests: [],
                firstRequest: now
            };
            this.rateLimitCache.set(rateLimitKey, rateLimitEntry);
        }

        // Clean old requests
        rateLimitEntry.requests = rateLimitEntry.requests.filter(
            timestamp => timestamp > windowStart
        );

        // Get rate limits from config
        const rateLimits = this.config.getRateLimitConfig();
        const requestsPerMinute = rateLimits.requestsPerMinute || 60;

        // Check if limit exceeded
        if (rateLimitEntry.requests.length >= requestsPerMinute) {
            const oldestRequest = Math.min(...rateLimitEntry.requests);
            const resetTime = oldestRequest + this.options.rateLimitWindow;
            
            return {
                allowed: false,
                limit: requestsPerMinute,
                remaining: 0,
                resetTime: new Date(resetTime),
                retryAfter: Math.ceil((resetTime - now) / 1000)
            };
        }

        // Add current request
        rateLimitEntry.requests.push(now);

        return {
            allowed: true,
            limit: requestsPerMinute,
            remaining: requestsPerMinute - rateLimitEntry.requests.length,
            resetTime: new Date(windowStart + this.options.rateLimitWindow)
        };
    }

    /**
     * Handle authentication failure
     * @param {Object} res - Response object
     * @param {string} error - Error message
     */
    handleAuthFailure(res, error) {
        log('warning', `Authentication failed: ${error}`);
        
        res.status(401).json({
            error: 'Authentication failed',
            message: error,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Handle rate limit exceeded
     * @param {Object} res - Response object
     * @param {Object} rateLimitResult - Rate limit result
     */
    handleRateLimitExceeded(res, rateLimitResult) {
        log('warning', `Rate limit exceeded: ${rateLimitResult.limit} requests per minute`);
        
        res.status(429)
           .header('X-RateLimit-Limit', rateLimitResult.limit)
           .header('X-RateLimit-Remaining', rateLimitResult.remaining)
           .header('X-RateLimit-Reset', rateLimitResult.resetTime.toISOString())
           .header('Retry-After', rateLimitResult.retryAfter)
           .json({
               error: 'Rate limit exceeded',
               message: `Too many requests. Limit: ${rateLimitResult.limit} per minute`,
               retryAfter: rateLimitResult.retryAfter,
               timestamp: new Date().toISOString()
           });
    }

    /**
     * Handle authentication error
     * @param {Object} res - Response object
     * @param {Error} error - Error object
     */
    handleAuthError(res, error) {
        log('error', `Authentication error: ${error.message}`);
        
        res.status(500).json({
            error: 'Authentication service error',
            message: 'Internal authentication error',
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Log authentication events
     * @param {Object} req - Request object
     * @param {Object} authInfo - Authentication information
     * @param {string} result - Result type
     * @param {Error} error - Error object (if any)
     */
    logAuthEvent(req, authInfo, result, error = null) {
        const logData = {
            timestamp: new Date().toISOString(),
            requestId: authInfo?.requestId || 'unknown',
            method: req.method,
            path: req.path,
            userAgent: req.headers['user-agent'],
            ipAddress: req.ip || req.connection.remoteAddress,
            orgId: authInfo?.orgId,
            tokenSource: authInfo?.source,
            result: result
        };

        if (error) {
            logData.error = error.message;
        }

        log('info', `Auth event: ${result}`, logData);
    }

    /**
     * Check if token format is valid
     * @param {string} token - Token to validate
     * @returns {boolean} Whether token format is valid
     */
    isValidTokenFormat(token) {
        // Basic token format validation
        if (!token || typeof token !== 'string') {
            return false;
        }

        // Check minimum length
        if (token.length < 10) {
            return false;
        }

        // Check for basic structure (alphanumeric with some special chars)
        const tokenPattern = /^[a-zA-Z0-9._-]+$/;
        return tokenPattern.test(token);
    }

    /**
     * Check if cache entry is expired
     * @param {Object} cacheEntry - Cache entry
     * @returns {boolean} Whether cache is expired
     */
    isCacheExpired(cacheEntry) {
        return Date.now() - cacheEntry.timestamp > this.options.tokenCacheTTL;
    }

    /**
     * Generate unique request ID
     * @returns {string} Request ID
     */
    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Make API request (mock implementation)
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Request options
     * @returns {Promise<Object>} Response object
     */
    async makeAPIRequest(endpoint, options) {
        // Mock implementation - in real scenario, this would make actual HTTP requests
        log('debug', `Mock API request to ${endpoint}`);
        
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Mock successful response
        return {
            ok: true,
            json: async () => ({
                valid: true,
                permissions: ['read', 'write'],
                quotas: {
                    daily: { used: 10, limit: 1000 },
                    monthly: { used: 100, limit: 10000 }
                },
                user: {
                    id: 'user_123',
                    email: 'user@example.com'
                },
                organization: {
                    id: 'org_123',
                    name: 'Example Org'
                }
            })
        };
    }

    /**
     * Clean up expired cache entries
     */
    cleanupCache() {
        const now = Date.now();
        
        // Clean token cache
        for (const [key, entry] of this.tokenCache.entries()) {
            if (this.isCacheExpired(entry)) {
                this.tokenCache.delete(key);
            }
        }

        // Clean rate limit cache
        const rateLimitExpiry = this.options.rateLimitWindow * 2; // Keep for 2 windows
        for (const [key, entry] of this.rateLimitCache.entries()) {
            if (now - entry.firstRequest > rateLimitExpiry) {
                this.rateLimitCache.delete(key);
            }
        }

        log('debug', `Cache cleanup completed. Token cache: ${this.tokenCache.size}, Rate limit cache: ${this.rateLimitCache.size}`);
    }

    /**
     * Get middleware health status
     * @returns {Object} Health status
     */
    getHealth() {
        return {
            status: 'healthy',
            cacheStats: {
                tokenCache: this.tokenCache.size,
                rateLimitCache: this.rateLimitCache.size
            },
            configuration: {
                enableTokenValidation: this.options.enableTokenValidation,
                enableRateLimiting: this.options.enableRateLimiting,
                enableAuditLogging: this.options.enableAuditLogging,
                tokenCacheTTL: this.options.tokenCacheTTL,
                rateLimitWindow: this.options.rateLimitWindow
            },
            mockMode: this.config.isMockEnabled()
        };
    }

    /**
     * Shutdown the middleware
     */
    async shutdown() {
        log('debug', 'Shutting down Codegen Auth Middleware...');
        
        // Clear caches
        this.tokenCache.clear();
        this.rateLimitCache.clear();
        
        log('debug', 'Codegen Auth Middleware shutdown complete');
    }
}

/**
 * Create authentication middleware function
 * @param {Object} options - Middleware options
 * @returns {Function} Express middleware function
 */
export function createCodegenAuthMiddleware(options = {}) {
    const middleware = new CodegenAuthMiddleware(options);
    
    // Set up periodic cache cleanup
    const cleanupInterval = setInterval(() => {
        middleware.cleanupCache();
    }, 300000); // Every 5 minutes

    // Return the middleware function
    const authFunction = (req, res, next) => middleware.authenticate(req, res, next);
    
    // Attach middleware instance for access to methods
    authFunction.middleware = middleware;
    authFunction.cleanup = () => clearInterval(cleanupInterval);
    
    return authFunction;
}

export default CodegenAuthMiddleware;

