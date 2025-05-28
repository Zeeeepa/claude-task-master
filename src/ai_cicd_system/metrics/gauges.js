/**
 * @fileoverview Gauge Metrics
 * @description Gauge metric implementations for tracking instantaneous values
 */

import { MetricUnits } from './metric_types.js';

/**
 * Gauge metric for tracking instantaneous values that can go up and down
 */
export class Gauge {
  constructor(name, description = '', labels = {}) {
    this.name = name;
    this.description = description;
    this.labels = labels;
    this.value = 0;
    this.createdAt = Date.now();
    this.lastUpdated = Date.now();
    this.history = [];
    this.maxHistorySize = 1000;
  }

  /**
   * Set the gauge value
   * @param {number} value - New value
   * @param {Object} additionalLabels - Additional labels for this measurement
   */
  set(value, additionalLabels = {}) {
    if (typeof value !== 'number' || !isFinite(value)) {
      throw new Error('Gauge value must be a finite number');
    }
    
    const oldValue = this.value;
    this.value = value;
    this.lastUpdated = Date.now();
    
    // Add to history
    this.history.push({
      timestamp: this.lastUpdated,
      value: value,
      previousValue: oldValue
    });
    
    // Trim history if needed
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
    
    return {
      name: this.name,
      value: this.value,
      labels: { ...this.labels, ...additionalLabels },
      timestamp: this.lastUpdated,
      unit: MetricUnits.COUNT
    };
  }

  /**
   * Increment the gauge value
   * @param {number} amount - Amount to increment
   * @param {Object} additionalLabels - Additional labels
   */
  increment(amount = 1, additionalLabels = {}) {
    return this.set(this.value + amount, additionalLabels);
  }

  /**
   * Decrement the gauge value
   * @param {number} amount - Amount to decrement
   * @param {Object} additionalLabels - Additional labels
   */
  decrement(amount = 1, additionalLabels = {}) {
    return this.set(this.value - amount, additionalLabels);
  }

  /**
   * Get current gauge value
   * @returns {Object} Gauge metric
   */
  getValue() {
    return {
      name: this.name,
      description: this.description,
      value: this.value,
      labels: this.labels,
      timestamp: this.lastUpdated,
      unit: MetricUnits.COUNT,
      type: 'gauge'
    };
  }

  /**
   * Get gauge statistics
   * @returns {Object} Gauge statistics
   */
  getStatistics() {
    if (this.history.length === 0) {
      return {
        name: this.name,
        current_value: this.value,
        min: this.value,
        max: this.value,
        avg: this.value,
        changes: 0,
        uptime_ms: Date.now() - this.createdAt
      };
    }
    
    const values = this.history.map(h => h.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    const changes = this.history.length;
    
    return {
      name: this.name,
      current_value: this.value,
      min,
      max,
      avg,
      changes,
      uptime_ms: Date.now() - this.createdAt,
      created_at: this.createdAt,
      last_updated: this.lastUpdated
    };
  }

  /**
   * Get gauge trend analysis
   * @param {number} timeWindow - Time window in milliseconds (default: 1 hour)
   * @returns {Object} Trend analysis
   */
  getTrend(timeWindow = 3600000) {
    const cutoff = Date.now() - timeWindow;
    const recentHistory = this.history.filter(h => h.timestamp >= cutoff);
    
    if (recentHistory.length < 2) {
      return {
        trend: 'stable',
        change: 0,
        changePercent: 0,
        dataPoints: recentHistory.length
      };
    }
    
    const firstValue = recentHistory[0].value;
    const lastValue = recentHistory[recentHistory.length - 1].value;
    const change = lastValue - firstValue;
    const changePercent = firstValue !== 0 ? (change / firstValue) * 100 : 0;
    
    let trend = 'stable';
    if (Math.abs(changePercent) > 5) { // 5% threshold
      trend = change > 0 ? 'increasing' : 'decreasing';
    }
    
    return {
      trend,
      change,
      changePercent,
      dataPoints: recentHistory.length,
      timeWindow
    };
  }

  /**
   * Reset the gauge to zero
   */
  reset() {
    this.set(0);
  }
}

/**
 * Gauge Registry for managing multiple gauges
 */
export class GaugeRegistry {
  constructor() {
    this.gauges = new Map();
  }

  /**
   * Create or get a gauge
   * @param {string} name - Gauge name
   * @param {string} description - Gauge description
   * @param {Object} labels - Default labels
   * @returns {Gauge} Gauge instance
   */
  getOrCreate(name, description = '', labels = {}) {
    const key = this._generateKey(name, labels);
    
    if (!this.gauges.has(key)) {
      this.gauges.set(key, new Gauge(name, description, labels));
    }
    
    return this.gauges.get(key);
  }

  /**
   * Get a gauge by name and labels
   * @param {string} name - Gauge name
   * @param {Object} labels - Labels
   * @returns {Gauge|null} Gauge instance or null
   */
  get(name, labels = {}) {
    const key = this._generateKey(name, labels);
    return this.gauges.get(key) || null;
  }

  /**
   * Get all gauges
   * @returns {Array} Array of gauge values
   */
  getAll() {
    return Array.from(this.gauges.values()).map(gauge => gauge.getValue());
  }

  /**
   * Get gauges by name pattern
   * @param {RegExp|string} pattern - Name pattern
   * @returns {Array} Array of matching gauges
   */
  getByPattern(pattern) {
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
    
    return Array.from(this.gauges.values())
      .filter(gauge => regex.test(gauge.name))
      .map(gauge => gauge.getValue());
  }

  /**
   * Remove a gauge
   * @param {string} name - Gauge name
   * @param {Object} labels - Labels
   */
  remove(name, labels = {}) {
    const key = this._generateKey(name, labels);
    this.gauges.delete(key);
  }

  /**
   * Clear all gauges
   */
  clear() {
    this.gauges.clear();
  }

  /**
   * Get registry statistics
   * @returns {Object} Registry statistics
   */
  getStatistics() {
    const gauges = Array.from(this.gauges.values());
    const values = gauges.map(g => g.value);
    
    return {
      total_gauges: gauges.length,
      total_value: values.reduce((sum, val) => sum + val, 0),
      min_value: values.length > 0 ? Math.min(...values) : 0,
      max_value: values.length > 0 ? Math.max(...values) : 0,
      avg_value: values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0,
      gauges_by_name: this._groupByName(gauges)
    };
  }

  // Private methods

  /**
   * Generate key for gauge storage
   * @param {string} name - Gauge name
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
   * Group gauges by name
   * @param {Array} gauges - Array of gauges
   * @returns {Object} Gauges grouped by name
   * @private
   */
  _groupByName(gauges) {
    const grouped = {};
    
    for (const gauge of gauges) {
      if (!grouped[gauge.name]) {
        grouped[gauge.name] = [];
      }
      grouped[gauge.name].push(gauge.getValue());
    }
    
    return grouped;
  }
}

/**
 * Percentage Gauge for tracking percentage values (0-100)
 */
export class PercentageGauge extends Gauge {
  constructor(name, description = '', labels = {}) {
    super(name, description, labels);
  }

  /**
   * Set the percentage value (0-100)
   * @param {number} percentage - Percentage value (0-100)
   * @param {Object} additionalLabels - Additional labels
   */
  setPercentage(percentage, additionalLabels = {}) {
    if (percentage < 0 || percentage > 100) {
      throw new Error('Percentage must be between 0 and 100');
    }
    
    return this.set(percentage, { ...additionalLabels, unit: MetricUnits.PERCENTAGE });
  }

  /**
   * Set the ratio value (0-1) and convert to percentage
   * @param {number} ratio - Ratio value (0-1)
   * @param {Object} additionalLabels - Additional labels
   */
  setRatio(ratio, additionalLabels = {}) {
    if (ratio < 0 || ratio > 1) {
      throw new Error('Ratio must be between 0 and 1');
    }
    
    return this.setPercentage(ratio * 100, additionalLabels);
  }

  /**
   * Get percentage value
   * @returns {Object} Percentage gauge metric
   */
  getValue() {
    const value = super.getValue();
    return {
      ...value,
      unit: MetricUnits.PERCENTAGE,
      type: 'percentage_gauge'
    };
  }
}

/**
 * Memory Gauge for tracking memory usage
 */
export class MemoryGauge extends Gauge {
  constructor(name, description = '', labels = {}) {
    super(name, description, labels);
  }

  /**
   * Set memory value in bytes
   * @param {number} bytes - Memory in bytes
   * @param {Object} additionalLabels - Additional labels
   */
  setBytes(bytes, additionalLabels = {}) {
    return this.set(bytes, { ...additionalLabels, unit: MetricUnits.BYTES });
  }

  /**
   * Set memory value in megabytes
   * @param {number} megabytes - Memory in MB
   * @param {Object} additionalLabels - Additional labels
   */
  setMegabytes(megabytes, additionalLabels = {}) {
    return this.setBytes(megabytes * 1024 * 1024, additionalLabels);
  }

  /**
   * Set memory value in gigabytes
   * @param {number} gigabytes - Memory in GB
   * @param {Object} additionalLabels - Additional labels
   */
  setGigabytes(gigabytes, additionalLabels = {}) {
    return this.setBytes(gigabytes * 1024 * 1024 * 1024, additionalLabels);
  }

  /**
   * Get memory value with human-readable format
   * @returns {Object} Memory gauge metric with formatted value
   */
  getValue() {
    const value = super.getValue();
    const bytes = value.value;
    
    let formattedValue;
    let unit;
    
    if (bytes >= 1024 * 1024 * 1024) {
      formattedValue = (bytes / (1024 * 1024 * 1024)).toFixed(2);
      unit = 'GB';
    } else if (bytes >= 1024 * 1024) {
      formattedValue = (bytes / (1024 * 1024)).toFixed(2);
      unit = 'MB';
    } else if (bytes >= 1024) {
      formattedValue = (bytes / 1024).toFixed(2);
      unit = 'KB';
    } else {
      formattedValue = bytes.toString();
      unit = 'bytes';
    }
    
    return {
      ...value,
      unit: MetricUnits.BYTES,
      formattedValue: `${formattedValue} ${unit}`,
      type: 'memory_gauge'
    };
  }
}

export default Gauge;

