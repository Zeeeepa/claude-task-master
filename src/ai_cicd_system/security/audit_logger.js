/**
 * Audit Logger
 * 
 * Comprehensive audit logging system for the AI CI/CD system.
 * Tracks security events, user actions, and system changes for compliance and monitoring.
 */

import { SimpleLogger } from '../utils/simple_logger.js';

export class AuditLogger {
    constructor(database, config = {}) {
        this.db = database;
        this.config = {
            // Logging levels
            logLevel: config.logLevel || process.env.AUDIT_LOG_LEVEL || 'info',
            
            // Retention settings
            retentionDays: config.retentionDays || parseInt(process.env.AUDIT_RETENTION_DAYS) || 90,
            
            // Sensitive fields to mask
            sensitiveFields: config.sensitiveFields || [
                'password', 'token', 'secret', 'key', 'authorization',
                'cookie', 'session', 'credential', 'private'
            ],
            
            // Event categories to log
            categories: config.categories || [
                'authentication', 'authorization', 'data_access', 'data_modification',
                'system_access', 'configuration_change', 'security_event', 'error'
            ],
            
            // Automatic cleanup
            autoCleanup: config.autoCleanup !== false,
            cleanupInterval: config.cleanupInterval || '24h',
            
            // External logging
            external: {
                enabled: config.external?.enabled || false,
                endpoint: config.external?.endpoint || null,
                apiKey: config.external?.apiKey || null,
                batchSize: config.external?.batchSize || 100,
                flushInterval: config.external?.flushInterval || 60000 // 1 minute
            },
            
            // Performance settings
            asyncLogging: config.asyncLogging !== false,
            bufferSize: config.bufferSize || 1000,
            
            ...config
        };

        this.logger = new SimpleLogger('AuditLogger');
        this.logBuffer = [];
        this.isProcessing = false;

        // Start cleanup interval if enabled
        if (this.config.autoCleanup) {
            this._startCleanupInterval();
        }

        // Start external logging if enabled
        if (this.config.external.enabled) {
            this._startExternalLogging();
        }
    }

    /**
     * Log security event
     */
    async logSecurityEvent(eventType, severity, userId, eventData = {}, metadata = {}) {
        return this._logEvent('security_event', {
            event_type: eventType,
            severity: severity,
            user_id: userId,
            event_data: this._sanitizeData(eventData),
            metadata: this._sanitizeData(metadata),
            ip_address: metadata.ip_address || null,
            user_agent: metadata.user_agent || null
        });
    }

    /**
     * Log authentication event
     */
    async logAuthentication(action, userId, success, details = {}, metadata = {}) {
        return this._logEvent('authentication', {
            action: action, // login, logout, token_refresh, etc.
            user_id: userId,
            success: success,
            details: this._sanitizeData(details),
            metadata: this._sanitizeData(metadata),
            ip_address: metadata.ip_address || null,
            user_agent: metadata.user_agent || null
        });
    }

    /**
     * Log authorization event
     */
    async logAuthorization(resource, action, userId, granted, reason = null, metadata = {}) {
        return this._logEvent('authorization', {
            resource: resource,
            action: action,
            user_id: userId,
            granted: granted,
            reason: reason,
            metadata: this._sanitizeData(metadata),
            ip_address: metadata.ip_address || null,
            user_agent: metadata.user_agent || null
        });
    }

    /**
     * Log data access
     */
    async logDataAccess(resource, action, userId, recordIds = [], metadata = {}) {
        return this._logEvent('data_access', {
            resource: resource,
            action: action, // read, search, export, etc.
            user_id: userId,
            record_ids: Array.isArray(recordIds) ? recordIds : [recordIds],
            record_count: Array.isArray(recordIds) ? recordIds.length : 1,
            metadata: this._sanitizeData(metadata),
            ip_address: metadata.ip_address || null,
            user_agent: metadata.user_agent || null
        });
    }

    /**
     * Log data modification
     */
    async logDataModification(resource, action, userId, recordId, oldValues = null, newValues = null, metadata = {}) {
        return this._logEvent('data_modification', {
            resource: resource,
            action: action, // create, update, delete
            user_id: userId,
            record_id: recordId,
            old_values: oldValues ? this._sanitizeData(oldValues) : null,
            new_values: newValues ? this._sanitizeData(newValues) : null,
            metadata: this._sanitizeData(metadata),
            ip_address: metadata.ip_address || null,
            user_agent: metadata.user_agent || null
        });
    }

    /**
     * Log system access
     */
    async logSystemAccess(action, userId, resource, success, metadata = {}) {
        return this._logEvent('system_access', {
            action: action, // api_call, file_access, service_access, etc.
            user_id: userId,
            resource: resource,
            success: success,
            metadata: this._sanitizeData(metadata),
            ip_address: metadata.ip_address || null,
            user_agent: metadata.user_agent || null
        });
    }

    /**
     * Log configuration change
     */
    async logConfigurationChange(component, setting, userId, oldValue, newValue, metadata = {}) {
        return this._logEvent('configuration_change', {
            component: component,
            setting: setting,
            user_id: userId,
            old_value: this._sanitizeData(oldValue),
            new_value: this._sanitizeData(newValue),
            metadata: this._sanitizeData(metadata),
            ip_address: metadata.ip_address || null,
            user_agent: metadata.user_agent || null
        });
    }

    /**
     * Log error event
     */
    async logError(errorType, message, userId = null, stackTrace = null, metadata = {}) {
        return this._logEvent('error', {
            error_type: errorType,
            message: message,
            user_id: userId,
            stack_trace: stackTrace,
            metadata: this._sanitizeData(metadata),
            ip_address: metadata.ip_address || null,
            user_agent: metadata.user_agent || null
        });
    }

    /**
     * Log custom event
     */
    async logCustomEvent(category, eventData, metadata = {}) {
        if (!this.config.categories.includes(category)) {
            this.logger.warn(`Unknown audit category: ${category}`);
        }

        return this._logEvent(category, {
            ...this._sanitizeData(eventData),
            metadata: this._sanitizeData(metadata),
            ip_address: metadata.ip_address || null,
            user_agent: metadata.user_agent || null
        });
    }

    /**
     * Search audit logs
     */
    async searchLogs(criteria = {}, options = {}) {
        try {
            const {
                category = null,
                userId = null,
                startDate = null,
                endDate = null,
                eventType = null,
                severity = null,
                ipAddress = null,
                resource = null,
                action = null
            } = criteria;

            const {
                limit = 100,
                offset = 0,
                orderBy = 'timestamp',
                orderDirection = 'DESC'
            } = options;

            let query = 'SELECT * FROM audit_logs WHERE 1=1';
            const params = [];
            let paramIndex = 1;

            // Build WHERE clause
            if (category) {
                query += ` AND category = $${paramIndex++}`;
                params.push(category);
            }

            if (userId) {
                query += ` AND user_id = $${paramIndex++}`;
                params.push(userId);
            }

            if (startDate) {
                query += ` AND timestamp >= $${paramIndex++}`;
                params.push(startDate);
            }

            if (endDate) {
                query += ` AND timestamp <= $${paramIndex++}`;
                params.push(endDate);
            }

            if (eventType) {
                query += ` AND event_data->>'event_type' = $${paramIndex++}`;
                params.push(eventType);
            }

            if (severity) {
                query += ` AND event_data->>'severity' = $${paramIndex++}`;
                params.push(severity);
            }

            if (ipAddress) {
                query += ` AND event_data->>'ip_address' = $${paramIndex++}`;
                params.push(ipAddress);
            }

            if (resource) {
                query += ` AND event_data->>'resource' = $${paramIndex++}`;
                params.push(resource);
            }

            if (action) {
                query += ` AND event_data->>'action' = $${paramIndex++}`;
                params.push(action);
            }

            // Add ordering and pagination
            query += ` ORDER BY ${orderBy} ${orderDirection} LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
            params.push(limit, offset);

            const result = await this.db.query(query, params);

            // Get total count for pagination
            let countQuery = query.replace(/SELECT \* FROM/, 'SELECT COUNT(*) as total FROM');
            countQuery = countQuery.replace(/ORDER BY.*$/, '');
            const countParams = params.slice(0, -2); // Remove limit and offset

            const countResult = await this.db.query(countQuery, countParams);
            const total = parseInt(countResult.rows[0]?.total || 0);

            return {
                success: true,
                logs: result.rows,
                pagination: {
                    total,
                    limit,
                    offset,
                    hasMore: offset + limit < total
                }
            };

        } catch (error) {
            this.logger.error('Audit log search failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get audit statistics
     */
    async getStatistics(timeframe = '24h') {
        try {
            const interval = this._parseTimeframe(timeframe);
            
            const stats = await this.db.query(`
                SELECT 
                    category,
                    COUNT(*) as event_count,
                    COUNT(DISTINCT user_id) as unique_users,
                    MIN(timestamp) as first_event,
                    MAX(timestamp) as last_event
                FROM audit_logs 
                WHERE timestamp > NOW() - INTERVAL '${interval}'
                GROUP BY category
                ORDER BY event_count DESC
            `);

            const severityStats = await this.db.query(`
                SELECT 
                    event_data->>'severity' as severity,
                    COUNT(*) as count
                FROM audit_logs 
                WHERE timestamp > NOW() - INTERVAL '${interval}'
                    AND event_data->>'severity' IS NOT NULL
                GROUP BY event_data->>'severity'
                ORDER BY count DESC
            `);

            const topUsers = await this.db.query(`
                SELECT 
                    user_id,
                    COUNT(*) as event_count
                FROM audit_logs 
                WHERE timestamp > NOW() - INTERVAL '${interval}'
                    AND user_id IS NOT NULL
                GROUP BY user_id
                ORDER BY event_count DESC
                LIMIT 10
            `);

            return {
                success: true,
                timeframe: timeframe,
                categories: stats.rows,
                severities: severityStats.rows,
                topUsers: topUsers.rows
            };

        } catch (error) {
            this.logger.error('Failed to get audit statistics:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Export audit logs
     */
    async exportLogs(criteria = {}, format = 'json') {
        try {
            const searchResult = await this.searchLogs(criteria, { limit: 10000 });
            
            if (!searchResult.success) {
                return searchResult;
            }

            let exportData;
            
            switch (format.toLowerCase()) {
                case 'csv':
                    exportData = this._exportToCSV(searchResult.logs);
                    break;
                case 'json':
                    exportData = JSON.stringify(searchResult.logs, null, 2);
                    break;
                default:
                    throw new Error(`Unsupported export format: ${format}`);
            }

            return {
                success: true,
                data: exportData,
                format: format,
                recordCount: searchResult.logs.length
            };

        } catch (error) {
            this.logger.error('Audit log export failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Clean up old audit logs
     */
    async cleanup() {
        try {
            const cutoffDate = new Date(Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000));
            
            const result = await this.db.query(
                'DELETE FROM audit_logs WHERE timestamp < $1',
                [cutoffDate]
            );

            this.logger.info(`Audit log cleanup completed: ${result.rowCount} records removed`);
            
            return {
                success: true,
                deletedRecords: result.rowCount,
                cutoffDate: cutoffDate
            };

        } catch (error) {
            this.logger.error('Audit log cleanup failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Core logging method
     */
    async _logEvent(category, eventData) {
        try {
            const logEntry = {
                id: this._generateId(),
                category: category,
                event_data: eventData,
                timestamp: new Date(),
                session_id: eventData.session_id || null,
                correlation_id: eventData.correlation_id || null
            };

            if (this.config.asyncLogging) {
                // Add to buffer for async processing
                this.logBuffer.push(logEntry);
                
                if (this.logBuffer.length >= this.config.bufferSize) {
                    this._flushBuffer();
                }
            } else {
                // Synchronous logging
                await this._writeLogEntry(logEntry);
            }

            return {
                success: true,
                logId: logEntry.id
            };

        } catch (error) {
            this.logger.error('Failed to log audit event:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Write log entry to database
     */
    async _writeLogEntry(logEntry) {
        await this.db.query(
            `INSERT INTO audit_logs (id, category, event_data, timestamp, session_id, correlation_id)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                logEntry.id,
                logEntry.category,
                JSON.stringify(logEntry.event_data),
                logEntry.timestamp,
                logEntry.session_id,
                logEntry.correlation_id
            ]
        );
    }

    /**
     * Flush log buffer
     */
    async _flushBuffer() {
        if (this.isProcessing || this.logBuffer.length === 0) {
            return;
        }

        this.isProcessing = true;
        const entries = [...this.logBuffer];
        this.logBuffer = [];

        try {
            // Batch insert
            const values = entries.map((entry, index) => {
                const baseIndex = index * 6;
                return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6})`;
            }).join(', ');

            const params = entries.flatMap(entry => [
                entry.id,
                entry.category,
                JSON.stringify(entry.event_data),
                entry.timestamp,
                entry.session_id,
                entry.correlation_id
            ]);

            await this.db.query(
                `INSERT INTO audit_logs (id, category, event_data, timestamp, session_id, correlation_id) VALUES ${values}`,
                params
            );

            this.logger.debug(`Flushed ${entries.length} audit log entries`);

        } catch (error) {
            this.logger.error('Failed to flush audit log buffer:', error);
            // Re-add entries to buffer for retry
            this.logBuffer.unshift(...entries);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Sanitize sensitive data
     */
    _sanitizeData(data) {
        if (typeof data !== 'object' || data === null) {
            return data;
        }

        const sanitized = Array.isArray(data) ? [] : {};

        for (const [key, value] of Object.entries(data)) {
            const lowerKey = key.toLowerCase();
            const isSensitive = this.config.sensitiveFields.some(field => 
                lowerKey.includes(field.toLowerCase())
            );

            if (isSensitive) {
                sanitized[key] = '[REDACTED]';
            } else if (typeof value === 'object' && value !== null) {
                sanitized[key] = this._sanitizeData(value);
            } else {
                sanitized[key] = value;
            }
        }

        return sanitized;
    }

    /**
     * Generate unique ID
     */
    _generateId() {
        return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Parse timeframe string
     */
    _parseTimeframe(timeframe) {
        const match = timeframe.match(/^(\d+)([hdwmy])$/);
        if (!match) {
            throw new Error(`Invalid timeframe format: ${timeframe}`);
        }

        const [, value, unit] = match;
        const units = {
            'h': 'hours',
            'd': 'days',
            'w': 'weeks',
            'm': 'months',
            'y': 'years'
        };

        return `${value} ${units[unit]}`;
    }

    /**
     * Export logs to CSV format
     */
    _exportToCSV(logs) {
        if (logs.length === 0) {
            return '';
        }

        const headers = ['id', 'category', 'timestamp', 'user_id', 'event_data'];
        const csvRows = [headers.join(',')];

        for (const log of logs) {
            const row = [
                log.id,
                log.category,
                log.timestamp,
                log.user_id || '',
                JSON.stringify(log.event_data).replace(/"/g, '""')
            ];
            csvRows.push(row.map(field => `"${field}"`).join(','));
        }

        return csvRows.join('\n');
    }

    /**
     * Start cleanup interval
     */
    _startCleanupInterval() {
        const intervalMs = this._parseTimeToMs(this.config.cleanupInterval);
        
        setInterval(async () => {
            try {
                await this.cleanup();
            } catch (error) {
                this.logger.error('Scheduled audit cleanup failed:', error);
            }
        }, intervalMs);

        this.logger.info(`Audit log cleanup interval started: ${this.config.cleanupInterval}`);
    }

    /**
     * Start external logging
     */
    _startExternalLogging() {
        setInterval(async () => {
            if (this.logBuffer.length > 0) {
                await this._sendToExternalSystem();
            }
        }, this.config.external.flushInterval);

        this.logger.info('External audit logging enabled');
    }

    /**
     * Send logs to external system
     */
    async _sendToExternalSystem() {
        // Implementation would depend on external system requirements
        this.logger.debug('External audit logging not implemented');
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
}

export default AuditLogger;

