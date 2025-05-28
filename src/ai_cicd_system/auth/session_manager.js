/**
 * Session Manager
 * 
 * Handles user session management and cleanup for the AI CI/CD system.
 * Manages session lifecycle, tracking, and security.
 */

import crypto from 'crypto';
import { SimpleLogger } from '../utils/simple_logger.js';

export class SessionManager {
    constructor(database, config = {}) {
        this.db = database;
        this.config = {
            sessionTimeout: config.sessionTimeout || '24h',
            maxSessionsPerUser: config.maxSessionsPerUser || 5,
            cleanupInterval: config.cleanupInterval || '1h',
            trackUserAgent: config.trackUserAgent !== false,
            trackIpAddress: config.trackIpAddress !== false,
            ...config
        };
        
        this.logger = new SimpleLogger('SessionManager');
        
        // Start cleanup interval
        this._startCleanupInterval();
    }

    /**
     * Create a new session
     */
    async createSession(userId, sessionData = {}) {
        try {
            const {
                ip_address = null,
                user_agent = null,
                metadata = {}
            } = sessionData;

            // Check if user exists and is active
            const userResult = await this.db.query(
                'SELECT username, is_active FROM users WHERE id = $1',
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

            // Check session limit per user
            const sessionCountResult = await this.db.query(
                'SELECT COUNT(*) as count FROM sessions WHERE user_id = $1 AND is_active = true AND expires_at > NOW()',
                [userId]
            );

            const currentSessionCount = parseInt(sessionCountResult.rows[0].count);
            
            if (currentSessionCount >= this.config.maxSessionsPerUser) {
                // Remove oldest session to make room
                await this.db.query(
                    `UPDATE sessions 
                     SET is_active = false, 
                         metadata = metadata || $1
                     WHERE id = (
                         SELECT id FROM sessions 
                         WHERE user_id = $2 AND is_active = true 
                         ORDER BY created_at ASC 
                         LIMIT 1
                     )`,
                    [
                        JSON.stringify({ 
                            auto_expired_reason: 'Session limit exceeded',
                            auto_expired_at: new Date().toISOString()
                        }),
                        userId
                    ]
                );

                this.logger.info(`Oldest session removed for user ${user.username} due to session limit`);
            }

            // Generate session tokens
            const sessionToken = crypto.randomBytes(32).toString('hex');
            const refreshToken = crypto.randomBytes(64).toString('hex');
            
            // Calculate expiration times
            const expiresAt = new Date(Date.now() + this._parseTimeToMs(this.config.sessionTimeout));
            const refreshExpiresAt = new Date(Date.now() + this._parseTimeToMs(this.config.sessionTimeout) * 2); // Refresh token lasts twice as long

            // Create session record
            const sessionResult = await this.db.query(
                `INSERT INTO sessions (user_id, session_token, refresh_token, expires_at, refresh_expires_at, ip_address, user_agent, metadata)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
                 RETURNING id, created_at`,
                [
                    userId,
                    sessionToken,
                    refreshToken,
                    expiresAt,
                    refreshExpiresAt,
                    this.config.trackIpAddress ? ip_address : null,
                    this.config.trackUserAgent ? user_agent : null,
                    JSON.stringify(metadata)
                ]
            );

            // Log security event
            await this._logSecurityEvent('session_created', 'info', userId, {
                session_id: sessionResult.rows[0].id,
                ip_address: ip_address,
                user_agent: user_agent
            });

            this.logger.info(`Session created for user: ${user.username}`);

            return {
                success: true,
                sessionId: sessionResult.rows[0].id,
                sessionToken,
                refreshToken,
                expiresAt,
                refreshExpiresAt,
                createdAt: sessionResult.rows[0].created_at
            };

        } catch (error) {
            this.logger.error('Session creation failed:', error);
            return {
                success: false,
                error: 'Session creation failed',
                code: 'CREATION_FAILED'
            };
        }
    }

    /**
     * Validate a session
     */
    async validateSession(sessionToken) {
        try {
            const result = await this.db.query(
                `SELECT s.*, u.username, u.is_active as user_active
                 FROM sessions s
                 JOIN users u ON s.user_id = u.id
                 WHERE s.session_token = $1 AND s.is_active = true`,
                [sessionToken]
            );

            if (result.rows.length === 0) {
                return {
                    valid: false,
                    error: 'Invalid session token',
                    code: 'INVALID_SESSION'
                };
            }

            const session = result.rows[0];

            // Check if user is still active
            if (!session.user_active) {
                return {
                    valid: false,
                    error: 'User account is inactive',
                    code: 'USER_INACTIVE'
                };
            }

            // Check if session has expired
            if (new Date() > session.expires_at) {
                // Mark session as expired
                await this.db.query(
                    'UPDATE sessions SET is_active = false WHERE id = $1',
                    [session.id]
                );

                return {
                    valid: false,
                    error: 'Session expired',
                    code: 'SESSION_EXPIRED'
                };
            }

            // Update last activity
            await this.db.query(
                'UPDATE sessions SET updated_at = NOW() WHERE id = $1',
                [session.id]
            );

            return {
                valid: true,
                sessionId: session.id,
                userId: session.user_id,
                username: session.username,
                expiresAt: session.expires_at,
                metadata: JSON.parse(session.metadata || '{}')
            };

        } catch (error) {
            this.logger.error('Session validation failed:', error);
            return {
                valid: false,
                error: 'Session validation failed',
                code: 'VALIDATION_FAILED'
            };
        }
    }

    /**
     * Extend session expiration
     */
    async extendSession(sessionId, extensionTime = null) {
        try {
            const extension = extensionTime || this.config.sessionTimeout;
            const newExpiresAt = new Date(Date.now() + this._parseTimeToMs(extension));

            const result = await this.db.query(
                'UPDATE sessions SET expires_at = $1, updated_at = NOW() WHERE id = $2 AND is_active = true RETURNING user_id',
                [newExpiresAt, sessionId]
            );

            if (result.rowCount === 0) {
                return {
                    success: false,
                    error: 'Session not found',
                    code: 'SESSION_NOT_FOUND'
                };
            }

            this.logger.debug(`Session extended: ${sessionId}`);

            return {
                success: true,
                newExpiresAt
            };

        } catch (error) {
            this.logger.error('Session extension failed:', error);
            return {
                success: false,
                error: 'Session extension failed',
                code: 'EXTENSION_FAILED'
            };
        }
    }

    /**
     * Terminate a specific session
     */
    async terminateSession(sessionId, reason = 'Manual termination') {
        try {
            const result = await this.db.query(
                `UPDATE sessions 
                 SET is_active = false, 
                     metadata = metadata || $1
                 WHERE id = $2 AND is_active = true 
                 RETURNING user_id`,
                [
                    JSON.stringify({ 
                        terminated_reason: reason,
                        terminated_at: new Date().toISOString()
                    }),
                    sessionId
                ]
            );

            if (result.rowCount === 0) {
                return {
                    success: false,
                    error: 'Session not found',
                    code: 'SESSION_NOT_FOUND'
                };
            }

            // Log security event
            await this._logSecurityEvent('session_terminated', 'info', result.rows[0].user_id, {
                session_id: sessionId,
                reason: reason
            });

            this.logger.info(`Session terminated: ${sessionId}, reason: ${reason}`);

            return { success: true };

        } catch (error) {
            this.logger.error('Session termination failed:', error);
            return {
                success: false,
                error: 'Session termination failed',
                code: 'TERMINATION_FAILED'
            };
        }
    }

    /**
     * Terminate all sessions for a user
     */
    async terminateAllUserSessions(userId, reason = 'Security measure') {
        try {
            const result = await this.db.query(
                `UPDATE sessions 
                 SET is_active = false, 
                     metadata = metadata || $1
                 WHERE user_id = $2 AND is_active = true`,
                [
                    JSON.stringify({ 
                        terminated_reason: reason,
                        terminated_at: new Date().toISOString()
                    }),
                    userId
                ]
            );

            // Log security event
            await this._logSecurityEvent('all_sessions_terminated', 'medium', userId, {
                sessions_terminated: result.rowCount,
                reason: reason
            });

            this.logger.info(`All sessions terminated for user: ${userId}, count: ${result.rowCount}, reason: ${reason}`);

            return {
                success: true,
                sessionsTerminated: result.rowCount
            };

        } catch (error) {
            this.logger.error('User session termination failed:', error);
            return {
                success: false,
                error: 'User session termination failed',
                code: 'TERMINATION_FAILED'
            };
        }
    }

    /**
     * Get active sessions for a user
     */
    async getUserSessions(userId) {
        try {
            const result = await this.db.query(
                `SELECT id, session_token, ip_address, user_agent, created_at, updated_at, expires_at, metadata
                 FROM sessions 
                 WHERE user_id = $1 AND is_active = true AND expires_at > NOW()
                 ORDER BY created_at DESC`,
                [userId]
            );

            return {
                success: true,
                sessions: result.rows.map(session => ({
                    ...session,
                    metadata: JSON.parse(session.metadata || '{}'),
                    // Don't return the actual session token for security
                    sessionToken: session.session_token.substring(0, 8) + '...'
                }))
            };

        } catch (error) {
            this.logger.error('Failed to get user sessions:', error);
            return {
                success: false,
                error: 'Failed to get user sessions',
                code: 'QUERY_FAILED'
            };
        }
    }

    /**
     * Get session statistics
     */
    async getSessionStats() {
        try {
            const stats = await this.db.query(`
                SELECT 
                    COUNT(*) as total_sessions,
                    COUNT(*) FILTER (WHERE is_active = true AND expires_at > NOW()) as active_sessions,
                    COUNT(*) FILTER (WHERE expires_at < NOW()) as expired_sessions,
                    COUNT(DISTINCT user_id) FILTER (WHERE is_active = true AND expires_at > NOW()) as unique_active_users,
                    AVG(EXTRACT(EPOCH FROM (expires_at - created_at))) / 3600 as avg_session_duration_hours
                FROM sessions
            `);

            return {
                success: true,
                stats: stats.rows[0]
            };

        } catch (error) {
            this.logger.error('Failed to get session statistics:', error);
            return {
                success: false,
                error: 'Failed to get session statistics',
                code: 'STATS_FAILED'
            };
        }
    }

    /**
     * Clean up expired sessions
     */
    async cleanup() {
        try {
            // Mark expired sessions as inactive
            const expiredResult = await this.db.query(
                `UPDATE sessions 
                 SET is_active = false, 
                     metadata = metadata || $1
                 WHERE expires_at < NOW() AND is_active = true`,
                [JSON.stringify({ 
                    auto_expired_at: new Date().toISOString(),
                    auto_expired_reason: 'Session timeout'
                })]
            );

            // Delete old inactive sessions (older than 30 days)
            const deletedResult = await this.db.query(
                'DELETE FROM sessions WHERE is_active = false AND updated_at < NOW() - INTERVAL \'30 days\''
            );

            this.logger.debug(`Session cleanup completed: ${expiredResult.rowCount} expired, ${deletedResult.rowCount} deleted`);
            
            return {
                expiredSessions: expiredResult.rowCount,
                deletedSessions: deletedResult.rowCount
            };

        } catch (error) {
            this.logger.error('Session cleanup failed:', error);
            throw error;
        }
    }

    /**
     * Start automatic cleanup interval
     */
    _startCleanupInterval() {
        const intervalMs = this._parseTimeToMs(this.config.cleanupInterval);
        
        setInterval(async () => {
            try {
                await this.cleanup();
            } catch (error) {
                this.logger.error('Scheduled cleanup failed:', error);
            }
        }, intervalMs);

        this.logger.info(`Session cleanup interval started: ${this.config.cleanupInterval}`);
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
            'w': 7 * 24 * 60 * 60 * 1000
        };

        const match = timeStr.match(/^(\d+)([smhdw])$/);
        if (!match) {
            throw new Error(`Invalid time format: ${timeStr}`);
        }

        const [, value, unit] = match;
        return parseInt(value) * units[unit];
    }
}

export default SessionManager;

