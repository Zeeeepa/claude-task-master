/**
 * Enterprise Authentication Manager
 * Handles multi-factor authentication, JWT tokens, and OAuth2 flows
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { AuditLogger } from './audit_logger.js';
import { EncryptionService } from './encryption_service.js';

export class AuthManager extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            jwtSecret: config.jwtSecret || process.env.JWT_SECRET || this.generateSecureSecret(),
            jwtExpiresIn: config.jwtExpiresIn || '24h',
            refreshTokenExpiresIn: config.refreshTokenExpiresIn || '7d',
            bcryptRounds: config.bcryptRounds || 12,
            mfaRequired: config.mfaRequired || false,
            sessionTimeout: config.sessionTimeout || 30 * 60 * 1000, // 30 minutes
            maxLoginAttempts: config.maxLoginAttempts || 5,
            lockoutDuration: config.lockoutDuration || 15 * 60 * 1000, // 15 minutes
            ...config
        };

        this.auditLogger = new AuditLogger();
        this.encryptionService = new EncryptionService();
        this.activeSessions = new Map();
        this.loginAttempts = new Map();
        this.refreshTokens = new Map();
        
        // Start session cleanup interval
        this.startSessionCleanup();
    }

    /**
     * Generate a cryptographically secure secret
     */
    generateSecureSecret() {
        return crypto.randomBytes(64).toString('hex');
    }

    /**
     * Authenticate user with username/password
     */
    async authenticate(username, password, mfaToken = null, clientInfo = {}) {
        try {
            const attemptKey = `${username}:${clientInfo.ip || 'unknown'}`;
            
            // Check for account lockout
            if (this.isAccountLocked(attemptKey)) {
                await this.auditLogger.logSecurityEvent('AUTH_ATTEMPT_LOCKED', {
                    username,
                    clientInfo,
                    reason: 'Account locked due to excessive failed attempts'
                });
                throw new Error('Account temporarily locked due to excessive failed login attempts');
            }

            // Validate credentials (this would typically query a database)
            const user = await this.validateCredentials(username, password);
            if (!user) {
                this.recordFailedAttempt(attemptKey);
                await this.auditLogger.logSecurityEvent('AUTH_FAILED', {
                    username,
                    clientInfo,
                    reason: 'Invalid credentials'
                });
                throw new Error('Invalid credentials');
            }

            // Check MFA if required
            if (this.config.mfaRequired || user.mfaEnabled) {
                if (!mfaToken) {
                    throw new Error('MFA token required');
                }
                
                const mfaValid = await this.validateMFA(user.id, mfaToken);
                if (!mfaValid) {
                    this.recordFailedAttempt(attemptKey);
                    await this.auditLogger.logSecurityEvent('MFA_FAILED', {
                        username,
                        userId: user.id,
                        clientInfo
                    });
                    throw new Error('Invalid MFA token');
                }
            }

            // Clear failed attempts on successful login
            this.loginAttempts.delete(attemptKey);

            // Generate tokens
            const tokens = await this.generateTokens(user);
            
            // Create session
            const session = this.createSession(user, clientInfo);
            
            await this.auditLogger.logSecurityEvent('AUTH_SUCCESS', {
                username,
                userId: user.id,
                sessionId: session.id,
                clientInfo
            });

            this.emit('userAuthenticated', { user, session, tokens });

            return {
                user: this.sanitizeUser(user),
                tokens,
                session: {
                    id: session.id,
                    expiresAt: session.expiresAt
                }
            };

        } catch (error) {
            this.emit('authenticationFailed', { username, error: error.message });
            throw error;
        }
    }

    /**
     * Validate user credentials
     */
    async validateCredentials(username, password) {
        // This would typically query your user database
        // For demo purposes, we'll simulate a user lookup
        const users = await this.getUserStore();
        const user = users.find(u => u.username === username);
        
        if (!user) {
            return null;
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);
        return isValid ? user : null;
    }

    /**
     * Generate JWT and refresh tokens
     */
    async generateTokens(user) {
        const payload = {
            userId: user.id,
            username: user.username,
            roles: user.roles || [],
            permissions: user.permissions || [],
            iat: Math.floor(Date.now() / 1000)
        };

        const accessToken = jwt.sign(payload, this.config.jwtSecret, {
            expiresIn: this.config.jwtExpiresIn,
            issuer: 'ai-cicd-system',
            audience: 'ai-cicd-api'
        });

        const refreshToken = this.generateRefreshToken();
        const refreshTokenExpiry = new Date(Date.now() + this.parseTimeToMs(this.config.refreshTokenExpiresIn));
        
        // Store refresh token
        this.refreshTokens.set(refreshToken, {
            userId: user.id,
            expiresAt: refreshTokenExpiry,
            createdAt: new Date()
        });

        return {
            accessToken,
            refreshToken,
            expiresIn: this.parseTimeToMs(this.config.jwtExpiresIn) / 1000,
            tokenType: 'Bearer'
        };
    }

    /**
     * Refresh access token using refresh token
     */
    async refreshAccessToken(refreshToken) {
        const tokenData = this.refreshTokens.get(refreshToken);
        
        if (!tokenData || tokenData.expiresAt < new Date()) {
            this.refreshTokens.delete(refreshToken);
            throw new Error('Invalid or expired refresh token');
        }

        const users = await this.getUserStore();
        const user = users.find(u => u.id === tokenData.userId);
        
        if (!user) {
            this.refreshTokens.delete(refreshToken);
            throw new Error('User not found');
        }

        // Generate new tokens
        const tokens = await this.generateTokens(user);
        
        // Remove old refresh token and store new one
        this.refreshTokens.delete(refreshToken);

        await this.auditLogger.logSecurityEvent('TOKEN_REFRESHED', {
            userId: user.id,
            username: user.username
        });

        return tokens;
    }

    /**
     * Verify JWT token
     */
    async verifyToken(token) {
        try {
            const decoded = jwt.verify(token, this.config.jwtSecret, {
                issuer: 'ai-cicd-system',
                audience: 'ai-cicd-api'
            });

            // Check if session is still active
            const session = this.getActiveSession(decoded.userId);
            if (!session) {
                throw new Error('Session expired');
            }

            return decoded;
        } catch (error) {
            await this.auditLogger.logSecurityEvent('TOKEN_VERIFICATION_FAILED', {
                error: error.message,
                token: token.substring(0, 20) + '...'
            });
            throw new Error('Invalid token');
        }
    }

    /**
     * Validate MFA token
     */
    async validateMFA(userId, token) {
        // This would integrate with your MFA provider (TOTP, SMS, etc.)
        // For demo purposes, we'll simulate MFA validation
        const users = await this.getUserStore();
        const user = users.find(u => u.id === userId);
        
        if (!user || !user.mfaSecret) {
            return false;
        }

        // In a real implementation, you'd use a library like speakeasy for TOTP
        // or integrate with SMS/email providers
        return this.validateTOTP(user.mfaSecret, token);
    }

    /**
     * Create user session
     */
    createSession(user, clientInfo) {
        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + this.config.sessionTimeout);
        
        const session = {
            id: sessionId,
            userId: user.id,
            username: user.username,
            createdAt: new Date(),
            expiresAt,
            lastActivity: new Date(),
            clientInfo: {
                ip: clientInfo.ip,
                userAgent: clientInfo.userAgent,
                fingerprint: clientInfo.fingerprint
            }
        };

        this.activeSessions.set(sessionId, session);
        return session;
    }

    /**
     * Get active session
     */
    getActiveSession(userId) {
        for (const [sessionId, session] of this.activeSessions) {
            if (session.userId === userId && session.expiresAt > new Date()) {
                return session;
            }
        }
        return null;
    }

    /**
     * Logout user and invalidate session
     */
    async logout(sessionId, userId) {
        const session = this.activeSessions.get(sessionId);
        if (session && session.userId === userId) {
            this.activeSessions.delete(sessionId);
            
            await this.auditLogger.logSecurityEvent('USER_LOGOUT', {
                userId,
                sessionId,
                username: session.username
            });

            this.emit('userLoggedOut', { userId, sessionId });
            return true;
        }
        return false;
    }

    /**
     * Check if account is locked
     */
    isAccountLocked(attemptKey) {
        const attempts = this.loginAttempts.get(attemptKey);
        if (!attempts) return false;

        const now = Date.now();
        const recentAttempts = attempts.filter(time => now - time < this.config.lockoutDuration);
        
        return recentAttempts.length >= this.config.maxLoginAttempts;
    }

    /**
     * Record failed login attempt
     */
    recordFailedAttempt(attemptKey) {
        const attempts = this.loginAttempts.get(attemptKey) || [];
        attempts.push(Date.now());
        this.loginAttempts.set(attemptKey, attempts);
    }

    /**
     * Generate refresh token
     */
    generateRefreshToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Validate TOTP token
     */
    validateTOTP(secret, token) {
        // Simplified TOTP validation - in production use speakeasy or similar
        const window = Math.floor(Date.now() / 30000);
        const expectedToken = crypto.createHmac('sha1', secret)
            .update(window.toString())
            .digest('hex')
            .slice(-6);
        
        return token === expectedToken;
    }

    /**
     * Parse time string to milliseconds
     */
    parseTimeToMs(timeStr) {
        const units = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
        const match = timeStr.match(/^(\d+)([smhd])$/);
        if (!match) return 3600000; // Default 1 hour
        return parseInt(match[1]) * units[match[2]];
    }

    /**
     * Sanitize user object for client response
     */
    sanitizeUser(user) {
        const { passwordHash, mfaSecret, ...sanitized } = user;
        return sanitized;
    }

    /**
     * Start session cleanup interval
     */
    startSessionCleanup() {
        setInterval(() => {
            const now = new Date();
            for (const [sessionId, session] of this.activeSessions) {
                if (session.expiresAt < now) {
                    this.activeSessions.delete(sessionId);
                }
            }

            // Clean up old refresh tokens
            for (const [token, data] of this.refreshTokens) {
                if (data.expiresAt < now) {
                    this.refreshTokens.delete(token);
                }
            }
        }, 5 * 60 * 1000); // Clean up every 5 minutes
    }

    /**
     * Get user store (mock implementation)
     */
    async getUserStore() {
        // This would typically be a database query
        return [
            {
                id: '1',
                username: 'admin',
                passwordHash: await bcrypt.hash('admin123', this.config.bcryptRounds),
                roles: ['admin', 'user'],
                permissions: ['read', 'write', 'admin'],
                mfaEnabled: true,
                mfaSecret: 'JBSWY3DPEHPK3PXP'
            },
            {
                id: '2',
                username: 'developer',
                passwordHash: await bcrypt.hash('dev123', this.config.bcryptRounds),
                roles: ['developer', 'user'],
                permissions: ['read', 'write'],
                mfaEnabled: false
            }
        ];
    }

    /**
     * Create API key for service-to-service authentication
     */
    async createApiKey(userId, name, permissions = [], expiresIn = '1y') {
        const apiKey = 'ak_' + crypto.randomBytes(32).toString('hex');
        const hashedKey = await bcrypt.hash(apiKey, 10);
        
        const keyData = {
            id: crypto.randomUUID(),
            userId,
            name,
            hashedKey,
            permissions,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + this.parseTimeToMs(expiresIn)),
            lastUsed: null
        };

        // In production, store this in database
        await this.auditLogger.logSecurityEvent('API_KEY_CREATED', {
            userId,
            keyId: keyData.id,
            name,
            permissions
        });

        return {
            id: keyData.id,
            apiKey, // Only returned once
            name,
            permissions,
            expiresAt: keyData.expiresAt
        };
    }

    /**
     * Validate API key
     */
    async validateApiKey(apiKey) {
        // In production, query database for API keys
        // For demo, we'll simulate validation
        if (!apiKey.startsWith('ak_')) {
            return null;
        }

        // This would be a database lookup in production
        return {
            id: '1',
            userId: '1',
            permissions: ['read', 'write'],
            name: 'Service Key'
        };
    }
}

export default AuthManager;

