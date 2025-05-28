/**
 * Error Tracker
 * 
 * Comprehensive error tracking and monitoring system for the AI CI/CD system.
 * Provides error aggregation, analysis, and reporting capabilities.
 */

import { ErrorTypes, ErrorSeverity, ErrorCategories } from '../utils/error_types.js';

/**
 * Error Tracker Implementation
 */
export class ErrorTracker {
  constructor(config = {}) {
    this.config = {
      maxErrorHistory: config.maxErrorHistory || 1000,
      aggregationWindow: config.aggregationWindow || 300000, // 5 minutes
      enablePersistence: config.enablePersistence !== false,
      persistenceProvider: config.persistenceProvider || null,
      enableMetrics: config.enableMetrics !== false,
      enableAlerting: config.enableAlerting !== false,
      alertThresholds: config.alertThresholds || {
        errorRate: 0.1, // 10% error rate
        criticalErrors: 5, // 5 critical errors in window
        errorSpike: 2.0 // 2x normal error rate
      }
    };
    
    this.errors = [];
    this.errorCounts = new Map();
    this.errorPatterns = new Map();
    this.metrics = {
      totalErrors: 0,
      errorsByType: {},
      errorsByCategory: {},
      errorsBySeverity: {},
      errorsByComponent: {},
      errorsByTimeWindow: {},
      recentErrorRate: 0,
      averageErrorRate: 0
    };
    
    this.alertCallbacks = [];
    
    // Start periodic aggregation
    this.startAggregation();
  }

  /**
   * Track an error
   */
  async track(error, context = {}) {
    const errorEntry = this.createErrorEntry(error, context);
    
    // Add to error history
    this.errors.push(errorEntry);
    
    // Maintain history size
    if (this.errors.length > this.config.maxErrorHistory) {
      this.errors.shift();
    }
    
    // Update metrics
    this.updateMetrics(errorEntry);
    
    // Check for patterns
    this.analyzeErrorPatterns(errorEntry);
    
    // Persist if enabled
    if (this.config.enablePersistence && this.config.persistenceProvider) {
      await this.persistError(errorEntry);
    }
    
    // Check alert conditions
    if (this.config.enableAlerting) {
      this.checkAlertConditions(errorEntry);
    }
    
    console.log(`📊 Error tracked: ${error.type} - ${error.message}`);
    
    return errorEntry.id;
  }

  /**
   * Create error entry
   */
  createErrorEntry(error, context) {
    return {
      id: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      type: error.type,
      message: error.message,
      severity: error.metadata?.severity || ErrorSeverity.MEDIUM,
      category: error.metadata?.category || ErrorCategories.BUSINESS_LOGIC,
      component: context.component || 'unknown',
      operationId: context.operationId,
      userId: context.userId,
      requestId: context.requestId,
      stack: error.stack,
      metadata: {
        ...error.metadata,
        context: {
          ...context,
          environment: process.env.NODE_ENV || 'development',
          nodeVersion: process.version,
          platform: process.platform
        }
      },
      retryable: error.retryable || false,
      resolved: false,
      tags: this.extractTags(error, context)
    };
  }

  /**
   * Extract tags from error and context
   */
  extractTags(error, context) {
    const tags = [];
    
    // Add error type as tag
    tags.push(`type:${error.type}`);
    
    // Add severity as tag
    if (error.metadata?.severity) {
      tags.push(`severity:${error.metadata.severity}`);
    }
    
    // Add component as tag
    if (context.component) {
      tags.push(`component:${context.component}`);
    }
    
    // Add environment as tag
    tags.push(`env:${process.env.NODE_ENV || 'development'}`);
    
    // Add retryable status
    tags.push(`retryable:${error.retryable || false}`);
    
    return tags;
  }

  /**
   * Update metrics
   */
  updateMetrics(errorEntry) {
    this.metrics.totalErrors++;
    
    // Count by type
    this.metrics.errorsByType[errorEntry.type] = 
      (this.metrics.errorsByType[errorEntry.type] || 0) + 1;
    
    // Count by category
    this.metrics.errorsByCategory[errorEntry.category] = 
      (this.metrics.errorsByCategory[errorEntry.category] || 0) + 1;
    
    // Count by severity
    this.metrics.errorsBySeverity[errorEntry.severity] = 
      (this.metrics.errorsBySeverity[errorEntry.severity] || 0) + 1;
    
    // Count by component
    this.metrics.errorsByComponent[errorEntry.component] = 
      (this.metrics.errorsByComponent[errorEntry.component] || 0) + 1;
    
    // Update time-based metrics
    this.updateTimeBasedMetrics(errorEntry);
  }

  /**
   * Update time-based metrics
   */
  updateTimeBasedMetrics(errorEntry) {
    const now = Date.now();
    const windowStart = now - this.config.aggregationWindow;
    
    // Count recent errors
    const recentErrors = this.errors.filter(err => 
      new Date(err.timestamp).getTime() > windowStart
    );
    
    this.metrics.recentErrorRate = recentErrors.length / (this.config.aggregationWindow / 1000);
    
    // Calculate average error rate
    if (this.errors.length > 0) {
      const oldestError = this.errors[0];
      const timeSpan = now - new Date(oldestError.timestamp).getTime();
      this.metrics.averageErrorRate = this.errors.length / (timeSpan / 1000);
    }
  }

  /**
   * Analyze error patterns
   */
  analyzeErrorPatterns(errorEntry) {
    const patternKey = `${errorEntry.type}:${errorEntry.component}`;
    
    if (!this.errorPatterns.has(patternKey)) {
      this.errorPatterns.set(patternKey, {
        count: 0,
        firstSeen: errorEntry.timestamp,
        lastSeen: errorEntry.timestamp,
        frequency: 0,
        examples: []
      });
    }
    
    const pattern = this.errorPatterns.get(patternKey);
    pattern.count++;
    pattern.lastSeen = errorEntry.timestamp;
    
    // Calculate frequency (errors per hour)
    const timeSpan = new Date(pattern.lastSeen).getTime() - new Date(pattern.firstSeen).getTime();
    pattern.frequency = pattern.count / (timeSpan / 3600000); // per hour
    
    // Keep examples (max 5)
    if (pattern.examples.length < 5) {
      pattern.examples.push({
        id: errorEntry.id,
        message: errorEntry.message,
        timestamp: errorEntry.timestamp
      });
    }
    
    this.errorPatterns.set(patternKey, pattern);
  }

  /**
   * Check alert conditions
   */
  checkAlertConditions(errorEntry) {
    const alerts = [];
    
    // Check error rate threshold
    if (this.metrics.recentErrorRate > this.config.alertThresholds.errorRate) {
      alerts.push({
        type: 'HIGH_ERROR_RATE',
        severity: 'HIGH',
        message: `Error rate (${this.metrics.recentErrorRate.toFixed(2)}/s) exceeds threshold`,
        threshold: this.config.alertThresholds.errorRate,
        actual: this.metrics.recentErrorRate
      });
    }
    
    // Check critical error threshold
    const recentCriticalErrors = this.getRecentErrors()
      .filter(err => err.severity === ErrorSeverity.CRITICAL).length;
    
    if (recentCriticalErrors >= this.config.alertThresholds.criticalErrors) {
      alerts.push({
        type: 'CRITICAL_ERROR_THRESHOLD',
        severity: 'CRITICAL',
        message: `${recentCriticalErrors} critical errors in recent window`,
        threshold: this.config.alertThresholds.criticalErrors,
        actual: recentCriticalErrors
      });
    }
    
    // Check error spike
    if (this.metrics.averageErrorRate > 0) {
      const spikeRatio = this.metrics.recentErrorRate / this.metrics.averageErrorRate;
      if (spikeRatio > this.config.alertThresholds.errorSpike) {
        alerts.push({
          type: 'ERROR_SPIKE',
          severity: 'MEDIUM',
          message: `Error rate spike detected (${spikeRatio.toFixed(2)}x normal)`,
          threshold: this.config.alertThresholds.errorSpike,
          actual: spikeRatio
        });
      }
    }
    
    // Trigger alerts
    for (const alert of alerts) {
      this.triggerAlert(alert, errorEntry);
    }
  }

  /**
   * Trigger alert
   */
  triggerAlert(alert, errorEntry) {
    console.log(`🚨 ALERT: ${alert.type} - ${alert.message}`);
    
    for (const callback of this.alertCallbacks) {
      try {
        callback(alert, errorEntry);
      } catch (callbackError) {
        console.log(`⚠️ Alert callback failed: ${callbackError.message}`);
      }
    }
  }

  /**
   * Add alert callback
   */
  onAlert(callback) {
    this.alertCallbacks.push(callback);
  }

  /**
   * Get recent errors
   */
  getRecentErrors(windowMs = null) {
    const window = windowMs || this.config.aggregationWindow;
    const cutoff = Date.now() - window;
    
    return this.errors.filter(error => 
      new Date(error.timestamp).getTime() > cutoff
    );
  }

  /**
   * Get errors by criteria
   */
  getErrors(criteria = {}) {
    let filteredErrors = [...this.errors];
    
    if (criteria.type) {
      filteredErrors = filteredErrors.filter(err => err.type === criteria.type);
    }
    
    if (criteria.component) {
      filteredErrors = filteredErrors.filter(err => err.component === criteria.component);
    }
    
    if (criteria.severity) {
      filteredErrors = filteredErrors.filter(err => err.severity === criteria.severity);
    }
    
    if (criteria.since) {
      const since = new Date(criteria.since).getTime();
      filteredErrors = filteredErrors.filter(err => 
        new Date(err.timestamp).getTime() > since
      );
    }
    
    if (criteria.limit) {
      filteredErrors = filteredErrors.slice(-criteria.limit);
    }
    
    return filteredErrors;
  }

  /**
   * Get error statistics
   */
  getStatistics(windowMs = null) {
    const recentErrors = this.getRecentErrors(windowMs);
    
    const stats = {
      total: this.errors.length,
      recent: recentErrors.length,
      recentErrorRate: this.metrics.recentErrorRate,
      averageErrorRate: this.metrics.averageErrorRate,
      byType: {},
      byComponent: {},
      bySeverity: {},
      topPatterns: this.getTopErrorPatterns(10)
    };
    
    // Calculate recent statistics
    for (const error of recentErrors) {
      stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;
      stats.byComponent[error.component] = (stats.byComponent[error.component] || 0) + 1;
      stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1;
    }
    
    return stats;
  }

  /**
   * Get top error patterns
   */
  getTopErrorPatterns(limit = 10) {
    const patterns = Array.from(this.errorPatterns.entries())
      .map(([key, pattern]) => ({
        pattern: key,
        ...pattern
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
    
    return patterns;
  }

  /**
   * Generate error report
   */
  generateReport(options = {}) {
    const windowMs = options.windowMs || this.config.aggregationWindow;
    const stats = this.getStatistics(windowMs);
    const recentErrors = this.getRecentErrors(windowMs);
    
    const report = {
      timestamp: new Date().toISOString(),
      period: {
        windowMs,
        description: `Last ${Math.round(windowMs / 60000)} minutes`
      },
      summary: {
        totalErrors: stats.total,
        recentErrors: stats.recent,
        errorRate: stats.recentErrorRate,
        criticalErrors: stats.bySeverity[ErrorSeverity.CRITICAL] || 0,
        highErrors: stats.bySeverity[ErrorSeverity.HIGH] || 0
      },
      breakdown: {
        byType: stats.byType,
        byComponent: stats.byComponent,
        bySeverity: stats.bySeverity
      },
      patterns: stats.topPatterns,
      recentSamples: recentErrors.slice(-5).map(err => ({
        id: err.id,
        timestamp: err.timestamp,
        type: err.type,
        message: err.message,
        component: err.component,
        severity: err.severity
      }))
    };
    
    return report;
  }

  /**
   * Persist error to storage
   */
  async persistError(errorEntry) {
    if (!this.config.persistenceProvider) {
      return;
    }
    
    try {
      await this.config.persistenceProvider.store(errorEntry);
    } catch (persistError) {
      console.log(`⚠️ Failed to persist error: ${persistError.message}`);
    }
  }

  /**
   * Start periodic aggregation
   */
  startAggregation() {
    setInterval(() => {
      this.performAggregation();
    }, this.config.aggregationWindow);
  }

  /**
   * Perform periodic aggregation
   */
  performAggregation() {
    // Clean up old errors
    const cutoff = Date.now() - (this.config.maxErrorHistory * this.config.aggregationWindow);
    this.errors = this.errors.filter(error => 
      new Date(error.timestamp).getTime() > cutoff
    );
    
    // Update metrics
    this.updateTimeBasedMetrics();
    
    // Log aggregation summary
    const stats = this.getStatistics();
    console.log(`📊 Error aggregation: ${stats.recent} recent errors, rate: ${stats.recentErrorRate.toFixed(2)}/s`);
  }

  /**
   * Mark error as resolved
   */
  markResolved(errorId, resolution = {}) {
    const error = this.errors.find(err => err.id === errorId);
    if (error) {
      error.resolved = true;
      error.resolution = {
        timestamp: new Date().toISOString(),
        resolvedBy: resolution.resolvedBy,
        method: resolution.method,
        notes: resolution.notes
      };
      
      console.log(`✅ Error ${errorId} marked as resolved`);
    }
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    const stats = this.getStatistics();
    const criticalErrors = stats.bySeverity[ErrorSeverity.CRITICAL] || 0;
    const highErrors = stats.bySeverity[ErrorSeverity.HIGH] || 0;
    
    let status = 'HEALTHY';
    
    if (criticalErrors > 0) {
      status = 'CRITICAL';
    } else if (highErrors > 5 || stats.recentErrorRate > 1) {
      status = 'DEGRADED';
    } else if (stats.recent > 10) {
      status = 'WARNING';
    }
    
    return {
      status,
      errorRate: stats.recentErrorRate,
      recentErrors: stats.recent,
      criticalErrors,
      highErrors,
      topIssues: stats.topPatterns.slice(0, 3)
    };
  }

  /**
   * Clear all errors
   */
  clear() {
    this.errors = [];
    this.errorCounts.clear();
    this.errorPatterns.clear();
    this.metrics = {
      totalErrors: 0,
      errorsByType: {},
      errorsByCategory: {},
      errorsBySeverity: {},
      errorsByComponent: {},
      errorsByTimeWindow: {},
      recentErrorRate: 0,
      averageErrorRate: 0
    };
    
    console.log(`🧹 Error tracker cleared`);
  }
}

export default ErrorTracker;

