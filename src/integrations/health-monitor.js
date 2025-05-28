/**
 * @fileoverview Component Health Monitoring
 * @description Component health checking and status reporting system
 */

import EventEmitter from 'events';

/**
 * Health Monitor for component health checking and status reporting
 */
export class HealthMonitor extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            checkInterval: 30000, // 30 seconds
            timeout: 10000, // 10 seconds
            retryAttempts: 3,
            retryDelay: 5000, // 5 seconds
            alertThreshold: 3, // consecutive failures before alert
            ...config
        };

        this.healthChecks = new Map();
        this.healthStatus = new Map();
        this.healthHistory = new Map();
        this.alerts = new Map();
        this.isMonitoring = false;
        this.monitoringTimer = null;
        this.metrics = {
            totalChecks: 0,
            successfulChecks: 0,
            failedChecks: 0,
            averageResponseTime: 0,
            lastCheckTime: null
        };
    }

    /**
     * Initialize the health monitor
     */
    async initialize() {
        try {
            console.log('🏥 Initializing Health Monitor...');

            // Initialize health status tracking
            this._initializeMetrics();

            this.emit('initialized');
            console.log('✅ Health Monitor initialized successfully');

        } catch (error) {
            console.error('❌ Health Monitor initialization failed:', error);
            throw error;
        }
    }

    /**
     * Register a health check for a component
     * @param {string} componentId - Component ID
     * @param {Function} healthCheckFn - Health check function
     * @param {Object} options - Health check options
     */
    async registerHealthCheck(componentId, healthCheckFn, options = {}) {
        if (typeof healthCheckFn !== 'function') {
            throw new Error('Health check must be a function');
        }

        const healthCheck = {
            componentId,
            healthCheckFn,
            options: {
                timeout: options.timeout || this.config.timeout,
                retryAttempts: options.retryAttempts || this.config.retryAttempts,
                retryDelay: options.retryDelay || this.config.retryDelay,
                critical: options.critical || false,
                ...options
            },
            registeredAt: Date.now()
        };

        this.healthChecks.set(componentId, healthCheck);

        // Initialize health status
        this.healthStatus.set(componentId, {
            status: 'unknown',
            lastCheck: null,
            lastSuccess: null,
            lastFailure: null,
            consecutiveFailures: 0,
            responseTime: null,
            details: null
        });

        // Initialize health history
        this.healthHistory.set(componentId, []);

        // Initialize alerts
        this.alerts.set(componentId, {
            active: false,
            count: 0,
            lastAlert: null
        });

        console.log(`✅ Health check registered for component ${componentId}`);

        // Perform initial health check
        await this._performHealthCheck(componentId);
    }

    /**
     * Unregister a health check
     * @param {string} componentId - Component ID
     */
    async unregisterHealthCheck(componentId) {
        this.healthChecks.delete(componentId);
        this.healthStatus.delete(componentId);
        this.healthHistory.delete(componentId);
        this.alerts.delete(componentId);

        console.log(`✅ Health check unregistered for component ${componentId}`);
    }

    /**
     * Start health monitoring
     */
    async startMonitoring() {
        if (this.isMonitoring) {
            console.log('⚠️ Health monitoring already started');
            return;
        }

        console.log('🏥 Starting health monitoring...');

        this.isMonitoring = true;
        this.monitoringTimer = setInterval(() => {
            this._performAllHealthChecks();
        }, this.config.checkInterval);

        // Perform initial health checks
        await this._performAllHealthChecks();

        this.emit('monitoring.started');
        console.log('✅ Health monitoring started successfully');
    }

    /**
     * Stop health monitoring
     */
    async stopMonitoring() {
        if (!this.isMonitoring) {
            return;
        }

        console.log('🛑 Stopping health monitoring...');

        this.isMonitoring = false;
        
        if (this.monitoringTimer) {
            clearInterval(this.monitoringTimer);
            this.monitoringTimer = null;
        }

        this.emit('monitoring.stopped');
        console.log('✅ Health monitoring stopped');
    }

    /**
     * Get health status for a specific component
     * @param {string} componentId - Component ID
     * @returns {Object} Health status
     */
    getComponentHealth(componentId) {
        const status = this.healthStatus.get(componentId);
        if (!status) {
            return { status: 'not_registered' };
        }

        return {
            ...status,
            uptime: this._calculateUptime(componentId),
            availability: this._calculateAvailability(componentId)
        };
    }

    /**
     * Get overall health status
     * @returns {Object} Overall health status
     */
    async getOverallHealth() {
        const components = {};
        let overallStatus = 'healthy';
        let criticalIssues = 0;
        let totalComponents = 0;
        let healthyComponents = 0;

        for (const [componentId, status] of this.healthStatus) {
            totalComponents++;
            
            const componentHealth = this.getComponentHealth(componentId);
            components[componentId] = componentHealth;

            if (componentHealth.status === 'healthy') {
                healthyComponents++;
            } else {
                const healthCheck = this.healthChecks.get(componentId);
                if (healthCheck && healthCheck.options.critical) {
                    criticalIssues++;
                    overallStatus = 'critical';
                } else if (overallStatus === 'healthy') {
                    overallStatus = 'degraded';
                }
            }
        }

        return {
            status: overallStatus,
            summary: {
                totalComponents,
                healthyComponents,
                unhealthyComponents: totalComponents - healthyComponents,
                criticalIssues,
                availability: totalComponents > 0 ? (healthyComponents / totalComponents) * 100 : 0
            },
            components,
            metrics: this.getMetrics(),
            lastCheck: this.metrics.lastCheckTime,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get health metrics
     * @returns {Object} Health metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            successRate: this.metrics.totalChecks > 0 ? 
                (this.metrics.successfulChecks / this.metrics.totalChecks) * 100 : 0,
            failureRate: this.metrics.totalChecks > 0 ? 
                (this.metrics.failedChecks / this.metrics.totalChecks) * 100 : 0,
            activeAlerts: Array.from(this.alerts.values())
                .filter(alert => alert.active).length
        };
    }

    /**
     * Get health history for a component
     * @param {string} componentId - Component ID
     * @param {number} limit - Number of history entries to return
     * @returns {Array} Health history
     */
    getHealthHistory(componentId, limit = 100) {
        const history = this.healthHistory.get(componentId) || [];
        return history.slice(-limit);
    }

    /**
     * Manually trigger health check for a component
     * @param {string} componentId - Component ID
     * @returns {Object} Health check result
     */
    async checkComponentHealth(componentId) {
        return await this._performHealthCheck(componentId);
    }

    /**
     * Shutdown the health monitor
     */
    async shutdown() {
        try {
            console.log('🛑 Shutting down Health Monitor...');

            await this.stopMonitoring();

            // Clear all data
            this.healthChecks.clear();
            this.healthStatus.clear();
            this.healthHistory.clear();
            this.alerts.clear();

            this.emit('shutdown');
            console.log('✅ Health Monitor shutdown completed');

        } catch (error) {
            console.error('❌ Error during health monitor shutdown:', error);
            throw error;
        }
    }

    // Private methods

    /**
     * Initialize metrics
     * @private
     */
    _initializeMetrics() {
        this.metrics = {
            totalChecks: 0,
            successfulChecks: 0,
            failedChecks: 0,
            averageResponseTime: 0,
            lastCheckTime: null,
            responseTimes: []
        };
    }

    /**
     * Perform all health checks
     * @private
     */
    async _performAllHealthChecks() {
        const checkPromises = [];
        
        for (const componentId of this.healthChecks.keys()) {
            checkPromises.push(this._performHealthCheck(componentId));
        }

        await Promise.allSettled(checkPromises);
        this.metrics.lastCheckTime = new Date().toISOString();
    }

    /**
     * Perform health check for a specific component
     * @param {string} componentId - Component ID
     * @returns {Object} Health check result
     * @private
     */
    async _performHealthCheck(componentId) {
        const healthCheck = this.healthChecks.get(componentId);
        if (!healthCheck) {
            throw new Error(`Health check not found for component ${componentId}`);
        }

        const startTime = Date.now();
        let result = {
            componentId,
            status: 'unknown',
            responseTime: null,
            details: null,
            timestamp: new Date().toISOString(),
            error: null
        };

        try {
            // Perform health check with timeout
            const checkPromise = healthCheck.healthCheckFn();
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Health check timeout')), 
                    healthCheck.options.timeout);
            });

            const healthResult = await Promise.race([checkPromise, timeoutPromise]);
            
            const responseTime = Date.now() - startTime;
            
            result = {
                ...result,
                status: healthResult.status || 'healthy',
                responseTime,
                details: healthResult.details || null
            };

            // Update metrics
            this.metrics.totalChecks++;
            this.metrics.successfulChecks++;
            this._updateResponseTime(responseTime);

            // Update component status
            this._updateComponentStatus(componentId, result, true);

        } catch (error) {
            const responseTime = Date.now() - startTime;
            
            result = {
                ...result,
                status: 'unhealthy',
                responseTime,
                error: error.message
            };

            // Update metrics
            this.metrics.totalChecks++;
            this.metrics.failedChecks++;
            this._updateResponseTime(responseTime);

            // Update component status
            this._updateComponentStatus(componentId, result, false);

            // Handle retry logic
            if (healthCheck.options.retryAttempts > 0) {
                await this._retryHealthCheck(componentId, healthCheck.options.retryAttempts);
            }
        }

        // Add to history
        this._addToHistory(componentId, result);

        return result;
    }

    /**
     * Retry health check
     * @param {string} componentId - Component ID
     * @param {number} attemptsLeft - Remaining retry attempts
     * @private
     */
    async _retryHealthCheck(componentId, attemptsLeft) {
        if (attemptsLeft <= 0) {
            return;
        }

        const healthCheck = this.healthChecks.get(componentId);
        if (!healthCheck) {
            return;
        }

        // Wait before retry
        await new Promise(resolve => 
            setTimeout(resolve, healthCheck.options.retryDelay));

        try {
            const result = await this._performHealthCheck(componentId);
            if (result.status === 'healthy') {
                return; // Success, no more retries needed
            }
        } catch (error) {
            // Continue with remaining retries
        }

        // Retry again
        await this._retryHealthCheck(componentId, attemptsLeft - 1);
    }

    /**
     * Update component status
     * @param {string} componentId - Component ID
     * @param {Object} result - Health check result
     * @param {boolean} success - Whether check was successful
     * @private
     */
    _updateComponentStatus(componentId, result, success) {
        const status = this.healthStatus.get(componentId);
        if (!status) {
            return;
        }

        status.status = result.status;
        status.lastCheck = result.timestamp;
        status.responseTime = result.responseTime;
        status.details = result.details;

        if (success) {
            status.lastSuccess = result.timestamp;
            status.consecutiveFailures = 0;
            this._clearAlert(componentId);
        } else {
            status.lastFailure = result.timestamp;
            status.consecutiveFailures++;
            this._checkAlert(componentId, status);
        }

        // Emit health change event
        this.emit('health.changed', {
            componentId,
            status: result.status,
            previousStatus: status.status,
            timestamp: result.timestamp
        });
    }

    /**
     * Check if alert should be triggered
     * @param {string} componentId - Component ID
     * @param {Object} status - Component status
     * @private
     */
    _checkAlert(componentId, status) {
        if (status.consecutiveFailures >= this.config.alertThreshold) {
            const alert = this.alerts.get(componentId);
            if (alert && !alert.active) {
                alert.active = true;
                alert.count++;
                alert.lastAlert = new Date().toISOString();

                this.emit('alert.triggered', {
                    componentId,
                    consecutiveFailures: status.consecutiveFailures,
                    lastFailure: status.lastFailure,
                    timestamp: alert.lastAlert
                });

                console.error(`🚨 Alert triggered for component ${componentId}: ${status.consecutiveFailures} consecutive failures`);
            }
        }
    }

    /**
     * Clear alert for component
     * @param {string} componentId - Component ID
     * @private
     */
    _clearAlert(componentId) {
        const alert = this.alerts.get(componentId);
        if (alert && alert.active) {
            alert.active = false;

            this.emit('alert.cleared', {
                componentId,
                timestamp: new Date().toISOString()
            });

            console.log(`✅ Alert cleared for component ${componentId}`);
        }
    }

    /**
     * Add result to health history
     * @param {string} componentId - Component ID
     * @param {Object} result - Health check result
     * @private
     */
    _addToHistory(componentId, result) {
        const history = this.healthHistory.get(componentId);
        if (history) {
            history.push(result);
            
            // Keep only last 1000 entries
            if (history.length > 1000) {
                history.splice(0, history.length - 1000);
            }
        }
    }

    /**
     * Update response time metrics
     * @param {number} responseTime - Response time in milliseconds
     * @private
     */
    _updateResponseTime(responseTime) {
        this.metrics.responseTimes.push(responseTime);
        
        // Keep only last 100 response times
        if (this.metrics.responseTimes.length > 100) {
            this.metrics.responseTimes.shift();
        }

        // Calculate average
        this.metrics.averageResponseTime = 
            this.metrics.responseTimes.reduce((sum, time) => sum + time, 0) / 
            this.metrics.responseTimes.length;
    }

    /**
     * Calculate component uptime
     * @param {string} componentId - Component ID
     * @returns {number} Uptime percentage
     * @private
     */
    _calculateUptime(componentId) {
        const history = this.healthHistory.get(componentId) || [];
        if (history.length === 0) {
            return 0;
        }

        const healthyChecks = history.filter(check => check.status === 'healthy').length;
        return (healthyChecks / history.length) * 100;
    }

    /**
     * Calculate component availability
     * @param {string} componentId - Component ID
     * @returns {number} Availability percentage
     * @private
     */
    _calculateAvailability(componentId) {
        const status = this.healthStatus.get(componentId);
        if (!status) {
            return 0;
        }

        // For now, same as uptime, but could be calculated differently
        return this._calculateUptime(componentId);
    }
}

export default HealthMonitor;

