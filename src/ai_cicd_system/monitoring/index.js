/**
 * @fileoverview Monitoring System Integration
 * @description Main entry point for the comprehensive monitoring and observability system
 */

import SystemMonitor from './system_monitor.js';
import PerformanceTracker from './performance_tracker.js';
import MetricsCollector from './metrics_collector.js';
import DashboardGenerator from './dashboard_generator.js';
import DistributedTracer from '../observability/tracer.js';
import EnhancedLogger from '../observability/logger.js';
import PerformanceAnalyzer from '../analytics/performance_analyzer.js';

/**
 * Comprehensive monitoring and observability system
 */
export class MonitoringSystem {
    constructor(config = {}) {
        this.config = {
            service_name: config.service_name || 'ai-cicd-system',
            enable_all: config.enable_all !== false,
            ...config
        };

        // Initialize all components
        this.systemMonitor = new SystemMonitor(this.config);
        this.performanceTracker = new PerformanceTracker(this.config);
        this.metricsCollector = new MetricsCollector(this.config);
        this.dashboardGenerator = new DashboardGenerator(this.config);
        this.tracer = new DistributedTracer(this.config);
        this.logger = new EnhancedLogger(this.config);
        this.performanceAnalyzer = new PerformanceAnalyzer(this.config);

        this.isInitialized = false;
    }

    /**
     * Initialize the entire monitoring system
     */
    async initialize() {
        if (this.isInitialized) return;

        // Initialize all components
        await this.systemMonitor.initialize();
        
        this.isInitialized = true;
    }

    /**
     * Start monitoring
     */
    async start() {
        if (!this.isInitialized) {
            await this.initialize();
        }

        await this.systemMonitor.startMonitoring();
    }

    /**
     * Stop monitoring
     */
    async stop() {
        await this.systemMonitor.stopMonitoring();
    }

    /**
     * Get comprehensive system status
     */
    async getStatus() {
        return await this.systemMonitor.getSystemStatus();
    }

    /**
     * Get performance insights
     */
    async getInsights() {
        return await this.systemMonitor.getPerformanceInsights();
    }

    /**
     * Track operation
     */
    trackOperation(operationName, metadata = {}) {
        return this.systemMonitor.trackOperation(operationName, metadata);
    }

    /**
     * Export all monitoring data
     */
    async exportData(format = 'json') {
        return await this.systemMonitor.exportData(format);
    }

    /**
     * Get logger instance
     */
    getLogger() {
        return this.logger;
    }

    /**
     * Get tracer instance
     */
    getTracer() {
        return this.tracer;
    }

    /**
     * Get metrics collector instance
     */
    getMetricsCollector() {
        return this.metricsCollector;
    }

    /**
     * Get dashboard generator instance
     */
    getDashboardGenerator() {
        return this.dashboardGenerator;
    }
}

/**
 * Create a monitoring system instance
 */
export function createMonitoringSystem(config = {}) {
    return new MonitoringSystem(config);
}

/**
 * Default monitoring system instance
 */
let defaultMonitoringSystem = null;

/**
 * Get or create default monitoring system
 */
export function getDefaultMonitoringSystem(config = {}) {
    if (!defaultMonitoringSystem) {
        defaultMonitoringSystem = new MonitoringSystem(config);
    }
    return defaultMonitoringSystem;
}

// Export all components
export {
    SystemMonitor,
    PerformanceTracker,
    MetricsCollector,
    DashboardGenerator,
    DistributedTracer,
    EnhancedLogger,
    PerformanceAnalyzer
};

export default MonitoringSystem;

