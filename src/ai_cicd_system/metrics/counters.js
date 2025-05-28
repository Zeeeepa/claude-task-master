/**
 * @fileoverview Counter Metrics
 * @description Counter metric implementations for tracking cumulative values
 */

import { MetricUnits } from './metric_types.js';

/**
 * Counter metric for tracking cumulative values
 */
export class Counter {
  constructor(name, description = '', labels = {}) {
    this.name = name;
    this.description = description;
    this.labels = labels;
    this.value = 0;
    this.createdAt = Date.now();
    this.lastUpdated = Date.now();
  }

  /**
   * Increment the counter
   * @param {number} amount - Amount to increment (default: 1)
   * @param {Object} additionalLabels - Additional labels for this increment
   */
  increment(amount = 1, additionalLabels = {}) {
    if (amount < 0) {
      throw new Error('Counter can only be incremented with positive values');
    }
    
    this.value += amount;
    this.lastUpdated = Date.now();
    
    return {
      name: this.name,
      value: this.value,
      labels: { ...this.labels, ...additionalLabels },
      timestamp: this.lastUpdated,
      unit: MetricUnits.COUNT
    };
  }

  /**
   * Reset the counter to zero
   */
  reset() {
    this.value = 0;
    this.lastUpdated = Date.now();
  }

  /**
   * Get current counter value
   * @returns {Object} Counter metric
   */
  getValue() {
    return {
      name: this.name,
      description: this.description,
      value: this.value,
      labels: this.labels,
      timestamp: this.lastUpdated,
      unit: MetricUnits.COUNT,
      type: 'counter'
    };
  }

  /**
   * Get counter statistics
   * @returns {Object} Counter statistics
   */
  getStatistics() {
    const uptime = Date.now() - this.createdAt;
    const rate = uptime > 0 ? (this.value / uptime) * 1000 : 0; // per second
    
    return {
      name: this.name,
      value: this.value,
      rate_per_second: rate,
      uptime_ms: uptime,
      created_at: this.createdAt,
      last_updated: this.lastUpdated
    };
  }
}

/**
 * Counter Registry for managing multiple counters
 */
export class CounterRegistry {
  constructor() {
    this.counters = new Map();
  }

  /**
   * Create or get a counter
   * @param {string} name - Counter name
   * @param {string} description - Counter description
   * @param {Object} labels - Default labels
   * @returns {Counter} Counter instance
   */
  getOrCreate(name, description = '', labels = {}) {
    const key = this._generateKey(name, labels);
    
    if (!this.counters.has(key)) {
      this.counters.set(key, new Counter(name, description, labels));
    }
    
    return this.counters.get(key);
  }

  /**
   * Get a counter by name and labels
   * @param {string} name - Counter name
   * @param {Object} labels - Labels
   * @returns {Counter|null} Counter instance or null
   */
  get(name, labels = {}) {
    const key = this._generateKey(name, labels);
    return this.counters.get(key) || null;
  }

  /**
   * Get all counters
   * @returns {Array} Array of counter values
   */
  getAll() {
    return Array.from(this.counters.values()).map(counter => counter.getValue());
  }

  /**
   * Get counters by name pattern
   * @param {RegExp|string} pattern - Name pattern
   * @returns {Array} Array of matching counters
   */
  getByPattern(pattern) {
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
    
    return Array.from(this.counters.values())
      .filter(counter => regex.test(counter.name))
      .map(counter => counter.getValue());
  }

  /**
   * Remove a counter
   * @param {string} name - Counter name
   * @param {Object} labels - Labels
   */
  remove(name, labels = {}) {
    const key = this._generateKey(name, labels);
    this.counters.delete(key);
  }

  /**
   * Clear all counters
   */
  clear() {
    this.counters.clear();
  }

  /**
   * Get registry statistics
   * @returns {Object} Registry statistics
   */
  getStatistics() {
    const counters = Array.from(this.counters.values());
    const totalValue = counters.reduce((sum, counter) => sum + counter.value, 0);
    
    return {
      total_counters: counters.length,
      total_value: totalValue,
      counters_by_name: this._groupByName(counters)
    };
  }

  // Private methods

  /**
   * Generate key for counter storage
   * @param {string} name - Counter name
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
   * Group counters by name
   * @param {Array} counters - Array of counters
   * @returns {Object} Counters grouped by name
   * @private
   */
  _groupByName(counters) {
    const grouped = {};
    
    for (const counter of counters) {
      if (!grouped[counter.name]) {
        grouped[counter.name] = [];
      }
      grouped[counter.name].push(counter.getValue());
    }
    
    return grouped;
  }
}

/**
 * Rate Counter for tracking rates over time
 */
export class RateCounter extends Counter {
  constructor(name, description = '', labels = {}, windowSize = 60000) {
    super(name, description, labels);
    this.windowSize = windowSize; // Time window in milliseconds
    this.samples = [];
  }

  /**
   * Increment the counter and track rate
   * @param {number} amount - Amount to increment
   * @param {Object} additionalLabels - Additional labels
   */
  increment(amount = 1, additionalLabels = {}) {
    const result = super.increment(amount, additionalLabels);
    
    // Add sample for rate calculation
    this.samples.push({
      timestamp: Date.now(),
      value: amount
    });
    
    // Clean old samples
    this._cleanOldSamples();
    
    return result;
  }

  /**
   * Get current rate (per second)
   * @returns {number} Current rate
   */
  getRate() {
    this._cleanOldSamples();
    
    if (this.samples.length === 0) {
      return 0;
    }
    
    const now = Date.now();
    const windowStart = now - this.windowSize;
    const recentSamples = this.samples.filter(s => s.timestamp >= windowStart);
    
    if (recentSamples.length === 0) {
      return 0;
    }
    
    const totalValue = recentSamples.reduce((sum, sample) => sum + sample.value, 0);
    const timeSpan = Math.max(1000, now - recentSamples[0].timestamp); // At least 1 second
    
    return (totalValue / timeSpan) * 1000; // Convert to per second
  }

  /**
   * Get rate counter statistics
   * @returns {Object} Rate counter statistics
   */
  getStatistics() {
    const baseStats = super.getStatistics();
    
    return {
      ...baseStats,
      current_rate_per_second: this.getRate(),
      window_size_ms: this.windowSize,
      samples_in_window: this.samples.length
    };
  }

  // Private methods

  /**
   * Clean old samples outside the time window
   * @private
   */
  _cleanOldSamples() {
    const cutoff = Date.now() - this.windowSize;
    this.samples = this.samples.filter(sample => sample.timestamp >= cutoff);
  }
}

export default Counter;

