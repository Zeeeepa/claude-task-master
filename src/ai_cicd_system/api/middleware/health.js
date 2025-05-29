/**
 * @fileoverview Health Check Middleware
 * @description Health monitoring and status endpoints
 */

import { getPoolManager } from '../../database/connection_pool.js';
import { cloudflareConfig } from '../../config/cloudflare_config.js';

/**
 * Basic health check endpoint
 */
export async function healthCheck(req, res) {
    try {
        const startTime = Date.now();
        
        // Basic health indicators
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: process.env.npm_package_version || '1.0.0',
            environment: process.env.NODE_ENV || 'production',
            requestId: req.requestId
        };

        // Quick database connectivity check
        try {
            const poolManager = getPoolManager();
            await poolManager.query('SELECT 1', [], { queryType: 'read' });
            health.database = 'connected';
        } catch (error) {
            health.database = 'disconnected';
            health.status = 'degraded';
            health.errors = health.errors || [];
            health.errors.push('Database connectivity issue');
        }

        // Check response time
        const responseTime = Date.now() - startTime;
        health.responseTime = `${responseTime}ms`;

        if (responseTime > 1000) {
            health.status = 'degraded';
            health.warnings = health.warnings || [];
            health.warnings.push('Slow response time');
        }

        const statusCode = health.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(health);
    } catch (error) {
        console.error('Health check error:', error);
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error.message,
            requestId: req.requestId
        });
    }
}

/**
 * Detailed health check with comprehensive system status
 */
export async function detailedHealthCheck(req, res) {
    try {
        const startTime = Date.now();
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: process.env.npm_package_version || '1.0.0',
            environment: process.env.NODE_ENV || 'production',
            requestId: req.requestId,
            checks: {},
            metrics: {},
            warnings: [],
            errors: []
        };

        // Database health check
        await checkDatabaseHealth(health);

        // Connection pool health check
        await checkConnectionPoolHealth(health);

        // Cloudflare health check
        await checkCloudflareHealth(health);

        // System resources check
        await checkSystemResources(health);

        // External dependencies check
        await checkExternalDependencies(health);

        // Calculate overall status
        const responseTime = Date.now() - startTime;
        health.metrics.responseTime = responseTime;

        if (health.errors.length > 0) {
            health.status = 'unhealthy';
        } else if (health.warnings.length > 0 || responseTime > 2000) {
            health.status = 'degraded';
        }

        const statusCode = health.status === 'healthy' ? 200 : 
                          health.status === 'degraded' ? 200 : 503;

        res.status(statusCode).json(health);
    } catch (error) {
        console.error('Detailed health check error:', error);
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error.message,
            requestId: req.requestId
        });
    }
}

/**
 * Readiness probe for Kubernetes/container orchestration
 */
export async function readinessProbe(req, res) {
    try {
        // Check if application is ready to serve traffic
        const poolManager = getPoolManager();
        
        // Verify database connection
        await poolManager.query('SELECT 1', [], { queryType: 'read' });
        
        // Check if all required services are available
        const ready = {
            status: 'ready',
            timestamp: new Date().toISOString(),
            checks: {
                database: 'ready',
                connectionPool: 'ready'
            }
        };

        res.status(200).json(ready);
    } catch (error) {
        console.error('Readiness probe error:', error);
        res.status(503).json({
            status: 'not_ready',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
}

/**
 * Liveness probe for Kubernetes/container orchestration
 */
export async function livenessProbe(req, res) {
    try {
        // Basic liveness check - just verify the process is running
        const alive = {
            status: 'alive',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            pid: process.pid
        };

        res.status(200).json(alive);
    } catch (error) {
        console.error('Liveness probe error:', error);
        res.status(503).json({
            status: 'dead',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
}

/**
 * Metrics endpoint for monitoring systems
 */
export async function metricsEndpoint(req, res) {
    try {
        const poolManager = getPoolManager();
        
        // Get database metrics
        const dbMetrics = poolManager.getMetrics();
        const dbHealth = poolManager.getHealth();
        
        // Get system metrics
        const memoryUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        // Get application metrics from database
        const appMetrics = await getApplicationMetrics(poolManager);
        
        const metrics = {
            timestamp: new Date().toISOString(),
            system: {
                uptime: process.uptime(),
                memory: {
                    rss: memoryUsage.rss,
                    heapTotal: memoryUsage.heapTotal,
                    heapUsed: memoryUsage.heapUsed,
                    external: memoryUsage.external,
                    arrayBuffers: memoryUsage.arrayBuffers
                },
                cpu: {
                    user: cpuUsage.user,
                    system: cpuUsage.system
                },
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch
            },
            database: {
                connectionPools: dbHealth.pools,
                queryMetrics: dbMetrics,
                isHealthy: dbHealth.isInitialized
            },
            application: appMetrics
        };

        // Format for Prometheus if requested
        if (req.headers.accept?.includes('text/plain')) {
            const prometheusMetrics = formatPrometheusMetrics(metrics);
            res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
            res.send(prometheusMetrics);
        } else {
            res.json(metrics);
        }
    } catch (error) {
        console.error('Metrics endpoint error:', error);
        res.status(500).json({
            error: 'Failed to collect metrics',
            timestamp: new Date().toISOString()
        });
    }
}

// Helper functions for health checks

async function checkDatabaseHealth(health) {
    try {
        const poolManager = getPoolManager();
        const startTime = Date.now();
        
        // Test basic connectivity
        await poolManager.query('SELECT NOW() as current_time', [], { queryType: 'read' });
        
        const responseTime = Date.now() - startTime;
        health.checks.database = {
            status: 'healthy',
            responseTime: `${responseTime}ms`
        };

        if (responseTime > 1000) {
            health.warnings.push('Database response time is slow');
        }
    } catch (error) {
        health.checks.database = {
            status: 'unhealthy',
            error: error.message
        };
        health.errors.push('Database connectivity failed');
    }
}

async function checkConnectionPoolHealth(health) {
    try {
        const poolManager = getPoolManager();
        const poolHealth = poolManager.getHealth();
        const poolMetrics = poolManager.getMetrics();
        
        health.checks.connectionPool = {
            status: poolHealth.isInitialized ? 'healthy' : 'unhealthy',
            pools: poolHealth.pools,
            metrics: poolMetrics
        };

        // Check for pool issues
        Object.entries(poolHealth.pools).forEach(([poolType, pool]) => {
            if (!pool.isHealthy) {
                health.warnings.push(`${poolType} connection pool is unhealthy`);
            }
            
            if (pool.poolStats?.waitingCount > 5) {
                health.warnings.push(`${poolType} pool has high waiting count`);
            }
        });
    } catch (error) {
        health.checks.connectionPool = {
            status: 'unhealthy',
            error: error.message
        };
        health.errors.push('Connection pool check failed');
    }
}

async function checkCloudflareHealth(health) {
    try {
        if (!cloudflareConfig.proxy.enabled) {
            health.checks.cloudflare = {
                status: 'disabled',
                message: 'Cloudflare proxy is disabled'
            };
            return;
        }

        // Basic Cloudflare connectivity check
        // In a real implementation, you might ping Cloudflare's API or check tunnel status
        health.checks.cloudflare = {
            status: 'healthy',
            proxy: {
                enabled: cloudflareConfig.proxy.enabled,
                hostname: cloudflareConfig.proxy.hostname
            },
            tunnel: {
                enabled: cloudflareConfig.tunnel.enabled,
                tunnelId: cloudflareConfig.tunnel.tunnel_id ? '[CONFIGURED]' : '[NOT_CONFIGURED]'
            }
        };
    } catch (error) {
        health.checks.cloudflare = {
            status: 'unhealthy',
            error: error.message
        };
        health.warnings.push('Cloudflare health check failed');
    }
}

async function checkSystemResources(health) {
    try {
        const memoryUsage = process.memoryUsage();
        const totalMemory = memoryUsage.rss + memoryUsage.heapTotal;
        const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
        
        health.checks.systemResources = {
            status: 'healthy',
            memory: {
                usage: `${Math.round(memoryUsagePercent)}%`,
                heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
                heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
                rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`
            },
            uptime: `${Math.round(process.uptime())}s`
        };

        // Check for resource issues
        if (memoryUsagePercent > 90) {
            health.warnings.push('High memory usage detected');
        }

        if (process.uptime() < 60) {
            health.warnings.push('Application recently restarted');
        }
    } catch (error) {
        health.checks.systemResources = {
            status: 'unhealthy',
            error: error.message
        };
        health.warnings.push('System resources check failed');
    }
}

async function checkExternalDependencies(health) {
    try {
        health.checks.externalDependencies = {
            status: 'healthy',
            dependencies: []
        };

        // Check if any external services are configured and test them
        // This is a placeholder for actual external dependency checks
        
    } catch (error) {
        health.checks.externalDependencies = {
            status: 'unhealthy',
            error: error.message
        };
        health.warnings.push('External dependencies check failed');
    }
}

async function getApplicationMetrics(poolManager) {
    try {
        // Get task metrics
        const taskMetrics = await poolManager.query(`
            SELECT 
                status,
                COUNT(*) as count
            FROM tasks 
            WHERE created_at > NOW() - INTERVAL '24 hours'
            GROUP BY status
        `, [], { queryType: 'analytics' });

        // Get validation metrics
        const validationMetrics = await poolManager.query(`
            SELECT 
                validation_status,
                COUNT(*) as count,
                AVG(validation_score) as avg_score
            FROM validation_results 
            WHERE created_at > NOW() - INTERVAL '24 hours'
            GROUP BY validation_status
        `, [], { queryType: 'analytics' });

        // Get error metrics
        const errorMetrics = await poolManager.query(`
            SELECT 
                error_severity,
                COUNT(*) as count
            FROM error_logs 
            WHERE created_at > NOW() - INTERVAL '24 hours'
            GROUP BY error_severity
        `, [], { queryType: 'analytics' });

        return {
            tasks: taskMetrics.rows,
            validations: validationMetrics.rows,
            errors: errorMetrics.rows
        };
    } catch (error) {
        console.error('Failed to get application metrics:', error);
        return {
            tasks: [],
            validations: [],
            errors: [],
            error: error.message
        };
    }
}

function formatPrometheusMetrics(metrics) {
    let output = '';
    
    // System metrics
    output += `# HELP taskmaster_uptime_seconds Application uptime in seconds\n`;
    output += `# TYPE taskmaster_uptime_seconds gauge\n`;
    output += `taskmaster_uptime_seconds ${metrics.system.uptime}\n\n`;
    
    output += `# HELP taskmaster_memory_usage_bytes Memory usage in bytes\n`;
    output += `# TYPE taskmaster_memory_usage_bytes gauge\n`;
    output += `taskmaster_memory_usage_bytes{type="rss"} ${metrics.system.memory.rss}\n`;
    output += `taskmaster_memory_usage_bytes{type="heap_total"} ${metrics.system.memory.heapTotal}\n`;
    output += `taskmaster_memory_usage_bytes{type="heap_used"} ${metrics.system.memory.heapUsed}\n\n`;
    
    // Database metrics
    if (metrics.database.queryMetrics) {
        Object.entries(metrics.database.queryMetrics).forEach(([poolType, poolMetrics]) => {
            output += `taskmaster_db_queries_total{pool="${poolType}"} ${poolMetrics.totalQueries || 0}\n`;
            output += `taskmaster_db_queries_successful{pool="${poolType}"} ${poolMetrics.successfulQueries || 0}\n`;
            output += `taskmaster_db_queries_failed{pool="${poolType}"} ${poolMetrics.failedQueries || 0}\n`;
        });
    }
    
    // Application metrics
    if (metrics.application.tasks) {
        metrics.application.tasks.forEach(task => {
            output += `taskmaster_tasks_total{status="${task.status}"} ${task.count}\n`;
        });
    }
    
    return output;
}

export default {
    healthCheck,
    detailedHealthCheck,
    readinessProbe,
    livenessProbe,
    metricsEndpoint
};

