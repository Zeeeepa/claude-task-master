/**
 * error-analytics.js
 * 
 * Comprehensive error tracking, analysis, and reporting system
 * for monitoring error patterns and system health.
 */

import { log } from '../../scripts/modules/utils.js';
import fs from 'fs';
import path from 'path';

/**
 * Error analytics and reporting system
 */
export class ErrorAnalytics {
  constructor(options = {}) {
    this.maxHistorySize = options.maxHistorySize || 10000;
    this.aggregationWindow = options.aggregationWindow || 300000; // 5 minutes
    this.persistenceEnabled = options.persistence !== false;
    this.persistencePath = options.persistencePath || './error-analytics.json';
    
    // Error tracking data structures
    this.errorHistory = [];
    this.errorCounts = new Map();
    this.errorPatterns = new Map();
    this.resolutionStats = new Map();
    this.performanceMetrics = new Map();
    
    // Time-based aggregations
    this.hourlyStats = new Map();
    this.dailyStats = new Map();
    
    // Load persisted data if available
    this._loadPersistedData();
    
    // Set up periodic aggregation
    this._setupPeriodicAggregation();
  }

  /**
   * Record an error occurrence
   */
  recordError(error, classification, context = {}) {
    const timestamp = Date.now();
    const errorRecord = {
      id: this._generateErrorId(),
      timestamp,
      date: new Date(timestamp).toISOString(),
      type: classification.type,
      severity: classification.severity,
      message: this._sanitizeMessage(error.message || String(error)),
      classification,
      context: {
        operation: context.operation,
        component: context.component,
        userId: context.userId,
        sessionId: context.sessionId,
        retryAttempt: context.retryAttempt || 0,
        ...context
      },
      resolved: false,
      resolutionTime: null,
      resolutionStrategy: null
    };

    // Add to history
    this.errorHistory.push(errorRecord);
    
    // Maintain history size limit
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }

    // Update counters
    this._updateErrorCounts(errorRecord);
    
    // Update patterns
    this._updateErrorPatterns(errorRecord);
    
    // Update time-based stats
    this._updateTimeBasedStats(errorRecord);
    
    // Persist if enabled
    if (this.persistenceEnabled) {
      this._persistData();
    }

    log('debug', `Error recorded: ${classification.type} - ${errorRecord.message.substring(0, 100)}`);
    
    return errorRecord.id;
  }

  /**
   * Record error resolution
   */
  recordResolution(errorId, strategy, success = true, additionalInfo = {}) {
    const errorRecord = this.errorHistory.find(e => e.id === errorId);
    if (!errorRecord) {
      log('warn', `Error record not found for ID: ${errorId}`);
      return false;
    }

    const resolutionTime = Date.now() - errorRecord.timestamp;
    
    errorRecord.resolved = success;
    errorRecord.resolutionTime = resolutionTime;
    errorRecord.resolutionStrategy = strategy;
    errorRecord.resolutionInfo = additionalInfo;

    // Update resolution statistics
    this._updateResolutionStats(errorRecord, success);
    
    // Update performance metrics
    this._updatePerformanceMetrics(errorRecord);

    log('debug', `Error resolution recorded: ${errorId} - ${strategy} - ${success ? 'success' : 'failure'}`);
    
    return true;
  }

  /**
   * Get error statistics for a time period
   */
  getErrorStats(timeRange = '24h') {
    const now = Date.now();
    const timeRangeMs = this._parseTimeRange(timeRange);
    const cutoff = now - timeRangeMs;
    
    const recentErrors = this.errorHistory.filter(e => e.timestamp >= cutoff);
    
    // Basic counts
    const totalErrors = recentErrors.length;
    const resolvedErrors = recentErrors.filter(e => e.resolved).length;
    const unresolvedErrors = totalErrors - resolvedErrors;
    
    // Error types breakdown
    const errorTypeBreakdown = {};
    const severityBreakdown = {};
    
    recentErrors.forEach(error => {
      errorTypeBreakdown[error.type] = (errorTypeBreakdown[error.type] || 0) + 1;
      severityBreakdown[error.severity] = (severityBreakdown[error.severity] || 0) + 1;
    });

    // Resolution rate
    const resolutionRate = totalErrors > 0 ? (resolvedErrors / totalErrors) * 100 : 0;
    
    // Average resolution time
    const resolvedWithTime = recentErrors.filter(e => e.resolved && e.resolutionTime);
    const avgResolutionTime = resolvedWithTime.length > 0 
      ? resolvedWithTime.reduce((sum, e) => sum + e.resolutionTime, 0) / resolvedWithTime.length
      : 0;

    return {
      timeRange,
      period: {
        start: new Date(cutoff).toISOString(),
        end: new Date(now).toISOString()
      },
      summary: {
        totalErrors,
        resolvedErrors,
        unresolvedErrors,
        resolutionRate: Math.round(resolutionRate * 100) / 100,
        avgResolutionTime: Math.round(avgResolutionTime)
      },
      breakdown: {
        byType: errorTypeBreakdown,
        bySeverity: severityBreakdown
      }
    };
  }

  /**
   * Get error patterns and trends
   */
  getErrorPatterns(options = {}) {
    const limit = options.limit || 10;
    const minOccurrences = options.minOccurrences || 2;
    
    // Convert patterns map to sorted array
    const patterns = Array.from(this.errorPatterns.entries())
      .map(([pattern, data]) => ({
        pattern,
        occurrences: data.count,
        firstSeen: new Date(data.firstSeen).toISOString(),
        lastSeen: new Date(data.lastSeen).toISOString(),
        errorTypes: Array.from(data.types),
        avgSeverity: this._calculateAverageSeverity(data.severities),
        resolutionRate: data.resolved / data.count
      }))
      .filter(p => p.occurrences >= minOccurrences)
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, limit);

    return patterns;
  }

  /**
   * Get resolution strategy effectiveness
   */
  getResolutionEffectiveness() {
    const strategies = Array.from(this.resolutionStats.entries())
      .map(([strategy, stats]) => ({
        strategy,
        totalAttempts: stats.attempts,
        successfulResolutions: stats.successes,
        successRate: stats.attempts > 0 ? (stats.successes / stats.attempts) * 100 : 0,
        avgResolutionTime: stats.totalTime / Math.max(stats.successes, 1),
        errorTypes: Array.from(stats.errorTypes)
      }))
      .sort((a, b) => b.successRate - a.successRate);

    return strategies;
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    const metrics = {};
    
    for (const [operation, data] of this.performanceMetrics) {
      metrics[operation] = {
        totalOperations: data.count,
        errorRate: (data.errors / data.count) * 100,
        avgResponseTime: data.totalTime / data.count,
        p95ResponseTime: this._calculatePercentile(data.responseTimes, 95),
        p99ResponseTime: this._calculatePercentile(data.responseTimes, 99)
      };
    }
    
    return metrics;
  }

  /**
   * Generate error report
   */
  generateReport(options = {}) {
    const timeRange = options.timeRange || '24h';
    const includePatterns = options.includePatterns !== false;
    const includeResolutions = options.includeResolutions !== false;
    const includePerformance = options.includePerformance !== false;

    const report = {
      generatedAt: new Date().toISOString(),
      timeRange,
      summary: this.getErrorStats(timeRange)
    };

    if (includePatterns) {
      report.patterns = this.getErrorPatterns();
    }

    if (includeResolutions) {
      report.resolutionEffectiveness = this.getResolutionEffectiveness();
    }

    if (includePerformance) {
      report.performanceMetrics = this.getPerformanceMetrics();
    }

    // Add recommendations
    report.recommendations = this._generateRecommendations(report);

    return report;
  }

  /**
   * Get real-time dashboard data
   */
  getDashboardData() {
    const last24h = this.getErrorStats('24h');
    const last1h = this.getErrorStats('1h');
    const topPatterns = this.getErrorPatterns({ limit: 5 });
    const recentErrors = this.errorHistory
      .slice(-10)
      .reverse()
      .map(e => ({
        id: e.id,
        timestamp: e.date,
        type: e.type,
        severity: e.severity,
        message: e.message.substring(0, 100),
        resolved: e.resolved
      }));

    return {
      current: {
        activeErrors: this.errorHistory.filter(e => !e.resolved).length,
        last1h: last1h.summary,
        last24h: last24h.summary
      },
      trends: {
        hourlyErrorRate: this._getHourlyTrend(),
        resolutionTrend: this._getResolutionTrend()
      },
      topPatterns,
      recentErrors,
      systemHealth: this._calculateSystemHealth()
    };
  }

  /**
   * Update error counts
   * @private
   */
  _updateErrorCounts(errorRecord) {
    const key = `${errorRecord.type}_${errorRecord.severity}`;
    const current = this.errorCounts.get(key) || { count: 0, lastSeen: 0 };
    
    this.errorCounts.set(key, {
      count: current.count + 1,
      lastSeen: errorRecord.timestamp
    });
  }

  /**
   * Update error patterns
   * @private
   */
  _updateErrorPatterns(errorRecord) {
    const pattern = this._extractPattern(errorRecord.message);
    const current = this.errorPatterns.get(pattern) || {
      count: 0,
      firstSeen: errorRecord.timestamp,
      lastSeen: 0,
      types: new Set(),
      severities: [],
      resolved: 0
    };

    current.count++;
    current.lastSeen = errorRecord.timestamp;
    current.types.add(errorRecord.type);
    current.severities.push(errorRecord.severity);

    this.errorPatterns.set(pattern, current);
  }

  /**
   * Update time-based statistics
   * @private
   */
  _updateTimeBasedStats(errorRecord) {
    const hour = new Date(errorRecord.timestamp).getHours();
    const day = new Date(errorRecord.timestamp).toDateString();

    // Update hourly stats
    const hourlyKey = `${day}_${hour}`;
    const hourlyStats = this.hourlyStats.get(hourlyKey) || { count: 0, types: {} };
    hourlyStats.count++;
    hourlyStats.types[errorRecord.type] = (hourlyStats.types[errorRecord.type] || 0) + 1;
    this.hourlyStats.set(hourlyKey, hourlyStats);

    // Update daily stats
    const dailyStats = this.dailyStats.get(day) || { count: 0, types: {} };
    dailyStats.count++;
    dailyStats.types[errorRecord.type] = (dailyStats.types[errorRecord.type] || 0) + 1;
    this.dailyStats.set(day, dailyStats);
  }

  /**
   * Update resolution statistics
   * @private
   */
  _updateResolutionStats(errorRecord, success) {
    const strategy = errorRecord.resolutionStrategy;
    const current = this.resolutionStats.get(strategy) || {
      attempts: 0,
      successes: 0,
      totalTime: 0,
      errorTypes: new Set()
    };

    current.attempts++;
    if (success) {
      current.successes++;
      current.totalTime += errorRecord.resolutionTime;
    }
    current.errorTypes.add(errorRecord.type);

    this.resolutionStats.set(strategy, current);

    // Update pattern resolution count
    const pattern = this._extractPattern(errorRecord.message);
    const patternData = this.errorPatterns.get(pattern);
    if (patternData && success) {
      patternData.resolved++;
    }
  }

  /**
   * Update performance metrics
   * @private
   */
  _updatePerformanceMetrics(errorRecord) {
    const operation = errorRecord.context.operation || 'unknown';
    const current = this.performanceMetrics.get(operation) || {
      count: 0,
      errors: 0,
      totalTime: 0,
      responseTimes: []
    };

    current.count++;
    if (!errorRecord.resolved) {
      current.errors++;
    }
    
    if (errorRecord.resolutionTime) {
      current.totalTime += errorRecord.resolutionTime;
      current.responseTimes.push(errorRecord.resolutionTime);
      
      // Keep only last 1000 response times
      if (current.responseTimes.length > 1000) {
        current.responseTimes.shift();
      }
    }

    this.performanceMetrics.set(operation, current);
  }

  /**
   * Extract error pattern from message
   * @private
   */
  _extractPattern(message) {
    // Remove specific values and create a pattern
    return message
      .replace(/\d+/g, 'N')
      .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, 'UUID')
      .replace(/\b\w+@\w+\.\w+\b/g, 'EMAIL')
      .replace(/https?:\/\/[^\s]+/g, 'URL')
      .replace(/\/[^\s]+/g, 'PATH')
      .substring(0, 200);
  }

  /**
   * Generate error ID
   * @private
   */
  _generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sanitize error message for storage
   * @private
   */
  _sanitizeMessage(message) {
    // Remove sensitive information
    return message
      .replace(/password[=:]\s*\S+/gi, 'password=***')
      .replace(/token[=:]\s*\S+/gi, 'token=***')
      .replace(/key[=:]\s*\S+/gi, 'key=***')
      .substring(0, 1000); // Limit length
  }

  /**
   * Parse time range string to milliseconds
   * @private
   */
  _parseTimeRange(timeRange) {
    const units = {
      'm': 60 * 1000,
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000,
      'w': 7 * 24 * 60 * 60 * 1000
    };

    const match = timeRange.match(/^(\d+)([mhdw])$/);
    if (!match) {
      return 24 * 60 * 60 * 1000; // Default to 24 hours
    }

    const [, amount, unit] = match;
    return parseInt(amount) * units[unit];
  }

  /**
   * Calculate average severity
   * @private
   */
  _calculateAverageSeverity(severities) {
    const severityValues = { low: 1, medium: 2, high: 3, critical: 4 };
    const total = severities.reduce((sum, s) => sum + (severityValues[s] || 2), 0);
    const avg = total / severities.length;
    
    if (avg <= 1.5) return 'low';
    if (avg <= 2.5) return 'medium';
    if (avg <= 3.5) return 'high';
    return 'critical';
  }

  /**
   * Calculate percentile
   * @private
   */
  _calculatePercentile(values, percentile) {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get hourly error trend
   * @private
   */
  _getHourlyTrend() {
    const last24Hours = [];
    const now = new Date();
    
    for (let i = 23; i >= 0; i--) {
      const hour = new Date(now.getTime() - i * 60 * 60 * 1000);
      const key = `${hour.toDateString()}_${hour.getHours()}`;
      const stats = this.hourlyStats.get(key) || { count: 0 };
      
      last24Hours.push({
        hour: hour.getHours(),
        count: stats.count
      });
    }
    
    return last24Hours;
  }

  /**
   * Get resolution trend
   * @private
   */
  _getResolutionTrend() {
    const recentResolutions = this.errorHistory
      .filter(e => e.resolved && e.resolutionTime)
      .slice(-100);
    
    return recentResolutions.map(e => ({
      timestamp: e.timestamp,
      resolutionTime: e.resolutionTime,
      strategy: e.resolutionStrategy
    }));
  }

  /**
   * Calculate system health score
   * @private
   */
  _calculateSystemHealth() {
    const last1h = this.getErrorStats('1h');
    const last24h = this.getErrorStats('24h');
    
    // Base score
    let score = 100;
    
    // Deduct for error rate
    if (last1h.summary.totalErrors > 10) score -= 20;
    else if (last1h.summary.totalErrors > 5) score -= 10;
    
    // Deduct for resolution rate
    if (last24h.summary.resolutionRate < 80) score -= 15;
    else if (last24h.summary.resolutionRate < 90) score -= 10;
    
    // Deduct for critical errors
    const criticalErrors = this.errorHistory
      .filter(e => e.severity === 'critical' && e.timestamp > Date.now() - 3600000)
      .length;
    score -= criticalErrors * 5;
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate recommendations based on error patterns
   * @private
   */
  _generateRecommendations(report) {
    const recommendations = [];
    
    // High error rate recommendation
    if (report.summary.summary.totalErrors > 50) {
      recommendations.push({
        type: 'high_error_rate',
        priority: 'high',
        message: 'High error rate detected. Consider investigating system stability.',
        action: 'Review error patterns and implement preventive measures.'
      });
    }
    
    // Low resolution rate recommendation
    if (report.summary.summary.resolutionRate < 80) {
      recommendations.push({
        type: 'low_resolution_rate',
        priority: 'medium',
        message: 'Low error resolution rate. Improve error handling strategies.',
        action: 'Review and enhance retry logic and escalation procedures.'
      });
    }
    
    // Pattern-based recommendations
    if (report.patterns && report.patterns.length > 0) {
      const topPattern = report.patterns[0];
      if (topPattern.occurrences > 10 && topPattern.resolutionRate < 0.5) {
        recommendations.push({
          type: 'recurring_pattern',
          priority: 'high',
          message: `Recurring error pattern with low resolution rate: ${topPattern.pattern.substring(0, 100)}`,
          action: 'Implement specific handling for this error pattern.'
        });
      }
    }
    
    return recommendations;
  }

  /**
   * Load persisted data
   * @private
   */
  _loadPersistedData() {
    if (!this.persistenceEnabled) return;
    
    try {
      if (fs.existsSync(this.persistencePath)) {
        const data = JSON.parse(fs.readFileSync(this.persistencePath, 'utf8'));
        
        // Restore data structures
        this.errorHistory = data.errorHistory || [];
        this.errorCounts = new Map(data.errorCounts || []);
        this.errorPatterns = new Map(data.errorPatterns || []);
        this.resolutionStats = new Map(data.resolutionStats || []);
        
        log('info', `Loaded ${this.errorHistory.length} error records from persistence`);
      }
    } catch (error) {
      log('warn', `Failed to load persisted error data: ${error.message}`);
    }
  }

  /**
   * Persist data to disk
   * @private
   */
  _persistData() {
    if (!this.persistenceEnabled) return;
    
    try {
      const data = {
        errorHistory: this.errorHistory.slice(-this.maxHistorySize),
        errorCounts: Array.from(this.errorCounts.entries()),
        errorPatterns: Array.from(this.errorPatterns.entries()),
        resolutionStats: Array.from(this.resolutionStats.entries()),
        lastUpdated: new Date().toISOString()
      };
      
      fs.writeFileSync(this.persistencePath, JSON.stringify(data, null, 2));
    } catch (error) {
      log('warn', `Failed to persist error data: ${error.message}`);
    }
  }

  /**
   * Setup periodic aggregation
   * @private
   */
  _setupPeriodicAggregation() {
    // Run aggregation every 5 minutes
    setInterval(() => {
      this._performPeriodicAggregation();
    }, this.aggregationWindow);
  }

  /**
   * Perform periodic data aggregation and cleanup
   * @private
   */
  _performPeriodicAggregation() {
    // Clean up old hourly stats (keep last 7 days)
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const [key, stats] of this.hourlyStats) {
      const [dateStr] = key.split('_');
      if (new Date(dateStr).getTime() < sevenDaysAgo) {
        this.hourlyStats.delete(key);
      }
    }
    
    // Clean up old daily stats (keep last 30 days)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const [dateStr, stats] of this.dailyStats) {
      if (new Date(dateStr).getTime() < thirtyDaysAgo) {
        this.dailyStats.delete(dateStr);
      }
    }
    
    // Persist aggregated data
    if (this.persistenceEnabled) {
      this._persistData();
    }
    
    log('debug', 'Periodic error analytics aggregation completed');
  }

  /**
   * Clear all analytics data
   */
  clearData() {
    this.errorHistory = [];
    this.errorCounts.clear();
    this.errorPatterns.clear();
    this.resolutionStats.clear();
    this.performanceMetrics.clear();
    this.hourlyStats.clear();
    this.dailyStats.clear();
    
    if (this.persistenceEnabled && fs.existsSync(this.persistencePath)) {
      fs.unlinkSync(this.persistencePath);
    }
  }
}

// Export singleton instance
export const errorAnalytics = new ErrorAnalytics();

