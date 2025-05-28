/**
 * @fileoverview Failure Tracking
 * @description Failure rate monitoring and tracking system
 */

import { log } from '../scripts/modules/utils.js';

/**
 * Tracking metrics
 */
export const TrackingMetric = {
    SUCCESS_RATE: 'success_rate',
    FAILURE_RATE: 'failure_rate',
    MTTR: 'mttr', // Mean Time To Recovery
    MTBF: 'mtbf', // Mean Time Between Failures
    AVAILABILITY: 'availability'
};

/**
 * Failure tracking and monitoring system
 */
export class FailureTracking {
    constructor(config = {}) {
        this.config = {
            trackingWindow: config.trackingWindow || 86400000, // 24 hours
            sampleInterval: config.sampleInterval || 300000, // 5 minutes
            alertThresholds: {
                failureRate: config.alertThresholds?.failureRate || 0.1, // 10%
                successRate: config.alertThresholds?.successRate || 0.9, // 90%
                mttr: config.alertThresholds?.mttr || 3600000, // 1 hour
                availability: config.alertThresholds?.availability || 0.95 // 95%
            },
            retentionPeriod: config.retentionPeriod || 2592000000, // 30 days
            enableAlerting: config.enableAlerting !== false,
            ...config
        };

        this.operations = new Map(); // Track individual operations
        this.metrics = new Map(); // Store calculated metrics
        this.samples = []; // Time-series data samples
        this.alerts = []; // Generated alerts
        this.trackingTimer = null;
        
        this._startTracking();
    }

    /**
     * Record operation start
     * @param {string} operationId - Operation ID
     * @param {Object} context - Operation context
     */
    startOperation(operationId, context = {}) {
        const operation = {
            id: operationId,
            startTime: Date.now(),
            context: {
                type: context.type || 'unknown',
                environment: context.environment || 'unknown',
                component: context.component || 'unknown',
                ...context
            },
            status: 'running',
            attempts: 1,
            errors: []
        };

        this.operations.set(operationId, operation);

        log('debug', 'Operation tracking started', {
            operationId,
            type: operation.context.type
        });
    }

    /**
     * Record operation success
     * @param {string} operationId - Operation ID
     * @param {Object} result - Operation result
     */
    recordSuccess(operationId, result = {}) {
        const operation = this.operations.get(operationId);
        
        if (!operation) {
            log('warn', 'Attempted to record success for unknown operation', { operationId });
            return;
        }

        operation.status = 'success';
        operation.endTime = Date.now();
        operation.duration = operation.endTime - operation.startTime;
        operation.result = result;

        this._updateMetrics(operation);

        log('debug', 'Operation success recorded', {
            operationId,
            duration: operation.duration,
            attempts: operation.attempts
        });
    }

    /**
     * Record operation failure
     * @param {string} operationId - Operation ID
     * @param {Error} error - Error that caused failure
     * @param {Object} context - Additional context
     */
    recordFailure(operationId, error, context = {}) {
        const operation = this.operations.get(operationId);
        
        if (!operation) {
            log('warn', 'Attempted to record failure for unknown operation', { operationId });
            return;
        }

        const errorRecord = {
            timestamp: Date.now(),
            message: error.message,
            type: error.constructor.name,
            stack: error.stack,
            context
        };

        operation.errors.push(errorRecord);
        operation.lastError = errorRecord;

        // Check if this is a retry or final failure
        if (context.isFinalFailure) {
            operation.status = 'failed';
            operation.endTime = Date.now();
            operation.duration = operation.endTime - operation.startTime;
            
            this._updateMetrics(operation);
        } else {
            operation.attempts++;
        }

        log('debug', 'Operation failure recorded', {
            operationId,
            attempt: operation.attempts,
            isFinal: context.isFinalFailure,
            error: error.message
        });
    }

    /**
     * Record operation retry
     * @param {string} operationId - Operation ID
     * @param {number} attemptNumber - Attempt number
     * @param {Object} context - Retry context
     */
    recordRetry(operationId, attemptNumber, context = {}) {
        const operation = this.operations.get(operationId);
        
        if (!operation) {
            log('warn', 'Attempted to record retry for unknown operation', { operationId });
            return;
        }

        operation.attempts = attemptNumber;
        operation.lastRetry = {
            timestamp: Date.now(),
            attempt: attemptNumber,
            context
        };

        log('debug', 'Operation retry recorded', {
            operationId,
            attempt: attemptNumber
        });
    }

    /**
     * Get current metrics
     * @param {string} timeWindow - Time window for metrics ('1h', '24h', '7d')
     * @returns {Object} Current metrics
     */
    getCurrentMetrics(timeWindow = '24h') {
        const windowMs = this._parseTimeWindow(timeWindow);
        const cutoff = Date.now() - windowMs;
        
        const recentOperations = Array.from(this.operations.values())
            .filter(op => op.endTime && op.endTime > cutoff);

        const metrics = this._calculateMetrics(recentOperations);
        
        // Store metrics
        this.metrics.set(timeWindow, {
            ...metrics,
            timestamp: Date.now(),
            timeWindow,
            sampleCount: recentOperations.length
        });

        return metrics;
    }

    /**
     * Calculate metrics from operations
     * @param {Array} operations - Operations to analyze
     * @returns {Object} Calculated metrics
     * @private
     */
    _calculateMetrics(operations) {
        if (operations.length === 0) {
            return {
                successRate: 0,
                failureRate: 0,
                totalOperations: 0,
                successfulOperations: 0,
                failedOperations: 0,
                averageDuration: 0,
                mttr: 0,
                mtbf: 0,
                availability: 0,
                retryRate: 0
            };
        }

        const successful = operations.filter(op => op.status === 'success');
        const failed = operations.filter(op => op.status === 'failed');
        const withRetries = operations.filter(op => op.attempts > 1);

        const successRate = successful.length / operations.length;
        const failureRate = failed.length / operations.length;
        const retryRate = withRetries.length / operations.length;

        // Calculate durations
        const durations = operations.map(op => op.duration).filter(d => d != null);
        const averageDuration = durations.length > 0 ? 
            durations.reduce((sum, d) => sum + d, 0) / durations.length : 0;

        // Calculate MTTR (Mean Time To Recovery)
        const failedDurations = failed.map(op => op.duration).filter(d => d != null);
        const mttr = failedDurations.length > 0 ? 
            failedDurations.reduce((sum, d) => sum + d, 0) / failedDurations.length : 0;

        // Calculate MTBF (Mean Time Between Failures)
        const mtbf = this._calculateMTBF(operations);

        // Calculate availability
        const totalTime = operations.reduce((sum, op) => sum + (op.duration || 0), 0);
        const downtime = failed.reduce((sum, op) => sum + (op.duration || 0), 0);
        const availability = totalTime > 0 ? (totalTime - downtime) / totalTime : 1;

        return {
            successRate,
            failureRate,
            totalOperations: operations.length,
            successfulOperations: successful.length,
            failedOperations: failed.length,
            averageDuration,
            mttr,
            mtbf,
            availability,
            retryRate,
            byType: this._getMetricsByType(operations),
            byEnvironment: this._getMetricsByEnvironment(operations),
            byComponent: this._getMetricsByComponent(operations)
        };
    }

    /**
     * Calculate Mean Time Between Failures
     * @param {Array} operations - Operations to analyze
     * @returns {number} MTBF in milliseconds
     * @private
     */
    _calculateMTBF(operations) {
        const failures = operations
            .filter(op => op.status === 'failed')
            .sort((a, b) => a.endTime - b.endTime);

        if (failures.length < 2) {
            return 0;
        }

        const intervals = [];
        for (let i = 1; i < failures.length; i++) {
            intervals.push(failures[i].endTime - failures[i - 1].endTime);
        }

        return intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    }

    /**
     * Get metrics grouped by operation type
     * @param {Array} operations - Operations to analyze
     * @returns {Object} Metrics by type
     * @private
     */
    _getMetricsByType(operations) {
        const byType = {};
        const types = [...new Set(operations.map(op => op.context.type))];

        for (const type of types) {
            const typeOps = operations.filter(op => op.context.type === type);
            byType[type] = this._calculateMetrics(typeOps);
        }

        return byType;
    }

    /**
     * Get metrics grouped by environment
     * @param {Array} operations - Operations to analyze
     * @returns {Object} Metrics by environment
     * @private
     */
    _getMetricsByEnvironment(operations) {
        const byEnvironment = {};
        const environments = [...new Set(operations.map(op => op.context.environment))];

        for (const env of environments) {
            const envOps = operations.filter(op => op.context.environment === env);
            byEnvironment[env] = this._calculateMetrics(envOps);
        }

        return byEnvironment;
    }

    /**
     * Get metrics grouped by component
     * @param {Array} operations - Operations to analyze
     * @returns {Object} Metrics by component
     * @private
     */
    _getMetricsByComponent(operations) {
        const byComponent = {};
        const components = [...new Set(operations.map(op => op.context.component))];

        for (const component of components) {
            const componentOps = operations.filter(op => op.context.component === component);
            byComponent[component] = this._calculateMetrics(componentOps);
        }

        return byComponent;
    }

    /**
     * Update metrics and check for alerts
     * @param {Object} operation - Completed operation
     * @private
     */
    _updateMetrics(operation) {
        // Update current metrics
        const metrics = this.getCurrentMetrics('24h');
        
        // Check for threshold violations
        if (this.config.enableAlerting) {
            this._checkAlertThresholds(metrics);
        }

        // Clean old operations
        this._cleanOldOperations();
    }

    /**
     * Check alert thresholds
     * @param {Object} metrics - Current metrics
     * @private
     */
    _checkAlertThresholds(metrics) {
        const alerts = [];
        const thresholds = this.config.alertThresholds;

        // Check failure rate
        if (metrics.failureRate > thresholds.failureRate) {
            alerts.push({
                type: 'high_failure_rate',
                severity: 'high',
                message: `Failure rate (${(metrics.failureRate * 100).toFixed(1)}%) exceeds threshold (${(thresholds.failureRate * 100).toFixed(1)}%)`,
                value: metrics.failureRate,
                threshold: thresholds.failureRate,
                timestamp: Date.now()
            });
        }

        // Check success rate
        if (metrics.successRate < thresholds.successRate) {
            alerts.push({
                type: 'low_success_rate',
                severity: 'high',
                message: `Success rate (${(metrics.successRate * 100).toFixed(1)}%) below threshold (${(thresholds.successRate * 100).toFixed(1)}%)`,
                value: metrics.successRate,
                threshold: thresholds.successRate,
                timestamp: Date.now()
            });
        }

        // Check MTTR
        if (metrics.mttr > thresholds.mttr) {
            alerts.push({
                type: 'high_mttr',
                severity: 'medium',
                message: `Mean Time To Recovery (${(metrics.mttr / 1000).toFixed(1)}s) exceeds threshold (${(thresholds.mttr / 1000).toFixed(1)}s)`,
                value: metrics.mttr,
                threshold: thresholds.mttr,
                timestamp: Date.now()
            });
        }

        // Check availability
        if (metrics.availability < thresholds.availability) {
            alerts.push({
                type: 'low_availability',
                severity: 'critical',
                message: `Availability (${(metrics.availability * 100).toFixed(1)}%) below threshold (${(thresholds.availability * 100).toFixed(1)}%)`,
                value: metrics.availability,
                threshold: thresholds.availability,
                timestamp: Date.now()
            });
        }

        // Store new alerts
        for (const alert of alerts) {
            this.alerts.push(alert);
            log('warn', 'Failure tracking alert generated', alert);
        }

        // Keep only recent alerts
        const alertRetention = 86400000; // 24 hours
        const cutoff = Date.now() - alertRetention;
        this.alerts = this.alerts.filter(alert => alert.timestamp > cutoff);
    }

    /**
     * Start tracking timer
     * @private
     */
    _startTracking() {
        if (this.trackingTimer) {
            clearInterval(this.trackingTimer);
        }

        this.trackingTimer = setInterval(() => {
            this._takeSample();
        }, this.config.sampleInterval);

        log('info', 'Failure tracking started', {
            sampleInterval: this.config.sampleInterval,
            trackingWindow: this.config.trackingWindow
        });
    }

    /**
     * Take a metrics sample
     * @private
     */
    _takeSample() {
        try {
            const metrics = this.getCurrentMetrics('1h');
            
            const sample = {
                timestamp: Date.now(),
                metrics: {
                    successRate: metrics.successRate,
                    failureRate: metrics.failureRate,
                    totalOperations: metrics.totalOperations,
                    averageDuration: metrics.averageDuration,
                    mttr: metrics.mttr,
                    availability: metrics.availability
                }
            };

            this.samples.push(sample);

            // Keep only samples within retention period
            const cutoff = Date.now() - this.config.retentionPeriod;
            this.samples = this.samples.filter(sample => sample.timestamp > cutoff);

            log('debug', 'Metrics sample taken', {
                successRate: metrics.successRate,
                totalOperations: metrics.totalOperations
            });

        } catch (error) {
            log('error', 'Failed to take metrics sample', { error: error.message });
        }
    }

    /**
     * Clean old operations
     * @private
     */
    _cleanOldOperations() {
        const cutoff = Date.now() - this.config.retentionPeriod;
        
        for (const [operationId, operation] of this.operations.entries()) {
            if (operation.endTime && operation.endTime < cutoff) {
                this.operations.delete(operationId);
            }
        }
    }

    /**
     * Parse time window string
     * @param {string} timeWindow - Time window string
     * @returns {number} Time window in milliseconds
     * @private
     */
    _parseTimeWindow(timeWindow) {
        const units = {
            'm': 60000,
            'h': 3600000,
            'd': 86400000,
            'w': 604800000
        };

        const match = timeWindow.match(/^(\d+)([mhdw])$/);
        if (!match) {
            return 86400000; // Default to 24 hours
        }

        const [, amount, unit] = match;
        return parseInt(amount) * (units[unit] || 3600000);
    }

    /**
     * Get time series data
     * @param {string} metric - Metric name
     * @param {string} timeWindow - Time window
     * @returns {Array} Time series data
     */
    getTimeSeries(metric = TrackingMetric.SUCCESS_RATE, timeWindow = '24h') {
        const windowMs = this._parseTimeWindow(timeWindow);
        const cutoff = Date.now() - windowMs;
        
        return this.samples
            .filter(sample => sample.timestamp > cutoff)
            .map(sample => ({
                timestamp: sample.timestamp,
                value: sample.metrics[metric] || 0
            }))
            .sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * Get active alerts
     * @returns {Array} Active alerts
     */
    getActiveAlerts() {
        const alertAge = 3600000; // 1 hour
        const cutoff = Date.now() - alertAge;
        
        return this.alerts.filter(alert => alert.timestamp > cutoff);
    }

    /**
     * Get failure tracking statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        const totalOperations = this.operations.size;
        const completedOperations = Array.from(this.operations.values())
            .filter(op => op.status !== 'running');

        return {
            totalOperations,
            completedOperations: completedOperations.length,
            runningOperations: totalOperations - completedOperations.length,
            samplesCollected: this.samples.length,
            activeAlerts: this.getActiveAlerts().length,
            retentionPeriod: this.config.retentionPeriod,
            trackingWindow: this.config.trackingWindow,
            currentMetrics: this.getCurrentMetrics('1h')
        };
    }

    /**
     * Export tracking data
     * @returns {Object} Exported data
     */
    exportData() {
        return {
            operations: Array.from(this.operations.entries()),
            samples: this.samples.slice(-1000), // Last 1000 samples
            alerts: this.alerts,
            metrics: Object.fromEntries(this.metrics),
            config: this.config
        };
    }

    /**
     * Import tracking data
     * @param {Object} data - Data to import
     */
    importData(data) {
        if (data.operations) {
            this.operations = new Map(data.operations);
        }
        
        if (data.samples) {
            this.samples = data.samples;
        }
        
        if (data.alerts) {
            this.alerts = data.alerts;
        }
        
        if (data.metrics) {
            this.metrics = new Map(Object.entries(data.metrics));
        }

        log('info', 'Failure tracking data imported', {
            operationCount: this.operations.size,
            sampleCount: this.samples.length,
            alertCount: this.alerts.length
        });
    }

    /**
     * Reset tracking state
     */
    reset() {
        this.operations.clear();
        this.metrics.clear();
        this.samples = [];
        this.alerts = [];
        
        log('info', 'Failure tracking reset');
    }

    /**
     * Stop tracking
     */
    stop() {
        if (this.trackingTimer) {
            clearInterval(this.trackingTimer);
            this.trackingTimer = null;
        }
        
        log('info', 'Failure tracking stopped');
    }
}

export default FailureTracking;

