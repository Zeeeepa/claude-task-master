/**
 * @fileoverview Metrics Collector with Aggregation
 * @description Advanced metrics collection system with windowing and export capabilities
 */

import { log } from '../../scripts/modules/utils.js';

/**
 * Metrics Collector with time-based aggregation and export capabilities
 */
export class MetricsCollector {
  constructor(config = {}) {
    this.config = {
      aggregationWindow: config.aggregationWindow || 60000, // 1 minute
      exportInterval: config.exportInterval || 30000, // 30 seconds
      retentionPeriod: config.retentionPeriod || 86400000, // 24 hours
      maxDataPoints: config.maxDataPoints || 10000,
      ...config
    };
    
    this.metrics = new Map();
    this.exporters = [];
    this.aggregationInterval = null;
    this.exportInterval = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the metrics collector
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    log('debug', 'Initializing metrics collector...');
    
    this.startAggregation();
    this.startExport();
    
    this.isInitialized = true;
    log('info', 'Metrics collector initialized successfully');
  }

  /**
   * Collect a metric
   * @param {Object} metric - Metric object
   */
  collect(metric) {
    if (!this.isInitialized) {
      log('warning', 'Metrics collector not initialized, skipping metric collection');
      return;
    }

    const windowKey = this.getWindowKey(metric.timestamp);
    
    if (!this.metrics.has(windowKey)) {
      this.metrics.set(windowKey, new Map());
    }
    
    const window = this.metrics.get(windowKey);
    const metricKey = `${metric.type}_${JSON.stringify(metric.labels || {})}`;
    
    if (!window.has(metricKey)) {
      window.set(metricKey, {
        type: metric.type,
        labels: metric.labels || {},
        values: [],
        count: 0,
        sum: 0,
        min: Infinity,
        max: -Infinity,
        firstTimestamp: metric.timestamp,
        lastTimestamp: metric.timestamp
      });
    }
    
    const aggregated = window.get(metricKey);
    aggregated.values.push(metric.value);
    aggregated.count++;
    aggregated.sum += metric.value;
    aggregated.min = Math.min(aggregated.min, metric.value);
    aggregated.max = Math.max(aggregated.max, metric.value);
    aggregated.lastTimestamp = metric.timestamp;
    
    // Limit values array size to prevent memory issues
    if (aggregated.values.length > 1000) {
      aggregated.values.shift();
    }
  }

  /**
   * Get window key for timestamp
   * @param {number} timestamp - Timestamp
   * @returns {number} Window key
   */
  getWindowKey(timestamp) {
    return Math.floor(timestamp / this.config.aggregationWindow) * this.config.aggregationWindow;
  }

  /**
   * Start aggregation process
   */
  startAggregation() {
    if (this.aggregationInterval) {
      return;
    }
    
    this.aggregationInterval = setInterval(() => {
      this.cleanupOldWindows();
    }, this.config.aggregationWindow);
    
    log('debug', 'Metrics aggregation started');
  }

  /**
   * Start export process
   */
  startExport() {
    if (this.exportInterval) {
      return;
    }
    
    this.exportInterval = setInterval(async () => {
      await this.exportMetrics();
    }, this.config.exportInterval);
    
    log('debug', 'Metrics export started');
  }

  /**
   * Stop aggregation process
   */
  stopAggregation() {
    if (this.aggregationInterval) {
      clearInterval(this.aggregationInterval);
      this.aggregationInterval = null;
      log('debug', 'Metrics aggregation stopped');
    }
  }

  /**
   * Stop export process
   */
  stopExport() {
    if (this.exportInterval) {
      clearInterval(this.exportInterval);
      this.exportInterval = null;
      log('debug', 'Metrics export stopped');
    }
  }

  /**
   * Clean up old metric windows
   */
  cleanupOldWindows() {
    const cutoff = Date.now() - this.config.retentionPeriod;
    let deletedWindows = 0;
    
    for (const [windowKey] of this.metrics) {
      if (windowKey < cutoff) {
        this.metrics.delete(windowKey);
        deletedWindows++;
      }
    }
    
    if (deletedWindows > 0) {
      log('debug', `Cleaned up ${deletedWindows} old metric windows`);
    }
  }

  /**
   * Export metrics to configured exporters
   */
  async exportMetrics() {
    if (this.exporters.length === 0) {
      return;
    }

    const currentWindow = this.getWindowKey(Date.now());
    const metricsToExport = [];
    
    for (const [windowKey, window] of this.metrics) {
      if (windowKey < currentWindow) { // Only export completed windows
        for (const [metricKey, aggregated] of window) {
          const exportMetric = {
            timestamp: windowKey,
            type: aggregated.type,
            labels: aggregated.labels,
            count: aggregated.count,
            sum: aggregated.sum,
            avg: aggregated.sum / aggregated.count,
            min: aggregated.min === Infinity ? 0 : aggregated.min,
            max: aggregated.max === -Infinity ? 0 : aggregated.max,
            p50: this.calculatePercentile(aggregated.values, 0.5),
            p95: this.calculatePercentile(aggregated.values, 0.95),
            p99: this.calculatePercentile(aggregated.values, 0.99),
            firstTimestamp: aggregated.firstTimestamp,
            lastTimestamp: aggregated.lastTimestamp
          };
          
          metricsToExport.push(exportMetric);
        }
      }
    }
    
    if (metricsToExport.length === 0) {
      return;
    }
    
    // Export to all configured exporters
    const exportPromises = this.exporters.map(async (exporter) => {
      try {
        await exporter.export(metricsToExport);
        log('debug', `Exported ${metricsToExport.length} metrics to ${exporter.name || 'exporter'}`);
      } catch (error) {
        log('error', `Failed to export metrics to ${exporter.name || 'exporter'}: ${error.message}`);
      }
    });
    
    await Promise.allSettled(exportPromises);
  }

  /**
   * Calculate percentile from values array
   * @param {number[]} values - Array of values
   * @param {number} percentile - Percentile (0-1)
   * @returns {number} Percentile value
   */
  calculatePercentile(values, percentile) {
    if (values.length === 0) return 0;
    
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Add an exporter
   * @param {Object} exporter - Exporter object with export method
   */
  addExporter(exporter) {
    if (!exporter || typeof exporter.export !== 'function') {
      throw new Error('Exporter must have an export method');
    }
    
    this.exporters.push(exporter);
    log('info', `Added metrics exporter: ${exporter.name || 'unnamed'}`);
  }

  /**
   * Remove an exporter
   * @param {Object} exporter - Exporter to remove
   */
  removeExporter(exporter) {
    const index = this.exporters.indexOf(exporter);
    if (index > -1) {
      this.exporters.splice(index, 1);
      log('info', `Removed metrics exporter: ${exporter.name || 'unnamed'}`);
    }
  }

  /**
   * Get current metrics for a specific window
   * @param {number} windowKey - Window key (optional, defaults to current window)
   * @returns {Array} Array of metrics
   */
  getMetrics(windowKey = null) {
    if (windowKey === null) {
      windowKey = this.getWindowKey(Date.now());
    }
    
    const window = this.metrics.get(windowKey);
    if (!window) {
      return [];
    }
    
    const metrics = [];
    for (const [metricKey, aggregated] of window) {
      metrics.push({
        key: metricKey,
        type: aggregated.type,
        labels: aggregated.labels,
        count: aggregated.count,
        sum: aggregated.sum,
        avg: aggregated.sum / aggregated.count,
        min: aggregated.min === Infinity ? 0 : aggregated.min,
        max: aggregated.max === -Infinity ? 0 : aggregated.max,
        values: aggregated.values.slice() // Copy array
      });
    }
    
    return metrics;
  }

  /**
   * Get metrics for a time range
   * @param {number} startTime - Start timestamp
   * @param {number} endTime - End timestamp
   * @returns {Array} Array of metrics grouped by window
   */
  getMetricsRange(startTime, endTime) {
    const result = [];
    
    for (const [windowKey, window] of this.metrics) {
      if (windowKey >= startTime && windowKey <= endTime) {
        const windowMetrics = {
          window: windowKey,
          metrics: []
        };
        
        for (const [metricKey, aggregated] of window) {
          windowMetrics.metrics.push({
            key: metricKey,
            type: aggregated.type,
            labels: aggregated.labels,
            count: aggregated.count,
            sum: aggregated.sum,
            avg: aggregated.sum / aggregated.count,
            min: aggregated.min === Infinity ? 0 : aggregated.min,
            max: aggregated.max === -Infinity ? 0 : aggregated.max
          });
        }
        
        result.push(windowMetrics);
      }
    }
    
    return result.sort((a, b) => a.window - b.window);
  }

  /**
   * Get statistics about the metrics collector
   * @returns {Object} Statistics
   */
  async getStatistics() {
    let totalMetrics = 0;
    let totalDataPoints = 0;
    
    for (const [windowKey, window] of this.metrics) {
      totalMetrics += window.size;
      for (const [metricKey, aggregated] of window) {
        totalDataPoints += aggregated.count;
      }
    }
    
    return {
      windows_tracked: this.metrics.size,
      total_metrics: totalMetrics,
      total_data_points: totalDataPoints,
      exporters_configured: this.exporters.length,
      aggregation_window_ms: this.config.aggregationWindow,
      export_interval_ms: this.config.exportInterval,
      retention_period_ms: this.config.retentionPeriod,
      memory_usage: this._estimateMemoryUsage()
    };
  }

  /**
   * Get health status
   * @returns {Object} Health status
   */
  async getHealth() {
    const stats = await this.getStatistics();
    
    return {
      status: this.isInitialized ? 'healthy' : 'unhealthy',
      initialized: this.isInitialized,
      windows_tracked: stats.windows_tracked,
      exporters_configured: stats.exporters_configured,
      memory_usage_estimate: stats.memory_usage
    };
  }

  /**
   * Shutdown the metrics collector
   */
  async shutdown() {
    log('debug', 'Shutting down metrics collector...');
    
    this.stopAggregation();
    this.stopExport();
    
    // Final export of remaining metrics
    if (this.exporters.length > 0) {
      await this.exportMetrics();
    }
    
    this.metrics.clear();
    this.exporters.length = 0;
    
    this.isInitialized = false;
    log('info', 'Metrics collector shut down successfully');
  }

  // Private methods

  /**
   * Estimate memory usage of stored metrics
   * @returns {number} Estimated memory usage in bytes
   * @private
   */
  _estimateMemoryUsage() {
    let estimatedBytes = 0;
    
    for (const [windowKey, window] of this.metrics) {
      estimatedBytes += 8; // windowKey (number)
      
      for (const [metricKey, aggregated] of window) {
        estimatedBytes += metricKey.length * 2; // string characters (UTF-16)
        estimatedBytes += 8 * 6; // numeric fields (count, sum, min, max, timestamps)
        estimatedBytes += JSON.stringify(aggregated.labels).length * 2; // labels
        estimatedBytes += aggregated.values.length * 8; // values array
      }
    }
    
    return estimatedBytes;
  }
}

/**
 * Console Exporter - exports metrics to console
 */
export class ConsoleExporter {
  constructor(config = {}) {
    this.name = 'console';
    this.config = {
      logLevel: config.logLevel || 'debug',
      includeValues: config.includeValues !== false,
      ...config
    };
  }

  async export(metrics) {
    if (metrics.length === 0) {
      return;
    }
    
    const summary = {
      total_metrics: metrics.length,
      timestamp: new Date().toISOString(),
      metrics: this.config.includeValues ? metrics : metrics.map(m => ({
        type: m.type,
        labels: m.labels,
        count: m.count,
        avg: m.avg,
        p95: m.p95
      }))
    };
    
    log(this.config.logLevel, `Metrics Export: ${JSON.stringify(summary, null, 2)}`);
  }
}

/**
 * File Exporter - exports metrics to file
 */
export class FileExporter {
  constructor(config = {}) {
    this.name = 'file';
    this.config = {
      filePath: config.filePath || './metrics.json',
      format: config.format || 'json', // json, csv
      ...config
    };
  }

  async export(metrics) {
    const fs = await import('fs/promises');
    
    try {
      let data;
      
      if (this.config.format === 'csv') {
        data = this._formatAsCSV(metrics);
      } else {
        data = JSON.stringify({
          timestamp: new Date().toISOString(),
          metrics: metrics
        }, null, 2);
      }
      
      await fs.appendFile(this.config.filePath, data + '\n');
    } catch (error) {
      throw new Error(`Failed to export metrics to file: ${error.message}`);
    }
  }

  _formatAsCSV(metrics) {
    const headers = 'timestamp,type,labels,count,sum,avg,min,max,p50,p95,p99';
    const rows = metrics.map(m => [
      new Date(m.timestamp).toISOString(),
      m.type,
      JSON.stringify(m.labels),
      m.count,
      m.sum,
      m.avg,
      m.min,
      m.max,
      m.p50,
      m.p95,
      m.p99
    ].join(','));
    
    return [headers, ...rows].join('\n');
  }
}

export default MetricsCollector;

