/**
 * Metrics Utilities
 * Helper functions for metrics collection and analysis
 */

import { performance } from 'perf_hooks';

/**
 * Performance measurement decorator
 */
export function measurePerformance(target, propertyKey, descriptor) {
  const originalMethod = descriptor.value;

  descriptor.value = async function (...args) {
    const startTime = performance.now();
    const startMemory = process.memoryUsage();

    try {
      const result = await originalMethod.apply(this, args);
      const endTime = performance.now();
      const endMemory = process.memoryUsage();

      // Track performance metrics
      if (global.monitoringSystem) {
        await global.monitoringSystem.trackEvent('method_performance', {
          method: `${target.constructor.name}.${propertyKey}`,
          duration: endTime - startTime,
          memory_delta: endMemory.heapUsed - startMemory.heapUsed,
          success: true
        });
      }

      return result;
    } catch (error) {
      const endTime = performance.now();

      // Track error metrics
      if (global.monitoringSystem) {
        await global.monitoringSystem.trackEvent('method_error', {
          method: `${target.constructor.name}.${propertyKey}`,
          duration: endTime - startTime,
          error: error.message,
          success: false
        });
      }

      throw error;
    }
  };

  return descriptor;
}

/**
 * Timer utility for measuring execution time
 */
export class Timer {
  constructor(name) {
    this.name = name;
    this.startTime = null;
    this.endTime = null;
  }

  start() {
    this.startTime = performance.now();
    return this;
  }

  stop() {
    this.endTime = performance.now();
    return this;
  }

  getDuration() {
    if (!this.startTime || !this.endTime) {
      throw new Error('Timer not properly started/stopped');
    }
    return this.endTime - this.startTime;
  }

  async track() {
    if (global.monitoringSystem) {
      await global.monitoringSystem.trackEvent('timer_measurement', {
        name: this.name,
        duration: this.getDuration()
      });
    }
  }
}

/**
 * Counter utility for tracking occurrences
 */
export class Counter {
  constructor(name, initialValue = 0) {
    this.name = name;
    this.value = initialValue;
    this.lastReset = Date.now();
  }

  increment(amount = 1) {
    this.value += amount;
    return this;
  }

  decrement(amount = 1) {
    this.value -= amount;
    return this;
  }

  reset() {
    this.value = 0;
    this.lastReset = Date.now();
    return this;
  }

  getValue() {
    return this.value;
  }

  async track() {
    if (global.monitoringSystem) {
      await global.monitoringSystem.trackEvent('counter_value', {
        name: this.name,
        value: this.value,
        last_reset: this.lastReset
      });
    }
  }
}

/**
 * Gauge utility for tracking current values
 */
export class Gauge {
  constructor(name, initialValue = 0) {
    this.name = name;
    this.value = initialValue;
    this.lastUpdated = Date.now();
  }

  set(value) {
    this.value = value;
    this.lastUpdated = Date.now();
    return this;
  }

  getValue() {
    return this.value;
  }

  async track() {
    if (global.monitoringSystem) {
      await global.monitoringSystem.trackEvent('gauge_value', {
        name: this.name,
        value: this.value,
        last_updated: this.lastUpdated
      });
    }
  }
}

/**
 * Histogram utility for tracking value distributions
 */
export class Histogram {
  constructor(name, buckets = [1, 5, 10, 25, 50, 100, 250, 500, 1000]) {
    this.name = name;
    this.buckets = buckets.sort((a, b) => a - b);
    this.counts = new Array(this.buckets.length + 1).fill(0);
    this.sum = 0;
    this.count = 0;
  }

  observe(value) {
    this.sum += value;
    this.count++;

    // Find the appropriate bucket
    let bucketIndex = this.buckets.findIndex(bucket => value <= bucket);
    if (bucketIndex === -1) {
      bucketIndex = this.buckets.length; // Overflow bucket
    }

    this.counts[bucketIndex]++;
    return this;
  }

  getPercentile(percentile) {
    const targetCount = Math.ceil((percentile / 100) * this.count);
    let currentCount = 0;

    for (let i = 0; i < this.counts.length; i++) {
      currentCount += this.counts[i];
      if (currentCount >= targetCount) {
        return i < this.buckets.length ? this.buckets[i] : Infinity;
      }
    }

    return 0;
  }

  getAverage() {
    return this.count > 0 ? this.sum / this.count : 0;
  }

  async track() {
    if (global.monitoringSystem) {
      await global.monitoringSystem.trackEvent('histogram_stats', {
        name: this.name,
        count: this.count,
        sum: this.sum,
        average: this.getAverage(),
        p50: this.getPercentile(50),
        p95: this.getPercentile(95),
        p99: this.getPercentile(99)
      });
    }
  }
}

/**
 * Rate limiter with metrics tracking
 */
export class RateLimiter {
  constructor(name, maxRequests, windowMs) {
    this.name = name;
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
  }

  async checkLimit() {
    const now = Date.now();
    
    // Remove old requests outside the window
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    const allowed = this.requests.length < this.maxRequests;
    
    if (allowed) {
      this.requests.push(now);
    }

    // Track rate limiting metrics
    if (global.monitoringSystem) {
      await global.monitoringSystem.trackEvent('rate_limit_check', {
        name: this.name,
        allowed,
        current_requests: this.requests.length,
        max_requests: this.maxRequests,
        window_ms: this.windowMs
      });
    }

    return {
      allowed,
      remaining: Math.max(0, this.maxRequests - this.requests.length),
      resetTime: now + this.windowMs
    };
  }
}

/**
 * Circuit breaker with metrics tracking
 */
export class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
      } else {
        await this.trackEvent('circuit_breaker_rejected');
        throw new Error(`Circuit breaker is OPEN for ${this.name}`);
      }
    }

    try {
      const result = await fn();
      
      if (this.state === 'HALF_OPEN') {
        this.successCount++;
        if (this.successCount >= 3) {
          this.state = 'CLOSED';
          this.failures = 0;
          await this.trackEvent('circuit_breaker_closed');
        }
      } else {
        this.failures = 0;
      }

      await this.trackEvent('circuit_breaker_success');
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();

      if (this.failures >= this.failureThreshold) {
        this.state = 'OPEN';
        await this.trackEvent('circuit_breaker_opened');
      }

      await this.trackEvent('circuit_breaker_failure');
      throw error;
    }
  }

  async trackEvent(eventType) {
    if (global.monitoringSystem) {
      await global.monitoringSystem.trackEvent(eventType, {
        name: this.name,
        state: this.state,
        failures: this.failures,
        success_count: this.successCount
      });
    }
  }

  getState() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      successCount: this.successCount
    };
  }
}

/**
 * Health check utility
 */
export class HealthCheck {
  constructor(name, checkFn, options = {}) {
    this.name = name;
    this.checkFn = checkFn;
    this.timeout = options.timeout || 5000;
    this.interval = options.interval || 30000;
    this.lastCheck = null;
    this.lastResult = null;
    this.isRunning = false;
  }

  async check() {
    const startTime = Date.now();
    
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Health check timeout')), this.timeout);
      });

      const result = await Promise.race([
        this.checkFn(),
        timeoutPromise
      ]);

      const duration = Date.now() - startTime;
      
      this.lastCheck = Date.now();
      this.lastResult = {
        healthy: true,
        duration,
        result,
        timestamp: this.lastCheck
      };

      await this.trackHealthCheck(true, duration);
      return this.lastResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.lastCheck = Date.now();
      this.lastResult = {
        healthy: false,
        duration,
        error: error.message,
        timestamp: this.lastCheck
      };

      await this.trackHealthCheck(false, duration, error.message);
      return this.lastResult;
    }
  }

  startPeriodicCheck() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.check().catch(console.error);
    }, this.interval);
  }

  stopPeriodicCheck() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
  }

  async trackHealthCheck(healthy, duration, error = null) {
    if (global.monitoringSystem) {
      await global.monitoringSystem.trackEvent('health_check', {
        name: this.name,
        healthy,
        duration,
        error
      });
    }
  }

  getStatus() {
    return {
      name: this.name,
      isRunning: this.isRunning,
      lastCheck: this.lastCheck,
      lastResult: this.lastResult
    };
  }
}

/**
 * Utility functions
 */
export const MetricsUtils = {
  /**
   * Format bytes to human readable format
   */
  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  },

  /**
   * Format duration to human readable format
   */
  formatDuration(ms) {
    if (ms < 1000) return `${ms.toFixed(2)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(2)}m`;
    return `${(ms / 3600000).toFixed(2)}h`;
  },

  /**
   * Calculate percentile from array of values
   */
  percentile(values, p) {
    if (values.length === 0) return 0;
    
    const sorted = values.slice().sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    
    if (Math.floor(index) === index) {
      return sorted[index];
    } else {
      const lower = sorted[Math.floor(index)];
      const upper = sorted[Math.ceil(index)];
      return lower + (upper - lower) * (index - Math.floor(index));
    }
  },

  /**
   * Calculate moving average
   */
  movingAverage(values, windowSize) {
    if (values.length < windowSize) return values;
    
    const result = [];
    for (let i = windowSize - 1; i < values.length; i++) {
      const window = values.slice(i - windowSize + 1, i + 1);
      const avg = window.reduce((sum, val) => sum + val, 0) / windowSize;
      result.push(avg);
    }
    
    return result;
  }
};

export default {
  measurePerformance,
  Timer,
  Counter,
  Gauge,
  Histogram,
  RateLimiter,
  CircuitBreaker,
  HealthCheck,
  MetricsUtils
};

