/**
 * @fileoverview Enhanced Logger
 * @description Structured logging with correlation IDs and observability features
 */

import { EventEmitter } from 'events';
import { inspect } from 'util';

/**
 * Enhanced logger with structured logging and correlation
 */
export class EnhancedLogger extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            level: config.level || 'info',
            format: config.format || 'json', // json, text, structured
            enable_correlation: config.enable_correlation !== false,
            enable_sampling: config.enable_sampling !== false,
            sampling_rate: config.sampling_rate || 1.0,
            enable_buffering: config.enable_buffering !== false,
            buffer_size: config.buffer_size || 1000,
            flush_interval: config.flush_interval || 5000, // 5 seconds
            enable_metrics: config.enable_metrics !== false,
            service_name: config.service_name || 'ai-cicd-system',
            ...config
        };

        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3,
            trace: 4
        };

        this.buffer = [];
        this.metrics = {
            total_logs: 0,
            logs_by_level: {},
            errors_count: 0,
            warnings_count: 0
        };

        this.correlationContext = new Map();
        this.flushInterval = null;
        this.isInitialized = false;
    }

    /**
     * Initialize the logger
     */
    async initialize() {
        if (this.isInitialized) return;

        this._initializeMetrics();
        
        if (this.config.enable_buffering) {
            this._startBufferFlush();
        }

        this.isInitialized = true;
        this.emit('initialized');
    }

    /**
     * Log error message
     */
    error(message, meta = {}, correlationId = null) {
        this._log('error', message, meta, correlationId);
    }

    /**
     * Log warning message
     */
    warn(message, meta = {}, correlationId = null) {
        this._log('warn', message, meta, correlationId);
    }

    /**
     * Log info message
     */
    info(message, meta = {}, correlationId = null) {
        this._log('info', message, meta, correlationId);
    }

    /**
     * Log debug message
     */
    debug(message, meta = {}, correlationId = null) {
        this._log('debug', message, meta, correlationId);
    }

    /**
     * Log trace message
     */
    trace(message, meta = {}, correlationId = null) {
        this._log('trace', message, meta, correlationId);
    }

    /**
     * Log with custom level
     */
    log(level, message, meta = {}, correlationId = null) {
        this._log(level, message, meta, correlationId);
    }

    /**
     * Set correlation context
     */
    setCorrelationContext(correlationId, context = {}) {
        if (!this.config.enable_correlation) return;
        
        this.correlationContext.set(correlationId, {
            ...context,
            createdAt: new Date(),
            lastUsed: new Date()
        });
    }

    /**
     * Get correlation context
     */
    getCorrelationContext(correlationId) {
        if (!this.config.enable_correlation) return null;
        
        const context = this.correlationContext.get(correlationId);
        if (context) {
            context.lastUsed = new Date();
        }
        return context;
    }

    /**
     * Clear correlation context
     */
    clearCorrelationContext(correlationId) {
        this.correlationContext.delete(correlationId);
    }

    /**
     * Create child logger with correlation ID
     */
    child(correlationId, context = {}) {
        this.setCorrelationContext(correlationId, context);
        
        return {
            error: (message, meta = {}) => this.error(message, meta, correlationId),
            warn: (message, meta = {}) => this.warn(message, meta, correlationId),
            info: (message, meta = {}) => this.info(message, meta, correlationId),
            debug: (message, meta = {}) => this.debug(message, meta, correlationId),
            trace: (message, meta = {}) => this.trace(message, meta, correlationId),
            log: (level, message, meta = {}) => this.log(level, message, meta, correlationId)
        };
    }

    /**
     * Log structured event
     */
    logEvent(eventType, eventData = {}, correlationId = null) {
        const meta = {
            event_type: eventType,
            event_data: eventData,
            timestamp: new Date().toISOString()
        };

        this._log('info', `Event: ${eventType}`, meta, correlationId);
    }

    /**
     * Log performance metrics
     */
    logPerformance(operation, duration, metadata = {}, correlationId = null) {
        const meta = {
            operation,
            duration_ms: duration,
            performance_data: metadata,
            timestamp: new Date().toISOString()
        };

        this._log('info', `Performance: ${operation} completed in ${duration}ms`, meta, correlationId);
    }

    /**
     * Log error with stack trace
     */
    logError(error, context = {}, correlationId = null) {
        const meta = {
            error_name: error.name,
            error_message: error.message,
            error_stack: error.stack,
            error_code: error.code,
            context,
            timestamp: new Date().toISOString()
        };

        this._log('error', `Error: ${error.message}`, meta, correlationId);
    }

    /**
     * Log HTTP request
     */
    logRequest(req, res = null, correlationId = null) {
        const meta = {
            method: req.method,
            url: req.url,
            headers: this._sanitizeHeaders(req.headers),
            user_agent: req.headers['user-agent'],
            ip: req.ip || req.connection?.remoteAddress,
            timestamp: new Date().toISOString()
        };

        if (res) {
            meta.status_code = res.statusCode;
            meta.response_time = res.responseTime;
        }

        this._log('info', `${req.method} ${req.url}`, meta, correlationId);
    }

    /**
     * Log database query
     */
    logQuery(query, duration, metadata = {}, correlationId = null) {
        const meta = {
            query_type: this._extractQueryType(query),
            query: this._sanitizeQuery(query),
            duration_ms: duration,
            query_metadata: metadata,
            timestamp: new Date().toISOString()
        };

        this._log('debug', `Database query executed in ${duration}ms`, meta, correlationId);
    }

    /**
     * Log business event
     */
    logBusinessEvent(eventName, eventData = {}, correlationId = null) {
        const meta = {
            business_event: eventName,
            event_data: eventData,
            timestamp: new Date().toISOString()
        };

        this._log('info', `Business Event: ${eventName}`, meta, correlationId);
    }

    /**
     * Get log metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            buffer_size: this.buffer.length,
            correlation_contexts: this.correlationContext.size,
            uptime: process.uptime()
        };
    }

    /**
     * Search logs
     */
    searchLogs(criteria = {}) {
        // This would typically query a log storage system
        // For now, search the buffer
        return this.buffer.filter(logEntry => {
            if (criteria.level && logEntry.level !== criteria.level) return false;
            if (criteria.correlationId && logEntry.correlationId !== criteria.correlationId) return false;
            if (criteria.message && !logEntry.message.includes(criteria.message)) return false;
            if (criteria.startTime && new Date(logEntry.timestamp) < new Date(criteria.startTime)) return false;
            if (criteria.endTime && new Date(logEntry.timestamp) > new Date(criteria.endTime)) return false;
            return true;
        });
    }

    /**
     * Export logs
     */
    exportLogs(format = 'json', limit = 1000) {
        const logs = this.buffer.slice(-limit);
        
        switch (format.toLowerCase()) {
            case 'json':
                return JSON.stringify(logs, null, 2);
            case 'csv':
                return this._exportToCsv(logs);
            case 'text':
                return logs.map(log => this._formatTextLog(log)).join('\n');
            default:
                throw new Error(`Unsupported export format: ${format}`);
        }
    }

    /**
     * Flush buffer immediately
     */
    async flush() {
        if (this.buffer.length === 0) return;

        const logsToFlush = [...this.buffer];
        this.buffer = [];

        // Emit logs for external processors
        this.emit('logs_flushed', logsToFlush);

        // In a real implementation, this would send to log aggregation service
        if (this.config.output_stream) {
            logsToFlush.forEach(log => {
                this.config.output_stream.write(this._formatLog(log) + '\n');
            });
        }
    }

    /**
     * Private methods
     */
    _log(level, message, meta = {}, correlationId = null) {
        if (!this._shouldLog(level)) return;
        if (!this._shouldSample()) return;

        const timestamp = new Date();
        const logEntry = {
            timestamp: timestamp.toISOString(),
            level,
            message,
            service: this.config.service_name,
            correlationId: correlationId || this._extractCorrelationId(),
            meta: this._sanitizeMeta(meta),
            pid: process.pid,
            hostname: require('os').hostname()
        };

        // Add correlation context if available
        if (correlationId && this.config.enable_correlation) {
            const context = this.getCorrelationContext(correlationId);
            if (context) {
                logEntry.correlation_context = context;
            }
        }

        // Update metrics
        this._updateMetrics(level);

        // Add to buffer or output immediately
        if (this.config.enable_buffering) {
            this.buffer.push(logEntry);
            
            // Prevent buffer overflow
            if (this.buffer.length > this.config.buffer_size) {
                this.buffer.shift();
            }
        } else {
            this._outputLog(logEntry);
        }

        // Emit log event
        this.emit('log', logEntry);

        // Emit level-specific events
        this.emit(level, logEntry);
    }

    _shouldLog(level) {
        const levelValue = this.levels[level];
        const configLevelValue = this.levels[this.config.level];
        return levelValue <= configLevelValue;
    }

    _shouldSample() {
        if (!this.config.enable_sampling) return true;
        return Math.random() < this.config.sampling_rate;
    }

    _extractCorrelationId() {
        // Try to extract from various sources
        // This could be enhanced to check async context, headers, etc.
        return null;
    }

    _sanitizeMeta(meta) {
        // Remove sensitive information
        const sanitized = { ...meta };
        
        // Remove common sensitive fields
        const sensitiveFields = ['password', 'token', 'secret', 'key', 'authorization'];
        sensitiveFields.forEach(field => {
            if (sanitized[field]) {
                sanitized[field] = '[REDACTED]';
            }
        });

        // Limit object depth and size
        return this._limitObjectDepth(sanitized, 5);
    }

    _sanitizeHeaders(headers) {
        const sanitized = { ...headers };
        const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
        
        sensitiveHeaders.forEach(header => {
            if (sanitized[header]) {
                sanitized[header] = '[REDACTED]';
            }
        });

        return sanitized;
    }

    _sanitizeQuery(query) {
        // Basic query sanitization - remove potential sensitive data
        if (typeof query !== 'string') return query;
        
        // Remove potential password/token patterns
        return query.replace(/password\s*=\s*'[^']*'/gi, "password='[REDACTED]'")
                   .replace(/token\s*=\s*'[^']*'/gi, "token='[REDACTED]'");
    }

    _extractQueryType(query) {
        if (typeof query !== 'string') return 'unknown';
        
        const match = query.trim().match(/^(\w+)/i);
        return match ? match[1].toUpperCase() : 'unknown';
    }

    _limitObjectDepth(obj, maxDepth, currentDepth = 0) {
        if (currentDepth >= maxDepth) return '[Object]';
        if (obj === null || typeof obj !== 'object') return obj;
        
        if (Array.isArray(obj)) {
            return obj.slice(0, 100).map(item => 
                this._limitObjectDepth(item, maxDepth, currentDepth + 1)
            );
        }

        const result = {};
        let count = 0;
        for (const [key, value] of Object.entries(obj)) {
            if (count >= 50) break; // Limit number of properties
            result[key] = this._limitObjectDepth(value, maxDepth, currentDepth + 1);
            count++;
        }
        
        return result;
    }

    _formatLog(logEntry) {
        switch (this.config.format) {
            case 'json':
                return JSON.stringify(logEntry);
            case 'text':
                return this._formatTextLog(logEntry);
            case 'structured':
                return this._formatStructuredLog(logEntry);
            default:
                return JSON.stringify(logEntry);
        }
    }

    _formatTextLog(logEntry) {
        const timestamp = logEntry.timestamp;
        const level = logEntry.level.toUpperCase().padEnd(5);
        const correlation = logEntry.correlationId ? `[${logEntry.correlationId}] ` : '';
        const message = logEntry.message;
        
        return `${timestamp} ${level} ${correlation}${message}`;
    }

    _formatStructuredLog(logEntry) {
        const parts = [
            `timestamp=${logEntry.timestamp}`,
            `level=${logEntry.level}`,
            `service=${logEntry.service}`,
            `message="${logEntry.message}"`
        ];

        if (logEntry.correlationId) {
            parts.push(`correlation_id=${logEntry.correlationId}`);
        }

        if (Object.keys(logEntry.meta).length > 0) {
            parts.push(`meta=${JSON.stringify(logEntry.meta)}`);
        }

        return parts.join(' ');
    }

    _outputLog(logEntry) {
        const formatted = this._formatLog(logEntry);
        
        if (this.config.output_stream) {
            this.config.output_stream.write(formatted + '\n');
        } else {
            console.log(formatted);
        }
    }

    _initializeMetrics() {
        Object.keys(this.levels).forEach(level => {
            this.metrics.logs_by_level[level] = 0;
        });
    }

    _updateMetrics(level) {
        if (!this.config.enable_metrics) return;

        this.metrics.total_logs++;
        this.metrics.logs_by_level[level]++;

        if (level === 'error') {
            this.metrics.errors_count++;
        } else if (level === 'warn') {
            this.metrics.warnings_count++;
        }
    }

    _startBufferFlush() {
        this.flushInterval = setInterval(async () => {
            await this.flush();
        }, this.config.flush_interval);
    }

    _exportToCsv(logs) {
        const headers = ['timestamp', 'level', 'message', 'service', 'correlationId'];
        const rows = [headers.join(',')];
        
        logs.forEach(log => {
            const row = [
                log.timestamp,
                log.level,
                `"${log.message.replace(/"/g, '""')}"`,
                log.service,
                log.correlationId || ''
            ];
            rows.push(row.join(','));
        });
        
        return rows.join('\n');
    }

    /**
     * Cleanup method
     */
    async cleanup() {
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
            this.flushInterval = null;
        }

        await this.flush();
        
        // Clear old correlation contexts
        const cutoffTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour
        for (const [id, context] of this.correlationContext) {
            if (context.lastUsed < cutoffTime) {
                this.correlationContext.delete(id);
            }
        }
    }
}

export default EnhancedLogger;

