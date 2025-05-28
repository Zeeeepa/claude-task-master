/**
 * Environment Monitor
 * 
 * Monitors WSL2 environment resources, performance metrics, and health status
 * for comprehensive system observability and alerting.
 */

import { EventEmitter } from 'events';
import AgentAPIClient from './agentapi_client.js';

export class EnvironmentMonitor extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.agentAPI = new AgentAPIClient(options.agentAPI);
        this.config = {
            monitoringInterval: options.monitoringInterval || 30000, // 30 seconds
            alertThresholds: {
                cpu: {
                    warning: 80,
                    critical: 95
                },
                memory: {
                    warning: 80,
                    critical: 95
                },
                disk: {
                    warning: 85,
                    critical: 95
                },
                network: {
                    warning: 100 * 1024 * 1024, // 100MB/s
                    critical: 500 * 1024 * 1024  // 500MB/s
                },
                ...options.alertThresholds
            },
            retentionPeriod: options.retentionPeriod || 24 * 60 * 60 * 1000, // 24 hours
            aggregationIntervals: {
                minute: 60 * 1000,
                hour: 60 * 60 * 1000,
                day: 24 * 60 * 60 * 1000
            }
        };

        this.monitoringTimer = null;
        this.environments = new Map();
        this.metrics = new Map();
        this.alerts = new Map();
        this.isMonitoring = false;
    }

    /**
     * Initialize the Environment Monitor
     * @returns {Promise<boolean>} True if initialization successful
     */
    async initialize() {
        try {
            await this.agentAPI.initialize();
            this.setupEventHandlers();
            this.emit('initialized');
            return true;
        } catch (error) {
            this.emit('error', { type: 'initialization', error });
            throw new Error(`Failed to initialize Environment Monitor: ${error.message}`);
        }
    }

    /**
     * Setup event handlers for AgentAPI
     */
    setupEventHandlers() {
        this.agentAPI.on('instanceCreated', (instance) => {
            this.addEnvironment(instance.id, instance);
        });

        this.agentAPI.on('instanceDestroyed', (data) => {
            this.removeEnvironment(data.instanceId);
        });

        this.agentAPI.on('resourceUsage', (usage) => {
            this.recordMetrics(usage.instanceId, usage);
        });
    }

    /**
     * Start monitoring all environments
     * @returns {Promise<void>}
     */
    async startMonitoring() {
        if (this.isMonitoring) {
            return;
        }

        this.isMonitoring = true;
        this.monitoringTimer = setInterval(async () => {
            await this.collectMetrics();
        }, this.config.monitoringInterval);

        // Start cleanup timer for old metrics
        this.cleanupTimer = setInterval(() => {
            this.cleanupOldMetrics();
        }, this.config.aggregationIntervals.hour);

        this.emit('monitoringStarted');
    }

    /**
     * Stop monitoring
     */
    stopMonitoring() {
        if (!this.isMonitoring) {
            return;
        }

        this.isMonitoring = false;
        
        if (this.monitoringTimer) {
            clearInterval(this.monitoringTimer);
            this.monitoringTimer = null;
        }

        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }

        this.emit('monitoringStopped');
    }

    /**
     * Add environment to monitoring
     * @param {string} instanceId - Instance ID
     * @param {Object} instanceData - Instance data
     */
    addEnvironment(instanceId, instanceData) {
        const environment = {
            instanceId,
            instanceData,
            addedAt: new Date().toISOString(),
            status: 'monitoring',
            lastMetrics: null,
            alertHistory: []
        };

        this.environments.set(instanceId, environment);
        this.metrics.set(instanceId, []);
        this.alerts.set(instanceId, []);

        this.emit('environmentAdded', environment);
    }

    /**
     * Remove environment from monitoring
     * @param {string} instanceId - Instance ID
     */
    removeEnvironment(instanceId) {
        const environment = this.environments.get(instanceId);
        if (environment) {
            environment.status = 'removed';
            environment.removedAt = new Date().toISOString();
            
            this.environments.delete(instanceId);
            this.metrics.delete(instanceId);
            this.alerts.delete(instanceId);

            this.emit('environmentRemoved', { instanceId, environment });
        }
    }

    /**
     * Collect metrics from all monitored environments
     * @returns {Promise<void>}
     */
    async collectMetrics() {
        const environments = Array.from(this.environments.keys());
        
        await Promise.all(environments.map(async (instanceId) => {
            try {
                const usage = await this.agentAPI.getResourceUsage(instanceId);
                this.recordMetrics(instanceId, usage);
                this.checkAlerts(instanceId, usage);
            } catch (error) {
                this.emit('metricsCollectionError', { instanceId, error });
            }
        }));
    }

    /**
     * Record metrics for an environment
     * @param {string} instanceId - Instance ID
     * @param {Object} usage - Resource usage data
     */
    recordMetrics(instanceId, usage) {
        const environment = this.environments.get(instanceId);
        if (!environment) {
            return;
        }

        const metrics = this.metrics.get(instanceId) || [];
        
        // Add enhanced metrics
        const enhancedUsage = {
            ...usage,
            timestamp: new Date().toISOString(),
            derived: this.calculateDerivedMetrics(usage, environment.lastMetrics)
        };

        metrics.push(enhancedUsage);
        this.metrics.set(instanceId, metrics);
        
        // Update environment
        environment.lastMetrics = enhancedUsage;
        environment.lastUpdated = enhancedUsage.timestamp;

        this.emit('metricsRecorded', { instanceId, metrics: enhancedUsage });
    }

    /**
     * Calculate derived metrics from current and previous usage
     * @param {Object} current - Current usage data
     * @param {Object} previous - Previous usage data
     * @returns {Object} Derived metrics
     */
    calculateDerivedMetrics(current, previous) {
        const derived = {
            trends: {},
            rates: {},
            efficiency: {}
        };

        if (previous) {
            const timeDiff = new Date(current.timestamp) - new Date(previous.timestamp);
            const timeDiffSeconds = timeDiff / 1000;

            // CPU trends
            derived.trends.cpu = current.cpu.usage - previous.cpu.usage;
            
            // Memory trends
            derived.trends.memory = current.memory.percentage - previous.memory.percentage;
            
            // Disk trends
            derived.trends.disk = current.disk.percentage - previous.disk.percentage;

            // Network rates (bytes per second)
            if (timeDiffSeconds > 0) {
                derived.rates.networkIn = (current.network.bytesIn - previous.network.bytesIn) / timeDiffSeconds;
                derived.rates.networkOut = (current.network.bytesOut - previous.network.bytesOut) / timeDiffSeconds;
            }

            // Efficiency metrics
            derived.efficiency.cpuEfficiency = this.calculateCPUEfficiency(current, previous);
            derived.efficiency.memoryEfficiency = this.calculateMemoryEfficiency(current, previous);
        }

        return derived;
    }

    /**
     * Calculate CPU efficiency metric
     * @param {Object} current - Current usage data
     * @param {Object} previous - Previous usage data
     * @returns {number} CPU efficiency score (0-100)
     */
    calculateCPUEfficiency(current, previous) {
        // Simple efficiency calculation based on CPU usage stability
        const cpuChange = Math.abs(current.cpu.usage - previous.cpu.usage);
        const stability = Math.max(0, 100 - cpuChange * 2);
        const utilization = Math.min(100, current.cpu.usage);
        
        // Optimal efficiency is around 60-80% CPU usage with low volatility
        const optimalRange = current.cpu.usage >= 60 && current.cpu.usage <= 80;
        const efficiencyBonus = optimalRange ? 20 : 0;
        
        return Math.min(100, (stability * 0.6) + (utilization * 0.2) + efficiencyBonus);
    }

    /**
     * Calculate memory efficiency metric
     * @param {Object} current - Current usage data
     * @param {Object} previous - Previous usage data
     * @returns {number} Memory efficiency score (0-100)
     */
    calculateMemoryEfficiency(current, previous) {
        // Memory efficiency based on usage patterns and stability
        const memoryChange = Math.abs(current.memory.percentage - previous.memory.percentage);
        const stability = Math.max(0, 100 - memoryChange * 3);
        
        // Penalize very high memory usage
        const usagePenalty = current.memory.percentage > 90 ? 30 : 0;
        
        return Math.max(0, stability - usagePenalty);
    }

    /**
     * Check for alert conditions
     * @param {string} instanceId - Instance ID
     * @param {Object} usage - Resource usage data
     */
    checkAlerts(instanceId, usage) {
        const alerts = [];
        const thresholds = this.config.alertThresholds;

        // CPU alerts
        if (usage.cpu.usage >= thresholds.cpu.critical) {
            alerts.push({
                type: 'cpu',
                level: 'critical',
                message: `CPU usage critical: ${usage.cpu.usage.toFixed(1)}%`,
                value: usage.cpu.usage,
                threshold: thresholds.cpu.critical
            });
        } else if (usage.cpu.usage >= thresholds.cpu.warning) {
            alerts.push({
                type: 'cpu',
                level: 'warning',
                message: `CPU usage high: ${usage.cpu.usage.toFixed(1)}%`,
                value: usage.cpu.usage,
                threshold: thresholds.cpu.warning
            });
        }

        // Memory alerts
        if (usage.memory.percentage >= thresholds.memory.critical) {
            alerts.push({
                type: 'memory',
                level: 'critical',
                message: `Memory usage critical: ${usage.memory.percentage.toFixed(1)}%`,
                value: usage.memory.percentage,
                threshold: thresholds.memory.critical
            });
        } else if (usage.memory.percentage >= thresholds.memory.warning) {
            alerts.push({
                type: 'memory',
                level: 'warning',
                message: `Memory usage high: ${usage.memory.percentage.toFixed(1)}%`,
                value: usage.memory.percentage,
                threshold: thresholds.memory.warning
            });
        }

        // Disk alerts
        if (usage.disk.percentage >= thresholds.disk.critical) {
            alerts.push({
                type: 'disk',
                level: 'critical',
                message: `Disk usage critical: ${usage.disk.percentage.toFixed(1)}%`,
                value: usage.disk.percentage,
                threshold: thresholds.disk.critical
            });
        } else if (usage.disk.percentage >= thresholds.disk.warning) {
            alerts.push({
                type: 'disk',
                level: 'warning',
                message: `Disk usage high: ${usage.disk.percentage.toFixed(1)}%`,
                value: usage.disk.percentage,
                threshold: thresholds.disk.warning
            });
        }

        // Network alerts (if derived metrics available)
        if (usage.derived && usage.derived.rates) {
            const networkIn = usage.derived.rates.networkIn || 0;
            const networkOut = usage.derived.rates.networkOut || 0;
            const totalNetwork = networkIn + networkOut;

            if (totalNetwork >= thresholds.network.critical) {
                alerts.push({
                    type: 'network',
                    level: 'critical',
                    message: `Network usage critical: ${this.formatBytes(totalNetwork)}/s`,
                    value: totalNetwork,
                    threshold: thresholds.network.critical
                });
            } else if (totalNetwork >= thresholds.network.warning) {
                alerts.push({
                    type: 'network',
                    level: 'warning',
                    message: `Network usage high: ${this.formatBytes(totalNetwork)}/s`,
                    value: totalNetwork,
                    threshold: thresholds.network.warning
                });
            }
        }

        // Process alerts
        if (alerts.length > 0) {
            this.processAlerts(instanceId, alerts, usage);
        }
    }

    /**
     * Process and emit alerts
     * @param {string} instanceId - Instance ID
     * @param {Array} alerts - Array of alerts
     * @param {Object} usage - Resource usage data
     */
    processAlerts(instanceId, alerts, usage) {
        const alertHistory = this.alerts.get(instanceId) || [];
        const timestamp = new Date().toISOString();

        for (const alert of alerts) {
            // Check if this is a new alert or escalation
            const existingAlert = alertHistory.find(a => 
                a.type === alert.type && 
                a.active && 
                new Date(timestamp) - new Date(a.timestamp) < 5 * 60 * 1000 // 5 minutes
            );

            if (!existingAlert || existingAlert.level !== alert.level) {
                const alertRecord = {
                    ...alert,
                    instanceId,
                    timestamp,
                    active: true,
                    id: `${instanceId}-${alert.type}-${Date.now()}`
                };

                alertHistory.push(alertRecord);
                this.alerts.set(instanceId, alertHistory);

                this.emit('alert', alertRecord);

                // Emit specific alert events
                this.emit(`alert:${alert.level}`, alertRecord);
                this.emit(`alert:${alert.type}`, alertRecord);
            }
        }

        // Mark resolved alerts
        this.markResolvedAlerts(instanceId, alerts, usage);
    }

    /**
     * Mark alerts as resolved when conditions improve
     * @param {string} instanceId - Instance ID
     * @param {Array} currentAlerts - Current alerts
     * @param {Object} usage - Resource usage data
     */
    markResolvedAlerts(instanceId, currentAlerts, usage) {
        const alertHistory = this.alerts.get(instanceId) || [];
        const currentAlertTypes = currentAlerts.map(a => a.type);
        
        alertHistory.forEach(alert => {
            if (alert.active && !currentAlertTypes.includes(alert.type)) {
                alert.active = false;
                alert.resolvedAt = new Date().toISOString();
                
                this.emit('alertResolved', alert);
            }
        });
    }

    /**
     * Get current metrics for an environment
     * @param {string} instanceId - Instance ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Metrics data
     */
    async getMetrics(instanceId, options = {}) {
        const metrics = this.metrics.get(instanceId) || [];
        const environment = this.environments.get(instanceId);
        
        if (!environment) {
            throw new Error(`Environment ${instanceId} not found`);
        }

        const {
            startTime,
            endTime,
            aggregation = 'raw',
            limit = 100
        } = options;

        let filteredMetrics = metrics;

        // Apply time filters
        if (startTime) {
            filteredMetrics = filteredMetrics.filter(m => 
                new Date(m.timestamp) >= new Date(startTime)
            );
        }

        if (endTime) {
            filteredMetrics = filteredMetrics.filter(m => 
                new Date(m.timestamp) <= new Date(endTime)
            );
        }

        // Apply aggregation
        if (aggregation !== 'raw') {
            filteredMetrics = this.aggregateMetrics(filteredMetrics, aggregation);
        }

        // Apply limit
        if (limit && filteredMetrics.length > limit) {
            filteredMetrics = filteredMetrics.slice(-limit);
        }

        return {
            instanceId,
            environment: environment.instanceData,
            metrics: filteredMetrics,
            summary: this.calculateMetricsSummary(filteredMetrics),
            retrievedAt: new Date().toISOString()
        };
    }

    /**
     * Aggregate metrics by time interval
     * @param {Array} metrics - Raw metrics
     * @param {string} interval - Aggregation interval (minute, hour, day)
     * @returns {Array} Aggregated metrics
     */
    aggregateMetrics(metrics, interval) {
        const intervalMs = this.config.aggregationIntervals[interval];
        if (!intervalMs) {
            return metrics;
        }

        const buckets = new Map();
        
        metrics.forEach(metric => {
            const timestamp = new Date(metric.timestamp);
            const bucketTime = new Date(Math.floor(timestamp.getTime() / intervalMs) * intervalMs);
            const bucketKey = bucketTime.toISOString();
            
            if (!buckets.has(bucketKey)) {
                buckets.set(bucketKey, []);
            }
            
            buckets.get(bucketKey).push(metric);
        });

        return Array.from(buckets.entries()).map(([timestamp, bucketMetrics]) => {
            return this.aggregateBucketMetrics(timestamp, bucketMetrics);
        });
    }

    /**
     * Aggregate metrics within a time bucket
     * @param {string} timestamp - Bucket timestamp
     * @param {Array} metrics - Metrics in bucket
     * @returns {Object} Aggregated metric
     */
    aggregateBucketMetrics(timestamp, metrics) {
        const count = metrics.length;
        
        const aggregated = {
            timestamp,
            count,
            cpu: {
                usage: this.calculateAverage(metrics, 'cpu.usage'),
                min: this.calculateMin(metrics, 'cpu.usage'),
                max: this.calculateMax(metrics, 'cpu.usage')
            },
            memory: {
                percentage: this.calculateAverage(metrics, 'memory.percentage'),
                used: this.calculateAverage(metrics, 'memory.used'),
                min: this.calculateMin(metrics, 'memory.percentage'),
                max: this.calculateMax(metrics, 'memory.percentage')
            },
            disk: {
                percentage: this.calculateAverage(metrics, 'disk.percentage'),
                used: this.calculateAverage(metrics, 'disk.used'),
                min: this.calculateMin(metrics, 'disk.percentage'),
                max: this.calculateMax(metrics, 'disk.percentage')
            },
            network: {
                bytesIn: this.calculateSum(metrics, 'network.bytesIn'),
                bytesOut: this.calculateSum(metrics, 'network.bytesOut')
            }
        };

        return aggregated;
    }

    /**
     * Calculate average value from metrics array
     * @param {Array} metrics - Metrics array
     * @param {string} path - Property path (e.g., 'cpu.usage')
     * @returns {number} Average value
     */
    calculateAverage(metrics, path) {
        const values = metrics.map(m => this.getNestedValue(m, path)).filter(v => v !== null);
        return values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
    }

    /**
     * Calculate minimum value from metrics array
     * @param {Array} metrics - Metrics array
     * @param {string} path - Property path
     * @returns {number} Minimum value
     */
    calculateMin(metrics, path) {
        const values = metrics.map(m => this.getNestedValue(m, path)).filter(v => v !== null);
        return values.length > 0 ? Math.min(...values) : 0;
    }

    /**
     * Calculate maximum value from metrics array
     * @param {Array} metrics - Metrics array
     * @param {string} path - Property path
     * @returns {number} Maximum value
     */
    calculateMax(metrics, path) {
        const values = metrics.map(m => this.getNestedValue(m, path)).filter(v => v !== null);
        return values.length > 0 ? Math.max(...values) : 0;
    }

    /**
     * Calculate sum of values from metrics array
     * @param {Array} metrics - Metrics array
     * @param {string} path - Property path
     * @returns {number} Sum of values
     */
    calculateSum(metrics, path) {
        const values = metrics.map(m => this.getNestedValue(m, path)).filter(v => v !== null);
        return values.reduce((sum, val) => sum + val, 0);
    }

    /**
     * Get nested value from object using dot notation
     * @param {Object} obj - Object to search
     * @param {string} path - Property path
     * @returns {any} Value or null if not found
     */
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : null;
        }, obj);
    }

    /**
     * Calculate metrics summary
     * @param {Array} metrics - Metrics array
     * @returns {Object} Summary statistics
     */
    calculateMetricsSummary(metrics) {
        if (metrics.length === 0) {
            return null;
        }

        return {
            count: metrics.length,
            timeRange: {
                start: metrics[0].timestamp,
                end: metrics[metrics.length - 1].timestamp
            },
            averages: {
                cpu: this.calculateAverage(metrics, 'cpu.usage'),
                memory: this.calculateAverage(metrics, 'memory.percentage'),
                disk: this.calculateAverage(metrics, 'disk.percentage')
            },
            peaks: {
                cpu: this.calculateMax(metrics, 'cpu.usage'),
                memory: this.calculateMax(metrics, 'memory.percentage'),
                disk: this.calculateMax(metrics, 'disk.percentage')
            }
        };
    }

    /**
     * Get active alerts for an environment
     * @param {string} instanceId - Instance ID
     * @returns {Array} Active alerts
     */
    getActiveAlerts(instanceId) {
        const alertHistory = this.alerts.get(instanceId) || [];
        return alertHistory.filter(alert => alert.active);
    }

    /**
     * Get alert history for an environment
     * @param {string} instanceId - Instance ID
     * @param {Object} options - Query options
     * @returns {Array} Alert history
     */
    getAlertHistory(instanceId, options = {}) {
        const alertHistory = this.alerts.get(instanceId) || [];
        const { startTime, endTime, level, type, limit = 50 } = options;

        let filteredAlerts = alertHistory;

        if (startTime) {
            filteredAlerts = filteredAlerts.filter(a => 
                new Date(a.timestamp) >= new Date(startTime)
            );
        }

        if (endTime) {
            filteredAlerts = filteredAlerts.filter(a => 
                new Date(a.timestamp) <= new Date(endTime)
            );
        }

        if (level) {
            filteredAlerts = filteredAlerts.filter(a => a.level === level);
        }

        if (type) {
            filteredAlerts = filteredAlerts.filter(a => a.type === type);
        }

        if (limit && filteredAlerts.length > limit) {
            filteredAlerts = filteredAlerts.slice(-limit);
        }

        return filteredAlerts;
    }

    /**
     * Format bytes to human readable string
     * @param {number} bytes - Bytes value
     * @returns {string} Formatted string
     */
    formatBytes(bytes) {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let size = bytes;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }

    /**
     * Clean up old metrics beyond retention period
     */
    cleanupOldMetrics() {
        const cutoffTime = new Date(Date.now() - this.config.retentionPeriod);

        for (const [instanceId, metrics] of this.metrics.entries()) {
            const filteredMetrics = metrics.filter(m => 
                new Date(m.timestamp) > cutoffTime
            );
            
            if (filteredMetrics.length !== metrics.length) {
                this.metrics.set(instanceId, filteredMetrics);
                this.emit('metricsCleanedUp', { 
                    instanceId, 
                    removed: metrics.length - filteredMetrics.length,
                    remaining: filteredMetrics.length
                });
            }
        }

        // Clean up old alerts
        for (const [instanceId, alerts] of this.alerts.entries()) {
            const filteredAlerts = alerts.filter(a => 
                new Date(a.timestamp) > cutoffTime
            );
            
            if (filteredAlerts.length !== alerts.length) {
                this.alerts.set(instanceId, filteredAlerts);
            }
        }
    }

    /**
     * Get monitoring status
     * @returns {Object} Monitoring status
     */
    getStatus() {
        return {
            isMonitoring: this.isMonitoring,
            environmentCount: this.environments.size,
            totalMetrics: Array.from(this.metrics.values()).reduce((sum, metrics) => sum + metrics.length, 0),
            totalAlerts: Array.from(this.alerts.values()).reduce((sum, alerts) => sum + alerts.length, 0),
            activeAlerts: Array.from(this.alerts.values()).reduce((sum, alerts) => 
                sum + alerts.filter(a => a.active).length, 0
            ),
            config: this.config
        };
    }

    /**
     * Cleanup all resources
     */
    async cleanup() {
        try {
            this.stopMonitoring();
            
            this.environments.clear();
            this.metrics.clear();
            this.alerts.clear();

            await this.agentAPI.cleanup();
            this.emit('cleanup');
        } catch (error) {
            this.emit('error', { type: 'cleanup', error });
            throw error;
        }
    }
}

export default EnvironmentMonitor;

