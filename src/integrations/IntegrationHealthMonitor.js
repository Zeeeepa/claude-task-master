/**
 * @fileoverview Integration Health Monitor
 * @description Comprehensive health monitoring for all integration services
 */

import EventEmitter from 'events';
import { integrationConfig } from '../config/integrations.js';

/**
 * Integration Health Monitor Service
 * Monitors health, performance, and availability of all integration services
 */
export class IntegrationHealthMonitor extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            ...integrationConfig.healthMonitor,
            ...config
        };
        
        this.services = new Map();
        this.healthHistory = new Map();
        this.alerts = [];
        this.isMonitoring = false;
        this.monitoringInterval = null;
        
        this.metrics = {
            totalChecks: 0,
            healthyServices: 0,
            unhealthyServices: 0,
            lastCheck: null,
            averageResponseTime: 0,
            alertsTriggered: 0
        };
        
        // Health status definitions
        this.healthStatuses = {
            HEALTHY: 'healthy',
            DEGRADED: 'degraded',
            UNHEALTHY: 'unhealthy',
            UNKNOWN: 'unknown'
        };
        
        // Alert types
        this.alertTypes = {
            SERVICE_DOWN: 'service_down',
            HIGH_LATENCY: 'high_latency',
            HIGH_ERROR_RATE: 'high_error_rate',
            CIRCUIT_BREAKER_OPEN: 'circuit_breaker_open',
            RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
            SERVICE_RECOVERED: 'service_recovered'
        };
    }
    
    /**
     * Initialize the health monitor
     */
    async initialize() {
        try {
            // Register default services
            this.registerDefaultServices();
            
            // Start monitoring
            await this.startMonitoring();
            
            this.emit('initialized');
            console.log('Integration health monitor initialized successfully');
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to initialize health monitor: ${error.message}`);
        }
    }
    
    /**
     * Register a service for monitoring
     */
    registerService(serviceName, healthChecker, config = {}) {
        const serviceConfig = {
            name: serviceName,
            healthChecker,
            checkInterval: config.checkInterval || this.config.checkInterval,
            timeout: config.timeout || 10000,
            retryAttempts: config.retryAttempts || 3,
            alertThreshold: config.alertThreshold || this.config.alertThreshold,
            enabled: config.enabled !== false,
            metadata: config.metadata || {}
        };
        
        this.services.set(serviceName, {
            ...serviceConfig,
            status: this.healthStatuses.UNKNOWN,
            lastCheck: null,
            consecutiveFailures: 0,
            responseTime: 0,
            uptime: 0,
            downtime: 0,
            lastStatusChange: Date.now(),
            metrics: {
                totalChecks: 0,
                successfulChecks: 0,
                failedChecks: 0,
                averageResponseTime: 0,
                lastError: null
            }
        });
        
        this.healthHistory.set(serviceName, []);
        
        this.emit('service.registered', { serviceName, config: serviceConfig });
        
        return serviceName;
    }
    
    /**
     * Unregister a service
     */
    unregisterService(serviceName) {
        const removed = this.services.delete(serviceName);
        this.healthHistory.delete(serviceName);
        
        if (removed) {
            this.emit('service.unregistered', { serviceName });
        }
        
        return removed;
    }
    
    /**
     * Check health of a specific service
     */
    async checkIntegrationHealth(serviceName) {
        const service = this.services.get(serviceName);
        if (!service || !service.enabled) {
            return null;
        }
        
        const startTime = Date.now();
        let healthResult = null;
        
        try {
            // Execute health check with timeout
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Health check timeout')), service.timeout);
            });
            
            const healthCheckPromise = service.healthChecker();
            
            healthResult = await Promise.race([healthCheckPromise, timeoutPromise]);
            
            const responseTime = Date.now() - startTime;
            
            // Process successful health check
            await this.processHealthCheckResult(serviceName, healthResult, responseTime, null);
            
            return healthResult;
        } catch (error) {
            const responseTime = Date.now() - startTime;
            
            // Process failed health check
            await this.processHealthCheckResult(serviceName, null, responseTime, error);
            
            throw error;
        }
    }
    
    /**
     * Process health check result
     */
    async processHealthCheckResult(serviceName, result, responseTime, error) {
        const service = this.services.get(serviceName);
        if (!service) return;
        
        const previousStatus = service.status;
        const now = Date.now();
        
        // Update metrics
        service.metrics.totalChecks++;
        service.lastCheck = now;
        service.responseTime = responseTime;
        
        // Update average response time
        service.metrics.averageResponseTime = 
            (service.metrics.averageResponseTime * (service.metrics.totalChecks - 1) + responseTime) / 
            service.metrics.totalChecks;
        
        if (error) {
            // Handle failed health check
            service.metrics.failedChecks++;
            service.consecutiveFailures++;
            service.metrics.lastError = {
                message: error.message,
                timestamp: now,
                responseTime
            };
            
            // Determine new status
            if (service.consecutiveFailures >= service.alertThreshold) {
                service.status = this.healthStatuses.UNHEALTHY;
            } else {
                service.status = this.healthStatuses.DEGRADED;
            }
        } else {
            // Handle successful health check
            service.metrics.successfulChecks++;
            service.consecutiveFailures = 0;
            service.metrics.lastError = null;
            
            // Determine status based on result
            if (result && typeof result === 'object') {
                service.status = result.status || this.healthStatuses.HEALTHY;
                
                // Check for performance issues
                if (responseTime > 5000) { // 5 seconds
                    service.status = this.healthStatuses.DEGRADED;
                }
            } else {
                service.status = this.healthStatuses.HEALTHY;
            }
        }
        
        // Update uptime/downtime
        const timeSinceLastChange = now - service.lastStatusChange;
        if (previousStatus === this.healthStatuses.HEALTHY) {
            service.uptime += timeSinceLastChange;
        } else if (previousStatus === this.healthStatuses.UNHEALTHY) {
            service.downtime += timeSinceLastChange;
        }
        
        // Check for status change
        if (previousStatus !== service.status) {
            service.lastStatusChange = now;
            
            this.emit('service.status.changed', {
                serviceName,
                previousStatus,
                newStatus: service.status,
                timestamp: now
            });
            
            // Generate alerts
            await this.checkForAlerts(serviceName, service, previousStatus);
        }
        
        // Store in history
        this.storeHealthHistory(serviceName, {
            timestamp: now,
            status: service.status,
            responseTime,
            error: error ? error.message : null,
            result
        });
        
        this.emit('service.health.checked', {
            serviceName,
            status: service.status,
            responseTime,
            error,
            result
        });
    }
    
    /**
     * Check for alerts
     */
    async checkForAlerts(serviceName, service, previousStatus) {
        const alerts = [];
        
        // Service down alert
        if (service.status === this.healthStatuses.UNHEALTHY && 
            previousStatus !== this.healthStatuses.UNHEALTHY) {
            alerts.push({
                type: this.alertTypes.SERVICE_DOWN,
                serviceName,
                message: `Service ${serviceName} is unhealthy`,
                severity: 'critical',
                consecutiveFailures: service.consecutiveFailures,
                lastError: service.metrics.lastError
            });
        }
        
        // Service recovered alert
        if (service.status === this.healthStatuses.HEALTHY && 
            previousStatus === this.healthStatuses.UNHEALTHY) {
            alerts.push({
                type: this.alertTypes.SERVICE_RECOVERED,
                serviceName,
                message: `Service ${serviceName} has recovered`,
                severity: 'info',
                downtime: service.downtime
            });
        }
        
        // High latency alert
        if (service.responseTime > 10000) { // 10 seconds
            alerts.push({
                type: this.alertTypes.HIGH_LATENCY,
                serviceName,
                message: `High latency detected for ${serviceName}`,
                severity: 'warning',
                responseTime: service.responseTime
            });
        }
        
        // High error rate alert
        const errorRate = service.metrics.totalChecks > 0 ? 
            (service.metrics.failedChecks / service.metrics.totalChecks) * 100 : 0;
        
        if (errorRate > 50 && service.metrics.totalChecks >= 10) {
            alerts.push({
                type: this.alertTypes.HIGH_ERROR_RATE,
                serviceName,
                message: `High error rate for ${serviceName}`,
                severity: 'warning',
                errorRate: Math.round(errorRate * 100) / 100
            });
        }
        
        // Process alerts
        for (const alert of alerts) {
            await this.triggerAlert(alert);
        }
    }
    
    /**
     * Trigger an alert
     */
    async triggerAlert(alert) {
        const alertData = {
            ...alert,
            id: this.generateAlertId(),
            timestamp: new Date().toISOString(),
            acknowledged: false
        };
        
        this.alerts.push(alertData);
        this.metrics.alertsTriggered++;
        
        // Keep only last 1000 alerts
        if (this.alerts.length > 1000) {
            this.alerts = this.alerts.slice(-1000);
        }
        
        this.emit('alert.triggered', alertData);
        
        // Send webhook alert if configured
        if (this.config.enableAlerts && this.config.alertWebhook) {
            await this.sendWebhookAlert(alertData);
        }
        
        console.warn(`ALERT [${alert.severity.toUpperCase()}]: ${alert.message}`);
    }
    
    /**
     * Send webhook alert
     */
    async sendWebhookAlert(alert) {
        try {
            const response = await fetch(this.config.alertWebhook, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'claude-task-master-health-monitor/1.0.0'
                },
                body: JSON.stringify({
                    alert,
                    source: 'claude-task-master',
                    timestamp: new Date().toISOString()
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            this.emit('alert.webhook.sent', { alert, response: response.status });
        } catch (error) {
            console.error('Failed to send webhook alert:', error);
            this.emit('alert.webhook.failed', { alert, error: error.message });
        }
    }
    
    /**
     * Monitor API limits for a service
     */
    async monitorAPILimits(serviceName) {
        const service = this.services.get(serviceName);
        if (!service) {
            throw new Error(`Service ${serviceName} not found`);
        }
        
        try {
            // Get service health status which should include rate limit info
            const healthResult = await this.checkIntegrationHealth(serviceName);
            
            if (healthResult && healthResult.rateLimiter) {
                const { requests, maxRequests, windowStart } = healthResult.rateLimiter;
                const usage = (requests / maxRequests) * 100;
                
                if (usage > 90) {
                    await this.triggerAlert({
                        type: this.alertTypes.RATE_LIMIT_EXCEEDED,
                        serviceName,
                        message: `Rate limit usage high for ${serviceName}: ${Math.round(usage)}%`,
                        severity: 'warning',
                        usage,
                        requests,
                        maxRequests
                    });
                }
                
                return {
                    serviceName,
                    usage,
                    requests,
                    maxRequests,
                    windowStart
                };
            }
            
            return null;
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to monitor API limits for ${serviceName}: ${error.message}`);
        }
    }
    
    /**
     * Track response times for a service
     */
    trackResponseTimes(serviceName) {
        const service = this.services.get(serviceName);
        if (!service) {
            return null;
        }
        
        const history = this.healthHistory.get(serviceName) || [];
        const recentHistory = history.slice(-100); // Last 100 checks
        
        if (recentHistory.length === 0) {
            return null;
        }
        
        const responseTimes = recentHistory.map(h => h.responseTime).filter(rt => rt > 0);
        
        if (responseTimes.length === 0) {
            return null;
        }
        
        const average = responseTimes.reduce((sum, rt) => sum + rt, 0) / responseTimes.length;
        const min = Math.min(...responseTimes);
        const max = Math.max(...responseTimes);
        
        // Calculate percentiles
        const sorted = responseTimes.sort((a, b) => a - b);
        const p50 = sorted[Math.floor(sorted.length * 0.5)];
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        const p99 = sorted[Math.floor(sorted.length * 0.99)];
        
        return {
            serviceName,
            count: responseTimes.length,
            average: Math.round(average),
            min,
            max,
            percentiles: {
                p50: Math.round(p50),
                p95: Math.round(p95),
                p99: Math.round(p99)
            }
        };
    }
    
    /**
     * Alert on failures
     */
    async alertOnFailures(serviceName, error) {
        await this.triggerAlert({
            type: this.alertTypes.SERVICE_DOWN,
            serviceName,
            message: `Service failure detected for ${serviceName}: ${error.message}`,
            severity: 'critical',
            error: error.message
        });
    }
    
    /**
     * Generate comprehensive health report
     */
    generateHealthReport() {
        const services = Array.from(this.services.entries()).map(([name, service]) => {
            const history = this.healthHistory.get(name) || [];
            const responseTimes = this.trackResponseTimes(name);
            
            return {
                name,
                status: service.status,
                lastCheck: service.lastCheck,
                consecutiveFailures: service.consecutiveFailures,
                responseTime: service.responseTime,
                uptime: service.uptime,
                downtime: service.downtime,
                metrics: service.metrics,
                responseTimes,
                historyCount: history.length
            };
        });
        
        const healthyCount = services.filter(s => s.status === this.healthStatuses.HEALTHY).length;
        const degradedCount = services.filter(s => s.status === this.healthStatuses.DEGRADED).length;
        const unhealthyCount = services.filter(s => s.status === this.healthStatuses.UNHEALTHY).length;
        
        const recentAlerts = this.alerts.slice(-10);
        
        return {
            timestamp: new Date().toISOString(),
            summary: {
                totalServices: services.length,
                healthy: healthyCount,
                degraded: degradedCount,
                unhealthy: unhealthyCount,
                monitoring: this.isMonitoring
            },
            services,
            metrics: this.metrics,
            recentAlerts,
            config: {
                checkInterval: this.config.checkInterval,
                alertThreshold: this.config.alertThreshold,
                enableAlerts: this.config.enableAlerts
            }
        };
    }
    
    /**
     * Start monitoring all services
     */
    async startMonitoring() {
        if (this.isMonitoring) {
            return;
        }
        
        this.isMonitoring = true;
        
        // Start periodic health checks
        this.monitoringInterval = setInterval(async () => {
            await this.performHealthChecks();
        }, this.config.checkInterval);
        
        // Perform initial health check
        await this.performHealthChecks();
        
        this.emit('monitoring.started');
        console.log('Health monitoring started');
    }
    
    /**
     * Stop monitoring
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
        
        this.emit('monitoring.stopped');
        console.log('Health monitoring stopped');
    }
    
    /**
     * Perform health checks for all services
     */
    async performHealthChecks() {
        const startTime = Date.now();
        
        try {
            const checkPromises = Array.from(this.services.keys()).map(async (serviceName) => {
                try {
                    await this.checkIntegrationHealth(serviceName);
                } catch (error) {
                    // Error already handled in checkIntegrationHealth
                }
            });
            
            await Promise.all(checkPromises);
            
            // Update global metrics
            this.metrics.totalChecks++;
            this.metrics.lastCheck = Date.now();
            this.metrics.healthyServices = Array.from(this.services.values())
                .filter(s => s.status === this.healthStatuses.HEALTHY).length;
            this.metrics.unhealthyServices = Array.from(this.services.values())
                .filter(s => s.status === this.healthStatuses.UNHEALTHY).length;
            
            const totalResponseTime = Date.now() - startTime;
            this.metrics.averageResponseTime = 
                (this.metrics.averageResponseTime * (this.metrics.totalChecks - 1) + totalResponseTime) / 
                this.metrics.totalChecks;
            
            this.emit('health.checks.completed', {
                duration: totalResponseTime,
                servicesChecked: this.services.size
            });
        } catch (error) {
            console.error('Error performing health checks:', error);
            this.emit('error', error);
        }
    }
    
    /**
     * Register default services
     */
    registerDefaultServices() {
        // Register services from config
        for (const serviceName of this.config.services) {
            this.registerService(serviceName, async () => {
                // Default health checker - will be overridden by actual integrations
                return {
                    status: this.healthStatuses.UNKNOWN,
                    message: 'Default health checker - integration not connected'
                };
            });
        }
    }
    
    /**
     * Store health history
     */
    storeHealthHistory(serviceName, healthData) {
        const history = this.healthHistory.get(serviceName) || [];
        history.push(healthData);
        
        // Keep only last 1000 entries
        if (history.length > 1000) {
            history.splice(0, history.length - 1000);
        }
        
        this.healthHistory.set(serviceName, history);
    }
    
    /**
     * Generate alert ID
     */
    generateAlertId() {
        return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Get service health
     */
    getServiceHealth(serviceName) {
        const service = this.services.get(serviceName);
        if (!service) {
            return null;
        }
        
        const history = this.healthHistory.get(serviceName) || [];
        
        return {
            ...service,
            history: history.slice(-10) // Last 10 checks
        };
    }
    
    /**
     * Get all alerts
     */
    getAlerts(limit = 50) {
        return this.alerts.slice(-limit);
    }
    
    /**
     * Acknowledge alert
     */
    acknowledgeAlert(alertId) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert) {
            alert.acknowledged = true;
            alert.acknowledgedAt = new Date().toISOString();
            this.emit('alert.acknowledged', alert);
            return true;
        }
        return false;
    }
    
    /**
     * Clear acknowledged alerts
     */
    clearAcknowledgedAlerts() {
        const beforeCount = this.alerts.length;
        this.alerts = this.alerts.filter(alert => !alert.acknowledged);
        const clearedCount = beforeCount - this.alerts.length;
        
        this.emit('alerts.cleared', { clearedCount });
        return clearedCount;
    }
    
    /**
     * Get health status
     */
    getHealthStatus() {
        return {
            service: 'health-monitor',
            status: this.isMonitoring ? 'healthy' : 'stopped',
            monitoring: this.isMonitoring,
            servicesCount: this.services.size,
            metrics: this.metrics,
            alertsCount: this.alerts.length,
            config: this.config
        };
    }
}

export default IntegrationHealthMonitor;

