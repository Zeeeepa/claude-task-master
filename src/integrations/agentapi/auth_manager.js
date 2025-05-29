/**
 * @fileoverview Authentication Manager
 * @description Handles authentication and authorization for AgentAPI access
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { EventEmitter } from 'events';

/**
 * Authentication Manager for AgentAPI
 */
export class AuthManager extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            jwtSecret: config.jwtSecret || process.env.JWT_SECRET || this._generateSecret(),
            jwtExpiresIn: config.jwtExpiresIn || '24h',
            apiKeyLength: config.apiKeyLength || 32,
            maxFailedAttempts: config.maxFailedAttempts || 5,
            lockoutDuration: config.lockoutDuration || 15 * 60 * 1000, // 15 minutes
            ...config
        };

        this.apiKeys = new Map();
        this.jwtTokens = new Map();
        this.failedAttempts = new Map();
        this.lockedAccounts = new Map();
    }

    /**
     * Generate API key for user
     */
    generateApiKey(userId, options = {}) {
        const apiKey = {
            key: this._generateSecureKey(),
            userId,
            permissions: options.permissions || ['read'],
            description: options.description || 'Generated API key',
            createdAt: new Date().toISOString(),
            expiresAt: options.expiresAt || null,
            isActive: true,
            lastUsed: null,
            usageCount: 0
        };

        this.apiKeys.set(apiKey.key, apiKey);
        
        this.emit('api_key_generated', {
            userId,
            keyId: apiKey.key.substring(0, 8) + '...',
            permissions: apiKey.permissions
        });

        return {
            key: apiKey.key,
            keyId: apiKey.key.substring(0, 8) + '...',
            permissions: apiKey.permissions,
            createdAt: apiKey.createdAt,
            expiresAt: apiKey.expiresAt
        };
    }

    /**
     * Validate API key
     */
    async validateApiKey(apiKey) {
        if (!apiKey) {
            throw new Error('API key is required');
        }

        const keyData = this.apiKeys.get(apiKey);
        if (!keyData) {
            this.emit('api_key_invalid', { key: apiKey.substring(0, 8) + '...' });
            throw new Error('Invalid API key');
        }

        if (!keyData.isActive) {
            this.emit('api_key_inactive', { userId: keyData.userId });
            throw new Error('API key is inactive');
        }

        if (keyData.expiresAt && new Date() > new Date(keyData.expiresAt)) {
            this.emit('api_key_expired', { userId: keyData.userId });
            throw new Error('API key has expired');
        }

        // Update usage statistics
        keyData.lastUsed = new Date().toISOString();
        keyData.usageCount++;

        this.emit('api_key_used', {
            userId: keyData.userId,
            permissions: keyData.permissions,
            usageCount: keyData.usageCount
        });

        return {
            userId: keyData.userId,
            permissions: keyData.permissions,
            isValid: true
        };
    }

    /**
     * Revoke API key
     */
    revokeApiKey(apiKey, reason = 'Manual revocation') {
        const keyData = this.apiKeys.get(apiKey);
        if (!keyData) {
            throw new Error('API key not found');
        }

        keyData.isActive = false;
        keyData.revokedAt = new Date().toISOString();
        keyData.revocationReason = reason;

        this.emit('api_key_revoked', {
            userId: keyData.userId,
            reason,
            revokedAt: keyData.revokedAt
        });

        return true;
    }

    /**
     * Generate JWT token
     */
    generateJWTToken(userId, permissions = [], options = {}) {
        const payload = {
            userId,
            permissions,
            type: 'access_token',
            iat: Math.floor(Date.now() / 1000)
        };

        const token = jwt.sign(payload, this.config.jwtSecret, {
            expiresIn: options.expiresIn || this.config.jwtExpiresIn,
            issuer: 'claude-task-master-agentapi',
            audience: 'agentapi-client'
        });

        const tokenData = {
            token,
            userId,
            permissions,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + this._parseExpiresIn(this.config.jwtExpiresIn)).toISOString(),
            isActive: true
        };

        this.jwtTokens.set(token, tokenData);

        this.emit('jwt_token_generated', {
            userId,
            permissions,
            expiresAt: tokenData.expiresAt
        });

        return {
            token,
            expiresAt: tokenData.expiresAt,
            permissions
        };
    }

    /**
     * Validate JWT token
     */
    async validateJWTToken(token) {
        if (!token) {
            throw new Error('JWT token is required');
        }

        try {
            const decoded = jwt.verify(token, this.config.jwtSecret, {
                issuer: 'claude-task-master-agentapi',
                audience: 'agentapi-client'
            });

            const tokenData = this.jwtTokens.get(token);
            if (!tokenData || !tokenData.isActive) {
                throw new Error('Token is inactive or revoked');
            }

            this.emit('jwt_token_used', {
                userId: decoded.userId,
                permissions: decoded.permissions
            });

            return {
                userId: decoded.userId,
                permissions: decoded.permissions,
                isValid: true,
                expiresAt: new Date(decoded.exp * 1000).toISOString()
            };
        } catch (error) {
            this.emit('jwt_token_invalid', { error: error.message });
            throw new Error(`Invalid JWT token: ${error.message}`);
        }
    }

    /**
     * Revoke JWT token
     */
    revokeJWTToken(token, reason = 'Manual revocation') {
        const tokenData = this.jwtTokens.get(token);
        if (!tokenData) {
            throw new Error('JWT token not found');
        }

        tokenData.isActive = false;
        tokenData.revokedAt = new Date().toISOString();
        tokenData.revocationReason = reason;

        this.emit('jwt_token_revoked', {
            userId: tokenData.userId,
            reason,
            revokedAt: tokenData.revokedAt
        });

        return true;
    }

    /**
     * Authenticate with username/password
     */
    async authenticateUser(username, password, options = {}) {
        const userId = username; // Simplified for this implementation

        // Check if account is locked
        if (this._isAccountLocked(userId)) {
            const lockInfo = this.lockedAccounts.get(userId);
            throw new Error(`Account locked until ${new Date(lockInfo.lockedUntil).toISOString()}`);
        }

        // Simulate password validation (in real implementation, use proper hashing)
        const isValidPassword = await this._validatePassword(username, password);
        
        if (!isValidPassword) {
            this._recordFailedAttempt(userId);
            throw new Error('Invalid credentials');
        }

        // Reset failed attempts on successful authentication
        this.failedAttempts.delete(userId);

        const permissions = options.permissions || ['read', 'write'];
        const tokenResult = this.generateJWTToken(userId, permissions);

        this.emit('user_authenticated', {
            userId,
            permissions,
            timestamp: new Date().toISOString()
        });

        return {
            userId,
            token: tokenResult.token,
            expiresAt: tokenResult.expiresAt,
            permissions
        };
    }

    /**
     * Check permissions for user
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
    getAuthStats() {
        const activeApiKeys = Array.from(this.apiKeys.values()).filter(key => key.isActive).length;
        const activeJWTTokens = Array.from(this.jwtTokens.values()).filter(token => token.isActive).length;
        const lockedAccounts = this.lockedAccounts.size;

        return {
            activeApiKeys,
            activeJWTTokens,
            lockedAccounts,
            totalApiKeys: this.apiKeys.size,
            totalJWTTokens: this.jwtTokens.size
        };
    }

    /**
     * Cleanup expired tokens and keys
     */
    cleanup() {
        const now = new Date();
        let cleanedCount = 0;

        // Cleanup expired API keys
        for (const [key, keyData] of this.apiKeys) {
            if (keyData.expiresAt && now > new Date(keyData.expiresAt)) {
                keyData.isActive = false;
                cleanedCount++;
            }
        }

        // Cleanup expired JWT tokens
        for (const [token, tokenData] of this.jwtTokens) {
            if (now > new Date(tokenData.expiresAt)) {
                tokenData.isActive = false;
                cleanedCount++;
            }
        }

        // Cleanup expired account locks
        for (const [userId, lockInfo] of this.lockedAccounts) {
            if (now > new Date(lockInfo.lockedUntil)) {
                this.lockedAccounts.delete(userId);
                this.failedAttempts.delete(userId);
            }
        }

        this.emit('cleanup_completed', { cleanedCount });
        return cleanedCount;
    }

    /**
     * Private methods
     */
    _generateSecret() {
        return crypto.randomBytes(64).toString('hex');
    }

    _generateSecureKey() {
        return crypto.randomBytes(this.config.apiKeyLength).toString('hex');
    }

    async _validatePassword(username, password) {
        // Simplified password validation
        // In real implementation, use proper password hashing (bcrypt, scrypt, etc.)
        return password && password.length >= 8;
    }

    _recordFailedAttempt(userId) {
        const attempts = this.failedAttempts.get(userId) || 0;
        const newAttempts = attempts + 1;
        
        this.failedAttempts.set(userId, newAttempts);

        if (newAttempts >= this.config.maxFailedAttempts) {
            const lockedUntil = Date.now() + this.config.lockoutDuration;
            this.lockedAccounts.set(userId, {
                lockedAt: new Date().toISOString(),
                lockedUntil,
                attempts: newAttempts
            });

            this.emit('account_locked', {
                userId,
                attempts: newAttempts,
                lockedUntil: new Date(lockedUntil).toISOString()
            });
        }

        this.emit('failed_attempt', {
            userId,
            attempts: newAttempts,
            maxAttempts: this.config.maxFailedAttempts
        });
    }

    _isAccountLocked(userId) {
        const lockInfo = this.lockedAccounts.get(userId);
        if (!lockInfo) return false;

        return Date.now() < lockInfo.lockedUntil;
    }

    _parseExpiresIn(expiresIn) {
        if (typeof expiresIn === 'number') {
            return expiresIn * 1000; // Convert seconds to milliseconds
        }

        const units = {
            's': 1000,
            'm': 60 * 1000,
            'h': 60 * 60 * 1000,
            'd': 24 * 60 * 60 * 1000
        };

        const match = expiresIn.match(/^(\d+)([smhd])$/);
        if (!match) {
            return 24 * 60 * 60 * 1000; // Default to 24 hours
        }

        const [, value, unit] = match;
        return parseInt(value) * units[unit];
    }
}

export default AuthManager;

