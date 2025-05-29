/**
 * @fileoverview Logging and Error Handling Middleware
 * @description Request logging, error handling, and monitoring
 */

import { getPoolManager } from '../../database/connection_pool.js';

/**
 * Request logging middleware
 */
export function requestLogger(req, res, next) {
    const startTime = Date.now();
    const requestId = generateRequestId();
    
    // Add request ID to request object
    req.requestId = requestId;
    
    // Log request start
    console.log(`[${new Date().toISOString()}] [${requestId}] ${req.method} ${req.url} - START`, {
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent'],
        ip: req.headers['cf-connecting-ip'] || req.ip,
        userId: req.user?.id,
        headers: sanitizeHeaders(req.headers)
    });

    // Override res.json to log response
    const originalJson = res.json;
    res.json = function(data) {
        const duration = Date.now() - startTime;
        
        // Log response
        console.log(`[${new Date().toISOString()}] [${requestId}] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`, {
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            duration,
            userId: req.user?.id,
            responseSize: JSON.stringify(data).length
        });

        // Store request metrics if enabled
        if (process.env.STORE_REQUEST_METRICS === 'true') {
            storeRequestMetrics(req, res, duration).catch(console.error);
        }

        return originalJson.call(this, data);
    };

    // Override res.send to log response
    const originalSend = res.send;
    res.send = function(data) {
        const duration = Date.now() - startTime;
        
        // Log response
        console.log(`[${new Date().toISOString()}] [${requestId}] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`, {
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            duration,
            userId: req.user?.id,
            responseSize: data ? data.length : 0
        });

        // Store request metrics if enabled
        if (process.env.STORE_REQUEST_METRICS === 'true') {
            storeRequestMetrics(req, res, duration).catch(console.error);
        }

        return originalSend.call(this, data);
    };

    next();
}

/**
 * Error handling middleware
 */
export function errorHandler(err, req, res, next) {
    const requestId = req.requestId || 'unknown';
    const timestamp = new Date().toISOString();
    
    // Log error
    console.error(`[${timestamp}] [${requestId}] ERROR:`, {
        error: err.message,
        stack: err.stack,
        method: req.method,
        url: req.url,
        userId: req.user?.id,
        ip: req.headers['cf-connecting-ip'] || req.ip,
        userAgent: req.headers['user-agent']
    });

    // Store error in database if enabled
    if (process.env.STORE_ERROR_LOGS === 'true') {
        storeErrorLog(err, req).catch(console.error);
    }

    // Determine error response
    let statusCode = 500;
    let errorResponse = {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        requestId,
        timestamp
    };

    // Handle specific error types
    if (err.name === 'ValidationError') {
        statusCode = 400;
        errorResponse = {
            error: 'Validation error',
            code: 'VALIDATION_ERROR',
            details: err.details || err.message,
            requestId,
            timestamp
        };
    } else if (err.name === 'UnauthorizedError' || err.message.includes('unauthorized')) {
        statusCode = 401;
        errorResponse = {
            error: 'Unauthorized',
            code: 'UNAUTHORIZED',
            requestId,
            timestamp
        };
    } else if (err.name === 'ForbiddenError' || err.message.includes('forbidden')) {
        statusCode = 403;
        errorResponse = {
            error: 'Forbidden',
            code: 'FORBIDDEN',
            requestId,
            timestamp
        };
    } else if (err.name === 'NotFoundError' || err.message.includes('not found')) {
        statusCode = 404;
        errorResponse = {
            error: 'Not found',
            code: 'NOT_FOUND',
            requestId,
            timestamp
        };
    } else if (err.name === 'ConflictError' || err.message.includes('conflict')) {
        statusCode = 409;
        errorResponse = {
            error: 'Conflict',
            code: 'CONFLICT',
            details: err.message,
            requestId,
            timestamp
        };
    } else if (err.code === '23505') { // PostgreSQL unique violation
        statusCode = 409;
        errorResponse = {
            error: 'Resource already exists',
            code: 'DUPLICATE_RESOURCE',
            requestId,
            timestamp
        };
    } else if (err.code === '23503') { // PostgreSQL foreign key violation
        statusCode = 400;
        errorResponse = {
            error: 'Invalid reference',
            code: 'INVALID_REFERENCE',
            requestId,
            timestamp
        };
    } else if (err.code === '23514') { // PostgreSQL check violation
        statusCode = 400;
        errorResponse = {
            error: 'Invalid data',
            code: 'INVALID_DATA',
            details: err.detail || err.message,
            requestId,
            timestamp
        };
    }

    // Include error details in development
    if (process.env.NODE_ENV === 'development') {
        errorResponse.stack = err.stack;
        errorResponse.details = err.message;
    }

    res.status(statusCode).json(errorResponse);
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req, res) {
    const requestId = req.requestId || 'unknown';
    const timestamp = new Date().toISOString();
    
    console.log(`[${timestamp}] [${requestId}] 404 - ${req.method} ${req.url}`, {
        method: req.method,
        url: req.url,
        userId: req.user?.id,
        ip: req.headers['cf-connecting-ip'] || req.ip
    });

    res.status(404).json({
        error: 'Endpoint not found',
        code: 'ENDPOINT_NOT_FOUND',
        method: req.method,
        url: req.url,
        requestId,
        timestamp
    });
}

/**
 * Security headers middleware
 */
export function securityHeaders(req, res, next) {
    // Set security headers
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    });

    next();
}

/**
 * Request timeout middleware
 */
export function requestTimeout(timeoutMs = 30000) {
    return (req, res, next) => {
        const timeout = setTimeout(() => {
            if (!res.headersSent) {
                console.error(`[${req.requestId}] Request timeout after ${timeoutMs}ms - ${req.method} ${req.url}`);
                
                res.status(408).json({
                    error: 'Request timeout',
                    code: 'REQUEST_TIMEOUT',
                    timeout: timeoutMs,
                    requestId: req.requestId,
                    timestamp: new Date().toISOString()
                });
            }
        }, timeoutMs);

        // Clear timeout when response is sent
        res.on('finish', () => {
            clearTimeout(timeout);
        });

        next();
    };
}

/**
 * Request size limiter
 */
export function requestSizeLimiter(maxSizeBytes = 10 * 1024 * 1024) { // 10MB default
    return (req, res, next) => {
        const contentLength = parseInt(req.headers['content-length'] || '0');
        
        if (contentLength > maxSizeBytes) {
            return res.status(413).json({
                error: 'Request entity too large',
                code: 'REQUEST_TOO_LARGE',
                maxSize: maxSizeBytes,
                actualSize: contentLength,
                requestId: req.requestId,
                timestamp: new Date().toISOString()
            });
        }

        next();
    };
}

/**
 * API versioning middleware
 */
export function apiVersioning(req, res, next) {
    // Extract version from URL or header
    const urlVersion = req.url.match(/^\/api\/v(\d+)/)?.[1];
    const headerVersion = req.headers['api-version'];
    
    req.apiVersion = urlVersion || headerVersion || '1';
    
    // Set response header
    res.set('API-Version', req.apiVersion);
    
    next();
}

/**
 * CORS preflight handler
 */
export function corsPreflightHandler(req, res, next) {
    if (req.method === 'OPTIONS') {
        res.set({
            'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-Requested-With',
            'Access-Control-Max-Age': '86400' // 24 hours
        });
        
        return res.status(204).send();
    }
    
    next();
}

// Helper functions

/**
 * Generate unique request ID
 */
function generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Sanitize headers for logging
 */
function sanitizeHeaders(headers) {
    const sanitized = { ...headers };
    
    // Remove sensitive headers
    const sensitiveHeaders = [
        'authorization',
        'x-api-key',
        'cf-access-jwt-assertion',
        'cf-access-service-token',
        'cookie',
        'set-cookie'
    ];
    
    sensitiveHeaders.forEach(header => {
        if (sanitized[header]) {
            sanitized[header] = '[REDACTED]';
        }
    });
    
    return sanitized;
}

/**
 * Store request metrics in database
 */
async function storeRequestMetrics(req, res, duration) {
    try {
        const poolManager = getPoolManager();
        
        await poolManager.query(`
            INSERT INTO performance_metrics (
                metric_type, metric_name, metric_value, tags
            ) VALUES ($1, $2, $3, $4)
        `, [
            'query',
            'api_request_duration',
            duration,
            JSON.stringify({
                method: req.method,
                endpoint: req.route?.path || req.url,
                status_code: res.statusCode,
                user_id: req.user?.id,
                user_role: req.user?.role_name
            })
        ], { queryType: 'background' });
    } catch (error) {
        console.error('Failed to store request metrics:', error);
    }
}

/**
 * Store error log in database
 */
async function storeErrorLog(err, req) {
    try {
        const poolManager = getPoolManager();
        
        // Determine error category and severity
        let category = 'system';
        let severity = 'medium';
        
        if (err.name === 'ValidationError') {
            category = 'business_logic';
            severity = 'low';
        } else if (err.code?.startsWith('23')) { // PostgreSQL errors
            category = 'database';
            severity = 'high';
        } else if (err.message.includes('unauthorized') || err.message.includes('forbidden')) {
            category = 'authorization';
            severity = 'medium';
        } else if (err.message.includes('timeout')) {
            category = 'network';
            severity = 'high';
        }
        
        await poolManager.query(`
            INSERT INTO error_logs (
                error_code, error_category, error_severity, error_message,
                error_details, stack_trace, context_data, user_id,
                ip_address, user_agent, environment, service_name
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
            err.code || 'UNKNOWN_ERROR',
            category,
            severity,
            err.message,
            JSON.stringify({
                name: err.name,
                code: err.code,
                detail: err.detail
            }),
            err.stack,
            JSON.stringify({
                method: req.method,
                url: req.url,
                headers: sanitizeHeaders(req.headers),
                body: req.body ? JSON.stringify(req.body).substring(0, 1000) : null,
                requestId: req.requestId
            }),
            req.user?.id,
            req.headers['cf-connecting-ip'] || req.ip,
            req.headers['user-agent'],
            process.env.NODE_ENV || 'production',
            'taskmaster-api'
        ], { queryType: 'background' });
    } catch (error) {
        console.error('Failed to store error log:', error);
    }
}

export default {
    requestLogger,
    errorHandler,
    notFoundHandler,
    securityHeaders,
    requestTimeout,
    requestSizeLimiter,
    apiVersioning,
    corsPreflightHandler
};

