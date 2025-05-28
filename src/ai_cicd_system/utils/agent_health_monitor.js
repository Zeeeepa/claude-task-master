/**
 * Agent Health Monitor
 * 
 * Real-time monitoring system for agent health, performance, and availability.
 * Provides comprehensive health checks, alerting, and recovery mechanisms.
 */

import { EventEmitter } from 'events';
import { SimpleLogger } from './simple_logger.js';
import { AGENTAPI_CONFIG } from '../config/agentapi_config.js';

export class AgentHealthMonitor extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            ...AGENTAPI_CONFIG.monitoring,
            ...config
        };
        
        this.logger = new SimpleLogger('AgentHealthMonitor');
        
        // Health state tracking
        this.agentHealth = new Map();
        this.healthHistory = new Map();
        this.alertThresholds = this.config.alert_thresholds;
        this.activeAlerts = new Map();
        
        // Performance metrics
        this.performanceMetrics = new Map();
        this.responseTimeHistory = new Map();
        
        // Circuit breaker states
        this.circuitBreakers = new Map();
        
        // Initialize health tracking for all agents
        this._initializeHealthTracking();
        
        // Start monitoring processes
        if (this.config.enable_metrics) {
            this._startMonitoring();
        }
    }

    /**
     * Initialize health tracking for all configured agents
     */
    _initializeHealthTracking() {
        for (const [agentType, agentConfig] of Object.entries(AGENTAPI_CONFIG.agents)) {
            this.agentHealth.set(agentType, {
                type: agentType,
                status: 'unknown',
                healthy: false,
                lastCheck: 0,
                lastSuccess: 0,
                lastFailure: 0,
                consecutiveFailures: 0,
                consecutiveSuccesses: 0,
                uptime: 0,
                downtime: 0,
                availability: 100,
                config: agentConfig
            });

            this.healthHistory.set(agentType, []);
            
            this.performanceMetrics.set(agentType, {
                responseTime: {
                    current: 0,
                    average: 0,
                    min: Infinity,
                    max: 0,
                    p95: 0,
                    p99: 0
                },
                throughput: {
                    requestsPerSecond: 0,
                    requestsPerMinute: 0,
                    totalRequests: 0
                },
                errorRate: {
                    current: 0,
                    average: 0,
                    totalErrors: 0
                },
                resourceUsage: {
                    cpu: 0,
                    memory: 0,
                    disk: 0,
                    network: 0
                }
            });

            this.responseTimeHistory.set(agentType, []);
            
            this.circuitBreakers.set(agentType, {
                state: 'closed', // closed, open, half-open
                failureCount: 0,
                lastFailureTime: 0,
                nextAttemptTime: 0
            });
        }
    }

    /**
     * Start monitoring processes
     */
    _startMonitoring() {
        // Regular health checks
        setInterval(() => {
            this._performHealthChecks();
        }, this.config.health_check_interval || 30000);

        // Performance metrics collection
        setInterval(() => {
            this._collectPerformanceMetrics();
        }, this.config.metrics_interval || 60000);

        // Alert evaluation
        setInterval(() => {
            this._evaluateAlerts();
        }, 15000); // Every 15 seconds

        // Cleanup old data
        setInterval(() => {
            this._cleanupOldData();
        }, 300000); // Every 5 minutes

        this.logger.info('Agent health monitoring started');
    }

    /**
     * Perform health checks on all agents
     */
    async _performHealthChecks() {
        const promises = [];
        
        for (const agentType of this.agentHealth.keys()) {
            promises.push(this._checkAgentHealth(agentType));
        }

        await Promise.allSettled(promises);
    }

    /**
     * Check health of specific agent
     */
    async _checkAgentHealth(agentType) {
        const health = this.agentHealth.get(agentType);
        const now = Date.now();
        
        try {
            // Skip if circuit breaker is open
            if (this._isCircuitBreakerOpen(agentType)) {
                this.logger.debug(`Skipping health check for ${agentType} - circuit breaker open`);
                return;
            }

            const startTime = Date.now();
            
            // Perform actual health check (this would be implemented by the agent client)
            const healthResult = await this._performAgentHealthCheck(agentType);
            
            const responseTime = Date.now() - startTime;
            
            // Update health state
            health.lastCheck = now;
            health.healthy = healthResult.healthy;
            health.status = healthResult.status || (healthResult.healthy ? 'healthy' : 'unhealthy');
            
            if (healthResult.healthy) {
                health.lastSuccess = now;
                health.consecutiveSuccesses++;
                health.consecutiveFailures = 0;
                this._recordCircuitBreakerSuccess(agentType);
            } else {
                health.lastFailure = now;
                health.consecutiveFailures++;
                health.consecutiveSuccesses = 0;
                this._recordCircuitBreakerFailure(agentType);
            }

            // Update performance metrics
            this._updateResponseTimeMetrics(agentType, responseTime);
            
            // Record health history
            this._recordHealthHistory(agentType, {
                timestamp: now,
                healthy: healthResult.healthy,
                responseTime,
                status: health.status,
                details: healthResult.details
            });

            // Calculate availability
            this._updateAvailability(agentType);

            // Emit health update event
            this.emit('healthUpdate', {
                agentType,
                health: { ...health },
                responseTime
            });

        } catch (error) {
            this.logger.error(`Health check failed for agent ${agentType}:`, error);
            
            health.lastCheck = now;
            health.healthy = false;
            health.status = 'error';
            health.lastFailure = now;
            health.consecutiveFailures++;
            health.consecutiveSuccesses = 0;
            
            this._recordCircuitBreakerFailure(agentType);
            
            this._recordHealthHistory(agentType, {
                timestamp: now,
                healthy: false,
                error: error.message,
                status: 'error'
            });

            this.emit('healthCheckError', {
                agentType,
                error: error.message
            });
        }
    }

    /**
     * Perform actual health check (mock implementation)
     */
    async _performAgentHealthCheck(agentType) {
        // This would be implemented by making actual HTTP requests to agents
        // For now, we'll simulate health checks
        
        const agentConfig = AGENTAPI_CONFIG.agents[agentType];
        const baseUrl = AGENTAPI_CONFIG.base_url;
        const endpoint = `${baseUrl}${agentConfig.endpoint}/health`;
        
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 100));
        
        // Simulate occasional failures for testing
        const failureRate = 0.05; // 5% failure rate
        if (Math.random() < failureRate) {
            throw new Error('Simulated health check failure');
        }
        
        return {
            healthy: true,
            status: 'healthy',
            details: {
                endpoint,
                version: '1.0.0',
                uptime: Math.floor(Math.random() * 86400), // Random uptime
                load: Math.random() * 100,
                memory: Math.random() * 100
            }
        };
    }

    /**
     * Update response time metrics
     */
    _updateResponseTimeMetrics(agentType, responseTime) {
        const metrics = this.performanceMetrics.get(agentType);
        const history = this.responseTimeHistory.get(agentType);
        
        // Add to history
        history.push({
            timestamp: Date.now(),
            responseTime
        });
        
        // Keep only last 1000 entries
        if (history.length > 1000) {
            history.splice(0, history.length - 1000);
        }
        
        // Update metrics
        metrics.responseTime.current = responseTime;
        metrics.responseTime.min = Math.min(metrics.responseTime.min, responseTime);
        metrics.responseTime.max = Math.max(metrics.responseTime.max, responseTime);
        
        // Calculate average
        const recentHistory = history.slice(-100); // Last 100 requests
        metrics.responseTime.average = recentHistory.reduce((sum, entry) => 
            sum + entry.responseTime, 0) / recentHistory.length;
        
        // Calculate percentiles
        const sortedTimes = recentHistory.map(entry => entry.responseTime).sort((a, b) => a - b);
        if (sortedTimes.length > 0) {
            metrics.responseTime.p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)];
            metrics.responseTime.p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)];
        }
    }

    /**
     * Record health history
     */
    _recordHealthHistory(agentType, healthRecord) {
        const history = this.healthHistory.get(agentType);
        history.push(healthRecord);
        
        // Keep only last 1000 entries
        if (history.length > 1000) {
            history.splice(0, history.length - 1000);
        }
    }

    /**
     * Update availability calculation
     */
    _updateAvailability(agentType) {
        const health = this.agentHealth.get(agentType);
        const history = this.healthHistory.get(agentType);
        
        if (history.length === 0) return;
        
        // Calculate availability over last hour
        const oneHourAgo = Date.now() - 3600000;
        const recentHistory = history.filter(record => record.timestamp > oneHourAgo);
        
        if (recentHistory.length === 0) return;
        
        const healthyCount = recentHistory.filter(record => record.healthy).length;
        health.availability = (healthyCount / recentHistory.length) * 100;
        
        // Update uptime/downtime
        const now = Date.now();
        if (health.healthy) {
            if (health.lastFailure > 0) {
                health.downtime += Math.max(0, health.lastSuccess - health.lastFailure);
            }
        } else {
            if (health.lastSuccess > 0) {
                health.uptime += Math.max(0, health.lastFailure - health.lastSuccess);
            }
        }
    }

    /**
     * Circuit breaker management
     */
    _isCircuitBreakerOpen(agentType) {
        const breaker = this.circuitBreakers.get(agentType);
        const now = Date.now();
        
        if (breaker.state === 'open') {
            // Check if we should transition to half-open
            if (now >= breaker.nextAttemptTime) {
                breaker.state = 'half-open';
                this.logger.info(`Circuit breaker for ${agentType} transitioning to half-open`);
            }
        }
        
        return breaker.state === 'open';
    }

    _recordCircuitBreakerSuccess(agentType) {
        const breaker = this.circuitBreakers.get(agentType);
        
        if (breaker.state === 'half-open') {
            breaker.state = 'closed';
            breaker.failureCount = 0;
            this.logger.info(`Circuit breaker for ${agentType} closed after successful health check`);
        } else if (breaker.state === 'closed') {
            breaker.failureCount = Math.max(0, breaker.failureCount - 1);
        }
    }

    _recordCircuitBreakerFailure(agentType) {
        const breaker = this.circuitBreakers.get(agentType);
        const now = Date.now();
        
        breaker.failureCount++;
        breaker.lastFailureTime = now;
        
        const threshold = 5; // Failure threshold
        const timeout = 60000; // 1 minute timeout
        
        if (breaker.failureCount >= threshold && breaker.state === 'closed') {
            breaker.state = 'open';
            breaker.nextAttemptTime = now + timeout;
            
            this.logger.warn(`Circuit breaker for ${agentType} opened after ${threshold} failures`);
            
            this.emit('circuitBreakerOpened', {
                agentType,
                failureCount: breaker.failureCount,
                nextAttemptTime: breaker.nextAttemptTime
            });
        }
    }

    /**
     * Collect performance metrics
     */
    _collectPerformanceMetrics() {
        for (const [agentType, metrics] of this.performanceMetrics.entries()) {
            // Update throughput metrics
            const history = this.responseTimeHistory.get(agentType);
            const now = Date.now();
            
            // Requests in last minute
            const lastMinute = history.filter(entry => now - entry.timestamp < 60000);
            metrics.throughput.requestsPerMinute = lastMinute.length;
            metrics.throughput.requestsPerSecond = lastMinute.length / 60;
            
            // Total requests
            metrics.throughput.totalRequests = history.length;
            
            // Error rate calculation would be based on actual error tracking
            // For now, we'll use circuit breaker failure count as a proxy
            const breaker = this.circuitBreakers.get(agentType);
            metrics.errorRate.current = breaker.failureCount;
        }
    }

    /**
     * Evaluate alerts based on thresholds
     */
    _evaluateAlerts() {
        for (const [agentType, health] of this.agentHealth.entries()) {
            const metrics = this.performanceMetrics.get(agentType);
            
            // Response time alert
            if (metrics.responseTime.average > this.alertThresholds.response_time_ms) {
                this._triggerAlert(agentType, 'high_response_time', {
                    current: metrics.responseTime.average,
                    threshold: this.alertThresholds.response_time_ms
                });
            }
            
            // Availability alert
            if (health.availability < this.alertThresholds.availability_percent) {
                this._triggerAlert(agentType, 'low_availability', {
                    current: health.availability,
                    threshold: this.alertThresholds.availability_percent
                });
            }
            
            // Error rate alert
            if (metrics.errorRate.current > this.alertThresholds.error_rate_percent) {
                this._triggerAlert(agentType, 'high_error_rate', {
                    current: metrics.errorRate.current,
                    threshold: this.alertThresholds.error_rate_percent
                });
            }
            
            // Agent down alert
            if (!health.healthy && health.consecutiveFailures >= 3) {
                this._triggerAlert(agentType, 'agent_down', {
                    consecutiveFailures: health.consecutiveFailures,
                    lastSuccess: health.lastSuccess
                });
            }
        }
    }

    /**
     * Trigger alert
     */
    _triggerAlert(agentType, alertType, details) {
        const alertKey = `${agentType}-${alertType}`;
        const existingAlert = this.activeAlerts.get(alertKey);
        const now = Date.now();
        
        // Avoid duplicate alerts within 5 minutes
        if (existingAlert && now - existingAlert.timestamp < 300000) {
            return;
        }
        
        const alert = {
            id: `alert-${now}-${Math.random().toString(36).substr(2, 9)}`,
            agentType,
            type: alertType,
            severity: this._getAlertSeverity(alertType),
            message: this._getAlertMessage(agentType, alertType, details),
            details,
            timestamp: now,
            acknowledged: false
        };
        
        this.activeAlerts.set(alertKey, alert);
        
        this.logger.warn(`Alert triggered: ${alert.message}`, alert);
        
        this.emit('alert', alert);
    }

    /**
     * Get alert severity
     */
    _getAlertSeverity(alertType) {
        const severityMap = {
            'high_response_time': 'warning',
            'low_availability': 'critical',
            'high_error_rate': 'warning',
            'agent_down': 'critical'
        };
        
        return severityMap[alertType] || 'info';
    }

    /**
     * Get alert message
     */
    _getAlertMessage(agentType, alertType, details) {
        switch (alertType) {
            case 'high_response_time':
                return `Agent ${agentType} response time (${details.current}ms) exceeds threshold (${details.threshold}ms)`;
            case 'low_availability':
                return `Agent ${agentType} availability (${details.current.toFixed(2)}%) below threshold (${details.threshold}%)`;
            case 'high_error_rate':
                return `Agent ${agentType} error rate (${details.current}) exceeds threshold (${details.threshold})`;
            case 'agent_down':
                return `Agent ${agentType} is down (${details.consecutiveFailures} consecutive failures)`;
            default:
                return `Alert for agent ${agentType}: ${alertType}`;
        }
    }

    /**
     * Cleanup old data
     */
    _cleanupOldData() {
        const cutoffTime = Date.now() - 86400000; // 24 hours ago
        
        for (const history of this.healthHistory.values()) {
            const index = history.findIndex(record => record.timestamp > cutoffTime);
            if (index > 0) {
                history.splice(0, index);
            }
        }
        
        for (const history of this.responseTimeHistory.values()) {
            const index = history.findIndex(entry => entry.timestamp > cutoffTime);
            if (index > 0) {
                history.splice(0, index);
            }
        }
    }

    /**
     * Public API methods
     */

    /**
     * Check if agent is healthy
     */
    async isAgentHealthy(agentType) {
        const health = this.agentHealth.get(agentType);
        if (!health) {
            throw new Error(`Unknown agent type: ${agentType}`);
        }
        
        // Force health check if data is stale
        const staleThreshold = 60000; // 1 minute
        if (Date.now() - health.lastCheck > staleThreshold) {
            await this._checkAgentHealth(agentType);
        }
        
        return health.healthy;
    }

    /**
     * Get agent health status
     */
    getAgentHealth(agentType) {
        const health = this.agentHealth.get(agentType);
        if (!health) {
            throw new Error(`Unknown agent type: ${agentType}`);
        }
        
        const metrics = this.performanceMetrics.get(agentType);
        const breaker = this.circuitBreakers.get(agentType);
        
        return {
            ...health,
            performance: metrics,
            circuitBreaker: breaker
        };
    }

    /**
     * Get all agents health
     */
    getAllAgentsHealth() {
        const result = {};
        
        for (const agentType of this.agentHealth.keys()) {
            result[agentType] = this.getAgentHealth(agentType);
        }
        
        return result;
    }

    /**
     * Get health summary
     */
    getHealthSummary() {
        const summary = {
            totalAgents: this.agentHealth.size,
            healthyAgents: 0,
            unhealthyAgents: 0,
            unknownAgents: 0,
            averageAvailability: 0,
            averageResponseTime: 0,
            activeAlerts: this.activeAlerts.size,
            circuitBreakersOpen: 0
        };
        
        let totalAvailability = 0;
        let totalResponseTime = 0;
        let responseTimeCount = 0;
        
        for (const [agentType, health] of this.agentHealth.entries()) {
            if (health.healthy) {
                summary.healthyAgents++;
            } else if (health.status === 'unknown') {
                summary.unknownAgents++;
            } else {
                summary.unhealthyAgents++;
            }
            
            totalAvailability += health.availability;
            
            const metrics = this.performanceMetrics.get(agentType);
            if (metrics.responseTime.average > 0) {
                totalResponseTime += metrics.responseTime.average;
                responseTimeCount++;
            }
            
            const breaker = this.circuitBreakers.get(agentType);
            if (breaker.state === 'open') {
                summary.circuitBreakersOpen++;
            }
        }
        
        summary.averageAvailability = totalAvailability / this.agentHealth.size;
        summary.averageResponseTime = responseTimeCount > 0 ? 
            totalResponseTime / responseTimeCount : 0;
        
        return summary;
    }

    /**
     * Get active alerts
     */
    getActiveAlerts() {
        return Array.from(this.activeAlerts.values());
    }

    /**
     * Acknowledge alert
     */
    acknowledgeAlert(alertId) {
        for (const alert of this.activeAlerts.values()) {
            if (alert.id === alertId) {
                alert.acknowledged = true;
                alert.acknowledgedAt = Date.now();
                
                this.emit('alertAcknowledged', alert);
                return true;
            }
        }
        
        return false;
    }

    /**
     * Clear alert
     */
    clearAlert(alertId) {
        for (const [key, alert] of this.activeAlerts.entries()) {
            if (alert.id === alertId) {
                this.activeAlerts.delete(key);
                
                this.emit('alertCleared', alert);
                return true;
            }
        }
        
        return false;
    }

    /**
     * Force health check
     */
    async forceHealthCheck(agentType = null) {
        if (agentType) {
            await this._checkAgentHealth(agentType);
        } else {
            await this._performHealthChecks();
        }
    }

    /**
     * Reset circuit breaker
     */
    resetCircuitBreaker(agentType) {
        const breaker = this.circuitBreakers.get(agentType);
        if (breaker) {
            breaker.state = 'closed';
            breaker.failureCount = 0;
            breaker.lastFailureTime = 0;
            breaker.nextAttemptTime = 0;
            
            this.logger.info(`Circuit breaker reset for agent: ${agentType}`);
            
            this.emit('circuitBreakerReset', { agentType });
        }
    }

    /**
     * Shutdown health monitor
     */
    shutdown() {
        this.logger.info('Shutting down Agent Health Monitor');
        this.removeAllListeners();
    }
}

export default AgentHealthMonitor;

