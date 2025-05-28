/**
 * Rate Limiter Middleware
 * 
 * Advanced rate limiting middleware for the AI CI/CD system.
 * Supports multiple rate limiting strategies and database-backed persistence.
 */

import { SimpleLogger } from '../utils/simple_logger.js';

export class RateLimiter {
    constructor(database, config = {}) {
        this.db = database;
        this.config = {
            // Default rate limits
            defaultLimits: {
                requests: 100,
                windowMs: 15 * 60 * 1000, // 15 minutes
                windowSeconds: 15 * 60
            },
            // Rate limits by endpoint pattern
            endpointLimits: {
                '/api/auth/login': { requests: 5, windowSeconds: 300 }, // 5 requests per 5 minutes
                '/api/auth/register': { requests: 3, windowSeconds: 3600 }, // 3 requests per hour
                '/api/auth/forgot-password': { requests: 3, windowSeconds: 3600 },
                '/api/tasks': { requests: 1000, windowSeconds: 3600 }, // 1000 requests per hour
                '/api/workflows': { requests: 500, windowSeconds: 3600 },
                '/api/admin/*': { requests: 200, windowSeconds: 3600 }
            },
            // Rate limits by user role
            roleLimits: {
                'guest': { requests: 10, windowSeconds: 300 },
                'user': { requests: 100, windowSeconds: 300 },
                'developer': { requests: 500, windowSeconds: 300 },
                'admin': { requests: 1000, windowSeconds: 300 },
                'superadmin': { requests: 10000, windowSeconds: 300 }
            },
            // Skip rate limiting for certain IPs
            whitelist: [],
            // Headers to include in response
            headers: true,
            // Custom identifier function
            keyGenerator: null,
            // Skip successful requests in count
            skipSuccessfulRequests: false,
            // Skip failed requests in count
            skipFailedRequests: false,
            ...config
        };

        this.logger = new SimpleLogger('RateLimiter');
        
        // Start cleanup interval
        this._startCleanupInterval();
    }

    /**
     * Create rate limiting middleware
     */
    limit(options = {}) {
        const config = { ...this.config, ...options };

        return async (req, res, next) => {
            try {
                // Check if IP is whitelisted
                const clientIP = this._getClientIP(req);
                if (config.whitelist.includes(clientIP)) {
                    return next();
                }

                // Generate rate limit key
                const key = config.keyGenerator ? 
                    config.keyGenerator(req) : 
                    this._generateKey(req);

                // Get rate limit configuration for this request
                const limitConfig = this._getLimitConfig(req, config);

                // Check rate limit
                const result = await this._checkRateLimit(key, req.path, limitConfig);

                // Add headers if enabled
                if (config.headers) {
                    res.set({
                        'X-RateLimit-Limit': limitConfig.requests,
                        'X-RateLimit-Remaining': Math.max(0, limitConfig.requests - result.count),
                        'X-RateLimit-Reset': new Date(result.windowEnd).toISOString(),
                        'X-RateLimit-Window': limitConfig.windowSeconds
                    });
                }

                // Check if rate limit exceeded
                if (result.exceeded) {
                    // Log rate limit exceeded event
                    await this._logSecurityEvent('rate_limit_exceeded', 'medium', req.user?.id || null, {
                        identifier: key,
                        endpoint: req.path,
                        method: req.method,
                        limit: limitConfig.requests,
                        window_seconds: limitConfig.windowSeconds,
                        current_count: result.count,
                        ip_address: clientIP,
                        user_agent: req.get('User-Agent')
                    });

                    // Add retry-after header
                    const retryAfter = Math.ceil((result.windowEnd - Date.now()) / 1000);
                    res.set('Retry-After', retryAfter);

                    return res.status(429).json({
                        error: 'Rate limit exceeded',
                        message: `Too many requests. Limit: ${limitConfig.requests} per ${limitConfig.windowSeconds} seconds`,
                        retryAfter: retryAfter,
                        code: 'RATE_LIMIT_EXCEEDED'
                    });
                }

                // Store original end handler to update count after response
                const originalEnd = res.end;
                res.end = function(...args) {
                    // Update count based on response status
                    const shouldCount = !config.skipSuccessfulRequests || res.statusCode >= 400;
                    if (shouldCount && !config.skipFailedRequests) {
                        // Count is already incremented, no need to do anything
                    }
                    
                    originalEnd.apply(res, args);
                };

                next();

            } catch (error) {
                this.logger.error('Rate limiting error:', error);
                // Fail open - allow request if rate limiting fails
                next();
            }
        };
    }

    /**
     * Create rate limiting middleware for specific endpoints
     */
    limitEndpoint(endpoint, requests, windowSeconds) {
        return this.limit({
            endpointLimits: {
                [endpoint]: { requests, windowSeconds }
            }
        });
    }

    /**
     * Create rate limiting middleware for specific roles
     */
    limitByRole(roleLimits) {
        return this.limit({
            roleLimits: { ...this.config.roleLimits, ...roleLimits }
        });
    }

    /**
     * Check rate limit for a key and endpoint
     */
    async _checkRateLimit(identifier, endpoint, limitConfig) {
        try {
            const now = new Date();
            const windowStart = new Date(now.getTime() - (limitConfig.windowSeconds * 1000));

            // Get or create rate limit record
            const result = await this.db.query(
                `INSERT INTO rate_limits (identifier, endpoint, request_count, window_start, window_duration_seconds, max_requests)
                 VALUES ($1, $2, 1, $3, $4, $5)
                 ON CONFLICT (identifier, endpoint, window_start)
                 DO UPDATE SET 
                     request_count = rate_limits.request_count + 1,
                     updated_at = NOW()
                 RETURNING request_count, window_start, window_duration_seconds, max_requests`,
                [
                    identifier,
                    endpoint,
                    windowStart,
                    limitConfig.windowSeconds,
                    limitConfig.requests
                ]
            );

            const record = result.rows[0];
            const windowEnd = new Date(record.window_start.getTime() + (record.window_duration_seconds * 1000));
            const exceeded = record.request_count > record.max_requests;

            return {
                count: record.request_count,
                limit: record.max_requests,
                windowStart: record.window_start,
                windowEnd: windowEnd,
                exceeded: exceeded
            };

        } catch (error) {
            this.logger.error('Rate limit check failed:', error);
            // Fail open
            return {
                count: 0,
                limit: limitConfig.requests,
                windowStart: new Date(),
                windowEnd: new Date(Date.now() + (limitConfig.windowSeconds * 1000)),
                exceeded: false
            };
        }
    }

    /**
     * Get rate limit configuration for a request
     */
    _getLimitConfig(req, config) {
        // Check for endpoint-specific limits
        for (const [pattern, limits] of Object.entries(config.endpointLimits)) {
            if (this._matchEndpoint(req.path, pattern)) {
                return {
                    requests: limits.requests,
                    windowSeconds: limits.windowSeconds
                };
            }
        }

        // Check for role-specific limits
        if (req.user && req.user.role && config.roleLimits[req.user.role]) {
            const roleLimits = config.roleLimits[req.user.role];
            return {
                requests: roleLimits.requests,
                windowSeconds: roleLimits.windowSeconds
            };
        }

        // Return default limits
        return {
            requests: config.defaultLimits.requests,
            windowSeconds: config.defaultLimits.windowSeconds
        };
    }

    /**
     * Match endpoint pattern
     */
    _matchEndpoint(path, pattern) {
        // Simple wildcard matching
        if (pattern.includes('*')) {
            const regexPattern = pattern.replace(/\*/g, '.*');
            const regex = new RegExp(`^${regexPattern}$`);
            return regex.test(path);
        }
        
        return path === pattern;
    }

    /**
     * Generate rate limiting key
     */
    _generateKey(req) {
        // Use user ID if authenticated, otherwise use IP
        if (req.user && req.user.id) {
            return `user:${req.user.id}`;
        }
        
        return `ip:${this._getClientIP(req)}`;
    }

    /**
     * Get client IP address
     */
    _getClientIP(req) {
        return req.ip || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress ||
               (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
               req.headers['x-forwarded-for']?.split(',')[0] ||
               req.headers['x-real-ip'] ||
               '127.0.0.1';
    }

    /**
     * Get rate limit status for a key
     */
    async getRateLimitStatus(identifier, endpoint) {
        try {
            const result = await this.db.query(
                `SELECT request_count, window_start, window_duration_seconds, max_requests
                 FROM rate_limits 
                 WHERE identifier = $1 AND endpoint = $2 
                 ORDER BY window_start DESC 
                 LIMIT 1`,
                [identifier, endpoint]
            );

            if (result.rows.length === 0) {
                return {
                    count: 0,
                    limit: this.config.defaultLimits.requests,
                    remaining: this.config.defaultLimits.requests,
                    resetTime: new Date(Date.now() + this.config.defaultLimits.windowMs)
                };
            }

            const record = result.rows[0];
            const windowEnd = new Date(record.window_start.getTime() + (record.window_duration_seconds * 1000));
            const remaining = Math.max(0, record.max_requests - record.request_count);

            return {
                count: record.request_count,
                limit: record.max_requests,
                remaining: remaining,
                resetTime: windowEnd
            };

        } catch (error) {
            this.logger.error('Failed to get rate limit status:', error);
            throw error;
        }
    }

    /**
     * Reset rate limit for a key
     */
    async resetRateLimit(identifier, endpoint) {
        try {
            const result = await this.db.query(
                'DELETE FROM rate_limits WHERE identifier = $1 AND endpoint = $2',
                [identifier, endpoint]
            );

            this.logger.info(`Rate limit reset for ${identifier} on ${endpoint}`);
            return { success: true, deletedRecords: result.rowCount };

        } catch (error) {
            this.logger.error('Failed to reset rate limit:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get rate limiting statistics
     */
    async getStats() {
        try {
            const stats = await this.db.query(`
                SELECT 
                    COUNT(*) as total_records,
                    COUNT(DISTINCT identifier) as unique_identifiers,
                    COUNT(DISTINCT endpoint) as unique_endpoints,
                    AVG(request_count) as avg_requests_per_window,
                    MAX(request_count) as max_requests_in_window,
                    COUNT(*) FILTER (WHERE request_count > max_requests) as exceeded_limits
                FROM rate_limits
                WHERE window_start > NOW() - INTERVAL '24 hours'
            `);

            return {
                success: true,
                stats: stats.rows[0]
            };

        } catch (error) {
            this.logger.error('Failed to get rate limiting statistics:', error);
            return {
                success: false,
                error: 'Failed to get rate limiting statistics'
            };
        }
    }

    /**
     * Clean up old rate limit records
     */
    async cleanup() {
        try {
            // Delete records older than 24 hours
            const result = await this.db.query(
                'DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL \'24 hours\''
            );

            this.logger.debug(`Rate limit cleanup completed: ${result.rowCount} records removed`);
            
            return {
                deletedRecords: result.rowCount
            };

        } catch (error) {
            this.logger.error('Rate limit cleanup failed:', error);
            throw error;
        }
    }

    /**
     * Start automatic cleanup interval
     */
    _startCleanupInterval() {
        // Clean up every hour
        setInterval(async () => {
            try {
                await this.cleanup();
            } catch (error) {
                this.logger.error('Scheduled rate limit cleanup failed:', error);
            }
        }, 60 * 60 * 1000); // 1 hour

        this.logger.info('Rate limit cleanup interval started');
    }

    /**
     * Log security event
     */
    async _logSecurityEvent(eventType, severity, userId, eventData) {
        try {
            await this.db.query(
                'INSERT INTO security_events (event_type, severity, user_id, event_data) VALUES ($1, $2, $3, $4)',
                [eventType, severity, userId, JSON.stringify(eventData)]
            );
        } catch (error) {
            this.logger.error('Failed to log security event:', error);
        }
    }
}

export default RateLimiter;

