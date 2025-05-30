/**
 * Metrics Collector
 * 
 * Comprehensive metrics collection system for monitoring workflow performance,
 * system resources, and business metrics with Prometheus export capability
 */

import { EventEmitter } from 'events';
import { SimpleLogger } from '../ai_cicd_system/utils/simple_logger.js';

export class MetricsCollector extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      collectInterval: config.collectInterval || 15000, // 15 seconds
      retentionPeriod: config.retentionPeriod || 3600000, // 1 hour
      enablePrometheus: config.enablePrometheus !== false,
      prometheusPort: config.prometheusPort || 8000,
      enableHistograms: config.enableHistograms !== false,
      ...config
    };

    this.logger = new SimpleLogger('MetricsCollector', config.logLevel || 'info');
    
    // Metrics storage
    this.metrics = new Map();
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
    this.summaries = new Map();
    
    // Collection state
    this.isCollecting = false;
    this.collectionTimer = null;
    this.startTime = Date.now();
    
    this._initializeMetrics();
  }

  /**
   * Initialize default metrics
   */
  _initializeMetrics() {
    // System metrics
    this.registerGauge('system_memory_usage_bytes', 'System memory usage in bytes');
    this.registerGauge('system_cpu_usage_percent', 'System CPU usage percentage');
    this.registerGauge('system_disk_usage_percent', 'System disk usage percentage');
    this.registerGauge('process_uptime_seconds', 'Process uptime in seconds');
    
    // Application metrics
    this.registerCounter('http_requests_total', 'Total HTTP requests', ['method', 'status', 'endpoint']);
    this.registerHistogram('http_request_duration_seconds', 'HTTP request duration', ['method', 'endpoint']);
    this.registerGauge('active_connections', 'Number of active connections');
    this.registerGauge('database_connections_active', 'Active database connections');
    this.registerGauge('database_connections_idle', 'Idle database connections');
    
    // Workflow metrics
    this.registerCounter('workflows_created_total', 'Total workflows created');
    this.registerCounter('workflows_completed_total', 'Total workflows completed', ['status']);
    this.registerCounter('workflows_failed_total', 'Total workflows failed', ['error_type']);
    this.registerHistogram('workflow_duration_seconds', 'Workflow execution duration');
    this.registerGauge('workflows_active', 'Number of active workflows');
    this.registerGauge('workflows_queued', 'Number of queued workflows');
    
    // Task metrics
    this.registerCounter('tasks_created_total', 'Total tasks created', ['type']);
    this.registerCounter('tasks_completed_total', 'Total tasks completed', ['type', 'status']);
    this.registerHistogram('task_duration_seconds', 'Task execution duration', ['type']);
    this.registerGauge('tasks_active', 'Number of active tasks');
    this.registerGauge('tasks_pending', 'Number of pending tasks');
    
    // Integration metrics
    this.registerCounter('codegen_requests_total', 'Total Codegen API requests', ['operation']);
    this.registerHistogram('codegen_request_duration_seconds', 'Codegen API request duration', ['operation']);
    this.registerCounter('linear_requests_total', 'Total Linear API requests', ['operation']);
    this.registerHistogram('linear_request_duration_seconds', 'Linear API request duration', ['operation']);
    this.registerCounter('github_requests_total', 'Total GitHub API requests', ['operation']);
    this.registerHistogram('github_request_duration_seconds', 'GitHub API request duration', ['operation']);
    
    // Error metrics
    this.registerCounter('errors_total', 'Total errors', ['type', 'component']);
    this.registerGauge('error_rate', 'Current error rate');
    
    // Business metrics
    this.registerGauge('users_active', 'Number of active users');
    this.registerCounter('features_used_total', 'Total feature usage', ['feature']);
    this.registerGauge('success_rate', 'Overall success rate');
  }

  /**
   * Register a counter metric
   */
  registerCounter(name, description, labels = []) {
    this.counters.set(name, {
      type: 'counter',
      description,
      labels,
      values: new Map(),
      created: Date.now()
    });
    
    this.logger.debug(`Registered counter: ${name}`, { labels });
  }

  /**
   * Register a gauge metric
   */
  registerGauge(name, description, labels = []) {
    this.gauges.set(name, {
      type: 'gauge',
      description,
      labels,
      values: new Map(),
      created: Date.now()
    });
    
    this.logger.debug(`Registered gauge: ${name}`, { labels });
  }

  /**
   * Register a histogram metric
   */
  registerHistogram(name, description, labels = [], buckets = [0.1, 0.5, 1, 2.5, 5, 10]) {
    this.histograms.set(name, {
      type: 'histogram',
      description,
      labels,
      buckets,
      values: new Map(),
      created: Date.now()
    });
    
    this.logger.debug(`Registered histogram: ${name}`, { labels, buckets });
  }

  /**
   * Increment a counter
   */
  incrementCounter(name, labels = {}, value = 1) {
    const counter = this.counters.get(name);
    if (!counter) {
      this.logger.warn(`Counter '${name}' not found`);
      return;
    }

    const labelKey = this._getLabelKey(labels);
    const currentValue = counter.values.get(labelKey) || 0;
    counter.values.set(labelKey, currentValue + value);
    
    this.emit('metricUpdated', { type: 'counter', name, labels, value: currentValue + value });
  }

  /**
   * Set a gauge value
   */
  setGauge(name, value, labels = {}) {
    const gauge = this.gauges.get(name);
    if (!gauge) {
      this.logger.warn(`Gauge '${name}' not found`);
      return;
    }

    const labelKey = this._getLabelKey(labels);
    gauge.values.set(labelKey, value);
    
    this.emit('metricUpdated', { type: 'gauge', name, labels, value });
  }

  /**
   * Observe a histogram value
   */
  observeHistogram(name, value, labels = {}) {
    const histogram = this.histograms.get(name);
    if (!histogram) {
      this.logger.warn(`Histogram '${name}' not found`);
      return;
    }

    const labelKey = this._getLabelKey(labels);
    let bucketData = histogram.values.get(labelKey);
    
    if (!bucketData) {
      bucketData = {
        buckets: new Map(histogram.buckets.map(bucket => [bucket, 0])),
        count: 0,
        sum: 0
      };
      histogram.values.set(labelKey, bucketData);
    }

    // Update bucket counts
    for (const bucket of histogram.buckets) {
      if (value <= bucket) {
        bucketData.buckets.set(bucket, bucketData.buckets.get(bucket) + 1);
      }
    }

    bucketData.count++;
    bucketData.sum += value;
    
    this.emit('metricUpdated', { type: 'histogram', name, labels, value });
  }

  /**
   * Collect workflow metrics
   */
  collectWorkflowMetrics() {
    try {
      // This would integrate with the actual workflow system
      // For now, we'll simulate some metrics
      
      const activeWorkflows = this._getActiveWorkflowCount();
      const queuedWorkflows = this._getQueuedWorkflowCount();
      
      this.setGauge('workflows_active', activeWorkflows);
      this.setGauge('workflows_queued', queuedWorkflows);
      
      this.logger.debug('Collected workflow metrics', {
        active: activeWorkflows,
        queued: queuedWorkflows
      });
    } catch (error) {
      this.logger.error('Failed to collect workflow metrics:', error);
    }
  }

  /**
   * Collect performance metrics
   */
  collectPerformanceMetrics() {
    try {
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      // Memory metrics
      this.setGauge('system_memory_usage_bytes', memoryUsage.heapUsed);
      this.setGauge('process_uptime_seconds', process.uptime());
      
      // CPU metrics (simplified)
      const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
      this.setGauge('system_cpu_usage_percent', cpuPercent);
      
      this.logger.debug('Collected performance metrics', {
        memory: memoryUsage.heapUsed,
        cpu: cpuPercent,
        uptime: process.uptime()
      });
    } catch (error) {
      this.logger.error('Failed to collect performance metrics:', error);
    }
  }

  /**
   * Collect error metrics
   */
  collectErrorMetrics() {
    try {
      // This would integrate with error tracking system
      const errorRate = this._calculateErrorRate();
      this.setGauge('error_rate', errorRate);
      
      this.logger.debug('Collected error metrics', { errorRate });
    } catch (error) {
      this.logger.error('Failed to collect error metrics:', error);
    }
  }

  /**
   * Collect resource metrics
   */
  async collectResourceMetrics() {
    try {
      // Database connection metrics
      const dbMetrics = await this._getDatabaseMetrics();
      if (dbMetrics) {
        this.setGauge('database_connections_active', dbMetrics.active);
        this.setGauge('database_connections_idle', dbMetrics.idle);
      }

      // Disk usage metrics
      const diskUsage = await this._getDiskUsage();
      if (diskUsage) {
        this.setGauge('system_disk_usage_percent', diskUsage.usagePercent);
      }
      
      this.logger.debug('Collected resource metrics', { dbMetrics, diskUsage });
    } catch (error) {
      this.logger.error('Failed to collect resource metrics:', error);
    }
  }

  /**
   * Export metrics in Prometheus format
   */
  exportToPrometheus() {
    const lines = [];
    const timestamp = Date.now();

    // Export counters
    for (const [name, counter] of this.counters) {
      lines.push(`# HELP ${name} ${counter.description}`);
      lines.push(`# TYPE ${name} counter`);
      
      for (const [labelKey, value] of counter.values) {
        const labels = labelKey ? `{${labelKey}}` : '';
        lines.push(`${name}${labels} ${value} ${timestamp}`);
      }
    }

    // Export gauges
    for (const [name, gauge] of this.gauges) {
      lines.push(`# HELP ${name} ${gauge.description}`);
      lines.push(`# TYPE ${name} gauge`);
      
      for (const [labelKey, value] of gauge.values) {
        const labels = labelKey ? `{${labelKey}}` : '';
        lines.push(`${name}${labels} ${value} ${timestamp}`);
      }
    }

    // Export histograms
    for (const [name, histogram] of this.histograms) {
      lines.push(`# HELP ${name} ${histogram.description}`);
      lines.push(`# TYPE ${name} histogram`);
      
      for (const [labelKey, bucketData] of histogram.values) {
        const baseLabels = labelKey ? labelKey + ',' : '';
        
        // Bucket counts
        for (const [bucket, count] of bucketData.buckets) {
          const labels = `{${baseLabels}le="${bucket}"}`;
          lines.push(`${name}_bucket${labels} ${count} ${timestamp}`);
        }
        
        // Total count and sum
        const labels = labelKey ? `{${labelKey}}` : '';
        lines.push(`${name}_count${labels} ${bucketData.count} ${timestamp}`);
        lines.push(`${name}_sum${labels} ${bucketData.sum} ${timestamp}`);
      }
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary() {
    return {
      counters: this.counters.size,
      gauges: this.gauges.size,
      histograms: this.histograms.size,
      totalMetrics: this.counters.size + this.gauges.size + this.histograms.size,
      collectionInterval: this.config.collectInterval,
      isCollecting: this.isCollecting,
      uptime: Date.now() - this.startTime
    };
  }

  /**
   * Start metrics collection
   */
  start() {
    if (this.isCollecting) {
      this.logger.warn('Metrics collection is already running');
      return;
    }

    this.isCollecting = true;
    this.logger.info('Starting metrics collection', {
      interval: this.config.collectInterval,
      prometheusEnabled: this.config.enablePrometheus
    });

    // Initial collection
    this._collectAllMetrics();

    // Schedule periodic collection
    this.collectionTimer = setInterval(() => {
      this._collectAllMetrics();
    }, this.config.collectInterval);

    this.emit('started');
  }

  /**
   * Stop metrics collection
   */
  stop() {
    if (!this.isCollecting) {
      return;
    }

    this.isCollecting = false;
    
    if (this.collectionTimer) {
      clearInterval(this.collectionTimer);
      this.collectionTimer = null;
    }

    this.logger.info('Metrics collection stopped');
    this.emit('stopped');
  }

  /**
   * Clear old metrics data
   */
  cleanup() {
    const cutoff = Date.now() - this.config.retentionPeriod;
    let cleaned = 0;

    // This is a simplified cleanup - in production you'd want more sophisticated retention
    for (const [name, metric] of [...this.counters, ...this.gauges, ...this.histograms]) {
      if (metric.created < cutoff) {
        metric.values.clear();
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.info(`Cleaned up ${cleaned} old metrics`);
    }
  }

  // Private helper methods

  _collectAllMetrics() {
    try {
      this.collectWorkflowMetrics();
      this.collectPerformanceMetrics();
      this.collectErrorMetrics();
      this.collectResourceMetrics();
      
      this.emit('metricsCollected', this.getMetricsSummary());
    } catch (error) {
      this.logger.error('Error during metrics collection:', error);
    }
  }

  _getLabelKey(labels) {
    if (!labels || Object.keys(labels).length === 0) {
      return '';
    }
    
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}="${value}"`)
      .join(',');
  }

  _getActiveWorkflowCount() {
    // This would integrate with the actual workflow system
    return Math.floor(Math.random() * 10);
  }

  _getQueuedWorkflowCount() {
    // This would integrate with the actual workflow system
    return Math.floor(Math.random() * 5);
  }

  _calculateErrorRate() {
    // This would calculate actual error rate from error tracking
    return Math.random() * 0.05; // 0-5% error rate
  }

  async _getDatabaseMetrics() {
    try {
      // This would integrate with the actual database connection pool
      return {
        active: Math.floor(Math.random() * 5) + 1,
        idle: Math.floor(Math.random() * 3) + 1
      };
    } catch (error) {
      this.logger.error('Failed to get database metrics:', error);
      return null;
    }
  }

  async _getDiskUsage() {
    try {
      const fs = await import('fs/promises');
      const stats = await fs.statfs('.');
      
      const total = stats.blocks * stats.blksize;
      const free = stats.bavail * stats.blksize;
      const used = total - free;
      const usagePercent = (used / total) * 100;

      return {
        total,
        free,
        used,
        usagePercent: Math.round(usagePercent * 100) / 100
      };
    } catch (error) {
      this.logger.error('Failed to get disk usage:', error);
      return null;
    }
  }
}

export default MetricsCollector;

