/**
 * @fileoverview Timer Metrics
 * @description Timer metric implementations for tracking execution times and durations
 */

import { MetricUnits } from './metric_types.js';
import { Histogram } from './histograms.js';

/**
 * Timer metric for tracking execution times
 */
export class Timer {
  constructor(name, description = '', labels = {}) {
    this.name = name;
    this.description = description;
    this.labels = labels;
    this.activeTimes = new Map();
    this.completedTimes = [];
    this.histogram = new Histogram(`${name}_duration`, `${description} duration histogram`);
    this.createdAt = Date.now();
    this.maxCompletedTimes = 1000;
  }

  /**
   * Start timing an operation
   * @param {string} operationId - Unique operation identifier (optional)
   * @param {Object} additionalLabels - Additional labels for this timing
   * @returns {string} Timer ID
   */
  start(operationId = null, additionalLabels = {}) {
    const timerId = operationId || `timer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    if (this.activeTimes.has(timerId)) {
      throw new Error(`Timer ${timerId} is already active`);
    }
    
    this.activeTimes.set(timerId, {
      startTime: process.hrtime.bigint(),
      startTimestamp: Date.now(),
      labels: { ...this.labels, ...additionalLabels },
      operationId
    });
    
    return timerId;
  }

  /**
   * Stop timing an operation
   * @param {string} timerId - Timer ID
   * @returns {Object} Timing result
   */
  stop(timerId) {
    const timerData = this.activeTimes.get(timerId);
    if (!timerData) {
      throw new Error(`Timer ${timerId} not found or already stopped`);
    }
    
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - timerData.startTime) / 1000000; // Convert to milliseconds
    const endTimestamp = Date.now();
    
    const result = {
      timerId,
      operationId: timerData.operationId,
      duration,
      startTimestamp: timerData.startTimestamp,
      endTimestamp,
      labels: timerData.labels,
      name: this.name
    };
    
    // Remove from active times
    this.activeTimes.delete(timerId);
    
    // Add to completed times
    this.completedTimes.push(result);
    if (this.completedTimes.length > this.maxCompletedTimes) {
      this.completedTimes.shift();
    }
    
    // Update histogram
    this.histogram.observe(duration, timerData.labels);
    
    return result;
  }

  /**
   * Time a function execution
   * @param {Function} fn - Function to time
   * @param {Object} additionalLabels - Additional labels
   * @returns {Promise<Object>} Function result and timing information
   */
  async time(fn, additionalLabels = {}) {
    if (typeof fn !== 'function') {
      throw new Error('First argument must be a function');
    }
    
    const timerId = this.start(null, additionalLabels);
    
    try {
      const result = await fn();
      const timing = this.stop(timerId);
      
      return {
        result,
        timing
      };
    } catch (error) {
      // Stop timer even if function throws
      const timing = this.stop(timerId);
      timing.error = error.message;
      
      throw error;
    }
  }

  /**
   * Time a synchronous function execution
   * @param {Function} fn - Function to time
   * @param {Object} additionalLabels - Additional labels
   * @returns {Object} Function result and timing information
   */
  timeSync(fn, additionalLabels = {}) {
    if (typeof fn !== 'function') {
      throw new Error('First argument must be a function');
    }
    
    const timerId = this.start(null, additionalLabels);
    
    try {
      const result = fn();
      const timing = this.stop(timerId);
      
      return {
        result,
        timing
      };
    } catch (error) {
      // Stop timer even if function throws
      const timing = this.stop(timerId);
      timing.error = error.message;
      
      throw error;
    }
  }

  /**
   * Get current timer value
   * @returns {Object} Timer metric
   */
  getValue() {
    const stats = this.getStatistics();
    
    return {
      name: this.name,
      description: this.description,
      labels: this.labels,
      active_timers: this.activeTimes.size,
      completed_operations: this.completedTimes.length,
      statistics: stats,
      timestamp: Date.now(),
      unit: MetricUnits.MILLISECONDS,
      type: 'timer'
    };
  }

  /**
   * Get timer statistics
   * @returns {Object} Timer statistics
   */
  getStatistics() {
    if (this.completedTimes.length === 0) {
      return {
        count: 0,
        sum: 0,
        avg: 0,
        min: 0,
        max: 0,
        p50: 0,
        p95: 0,
        p99: 0
      };
    }
    
    const durations = this.completedTimes.map(t => t.duration);
    const sum = durations.reduce((total, duration) => total + duration, 0);
    const avg = sum / durations.length;
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    
    const sorted = durations.slice().sort((a, b) => a - b);
    const p50 = this._calculatePercentile(sorted, 0.5);
    const p95 = this._calculatePercentile(sorted, 0.95);
    const p99 = this._calculatePercentile(sorted, 0.99);
    
    return {
      count: this.completedTimes.length,
      sum,
      avg,
      min,
      max,
      p50,
      p95,
      p99,
      active_timers: this.activeTimes.size,
      created_at: this.createdAt
    };
  }

  /**
   * Get active timers
   * @returns {Array} Array of active timer information
   */
  getActiveTimers() {
    const now = Date.now();
    
    return Array.from(this.activeTimes.entries()).map(([timerId, data]) => ({
      timerId,
      operationId: data.operationId,
      startTimestamp: data.startTimestamp,
      elapsedMs: now - data.startTimestamp,
      labels: data.labels
    }));
  }

  /**
   * Get recent completed times
   * @param {number} limit - Maximum number of recent times to return
   * @returns {Array} Array of recent completed times
   */
  getRecentTimes(limit = 10) {
    return this.completedTimes
      .slice(-limit)
      .sort((a, b) => b.endTimestamp - a.endTimestamp);
  }

  /**
   * Cancel an active timer
   * @param {string} timerId - Timer ID to cancel
   */
  cancel(timerId) {
    if (this.activeTimes.has(timerId)) {
      this.activeTimes.delete(timerId);
    }
  }

  /**
   * Cancel all active timers
   */
  cancelAll() {
    this.activeTimes.clear();
  }

  /**
   * Reset the timer (clear all data)
   */
  reset() {
    this.activeTimes.clear();
    this.completedTimes = [];
    this.histogram.reset();
  }

  // Private methods

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
 * Timer Registry for managing multiple timers
 */
export class TimerRegistry {
  constructor() {
    this.timers = new Map();
  }

  /**
   * Create or get a timer
   * @param {string} name - Timer name
   * @param {string} description - Timer description
   * @param {Object} labels - Default labels
   * @returns {Timer} Timer instance
   */
  getOrCreate(name, description = '', labels = {}) {
    const key = this._generateKey(name, labels);
    
    if (!this.timers.has(key)) {
      this.timers.set(key, new Timer(name, description, labels));
    }
    
    return this.timers.get(key);
  }

  /**
   * Get a timer by name and labels
   * @param {string} name - Timer name
   * @param {Object} labels - Labels
   * @returns {Timer|null} Timer instance or null
   */
  get(name, labels = {}) {
    const key = this._generateKey(name, labels);
    return this.timers.get(key) || null;
  }

  /**
   * Get all timers
   * @returns {Array} Array of timer values
   */
  getAll() {
    return Array.from(this.timers.values()).map(timer => timer.getValue());
  }

  /**
   * Get timers by name pattern
   * @param {RegExp|string} pattern - Name pattern
   * @returns {Array} Array of matching timers
   */
  getByPattern(pattern) {
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
    
    return Array.from(this.timers.values())
      .filter(timer => regex.test(timer.name))
      .map(timer => timer.getValue());
  }

  /**
   * Remove a timer
   * @param {string} name - Timer name
   * @param {Object} labels - Labels
   */
  remove(name, labels = {}) {
    const key = this._generateKey(name, labels);
    this.timers.delete(key);
  }

  /**
   * Clear all timers
   */
  clear() {
    this.timers.clear();
  }

  /**
   * Get registry statistics
   * @returns {Object} Registry statistics
   */
  getStatistics() {
    const timers = Array.from(this.timers.values());
    const totalOperations = timers.reduce((sum, timer) => sum + timer.completedTimes.length, 0);
    const totalActiveTimers = timers.reduce((sum, timer) => sum + timer.activeTimes.size, 0);
    
    return {
      total_timers: timers.length,
      total_completed_operations: totalOperations,
      total_active_timers: totalActiveTimers,
      avg_operations_per_timer: timers.length > 0 ? totalOperations / timers.length : 0,
      timers_by_name: this._groupByName(timers)
    };
  }

  // Private methods

  /**
   * Generate key for timer storage
   * @param {string} name - Timer name
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
   * Group timers by name
   * @param {Array} timers - Array of timers
   * @returns {Object} Timers grouped by name
   * @private
   */
  _groupByName(timers) {
    const grouped = {};
    
    for (const timer of timers) {
      if (!grouped[timer.name]) {
        grouped[timer.name] = [];
      }
      grouped[timer.name].push(timer.getValue());
    }
    
    return grouped;
  }
}

/**
 * Stopwatch for simple timing operations
 */
export class Stopwatch {
  constructor() {
    this.startTime = null;
    this.endTime = null;
    this.isRunning = false;
    this.laps = [];
  }

  /**
   * Start the stopwatch
   */
  start() {
    if (this.isRunning) {
      throw new Error('Stopwatch is already running');
    }
    
    this.startTime = process.hrtime.bigint();
    this.endTime = null;
    this.isRunning = true;
    this.laps = [];
  }

  /**
   * Stop the stopwatch
   * @returns {number} Elapsed time in milliseconds
   */
  stop() {
    if (!this.isRunning) {
      throw new Error('Stopwatch is not running');
    }
    
    this.endTime = process.hrtime.bigint();
    this.isRunning = false;
    
    return this.getElapsed();
  }

  /**
   * Record a lap time
   * @returns {number} Lap time in milliseconds
   */
  lap() {
    if (!this.isRunning) {
      throw new Error('Stopwatch is not running');
    }
    
    const lapTime = process.hrtime.bigint();
    const elapsed = Number(lapTime - this.startTime) / 1000000;
    
    this.laps.push({
      lapNumber: this.laps.length + 1,
      elapsed,
      timestamp: Date.now()
    });
    
    return elapsed;
  }

  /**
   * Get elapsed time
   * @returns {number} Elapsed time in milliseconds
   */
  getElapsed() {
    if (!this.startTime) {
      return 0;
    }
    
    const endTime = this.endTime || process.hrtime.bigint();
    return Number(endTime - this.startTime) / 1000000;
  }

  /**
   * Get lap times
   * @returns {Array} Array of lap times
   */
  getLaps() {
    return this.laps.slice();
  }

  /**
   * Reset the stopwatch
   */
  reset() {
    this.startTime = null;
    this.endTime = null;
    this.isRunning = false;
    this.laps = [];
  }

  /**
   * Get stopwatch status
   * @returns {Object} Stopwatch status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      elapsed: this.getElapsed(),
      laps: this.laps.length,
      hasStarted: this.startTime !== null
    };
  }
}

/**
 * Performance Timer for measuring code execution performance
 */
export class PerformanceTimer {
  constructor() {
    this.marks = new Map();
    this.measures = [];
  }

  /**
   * Mark a point in time
   * @param {string} name - Mark name
   */
  mark(name) {
    this.marks.set(name, {
      timestamp: Date.now(),
      hrtime: process.hrtime.bigint()
    });
  }

  /**
   * Measure time between two marks
   * @param {string} name - Measure name
   * @param {string} startMark - Start mark name
   * @param {string} endMark - End mark name (optional, defaults to current time)
   * @returns {Object} Measure result
   */
  measure(name, startMark, endMark = null) {
    const startMarkData = this.marks.get(startMark);
    if (!startMarkData) {
      throw new Error(`Start mark '${startMark}' not found`);
    }
    
    let endMarkData;
    if (endMark) {
      endMarkData = this.marks.get(endMark);
      if (!endMarkData) {
        throw new Error(`End mark '${endMark}' not found`);
      }
    } else {
      endMarkData = {
        timestamp: Date.now(),
        hrtime: process.hrtime.bigint()
      };
    }
    
    const duration = Number(endMarkData.hrtime - startMarkData.hrtime) / 1000000;
    
    const measure = {
      name,
      startMark,
      endMark: endMark || 'current',
      duration,
      startTimestamp: startMarkData.timestamp,
      endTimestamp: endMarkData.timestamp,
      timestamp: Date.now()
    };
    
    this.measures.push(measure);
    
    return measure;
  }

  /**
   * Get all marks
   * @returns {Array} Array of marks
   */
  getMarks() {
    return Array.from(this.marks.entries()).map(([name, data]) => ({
      name,
      timestamp: data.timestamp
    }));
  }

  /**
   * Get all measures
   * @returns {Array} Array of measures
   */
  getMeasures() {
    return this.measures.slice();
  }

  /**
   * Clear all marks and measures
   */
  clear() {
    this.marks.clear();
    this.measures = [];
  }

  /**
   * Clear specific marks
   * @param {Array} markNames - Array of mark names to clear
   */
  clearMarks(markNames) {
    for (const name of markNames) {
      this.marks.delete(name);
    }
  }
}

export default Timer;

