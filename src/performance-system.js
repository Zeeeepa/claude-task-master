/**
 * @fileoverview Performance System
 * @description Comprehensive performance optimization and monitoring system integration
 */

import EventEmitter from 'events';
import PerformanceMonitor from './monitoring/performance-monitor.js';
import HealthChecker from './monitoring/health-checker.js';
import DatabaseOptimizer from './optimization/database-optimizer.js';
import CacheManager from './optimization/cache-manager.js';
import LoadBalancer from './optimization/load-balancer.js';
import MetricsCollector from './analytics/metrics-collector.js';

/**
 * Performance System - Main orchestrator for all performance optimization and monitoring
 */
export class PerformanceSystem extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            enabled: config.enabled !== false,
            enablePerformanceMonitoring: config.enablePerformanceMonitoring !== false,
            enableHealthChecking: config.enableHealthChecking !== false,
            enableDatabaseOptimization: config.enableDatabaseOptimization !== false,
            enableCaching: config.enableCaching !== false,
            enableLoadBalancing: config.enableLoadBalancing || false,
            enableMetricsCollection: config.enableMetricsCollection !== false,
            dashboardPort: config.dashboardPort || 3001,
            metricsPort: config.metricsPort || 9090,
            ...config
        };

        // Initialize components
        this.performanceMonitor = new PerformanceMonitor(config.performanceMonitor);
        this.healthChecker = new HealthChecker(config.healthChecker);
        this.databaseOptimizer = new DatabaseOptimizer(config.databaseOptimizer);
        this.cacheManager = new CacheManager(config.cacheManager);
        this.loadBalancer = new LoadBalancer(config.loadBalancer);
        this.metricsCollector = new MetricsCollector(config.metricsCollector);

        this.isInitialized = false;
        this.isRunning = false;
        this.startTime = null;
        
        // Performance dashboard data
        this.dashboardData = {
            lastUpdate: null,
            alerts: [],
            recommendations: []
        };

        // Set up event forwarding
        this.setupEventForwarding();
    }

    /**
     * Initialize the performance system
     */
    async initialize(databaseConnection = null) {
        if (!this.config.enabled) {
            console.log('Performance system disabled');
            return;
        }

        console.log('Initializing performance optimization and monitoring system...');
        
        try {
            // Initialize components in order
            if (this.config.enableMetricsCollection) {
                await this.metricsCollector.initialize();
                console.log('✓ Metrics collector initialized');
            }

            if (this.config.enablePerformanceMonitoring) {
                await this.performanceMonitor.initialize();
                console.log('✓ Performance monitor initialized');
            }

            if (this.config.enableHealthChecking) {
                await this.healthChecker.initialize();
                console.log('✓ Health checker initialized');
            }

            if (this.config.enableCaching) {
                await this.cacheManager.initialize();
                console.log('✓ Cache manager initialized');
            }

            if (this.config.enableDatabaseOptimization && databaseConnection) {
                await this.databaseOptimizer.initialize(databaseConnection);
                console.log('✓ Database optimizer initialized');
            }

            if (this.config.enableLoadBalancing) {
                await this.loadBalancer.initialize();
                console.log('✓ Load balancer initialized');
            }

            this.isInitialized = true;
            this.emit('initialized');
            
            console.log('🚀 Performance system initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize performance system:', error);
            throw error;
        }
    }

    /**
     * Start the performance system
     */
    async start() {
        if (!this.isInitialized || this.isRunning) {
            return;
        }

        console.log('Starting performance optimization and monitoring...');
        this.startTime = Date.now();

        try {
            // Start components
            if (this.config.enableMetricsCollection) {
                // Metrics collector starts automatically during initialization
            }

            if (this.config.enablePerformanceMonitoring) {
                this.performanceMonitor.start();
            }

            if (this.config.enableHealthChecking) {
                this.healthChecker.start();
            }

            if (this.config.enableLoadBalancing) {
                // Load balancer starts automatically during initialization
            }

            // Start dashboard update interval
            this.startDashboardUpdates();

            this.isRunning = true;
            this.emit('started');
            
            console.log('🎯 Performance system started successfully');
            
        } catch (error) {
            console.error('Failed to start performance system:', error);
            throw error;
        }
    }

    /**
     * Stop the performance system
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }

        console.log('Stopping performance system...');

        try {
            // Stop components
            if (this.config.enablePerformanceMonitoring) {
                this.performanceMonitor.stop();
            }

            if (this.config.enableHealthChecking) {
                this.healthChecker.stop();
            }

            if (this.config.enableMetricsCollection) {
                this.metricsCollector.stop();
            }

            if (this.config.enableCaching) {
                await this.cacheManager.shutdown();
            }

            if (this.config.enableLoadBalancing) {
                await this.loadBalancer.shutdown();
            }

            this.isRunning = false;
            this.emit('stopped');
            
            console.log('Performance system stopped');
            
        } catch (error) {
            console.error('Error stopping performance system:', error);
            throw error;
        }
    }

    /**
     * Get comprehensive performance dashboard data
     */
    getPerformanceDashboard() {
        const dashboard = {
            timestamp: Date.now(),
            uptime: this.startTime ? Date.now() - this.startTime : 0,
            status: this.getSystemStatus(),
            components: {},
            alerts: this.dashboardData.alerts,
            recommendations: this.dashboardData.recommendations,
            summary: this.getPerformanceSummary()
        };

        // Collect data from each component
        if (this.config.enablePerformanceMonitoring && this.performanceMonitor.isRunning) {
            dashboard.components.performance = this.performanceMonitor.getPerformanceSummary();
        }

        if (this.config.enableHealthChecking && this.healthChecker.isRunning) {
            dashboard.components.health = this.healthChecker.getHealthSummary();
        }

        if (this.config.enableDatabaseOptimization && this.databaseOptimizer.isInitialized) {
            dashboard.components.database = this.databaseOptimizer.getPerformanceSummary();
        }

        if (this.config.enableCaching && this.cacheManager.isInitialized) {
            dashboard.components.cache = this.cacheManager.getStats();
        }

        if (this.config.enableLoadBalancing && this.loadBalancer.isRunning) {
            dashboard.components.loadBalancer = this.loadBalancer.getStats();
        }

        if (this.config.enableMetricsCollection && this.metricsCollector.isRunning) {
            dashboard.components.metrics = this.metricsCollector.getMetricsSummary();
        }

        this.dashboardData.lastUpdate = Date.now();
        return dashboard;
    }

    /**
     * Get system status
     */
    getSystemStatus() {
        if (!this.isInitialized) {
            return 'not_initialized';
        }
        
        if (!this.isRunning) {
            return 'stopped';
        }

        // Check health status
        if (this.config.enableHealthChecking && this.healthChecker.isRunning) {
            const healthSummary = this.healthChecker.getHealthSummary();
            if (healthSummary.overall.status === 'critical') {
                return 'critical';
            }
            if (healthSummary.overall.status === 'warning') {
                return 'warning';
            }
        }

        return 'healthy';
    }

    /**
     * Get performance summary
     */
    getPerformanceSummary() {
        const summary = {
            overallScore: 100,
            issues: [],
            improvements: []
        };

        // Analyze performance data and generate score
        if (this.config.enablePerformanceMonitoring && this.performanceMonitor.isRunning) {
            const perfData = this.performanceMonitor.getPerformanceSummary();
            
            // Deduct points for high error rate
            if (perfData.errorRate > 5) {
                summary.overallScore -= 20;
                summary.issues.push(`High error rate: ${perfData.errorRate.toFixed(2)}%`);
            }
            
            // Deduct points for slow response times
            if (perfData.averageResponseTime > 1000) {
                summary.overallScore -= 15;
                summary.issues.push(`Slow response time: ${perfData.averageResponseTime.toFixed(2)}ms`);
            }
        }

        // Analyze health data
        if (this.config.enableHealthChecking && this.healthChecker.isRunning) {
            const healthData = this.healthChecker.getHealthSummary();
            
            if (healthData.overall.status === 'critical') {
                summary.overallScore -= 30;
                summary.issues.push('Critical health issues detected');
            } else if (healthData.overall.status === 'warning') {
                summary.overallScore -= 10;
                summary.issues.push('Health warnings detected');
            }
        }

        // Analyze cache performance
        if (this.config.enableCaching && this.cacheManager.isInitialized) {
            const cacheStats = this.cacheManager.getStats();
            
            if (cacheStats.hitRate < 70) {
                summary.overallScore -= 10;
                summary.issues.push(`Low cache hit rate: ${cacheStats.hitRate.toFixed(2)}%`);
                summary.improvements.push('Consider optimizing cache strategy or TTL settings');
            }
        }

        // Ensure score doesn't go below 0
        summary.overallScore = Math.max(0, summary.overallScore);

        return summary;
    }

    /**
     * Get optimization recommendations
     */
    getOptimizationRecommendations() {
        const recommendations = [];

        // Database optimization recommendations
        if (this.config.enableDatabaseOptimization && this.databaseOptimizer.isInitialized) {
            const dbSuggestions = this.databaseOptimizer.getOptimizationSuggestions();
            recommendations.push(...dbSuggestions.map(s => ({
                type: 'database',
                priority: s.severity === 'high' ? 'high' : 'medium',
                message: s.message,
                category: s.type
            })));
        }

        // Performance recommendations
        if (this.config.enablePerformanceMonitoring && this.performanceMonitor.isRunning) {
            const perfData = this.performanceMonitor.getPerformanceSummary();
            
            if (perfData.errorRate > 5) {
                recommendations.push({
                    type: 'performance',
                    priority: 'high',
                    message: 'High error rate detected - investigate error causes',
                    category: 'error_handling'
                });
            }
            
            if (perfData.averageResponseTime > 1000) {
                recommendations.push({
                    type: 'performance',
                    priority: 'medium',
                    message: 'Response times are slow - consider optimization',
                    category: 'response_time'
                });
            }
        }

        // Cache recommendations
        if (this.config.enableCaching && this.cacheManager.isInitialized) {
            const cacheStats = this.cacheManager.getStats();
            
            if (cacheStats.hitRate < 70) {
                recommendations.push({
                    type: 'cache',
                    priority: 'medium',
                    message: 'Cache hit rate is low - review caching strategy',
                    category: 'cache_optimization'
                });
            }
        }

        return recommendations;
    }

    /**
     * Export performance metrics
     */
    exportMetrics(format = 'json') {
        if (!this.config.enableMetricsCollection) {
            throw new Error('Metrics collection is disabled');
        }

        return this.metricsCollector.exportMetrics(format);
    }

    /**
     * Setup event forwarding from components
     */
    setupEventForwarding() {
        // Forward performance monitor events
        this.performanceMonitor.on('threshold_exceeded', (data) => {
            this.handleAlert('performance', data);
        });

        // Forward health checker events
        this.healthChecker.on('alert', (data) => {
            this.handleAlert('health', data);
        });

        // Forward database optimizer events
        this.databaseOptimizer.on('slow_query', (data) => {
            this.handleAlert('database', { type: 'slow_query', ...data });
        });

        // Forward cache manager events
        this.cacheManager.on('threshold_exceeded', (data) => {
            this.handleAlert('cache', data);
        });

        // Forward load balancer events
        this.loadBalancer.on('server_status_changed', (data) => {
            this.handleAlert('load_balancer', data);
        });
    }

    /**
     * Handle alerts from components
     */
    handleAlert(source, data) {
        const alert = {
            id: `${source}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            source,
            timestamp: Date.now(),
            severity: this.determineSeverity(data),
            message: this.formatAlertMessage(source, data),
            data
        };

        this.dashboardData.alerts.unshift(alert);
        
        // Keep only last 100 alerts
        if (this.dashboardData.alerts.length > 100) {
            this.dashboardData.alerts = this.dashboardData.alerts.slice(0, 100);
        }

        this.emit('alert', alert);
    }

    /**
     * Determine alert severity
     */
    determineSeverity(data) {
        if (data.type === 'critical' || data.severity === 'high') {
            return 'critical';
        }
        if (data.type === 'warning' || data.severity === 'medium') {
            return 'warning';
        }
        return 'info';
    }

    /**
     * Format alert message
     */
    formatAlertMessage(source, data) {
        switch (source) {
            case 'performance':
                return `Performance threshold exceeded: ${data.type}`;
            case 'health':
                return `Health check failed: ${data.name}`;
            case 'database':
                return `Database issue: ${data.type}`;
            case 'cache':
                return `Cache issue: ${data.type}`;
            case 'load_balancer':
                return `Load balancer: Server ${data.server?.id} status changed`;
            default:
                return `Alert from ${source}`;
        }
    }

    /**
     * Start dashboard updates
     */
    startDashboardUpdates() {
        setInterval(() => {
            this.updateRecommendations();
        }, 60000); // Update every minute
    }

    /**
     * Update recommendations
     */
    updateRecommendations() {
        this.dashboardData.recommendations = this.getOptimizationRecommendations();
    }

    /**
     * Get component instance
     */
    getComponent(name) {
        switch (name) {
            case 'performance':
            case 'performanceMonitor':
                return this.performanceMonitor;
            case 'health':
            case 'healthChecker':
                return this.healthChecker;
            case 'database':
            case 'databaseOptimizer':
                return this.databaseOptimizer;
            case 'cache':
            case 'cacheManager':
                return this.cacheManager;
            case 'loadBalancer':
                return this.loadBalancer;
            case 'metrics':
            case 'metricsCollector':
                return this.metricsCollector;
            default:
                return null;
        }
    }
}

export default PerformanceSystem;

