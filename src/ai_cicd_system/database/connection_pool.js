/**
 * @fileoverview Enhanced Database Connection Pool Manager
 * @description Production-ready connection pooling with advanced monitoring and optimization
 */

import pg from 'pg';
import { dbConfig } from '../config/database_config.js';
import { log } from '../../../scripts/modules/utils.js';

const { Pool } = pg;

/**
 * Enhanced Database Connection Pool Manager
 * Provides advanced connection pooling with monitoring, health checks, and optimization
 */
export class EnhancedConnectionPool {
    constructor(config = dbConfig) {
        this.config = config;
        this.pools = new Map(); // Multiple pools for different purposes
        this.metrics = {
            connections: {
                total: 0,
                active: 0,
                idle: 0,
                waiting: 0
            },
            queries: {
                total: 0,
                successful: 0,
                failed: 0,
                slowQueries: 0,
                totalExecutionTime: 0,
                averageExecutionTime: 0
            },
            pool: {
                acquisitions: 0,
                acquisitionTime: [],
                timeouts: 0,
                errors: 0
            }
        };
        this.healthCheckInterval = null;
        this.metricsInterval = null;
        this.isInitialized = false;
    }

    /**
     * Initialize connection pools with different configurations
     */
    async initialize() {
        if (this.isInitialized) {
            log('warn', 'Connection pool already initialized');
            return;
        }

        try {
            // Primary pool for general operations
            await this.createPool('primary', {
                ...this.config,
                pool: {
                    ...this.config.pool,
                    min: this.config.pool.min || 2,
                    max: this.config.pool.max || 10
                }
            });

            // Read-only pool for analytics and reporting
            await this.createPool('readonly', {
                ...this.config,
                pool: {
                    ...this.config.pool,
                    min: 1,
                    max: 5
                },
                // Use read replica if available
                host: process.env.DB_READONLY_HOST || this.config.host,
                port: process.env.DB_READONLY_PORT || this.config.port
            });

            // High-priority pool for critical operations
            await this.createPool('priority', {
                ...this.config,
                pool: {
                    ...this.config.pool,
                    min: 1,
                    max: 3,
                    acquireTimeoutMillis: 5000 // Faster timeout for priority operations
                }
            });

            // Background tasks pool
            await this.createPool('background', {
                ...this.config,
                pool: {
                    ...this.config.pool,
                    min: 1,
                    max: 2,
                    idleTimeoutMillis: 30000 // Longer idle timeout for background tasks
                }
            });

            this.isInitialized = true;
            this.startHealthChecks();
            this.startMetricsCollection();

            log('info', 'Enhanced connection pools initialized successfully');
        } catch (error) {
            log('error', `Failed to initialize connection pools: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create a named connection pool
     */
    async createPool(name, config) {
        const poolConfig = {
            host: config.host,
            port: config.port,
            database: config.database,
            user: config.user,
            password: config.password,
            ssl: config.ssl,
            ...config.pool,
            
            // Enhanced pool configuration
            application_name: `taskmaster_${name}_pool`,
            statement_timeout: config.query_timeout || 60000,
            query_timeout: config.query_timeout || 60000,
            connectionTimeoutMillis: config.pool.createTimeoutMillis || 30000,
            
            // Connection validation
            allowExitOnIdle: false,
            keepAlive: true,
            keepAliveInitialDelayMillis: 10000,
        };

        const pool = new Pool(poolConfig);

        // Enhanced error handling
        pool.on('error', (err, client) => {
            log('error', `Pool ${name} error: ${err.message}`);
            this.metrics.pool.errors++;
            this.handlePoolError(name, err, client);
        });

        pool.on('connect', (client) => {
            log('debug', `New client connected to pool ${name}`);
            this.metrics.connections.total++;
            
            // Set session configuration
            client.query(`
                SET application_name = 'taskmaster_${name}';
                SET statement_timeout = '${config.query_timeout || 60000}ms';
                SET lock_timeout = '30s';
                SET idle_in_transaction_session_timeout = '60s';
            `).catch(err => {
                log('warn', `Failed to set session config for pool ${name}: ${err.message}`);
            });
        });

        pool.on('acquire', (client) => {
            this.metrics.pool.acquisitions++;
            this.metrics.connections.active++;
            this.metrics.connections.idle--;
        });

        pool.on('release', (client) => {
            this.metrics.connections.active--;
            this.metrics.connections.idle++;
        });

        // Test the pool connection
        try {
            const client = await pool.connect();
            await client.query('SELECT NOW()');
            client.release();
            log('info', `Pool ${name} connection test successful`);
        } catch (error) {
            log('error', `Pool ${name} connection test failed: ${error.message}`);
            throw error;
        }

        this.pools.set(name, pool);
        return pool;
    }

    /**
     * Get a connection pool by name
     */
    getPool(name = 'primary') {
        const pool = this.pools.get(name);
        if (!pool) {
            throw new Error(`Pool ${name} not found`);
        }
        return pool;
    }

    /**
     * Execute a query with automatic pool selection and monitoring
     */
    async query(sql, params = [], options = {}) {
        const {
            poolName = 'primary',
            timeout = this.config.query_timeout,
            retries = 1,
            priority = 'normal'
        } = options;

        const startTime = Date.now();
        let attempt = 0;
        let lastError;

        while (attempt < retries) {
            attempt++;
            
            try {
                const pool = this.getPool(poolName);
                const client = await pool.connect();
                
                try {
                    // Set query timeout
                    if (timeout) {
                        await client.query(`SET statement_timeout = '${timeout}ms'`);
                    }

                    const result = await client.query(sql, params);
                    const executionTime = Date.now() - startTime;

                    // Update metrics
                    this.updateQueryMetrics(executionTime, true);

                    // Log slow queries
                    if (executionTime > 5000) { // 5 seconds
                        log('warn', `Slow query detected (${executionTime}ms): ${sql.substring(0, 100)}...`);
                        this.metrics.queries.slowQueries++;
                    }

                    return result;
                } finally {
                    client.release();
                }
            } catch (error) {
                lastError = error;
                const executionTime = Date.now() - startTime;
                
                this.updateQueryMetrics(executionTime, false);
                
                log('error', `Query attempt ${attempt} failed: ${error.message}`);
                
                if (attempt < retries) {
                    // Wait before retry with exponential backoff
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw lastError;
    }

    /**
     * Execute a transaction with automatic retry and monitoring
     */
    async transaction(callback, options = {}) {
        const {
            poolName = 'primary',
            isolationLevel = 'READ COMMITTED',
            retries = 1
        } = options;

        const startTime = Date.now();
        let attempt = 0;
        let lastError;

        while (attempt < retries) {
            attempt++;
            const pool = this.getPool(poolName);
            const client = await pool.connect();

            try {
                await client.query('BEGIN');
                await client.query(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`);

                const result = await callback(client);

                await client.query('COMMIT');
                
                const executionTime = Date.now() - startTime;
                this.updateQueryMetrics(executionTime, true);

                return result;
            } catch (error) {
                await client.query('ROLLBACK').catch(() => {});
                lastError = error;
                
                const executionTime = Date.now() - startTime;
                this.updateQueryMetrics(executionTime, false);

                log('error', `Transaction attempt ${attempt} failed: ${error.message}`);
                
                if (attempt < retries && this.isRetryableError(error)) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    break;
                }
            } finally {
                client.release();
            }
        }

        throw lastError;
    }

    /**
     * Check if an error is retryable
     */
    isRetryableError(error) {
        const retryableCodes = [
            '40001', // serialization_failure
            '40P01', // deadlock_detected
            '53300', // too_many_connections
            '08006', // connection_failure
            '08001', // sqlclient_unable_to_establish_sqlconnection
        ];
        
        return retryableCodes.includes(error.code) || 
               error.message.includes('connection') ||
               error.message.includes('timeout');
    }

    /**
     * Update query metrics
     */
    updateQueryMetrics(executionTime, success) {
        this.metrics.queries.total++;
        this.metrics.queries.totalExecutionTime += executionTime;
        this.metrics.queries.averageExecutionTime = 
            this.metrics.queries.totalExecutionTime / this.metrics.queries.total;

        if (success) {
            this.metrics.queries.successful++;
        } else {
            this.metrics.queries.failed++;
        }
    }

    /**
     * Start health checks for all pools
     */
    startHealthChecks() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        this.healthCheckInterval = setInterval(async () => {
            await this.performHealthChecks();
        }, this.config.health_check?.interval_ms || 30000);
    }

    /**
     * Perform health checks on all pools
     */
    async performHealthChecks() {
        for (const [name, pool] of this.pools) {
            try {
                const startTime = Date.now();
                const client = await pool.connect();
                
                try {
                    await client.query('SELECT 1');
                    const responseTime = Date.now() - startTime;
                    
                    log('debug', `Pool ${name} health check passed (${responseTime}ms)`);
                } finally {
                    client.release();
                }
            } catch (error) {
                log('error', `Pool ${name} health check failed: ${error.message}`);
                await this.handleUnhealthyPool(name, pool);
            }
        }
    }

    /**
     * Handle unhealthy pool
     */
    async handleUnhealthyPool(name, pool) {
        log('warn', `Attempting to recover unhealthy pool: ${name}`);
        
        try {
            // Try to end all connections and recreate the pool
            await pool.end();
            
            // Recreate the pool with the same configuration
            const config = this.getPoolConfig(name);
            await this.createPool(name, config);
            
            log('info', `Pool ${name} recovered successfully`);
        } catch (error) {
            log('error', `Failed to recover pool ${name}: ${error.message}`);
        }
    }

    /**
     * Get pool configuration by name
     */
    getPoolConfig(name) {
        // Return appropriate config based on pool name
        switch (name) {
            case 'readonly':
                return {
                    ...this.config,
                    host: process.env.DB_READONLY_HOST || this.config.host,
                    port: process.env.DB_READONLY_PORT || this.config.port,
                    pool: { ...this.config.pool, min: 1, max: 5 }
                };
            case 'priority':
                return {
                    ...this.config,
                    pool: { ...this.config.pool, min: 1, max: 3, acquireTimeoutMillis: 5000 }
                };
            case 'background':
                return {
                    ...this.config,
                    pool: { ...this.config.pool, min: 1, max: 2, idleTimeoutMillis: 30000 }
                };
            default:
                return this.config;
        }
    }

    /**
     * Start metrics collection
     */
    startMetricsCollection() {
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
        }

        this.metricsInterval = setInterval(() => {
            this.collectPoolMetrics();
        }, 60000); // Collect metrics every minute
    }

    /**
     * Collect pool metrics
     */
    collectPoolMetrics() {
        for (const [name, pool] of this.pools) {
            const poolMetrics = {
                name,
                totalCount: pool.totalCount,
                idleCount: pool.idleCount,
                waitingCount: pool.waitingCount,
                maxCount: pool.options.max,
                minCount: pool.options.min
            };

            // Update connection metrics
            this.metrics.connections.total = poolMetrics.totalCount;
            this.metrics.connections.idle = poolMetrics.idleCount;
            this.metrics.connections.waiting = poolMetrics.waitingCount;
            this.metrics.connections.active = poolMetrics.totalCount - poolMetrics.idleCount;

            log('debug', `Pool ${name} metrics:`, poolMetrics);
        }
    }

    /**
     * Handle pool errors
     */
    handlePoolError(poolName, error, client) {
        log('error', `Pool ${poolName} error: ${error.message}`);
        
        // Implement error-specific handling
        if (error.code === '53300') { // too_many_connections
            log('warn', `Too many connections in pool ${poolName}, consider increasing limits`);
        } else if (error.code === '08006') { // connection_failure
            log('warn', `Connection failure in pool ${poolName}, will attempt recovery`);
        }

        // Remove problematic client if provided
        if (client) {
            try {
                client.release(true); // Force release
            } catch (releaseError) {
                log('error', `Failed to release problematic client: ${releaseError.message}`);
            }
        }
    }

    /**
     * Get current pool statistics
     */
    getStatistics() {
        const poolStats = {};
        
        for (const [name, pool] of this.pools) {
            poolStats[name] = {
                totalCount: pool.totalCount,
                idleCount: pool.idleCount,
                waitingCount: pool.waitingCount,
                maxCount: pool.options.max,
                minCount: pool.options.min
            };
        }

        return {
            pools: poolStats,
            metrics: this.metrics,
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Optimize pool configurations based on usage patterns
     */
    async optimizePools() {
        log('info', 'Starting pool optimization analysis');

        for (const [name, pool] of this.pools) {
            const stats = this.getStatistics().pools[name];
            
            // Analyze usage patterns
            const utilizationRate = (stats.totalCount - stats.idleCount) / stats.maxCount;
            const waitingRate = stats.waitingCount / stats.maxCount;

            // Suggest optimizations
            if (utilizationRate > 0.8 && waitingRate > 0.1) {
                log('warn', `Pool ${name} is under pressure (utilization: ${(utilizationRate * 100).toFixed(1)}%, waiting: ${stats.waitingCount}). Consider increasing max connections.`);
            } else if (utilizationRate < 0.2 && stats.totalCount > stats.minCount) {
                log('info', `Pool ${name} is underutilized (utilization: ${(utilizationRate * 100).toFixed(1)}%). Consider reducing max connections.`);
            }
        }
    }

    /**
     * Graceful shutdown of all pools
     */
    async shutdown() {
        log('info', 'Shutting down connection pools...');

        // Clear intervals
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
        }

        // Close all pools
        const shutdownPromises = [];
        for (const [name, pool] of this.pools) {
            shutdownPromises.push(
                pool.end().then(() => {
                    log('info', `Pool ${name} closed successfully`);
                }).catch(error => {
                    log('error', `Error closing pool ${name}: ${error.message}`);
                })
            );
        }

        await Promise.all(shutdownPromises);
        this.pools.clear();
        this.isInitialized = false;
        
        log('info', 'All connection pools shut down');
    }
}

// Singleton instance
let poolManager = null;

/**
 * Get the singleton pool manager instance
 */
export function getPoolManager() {
    if (!poolManager) {
        poolManager = new EnhancedConnectionPool();
    }
    return poolManager;
}

/**
 * Initialize the global pool manager
 */
export async function initializePoolManager(config) {
    const manager = getPoolManager();
    if (config) {
        manager.config = { ...manager.config, ...config };
    }
    await manager.initialize();
    return manager;
}

/**
 * Convenience function for executing queries
 */
export async function query(sql, params, options) {
    const manager = getPoolManager();
    return manager.query(sql, params, options);
}

/**
 * Convenience function for executing transactions
 */
export async function transaction(callback, options) {
    const manager = getPoolManager();
    return manager.transaction(callback, options);
}

export default {
    EnhancedConnectionPool,
    getPoolManager,
    initializePoolManager,
    query,
    transaction
};

