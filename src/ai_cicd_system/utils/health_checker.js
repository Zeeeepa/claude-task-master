/**
 * @fileoverview Enhanced Health Checking and Monitoring
 * @description Comprehensive health checks with proactive monitoring and alerting
 */

import { log } from './simple_logger.js';
import { defaultErrorHandler } from './error_handler.js';

/**
 * Enhanced health checker with proactive monitoring
 */
export class EnhancedHealthChecker {
    constructor(options = {}) {
        this.checkInterval = options.checkInterval || 30000; // 30 seconds
        this.alertThresholds = options.alertThresholds || {
            responseTime: 5000, // 5 seconds
            errorRate: 0.1, // 10%
            memoryUsage: 0.8, // 80%
            cpuUsage: 0.8 // 80%
        };
        
        this.healthChecks = new Map();
        this.healthHistory = new Map();
        this.alerts = new Map();
        this.isMonitoring = false;
        this.monitoringInterval = null;
    }

    /**
     * Register a health check
     * @param {string} name - Name of the health check
     * @param {Function} checkFn - Function that performs the health check
     * @param {Object} options - Health check options
     */
    registerHealthCheck(name, checkFn, options = {}) {
        this.healthChecks.set(name, {
            checkFn,
            timeout: options.timeout || 5000,
            critical: options.critical || false,
            description: options.description || `Health check for ${name}`,
            tags: options.tags || [],
            lastCheck: null,
            lastResult: null
        });
        
        log('debug', `Registered health check: ${name}`);
    }

    /**
     * Run a specific health check
     * @param {string} name - Name of the health check
     * @returns {Promise<Object>} Health check result
     */
    async runHealthCheck(name) {
        const healthCheck = this.healthChecks.get(name);
        if (!healthCheck) {
            throw new Error(`Health check '${name}' not found`);
        }

        const startTime = Date.now();
        
        try {
            const result = await defaultErrorHandler.executeWithRetry(
                async () => {
                    return await Promise.race([
                        healthCheck.checkFn(),
                        new Promise((_, reject) => {
                            setTimeout(() => reject(new Error('Health check timeout')), healthCheck.timeout);
                        })
                    ]);
                },
                `health-check-${name}`,
                { maxRetries: 1 }
            );

            const duration = Date.now() - startTime;
            const healthResult = {
                name,
                status: 'healthy',
                duration,
                timestamp: new Date().toISOString(),
                details: result || {},
                critical: healthCheck.critical
            };

            healthCheck.lastCheck = Date.now();
            healthCheck.lastResult = healthResult;
            
            this.recordHealthHistory(name, healthResult);
            this.clearAlert(name);
            
            return healthResult;

        } catch (error) {
            const duration = Date.now() - startTime;
            const healthResult = {
                name,
                status: 'unhealthy',
                duration,
                timestamp: new Date().toISOString(),
                error: error.message,
                critical: healthCheck.critical
            };

            healthCheck.lastCheck = Date.now();
            healthCheck.lastResult = healthResult;
            
            this.recordHealthHistory(name, healthResult);
            this.raiseAlert(name, error.message, healthCheck.critical);
            
            return healthResult;
        }
    }

    /**
     * Run all health checks
     * @returns {Promise<Object>} Overall health status
     */
    async runAllHealthChecks() {
        const results = {};
        const promises = [];

        for (const [name] of this.healthChecks) {
            promises.push(
                this.runHealthCheck(name).then(result => {
                    results[name] = result;
                }).catch(error => {
                    results[name] = {
                        name,
                        status: 'error',
                        error: error.message,
                        timestamp: new Date().toISOString()
                    };
                })
            );
        }

        await Promise.all(promises);

        // Calculate overall status
        const healthyCount = Object.values(results).filter(r => r.status === 'healthy').length;
        const unhealthyCount = Object.values(results).filter(r => r.status === 'unhealthy').length;
        const criticalUnhealthy = Object.values(results).filter(r => r.status === 'unhealthy' && r.critical).length;

        let overallStatus = 'healthy';
        if (criticalUnhealthy > 0) {
            overallStatus = 'critical';
        } else if (unhealthyCount > 0) {
            overallStatus = 'degraded';
        }

        return {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            checks: results,
            summary: {
                total: Object.keys(results).length,
                healthy: healthyCount,
                unhealthy: unhealthyCount,
                critical: criticalUnhealthy
            }
        };
    }

    /**
     * Start continuous monitoring
     */
    startMonitoring() {
        if (this.isMonitoring) {
            log('warn', 'Health monitoring is already running');
            return;
        }

        this.isMonitoring = true;
        log('info', `Starting health monitoring with ${this.checkInterval}ms interval`);

        this.monitoringInterval = setInterval(async () => {
            try {
                const healthStatus = await this.runAllHealthChecks();
                this.analyzeHealthTrends();
                
                if (healthStatus.status !== 'healthy') {
                    log('warn', `System health status: ${healthStatus.status}`);
                }
            } catch (error) {
                log('error', `Health monitoring error: ${error.message}`);
            }
        }, this.checkInterval);
    }

    /**
     * Stop continuous monitoring
     */
    stopMonitoring() {
        if (!this.isMonitoring) {
            return;
        }

        this.isMonitoring = false;
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        
        log('info', 'Health monitoring stopped');
    }

    /**
     * Record health check history
     * @param {string} name - Health check name
     * @param {Object} result - Health check result
     */
    recordHealthHistory(name, result) {
        if (!this.healthHistory.has(name)) {
            this.healthHistory.set(name, []);
        }
        
        const history = this.healthHistory.get(name);
        history.push(result);
        
        // Keep only last 100 entries
        if (history.length > 100) {
            history.shift();
        }
    }

    /**
     * Analyze health trends and patterns
     */
    analyzeHealthTrends() {
        for (const [name, history] of this.healthHistory) {
            if (history.length < 5) continue; // Need at least 5 data points
            
            const recent = history.slice(-10); // Last 10 checks
            const unhealthyCount = recent.filter(r => r.status === 'unhealthy').length;
            const avgDuration = recent.reduce((sum, r) => sum + (r.duration || 0), 0) / recent.length;
            
            // Check for degrading performance
            if (avgDuration > this.alertThresholds.responseTime) {
                this.raiseAlert(name, `Average response time (${avgDuration}ms) exceeds threshold`, false);
            }
            
            // Check for high error rate
            const errorRate = unhealthyCount / recent.length;
            if (errorRate > this.alertThresholds.errorRate) {
                this.raiseAlert(name, `Error rate (${(errorRate * 100).toFixed(1)}%) exceeds threshold`, true);
            }
        }
    }

    /**
     * Raise an alert
     * @param {string} component - Component name
     * @param {string} message - Alert message
     * @param {boolean} critical - Whether alert is critical
     */
    raiseAlert(component, message, critical = false) {
        const alertKey = `${component}-${message}`;
        
        if (this.alerts.has(alertKey)) {
            // Update existing alert
            const alert = this.alerts.get(alertKey);
            alert.count++;
            alert.lastOccurrence = new Date().toISOString();
        } else {
            // Create new alert
            const alert = {
                component,
                message,
                critical,
                count: 1,
                firstOccurrence: new Date().toISOString(),
                lastOccurrence: new Date().toISOString(),
                resolved: false
            };
            
            this.alerts.set(alertKey, alert);
            
            const level = critical ? 'error' : 'warn';
            log(level, `ALERT [${component}]: ${message}`);
        }
    }

    /**
     * Clear an alert
     * @param {string} component - Component name
     */
    clearAlert(component) {
        const alertsToRemove = [];
        
        for (const [key, alert] of this.alerts) {
            if (alert.component === component && !alert.resolved) {
                alert.resolved = true;
                alert.resolvedAt = new Date().toISOString();
                alertsToRemove.push(key);
                
                log('info', `RESOLVED [${component}]: Alert cleared`);
            }
        }
        
        // Remove resolved alerts after some time
        setTimeout(() => {
            alertsToRemove.forEach(key => this.alerts.delete(key));
        }, 300000); // 5 minutes
    }

    /**
     * Get current alerts
     * @returns {Array} Active alerts
     */
    getActiveAlerts() {
        return Array.from(this.alerts.values()).filter(alert => !alert.resolved);
    }

    /**
     * Get health metrics
     * @returns {Object} Health metrics
     */
    getHealthMetrics() {
        const metrics = {
            systemHealth: {},
            performance: {},
            alerts: {
                active: this.getActiveAlerts().length,
                critical: this.getActiveAlerts().filter(a => a.critical).length
            },
            checks: {}
        };

        // System health overview
        for (const [name, healthCheck] of this.healthChecks) {
            if (healthCheck.lastResult) {
                metrics.checks[name] = {
                    status: healthCheck.lastResult.status,
                    lastCheck: healthCheck.lastCheck,
                    duration: healthCheck.lastResult.duration
                };
            }
        }

        // Performance metrics
        const allHistory = Array.from(this.healthHistory.values()).flat();
        if (allHistory.length > 0) {
            const avgDuration = allHistory.reduce((sum, r) => sum + (r.duration || 0), 0) / allHistory.length;
            const successRate = allHistory.filter(r => r.status === 'healthy').length / allHistory.length;
            
            metrics.performance = {
                averageResponseTime: Math.round(avgDuration),
                successRate: Math.round(successRate * 100) / 100,
                totalChecks: allHistory.length
            };
        }

        return metrics;
    }

    /**
     * Get detailed health report
     * @returns {Object} Detailed health report
     */
    getDetailedHealthReport() {
        return {
            timestamp: new Date().toISOString(),
            monitoring: {
                active: this.isMonitoring,
                interval: this.checkInterval,
                registeredChecks: this.healthChecks.size
            },
            metrics: this.getHealthMetrics(),
            alerts: {
                active: this.getActiveAlerts(),
                history: Array.from(this.alerts.values())
            },
            circuitBreakers: defaultErrorHandler.getAllCircuitBreakerStatuses(),
            systemResources: this.getSystemResources()
        };
    }

    /**
     * Get system resource usage
     * @returns {Object} System resource metrics
     */
    getSystemResources() {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        return {
            memory: {
                used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
                total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
                external: Math.round(memUsage.external / 1024 / 1024), // MB
                rss: Math.round(memUsage.rss / 1024 / 1024) // MB
            },
            cpu: {
                user: cpuUsage.user,
                system: cpuUsage.system
            },
            uptime: Math.round(process.uptime()),
            nodeVersion: process.version,
            platform: process.platform
        };
    }
}

/**
 * Create default health checks for common components
 * @param {EnhancedHealthChecker} healthChecker - Health checker instance
 */
export function registerDefaultHealthChecks(healthChecker) {
    // Memory usage check
    healthChecker.registerHealthCheck('memory', async () => {
        const memUsage = process.memoryUsage();
        const usedMB = memUsage.heapUsed / 1024 / 1024;
        const totalMB = memUsage.heapTotal / 1024 / 1024;
        const usage = usedMB / totalMB;
        
        return {
            usedMB: Math.round(usedMB),
            totalMB: Math.round(totalMB),
            usage: Math.round(usage * 100) / 100,
            status: usage < 0.8 ? 'ok' : 'high'
        };
    }, { critical: true, description: 'Memory usage monitoring' });

    // Event loop lag check
    healthChecker.registerHealthCheck('eventLoop', async () => {
        const start = process.hrtime.bigint();
        await new Promise(resolve => setImmediate(resolve));
        const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms
        
        return {
            lagMs: Math.round(lag * 100) / 100,
            status: lag < 10 ? 'ok' : 'high'
        };
    }, { critical: false, description: 'Event loop lag monitoring' });

    // Process uptime check
    healthChecker.registerHealthCheck('uptime', async () => {
        const uptime = process.uptime();
        
        return {
            uptimeSeconds: Math.round(uptime),
            uptimeHours: Math.round(uptime / 3600 * 100) / 100,
            status: 'ok'
        };
    }, { critical: false, description: 'Process uptime monitoring' });
}

// Create default health checker instance
export const defaultHealthChecker = new EnhancedHealthChecker();

