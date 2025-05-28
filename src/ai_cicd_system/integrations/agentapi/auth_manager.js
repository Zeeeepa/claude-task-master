/**
 * AgentAPI Authentication Manager
 * 
 * Handles authentication and authorization for secure API access to AgentAPI.
 * Supports API keys, JWT tokens, and session management.
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { SimpleLogger } from '../../utils/simple_logger.js';

export class AuthManager {
    constructor(options = {}) {
        this.config = {
            jwtSecret: options.jwtSecret || process.env.JWT_SECRET || this._generateSecret(),
            jwtExpiresIn: options.jwtExpiresIn || '24h',
            refreshTokenExpiresIn: options.refreshTokenExpiresIn || '7d',
            apiKeyPrefix: options.apiKeyPrefix || 'agentapi_',
            saltRounds: options.saltRounds || 12,
            maxLoginAttempts: options.maxLoginAttempts || 5,
            lockoutDuration: options.lockoutDuration || 15 * 60 * 1000, // 15 minutes
            ...options
        };

        this.logger = new SimpleLogger('AuthManager', options.logLevel || 'info');
        this.sessions = new Map();
        this.apiKeys = new Map();
        this.loginAttempts = new Map();
        this.refreshTokens = new Map();

        this._initializeDefaultCredentials();
    }

    /**
     * Generate a secure secret for JWT signing
     */
    _generateSecret() {
        return crypto.randomBytes(64).toString('hex');
    }

    /**
     * Initialize default credentials for development
     */
    _initializeDefaultCredentials() {
        // Create default API key for development
        if (process.env.NODE_ENV === 'development') {
            const defaultApiKey = this.generateApiKey('default', {
                permissions: ['read', 'write', 'admin'],
                description: 'Default development API key'
            });
            
            this.logger.info('Default API key created for development:', {
                apiKey: defaultApiKey.key,
                permissions: defaultApiKey.permissions
            });
        }
    }

    /**
     * Generate a new API key
     */
    generateApiKey(userId, options = {}) {
        const keyId = crypto.randomUUID();
        const keySecret = crypto.randomBytes(32).toString('hex');
        const apiKey = `${this.config.apiKeyPrefix}${keyId}_${keySecret}`;

        const keyData = {
            id: keyId,
            key: apiKey,
            userId,
            permissions: options.permissions || ['read'],
            description: options.description || '',
            createdAt: new Date(),
            lastUsed: null,
            isActive: true,
            expiresAt: options.expiresAt || null
        };

        this.apiKeys.set(apiKey, keyData);
        
        this.logger.info(`API key generated for user ${userId}`, {
            keyId,
            permissions: keyData.permissions
        });

        return keyData;
    }

    /**
     * Validate API key
     */
    async validateApiKey(apiKey) {
        try {
            if (!apiKey || !apiKey.startsWith(this.config.apiKeyPrefix)) {
                return { valid: false, reason: 'Invalid API key format' };
            }

            const keyData = this.apiKeys.get(apiKey);
            if (!keyData) {
                return { valid: false, reason: 'API key not found' };
            }

            if (!keyData.isActive) {
                return { valid: false, reason: 'API key is inactive' };
            }

            if (keyData.expiresAt && new Date() > keyData.expiresAt) {
                return { valid: false, reason: 'API key has expired' };
            }

            // Update last used timestamp
            keyData.lastUsed = new Date();

            return {
                valid: true,
                userId: keyData.userId,
                permissions: keyData.permissions,
                keyId: keyData.id
            };
        } catch (error) {
            this.logger.error('Error validating API key:', error);
            return { valid: false, reason: 'Validation error' };
        }
    }

    /**
     * Authenticate user with username/password
     */
    async authenticate(credentials) {
        try {
            const { username, password, apiKey } = credentials;

            // API key authentication
            if (apiKey) {
                const validation = await this.validateApiKey(apiKey);
                if (validation.valid) {
                    const token = this._generateJWT(validation.userId, validation.permissions);
                    const refreshToken = this._generateRefreshToken(validation.userId);

                    return {
                        success: true,
                        token,
                        refreshToken,
                        userId: validation.userId,
                        permissions: validation.permissions,
                        expiresIn: this.config.jwtExpiresIn
                    };
                } else {
                    return {
                        success: false,
                        message: validation.reason
                    };
                }
            }

            // Username/password authentication
            if (username && password) {
                // Check for rate limiting
                const attemptKey = `${username}:${this._getClientIP()}`;
                if (this._isRateLimited(attemptKey)) {
                    return {
                        success: false,
                        message: 'Too many login attempts. Please try again later.'
                    };
                }

                // Validate credentials (in production, this would check against a database)
                const user = await this._validateUserCredentials(username, password);
                if (!user) {
                    this._recordFailedAttempt(attemptKey);
                    return {
                        success: false,
                        message: 'Invalid username or password'
                    };
                }

                // Clear failed attempts on successful login
                this.loginAttempts.delete(attemptKey);

                const token = this._generateJWT(user.id, user.permissions);
                const refreshToken = this._generateRefreshToken(user.id);

                return {
                    success: true,
                    token,
                    refreshToken,
                    userId: user.id,
                    user: {
                        id: user.id,
                        username: user.username,
                        permissions: user.permissions
                    },
                    expiresIn: this.config.jwtExpiresIn
                };
            }

            return {
                success: false,
                message: 'Username and password or API key required'
            };

        } catch (error) {
            this.logger.error('Authentication error:', error);
            return {
                success: false,
                message: 'Authentication failed'
            };
        }
    }

    /**
     * Validate JWT token
     */
    async validateToken(token) {
        try {
            if (!token) {
                return { valid: false, reason: 'No token provided' };
            }

            // Remove 'Bearer ' prefix if present
            const cleanToken = token.replace(/^Bearer\s+/, '');

            const decoded = jwt.verify(cleanToken, this.config.jwtSecret);
            
            return {
                valid: true,
                userId: decoded.userId,
                permissions: decoded.permissions,
                iat: decoded.iat,
                exp: decoded.exp
            };
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return { valid: false, reason: 'Token expired' };
            } else if (error.name === 'JsonWebTokenError') {
                return { valid: false, reason: 'Invalid token' };
            } else {
                this.logger.error('Token validation error:', error);
                return { valid: false, reason: 'Token validation failed' };
            }
        }
    }

    /**
     * Refresh JWT token using refresh token
     */
    async refreshToken(refreshToken) {
        try {
            const tokenData = this.refreshTokens.get(refreshToken);
            if (!tokenData) {
                return {
                    success: false,
                    message: 'Invalid refresh token'
                };
            }

            if (new Date() > tokenData.expiresAt) {
                this.refreshTokens.delete(refreshToken);
                return {
                    success: false,
                    message: 'Refresh token expired'
                };
            }

            // Generate new tokens
            const newToken = this._generateJWT(tokenData.userId, tokenData.permissions);
            const newRefreshToken = this._generateRefreshToken(tokenData.userId);

            // Remove old refresh token
            this.refreshTokens.delete(refreshToken);

            return {
                success: true,
                token: newToken,
                refreshToken: newRefreshToken,
                expiresIn: this.config.jwtExpiresIn
            };
        } catch (error) {
            this.logger.error('Token refresh error:', error);
            return {
                success: false,
                message: 'Token refresh failed'
            };
        }
    }

    /**
     * Generate JWT token
     */
    _generateJWT(userId, permissions = []) {
        const payload = {
            userId,
            permissions,
            iat: Math.floor(Date.now() / 1000)
        };

        return jwt.sign(payload, this.config.jwtSecret, {
            expiresIn: this.config.jwtExpiresIn
        });
    }

    /**
     * Generate refresh token
     */
    _generateRefreshToken(userId) {
        const refreshToken = crypto.randomBytes(64).toString('hex');
        const expiresAt = new Date();
        expiresAt.setTime(expiresAt.getTime() + this._parseTimeToMs(this.config.refreshTokenExpiresIn));

        this.refreshTokens.set(refreshToken, {
            userId,
            expiresAt,
            createdAt: new Date()
        });

        return refreshToken;
    }

    /**
     * Validate user credentials (mock implementation)
     */
    async _validateUserCredentials(username, password) {
        // In production, this would query a database
        const mockUsers = {
            'admin': {
                id: 'admin',
                username: 'admin',
                passwordHash: await bcrypt.hash('admin123', this.config.saltRounds),
                permissions: ['read', 'write', 'admin']
            },
            'user': {
                id: 'user',
                username: 'user',
                passwordHash: await bcrypt.hash('user123', this.config.saltRounds),
                permissions: ['read', 'write']
            }
        };

        const user = mockUsers[username];
        if (!user) {
            return null;
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);
        return isValid ? user : null;
    }

    /**
     * Check if client is rate limited
     */
    _isRateLimited(attemptKey) {
        const attempts = this.loginAttempts.get(attemptKey);
        if (!attempts) {
            return false;
        }

        if (attempts.count >= this.config.maxLoginAttempts) {
            const timeSinceLastAttempt = Date.now() - attempts.lastAttempt;
            return timeSinceLastAttempt < this.config.lockoutDuration;
        }

        return false;
    }

    /**
     * Record failed login attempt
     */
    _recordFailedAttempt(attemptKey) {
        const attempts = this.loginAttempts.get(attemptKey) || { count: 0, lastAttempt: 0 };
        attempts.count++;
        attempts.lastAttempt = Date.now();
        this.loginAttempts.set(attemptKey, attempts);
    }

    /**
     * Get client IP (mock implementation)
     */
    _getClientIP() {
        // In a real implementation, this would extract IP from request
        return '127.0.0.1';
    }

    /**
     * Parse time string to milliseconds
     */
    _parseTimeToMs(timeStr) {
        const units = {
            's': 1000,
            'm': 60 * 1000,
            'h': 60 * 60 * 1000,
            'd': 24 * 60 * 60 * 1000
        };

        const match = timeStr.match(/^(\d+)([smhd])$/);
        if (!match) {
            throw new Error(`Invalid time format: ${timeStr}`);
        }

        const [, value, unit] = match;
        return parseInt(value) * units[unit];
    }

    /**
     * Revoke API key
     */
    revokeApiKey(apiKey) {
        const keyData = this.apiKeys.get(apiKey);
        if (keyData) {
            keyData.isActive = false;
            this.logger.info(`API key revoked: ${keyData.id}`);
            return true;
        }
        return false;
    }

    /**
     * List API keys for user
     */
    listApiKeys(userId) {
        const userKeys = [];
        for (const [key, data] of this.apiKeys.entries()) {
            if (data.userId === userId) {
                userKeys.push({
                    id: data.id,
                    description: data.description,
                    permissions: data.permissions,
                    createdAt: data.createdAt,
                    lastUsed: data.lastUsed,
                    isActive: data.isActive,
                    expiresAt: data.expiresAt
                });
            }
        }
        return userKeys;
    }

    /**
     * Check if user has permission
     */
    hasPermission(userPermissions, requiredPermission) {
        if (!Array.isArray(userPermissions)) {
            return false;
        }
        
        return userPermissions.includes(requiredPermission) || userPermissions.includes('admin');
    }

    /**
     * Get authentication statistics
     */
    getStats() {
        return {
            totalApiKeys: this.apiKeys.size,
            activeApiKeys: Array.from(this.apiKeys.values()).filter(k => k.isActive).length,
            totalSessions: this.sessions.size,
            failedAttempts: this.loginAttempts.size,
            refreshTokens: this.refreshTokens.size
        };
    }
}

export default AuthManager;

