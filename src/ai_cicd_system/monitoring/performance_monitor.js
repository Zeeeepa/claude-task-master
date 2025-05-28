/**
 * @fileoverview Advanced Performance Monitor
 * @description Comprehensive performance monitoring with metrics collection and alerting
 */

import { MetricTypes, MetricUnits, AlertSeverity } from '../metrics/metric_types.js';
import { MetricsCollector } from './metrics_collector.js';
import { HealthChecker } from './health_checker.js';
import { AlertManager } from '../alerts/alert_manager.js';
import { log } from '../../scripts/modules/utils.js';

/**
 * Advanced Performance Monitor
 * Provides comprehensive performance tracking, metrics collection, and alerting
 */
export class PerformanceMonitor {
  constructor(config = {}) {
    this.config = {
      enableDetailedMetrics: config.enableDetailedMetrics !== false,
      metricsInterval: config.metricsInterval || 10000,
      retentionPeriod: config.retentionPeriod || 86400000, // 24 hours
      alertThresholds: {
        apiResponseTime: config.apiResponseTime || 2000,
        errorRate: config.errorRate || 0.05,
        memoryUsage: config.memoryUsage || 0.8,
        ...config.alertThresholds
      },
      ...config
    };
    
    this.metricsCollector = new MetricsCollector(this.config);
    this.healthChecker = new HealthChecker(this.config);
    this.alertManager = new AlertManager(this.config);
    this.timers = new Map();
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
    this.isInitialized = false;
    this.systemMetricsInterval = null;
  }

  /**
   * Initialize the performance monitor
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    log('debug', 'Initializing performance monitor...');
    
    try {
      await this.metricsCollector.initialize();
      await this.healthChecker.initialize();
      await this.alertManager.initialize();
      
      // Start system metrics collection
      this.startSystemMetricsCollection();
      
      this.isInitialized = true;
      log('info', 'Performance monitor initialized successfully');
    } catch (error) {
      log('error', `Failed to initialize performance monitor: ${error.message}`);
      throw error;
    }
  }

  /**
   * Start a performance timer
   * @param {string} operation - Operation name
   * @param {Object} metadata - Additional metadata
   * @returns {string} Timer ID
   */
  startTimer(operation, metadata = {}) {
    const timerId = `${operation}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.timers.set(timerId, {
      operation,
      startTime: process.hrtime.bigint(),
      metadata
    });
    return timerId;
  }

  /**
   * End a performance timer and record the metric
   * @param {string} timerId - Timer ID
   * @returns {number|null} Duration in milliseconds
   */
  endTimer(timerId) {
    const timer = this.timers.get(timerId);
    if (!timer) {
      log('warning', `Timer ${timerId} not found`);
      return null;
    }

    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - timer.startTime) / 1000000; // Convert to milliseconds
    
    this.recordMetric(this._getTimerMetricType(timer.operation), duration, {
      operation: timer.operation,
      ...timer.metadata
    });
    
    this.timers.delete(timerId);
    return duration;
  }

  /**
   * Record a metric
   * @param {string} type - Metric type
   * @param {number} value - Metric value
   * @param {Object} labels - Metric labels
   */
  recordMetric(type, value, labels = {}) {
    const metric = {
      type,
      value,
      labels,
      timestamp: Date.now()
    };
    
    this.metricsCollector.collect(metric);
    this.checkAlertThresholds(metric);
    
    // Update histograms for timing metrics
    if (this._isTimingMetric(type)) {
      this.updateHistogram(type, value, labels);
    }
  }

  /**
   * Increment a counter
   * @param {string} name - Counter name
   * @param {Object} labels - Counter labels
   * @param {number} increment - Increment value (default: 1)
   */
  incrementCounter(name, labels = {}, increment = 1) {
    const key = `${name}_${JSON.stringify(labels)}`;
    const current = this.counters.get(key) || 0;
    const newValue = current + increment;
    this.counters.set(key, newValue);
    
    this.recordMetric(name, newValue, labels);
  }

  /**
   * Set a gauge value
   * @param {string} name - Gauge name
   * @param {number} value - Gauge value
   * @param {Object} labels - Gauge labels
   */
  setGauge(name, value, labels = {}) {
    const key = `${name}_${JSON.stringify(labels)}`;
    this.gauges.set(key, value);
    
    this.recordMetric(name, value, labels);
  }

  /**
   * Update histogram with a value
   * @param {string} name - Histogram name
   * @param {number} value - Value to add
   * @param {Object} labels - Histogram labels
   */
  updateHistogram(name, value, labels = {}) {
    const key = `${name}_${JSON.stringify(labels)}`;
    
    if (!this.histograms.has(key)) {
      this.histograms.set(key, {
        name,
        labels,
        values: [],
        count: 0,
        sum: 0,
        min: Infinity,
        max: -Infinity
      });
    }
    
    const histogram = this.histograms.get(key);
    histogram.values.push(value);
    histogram.count++;
    histogram.sum += value;
    histogram.min = Math.min(histogram.min, value);
    histogram.max = Math.max(histogram.max, value);
    
    // Keep only recent values (last 1000)
    if (histogram.values.length > 1000) {
      histogram.values.shift();
    }
  }

  /**
   * Collect system metrics
   */
  async collectSystemMetrics() {
    try {
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      // Memory metrics
      this.setGauge(MetricTypes.MEMORY_USAGE, memUsage.heapUsed / memUsage.heapTotal, {
        type: 'heap_ratio'
      });
      this.setGauge('memory_heap_used', memUsage.heapUsed, { unit: 'bytes' });
      this.setGauge('memory_heap_total', memUsage.heapTotal, { unit: 'bytes' });
      this.setGauge('memory_external', memUsage.external, { unit: 'bytes' });
      
      // CPU metrics
      this.setGauge(MetricTypes.CPU_USAGE, cpuUsage.user + cpuUsage.system, {
        unit: 'microseconds'
      });
      
      // Process metrics
      this.setGauge('process_uptime', process.uptime(), { unit: 'seconds' });
      
      // Database connection metrics (if available)
      if (this.dbManager) {
        try {
          const dbStats = await this.dbManager.getConnectionStats();
          this.setGauge(MetricTypes.DATABASE_CONNECTIONS, dbStats.activeConnections);
          this.setGauge('database_pool_size', dbStats.poolSize);
          this.setGauge('database_idle_connections', dbStats.idleConnections);
        } catch (error) {
          log('warning', `Failed to collect database metrics: ${error.message}`);
        }
      }
      
      // Workflow metrics (if available)
      if (this.workflowOrchestrator) {
        try {
          const workflowStats = await this.workflowOrchestrator.getStats();
          this.setGauge(MetricTypes.CONCURRENT_WORKFLOWS, workflowStats.activeWorkflows);
          this.setGauge('workflow_queue_size', workflowStats.queueSize);
          this.setGauge('workflow_completed_total', workflowStats.completedTotal);
        } catch (error) {
          log('warning', `Failed to collect workflow metrics: ${error.message}`);
        }
      }
      
    } catch (error) {
      log('error', `Failed to collect system metrics: ${error.message}`);
    }
  }

  /**
   * Check alert thresholds for a metric
   * @param {Object} metric - Metric object
   */
  checkAlertThresholds(metric) {
    const threshold = this.config.alertThresholds[metric.type];
    if (!threshold) return;

    let shouldAlert = false;
    let severity = AlertSeverity.INFO;

    switch (metric.type) {
      case MetricTypes.API_RESPONSE_TIME:
      case MetricTypes.DATABASE_QUERY_TIME:
      case MetricTypes.CODEGEN_REQUEST_TIME:
      case MetricTypes.WORKFLOW_EXECUTION_TIME:
        if (metric.value > threshold * 2) {
          shouldAlert = true;
          severity = AlertSeverity.CRITICAL;
        } else if (metric.value > threshold) {
          shouldAlert = true;
          severity = AlertSeverity.WARNING;
        }
        break;
        
      case MetricTypes.ERROR_RATE:
        if (metric.value > threshold) {
          shouldAlert = true;
          severity = metric.value > threshold * 2 ? AlertSeverity.CRITICAL : AlertSeverity.WARNING;
        }
        break;
        
      case MetricTypes.MEMORY_USAGE:
        if (metric.value > threshold) {
          shouldAlert = true;
          severity = metric.value > 0.9 ? AlertSeverity.CRITICAL : AlertSeverity.WARNING;
        }
        break;
        
      case MetricTypes.CPU_USAGE:
        // CPU usage threshold (in microseconds, convert to percentage)
        const cpuPercentage = metric.value / 1000000; // Convert to seconds, then to percentage
        if (cpuPercentage > threshold) {
          shouldAlert = true;
          severity = cpuPercentage > threshold * 1.5 ? AlertSeverity.CRITICAL : AlertSeverity.WARNING;
        }
        break;
    }

    if (shouldAlert) {
      this.alertManager.sendAlert({
        type: metric.type,
        value: metric.value,
        threshold,
        severity,
        timestamp: metric.timestamp,
        labels: metric.labels,
        message: this._generateAlertMessage(metric.type, metric.value, threshold, severity)
      });
    }
  }

  /**
   * Get performance statistics
   * @returns {Object} Performance statistics
   */
  async getStatistics() {
    const histogramStats = {};
    
    for (const [key, histogram] of this.histograms) {
      if (histogram.values.length > 0) {
        const sorted = histogram.values.slice().sort((a, b) => a - b);
        histogramStats[key] = {
          count: histogram.count,
          sum: histogram.sum,
          avg: histogram.sum / histogram.count,
          min: histogram.min,
          max: histogram.max,
          p50: this._calculatePercentile(sorted, 0.5),
          p95: this._calculatePercentile(sorted, 0.95),
          p99: this._calculatePercentile(sorted, 0.99)
        };
      }
    }
    
    return {
      timers_active: this.timers.size,
      counters_tracked: this.counters.size,
      gauges_tracked: this.gauges.size,
      histograms_tracked: this.histograms.size,
      histogram_statistics: histogramStats,
      metrics_collector: await this.metricsCollector.getStatistics(),
      health_checker: await this.healthChecker.getStatistics(),
      alert_manager: await this.alertManager.getStatistics()
    };
  }

  /**
   * Get health status
   * @returns {Object} Health status
   */
  async getHealth() {
    return {
      status: this.isInitialized ? 'healthy' : 'unhealthy',
      initialized: this.isInitialized,
      components: {
        metrics_collector: await this.metricsCollector.getHealth(),
        health_checker: await this.healthChecker.getHealth(),
        alert_manager: await this.alertManager.getHealth()
      }
    };
  }

  /**
   * Start system metrics collection
   */
  startSystemMetricsCollection() {
    if (this.systemMetricsInterval) {
      return;
    }
    
    this.systemMetricsInterval = setInterval(async () => {
      await this.collectSystemMetrics();
    }, this.config.metricsInterval);
    
    // Collect initial metrics
    this.collectSystemMetrics();
  }

  /**
   * Stop system metrics collection
   */
  stopSystemMetricsCollection() {
    if (this.systemMetricsInterval) {
      clearInterval(this.systemMetricsInterval);
      this.systemMetricsInterval = null;
    }
  }

  /**
   * Shutdown the performance monitor
   */
  async shutdown() {
    log('debug', 'Shutting down performance monitor...');
    
    this.stopSystemMetricsCollection();
    
    await this.metricsCollector.shutdown();
    await this.healthChecker.shutdown();
    await this.alertManager.shutdown();
    
    this.timers.clear();
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    
    this.isInitialized = false;
    log('info', 'Performance monitor shut down successfully');
  }

  // Private methods

  /**
   * Get metric type for timer operation
   * @param {string} operation - Operation name
   * @returns {string} Metric type
   * @private
   */
  _getTimerMetricType(operation) {
    const operationMap = {
      'api': MetricTypes.API_RESPONSE_TIME,
      'database': MetricTypes.DATABASE_QUERY_TIME,
      'codegen': MetricTypes.CODEGEN_REQUEST_TIME,
      'workflow': MetricTypes.WORKFLOW_EXECUTION_TIME
    };
    
    for (const [key, metricType] of Object.entries(operationMap)) {
      if (operation.toLowerCase().includes(key)) {
        return metricType;
      }
    }
    
    return `${operation}_time`;
  }

  /**
   * Check if metric type is a timing metric
   * @param {string} type - Metric type
   * @returns {boolean} True if timing metric
   * @private
   */
  _isTimingMetric(type) {
    return type.includes('_time') || type.includes('_duration') || 
           type === MetricTypes.API_RESPONSE_TIME ||
           type === MetricTypes.DATABASE_QUERY_TIME ||
           type === MetricTypes.CODEGEN_REQUEST_TIME ||
           type === MetricTypes.WORKFLOW_EXECUTION_TIME;
  }

  /**
   * Calculate percentile from sorted array
   * @param {number[]} sortedValues - Sorted array of values
   * @param {number} percentile - Percentile (0-1)
   * @returns {number} Percentile value
   * @private
   */
  _calculatePercentile(sortedValues, percentile) {
    if (sortedValues.length === 0) return 0;
    
    const index = Math.ceil(sortedValues.length * percentile) - 1;
    return sortedValues[Math.max(0, index)];
  }

  /**
   * Generate alert message
   * @param {string} type - Metric type
   * @param {number} value - Metric value
   * @param {number} threshold - Alert threshold
   * @param {string} severity - Alert severity
   * @returns {string} Alert message
   * @private
   */
  _generateAlertMessage(type, value, threshold, severity) {
    const messages = {
      [MetricTypes.API_RESPONSE_TIME]: `API response time ${value}ms exceeds threshold ${threshold}ms`,
      [MetricTypes.DATABASE_QUERY_TIME]: `Database query time ${value}ms exceeds threshold ${threshold}ms`,
      [MetricTypes.CODEGEN_REQUEST_TIME]: `Codegen request time ${value}ms exceeds threshold ${threshold}ms`,
      [MetricTypes.WORKFLOW_EXECUTION_TIME]: `Workflow execution time ${value}ms exceeds threshold ${threshold}ms`,
      [MetricTypes.ERROR_RATE]: `Error rate ${(value * 100).toFixed(2)}% exceeds threshold ${(threshold * 100).toFixed(2)}%`,
      [MetricTypes.MEMORY_USAGE]: `Memory usage ${(value * 100).toFixed(2)}% exceeds threshold ${(threshold * 100).toFixed(2)}%`,
      [MetricTypes.CPU_USAGE]: `CPU usage exceeds threshold`
    };
    
    return messages[type] || `Metric ${type} value ${value} exceeds threshold ${threshold}`;
  }
}

export default PerformanceMonitor;

