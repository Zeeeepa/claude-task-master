/**
 * @fileoverview Performance Monitor
 * @description Real-time performance metrics collection and monitoring system
 */

import EventEmitter from 'events';
import os from 'os';
import process from 'process';
import { performance } from 'perf_hooks';

/**
 * Performance Monitor for comprehensive system performance tracking
 */
export class PerformanceMonitor extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            enabled: config.enabled !== false,
            collectInterval: config.collectInterval || 5000, // 5 seconds
            retentionPeriod: config.retentionPeriod || 3600000, // 1 hour
            thresholds: {
                cpuUsage: config.thresholds?.cpuUsage || 80,
                memoryUsage: config.thresholds?.memoryUsage || 85,
                responseTime: config.thresholds?.responseTime || 1000,
                errorRate: config.thresholds?.errorRate || 5,
                ...config.thresholds
            },
            ...config
        };

        this.metrics = new Map();
        this.timers = new Map();
        this.intervals = new Map();
        this.isRunning = false;
        this.startTime = Date.now();
        
        // Performance tracking
        this.requestMetrics = {
            total: 0,
            successful: 0,
            failed: 0,
            totalResponseTime: 0,
            slowRequests: 0
        };

        this.systemMetrics = {
            cpu: [],
            memory: [],
            eventLoop: [],
            gc: []
        };

        this.customMetrics = new Map();
    }

    /**
     * Initialize the performance monitor
     */
    async initialize() {
        if (!this.config.enabled) {
            console.log('Performance monitoring disabled');
            return;
        }

        console.log('Initializing performance monitor...');
        
        // Set up system metrics collection
        this.setupSystemMetricsCollection();
        
        // Set up garbage collection monitoring
        this.setupGCMonitoring();
        
        // Set up event loop monitoring
        this.setupEventLoopMonitoring();
        
        this.isRunning = true;
        this.emit('initialized');
        
        console.log('Performance monitor initialized');
    }

    /**
     * Start performance monitoring
     */
    start() {
        if (!this.config.enabled || this.isRunning) {
            return;
        }

        console.log('Starting performance monitoring...');
        
        // Start metrics collection interval
        const collectInterval = setInterval(() => {
            this.collectSystemMetrics();
        }, this.config.collectInterval);
        
        this.intervals.set('collect', collectInterval);
        
        // Start cleanup interval
        const cleanupInterval = setInterval(() => {
            this.cleanupOldMetrics();
        }, this.config.retentionPeriod / 10);
        
        this.intervals.set('cleanup', cleanupInterval);
        
        this.isRunning = true;
        this.emit('started');
        
        console.log('Performance monitoring started');
    }

    /**
     * Stop performance monitoring
     */
    stop() {
        if (!this.isRunning) {
            return;
        }

        console.log('Stopping performance monitoring...');
        
        // Clear all intervals
        for (const [name, interval] of this.intervals) {
            clearInterval(interval);
        }
        this.intervals.clear();
        
        this.isRunning = false;
        this.emit('stopped');
        
        console.log('Performance monitoring stopped');
    }

    /**
     * Start timing a performance metric
     */
    startTimer(name, metadata = {}) {
        const timer = {
            name,
            startTime: performance.now(),
            startTimestamp: Date.now(),
            metadata
        };
        
        this.timers.set(name, timer);
        return timer;
    }

    /**
     * End timing a performance metric
     */
    endTimer(name) {
        const timer = this.timers.get(name);
        if (!timer) {
            console.warn(`Timer '${name}' not found`);
            return null;
        }

        const endTime = performance.now();
        const duration = endTime - timer.startTime;
        
        this.timers.delete(name);
        
        const metric = {
            name: timer.name,
            duration,
            startTime: timer.startTime,
            endTime,
            timestamp: timer.startTimestamp,
            metadata: timer.metadata
        };

        this.recordMetric('timing', metric);
        
        // Check thresholds
        if (duration > this.config.thresholds.responseTime) {
            this.emit('threshold_exceeded', {
                type: 'response_time',
                metric,
                threshold: this.config.thresholds.responseTime
            });
        }

        return metric;
    }

    /**
     * Record a custom metric
     */
    recordMetric(type, data) {
        const timestamp = Date.now();
        const metric = {
            type,
            timestamp,
            data
        };

        if (!this.metrics.has(type)) {
            this.metrics.set(type, []);
        }

        this.metrics.get(type).push(metric);
        this.emit('metric_recorded', metric);
    }

    /**
     * Record request metrics
     */
    recordRequest(success, responseTime, metadata = {}) {
        this.requestMetrics.total++;
        this.requestMetrics.totalResponseTime += responseTime;
        
        if (success) {
            this.requestMetrics.successful++;
        } else {
            this.requestMetrics.failed++;
        }
        
        if (responseTime > this.config.thresholds.responseTime) {
            this.requestMetrics.slowRequests++;
        }

        this.recordMetric('request', {
            success,
            responseTime,
            metadata,
            errorRate: this.getErrorRate()
        });

        // Check error rate threshold
        const errorRate = this.getErrorRate();
        if (errorRate > this.config.thresholds.errorRate) {
            this.emit('threshold_exceeded', {
                type: 'error_rate',
                value: errorRate,
                threshold: this.config.thresholds.errorRate
            });
        }
    }

    /**
     * Get current error rate percentage
     */
    getErrorRate() {
        if (this.requestMetrics.total === 0) return 0;
        return (this.requestMetrics.failed / this.requestMetrics.total) * 100;
    }

    /**
     * Get average response time
     */
    getAverageResponseTime() {
        if (this.requestMetrics.total === 0) return 0;
        return this.requestMetrics.totalResponseTime / this.requestMetrics.total;
    }

    /**
     * Collect system metrics
     */
    collectSystemMetrics() {
        const timestamp = Date.now();
        
        // CPU usage
        const cpuUsage = process.cpuUsage();
        const cpuPercent = this.calculateCPUPercent(cpuUsage);
        
        // Memory usage
        const memUsage = process.memoryUsage();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const memPercent = ((totalMem - freeMem) / totalMem) * 100;
        
        // Event loop lag
        const eventLoopLag = this.measureEventLoopLag();
        
        const systemMetric = {
            timestamp,
            cpu: {
                usage: cpuUsage,
                percent: cpuPercent,
                loadAverage: os.loadavg()
            },
            memory: {
                usage: memUsage,
                percent: memPercent,
                total: totalMem,
                free: freeMem
            },
            eventLoop: {
                lag: eventLoopLag
            },
            uptime: process.uptime()
        };

        this.recordMetric('system', systemMetric);
        
        // Check thresholds
        if (cpuPercent > this.config.thresholds.cpuUsage) {
            this.emit('threshold_exceeded', {
                type: 'cpu_usage',
                value: cpuPercent,
                threshold: this.config.thresholds.cpuUsage
            });
        }
        
        if (memPercent > this.config.thresholds.memoryUsage) {
            this.emit('threshold_exceeded', {
                type: 'memory_usage',
                value: memPercent,
                threshold: this.config.thresholds.memoryUsage
            });
        }
    }

    /**
     * Calculate CPU percentage
     */
    calculateCPUPercent(cpuUsage) {
        if (!this.lastCPUUsage) {
            this.lastCPUUsage = cpuUsage;
            return 0;
        }

        const userDiff = cpuUsage.user - this.lastCPUUsage.user;
        const systemDiff = cpuUsage.system - this.lastCPUUsage.system;
        const totalDiff = userDiff + systemDiff;
        
        this.lastCPUUsage = cpuUsage;
        
        // Convert microseconds to percentage
        return (totalDiff / 1000000) * 100;
    }

    /**
     * Measure event loop lag
     */
    measureEventLoopLag() {
        const start = performance.now();
        return new Promise((resolve) => {
            setImmediate(() => {
                const lag = performance.now() - start;
                resolve(lag);
            });
        });
    }

    /**
     * Setup system metrics collection
     */
    setupSystemMetricsCollection() {
        // Initialize CPU usage baseline
        this.lastCPUUsage = process.cpuUsage();
    }

    /**
     * Setup garbage collection monitoring
     */
    setupGCMonitoring() {
        if (typeof global.gc === 'function') {
            const originalGC = global.gc;
            global.gc = (...args) => {
                const start = performance.now();
                const result = originalGC.apply(this, args);
                const duration = performance.now() - start;
                
                this.recordMetric('gc', {
                    duration,
                    timestamp: Date.now()
                });
                
                return result;
            };
        }
    }

    /**
     * Setup event loop monitoring
     */
    setupEventLoopMonitoring() {
        // Monitor event loop lag periodically
        setInterval(() => {
            this.measureEventLoopLag().then(lag => {
                this.recordMetric('event_loop_lag', {
                    lag,
                    timestamp: Date.now()
                });
            });
        }, this.config.collectInterval);
    }

    /**
     * Clean up old metrics
     */
    cleanupOldMetrics() {
        const cutoff = Date.now() - this.config.retentionPeriod;
        
        for (const [type, metrics] of this.metrics) {
            const filtered = metrics.filter(metric => metric.timestamp > cutoff);
            this.metrics.set(type, filtered);
        }
    }

    /**
     * Get performance summary
     */
    getPerformanceSummary() {
        return {
            uptime: Date.now() - this.startTime,
            requests: { ...this.requestMetrics },
            averageResponseTime: this.getAverageResponseTime(),
            errorRate: this.getErrorRate(),
            isRunning: this.isRunning,
            metricsCount: Array.from(this.metrics.values()).reduce((sum, arr) => sum + arr.length, 0)
        };
    }

    /**
     * Get metrics by type
     */
    getMetrics(type, limit = 100) {
        const metrics = this.metrics.get(type) || [];
        return metrics.slice(-limit);
    }

    /**
     * Get all metrics
     */
    getAllMetrics() {
        const result = {};
        for (const [type, metrics] of this.metrics) {
            result[type] = metrics;
        }
        return result;
    }

    /**
     * Export metrics for external monitoring systems
     */
    exportMetrics(format = 'json') {
        const summary = this.getPerformanceSummary();
        const allMetrics = this.getAllMetrics();
        
        const exportData = {
            summary,
            metrics: allMetrics,
            timestamp: Date.now(),
            config: this.config
        };

        switch (format) {
            case 'prometheus':
                return this.formatPrometheusMetrics(exportData);
            case 'json':
            default:
                return JSON.stringify(exportData, null, 2);
        }
    }

    /**
     * Format metrics for Prometheus
     */
    formatPrometheusMetrics(data) {
        let output = '';
        
        // Request metrics
        output += `# HELP requests_total Total number of requests\n`;
        output += `# TYPE requests_total counter\n`;
        output += `requests_total ${data.summary.requests.total}\n\n`;
        
        output += `# HELP requests_successful_total Total number of successful requests\n`;
        output += `# TYPE requests_successful_total counter\n`;
        output += `requests_successful_total ${data.summary.requests.successful}\n\n`;
        
        output += `# HELP requests_failed_total Total number of failed requests\n`;
        output += `# TYPE requests_failed_total counter\n`;
        output += `requests_failed_total ${data.summary.requests.failed}\n\n`;
        
        output += `# HELP response_time_average Average response time in milliseconds\n`;
        output += `# TYPE response_time_average gauge\n`;
        output += `response_time_average ${data.summary.averageResponseTime}\n\n`;
        
        output += `# HELP error_rate_percent Error rate percentage\n`;
        output += `# TYPE error_rate_percent gauge\n`;
        output += `error_rate_percent ${data.summary.errorRate}\n\n`;
        
        return output;
    }
}

export default PerformanceMonitor;

