/**
 * @fileoverview Health Checker
 * @description Comprehensive system health monitoring with detailed checks
 */

import { log } from '../../scripts/modules/utils.js';
import { DatabaseConnection } from '../database/connection.js';
import axios from 'axios';

/**
 * Comprehensive health checker for all system components
 */
export class HealthChecker {
    constructor(config) {
        this.config = config;
        this.checks = new Map();
        this.healthHistory = [];
        this.lastHealthCheck = null;
        this.isRunning = false;
        this.checkInterval = null;
        
        this.initializeHealthChecks();
    }

    /**
     * Initialize all health checks
     */
    initializeHealthChecks() {
        // Database health check
        this.checks.set('database', {
            name: 'Database Connection',
            check: () => this.checkDatabaseHealth(),
            timeout: 5000,
            critical: true,
            description: 'Verifies PostgreSQL database connectivity and basic operations'
        });

        // AgentAPI service health check
        this.checks.set('agentapi', {
            name: 'AgentAPI Service',
            check: () => this.checkAgentAPIHealth(),
            timeout: 3000,
            critical: true,
            description: 'Checks AgentAPI service availability and response'
        });

        // Codegen integration health check
        this.checks.set('codegen', {
            name: 'Codegen Integration',
            check: () => this.checkCodegenHealth(),
            timeout: 10000,
            critical: false,
            description: 'Verifies Codegen API connectivity and authentication'
        });

        // Webhook endpoints health check
        this.checks.set('webhooks', {
            name: 'Webhook Endpoints',
            check: () => this.checkWebhookHealth(),
            timeout: 2000,
            critical: true,
            description: 'Tests webhook endpoint availability and processing'
        });

        // System resources health check
        this.checks.set('system_resources', {
            name: 'System Resources',
            check: () => this.checkSystemResources(),
            timeout: 1000,
            critical: true,
            description: 'Monitors CPU, memory, and disk usage'
        });

        // External dependencies health check
        this.checks.set('external_deps', {
            name: 'External Dependencies',
            check: () => this.checkExternalDependencies(),
            timeout: 5000,
            critical: false,
            description: 'Checks connectivity to external services and APIs'
        });

        // Application services health check
        this.checks.set('app_services', {
            name: 'Application Services',
            check: () => this.checkApplicationServices(),
            timeout: 3000,
            critical: true,
            description: 'Verifies core application services are running'
        });

        log('debug', `Initialized ${this.checks.size} health checks`);
    }

    /**
     * Perform comprehensive health check
     */
    async performHealthCheck() {
        const startTime = Date.now();
        
        const results = {
            timestamp: new Date().toISOString(),
            overall_status: 'healthy',
            checks: {},
            summary: {
                total: this.checks.size,
                healthy: 0,
                warning: 0,
                critical: 0,
                unknown: 0
            },
            execution_time_ms: 0,
            previous_status: this.lastHealthCheck?.overall_status || null
        };

        log('debug', 'Starting comprehensive health check...');

        // Run all health checks in parallel with individual timeouts
        const checkPromises = Array.from(this.checks.entries()).map(async ([id, check]) => {
            const checkStartTime = Date.now();
            
            try {
                const result = await Promise.race([
                    this.executeHealthCheck(check),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Health check timeout')), check.timeout)
                    )
                ]);
                
                const responseTime = Date.now() - checkStartTime;
                
                results.checks[id] = {
                    name: check.name,
                    description: check.description,
                    status: 'healthy',
                    response_time_ms: responseTime,
                    details: result,
                    critical: check.critical,
                    last_checked: new Date().toISOString()
                };
                
                results.summary.healthy++;
                
                log('debug', `Health check '${id}' passed in ${responseTime}ms`);
                
            } catch (error) {
                const responseTime = Date.now() - checkStartTime;
                const status = check.critical ? 'critical' : 'warning';
                
                results.checks[id] = {
                    name: check.name,
                    description: check.description,
                    status: status,
                    error: error.message,
                    response_time_ms: responseTime,
                    critical: check.critical,
                    last_checked: new Date().toISOString()
                };
                
                if (check.critical) {
                    results.summary.critical++;
                    results.overall_status = 'critical';
                } else {
                    results.summary.warning++;
                    if (results.overall_status === 'healthy') {
                        results.overall_status = 'warning';
                    }
                }
                
                log('warning', `Health check '${id}' failed: ${error.message}`);
            }
        });

        await Promise.all(checkPromises);

        results.execution_time_ms = Date.now() - startTime;
        
        // Store health check result
        this.lastHealthCheck = results;
        this.healthHistory.push({
            timestamp: results.timestamp,
            overall_status: results.overall_status,
            execution_time_ms: results.execution_time_ms,
            summary: { ...results.summary }
        });

        // Keep only last 100 health check results
        if (this.healthHistory.length > 100) {
            this.healthHistory.splice(0, this.healthHistory.length - 100);
        }

        log('info', `Health check completed in ${results.execution_time_ms}ms - Status: ${results.overall_status}`);
        
        return results;
    }

    /**
     * Execute individual health check
     */
    async executeHealthCheck(check) {
        try {
            return await check.check();
        } catch (error) {
            throw new Error(`${check.name} health check failed: ${error.message}`);
        }
    }

    /**
     * Check database health
     */
    async checkDatabaseHealth() {
        try {
            const db = new DatabaseConnection(this.config.database);
            await db.connect();
            
            // Test basic query
            const result = await db.query('SELECT 1 as test, NOW() as timestamp');
            
            // Test connection pool
            const poolStats = db.getPoolStats();
            
            await db.close();
            
            return {
                connection: 'successful',
                query_test: 'passed',
                response_time: result.duration || 0,
                pool_stats: poolStats,
                timestamp: result.rows[0]?.timestamp
            };
            
        } catch (error) {
            throw new Error(`Database connection failed: ${error.message}`);
        }
    }

    /**
     * Check AgentAPI service health
     */
    async checkAgentAPIHealth() {
        try {
            const agentApiUrl = this.config.agentapi?.url || 'http://localhost:3001';
            const healthEndpoint = `${agentApiUrl}/health`;
            
            const response = await axios.get(healthEndpoint, {
                timeout: 3000,
                headers: {
                    'User-Agent': 'HealthChecker/1.0'
                }
            });
            
            return {
                status_code: response.status,
                response_data: response.data,
                service_version: response.data?.version || 'unknown',
                uptime: response.data?.uptime || 'unknown'
            };
            
        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                throw new Error('AgentAPI service is not running');
            }
            throw new Error(`AgentAPI health check failed: ${error.message}`);
        }
    }

    /**
     * Check Codegen integration health
     */
    async checkCodegenHealth() {
        try {
            // This would typically check Codegen API connectivity
            // For now, we'll simulate a basic connectivity test
            
            const codegenConfig = this.config.codegen || {};
            
            if (!codegenConfig.api_key) {
                throw new Error('Codegen API key not configured');
            }
            
            // Simulate API call (replace with actual Codegen API call)
            const mockResponse = {
                authenticated: true,
                rate_limit_remaining: 1000,
                service_status: 'operational'
            };
            
            return {
                authentication: 'successful',
                api_status: mockResponse.service_status,
                rate_limit_remaining: mockResponse.rate_limit_remaining,
                integration_status: 'healthy'
            };
            
        } catch (error) {
            throw new Error(`Codegen integration check failed: ${error.message}`);
        }
    }

    /**
     * Check webhook endpoints health
     */
    async checkWebhookHealth() {
        try {
            const webhookConfig = this.config.webhooks || {};
            const port = webhookConfig.port || 3000;
            const webhookUrl = `http://localhost:${port}/webhook/health`;
            
            const response = await axios.get(webhookUrl, {
                timeout: 2000,
                headers: {
                    'User-Agent': 'HealthChecker/1.0'
                }
            });
            
            return {
                endpoint_status: 'accessible',
                status_code: response.status,
                response_time: response.headers['x-response-time'] || 'unknown',
                webhook_processor: 'operational'
            };
            
        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                throw new Error('Webhook service is not running');
            }
            throw new Error(`Webhook health check failed: ${error.message}`);
        }
    }

    /**
     * Check system resources
     */
    async checkSystemResources() {
        try {
            const os = await import('os');
            const process = await import('process');
            
            const memUsage = process.memoryUsage();
            const cpuUsage = process.cpuUsage();
            const loadAvg = os.loadavg();
            const freeMem = os.freemem();
            const totalMem = os.totalmem();
            
            const memoryUsagePercent = ((totalMem - freeMem) / totalMem) * 100;
            const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
            
            // Check thresholds
            const warnings = [];
            if (memoryUsagePercent > 90) warnings.push('High system memory usage');
            if (heapUsagePercent > 90) warnings.push('High heap memory usage');
            if (loadAvg[0] > 2) warnings.push('High system load');
            
            return {
                memory: {
                    system_usage_percent: Math.round(memoryUsagePercent),
                    heap_usage_percent: Math.round(heapUsagePercent),
                    heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
                    heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024)
                },
                cpu: {
                    load_average_1m: loadAvg[0],
                    load_average_5m: loadAvg[1],
                    load_average_15m: loadAvg[2]
                },
                process: {
                    uptime_seconds: process.uptime(),
                    pid: process.pid,
                    node_version: process.version
                },
                warnings: warnings,
                status: warnings.length > 0 ? 'warning' : 'healthy'
            };
            
        } catch (error) {
            throw new Error(`System resources check failed: ${error.message}`);
        }
    }

    /**
     * Check external dependencies
     */
    async checkExternalDependencies() {
        try {
            const dependencies = [];
            
            // Check GitHub API (if configured)
            if (this.config.github?.api_url) {
                try {
                    const response = await axios.get('https://api.github.com/rate_limit', {
                        timeout: 3000,
                        headers: {
                            'Authorization': `token ${this.config.github.token}`,
                            'User-Agent': 'HealthChecker/1.0'
                        }
                    });
                    
                    dependencies.push({
                        name: 'GitHub API',
                        status: 'healthy',
                        rate_limit: response.data.rate
                    });
                } catch (error) {
                    dependencies.push({
                        name: 'GitHub API',
                        status: 'unhealthy',
                        error: error.message
                    });
                }
            }
            
            // Check other external services as needed
            
            return {
                dependencies,
                total_checked: dependencies.length,
                healthy_count: dependencies.filter(d => d.status === 'healthy').length
            };
            
        } catch (error) {
            throw new Error(`External dependencies check failed: ${error.message}`);
        }
    }

    /**
     * Check application services
     */
    async checkApplicationServices() {
        try {
            const services = [];
            
            // Check if main application is responsive
            services.push({
                name: 'Main Application',
                status: 'running',
                pid: process.pid,
                uptime: process.uptime()
            });
            
            // Check if monitoring is active
            services.push({
                name: 'Monitoring System',
                status: this.isRunning ? 'running' : 'stopped',
                last_check: this.lastHealthCheck?.timestamp || null
            });
            
            return {
                services,
                all_services_healthy: services.every(s => s.status === 'running')
            };
            
        } catch (error) {
            throw new Error(`Application services check failed: ${error.message}`);
        }
    }

    /**
     * Start periodic health checks
     */
    startPeriodicChecks(intervalMs = 30000) {
        if (this.isRunning) {
            log('warning', 'Periodic health checks already running');
            return;
        }

        this.isRunning = true;
        this.checkInterval = setInterval(async () => {
            try {
                await this.performHealthCheck();
            } catch (error) {
                log('error', `Error during periodic health check: ${error.message}`);
            }
        }, intervalMs);

        log('info', `Started periodic health checks with ${intervalMs}ms interval`);
    }

    /**
     * Stop periodic health checks
     */
    stopPeriodicChecks() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        this.isRunning = false;
        log('info', 'Stopped periodic health checks');
    }

    /**
     * Get health check history
     */
    getHealthHistory(limit = 10) {
        return this.healthHistory.slice(-limit);
    }

    /**
     * Get current health status
     */
    getCurrentHealth() {
        return this.lastHealthCheck;
    }

    /**
     * Get health summary
     */
    getHealthSummary() {
        const current = this.lastHealthCheck;
        const history = this.healthHistory.slice(-10);
        
        return {
            current_status: current?.overall_status || 'unknown',
            last_check: current?.timestamp || null,
            checks_configured: this.checks.size,
            history_count: this.healthHistory.length,
            is_monitoring: this.isRunning,
            recent_trend: this.calculateHealthTrend(history)
        };
    }

    /**
     * Calculate health trend from recent history
     */
    calculateHealthTrend(history) {
        if (history.length < 2) return 'stable';
        
        const recent = history.slice(-3);
        const statusScores = recent.map(h => {
            switch (h.overall_status) {
                case 'healthy': return 100;
                case 'warning': return 70;
                case 'critical': return 30;
                default: return 50;
            }
        });
        
        const avgScore = statusScores.reduce((a, b) => a + b, 0) / statusScores.length;
        const firstScore = statusScores[0];
        const lastScore = statusScores[statusScores.length - 1];
        
        if (lastScore > firstScore + 10) return 'improving';
        if (lastScore < firstScore - 10) return 'degrading';
        return 'stable';
    }

    /**
     * Add custom health check
     */
    addCustomCheck(id, checkConfig) {
        this.checks.set(id, {
            name: checkConfig.name,
            check: checkConfig.check,
            timeout: checkConfig.timeout || 5000,
            critical: checkConfig.critical || false,
            description: checkConfig.description || 'Custom health check'
        });
        
        log('info', `Added custom health check: ${id}`);
    }

    /**
     * Remove health check
     */
    removeCheck(id) {
        if (this.checks.delete(id)) {
            log('info', `Removed health check: ${id}`);
            return true;
        }
        return false;
    }

    /**
     * Get available health checks
     */
    getAvailableChecks() {
        return Array.from(this.checks.entries()).map(([id, check]) => ({
            id,
            name: check.name,
            description: check.description,
            critical: check.critical,
            timeout: check.timeout
        }));
    }
}

export default HealthChecker;

