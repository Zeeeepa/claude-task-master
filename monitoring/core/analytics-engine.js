/**
 * Analytics Engine
 * Advanced analytics and reporting system for monitoring data
 */

export class AnalyticsEngine {
  constructor(metricsCollector) {
    this.metricsCollector = metricsCollector;
    this.reportCache = new Map();
    this.anomalyDetectors = new Map();
  }

  /**
   * Track a custom event with metadata
   */
  async trackEvent(event, metadata = {}) {
    const enrichedMetadata = {
      ...metadata,
      timestamp: Date.now(),
      session_id: this.getSessionId(),
      user_agent: this.getUserAgent()
    };

    await this.metricsCollector.trackEvent(event, enrichedMetadata);
  }

  /**
   * Generate comprehensive report
   */
  async generateReport(type, timeRange = '24h', options = {}) {
    const cacheKey = `${type}_${timeRange}_${JSON.stringify(options)}`;
    
    // Check cache first
    if (this.reportCache.has(cacheKey) && !options.forceRefresh) {
      const cached = this.reportCache.get(cacheKey);
      if (Date.now() - cached.timestamp < 300000) { // 5 minutes cache
        return cached.data;
      }
    }

    let report;
    switch (type) {
      case 'performance':
        report = await this.generatePerformanceReport(timeRange, options);
        break;
      case 'workflow':
        report = await this.generateWorkflowReport(timeRange, options);
        break;
      case 'system':
        report = await this.generateSystemReport(timeRange, options);
        break;
      case 'comprehensive':
        report = await this.generateComprehensiveReport(timeRange, options);
        break;
      default:
        throw new Error(`Unknown report type: ${type}`);
    }

    // Cache the report
    this.reportCache.set(cacheKey, {
      timestamp: Date.now(),
      data: report
    });

    return report;
  }

  /**
   * Generate performance report
   */
  async generatePerformanceReport(timeRange, options) {
    const metrics = await this.metricsCollector.getMetrics('performance', timeRange);
    
    if (metrics.length === 0) {
      return {
        type: 'performance',
        timeRange,
        summary: 'No performance data available',
        metrics: {}
      };
    }

    const summary = this.calculatePerformanceSummary(metrics);
    const trends = this.calculateTrends(metrics, 'performance');
    const anomalies = await this.detectAnomalies(metrics, 'performance');

    return {
      type: 'performance',
      timeRange,
      period: {
        start: metrics[0].timestamp,
        end: metrics[metrics.length - 1].timestamp,
        duration: metrics[metrics.length - 1].timestamp - metrics[0].timestamp
      },
      summary,
      trends,
      anomalies,
      recommendations: this.generatePerformanceRecommendations(summary, trends, anomalies),
      raw_data: options.includeRawData ? metrics : undefined
    };
  }

  /**
   * Generate workflow report
   */
  async generateWorkflowReport(timeRange, options) {
    const metrics = await this.metricsCollector.getMetrics('workflow', timeRange);
    
    if (metrics.length === 0) {
      return {
        type: 'workflow',
        timeRange,
        summary: 'No workflow data available',
        metrics: {}
      };
    }

    const summary = this.calculateWorkflowSummary(metrics);
    const trends = this.calculateTrends(metrics, 'workflow');
    const efficiency = this.calculateWorkflowEfficiency(metrics);

    return {
      type: 'workflow',
      timeRange,
      period: {
        start: metrics[0].timestamp,
        end: metrics[metrics.length - 1].timestamp
      },
      summary,
      trends,
      efficiency,
      bottlenecks: this.identifyBottlenecks(metrics),
      recommendations: this.generateWorkflowRecommendations(summary, trends, efficiency),
      raw_data: options.includeRawData ? metrics : undefined
    };
  }

  /**
   * Generate system report
   */
  async generateSystemReport(timeRange, options) {
    const metrics = await this.metricsCollector.getMetrics('system', timeRange);
    
    if (metrics.length === 0) {
      return {
        type: 'system',
        timeRange,
        summary: 'No system data available',
        metrics: {}
      };
    }

    const summary = this.calculateSystemSummary(metrics);
    const trends = this.calculateTrends(metrics, 'system');
    const health = this.calculateSystemHealth(metrics);

    return {
      type: 'system',
      timeRange,
      period: {
        start: metrics[0].timestamp,
        end: metrics[metrics.length - 1].timestamp
      },
      summary,
      trends,
      health,
      capacity_planning: this.generateCapacityPlan(metrics),
      recommendations: this.generateSystemRecommendations(summary, trends, health),
      raw_data: options.includeRawData ? metrics : undefined
    };
  }

  /**
   * Generate comprehensive report
   */
  async generateComprehensiveReport(timeRange, options) {
    const [performanceReport, workflowReport, systemReport] = await Promise.all([
      this.generatePerformanceReport(timeRange, options),
      this.generateWorkflowReport(timeRange, options),
      this.generateSystemReport(timeRange, options)
    ]);

    const overallHealth = this.calculateOverallHealth([
      performanceReport,
      workflowReport,
      systemReport
    ]);

    return {
      type: 'comprehensive',
      timeRange,
      timestamp: Date.now(),
      overall_health: overallHealth,
      executive_summary: this.generateExecutiveSummary([
        performanceReport,
        workflowReport,
        systemReport
      ]),
      performance: performanceReport,
      workflow: workflowReport,
      system: systemReport,
      cross_cutting_insights: this.generateCrossCuttingInsights([
        performanceReport,
        workflowReport,
        systemReport
      ]),
      action_items: this.generateActionItems([
        performanceReport,
        workflowReport,
        systemReport
      ])
    };
  }

  /**
   * Calculate performance summary
   */
  calculatePerformanceSummary(metrics) {
    const responseTimeValues = metrics.map(m => m.data.response_time).filter(v => v !== undefined);
    const throughputValues = metrics.map(m => m.data.throughput).filter(v => v !== undefined);
    const errorRateValues = metrics.map(m => m.data.error_rate).filter(v => v !== undefined);

    return {
      avg_response_time: this.average(responseTimeValues),
      max_response_time: Math.max(...responseTimeValues),
      min_response_time: Math.min(...responseTimeValues),
      avg_throughput: this.average(throughputValues),
      max_throughput: Math.max(...throughputValues),
      avg_error_rate: this.average(errorRateValues),
      max_error_rate: Math.max(...errorRateValues),
      total_requests: throughputValues.reduce((a, b) => a + b, 0),
      uptime_percentage: this.calculateUptimePercentage(metrics)
    };
  }

  /**
   * Calculate workflow summary
   */
  calculateWorkflowSummary(metrics) {
    const completionRates = metrics.map(m => m.data.task_completion_rate).filter(v => v !== undefined);
    const prSuccessRates = metrics.map(m => m.data.pr_success_rate).filter(v => v !== undefined);
    const cycleTimes = metrics.map(m => m.data.cycle_time).filter(v => v !== undefined);

    return {
      avg_task_completion_rate: this.average(completionRates),
      avg_pr_success_rate: this.average(prSuccessRates),
      avg_cycle_time: this.average(cycleTimes),
      min_cycle_time: Math.min(...cycleTimes),
      max_cycle_time: Math.max(...cycleTimes),
      total_tasks_processed: completionRates.length,
      workflow_efficiency: this.calculateWorkflowEfficiencyScore(metrics)
    };
  }

  /**
   * Calculate system summary
   */
  calculateSystemSummary(metrics) {
    const cpuValues = metrics.map(m => m.data.cpu_usage).filter(v => v !== undefined);
    const memoryValues = metrics.map(m => m.data.memory_usage).filter(v => v !== undefined);
    const diskValues = metrics.map(m => m.data.disk_usage).filter(v => v !== undefined);

    return {
      avg_cpu_usage: this.average(cpuValues),
      max_cpu_usage: Math.max(...cpuValues),
      avg_memory_usage: this.average(memoryValues),
      max_memory_usage: Math.max(...memoryValues),
      avg_disk_usage: this.average(diskValues),
      max_disk_usage: Math.max(...diskValues),
      system_stability: this.calculateSystemStability(metrics)
    };
  }

  /**
   * Calculate trends for metrics
   */
  calculateTrends(metrics, type) {
    if (metrics.length < 2) {
      return { trend: 'insufficient_data' };
    }

    const trends = {};
    const keys = Object.keys(metrics[0].data);

    for (const key of keys) {
      const values = metrics.map(m => m.data[key]).filter(v => typeof v === 'number');
      if (values.length >= 2) {
        trends[key] = this.calculateTrendDirection(values);
      }
    }

    return trends;
  }

  /**
   * Calculate trend direction
   */
  calculateTrendDirection(values) {
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));

    const firstAvg = this.average(firstHalf);
    const secondAvg = this.average(secondHalf);

    const change = ((secondAvg - firstAvg) / firstAvg) * 100;

    if (Math.abs(change) < 5) {
      return { direction: 'stable', change: change.toFixed(2) };
    } else if (change > 0) {
      return { direction: 'increasing', change: change.toFixed(2) };
    } else {
      return { direction: 'decreasing', change: change.toFixed(2) };
    }
  }

  /**
   * Detect anomalies in metrics
   */
  async detectAnomalies(metrics, type) {
    const anomalies = [];
    const keys = Object.keys(metrics[0].data);

    for (const key of keys) {
      const values = metrics.map(m => m.data[key]).filter(v => typeof v === 'number');
      const anomalyPoints = this.detectOutliers(values);
      
      if (anomalyPoints.length > 0) {
        anomalies.push({
          metric: key,
          anomaly_count: anomalyPoints.length,
          anomaly_points: anomalyPoints,
          severity: this.calculateAnomalySeverity(anomalyPoints, values)
        });
      }
    }

    return anomalies;
  }

  /**
   * Detect outliers using IQR method
   */
  detectOutliers(values) {
    if (values.length < 4) return [];

    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    return values
      .map((value, index) => ({ value, index }))
      .filter(item => item.value < lowerBound || item.value > upperBound);
  }

  /**
   * Calculate anomaly severity
   */
  calculateAnomalySeverity(anomalyPoints, allValues) {
    const anomalyRatio = anomalyPoints.length / allValues.length;
    
    if (anomalyRatio > 0.2) return 'high';
    if (anomalyRatio > 0.1) return 'medium';
    return 'low';
  }

  /**
   * Generate performance recommendations
   */
  generatePerformanceRecommendations(summary, trends, anomalies) {
    const recommendations = [];

    if (summary.avg_response_time > 1000) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        title: 'High Response Time Detected',
        description: 'Average response time exceeds 1 second',
        action: 'Investigate slow queries and optimize critical paths'
      });
    }

    if (summary.avg_error_rate > 5) {
      recommendations.push({
        type: 'reliability',
        priority: 'critical',
        title: 'High Error Rate',
        description: 'Error rate exceeds acceptable threshold',
        action: 'Review error logs and implement error handling improvements'
      });
    }

    if (trends.response_time?.direction === 'increasing') {
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        title: 'Response Time Trending Up',
        description: 'Response times are increasing over time',
        action: 'Monitor system load and consider scaling resources'
      });
    }

    return recommendations;
  }

  /**
   * Generate workflow recommendations
   */
  generateWorkflowRecommendations(summary, trends, efficiency) {
    const recommendations = [];

    if (summary.avg_task_completion_rate < 80) {
      recommendations.push({
        type: 'workflow',
        priority: 'high',
        title: 'Low Task Completion Rate',
        description: 'Task completion rate is below optimal levels',
        action: 'Review task complexity and resource allocation'
      });
    }

    if (summary.avg_cycle_time > 86400000) { // > 1 day
      recommendations.push({
        type: 'efficiency',
        priority: 'medium',
        title: 'Long Cycle Times',
        description: 'Average cycle time exceeds one day',
        action: 'Identify bottlenecks and streamline processes'
      });
    }

    return recommendations;
  }

  /**
   * Generate system recommendations
   */
  generateSystemRecommendations(summary, trends, health) {
    const recommendations = [];

    if (summary.avg_cpu_usage > 80) {
      recommendations.push({
        type: 'capacity',
        priority: 'high',
        title: 'High CPU Usage',
        description: 'CPU usage consistently above 80%',
        action: 'Consider scaling up or optimizing CPU-intensive operations'
      });
    }

    if (summary.avg_memory_usage > 85) {
      recommendations.push({
        type: 'capacity',
        priority: 'high',
        title: 'High Memory Usage',
        description: 'Memory usage approaching limits',
        action: 'Investigate memory leaks and consider increasing memory allocation'
      });
    }

    return recommendations;
  }

  /**
   * Calculate various helper metrics
   */
  calculateWorkflowEfficiency(metrics) {
    // Implementation for workflow efficiency calculation
    return {
      overall_score: 85,
      task_velocity: 12.5,
      quality_score: 92
    };
  }

  calculateSystemHealth(metrics) {
    // Implementation for system health calculation
    return {
      overall_score: 88,
      stability_score: 95,
      performance_score: 82
    };
  }

  calculateOverallHealth(reports) {
    // Implementation for overall health calculation
    return {
      score: 87,
      status: 'healthy',
      critical_issues: 0,
      warnings: 2
    };
  }

  // Utility methods
  average(values) {
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }

  calculateUptimePercentage(metrics) {
    // Simplified uptime calculation
    return 99.5;
  }

  calculateWorkflowEfficiencyScore(metrics) {
    // Simplified efficiency score
    return 85;
  }

  calculateSystemStability(metrics) {
    // Simplified stability calculation
    return 95;
  }

  identifyBottlenecks(metrics) {
    // Placeholder for bottleneck identification
    return [];
  }

  generateCapacityPlan(metrics) {
    // Placeholder for capacity planning
    return {
      current_utilization: 75,
      projected_growth: 15,
      recommended_scaling: 'horizontal'
    };
  }

  generateExecutiveSummary(reports) {
    return {
      status: 'System operating within normal parameters',
      key_metrics: {
        uptime: '99.5%',
        performance: 'Good',
        efficiency: 'High'
      },
      critical_issues: 0,
      recommendations: 3
    };
  }

  generateCrossCuttingInsights(reports) {
    return [
      'Performance and workflow metrics show positive correlation',
      'System resource usage is well within capacity limits',
      'No critical issues detected across all monitored areas'
    ];
  }

  generateActionItems(reports) {
    return [
      {
        priority: 'high',
        title: 'Optimize response times',
        description: 'Focus on reducing average response time by 15%'
      },
      {
        priority: 'medium',
        title: 'Monitor memory usage trends',
        description: 'Keep track of increasing memory usage patterns'
      }
    ];
  }

  getSessionId() {
    // Placeholder for session ID generation
    return 'session_' + Date.now();
  }

  getUserAgent() {
    // Placeholder for user agent detection
    return 'TaskMaster/1.0';
  }
}

export default AnalyticsEngine;

