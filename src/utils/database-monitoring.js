/**
 * Database Monitoring and Health Check Utilities
 * Comprehensive monitoring tools for the Cloudflare database proxy
 */

import { CloudflareProxyClient } from '../database/cloudflare-proxy-client.js';
import { getConfig } from '../../config/database-proxy.js';

export class DatabaseMonitor {
  constructor(options = {}) {
    this.config = { ...getConfig(), ...options };
    this.client = new CloudflareProxyClient(this.config);
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastHealthCheck: null,
      uptime: 0,
      startTime: Date.now(),
    };
    this.healthHistory = [];
    this.isMonitoring = false;
  }

  /**
   * Start continuous monitoring
   */
  startMonitoring(interval = 30000) {
    if (this.isMonitoring) {
      console.warn('Monitoring is already running');
      return;
    }

    this.isMonitoring = true;
    console.log('🔍 Starting database monitoring...');

    // Health check interval
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, interval);

    // Metrics collection interval
    this.metricsInterval = setInterval(() => {
      this.updateMetrics();
    }, 60000); // Every minute

    // Initial health check
    this.performHealthCheck();
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    console.log('🛑 Database monitoring stopped');
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck() {
    const startTime = Date.now();
    const healthCheck = {
      timestamp: new Date().toISOString(),
      status: 'unknown',
      responseTime: 0,
      details: {},
    };

    try {
      // Basic connectivity test
      const connectivityResult = await this.testConnectivity();
      healthCheck.details.connectivity = connectivityResult;

      // Query performance test
      const performanceResult = await this.testQueryPerformance();
      healthCheck.details.performance = performanceResult;

      // Rate limiting test
      const rateLimitResult = await this.testRateLimiting();
      healthCheck.details.rateLimit = rateLimitResult;

      // Connection pool test
      const poolResult = await this.testConnectionPool();
      healthCheck.details.connectionPool = poolResult;

      // Determine overall health status
      const allTestsPassed = [
        connectivityResult.success,
        performanceResult.success,
        rateLimitResult.success,
        poolResult.success,
      ].every(Boolean);

      healthCheck.status = allTestsPassed ? 'healthy' : 'unhealthy';
      healthCheck.responseTime = Date.now() - startTime;

      // Update metrics
      this.metrics.lastHealthCheck = healthCheck.timestamp;
      this.metrics.totalRequests++;
      
      if (allTestsPassed) {
        this.metrics.successfulRequests++;
      } else {
        this.metrics.failedRequests++;
      }

      // Store health history (keep last 100 checks)
      this.healthHistory.push(healthCheck);
      if (this.healthHistory.length > 100) {
        this.healthHistory.shift();
      }

      // Log health status
      const statusEmoji = allTestsPassed ? '✅' : '❌';
      console.log(`${statusEmoji} Health check: ${healthCheck.status} (${healthCheck.responseTime}ms)`);

      // Trigger alerts if unhealthy
      if (!allTestsPassed) {
        await this.triggerAlert(healthCheck);
      }

      return healthCheck;

    } catch (error) {
      healthCheck.status = 'error';
      healthCheck.responseTime = Date.now() - startTime;
      healthCheck.details.error = error.message;

      this.metrics.totalRequests++;
      this.metrics.failedRequests++;

      console.error('❌ Health check failed:', error.message);
      await this.triggerAlert(healthCheck);

      return healthCheck;
    }
  }

  /**
   * Test basic connectivity
   */
  async testConnectivity() {
    try {
      const startTime = Date.now();
      const result = await this.client.query('SELECT 1 as connectivity_test');
      const responseTime = Date.now() - startTime;

      return {
        success: result.success && result.data[0].connectivity_test === 1,
        responseTime,
        details: 'Basic connectivity test passed',
      };
    } catch (error) {
      return {
        success: false,
        responseTime: 0,
        details: `Connectivity test failed: ${error.message}`,
      };
    }
  }

  /**
   * Test query performance
   */
  async testQueryPerformance() {
    const tests = [
      {
        name: 'Simple SELECT',
        query: 'SELECT NOW() as current_time',
        expectedMaxTime: 1000, // 1 second
      },
      {
        name: 'COUNT query',
        query: 'SELECT COUNT(*) as table_count FROM information_schema.tables',
        expectedMaxTime: 2000, // 2 seconds
      },
    ];

    const results = [];

    for (const test of tests) {
      try {
        const startTime = Date.now();
        const result = await this.client.query(test.query);
        const responseTime = Date.now() - startTime;

        results.push({
          name: test.name,
          success: result.success && responseTime <= test.expectedMaxTime,
          responseTime,
          expectedMaxTime: test.expectedMaxTime,
        });
      } catch (error) {
        results.push({
          name: test.name,
          success: false,
          responseTime: 0,
          error: error.message,
        });
      }
    }

    const allPassed = results.every(r => r.success);
    const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;

    return {
      success: allPassed,
      averageResponseTime: avgResponseTime,
      tests: results,
    };
  }

  /**
   * Test rate limiting behavior
   */
  async testRateLimiting() {
    try {
      // Make a few rapid requests to test rate limiting doesn't block normal usage
      const promises = Array(5).fill().map(() => 
        this.client.query('SELECT 1 as rate_limit_test')
      );

      const results = await Promise.all(promises);
      const allSuccessful = results.every(r => r.success);

      return {
        success: allSuccessful,
        details: `Completed ${results.length} concurrent requests`,
        requestCount: results.length,
      };
    } catch (error) {
      return {
        success: false,
        details: `Rate limiting test failed: ${error.message}`,
      };
    }
  }

  /**
   * Test connection pool behavior
   */
  async testConnectionPool() {
    try {
      // Test multiple concurrent connections
      const connectionTests = Array(10).fill().map(async (_, index) => {
        const startTime = Date.now();
        const result = await this.client.query(`SELECT ${index} as connection_test`);
        const responseTime = Date.now() - startTime;
        
        return {
          index,
          success: result.success,
          responseTime,
        };
      });

      const results = await Promise.all(connectionTests);
      const successfulConnections = results.filter(r => r.success).length;
      const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;

      return {
        success: successfulConnections >= 8, // Allow 2 failures out of 10
        totalConnections: results.length,
        successfulConnections,
        averageResponseTime: avgResponseTime,
        details: `${successfulConnections}/${results.length} connections successful`,
      };
    } catch (error) {
      return {
        success: false,
        details: `Connection pool test failed: ${error.message}`,
      };
    }
  }

  /**
   * Update metrics
   */
  updateMetrics() {
    const now = Date.now();
    this.metrics.uptime = now - this.metrics.startTime;

    // Calculate average response time from recent health checks
    const recentChecks = this.healthHistory.slice(-10);
    if (recentChecks.length > 0) {
      this.metrics.averageResponseTime = recentChecks.reduce(
        (sum, check) => sum + check.responseTime, 0
      ) / recentChecks.length;
    }

    // Log metrics periodically
    if (this.config.MONITORING.enableMetrics) {
      console.log('📊 Database Metrics:', {
        uptime: Math.round(this.metrics.uptime / 1000) + 's',
        totalRequests: this.metrics.totalRequests,
        successRate: this.getSuccessRate() + '%',
        avgResponseTime: Math.round(this.metrics.averageResponseTime) + 'ms',
      });
    }
  }

  /**
   * Trigger alert for unhealthy status
   */
  async triggerAlert(healthCheck) {
    const alert = {
      timestamp: healthCheck.timestamp,
      severity: healthCheck.status === 'error' ? 'critical' : 'warning',
      message: `Database proxy health check failed: ${healthCheck.status}`,
      details: healthCheck.details,
      responseTime: healthCheck.responseTime,
    };

    // Log alert
    console.error('🚨 ALERT:', alert);

    // Send to external monitoring service if configured
    if (this.config.MONITORING.alertWebhook) {
      try {
        await fetch(this.config.MONITORING.alertWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(alert),
        });
      } catch (error) {
        console.error('Failed to send alert webhook:', error.message);
      }
    }

    // Store alert in history
    if (!this.alertHistory) {
      this.alertHistory = [];
    }
    this.alertHistory.push(alert);
    
    // Keep only last 50 alerts
    if (this.alertHistory.length > 50) {
      this.alertHistory.shift();
    }
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.getSuccessRate(),
      healthHistory: this.healthHistory.slice(-10), // Last 10 checks
      alertHistory: this.alertHistory?.slice(-10) || [], // Last 10 alerts
      isMonitoring: this.isMonitoring,
    };
  }

  /**
   * Calculate success rate
   */
  getSuccessRate() {
    if (this.metrics.totalRequests === 0) return 100;
    return Math.round((this.metrics.successfulRequests / this.metrics.totalRequests) * 100);
  }

  /**
   * Get health status summary
   */
  getHealthSummary() {
    const recentChecks = this.healthHistory.slice(-5);
    const recentlyHealthy = recentChecks.filter(check => check.status === 'healthy').length;
    
    let overallStatus = 'unknown';
    if (recentChecks.length === 0) {
      overallStatus = 'unknown';
    } else if (recentlyHealthy === recentChecks.length) {
      overallStatus = 'healthy';
    } else if (recentlyHealthy >= recentChecks.length / 2) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'unhealthy';
    }

    return {
      status: overallStatus,
      lastCheck: this.metrics.lastHealthCheck,
      successRate: this.getSuccessRate(),
      averageResponseTime: Math.round(this.metrics.averageResponseTime),
      uptime: Math.round(this.metrics.uptime / 1000),
      recentChecks: recentChecks.length,
      recentlyHealthy,
    };
  }

  /**
   * Generate health report
   */
  generateHealthReport() {
    const summary = this.getHealthSummary();
    const metrics = this.getMetrics();

    return {
      timestamp: new Date().toISOString(),
      summary,
      metrics,
      configuration: {
        proxyUrl: this.config.PROXY_URL,
        monitoringEnabled: this.isMonitoring,
        healthCheckInterval: this.config.FAILOVER?.healthCheckInterval || 'N/A',
      },
      recommendations: this.generateRecommendations(summary, metrics),
    };
  }

  /**
   * Generate recommendations based on health data
   */
  generateRecommendations(summary, metrics) {
    const recommendations = [];

    if (summary.successRate < 95) {
      recommendations.push({
        type: 'warning',
        message: 'Success rate is below 95%. Consider investigating connection issues.',
      });
    }

    if (summary.averageResponseTime > 5000) {
      recommendations.push({
        type: 'warning',
        message: 'Average response time is high. Consider optimizing queries or scaling infrastructure.',
      });
    }

    if (summary.status === 'unhealthy') {
      recommendations.push({
        type: 'critical',
        message: 'Database proxy is unhealthy. Immediate attention required.',
      });
    }

    if (metrics.alertHistory?.length > 5) {
      recommendations.push({
        type: 'info',
        message: 'Multiple recent alerts detected. Review alert patterns for systemic issues.',
      });
    }

    return recommendations;
  }
}

/**
 * Singleton monitor instance
 */
let defaultMonitor = null;

export function getDefaultMonitor(options = {}) {
  if (!defaultMonitor) {
    defaultMonitor = new DatabaseMonitor(options);
  }
  return defaultMonitor;
}

/**
 * Convenience functions
 */
export async function performHealthCheck() {
  const monitor = getDefaultMonitor();
  return monitor.performHealthCheck();
}

export function startMonitoring(interval) {
  const monitor = getDefaultMonitor();
  return monitor.startMonitoring(interval);
}

export function stopMonitoring() {
  const monitor = getDefaultMonitor();
  return monitor.stopMonitoring();
}

export function getHealthSummary() {
  const monitor = getDefaultMonitor();
  return monitor.getHealthSummary();
}

export function generateHealthReport() {
  const monitor = getDefaultMonitor();
  return monitor.generateHealthReport();
}

