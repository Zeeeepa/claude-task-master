/**
 * Unified Audit Logger
 * 
 * Comprehensive audit logging system for security events, user actions,
 * and system changes. Consolidates audit functionality from multiple implementations.
 */

import { writeFile, appendFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { EventEmitter } from 'events';

export class AuditLogger extends EventEmitter {
    constructor(config) {
        super();
        
        this.config = {
            enabled: true,
            level: 'info',
            format: 'json',
            destinations: ['file'],
            retention: {
                days: 365,
                maxSize: '10GB'
            },
            events: {
                authentication: true,
                authorization: true,
                dataAccess: true,
                systemChanges: true,
                securityEvents: true
            },
            sensitiveFields: [
                'password',
                'token',
                'secret',
                'key',
                'credential',
                'apiKey',
                'sessionId'
            ],
            ...config
        };
        
        // Log storage
        this.logBuffer = [];
        this.bufferSize = this.config.bufferSize || 100;
        this.flushInterval = this.config.flushInterval || 5000; // 5 seconds
        
        // File paths
        this.logDirectory = this.config.logDirectory || './logs/audit';
        this.currentLogFile = null;
        
        // Statistics
        this.stats = {
            totalEvents: 0,
            eventsByType: new Map(),
            eventsByLevel: new Map(),
            errors: 0,
            lastFlush: null
        };
        
        this.initialized = false;
    }

    /**
     * Initialize audit logger
     */
    async initialize() {
        try {
            if (!this.config.enabled) {
                console.log('Audit logging is disabled');
                return;
            }
            
            // Create log directory
            await this._ensureLogDirectory();
            
            // Initialize log file
            await this._initializeLogFile();
            
            // Start buffer flush timer
            this._startFlushTimer();
            
            this.initialized = true;
            this.emit('initialized');
            
            // Log initialization
            await this.logSecurityEvent('AUDIT_LOGGER_INITIALIZED', {
                config: this._sanitizeConfig(),
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Ensure log directory exists
     */
    async _ensureLogDirectory() {
        if (!existsSync(this.logDirectory)) {
            await mkdir(this.logDirectory, { recursive: true });
        }
    }

    /**
     * Initialize log file
     */
    async _initializeLogFile() {
        const date = new Date().toISOString().split('T')[0];
        this.currentLogFile = join(this.logDirectory, `audit-${date}.log`);
        
        // Create file if it doesn't exist
        if (!existsSync(this.currentLogFile)) {
            await writeFile(this.currentLogFile, '');
        }
    }

    /**
     * Start buffer flush timer
     */
    _startFlushTimer() {
        setInterval(async () => {
            try {
                await this._flushBuffer();
            } catch (error) {
                this.emit('error', error);
            }
        }, this.flushInterval);
    }

    /**
     * Log security event
     */
    async logSecurityEvent(eventType, data = {}, level = 'info') {
        if (!this.config.enabled || !this.config.events.securityEvents) {
            return;
        }
        
        return await this._logEvent('SECURITY', eventType, data, level);
    }

    /**
     * Log authentication event
     */
    async logAuthenticationEvent(eventType, data = {}, level = 'info') {
        if (!this.config.enabled || !this.config.events.authentication) {
            return;
        }
        
        return await this._logEvent('AUTHENTICATION', eventType, data, level);
    }

    /**
     * Log authorization event
     */
    async logAuthorizationEvent(eventType, data = {}, level = 'info') {
        if (!this.config.enabled || !this.config.events.authorization) {
            return;
        }
        
        return await this._logEvent('AUTHORIZATION', eventType, data, level);
    }

    /**
     * Log data access event
     */
    async logDataAccessEvent(eventType, data = {}, level = 'info') {
        if (!this.config.enabled || !this.config.events.dataAccess) {
            return;
        }
        
        return await this._logEvent('DATA_ACCESS', eventType, data, level);
    }

    /**
     * Log system change event
     */
    async logSystemChangeEvent(eventType, data = {}, level = 'info') {
        if (!this.config.enabled || !this.config.events.systemChanges) {
            return;
        }
        
        return await this._logEvent('SYSTEM_CHANGE', eventType, data, level);
    }

    /**
     * Log general event
     */
    async logEvent(category, eventType, data = {}, level = 'info') {
        if (!this.config.enabled) {
            return;
        }
        
        return await this._logEvent(category, eventType, data, level);
    }

    /**
     * Internal log event method
     */
    async _logEvent(category, eventType, data, level) {
        try {
            // Create log entry
            const logEntry = {
                id: this._generateEventId(),
                timestamp: new Date().toISOString(),
                level: level.toUpperCase(),
                category: category.toUpperCase(),
                eventType: eventType.toUpperCase(),
                data: this._sanitizeData(data),
                source: {
                    service: 'ai-cicd-system',
                    component: 'security-framework',
                    version: '1.0.0'
                },
                metadata: {
                    processId: process.pid,
                    nodeVersion: process.version,
                    platform: process.platform
                }
            };

            // Add to buffer
            this.logBuffer.push(logEntry);
            
            // Update statistics
            this._updateStats(category, eventType, level);
            
            // Flush if buffer is full
            if (this.logBuffer.length >= this.bufferSize) {
                await this._flushBuffer();
            }
            
            // Emit event for real-time processing
            this.emit('logEvent', logEntry);
            
            return logEntry.id;
            
        } catch (error) {
            this.stats.errors++;
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Generate unique event ID
     */
    _generateEventId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        return `${timestamp}-${random}`;
    }

    /**
     * Sanitize sensitive data
     */
    _sanitizeData(data) {
        if (!data || typeof data !== 'object') {
            return data;
        }
        
        const sanitized = { ...data };
        
        for (const field of this.config.sensitiveFields) {
            if (sanitized[field]) {
                sanitized[field] = '[REDACTED]';
            }
        }
        
        // Recursively sanitize nested objects
        for (const [key, value] of Object.entries(sanitized)) {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                sanitized[key] = this._sanitizeData(value);
            }
        }
        
        return sanitized;
    }

    /**
     * Sanitize configuration for logging
     */
    _sanitizeConfig() {
        const config = { ...this.config };
        
        // Remove sensitive configuration
        delete config.databaseUrl;
        delete config.apiKeys;
        delete config.secrets;
        
        return config;
    }

    /**
     * Update statistics
     */
    _updateStats(category, eventType, level) {
        this.stats.totalEvents++;
        
        // Update by type
        const typeKey = `${category}:${eventType}`;
        this.stats.eventsByType.set(typeKey, (this.stats.eventsByType.get(typeKey) || 0) + 1);
        
        // Update by level
        this.stats.eventsByLevel.set(level, (this.stats.eventsByLevel.get(level) || 0) + 1);
    }

    /**
     * Flush buffer to destinations
     */
    async _flushBuffer() {
        if (this.logBuffer.length === 0) {
            return;
        }
        
        const entries = [...this.logBuffer];
        this.logBuffer = [];
        
        try {
            // Write to each destination
            for (const destination of this.config.destinations) {
                await this._writeToDestination(destination, entries);
            }
            
            this.stats.lastFlush = new Date();
            this.emit('bufferFlushed', { entriesCount: entries.length });
            
        } catch (error) {
            // Put entries back in buffer if write failed
            this.logBuffer.unshift(...entries);
            throw error;
        }
    }

    /**
     * Write to specific destination
     */
    async _writeToDestination(destination, entries) {
        switch (destination) {
            case 'file':
                await this._writeToFile(entries);
                break;
            case 'database':
                await this._writeToDatabase(entries);
                break;
            case 'syslog':
                await this._writeToSyslog(entries);
                break;
            case 'elasticsearch':
                await this._writeToElasticsearch(entries);
                break;
            default:
                throw new Error(`Unknown audit destination: ${destination}`);
        }
    }

    /**
     * Write to file
     */
    async _writeToFile(entries) {
        // Check if we need a new log file (daily rotation)
        const currentDate = new Date().toISOString().split('T')[0];
        const expectedFile = join(this.logDirectory, `audit-${currentDate}.log`);
        
        if (this.currentLogFile !== expectedFile) {
            this.currentLogFile = expectedFile;
        }
        
        // Format entries based on configuration
        let output;
        if (this.config.format === 'json') {
            output = entries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
        } else {
            output = entries.map(entry => this._formatPlainText(entry)).join('\n') + '\n';
        }
        
        await appendFile(this.currentLogFile, output);
    }

    /**
     * Format entry as plain text
     */
    _formatPlainText(entry) {
        return `[${entry.timestamp}] ${entry.level} ${entry.category}:${entry.eventType} - ${JSON.stringify(entry.data)}`;
    }

    /**
     * Write to database (placeholder)
     */
    async _writeToDatabase(entries) {
        // TODO: Implement database writing
        console.log(`Would write ${entries.length} entries to database`);
    }

    /**
     * Write to syslog (placeholder)
     */
    async _writeToSyslog(entries) {
        // TODO: Implement syslog writing
        console.log(`Would write ${entries.length} entries to syslog`);
    }

    /**
     * Write to Elasticsearch (placeholder)
     */
    async _writeToElasticsearch(entries) {
        // TODO: Implement Elasticsearch writing
        console.log(`Would write ${entries.length} entries to Elasticsearch`);
    }

    /**
     * Query audit logs
     */
    async queryLogs(filters = {}) {
        // TODO: Implement log querying
        // For now, return empty results
        return {
            total: 0,
            entries: [],
            filters
        };
    }

    /**
     * Get audit statistics
     */
    async getStatistics() {
        return {
            ...this.stats,
            eventsByType: Object.fromEntries(this.stats.eventsByType),
            eventsByLevel: Object.fromEntries(this.stats.eventsByLevel),
            bufferSize: this.logBuffer.length,
            uptime: this.initialized ? Date.now() - this.stats.startTime : 0
        };
    }

    /**
     * Export logs
     */
    async exportLogs(options = {}) {
        const { startDate, endDate, format = 'json', categories = [] } = options;
        
        // TODO: Implement log export functionality
        return {
            exported: 0,
            format,
            dateRange: { startDate, endDate },
            categories
        };
    }

    /**
     * Archive old logs
     */
    async archiveLogs() {
        const retentionDays = this.config.retention.days;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        
        // TODO: Implement log archival
        console.log(`Would archive logs older than ${cutoffDate.toISOString()}`);
    }

    /**
     * Health check
     */
    async healthCheck() {
        return {
            status: 'ok',
            enabled: this.config.enabled,
            destinations: this.config.destinations,
            bufferSize: this.logBuffer.length,
            totalEvents: this.stats.totalEvents,
            errors: this.stats.errors,
            lastFlush: this.stats.lastFlush
        };
    }

    /**
     * Shutdown
     */
    async shutdown() {
        try {
            // Flush remaining buffer
            await this._flushBuffer();
            
            // Log shutdown
            await this.logSecurityEvent('AUDIT_LOGGER_SHUTDOWN', {
                totalEvents: this.stats.totalEvents,
                uptime: Date.now() - (this.stats.startTime || Date.now())
            });
            
            // Final flush
            await this._flushBuffer();
            
            this.initialized = false;
            this.emit('shutdown');
            
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }
}

export default AuditLogger;

