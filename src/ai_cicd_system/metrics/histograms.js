/**
 * @fileoverview Histogram Metrics
 * @description Histogram metric implementations for tracking distributions of values
 */

import { MetricUnits } from './metric_types.js';

/**
 * Histogram metric for tracking distributions of values
 */
export class Histogram {
  constructor(name, description = '', buckets = null, labels = {}) {
    this.name = name;
    this.description = description;
    this.labels = labels;
    this.buckets = buckets || this._getDefaultBuckets();
    this.bucketCounts = new Array(this.buckets.length).fill(0);
    this.sum = 0;
    this.count = 0;
    this.createdAt = Date.now();
    this.lastUpdated = Date.now();
    this.samples = []; // Store recent samples for percentile calculation
    this.maxSamples = 10000;
  }

  /**
   * Observe a value
   * @param {number} value - Value to observe
   * @param {Object} additionalLabels - Additional labels for this observation
   */
  observe(value, additionalLabels = {}) {
    if (typeof value !== 'number' || !isFinite(value)) {
      throw new Error('Histogram value must be a finite number');
    }
    
    this.sum += value;
    this.count++;
    this.lastUpdated = Date.now();
    
    // Add to samples for percentile calculation
    this.samples.push(value);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
    
    // Update bucket counts
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) {
        this.bucketCounts[i]++;
      }
    }
    
    return {
      name: this.name,
      value: value,
      labels: { ...this.labels, ...additionalLabels },
      timestamp: this.lastUpdated,
      unit: MetricUnits.COUNT
    };
  }

  /**
   * Get current histogram value
   * @returns {Object} Histogram metric
   */
  getValue() {
    return {
      name: this.name,
      description: this.description,
      count: this.count,
      sum: this.sum,
      avg: this.count > 0 ? this.sum / this.count : 0,
      buckets: this.buckets.map((bucket, index) => ({
        le: bucket,
        count: this.bucketCounts[index]
      })),
      labels: this.labels,
      timestamp: this.lastUpdated,
      unit: MetricUnits.COUNT,
      type: 'histogram'
    };
  }

  /**
   * Get histogram statistics including percentiles
   * @returns {Object} Histogram statistics
   */
  getStatistics() {
    if (this.count === 0) {
      return {
        name: this.name,
        count: 0,
        sum: 0,
        avg: 0,
        min: 0,
        max: 0,
        p50: 0,
        p90: 0,
        p95: 0,
        p99: 0,
        stddev: 0
      };
    }
    
    const sortedSamples = this.samples.slice().sort((a, b) => a - b);
    const min = sortedSamples[0];
    const max = sortedSamples[sortedSamples.length - 1];
    const avg = this.sum / this.count;
    
    // Calculate percentiles
    const p50 = this._calculatePercentile(sortedSamples, 0.5);
    const p90 = this._calculatePercentile(sortedSamples, 0.9);
    const p95 = this._calculatePercentile(sortedSamples, 0.95);
    const p99 = this._calculatePercentile(sortedSamples, 0.99);
    
    // Calculate standard deviation
    const variance = this.samples.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / this.count;
    const stddev = Math.sqrt(variance);
    
    return {
      name: this.name,
      count: this.count,
      sum: this.sum,
      avg,
      min,
      max,
      p50,
      p90,
      p95,
      p99,
      stddev,
      created_at: this.createdAt,
      last_updated: this.lastUpdated
    };
  }

  /**
   * Get bucket distribution
   * @returns {Array} Bucket distribution
   */
  getBucketDistribution() {
    return this.buckets.map((bucket, index) => ({
      upperBound: bucket,
      count: this.bucketCounts[index],
      percentage: this.count > 0 ? (this.bucketCounts[index] / this.count) * 100 : 0
    }));
  }

  /**
   * Reset the histogram
   */
  reset() {
    this.bucketCounts.fill(0);
    this.sum = 0;
    this.count = 0;
    this.samples = [];
    this.lastUpdated = Date.now();
  }

  // Private methods

  /**
   * Get default bucket boundaries
   * @returns {Array} Default buckets
   * @private
   */
  _getDefaultBuckets() {
    return [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, Infinity];
  }

  /**
   * Calculate percentile from sorted array
   * @param {Array} sortedValues - Sorted array of values
   * @param {number} percentile - Percentile (0-1)
   * @returns {number} Percentile value
   * @private
   */
  _calculatePercentile(sortedValues, percentile) {
    if (sortedValues.length === 0) return 0;
    
    const index = Math.ceil(sortedValues.length * percentile) - 1;
    return sortedValues[Math.max(0, index)];
  }
}

/**
 * Histogram Registry for managing multiple histograms
 */
export class HistogramRegistry {
  constructor() {
    this.histograms = new Map();
  }

  /**
   * Create or get a histogram
   * @param {string} name - Histogram name
   * @param {string} description - Histogram description
   * @param {Array} buckets - Bucket boundaries (optional)
   * @param {Object} labels - Default labels
   * @returns {Histogram} Histogram instance
   */
  getOrCreate(name, description = '', buckets = null, labels = {}) {
    const key = this._generateKey(name, labels);
    
    if (!this.histograms.has(key)) {
      this.histograms.set(key, new Histogram(name, description, buckets, labels));
    }
    
    return this.histograms.get(key);
  }

  /**
   * Get a histogram by name and labels
   * @param {string} name - Histogram name
   * @param {Object} labels - Labels
   * @returns {Histogram|null} Histogram instance or null
   */
  get(name, labels = {}) {
    const key = this._generateKey(name, labels);
    return this.histograms.get(key) || null;
  }

  /**
   * Get all histograms
   * @returns {Array} Array of histogram values
   */
  getAll() {
    return Array.from(this.histograms.values()).map(histogram => histogram.getValue());
  }

  /**
   * Get histograms by name pattern
   * @param {RegExp|string} pattern - Name pattern
   * @returns {Array} Array of matching histograms
   */
  getByPattern(pattern) {
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
    
    return Array.from(this.histograms.values())
      .filter(histogram => regex.test(histogram.name))
      .map(histogram => histogram.getValue());
  }

  /**
   * Remove a histogram
   * @param {string} name - Histogram name
   * @param {Object} labels - Labels
   */
  remove(name, labels = {}) {
    const key = this._generateKey(name, labels);
    this.histograms.delete(key);
  }

  /**
   * Clear all histograms
   */
  clear() {
    this.histograms.clear();
  }

  /**
   * Get registry statistics
   * @returns {Object} Registry statistics
   */
  getStatistics() {
    const histograms = Array.from(this.histograms.values());
    const totalObservations = histograms.reduce((sum, h) => sum + h.count, 0);
    const totalSum = histograms.reduce((sum, h) => sum + h.sum, 0);
    
    return {
      total_histograms: histograms.length,
      total_observations: totalObservations,
      total_sum: totalSum,
      avg_observations_per_histogram: histograms.length > 0 ? totalObservations / histograms.length : 0,
      histograms_by_name: this._groupByName(histograms)
    };
  }

  // Private methods

  /**
   * Generate key for histogram storage
   * @param {string} name - Histogram name
   * @param {Object} labels - Labels
   * @returns {string} Storage key
   * @private
   */
  _generateKey(name, labels) {
    const sortedLabels = Object.keys(labels)
      .sort()
      .reduce((result, key) => {
        result[key] = labels[key];
        return result;
      }, {});
    
    return `${name}_${JSON.stringify(sortedLabels)}`;
  }

  /**
   * Group histograms by name
   * @param {Array} histograms - Array of histograms
   * @returns {Object} Histograms grouped by name
   * @private
   */
  _groupByName(histograms) {
    const grouped = {};
    
    for (const histogram of histograms) {
      if (!grouped[histogram.name]) {
        grouped[histogram.name] = [];
      }
      grouped[histogram.name].push(histogram.getValue());
    }
    
    return grouped;
  }
}

/**
 * Response Time Histogram for tracking HTTP response times
 */
export class ResponseTimeHistogram extends Histogram {
  constructor(name, description = '', labels = {}) {
    // Custom buckets optimized for response times (in milliseconds)
    const responseBuckets = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, Infinity];
    super(name, description, responseBuckets, labels);
  }

  /**
   * Observe response time in milliseconds
   * @param {number} milliseconds - Response time in ms
   * @param {Object} additionalLabels - Additional labels
   */
  observeMs(milliseconds, additionalLabels = {}) {
    return this.observe(milliseconds, { ...additionalLabels, unit: MetricUnits.MILLISECONDS });
  }

  /**
   * Observe response time in seconds
   * @param {number} seconds - Response time in seconds
   * @param {Object} additionalLabels - Additional labels
   */
  observeSeconds(seconds, additionalLabels = {}) {
    return this.observeMs(seconds * 1000, additionalLabels);
  }

  /**
   * Get response time statistics with SLA analysis
   * @param {Array} slaThresholds - SLA thresholds in milliseconds
   * @returns {Object} Response time statistics with SLA compliance
   */
  getSLAStatistics(slaThresholds = [100, 500, 1000]) {
    const stats = this.getStatistics();
    const slaCompliance = {};
    
    for (const threshold of slaThresholds) {
      const withinSLA = this.samples.filter(sample => sample <= threshold).length;
      const compliance = this.count > 0 ? (withinSLA / this.count) * 100 : 0;
      
      slaCompliance[`${threshold}ms`] = {
        threshold,
        compliance_percentage: compliance,
        within_sla: withinSLA,
        total_requests: this.count
      };
    }
    
    return {
      ...stats,
      sla_compliance: slaCompliance
    };
  }
}

/**
 * Size Histogram for tracking data sizes
 */
export class SizeHistogram extends Histogram {
  constructor(name, description = '', labels = {}) {
    // Custom buckets optimized for data sizes (in bytes)
    const sizeBuckets = [1024, 4096, 16384, 65536, 262144, 1048576, 4194304, 16777216, 67108864, 268435456, Infinity];
    super(name, description, sizeBuckets, labels);
  }

  /**
   * Observe size in bytes
   * @param {number} bytes - Size in bytes
   * @param {Object} additionalLabels - Additional labels
   */
  observeBytes(bytes, additionalLabels = {}) {
    return this.observe(bytes, { ...additionalLabels, unit: MetricUnits.BYTES });
  }

  /**
   * Observe size in kilobytes
   * @param {number} kilobytes - Size in KB
   * @param {Object} additionalLabels - Additional labels
   */
  observeKB(kilobytes, additionalLabels = {}) {
    return this.observeBytes(kilobytes * 1024, additionalLabels);
  }

  /**
   * Observe size in megabytes
   * @param {number} megabytes - Size in MB
   * @param {Object} additionalLabels - Additional labels
   */
  observeMB(megabytes, additionalLabels = {}) {
    return this.observeBytes(megabytes * 1024 * 1024, additionalLabels);
  }

  /**
   * Get size statistics with human-readable formatting
   * @returns {Object} Size statistics with formatted values
   */
  getFormattedStatistics() {
    const stats = this.getStatistics();
    
    const formatBytes = (bytes) => {
      if (bytes >= 1024 * 1024 * 1024) {
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
      } else if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
      } else if (bytes >= 1024) {
        return `${(bytes / 1024).toFixed(2)} KB`;
      } else {
        return `${bytes} bytes`;
      }
    };
    
    return {
      ...stats,
      formatted: {
        avg: formatBytes(stats.avg),
        min: formatBytes(stats.min),
        max: formatBytes(stats.max),
        p50: formatBytes(stats.p50),
        p95: formatBytes(stats.p95),
        p99: formatBytes(stats.p99),
        sum: formatBytes(stats.sum)
      }
    };
  }
}

export default Histogram;

