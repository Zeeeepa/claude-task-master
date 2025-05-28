/**
 * @fileoverview Health Checker
 * @description System health monitoring and alerting system
 */

import EventEmitter from 'events';
import { performance } from 'perf_hooks';

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
 * Health Checker for comprehensive system health monitoring
 */
export class HealthChecker extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            enabled: config.enabled !== false,
            checkInterval: config.checkInterval || 30000, // 30 seconds
            timeout: config.timeout || 5000, // 5 seconds
            retryAttempts: config.retryAttempts || 3,
            retryDelay: config.retryDelay || 1000,
            thresholds: {
                responseTime: config.thresholds?.responseTime || 2000,
                errorRate: config.thresholds?.errorRate || 10,
                memoryUsage: config.thresholds?.memoryUsage || 90,
                cpuUsage: config.thresholds?.cpuUsage || 85,
                diskUsage: config.thresholds?.diskUsage || 90,
                ...config.thresholds
            },
            ...config
        };

        this.healthChecks = new Map();
        this.healthStatus = new Map();
        this.checkInterval = null;
        this.isRunning = false;
        this.lastCheckTime = null;
        this.alertHistory = [];
    }

    /**
     * Initialize the health checker
     */
    async initialize() {
        if (!this.config.enabled) {
            console.log('Health checking disabled');
            return;
        }

        console.log('Initializing health checker...');
        
        // Register default health checks
        this.registerDefaultHealthChecks();
        
        console.log('Health checker initialized');
    }

    /**
     * Start health monitoring
     */
    start() {
        if (!this.config.enabled || this.isRunning) {
            return;
        }

        console.log('Starting health monitoring...');
        
        // Run initial health check
        this.runAllHealthChecks();
        
        // Set up periodic health checks
        this.checkInterval = setInterval(() => {
            this.runAllHealthChecks();
        }, this.config.checkInterval);
        
        this.isRunning = true;
        this.emit('started');
        
        console.log('Health monitoring started');
    }

    /**
     * Stop health monitoring
     */
    stop() {
        if (!this.isRunning) {
            return;
        }

        console.log('Stopping health monitoring...');
        
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        
        this.isRunning = false;
        this.emit('stopped');
        
        console.log('Health monitoring stopped');
    }

    /**
     * Register a health check
     */
    registerHealthCheck(name, checkFunction, config = {}) {
        const healthCheck = {
            name,
            checkFunction,
            config: {
                timeout: config.timeout || this.config.timeout,
                retryAttempts: config.retryAttempts || this.config.retryAttempts,
                retryDelay: config.retryDelay || this.config.retryDelay,
                critical: config.critical || false,
                ...config
            }
        };

        this.healthChecks.set(name, healthCheck);
        this.healthStatus.set(name, {
            status: HealthStatus.UNKNOWN,
            lastCheck: null,
            lastSuccess: null,
            consecutiveFailures: 0,
            message: 'Not checked yet'
        });

        console.log(`Registered health check: ${name}`);
    }

    /**
     * Unregister a health check
     */
    unregisterHealthCheck(name) {
        this.healthChecks.delete(name);
        this.healthStatus.delete(name);
        console.log(`Unregistered health check: ${name}`);
    }

    /**
     * Run all health checks
     */
    async runAllHealthChecks() {
        const startTime = performance.now();
        this.lastCheckTime = Date.now();
        
        console.log('Running health checks...');
        
        const promises = Array.from(this.healthChecks.keys()).map(name => 
            this.runHealthCheck(name)
        );
        
        const results = await Promise.allSettled(promises);
        const duration = performance.now() - startTime;
        
        // Analyze overall health
        const overallHealth = this.calculateOverallHealth();
        
        this.emit('health_check_completed', {
            duration,
            results: results.map((result, index) => ({
                name: Array.from(this.healthChecks.keys())[index],
                status: result.status,
                value: result.value
            })),
            overallHealth
        });
        
        console.log(`Health checks completed in ${duration.toFixed(2)}ms - Overall: ${overallHealth.status}`);
    }

    /**
     * Run a specific health check
     */
    async runHealthCheck(name) {
        const healthCheck = this.healthChecks.get(name);
        if (!healthCheck) {
            throw new Error(`Health check '${name}' not found`);
        }

        const startTime = performance.now();
        let attempt = 0;
        let lastError = null;

        while (attempt < healthCheck.config.retryAttempts) {
            try {
                const result = await this.executeHealthCheck(healthCheck);
                const duration = performance.now() - startTime;
                
                // Update health status
                this.updateHealthStatus(name, {
                    status: result.status || HealthStatus.HEALTHY,
                    message: result.message || 'Check passed',
                    duration,
                    data: result.data,
                    lastCheck: Date.now(),
                    lastSuccess: Date.now(),
                    consecutiveFailures: 0
                });

                this.emit('health_check_success', { name, result, duration });
                return result;

            } catch (error) {
                lastError = error;
                attempt++;
                
                if (attempt < healthCheck.config.retryAttempts) {
                    await this.delay(healthCheck.config.retryDelay);
                }
            }
        }

        // All attempts failed
        const duration = performance.now() - startTime;
        const currentStatus = this.healthStatus.get(name);
        
        this.updateHealthStatus(name, {
            status: healthCheck.config.critical ? HealthStatus.CRITICAL : HealthStatus.WARNING,
            message: `Check failed: ${lastError.message}`,
            duration,
            error: lastError,
            lastCheck: Date.now(),
            consecutiveFailures: (currentStatus?.consecutiveFailures || 0) + 1
        });

        this.emit('health_check_failure', { name, error: lastError, duration });
        
        // Send alert if critical or too many failures
        if (healthCheck.config.critical || currentStatus?.consecutiveFailures >= 3) {
            this.sendAlert(name, lastError);
        }

        throw lastError;
    }

    /**
     * Execute a health check with timeout
     */
    async executeHealthCheck(healthCheck) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Health check '${healthCheck.name}' timed out`));
            }, healthCheck.config.timeout);

            Promise.resolve(healthCheck.checkFunction())
                .then(result => {
                    clearTimeout(timeout);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timeout);
                    reject(error);
                });
        });
    }

    /**
     * Update health status for a check
     */
    updateHealthStatus(name, update) {
        const current = this.healthStatus.get(name) || {};
        this.healthStatus.set(name, { ...current, ...update });
    }

    /**
     * Calculate overall system health
     */
    calculateOverallHealth() {
        const statuses = Array.from(this.healthStatus.values());
        
        if (statuses.length === 0) {
            return { status: HealthStatus.UNKNOWN, message: 'No health checks configured' };
        }

        const criticalCount = statuses.filter(s => s.status === HealthStatus.CRITICAL).length;
        const warningCount = statuses.filter(s => s.status === HealthStatus.WARNING).length;
        const healthyCount = statuses.filter(s => s.status === HealthStatus.HEALTHY).length;
        const unknownCount = statuses.filter(s => s.status === HealthStatus.UNKNOWN).length;

        let overallStatus = HealthStatus.HEALTHY;
        let message = 'All systems healthy';

        if (criticalCount > 0) {
            overallStatus = HealthStatus.CRITICAL;
            message = `${criticalCount} critical issue(s) detected`;
        } else if (warningCount > 0) {
            overallStatus = HealthStatus.WARNING;
            message = `${warningCount} warning(s) detected`;
        } else if (unknownCount > 0) {
            overallStatus = HealthStatus.UNKNOWN;
            message = `${unknownCount} check(s) in unknown state`;
        }

        return {
            status: overallStatus,
            message,
            summary: {
                total: statuses.length,
                healthy: healthyCount,
                warning: warningCount,
                critical: criticalCount,
                unknown: unknownCount
            }
        };
    }

    /**
     * Send alert for failed health check
     */
    sendAlert(name, error) {
        const alert = {
            timestamp: Date.now(),
            name,
            error: error.message,
            status: this.healthStatus.get(name)?.status || HealthStatus.UNKNOWN
        };

        this.alertHistory.push(alert);
        
        // Keep only last 100 alerts
        if (this.alertHistory.length > 100) {
            this.alertHistory = this.alertHistory.slice(-100);
        }

        this.emit('alert', alert);
        console.error(`HEALTH ALERT: ${name} - ${error.message}`);
    }

    /**
     * Register default health checks
     */
    registerDefaultHealthChecks() {
        // Memory usage check
        this.registerHealthCheck('memory', async () => {
            const usage = process.memoryUsage();
            const totalMem = require('os').totalmem();
            const usedPercent = (usage.rss / totalMem) * 100;
            
            let status = HealthStatus.HEALTHY;
            let message = `Memory usage: ${usedPercent.toFixed(2)}%`;
            
            if (usedPercent > this.config.thresholds.memoryUsage) {
                status = HealthStatus.CRITICAL;
                message += ' (CRITICAL)';
            } else if (usedPercent > this.config.thresholds.memoryUsage * 0.8) {
                status = HealthStatus.WARNING;
                message += ' (WARNING)';
            }
            
            return {
                status,
                message,
                data: { usage, usedPercent }
            };
        }, { critical: true });

        // Event loop lag check
        this.registerHealthCheck('event_loop', async () => {
            const start = performance.now();
            await new Promise(resolve => setImmediate(resolve));
            const lag = performance.now() - start;
            
            let status = HealthStatus.HEALTHY;
            let message = `Event loop lag: ${lag.toFixed(2)}ms`;
            
            if (lag > 100) {
                status = HealthStatus.CRITICAL;
                message += ' (CRITICAL)';
            } else if (lag > 50) {
                status = HealthStatus.WARNING;
                message += ' (WARNING)';
            }
            
            return {
                status,
                message,
                data: { lag }
            };
        });

        // Process uptime check
        this.registerHealthCheck('uptime', async () => {
            const uptime = process.uptime();
            return {
                status: HealthStatus.HEALTHY,
                message: `Process uptime: ${Math.floor(uptime)}s`,
                data: { uptime }
            };
        });
    }

    /**
     * Get health status for a specific check
     */
    getHealthStatus(name) {
        return this.healthStatus.get(name);
    }

    /**
     * Get all health statuses
     */
    getAllHealthStatuses() {
        const result = {};
        for (const [name, status] of this.healthStatus) {
            result[name] = status;
        }
        return result;
    }

    /**
     * Get health summary
     */
    getHealthSummary() {
        const overallHealth = this.calculateOverallHealth();
        const statuses = this.getAllHealthStatuses();
        
        return {
            overall: overallHealth,
            checks: statuses,
            lastCheckTime: this.lastCheckTime,
            isRunning: this.isRunning,
            alertCount: this.alertHistory.length
        };
    }

    /**
     * Get recent alerts
     */
    getRecentAlerts(limit = 10) {
        return this.alertHistory.slice(-limit);
    }

    /**
     * Utility function for delays
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default HealthChecker;

