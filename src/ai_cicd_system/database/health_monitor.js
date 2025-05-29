/**
 * @fileoverview Database Health Monitor
 * @description Comprehensive database health monitoring with alerting and performance tracking
 * @version 2.0.0
 * @created 2025-05-28
 */

import { EventEmitter } from 'events';
import { getConnection } from './connection.js';

/**
 * Database Health Monitor
 * Monitors database health, performance, and availability with alerting capabilities
 */
export class DatabaseHealthMonitor extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            // Monitoring intervals
            health_check_interval: config.health_check_interval || 30000, // 30 seconds
            performance_check_interval: config.performance_check_interval || 60000, // 1 minute
            metrics_collection_interval: config.metrics_collection_interval || 10000, // 10 seconds
            
            // Health check thresholds
            response_time_threshold: config.response_time_threshold || 1000, // 1 second
            connection_threshold: config.connection_threshold || 80, // 80% of max connections
            slow_query_threshold: config.slow_query_threshold || 5000, // 5 seconds
            error_rate_threshold: config.error_rate_threshold || 5, // 5% error rate
            
            // Performance thresholds
            cpu_threshold: config.cpu_threshold || 80, // 80% CPU usage
            memory_threshold: config.memory_threshold || 85, // 85% memory usage
            disk_threshold: config.disk_threshold || 90, // 90% disk usage
            
            // Alerting configuration
            enable_alerts: config.enable_alerts !== false,
            alert_cooldown: config.alert_cooldown || 300000, // 5 minutes
            max_alerts_per_hour: config.max_alerts_per_hour || 10,
            
            // Retention settings
            metrics_retention_hours: config.metrics_retention_hours || 24,
            health_history_retention_hours: config.health_history_retention_hours || 72,
            
            ...config
        };
        
        this.connection = null;
        this.isMonitoring = false;
        this.intervals = new Map();
        
        // Health status
        this.currentHealth = {
            status: 'unknown',
            lastCheck: null,
            responseTime: null,
            errors: [],
            warnings: []
        };
        
        // Performance metrics
        this.performanceMetrics = {
            cpu_usage: 0,
            memory_usage: 0,
            disk_usage: 0,
            active_connections: 0,
            total_connections: 0,
            queries_per_second: 0,
            slow_queries: 0,
            error_rate: 0,
            cache_hit_ratio: 0,
            index_usage: 0
        };
        
        // Historical data
        this.healthHistory = [];
        this.metricsHistory = [];
        this.alertHistory = [];
        
        // Alert management
        this.lastAlerts = new Map();
        this.alertCounts = new Map();
        
        // Query tracking
        this.queryStats = {
            total: 0,
            successful: 0,
            failed: 0,
            slow: 0,
            totalTime: 0
        };
    }

    /**
     * Start health monitoring
     * @returns {Promise<void>}
     */
    async startMonitoring() {
        if (this.isMonitoring) {
            console.log('⚠️ Health monitoring already running');
            return;
        }

        try {
            console.log('💓 Starting database health monitoring...');
            
            // Get database connection
            this.connection = getConnection();
            
            if (!this.connection.isConnected) {
                await this.connection.initialize();
            }
            
            // Start monitoring intervals
            this._startHealthChecks();
            this._startPerformanceMonitoring();
            this._startMetricsCollection();
            this._startCleanupTasks();
            
            this.isMonitoring = true;
            
            console.log('✅ Database health monitoring started');
            this.emit('monitoring:started');
            
        } catch (error) {
            console.error('❌ Failed to start health monitoring:', error.message);
            this.emit('monitoring:error', error);
            throw error;
        }
    }

    /**
     * Stop health monitoring
     * @returns {Promise<void>}
     */
    async stopMonitoring() {
        if (!this.isMonitoring) {
            console.log('⚠️ Health monitoring not running');
            return;
        }

        try {
            console.log('🛑 Stopping database health monitoring...');
            
            // Clear all intervals
            for (const [name, interval] of this.intervals) {
                clearInterval(interval);
                console.log(`🔄 Stopped ${name} monitoring`);
            }
            this.intervals.clear();
            
            this.isMonitoring = false;
            
            console.log('✅ Database health monitoring stopped');
            this.emit('monitoring:stopped');
            
        } catch (error) {
            console.error('❌ Error stopping health monitoring:', error.message);
            this.emit('monitoring:error', error);
            throw error;
        }
    }

    /**
     * Get current health status
     * @returns {Object} Health status
     */
    getHealthStatus() {
        return {
            ...this.currentHealth,
            monitoring: this.isMonitoring,
            uptime: this.isMonitoring ? Date.now() - this.startTime : 0,
            performance: { ...this.performanceMetrics },
            query_stats: { ...this.queryStats },
            thresholds: {
                response_time: this.config.response_time_threshold,
                connection_usage: this.config.connection_threshold,
                slow_query: this.config.slow_query_threshold,
                error_rate: this.config.error_rate_threshold
            }
        };
    }

    /**
     * Get performance metrics
     * @returns {Object} Performance metrics
     */
    getPerformanceMetrics() {
        return {
            current: { ...this.performanceMetrics },
            history: this.metricsHistory.slice(-100), // Last 100 data points
            averages: this._calculateAverages(),
            trends: this._calculateTrends()
        };
    }

    /**
     * Get health history
     * @param {number} hours - Hours of history to retrieve
     * @returns {Array} Health history
     */
    getHealthHistory(hours = 24) {
        const cutoff = Date.now() - (hours * 60 * 60 * 1000);
        return this.healthHistory.filter(entry => entry.timestamp > cutoff);
    }

    /**
     * Get alert history
     * @param {number} hours - Hours of history to retrieve
     * @returns {Array} Alert history
     */
    getAlertHistory(hours = 24) {
        const cutoff = Date.now() - (hours * 60 * 60 * 1000);
        return this.alertHistory.filter(alert => alert.timestamp > cutoff);
    }

    /**
     * Force health check
     * @returns {Promise<Object>} Health check result
     */
    async forceHealthCheck() {
        console.log('🔄 Performing forced health check...');
        return await this._performHealthCheck();
    }

    /**
     * Start health checks
     * @private
     */
    _startHealthChecks() {
        const interval = setInterval(async () => {
            try {
                await this._performHealthCheck();
            } catch (error) {
                console.error('❌ Health check failed:', error.message);
                this._updateHealthStatus('unhealthy', null, [error.message]);
            }
        }, this.config.health_check_interval);
        
        this.intervals.set('health_checks', interval);
        console.log(`💓 Health checks started (interval: ${this.config.health_check_interval}ms)`);
    }

    /**
     * Start performance monitoring
     * @private
     */
    _startPerformanceMonitoring() {
        const interval = setInterval(async () => {
            try {
                await this._collectPerformanceMetrics();
            } catch (error) {
                console.error('❌ Performance monitoring failed:', error.message);
            }
        }, this.config.performance_check_interval);
        
        this.intervals.set('performance_monitoring', interval);
        console.log(`📊 Performance monitoring started (interval: ${this.config.performance_check_interval}ms)`);
    }

    /**
     * Start metrics collection
     * @private
     */
    _startMetricsCollection() {
        const interval = setInterval(() => {
            this._collectMetrics();
        }, this.config.metrics_collection_interval);
        
        this.intervals.set('metrics_collection', interval);
        console.log(`📈 Metrics collection started (interval: ${this.config.metrics_collection_interval}ms)`);
    }

    /**
     * Start cleanup tasks
     * @private
     */
    _startCleanupTasks() {
        const interval = setInterval(() => {
            this._cleanupOldData();
        }, 3600000); // Run every hour
        
        this.intervals.set('cleanup_tasks', interval);
        console.log('🧹 Cleanup tasks started (interval: 1 hour)');
    }

    /**
     * Perform health check
     * @private
     */
    async _performHealthCheck() {
        const startTime = Date.now();
        const errors = [];
        const warnings = [];
        
        try {
            // Basic connectivity test
            const result = await this.connection.query('SELECT NOW() as current_time, version() as version');
            const responseTime = Date.now() - startTime;
            
            // Check response time
            if (responseTime > this.config.response_time_threshold) {
                warnings.push(`Slow response time: ${responseTime}ms`);
            }
            
            // Check connection pool status
            const poolHealth = this.connection.getHealth();
            if (poolHealth.poolStats) {
                const connectionUsage = (poolHealth.poolStats.totalCount / this.config.connection_threshold) * 100;
                if (connectionUsage > this.config.connection_threshold) {
                    warnings.push(`High connection usage: ${connectionUsage.toFixed(1)}%`);
                }
            }
            
            // Check query performance
            const queryMetrics = this.connection.getMetrics();
            if (queryMetrics.errorRate > this.config.error_rate_threshold) {
                errors.push(`High error rate: ${queryMetrics.errorRate.toFixed(1)}%`);
            }
            
            if (queryMetrics.slowQueryRate > 10) { // 10% slow queries
                warnings.push(`High slow query rate: ${queryMetrics.slowQueryRate.toFixed(1)}%`);
            }
            
            // Determine overall status
            const status = errors.length > 0 ? 'unhealthy' : warnings.length > 0 ? 'warning' : 'healthy';
            
            this._updateHealthStatus(status, responseTime, errors, warnings);
            
            // Check for alerts
            if (this.config.enable_alerts) {
                this._checkAlerts(status, responseTime, errors, warnings);
            }
            
            return {
                status,
                responseTime,
                errors,
                warnings,
                timestamp: new Date()
            };
            
        } catch (error) {
            const responseTime = Date.now() - startTime;
            errors.push(error.message);
            
            this._updateHealthStatus('unhealthy', responseTime, errors);
            
            if (this.config.enable_alerts) {
                this._sendAlert('health_check_failed', error.message, 'critical');
            }
            
            throw error;
        }
    }

    /**
     * Collect performance metrics
     * @private
     */
    async _collectPerformanceMetrics() {
        try {
            // Database-specific metrics
            const dbMetrics = await this._getDatabaseMetrics();
            
            // System metrics (if available)
            const systemMetrics = await this._getSystemMetrics();
            
            // Connection metrics
            const connectionMetrics = this._getConnectionMetrics();
            
            // Query metrics
            const queryMetrics = this._getQueryMetrics();
            
            // Update performance metrics
            this.performanceMetrics = {
                ...dbMetrics,
                ...systemMetrics,
                ...connectionMetrics,
                ...queryMetrics,
                timestamp: Date.now()
            };
            
            // Store in history
            this.metricsHistory.push({
                ...this.performanceMetrics,
                timestamp: Date.now()
            });
            
            // Check performance thresholds
            this._checkPerformanceThresholds();
            
            this.emit('metrics:collected', this.performanceMetrics);
            
        } catch (error) {
            console.error('❌ Failed to collect performance metrics:', error.message);
        }
    }

    /**
     * Get database-specific metrics
     * @private
     */
    async _getDatabaseMetrics() {
        try {
            // Get database size and statistics
            const sizeQuery = `
                SELECT 
                    pg_database_size(current_database()) as db_size,
                    (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
                    (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections
            `;
            
            const sizeResult = await this.connection.query(sizeQuery);
            const sizeData = sizeResult.rows[0];
            
            // Get cache hit ratio
            const cacheQuery = `
                SELECT 
                    round(
                        (sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read))) * 100, 2
                    ) as cache_hit_ratio
                FROM pg_statio_user_tables
            `;
            
            const cacheResult = await this.connection.query(cacheQuery);
            const cacheHitRatio = cacheResult.rows[0]?.cache_hit_ratio || 0;
            
            // Get slow queries count
            const slowQueriesQuery = `
                SELECT count(*) as slow_queries
                FROM pg_stat_statements 
                WHERE mean_exec_time > $1
            `;
            
            let slowQueries = 0;
            try {
                const slowResult = await this.connection.query(slowQueriesQuery, [this.config.slow_query_threshold]);
                slowQueries = slowResult.rows[0]?.slow_queries || 0;
            } catch (error) {
                // pg_stat_statements might not be available
                console.debug('pg_stat_statements not available for slow query tracking');
            }
            
            return {
                db_size: parseInt(sizeData.db_size),
                active_connections: parseInt(sizeData.active_connections),
                total_connections: parseInt(sizeData.max_connections),
                connection_usage: (parseInt(sizeData.active_connections) / parseInt(sizeData.max_connections)) * 100,
                cache_hit_ratio: parseFloat(cacheHitRatio),
                slow_queries: parseInt(slowQueries)
            };
            
        } catch (error) {
            console.error('❌ Failed to get database metrics:', error.message);
            return {};
        }
    }

    /**
     * Get system metrics (simplified - would integrate with system monitoring)
     * @private
     */
    async _getSystemMetrics() {
        // In a real implementation, this would integrate with system monitoring tools
        // For now, return simulated metrics
        return {
            cpu_usage: Math.random() * 100,
            memory_usage: Math.random() * 100,
            disk_usage: Math.random() * 100
        };
    }

    /**
     * Get connection metrics
     * @private
     */
    _getConnectionMetrics() {
        if (!this.connection) return {};
        
        const health = this.connection.getHealth();
        const metrics = this.connection.getMetrics();
        
        return {
            pool_total_count: health.poolStats?.totalCount || 0,
            pool_idle_count: health.poolStats?.idleCount || 0,
            pool_waiting_count: health.poolStats?.waitingCount || 0,
            queries_per_second: this._calculateQueriesPerSecond(),
            avg_query_time: metrics.avgExecutionTime || 0,
            error_rate: metrics.successRate ? 100 - metrics.successRate : 0
        };
    }

    /**
     * Get query metrics
     * @private
     */
    _getQueryMetrics() {
        const totalQueries = this.queryStats.total;
        
        return {
            total_queries: totalQueries,
            successful_queries: this.queryStats.successful,
            failed_queries: this.queryStats.failed,
            slow_queries_count: this.queryStats.slow,
            query_success_rate: totalQueries > 0 ? (this.queryStats.successful / totalQueries) * 100 : 0,
            query_error_rate: totalQueries > 0 ? (this.queryStats.failed / totalQueries) * 100 : 0,
            avg_query_execution_time: totalQueries > 0 ? this.queryStats.totalTime / totalQueries : 0
        };
    }

    /**
     * Calculate queries per second
     * @private
     */
    _calculateQueriesPerSecond() {
        if (this.metricsHistory.length < 2) return 0;
        
        const current = this.metricsHistory[this.metricsHistory.length - 1];
        const previous = this.metricsHistory[this.metricsHistory.length - 2];
        
        const timeDiff = (current.timestamp - previous.timestamp) / 1000; // seconds
        const queryDiff = (current.total_queries || 0) - (previous.total_queries || 0);
        
        return timeDiff > 0 ? queryDiff / timeDiff : 0;
    }

    /**
     * Check performance thresholds
     * @private
     */
    _checkPerformanceThresholds() {
        const metrics = this.performanceMetrics;
        
        // CPU threshold
        if (metrics.cpu_usage > this.config.cpu_threshold) {
            this._sendAlert('high_cpu_usage', `CPU usage: ${metrics.cpu_usage.toFixed(1)}%`, 'warning');
        }
        
        // Memory threshold
        if (metrics.memory_usage > this.config.memory_threshold) {
            this._sendAlert('high_memory_usage', `Memory usage: ${metrics.memory_usage.toFixed(1)}%`, 'warning');
        }
        
        // Disk threshold
        if (metrics.disk_usage > this.config.disk_threshold) {
            this._sendAlert('high_disk_usage', `Disk usage: ${metrics.disk_usage.toFixed(1)}%`, 'critical');
        }
        
        // Connection threshold
        if (metrics.connection_usage > this.config.connection_threshold) {
            this._sendAlert('high_connection_usage', `Connection usage: ${metrics.connection_usage.toFixed(1)}%`, 'warning');
        }
        
        // Error rate threshold
        if (metrics.error_rate > this.config.error_rate_threshold) {
            this._sendAlert('high_error_rate', `Error rate: ${metrics.error_rate.toFixed(1)}%`, 'critical');
        }
    }

    /**
     * Update health status
     * @private
     */
    _updateHealthStatus(status, responseTime, errors = [], warnings = []) {
        this.currentHealth = {
            status,
            lastCheck: new Date(),
            responseTime,
            errors: [...errors],
            warnings: [...warnings]
        };
        
        // Store in history
        this.healthHistory.push({
            ...this.currentHealth,
            timestamp: Date.now()
        });
        
        this.emit('health:updated', this.currentHealth);
    }

    /**
     * Check for alerts
     * @private
     */
    _checkAlerts(status, responseTime, errors, warnings) {
        // Health status alerts
        if (status === 'unhealthy') {
            this._sendAlert('database_unhealthy', errors.join(', '), 'critical');
        } else if (status === 'warning') {
            this._sendAlert('database_warning', warnings.join(', '), 'warning');
        }
        
        // Response time alerts
        if (responseTime > this.config.response_time_threshold * 2) {
            this._sendAlert('slow_response_time', `Response time: ${responseTime}ms`, 'warning');
        }
    }

    /**
     * Send alert
     * @private
     */
    _sendAlert(type, message, severity = 'info') {
        const now = Date.now();
        const alertKey = `${type}_${severity}`;
        
        // Check cooldown
        const lastAlert = this.lastAlerts.get(alertKey);
        if (lastAlert && (now - lastAlert) < this.config.alert_cooldown) {
            return; // Still in cooldown
        }
        
        // Check rate limiting
        const hourKey = Math.floor(now / 3600000); // Current hour
        const hourlyCount = this.alertCounts.get(hourKey) || 0;
        if (hourlyCount >= this.config.max_alerts_per_hour) {
            return; // Rate limit exceeded
        }
        
        // Create alert
        const alert = {
            id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type,
            message,
            severity,
            timestamp: now,
            acknowledged: false
        };
        
        // Store alert
        this.alertHistory.push(alert);
        this.lastAlerts.set(alertKey, now);
        this.alertCounts.set(hourKey, hourlyCount + 1);
        
        console.log(`🚨 Alert [${severity.toUpperCase()}]: ${type} - ${message}`);
        this.emit('alert:triggered', alert);
        
        return alert;
    }

    /**
     * Collect general metrics
     * @private
     */
    _collectMetrics() {
        // Update query stats from connection
        if (this.connection) {
            const connectionMetrics = this.connection.getMetrics();
            this.queryStats = {
                total: connectionMetrics.total || 0,
                successful: connectionMetrics.successful || 0,
                failed: connectionMetrics.failed || 0,
                slow: connectionMetrics.slowQueries || 0,
                totalTime: connectionMetrics.totalExecutionTime || 0
            };
        }
        
        this.emit('metrics:updated', this.queryStats);
    }

    /**
     * Calculate averages from metrics history
     * @private
     */
    _calculateAverages() {
        if (this.metricsHistory.length === 0) return {};
        
        const metrics = this.metricsHistory.slice(-60); // Last 60 data points
        const keys = Object.keys(metrics[0]).filter(key => key !== 'timestamp' && typeof metrics[0][key] === 'number');
        
        const averages = {};
        keys.forEach(key => {
            const values = metrics.map(m => m[key]).filter(v => v !== null && v !== undefined);
            averages[key] = values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
        });
        
        return averages;
    }

    /**
     * Calculate trends from metrics history
     * @private
     */
    _calculateTrends() {
        if (this.metricsHistory.length < 10) return {};
        
        const recent = this.metricsHistory.slice(-10);
        const older = this.metricsHistory.slice(-20, -10);
        
        if (older.length === 0) return {};
        
        const trends = {};
        const keys = Object.keys(recent[0]).filter(key => key !== 'timestamp' && typeof recent[0][key] === 'number');
        
        keys.forEach(key => {
            const recentAvg = recent.reduce((sum, m) => sum + (m[key] || 0), 0) / recent.length;
            const olderAvg = older.reduce((sum, m) => sum + (m[key] || 0), 0) / older.length;
            
            if (olderAvg > 0) {
                const change = ((recentAvg - olderAvg) / olderAvg) * 100;
                trends[key] = {
                    change_percent: change,
                    direction: change > 5 ? 'increasing' : change < -5 ? 'decreasing' : 'stable'
                };
            }
        });
        
        return trends;
    }

    /**
     * Cleanup old data
     * @private
     */
    _cleanupOldData() {
        const now = Date.now();
        
        // Cleanup metrics history
        const metricsRetention = this.config.metrics_retention_hours * 60 * 60 * 1000;
        this.metricsHistory = this.metricsHistory.filter(entry => 
            (now - entry.timestamp) < metricsRetention
        );
        
        // Cleanup health history
        const healthRetention = this.config.health_history_retention_hours * 60 * 60 * 1000;
        this.healthHistory = this.healthHistory.filter(entry => 
            (now - entry.timestamp) < healthRetention
        );
        
        // Cleanup alert history (keep last 1000 alerts)
        if (this.alertHistory.length > 1000) {
            this.alertHistory = this.alertHistory.slice(-1000);
        }
        
        // Cleanup alert counts (remove old hours)
        const currentHour = Math.floor(now / 3600000);
        for (const [hour, count] of this.alertCounts) {
            if (currentHour - hour > 24) { // Remove counts older than 24 hours
                this.alertCounts.delete(hour);
            }
        }
        
        console.log('🧹 Cleaned up old monitoring data');
    }
}

export default DatabaseHealthMonitor;

