/**
 * @fileoverview Rate Limiting Middleware
 * @description Rate limiting and DDoS protection for webhook endpoints
 */

import { log } from '../../../scripts/modules/utils.js';

/**
 * Simple in-memory rate limiter
 */
class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutes
    this.max = options.max || 100; // limit each IP to 100 requests per windowMs
    this.skipSuccessfulRequests = options.skipSuccessfulRequests || false;
    this.skipFailedRequests = options.skipFailedRequests || false;
    this.keyGenerator = options.keyGenerator || this.defaultKeyGenerator;
    this.onLimitReached = options.onLimitReached || this.defaultOnLimitReached;
    
    this.hits = new Map();
    this.resetTime = new Map();
    
    // Clean up expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Default key generator (uses IP address)
   * @param {Object} req - Express request
   * @returns {string} Rate limit key
   */
  defaultKeyGenerator(req) {
    return req.ip || req.connection.remoteAddress || 'unknown';
  }

  /**
   * Default callback when limit is reached
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  defaultOnLimitReached(req, res) {
    const key = this.keyGenerator(req);
    
    log('warn', 'Rate limit exceeded', {
      ip: key,
      user_agent: req.get('User-Agent'),
      endpoint: req.path,
      method: req.method
    });

    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: Math.ceil(this.windowMs / 1000)
    });
  }

  /**
   * Check if request should be rate limited
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @returns {boolean} True if request should be blocked
   */
  isLimited(req, res) {
    const key = this.keyGenerator(req);
    const now = Date.now();
    
    // Initialize tracking for this key
    if (!this.hits.has(key)) {
      this.hits.set(key, []);
      this.resetTime.set(key, now + this.windowMs);
    }

    const hits = this.hits.get(key);
    const resetTime = this.resetTime.get(key);

    // Reset window if expired
    if (now > resetTime) {
      this.hits.set(key, []);
      this.resetTime.set(key, now + this.windowMs);
      hits.length = 0;
    }

    // Remove old hits outside the window
    const windowStart = now - this.windowMs;
    while (hits.length > 0 && hits[0] < windowStart) {
      hits.shift();
    }

    // Check if limit exceeded
    if (hits.length >= this.max) {
      this.onLimitReached(req, res);
      return true;
    }

    // Record this hit
    hits.push(now);
    
    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': this.max,
      'X-RateLimit-Remaining': Math.max(0, this.max - hits.length),
      'X-RateLimit-Reset': Math.ceil(resetTime / 1000)
    });

    return false;
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    
    for (const [key, resetTime] of this.resetTime.entries()) {
      if (now > resetTime + this.windowMs) {
        this.hits.delete(key);
        this.resetTime.delete(key);
      }
    }
  }

  /**
   * Get current stats
   * @returns {Object} Rate limiter stats
   */
  getStats() {
    return {
      totalKeys: this.hits.size,
      windowMs: this.windowMs,
      maxRequests: this.max,
      activeConnections: Array.from(this.hits.values()).reduce((sum, hits) => sum + hits.length, 0)
    };
  }

  /**
   * Reset rate limiter for a specific key
   * @param {string} key - Rate limit key
   */
  reset(key) {
    this.hits.delete(key);
    this.resetTime.delete(key);
  }

  /**
   * Reset all rate limits
   */
  resetAll() {
    this.hits.clear();
    this.resetTime.clear();
  }
}

/**
 * Create rate limiting middleware
 * @param {Object} options - Rate limiting options
 * @returns {Function} Express middleware
 */
export function rateLimitMiddleware(options = {}) {
  const limiter = new RateLimiter(options);

  return (req, res, next) => {
    try {
      // Skip rate limiting for certain conditions
      if (options.skip && options.skip(req)) {
        return next();
      }

      // Check if request should be limited
      if (limiter.isLimited(req, res)) {
        return; // Response already sent by limiter
      }

      // Track response to potentially skip counting
      if (options.skipSuccessfulRequests || options.skipFailedRequests) {
        const originalSend = res.send;
        res.send = function(body) {
          const shouldSkip = 
            (options.skipSuccessfulRequests && res.statusCode < 400) ||
            (options.skipFailedRequests && res.statusCode >= 400);

          if (shouldSkip) {
            const key = limiter.keyGenerator(req);
            const hits = limiter.hits.get(key);
            if (hits && hits.length > 0) {
              hits.pop(); // Remove the last hit
            }
          }

          return originalSend.call(this, body);
        };
      }

      next();
      
    } catch (error) {
      log('error', 'Rate limiting middleware error', {
        error: error.message,
        ip: req.ip
      });
      
      // Don't block request on rate limiter errors
      next();
    }
  };
}

/**
 * Create adaptive rate limiting middleware
 * Adjusts limits based on system load
 * @param {Object} options - Rate limiting options
 * @returns {Function} Express middleware
 */
export function adaptiveRateLimitMiddleware(options = {}) {
  const baseLimiter = new RateLimiter(options);
  
  let currentMultiplier = 1;
  let lastCheck = Date.now();
  
  // Check system load every 30 seconds
  setInterval(() => {
    const memUsage = process.memoryUsage();
    const memPercent = memUsage.heapUsed / memUsage.heapTotal;
    
    // Adjust rate limits based on memory usage
    if (memPercent > 0.9) {
      currentMultiplier = 0.5; // Reduce limits by 50%
    } else if (memPercent > 0.8) {
      currentMultiplier = 0.7; // Reduce limits by 30%
    } else if (memPercent > 0.7) {
      currentMultiplier = 0.85; // Reduce limits by 15%
    } else {
      currentMultiplier = 1; // Normal limits
    }
    
    lastCheck = Date.now();
  }, 30000);

  return (req, res, next) => {
    try {
      // Adjust max requests based on current multiplier
      const adjustedMax = Math.floor(baseLimiter.max * currentMultiplier);
      baseLimiter.max = adjustedMax;

      // Use base limiter logic
      if (baseLimiter.isLimited(req, res)) {
        return;
      }

      // Add adaptive headers
      res.set({
        'X-RateLimit-Adaptive': 'true',
        'X-RateLimit-Multiplier': currentMultiplier.toFixed(2)
      });

      next();
      
    } catch (error) {
      log('error', 'Adaptive rate limiting middleware error', {
        error: error.message,
        ip: req.ip
      });
      
      next();
    }
  };
}

/**
 * Create burst protection middleware
 * Protects against sudden spikes in traffic
 * @param {Object} options - Burst protection options
 * @returns {Function} Express middleware
 */
export function burstProtectionMiddleware(options = {}) {
  const burstWindow = options.burstWindow || 10000; // 10 seconds
  const burstLimit = options.burstLimit || 20; // 20 requests per burst window
  const burstPenalty = options.burstPenalty || 60000; // 1 minute penalty
  
  const burstTracker = new Map();
  const penalties = new Map();

  return (req, res, next) => {
    try {
      const key = req.ip || req.connection.remoteAddress || 'unknown';
      const now = Date.now();

      // Check if IP is currently penalized
      if (penalties.has(key)) {
        const penaltyEnd = penalties.get(key);
        if (now < penaltyEnd) {
          log('warn', 'Request blocked due to burst penalty', {
            ip: key,
            penalty_remaining: penaltyEnd - now
          });
          
          return res.status(429).json({
            error: 'Too Many Requests',
            message: 'Burst protection active. Please wait before retrying.',
            retryAfter: Math.ceil((penaltyEnd - now) / 1000)
          });
        } else {
          penalties.delete(key);
        }
      }

      // Initialize burst tracking
      if (!burstTracker.has(key)) {
        burstTracker.set(key, []);
      }

      const requests = burstTracker.get(key);
      
      // Remove old requests outside burst window
      while (requests.length > 0 && requests[0] < now - burstWindow) {
        requests.shift();
      }

      // Check burst limit
      if (requests.length >= burstLimit) {
        // Apply penalty
        penalties.set(key, now + burstPenalty);
        
        log('warn', 'Burst limit exceeded, applying penalty', {
          ip: key,
          requests_in_window: requests.length,
          penalty_duration: burstPenalty
        });
        
        return res.status(429).json({
          error: 'Too Many Requests',
          message: 'Burst limit exceeded. Temporary penalty applied.',
          retryAfter: Math.ceil(burstPenalty / 1000)
        });
      }

      // Record this request
      requests.push(now);

      next();
      
    } catch (error) {
      log('error', 'Burst protection middleware error', {
        error: error.message,
        ip: req.ip
      });
      
      next();
    }
  };
}

/**
 * Create DDoS protection middleware
 * Combines multiple protection strategies
 * @param {Object} options - DDoS protection options
 * @returns {Function} Express middleware
 */
export function ddosProtectionMiddleware(options = {}) {
  const rateLimiter = rateLimitMiddleware(options.rateLimit || {});
  const burstProtection = burstProtectionMiddleware(options.burstProtection || {});
  const adaptiveRateLimit = adaptiveRateLimitMiddleware(options.adaptive || {});

  return (req, res, next) => {
    // Apply burst protection first
    burstProtection(req, res, (err) => {
      if (err || res.headersSent) return;
      
      // Then apply adaptive rate limiting
      adaptiveRateLimit(req, res, (err) => {
        if (err || res.headersSent) return;
        
        // Finally apply standard rate limiting
        rateLimiter(req, res, next);
      });
    });
  };
}

export { RateLimiter };
export default rateLimitMiddleware;

