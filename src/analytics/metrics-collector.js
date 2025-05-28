/**
 * @fileoverview Metrics Collector
 * @description Comprehensive metrics collection and analysis system
 */

import EventEmitter from 'events';
import { performance } from 'perf_hooks';
import os from 'os';
import process from 'process';

/**
 * Metric types
 */
export const MetricType = {
    COUNTER: 'counter',
    GAUGE: 'gauge',
    HISTOGRAM: 'histogram',
    SUMMARY: 'summary',
    TIMER: 'timer'
};

/**
 * Aggregation functions
 */
export const AggregationFunction = {
    SUM: 'sum',
    AVG: 'avg',
    MIN: 'min',
    MAX: 'max',
    COUNT: 'count',
    PERCENTILE: 'percentile'
};

/**
 * Metrics Collector for comprehensive system analytics
 */
export class MetricsCollector extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            enabled: config.enabled !== false,
            collectInterval: config.collectInterval || 10000, // 10 seconds
            retentionPeriod: config.retentionPeriod || 86400000, // 24 hours
            maxMetrics: config.maxMetrics || 10000,
            enableSystemMetrics: config.enableSystemMetrics !== false,
            enableCustomMetrics: config.enableCustomMetrics !== false,
            enableAggregation: config.enableAggregation !== false,
            aggregationInterval: config.aggregationInterval || 60000, // 1 minute
            exportFormats: config.exportFormats || ['json', 'prometheus'],
            ...config
        };

        this.metrics = new Map();
        this.timers = new Map();
        this.aggregatedMetrics = new Map();
        this.intervals = new Map();
        this.isRunning = false;
        this.startTime = Date.now();
        
        // Built-in metric definitions
        this.metricDefinitions = new Map();
        this.initializeBuiltInMetrics();
    }

    /**
     * Initialize the metrics collector
     */
    async initialize() {
        if (!this.config.enabled) {
            console.log('Metrics collection disabled');
            return;
        }

        console.log('Initializing metrics collector...');
        
        // Start collection intervals
        this.startCollection();
        
        // Start aggregation if enabled
        if (this.config.enableAggregation) {
            this.startAggregation();
        }
        
        this.isRunning = true;
        this.emit('initialized');
        
        console.log('Metrics collector initialized');
    }

    /**
     * Start metrics collection
     */
    startCollection() {
        if (this.config.enableSystemMetrics) {
            const systemInterval = setInterval(() => {
                this.collectSystemMetrics();
            }, this.config.collectInterval);
            
            this.intervals.set('system', systemInterval);
        }

        // Start cleanup interval
        const cleanupInterval = setInterval(() => {
            this.cleanupOldMetrics();
        }, this.config.retentionPeriod / 10);
        
        this.intervals.set('cleanup', cleanupInterval);
    }

    /**
     * Start metrics aggregation
     */
    startAggregation() {
        const aggregationInterval = setInterval(() => {
            this.aggregateMetrics();
        }, this.config.aggregationInterval);
        
        this.intervals.set('aggregation', aggregationInterval);
    }

    /**
     * Stop metrics collection
     */
    stop() {
        if (!this.isRunning) {
            return;
        }

        console.log('Stopping metrics collection...');
        
        // Clear all intervals
        for (const [name, interval] of this.intervals) {
            clearInterval(interval);
        }
        this.intervals.clear();
        
        this.isRunning = false;
        this.emit('stopped');
        
        console.log('Metrics collection stopped');
    }

    /**
     * Define a custom metric
     */
    defineMetric(name, config) {
        const metricDef = {
            name,
            type: config.type || MetricType.GAUGE,
            description: config.description || '',
            labels: config.labels || [],
            unit: config.unit || '',
            aggregation: config.aggregation || AggregationFunction.AVG,
            ...config
        };

        this.metricDefinitions.set(name, metricDef);
        
        if (!this.metrics.has(name)) {
            this.metrics.set(name, []);
        }

        this.emit('metric_defined', metricDef);
        return metricDef;
    }

    /**
     * Record a metric value
     */
    recordMetric(name, value, labels = {}, timestamp = Date.now()) {
        if (!this.config.enabled) {
            return;
        }

        const metricDef = this.metricDefinitions.get(name);
        if (!metricDef) {
            // Auto-define metric if not exists
            this.defineMetric(name, { type: MetricType.GAUGE });
        }

        const metric = {
            name,
            value,
            labels,
            timestamp
        };

        if (!this.metrics.has(name)) {
            this.metrics.set(name, []);
        }

        this.metrics.get(name).push(metric);
        
        // Limit metric storage
        const metrics = this.metrics.get(name);
        if (metrics.length > this.config.maxMetrics) {
            metrics.splice(0, metrics.length - this.config.maxMetrics);
        }

        this.emit('metric_recorded', metric);
    }

    /**
     * Increment a counter metric
     */
    incrementCounter(name, value = 1, labels = {}) {
        this.recordMetric(name, value, labels);
    }

    /**
     * Set a gauge metric
     */
    setGauge(name, value, labels = {}) {
        this.recordMetric(name, value, labels);
    }

    /**
     * Record a histogram value
     */
    recordHistogram(name, value, labels = {}) {
        this.recordMetric(name, value, labels);
    }

    /**
     * Start a timer
     */
    startTimer(name, labels = {}) {
        const timerId = `${name}_${Date.now()}_${Math.random()}`;
        const timer = {
            name,
            labels,
            startTime: performance.now(),
            startTimestamp: Date.now()
        };
        
        this.timers.set(timerId, timer);
        return timerId;
    }

    /**
     * End a timer and record the duration
     */
    endTimer(timerId) {
        const timer = this.timers.get(timerId);
        if (!timer) {
            console.warn(`Timer ${timerId} not found`);
            return null;
        }

        const duration = performance.now() - timer.startTime;
        this.timers.delete(timerId);
        
        this.recordMetric(timer.name, duration, timer.labels, timer.startTimestamp);
        
        return duration;
    }

    /**
     * Time a function execution
     */
    async timeFunction(name, fn, labels = {}) {
        const timerId = this.startTimer(name, labels);
        try {
            const result = await fn();
            this.endTimer(timerId);
            return result;
        } catch (error) {
            this.endTimer(timerId);
            this.incrementCounter(`${name}_errors`, 1, labels);
            throw error;
        }
    }

    /**
     * Collect system metrics
     */
    collectSystemMetrics() {
        const timestamp = Date.now();
        
        // CPU metrics
        const cpuUsage = process.cpuUsage();
        this.recordMetric('system_cpu_user', cpuUsage.user, {}, timestamp);
        this.recordMetric('system_cpu_system', cpuUsage.system, {}, timestamp);
        
        // Memory metrics
        const memUsage = process.memoryUsage();
        this.recordMetric('system_memory_rss', memUsage.rss, {}, timestamp);
        this.recordMetric('system_memory_heap_used', memUsage.heapUsed, {}, timestamp);
        this.recordMetric('system_memory_heap_total', memUsage.heapTotal, {}, timestamp);
        this.recordMetric('system_memory_external', memUsage.external, {}, timestamp);
        
        // System memory
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        this.recordMetric('system_memory_total', totalMem, {}, timestamp);
        this.recordMetric('system_memory_free', freeMem, {}, timestamp);
        this.recordMetric('system_memory_used', usedMem, {}, timestamp);
        this.recordMetric('system_memory_usage_percent', (usedMem / totalMem) * 100, {}, timestamp);
        
        // Load average
        const loadAvg = os.loadavg();
        this.recordMetric('system_load_1m', loadAvg[0], {}, timestamp);
        this.recordMetric('system_load_5m', loadAvg[1], {}, timestamp);
        this.recordMetric('system_load_15m', loadAvg[2], {}, timestamp);
        
        // Process metrics
        this.recordMetric('system_uptime', process.uptime(), {}, timestamp);
        this.recordMetric('system_pid', process.pid, {}, timestamp);
        
        // Event loop lag
        this.measureEventLoopLag().then(lag => {
            this.recordMetric('system_event_loop_lag', lag, {}, timestamp);
        });
    }

    /**
     * Measure event loop lag
     */
    async measureEventLoopLag() {
        const start = performance.now();
        return new Promise((resolve) => {
            setImmediate(() => {
                const lag = performance.now() - start;
                resolve(lag);
            });
        });
    }

    /**
     * Aggregate metrics
     */
    aggregateMetrics() {
        const now = Date.now();
        const aggregationWindow = this.config.aggregationInterval;
        const windowStart = now - aggregationWindow;

        for (const [metricName, metricData] of this.metrics) {
            const metricDef = this.metricDefinitions.get(metricName);
            if (!metricDef) continue;

            // Get metrics in the aggregation window
            const windowMetrics = metricData.filter(m => m.timestamp >= windowStart);
            if (windowMetrics.length === 0) continue;

            // Group by labels
            const labelGroups = this.groupByLabels(windowMetrics);

            for (const [labelKey, metrics] of labelGroups) {
                const aggregated = this.calculateAggregation(metrics, metricDef.aggregation);
                
                const aggregatedMetric = {
                    name: metricName,
                    value: aggregated,
                    labels: metrics[0].labels,
                    timestamp: now,
                    windowStart,
                    windowEnd: now,
                    sampleCount: metrics.length
                };

                if (!this.aggregatedMetrics.has(metricName)) {
                    this.aggregatedMetrics.set(metricName, []);
                }

                this.aggregatedMetrics.get(metricName).push(aggregatedMetric);
                
                // Limit aggregated metrics storage
                const aggMetrics = this.aggregatedMetrics.get(metricName);
                if (aggMetrics.length > 1000) {
                    aggMetrics.splice(0, aggMetrics.length - 1000);
                }
            }
        }

        this.emit('metrics_aggregated', { timestamp: now });
    }

    /**
     * Group metrics by labels
     */
    groupByLabels(metrics) {
        const groups = new Map();
        
        for (const metric of metrics) {
            const labelKey = JSON.stringify(metric.labels);
            if (!groups.has(labelKey)) {
                groups.set(labelKey, []);
            }
            groups.get(labelKey).push(metric);
        }
        
        return groups;
    }

    /**
     * Calculate aggregation for a set of metrics
     */
    calculateAggregation(metrics, aggregationFunction) {
        const values = metrics.map(m => m.value);
        
        switch (aggregationFunction) {
            case AggregationFunction.SUM:
                return values.reduce((sum, val) => sum + val, 0);
            case AggregationFunction.AVG:
                return values.reduce((sum, val) => sum + val, 0) / values.length;
            case AggregationFunction.MIN:
                return Math.min(...values);
            case AggregationFunction.MAX:
                return Math.max(...values);
            case AggregationFunction.COUNT:
                return values.length;
            case AggregationFunction.PERCENTILE:
                return this.calculatePercentile(values, 95); // 95th percentile
            default:
                return values[values.length - 1]; // Last value
        }
    }

    /**
     * Calculate percentile
     */
    calculatePercentile(values, percentile) {
        const sorted = values.slice().sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }

    /**
     * Clean up old metrics
     */
    cleanupOldMetrics() {
        const cutoff = Date.now() - this.config.retentionPeriod;
        
        for (const [name, metrics] of this.metrics) {
            const filtered = metrics.filter(metric => metric.timestamp > cutoff);
            this.metrics.set(name, filtered);
        }
        
        for (const [name, metrics] of this.aggregatedMetrics) {
            const filtered = metrics.filter(metric => metric.timestamp > cutoff);
            this.aggregatedMetrics.set(name, filtered);
        }
    }

    /**
     * Get metrics by name
     */
    getMetrics(name, options = {}) {
        const metrics = this.metrics.get(name) || [];
        const { 
            startTime, 
            endTime, 
            labels = {}, 
            limit = 1000,
            aggregated = false 
        } = options;

        let filteredMetrics = aggregated 
            ? (this.aggregatedMetrics.get(name) || [])
            : metrics;

        // Filter by time range
        if (startTime) {
            filteredMetrics = filteredMetrics.filter(m => m.timestamp >= startTime);
        }
        if (endTime) {
            filteredMetrics = filteredMetrics.filter(m => m.timestamp <= endTime);
        }

        // Filter by labels
        if (Object.keys(labels).length > 0) {
            filteredMetrics = filteredMetrics.filter(m => {
                return Object.entries(labels).every(([key, value]) => 
                    m.labels[key] === value
                );
            });
        }

        // Apply limit
        return filteredMetrics.slice(-limit);
    }

    /**
     * Get all metric names
     */
    getMetricNames() {
        return Array.from(this.metrics.keys());
    }

    /**
     * Get metric definitions
     */
    getMetricDefinitions() {
        const result = {};
        for (const [name, def] of this.metricDefinitions) {
            result[name] = def;
        }
        return result;
    }

    /**
     * Get metrics summary
     */
    getMetricsSummary() {
        const totalMetrics = Array.from(this.metrics.values())
            .reduce((sum, metrics) => sum + metrics.length, 0);
        
        const totalAggregated = Array.from(this.aggregatedMetrics.values())
            .reduce((sum, metrics) => sum + metrics.length, 0);

        return {
            totalMetricTypes: this.metrics.size,
            totalMetricPoints: totalMetrics,
            totalAggregatedPoints: totalAggregated,
            activeTimers: this.timers.size,
            uptime: Date.now() - this.startTime,
            isRunning: this.isRunning
        };
    }

    /**
     * Export metrics in specified format
     */
    exportMetrics(format = 'json', options = {}) {
        switch (format.toLowerCase()) {
            case 'prometheus':
                return this.exportPrometheusFormat(options);
            case 'json':
                return this.exportJSONFormat(options);
            case 'csv':
                return this.exportCSVFormat(options);
            default:
                throw new Error(`Unsupported export format: ${format}`);
        }
    }

    /**
     * Export metrics in Prometheus format
     */
    exportPrometheusFormat(options = {}) {
        let output = '';
        
        for (const [metricName, metricDef] of this.metricDefinitions) {
            const metrics = this.getMetrics(metricName, options);
            if (metrics.length === 0) continue;

            // Add metric help and type
            output += `# HELP ${metricName} ${metricDef.description}\n`;
            output += `# TYPE ${metricName} ${this.getPrometheusType(metricDef.type)}\n`;

            // Add metric values
            for (const metric of metrics) {
                const labels = this.formatPrometheusLabels(metric.labels);
                output += `${metricName}${labels} ${metric.value} ${metric.timestamp}\n`;
            }
            output += '\n';
        }

        return output;
    }

    /**
     * Export metrics in JSON format
     */
    exportJSONFormat(options = {}) {
        const result = {
            timestamp: Date.now(),
            summary: this.getMetricsSummary(),
            definitions: this.getMetricDefinitions(),
            metrics: {}
        };

        for (const metricName of this.getMetricNames()) {
            result.metrics[metricName] = this.getMetrics(metricName, options);
        }

        return JSON.stringify(result, null, 2);
    }

    /**
     * Export metrics in CSV format
     */
    exportCSVFormat(options = {}) {
        let csv = 'metric_name,timestamp,value,labels\n';
        
        for (const metricName of this.getMetricNames()) {
            const metrics = this.getMetrics(metricName, options);
            for (const metric of metrics) {
                const labels = JSON.stringify(metric.labels);
                csv += `${metricName},${metric.timestamp},${metric.value},"${labels}"\n`;
            }
        }

        return csv;
    }

    /**
     * Get Prometheus metric type
     */
    getPrometheusType(metricType) {
        switch (metricType) {
            case MetricType.COUNTER:
                return 'counter';
            case MetricType.GAUGE:
                return 'gauge';
            case MetricType.HISTOGRAM:
                return 'histogram';
            case MetricType.SUMMARY:
                return 'summary';
            default:
                return 'gauge';
        }
    }

    /**
     * Format Prometheus labels
     */
    formatPrometheusLabels(labels) {
        if (Object.keys(labels).length === 0) {
            return '';
        }

        const labelPairs = Object.entries(labels)
            .map(([key, value]) => `${key}="${value}"`)
            .join(',');
        
        return `{${labelPairs}}`;
    }

    /**
     * Initialize built-in metrics
     */
    initializeBuiltInMetrics() {
        // System metrics
        this.defineMetric('system_cpu_user', {
            type: MetricType.GAUGE,
            description: 'User CPU time in microseconds',
            unit: 'microseconds'
        });

        this.defineMetric('system_cpu_system', {
            type: MetricType.GAUGE,
            description: 'System CPU time in microseconds',
            unit: 'microseconds'
        });

        this.defineMetric('system_memory_rss', {
            type: MetricType.GAUGE,
            description: 'Resident Set Size memory usage',
            unit: 'bytes'
        });

        this.defineMetric('system_memory_heap_used', {
            type: MetricType.GAUGE,
            description: 'Heap memory used',
            unit: 'bytes'
        });

        this.defineMetric('system_memory_usage_percent', {
            type: MetricType.GAUGE,
            description: 'System memory usage percentage',
            unit: 'percent'
        });

        this.defineMetric('system_event_loop_lag', {
            type: MetricType.GAUGE,
            description: 'Event loop lag in milliseconds',
            unit: 'milliseconds'
        });
    }
}

export default MetricsCollector;

