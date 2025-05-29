/**
 * @fileoverview Health Monitor - Component status monitoring and health checks
 * @description Provides comprehensive health monitoring for all system components
 */

import { EventEmitter } from 'events';
import { getConfig } from '../../config/orchestrator.js';

/**
 * Health status levels
 */
export const HealthStatus = {
    HEALTHY: 'healthy',
    WARNING: 'warning',
    CRITICAL: 'critical',
    UNKNOWN: 'unknown'
};

/**
 * Health check types
 */
export const HealthCheckType = {
    BASIC: 'basic',
    DETAILED: 'detailed',
    PERFORMANCE: 'performance',
    CONNECTIVITY: 'connectivity'
};

/**
 * Health Monitor Class
 * Monitors component health and provides alerting
 */
export class HealthMonitor extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            interval: 30000, // 30 seconds
            timeout: 5000, // 5 seconds
            retryAttempts: 2,
            alertThreshold: 3, // failures before alert
            enableAlerting: true,
            enableMetrics: true,
            ...options
        };

        this.components = options.components || new Map();
        this.healthStatus = new Map();
        this.healthHistory = new Map();
        this.alertCounts = new Map();
        this.monitoringTimer = null;
        this.initialized = false;

        // Metrics
        this.metrics = {
            checksPerformed: 0,
            checksSucceeded: 0,
            checksFailed: 0,
            alertsSent: 0,
            averageCheckTime: 0,
            totalCheckTime: 0
        };

        // Health check endpoints
        this.endpoints = {
            orchestrator: '/health/orchestrator',
            taskManager: '/health/task-manager',
            eventBus: '/health/events',
            integrations: '/health/integrations',
            ...getConfig('healthChecks.endpoints', {})
        };
    }

    /**
     * Initialize the health monitor
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            this.emit('healthMonitor:initializing');

            // Initialize health status for all components
            this.initializeComponentHealth();

            // Setup health check endpoints
            this.setupHealthEndpoints();

            this.initialized = true;
            this.emit('healthMonitor:initialized');

            console.log('✅ Health Monitor initialized');
        } catch (error) {
            this.emit('healthMonitor:error', error);
            throw new Error(`Failed to initialize Health Monitor: ${error.message}`);
        }
    }

    /**
     * Initialize health status for all components
     */
    initializeComponentHealth() {
        for (const [componentName] of this.components) {
            this.healthStatus.set(componentName, {
                status: HealthStatus.UNKNOWN,
                lastCheck: null,
                lastSuccess: null,
                consecutiveFailures: 0,
                message: 'Not yet checked',
                details: {},
                checkCount: 0,
                successCount: 0,
                failureCount: 0
            });

            this.healthHistory.set(componentName, []);
            this.alertCounts.set(componentName, 0);
        }
    }

    /**
     * Setup health check endpoints
     */
    setupHealthEndpoints() {
        // This would typically integrate with an HTTP server
        // For now, we'll just log the available endpoints
        console.log('🏥 Health check endpoints available:', this.endpoints);
    }

    /**
     * Start health monitoring
     * @returns {Promise<void>}
     */
    async start() {
        if (this.monitoringTimer) {
            return; // Already started
        }

        console.log('🏥 Starting health monitoring...');

        // Perform initial health check
        await this.performHealthChecks();

        // Schedule regular health checks
        this.monitoringTimer = setInterval(async () => {
            try {
                await this.performHealthChecks();
            } catch (error) {
                console.error('❌ Error during scheduled health check:', error);
                this.emit('healthMonitor:error', error);
            }
        }, this.options.interval);

        this.emit('healthMonitor:started');
        console.log(`✅ Health monitoring started (interval: ${this.options.interval}ms)`);
    }

    /**
     * Perform health checks on all components
     * @returns {Promise<Object>} Overall health status
     */
    async performHealthChecks() {
        const startTime = Date.now();
        const results = new Map();

        console.log('🔍 Performing health checks...');

        // Check each component
        for (const [componentName, componentInfo] of this.components) {
            try {
                const result = await this.checkComponentHealth(componentName, componentInfo);
                results.set(componentName, result);
            } catch (error) {
                console.error(`❌ Health check failed for ${componentName}:`, error);
                results.set(componentName, {
                    status: HealthStatus.CRITICAL,
                    message: error.message,
                    timestamp: Date.now()
                });
            }
        }

        // Calculate overall health
        const overallHealth = this.calculateOverallHealth(results);

        // Update metrics
        const checkTime = Date.now() - startTime;
        this.updateMetrics(results, checkTime);

        // Emit health check completed event
        this.emit('healthCheck:completed', {
            overall: overallHealth,
            components: Object.fromEntries(results),
            checkTime,
            timestamp: Date.now()
        });

        return overallHealth;
    }

    /**
     * Check health of a specific component
     * @param {string} componentName - Component name
     * @param {Object} componentInfo - Component information
     * @returns {Promise<Object>} Health check result
     */
    async checkComponentHealth(componentName, componentInfo) {
        const startTime = Date.now();
        let result = {
            status: HealthStatus.UNKNOWN,
            message: 'Health check not implemented',
            details: {},
            timestamp: startTime,
            checkTime: 0
        };

        try {
            const component = componentInfo.instance;

            // Check if component has a health check method
            if (component && typeof component.healthCheck === 'function') {
                const healthResult = await Promise.race([
                    component.healthCheck(),
                    this.createTimeoutPromise(this.options.timeout)
                ]);

                result = {
                    status: healthResult.healthy ? HealthStatus.HEALTHY : HealthStatus.CRITICAL,
                    message: healthResult.message || (healthResult.healthy ? 'Component is healthy' : 'Component is unhealthy'),
                    details: healthResult,
                    timestamp: startTime,
                    checkTime: Date.now() - startTime
                };
            } else {
                // Basic health check - check if component is running
                result = await this.performBasicHealthCheck(componentName, componentInfo);
            }

            // Update component health status
            this.updateComponentHealthStatus(componentName, result);

        } catch (error) {
            result = {
                status: HealthStatus.CRITICAL,
                message: error.message,
                details: { error: error.stack },
                timestamp: startTime,
                checkTime: Date.now() - startTime
            };

            this.handleHealthCheckFailure(componentName, result);
        }

        return result;
    }

    /**
     * Perform basic health check for components without health check method
     * @param {string} componentName - Component name
     * @param {Object} componentInfo - Component information
     * @returns {Promise<Object>} Health check result
     */
    async performBasicHealthCheck(componentName, componentInfo) {
        const component = componentInfo.instance;
        
        // Check if component exists and is in running state
        if (!component) {
            return {
                status: HealthStatus.CRITICAL,
                message: 'Component instance not found',
                details: { componentInfo }
            };
        }

        // Check component state if available
        if (componentInfo.state) {
            switch (componentInfo.state) {
                case 'running':
                    return {
                        status: HealthStatus.HEALTHY,
                        message: 'Component is running',
                        details: { state: componentInfo.state }
                    };
                case 'error':
                    return {
                        status: HealthStatus.CRITICAL,
                        message: 'Component is in error state',
                        details: { 
                            state: componentInfo.state,
                            lastError: componentInfo.lastError 
                        }
                    };
                case 'starting':
                case 'stopping':
                    return {
                        status: HealthStatus.WARNING,
                        message: `Component is ${componentInfo.state}`,
                        details: { state: componentInfo.state }
                    };
                default:
                    return {
                        status: HealthStatus.WARNING,
                        message: `Component state unknown: ${componentInfo.state}`,
                        details: { state: componentInfo.state }
                    };
            }
        }

        // Default to healthy if no specific checks failed
        return {
            status: HealthStatus.HEALTHY,
            message: 'Component appears to be healthy',
            details: { basicCheck: true }
        };
    }

    /**
     * Create timeout promise
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise} Timeout promise
     */
    createTimeoutPromise(timeout) {
        return new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Health check timed out after ${timeout}ms`));
            }, timeout);
        });
    }

    /**
     * Update component health status
     * @param {string} componentName - Component name
     * @param {Object} result - Health check result
     */
    updateComponentHealthStatus(componentName, result) {
        const currentStatus = this.healthStatus.get(componentName);
        
        if (currentStatus) {
            // Update status
            currentStatus.status = result.status;
            currentStatus.lastCheck = result.timestamp;
            currentStatus.message = result.message;
            currentStatus.details = result.details;
            currentStatus.checkCount++;

            if (result.status === HealthStatus.HEALTHY) {
                currentStatus.lastSuccess = result.timestamp;
                currentStatus.consecutiveFailures = 0;
                currentStatus.successCount++;
            } else {
                currentStatus.consecutiveFailures++;
                currentStatus.failureCount++;
            }

            // Add to history
            const history = this.healthHistory.get(componentName);
            history.push({
                ...result,
                consecutiveFailures: currentStatus.consecutiveFailures
            });

            // Maintain history size
            if (history.length > 100) {
                history.splice(0, history.length - 100);
            }
        }
    }

    /**
     * Handle health check failure
     * @param {string} componentName - Component name
     * @param {Object} result - Health check result
     */
    handleHealthCheckFailure(componentName, result) {
        this.updateComponentHealthStatus(componentName, result);

        const currentStatus = this.healthStatus.get(componentName);
        
        // Check if we should send an alert
        if (currentStatus.consecutiveFailures >= this.options.alertThreshold) {
            this.sendAlert(componentName, currentStatus);
        }

        this.emit('component:unhealthy', {
            componentName,
            status: currentStatus,
            result
        });
    }

    /**
     * Send alert for component failure
     * @param {string} componentName - Component name
     * @param {Object} status - Component status
     */
    sendAlert(componentName, status) {
        if (!this.options.enableAlerting) {
            return;
        }

        const alertCount = this.alertCounts.get(componentName) || 0;
        this.alertCounts.set(componentName, alertCount + 1);

        const alert = {
            type: 'component_health_alert',
            componentName,
            status: status.status,
            message: status.message,
            consecutiveFailures: status.consecutiveFailures,
            alertCount: alertCount + 1,
            timestamp: Date.now()
        };

        console.error(`🚨 HEALTH ALERT: ${componentName} - ${status.message} (${status.consecutiveFailures} consecutive failures)`);

        this.emit('alert:sent', alert);
        this.metrics.alertsSent++;
    }

    /**
     * Calculate overall health status
     * @param {Map} results - Component health results
     * @returns {Object} Overall health status
     */
    calculateOverallHealth(results) {
        const statuses = Array.from(results.values()).map(r => r.status);
        
        let overallStatus = HealthStatus.HEALTHY;
        let healthyCount = 0;
        let warningCount = 0;
        let criticalCount = 0;
        let unknownCount = 0;

        statuses.forEach(status => {
            switch (status) {
                case HealthStatus.HEALTHY:
                    healthyCount++;
                    break;
                case HealthStatus.WARNING:
                    warningCount++;
                    break;
                case HealthStatus.CRITICAL:
                    criticalCount++;
                    break;
                default:
                    unknownCount++;
            }
        });

        // Determine overall status
        if (criticalCount > 0) {
            overallStatus = HealthStatus.CRITICAL;
        } else if (warningCount > 0) {
            overallStatus = HealthStatus.WARNING;
        } else if (unknownCount > 0) {
            overallStatus = HealthStatus.UNKNOWN;
        }

        return {
            status: overallStatus,
            summary: {
                total: statuses.length,
                healthy: healthyCount,
                warning: warningCount,
                critical: criticalCount,
                unknown: unknownCount
            },
            message: this.getOverallHealthMessage(overallStatus, healthyCount, statuses.length)
        };
    }

    /**
     * Get overall health message
     * @param {string} status - Overall status
     * @param {number} healthyCount - Number of healthy components
     * @param {number} totalCount - Total number of components
     * @returns {string} Health message
     */
    getOverallHealthMessage(status, healthyCount, totalCount) {
        switch (status) {
            case HealthStatus.HEALTHY:
                return `All ${totalCount} components are healthy`;
            case HealthStatus.WARNING:
                return `${healthyCount}/${totalCount} components are healthy, some have warnings`;
            case HealthStatus.CRITICAL:
                return `${healthyCount}/${totalCount} components are healthy, some are critical`;
            default:
                return `${healthyCount}/${totalCount} components are healthy, some status unknown`;
        }
    }

    /**
     * Update metrics
     * @param {Map} results - Health check results
     * @param {number} checkTime - Total check time
     */
    updateMetrics(results, checkTime) {
        this.metrics.checksPerformed++;
        this.metrics.totalCheckTime += checkTime;
        this.metrics.averageCheckTime = this.metrics.totalCheckTime / this.metrics.checksPerformed;

        let successCount = 0;
        let failureCount = 0;

        for (const result of results.values()) {
            if (result.status === HealthStatus.HEALTHY) {
                successCount++;
            } else {
                failureCount++;
            }
        }

        this.metrics.checksSucceeded += successCount;
        this.metrics.checksFailed += failureCount;
    }

    /**
     * Get health status for a specific component
     * @param {string} componentName - Component name
     * @returns {Object|null} Component health status
     */
    getComponentHealth(componentName) {
        return this.healthStatus.get(componentName) || null;
    }

    /**
     * Get health status for all components
     * @returns {Object} All component health statuses
     */
    getAllComponentHealth() {
        const result = {};
        for (const [componentName, status] of this.healthStatus) {
            result[componentName] = status;
        }
        return result;
    }

    /**
     * Get health history for a component
     * @param {string} componentName - Component name
     * @param {number} limit - Maximum number of entries
     * @returns {Array} Health history
     */
    getComponentHealthHistory(componentName, limit = 50) {
        const history = this.healthHistory.get(componentName) || [];
        return history.slice(-limit);
    }

    /**
     * Get health monitor metrics
     * @returns {Object} Metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            componentsMonitored: this.components.size,
            alertsActive: Array.from(this.alertCounts.values()).reduce((sum, count) => sum + count, 0)
        };
    }

    /**
     * Get health monitor status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            initialized: this.initialized,
            monitoring: !!this.monitoringTimer,
            interval: this.options.interval,
            timeout: this.options.timeout,
            componentsMonitored: this.components.size,
            metrics: this.getMetrics(),
            endpoints: this.endpoints
        };
    }

    /**
     * Health check for the health monitor itself
     * @returns {Promise<Object>} Health status
     */
    async healthCheck() {
        try {
            const status = {
                healthy: true,
                initialized: this.initialized,
                monitoring: !!this.monitoringTimer,
                ...this.getStatus(),
                timestamp: new Date().toISOString()
            };

            // Check if monitoring is working
            if (!this.monitoringTimer && this.initialized) {
                status.healthy = false;
                status.message = 'Health monitoring is not active';
            }

            return status;
        } catch (error) {
            return {
                healthy: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Stop health monitoring
     */
    async stop() {
        try {
            if (this.monitoringTimer) {
                clearInterval(this.monitoringTimer);
                this.monitoringTimer = null;
            }

            this.emit('healthMonitor:stopped');
            console.log('✅ Health Monitor stopped');
        } catch (error) {
            console.error('❌ Error stopping Health Monitor:', error);
            throw error;
        }
    }
}

export default HealthMonitor;

