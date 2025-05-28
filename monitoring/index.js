/**
 * Monitoring System Entry Point
 * Comprehensive monitoring and analytics system for Task Master
 */

import { MetricsCollector } from './core/metrics-collector.js';
import { AnalyticsEngine } from './core/analytics-engine.js';
import { DashboardServer } from './dashboard/dashboard-server.js';
import { MonitoringConfig } from './core/monitoring-config.js';

export class MonitoringSystem {
  constructor(config = MonitoringConfig) {
    this.config = config;
    this.metricsCollector = null;
    this.analyticsEngine = null;
    this.dashboardServer = null;
    this.isRunning = false;
  }

  /**
   * Initialize and start the complete monitoring system
   */
  async start(options = {}) {
    if (this.isRunning) {
      throw new Error('Monitoring system is already running');
    }

    console.log('🚀 Initializing comprehensive monitoring system...');

    try {
      // Initialize metrics collector
      this.metricsCollector = new MetricsCollector(this.config);
      await this.metricsCollector.start();

      // Initialize analytics engine
      this.analyticsEngine = new AnalyticsEngine(this.metricsCollector);

      // Initialize dashboard server if enabled
      if (options.enableDashboard !== false) {
        this.dashboardServer = new DashboardServer(
          this.metricsCollector,
          this.analyticsEngine,
          {
            port: options.dashboardPort || 3001,
            host: options.dashboardHost || 'localhost'
          }
        );
        await this.dashboardServer.start();
      }

      this.isRunning = true;
      
      console.log('✅ Monitoring system started successfully');
      console.log(`📊 Dashboard available at: http://localhost:${options.dashboardPort || 3001}`);
      
      // Setup graceful shutdown
      this.setupGracefulShutdown();

      return {
        success: true,
        metricsCollector: this.metricsCollector,
        analyticsEngine: this.analyticsEngine,
        dashboardServer: this.dashboardServer
      };
    } catch (error) {
      console.error('❌ Failed to start monitoring system:', error);
      await this.stop();
      throw error;
    }
  }

  /**
   * Stop the monitoring system
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    console.log('🛑 Stopping monitoring system...');

    try {
      // Stop dashboard server
      if (this.dashboardServer) {
        await this.dashboardServer.stop();
        this.dashboardServer = null;
      }

      // Stop metrics collector
      if (this.metricsCollector) {
        await this.metricsCollector.stop();
        this.metricsCollector = null;
      }

      this.analyticsEngine = null;
      this.isRunning = false;

      console.log('✅ Monitoring system stopped successfully');
    } catch (error) {
      console.error('❌ Error stopping monitoring system:', error);
      throw error;
    }
  }

  /**
   * Get system status
   */
  async getStatus() {
    if (!this.isRunning) {
      return {
        status: 'stopped',
        timestamp: Date.now()
      };
    }

    try {
      const [performanceMetrics, systemMetrics, workflowMetrics, alertStats] = await Promise.all([
        this.metricsCollector.getAggregatedMetrics('performance', 'latest', '5m'),
        this.metricsCollector.getAggregatedMetrics('system', 'latest', '5m'),
        this.metricsCollector.getAggregatedMetrics('workflow', 'latest', '5m'),
        this.metricsCollector.alertManager.getAlertStats()
      ]);

      return {
        status: 'running',
        timestamp: Date.now(),
        uptime: Date.now() - this.metricsCollector.startTime,
        metrics: {
          performance: performanceMetrics,
          system: systemMetrics,
          workflow: workflowMetrics
        },
        alerts: alertStats,
        storage: this.metricsCollector.storage.getStorageStats(),
        dashboard: this.dashboardServer ? {
          url: `http://localhost:${this.dashboardServer.config.port}`,
          connected_clients: this.dashboardServer.connectedClients.size
        } : null
      };
    } catch (error) {
      console.error('Error getting system status:', error);
      return {
        status: 'error',
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Generate a comprehensive report
   */
  async generateReport(type = 'comprehensive', timeRange = '24h', options = {}) {
    if (!this.isRunning || !this.analyticsEngine) {
      throw new Error('Monitoring system is not running');
    }

    return await this.analyticsEngine.generateReport(type, timeRange, options);
  }

  /**
   * Track a custom event
   */
  async trackEvent(eventType, metadata = {}) {
    if (!this.isRunning || !this.metricsCollector) {
      console.warn('Monitoring system not running, event not tracked:', eventType);
      return;
    }

    await this.metricsCollector.trackEvent(eventType, metadata);
  }

  /**
   * Get metrics for a specific type and time range
   */
  async getMetrics(type, timeRange = '1h') {
    if (!this.isRunning || !this.metricsCollector) {
      throw new Error('Monitoring system is not running');
    }

    return await this.metricsCollector.getMetrics(type, timeRange);
  }

  /**
   * Get active alerts
   */
  getActiveAlerts() {
    if (!this.isRunning || !this.metricsCollector) {
      return [];
    }

    return this.metricsCollector.alertManager.getActiveAlerts();
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      console.log(`\n📡 Received ${signal}, shutting down monitoring system gracefully...`);
      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // For nodemon
  }

  /**
   * Health check endpoint
   */
  async healthCheck() {
    if (!this.isRunning) {
      return {
        healthy: false,
        status: 'stopped',
        timestamp: Date.now()
      };
    }

    try {
      // Perform basic health checks
      const checks = {
        metrics_collector: this.metricsCollector?.isRunning || false,
        storage: this.metricsCollector?.storage?.initialized || false,
        alert_manager: this.metricsCollector?.alertManager?.initialized || false,
        dashboard: this.dashboardServer ? true : false
      };

      const healthy = Object.values(checks).every(check => check === true);

      return {
        healthy,
        status: healthy ? 'healthy' : 'degraded',
        checks,
        timestamp: Date.now(),
        uptime: Date.now() - this.metricsCollector.startTime
      };
    } catch (error) {
      return {
        healthy: false,
        status: 'error',
        error: error.message,
        timestamp: Date.now()
      };
    }
  }
}

// Export the main monitoring system
export default MonitoringSystem;

// Export individual components for advanced usage
export {
  MetricsCollector,
  AnalyticsEngine,
  DashboardServer,
  MonitoringConfig
};

