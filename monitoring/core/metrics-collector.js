/**
 * Metrics Collector
 * Core metrics collection engine for the monitoring system
 */

import EventEmitter from 'events';
import { MonitoringConfig } from './monitoring-config.js';
import { MetricsStorage } from '../storage/metrics-storage.js';
import { AlertManager } from '../alerts/alert-manager.js';

export class MetricsCollector extends EventEmitter {
  constructor(config = MonitoringConfig) {
    super();
    this.config = config;
    this.storage = new MetricsStorage(config.storage);
    this.alertManager = new AlertManager(config.alerts);
    this.collectors = new Map();
    this.intervals = new Map();
    this.isRunning = false;
    this.startTime = Date.now();
  }

  /**
   * Start the metrics collection system
   */
  async start() {
    if (this.isRunning) {
      throw new Error('Metrics collector is already running');
    }

    console.log('🚀 Starting comprehensive monitoring system...');
    
    await this.storage.initialize();
    await this.alertManager.initialize();
    
    this.setupCollectors();
    this.startCollectionIntervals();
    
    this.isRunning = true;
    this.emit('started');
    
    console.log('✅ Monitoring system started successfully');
  }

  /**
   * Stop the metrics collection system
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    console.log('🛑 Stopping monitoring system...');
    
    // Clear all intervals
    for (const [name, interval] of this.intervals) {
      clearInterval(interval);
    }
    this.intervals.clear();
    
    await this.storage.close();
    await this.alertManager.close();
    
    this.isRunning = false;
    this.emit('stopped');
    
    console.log('✅ Monitoring system stopped');
  }

  /**
   * Setup metric collectors
   */
  setupCollectors() {
    // Performance metrics collector
    this.collectors.set('performance', {
      collect: () => this.collectPerformanceMetrics(),
      interval: this.config.collection.performance_interval
    });

    // System health collector
    this.collectors.set('system', {
      collect: () => this.collectSystemMetrics(),
      interval: this.config.collection.system_health_interval
    });

    // Workflow metrics collector
    this.collectors.set('workflow', {
      collect: () => this.collectWorkflowMetrics(),
      interval: this.config.collection.workflow_metrics_interval
    });

    // Real-time metrics collector
    this.collectors.set('realtime', {
      collect: () => this.collectRealTimeMetrics(),
      interval: this.config.collection.real_time_interval
    });
  }

  /**
   * Start collection intervals
   */
  startCollectionIntervals() {
    for (const [name, collector] of this.collectors) {
      const interval = setInterval(async () => {
        try {
          await collector.collect();
        } catch (error) {
          console.error(`Error collecting ${name} metrics:`, error);
          this.emit('collection_error', { collector: name, error });
        }
      }, collector.interval);
      
      this.intervals.set(name, interval);
    }

    // Setup cleanup interval
    const cleanupInterval = setInterval(() => {
      this.cleanupOldData();
    }, this.config.collection.cleanup_interval);
    
    this.intervals.set('cleanup', cleanupInterval);
  }

  /**
   * Collect performance metrics
   */
  async collectPerformanceMetrics() {
    const metrics = {
      timestamp: Date.now(),
      type: 'performance',
      data: {
        response_time: await this.getAverageResponseTime(),
        throughput: await this.getThroughput(),
        error_rate: await this.getErrorRate(),
        uptime: Date.now() - this.startTime
      }
    };

    await this.storage.store('performance', metrics);
    await this.checkAlerts('performance', metrics.data);
    this.emit('metrics_collected', metrics);
  }

  /**
   * Collect system metrics
   */
  async collectSystemMetrics() {
    const metrics = {
      timestamp: Date.now(),
      type: 'system',
      data: {
        cpu_usage: await this.getCpuUsage(),
        memory_usage: await this.getMemoryUsage(),
        disk_usage: await this.getDiskUsage(),
        active_connections: await this.getActiveConnections(),
        queue_depth: await this.getQueueDepth()
      }
    };

    await this.storage.store('system', metrics);
    await this.checkAlerts('system', metrics.data);
    this.emit('metrics_collected', metrics);
  }

  /**
   * Collect workflow metrics
   */
  async collectWorkflowMetrics() {
    const metrics = {
      timestamp: Date.now(),
      type: 'workflow',
      data: {
        task_completion_rate: await this.getTaskCompletionRate(),
        pr_success_rate: await this.getPRSuccessRate(),
        cycle_time: await this.getAverageCycleTime(),
        task_creation_rate: await this.getTaskCreationRate()
      }
    };

    await this.storage.store('workflow', metrics);
    await this.checkAlerts('workflow', metrics.data);
    this.emit('metrics_collected', metrics);
  }

  /**
   * Collect real-time metrics
   */
  async collectRealTimeMetrics() {
    const metrics = {
      timestamp: Date.now(),
      type: 'realtime',
      data: {
        api_calls_per_minute: await this.getApiCallsPerMinute(),
        cache_hit_rate: await this.getCacheHitRate(),
        database_connections: await this.getDatabaseConnections()
      }
    };

    await this.storage.store('realtime', metrics);
    this.emit('realtime_metrics', metrics);
  }

  /**
   * Track a custom event
   */
  async trackEvent(eventType, metadata = {}) {
    const event = {
      timestamp: Date.now(),
      type: 'event',
      eventType,
      metadata: this.sanitizeMetadata(metadata)
    };

    await this.storage.store('events', event);
    this.emit('event_tracked', event);
  }

  /**
   * Check alerts for metrics
   */
  async checkAlerts(metricType, data) {
    for (const [key, value] of Object.entries(data)) {
      const thresholdKey = `${key}_threshold`;
      const threshold = this.config.alerts[thresholdKey];
      
      if (threshold && value > threshold) {
        await this.alertManager.triggerAlert({
          type: 'threshold_exceeded',
          metric: key,
          value,
          threshold,
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * Get metrics for a specific time range
   */
  async getMetrics(type, timeRange = '1h') {
    return await this.storage.getMetrics(type, timeRange);
  }

  /**
   * Get aggregated metrics
   */
  async getAggregatedMetrics(type, aggregation = 'avg', timeRange = '1h') {
    const metrics = await this.getMetrics(type, timeRange);
    return this.aggregateMetrics(metrics, aggregation);
  }

  /**
   * Aggregate metrics data
   */
  aggregateMetrics(metrics, aggregation) {
    if (!metrics || metrics.length === 0) {
      return {};
    }

    const aggregated = {};
    const keys = Object.keys(metrics[0].data);

    for (const key of keys) {
      const values = metrics.map(m => m.data[key]).filter(v => typeof v === 'number');
      
      switch (aggregation) {
        case 'avg':
          aggregated[key] = values.reduce((a, b) => a + b, 0) / values.length;
          break;
        case 'max':
          aggregated[key] = Math.max(...values);
          break;
        case 'min':
          aggregated[key] = Math.min(...values);
          break;
        case 'sum':
          aggregated[key] = values.reduce((a, b) => a + b, 0);
          break;
        default:
          aggregated[key] = values[values.length - 1]; // latest
      }
    }

    return aggregated;
  }

  /**
   * Sanitize metadata to remove sensitive information
   */
  sanitizeMetadata(metadata) {
    const sanitized = { ...metadata };
    
    for (const field of this.config.privacy.exclude_sensitive_fields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Clean up old data based on retention policies
   */
  async cleanupOldData() {
    const now = Date.now();
    
    for (const [type, retention] of Object.entries(this.config.retention)) {
      const cutoffTime = now - this.parseRetentionTime(retention);
      await this.storage.cleanup(type, cutoffTime);
    }
  }

  /**
   * Parse retention time string to milliseconds
   */
  parseRetentionTime(retention) {
    const units = {
      's': 1000,
      'm': 60 * 1000,
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000,
      'y': 365 * 24 * 60 * 60 * 1000
    };

    const match = retention.match(/^(\d+)([smhdy])$/);
    if (!match) {
      throw new Error(`Invalid retention format: ${retention}`);
    }

    const [, amount, unit] = match;
    return parseInt(amount) * units[unit];
  }

  // Placeholder methods for actual metric collection
  // These would be implemented based on the specific system architecture

  async getAverageResponseTime() {
    // Implementation would depend on request tracking
    return Math.random() * 1000; // Placeholder
  }

  async getThroughput() {
    // Implementation would track requests per second
    return Math.random() * 100; // Placeholder
  }

  async getErrorRate() {
    // Implementation would track error percentage
    return Math.random() * 10; // Placeholder
  }

  async getCpuUsage() {
    // Implementation would use system monitoring
    return Math.random() * 100; // Placeholder
  }

  async getMemoryUsage() {
    const used = process.memoryUsage();
    return (used.heapUsed / used.heapTotal) * 100;
  }

  async getDiskUsage() {
    // Implementation would check disk space
    return Math.random() * 100; // Placeholder
  }

  async getActiveConnections() {
    // Implementation would track active connections
    return Math.floor(Math.random() * 50); // Placeholder
  }

  async getQueueDepth() {
    // Implementation would check queue systems
    return Math.floor(Math.random() * 20); // Placeholder
  }

  async getTaskCompletionRate() {
    // Implementation would analyze task data
    return Math.random() * 100; // Placeholder
  }

  async getPRSuccessRate() {
    // Implementation would track PR success
    return Math.random() * 100; // Placeholder
  }

  async getAverageCycleTime() {
    // Implementation would calculate cycle times
    return Math.random() * 86400000; // Placeholder (ms)
  }

  async getTaskCreationRate() {
    // Implementation would track task creation
    return Math.random() * 10; // Placeholder
  }

  async getApiCallsPerMinute() {
    // Implementation would track API calls
    return Math.floor(Math.random() * 100); // Placeholder
  }

  async getCacheHitRate() {
    // Implementation would track cache performance
    return Math.random() * 100; // Placeholder
  }

  async getDatabaseConnections() {
    // Implementation would check database connections
    return Math.floor(Math.random() * 10); // Placeholder
  }
}

export default MetricsCollector;

