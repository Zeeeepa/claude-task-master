/**
 * Rate Limiting Middleware
 * Prevents webhook spam and abuse with configurable rate limits
 */

import { LRUCache } from 'lru-cache';

// In-memory rate limiting cache
const rateLimitCache = new LRUCache({
  max: 10000, // Maximum number of entries
  ttl: 15 * 60 * 1000, // 15 minutes TTL
});

// Rate limit configurations
const RATE_LIMITS = {
  default: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
    message: 'Too many requests from this IP'
  },
  webhook: {
    windowMs: 1 * 60 * 1000, // 1 minute
    maxRequests: 30,
    message: 'Too many webhook requests'
  },
  authenticated: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 500,
    message: 'Rate limit exceeded for authenticated user'
  },
  admin: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 1000,
    message: 'Rate limit exceeded for admin user'
  }
};

/**
 * Main rate limiting middleware
 */
export function rateLimiter(req, res, next) {
  try {
    // Determine rate limit type based on request
    const limitType = getRateLimitType(req);
    const config = RATE_LIMITS[limitType];
    
    // Get client identifier
    const clientId = getClientIdentifier(req);
    
    // Check rate limit
    const isAllowed = checkRateLimit(clientId, config, limitType);
    
    if (!isAllowed.allowed) {
      console.warn(`⚠️ Rate limit exceeded for ${clientId} (${limitType})`);
      
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: config.message,
        retryAfter: Math.ceil(isAllowed.retryAfter / 1000),
        limit: config.maxRequests,
        windowMs: config.windowMs
      });
    }
    
    // Add rate limit headers
    res.set({
      'X-RateLimit-Limit': config.maxRequests,
      'X-RateLimit-Remaining': isAllowed.remaining,
      'X-RateLimit-Reset': new Date(Date.now() + config.windowMs).toISOString(),
      'X-RateLimit-Window': config.windowMs
    });
    
    next();
    
  } catch (error) {
    console.error('❌ Rate limiter error:', error);
    // Don't block requests on rate limiter errors
    next();
  }
}

/**
 * Determine the appropriate rate limit type for a request
 */
function getRateLimitType(req) {
  // Admin users get highest limits
  if (req.auth?.admin) {
    return 'admin';
  }
  
  // Authenticated users get higher limits
  if (req.auth) {
    return 'authenticated';
  }
  
  // Webhook endpoints get specific limits
  if (req.path.startsWith('/webhooks/')) {
    return 'webhook';
  }
  
  // Default rate limit
  return 'default';
}

/**
 * Get client identifier for rate limiting
 */
function getClientIdentifier(req) {
  // Use API key if available
  if (req.auth?.key) {
    return `api:${req.auth.key.substring(0, 8)}`;
  }
  
  // Use user ID from JWT if available
  if (req.auth?.user?.id) {
    return `user:${req.auth.user.id}`;
  }
  
  // Use IP address as fallback
  const ip = req.ip || 
             req.connection?.remoteAddress || 
             req.socket?.remoteAddress ||
             req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
             'unknown';
  
  return `ip:${ip}`;
}

/**
 * Check if request is within rate limit
 */
function checkRateLimit(clientId, config, limitType) {
  const now = Date.now();
  const windowStart = now - config.windowMs;
  
  // Get or create rate limit data for this client
  const key = `${limitType}:${clientId}`;
  let rateLimitData = rateLimitCache.get(key);
  
  if (!rateLimitData) {
    rateLimitData = {
      requests: [],
      firstRequest: now
    };
  }
  
  // Remove old requests outside the window
  rateLimitData.requests = rateLimitData.requests.filter(
    timestamp => timestamp > windowStart
  );
  
  // Check if limit is exceeded
  if (rateLimitData.requests.length >= config.maxRequests) {
    const oldestRequest = Math.min(...rateLimitData.requests);
    const retryAfter = oldestRequest + config.windowMs - now;
    
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(retryAfter, 0)
    };
  }
  
  // Add current request
  rateLimitData.requests.push(now);
  
  // Update cache
  rateLimitCache.set(key, rateLimitData);
  
  return {
    allowed: true,
    remaining: config.maxRequests - rateLimitData.requests.length,
    retryAfter: 0
  };
}

/**
 * Webhook-specific rate limiter with burst protection
 */
export function webhookRateLimiter(req, res, next) {
  try {
    const webhookType = getWebhookType(req);
    const clientId = getWebhookClientId(req);
    
    // Different limits for different webhook types
    const burstConfig = {
      windowMs: 10 * 1000, // 10 seconds
      maxRequests: 5, // Max 5 requests per 10 seconds
      message: 'Webhook burst limit exceeded'
    };
    
    const isAllowed = checkRateLimit(
      `burst:${webhookType}:${clientId}`, 
      burstConfig, 
      'webhook-burst'
    );
    
    if (!isAllowed.allowed) {
      console.warn(`⚠️ Webhook burst limit exceeded for ${webhookType}:${clientId}`);
      
      return res.status(429).json({
        error: 'Webhook burst limit exceeded',
        message: burstConfig.message,
        retryAfter: Math.ceil(isAllowed.retryAfter / 1000)
      });
    }
    
    next();
    
  } catch (error) {
    console.error('❌ Webhook rate limiter error:', error);
    next();
  }
}

/**
 * Get webhook type from request
 */
function getWebhookType(req) {
  if (req.path.includes('/github')) return 'github';
  if (req.path.includes('/linear')) return 'linear';
  if (req.path.includes('/codegen')) return 'codegen';
  return 'unknown';
}

/**
 * Get webhook-specific client identifier
 */
function getWebhookClientId(req) {
  // For GitHub, use delivery ID if available
  if (req.headers['x-github-delivery']) {
    return req.headers['x-github-delivery'];
  }
  
  // For Linear, use organization or user info from payload
  if (req.body?.organization?.id) {
    return req.body.organization.id;
  }
  
  // Fallback to IP
  return getClientIdentifier(req);
}

/**
 * Get current rate limit status for a client
 */
export function getRateLimitStatus(clientId, limitType = 'default') {
  const config = RATE_LIMITS[limitType];
  const key = `${limitType}:${clientId}`;
  const rateLimitData = rateLimitCache.get(key);
  
  if (!rateLimitData) {
    return {
      limit: config.maxRequests,
      remaining: config.maxRequests,
      reset: new Date(Date.now() + config.windowMs),
      used: 0
    };
  }
  
  const now = Date.now();
  const windowStart = now - config.windowMs;
  const validRequests = rateLimitData.requests.filter(
    timestamp => timestamp > windowStart
  );
  
  return {
    limit: config.maxRequests,
    remaining: config.maxRequests - validRequests.length,
    reset: new Date(now + config.windowMs),
    used: validRequests.length
  };
}

/**
 * Clear rate limit for a specific client (admin function)
 */
export function clearRateLimit(clientId, limitType = 'default') {
  const key = `${limitType}:${clientId}`;
  rateLimitCache.delete(key);
  return true;
}

/**
 * Get rate limit statistics
 */
export function getRateLimitStats() {
  const stats = {
    totalEntries: rateLimitCache.size,
    cacheInfo: {
      max: rateLimitCache.max,
      ttl: rateLimitCache.ttl
    },
    limits: RATE_LIMITS
  };
  
  return stats;
}

