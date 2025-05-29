/**
 * Unified Authentication Manager
 * 
 * Consolidates JWT, API key, and session-based authentication into a single,
 * comprehensive authentication service. Eliminates duplication between PRs #77 and #84.
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { EventEmitter } from 'events';

export class AuthenticationManager extends EventEmitter {
    constructor(config, encryptionService, auditLogger) {
        super();
        
        this.config = config;
        this.encryptionService = encryptionService;
        this.auditLogger = auditLogger;
        
        // Authentication providers
        this.providers = new Map();
        
        // Token storage (in-memory cache with optional persistence)
        this.tokenStore = new Map();
        this.refreshTokenStore = new Map();
        this.apiKeyStore = new Map();
        this.sessionStore = new Map();
        
        // Rate limiting
        this.rateLimitStore = new Map();
        
        this.initialized = false;
    }

    /**
     * Initialize authentication manager
     */
    async initialize() {
        try {
            // Initialize JWT provider
            if (this.config.jwt?.secret) {
                await this._initializeJWTProvider();
            }
            
            // Initialize API key provider
            if (this.config.apiKeys?.enabled) {
                await this._initializeAPIKeyProvider();
            }
            
            // Initialize session provider
            if (this.config.sessions?.enabled) {
                await this._initializeSessionProvider();
            }
            
            // Initialize OAuth providers
            if (this.config.oauth?.enabled) {
                await this._initializeOAuthProviders();
            }
            
            this.initialized = true;
            this.emit('initialized');
            
            if (this.auditLogger) {
                await this.auditLogger.logSecurityEvent('AUTH_MANAGER_INITIALIZED', {
                    providers: Array.from(this.providers.keys())
                });
            }
            
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Initialize JWT authentication provider
     */
    async _initializeJWTProvider() {
        const jwtConfig = this.config.jwt;
        
        // Validate JWT configuration
        if (!jwtConfig.secret) {
            throw new Error('JWT secret is required');
        }
        
        if (jwtConfig.secret.length < 32) {
            console.warn('JWT secret should be at least 32 characters for security');
        }
        
        this.providers.set('jwt', {
            type: 'jwt',
            config: jwtConfig,
            authenticate: this._authenticateJWT.bind(this),
            generateToken: this._generateJWT.bind(this),
            refreshToken: this._refreshJWT.bind(this),
            revokeToken: this._revokeJWT.bind(this)
        });
    }

    /**
     * Initialize API key authentication provider
     */
    async _initializeAPIKeyProvider() {
        const apiKeyConfig = this.config.apiKeys;
        
        this.providers.set('apikey', {
            type: 'apikey',
            config: apiKeyConfig,
            authenticate: this._authenticateAPIKey.bind(this),
            generateKey: this._generateAPIKey.bind(this),
            revokeKey: this._revokeAPIKey.bind(this),
            listKeys: this._listAPIKeys.bind(this)
        });
    }

    /**
     * Initialize session authentication provider
     */
    async _initializeSessionProvider() {
        const sessionConfig = this.config.sessions;
        
        this.providers.set('session', {
            type: 'session',
            config: sessionConfig,
            authenticate: this._authenticateSession.bind(this),
            createSession: this._createSession.bind(this),
            destroySession: this._destroySession.bind(this),
            refreshSession: this._refreshSession.bind(this)
        });
    }

    /**
     * Initialize OAuth providers
     */
    async _initializeOAuthProviders() {
        const oauthConfig = this.config.oauth;
        
        for (const [providerName, providerConfig] of Object.entries(oauthConfig.providers)) {
            this.providers.set(`oauth_${providerName}`, {
                type: 'oauth',
                provider: providerName,
                config: providerConfig,
                authenticate: this._authenticateOAuth.bind(this, providerName)
            });
        }
    }

    /**
     * Authenticate using any available method
     */
    async authenticate(credentials, method = 'auto') {
        if (!this.initialized) {
            throw new Error('Authentication manager not initialized');
        }

        try {
            // Auto-detect authentication method if not specified
            if (method === 'auto') {
                method = this._detectAuthMethod(credentials);
            }

            // Check rate limiting
            if (await this._isRateLimited(credentials)) {
                throw new Error('Rate limit exceeded');
            }

            let result;
            
            switch (method) {
                case 'jwt':
                    result = await this._authenticateJWT(credentials);
                    break;
                case 'apikey':
                    result = await this._authenticateAPIKey(credentials);
                    break;
                case 'session':
                    result = await this._authenticateSession(credentials);
                    break;
                case 'oauth':
                    result = await this._authenticateOAuth(credentials.provider, credentials);
                    break;
                default:
                    throw new Error(`Unsupported authentication method: ${method}`);
            }

            // Log successful authentication
            if (this.auditLogger && result.success) {
                await this.auditLogger.logSecurityEvent('AUTHENTICATION_SUCCESS', {
                    method,
                    userId: result.user?.id,
                    timestamp: new Date().toISOString()
                });
            }

            return result;

        } catch (error) {
            // Log failed authentication
            if (this.auditLogger) {
                await this.auditLogger.logSecurityEvent('AUTHENTICATION_FAILED', {
                    method,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }

            throw error;
        }
    }

    /**
     * JWT Authentication
     */
    async _authenticateJWT(credentials) {
        const { token } = credentials;
        
        if (!token) {
            throw new Error('JWT token is required');
        }

        try {
            const decoded = jwt.verify(token, this.config.jwt.secret, {
                issuer: this.config.jwt.issuer,
                audience: this.config.jwt.audience,
                algorithms: [this.config.jwt.algorithm],
                clockTolerance: this.config.jwt.clockTolerance || 30
            });

            // Check if token is revoked
            if (this.tokenStore.has(token) && this.tokenStore.get(token).revoked) {
                throw new Error('Token has been revoked');
            }

            return {
                success: true,
                method: 'jwt',
                user: decoded,
                token: token,
                expiresAt: new Date(decoded.exp * 1000)
            };

        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new Error('JWT token has expired');
            } else if (error.name === 'JsonWebTokenError') {
                throw new Error('Invalid JWT token');
            }
            throw error;
        }
    }

    /**
     * Generate JWT token
     */
    async _generateJWT(payload, options = {}) {
        const jwtConfig = this.config.jwt;
        
        const tokenPayload = {
            ...payload,
            iss: jwtConfig.issuer,
            aud: jwtConfig.audience,
            iat: Math.floor(Date.now() / 1000),
            jti: crypto.randomUUID()
        };

        const tokenOptions = {
            algorithm: jwtConfig.algorithm,
            expiresIn: options.expiresIn || jwtConfig.accessTokenExpiry,
            ...options
        };

        const accessToken = jwt.sign(tokenPayload, jwtConfig.secret, tokenOptions);
        
        // Generate refresh token
        const refreshToken = crypto.randomBytes(32).toString('hex');
        const refreshTokenExpiry = new Date(Date.now() + this._parseExpiry(jwtConfig.refreshTokenExpiry));
        
        // Store tokens
        this.tokenStore.set(accessToken, {
            payload: tokenPayload,
            createdAt: new Date(),
            revoked: false
        });
        
        this.refreshTokenStore.set(refreshToken, {
            userId: payload.sub || payload.userId,
            accessToken,
            expiresAt: refreshTokenExpiry,
            revoked: false
        });

        return {
            accessToken,
            refreshToken,
            tokenType: 'Bearer',
            expiresIn: this._parseExpiry(tokenOptions.expiresIn),
            expiresAt: new Date(Date.now() + this._parseExpiry(tokenOptions.expiresIn))
        };
    }

    /**
     * Refresh JWT token
     */
    async _refreshJWT(refreshToken) {
        const refreshData = this.refreshTokenStore.get(refreshToken);
        
        if (!refreshData || refreshData.revoked) {
            throw new Error('Invalid refresh token');
        }
        
        if (refreshData.expiresAt < new Date()) {
            throw new Error('Refresh token has expired');
        }

        // Revoke old tokens
        this.tokenStore.set(refreshData.accessToken, {
            ...this.tokenStore.get(refreshData.accessToken),
            revoked: true
        });
        this.refreshTokenStore.set(refreshToken, {
            ...refreshData,
            revoked: true
        });

        // Generate new tokens
        const payload = { sub: refreshData.userId };
        return await this._generateJWT(payload);
    }

    /**
     * Revoke JWT token
     */
    async _revokeJWT(token) {
        if (this.tokenStore.has(token)) {
            this.tokenStore.set(token, {
                ...this.tokenStore.get(token),
                revoked: true,
                revokedAt: new Date()
            });
        }
        
        // Find and revoke associated refresh token
        for (const [refreshToken, data] of this.refreshTokenStore) {
            if (data.accessToken === token) {
                this.refreshTokenStore.set(refreshToken, {
                    ...data,
                    revoked: true,
                    revokedAt: new Date()
                });
                break;
            }
        }
    }

    /**
     * API Key Authentication
     */
    async _authenticateAPIKey(credentials) {
        const { apiKey } = credentials;
        
        if (!apiKey) {
            throw new Error('API key is required');
        }

        // Hash the provided key for comparison
        const hashedKey = crypto.createHash(this.config.apiKeys.hashAlgorithm).update(apiKey).digest('hex');
        
        // Find matching API key
        for (const [keyId, keyData] of this.apiKeyStore) {
            if (keyData.hashedKey === hashedKey && !keyData.revoked) {
                // Check expiration
                if (keyData.expiresAt && keyData.expiresAt < new Date()) {
                    throw new Error('API key has expired');
                }

                // Update last used
                keyData.lastUsed = new Date();
                keyData.usageCount = (keyData.usageCount || 0) + 1;

                return {
                    success: true,
                    method: 'apikey',
                    user: keyData.user,
                    keyId: keyId,
                    permissions: keyData.permissions || []
                };
            }
        }

        throw new Error('Invalid API key');
    }

    /**
     * Generate API key
     */
    async _generateAPIKey(userId, options = {}) {
        const keyLength = this.config.apiKeys.keyLength || 32;
        const apiKey = crypto.randomBytes(keyLength).toString('hex');
        const hashedKey = crypto.createHash(this.config.apiKeys.hashAlgorithm).update(apiKey).digest('hex');
        const keyId = crypto.randomUUID();

        const keyData = {
            keyId,
            hashedKey,
            user: { id: userId },
            permissions: options.permissions || [],
            createdAt: new Date(),
            expiresAt: options.expiresAt,
            revoked: false,
            usageCount: 0,
            lastUsed: null,
            name: options.name || 'API Key',
            description: options.description
        };

        this.apiKeyStore.set(keyId, keyData);

        return {
            keyId,
            apiKey, // Only returned once
            name: keyData.name,
            permissions: keyData.permissions,
            createdAt: keyData.createdAt,
            expiresAt: keyData.expiresAt
        };
    }

    /**
     * Revoke API key
     */
    async _revokeAPIKey(keyId) {
        if (this.apiKeyStore.has(keyId)) {
            this.apiKeyStore.set(keyId, {
                ...this.apiKeyStore.get(keyId),
                revoked: true,
                revokedAt: new Date()
            });
            return true;
        }
        return false;
    }

    /**
     * List API keys for a user
     */
    async _listAPIKeys(userId) {
        const userKeys = [];
        
        for (const [keyId, keyData] of this.apiKeyStore) {
            if (keyData.user.id === userId && !keyData.revoked) {
                userKeys.push({
                    keyId,
                    name: keyData.name,
                    permissions: keyData.permissions,
                    createdAt: keyData.createdAt,
                    expiresAt: keyData.expiresAt,
                    lastUsed: keyData.lastUsed,
                    usageCount: keyData.usageCount
                });
            }
        }
        
        return userKeys;
    }

    /**
     * Session Authentication
     */
    async _authenticateSession(credentials) {
        const { sessionId } = credentials;
        
        if (!sessionId) {
            throw new Error('Session ID is required');
        }

        const sessionData = this.sessionStore.get(sessionId);
        
        if (!sessionData || sessionData.revoked) {
            throw new Error('Invalid session');
        }
        
        if (sessionData.expiresAt < new Date()) {
            throw new Error('Session has expired');
        }

        // Update last accessed
        sessionData.lastAccessed = new Date();

        return {
            success: true,
            method: 'session',
            user: sessionData.user,
            sessionId: sessionId,
            expiresAt: sessionData.expiresAt
        };
    }

    /**
     * Create session
     */
    async _createSession(user, options = {}) {
        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + (this.config.sessions.maxAge || 24 * 60 * 60 * 1000));

        const sessionData = {
            sessionId,
            user,
            createdAt: new Date(),
            lastAccessed: new Date(),
            expiresAt,
            revoked: false,
            ipAddress: options.ipAddress,
            userAgent: options.userAgent
        };

        this.sessionStore.set(sessionId, sessionData);

        return {
            sessionId,
            expiresAt,
            user
        };
    }

    /**
     * Destroy session
     */
    async _destroySession(sessionId) {
        if (this.sessionStore.has(sessionId)) {
            this.sessionStore.set(sessionId, {
                ...this.sessionStore.get(sessionId),
                revoked: true,
                revokedAt: new Date()
            });
            return true;
        }
        return false;
    }

    /**
     * Refresh session
     */
    async _refreshSession(sessionId) {
        const sessionData = this.sessionStore.get(sessionId);
        
        if (!sessionData || sessionData.revoked) {
            throw new Error('Invalid session');
        }

        // Extend expiration
        sessionData.expiresAt = new Date(Date.now() + this.config.sessions.maxAge);
        sessionData.lastAccessed = new Date();

        return {
            sessionId,
            expiresAt: sessionData.expiresAt,
            user: sessionData.user
        };
    }

    /**
     * OAuth Authentication (placeholder for future implementation)
     */
    async _authenticateOAuth(provider, credentials) {
        throw new Error('OAuth authentication not yet implemented');
    }

    /**
     * Detect authentication method from credentials
     */
    _detectAuthMethod(credentials) {
        if (credentials.token) return 'jwt';
        if (credentials.apiKey) return 'apikey';
        if (credentials.sessionId) return 'session';
        if (credentials.provider) return 'oauth';
        
        throw new Error('Unable to detect authentication method');
    }

    /**
     * Check rate limiting
     */
    async _isRateLimited(credentials) {
        // Simple in-memory rate limiting
        const identifier = credentials.apiKey || credentials.sessionId || credentials.token || 'anonymous';
        const now = Date.now();
        const windowMs = this.config.apiKeys?.rateLimiting?.windowMs || 15 * 60 * 1000;
        const maxRequests = this.config.apiKeys?.rateLimiting?.maxRequests || 1000;

        if (!this.rateLimitStore.has(identifier)) {
            this.rateLimitStore.set(identifier, { count: 1, resetTime: now + windowMs });
            return false;
        }

        const limitData = this.rateLimitStore.get(identifier);
        
        if (now > limitData.resetTime) {
            limitData.count = 1;
            limitData.resetTime = now + windowMs;
            return false;
        }

        if (limitData.count >= maxRequests) {
            return true;
        }

        limitData.count++;
        return false;
    }

    /**
     * Parse expiry string to milliseconds
     */
    _parseExpiry(expiry) {
        if (typeof expiry === 'number') return expiry;
        
        const units = {
            's': 1000,
            'm': 60 * 1000,
            'h': 60 * 60 * 1000,
            'd': 24 * 60 * 60 * 1000
        };
        
        const match = expiry.match(/^(\d+)([smhd])$/);
        if (match) {
            return parseInt(match[1]) * units[match[2]];
        }
        
        throw new Error(`Invalid expiry format: ${expiry}`);
    }

    /**
     * Health check
     */
    async healthCheck() {
        return {
            status: 'ok',
            providers: Array.from(this.providers.keys()),
            tokenCount: this.tokenStore.size,
            sessionCount: this.sessionStore.size,
            apiKeyCount: this.apiKeyStore.size
        };
    }

    /**
     * Shutdown
     */
    async shutdown() {
        this.tokenStore.clear();
        this.refreshTokenStore.clear();
        this.apiKeyStore.clear();
        this.sessionStore.clear();
        this.rateLimitStore.clear();
        this.providers.clear();
        this.initialized = false;
    }
}

export default AuthenticationManager;

