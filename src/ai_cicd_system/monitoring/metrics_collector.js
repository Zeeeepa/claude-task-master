/**
 * @fileoverview Metrics Collector
 * @description Advanced metrics collection and aggregation system
 */

import { EventEmitter } from 'events';

/**
 * Metrics collector for comprehensive system monitoring
 */
export class MetricsCollector extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            collection_interval: config.collection_interval || 60000, // 1 minute
            aggregation_window: config.aggregation_window || 300000, // 5 minutes
            retention_period: config.retention_period || 86400000, // 24 hours
            enable_custom_metrics: config.enable_custom_metrics !== false,
            enable_system_metrics: config.enable_system_metrics !== false,
            enable_business_metrics: config.enable_business_metrics !== false,
            prometheus_compatible: config.prometheus_compatible !== false,
            ...config
        };

        this.metrics = new Map();
        this.aggregatedMetrics = new Map();
        this.customMetrics = new Map();
        this.metricHistory = [];
        this.collectionInterval = null;
        this.aggregationInterval = null;
        this.isCollecting = false;
    }

    /**
     * Initialize metrics collector
     */
    async initialize() {
        this._initializeDefaultMetrics();
        this.emit('initialized');
    }

    /**
     * Start metrics collection
     */
    async startCollection() {
        if (this.isCollecting) return;

        this.isCollecting = true;

        // Start periodic collection
        this.collectionInterval = setInterval(async () => {
            await this._collectMetrics();
        }, this.config.collection_interval);

        // Start periodic aggregation
        this.aggregationInterval = setInterval(async () => {
            await this._aggregateMetrics();
        }, this.config.aggregation_window);

        // Initial collection
        await this._collectMetrics();

        this.emit('collection_started');
    }

    /**
     * Stop metrics collection
     */
    async stopCollection() {
        if (!this.isCollecting) return;

        this.isCollecting = false;

        if (this.collectionInterval) {
            clearInterval(this.collectionInterval);
            this.collectionInterval = null;
        }

        if (this.aggregationInterval) {
            clearInterval(this.aggregationInterval);
            this.aggregationInterval = null;
        }

        this.emit('collection_stopped');
    }

    /**
     * Record a custom metric
     */
    recordMetric(name, value, labels = {}, timestamp = new Date()) {
        const metricKey = this._generateMetricKey(name, labels);
        
        const metric = {
            name,
            value,
            labels,
            timestamp,
            type: this._inferMetricType(value)
        };

        // Store in current metrics
        this.metrics.set(metricKey, metric);

        // Store in custom metrics if enabled
        if (this.config.enable_custom_metrics) {
            if (!this.customMetrics.has(name)) {
                this.customMetrics.set(name, []);
            }
            this.customMetrics.get(name).push(metric);
        }

        // Add to history
        this.metricHistory.push(metric);
        this._cleanupHistory();

        this.emit('metric_recorded', metric);
    }

    /**
     * Record counter metric (always increments)
     */
    recordCounter(name, increment = 1, labels = {}) {
        const existing = this._getMetricValue(name, labels) || 0;
        this.recordMetric(name, existing + increment, labels);
    }

    /**
     * Record gauge metric (can go up or down)
     */
    recordGauge(name, value, labels = {}) {
        this.recordMetric(name, value, labels);
    }

    /**
     * Record histogram metric (for timing data)
     */
    recordHistogram(name, value, labels = {}) {
        const histogramKey = `${name}_histogram`;
        
        if (!this.customMetrics.has(histogramKey)) {
            this.customMetrics.set(histogramKey, {
                buckets: new Map(),
                count: 0,
                sum: 0
            });
        }

        const histogram = this.customMetrics.get(histogramKey);
        histogram.count++;
        histogram.sum += value;

        // Add to appropriate bucket
        const bucket = this._getBucket(value);
        const bucketCount = histogram.buckets.get(bucket) || 0;
        histogram.buckets.set(bucket, bucketCount + 1);

        this.recordMetric(name, value, { ...labels, type: 'histogram' });
    }

    /**
     * Record summary metric (for percentiles)
     */
    recordSummary(name, value, labels = {}) {
        const summaryKey = `${name}_summary`;
        
        if (!this.customMetrics.has(summaryKey)) {
            this.customMetrics.set(summaryKey, {
                values: [],
                count: 0,
                sum: 0
            });
        }

        const summary = this.customMetrics.get(summaryKey);
        summary.values.push(value);
        summary.count++;
        summary.sum += value;

        // Keep only recent values for percentile calculation
        if (summary.values.length > 1000) {
            summary.values = summary.values.slice(-1000);
        }

        this.recordMetric(name, value, { ...labels, type: 'summary' });
    }

    /**
     * Get current metrics
     */
    getCurrentMetrics() {
        const current = {};
        
        for (const [key, metric] of this.metrics) {
            current[key] = {
                name: metric.name,
                value: metric.value,
                labels: metric.labels,
                timestamp: metric.timestamp,
                type: metric.type
            };
        }

        return current;
    }

    /**
     * Get aggregated metrics
     */
    getAggregatedMetrics(timeRange = '1h') {
        const timeRangeMs = this._parseTimeRange(timeRange);
        const cutoffTime = new Date(Date.now() - timeRangeMs);

        const relevantMetrics = this.metricHistory.filter(
            metric => metric.timestamp >= cutoffTime
        );

        return this._aggregateMetricsByName(relevantMetrics);
    }

    /**
     * Get metrics in Prometheus format
     */
    getPrometheusMetrics() {
        if (!this.config.prometheus_compatible) {
            throw new Error('Prometheus compatibility not enabled');
        }

        let output = '';
        const timestamp = Date.now();

        for (const [key, metric] of this.metrics) {
            const metricName = this._sanitizePrometheusName(metric.name);
            const labels = this._formatPrometheusLabels(metric.labels);
            
            output += `# TYPE ${metricName} ${metric.type}\n`;
            output += `${metricName}${labels} ${metric.value} ${timestamp}\n`;
        }

        return output;
    }

    /**
     * Get metric statistics
     */
    getMetricStatistics(metricName, timeRange = '1h') {
        const timeRangeMs = this._parseTimeRange(timeRange);
        const cutoffTime = new Date(Date.now() - timeRangeMs);

        const relevantMetrics = this.metricHistory.filter(
            metric => metric.name === metricName && metric.timestamp >= cutoffTime
        );

        if (relevantMetrics.length === 0) {
            return null;
        }

        const values = relevantMetrics.map(m => m.value);
        values.sort((a, b) => a - b);

        return {
            count: values.length,
            min: Math.min(...values),
            max: Math.max(...values),
            avg: values.reduce((a, b) => a + b, 0) / values.length,
            median: this._calculatePercentile(values, 50),
            p95: this._calculatePercentile(values, 95),
            p99: this._calculatePercentile(values, 99),
            sum: values.reduce((a, b) => a + b, 0),
            stdDev: this._calculateStandardDeviation(values)
        };
    }

    /**
     * Get top metrics by value
     */
    getTopMetrics(limit = 10, timeRange = '1h') {
        const aggregated = this.getAggregatedMetrics(timeRange);
        
        return Object.entries(aggregated)
            .sort((a, b) => b[1].avg - a[1].avg)
            .slice(0, limit)
            .map(([name, stats]) => ({
                name,
                ...stats
            }));
    }

    /**
     * Export metrics for external systems
     */
    exportMetrics(format = 'json') {
        const exportData = {
            timestamp: new Date(),
            current: this.getCurrentMetrics(),
            aggregated: this.getAggregatedMetrics(),
            custom: this._exportCustomMetrics()
        };

        switch (format.toLowerCase()) {
            case 'json':
                return JSON.stringify(exportData, null, 2);
            case 'prometheus':
                return this.getPrometheusMetrics();
            case 'csv':
                return this._exportToCsv(exportData);
            default:
                throw new Error(`Unsupported export format: ${format}`);
        }
    }

    /**
     * Private methods
     */
    _initializeDefaultMetrics() {
        // System metrics
        if (this.config.enable_system_metrics) {
            this._initializeSystemMetrics();
        }

        // Business metrics
        if (this.config.enable_business_metrics) {
            this._initializeBusinessMetrics();
        }
    }

    _initializeSystemMetrics() {
        const systemMetrics = [
            'cpu_usage_percent',
            'memory_usage_bytes',
            'memory_usage_percent',
            'disk_usage_bytes',
            'disk_usage_percent',
            'network_bytes_sent',
            'network_bytes_received',
            'process_uptime_seconds',
            'gc_duration_seconds',
            'event_loop_lag_seconds'
        ];

        systemMetrics.forEach(metric => {
            this.recordMetric(metric, 0, { type: 'system' });
        });
    }

    _initializeBusinessMetrics() {
        const businessMetrics = [
            'pipeline_executions_total',
            'pipeline_duration_seconds',
            'pipeline_success_rate',
            'code_generation_requests_total',
            'code_generation_duration_seconds',
            'validation_checks_total',
            'validation_duration_seconds',
            'deployment_attempts_total',
            'deployment_duration_seconds',
            'error_rate_percent',
            'api_requests_total',
            'api_response_time_seconds'
        ];

        businessMetrics.forEach(metric => {
            this.recordMetric(metric, 0, { type: 'business' });
        });
    }

    async _collectMetrics() {
        try {
            // Collect system metrics
            if (this.config.enable_system_metrics) {
                await this._collectSystemMetrics();
            }

            // Collect business metrics
            if (this.config.enable_business_metrics) {
                await this._collectBusinessMetrics();
            }

            this.emit('metrics_collected');
        } catch (error) {
            this.emit('collection_error', error);
        }
    }

    async _collectSystemMetrics() {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();

        // Memory metrics
        this.recordGauge('memory_usage_bytes', memUsage.heapUsed, { type: 'heap' });
        this.recordGauge('memory_usage_bytes', memUsage.rss, { type: 'rss' });
        this.recordGauge('memory_usage_bytes', memUsage.external, { type: 'external' });

        // CPU metrics
        this.recordGauge('cpu_usage_microseconds', cpuUsage.user, { type: 'user' });
        this.recordGauge('cpu_usage_microseconds', cpuUsage.system, { type: 'system' });

        // Process metrics
        this.recordGauge('process_uptime_seconds', process.uptime());

        // Event loop lag (simplified)
        const start = process.hrtime.bigint();
        setImmediate(() => {
            const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to milliseconds
            this.recordGauge('event_loop_lag_milliseconds', lag);
        });
    }

    async _collectBusinessMetrics() {
        // These would typically be collected from various system components
        // For now, we'll emit events that other components can listen to
        this.emit('collect_business_metrics');
    }

    async _aggregateMetrics() {
        const now = new Date();
        const windowStart = new Date(now.getTime() - this.config.aggregation_window);

        const windowMetrics = this.metricHistory.filter(
            metric => metric.timestamp >= windowStart
        );

        const aggregated = this._aggregateMetricsByName(windowMetrics);
        
        // Store aggregated metrics
        const aggregationKey = `${windowStart.getTime()}_${now.getTime()}`;
        this.aggregatedMetrics.set(aggregationKey, {
            windowStart,
            windowEnd: now,
            metrics: aggregated
        });

        // Cleanup old aggregations
        this._cleanupAggregations();

        this.emit('metrics_aggregated', aggregated);
    }

    _aggregateMetricsByName(metrics) {
        const grouped = {};

        metrics.forEach(metric => {
            if (!grouped[metric.name]) {
                grouped[metric.name] = [];
            }
            grouped[metric.name].push(metric.value);
        });

        const aggregated = {};
        Object.keys(grouped).forEach(name => {
            const values = grouped[name];
            aggregated[name] = {
                count: values.length,
                min: Math.min(...values),
                max: Math.max(...values),
                avg: values.reduce((a, b) => a + b, 0) / values.length,
                sum: values.reduce((a, b) => a + b, 0),
                latest: values[values.length - 1]
            };
        });

        return aggregated;
    }

    _generateMetricKey(name, labels) {
        const labelStr = Object.keys(labels)
            .sort()
            .map(key => `${key}=${labels[key]}`)
            .join(',');
        return labelStr ? `${name}{${labelStr}}` : name;
    }

    _getMetricValue(name, labels = {}) {
        const key = this._generateMetricKey(name, labels);
        const metric = this.metrics.get(key);
        return metric ? metric.value : null;
    }

    _inferMetricType(value) {
        if (typeof value === 'number') {
            return Number.isInteger(value) ? 'counter' : 'gauge';
        }
        return 'gauge';
    }

    _getBucket(value) {
        // Simple bucketing strategy - could be made configurable
        const buckets = [0.1, 0.5, 1, 2.5, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
        
        for (const bucket of buckets) {
            if (value <= bucket) {
                return bucket;
            }
        }
        return Infinity;
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

    _calculatePercentile(sortedValues, percentile) {
        if (sortedValues.length === 0) return 0;
        
        const index = (percentile / 100) * (sortedValues.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        
        if (lower === upper) {
            return sortedValues[lower];
        }
        
        const weight = index - lower;
        return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
    }

    _calculateStandardDeviation(values) {
        if (values.length === 0) return 0;
        
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const squaredDiffs = values.map(value => Math.pow(value - avg, 2));
        const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;
        
        return Math.sqrt(avgSquaredDiff);
    }

    _sanitizePrometheusName(name) {
        return name.replace(/[^a-zA-Z0-9_]/g, '_');
    }

    _formatPrometheusLabels(labels) {
        if (Object.keys(labels).length === 0) return '';
        
        const labelPairs = Object.entries(labels)
            .map(([key, value]) => `${key}="${value}"`)
            .join(',');
        
        return `{${labelPairs}}`;
    }

    _exportCustomMetrics() {
        const exported = {};
        
        for (const [name, data] of this.customMetrics) {
            if (Array.isArray(data)) {
                exported[name] = data.map(metric => ({
                    value: metric.value,
                    labels: metric.labels,
                    timestamp: metric.timestamp
                }));
            } else {
                exported[name] = data;
            }
        }
        
        return exported;
    }

    _exportToCsv(data) {
        const rows = [];
        rows.push(['timestamp', 'metric_name', 'value', 'labels']);
        
        Object.values(data.current).forEach(metric => {
            const labels = JSON.stringify(metric.labels);
            rows.push([
                metric.timestamp.toISOString(),
                metric.name,
                metric.value,
                labels
            ]);
        });
        
        return rows.map(row => row.join(',')).join('\n');
    }

    _cleanupHistory() {
        const cutoffTime = new Date(Date.now() - this.config.retention_period);
        this.metricHistory = this.metricHistory.filter(
            metric => metric.timestamp >= cutoffTime
        );
    }

    _cleanupAggregations() {
        const cutoffTime = new Date(Date.now() - this.config.retention_period);
        
        for (const [key, aggregation] of this.aggregatedMetrics) {
            if (aggregation.windowEnd < cutoffTime) {
                this.aggregatedMetrics.delete(key);
            }
        }
    }
}

export default MetricsCollector;

