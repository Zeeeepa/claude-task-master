/**
 * @fileoverview Database Health Monitor
 * @description Real-time connection health monitoring and automatic recovery system
 */

import { EventEmitter } from 'events';
import { getPoolManager } from './connection_pool.js';
import { log } from '../../../scripts/modules/utils.js';

/**
 * Database Health Monitor
 * Provides real-time health monitoring, alerting, and automatic recovery
 */
export class DatabaseHealthMonitor extends EventEmitter {
    constructor(options = {}) {
        super();
        this.poolManager = options.poolManager || getPoolManager();
        this.config = {
            checkInterval: options.checkInterval || 30000, // 30 seconds
            alertThresholds: {
                connectionUtilization: options.connectionUtilization || 0.8,
                responseTime: options.responseTime || 5000, // 5 seconds
                errorRate: options.errorRate || 0.05, // 5%
                queueLength: options.queueLength || 10
            },
            recovery: {
                enabled: options.enableRecovery !== false,
                maxRetries: options.maxRetries || 3,
                retryDelay: options.retryDelay || 5000,
                escalationDelay: options.escalationDelay || 60000
            },
            notifications: {
                enabled: options.enableNotifications !== false,
                channels: options.notificationChannels || ['log', 'event'],
                cooldownPeriod: options.notificationCooldown || 300000 // 5 minutes
            }
        };
        
        this.isMonitoring = false;
        this.monitoringInterval = null;
        this.healthHistory = [];
        this.alertHistory = [];
        this.recoveryAttempts = new Map();
        this.lastNotifications = new Map();
        this.currentHealth = {
            status: 'unknown',
            timestamp: null,
            metrics: {},
            issues: []
        };
    }

    /**
     * Start health monitoring
     * @returns {Promise<void>}
     */
    async startMonitoring() {
        if (this.isMonitoring) {
            log('warn', 'Health monitoring already started');
            return;
        }

        log('info', 'Starting database health monitoring...');
        
        this.isMonitoring = true;
        
        // Perform initial health check
        await this._performHealthCheck();
        
        // Start periodic monitoring
        this.monitoringInterval = setInterval(async () => {
            try {
                await this._performHealthCheck();
            } catch (error) {
                log('error', `Health check failed: ${error.message}`);
                this._handleHealthCheckFailure(error);
            }
        }, this.config.checkInterval);

        this.emit('monitoring:started');
        log('info', `Health monitoring started (interval: ${this.config.checkInterval}ms)`);
    }

    /**
     * Stop health monitoring
     * @returns {Promise<void>}
     */
    async stopMonitoring() {
        if (!this.isMonitoring) {
            return;
        }

        log('info', 'Stopping database health monitoring...');
        
        this.isMonitoring = false;
        
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        this.emit('monitoring:stopped');
        log('info', 'Health monitoring stopped');
    }

    /**
     * Get current health status
     * @returns {Object} Current health status
     */
    getCurrentHealth() {
        return {
            ...this.currentHealth,
            monitoring: this.isMonitoring,
            lastCheck: this.healthHistory[this.healthHistory.length - 1]?.timestamp,
            recentAlerts: this.alertHistory.slice(-5)
        };
    }

    /**
     * Get health history
     * @param {number} limit - Number of records to return
     * @returns {Array} Health history
     */
    getHealthHistory(limit = 50) {
        return this.healthHistory.slice(-limit);
    }

    /**
     * Get alert history
     * @param {number} limit - Number of alerts to return
     * @returns {Array} Alert history
     */
    getAlertHistory(limit = 20) {
        return this.alertHistory.slice(-limit);
    }

    /**
     * Force a health check
     * @returns {Promise<Object>} Health check result
     */
    async forceHealthCheck() {
        log('info', 'Performing forced health check...');
        return await this._performHealthCheck();
    }

    /**
     * Get comprehensive health report
     * @returns {Object} Health report
     */
    getHealthReport() {
        const recentHistory = this.healthHistory.slice(-10);
        const recentAlerts = this.alertHistory.slice(-10);
        
        // Calculate trends
        const trends = this._calculateHealthTrends(recentHistory);
        
        // Calculate uptime
        const uptime = this._calculateUptime();
        
        // Get performance metrics
        const performance = this._getPerformanceMetrics();
        
        return {
            current: this.getCurrentHealth(),
            trends,
            uptime,
            performance,
            alerts: {
                total: this.alertHistory.length,
                recent: recentAlerts,
                byType: this._groupAlertsByType(recentAlerts)
            },
            recovery: {
                attempts: Array.from(this.recoveryAttempts.entries()),
                successRate: this._calculateRecoverySuccessRate()
            },
            recommendations: this._generateHealthRecommendations()
        };
    }

    // Private methods

    /**
     * Perform comprehensive health check
     * @private
     */
    async _performHealthCheck() {
        const startTime = Date.now();
        const healthData = {
            timestamp: new Date(),
            status: 'healthy',
            metrics: {},
            issues: [],
            pools: {}
        };

        try {
            // Get pool statistics
            const poolStats = this.poolManager.getPoolStats();
            healthData.pools = poolStats.pools;
            healthData.metrics = poolStats.metrics;

            // Check each pool individually
            for (const [poolName, poolInfo] of Object.entries(poolStats.pools)) {
                const poolHealth = await this._checkPoolHealth(poolName, poolInfo);
                healthData.pools[poolName].health = poolHealth;
                
                if (poolHealth.issues.length > 0) {
                    healthData.issues.push(...poolHealth.issues.map(issue => ({
                        ...issue,
                        pool: poolName
                    })));
                }
            }

            // Perform connectivity test
            const connectivityTest = await this._testConnectivity();
            healthData.connectivity = connectivityTest;
            
            if (!connectivityTest.success) {
                healthData.issues.push({
                    type: 'connectivity',
                    severity: 'critical',
                    message: connectivityTest.error,
                    timestamp: new Date()
                });
            }

            // Check performance metrics
            const performanceIssues = this._checkPerformanceMetrics(healthData.metrics);
            healthData.issues.push(...performanceIssues);

            // Determine overall health status
            healthData.status = this._determineOverallHealth(healthData.issues);
            healthData.responseTime = Date.now() - startTime;

            // Store health data
            this.currentHealth = healthData;
            this.healthHistory.push(healthData);
            
            // Trim history to prevent memory leaks
            if (this.healthHistory.length > 1000) {
                this.healthHistory = this.healthHistory.slice(-500);
            }

            // Process alerts
            await this._processHealthAlerts(healthData);

            this.emit('health:checked', healthData);
            
            return healthData;

        } catch (error) {
            const errorHealth = {
                timestamp: new Date(),
                status: 'critical',
                error: error.message,
                responseTime: Date.now() - startTime,
                issues: [{
                    type: 'health_check_failure',
                    severity: 'critical',
                    message: `Health check failed: ${error.message}`,
                    timestamp: new Date()
                }]
            };

            this.currentHealth = errorHealth;
            this.healthHistory.push(errorHealth);
            
            this.emit('health:check:failed', errorHealth);
            throw error;
        }
    }

    /**
     * Check individual pool health
     * @param {string} poolName - Pool name
     * @param {Object} poolInfo - Pool information
     * @private
     */
    async _checkPoolHealth(poolName, poolInfo) {
        const issues = [];
        const metrics = {};

        // Check connection utilization
        const utilizationRate = poolInfo.totalCount > 0 
            ? (poolInfo.totalCount - poolInfo.idleCount) / poolInfo.totalCount 
            : 0;
        
        metrics.utilizationRate = utilizationRate;

        if (utilizationRate > this.config.alertThresholds.connectionUtilization) {
            issues.push({
                type: 'high_utilization',
                severity: utilizationRate > 0.95 ? 'critical' : 'warning',
                message: `High connection utilization: ${Math.round(utilizationRate * 100)}%`,
                value: utilizationRate,
                threshold: this.config.alertThresholds.connectionUtilization,
                timestamp: new Date()
            });
        }

        // Check waiting queue
        if (poolInfo.waitingCount > this.config.alertThresholds.queueLength) {
            issues.push({
                type: 'high_queue_length',
                severity: poolInfo.waitingCount > this.config.alertThresholds.queueLength * 2 ? 'critical' : 'warning',
                message: `High queue length: ${poolInfo.waitingCount} waiting connections`,
                value: poolInfo.waitingCount,
                threshold: this.config.alertThresholds.queueLength,
                timestamp: new Date()
            });
        }

        // Check for connection leaks (no idle connections but high total count)
        if (poolInfo.idleCount === 0 && poolInfo.totalCount > poolInfo.totalCount * 0.8) {
            issues.push({
                type: 'potential_leak',
                severity: 'warning',
                message: `Potential connection leak: ${poolInfo.totalCount} total, ${poolInfo.idleCount} idle`,
                timestamp: new Date()
            });
        }

        return {
            status: issues.length === 0 ? 'healthy' : 
                   issues.some(i => i.severity === 'critical') ? 'critical' : 'warning',
            issues,
            metrics
        };
    }

    /**
     * Test database connectivity
     * @private
     */
    async _testConnectivity() {
        try {
            const startTime = Date.now();
            const result = await this.poolManager.query('SELECT 1 as health_check, NOW() as server_time');
            const responseTime = Date.now() - startTime;

            return {
                success: true,
                responseTime,
                serverTime: result.rows[0].server_time
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                responseTime: null
            };
        }
    }

    /**
     * Check performance metrics for issues
     * @param {Object} metrics - Performance metrics
     * @private
     */
    _checkPerformanceMetrics(metrics) {
        const issues = [];

        // Check average response time
        if (metrics.avgResponseTime > this.config.alertThresholds.responseTime) {
            issues.push({
                type: 'slow_response',
                severity: metrics.avgResponseTime > this.config.alertThresholds.responseTime * 2 ? 'critical' : 'warning',
                message: `Slow average response time: ${Math.round(metrics.avgResponseTime)}ms`,
                value: metrics.avgResponseTime,
                threshold: this.config.alertThresholds.responseTime,
                timestamp: new Date()
            });
        }

        // Check error rate
        const errorRate = metrics.totalQueries > 0 
            ? (metrics.totalQueries - metrics.successfulQueries) / metrics.totalQueries 
            : 0;

        if (errorRate > this.config.alertThresholds.errorRate) {
            issues.push({
                type: 'high_error_rate',
                severity: errorRate > this.config.alertThresholds.errorRate * 2 ? 'critical' : 'warning',
                message: `High error rate: ${Math.round(errorRate * 100)}%`,
                value: errorRate,
                threshold: this.config.alertThresholds.errorRate,
                timestamp: new Date()
            });
        }

        return issues;
    }

    /**
     * Determine overall health status
     * @param {Array} issues - Health issues
     * @private
     */
    _determineOverallHealth(issues) {
        if (issues.length === 0) return 'healthy';
        
        const hasCritical = issues.some(issue => issue.severity === 'critical');
        if (hasCritical) return 'critical';
        
        const hasWarning = issues.some(issue => issue.severity === 'warning');
        if (hasWarning) return 'warning';
        
        return 'healthy';
    }

    /**
     * Process health alerts
     * @param {Object} healthData - Health check data
     * @private
     */
    async _processHealthAlerts(healthData) {
        for (const issue of healthData.issues) {
            const alertKey = `${issue.type}_${issue.pool || 'global'}`;
            const lastNotification = this.lastNotifications.get(alertKey);
            
            // Check cooldown period
            if (lastNotification && 
                Date.now() - lastNotification < this.config.notifications.cooldownPeriod) {
                continue;
            }

            // Create alert
            const alert = {
                id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                ...issue,
                healthStatus: healthData.status,
                timestamp: new Date()
            };

            this.alertHistory.push(alert);
            this.lastNotifications.set(alertKey, Date.now());

            // Emit alert event
            this.emit('alert:created', alert);

            // Send notifications
            if (this.config.notifications.enabled) {
                await this._sendNotification(alert);
            }

            // Attempt recovery if enabled
            if (this.config.recovery.enabled && issue.severity === 'critical') {
                await this._attemptRecovery(issue);
            }
        }

        // Trim alert history
        if (this.alertHistory.length > 500) {
            this.alertHistory = this.alertHistory.slice(-250);
        }
    }

    /**
     * Send notification for alert
     * @param {Object} alert - Alert to notify about
     * @private
     */
    async _sendNotification(alert) {
        const message = `Database Alert [${alert.severity.toUpperCase()}]: ${alert.message}`;
        
        for (const channel of this.config.notifications.channels) {
            try {
                switch (channel) {
                    case 'log':
                        log(alert.severity === 'critical' ? 'error' : 'warn', message);
                        break;
                    case 'event':
                        this.emit('notification:sent', { channel, alert, message });
                        break;
                    // Additional notification channels can be added here
                }
            } catch (error) {
                log('error', `Failed to send notification via ${channel}: ${error.message}`);
            }
        }
    }

    /**
     * Attempt automatic recovery
     * @param {Object} issue - Issue to recover from
     * @private
     */
    async _attemptRecovery(issue) {
        const recoveryKey = `${issue.type}_${issue.pool || 'global'}`;
        const attempts = this.recoveryAttempts.get(recoveryKey) || { count: 0, lastAttempt: 0 };
        
        // Check if we've exceeded max retries
        if (attempts.count >= this.config.recovery.maxRetries) {
            log('error', `Max recovery attempts exceeded for ${recoveryKey}`);
            return;
        }

        // Check retry delay
        if (Date.now() - attempts.lastAttempt < this.config.recovery.retryDelay) {
            return;
        }

        attempts.count++;
        attempts.lastAttempt = Date.now();
        this.recoveryAttempts.set(recoveryKey, attempts);

        log('info', `Attempting recovery for ${recoveryKey} (attempt ${attempts.count}/${this.config.recovery.maxRetries})`);

        try {
            let recoverySuccess = false;

            switch (issue.type) {
                case 'connectivity':
                    recoverySuccess = await this._recoverConnectivity();
                    break;
                case 'high_utilization':
                    recoverySuccess = await this._recoverHighUtilization(issue.pool);
                    break;
                case 'potential_leak':
                    recoverySuccess = await this._recoverConnectionLeak(issue.pool);
                    break;
                default:
                    log('warn', `No recovery strategy for issue type: ${issue.type}`);
                    return;
            }

            if (recoverySuccess) {
                log('info', `Recovery successful for ${recoveryKey}`);
                this.recoveryAttempts.delete(recoveryKey);
                this.emit('recovery:success', { issue, attempts: attempts.count });
            } else {
                log('warn', `Recovery failed for ${recoveryKey}`);
                this.emit('recovery:failed', { issue, attempts: attempts.count });
            }

        } catch (error) {
            log('error', `Recovery attempt failed for ${recoveryKey}: ${error.message}`);
            this.emit('recovery:error', { issue, error, attempts: attempts.count });
        }
    }

    /**
     * Recover connectivity issues
     * @private
     */
    async _recoverConnectivity() {
        try {
            // Test connectivity with a simple query
            await this.poolManager.query('SELECT 1');
            return true;
        } catch (error) {
            log('error', `Connectivity recovery failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Recover from high utilization
     * @param {string} poolName - Pool name
     * @private
     */
    async _recoverHighUtilization(poolName) {
        // This would typically involve scaling up the pool or optimizing queries
        // For now, we'll just log the attempt
        log('info', `Attempting to recover high utilization for pool ${poolName}`);
        
        // In a real implementation, this might:
        // 1. Temporarily increase pool size
        // 2. Kill long-running queries
        // 3. Implement connection throttling
        
        return false; // Placeholder - actual recovery logic would go here
    }

    /**
     * Recover from connection leaks
     * @param {string} poolName - Pool name
     * @private
     */
    async _recoverConnectionLeak(poolName) {
        log('info', `Attempting to recover connection leak for pool ${poolName}`);
        
        // In a real implementation, this might:
        // 1. Force close idle connections
        // 2. Restart the pool
        // 3. Analyze and kill problematic connections
        
        return false; // Placeholder - actual recovery logic would go here
    }

    /**
     * Handle health check failures
     * @param {Error} error - Health check error
     * @private
     */
    _handleHealthCheckFailure(error) {
        const alert = {
            id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'health_check_failure',
            severity: 'critical',
            message: `Health monitoring failed: ${error.message}`,
            timestamp: new Date()
        };

        this.alertHistory.push(alert);
        this.emit('alert:created', alert);
    }

    /**
     * Calculate health trends
     * @param {Array} history - Health history
     * @private
     */
    _calculateHealthTrends(history) {
        if (history.length < 2) return {};

        const recent = history.slice(-5);
        const older = history.slice(-10, -5);

        const recentAvgResponse = recent.reduce((sum, h) => sum + (h.responseTime || 0), 0) / recent.length;
        const olderAvgResponse = older.length > 0 
            ? older.reduce((sum, h) => sum + (h.responseTime || 0), 0) / older.length 
            : recentAvgResponse;

        return {
            responseTime: {
                current: recentAvgResponse,
                trend: recentAvgResponse > olderAvgResponse ? 'increasing' : 'decreasing',
                change: Math.abs(recentAvgResponse - olderAvgResponse)
            },
            healthStatus: {
                recent: recent.map(h => h.status),
                stability: this._calculateStability(recent.map(h => h.status))
            }
        };
    }

    /**
     * Calculate uptime percentage
     * @private
     */
    _calculateUptime() {
        if (this.healthHistory.length === 0) return 100;

        const healthyChecks = this.healthHistory.filter(h => h.status === 'healthy').length;
        return (healthyChecks / this.healthHistory.length) * 100;
    }

    /**
     * Get performance metrics summary
     * @private
     */
    _getPerformanceMetrics() {
        const poolStats = this.poolManager.getPoolStats();
        return {
            ...poolStats.metrics,
            poolPerformance: poolStats.performance
        };
    }

    /**
     * Group alerts by type
     * @param {Array} alerts - Alert array
     * @private
     */
    _groupAlertsByType(alerts) {
        return alerts.reduce((groups, alert) => {
            groups[alert.type] = (groups[alert.type] || 0) + 1;
            return groups;
        }, {});
    }

    /**
     * Calculate recovery success rate
     * @private
     */
    _calculateRecoverySuccessRate() {
        // This would be calculated based on recovery attempt history
        // Placeholder implementation
        return 0;
    }

    /**
     * Generate health recommendations
     * @private
     */
    _generateHealthRecommendations() {
        const recommendations = [];
        const currentHealth = this.getCurrentHealth();

        if (currentHealth.status !== 'healthy') {
            recommendations.push({
                type: 'immediate',
                priority: 'high',
                message: 'Database health is degraded - investigate current issues',
                actions: ['Check connection pools', 'Review recent queries', 'Monitor resource usage']
            });
        }

        // Add more recommendation logic based on patterns and metrics
        
        return recommendations;
    }

    /**
     * Calculate stability score
     * @param {Array} statuses - Array of health statuses
     * @private
     */
    _calculateStability(statuses) {
        if (statuses.length === 0) return 100;
        
        const healthyCount = statuses.filter(s => s === 'healthy').length;
        return (healthyCount / statuses.length) * 100;
    }
}

// Singleton instance
let healthMonitor = null;

/**
 * Get health monitor instance (singleton)
 * @returns {DatabaseHealthMonitor} Health monitor instance
 */
export function getHealthMonitor() {
    if (!healthMonitor) {
        healthMonitor = new DatabaseHealthMonitor();
    }
    return healthMonitor;
}

/**
 * Initialize health monitor
 * @param {Object} options - Initialization options
 * @returns {Promise<DatabaseHealthMonitor>} Initialized health monitor
 */
export async function initializeHealthMonitor(options = {}) {
    const monitor = getHealthMonitor();
    await monitor.startMonitoring();
    return monitor;
}

export default DatabaseHealthMonitor;

