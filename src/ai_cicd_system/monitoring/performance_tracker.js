/**
 * @fileoverview Performance Tracker
 * @description Advanced performance monitoring and analytics for CI/CD pipeline
 */

import { EventEmitter } from 'events';

/**
 * Performance tracker for comprehensive CI/CD pipeline monitoring
 */
export class PerformanceTracker extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            enable_detailed_tracking: config.enable_detailed_tracking !== false,
            enable_resource_monitoring: config.enable_resource_monitoring !== false,
            enable_pipeline_analytics: config.enable_pipeline_analytics !== false,
            sampling_rate: config.sampling_rate || 1.0, // 100% sampling by default
            retention_days: config.retention_days || 30,
            ...config
        };

        this.metrics = new Map();
        this.timers = new Map();
        this.resourceMetrics = new Map();
        this.pipelineMetrics = new Map();
        this.performanceHistory = [];
        this.isInitialized = false;
    }

    /**
     * Initialize performance tracker
     */
    async initialize() {
        if (this.isInitialized) return;

        this.isInitialized = true;
        
        // Initialize metric categories
        this._initializeMetricCategories();
        
        // Start resource monitoring if enabled
        if (this.config.enable_resource_monitoring) {
            this._startResourceMonitoring();
        }

        this.emit('initialized');
    }

    /**
     * Start tracking a performance operation
     */
    startTracking(operationId, metadata = {}) {
        if (!this._shouldSample()) return null;

        const startTime = process.hrtime.bigint();
        const timestamp = new Date();

        const trackingData = {
            operationId,
            startTime,
            timestamp,
            metadata: {
                ...metadata,
                pid: process.pid,
                nodeVersion: process.version
            }
        };

        this.timers.set(operationId, trackingData);
        
        this.emit('tracking_started', {
            operationId,
            timestamp,
            metadata
        });

        return trackingData;
    }

    /**
     * End tracking and record performance metrics
     */
    endTracking(operationId, result = {}) {
        const trackingData = this.timers.get(operationId);
        if (!trackingData) return null;

        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - trackingData.startTime) / 1000000; // Convert to milliseconds

        const performanceData = {
            operationId,
            duration,
            startTime: trackingData.timestamp,
            endTime: new Date(),
            metadata: trackingData.metadata,
            result: {
                success: result.success !== false,
                error: result.error || null,
                ...result
            },
            resourceUsage: this._getCurrentResourceUsage()
        };

        // Store metrics
        this._recordMetric('operation_duration', duration, {
            operation: operationId,
            success: performanceData.result.success
        });

        this._recordMetric('operation_count', 1, {
            operation: operationId,
            success: performanceData.result.success
        });

        // Add to history
        this.performanceHistory.push(performanceData);
        this._cleanupHistory();

        // Clean up timer
        this.timers.delete(operationId);

        this.emit('tracking_completed', performanceData);

        return performanceData;
    }

    /**
     * Record custom metric
     */
    recordMetric(name, value, labels = {}, timestamp = new Date()) {
        this._recordMetric(name, value, labels, timestamp);
    }

    /**
     * Track CI/CD pipeline performance
     */
    trackPipelineExecution(pipelineId, stage, metadata = {}) {
        const trackingId = `pipeline_${pipelineId}_${stage}`;
        return this.startTracking(trackingId, {
            type: 'pipeline',
            pipelineId,
            stage,
            ...metadata
        });
    }

    /**
     * Track code generation performance
     */
    trackCodeGeneration(requestId, metadata = {}) {
        const trackingId = `codegen_${requestId}`;
        return this.startTracking(trackingId, {
            type: 'code_generation',
            requestId,
            ...metadata
        });
    }

    /**
     * Track validation performance
     */
    trackValidation(validationId, metadata = {}) {
        const trackingId = `validation_${validationId}`;
        return this.startTracking(trackingId, {
            type: 'validation',
            validationId,
            ...metadata
        });
    }

    /**
     * Track deployment performance
     */
    trackDeployment(deploymentId, metadata = {}) {
        const trackingId = `deployment_${deploymentId}`;
        return this.startTracking(trackingId, {
            type: 'deployment',
            deploymentId,
            ...metadata
        });
    }

    /**
     * Get performance analytics
     */
    getAnalytics(timeRange = '1h') {
        const now = new Date();
        const timeRangeMs = this._parseTimeRange(timeRange);
        const startTime = new Date(now.getTime() - timeRangeMs);

        const relevantData = this.performanceHistory.filter(
            data => data.startTime >= startTime
        );

        return {
            summary: this._calculateSummaryStats(relevantData),
            byOperation: this._groupByOperation(relevantData),
            byStage: this._groupByStage(relevantData),
            trends: this._calculateTrends(relevantData),
            resourceUsage: this._analyzeResourceUsage(relevantData),
            bottlenecks: this._identifyBottlenecks(relevantData)
        };
    }

    /**
     * Get current metrics snapshot
     */
    getMetricsSnapshot() {
        const snapshot = {
            timestamp: new Date(),
            metrics: {},
            resourceUsage: this._getCurrentResourceUsage(),
            activeOperations: this.timers.size
        };

        // Convert metrics map to object
        for (const [name, metricData] of this.metrics) {
            snapshot.metrics[name] = {
                value: metricData.value,
                count: metricData.count,
                labels: metricData.labels,
                lastUpdated: metricData.lastUpdated
            };
        }

        return snapshot;
    }

    /**
     * Get performance recommendations
     */
    getPerformanceRecommendations() {
        const analytics = this.getAnalytics('24h');
        const recommendations = [];

        // Analyze slow operations
        const slowOperations = Object.entries(analytics.byOperation)
            .filter(([_, stats]) => stats.avgDuration > 5000) // > 5 seconds
            .sort((a, b) => b[1].avgDuration - a[1].avgDuration);

        if (slowOperations.length > 0) {
            recommendations.push({
                type: 'performance',
                severity: 'warning',
                title: 'Slow Operations Detected',
                description: `${slowOperations.length} operations are taking longer than 5 seconds on average`,
                operations: slowOperations.slice(0, 5).map(([op, stats]) => ({
                    operation: op,
                    avgDuration: stats.avgDuration,
                    count: stats.count
                })),
                suggestions: [
                    'Consider optimizing slow operations',
                    'Review resource allocation',
                    'Implement caching where appropriate'
                ]
            });
        }

        // Analyze error rates
        const highErrorOperations = Object.entries(analytics.byOperation)
            .filter(([_, stats]) => stats.errorRate > 0.1) // > 10% error rate
            .sort((a, b) => b[1].errorRate - a[1].errorRate);

        if (highErrorOperations.length > 0) {
            recommendations.push({
                type: 'reliability',
                severity: 'error',
                title: 'High Error Rates Detected',
                description: `${highErrorOperations.length} operations have error rates above 10%`,
                operations: highErrorOperations.slice(0, 5).map(([op, stats]) => ({
                    operation: op,
                    errorRate: stats.errorRate,
                    count: stats.count
                })),
                suggestions: [
                    'Investigate error causes',
                    'Implement better error handling',
                    'Add retry mechanisms where appropriate'
                ]
            });
        }

        // Analyze resource usage
        if (analytics.resourceUsage.avgMemoryUsage > 0.8) {
            recommendations.push({
                type: 'resource',
                severity: 'warning',
                title: 'High Memory Usage',
                description: `Average memory usage is ${(analytics.resourceUsage.avgMemoryUsage * 100).toFixed(1)}%`,
                suggestions: [
                    'Monitor for memory leaks',
                    'Consider increasing memory allocation',
                    'Optimize memory-intensive operations'
                ]
            });
        }

        return recommendations;
    }

    /**
     * Private methods
     */
    _initializeMetricCategories() {
        const categories = [
            'operation_duration',
            'operation_count',
            'error_count',
            'success_count',
            'resource_usage',
            'pipeline_duration',
            'validation_duration',
            'deployment_duration'
        ];

        categories.forEach(category => {
            this.metrics.set(category, {
                value: 0,
                count: 0,
                labels: {},
                lastUpdated: new Date()
            });
        });
    }

    _shouldSample() {
        return Math.random() < this.config.sampling_rate;
    }

    _recordMetric(name, value, labels = {}, timestamp = new Date()) {
        if (!this.metrics.has(name)) {
            this.metrics.set(name, {
                value: 0,
                count: 0,
                labels: {},
                lastUpdated: timestamp
            });
        }

        const metric = this.metrics.get(name);
        metric.value += value;
        metric.count += 1;
        metric.labels = { ...metric.labels, ...labels };
        metric.lastUpdated = timestamp;

        this.emit('metric_recorded', {
            name,
            value,
            labels,
            timestamp
        });
    }

    _getCurrentResourceUsage() {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();

        return {
            memory: {
                rss: memUsage.rss,
                heapTotal: memUsage.heapTotal,
                heapUsed: memUsage.heapUsed,
                external: memUsage.external,
                arrayBuffers: memUsage.arrayBuffers
            },
            cpu: {
                user: cpuUsage.user,
                system: cpuUsage.system
            },
            uptime: process.uptime(),
            timestamp: new Date()
        };
    }

    _startResourceMonitoring() {
        setInterval(() => {
            const usage = this._getCurrentResourceUsage();
            
            this._recordMetric('memory_usage', usage.memory.heapUsed);
            this._recordMetric('cpu_usage_user', usage.cpu.user);
            this._recordMetric('cpu_usage_system', usage.cpu.system);
            
            this.emit('resource_metrics', usage);
        }, 30000); // Every 30 seconds
    }

    _cleanupHistory() {
        const retentionMs = this.config.retention_days * 24 * 60 * 60 * 1000;
        const cutoffTime = new Date(Date.now() - retentionMs);
        
        this.performanceHistory = this.performanceHistory.filter(
            data => data.startTime >= cutoffTime
        );
    }

    _parseTimeRange(timeRange) {
        const units = {
            's': 1000,
            'm': 60 * 1000,
            'h': 60 * 60 * 1000,
            'd': 24 * 60 * 60 * 1000
        };

        const match = timeRange.match(/^(\d+)([smhd])$/);
        if (!match) return 60 * 60 * 1000; // Default to 1 hour

        const [, value, unit] = match;
        return parseInt(value) * units[unit];
    }

    _calculateSummaryStats(data) {
        if (data.length === 0) {
            return {
                totalOperations: 0,
                avgDuration: 0,
                minDuration: 0,
                maxDuration: 0,
                successRate: 0,
                errorRate: 0
            };
        }

        const durations = data.map(d => d.duration);
        const successCount = data.filter(d => d.result.success).length;

        return {
            totalOperations: data.length,
            avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
            minDuration: Math.min(...durations),
            maxDuration: Math.max(...durations),
            successRate: successCount / data.length,
            errorRate: (data.length - successCount) / data.length
        };
    }

    _groupByOperation(data) {
        const grouped = {};
        
        data.forEach(item => {
            const operation = item.operationId.split('_')[0];
            if (!grouped[operation]) {
                grouped[operation] = [];
            }
            grouped[operation].push(item);
        });

        // Calculate stats for each operation
        Object.keys(grouped).forEach(operation => {
            const items = grouped[operation];
            grouped[operation] = this._calculateSummaryStats(items);
        });

        return grouped;
    }

    _groupByStage(data) {
        const grouped = {};
        
        data.forEach(item => {
            const stage = item.metadata.stage || item.metadata.type || 'unknown';
            if (!grouped[stage]) {
                grouped[stage] = [];
            }
            grouped[stage].push(item);
        });

        // Calculate stats for each stage
        Object.keys(grouped).forEach(stage => {
            const items = grouped[stage];
            grouped[stage] = this._calculateSummaryStats(items);
        });

        return grouped;
    }

    _calculateTrends(data) {
        // Simple trend calculation - could be enhanced with more sophisticated algorithms
        const hourlyData = {};
        
        data.forEach(item => {
            const hour = new Date(item.startTime).getHours();
            if (!hourlyData[hour]) {
                hourlyData[hour] = [];
            }
            hourlyData[hour].push(item.duration);
        });

        const trends = {};
        Object.keys(hourlyData).forEach(hour => {
            const durations = hourlyData[hour];
            trends[hour] = {
                avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
                count: durations.length
            };
        });

        return trends;
    }

    _analyzeResourceUsage(data) {
        const resourceData = data
            .filter(item => item.resourceUsage)
            .map(item => item.resourceUsage);

        if (resourceData.length === 0) {
            return {
                avgMemoryUsage: 0,
                maxMemoryUsage: 0,
                avgCpuUsage: 0,
                maxCpuUsage: 0
            };
        }

        const memoryUsages = resourceData.map(r => r.memory.heapUsed);
        const cpuUsages = resourceData.map(r => r.cpu.user + r.cpu.system);

        return {
            avgMemoryUsage: memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length,
            maxMemoryUsage: Math.max(...memoryUsages),
            avgCpuUsage: cpuUsages.reduce((a, b) => a + b, 0) / cpuUsages.length,
            maxCpuUsage: Math.max(...cpuUsages)
        };
    }

    _identifyBottlenecks(data) {
        const bottlenecks = [];
        const operationStats = this._groupByOperation(data);

        // Identify operations that are consistently slow
        Object.entries(operationStats).forEach(([operation, stats]) => {
            if (stats.avgDuration > 10000 && stats.totalOperations > 5) { // > 10 seconds, > 5 occurrences
                bottlenecks.push({
                    type: 'slow_operation',
                    operation,
                    avgDuration: stats.avgDuration,
                    count: stats.totalOperations,
                    severity: stats.avgDuration > 30000 ? 'critical' : 'warning'
                });
            }
        });

        return bottlenecks;
    }
}

export default PerformanceTracker;

