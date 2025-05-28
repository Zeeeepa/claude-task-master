/**
 * @fileoverview Consolidated Monitoring & Analytics System
 * @description Unified monitoring, performance analytics, and alerting system
 * combining the best features from performance optimization and real-time monitoring
 */

import { EventEmitter } from 'events';
import { log } from '../scripts/modules/utils.js';

/**
 * Consolidated Monitoring & Analytics System
 * Combines performance monitoring, health checking, metrics collection, 
 * alerting, and analytics in a single unified system
 */
export class MonitoringAnalyticsSystem extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = this.mergeDefaultConfig(config);
        this.components = new Map();
        this.isInitialized = false;
        this.isRunning = false;
        this.startTime = null;
        
        // Component instances
        this.performanceMonitor = null;
        this.healthChecker = null;
        this.metricsCollector = null;
        this.alertManager = null;
        this.cacheManager = null;
        this.databaseOptimizer = null;
        this.loadBalancer = null;
        this.dashboardAPI = null;
        
        // System state
        this.systemMetrics = {
            uptime: 0,
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTime: 0,
            currentLoad: 0,
            memoryUsage: 0,
            cpuUsage: 0
        };
        
        this.initializeComponents();
    }

    /**
     * Merge default configuration with user config
     */
    mergeDefaultConfig(userConfig) {
        const defaultConfig = {
            enabled: true,
            debug_mode: false,
            
            // Performance monitoring settings
            performance: {
                enabled: true,
                collection_interval: 30000,
                thresholds: {
                    cpu_usage: { warning: 70, critical: 90 },
                    memory_usage: { warning: 80, critical: 95 },
                    response_time: { warning: 2000, critical: 5000 },
                    error_rate: { warning: 5, critical: 10 }
                },
                auto_optimization: true
            },
            
            // Health checking settings
            health: {
                enabled: true,
                check_interval: 30000,
                timeout: 5000,
                auto_start: true,
                checks: {
                    database: { enabled: true, timeout: 5000, critical: true },
                    agentapi: { enabled: true, timeout: 3000, critical: true },
                    codegen: { enabled: true, timeout: 10000, critical: false },
                    system_resources: { enabled: true, timeout: 1000, critical: true }
                }
            },
            
            // Metrics collection settings
            metrics: {
                enabled: true,
                collection_interval: 60000,
                batch_size: 100,
                retention_days: 30,
                auto_start: true,
                export_formats: ['json', 'prometheus', 'csv']
            },
            
            // Alert management settings
            alerts: {
                enabled: true,
                evaluation_interval: 60000,
                auto_start: true,
                escalation_enabled: true,
                auto_resolve_enabled: true,
                channels: ['email', 'slack']
            },
            
            // Caching settings
            cache: {
                enabled: true,
                strategy: 'lru',
                max_size: 1000,
                ttl: 300000,
                enable_compression: true
            },
            
            // Database optimization settings
            database: {
                enabled: true,
                query_optimization: true,
                slow_query_threshold: 1000,
                connection_pooling: true
            },
            
            // Load balancing settings
            load_balancer: {
                enabled: false,
                strategy: 'round_robin',
                health_check_interval: 30000
            },
            
            // Dashboard API settings
            dashboard: {
                enabled: true,
                port: 8080,
                auto_start: false,
                real_time_updates: true,
                update_interval: 30000
            },
            
            // Notification settings
            notifications: {
                email: {
                    enabled: false,
                    smtp_host: process.env.SMTP_HOST || 'localhost',
                    smtp_port: parseInt(process.env.SMTP_PORT) || 587,
                    from_address: process.env.EMAIL_FROM || 'monitoring@example.com'
                },
                slack: {
                    enabled: false,
                    webhook_url: process.env.SLACK_WEBHOOK_URL || '',
                    channel: process.env.SLACK_CHANNEL || '#monitoring'
                }
            }
        };
        
        return this.deepMerge(defaultConfig, userConfig);
    }

    /**
     * Deep merge two objects
     */
    deepMerge(target, source) {
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (!target[key]) target[key] = {};
                this.deepMerge(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
        return target;
    }

    /**
     * Initialize all monitoring components
     */
    initializeComponents() {
        // Import and initialize components dynamically
        this.components.set('performance', () => import('./monitoring/performance-monitor.js'));
        this.components.set('health', () => import('./monitoring/health-checker.js'));
        this.components.set('metrics', () => import('./monitoring/metrics-collector.js'));
        this.components.set('alerts', () => import('./monitoring/alert-manager.js'));
        this.components.set('cache', () => import('./monitoring/cache-manager.js'));
        this.components.set('database', () => import('./monitoring/database-optimizer.js'));
        this.components.set('loadBalancer', () => import('./monitoring/load-balancer.js'));
        this.components.set('dashboard', () => import('./monitoring/dashboard-api.js'));
    }

    /**
     * Initialize the monitoring system
     */
    async initialize(databaseConnection = null) {
        if (this.isInitialized) {
            log('warning', 'Monitoring system already initialized');
            return;
        }

        if (!this.config.enabled) {
            log('info', 'Monitoring system disabled');
            return;
        }

        log('info', 'Initializing consolidated monitoring & analytics system...');

        try {
            // Initialize performance monitor
            if (this.config.performance.enabled) {
                const { PerformanceMonitor } = await import('./monitoring/performance-monitor.js');
                this.performanceMonitor = new PerformanceMonitor(this.config.performance);
                await this.performanceMonitor.initialize();
                log('debug', 'Performance monitor initialized');
            }

            // Initialize health checker
            if (this.config.health.enabled) {
                const { HealthChecker } = await import('./monitoring/health-checker.js');
                this.healthChecker = new HealthChecker(this.config.health);
                await this.healthChecker.initialize();
                log('debug', 'Health checker initialized');
            }

            // Initialize metrics collector
            if (this.config.metrics.enabled) {
                const { MetricsCollector } = await import('./monitoring/metrics-collector.js');
                this.metricsCollector = new MetricsCollector(this.config.metrics);
                await this.metricsCollector.initialize();
                log('debug', 'Metrics collector initialized');
            }

            // Initialize alert manager
            if (this.config.alerts.enabled) {
                const { AlertManager } = await import('./monitoring/alert-manager.js');
                this.alertManager = new AlertManager(this.config.alerts);
                if (this.metricsCollector) {
                    this.alertManager.setMetricsCollector(this.metricsCollector);
                }
                await this.alertManager.initialize();
                log('debug', 'Alert manager initialized');
            }

            // Initialize cache manager
            if (this.config.cache.enabled) {
                const { CacheManager } = await import('./monitoring/cache-manager.js');
                this.cacheManager = new CacheManager(this.config.cache);
                await this.cacheManager.initialize();
                log('debug', 'Cache manager initialized');
            }

            // Initialize database optimizer
            if (this.config.database.enabled && databaseConnection) {
                const { DatabaseOptimizer } = await import('./monitoring/database-optimizer.js');
                this.databaseOptimizer = new DatabaseOptimizer(this.config.database);
                await this.databaseOptimizer.initialize(databaseConnection);
                log('debug', 'Database optimizer initialized');
            }

            // Initialize load balancer
            if (this.config.load_balancer.enabled) {
                const { LoadBalancer } = await import('./monitoring/load-balancer.js');
                this.loadBalancer = new LoadBalancer(this.config.load_balancer);
                await this.loadBalancer.initialize();
                log('debug', 'Load balancer initialized');
            }

            // Initialize dashboard API
            if (this.config.dashboard.enabled) {
                const { DashboardAPI } = await import('./monitoring/dashboard-api.js');
                this.dashboardAPI = new DashboardAPI(this.config.dashboard);
                this.dashboardAPI.setMonitoringSystem(this);
                await this.dashboardAPI.initialize();
                log('debug', 'Dashboard API initialized');
            }

            // Set up component event handlers
            this.setupEventHandlers();

            this.isInitialized = true;
            this.emit('initialized');
            log('info', '✅ Monitoring & analytics system initialized successfully');

        } catch (error) {
            log('error', `Failed to initialize monitoring system: ${error.message}`);
            throw error;
        }
    }

    /**
     * Start the monitoring system
     */
    async start() {
        if (!this.isInitialized) {
            throw new Error('Monitoring system not initialized. Call initialize() first.');
        }

        if (this.isRunning) {
            log('warning', 'Monitoring system already running');
            return;
        }

        log('info', 'Starting monitoring & analytics system...');

        try {
            this.startTime = Date.now();

            // Start all enabled components
            const startPromises = [];

            if (this.performanceMonitor) {
                startPromises.push(this.performanceMonitor.start());
            }

            if (this.healthChecker && this.config.health.auto_start) {
                startPromises.push(this.healthChecker.start());
            }

            if (this.metricsCollector && this.config.metrics.auto_start) {
                startPromises.push(this.metricsCollector.start());
            }

            if (this.alertManager && this.config.alerts.auto_start) {
                startPromises.push(this.alertManager.start());
            }

            if (this.dashboardAPI && this.config.dashboard.auto_start) {
                startPromises.push(this.dashboardAPI.start());
            }

            await Promise.all(startPromises);

            this.isRunning = true;
            this.emit('started');
            log('info', '🚀 Monitoring & analytics system started successfully');

        } catch (error) {
            log('error', `Failed to start monitoring system: ${error.message}`);
            throw error;
        }
    }

    /**
     * Stop the monitoring system
     */
    async stop() {
        if (!this.isRunning) {
            log('warning', 'Monitoring system not running');
            return;
        }

        log('info', 'Stopping monitoring & analytics system...');

        try {
            // Stop all components
            const stopPromises = [];

            if (this.performanceMonitor) {
                stopPromises.push(this.performanceMonitor.stop());
            }

            if (this.healthChecker) {
                stopPromises.push(this.healthChecker.stop());
            }

            if (this.metricsCollector) {
                stopPromises.push(this.metricsCollector.stop());
            }

            if (this.alertManager) {
                stopPromises.push(this.alertManager.stop());
            }

            if (this.dashboardAPI) {
                stopPromises.push(this.dashboardAPI.stop());
            }

            await Promise.all(stopPromises);

            this.isRunning = false;
            this.emit('stopped');
            log('info', '⏹️ Monitoring & analytics system stopped');

        } catch (error) {
            log('error', `Error stopping monitoring system: ${error.message}`);
            throw error;
        }
    }

    /**
     * Set up event handlers between components
     */
    setupEventHandlers() {
        // Performance monitor events
        if (this.performanceMonitor) {
            this.performanceMonitor.on('threshold_exceeded', (data) => {
                this.emit('performance_alert', data);
                if (this.alertManager) {
                    this.alertManager.handlePerformanceAlert(data);
                }
            });

            this.performanceMonitor.on('metric_recorded', (metric) => {
                if (this.metricsCollector) {
                    this.metricsCollector.recordMetric(metric);
                }
            });
        }

        // Health checker events
        if (this.healthChecker) {
            this.healthChecker.on('health_check_failed', (data) => {
                this.emit('health_alert', data);
                if (this.alertManager) {
                    this.alertManager.handleHealthAlert(data);
                }
            });

            this.healthChecker.on('health_status_changed', (status) => {
                this.emit('health_status_changed', status);
            });
        }

        // Alert manager events
        if (this.alertManager) {
            this.alertManager.on('alert_fired', (alert) => {
                this.emit('alert_fired', alert);
                log('warning', `Alert fired: ${alert.title}`);
            });

            this.alertManager.on('alert_resolved', (alert) => {
                this.emit('alert_resolved', alert);
                log('info', `Alert resolved: ${alert.title}`);
            });
        }

        // Metrics collector events
        if (this.metricsCollector) {
            this.metricsCollector.on('metrics_collected', (metrics) => {
                this.updateSystemMetrics(metrics);
            });
        }
    }

    /**
     * Update system metrics
     */
    updateSystemMetrics(metrics) {
        if (this.startTime) {
            this.systemMetrics.uptime = Date.now() - this.startTime;
        }

        // Update metrics from various sources
        if (metrics.performance) {
            this.systemMetrics.averageResponseTime = metrics.performance.avg_response_time || 0;
            this.systemMetrics.currentLoad = metrics.performance.current_load || 0;
        }

        if (metrics.system) {
            this.systemMetrics.memoryUsage = metrics.system.memory_usage || 0;
            this.systemMetrics.cpuUsage = metrics.system.cpu_usage || 0;
        }

        if (metrics.requests) {
            this.systemMetrics.totalRequests = metrics.requests.total || 0;
            this.systemMetrics.successfulRequests = metrics.requests.successful || 0;
            this.systemMetrics.failedRequests = metrics.requests.failed || 0;
        }

        this.emit('system_metrics_updated', this.systemMetrics);
    }

    /**
     * Get component instance
     */
    getComponent(name) {
        switch (name) {
            case 'performance':
                return this.performanceMonitor;
            case 'health':
                return this.healthChecker;
            case 'metrics':
                return this.metricsCollector;
            case 'alerts':
                return this.alertManager;
            case 'cache':
                return this.cacheManager;
            case 'database':
                return this.databaseOptimizer;
            case 'loadBalancer':
                return this.loadBalancer;
            case 'dashboard':
                return this.dashboardAPI;
            default:
                return null;
        }
    }

    /**
     * Get comprehensive dashboard data
     */
    async getDashboardData() {
        const dashboardData = {
            status: this.isRunning ? 'running' : 'stopped',
            uptime: this.systemMetrics.uptime,
            timestamp: Date.now(),
            system_metrics: this.systemMetrics,
            components: {}
        };

        // Collect data from all components
        if (this.performanceMonitor) {
            dashboardData.components.performance = await this.performanceMonitor.getSummary();
        }

        if (this.healthChecker) {
            dashboardData.components.health = await this.healthChecker.getHealthSummary();
        }

        if (this.metricsCollector) {
            dashboardData.components.metrics = await this.metricsCollector.getLatestMetrics();
        }

        if (this.alertManager) {
            dashboardData.components.alerts = await this.alertManager.getActiveAlerts();
        }

        if (this.cacheManager) {
            dashboardData.components.cache = await this.cacheManager.getStatistics();
        }

        if (this.databaseOptimizer) {
            dashboardData.components.database = await this.databaseOptimizer.getOptimizationSummary();
        }

        return dashboardData;
    }

    /**
     * Export metrics in specified format
     */
    async exportMetrics(format = 'json') {
        if (!this.metricsCollector) {
            throw new Error('Metrics collector not available');
        }

        return await this.metricsCollector.exportMetrics(format);
    }

    /**
     * Get optimization recommendations
     */
    async getOptimizationRecommendations() {
        const recommendations = [];

        // Performance recommendations
        if (this.performanceMonitor) {
            const perfRecommendations = await this.performanceMonitor.getOptimizationRecommendations();
            recommendations.push(...perfRecommendations);
        }

        // Database recommendations
        if (this.databaseOptimizer) {
            const dbRecommendations = await this.databaseOptimizer.getOptimizationSuggestions();
            recommendations.push(...dbRecommendations);
        }

        // Cache recommendations
        if (this.cacheManager) {
            const cacheRecommendations = await this.cacheManager.getOptimizationSuggestions();
            recommendations.push(...cacheRecommendations);
        }

        return recommendations.sort((a, b) => {
            const priorityOrder = { 'critical': 0, 'high': 1, 'medium': 2, 'low': 3 };
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        });
    }

    /**
     * Health check for the monitoring system itself
     */
    async healthCheck() {
        const health = {
            status: 'healthy',
            timestamp: Date.now(),
            components: {},
            overall_score: 100
        };

        let totalScore = 0;
        let componentCount = 0;

        // Check each component
        const components = [
            { name: 'performance', instance: this.performanceMonitor },
            { name: 'health', instance: this.healthChecker },
            { name: 'metrics', instance: this.metricsCollector },
            { name: 'alerts', instance: this.alertManager },
            { name: 'cache', instance: this.cacheManager },
            { name: 'database', instance: this.databaseOptimizer },
            { name: 'dashboard', instance: this.dashboardAPI }
        ];

        for (const component of components) {
            if (component.instance) {
                try {
                    const componentHealth = await component.instance.healthCheck();
                    health.components[component.name] = componentHealth;
                    
                    const score = componentHealth.score || (componentHealth.status === 'healthy' ? 100 : 0);
                    totalScore += score;
                    componentCount++;
                    
                    if (componentHealth.status !== 'healthy') {
                        health.status = 'degraded';
                    }
                } catch (error) {
                    health.components[component.name] = {
                        status: 'error',
                        error: error.message,
                        score: 0
                    };
                    health.status = 'degraded';
                    componentCount++;
                }
            }
        }

        if (componentCount > 0) {
            health.overall_score = Math.round(totalScore / componentCount);
        }

        if (health.overall_score < 50) {
            health.status = 'unhealthy';
        } else if (health.overall_score < 80) {
            health.status = 'degraded';
        }

        return health;
    }

    /**
     * Get system configuration
     */
    getConfiguration() {
        return JSON.parse(JSON.stringify(this.config));
    }

    /**
     * Update system configuration
     */
    async updateConfiguration(updates) {
        this.config = this.deepMerge(this.config, updates);
        
        // Notify components of configuration changes
        const components = [
            this.performanceMonitor,
            this.healthChecker,
            this.metricsCollector,
            this.alertManager,
            this.cacheManager,
            this.databaseOptimizer,
            this.dashboardAPI
        ];

        for (const component of components) {
            if (component && typeof component.updateConfiguration === 'function') {
                await component.updateConfiguration(updates);
            }
        }

        this.emit('configuration_updated', this.config);
        log('info', 'Monitoring system configuration updated');
    }
}

export default MonitoringAnalyticsSystem;

