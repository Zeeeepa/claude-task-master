/**
 * Linear Event Logger
 * 
 * Logs all Linear API operations, tracks sync events and status,
 * stores webhook events, and generates sync reports.
 */

export class LinearEventLogger {
    constructor(config = {}) {
        this.config = {
            enableApiLogging: config.enableApiLogging !== false,
            enableSyncLogging: config.enableSyncLogging !== false,
            enableWebhookLogging: config.enableWebhookLogging !== false,
            enablePerformanceLogging: config.enablePerformanceLogging !== false,
            logLevel: config.logLevel || 'info', // 'debug', 'info', 'warn', 'error'
            retentionDays: config.retentionDays || 30,
            batchSize: config.batchSize || 100,
            flushInterval: config.flushInterval || 5000, // 5 seconds
            enableMetrics: config.enableMetrics !== false,
            ...config
        };

        // Log levels
        this.logLevels = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3
        };

        // Event categories
        this.eventCategories = {
            API: 'api',
            SYNC: 'sync',
            WEBHOOK: 'webhook',
            PERFORMANCE: 'performance',
            ERROR: 'error',
            AUDIT: 'audit'
        };

        // Database connection (injected)
        this.database = null;
        
        // Log buffer for batch processing
        this.logBuffer = [];
        this.flushTimer = null;
        
        // Metrics collection
        this.metrics = {
            api_calls: 0,
            sync_operations: 0,
            webhook_events: 0,
            errors: 0,
            performance_samples: []
        };

        // Performance tracking
        this.performanceTrackers = new Map();
    }

    /**
     * Initialize event logger
     */
    async initialize(database) {
        this.database = database;
        
        // Ensure log tables exist
        await this.ensureLogTables();
        
        // Start flush timer
        this.startFlushTimer();
        
        // Start cleanup timer
        this.startCleanupTimer();
        
        console.log('Linear Event Logger initialized');
    }

    // ==================== API LOGGING ====================

    /**
     * Log API operation
     */
    async logApiOperation(operation) {
        if (!this.config.enableApiLogging) {
            return;
        }

        const logEntry = {
            category: this.eventCategories.API,
            level: 'info',
            operation: operation.method || 'unknown',
            endpoint: operation.endpoint,
            request_data: operation.requestData,
            response_data: operation.responseData,
            status_code: operation.statusCode,
            duration_ms: operation.duration,
            error: operation.error,
            timestamp: new Date(),
            metadata: {
                user_agent: operation.userAgent,
                request_id: operation.requestId,
                correlation_id: operation.correlationId
            }
        };

        await this.addLogEntry(logEntry);
        this.metrics.api_calls++;
    }

    /**
     * Log API error
     */
    async logApiError(error, context = {}) {
        const logEntry = {
            category: this.eventCategories.ERROR,
            level: 'error',
            operation: 'api_error',
            error_message: error.message,
            error_stack: error.stack,
            error_code: error.code,
            context: context,
            timestamp: new Date()
        };

        await this.addLogEntry(logEntry);
        this.metrics.errors++;
    }

    /**
     * Log API rate limit
     */
    async logRateLimit(rateLimitInfo) {
        const logEntry = {
            category: this.eventCategories.API,
            level: 'warn',
            operation: 'rate_limit',
            rate_limit_info: rateLimitInfo,
            timestamp: new Date()
        };

        await this.addLogEntry(logEntry);
    }

    // ==================== SYNC LOGGING ====================

    /**
     * Log sync operation
     */
    async logSyncOperation(syncData) {
        if (!this.config.enableSyncLogging) {
            return;
        }

        const logEntry = {
            category: this.eventCategories.SYNC,
            level: syncData.success ? 'info' : 'error',
            operation: syncData.operation,
            sync_direction: syncData.direction,
            task_id: syncData.taskId,
            linear_issue_id: syncData.linearIssueId,
            sync_type: syncData.syncType,
            changes: syncData.changes,
            conflicts: syncData.conflicts,
            duration_ms: syncData.duration,
            success: syncData.success,
            error: syncData.error,
            timestamp: new Date(),
            metadata: syncData.metadata || {}
        };

        await this.addLogEntry(logEntry);
        this.metrics.sync_operations++;
    }

    /**
     * Log sync conflict
     */
    async logSyncConflict(conflict) {
        const logEntry = {
            category: this.eventCategories.SYNC,
            level: 'warn',
            operation: 'sync_conflict',
            conflict_type: conflict.type,
            conflict_data: conflict.data,
            resolution_strategy: conflict.resolutionStrategy,
            resolved: conflict.resolved,
            timestamp: new Date()
        };

        await this.addLogEntry(logEntry);
    }

    /**
     * Log sync status change
     */
    async logSyncStatusChange(statusChange) {
        const logEntry = {
            category: this.eventCategories.SYNC,
            level: 'info',
            operation: 'status_change',
            entity_type: statusChange.entityType,
            entity_id: statusChange.entityId,
            old_status: statusChange.oldStatus,
            new_status: statusChange.newStatus,
            source: statusChange.source,
            timestamp: new Date()
        };

        await this.addLogEntry(logEntry);
    }

    // ==================== WEBHOOK LOGGING ====================

    /**
     * Log webhook event
     */
    async logWebhookEvent(webhookData) {
        if (!this.config.enableWebhookLogging) {
            return;
        }

        const logEntry = {
            category: this.eventCategories.WEBHOOK,
            level: 'info',
            operation: 'webhook_received',
            webhook_type: webhookData.type,
            webhook_action: webhookData.action,
            payload: webhookData.payload,
            signature_valid: webhookData.signatureValid,
            processing_status: webhookData.processingStatus,
            processing_duration: webhookData.processingDuration,
            timestamp: new Date(),
            metadata: {
                webhook_id: webhookData.id,
                organization_id: webhookData.organizationId,
                user_agent: webhookData.userAgent
            }
        };

        await this.addLogEntry(logEntry);
        this.metrics.webhook_events++;
    }

    /**
     * Log webhook processing error
     */
    async logWebhookError(error, webhookData) {
        const logEntry = {
            category: this.eventCategories.WEBHOOK,
            level: 'error',
            operation: 'webhook_error',
            webhook_type: webhookData.type,
            webhook_action: webhookData.action,
            error_message: error.message,
            error_stack: error.stack,
            payload: webhookData.payload,
            timestamp: new Date()
        };

        await this.addLogEntry(logEntry);
        this.metrics.errors++;
    }

    // ==================== PERFORMANCE LOGGING ====================

    /**
     * Start performance tracking
     */
    startPerformanceTracking(operationId, operationType) {
        if (!this.config.enablePerformanceLogging) {
            return null;
        }

        const tracker = {
            operation_id: operationId,
            operation_type: operationType,
            start_time: Date.now(),
            memory_start: process.memoryUsage(),
            checkpoints: []
        };

        this.performanceTrackers.set(operationId, tracker);
        return operationId;
    }

    /**
     * Add performance checkpoint
     */
    addPerformanceCheckpoint(operationId, checkpointName, data = {}) {
        const tracker = this.performanceTrackers.get(operationId);
        if (!tracker) return;

        tracker.checkpoints.push({
            name: checkpointName,
            timestamp: Date.now(),
            elapsed_ms: Date.now() - tracker.start_time,
            memory: process.memoryUsage(),
            data
        });
    }

    /**
     * End performance tracking
     */
    async endPerformanceTracking(operationId, success = true, error = null) {
        const tracker = this.performanceTrackers.get(operationId);
        if (!tracker) return;

        const endTime = Date.now();
        const duration = endTime - tracker.start_time;
        const memoryEnd = process.memoryUsage();

        const performanceData = {
            operation_id: operationId,
            operation_type: tracker.operation_type,
            duration_ms: duration,
            memory_start: tracker.memory_start,
            memory_end: memoryEnd,
            memory_delta: {
                rss: memoryEnd.rss - tracker.memory_start.rss,
                heapUsed: memoryEnd.heapUsed - tracker.memory_start.heapUsed,
                heapTotal: memoryEnd.heapTotal - tracker.memory_start.heapTotal
            },
            checkpoints: tracker.checkpoints,
            success,
            error: error?.message,
            timestamp: new Date()
        };

        const logEntry = {
            category: this.eventCategories.PERFORMANCE,
            level: success ? 'info' : 'warn',
            operation: 'performance_tracking',
            performance_data: performanceData,
            timestamp: new Date()
        };

        await this.addLogEntry(logEntry);
        
        // Add to metrics
        this.metrics.performance_samples.push({
            operation_type: tracker.operation_type,
            duration_ms: duration,
            success
        });

        // Keep only last 1000 samples
        if (this.metrics.performance_samples.length > 1000) {
            this.metrics.performance_samples = this.metrics.performance_samples.slice(-1000);
        }

        this.performanceTrackers.delete(operationId);
    }

    // ==================== AUDIT LOGGING ====================

    /**
     * Log audit event
     */
    async logAuditEvent(auditData) {
        const logEntry = {
            category: this.eventCategories.AUDIT,
            level: 'info',
            operation: auditData.operation,
            actor: auditData.actor,
            target_type: auditData.targetType,
            target_id: auditData.targetId,
            action: auditData.action,
            changes: auditData.changes,
            context: auditData.context,
            timestamp: new Date(),
            metadata: auditData.metadata || {}
        };

        await this.addLogEntry(logEntry);
    }

    /**
     * Log correlation event
     */
    async logCorrelationEvent(correlationData) {
        const logEntry = {
            category: this.eventCategories.AUDIT,
            level: 'info',
            operation: 'correlation_event',
            correlation_type: correlationData.type,
            task_id: correlationData.taskId,
            linear_issue_id: correlationData.linearIssueId,
            action: correlationData.action,
            metadata: correlationData.metadata,
            timestamp: new Date()
        };

        await this.addLogEntry(logEntry);
    }

    // ==================== LOG MANAGEMENT ====================

    /**
     * Add log entry to buffer
     */
    async addLogEntry(logEntry) {
        // Check log level
        if (this.logLevels[logEntry.level] < this.logLevels[this.config.logLevel]) {
            return;
        }

        // Add to buffer
        this.logBuffer.push({
            ...logEntry,
            id: this.generateLogId(),
            created_at: logEntry.timestamp || new Date()
        });

        // Flush if buffer is full
        if (this.logBuffer.length >= this.config.batchSize) {
            await this.flushLogs();
        }
    }

    /**
     * Flush logs to database
     */
    async flushLogs() {
        if (this.logBuffer.length === 0 || !this.database) {
            return;
        }

        try {
            const logs = [...this.logBuffer];
            this.logBuffer = [];

            // Batch insert logs
            await this.batchInsertLogs(logs);

        } catch (error) {
            console.error('Failed to flush logs:', error);
            // Put logs back in buffer
            this.logBuffer.unshift(...logs);
        }
    }

    /**
     * Batch insert logs
     */
    async batchInsertLogs(logs) {
        if (logs.length === 0) return;

        const query = `
            INSERT INTO linear_event_logs (
                id, category, level, operation, log_data, created_at
            ) VALUES ${logs.map((_, i) => `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`).join(', ')}
        `;

        const values = logs.flatMap(log => [
            log.id,
            log.category,
            log.level,
            log.operation,
            JSON.stringify(log),
            log.created_at
        ]);

        await this.database.query(query, values);
    }

    /**
     * Start flush timer
     */
    startFlushTimer() {
        this.flushTimer = setInterval(async () => {
            await this.flushLogs();
        }, this.config.flushInterval);
    }

    /**
     * Stop flush timer
     */
    stopFlushTimer() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
    }

    // ==================== LOG CLEANUP ====================

    /**
     * Start cleanup timer
     */
    startCleanupTimer() {
        // Run cleanup daily
        this.cleanupTimer = setInterval(async () => {
            await this.cleanupOldLogs();
        }, 24 * 60 * 60 * 1000); // 24 hours
    }

    /**
     * Cleanup old logs
     */
    async cleanupOldLogs() {
        if (!this.database) return;

        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

            const query = `
                DELETE FROM linear_event_logs 
                WHERE created_at < $1
            `;

            const result = await this.database.query(query, [cutoffDate]);
            
            if (result.rowCount > 0) {
                console.log(`Cleaned up ${result.rowCount} old log entries`);
            }

        } catch (error) {
            console.error('Failed to cleanup old logs:', error);
        }
    }

    // ==================== REPORTING ====================

    /**
     * Generate sync report
     */
    async generateSyncReport(timeframe = 'day') {
        if (!this.database) {
            return null;
        }

        try {
            const timeframeDays = this.getTimeframeDays(timeframe);
            const since = new Date();
            since.setDate(since.getDate() - timeframeDays);

            const queries = {
                sync_operations: `
                    SELECT 
                        operation,
                        sync_direction,
                        COUNT(*) as count,
                        AVG((log_data->>'duration_ms')::numeric) as avg_duration,
                        SUM(CASE WHEN (log_data->>'success')::boolean THEN 1 ELSE 0 END) as successful,
                        SUM(CASE WHEN NOT (log_data->>'success')::boolean THEN 1 ELSE 0 END) as failed
                    FROM linear_event_logs 
                    WHERE category = 'sync' 
                    AND created_at > $1
                    GROUP BY operation, sync_direction
                `,
                api_operations: `
                    SELECT 
                        operation,
                        COUNT(*) as count,
                        AVG((log_data->>'duration_ms')::numeric) as avg_duration,
                        COUNT(CASE WHEN (log_data->>'status_code')::int >= 400 THEN 1 END) as errors
                    FROM linear_event_logs 
                    WHERE category = 'api' 
                    AND created_at > $1
                    GROUP BY operation
                `,
                webhook_events: `
                    SELECT 
                        log_data->>'webhook_type' as webhook_type,
                        log_data->>'webhook_action' as webhook_action,
                        COUNT(*) as count
                    FROM linear_event_logs 
                    WHERE category = 'webhook' 
                    AND created_at > $1
                    GROUP BY webhook_type, webhook_action
                `,
                errors: `
                    SELECT 
                        category,
                        operation,
                        COUNT(*) as count,
                        array_agg(DISTINCT log_data->>'error_message') as error_messages
                    FROM linear_event_logs 
                    WHERE level = 'error' 
                    AND created_at > $1
                    GROUP BY category, operation
                `
            };

            const report = {
                timeframe,
                generated_at: new Date().toISOString(),
                period: {
                    start: since.toISOString(),
                    end: new Date().toISOString()
                }
            };

            for (const [key, query] of Object.entries(queries)) {
                const result = await this.database.query(query, [since]);
                report[key] = result.rows;
            }

            // Add metrics summary
            report.metrics = this.getMetricsSummary();

            return report;

        } catch (error) {
            throw new Error(`Failed to generate sync report: ${error.message}`);
        }
    }

    /**
     * Get performance metrics
     */
    getPerformanceMetrics() {
        const samples = this.metrics.performance_samples;
        
        if (samples.length === 0) {
            return {
                total_samples: 0,
                avg_duration: 0,
                success_rate: 0,
                by_operation: {}
            };
        }

        const totalDuration = samples.reduce((sum, sample) => sum + sample.duration_ms, 0);
        const successfulSamples = samples.filter(sample => sample.success).length;
        
        const byOperation = {};
        samples.forEach(sample => {
            if (!byOperation[sample.operation_type]) {
                byOperation[sample.operation_type] = {
                    count: 0,
                    total_duration: 0,
                    successful: 0
                };
            }
            
            byOperation[sample.operation_type].count++;
            byOperation[sample.operation_type].total_duration += sample.duration_ms;
            if (sample.success) {
                byOperation[sample.operation_type].successful++;
            }
        });

        // Calculate averages
        Object.keys(byOperation).forEach(op => {
            const data = byOperation[op];
            data.avg_duration = data.total_duration / data.count;
            data.success_rate = data.successful / data.count;
        });

        return {
            total_samples: samples.length,
            avg_duration: totalDuration / samples.length,
            success_rate: successfulSamples / samples.length,
            by_operation: byOperation
        };
    }

    /**
     * Get metrics summary
     */
    getMetricsSummary() {
        return {
            ...this.metrics,
            performance: this.getPerformanceMetrics(),
            active_trackers: this.performanceTrackers.size,
            buffer_size: this.logBuffer.length
        };
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Generate log ID
     */
    generateLogId() {
        return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get timeframe in days
     */
    getTimeframeDays(timeframe) {
        const timeframes = {
            hour: 1/24,
            day: 1,
            week: 7,
            month: 30,
            quarter: 90,
            year: 365
        };
        
        return timeframes[timeframe] || 1;
    }

    // ==================== SEARCH & QUERY ====================

    /**
     * Search logs
     */
    async searchLogs(criteria = {}) {
        if (!this.database) {
            return [];
        }

        const {
            category,
            level,
            operation,
            startDate,
            endDate,
            limit = 100,
            offset = 0
        } = criteria;

        let query = 'SELECT * FROM linear_event_logs WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        if (category) {
            query += ` AND category = $${paramIndex++}`;
            params.push(category);
        }

        if (level) {
            query += ` AND level = $${paramIndex++}`;
            params.push(level);
        }

        if (operation) {
            query += ` AND operation = $${paramIndex++}`;
            params.push(operation);
        }

        if (startDate) {
            query += ` AND created_at >= $${paramIndex++}`;
            params.push(startDate);
        }

        if (endDate) {
            query += ` AND created_at <= $${paramIndex++}`;
            params.push(endDate);
        }

        query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(limit, offset);

        const result = await this.database.query(query, params);
        return result.rows;
    }

    /**
     * Get log statistics
     */
    async getLogStatistics(timeframe = 'day') {
        if (!this.database) {
            return {};
        }

        const timeframeDays = this.getTimeframeDays(timeframe);
        const since = new Date();
        since.setDate(since.getDate() - timeframeDays);

        const query = `
            SELECT 
                category,
                level,
                COUNT(*) as count
            FROM linear_event_logs 
            WHERE created_at > $1
            GROUP BY category, level
            ORDER BY category, level
        `;

        const result = await this.database.query(query, [since]);
        
        const stats = {};
        result.rows.forEach(row => {
            if (!stats[row.category]) {
                stats[row.category] = {};
            }
            stats[row.category][row.level] = parseInt(row.count);
        });

        return stats;
    }

    // ==================== DATABASE OPERATIONS ====================

    /**
     * Ensure log tables exist
     */
    async ensureLogTables() {
        if (!this.database) return;

        const createTablesQuery = `
            -- Event logs table
            CREATE TABLE IF NOT EXISTS linear_event_logs (
                id VARCHAR(255) PRIMARY KEY,
                category VARCHAR(50) NOT NULL,
                level VARCHAR(20) NOT NULL,
                operation VARCHAR(100) NOT NULL,
                log_data JSONB NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- Create indexes for efficient querying
            CREATE INDEX IF NOT EXISTS idx_linear_event_logs_category ON linear_event_logs(category);
            CREATE INDEX IF NOT EXISTS idx_linear_event_logs_level ON linear_event_logs(level);
            CREATE INDEX IF NOT EXISTS idx_linear_event_logs_operation ON linear_event_logs(operation);
            CREATE INDEX IF NOT EXISTS idx_linear_event_logs_created_at ON linear_event_logs(created_at);
            CREATE INDEX IF NOT EXISTS idx_linear_event_logs_category_created_at ON linear_event_logs(category, created_at);
        `;

        await this.database.query(createTablesQuery);
    }

    // ==================== HEALTH & DIAGNOSTICS ====================

    /**
     * Get logger status
     */
    getStatus() {
        return {
            config: {
                api_logging: this.config.enableApiLogging,
                sync_logging: this.config.enableSyncLogging,
                webhook_logging: this.config.enableWebhookLogging,
                performance_logging: this.config.enablePerformanceLogging,
                log_level: this.config.logLevel,
                retention_days: this.config.retentionDays,
                batch_size: this.config.batchSize,
                flush_interval: this.config.flushInterval
            },
            buffer: {
                size: this.logBuffer.length,
                max_size: this.config.batchSize
            },
            metrics: this.getMetricsSummary(),
            timers: {
                flush_active: !!this.flushTimer,
                cleanup_active: !!this.cleanupTimer
            }
        };
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        // Flush remaining logs
        await this.flushLogs();
        
        // Stop timers
        this.stopFlushTimer();
        
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        
        // Clear buffers
        this.logBuffer = [];
        this.performanceTrackers.clear();
    }
}

export default LinearEventLogger;

