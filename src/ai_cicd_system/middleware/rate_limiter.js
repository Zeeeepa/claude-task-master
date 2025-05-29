/**
 * @fileoverview Rate Limiter Middleware
 * @description Advanced rate limiting with multiple strategies and backpressure handling
 */

/**
 * Rate Limiter class
 */
export class RateLimiter {
    constructor(config = {}) {
        this.config = {
            windowMs: config.windowMs || 60000, // 1 minute
            maxRequests: config.maxRequests || 100,
            keyGenerator: config.keyGenerator || this.defaultKeyGenerator.bind(this),
            skipSuccessfulRequests: config.skipSuccessfulRequests || false,
            skipFailedRequests: config.skipFailedRequests || false,
            enableBackpressure: config.enableBackpressure !== false,
            backpressureThreshold: config.backpressureThreshold || 0.8,
            enableBurst: config.enableBurst !== false,
            burstLimit: config.burstLimit || 20,
            burstWindowMs: config.burstWindowMs || 10000, // 10 seconds
            enableSlowDown: config.enableSlowDown !== false,
            slowDownThreshold: config.slowDownThreshold || 0.7,
            slowDownDelay: config.slowDownDelay || 1000,
            enableAdaptive: config.enableAdaptive !== false,
            adaptiveWindow: config.adaptiveWindow || 300000, // 5 minutes
            ...config
        };

        this.store = new Map();
        this.burstStore = new Map();
        this.slowDownStore = new Map();
        this.adaptiveMetrics = new Map();
        
        this.statistics = {
            totalRequests: 0,
            blockedRequests: 0,
            slowedRequests: 0,
            burstBlocked: 0,
            adaptiveAdjustments: 0,
            averageResponseTime: 0,
            totalResponseTime: 0
        };

        this.startCleanupTimer();
    }

    /**
     * Create Express middleware
     * @returns {Function} Express middleware function
     */
    middleware() {
        return async (req, res, next) => {
            const startTime = Date.now();
            
            try {
                // Generate rate limit key
                const key = this.config.keyGenerator(req);
                
                // Check rate limits
                const rateLimitResult = await this.checkRateLimit(key, req);
                
                if (!rateLimitResult.allowed) {
                    return this.handleRateLimitExceeded(res, rateLimitResult);
                }

                // Apply slow down if needed
                if (rateLimitResult.slowDown) {
                    await this.applySlowDown(rateLimitResult.slowDownDelay);
                    this.statistics.slowedRequests++;
                }

                // Track response time
                res.on('finish', () => {
                    const responseTime = Date.now() - startTime;
                    this.updateResponseTimeMetrics(responseTime);
                    
                    // Update adaptive metrics
                    if (this.config.enableAdaptive) {
                        this.updateAdaptiveMetrics(key, responseTime, res.statusCode);
                    }
                });

                this.statistics.totalRequests++;
                next();

            } catch (error) {
                console.error('Rate limiter error:', error);
                next(); // Don't block on rate limiter errors
            }
        };
    }

    /**
     * Check rate limit for key
     * @param {string} key - Rate limit key
     * @param {Object} req - Express request object
     * @returns {Promise<Object>} Rate limit result
     */
    async checkRateLimit(key, req) {
        const now = Date.now();
        
        // Get or create rate limit entry
        let entry = this.store.get(key);
        if (!entry) {
            entry = {
                count: 0,
                resetTime: now + this.config.windowMs,
                firstRequest: now
            };
            this.store.set(key, entry);
        }

        // Reset if window has passed
        if (now > entry.resetTime) {
            entry.count = 0;
            entry.resetTime = now + this.config.windowMs;
            entry.firstRequest = now;
        }

        // Check burst limit
        const burstResult = this.checkBurstLimit(key, now);
        if (!burstResult.allowed) {
            this.statistics.burstBlocked++;
            return {
                allowed: false,
                reason: 'burst_limit_exceeded',
                retryAfter: burstResult.retryAfter,
                limit: this.config.burstLimit,
                remaining: 0,
                resetTime: burstResult.resetTime
            };
        }

        // Get effective limit (may be adjusted by adaptive algorithm)
        const effectiveLimit = this.getEffectiveLimit(key);

        // Check main rate limit
        if (entry.count >= effectiveLimit) {
            this.statistics.blockedRequests++;
            return {
                allowed: false,
                reason: 'rate_limit_exceeded',
                retryAfter: Math.ceil((entry.resetTime - now) / 1000),
                limit: effectiveLimit,
                remaining: 0,
                resetTime: entry.resetTime
            };
        }

        // Check if slow down should be applied
        const slowDownResult = this.checkSlowDown(key, entry, effectiveLimit);

        // Increment counter
        entry.count++;

        return {
            allowed: true,
            limit: effectiveLimit,
            remaining: Math.max(0, effectiveLimit - entry.count),
            resetTime: entry.resetTime,
            slowDown: slowDownResult.slowDown,
            slowDownDelay: slowDownResult.delay
        };
    }

    /**
     * Check burst limit
     * @param {string} key - Rate limit key
     * @param {number} now - Current timestamp
     * @returns {Object} Burst limit result
     */
    checkBurstLimit(key, now) {
        if (!this.config.enableBurst) {
            return { allowed: true };
        }

        let burstEntry = this.burstStore.get(key);
        if (!burstEntry) {
            burstEntry = {
                count: 0,
                resetTime: now + this.config.burstWindowMs
            };
            this.burstStore.set(key, burstEntry);
        }

        // Reset if window has passed
        if (now > burstEntry.resetTime) {
            burstEntry.count = 0;
            burstEntry.resetTime = now + this.config.burstWindowMs;
        }

        if (burstEntry.count >= this.config.burstLimit) {
            return {
                allowed: false,
                retryAfter: Math.ceil((burstEntry.resetTime - now) / 1000),
                resetTime: burstEntry.resetTime
            };
        }

        burstEntry.count++;
        return { allowed: true };
    }

    /**
     * Check if slow down should be applied
     * @param {string} key - Rate limit key
     * @param {Object} entry - Rate limit entry
     * @param {number} effectiveLimit - Effective rate limit
     * @returns {Object} Slow down result
     */
    checkSlowDown(key, entry, effectiveLimit) {
        if (!this.config.enableSlowDown) {
            return { slowDown: false };
        }

        const usageRatio = entry.count / effectiveLimit;
        
        if (usageRatio >= this.config.slowDownThreshold) {
            // Calculate delay based on usage ratio
            const delayMultiplier = (usageRatio - this.config.slowDownThreshold) / (1 - this.config.slowDownThreshold);
            const delay = this.config.slowDownDelay * delayMultiplier;
            
            return {
                slowDown: true,
                delay: Math.min(delay, this.config.slowDownDelay * 5) // Cap at 5x base delay
            };
        }

        return { slowDown: false };
    }

    /**
     * Get effective limit (may be adjusted by adaptive algorithm)
     * @param {string} key - Rate limit key
     * @returns {number} Effective rate limit
     */
    getEffectiveLimit(key) {
        if (!this.config.enableAdaptive) {
            return this.config.maxRequests;
        }

        const metrics = this.adaptiveMetrics.get(key);
        if (!metrics) {
            return this.config.maxRequests;
        }

        // Adjust limit based on error rate and response time
        let adjustment = 1.0;

        // Reduce limit if high error rate
        if (metrics.errorRate > 0.1) { // More than 10% errors
            adjustment *= 0.8;
        }

        // Reduce limit if high response time
        if (metrics.averageResponseTime > 5000) { // More than 5 seconds
            adjustment *= 0.7;
        }

        // Increase limit if performing well
        if (metrics.errorRate < 0.01 && metrics.averageResponseTime < 1000) {
            adjustment *= 1.2;
        }

        const adjustedLimit = Math.floor(this.config.maxRequests * adjustment);
        return Math.max(1, Math.min(adjustedLimit, this.config.maxRequests * 2));
    }

    /**
     * Apply slow down delay
     * @param {number} delay - Delay in milliseconds
     * @returns {Promise<void>}
     */
    async applySlowDown(delay) {
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    /**
     * Handle rate limit exceeded
     * @param {Object} res - Express response object
     * @param {Object} rateLimitResult - Rate limit result
     */
    handleRateLimitExceeded(res, rateLimitResult) {
        // Set rate limit headers
        res.set({
            'X-RateLimit-Limit': rateLimitResult.limit,
            'X-RateLimit-Remaining': rateLimitResult.remaining,
            'X-RateLimit-Reset': rateLimitResult.resetTime,
            'Retry-After': rateLimitResult.retryAfter
        });

        // Send rate limit response
        res.status(429).json({
            error: 'Rate limit exceeded',
            message: `Too many requests. ${rateLimitResult.reason}`,
            retryAfter: rateLimitResult.retryAfter,
            limit: rateLimitResult.limit,
            remaining: rateLimitResult.remaining
        });
    }

    /**
     * Update response time metrics
     * @param {number} responseTime - Response time in milliseconds
     */
    updateResponseTimeMetrics(responseTime) {
        this.statistics.totalResponseTime += responseTime;
        const totalResponses = this.statistics.totalRequests - this.statistics.blockedRequests;
        
        if (totalResponses > 0) {
            this.statistics.averageResponseTime = this.statistics.totalResponseTime / totalResponses;
        }
    }

    /**
     * Update adaptive metrics
     * @param {string} key - Rate limit key
     * @param {number} responseTime - Response time in milliseconds
     * @param {number} statusCode - HTTP status code
     */
    updateAdaptiveMetrics(key, responseTime, statusCode) {
        let metrics = this.adaptiveMetrics.get(key);
        if (!metrics) {
            metrics = {
                requestCount: 0,
                errorCount: 0,
                totalResponseTime: 0,
                averageResponseTime: 0,
                errorRate: 0,
                lastUpdate: Date.now(),
                windowStart: Date.now()
            };
            this.adaptiveMetrics.set(key, metrics);
        }

        const now = Date.now();
        
        // Reset metrics if window has passed
        if (now - metrics.windowStart > this.config.adaptiveWindow) {
            metrics.requestCount = 0;
            metrics.errorCount = 0;
            metrics.totalResponseTime = 0;
            metrics.windowStart = now;
        }

        // Update metrics
        metrics.requestCount++;
        metrics.totalResponseTime += responseTime;
        metrics.averageResponseTime = metrics.totalResponseTime / metrics.requestCount;
        
        if (statusCode >= 400) {
            metrics.errorCount++;
        }
        
        metrics.errorRate = metrics.errorCount / metrics.requestCount;
        metrics.lastUpdate = now;
    }

    /**
     * Default key generator
     * @param {Object} req - Express request object
     * @returns {string} Rate limit key
     */
    defaultKeyGenerator(req) {
        // Use IP address and user agent for key
        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent') || '';
        
        // Create hash of user agent to keep key size manageable
        const crypto = require('crypto');
        const uaHash = crypto.createHash('md5').update(userAgent).digest('hex').substr(0, 8);
        
        return `${ip}:${uaHash}`;
    }

    /**
     * Clean up expired entries
     */
    cleanup() {
        const now = Date.now();
        
        // Clean up main store
        for (const [key, entry] of this.store) {
            if (now > entry.resetTime + this.config.windowMs) {
                this.store.delete(key);
            }
        }

        // Clean up burst store
        for (const [key, entry] of this.burstStore) {
            if (now > entry.resetTime + this.config.burstWindowMs) {
                this.burstStore.delete(key);
            }
        }

        // Clean up adaptive metrics
        for (const [key, metrics] of this.adaptiveMetrics) {
            if (now - metrics.lastUpdate > this.config.adaptiveWindow * 2) {
                this.adaptiveMetrics.delete(key);
            }
        }
    }

    /**
     * Start cleanup timer
     */
    startCleanupTimer() {
        // Clean up every 5 minutes
        setInterval(() => {
            this.cleanup();
        }, 5 * 60 * 1000);
    }

    /**
     * Get rate limiter statistics
     * @returns {Object} Rate limiter statistics
     */
    getStatistics() {
        return {
            ...this.statistics,
            activeKeys: this.store.size,
            burstKeys: this.burstStore.size,
            adaptiveKeys: this.adaptiveMetrics.size,
            blockRate: this.statistics.totalRequests > 0 
                ? (this.statistics.blockedRequests / this.statistics.totalRequests) * 100
                : 0,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get health status
     * @returns {Promise<string>} Health status
     */
    async getHealth() {
        try {
            // Check block rate
            const blockRate = this.statistics.totalRequests > 0 
                ? (this.statistics.blockedRequests / this.statistics.totalRequests) * 100
                : 0;

            if (blockRate > 50) { // More than 50% blocked
                return 'degraded';
            }

            // Check memory usage (number of active keys)
            if (this.store.size > 10000) {
                return 'degraded';
            }

            return 'healthy';
        } catch (error) {
            return 'unhealthy';
        }
    }

    /**
     * Reset rate limit for key
     * @param {string} key - Rate limit key
     * @returns {boolean} True if reset
     */
    resetKey(key) {
        const deleted = this.store.delete(key);
        this.burstStore.delete(key);
        this.adaptiveMetrics.delete(key);
        return deleted;
    }

    /**
     * Get rate limit status for key
     * @param {string} key - Rate limit key
     * @returns {Object|null} Rate limit status
     */
    getKeyStatus(key) {
        const entry = this.store.get(key);
        if (!entry) {
            return null;
        }

        const now = Date.now();
        const effectiveLimit = this.getEffectiveLimit(key);

        return {
            key,
            count: entry.count,
            limit: effectiveLimit,
            remaining: Math.max(0, effectiveLimit - entry.count),
            resetTime: entry.resetTime,
            timeToReset: Math.max(0, entry.resetTime - now),
            isExpired: now > entry.resetTime
        };
    }

    /**
     * Configure rate limit for specific key
     * @param {string} key - Rate limit key
     * @param {Object} config - Key-specific configuration
     */
    configureKey(key, config) {
        // This could be used to set different limits for different clients
        // Implementation would depend on specific requirements
        console.log(`Configuring rate limit for key ${key}:`, config);
    }
}

export default RateLimiter;

