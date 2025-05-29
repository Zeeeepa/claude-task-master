/**
 * @fileoverview System Monitor
 * @description Comprehensive system monitoring and metrics collection - Enhanced Version
 */

import { log } from '../../scripts/modules/utils.js';
import { MetricsCollector } from './metrics_collector.js';
import { PerformanceAnalyzer } from './performance_analyzer.js';
import { HealthChecker } from './health_checker.js';
import { AlertManager } from './alert_manager.js';
import { DashboardAPI } from './dashboard_api.js';
import { MonitoringConfig } from '../config/monitoring_config.js';

/**
 * Enhanced system monitor with comprehensive monitoring capabilities
 */
export class SystemMonitor {
    constructor(config = {}) {
        // Create monitoring configuration
        this.monitoringConfig = new MonitoringConfig(config);
        this.config = this.monitoringConfig.getAll();
        
        // Initialize monitoring components
        this.metricsCollector = new MetricsCollector(this.config);
        this.performanceAnalyzer = new PerformanceAnalyzer(this.config);
        this.healthChecker = new HealthChecker(this.config);
        this.alertManager = new AlertManager(this.config);
        this.dashboardAPI = this.config.dashboard.enabled ? new DashboardAPI(this.config) : null;
        
        // Connect components
        this.performanceAnalyzer.setMetricsStorage(this.metricsCollector.storage);
        this.alertManager.setMetricsCollector(this.metricsCollector);
        
        // State tracking
        this.isMonitoring = false;
        this.startTime = null;
        
        // Legacy compatibility
        this.systemMetrics = new Map();
        this.componentHealth = new Map();
        this.performanceMetrics = this.performanceAnalyzer; // Alias for compatibility
        this.alertManager = this.alertManager; // Already assigned above
        
        log('info', 'Enhanced System Monitor initialized');
    }

    /**
     * Initialize the system monitor
     */
    async initialize() {
        log('debug', 'Initializing enhanced system monitor...');
        
        if (!this.config.enabled) {
            log('info', 'System monitoring disabled');
            return;
        }
        
        try {
            // Initialize storage
            await this.metricsCollector.storage.initializeDatabase();
            
            log('debug', 'Enhanced system monitor initialized successfully');
        } catch (error) {
            log('error', `Failed to initialize system monitor: ${error.message}`);
            throw error;
        }
    }

    /**
     * Start comprehensive monitoring
     */
    async startMonitoring() {
        if (this.isMonitoring) {
            log('warning', 'System monitoring already running');
            return;
        }

        try {
            this.startTime = Date.now();
            this.isMonitoring = true;

            // Start metrics collection
            if (this.config.metrics.auto_start) {
                this.metricsCollector.startCollection(this.config.metrics.collection_interval);
                log('info', 'Metrics collection started');
            }

            // Start health monitoring
            if (this.config.health.auto_start) {
                this.healthChecker.startPeriodicChecks(this.config.health.check_interval);
                log('info', 'Health monitoring started');
            }

            // Start alert monitoring
            if (this.config.alerts.auto_start) {
                await this.alertManager.startMonitoring();
                log('info', 'Alert monitoring started');
            }

            // Start dashboard API
            if (this.dashboardAPI && this.config.dashboard.auto_start) {
                await this.dashboardAPI.start();
                log('info', 'Dashboard API started');
            }

            log('info', 'Comprehensive system monitoring started successfully');
            
        } catch (error) {
            log('error', `Failed to start system monitoring: ${error.message}`);
            this.isMonitoring = false;
            throw error;
        }
    }

    /**
     * Stop monitoring
     */
    async stopMonitoring() {
        if (!this.isMonitoring) {
            log('warning', 'System monitoring not running');
            return;
        }

        try {
            // Stop components
            this.metricsCollector.stopCollection();
            this.healthChecker.stopPeriodicChecks();
            this.alertManager.stopMonitoring();
            
            if (this.dashboardAPI) {
                await this.dashboardAPI.stop();
            }

            this.isMonitoring = false;
            
            const uptime = this.startTime ? Date.now() - this.startTime : 0;
            log('info', `System monitoring stopped after ${Math.round(uptime / 1000)}s`);
            
        } catch (error) {
            log('error', `Error stopping system monitoring: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get comprehensive system status
     */
    async getSystemStatus() {
        try {
            const [health, metrics, performance, alerts] = await Promise.all([
                this.healthChecker.performHealthCheck(),
                this.metricsCollector.getLatestMetrics(),
                this.performanceAnalyzer.analyzePerformance('1h'),
                this.alertManager.getActiveAlerts()
            ]);

            return {
                timestamp: new Date().toISOString(),
                monitoring: {
                    is_active: this.isMonitoring,
                    uptime: this.startTime ? Date.now() - this.startTime : 0,
                    components: {
                        metrics_collector: this.metricsCollector.isCollecting,
                        health_checker: this.healthChecker.isRunning,
                        alert_manager: this.alertManager.isMonitoring,
                        dashboard_api: this.dashboardAPI?.server ? true : false
                    }
                },
                health: {
                    overall_status: health.overall_status,
                    score: Math.round((health.summary.healthy / health.summary.total) * 100),
                    critical_issues: health.summary.critical,
                    warnings: health.summary.warning,
                    checks: Object.keys(health.checks).length
                },
                metrics: {
                    collectors_active: this.metricsCollector.collectors.size,
                    last_collection: metrics ? Object.values(metrics)[0]?.timestamp : null,
                    storage_connected: this.metricsCollector.storage.isConnected()
                },
                performance: {
                    system_score: performance.system_health?.overall_score || 0,
                    bottlenecks: performance.bottlenecks?.length || 0,
                    recommendations: performance.recommendations?.length || 0
                },
                alerts: {
                    active: alerts.length,
                    critical: alerts.filter(a => a.severity === 'critical').length,
                    warning: alerts.filter(a => a.severity === 'warning').length
                }
            };
            
        } catch (error) {
            log('error', `Error getting system status: ${error.message}`);
            return {
                timestamp: new Date().toISOString(),
                error: error.message,
                monitoring: { is_active: this.isMonitoring }
            };
        }
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

    // Private methods

    /**
     * Perform health check on all components
     * @private
     */
    async _performHealthCheck() {
        try {
            // Record health check event
            await this.recordEvent('health_check', {
                components_checked: this.componentHealth.size,
                timestamp: new Date()
            });
            
            // Update system metrics
            this.systemMetrics.set('last_health_check', new Date());
            this.systemMetrics.set('health_check_count', 
                (this.systemMetrics.get('health_check_count') || 0) + 1
            );
            
        } catch (error) {
            log('error', `Health check failed: ${error.message}`);
        }
    }

    /**
     * Collect system metrics
     * @private
     */
    async _collectMetrics() {
        try {
            // Collect system metrics
            const systemStats = {
                memory_usage: process.memoryUsage(),
                cpu_usage: process.cpuUsage(),
                uptime: process.uptime(),
                timestamp: new Date()
            };
            
            this.systemMetrics.set('system_stats', systemStats);
            
            // Record metrics collection event
            await this.recordEvent('metrics_collection', {
                metrics_collected: this.systemMetrics.size,
                timestamp: new Date()
            });
            
            // Update collection count
            this.systemMetrics.set('metrics_collection_count',
                (this.systemMetrics.get('metrics_collection_count') || 0) + 1
            );
            
        } catch (error) {
            log('error', `Metrics collection failed: ${error.message}`);
        }
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
