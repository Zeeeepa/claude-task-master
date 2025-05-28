/**
 * @fileoverview Error Monitor
 * @description Comprehensive error monitoring and alerting system
 */

import { log } from '../utils/getVersion.js';
import { EventEmitter } from 'events';
import { ErrorSeverity, ErrorCategory, ErrorSource } from '../recovery/error-handler.js';

/**
 * Alert levels
 */
export const AlertLevel = {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    CRITICAL: 'critical'
};

/**
 * Alert channels
 */
export const AlertChannel = {
    LOG: 'log',
    EMAIL: 'email',
    SLACK: 'slack',
    WEBHOOK: 'webhook',
    SMS: 'sms'
};

/**
 * Monitoring metrics
 */
export const MonitoringMetric = {
    ERROR_RATE: 'error_rate',
    RESPONSE_TIME: 'response_time',
    AVAILABILITY: 'availability',
    THROUGHPUT: 'throughput',
    CIRCUIT_BREAKER_STATE: 'circuit_breaker_state',
    RECOVERY_SUCCESS_RATE: 'recovery_success_rate'
};

/**
 * Error Monitor for comprehensive monitoring and alerting
 */
export class ErrorMonitor extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            enableRealTimeMonitoring: config.enableRealTimeMonitoring !== false,
            enableAlerting: config.enableAlerting !== false,
            enableMetrics: config.enableMetrics !== false,
            enableTrending: config.enableTrending !== false,
            monitoringInterval: config.monitoringInterval || 60000, // 1 minute
            alertingInterval: config.alertingInterval || 30000, // 30 seconds
            metricsRetention: config.metricsRetention || 86400000, // 24 hours
            alertThresholds: {
                errorRate: 0.1, // 10%
                responseTime: 5000, // 5 seconds
                availability: 0.95, // 95%
                ...config.alertThresholds
            },
            alertChannels: config.alertChannels || [AlertChannel.LOG],
            ...config
        };

        // Monitoring data
        this.errorMetrics = new Map(); // source -> metrics
        this.alertHistory = [];
        this.activeAlerts = new Map(); // alertId -> alert
        this.metricHistory = new Map(); // metric -> history[]
        this.thresholdViolations = new Map(); // threshold -> violations[]
        
        // Alert channels
        this.alertChannels = new Map(); // channel -> handler
        this._initializeAlertChannels();
        
        // Monitoring intervals
        if (this.config.enableRealTimeMonitoring) {
            this.monitoringInterval = setInterval(() => {
                this._performMonitoring();
            }, this.config.monitoringInterval);
        }
        
        if (this.config.enableAlerting) {
            this.alertingInterval = setInterval(() => {
                this._checkAlertConditions();
            }, this.config.alertingInterval);
        }
        
        // Cleanup interval
        this.cleanupInterval = setInterval(() => {
            this._cleanupOldData();
        }, 3600000); // Every hour
    }

    /**
     * Record error for monitoring
     * @param {Object} errorInfo - Error information
     */
    recordError(errorInfo) {
        const source = errorInfo.source || ErrorSource.SYSTEM;
        
        // Initialize metrics for source if not exists
        if (!this.errorMetrics.has(source)) {
            this.errorMetrics.set(source, {
                totalErrors: 0,
                errorsByCategory: new Map(),
                errorsBySeverity: new Map(),
                recentErrors: [],
                lastError: null,
                errorRate: 0,
                availability: 1,
                responseTime: 0,
                recoveryAttempts: 0,
                recoverySuccesses: 0
            });
        }
        
        const metrics = this.errorMetrics.get(source);
        
        // Update metrics
        metrics.totalErrors++;
        metrics.lastError = errorInfo;
        metrics.recentErrors.push({
            timestamp: errorInfo.timestamp,
            category: errorInfo.category,
            severity: errorInfo.severity,
            message: errorInfo.message
        });
        
        // Update category counts
        const categoryCount = metrics.errorsByCategory.get(errorInfo.category) || 0;
        metrics.errorsByCategory.set(errorInfo.category, categoryCount + 1);
        
        // Update severity counts
        const severityCount = metrics.errorsBySeverity.get(errorInfo.severity) || 0;
        metrics.errorsBySeverity.set(errorInfo.severity, severityCount + 1);
        
        // Keep only recent errors (last hour)
        const oneHourAgo = Date.now() - 3600000;
        metrics.recentErrors = metrics.recentErrors.filter(
            error => error.timestamp.getTime() > oneHourAgo
        );
        
        // Calculate error rate
        metrics.errorRate = this._calculateErrorRate(source);
        
        // Record metric history
        this._recordMetricHistory(source, MonitoringMetric.ERROR_RATE, metrics.errorRate);
        
        // Emit monitoring event
        this.emit('error-recorded', {
            source,
            errorInfo,
            metrics: this._getMetricsSummary(source)
        });
        
        // Check for immediate alerts
        if (this.config.enableAlerting) {
            this._checkImmediateAlerts(source, errorInfo);
        }
    }

    /**
     * Record recovery attempt
     * @param {string} source - Error source
     * @param {boolean} success - Whether recovery was successful
     * @param {Object} details - Recovery details
     */
    recordRecovery(source, success, details = {}) {
        const metrics = this.errorMetrics.get(source);
        if (!metrics) return;
        
        metrics.recoveryAttempts++;
        if (success) {
            metrics.recoverySuccesses++;
        }
        
        const successRate = metrics.recoveryAttempts > 0 ? 
            metrics.recoverySuccesses / metrics.recoveryAttempts : 0;
        
        this._recordMetricHistory(source, MonitoringMetric.RECOVERY_SUCCESS_RATE, successRate);
        
        this.emit('recovery-recorded', {
            source,
            success,
            successRate,
            details
        });
    }

    /**
     * Record response time
     * @param {string} source - Service source
     * @param {number} responseTime - Response time in milliseconds
     */
    recordResponseTime(source, responseTime) {
        const metrics = this.errorMetrics.get(source);
        if (!metrics) return;
        
        metrics.responseTime = responseTime;
        this._recordMetricHistory(source, MonitoringMetric.RESPONSE_TIME, responseTime);
        
        this.emit('response-time-recorded', {
            source,
            responseTime
        });
    }

    /**
     * Record availability status
     * @param {string} source - Service source
     * @param {boolean} available - Whether service is available
     */
    recordAvailability(source, available) {
        const metrics = this.errorMetrics.get(source);
        if (!metrics) return;
        
        metrics.availability = available ? 1 : 0;
        this._recordMetricHistory(source, MonitoringMetric.AVAILABILITY, metrics.availability);
        
        this.emit('availability-recorded', {
            source,
            available
        });
    }

    /**
     * Create alert
     * @param {Object} alertInfo - Alert information
     * @returns {string} Alert ID
     */
    createAlert(alertInfo) {
        const alertId = this._generateAlertId();
        
        const alert = {
            id: alertId,
            level: alertInfo.level || AlertLevel.WARNING,
            source: alertInfo.source,
            metric: alertInfo.metric,
            message: alertInfo.message,
            threshold: alertInfo.threshold,
            currentValue: alertInfo.currentValue,
            timestamp: Date.now(),
            acknowledged: false,
            resolved: false,
            channels: alertInfo.channels || this.config.alertChannels
        };
        
        this.activeAlerts.set(alertId, alert);
        this.alertHistory.push({ ...alert });
        
        // Send alert through configured channels
        this._sendAlert(alert);
        
        this.emit('alert-created', alert);
        
        log('warning', `Alert created: ${alert.message}`, {
            alertId,
            level: alert.level,
            source: alert.source
        });
        
        return alertId;
    }

    /**
     * Acknowledge alert
     * @param {string} alertId - Alert ID
     * @param {string} acknowledgedBy - Who acknowledged the alert
     * @returns {boolean} Whether alert was acknowledged
     */
    acknowledgeAlert(alertId, acknowledgedBy) {
        const alert = this.activeAlerts.get(alertId);
        if (!alert || alert.acknowledged) {
            return false;
        }
        
        alert.acknowledged = true;
        alert.acknowledgedBy = acknowledgedBy;
        alert.acknowledgedAt = Date.now();
        
        this.emit('alert-acknowledged', {
            alertId,
            acknowledgedBy,
            timestamp: alert.acknowledgedAt
        });
        
        return true;
    }

    /**
     * Resolve alert
     * @param {string} alertId - Alert ID
     * @param {string} resolvedBy - Who resolved the alert
     * @param {string} resolution - Resolution details
     * @returns {boolean} Whether alert was resolved
     */
    resolveAlert(alertId, resolvedBy, resolution) {
        const alert = this.activeAlerts.get(alertId);
        if (!alert || alert.resolved) {
            return false;
        }
        
        alert.resolved = true;
        alert.resolvedBy = resolvedBy;
        alert.resolvedAt = Date.now();
        alert.resolution = resolution;
        
        this.activeAlerts.delete(alertId);
        
        this.emit('alert-resolved', {
            alertId,
            resolvedBy,
            resolution,
            timestamp: alert.resolvedAt
        });
        
        return true;
    }

    /**
     * Get monitoring dashboard data
     * @returns {Object} Dashboard data
     */
    getDashboardData() {
        const dashboard = {
            timestamp: Date.now(),
            summary: {
                totalSources: this.errorMetrics.size,
                activeAlerts: this.activeAlerts.size,
                totalErrors: 0,
                averageErrorRate: 0,
                averageAvailability: 0,
                averageResponseTime: 0
            },
            sources: {},
            alerts: Array.from(this.activeAlerts.values()),
            trends: this._getTrends()
        };
        
        let totalErrorRate = 0;
        let totalAvailability = 0;
        let totalResponseTime = 0;
        let sourceCount = 0;
        
        // Aggregate metrics by source
        for (const [source, metrics] of this.errorMetrics.entries()) {
            dashboard.summary.totalErrors += metrics.totalErrors;
            totalErrorRate += metrics.errorRate;
            totalAvailability += metrics.availability;
            totalResponseTime += metrics.responseTime;
            sourceCount++;
            
            dashboard.sources[source] = this._getMetricsSummary(source);
        }
        
        // Calculate averages
        if (sourceCount > 0) {
            dashboard.summary.averageErrorRate = totalErrorRate / sourceCount;
            dashboard.summary.averageAvailability = totalAvailability / sourceCount;
            dashboard.summary.averageResponseTime = totalResponseTime / sourceCount;
        }
        
        return dashboard;
    }

    /**
     * Get metrics for specific source
     * @param {string} source - Source to get metrics for
     * @returns {Object|null} Metrics summary
     */
    getSourceMetrics(source) {
        if (!this.errorMetrics.has(source)) {
            return null;
        }
        
        return this._getMetricsSummary(source);
    }

    /**
     * Get alert history
     * @param {Object} filters - Filters for alert history
     * @returns {Array} Alert history
     */
    getAlertHistory(filters = {}) {
        let history = [...this.alertHistory];
        
        // Apply filters
        if (filters.source) {
            history = history.filter(alert => alert.source === filters.source);
        }
        
        if (filters.level) {
            history = history.filter(alert => alert.level === filters.level);
        }
        
        if (filters.startTime) {
            history = history.filter(alert => alert.timestamp >= filters.startTime);
        }
        
        if (filters.endTime) {
            history = history.filter(alert => alert.timestamp <= filters.endTime);
        }
        
        // Sort by timestamp (newest first)
        history.sort((a, b) => b.timestamp - a.timestamp);
        
        return history;
    }

    /**
     * Get metric trends
     * @param {string} source - Source to get trends for
     * @param {string} metric - Metric to get trends for
     * @param {number} timeRange - Time range in milliseconds
     * @returns {Array} Trend data
     */
    getMetricTrends(source, metric, timeRange = 3600000) {
        const key = `${source}:${metric}`;
        const history = this.metricHistory.get(key) || [];
        
        const cutoff = Date.now() - timeRange;
        return history.filter(point => point.timestamp > cutoff);
    }

    /**
     * Set alert threshold
     * @param {string} metric - Metric name
     * @param {number} threshold - Threshold value
     */
    setAlertThreshold(metric, threshold) {
        this.config.alertThresholds[metric] = threshold;
        
        this.emit('threshold-updated', {
            metric,
            threshold,
            timestamp: Date.now()
        });
    }

    /**
     * Add alert channel
     * @param {string} channel - Channel type
     * @param {Function} handler - Channel handler function
     */
    addAlertChannel(channel, handler) {
        this.alertChannels.set(channel, handler);
    }

    // Private methods

    _performMonitoring() {
        // Collect current metrics
        for (const [source, metrics] of this.errorMetrics.entries()) {
            // Update error rate
            metrics.errorRate = this._calculateErrorRate(source);
            this._recordMetricHistory(source, MonitoringMetric.ERROR_RATE, metrics.errorRate);
            
            // Emit monitoring update
            this.emit('monitoring-update', {
                source,
                metrics: this._getMetricsSummary(source)
            });
        }
    }

    _checkAlertConditions() {
        for (const [source, metrics] of this.errorMetrics.entries()) {
            this._checkThreshold(source, MonitoringMetric.ERROR_RATE, metrics.errorRate);
            this._checkThreshold(source, MonitoringMetric.RESPONSE_TIME, metrics.responseTime);
            this._checkThreshold(source, MonitoringMetric.AVAILABILITY, metrics.availability);
        }
    }

    _checkImmediateAlerts(source, errorInfo) {
        // Check for critical errors
        if (errorInfo.severity === ErrorSeverity.CRITICAL) {
            this.createAlert({
                level: AlertLevel.CRITICAL,
                source,
                metric: 'error_severity',
                message: `Critical error in ${source}: ${errorInfo.message}`,
                currentValue: errorInfo.severity
            });
        }
        
        // Check for error patterns
        const metrics = this.errorMetrics.get(source);
        if (metrics.recentErrors.length >= 5) {
            const recentErrorsInMinute = metrics.recentErrors.filter(
                error => Date.now() - error.timestamp.getTime() < 60000
            );
            
            if (recentErrorsInMinute.length >= 5) {
                this.createAlert({
                    level: AlertLevel.ERROR,
                    source,
                    metric: 'error_burst',
                    message: `Error burst detected in ${source}: ${recentErrorsInMinute.length} errors in 1 minute`,
                    currentValue: recentErrorsInMinute.length
                });
            }
        }
    }

    _checkThreshold(source, metric, currentValue) {
        const thresholdKey = metric.replace('_', '');
        const threshold = this.config.alertThresholds[thresholdKey];
        
        if (threshold === undefined) return;
        
        let violated = false;
        let level = AlertLevel.WARNING;
        
        switch (metric) {
            case MonitoringMetric.ERROR_RATE:
                violated = currentValue > threshold;
                level = currentValue > threshold * 2 ? AlertLevel.ERROR : AlertLevel.WARNING;
                break;
                
            case MonitoringMetric.RESPONSE_TIME:
                violated = currentValue > threshold;
                level = currentValue > threshold * 2 ? AlertLevel.ERROR : AlertLevel.WARNING;
                break;
                
            case MonitoringMetric.AVAILABILITY:
                violated = currentValue < threshold;
                level = currentValue < threshold * 0.8 ? AlertLevel.CRITICAL : AlertLevel.ERROR;
                break;
        }
        
        if (violated) {
            // Check if we already have an active alert for this condition
            const existingAlert = Array.from(this.activeAlerts.values()).find(
                alert => alert.source === source && alert.metric === metric
            );
            
            if (!existingAlert) {
                this.createAlert({
                    level,
                    source,
                    metric,
                    message: `${metric} threshold violated for ${source}`,
                    threshold,
                    currentValue
                });
            }
        }
    }

    _calculateErrorRate(source) {
        const metrics = this.errorMetrics.get(source);
        if (!metrics || metrics.recentErrors.length === 0) return 0;
        
        const oneHourAgo = Date.now() - 3600000;
        const recentErrors = metrics.recentErrors.filter(
            error => error.timestamp.getTime() > oneHourAgo
        );
        
        // Simplified calculation - in practice, you'd need total request count
        return recentErrors.length / 100; // Assuming 100 requests per hour baseline
    }

    _recordMetricHistory(source, metric, value) {
        const key = `${source}:${metric}`;
        
        if (!this.metricHistory.has(key)) {
            this.metricHistory.set(key, []);
        }
        
        const history = this.metricHistory.get(key);
        history.push({
            timestamp: Date.now(),
            value
        });
        
        // Keep only recent history
        const cutoff = Date.now() - this.config.metricsRetention;
        this.metricHistory.set(key, history.filter(point => point.timestamp > cutoff));
    }

    _getMetricsSummary(source) {
        const metrics = this.errorMetrics.get(source);
        if (!metrics) return null;
        
        return {
            source,
            totalErrors: metrics.totalErrors,
            recentErrors: metrics.recentErrors.length,
            errorRate: metrics.errorRate,
            availability: metrics.availability,
            responseTime: metrics.responseTime,
            recoverySuccessRate: metrics.recoveryAttempts > 0 ? 
                metrics.recoverySuccesses / metrics.recoveryAttempts : 0,
            lastError: metrics.lastError,
            errorsByCategory: Object.fromEntries(metrics.errorsByCategory),
            errorsBySeverity: Object.fromEntries(metrics.errorsBySeverity)
        };
    }

    _getTrends() {
        const trends = {};
        
        for (const [key, history] of this.metricHistory.entries()) {
            const [source, metric] = key.split(':');
            
            if (!trends[source]) {
                trends[source] = {};
            }
            
            if (history.length >= 2) {
                const recent = history.slice(-10); // Last 10 points
                const trend = this._calculateTrend(recent);
                trends[source][metric] = trend;
            }
        }
        
        return trends;
    }

    _calculateTrend(dataPoints) {
        if (dataPoints.length < 2) return 'stable';
        
        const values = dataPoints.map(point => point.value);
        const first = values[0];
        const last = values[values.length - 1];
        
        const change = (last - first) / first;
        
        if (Math.abs(change) < 0.1) return 'stable';
        return change > 0 ? 'increasing' : 'decreasing';
    }

    _initializeAlertChannels() {
        // Log channel (default)
        this.alertChannels.set(AlertChannel.LOG, (alert) => {
            log(alert.level, `ALERT: ${alert.message}`, {
                alertId: alert.id,
                source: alert.source,
                metric: alert.metric,
                currentValue: alert.currentValue,
                threshold: alert.threshold
            });
        });
        
        // Additional channels would be implemented here
        // Email, Slack, Webhook, SMS, etc.
    }

    _sendAlert(alert) {
        for (const channelType of alert.channels) {
            const handler = this.alertChannels.get(channelType);
            if (handler) {
                try {
                    handler(alert);
                } catch (error) {
                    log('error', `Failed to send alert through ${channelType}`, {
                        alertId: alert.id,
                        error: error.message
                    });
                }
            }
        }
    }

    _cleanupOldData() {
        const cutoff = Date.now() - this.config.metricsRetention;
        
        // Clean up metric history
        for (const [key, history] of this.metricHistory.entries()) {
            const recentHistory = history.filter(point => point.timestamp > cutoff);
            this.metricHistory.set(key, recentHistory);
        }
        
        // Clean up alert history
        this.alertHistory = this.alertHistory.filter(alert => alert.timestamp > cutoff);
        
        // Clean up recent errors
        for (const metrics of this.errorMetrics.values()) {
            metrics.recentErrors = metrics.recentErrors.filter(
                error => error.timestamp.getTime() > cutoff
            );
        }
    }

    _generateAlertId() {
        return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get monitoring statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        const stats = {
            totalSources: this.errorMetrics.size,
            totalErrors: 0,
            activeAlerts: this.activeAlerts.size,
            totalAlerts: this.alertHistory.length,
            alertsByLevel: {},
            sourceStats: {}
        };
        
        // Count errors by source
        for (const [source, metrics] of this.errorMetrics.entries()) {
            stats.totalErrors += metrics.totalErrors;
            stats.sourceStats[source] = {
                errors: metrics.totalErrors,
                errorRate: metrics.errorRate,
                availability: metrics.availability
            };
        }
        
        // Count alerts by level
        for (const alert of this.alertHistory) {
            stats.alertsByLevel[alert.level] = (stats.alertsByLevel[alert.level] || 0) + 1;
        }
        
        return stats;
    }

    /**
     * Reset all monitoring data
     */
    reset() {
        this.errorMetrics.clear();
        this.alertHistory = [];
        this.activeAlerts.clear();
        this.metricHistory.clear();
        this.thresholdViolations.clear();
    }

    /**
     * Cleanup resources
     */
    destroy() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
        
        if (this.alertingInterval) {
            clearInterval(this.alertingInterval);
        }
        
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        this.removeAllListeners();
    }
}

export default ErrorMonitor;

