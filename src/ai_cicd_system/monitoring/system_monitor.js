/**
 * @fileoverview System Monitor
 * @description Comprehensive system monitoring and metrics collection with enhanced observability
 */

import { log } from '../../scripts/modules/utils.js';
import PerformanceTracker from './performance_tracker.js';
import MetricsCollector from './metrics_collector.js';
import DashboardGenerator from './dashboard_generator.js';
import DistributedTracer from '../observability/tracer.js';
import EnhancedLogger from '../observability/logger.js';
import PerformanceAnalyzer from '../analytics/performance_analyzer.js';

/**
 * Enhanced system monitor for comprehensive health tracking and metrics
 */
export class SystemMonitor {
    constructor(config = {}) {
        this.config = {
            enable_metrics: config.enable_metrics !== false,
            prometheus_port: config.prometheus_port || 8000,
            enable_real_time_updates: config.enable_real_time_updates !== false,
            health_check_interval: config.health_check_interval || 30000, // 30 seconds
            metrics_collection_interval: config.metrics_collection_interval || 60000, // 1 minute
            enable_performance_tracking: config.enable_performance_tracking !== false,
            enable_observability: config.enable_observability !== false,
            enable_analytics: config.enable_analytics !== false,
            enable_dashboards: config.enable_dashboards !== false,
            ...config
        };
        
        this.isMonitoring = false;
        this.healthCheckInterval = null;
        this.metricsInterval = null;
        this.systemMetrics = new Map();
        this.componentHealth = new Map();
        
        // Initialize enhanced components
        this.performanceTracker = new PerformanceTracker(this.config);
        this.metricsCollector = new MetricsCollector(this.config);
        this.dashboardGenerator = new DashboardGenerator(this.config);
        this.tracer = new DistributedTracer(this.config);
        this.logger = new EnhancedLogger(this.config);
        this.performanceAnalyzer = new PerformanceAnalyzer(this.config);
        this.alertManager = new AlertManager(this.config);
        
        // Set up event listeners for integration
        this._setupEventListeners();
    }

    /**
     * Initialize the enhanced system monitor
     */
    async initialize() {
        log('debug', 'Initializing enhanced system monitor...');
        
        if (!this.config.enable_metrics) {
            log('info', 'System monitoring disabled');
            return;
        }
        
        // Initialize all components
        await this.performanceTracker.initialize();
        await this.metricsCollector.initialize();
        await this.dashboardGenerator.initialize();
        await this.tracer.initialize();
        await this.logger.initialize();
        await this.performanceAnalyzer.initialize();
        await this.alertManager.initialize();
        
        // Generate default dashboards
        if (this.config.enable_dashboards) {
            this._generateDefaultDashboards();
        }
        
        log('debug', 'Enhanced system monitor initialized');
    }

    /**
     * Start comprehensive monitoring
     */
    async startMonitoring() {
        if (!this.config.enable_metrics || this.isMonitoring) {
            return;
        }
        
        const span = this.tracer.startTrace('system_monitor_start');
        const correlationId = this.tracer.getCorrelationId(span);
        const childLogger = this.logger.child(correlationId, { component: 'system_monitor' });
        
        childLogger.info('Starting comprehensive system monitoring...');
        
        this.isMonitoring = true;
        
        // Start all monitoring components
        await this.metricsCollector.startCollection();
        
        // Start health checks
        this.healthCheckInterval = setInterval(async () => {
            await this._performEnhancedHealthCheck();
        }, this.config.health_check_interval);
        
        // Start metrics collection
        this.metricsInterval = setInterval(async () => {
            await this._collectEnhancedMetrics();
        }, this.config.metrics_collection_interval);
        
        // Initial health check and metrics collection
        await this._performEnhancedHealthCheck();
        await this._collectEnhancedMetrics();
        
        this.tracer.finishSpan(span, { success: true });
        childLogger.info('Comprehensive system monitoring started');
    }

    /**
     * Stop monitoring
     */
    async stopMonitoring() {
        if (!this.isMonitoring) {
            return;
        }
        
        const span = this.tracer.startTrace('system_monitor_stop');
        const correlationId = this.tracer.getCorrelationId(span);
        const childLogger = this.logger.child(correlationId, { component: 'system_monitor' });
        
        childLogger.info('Stopping system monitoring...');
        
        this.isMonitoring = false;
        
        // Stop intervals
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
            this.metricsInterval = null;
        }
        
        // Stop collection
        await this.metricsCollector.stopCollection();
        
        // Cleanup components
        await this.logger.cleanup();
        
        this.tracer.finishSpan(span, { success: true });
        childLogger.info('System monitoring stopped');
    }

    /**
     * Track operation performance
     */
    trackOperation(operationName, metadata = {}) {
        const span = this.tracer.startSpan(operationName, null, metadata);
        const trackingData = this.performanceTracker.startTracking(operationName, metadata);
        
        return {
            span,
            trackingData,
            finish: (result = {}) => {
                this.tracer.finishSpan(span, result);
                this.performanceTracker.endTracking(operationName, result);
                
                // Add to performance analyzer
                this.performanceAnalyzer.addDataPoint({
                    type: metadata.type || 'operation',
                    operationId: operationName,
                    duration: result.duration || (Date.now() - trackingData.startTime),
                    metadata,
                    result
                });
            }
        };
    }

    /**
     * Get comprehensive system status
     */
    async getSystemStatus() {
        const span = this.tracer.startSpan('get_system_status');
        
        try {
            const status = {
                timestamp: new Date(),
                overall_health: 'healthy',
                components: {},
                metrics: this.metricsCollector.getCurrentMetrics(),
                performance: this.performanceTracker.getAnalytics(),
                analytics: this.performanceAnalyzer.generatePerformanceReport('1h'),
                active_alerts: this.alertManager.getActiveAlerts(),
                traces: this.tracer.getTraceStatistics(),
                uptime: process.uptime()
            };
            
            // Check component health
            for (const [component, health] of this.componentHealth) {
                status.components[component] = health;
                if (health.status !== 'healthy') {
                    status.overall_health = 'degraded';
                }
            }
            
            this.tracer.finishSpan(span, { success: true });
            return status;
        } catch (error) {
            this.tracer.finishSpan(span, { error });
            throw error;
        }
    }

    /**
     * Get performance insights and recommendations
     */
    async getPerformanceInsights() {
        const span = this.tracer.startSpan('get_performance_insights');
        
        try {
            const insights = {
                recommendations: this.performanceTracker.getPerformanceRecommendations(),
                analytics: this.performanceAnalyzer.generatePerformanceReport('24h'),
                bottlenecks: this.performanceAnalyzer.identifyBottlenecks(),
                anomalies: this.performanceAnalyzer.detectAnomalies(),
                predictions: this.performanceAnalyzer.generatePredictions(),
                capacity: this.performanceAnalyzer.generateCapacityPlanningInsights()
            };
            
            this.tracer.finishSpan(span, { success: true });
            return insights;
        } catch (error) {
            this.tracer.finishSpan(span, { error });
            throw error;
        }
    }

    /**
     * Export monitoring data
     */
    async exportData(format = 'json') {
        const span = this.tracer.startSpan('export_monitoring_data');
        
        try {
            const data = {
                metrics: this.metricsCollector.exportMetrics(format),
                traces: this.tracer.exportTraces(format),
                logs: this.logger.exportLogs(format),
                performance: this.performanceTracker.getAnalytics(),
                analytics: this.performanceAnalyzer.generatePerformanceReport()
            };
            
            this.tracer.finishSpan(span, { success: true });
            return data;
        } catch (error) {
            this.tracer.finishSpan(span, { error });
            throw error;
        }
    }

    /**
     * Private methods for enhanced functionality
     */
    _setupEventListeners() {
        // Performance tracker events
        this.performanceTracker.on('tracking_completed', (data) => {
            this.metricsCollector.recordMetric('operation_duration', data.duration, {
                operation: data.operationId,
                success: data.result.success
            });
        });
        
        // Metrics collector events
        this.metricsCollector.on('metric_recorded', (metric) => {
            this.logger.logEvent('metric_recorded', metric);
        });
        
        // Performance analyzer events
        this.performanceAnalyzer.on('anomalies_detected', (anomalies) => {
            anomalies.forEach(anomaly => {
                this.alertManager.fireAlert('performance_anomaly', {
                    severity: anomaly.severity,
                    message: `Performance anomaly detected in ${anomaly.operation}`,
                    data: anomaly
                });
            });
        });
        
        this.performanceAnalyzer.on('bottlenecks_identified', (bottlenecks) => {
            bottlenecks.forEach(bottleneck => {
                this.alertManager.fireAlert('performance_bottleneck', {
                    severity: bottleneck.severity,
                    message: `Performance bottleneck identified: ${bottleneck.type}`,
                    data: bottleneck
                });
            });
        });
    }

    async _performEnhancedHealthCheck() {
        const span = this.tracer.startSpan('health_check');
        
        try {
            // Check system resources
            const resourceUsage = this.performanceTracker._getCurrentResourceUsage();
            
            // Record resource metrics
            this.metricsCollector.recordGauge('memory_usage_bytes', resourceUsage.memory.heapUsed, { type: 'heap' });
            this.metricsCollector.recordGauge('memory_usage_bytes', resourceUsage.memory.rss, { type: 'rss' });
            this.metricsCollector.recordGauge('cpu_usage_microseconds', resourceUsage.cpu.user, { type: 'user' });
            this.metricsCollector.recordGauge('cpu_usage_microseconds', resourceUsage.cpu.system, { type: 'system' });
            
            // Update component health
            this._updateComponentHealth('system_monitor', 'healthy', {
                memory_usage: resourceUsage.memory.heapUsed,
                cpu_usage: resourceUsage.cpu.user + resourceUsage.cpu.system,
                uptime: resourceUsage.uptime
            });
            
            this.tracer.finishSpan(span, { success: true });
        } catch (error) {
            this.tracer.finishSpan(span, { error });
            this.logger.logError(error, { component: 'health_check' });
        }
    }

    async _collectEnhancedMetrics() {
        const span = this.tracer.startSpan('collect_metrics');
        
        try {
            // Trigger business metrics collection
            this.metricsCollector.emit('collect_business_metrics');
            
            // Get performance analytics
            const analytics = this.performanceTracker.getAnalytics('5m');
            
            // Record analytics as metrics
            if (analytics.summary.totalOperations > 0) {
                this.metricsCollector.recordGauge('avg_operation_duration', analytics.summary.avgDuration);
                this.metricsCollector.recordGauge('operation_success_rate', analytics.summary.successRate);
                this.metricsCollector.recordGauge('operation_error_rate', analytics.summary.errorRate);
            }
            
            this.tracer.finishSpan(span, { success: true });
        } catch (error) {
            this.tracer.finishSpan(span, { error });
            this.logger.logError(error, { component: 'metrics_collection' });
        }
    }

    _generateDefaultDashboards() {
        // Generate CI/CD dashboard
        this.dashboardGenerator.generateCICDDashboard(this.metricsCollector, this.performanceTracker);
        
        // Generate performance dashboard
        this.dashboardGenerator.generatePerformanceDashboard(this.performanceTracker);
        
        // Generate system health dashboard
        this.dashboardGenerator.generateSystemHealthDashboard(this);
    }

    _updateComponentHealth(component, status, metadata = {}) {
        this.componentHealth.set(component, {
            status,
            last_check: new Date(),
            metadata
        });
    }

    /**
     * Record system event
     * @param {string} eventType - Type of event
     * @param {Object} eventData - Event data
     */
    async recordEvent(eventType, eventData) {
        if (!this.config.enable_metrics) {
            return;
        }
        
        const event = {
            type: eventType,
            data: eventData,
            timestamp: new Date(),
            id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };
        
        // Store event
        if (!this.systemMetrics.has('events')) {
            this.systemMetrics.set('events', []);
        }
        
        const events = this.systemMetrics.get('events');
        events.push(event);
        
        // Keep only recent events (last 1000)
        if (events.length > 1000) {
            events.splice(0, events.length - 1000);
        }
        
        // Check for alerts
        await this.alertManager.checkEvent(event);
        
        log('debug', `Recorded system event: ${eventType}`);
    }

    /**
     * Record performance metric
     * @param {string} metricName - Metric name
     * @param {number} value - Metric value
     * @param {string} unit - Metric unit
     * @param {Object} tags - Metric tags
     */
    async recordMetric(metricName, value, unit = 'count', tags = {}) {
        if (!this.config.enable_performance_tracking) {
            return;
        }
        
        await this.performanceMetrics.recordMetric(metricName, value, unit, tags);
    }

    /**
     * Get system health status
     * @returns {Promise<Object>} System health
     */
    async getSystemHealth() {
        const overallHealth = {
            status: 'healthy',
            timestamp: new Date(),
            components: {},
            summary: {
                total_components: 0,
                healthy_components: 0,
                degraded_components: 0,
                unhealthy_components: 0
            }
        };
        
        // Aggregate component health
        for (const [componentName, health] of this.componentHealth) {
            overallHealth.components[componentName] = health;
            overallHealth.summary.total_components++;
            
            switch (health.status) {
                case 'healthy':
                    overallHealth.summary.healthy_components++;
                    break;
                case 'degraded':
                    overallHealth.summary.degraded_components++;
                    if (overallHealth.status === 'healthy') {
                        overallHealth.status = 'degraded';
                    }
                    break;
                case 'unhealthy':
                    overallHealth.summary.unhealthy_components++;
                    overallHealth.status = 'unhealthy';
                    break;
            }
        }
        
        return overallHealth;
    }

    /**
     * Get system metrics
     * @returns {Promise<Object>} System metrics
     */
    async getSystemMetrics() {
        const metrics = {
            timestamp: new Date(),
            system_metrics: {},
            performance_metrics: await this.performanceMetrics.getMetrics(),
            events: this.systemMetrics.get('events') || [],
            alerts: await this.alertManager.getActiveAlerts()
        };
        
        // Convert Map to object
        for (const [key, value] of this.systemMetrics) {
            metrics.system_metrics[key] = value;
        }
        
        return metrics;
    }

    /**
     * Get performance analytics
     * @param {Object} options - Analytics options
     * @returns {Promise<Object>} Performance analytics
     */
    async getPerformanceAnalytics(options = {}) {
        return await this.performanceMetrics.getAnalytics(options);
    }

    /**
     * Update component health
     * @param {string} componentName - Component name
     * @param {Object} healthData - Health data
     */
    async updateComponentHealth(componentName, healthData) {
        const health = {
            ...healthData,
            component: componentName,
            last_updated: new Date()
        };
        
        this.componentHealth.set(componentName, health);
        
        // Check for health-based alerts
        if (health.status !== 'healthy') {
            await this.alertManager.checkComponentHealth(componentName, health);
        }
    }

    /**
     * Get monitoring statistics
     * @returns {Promise<Object>} Monitoring statistics
     */
    async getStatistics() {
        const events = this.systemMetrics.get('events') || [];
        
        return {
            is_monitoring: this.isMonitoring,
            components_tracked: this.componentHealth.size,
            events_recorded: events.length,
            metrics_enabled: this.config.enable_metrics,
            performance_tracking_enabled: this.config.enable_performance_tracking,
            health_check_interval_ms: this.config.health_check_interval,
            metrics_collection_interval_ms: this.config.metrics_collection_interval,
            performance_stats: await this.performanceMetrics.getStatistics(),
            alert_stats: await this.alertManager.getStatistics()
        };
    }

    /**
     * Get health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        const stats = await this.getStatistics();
        
        return {
            status: 'healthy',
            is_monitoring: stats.is_monitoring,
            components_tracked: stats.components_tracked,
            events_recorded: stats.events_recorded,
            performance_tracker: await this.performanceMetrics.getHealth(),
            alert_manager: await this.alertManager.getHealth()
        };
    }

    /**
     * Shutdown the monitor
     */
    async shutdown() {
        log('debug', 'Shutting down system monitor...');
        
        await this.stopMonitoring();
        await this.performanceMetrics.shutdown();
        await this.alertManager.shutdown();
        
        // Clear all data
        this.systemMetrics.clear();
        this.componentHealth.clear();
    }
}

/**
 * Performance Tracker
 */
class PerformanceTracker {
    constructor(config) {
        this.config = config;
        this.metrics = new Map();
        this.timeSeries = new Map();
    }

    async initialize() {
        log('debug', 'Initializing performance tracker...');
    }

    async recordMetric(metricName, value, unit, tags) {
        const metric = {
            name: metricName,
            value: value,
            unit: unit,
            tags: tags,
            timestamp: new Date()
        };
        
        // Store current metric
        this.metrics.set(metricName, metric);
        
        // Store in time series
        if (!this.timeSeries.has(metricName)) {
            this.timeSeries.set(metricName, []);
        }
        
        const series = this.timeSeries.get(metricName);
        series.push(metric);
        
        // Keep only recent data (last 1000 points)
        if (series.length > 1000) {
            series.splice(0, series.length - 1000);
        }
    }

    async getMetrics() {
        const result = {};
        
        for (const [name, metric] of this.metrics) {
            result[name] = metric;
        }
        
        return result;
    }

    async getAnalytics(options = {}) {
        const analytics = {
            total_metrics: this.metrics.size,
            time_series_count: this.timeSeries.size,
            metrics_by_type: {},
            performance_trends: {}
        };
        
        // Analyze metrics by type
        for (const [name, metric] of this.metrics) {
            const type = metric.unit || 'unknown';
            analytics.metrics_by_type[type] = (analytics.metrics_by_type[type] || 0) + 1;
        }
        
        // Analyze trends for each metric
        for (const [name, series] of this.timeSeries) {
            if (series.length > 1) {
                const recent = series.slice(-10); // Last 10 points
                const values = recent.map(m => m.value);
                const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
                const trend = values[values.length - 1] > values[0] ? 'increasing' : 'decreasing';
                
                analytics.performance_trends[name] = {
                    average: avg,
                    trend: trend,
                    data_points: series.length
                };
            }
        }
        
        return analytics;
    }

    async getStatistics() {
        return {
            metrics_tracked: this.metrics.size,
            time_series_tracked: this.timeSeries.size,
            total_data_points: Array.from(this.timeSeries.values())
                .reduce((sum, series) => sum + series.length, 0)
        };
    }

    async getHealth() {
        return {
            status: 'healthy',
            metrics_tracked: this.metrics.size
        };
    }

    async shutdown() {
        this.metrics.clear();
        this.timeSeries.clear();
    }
}

/**
 * Alert Manager
 */
class AlertManager {
    constructor(config) {
        this.config = config;
        this.activeAlerts = new Map();
        this.alertRules = new Map();
        this.alertHistory = [];
    }

    async initialize() {
        log('debug', 'Initializing alert manager...');
        
        // Setup default alert rules
        this._setupDefaultAlertRules();
    }

    async checkEvent(event) {
        // Check event-based alerts
        for (const [ruleName, rule] of this.alertRules) {
            if (rule.type === 'event' && rule.eventType === event.type) {
                await this._evaluateRule(ruleName, rule, event);
            }
        }
    }

    async checkComponentHealth(componentName, health) {
        // Check health-based alerts
        for (const [ruleName, rule] of this.alertRules) {
            if (rule.type === 'health' && rule.component === componentName) {
                await this._evaluateRule(ruleName, rule, health);
            }
        }
    }

    async getActiveAlerts() {
        return Array.from(this.activeAlerts.values());
    }

    async getStatistics() {
        return {
            active_alerts: this.activeAlerts.size,
            alert_rules: this.alertRules.size,
            total_alerts_fired: this.alertHistory.length
        };
    }

    async getHealth() {
        return {
            status: 'healthy',
            active_alerts: this.activeAlerts.size
        };
    }

    async shutdown() {
        this.activeAlerts.clear();
        this.alertRules.clear();
        this.alertHistory.splice(0);
    }

    // Private methods

    _setupDefaultAlertRules() {
        // High memory usage alert
        this.alertRules.set('high_memory_usage', {
            type: 'metric',
            metric: 'memory_usage',
            threshold: 1000000000, // 1GB
            operator: 'greater_than',
            severity: 'warning',
            message: 'High memory usage detected'
        });
        
        // Component unhealthy alert
        this.alertRules.set('component_unhealthy', {
            type: 'health',
            component: '*', // Any component
            condition: 'status === "unhealthy"',
            severity: 'critical',
            message: 'Component is unhealthy'
        });
        
        // High error rate alert
        this.alertRules.set('high_error_rate', {
            type: 'event',
            eventType: 'error',
            threshold: 10, // 10 errors in 5 minutes
            timeWindow: 300000, // 5 minutes
            severity: 'warning',
            message: 'High error rate detected'
        });
    }

    async _evaluateRule(ruleName, rule, data) {
        try {
            let shouldAlert = false;
            
            switch (rule.type) {
                case 'health':
                    shouldAlert = data.status === 'unhealthy' || data.status === 'degraded';
                    break;
                case 'event':
                    shouldAlert = this._evaluateEventRule(rule, data);
                    break;
                case 'metric':
                    shouldAlert = this._evaluateMetricRule(rule, data);
                    break;
            }
            
            if (shouldAlert) {
                await this._fireAlert(ruleName, rule, data);
            }
            
        } catch (error) {
            log('error', `Error evaluating alert rule ${ruleName}: ${error.message}`);
        }
    }

    _evaluateEventRule(rule, event) {
        // Simple event-based alerting
        return event.type === rule.eventType;
    }

    _evaluateMetricRule(rule, data) {
        // Simple metric-based alerting
        const value = data.value || data[rule.metric];
        if (value === undefined) return false;
        
        switch (rule.operator) {
            case 'greater_than':
                return value > rule.threshold;
            case 'less_than':
                return value < rule.threshold;
            case 'equals':
                return value === rule.threshold;
            default:
                return false;
        }
    }

    async _fireAlert(ruleName, rule, data) {
        const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const alert = {
            id: alertId,
            rule_name: ruleName,
            severity: rule.severity,
            message: rule.message,
            data: data,
            fired_at: new Date(),
            status: 'active'
        };
        
        // Store active alert
        this.activeAlerts.set(alertId, alert);
        
        // Add to history
        this.alertHistory.push(alert);
        
        // Keep history limited
        if (this.alertHistory.length > 1000) {
            this.alertHistory.splice(0, this.alertHistory.length - 1000);
        }
        
        log('warning', `Alert fired: ${rule.message} (${rule.severity})`);
        
        // Auto-resolve after 5 minutes (mock implementation)
        setTimeout(() => {
            if (this.activeAlerts.has(alertId)) {
                const alert = this.activeAlerts.get(alertId);
                alert.status = 'resolved';
                alert.resolved_at = new Date();
                this.activeAlerts.delete(alertId);
            }
        }, 300000); // 5 minutes
    }
}

export default SystemMonitor;
