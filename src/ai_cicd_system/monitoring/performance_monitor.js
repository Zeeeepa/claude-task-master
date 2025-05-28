/**
 * @fileoverview Performance Monitor
 * @description Comprehensive performance monitoring for AI CI/CD operations
 */

import { log } from '../../scripts/modules/utils.js';

/**
 * Performance Monitor for AI CI/CD system
 * Tracks performance metrics, identifies bottlenecks, and provides optimization insights
 */
export class PerformanceMonitor {
    constructor(config = {}) {
        this.config = {
            enableRealTimeMonitoring: config.enableRealTimeMonitoring !== false,
            performanceThresholds: {
                apiResponseTime: config.apiResponseTimeThreshold || 2000, // 2 seconds
                databaseQueryTime: config.databaseQueryTimeThreshold || 1000, // 1 second
                workflowExecutionTime: config.workflowExecutionTimeThreshold || 300000, // 5 minutes
                memoryUsage: config.memoryUsageThreshold || 0.8, // 80%
                cpuUsage: config.cpuUsageThreshold || 0.7, // 70%
                errorRate: config.errorRateThreshold || 0.05, // 5%
                ...config.performanceThresholds
            },
            samplingInterval: config.samplingInterval || 5000, // 5 seconds
            retentionPeriod: config.retentionPeriod || 86400000, // 24 hours
            enablePredictiveAnalysis: config.enablePredictiveAnalysis !== false,
            enableBottleneckDetection: config.enableBottleneckDetection !== false,
            enableOptimizationSuggestions: config.enableOptimizationSuggestions !== false,
            ...config
        };

        this.isMonitoring = false;
        this.monitoringInterval = null;
        this.performanceData = new Map();
        this.bottlenecks = new Map();
        this.optimizationSuggestions = [];
        
        // Performance tracking components
        this.responseTimeTracker = new ResponseTimeTracker(this.config);
        this.resourceUsageTracker = new ResourceUsageTracker(this.config);
        this.throughputTracker = new ThroughputTracker(this.config);
        this.errorRateTracker = new ErrorRateTracker(this.config);
        this.bottleneckDetector = new BottleneckDetector(this.config);
        this.optimizationEngine = new OptimizationEngine(this.config);
        
        // Performance baselines
        this.baselines = new Map();
        this.performanceAlerts = [];
    }

    /**
     * Initialize the performance monitor
     */
    async initialize() {
        log('debug', 'Initializing performance monitor...');
        
        await this.responseTimeTracker.initialize();
        await this.resourceUsageTracker.initialize();
        await this.throughputTracker.initialize();
        await this.errorRateTracker.initialize();
        
        if (this.config.enableBottleneckDetection) {
            await this.bottleneckDetector.initialize();
        }
        
        if (this.config.enableOptimizationSuggestions) {
            await this.optimizationEngine.initialize();
        }
        
        // Establish performance baselines
        await this._establishBaselines();
        
        log('info', 'Performance monitor initialized successfully');
    }

    /**
     * Start performance monitoring
     */
    async startMonitoring() {
        if (this.isMonitoring) {
            log('warning', 'Performance monitoring already running');
            return;
        }

        log('info', 'Starting performance monitoring...');
        this.isMonitoring = true;

        if (this.config.enableRealTimeMonitoring) {
            this.monitoringInterval = setInterval(async () => {
                await this._performMonitoringCycle();
            }, this.config.samplingInterval);
        }

        // Perform initial monitoring cycle
        await this._performMonitoringCycle();

        log('info', 'Performance monitoring started');
    }

    /**
     * Stop performance monitoring
     */
    async stopMonitoring() {
        if (!this.isMonitoring) {
            return;
        }

        log('info', 'Stopping performance monitoring...');
        this.isMonitoring = false;

        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        log('info', 'Performance monitoring stopped');
    }

    /**
     * Record performance metric
     * @param {string} operation - Operation name
     * @param {number} duration - Duration in milliseconds
     * @param {Object} metadata - Additional metadata
     */
    async recordPerformanceMetric(operation, duration, metadata = {}) {
        const timestamp = Date.now();
        const metric = {
            operation,
            duration,
            timestamp,
            metadata,
            id: `perf_${timestamp}_${Math.random().toString(36).substr(2, 9)}`
        };

        // Store in performance data
        if (!this.performanceData.has(operation)) {
            this.performanceData.set(operation, []);
        }
        
        const operationData = this.performanceData.get(operation);
        operationData.push(metric);
        
        // Maintain retention period
        this._cleanupOldData(operationData);
        
        // Update trackers
        await this.responseTimeTracker.recordMetric(operation, duration, metadata);
        await this.throughputTracker.recordOperation(operation, timestamp);
        
        // Check for performance issues
        await this._checkPerformanceThresholds(operation, duration, metadata);
        
        log('debug', `Recorded performance metric: ${operation} took ${duration}ms`);
    }

    /**
     * Record error for error rate tracking
     * @param {string} operation - Operation name
     * @param {Error} error - Error object
     * @param {Object} metadata - Additional metadata
     */
    async recordError(operation, error, metadata = {}) {
        await this.errorRateTracker.recordError(operation, error, metadata);
        
        // Check error rate thresholds
        const errorRate = await this.errorRateTracker.getErrorRate(operation);
        if (errorRate > this.config.performanceThresholds.errorRate) {
            this.performanceAlerts.push({
                type: 'high_error_rate',
                operation,
                errorRate,
                threshold: this.config.performanceThresholds.errorRate,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Get performance analytics
     * @param {Object} options - Analytics options
     * @returns {Promise<Object>} Performance analytics
     */
    async getPerformanceAnalytics(options = {}) {
        const timeRange = options.timeRange || { start: Date.now() - 3600000, end: Date.now() }; // Last hour
        
        const analytics = {
            timestamp: Date.now(),
            time_range: timeRange,
            response_times: await this.responseTimeTracker.getAnalytics(timeRange),
            resource_usage: await this.resourceUsageTracker.getAnalytics(timeRange),
            throughput: await this.throughputTracker.getAnalytics(timeRange),
            error_rates: await this.errorRateTracker.getAnalytics(timeRange),
            performance_summary: await this._generatePerformanceSummary(timeRange),
            bottlenecks: this.config.enableBottleneckDetection 
                ? await this.bottleneckDetector.getDetectedBottlenecks(timeRange)
                : [],
            optimization_suggestions: this.config.enableOptimizationSuggestions
                ? await this.optimizationEngine.getSuggestions(timeRange)
                : [],
            baselines: this._getBaselinesForRange(timeRange),
            alerts: this.performanceAlerts.filter(alert => 
                alert.timestamp >= timeRange.start && alert.timestamp <= timeRange.end
            )
        };

        return analytics;
    }

    /**
     * Get real-time performance metrics
     * @returns {Promise<Object>} Real-time metrics
     */
    async getRealTimeMetrics() {
        const now = Date.now();
        const last5Minutes = now - 300000; // 5 minutes

        return {
            timestamp: now,
            response_times: await this.responseTimeTracker.getCurrentMetrics(),
            resource_usage: await this.resourceUsageTracker.getCurrentUsage(),
            throughput: await this.throughputTracker.getCurrentThroughput(),
            error_rates: await this.errorRateTracker.getCurrentErrorRates(),
            active_operations: this._getActiveOperations(),
            performance_score: await this._calculatePerformanceScore(),
            health_status: await this._getPerformanceHealthStatus()
        };
    }

    /**
     * Get performance statistics
     * @returns {Object} Performance statistics
     */
    getPerformanceStatistics() {
        const totalOperations = Array.from(this.performanceData.values())
            .reduce((sum, operations) => sum + operations.length, 0);
        
        const operationTypes = this.performanceData.size;
        const alertsCount = this.performanceAlerts.length;
        const bottlenecksCount = this.bottlenecks.size;

        return {
            is_monitoring: this.isMonitoring,
            total_operations_tracked: totalOperations,
            operation_types: operationTypes,
            performance_alerts: alertsCount,
            detected_bottlenecks: bottlenecksCount,
            optimization_suggestions: this.optimizationSuggestions.length,
            monitoring_uptime_ms: this.isMonitoring ? Date.now() - this._getMonitoringStartTime() : 0,
            data_retention_period_ms: this.config.retentionPeriod,
            sampling_interval_ms: this.config.samplingInterval
        };
    }

    /**
     * Get health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        const performanceScore = await this._calculatePerformanceScore();
        const criticalAlerts = this.performanceAlerts.filter(alert => 
            alert.type === 'critical_performance_degradation'
        ).length;

        return {
            status: performanceScore > 0.8 && criticalAlerts === 0 ? 'healthy' : 'degraded',
            is_monitoring: this.isMonitoring,
            performance_score: performanceScore,
            critical_alerts: criticalAlerts,
            bottlenecks_detected: this.bottlenecks.size,
            monitoring_efficiency: this._getMonitoringEfficiency()
        };
    }

    /**
     * Shutdown the performance monitor
     */
    async shutdown() {
        log('debug', 'Shutting down performance monitor...');
        
        await this.stopMonitoring();
        
        // Shutdown components
        await this.responseTimeTracker.shutdown();
        await this.resourceUsageTracker.shutdown();
        await this.throughputTracker.shutdown();
        await this.errorRateTracker.shutdown();
        
        if (this.config.enableBottleneckDetection) {
            await this.bottleneckDetector.shutdown();
        }
        
        if (this.config.enableOptimizationSuggestions) {
            await this.optimizationEngine.shutdown();
        }
        
        // Clear data
        this.performanceData.clear();
        this.bottlenecks.clear();
        this.optimizationSuggestions.length = 0;
        this.performanceAlerts.length = 0;
        this.baselines.clear();
        
        log('info', 'Performance monitor shut down successfully');
    }

    // Private methods

    /**
     * Perform monitoring cycle
     * @private
     */
    async _performMonitoringCycle() {
        try {
            // Collect current resource usage
            await this.resourceUsageTracker.collectCurrentUsage();
            
            // Detect bottlenecks
            if (this.config.enableBottleneckDetection) {
                const newBottlenecks = await this.bottleneckDetector.detectBottlenecks(this.performanceData);
                for (const [operation, bottleneck] of newBottlenecks) {
                    this.bottlenecks.set(operation, bottleneck);
                }
            }
            
            // Generate optimization suggestions
            if (this.config.enableOptimizationSuggestions) {
                const suggestions = await this.optimizationEngine.generateSuggestions(
                    this.performanceData, 
                    this.bottlenecks
                );
                this.optimizationSuggestions.push(...suggestions);
                
                // Limit suggestions array size
                if (this.optimizationSuggestions.length > 100) {
                    this.optimizationSuggestions.splice(0, this.optimizationSuggestions.length - 100);
                }
            }
            
            // Clean up old alerts
            this._cleanupOldAlerts();
            
        } catch (error) {
            log('error', `Performance monitoring cycle failed: ${error.message}`);
        }
    }

    /**
     * Check performance thresholds
     * @param {string} operation - Operation name
     * @param {number} duration - Duration in milliseconds
     * @param {Object} metadata - Metadata
     * @private
     */
    async _checkPerformanceThresholds(operation, duration, metadata) {
        const thresholds = this.config.performanceThresholds;
        
        // Check response time threshold
        if (operation.includes('api') && duration > thresholds.apiResponseTime) {
            this.performanceAlerts.push({
                type: 'slow_api_response',
                operation,
                duration,
                threshold: thresholds.apiResponseTime,
                timestamp: Date.now(),
                metadata
            });
        }
        
        // Check database query threshold
        if (operation.includes('database') && duration > thresholds.databaseQueryTime) {
            this.performanceAlerts.push({
                type: 'slow_database_query',
                operation,
                duration,
                threshold: thresholds.databaseQueryTime,
                timestamp: Date.now(),
                metadata
            });
        }
        
        // Check workflow execution threshold
        if (operation.includes('workflow') && duration > thresholds.workflowExecutionTime) {
            this.performanceAlerts.push({
                type: 'slow_workflow_execution',
                operation,
                duration,
                threshold: thresholds.workflowExecutionTime,
                timestamp: Date.now(),
                metadata
            });
        }
    }

    /**
     * Establish performance baselines
     * @private
     */
    async _establishBaselines() {
        // This would typically analyze historical data to establish baselines
        // For now, we'll set some reasonable defaults
        this.baselines.set('api_response_time', { avg: 500, p95: 1000, p99: 2000 });
        this.baselines.set('database_query_time', { avg: 50, p95: 200, p99: 500 });
        this.baselines.set('workflow_execution_time', { avg: 30000, p95: 120000, p99: 300000 });
        this.baselines.set('memory_usage', { avg: 0.4, p95: 0.7, p99: 0.8 });
        this.baselines.set('cpu_usage', { avg: 0.3, p95: 0.6, p99: 0.7 });
        
        log('debug', 'Performance baselines established');
    }

    /**
     * Generate performance summary
     * @param {Object} timeRange - Time range
     * @returns {Promise<Object>} Performance summary
     * @private
     */
    async _generatePerformanceSummary(timeRange) {
        const operations = Array.from(this.performanceData.entries())
            .map(([operation, data]) => {
                const filteredData = data.filter(metric => 
                    metric.timestamp >= timeRange.start && metric.timestamp <= timeRange.end
                );
                
                if (filteredData.length === 0) return null;
                
                const durations = filteredData.map(m => m.duration);
                const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length;
                const p95 = this._calculatePercentile(durations, 0.95);
                const p99 = this._calculatePercentile(durations, 0.99);
                
                return {
                    operation,
                    count: filteredData.length,
                    avg_duration: Math.round(avg),
                    p95_duration: Math.round(p95),
                    p99_duration: Math.round(p99),
                    min_duration: Math.min(...durations),
                    max_duration: Math.max(...durations)
                };
            })
            .filter(Boolean);

        return {
            total_operations: operations.reduce((sum, op) => sum + op.count, 0),
            operation_breakdown: operations,
            overall_performance_score: await this._calculatePerformanceScore()
        };
    }

    /**
     * Calculate performance score
     * @returns {Promise<number>} Performance score (0-1)
     * @private
     */
    async _calculatePerformanceScore() {
        // Simplified performance score calculation
        const responseTimeScore = await this.responseTimeTracker.getPerformanceScore();
        const resourceUsageScore = await this.resourceUsageTracker.getPerformanceScore();
        const throughputScore = await this.throughputTracker.getPerformanceScore();
        const errorRateScore = await this.errorRateTracker.getPerformanceScore();
        
        return (responseTimeScore + resourceUsageScore + throughputScore + errorRateScore) / 4;
    }

    /**
     * Get performance health status
     * @returns {Promise<Object>} Health status
     * @private
     */
    async _getPerformanceHealthStatus() {
        const score = await this._calculatePerformanceScore();
        const criticalAlerts = this.performanceAlerts.filter(alert => 
            alert.type.includes('critical')
        ).length;
        
        let status = 'healthy';
        if (score < 0.6 || criticalAlerts > 0) {
            status = 'unhealthy';
        } else if (score < 0.8 || this.performanceAlerts.length > 5) {
            status = 'degraded';
        }
        
        return {
            status,
            score,
            critical_alerts: criticalAlerts,
            total_alerts: this.performanceAlerts.length
        };
    }

    /**
     * Get active operations
     * @returns {Array} Active operations
     * @private
     */
    _getActiveOperations() {
        const now = Date.now();
        const last30Seconds = now - 30000;
        
        const activeOps = [];
        for (const [operation, data] of this.performanceData) {
            const recentMetrics = data.filter(metric => metric.timestamp >= last30Seconds);
            if (recentMetrics.length > 0) {
                activeOps.push({
                    operation,
                    recent_count: recentMetrics.length,
                    avg_duration: recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length
                });
            }
        }
        
        return activeOps;
    }

    /**
     * Clean up old data
     * @param {Array} operationData - Operation data array
     * @private
     */
    _cleanupOldData(operationData) {
        const cutoff = Date.now() - this.config.retentionPeriod;
        while (operationData.length > 0 && operationData[0].timestamp < cutoff) {
            operationData.shift();
        }
    }

    /**
     * Clean up old alerts
     * @private
     */
    _cleanupOldAlerts() {
        const cutoff = Date.now() - this.config.retentionPeriod;
        this.performanceAlerts = this.performanceAlerts.filter(alert => alert.timestamp >= cutoff);
    }

    /**
     * Calculate percentile
     * @param {Array} values - Values array
     * @param {number} percentile - Percentile (0-1)
     * @returns {number} Percentile value
     * @private
     */
    _calculatePercentile(values, percentile) {
        const sorted = values.slice().sort((a, b) => a - b);
        const index = Math.ceil(sorted.length * percentile) - 1;
        return sorted[Math.max(0, index)];
    }

    /**
     * Get baselines for time range
     * @param {Object} timeRange - Time range
     * @returns {Object} Baselines
     * @private
     */
    _getBaselinesForRange(timeRange) {
        return Object.fromEntries(this.baselines);
    }

    /**
     * Get monitoring start time
     * @returns {number} Start time
     * @private
     */
    _getMonitoringStartTime() {
        // This would be set when monitoring starts
        return Date.now() - 3600000; // Placeholder: 1 hour ago
    }

    /**
     * Get monitoring efficiency
     * @returns {number} Efficiency score (0-1)
     * @private
     */
    _getMonitoringEfficiency() {
        // Calculate based on data collection success rate, processing time, etc.
        return 0.95; // Placeholder
    }
}

// Component classes (simplified implementations)

class ResponseTimeTracker {
    constructor(config) {
        this.config = config;
        this.metrics = new Map();
    }

    async initialize() {}
    
    async recordMetric(operation, duration, metadata) {
        if (!this.metrics.has(operation)) {
            this.metrics.set(operation, []);
        }
        this.metrics.get(operation).push({ duration, timestamp: Date.now(), metadata });
    }
    
    async getAnalytics(timeRange) {
        return { avg_response_time: 500, p95_response_time: 1000 };
    }
    
    async getCurrentMetrics() {
        return { current_avg: 450, current_p95: 900 };
    }
    
    async getPerformanceScore() {
        return 0.85;
    }
    
    async shutdown() {
        this.metrics.clear();
    }
}

class ResourceUsageTracker {
    constructor(config) {
        this.config = config;
        this.usage = [];
    }

    async initialize() {}
    
    async collectCurrentUsage() {
        const memUsage = process.memoryUsage();
        this.usage.push({
            timestamp: Date.now(),
            memory: memUsage.heapUsed / memUsage.heapTotal,
            cpu: Math.random() * 0.5 // Simplified
        });
    }
    
    async getAnalytics(timeRange) {
        return { avg_memory_usage: 0.4, avg_cpu_usage: 0.3 };
    }
    
    async getCurrentUsage() {
        return { memory: 0.45, cpu: 0.25 };
    }
    
    async getPerformanceScore() {
        return 0.9;
    }
    
    async shutdown() {
        this.usage.length = 0;
    }
}

class ThroughputTracker {
    constructor(config) {
        this.config = config;
        this.operations = [];
    }

    async initialize() {}
    
    async recordOperation(operation, timestamp) {
        this.operations.push({ operation, timestamp });
    }
    
    async getAnalytics(timeRange) {
        return { operations_per_second: 10, operations_per_minute: 600 };
    }
    
    async getCurrentThroughput() {
        return { current_ops_per_second: 12 };
    }
    
    async getPerformanceScore() {
        return 0.8;
    }
    
    async shutdown() {
        this.operations.length = 0;
    }
}

class ErrorRateTracker {
    constructor(config) {
        this.config = config;
        this.errors = new Map();
    }

    async initialize() {}
    
    async recordError(operation, error, metadata) {
        if (!this.errors.has(operation)) {
            this.errors.set(operation, []);
        }
        this.errors.get(operation).push({ error: error.message, timestamp: Date.now(), metadata });
    }
    
    async getErrorRate(operation) {
        return Math.random() * 0.05; // 0-5%
    }
    
    async getAnalytics(timeRange) {
        return { overall_error_rate: 0.02, errors_by_operation: {} };
    }
    
    async getCurrentErrorRates() {
        return { current_error_rate: 0.015 };
    }
    
    async getPerformanceScore() {
        return 0.95;
    }
    
    async shutdown() {
        this.errors.clear();
    }
}

class BottleneckDetector {
    constructor(config) {
        this.config = config;
    }

    async initialize() {}
    
    async detectBottlenecks(performanceData) {
        return new Map(); // Simplified
    }
    
    async getDetectedBottlenecks(timeRange) {
        return [];
    }
    
    async shutdown() {}
}

class OptimizationEngine {
    constructor(config) {
        this.config = config;
    }

    async initialize() {}
    
    async generateSuggestions(performanceData, bottlenecks) {
        return []; // Simplified
    }
    
    async getSuggestions(timeRange) {
        return [];
    }
    
    async shutdown() {}
}

export default PerformanceMonitor;

