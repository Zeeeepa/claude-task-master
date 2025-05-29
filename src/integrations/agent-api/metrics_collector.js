/**
 * Metrics Collector
 * 
 * Performance metrics collection and analysis for the AgentAPI middleware.
 * Tracks agent response times, success rates, and system performance indicators.
 */

import EventEmitter from 'events';

export class MetricsCollector extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      retentionPeriod: config.retentionPeriod || 24 * 60 * 60 * 1000, // 24 hours
      aggregationInterval: config.aggregationInterval || 60 * 1000, // 1 minute
      enableRealTimeMetrics: config.enableRealTimeMetrics !== false,
      enableHistoricalMetrics: config.enableHistoricalMetrics !== false,
      maxDataPoints: config.maxDataPoints || 1440, // 24 hours of minute-level data
      ...config
    };

    // Metrics storage
    this.realTimeMetrics = new Map(); // metric_name -> current value
    this.historicalMetrics = new Map(); // metric_name -> array of timestamped values
    this.aggregatedMetrics = new Map(); // metric_name -> aggregated data

    // Performance tracking
    this.performanceCounters = {
      sessions: {
        created: 0,
        closed: 0,
        active: 0,
        timeouts: 0,
        errors: 0
      },
      messages: {
        sent: 0,
        received: 0,
        processed: 0,
        failed: 0,
        retried: 0
      },
      agents: {
        available: 0,
        busy: 0,
        unhealthy: 0,
        total: 0
      },
      system: {
        uptime: Date.now(),
        memoryUsage: 0,
        cpuUsage: 0,
        connections: 0
      }
    };

    // Response time tracking
    this.responseTimes = new Map(); // agentType -> array of response times
    this.responseTimeWindows = new Map(); // agentType -> sliding window data

    // Aggregation timer
    this.aggregationTimer = null;
  }

  /**
   * Initialize the metrics collector
   */
  async initialize() {
    try {
      console.log('🚀 Initializing Metrics Collector...');

      // Initialize metric storage
      this._initializeMetrics();

      // Start aggregation process
      if (this.config.enableHistoricalMetrics) {
        this._startAggregation();
      }

      // Start system metrics collection
      this._startSystemMetrics();

      console.log('✅ Metrics Collector initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Metrics Collector:', error);
      throw error;
    }
  }

  /**
   * Record a session creation event
   */
  recordSessionCreated(agentType, responseTime = 0) {
    this.performanceCounters.sessions.created++;
    this.performanceCounters.sessions.active++;
    
    this._updateRealTimeMetric('sessions.created.total', this.performanceCounters.sessions.created);
    this._updateRealTimeMetric('sessions.active', this.performanceCounters.sessions.active);
    this._updateRealTimeMetric(`sessions.created.${agentType}`, 
      (this.realTimeMetrics.get(`sessions.created.${agentType}`) || 0) + 1);

    if (responseTime > 0) {
      this._recordResponseTime(agentType, responseTime, 'session_creation');
    }

    this.emit('sessionCreated', { agentType, responseTime });
  }

  /**
   * Record a session closure event
   */
  recordSessionClosed(agentType, duration, reason = 'normal') {
    this.performanceCounters.sessions.closed++;
    this.performanceCounters.sessions.active = Math.max(0, this.performanceCounters.sessions.active - 1);

    if (reason === 'timeout') {
      this.performanceCounters.sessions.timeouts++;
      this._updateRealTimeMetric('sessions.timeouts', this.performanceCounters.sessions.timeouts);
    } else if (reason === 'error') {
      this.performanceCounters.sessions.errors++;
      this._updateRealTimeMetric('sessions.errors', this.performanceCounters.sessions.errors);
    }

    this._updateRealTimeMetric('sessions.closed.total', this.performanceCounters.sessions.closed);
    this._updateRealTimeMetric('sessions.active', this.performanceCounters.sessions.active);
    this._updateRealTimeMetric(`sessions.closed.${agentType}`, 
      (this.realTimeMetrics.get(`sessions.closed.${agentType}`) || 0) + 1);

    // Record session duration
    this._recordSessionDuration(agentType, duration);

    this.emit('sessionClosed', { agentType, duration, reason });
  }

  /**
   * Record a message sent event
   */
  recordMessageSent(agentType, responseTime) {
    this.performanceCounters.messages.sent++;
    
    this._updateRealTimeMetric('messages.sent.total', this.performanceCounters.messages.sent);
    this._updateRealTimeMetric(`messages.sent.${agentType}`, 
      (this.realTimeMetrics.get(`messages.sent.${agentType}`) || 0) + 1);

    this._recordResponseTime(agentType, responseTime, 'message');

    this.emit('messageSent', { agentType, responseTime });
  }

  /**
   * Record a message processing event
   */
  recordMessageProcessed(agentType, processingTime, success = true) {
    if (success) {
      this.performanceCounters.messages.processed++;
      this._updateRealTimeMetric('messages.processed.total', this.performanceCounters.messages.processed);
    } else {
      this.performanceCounters.messages.failed++;
      this._updateRealTimeMetric('messages.failed.total', this.performanceCounters.messages.failed);
    }

    this._updateRealTimeMetric(`messages.processed.${agentType}`, 
      (this.realTimeMetrics.get(`messages.processed.${agentType}`) || 0) + (success ? 1 : 0));

    this._recordResponseTime(agentType, processingTime, 'processing');

    this.emit('messageProcessed', { agentType, processingTime, success });
  }

  /**
   * Record agent status change
   */
  recordAgentStatusChange(agentType, status, previousStatus = null) {
    // Update agent counters
    if (previousStatus) {
      this.performanceCounters.agents[previousStatus] = Math.max(0, this.performanceCounters.agents[previousStatus] - 1);
    }
    this.performanceCounters.agents[status]++;

    // Update real-time metrics
    this._updateRealTimeMetric('agents.available', this.performanceCounters.agents.available || 0);
    this._updateRealTimeMetric('agents.busy', this.performanceCounters.agents.busy || 0);
    this._updateRealTimeMetric('agents.unhealthy', this.performanceCounters.agents.unhealthy || 0);
    this._updateRealTimeMetric('agents.total', this.performanceCounters.agents.total || 0);

    this._updateRealTimeMetric(`agents.${status}.${agentType}`, 
      (this.realTimeMetrics.get(`agents.${status}.${agentType}`) || 0) + 1);

    this.emit('agentStatusChanged', { agentType, status, previousStatus });
  }

  /**
   * Get current real-time metrics
   */
  async getMetrics() {
    const metrics = {
      realTime: Object.fromEntries(this.realTimeMetrics),
      performance: { ...this.performanceCounters },
      responseTimes: this._getResponseTimeMetrics(),
      system: await this._getSystemMetrics(),
      aggregated: this.config.enableHistoricalMetrics ? this._getAggregatedMetrics() : null,
      timestamp: Date.now()
    };

    return metrics;
  }

  /**
   * Get historical metrics for a specific time range
   */
  async getHistoricalMetrics(metricName, startTime, endTime) {
    if (!this.config.enableHistoricalMetrics) {
      throw new Error('Historical metrics are disabled');
    }

    const historicalData = this.historicalMetrics.get(metricName) || [];
    
    return historicalData.filter(dataPoint => 
      dataPoint.timestamp >= startTime && dataPoint.timestamp <= endTime
    );
  }

  /**
   * Get aggregated metrics summary
   */
  async getAggregatedMetrics(period = 'hour') {
    if (!this.config.enableHistoricalMetrics) {
      throw new Error('Historical metrics are disabled');
    }

    const now = Date.now();
    let periodMs;

    switch (period) {
      case 'minute':
        periodMs = 60 * 1000;
        break;
      case 'hour':
        periodMs = 60 * 60 * 1000;
        break;
      case 'day':
        periodMs = 24 * 60 * 60 * 1000;
        break;
      default:
        throw new Error(`Invalid period: ${period}`);
    }

    const startTime = now - periodMs;
    const aggregated = {};

    for (const [metricName, data] of this.aggregatedMetrics.entries()) {
      const relevantData = data.filter(point => point.timestamp >= startTime);
      
      if (relevantData.length > 0) {
        aggregated[metricName] = {
          count: relevantData.length,
          sum: relevantData.reduce((sum, point) => sum + point.value, 0),
          average: relevantData.reduce((sum, point) => sum + point.value, 0) / relevantData.length,
          min: Math.min(...relevantData.map(point => point.value)),
          max: Math.max(...relevantData.map(point => point.value)),
          latest: relevantData[relevantData.length - 1].value
        };
      }
    }

    return aggregated;
  }

  /**
   * Reset all metrics
   */
  async resetMetrics() {
    this.realTimeMetrics.clear();
    this.historicalMetrics.clear();
    this.aggregatedMetrics.clear();
    this.responseTimes.clear();
    this.responseTimeWindows.clear();

    // Reset performance counters
    this.performanceCounters = {
      sessions: { created: 0, closed: 0, active: 0, timeouts: 0, errors: 0 },
      messages: { sent: 0, received: 0, processed: 0, failed: 0, retried: 0 },
      agents: { available: 0, busy: 0, unhealthy: 0, total: 0 },
      system: { uptime: Date.now(), memoryUsage: 0, cpuUsage: 0, connections: 0 }
    };

    console.log('🔄 All metrics have been reset');
    this.emit('metricsReset');
  }

  /**
   * Shutdown the metrics collector
   */
  async shutdown() {
    try {
      console.log('🔄 Shutting down Metrics Collector...');

      // Stop aggregation
      if (this.aggregationTimer) {
        clearInterval(this.aggregationTimer);
      }

      // Clear all data
      this.realTimeMetrics.clear();
      this.historicalMetrics.clear();
      this.aggregatedMetrics.clear();
      this.responseTimes.clear();
      this.responseTimeWindows.clear();

      console.log('✅ Metrics Collector shutdown complete');
      return true;
    } catch (error) {
      console.error('❌ Error during Metrics Collector shutdown:', error);
      throw error;
    }
  }

  // Private methods

  _initializeMetrics() {
    // Initialize basic metrics
    const basicMetrics = [
      'sessions.created.total',
      'sessions.closed.total',
      'sessions.active',
      'sessions.timeouts',
      'sessions.errors',
      'messages.sent.total',
      'messages.processed.total',
      'messages.failed.total',
      'agents.available',
      'agents.busy',
      'agents.unhealthy',
      'agents.total'
    ];

    basicMetrics.forEach(metric => {
      this.realTimeMetrics.set(metric, 0);
      if (this.config.enableHistoricalMetrics) {
        this.historicalMetrics.set(metric, []);
        this.aggregatedMetrics.set(metric, []);
      }
    });
  }

  _updateRealTimeMetric(name, value) {
    this.realTimeMetrics.set(name, value);

    if (this.config.enableHistoricalMetrics) {
      const historical = this.historicalMetrics.get(name) || [];
      historical.push({
        timestamp: Date.now(),
        value
      });

      // Keep only data within retention period
      const cutoffTime = Date.now() - this.config.retentionPeriod;
      const filteredData = historical.filter(point => point.timestamp >= cutoffTime);
      
      this.historicalMetrics.set(name, filteredData);
    }

    if (this.config.enableRealTimeMetrics) {
      this.emit('metricUpdated', { name, value, timestamp: Date.now() });
    }
  }

  _recordResponseTime(agentType, responseTime, operation) {
    // Store raw response times
    if (!this.responseTimes.has(agentType)) {
      this.responseTimes.set(agentType, []);
    }

    const times = this.responseTimes.get(agentType);
    times.push({
      time: responseTime,
      operation,
      timestamp: Date.now()
    });

    // Keep only recent response times (last 1000 entries)
    if (times.length > 1000) {
      times.shift();
    }

    // Update sliding window metrics
    this._updateResponseTimeWindow(agentType, responseTime);

    // Update real-time metrics
    const avgResponseTime = this._calculateAverageResponseTime(agentType);
    this._updateRealTimeMetric(`response_time.${agentType}.average`, avgResponseTime);
    this._updateRealTimeMetric(`response_time.${agentType}.latest`, responseTime);
  }

  _recordSessionDuration(agentType, duration) {
    this._updateRealTimeMetric(`session_duration.${agentType}.latest`, duration);
    
    // Calculate average session duration
    const sessionDurations = this.realTimeMetrics.get(`session_duration.${agentType}.history`) || [];
    sessionDurations.push(duration);
    
    // Keep only last 100 durations
    if (sessionDurations.length > 100) {
      sessionDurations.shift();
    }

    const avgDuration = sessionDurations.reduce((sum, d) => sum + d, 0) / sessionDurations.length;
    this._updateRealTimeMetric(`session_duration.${agentType}.average`, avgDuration);
    this.realTimeMetrics.set(`session_duration.${agentType}.history`, sessionDurations);
  }

  _updateResponseTimeWindow(agentType, responseTime) {
    if (!this.responseTimeWindows.has(agentType)) {
      this.responseTimeWindows.set(agentType, {
        window: [],
        windowSize: 100,
        sum: 0,
        count: 0
      });
    }

    const window = this.responseTimeWindows.get(agentType);
    window.window.push(responseTime);
    window.sum += responseTime;
    window.count++;

    // Maintain sliding window
    if (window.window.length > window.windowSize) {
      const removed = window.window.shift();
      window.sum -= removed;
      window.count--;
    }
  }

  _calculateAverageResponseTime(agentType) {
    const times = this.responseTimes.get(agentType) || [];
    if (times.length === 0) return 0;

    const recentTimes = times.slice(-100); // Last 100 response times
    const sum = recentTimes.reduce((total, entry) => total + entry.time, 0);
    return sum / recentTimes.length;
  }

  _getResponseTimeMetrics() {
    const metrics = {};

    for (const [agentType, times] of this.responseTimes.entries()) {
      if (times.length === 0) continue;

      const recentTimes = times.slice(-100).map(entry => entry.time);
      const sorted = [...recentTimes].sort((a, b) => a - b);

      metrics[agentType] = {
        count: recentTimes.length,
        average: recentTimes.reduce((sum, time) => sum + time, 0) / recentTimes.length,
        min: Math.min(...recentTimes),
        max: Math.max(...recentTimes),
        median: sorted[Math.floor(sorted.length / 2)],
        p95: sorted[Math.floor(sorted.length * 0.95)],
        p99: sorted[Math.floor(sorted.length * 0.99)]
      };
    }

    return metrics;
  }

  async _getSystemMetrics() {
    // In a real implementation, this would collect actual system metrics
    return {
      uptime: Date.now() - this.performanceCounters.system.uptime,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage ? process.cpuUsage() : { user: 0, system: 0 },
      connections: this.performanceCounters.system.connections,
      timestamp: Date.now()
    };
  }

  _getAggregatedMetrics() {
    const aggregated = {};

    for (const [metricName, data] of this.aggregatedMetrics.entries()) {
      if (data.length > 0) {
        const latest = data[data.length - 1];
        aggregated[metricName] = {
          latest: latest.value,
          timestamp: latest.timestamp,
          dataPoints: data.length
        };
      }
    }

    return aggregated;
  }

  _startAggregation() {
    this.aggregationTimer = setInterval(() => {
      this._performAggregation();
    }, this.config.aggregationInterval);
  }

  _performAggregation() {
    const now = Date.now();

    for (const [metricName, value] of this.realTimeMetrics.entries()) {
      const aggregated = this.aggregatedMetrics.get(metricName) || [];
      
      aggregated.push({
        timestamp: now,
        value
      });

      // Keep only data within retention period and max data points
      const cutoffTime = now - this.config.retentionPeriod;
      const filteredData = aggregated
        .filter(point => point.timestamp >= cutoffTime)
        .slice(-this.config.maxDataPoints);

      this.aggregatedMetrics.set(metricName, filteredData);
    }
  }

  _startSystemMetrics() {
    // Update system metrics periodically
    setInterval(() => {
      this.performanceCounters.system.memoryUsage = process.memoryUsage().heapUsed;
    }, 5000); // Every 5 seconds
  }
}

export default MetricsCollector;

