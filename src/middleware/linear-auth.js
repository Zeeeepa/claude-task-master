import crypto from 'crypto';
import { getConfig } from '../config/linear.js';

/**
 * Linear Authentication Middleware
 * Handles authentication and authorization for Linear API requests and webhooks
 */

/**
 * Validate Linear API key
 * @param {string} apiKey - API key to validate
 * @returns {Promise<boolean>} Validation result
 */
export async function validateApiKey(apiKey) {
    if (!apiKey) {
        return false;
    }
    
    // Linear API keys start with 'lin_api_'
    if (!apiKey.startsWith('lin_api_')) {
        return false;
    }
    
    // Additional validation could be added here
    // For now, we assume the key format is correct
    return true;
}

/**
 * Validate webhook signature
 * @param {string} payload - Raw webhook payload
 * @param {string} signature - Webhook signature from headers
 * @param {string} secret - Webhook secret
 * @returns {boolean} Signature validity
 */
export function validateWebhookSignature(payload, signature, secret) {
    if (!secret || !signature) {
        return false;
    }
    
    try {
        // Linear uses HMAC-SHA256 for webhook signatures
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(payload, 'utf8')
            .digest('hex');
        
        // Compare signatures using timing-safe comparison
        const providedSignature = signature.replace('sha256=', '');
        
        return crypto.timingSafeEqual(
            Buffer.from(expectedSignature, 'hex'),
            Buffer.from(providedSignature, 'hex')
        );
    } catch (error) {
        console.error('Error validating webhook signature:', error);
        return false;
    }
}

/**
 * Express middleware for Linear webhook authentication
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export function webhookAuthMiddleware(req, res, next) {
    const config = getConfig();
    
    // Skip validation if disabled in config
    if (!config.validateSignature) {
        return next();
    }
    
    const signature = req.headers['linear-signature'] || req.headers['x-linear-signature'];
    const secret = config.webhookSecret;
    
    if (!secret) {
        console.warn('Webhook secret not configured, skipping signature validation');
        return next();
    }
    
    if (!signature) {
        return res.status(401).json({
            error: 'Missing webhook signature',
            code: 'MISSING_SIGNATURE'
        });
    }
    
    // Get raw body for signature validation
    const rawBody = req.rawBody || JSON.stringify(req.body);
    
    if (!validateWebhookSignature(rawBody, signature, secret)) {
        return res.status(401).json({
            error: 'Invalid webhook signature',
            code: 'INVALID_SIGNATURE'
        });
    }
    
    next();
}

/**
 * Express middleware for Linear API authentication
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export async function apiAuthMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
        return res.status(401).json({
            error: 'Missing authorization header',
            code: 'MISSING_AUTH'
        });
    }
    
    const [scheme, token] = authHeader.split(' ');
    
    if (scheme !== 'Bearer') {
        return res.status(401).json({
            error: 'Invalid authorization scheme',
            code: 'INVALID_SCHEME'
        });
    }
    
    if (!token) {
        return res.status(401).json({
            error: 'Missing API token',
            code: 'MISSING_TOKEN'
        });
    }
    
    const isValid = await validateApiKey(token);
    
    if (!isValid) {
        return res.status(401).json({
            error: 'Invalid API key',
            code: 'INVALID_API_KEY'
        });
    }
    
    // Store the validated API key in request for later use
    req.linearApiKey = token;
    next();
}

/**
 * Rate limiting middleware for Linear API requests
 * @param {Object} options - Rate limiting options
 * @returns {Function} Express middleware function
 */
export function rateLimitMiddleware(options = {}) {
    const {
        windowMs = 60000, // 1 minute
        maxRequests = 100,
        skipSuccessfulRequests = false,
        skipFailedRequests = false
    } = options;
    
    const requests = new Map();
    
    return (req, res, next) => {
        const clientId = req.ip || req.connection.remoteAddress;
        const now = Date.now();
        const windowStart = now - windowMs;
        
        // Clean up old entries
        for (const [id, timestamps] of requests.entries()) {
            const validTimestamps = timestamps.filter(ts => ts > windowStart);
            if (validTimestamps.length === 0) {
                requests.delete(id);
            } else {
                requests.set(id, validTimestamps);
            }
        }
        
        // Get current client's requests
        const clientRequests = requests.get(clientId) || [];
        const validRequests = clientRequests.filter(ts => ts > windowStart);
        
        if (validRequests.length >= maxRequests) {
            return res.status(429).json({
                error: 'Rate limit exceeded',
                code: 'RATE_LIMIT_EXCEEDED',
                retryAfter: Math.ceil(windowMs / 1000)
            });
        }
        
        // Add current request timestamp
        validRequests.push(now);
        requests.set(clientId, validRequests);
        
        // Add rate limit headers
        res.set({
            'X-RateLimit-Limit': maxRequests,
            'X-RateLimit-Remaining': Math.max(0, maxRequests - validRequests.length),
            'X-RateLimit-Reset': new Date(now + windowMs).toISOString()
        });
        
        next();
    };
}

/**
 * CORS middleware for Linear webhook endpoints
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export function corsMiddleware(req, res, next) {
    // Allow Linear's webhook servers
    const allowedOrigins = [
        'https://linear.app',
        'https://api.linear.app',
        'https://webhooks.linear.app'
    ];
    
    const origin = req.headers.origin;
    
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Linear-Signature, X-Linear-Signature');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
}

/**
 * Request logging middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export function loggingMiddleware(req, res, next) {
    const start = Date.now();
    const requestId = crypto.randomUUID();
    
    // Add request ID to request object
    req.requestId = requestId;
    
    // Log request
    console.log(`[${requestId}] ${req.method} ${req.path} - ${req.ip}`);
    
    // Override res.end to log response
    const originalEnd = res.end;
    res.end = function(chunk, encoding) {
        const duration = Date.now() - start;
        console.log(`[${requestId}] ${res.statusCode} - ${duration}ms`);
        originalEnd.call(this, chunk, encoding);
    };
    
    next();
}

/**
 * Error handling middleware for Linear integration
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export function errorHandlingMiddleware(err, req, res, next) {
    const requestId = req.requestId || 'unknown';
    
    console.error(`[${requestId}] Error:`, err);
    
    // Handle specific Linear API errors
    if (err.name === 'LinearError') {
        return res.status(err.status || 500).json({
            error: err.message,
            code: err.code || 'LINEAR_ERROR',
            requestId
        });
    }
    
    // Handle authentication errors
    if (err.name === 'AuthenticationError') {
        return res.status(401).json({
            error: 'Authentication failed',
            code: 'AUTH_ERROR',
            requestId
        });
    }
    
    // Handle validation errors
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            error: err.message,
            code: 'VALIDATION_ERROR',
            requestId
        });
    }
    
    // Handle rate limit errors
    if (err.name === 'RateLimitError') {
        return res.status(429).json({
            error: 'Rate limit exceeded',
            code: 'RATE_LIMIT_ERROR',
            requestId
        });
    }
    
    // Generic error response
    res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        requestId
    });
}

/**
 * Raw body parser middleware for webhook signature validation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export function rawBodyMiddleware(req, res, next) {
    if (req.headers['content-type'] === 'application/json') {
        let data = '';
        
        req.on('data', chunk => {
            data += chunk;
        });
        
        req.on('end', () => {
            req.rawBody = data;
            try {
                req.body = JSON.parse(data);
            } catch (error) {
                return next(new Error('Invalid JSON payload'));
            }
            next();
        });
    } else {
        next();
    }
}

/**
 * Security headers middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export function securityHeadersMiddleware(req, res, next) {
    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Remove server header
    res.removeHeader('X-Powered-By');
    
    next();
}

/**
 * Create authentication middleware stack
 * @param {Object} options - Middleware options
 * @returns {Array} Array of middleware functions
 */
export function createAuthMiddlewareStack(options = {}) {
    const {
        enableRateLimit = true,
        enableCors = true,
        enableLogging = true,
        enableSecurity = true,
        rateLimitOptions = {}
    } = options;
    
    const middleware = [];
    
    if (enableSecurity) {
        middleware.push(securityHeadersMiddleware);
    }
    
    if (enableCors) {
        middleware.push(corsMiddleware);
    }
    
    if (enableLogging) {
        middleware.push(loggingMiddleware);
    }
    
    if (enableRateLimit) {
        middleware.push(rateLimitMiddleware(rateLimitOptions));
    }
    
    // Always include error handling
    middleware.push(errorHandlingMiddleware);
    
    return middleware;
}

/**
 * Create webhook middleware stack
 * @param {Object} options - Middleware options
 * @returns {Array} Array of middleware functions
 */
export function createWebhookMiddlewareStack(options = {}) {
    const baseMiddleware = createAuthMiddlewareStack(options);
    
    return [
        rawBodyMiddleware,
        ...baseMiddleware,
        webhookAuthMiddleware
    ];
}

/**
 * Create API middleware stack
 * @param {Object} options - Middleware options
 * @returns {Array} Array of middleware functions
 */
export function createApiMiddlewareStack(options = {}) {
    const baseMiddleware = createAuthMiddlewareStack(options);
    
    return [
        ...baseMiddleware,
        apiAuthMiddleware
    ];
}

export default {
    validateApiKey,
    validateWebhookSignature,
    webhookAuthMiddleware,
    apiAuthMiddleware,
    rateLimitMiddleware,
    corsMiddleware,
    loggingMiddleware,
    errorHandlingMiddleware,
    rawBodyMiddleware,
    securityHeadersMiddleware,
    createAuthMiddlewareStack,
    createWebhookMiddlewareStack,
    createApiMiddlewareStack
};

