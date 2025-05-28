/**
 * JWT Manager
 * 
 * Handles JWT token generation, validation, and refresh for the AI CI/CD system.
 * Provides enterprise-grade token management with security best practices.
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { SimpleLogger } from '../utils/simple_logger.js';

export class JWTManager {
    constructor(config, database) {
        this.config = {
            jwt_secret: config.jwt_secret || process.env.JWT_SECRET || this._generateSecret(),
            issuer: config.issuer || 'ai-cicd-system',
            audience: config.audience || 'ai-cicd-users',
            token_expiry: config.token_expiry || '1h',
            refresh_token_expiry: config.refresh_token_expiry || '7d',
            algorithm: config.algorithm || 'HS256',
            ...config
        };

        this.db = database;
        this.logger = new SimpleLogger('JWTManager');

        // Validate configuration
        this._validateConfig();
    }

    /**
     * Generate a secure secret if none provided
     */
    _generateSecret() {
        const secret = crypto.randomBytes(64).toString('hex');
        this.logger.warn('Using generated JWT secret. Set JWT_SECRET environment variable for production.');
        return secret;
    }

    /**
     * Validate JWT configuration
     */
    _validateConfig() {
        if (!this.config.jwt_secret) {
            throw new Error('JWT secret is required');
        }

        if (this.config.jwt_secret.length < 32) {
            this.logger.warn('JWT secret should be at least 32 characters long for security');
        }

        const validAlgorithms = ['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512'];
        if (!validAlgorithms.includes(this.config.algorithm)) {
            throw new Error(`Invalid JWT algorithm: ${this.config.algorithm}`);
        }
    }

    /**
     * Generate JWT access token
     */
    generateToken(payload, options = {}) {
        try {
            const now = Math.floor(Date.now() / 1000);
            
            const tokenPayload = {
                ...payload,
                iss: this.config.issuer,
                aud: this.config.audience,
                iat: now,
                jti: crypto.randomUUID() // Unique token ID for revocation
            };

            const tokenOptions = {
                expiresIn: options.expiresIn || this.config.token_expiry,
                algorithm: this.config.algorithm
            };

            const token = jwt.sign(tokenPayload, this.config.jwt_secret, tokenOptions);
            
            this.logger.debug(`JWT token generated for user: ${payload.sub}`);
            
            return {
                token,
                expiresIn: tokenOptions.expiresIn,
                tokenId: tokenPayload.jti
            };
        } catch (error) {
            this.logger.error('Token generation failed:', error);
            throw new Error('Failed to generate JWT token');
        }
    }

    /**
     * Validate JWT token
     */
    async validateToken(token) {
        try {
            // Check if token is revoked
            const isRevoked = await this._isTokenRevoked(token);
            if (isRevoked) {
                return { 
                    valid: false, 
                    error: 'Token has been revoked',
                    code: 'TOKEN_REVOKED'
                };
            }

            const decoded = jwt.verify(token, this.config.jwt_secret, {
                issuer: this.config.issuer,
                audience: this.config.audience,
                algorithms: [this.config.algorithm]
            });
            
            // Additional validation
            if (!decoded.sub) {
                return { 
                    valid: false, 
                    error: 'Token missing subject',
                    code: 'INVALID_TOKEN'
                };
            }

            return { 
                valid: true, 
                payload: decoded,
                userId: decoded.sub,
                tokenId: decoded.jti,
                expiresAt: new Date(decoded.exp * 1000)
            };
        } catch (error) {
            let errorCode = 'INVALID_TOKEN';
            let errorMessage = 'Invalid token';

            if (error.name === 'TokenExpiredError') {
                errorCode = 'TOKEN_EXPIRED';
                errorMessage = 'Token has expired';
            } else if (error.name === 'JsonWebTokenError') {
                errorCode = 'MALFORMED_TOKEN';
                errorMessage = 'Malformed token';
            } else if (error.name === 'NotBeforeError') {
                errorCode = 'TOKEN_NOT_ACTIVE';
                errorMessage = 'Token not active yet';
            }

            this.logger.warn(`Token validation failed: ${error.message}`);
            return { 
                valid: false, 
                error: errorMessage,
                code: errorCode
            };
        }
    }

    /**
     * Refresh access token using refresh token
     */
    async refreshToken(refreshToken) {
        try {
            // Validate refresh token in database
            const sessionResult = await this.db.query(
                `SELECT s.*, u.username, u.role, u.permissions, u.is_active 
                 FROM sessions s 
                 JOIN users u ON s.user_id = u.id 
                 WHERE s.refresh_token = $1 AND s.is_active = true AND s.refresh_expires_at > NOW()`,
                [refreshToken]
            );

            if (sessionResult.rows.length === 0) {
                return {
                    success: false,
                    error: 'Invalid or expired refresh token',
                    code: 'INVALID_REFRESH_TOKEN'
                };
            }

            const session = sessionResult.rows[0];
            
            // Check if user is still active
            if (!session.is_active) {
                return {
                    success: false,
                    error: 'User account is inactive',
                    code: 'USER_INACTIVE'
                };
            }

            // Generate new access token
            const tokenPayload = {
                sub: session.user_id,
                username: session.username,
                role: session.role,
                permissions: session.permissions || []
            };

            const tokenResult = this.generateToken(tokenPayload);

            // Update session last used
            await this.db.query(
                'UPDATE sessions SET updated_at = NOW() WHERE id = $1',
                [session.id]
            );

            this.logger.info(`Token refreshed for user: ${session.username}`);

            return {
                success: true,
                token: tokenResult.token,
                expiresIn: tokenResult.expiresIn,
                tokenId: tokenResult.tokenId
            };

        } catch (error) {
            this.logger.error('Token refresh failed:', error);
            return {
                success: false,
                error: 'Token refresh failed',
                code: 'REFRESH_FAILED'
            };
        }
    }

    /**
     * Generate refresh token and store in database
     */
    async generateRefreshToken(userId, sessionData = {}) {
        try {
            const refreshToken = crypto.randomBytes(64).toString('hex');
            const expiresAt = new Date(Date.now() + this._parseTimeToMs(this.config.refresh_token_expiry));
            const refreshExpiresAt = new Date(Date.now() + this._parseTimeToMs(this.config.refresh_token_expiry));

            // Create session record
            const sessionResult = await this.db.query(
                `INSERT INTO sessions (user_id, session_token, refresh_token, expires_at, refresh_expires_at, ip_address, user_agent, metadata)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
                [
                    userId,
                    crypto.randomBytes(32).toString('hex'), // Session token for tracking
                    refreshToken,
                    expiresAt,
                    refreshExpiresAt,
                    sessionData.ip_address || null,
                    sessionData.user_agent || null,
                    JSON.stringify(sessionData.metadata || {})
                ]
            );

            this.logger.debug(`Refresh token generated for user: ${userId}`);

            return {
                refreshToken,
                sessionId: sessionResult.rows[0].id,
                expiresAt: refreshExpiresAt
            };
        } catch (error) {
            this.logger.error('Refresh token generation failed:', error);
            throw new Error('Failed to generate refresh token');
        }
    }

    /**
     * Revoke token by adding to revoked tokens table
     */
    async revokeToken(token, reason = 'Manual revocation') {
        try {
            const validation = await this.validateToken(token);
            if (!validation.valid) {
                return { success: false, error: 'Invalid token' };
            }

            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            
            await this.db.query(
                `INSERT INTO revoked_tokens (token_hash, token_type, user_id, expires_at, reason)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    tokenHash,
                    'jwt',
                    validation.userId,
                    validation.expiresAt,
                    reason
                ]
            );

            this.logger.info(`Token revoked for user: ${validation.userId}, reason: ${reason}`);
            
            return { success: true };
        } catch (error) {
            this.logger.error('Token revocation failed:', error);
            return { success: false, error: 'Token revocation failed' };
        }
    }

    /**
     * Revoke refresh token
     */
    async revokeRefreshToken(refreshToken, reason = 'Manual revocation') {
        try {
            const result = await this.db.query(
                'UPDATE sessions SET is_active = false, metadata = metadata || $1 WHERE refresh_token = $2',
                [JSON.stringify({ revoked_reason: reason, revoked_at: new Date().toISOString() }), refreshToken]
            );

            if (result.rowCount === 0) {
                return { success: false, error: 'Refresh token not found' };
            }

            this.logger.info(`Refresh token revoked, reason: ${reason}`);
            return { success: true };
        } catch (error) {
            this.logger.error('Refresh token revocation failed:', error);
            return { success: false, error: 'Refresh token revocation failed' };
        }
    }

    /**
     * Revoke all tokens for a user
     */
    async revokeAllUserTokens(userId, reason = 'Security measure') {
        try {
            // Revoke all sessions
            await this.db.query(
                'UPDATE sessions SET is_active = false, metadata = metadata || $1 WHERE user_id = $2',
                [JSON.stringify({ revoked_reason: reason, revoked_at: new Date().toISOString() }), userId]
            );

            this.logger.info(`All tokens revoked for user: ${userId}, reason: ${reason}`);
            return { success: true };
        } catch (error) {
            this.logger.error('User token revocation failed:', error);
            return { success: false, error: 'User token revocation failed' };
        }
    }

    /**
     * Check if token is revoked
     */
    async _isTokenRevoked(token) {
        try {
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            
            const result = await this.db.query(
                'SELECT 1 FROM revoked_tokens WHERE token_hash = $1 AND expires_at > NOW()',
                [tokenHash]
            );

            return result.rows.length > 0;
        } catch (error) {
            this.logger.error('Token revocation check failed:', error);
            return false; // Fail open for availability
        }
    }

    /**
     * Parse time string to milliseconds
     */
    _parseTimeToMs(timeStr) {
        const units = {
            's': 1000,
            'm': 60 * 1000,
            'h': 60 * 60 * 1000,
            'd': 24 * 60 * 60 * 1000,
            'w': 7 * 24 * 60 * 60 * 1000
        };

        const match = timeStr.match(/^(\d+)([smhdw])$/);
        if (!match) {
            throw new Error(`Invalid time format: ${timeStr}`);
        }

        const [, value, unit] = match;
        return parseInt(value) * units[unit];
    }

    /**
     * Clean up expired tokens (should be called periodically)
     */
    async cleanup() {
        try {
            // Clean up expired revoked tokens
            const revokedResult = await this.db.query(
                'DELETE FROM revoked_tokens WHERE expires_at < NOW()'
            );

            // Clean up expired sessions
            const sessionsResult = await this.db.query(
                'DELETE FROM sessions WHERE expires_at < NOW() AND is_active = false'
            );

            this.logger.debug(`Cleanup completed: ${revokedResult.rowCount} revoked tokens, ${sessionsResult.rowCount} sessions removed`);
            
            return {
                revokedTokensRemoved: revokedResult.rowCount,
                sessionsRemoved: sessionsResult.rowCount
            };
        } catch (error) {
            this.logger.error('Token cleanup failed:', error);
            throw error;
        }
    }

    /**
     * Get token statistics
     */
    async getTokenStats() {
        try {
            const stats = await this.db.query(`
                SELECT 
                    (SELECT COUNT(*) FROM sessions WHERE is_active = true AND expires_at > NOW()) as active_sessions,
                    (SELECT COUNT(*) FROM revoked_tokens WHERE expires_at > NOW()) as revoked_tokens,
                    (SELECT COUNT(*) FROM sessions WHERE expires_at < NOW()) as expired_sessions,
                    (SELECT COUNT(DISTINCT user_id) FROM sessions WHERE is_active = true AND expires_at > NOW()) as unique_active_users
            `);

            return stats.rows[0];
        } catch (error) {
            this.logger.error('Failed to get token statistics:', error);
            throw error;
        }
    }
}

export default JWTManager;

