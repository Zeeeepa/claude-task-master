/**
 * @fileoverview Webhook Middleware
 * @description Express middleware for webhook request processing, rate limiting, and logging
 */

import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import { WEBHOOK_CONFIG } from '../config/webhook_config.js';
import { log } from '../../scripts/modules/utils.js';

/**
 * Create rate limiting middleware for webhooks
 * @param {Object} config - Rate limit configuration
 * @returns {Function} Express middleware
 */
export function createRateLimitMiddleware(config = {}) {
    const rateLimitConfig = {
        ...WEBHOOK_CONFIG.rate_limit,
        ...config
    };

    return rateLimit({
        windowMs: rateLimitConfig.window_ms,
        max: rateLimitConfig.max_requests,
        message: {
            error: 'Too many webhook requests',
            retryAfter: Math.ceil(rateLimitConfig.window_ms / 1000)
        },
        standardHeaders: true,
        legacyHeaders: false,
        skip: (req) => {
            // Skip rate limiting for successful requests if configured
            if (rateLimitConfig.skip_successful && req.webhookProcessed && req.webhookSuccess) {
                return true;
            }
            return false;
        },
        keyGenerator: (req) => {
            // Use GitHub delivery ID if available, otherwise fall back to IP
            return req.headers['x-github-delivery'] || req.ip;
        },
        onLimitReached: (req, res, options) => {
            log('warn', 'Webhook rate limit exceeded', {
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                deliveryId: req.headers['x-github-delivery']
            });
        }
    });
}

/**
 * Create slow down middleware for webhooks
 * @param {Object} config - Slow down configuration
 * @returns {Function} Express middleware
 */
export function createSlowDownMiddleware(config = {}) {
    const slowDownConfig = {
        windowMs: WEBHOOK_CONFIG.rate_limit.window_ms,
        delayAfter: Math.floor(WEBHOOK_CONFIG.rate_limit.max_requests * 0.8),
        delayMs: 500,
        maxDelayMs: 5000,
        ...config
    };

    return slowDown({
        windowMs: slowDownConfig.windowMs,
        delayAfter: slowDownConfig.delayAfter,
        delayMs: slowDownConfig.delayMs,
        maxDelayMs: slowDownConfig.maxDelayMs,
        keyGenerator: (req) => {
            return req.headers['x-github-delivery'] || req.ip;
        },
        onLimitReached: (req, res, options) => {
            log('info', 'Webhook slow down activated', {
                ip: req.ip,
                delay: options.delay,
                deliveryId: req.headers['x-github-delivery']
            });
        }
    });
}

/**
 * Request logging middleware for webhooks
 * @param {Object} config - Logging configuration
 * @returns {Function} Express middleware
 */
export function createLoggingMiddleware(config = {}) {
    return (req, res, next) => {
        const startTime = Date.now();
        const deliveryId = req.headers['x-github-delivery'] || 'unknown';
        const eventType = req.headers['x-github-event'] || 'unknown';

        // Log incoming request
        log('info', `Webhook request received: ${eventType}`, {
            deliveryId,
            eventType,
            userAgent: req.headers['user-agent'],
            contentLength: req.headers['content-length'],
            ip: req.ip
        });

        // Override res.json to log response
        const originalJson = res.json;
        res.json = function(data) {
            const duration = Date.now() - startTime;
            
            // Mark request as processed for rate limiting
            req.webhookProcessed = true;
            req.webhookSuccess = data.success;

            log('info', `Webhook response sent: ${eventType}`, {
                deliveryId,
                eventType,
                statusCode: res.statusCode,
                duration,
                success: data.success,
                tasksCreated: data.data?.tasksCreated || 0
            });

            return originalJson.call(this, data);
        };

        next();
    };
}

/**
 * Request validation middleware for webhooks
 * @param {Object} config - Validation configuration
 * @returns {Function} Express middleware
 */
export function createValidationMiddleware(config = {}) {
    return (req, res, next) => {
        const errors = [];

        // Validate required headers
        const requiredHeaders = [
            'x-github-event',
            'x-github-delivery',
            'user-agent'
        ];

        for (const header of requiredHeaders) {
            if (!req.headers[header]) {
                errors.push(`Missing required header: ${header}`);
            }
        }

        // Validate User-Agent
        const userAgent = req.headers['user-agent'];
        if (userAgent && !userAgent.startsWith('GitHub-Hookshot/')) {
            errors.push('Invalid User-Agent header');
        }

        // Validate Content-Type
        const contentType = req.headers['content-type'];
        if (contentType && !contentType.includes('application/json')) {
            errors.push('Invalid Content-Type header');
        }

        // Validate request body exists
        if (!req.body || Object.keys(req.body).length === 0) {
            errors.push('Request body is required');
        }

        if (errors.length > 0) {
            log('warn', 'Webhook request validation failed', {
                deliveryId: req.headers['x-github-delivery'],
                errors,
                userAgent: req.headers['user-agent']
            });

            return res.status(400).json({
                success: false,
                error: {
                    type: 'validation_error',
                    message: 'Request validation failed',
                    details: errors
                }
            });
        }

        next();
    };
}

/**
 * Error handling middleware for webhooks
 * @param {Object} config - Error handling configuration
 * @returns {Function} Express error middleware
 */
export function createErrorHandlingMiddleware(config = {}) {
    return (error, req, res, next) => {
        const deliveryId = req.headers['x-github-delivery'] || 'unknown';
        const eventType = req.headers['x-github-event'] || 'unknown';

        // Log error
        log('error', `Webhook error: ${error.message}`, {
            deliveryId,
            eventType,
            error: error.stack,
            userAgent: req.headers['user-agent']
        });

        // Determine error type and status code
        let statusCode = 500;
        let errorType = 'internal_error';

        if (error.name === 'ValidationError') {
            statusCode = 400;
            errorType = 'validation_error';
        } else if (error.message.includes('signature')) {
            statusCode = 401;
            errorType = 'authentication_error';
        } else if (error.message.includes('timeout')) {
            statusCode = 408;
            errorType = 'timeout_error';
        }

        // Send error response
        const errorResponse = {
            success: false,
            eventId: deliveryId,
            error: {
                type: errorType,
                message: process.env.NODE_ENV === 'production' && statusCode === 500 
                    ? 'Internal server error' 
                    : error.message,
                timestamp: new Date().toISOString()
            }
        };

        res.status(statusCode).json(errorResponse);
    };
}

/**
 * Request timeout middleware for webhooks
 * @param {Object} config - Timeout configuration
 * @returns {Function} Express middleware
 */
export function createTimeoutMiddleware(config = {}) {
    const timeout = config.timeout || WEBHOOK_CONFIG.processing.timeout_ms;

    return (req, res, next) => {
        const timer = setTimeout(() => {
            if (!res.headersSent) {
                log('warn', 'Webhook request timeout', {
                    deliveryId: req.headers['x-github-delivery'],
                    eventType: req.headers['x-github-event'],
                    timeout
                });

                res.status(408).json({
                    success: false,
                    error: {
                        type: 'timeout_error',
                        message: 'Request processing timeout',
                        timeout: timeout
                    }
                });
            }
        }, timeout);

        // Clear timeout when response is sent
        res.on('finish', () => {
            clearTimeout(timer);
        });

        next();
    };
}

/**
 * Security headers middleware for webhooks
 * @param {Object} config - Security configuration
 * @returns {Function} Express middleware
 */
export function createSecurityHeadersMiddleware(config = {}) {
    return (req, res, next) => {
        // Set security headers
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        
        // Remove server header
        res.removeHeader('X-Powered-By');

        next();
    };
}

/**
 * Request size limiting middleware for webhooks
 * @param {Object} config - Size limit configuration
 * @returns {Function} Express middleware
 */
export function createSizeLimitMiddleware(config = {}) {
    const maxSize = config.maxSize || '10mb';

    return (req, res, next) => {
        const contentLength = parseInt(req.headers['content-length'] || '0');
        const maxSizeBytes = typeof maxSize === 'string' 
            ? parseSize(maxSize) 
            : maxSize;

        if (contentLength > maxSizeBytes) {
            log('warn', 'Webhook request too large', {
                deliveryId: req.headers['x-github-delivery'],
                contentLength,
                maxSize: maxSizeBytes
            });

            return res.status(413).json({
                success: false,
                error: {
                    type: 'payload_too_large',
                    message: 'Request payload too large',
                    maxSize: maxSize
                }
            });
        }

        next();
    };
}

/**
 * Parse size string to bytes
 * @param {string} size - Size string (e.g., '10mb', '1gb')
 * @returns {number} Size in bytes
 * @private
 */
function parseSize(size) {
    const units = {
        'b': 1,
        'kb': 1024,
        'mb': 1024 * 1024,
        'gb': 1024 * 1024 * 1024
    };

    const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)(b|kb|mb|gb)$/);
    if (!match) {
        throw new Error(`Invalid size format: ${size}`);
    }

    const [, value, unit] = match;
    return Math.floor(parseFloat(value) * units[unit]);
}

/**
 * Create complete webhook middleware stack
 * @param {Object} config - Middleware configuration
 * @returns {Array} Array of middleware functions
 */
export function createWebhookMiddlewareStack(config = {}) {
    return [
        createSecurityHeadersMiddleware(config.security),
        createSizeLimitMiddleware(config.sizeLimit),
        createTimeoutMiddleware(config.timeout),
        createLoggingMiddleware(config.logging),
        createValidationMiddleware(config.validation),
        createSlowDownMiddleware(config.slowDown),
        createRateLimitMiddleware(config.rateLimit)
    ];
}

export default {
    createRateLimitMiddleware,
    createSlowDownMiddleware,
    createLoggingMiddleware,
    createValidationMiddleware,
    createErrorHandlingMiddleware,
    createTimeoutMiddleware,
    createSecurityHeadersMiddleware,
    createSizeLimitMiddleware,
    createWebhookMiddlewareStack
};

