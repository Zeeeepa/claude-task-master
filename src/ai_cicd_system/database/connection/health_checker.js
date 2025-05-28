/**
 * @fileoverview Database Health Checker
 * @description Advanced health monitoring for database connections
 */

import { log } from '../../../scripts/modules/utils.js';

/**
 * Database health checker with comprehensive monitoring
 */
export class DatabaseHealthChecker {
    constructor(poolManager, config = {}) {
        this.poolManager = poolManager;
        this.config = {
            checkInterval: config.checkInterval || 30000, // 30 seconds
            alertThreshold: config.alertThreshold || 5000, // 5 seconds
            maxFailures: config.maxFailures || 3,
            enableAlerts: config.enableAlerts !== false,
            enableMetrics: config.enableMetrics !== false,
            ...config
        };
        
        this.isRunning = false;
        this.intervalId = null;
        this.consecutiveFailures = 0;
        this.lastHealthCheck = null;
        this.healthHistory = [];
        this.maxHistorySize = 100;
        
        this.alerts = {
            highLatency: false,
            connectionFailure: false,
            poolExhaustion: false
        };
    }

    /**
     * Start health monitoring
     */
    start() {
        if (this.isRunning) {
            log('warn', '[HealthChecker] Already running');
            return;
        }

        this.isRunning = true;
        this.intervalId = setInterval(() => {
            this._performHealthCheck();
        }, this.config.checkInterval);

        log('info', '🏥 Database health monitoring started', {
            interval: this.config.checkInterval,
            alertThreshold: this.config.alertThreshold
        });
    }

    /**
     * Stop health monitoring
     */
    stop() {
        if (!this.isRunning) {
            return;
        }

        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        log('info', '🏥 Database health monitoring stopped');
    }

    /**
     * Perform immediate health check
     * @returns {Promise<object>} Health check result
     */
    async checkHealth() {
        return await this._performHealthCheck();
    }

    /**
     * Get health status summary
     * @returns {object} Health status
     */
    getHealthStatus() {
        const recentChecks = this.healthHistory.slice(-10);
        const avgResponseTime = recentChecks.length > 0 
            ? recentChecks.reduce((sum, check) => sum + (check.responseTime || 0), 0) / recentChecks.length
            : 0;

        const successRate = recentChecks.length > 0
            ? (recentChecks.filter(check => check.isHealthy).length / recentChecks.length) * 100
            : 0;

        return {
            isHealthy: this.consecutiveFailures === 0,
            consecutiveFailures: this.consecutiveFailures,
            lastCheck: this.lastHealthCheck,
            avgResponseTime: Math.round(avgResponseTime),
            successRate: Math.round(successRate),
            alerts: { ...this.alerts },
            recentChecks: recentChecks.slice(-5), // Last 5 checks
            totalChecks: this.healthHistory.length
        };
    }

    /**
     * Get detailed metrics
     * @returns {object} Detailed health metrics
     */
    getDetailedMetrics() {
        const poolMetrics = this.poolManager.getMetrics();
        const healthStatus = this.getHealthStatus();
        
        return {
            ...healthStatus,
            pool: poolMetrics.pool,
            database: {
                totalQueries: poolMetrics.totalQueries,
                successfulQueries: poolMetrics.successfulQueries,
                failedQueries: poolMetrics.failedQueries,
                successRate: poolMetrics.totalQueries > 0 
                    ? Math.round((poolMetrics.successfulQueries / poolMetrics.totalQueries) * 100)
                    : 0
            },
            connections: {
                total: poolMetrics.totalConnections,
                active: poolMetrics.activeConnections
            }
        };
    }

    /**
     * Reset health status and alerts
     */
    reset() {
        this.consecutiveFailures = 0;
        this.alerts = {
            highLatency: false,
            connectionFailure: false,
            poolExhaustion: false
        };
        this.healthHistory = [];
        
        log('info', '🔄 Health checker status reset');
    }

    // Private methods

    /**
     * Perform health check
     * @private
     */
    async _performHealthCheck() {
        const checkStart = Date.now();
        let healthResult;

        try {
            healthResult = await this.poolManager.getHealth();
            const responseTime = Date.now() - checkStart;
            
            const checkResult = {
                timestamp: new Date(),
                isHealthy: healthResult.isHealthy,
                responseTime,
                status: healthResult.status,
                poolInfo: healthResult.pool,
                error: healthResult.error
            };

            this._updateHealthHistory(checkResult);
            this._analyzeHealth(checkResult);
            
            if (healthResult.isHealthy) {
                this.consecutiveFailures = 0;
                this._clearAlert('connectionFailure');
            } else {
                this.consecutiveFailures++;
                this._triggerAlert('connectionFailure', `Health check failed: ${healthResult.error || 'Unknown error'}`);
            }

            this.lastHealthCheck = checkResult.timestamp;
            
            if (this.config.enableMetrics) {
                this._logHealthMetrics(checkResult);
            }

            return checkResult;

        } catch (error) {
            this.consecutiveFailures++;
            
            const checkResult = {
                timestamp: new Date(),
                isHealthy: false,
                responseTime: Date.now() - checkStart,
                status: 'error',
                error: error.message
            };

            this._updateHealthHistory(checkResult);
            this._triggerAlert('connectionFailure', `Health check exception: ${error.message}`);
            
            log('error', '❌ Health check failed', {
                error: error.message,
                consecutiveFailures: this.consecutiveFailures
            });

            return checkResult;
        }
    }

    /**
     * Update health history
     * @private
     */
    _updateHealthHistory(checkResult) {
        this.healthHistory.push(checkResult);
        
        // Keep only recent history
        if (this.healthHistory.length > this.maxHistorySize) {
            this.healthHistory = this.healthHistory.slice(-this.maxHistorySize);
        }
    }

    /**
     * Analyze health trends and trigger alerts
     * @private
     */
    _analyzeHealth(checkResult) {
        // Check for high latency
        if (checkResult.responseTime > this.config.alertThreshold) {
            this._triggerAlert('highLatency', 
                `High response time: ${checkResult.responseTime}ms (threshold: ${this.config.alertThreshold}ms)`);
        } else {
            this._clearAlert('highLatency');
        }

        // Check for pool exhaustion
        if (checkResult.poolInfo) {
            const { totalCount, idleCount, waitingCount } = checkResult.poolInfo;
            const utilizationRate = totalCount > 0 ? ((totalCount - idleCount) / totalCount) * 100 : 0;
            
            if (utilizationRate > 90 || waitingCount > 0) {
                this._triggerAlert('poolExhaustion', 
                    `Pool utilization: ${Math.round(utilizationRate)}%, waiting: ${waitingCount}`);
            } else {
                this._clearAlert('poolExhaustion');
            }
        }

        // Check for consecutive failures
        if (this.consecutiveFailures >= this.config.maxFailures) {
            this._triggerAlert('connectionFailure', 
                `${this.consecutiveFailures} consecutive health check failures`);
        }
    }

    /**
     * Trigger an alert
     * @private
     */
    _triggerAlert(alertType, message) {
        if (!this.config.enableAlerts || this.alerts[alertType]) {
            return; // Alert already active
        }

        this.alerts[alertType] = true;
        
        log('warn', `🚨 Database alert: ${alertType}`, {
            message,
            consecutiveFailures: this.consecutiveFailures,
            timestamp: new Date()
        });

        // Emit alert event if needed
        this._emitAlert(alertType, message);
    }

    /**
     * Clear an alert
     * @private
     */
    _clearAlert(alertType) {
        if (this.alerts[alertType]) {
            this.alerts[alertType] = false;
            
            log('info', `✅ Database alert cleared: ${alertType}`, {
                timestamp: new Date()
            });
        }
    }

    /**
     * Emit alert event (can be extended for external integrations)
     * @private
     */
    _emitAlert(alertType, message) {
        // This can be extended to integrate with external alerting systems
        // like Slack, PagerDuty, email notifications, etc.
        
        if (this.config.onAlert && typeof this.config.onAlert === 'function') {
            this.config.onAlert(alertType, message, {
                consecutiveFailures: this.consecutiveFailures,
                timestamp: new Date()
            });
        }
    }

    /**
     * Log health metrics
     * @private
     */
    _logHealthMetrics(checkResult) {
        const level = checkResult.isHealthy ? 'debug' : 'warn';
        const emoji = checkResult.isHealthy ? '💚' : '💔';
        
        log(level, `${emoji} Health check completed`, {
            status: checkResult.status,
            responseTime: checkResult.responseTime,
            consecutiveFailures: this.consecutiveFailures,
            poolInfo: checkResult.poolInfo
        });
    }
}

export default DatabaseHealthChecker;

