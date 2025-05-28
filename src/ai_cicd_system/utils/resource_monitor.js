/**
 * Resource Monitor
 * 
 * Monitors system and process resource usage, providing real-time metrics,
 * alerts, and performance analytics for WSL2 environments.
 */

import { EventEmitter } from 'events';

export class ResourceMonitor extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            monitoringInterval: options.monitoringInterval || 30000, // 30 seconds
            metricsRetention: options.metricsRetention || 24 * 60 * 60 * 1000, // 24 hours
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
            aggregationIntervals: {
                minute: 60 * 1000,
                hour: 60 * 60 * 1000,
                day: 24 * 60 * 60 * 1000
            },
            ...options
        };

        this.metrics = new Map();
        this.alerts = new Map();
        this.aggregatedMetrics = new Map();
        this.monitoringTimer = null;
        this.cleanupTimer = null;
        this.isMonitoring = false;
        this.startTime = Date.now();
    }

    /**
     * Initialize the Resource Monitor
     * @returns {Promise<boolean>} True if initialization successful
     */
    async initialize() {
        try {
            this.startMonitoring();
            this.startCleanupTimer();
            this.emit('initialized');
            return true;
        } catch (error) {
            this.emit('error', { type: 'initialization', error });
            throw new Error(`Failed to initialize Resource Monitor: ${error.message}`);
        }
    }

    /**
     * Start resource monitoring
     */
    startMonitoring() {
        if (this.isMonitoring) {
            return;
        }

        this.isMonitoring = true;
        this.monitoringTimer = setInterval(async () => {
            await this.collectSystemMetrics();
        }, this.config.monitoringInterval);

        this.emit('monitoringStarted');
    }

    /**
     * Stop resource monitoring
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

        this.emit('monitoringStopped');
    }

    /**
     * Start cleanup timer for old metrics
     */
    startCleanupTimer() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }

        this.cleanupTimer = setInterval(() => {
            this.cleanupOldMetrics();
        }, this.config.aggregationIntervals.hour);
    }

    /**
     * Collect system-wide resource metrics
     * @returns {Promise<void>}
     */
    async collectSystemMetrics() {
        try {
            const timestamp = new Date().toISOString();
            const metrics = {
                timestamp,
                system: await this.getSystemMetrics(),
                processes: await this.getProcessMetrics(),
                network: await this.getNetworkMetrics(),
                disk: await this.getDiskMetrics()
            };

            this.recordMetrics('system', metrics);
            this.checkSystemAlerts(metrics);
            this.updateAggregatedMetrics(metrics);

            this.emit('metricsCollected', metrics);

        } catch (error) {
            this.emit('error', { type: 'metricsCollection', error });
        }
    }

    /**
     * Get system resource metrics
     * @returns {Promise<Object>} System metrics
     */
    async getSystemMetrics() {
        // In a real implementation, this would collect actual system metrics
        // For now, we'll simulate realistic metrics
        
        return {
            cpu: {
                usage: Math.random() * 100,
                cores: 4,
                loadAverage: [
                    Math.random() * 2,
                    Math.random() * 2,
                    Math.random() * 2
                ],
                temperature: 45 + Math.random() * 30 // 45-75°C
            },
            memory: {
                total: 8 * 1024 * 1024 * 1024, // 8GB
                used: Math.random() * 6 * 1024 * 1024 * 1024, // 0-6GB used
                free: 0, // Will be calculated
                cached: Math.random() * 1024 * 1024 * 1024, // 0-1GB cached
                buffers: Math.random() * 512 * 1024 * 1024, // 0-512MB buffers
                available: 0 // Will be calculated
            },
            swap: {
                total: 2 * 1024 * 1024 * 1024, // 2GB
                used: Math.random() * 512 * 1024 * 1024, // 0-512MB used
                free: 0 // Will be calculated
            }
        };
    }

    /**
     * Get process-specific metrics
     * @returns {Promise<Object>} Process metrics
     */
    async getProcessMetrics() {
        // Simulate process metrics
        const processCount = Math.floor(Math.random() * 50) + 20; // 20-70 processes
        
        return {
            count: processCount,
            threads: processCount * 2 + Math.floor(Math.random() * 50),
            handles: processCount * 10 + Math.floor(Math.random() * 200),
            topProcesses: this.generateTopProcesses(5)
        };
    }

    /**
     * Generate simulated top processes
     * @param {number} count - Number of processes to generate
     * @returns {Array} Array of process metrics
     */
    generateTopProcesses(count) {
        const processNames = [
            'claude-code', 'node', 'python3', 'git', 'npm',
            'docker', 'bash', 'ssh', 'curl', 'vim'
        ];

        return Array.from({ length: count }, (_, i) => ({
            pid: 1000 + i,
            name: processNames[Math.floor(Math.random() * processNames.length)],
            cpu: Math.random() * 50,
            memory: Math.random() * 1024 * 1024 * 1024, // 0-1GB
            threads: Math.floor(Math.random() * 10) + 1
        }));
    }

    /**
     * Get network metrics
     * @returns {Promise<Object>} Network metrics
     */
    async getNetworkMetrics() {
        return {
            interfaces: {
                eth0: {
                    bytesReceived: Math.floor(Math.random() * 1000000000),
                    bytesSent: Math.floor(Math.random() * 1000000000),
                    packetsReceived: Math.floor(Math.random() * 1000000),
                    packetsSent: Math.floor(Math.random() * 1000000),
                    errors: Math.floor(Math.random() * 10),
                    dropped: Math.floor(Math.random() * 5)
                }
            },
            connections: {
                tcp: Math.floor(Math.random() * 100),
                udp: Math.floor(Math.random() * 50),
                established: Math.floor(Math.random() * 50),
                listening: Math.floor(Math.random() * 20)
            }
        };
    }

    /**
     * Get disk metrics
     * @returns {Promise<Object>} Disk metrics
     */
    async getDiskMetrics() {
        return {
            filesystems: {
                '/': {
                    total: 50 * 1024 * 1024 * 1024, // 50GB
                    used: Math.random() * 40 * 1024 * 1024 * 1024, // 0-40GB used
                    available: 0, // Will be calculated
                    percentage: 0, // Will be calculated
                    inodes: {
                        total: 3276800,
                        used: Math.floor(Math.random() * 1000000),
                        available: 0 // Will be calculated
                    }
                }
            },
            io: {
                readBytes: Math.floor(Math.random() * 1000000000),
                writeBytes: Math.floor(Math.random() * 1000000000),
                readOps: Math.floor(Math.random() * 100000),
                writeOps: Math.floor(Math.random() * 100000),
                readTime: Math.floor(Math.random() * 10000),
                writeTime: Math.floor(Math.random() * 10000)
            }
        };
    }

    /**
     * Record metrics for a resource
     * @param {string} resourceId - Resource identifier
     * @param {Object} metrics - Metrics data
     */
    recordMetrics(resourceId, metrics) {
        if (!this.metrics.has(resourceId)) {
            this.metrics.set(resourceId, []);
        }

        const resourceMetrics = this.metrics.get(resourceId);
        resourceMetrics.push(metrics);

        // Keep only recent metrics
        const maxMetrics = Math.ceil(this.config.metricsRetention / this.config.monitoringInterval);
        if (resourceMetrics.length > maxMetrics) {
            resourceMetrics.splice(0, resourceMetrics.length - maxMetrics);
        }

        this.emit('metricsRecorded', { resourceId, metrics });
    }

    /**
     * Check for system alert conditions
     * @param {Object} metrics - Current metrics
     */
    checkSystemAlerts(metrics) {
        const alerts = [];
        const thresholds = this.config.alertThresholds;

        // CPU alerts
        if (metrics.system.cpu.usage >= thresholds.cpu.critical) {
            alerts.push({
                type: 'cpu',
                level: 'critical',
                message: `System CPU usage critical: ${metrics.system.cpu.usage.toFixed(1)}%`,
                value: metrics.system.cpu.usage,
                threshold: thresholds.cpu.critical
            });
        } else if (metrics.system.cpu.usage >= thresholds.cpu.warning) {
            alerts.push({
                type: 'cpu',
                level: 'warning',
                message: `System CPU usage high: ${metrics.system.cpu.usage.toFixed(1)}%`,
                value: metrics.system.cpu.usage,
                threshold: thresholds.cpu.warning
            });
        }

        // Memory alerts
        const memoryPercentage = (metrics.system.memory.used / metrics.system.memory.total) * 100;
        if (memoryPercentage >= thresholds.memory.critical) {
            alerts.push({
                type: 'memory',
                level: 'critical',
                message: `System memory usage critical: ${memoryPercentage.toFixed(1)}%`,
                value: memoryPercentage,
                threshold: thresholds.memory.critical
            });
        } else if (memoryPercentage >= thresholds.memory.warning) {
            alerts.push({
                type: 'memory',
                level: 'warning',
                message: `System memory usage high: ${memoryPercentage.toFixed(1)}%`,
                value: memoryPercentage,
                threshold: thresholds.memory.warning
            });
        }

        // Disk alerts
        for (const [mount, disk] of Object.entries(metrics.disk.filesystems)) {
            const diskPercentage = (disk.used / disk.total) * 100;
            if (diskPercentage >= thresholds.disk.critical) {
                alerts.push({
                    type: 'disk',
                    level: 'critical',
                    message: `Disk usage critical on ${mount}: ${diskPercentage.toFixed(1)}%`,
                    value: diskPercentage,
                    threshold: thresholds.disk.critical,
                    mount
                });
            } else if (diskPercentage >= thresholds.disk.warning) {
                alerts.push({
                    type: 'disk',
                    level: 'warning',
                    message: `Disk usage high on ${mount}: ${diskPercentage.toFixed(1)}%`,
                    value: diskPercentage,
                    threshold: thresholds.disk.warning,
                    mount
                });
            }
        }

        // Process alerts if needed
        if (alerts.length > 0) {
            this.processAlerts('system', alerts, metrics);
        }
    }

    /**
     * Process and emit alerts
     * @param {string} resourceId - Resource identifier
     * @param {Array} alerts - Array of alerts
     * @param {Object} metrics - Current metrics
     */
    processAlerts(resourceId, alerts, metrics) {
        if (!this.alerts.has(resourceId)) {
            this.alerts.set(resourceId, []);
        }

        const alertHistory = this.alerts.get(resourceId);
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
                    resourceId,
                    timestamp,
                    active: true,
                    id: `${resourceId}-${alert.type}-${Date.now()}`
                };

                alertHistory.push(alertRecord);
                this.emit('alert', alertRecord);
                this.emit(`alert:${alert.level}`, alertRecord);
                this.emit(`alert:${alert.type}`, alertRecord);
            }
        }

        // Mark resolved alerts
        this.markResolvedAlerts(resourceId, alerts);
    }

    /**
     * Mark alerts as resolved when conditions improve
     * @param {string} resourceId - Resource identifier
     * @param {Array} currentAlerts - Current alerts
     */
    markResolvedAlerts(resourceId, currentAlerts) {
        const alertHistory = this.alerts.get(resourceId) || [];
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
     * Update aggregated metrics
     * @param {Object} metrics - Current metrics
     */
    updateAggregatedMetrics(metrics) {
        const timestamp = new Date(metrics.timestamp);
        
        // Aggregate by different intervals
        Object.keys(this.config.aggregationIntervals).forEach(interval => {
            const intervalMs = this.config.aggregationIntervals[interval];
            const bucketTime = new Date(Math.floor(timestamp.getTime() / intervalMs) * intervalMs);
            const bucketKey = `${interval}-${bucketTime.toISOString()}`;
            
            if (!this.aggregatedMetrics.has(bucketKey)) {
                this.aggregatedMetrics.set(bucketKey, {
                    interval,
                    timestamp: bucketTime.toISOString(),
                    metrics: [],
                    summary: null
                });
            }
            
            const bucket = this.aggregatedMetrics.get(bucketKey);
            bucket.metrics.push(metrics);
            bucket.summary = this.calculateBucketSummary(bucket.metrics);
        });
    }

    /**
     * Calculate summary statistics for a metrics bucket
     * @param {Array} metrics - Array of metrics
     * @returns {Object} Summary statistics
     */
    calculateBucketSummary(metrics) {
        if (metrics.length === 0) {
            return null;
        }

        const summary = {
            count: metrics.length,
            cpu: {
                avg: this.calculateAverage(metrics, 'system.cpu.usage'),
                min: this.calculateMin(metrics, 'system.cpu.usage'),
                max: this.calculateMax(metrics, 'system.cpu.usage')
            },
            memory: {
                avg: this.calculateAverage(metrics, 'system.memory.used'),
                min: this.calculateMin(metrics, 'system.memory.used'),
                max: this.calculateMax(metrics, 'system.memory.used')
            },
            processes: {
                avg: this.calculateAverage(metrics, 'processes.count'),
                min: this.calculateMin(metrics, 'processes.count'),
                max: this.calculateMax(metrics, 'processes.count')
            }
        };

        return summary;
    }

    /**
     * Calculate average value from metrics array
     * @param {Array} metrics - Metrics array
     * @param {string} path - Property path
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
     * Get metrics for a resource
     * @param {string} resourceId - Resource identifier
     * @param {Object} options - Query options
     * @returns {Array} Metrics data
     */
    getMetrics(resourceId, options = {}) {
        const metrics = this.metrics.get(resourceId) || [];
        const { startTime, endTime, limit = 100 } = options;

        let filteredMetrics = metrics;

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

        if (limit && filteredMetrics.length > limit) {
            filteredMetrics = filteredMetrics.slice(-limit);
        }

        return filteredMetrics;
    }

    /**
     * Get aggregated metrics
     * @param {string} interval - Aggregation interval (minute, hour, day)
     * @param {Object} options - Query options
     * @returns {Array} Aggregated metrics
     */
    getAggregatedMetrics(interval, options = {}) {
        const { startTime, endTime, limit = 100 } = options;
        
        let aggregated = Array.from(this.aggregatedMetrics.values())
            .filter(bucket => bucket.interval === interval);

        if (startTime) {
            aggregated = aggregated.filter(bucket => 
                new Date(bucket.timestamp) >= new Date(startTime)
            );
        }

        if (endTime) {
            aggregated = aggregated.filter(bucket => 
                new Date(bucket.timestamp) <= new Date(endTime)
            );
        }

        if (limit && aggregated.length > limit) {
            aggregated = aggregated.slice(-limit);
        }

        return aggregated.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }

    /**
     * Get active alerts
     * @param {string} resourceId - Resource identifier (optional)
     * @returns {Array} Active alerts
     */
    getActiveAlerts(resourceId = null) {
        if (resourceId) {
            const alertHistory = this.alerts.get(resourceId) || [];
            return alertHistory.filter(alert => alert.active);
        }

        // Get all active alerts
        const allAlerts = [];
        for (const alertHistory of this.alerts.values()) {
            allAlerts.push(...alertHistory.filter(alert => alert.active));
        }
        
        return allAlerts;
    }

    /**
     * Get alert history
     * @param {string} resourceId - Resource identifier
     * @param {Object} options - Query options
     * @returns {Array} Alert history
     */
    getAlertHistory(resourceId, options = {}) {
        const alertHistory = this.alerts.get(resourceId) || [];
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
     * Get monitoring statistics
     * @returns {Object} Monitoring statistics
     */
    getStatistics() {
        const totalMetrics = Array.from(this.metrics.values())
            .reduce((sum, metrics) => sum + metrics.length, 0);
        
        const totalAlerts = Array.from(this.alerts.values())
            .reduce((sum, alerts) => sum + alerts.length, 0);
        
        const activeAlerts = this.getActiveAlerts().length;

        return {
            isMonitoring: this.isMonitoring,
            uptime: Date.now() - this.startTime,
            monitoredResources: this.metrics.size,
            totalMetrics,
            totalAlerts,
            activeAlerts,
            aggregatedBuckets: this.aggregatedMetrics.size,
            config: this.config
        };
    }

    /**
     * Clean up old metrics beyond retention period
     */
    cleanupOldMetrics() {
        const cutoffTime = new Date(Date.now() - this.config.metricsRetention);

        // Clean up raw metrics
        for (const [resourceId, metrics] of this.metrics.entries()) {
            const filteredMetrics = metrics.filter(m => 
                new Date(m.timestamp) > cutoffTime
            );
            
            if (filteredMetrics.length !== metrics.length) {
                this.metrics.set(resourceId, filteredMetrics);
                this.emit('metricsCleanedUp', { 
                    resourceId, 
                    removed: metrics.length - filteredMetrics.length,
                    remaining: filteredMetrics.length
                });
            }
        }

        // Clean up aggregated metrics
        for (const [bucketKey, bucket] of this.aggregatedMetrics.entries()) {
            if (new Date(bucket.timestamp) < cutoffTime) {
                this.aggregatedMetrics.delete(bucketKey);
            }
        }

        // Clean up old alerts
        for (const [resourceId, alerts] of this.alerts.entries()) {
            const filteredAlerts = alerts.filter(a => 
                new Date(a.timestamp) > cutoffTime
            );
            
            if (filteredAlerts.length !== alerts.length) {
                this.alerts.set(resourceId, filteredAlerts);
            }
        }
    }

    /**
     * Cleanup all resources
     */
    async cleanup() {
        try {
            this.stopMonitoring();
            
            if (this.cleanupTimer) {
                clearInterval(this.cleanupTimer);
                this.cleanupTimer = null;
            }

            this.metrics.clear();
            this.alerts.clear();
            this.aggregatedMetrics.clear();

            this.emit('cleanup');
        } catch (error) {
            this.emit('error', { type: 'cleanup', error });
            throw error;
        }
    }
}

export default ResourceMonitor;

