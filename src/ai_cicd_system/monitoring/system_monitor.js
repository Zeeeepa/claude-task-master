/**
 * @fileoverview System Monitor
 * @description Comprehensive system monitoring and metrics collection with enhanced performance monitoring
 */

import { log } from '../../scripts/modules/utils.js';
import { PerformanceMonitor } from './performance_monitor.js';
import { MetricsCollector, ConsoleExporter, FileExporter } from './metrics_collector.js';
import { HealthChecker, HealthCheckFunctions } from './health_checker.js';
import { AlertManager, EmailNotificationChannel, SlackNotificationChannel } from '../alerts/alert_manager.js';
import { MetricTypes, AlertSeverity } from '../metrics/metric_types.js';

/**
 * Enhanced System monitor for comprehensive health tracking and metrics
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
            enable_advanced_monitoring: config.enable_advanced_monitoring !== false,
            ...config
        };
        
        this.isMonitoring = false;
        this.healthCheckInterval = null;
        this.metricsInterval = null;
        this.systemMetrics = new Map();
        this.componentHealth = new Map();
        
        // Enhanced monitoring components
        if (this.config.enable_advanced_monitoring) {
            this.performanceMonitor = new PerformanceMonitor(this.config);
            this.metricsCollector = new MetricsCollector(this.config);
            this.healthChecker = new HealthChecker(this.config);
            this.alertManager = new AlertManager(this.config);
            this._setupAdvancedMonitoring();
        } else {
            // Legacy components for backward compatibility
            this.performanceMetrics = new PerformanceTracker(this.config);
            this.alertManager = new AlertManager(this.config);
        }
    }

    /**
     * Initialize the system monitor
     */
    async initialize() {
        log('debug', 'Initializing system monitor...');
        
        if (!this.config.enable_metrics) {
            log('info', 'System monitoring disabled');
            return;
        }
        
        if (this.config.enable_advanced_monitoring) {
            await this.performanceMonitor.initialize();
            await this.metricsCollector.initialize();
            await this.healthChecker.initialize();
            await this.alertManager.initialize();
            
            // Register default health checks
            this._registerDefaultHealthChecks();
            
            log('info', 'Advanced monitoring initialized');
        } else {
            await this.performanceMetrics.initialize();
            await this.alertManager.initialize();
            
            log('info', 'Basic monitoring initialized');
        }
        
        log('debug', 'System monitor initialized');
    }

    /**
     * Start monitoring
     */
    async startMonitoring() {
        if (!this.config.enable_metrics || this.isMonitoring) {
            return;
        }
        
        log('info', 'Starting system monitoring...');
        
        this.isMonitoring = true;
        
        // Start health checks
        this.healthCheckInterval = setInterval(async () => {
            await this._performHealthCheck();
        }, this.config.health_check_interval);
        
        // Start metrics collection
        this.metricsInterval = setInterval(async () => {
            await this._collectMetrics();
        }, this.config.metrics_collection_interval);
        
        // Initial health check and metrics collection
        await this._performHealthCheck();
        await this._collectMetrics();
        
        log('info', 'System monitoring started');
    }

    /**
     * Stop monitoring
     */
    async stopMonitoring() {
        if (!this.isMonitoring) {
            return;
        }
        
        log('info', 'Stopping system monitoring...');
        
        this.isMonitoring = false;
        
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
            this.metricsInterval = null;
        }
        
        log('info', 'System monitoring stopped');
    }

    /**
     * Record system event with enhanced tracking
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
        
        // Store event in legacy format
        if (!this.systemMetrics.has('events')) {
            this.systemMetrics.set('events', []);
        }
        
        const events = this.systemMetrics.get('events');
        events.push(event);
        
        // Keep only recent events (last 1000)
        if (events.length > 1000) {
            events.splice(0, events.length - 1000);
        }
        
        // Enhanced event tracking
        if (this.config.enable_advanced_monitoring) {
            // Record as metric for advanced analysis
            this.performanceMonitor.incrementCounter(`event_${eventType}`, {
                ...eventData,
                timestamp: event.timestamp.toISOString()
            });
            
            // Check for event-based alerts
            await this.alertManager.checkEvent?.(event);
        } else {
            // Legacy alert checking
            await this.alertManager.checkEvent(event);
        }
        
        log('debug', `Recorded system event: ${eventType}`);
    }

    /**
     * Record performance metric with enhanced capabilities
     * @param {string} metricName - Metric name
     * @param {number} value - Metric value
     * @param {string} unit - Metric unit
     * @param {Object} tags - Metric tags
     */
    async recordMetric(metricName, value, unit = 'count', tags = {}) {
        if (!this.config.enable_performance_tracking) {
            return;
        }
        
        if (this.config.enable_advanced_monitoring) {
            // Use enhanced performance monitor
            this.performanceMonitor.recordMetric(metricName, value, tags);
        } else {
            // Use legacy performance tracker
            await this.performanceMetrics.recordMetric(metricName, value, unit, tags);
        }
    }

    /**
     * Start a performance timer
     * @param {string} operation - Operation name
     * @param {Object} metadata - Additional metadata
     * @returns {string} Timer ID
     */
    startTimer(operation, metadata = {}) {
        if (this.config.enable_advanced_monitoring) {
            return this.performanceMonitor.startTimer(operation, metadata);
        } else {
            // Legacy timer implementation
            const timerId = `${operation}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            this.systemMetrics.set(`timer_${timerId}`, {
                operation,
                startTime: Date.now(),
                metadata
            });
            return timerId;
        }
    }

    /**
     * End a performance timer
     * @param {string} timerId - Timer ID
     * @returns {number|null} Duration in milliseconds
     */
    endTimer(timerId) {
        if (this.config.enable_advanced_monitoring) {
            return this.performanceMonitor.endTimer(timerId);
        } else {
            // Legacy timer implementation
            const timerData = this.systemMetrics.get(`timer_${timerId}`);
            if (!timerData) {
                return null;
            }
            
            const duration = Date.now() - timerData.startTime;
            this.systemMetrics.delete(`timer_${timerId}`);
            
            // Record the timing metric
            this.recordMetric(`${timerData.operation}_time`, duration, 'ms', timerData.metadata);
            
            return duration;
        }
    }

    /**
     * Get system health status with enhanced details
     * @returns {Promise<Object>} System health
     */
    async getSystemHealth() {
        if (this.config.enable_advanced_monitoring) {
            // Use enhanced health checker
            const health = await this.healthChecker.checkHealth();
            
            // Add legacy component health for compatibility
            const legacyHealth = {
                status: health.status,
                timestamp: new Date(health.timestamp),
                components: {},
                summary: health.summary,
                enhanced: {
                    services: health.services,
                    dependencies: health.dependencies
                }
            };
            
            // Convert component health to legacy format
            for (const [componentName, componentHealth] of this.componentHealth) {
                legacyHealth.components[componentName] = componentHealth;
            }
            
            return legacyHealth;
        } else {
            // Legacy health implementation
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
    }

    /**
     * Get system metrics with enhanced data
     * @returns {Promise<Object>} System metrics
     */
    async getSystemMetrics() {
        const metrics = {
            timestamp: new Date(),
            system_metrics: {},
            events: this.systemMetrics.get('events') || [],
            alerts: await this.alertManager.getActiveAlerts()
        };
        
        if (this.config.enable_advanced_monitoring) {
            // Enhanced metrics
            metrics.performance_metrics = await this.performanceMonitor.getStatistics();
            metrics.metrics_collector = await this.metricsCollector.getStatistics();
            metrics.health_checker = await this.healthChecker.getStatistics();
            metrics.alert_manager = await this.alertManager.getStatistics();
        } else {
            // Legacy metrics
            metrics.performance_metrics = await this.performanceMetrics.getMetrics();
        }
        
        // Convert Map to object for legacy compatibility
        for (const [key, value] of this.systemMetrics) {
            metrics.system_metrics[key] = value;
        }
        
        return metrics;
    }

    /**
     * Get performance analytics with enhanced insights
     * @param {Object} options - Analytics options
     * @returns {Promise<Object>} Performance analytics
     */
    async getPerformanceAnalytics(options = {}) {
        if (this.config.enable_advanced_monitoring) {
            return await this.performanceMonitor.getStatistics();
        } else {
            return await this.performanceMetrics.getAnalytics(options);
        }
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
        
        // Enhanced health tracking
        if (this.config.enable_advanced_monitoring) {
            // Register with health checker if not already registered
            if (!this.healthChecker.services.has(componentName)) {
                this.healthChecker.registerService(
                    componentName,
                    async () => healthData,
                    { critical: healthData.critical !== false }
                );
            }
        }
        
        // Check for health-based alerts
        if (health.status !== 'healthy') {
            await this.alertManager.checkComponentHealth?.(componentName, health);
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
            performance_stats: await this.performanceMonitor.getStatistics(),
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
            performance_tracker: await this.performanceMonitor.getHealth(),
            alert_manager: await this.alertManager.getHealth()
        };
    }

    /**
     * Shutdown the monitor
     */
    async shutdown() {
        log('debug', 'Shutting down system monitor...');
        
        await this.stopMonitoring();
        await this.performanceMonitor.shutdown();
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

    /**
     * Setup advanced monitoring components
     * @private
     */
    _setupAdvancedMonitoring() {
        // Register default health checks
        this._registerDefaultHealthChecks();
    }

    /**
     * Register default health checks
     * @private
     */
    _registerDefaultHealthChecks() {
        // Example: Register a simple health check function
        this.healthChecker.registerCheck('simple_check', async () => {
            return {
                status: 'healthy',
                message: 'All systems are operational'
            };
        });
    }
}

/**
 * Performance Monitor
 */
class PerformanceMonitor {
    constructor(config) {
        this.config = config;
        this.metrics = new Map();
        this.timeSeries = new Map();
    }

    async initialize() {
        log('debug', 'Initializing performance monitor...');
    }

    async recordMetric(metricName, value, tags) {
        const metric = {
            name: metricName,
            value: value,
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

    async getStatistics() {
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
 * Metrics Collector
 */
class MetricsCollector {
    constructor(config) {
        this.config = config;
        this.exporters = [];
    }

    async initialize() {
        log('debug', 'Initializing metrics collector...');
        
        // Register default exporters
        this.registerExporter(new ConsoleExporter());
        this.registerExporter(new FileExporter());
    }

    registerExporter(exporter) {
        this.exporters.push(exporter);
    }

    async getStatistics() {
        const stats = {
            exporters: this.exporters.map(e => e.getStatistics())
        };
        
        return stats;
    }

    async getMetrics() {
        const metrics = {};
        
        for (const exporter of this.exporters) {
            metrics[exporter.name] = exporter.getMetrics();
        }
        
        return metrics;
    }
}

/**
 * Health Checker
 */
class HealthChecker {
    constructor(config) {
        this.config = config;
        this.services = new Map();
        this.dependencies = new Map();
    }

    async initialize() {
        log('debug', 'Initializing health checker...');
    }

    registerService(name, checkFunction, options = {}) {
        this.services.set(name, {
            check: checkFunction,
            critical: options.critical !== false
        });
    }

    registerCheck(name, checkFunction) {
        this.dependencies.set(name, checkFunction);
    }

    async checkHealth() {
        const health = {
            status: 'healthy',
            timestamp: new Date(),
            summary: {
                total_services: 0,
                healthy_services: 0,
                degraded_services: 0,
                unhealthy_services: 0
            }
        };
        
        // Check services
        for (const [name, service] of this.services) {
            const result = await service.check();
            health.summary.total_services++;
            
            switch (result.status) {
                case 'healthy':
                    health.summary.healthy_services++;
                    break;
                case 'degraded':
                    health.summary.degraded_services++;
                    if (health.status === 'healthy') {
                        health.status = 'degraded';
                    }
                    break;
                case 'unhealthy':
                    health.summary.unhealthy_services++;
                    health.status = 'unhealthy';
                    break;
            }
        }
        
        // Check dependencies
        for (const [name, check] of this.dependencies) {
            const result = await check();
            if (result.status === 'unhealthy') {
                health.status = 'unhealthy';
                break;
            }
        }
        
        return health;
    }

    async getStatistics() {
        return {
            services: this.services.size,
            dependencies: this.dependencies.size
        };
    }

    async getHealth() {
        return {
            status: 'healthy',
            services: this.services.size
        };
    }

    async shutdown() {
        this.services.clear();
        this.dependencies.clear();
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
