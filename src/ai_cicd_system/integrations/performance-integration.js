/**
 * @fileoverview Performance System Integration
 * @description Integration layer between the AI CI/CD system and the performance monitoring system
 */

import PerformanceSystem from '../../performance-system.js';
import { getPerformanceConfig } from '../../config/performance-config.js';

/**
 * Performance Integration for AI CI/CD System
 */
export class PerformanceIntegration {
    constructor(config = {}) {
        this.config = {
            enabled: config.enabled !== false,
            environment: config.environment || process.env.NODE_ENV || 'development',
            customConfig: config.customConfig || {},
            enableDatabaseOptimization: config.enableDatabaseOptimization !== false,
            enableCaching: config.enableCaching !== false,
            enableLoadBalancing: config.enableLoadBalancing || false,
            ...config
        };

        this.performanceSystem = null;
        this.isInitialized = false;
        this.integrationMetrics = {
            tasksProcessed: 0,
            codegenRequests: 0,
            databaseQueries: 0,
            cacheHits: 0,
            cacheMisses: 0
        };
    }

    /**
     * Initialize performance integration
     */
    async initialize(databaseConnection = null) {
        if (!this.config.enabled) {
            console.log('Performance integration disabled');
            return;
        }

        console.log('Initializing performance integration...');

        try {
            // Get performance configuration
            const performanceConfig = getPerformanceConfig(this.config.environment, {
                enableDatabaseOptimization: this.config.enableDatabaseOptimization,
                enableCaching: this.config.enableCaching,
                enableLoadBalancing: this.config.enableLoadBalancing,
                ...this.config.customConfig
            });

            // Create performance system
            this.performanceSystem = new PerformanceSystem(performanceConfig);

            // Set up integration-specific event handlers
            this.setupEventHandlers();

            // Initialize performance system
            await this.performanceSystem.initialize(databaseConnection);
            await this.performanceSystem.start();

            // Register custom metrics for AI CI/CD system
            this.registerCustomMetrics();

            this.isInitialized = true;
            console.log('✅ Performance integration initialized');

        } catch (error) {
            console.error('Failed to initialize performance integration:', error);
            throw error;
        }
    }

    /**
     * Setup event handlers for integration
     */
    setupEventHandlers() {
        if (!this.performanceSystem) return;

        // Handle performance alerts
        this.performanceSystem.on('alert', (alert) => {
            this.handlePerformanceAlert(alert);
        });

        // Handle component events
        const perfMonitor = this.performanceSystem.getComponent('performance');
        if (perfMonitor) {
            perfMonitor.on('threshold_exceeded', (data) => {
                this.handleThresholdExceeded(data);
            });
        }

        const healthChecker = this.performanceSystem.getComponent('health');
        if (healthChecker) {
            healthChecker.on('alert', (data) => {
                this.handleHealthAlert(data);
            });
        }
    }

    /**
     * Register custom metrics for AI CI/CD system
     */
    registerCustomMetrics() {
        const metricsCollector = this.performanceSystem.getComponent('metrics');
        if (!metricsCollector) return;

        // Task processing metrics
        metricsCollector.defineMetric('aicd_tasks_total', {
            type: 'counter',
            description: 'Total number of tasks processed by AI CI/CD system'
        });

        metricsCollector.defineMetric('aicd_task_duration_ms', {
            type: 'histogram',
            description: 'Task processing duration in milliseconds'
        });

        // Codegen metrics
        metricsCollector.defineMetric('aicd_codegen_requests_total', {
            type: 'counter',
            description: 'Total number of codegen requests'
        });

        metricsCollector.defineMetric('aicd_codegen_duration_ms', {
            type: 'histogram',
            description: 'Codegen request duration in milliseconds'
        });

        // Database metrics
        metricsCollector.defineMetric('aicd_database_queries_total', {
            type: 'counter',
            description: 'Total number of database queries'
        });

        metricsCollector.defineMetric('aicd_database_query_duration_ms', {
            type: 'histogram',
            description: 'Database query duration in milliseconds'
        });

        // Linear integration metrics
        metricsCollector.defineMetric('aicd_linear_api_calls_total', {
            type: 'counter',
            description: 'Total number of Linear API calls'
        });

        metricsCollector.defineMetric('aicd_linear_api_duration_ms', {
            type: 'histogram',
            description: 'Linear API call duration in milliseconds'
        });

        // GitHub integration metrics
        metricsCollector.defineMetric('aicd_github_api_calls_total', {
            type: 'counter',
            description: 'Total number of GitHub API calls'
        });

        metricsCollector.defineMetric('aicd_github_api_duration_ms', {
            type: 'histogram',
            description: 'GitHub API call duration in milliseconds'
        });
    }

    /**
     * Track task processing
     */
    async trackTaskProcessing(taskId, processingFunction) {
        if (!this.isInitialized) {
            return await processingFunction();
        }

        const metricsCollector = this.performanceSystem.getComponent('metrics');
        const perfMonitor = this.performanceSystem.getComponent('performance');

        // Start timing
        const timerId = metricsCollector?.startTimer('aicd_task_duration_ms', { taskId });
        const perfTimerId = perfMonitor?.startTimer(`task_${taskId}`);

        try {
            const result = await processingFunction();

            // Record success metrics
            metricsCollector?.incrementCounter('aicd_tasks_total', 1, { 
                status: 'success',
                taskId 
            });

            this.integrationMetrics.tasksProcessed++;

            return result;

        } catch (error) {
            // Record error metrics
            metricsCollector?.incrementCounter('aicd_tasks_total', 1, { 
                status: 'error',
                taskId,
                error: error.message 
            });

            throw error;

        } finally {
            // End timing
            if (timerId) metricsCollector.endTimer(timerId);
            if (perfTimerId) perfMonitor.endTimer(perfTimerId.name);
        }
    }

    /**
     * Track codegen requests
     */
    async trackCodegenRequest(requestData, codegenFunction) {
        if (!this.isInitialized) {
            return await codegenFunction();
        }

        const metricsCollector = this.performanceSystem.getComponent('metrics');
        const timerId = metricsCollector?.startTimer('aicd_codegen_duration_ms', {
            provider: requestData.provider,
            model: requestData.model
        });

        try {
            const result = await codegenFunction();

            metricsCollector?.incrementCounter('aicd_codegen_requests_total', 1, {
                status: 'success',
                provider: requestData.provider,
                model: requestData.model
            });

            this.integrationMetrics.codegenRequests++;

            return result;

        } catch (error) {
            metricsCollector?.incrementCounter('aicd_codegen_requests_total', 1, {
                status: 'error',
                provider: requestData.provider,
                model: requestData.model,
                error: error.message
            });

            throw error;

        } finally {
            if (timerId) metricsCollector.endTimer(timerId);
        }
    }

    /**
     * Track database operations
     */
    async trackDatabaseOperation(query, params, operationFunction) {
        if (!this.isInitialized) {
            return await operationFunction();
        }

        const dbOptimizer = this.performanceSystem.getComponent('database');
        const metricsCollector = this.performanceSystem.getComponent('metrics');

        // Use database optimizer if available
        if (dbOptimizer && dbOptimizer.isInitialized) {
            const timerId = metricsCollector?.startTimer('aicd_database_query_duration_ms');

            try {
                const result = await dbOptimizer.optimizeQuery(query, params);

                metricsCollector?.incrementCounter('aicd_database_queries_total', 1, {
                    status: 'success'
                });

                this.integrationMetrics.databaseQueries++;

                return result;

            } catch (error) {
                metricsCollector?.incrementCounter('aicd_database_queries_total', 1, {
                    status: 'error',
                    error: error.message
                });

                throw error;

            } finally {
                if (timerId) metricsCollector.endTimer(timerId);
            }
        } else {
            // Fallback to regular operation tracking
            const timerId = metricsCollector?.startTimer('aicd_database_query_duration_ms');

            try {
                const result = await operationFunction();

                metricsCollector?.incrementCounter('aicd_database_queries_total', 1, {
                    status: 'success'
                });

                this.integrationMetrics.databaseQueries++;

                return result;

            } catch (error) {
                metricsCollector?.incrementCounter('aicd_database_queries_total', 1, {
                    status: 'error',
                    error: error.message
                });

                throw error;

            } finally {
                if (timerId) metricsCollector.endTimer(timerId);
            }
        }
    }

    /**
     * Cache operation with performance tracking
     */
    async cacheOperation(key, valueFunction, options = {}) {
        if (!this.isInitialized) {
            return await valueFunction();
        }

        const cacheManager = this.performanceSystem.getComponent('cache');
        if (!cacheManager || !cacheManager.isInitialized) {
            return await valueFunction();
        }

        try {
            const result = await cacheManager.memoize(key, valueFunction, options);
            this.integrationMetrics.cacheHits++;
            return result;

        } catch (error) {
            this.integrationMetrics.cacheMisses++;
            throw error;
        }
    }

    /**
     * Track API calls (Linear, GitHub, etc.)
     */
    async trackApiCall(service, endpoint, apiFunction) {
        if (!this.isInitialized) {
            return await apiFunction();
        }

        const metricsCollector = this.performanceSystem.getComponent('metrics');
        const metricName = `aicd_${service.toLowerCase()}_api_calls_total`;
        const durationMetric = `aicd_${service.toLowerCase()}_api_duration_ms`;

        const timerId = metricsCollector?.startTimer(durationMetric, {
            service,
            endpoint
        });

        try {
            const result = await apiFunction();

            metricsCollector?.incrementCounter(metricName, 1, {
                status: 'success',
                service,
                endpoint
            });

            return result;

        } catch (error) {
            metricsCollector?.incrementCounter(metricName, 1, {
                status: 'error',
                service,
                endpoint,
                error: error.message
            });

            throw error;

        } finally {
            if (timerId) metricsCollector.endTimer(timerId);
        }
    }

    /**
     * Handle performance alerts
     */
    handlePerformanceAlert(alert) {
        console.warn(`🚨 Performance Alert [${alert.severity}]: ${alert.message}`);
        
        // You can integrate with external alerting systems here
        // For example: send to Slack, PagerDuty, etc.
    }

    /**
     * Handle threshold exceeded events
     */
    handleThresholdExceeded(data) {
        console.warn(`⚠️ Performance threshold exceeded: ${data.type} = ${data.value} (threshold: ${data.threshold})`);
        
        // Implement automatic scaling or optimization here
        if (data.type === 'memory_usage' && data.value > 90) {
            this.triggerMemoryOptimization();
        }
    }

    /**
     * Handle health alerts
     */
    handleHealthAlert(data) {
        console.error(`🏥 Health Alert: ${data.name} - ${data.error}`);
        
        // Implement health-based actions here
        // For example: restart services, switch to backup systems, etc.
    }

    /**
     * Trigger memory optimization
     */
    triggerMemoryOptimization() {
        console.log('🧹 Triggering memory optimization...');
        
        // Clear caches if memory usage is high
        const cacheManager = this.performanceSystem.getComponent('cache');
        if (cacheManager) {
            cacheManager.clearAll();
            console.log('✅ Caches cleared to free memory');
        }

        // Force garbage collection if available
        if (global.gc) {
            global.gc();
            console.log('✅ Garbage collection triggered');
        }
    }

    /**
     * Get integration metrics
     */
    getIntegrationMetrics() {
        return {
            ...this.integrationMetrics,
            performanceSystem: this.performanceSystem?.getPerformanceDashboard(),
            isInitialized: this.isInitialized
        };
    }

    /**
     * Get performance dashboard
     */
    getPerformanceDashboard() {
        if (!this.isInitialized) {
            return { error: 'Performance integration not initialized' };
        }

        return this.performanceSystem.getPerformanceDashboard();
    }

    /**
     * Export metrics
     */
    exportMetrics(format = 'json') {
        if (!this.isInitialized) {
            throw new Error('Performance integration not initialized');
        }

        return this.performanceSystem.exportMetrics(format);
    }

    /**
     * Shutdown performance integration
     */
    async shutdown() {
        if (this.performanceSystem && this.performanceSystem.isRunning) {
            await this.performanceSystem.stop();
        }
        
        this.isInitialized = false;
        console.log('Performance integration shut down');
    }
}

export default PerformanceIntegration;

