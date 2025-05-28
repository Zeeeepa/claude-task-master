/**
 * API Key Manager
 * 
 * Handles API key generation, validation, and management for the AI CI/CD system.
 * Provides secure API key authentication with permissions and expiration.
 */

import crypto from 'crypto';
import { SimpleLogger } from '../utils/simple_logger.js';

export class APIKeyManager {
    constructor(database, config = {}) {
        this.db = database;
        this.config = {
            keyPrefix: config.keyPrefix || 'aics_',
            defaultExpiry: config.defaultExpiry || '1y', // 1 year default
            maxKeysPerUser: config.maxKeysPerUser || 10,
            keyLength: config.keyLength || 32,
            ...config
        };
        
        this.logger = new SimpleLogger('APIKeyManager');
    }

    /**
     * Generate a new API key for a user
     */
    async generateAPIKey(userId, options = {}) {
        try {
            const {
                name = 'Default API Key',
                permissions = ['read'],
                expiresAt = null,
                metadata = {}
            } = options;

            // Check if user exists and is active
            const userResult = await this.db.query(
                'SELECT id, username, is_active FROM users WHERE id = $1',
                [userId]
            );

            if (userResult.rows.length === 0) {
                return {
                    success: false,
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                };
            }

            const user = userResult.rows[0];
            if (!user.is_active) {
                return {
                    success: false,
                    error: 'User account is inactive',
                    code: 'USER_INACTIVE'
                };
            }

            // Check if user has reached maximum number of API keys
            const keyCountResult = await this.db.query(
                'SELECT COUNT(*) as count FROM api_keys WHERE user_id = $1 AND is_active = true',
                [userId]
            );

            if (parseInt(keyCountResult.rows[0].count) >= this.config.maxKeysPerUser) {
                return {
                    success: false,
                    error: `Maximum number of API keys (${this.config.maxKeysPerUser}) reached`,
                    code: 'MAX_KEYS_REACHED'
                };
            }

            // Generate unique API key
            const keyId = crypto.randomUUID();
            const keySecret = crypto.randomBytes(this.config.keyLength).toString('hex');
            const apiKey = `${this.config.keyPrefix}${keyId}_${keySecret}`;
            
            // Hash the key for storage
            const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');
            
            // Calculate expiration date
            let expirationDate = null;
            if (expiresAt) {
                expirationDate = new Date(expiresAt);
            } else if (this.config.defaultExpiry) {
                expirationDate = new Date(Date.now() + this._parseTimeToMs(this.config.defaultExpiry));
            }

            // Insert API key record
            const insertResult = await this.db.query(
                `INSERT INTO api_keys (id, user_id, key_hash, name, permissions, expires_at, metadata)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at`,
                [
                    keyId,
                    userId,
                    hashedKey,
                    name,
                    JSON.stringify(permissions),
                    expirationDate,
                    JSON.stringify(metadata)
                ]
            );

            // Log security event
            await this._logSecurityEvent('api_key_created', 'info', userId, {
                api_key_id: keyId,
                api_key_name: name,
                permissions: permissions
            });

            this.logger.info(`API key generated for user ${user.username}: ${name}`);

            return {
                success: true,
                keyId,
                apiKey, // Return the actual key only once
                name,
                permissions,
                expiresAt: expirationDate,
                createdAt: insertResult.rows[0].created_at
            };

        } catch (error) {
            this.logger.error('API key generation failed:', error);
            return {
                success: false,
                error: 'API key generation failed',
                code: 'GENERATION_FAILED'
            };
        }
    }

    /**
     * Validate an API key
     */
    async validateAPIKey(apiKey) {
        try {
            if (!apiKey || !apiKey.startsWith(this.config.keyPrefix)) {
                return {
                    valid: false,
                    error: 'Invalid API key format',
                    code: 'INVALID_FORMAT'
                };
            }

            const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');
            
            const result = await this.db.query(
                `SELECT ak.*, u.username, u.role, u.is_active as user_active
                 FROM api_keys ak
                 JOIN users u ON ak.user_id = u.id
                 WHERE ak.key_hash = $1 AND ak.is_active = true`,
                [hashedKey]
            );

            if (result.rows.length === 0) {
                await this._logSecurityEvent('invalid_api_key', 'medium', null, {
                    api_key_prefix: apiKey.substring(0, 10) + '...'
                });
                
                return {
                    valid: false,
                    error: 'Invalid API key',
                    code: 'INVALID_KEY'
                };
            }

            const keyRecord = result.rows[0];
            
            // Check if user is active
            if (!keyRecord.user_active) {
                return {
                    valid: false,
                    error: 'User account is inactive',
                    code: 'USER_INACTIVE'
                };
            }

            // Check if key has expired
            if (keyRecord.expires_at && new Date() > keyRecord.expires_at) {
                return {
                    valid: false,
                    error: 'API key expired',
                    code: 'KEY_EXPIRED'
                };
            }

            // Update last used timestamp
            await this.db.query(
                'UPDATE api_keys SET last_used = NOW() WHERE id = $1',
                [keyRecord.id]
            );

            return {
                valid: true,
                userId: keyRecord.user_id,
                username: keyRecord.username,
                role: keyRecord.role,
                permissions: JSON.parse(keyRecord.permissions || '[]'),
                keyId: keyRecord.id,
                keyName: keyRecord.name,
                expiresAt: keyRecord.expires_at
            };

        } catch (error) {
            this.logger.error('API key validation failed:', error);
            return {
                valid: false,
                error: 'API key validation failed',
                code: 'VALIDATION_FAILED'
            };
        }
    }

    /**
     * List API keys for a user
     */
    async listUserAPIKeys(userId) {
        try {
            const result = await this.db.query(
                `SELECT id, name, permissions, expires_at, last_used, is_active, created_at, updated_at
                 FROM api_keys 
                 WHERE user_id = $1 
                 ORDER BY created_at DESC`,
                [userId]
            );

            return {
                success: true,
                apiKeys: result.rows.map(key => ({
                    ...key,
                    permissions: JSON.parse(key.permissions || '[]'),
                    isExpired: key.expires_at ? new Date() > key.expires_at : false
                }))
            };

        } catch (error) {
            this.logger.error('Failed to list API keys:', error);
            return {
                success: false,
                error: 'Failed to list API keys',
                code: 'LIST_FAILED'
            };
        }
    }

    /**
     * Revoke an API key
     */
    async revokeAPIKey(keyId, userId, reason = 'Manual revocation') {
        try {
            // Verify the key belongs to the user
            const result = await this.db.query(
                'UPDATE api_keys SET is_active = false, metadata = metadata || $1 WHERE id = $2 AND user_id = $3 RETURNING name',
                [
                    JSON.stringify({ 
                        revoked_reason: reason, 
                        revoked_at: new Date().toISOString() 
                    }),
                    keyId,
                    userId
                ]
            );

            if (result.rowCount === 0) {
                return {
                    success: false,
                    error: 'API key not found or access denied',
                    code: 'KEY_NOT_FOUND'
                };
            }

            // Log security event
            await this._logSecurityEvent('api_key_revoked', 'info', userId, {
                api_key_id: keyId,
                api_key_name: result.rows[0].name,
                reason: reason
            });

            this.logger.info(`API key revoked: ${keyId}, reason: ${reason}`);

            return { success: true };

        } catch (error) {
            this.logger.error('API key revocation failed:', error);
            return {
                success: false,
                error: 'API key revocation failed',
                code: 'REVOCATION_FAILED'
            };
        }
    }

    /**
     * Update API key permissions
     */
    async updateAPIKeyPermissions(keyId, userId, newPermissions) {
        try {
            const result = await this.db.query(
                'UPDATE api_keys SET permissions = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 AND is_active = true RETURNING name',
                [JSON.stringify(newPermissions), keyId, userId]
            );

            if (result.rowCount === 0) {
                return {
                    success: false,
                    error: 'API key not found or access denied',
                    code: 'KEY_NOT_FOUND'
                };
            }

            // Log security event
            await this._logSecurityEvent('api_key_permissions_updated', 'info', userId, {
                api_key_id: keyId,
                api_key_name: result.rows[0].name,
                new_permissions: newPermissions
            });

            this.logger.info(`API key permissions updated: ${keyId}`);

            return { success: true };

        } catch (error) {
            this.logger.error('API key permission update failed:', error);
            return {
                success: false,
                error: 'API key permission update failed',
                code: 'UPDATE_FAILED'
            };
        }
    }

    /**
     * Extend API key expiration
     */
    async extendAPIKeyExpiration(keyId, userId, newExpirationDate) {
        try {
            const result = await this.db.query(
                'UPDATE api_keys SET expires_at = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 AND is_active = true RETURNING name',
                [newExpirationDate, keyId, userId]
            );

            if (result.rowCount === 0) {
                return {
                    success: false,
                    error: 'API key not found or access denied',
                    code: 'KEY_NOT_FOUND'
                };
            }

            // Log security event
            await this._logSecurityEvent('api_key_expiration_extended', 'info', userId, {
                api_key_id: keyId,
                api_key_name: result.rows[0].name,
                new_expiration: newExpirationDate
            });

            this.logger.info(`API key expiration extended: ${keyId}`);

            return { success: true };

        } catch (error) {
            this.logger.error('API key expiration extension failed:', error);
            return {
                success: false,
                error: 'API key expiration extension failed',
                code: 'EXTENSION_FAILED'
            };
        }
    }

    /**
     * Get API key statistics
     */
    async getAPIKeyStats() {
        try {
            const stats = await this.db.query(`
                SELECT 
                    COUNT(*) as total_keys,
                    COUNT(*) FILTER (WHERE is_active = true) as active_keys,
                    COUNT(*) FILTER (WHERE expires_at < NOW()) as expired_keys,
                    COUNT(*) FILTER (WHERE last_used > NOW() - INTERVAL '30 days') as recently_used_keys,
                    COUNT(DISTINCT user_id) as unique_users
                FROM api_keys
            `);

            return {
                success: true,
                stats: stats.rows[0]
            };

        } catch (error) {
            this.logger.error('Failed to get API key statistics:', error);
            return {
                success: false,
                error: 'Failed to get API key statistics',
                code: 'STATS_FAILED'
            };
        }
    }

    /**
     * Clean up expired API keys
     */
    async cleanup() {
        try {
            // Deactivate expired keys
            const result = await this.db.query(
                'UPDATE api_keys SET is_active = false WHERE expires_at < NOW() AND is_active = true'
            );

            this.logger.debug(`Cleanup completed: ${result.rowCount} expired API keys deactivated`);
            
            return {
                expiredKeysDeactivated: result.rowCount
            };

        } catch (error) {
            this.logger.error('API key cleanup failed:', error);
            throw error;
        }
    }

    /**
     * Log security event
     */
    async _logSecurityEvent(eventType, severity, userId, eventData) {
        try {
            await this.db.query(
                'INSERT INTO security_events (event_type, severity, user_id, event_data) VALUES ($1, $2, $3, $4)',
                [eventType, severity, userId, JSON.stringify(eventData)]
            );
        } catch (error) {
            this.logger.error('Failed to log security event:', error);
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
            'w': 7 * 24 * 60 * 60 * 1000,
            'M': 30 * 24 * 60 * 60 * 1000,
            'y': 365 * 24 * 60 * 60 * 1000
        };

        const match = timeStr.match(/^(\d+)([smhdwMy])$/);
        if (!match) {
            throw new Error(`Invalid time format: ${timeStr}`);
        }

        const [, value, unit] = match;
        return parseInt(value) * units[unit];
    }
}

export default APIKeyManager;

