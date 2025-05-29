/**
 * @fileoverview Authentication and Authorization Middleware
 * @description Cloudflare Access integration and user authentication
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getPoolManager } from '../../database/connection_pool.js';
import { cloudflareConfig, getAccessJWTConfig } from '../../config/cloudflare_config.js';

/**
 * Validate Cloudflare Access JWT token
 */
export async function validateCloudflareAccess(req, res, next) {
    try {
        if (!cloudflareConfig.access.enabled) {
            return next();
        }

        const accessJWT = req.headers['cf-access-jwt-assertion'];
        if (!accessJWT) {
            return res.status(401).json({
                error: 'Missing Cloudflare Access token',
                code: 'MISSING_ACCESS_TOKEN'
            });
        }

        const jwtConfig = getAccessJWTConfig();
        if (!jwtConfig) {
            return res.status(500).json({
                error: 'Cloudflare Access not properly configured',
                code: 'ACCESS_CONFIG_ERROR'
            });
        }

        // Verify JWT token
        const decoded = jwt.verify(accessJWT, null, {
            issuer: jwtConfig.issuer,
            audience: jwtConfig.audience,
            algorithms: jwtConfig.algorithms,
            // Note: In production, you should fetch and cache the public keys
            // from the JWKS endpoint for proper verification
        });

        // Store Cloudflare Access user info
        req.cloudflareUser = {
            email: decoded.email,
            userId: decoded.sub,
            groups: decoded.groups || [],
            country: decoded.country,
            ip: req.headers['cf-connecting-ip'],
        };

        next();
    } catch (error) {
        console.error('Cloudflare Access validation error:', error);
        return res.status(401).json({
            error: 'Invalid Cloudflare Access token',
            code: 'INVALID_ACCESS_TOKEN'
        });
    }
}

/**
 * Authenticate user using API key or session
 */
export async function authenticateUser(req, res, next) {
    try {
        const poolManager = getPoolManager();
        let user = null;

        // Check for API key authentication
        const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
        if (apiKey) {
            user = await authenticateWithAPIKey(apiKey, poolManager);
        }

        // Check for session authentication (if no API key)
        if (!user && req.headers['authorization']?.startsWith('Bearer ')) {
            const token = req.headers['authorization'].replace('Bearer ', '');
            user = await authenticateWithJWT(token);
        }

        // Check for service token (for internal services)
        if (!user && req.headers['cf-access-service-token']) {
            user = await authenticateWithServiceToken(req.headers['cf-access-service-token']);
        }

        // If no authentication method worked, check if endpoint requires auth
        if (!user) {
            // Some endpoints might be public or have different auth requirements
            if (req.path.startsWith('/api/v1/health')) {
                return next();
            }

            return res.status(401).json({
                error: 'Authentication required',
                code: 'AUTHENTICATION_REQUIRED'
            });
        }

        // Store user info in request
        req.user = user;
        req.userRole = user.role_name;
        req.userPermissions = user.permissions;

        next();
    } catch (error) {
        console.error('Authentication error:', error);
        return res.status(401).json({
            error: 'Authentication failed',
            code: 'AUTHENTICATION_FAILED'
        });
    }
}

/**
 * Authorize user permission for specific action
 */
export function authorizePermission(requiredPermission) {
    return (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    error: 'Authentication required',
                    code: 'AUTHENTICATION_REQUIRED'
                });
            }

            const userPermissions = req.userPermissions || [];

            // Check for wildcard permission (admin)
            if (userPermissions.includes('*')) {
                return next();
            }

            // Check for specific permission
            if (userPermissions.includes(requiredPermission)) {
                return next();
            }

            // Check for broader permission (e.g., 'tasks:*' covers 'tasks:read')
            const [resource, action] = requiredPermission.split(':');
            const wildcardPermission = `${resource}:*`;
            if (userPermissions.includes(wildcardPermission)) {
                return next();
            }

            return res.status(403).json({
                error: 'Insufficient permissions',
                code: 'INSUFFICIENT_PERMISSIONS',
                required: requiredPermission,
                user_permissions: userPermissions
            });
        } catch (error) {
            console.error('Authorization error:', error);
            return res.status(500).json({
                error: 'Authorization check failed',
                code: 'AUTHORIZATION_ERROR'
            });
        }
    };
}

/**
 * Authenticate using API key
 */
async function authenticateWithAPIKey(apiKey, poolManager) {
    try {
        // Hash the API key for comparison
        const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');

        const result = await poolManager.query(`
            SELECT 
                u.id,
                u.username,
                u.email,
                u.is_active,
                u.api_key_expires_at,
                ur.role_name,
                ur.permissions
            FROM users u
            JOIN user_roles ur ON u.role_id = ur.id
            WHERE u.api_key_hash = $1 
                AND u.is_active = true
                AND ur.is_active = true
                AND (u.api_key_expires_at IS NULL OR u.api_key_expires_at > NOW())
        `, [hashedKey], { queryType: 'read' });

        if (result.rows.length === 0) {
            throw new Error('Invalid API key');
        }

        const user = result.rows[0];

        // Update last login
        await poolManager.query(`
            UPDATE users 
            SET last_login_at = NOW() 
            WHERE id = $1
        `, [user.id], { queryType: 'write' });

        return user;
    } catch (error) {
        console.error('API key authentication error:', error);
        throw error;
    }
}

/**
 * Authenticate using JWT token
 */
async function authenticateWithJWT(token) {
    try {
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            throw new Error('JWT secret not configured');
        }

        const decoded = jwt.verify(token, jwtSecret);
        
        // Get user from database
        const poolManager = getPoolManager();
        const result = await poolManager.query(`
            SELECT 
                u.id,
                u.username,
                u.email,
                u.is_active,
                ur.role_name,
                ur.permissions
            FROM users u
            JOIN user_roles ur ON u.role_id = ur.id
            WHERE u.id = $1 
                AND u.is_active = true
                AND ur.is_active = true
        `, [decoded.userId], { queryType: 'read' });

        if (result.rows.length === 0) {
            throw new Error('User not found or inactive');
        }

        return result.rows[0];
    } catch (error) {
        console.error('JWT authentication error:', error);
        throw error;
    }
}

/**
 * Authenticate using Cloudflare service token
 */
async function authenticateWithServiceToken(serviceToken) {
    try {
        if (!cloudflareConfig.access.service_token_id || !cloudflareConfig.access.service_token_secret) {
            throw new Error('Service token not configured');
        }

        // Parse service token (format: id.secret)
        const [tokenId, tokenSecret] = serviceToken.split('.');
        
        if (tokenId !== cloudflareConfig.access.service_token_id) {
            throw new Error('Invalid service token ID');
        }

        // Verify token secret (in production, use proper HMAC verification)
        if (tokenSecret !== cloudflareConfig.access.service_token_secret) {
            throw new Error('Invalid service token secret');
        }

        // Return service user with API client role
        return {
            id: 'service-token',
            username: 'service-token',
            email: 'service@taskmaster.internal',
            is_active: true,
            role_name: 'api_client',
            permissions: ['tasks:read', 'tasks:write', 'validations:write', 'errors:write']
        };
    } catch (error) {
        console.error('Service token authentication error:', error);
        throw error;
    }
}

/**
 * Rate limiting by user
 */
export function userRateLimit(options = {}) {
    const {
        windowMs = 15 * 60 * 1000, // 15 minutes
        maxRequests = 1000,
        skipSuccessfulRequests = false,
        skipFailedRequests = false,
    } = options;

    const userRequests = new Map();

    return (req, res, next) => {
        const userId = req.user?.id || req.ip;
        const now = Date.now();
        const windowStart = now - windowMs;

        // Clean up old entries
        if (userRequests.has(userId)) {
            const requests = userRequests.get(userId);
            userRequests.set(userId, requests.filter(time => time > windowStart));
        }

        // Check current request count
        const currentRequests = userRequests.get(userId) || [];
        
        if (currentRequests.length >= maxRequests) {
            return res.status(429).json({
                error: 'Rate limit exceeded',
                code: 'RATE_LIMIT_EXCEEDED',
                retryAfter: Math.ceil(windowMs / 1000)
            });
        }

        // Add current request
        currentRequests.push(now);
        userRequests.set(userId, currentRequests);

        // Add rate limit headers
        res.set({
            'X-RateLimit-Limit': maxRequests,
            'X-RateLimit-Remaining': maxRequests - currentRequests.length,
            'X-RateLimit-Reset': new Date(now + windowMs).toISOString()
        });

        next();
    };
}

/**
 * IP whitelist middleware
 */
export function ipWhitelist(allowedIPs = []) {
    return (req, res, next) => {
        if (allowedIPs.length === 0) {
            return next();
        }

        const clientIP = req.headers['cf-connecting-ip'] || 
                        req.headers['x-forwarded-for']?.split(',')[0] || 
                        req.connection.remoteAddress;

        if (!allowedIPs.includes(clientIP)) {
            return res.status(403).json({
                error: 'IP address not allowed',
                code: 'IP_NOT_ALLOWED'
            });
        }

        next();
    };
}

/**
 * Generate API key for user
 */
export async function generateAPIKey(userId, expiresInDays = 365) {
    try {
        const poolManager = getPoolManager();
        
        // Generate random API key
        const apiKey = crypto.randomBytes(32).toString('hex');
        const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');
        
        // Set expiration date
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);

        // Update user with new API key
        await poolManager.query(`
            UPDATE users 
            SET api_key_hash = $1, api_key_expires_at = $2
            WHERE id = $3
        `, [hashedKey, expiresAt, userId], { queryType: 'write' });

        return {
            apiKey,
            expiresAt: expiresAt.toISOString()
        };
    } catch (error) {
        console.error('API key generation error:', error);
        throw error;
    }
}

/**
 * Revoke API key for user
 */
export async function revokeAPIKey(userId) {
    try {
        const poolManager = getPoolManager();
        
        await poolManager.query(`
            UPDATE users 
            SET api_key_hash = NULL, api_key_expires_at = NULL
            WHERE id = $1
        `, [userId], { queryType: 'write' });

        return true;
    } catch (error) {
        console.error('API key revocation error:', error);
        throw error;
    }
}

/**
 * Generate JWT token for user
 */
export function generateJWT(user, expiresIn = '24h') {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
        throw new Error('JWT secret not configured');
    }

    const payload = {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role_name,
        permissions: user.permissions
    };

    return jwt.sign(payload, jwtSecret, { 
        expiresIn,
        issuer: 'taskmaster-api',
        audience: 'taskmaster-client'
    });
}

export default {
    validateCloudflareAccess,
    authenticateUser,
    authorizePermission,
    userRateLimit,
    ipWhitelist,
    generateAPIKey,
    revokeAPIKey,
    generateJWT
};

