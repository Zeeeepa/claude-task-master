/**
 * @fileoverview Advanced Connection Pool Management
 * @description Production-ready connection pool management with pgBouncer integration
 */

import { Pool } from 'pg';
import { dbConfig } from '../config/database_config.js';
import { cloudflareConfig } from '../config/cloudflare_config.js';
import { log } from '../../../scripts/modules/utils.js';

/**
 * Advanced Connection Pool Manager
 * Handles multiple connection pools, load balancing, and pgBouncer integration
 */
export class ConnectionPoolManager {
    constructor(config = {}) {
        this.config = { ...dbConfig, ...config };
        this.pools = new Map();
        this.poolStats = new Map();
        this.isInitialized = false;
        this.healthCheckInterval = null;
        this.metricsInterval = null;
        this.loadBalancer = null;
        
        // Pool types
        this.poolTypes = {
            READ: 'read',
            write: 'write',
            analytics: 'analytics',
            background: 'background'
        };
        
        // Connection pool configurations for different use cases
        this.poolConfigs = {
            [this.poolTypes.read]: {
                ...this.config.pool,
                max: Math.ceil(this.config.pool.max * 0.6), // 60% for reads
                min: Math.ceil(this.config.pool.min * 0.4),
                statement_timeout: 30000,
                query_timeout: 30000,
            },
            [this.poolTypes.write]: {
                ...this.config.pool,
                max: Math.ceil(this.config.pool.max * 0.3), // 30% for writes
                min: Math.ceil(this.config.pool.min * 0.3),
                statement_timeout: 60000,
                query_timeout: 60000,
            },
            [this.poolTypes.analytics]: {
                ...this.config.pool,
                max: Math.ceil(this.config.pool.max * 0.1), // 10% for analytics
                min: 1,
                statement_timeout: 300000, // 5 minutes for long queries
                query_timeout: 300000,
            },
            [this.poolTypes.background]: {
                ...this.config.pool,
                max: 2, // Limited for background tasks
                min: 1,
                statement_timeout: 600000, // 10 minutes for background jobs
                query_timeout: 600000,
            }
        };
    }

    /**
     * Initialize all connection pools
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            log('warn', 'Connection pool manager already initialized');
            return;
        }

        log('info', 'Initializing connection pool manager...');

        try {
            // Initialize pools for different purposes
            await this._initializePools();
            
            // Set up load balancer if enabled
            if (cloudflareConfig.load_balancing.enabled) {
                await this._initializeLoadBalancer();
            }
            
            // Start health monitoring
            this._startHealthMonitoring();
            
            // Start metrics collection
            this._startMetricsCollection();
            
            this.isInitialized = true;
            log('info', 'Connection pool manager initialized successfully');
            
        } catch (error) {
            log('error', `Failed to initialize connection pool manager: ${error.message}`);
            throw error;
        }
    }

    /**
     * Initialize individual connection pools
     * @private
     */
    async _initializePools() {
        const poolPromises = Object.entries(this.poolTypes).map(async ([name, type]) => {
            try {
                const poolConfig = this._getPoolConfig(type);
                const pool = new Pool(poolConfig);
                
                // Set up pool event handlers
                this._setupPoolEventHandlers(pool, type);
                
                // Test the connection
                await this._testPoolConnection(pool, type);
                
                this.pools.set(type, pool);
                this.poolStats.set(type, {
                    created: new Date(),
                    totalQueries: 0,
                    successfulQueries: 0,
                    failedQueries: 0,
                    totalExecutionTime: 0,
                    slowQueries: 0,
                    lastHealthCheck: null,
                    isHealthy: true
                });
                
                log('info', `Initialized ${type} connection pool`);
                
            } catch (error) {
                log('error', `Failed to initialize ${type} pool: ${error.message}`);
                throw error;
            }
        });

        await Promise.all(poolPromises);
    }

    /**
     * Get pool configuration for specific type
     * @param {string} poolType - Type of pool
     * @returns {Object} Pool configuration
     * @private
     */
    _getPoolConfig(poolType) {
        const baseConfig = {
            host: this._getHostForPool(poolType),
            port: this.config.port,
            database: this.config.database,
            user: this.config.user,
            password: this.config.password,
            ssl: this.config.ssl,
        };

        const poolSpecificConfig = this.poolConfigs[poolType];
        
        return {
            ...baseConfig,
            ...poolSpecificConfig,
            // Add pool-specific application name for monitoring
            application_name: `taskmaster_${poolType}_pool`,
        };
    }

    /**
     * Get appropriate host for pool type (supports read replicas)
     * @param {string} poolType - Type of pool
     * @returns {string} Database host
     * @private
     */
    _getHostForPool(poolType) {
        // Use Cloudflare proxy if enabled
        if (cloudflareConfig.proxy.enabled) {
            return cloudflareConfig.proxy.hostname;
        }

        // Use read replica for read-only operations if configured
        if (poolType === this.poolTypes.read && process.env.DB_READ_REPLICA_HOST) {
            return process.env.DB_READ_REPLICA_HOST;
        }

        // Use analytics replica for analytics queries if configured
        if (poolType === this.poolTypes.analytics && process.env.DB_ANALYTICS_HOST) {
            return process.env.DB_ANALYTICS_HOST;
        }

        return this.config.host;
    }

    /**
     * Set up event handlers for a pool
     * @param {Pool} pool - Database pool
     * @param {string} poolType - Type of pool
     * @private
     */
    _setupPoolEventHandlers(pool, poolType) {
        pool.on('connect', (client) => {
            log('debug', `New client connected to ${poolType} pool`);
        });

        pool.on('acquire', (client) => {
            log('debug', `Client acquired from ${poolType} pool`);
        });

        pool.on('remove', (client) => {
            log('debug', `Client removed from ${poolType} pool`);
        });

        pool.on('error', (err, client) => {
            log('error', `${poolType} pool error: ${err.message}`);
            const stats = this.poolStats.get(poolType);
            if (stats) {
                stats.isHealthy = false;
            }
        });
    }

    /**
     * Test pool connection
     * @param {Pool} pool - Database pool
     * @param {string} poolType - Type of pool
     * @private
     */
    async _testPoolConnection(pool, poolType) {
        const client = await pool.connect();
        try {
            const result = await client.query('SELECT NOW() as current_time, version() as version');
            log('debug', `${poolType} pool connection test successful`);
        } finally {
            client.release();
        }
    }

    /**
     * Get appropriate pool for query type
     * @param {string} queryType - Type of query ('read', 'write', 'analytics', 'background')
     * @returns {Pool} Database pool
     */
    getPool(queryType = 'read') {
        if (!this.isInitialized) {
            throw new Error('Connection pool manager not initialized');
        }

        const pool = this.pools.get(queryType);
        if (!pool) {
            log('warn', `Pool type ${queryType} not found, falling back to read pool`);
            return this.pools.get(this.poolTypes.read);
        }

        return pool;
    }

    /**
     * Execute query with automatic pool selection
     * @param {string} text - SQL query
     * @param {Array} params - Query parameters
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Query result
     */
    async query(text, params = [], options = {}) {
        const queryType = this._determineQueryType(text, options);
        const pool = this.getPool(queryType);
        const stats = this.poolStats.get(queryType);
        
        const startTime = Date.now();
        const queryId = `${queryType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        try {
            if (this.config.monitoring.log_queries) {
                log('debug', `Executing ${queryType} query ${queryId}: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
            }

            const result = await pool.query(text, params);
            const executionTime = Date.now() - startTime;

            // Update statistics
            if (stats) {
                stats.totalQueries++;
                stats.successfulQueries++;
                stats.totalExecutionTime += executionTime;

                if (executionTime > this.config.monitoring.slow_query_threshold_ms) {
                    stats.slowQueries++;
                    if (this.config.monitoring.log_slow_queries) {
                        log('warn', `Slow ${queryType} query detected (${executionTime}ms): ${text.substring(0, 200)}${text.length > 200 ? '...' : ''}`);
                    }
                }
            }

            log('debug', `Query ${queryId} completed in ${executionTime}ms`);
            return result;

        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            if (stats) {
                stats.totalQueries++;
                stats.failedQueries++;
            }

            log('error', `Query ${queryId} failed after ${executionTime}ms: ${error.message}`);
            throw error;
        }
    }

    /**
     * Determine query type based on SQL text
     * @param {string} text - SQL query
     * @param {Object} options - Query options
     * @returns {string} Query type
     * @private
     */
    _determineQueryType(text, options = {}) {
        if (options.queryType) {
            return options.queryType;
        }

        const upperText = text.trim().toUpperCase();
        
        // Write operations
        if (upperText.startsWith('INSERT') || 
            upperText.startsWith('UPDATE') || 
            upperText.startsWith('DELETE') ||
            upperText.startsWith('CREATE') ||
            upperText.startsWith('ALTER') ||
            upperText.startsWith('DROP')) {
            return this.poolTypes.write;
        }

        // Analytics queries (complex aggregations, reports)
        if (upperText.includes('GROUP BY') && upperText.includes('COUNT') ||
            upperText.includes('SUM(') ||
            upperText.includes('AVG(') ||
            upperText.includes('WINDOW') ||
            upperText.includes('PARTITION BY') ||
            options.isAnalytics) {
            return this.poolTypes.analytics;
        }

        // Background tasks
        if (options.isBackground || 
            upperText.includes('VACUUM') ||
            upperText.includes('ANALYZE') ||
            upperText.includes('REINDEX')) {
            return this.poolTypes.background;
        }

        // Default to read
        return this.poolTypes.read;
    }

    /**
     * Execute transaction with appropriate pool
     * @param {Function} callback - Transaction callback
     * @param {Object} options - Transaction options
     * @returns {Promise<any>} Transaction result
     */
    async transaction(callback, options = {}) {
        const queryType = options.queryType || this.poolTypes.write;
        const pool = this.getPool(queryType);
        
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Start health monitoring for all pools
     * @private
     */
    _startHealthMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        this.healthCheckInterval = setInterval(async () => {
            for (const [poolType, pool] of this.pools) {
                try {
                    await this._performPoolHealthCheck(pool, poolType);
                } catch (error) {
                    log('error', `Health check failed for ${poolType} pool: ${error.message}`);
                    const stats = this.poolStats.get(poolType);
                    if (stats) {
                        stats.isHealthy = false;
                    }
                }
            }
        }, this.config.health_check.interval_ms);

        log('debug', 'Health monitoring started for all pools');
    }

    /**
     * Perform health check for specific pool
     * @param {Pool} pool - Database pool
     * @param {string} poolType - Type of pool
     * @private
     */
    async _performPoolHealthCheck(pool, poolType) {
        const startTime = Date.now();
        
        try {
            const result = await pool.query('SELECT 1 as health_check');
            const responseTime = Date.now() - startTime;
            
            const stats = this.poolStats.get(poolType);
            if (stats) {
                stats.lastHealthCheck = {
                    timestamp: new Date(),
                    status: 'healthy',
                    responseTime,
                    poolStats: this._getPoolStats(pool)
                };
                stats.isHealthy = true;
            }

            if (responseTime > this.config.health_check.timeout_ms / 2) {
                log('warn', `${poolType} pool health check slow response: ${responseTime}ms`);
            }

        } catch (error) {
            const stats = this.poolStats.get(poolType);
            if (stats) {
                stats.lastHealthCheck = {
                    timestamp: new Date(),
                    status: 'unhealthy',
                    error: error.message,
                    poolStats: this._getPoolStats(pool)
                };
                stats.isHealthy = false;
            }
            throw error;
        }
    }

    /**
     * Start metrics collection
     * @private
     */
    _startMetricsCollection() {
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
        }

        this.metricsInterval = setInterval(() => {
            this._collectMetrics();
        }, 60000); // Collect metrics every minute

        log('debug', 'Metrics collection started');
    }

    /**
     * Collect and log metrics for all pools
     * @private
     */
    _collectMetrics() {
        for (const [poolType, pool] of this.pools) {
            const stats = this.poolStats.get(poolType);
            const poolStats = this._getPoolStats(pool);
            
            if (stats && poolStats) {
                const metrics = {
                    poolType,
                    totalQueries: stats.totalQueries,
                    successfulQueries: stats.successfulQueries,
                    failedQueries: stats.failedQueries,
                    successRate: stats.totalQueries > 0 ? (stats.successfulQueries / stats.totalQueries) * 100 : 0,
                    avgExecutionTime: stats.totalQueries > 0 ? stats.totalExecutionTime / stats.totalQueries : 0,
                    slowQueries: stats.slowQueries,
                    slowQueryRate: stats.totalQueries > 0 ? (stats.slowQueries / stats.totalQueries) * 100 : 0,
                    poolSize: poolStats.totalCount,
                    idleConnections: poolStats.idleCount,
                    waitingClients: poolStats.waitingCount,
                    isHealthy: stats.isHealthy
                };

                log('debug', `Pool metrics for ${poolType}:`, metrics);
                
                // Store metrics in performance_metrics table if needed
                if (this.config.monitoring.store_metrics) {
                    this._storeMetrics(poolType, metrics);
                }
            }
        }
    }

    /**
     * Get pool statistics
     * @param {Pool} pool - Database pool
     * @returns {Object} Pool statistics
     * @private
     */
    _getPoolStats(pool) {
        if (!pool) return null;

        return {
            totalCount: pool.totalCount,
            idleCount: pool.idleCount,
            waitingCount: pool.waitingCount
        };
    }

    /**
     * Get comprehensive health status for all pools
     * @returns {Object} Health status
     */
    getHealth() {
        const poolHealth = {};
        
        for (const [poolType, pool] of this.pools) {
            const stats = this.poolStats.get(poolType);
            poolHealth[poolType] = {
                isHealthy: stats?.isHealthy || false,
                lastHealthCheck: stats?.lastHealthCheck,
                poolStats: this._getPoolStats(pool),
                queryStats: {
                    total: stats?.totalQueries || 0,
                    successful: stats?.successfulQueries || 0,
                    failed: stats?.failedQueries || 0,
                    slow: stats?.slowQueries || 0
                }
            };
        }

        return {
            isInitialized: this.isInitialized,
            poolCount: this.pools.size,
            pools: poolHealth,
            config: {
                cloudflareProxyEnabled: cloudflareConfig.proxy.enabled,
                loadBalancingEnabled: cloudflareConfig.load_balancing.enabled,
                healthCheckInterval: this.config.health_check.interval_ms
            }
        };
    }

    /**
     * Get performance metrics for all pools
     * @returns {Object} Performance metrics
     */
    getMetrics() {
        const poolMetrics = {};
        
        for (const [poolType, stats] of this.poolStats) {
            const avgExecutionTime = stats.totalQueries > 0 
                ? stats.totalExecutionTime / stats.totalQueries 
                : 0;

            poolMetrics[poolType] = {
                totalQueries: stats.totalQueries,
                successfulQueries: stats.successfulQueries,
                failedQueries: stats.failedQueries,
                slowQueries: stats.slowQueries,
                avgExecutionTime,
                successRate: stats.totalQueries > 0 
                    ? (stats.successfulQueries / stats.totalQueries) * 100 
                    : 0,
                slowQueryRate: stats.totalQueries > 0 
                    ? (stats.slowQueries / stats.totalQueries) * 100 
                    : 0,
                isHealthy: stats.isHealthy
            };
        }

        return poolMetrics;
    }

    /**
     * Gracefully shutdown all pools
     * @returns {Promise<void>}
     */
    async shutdown() {
        log('info', 'Shutting down connection pool manager...');

        // Stop monitoring intervals
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
            this.metricsInterval = null;
        }

        // Close all pools
        const shutdownPromises = Array.from(this.pools.entries()).map(async ([poolType, pool]) => {
            try {
                await pool.end();
                log('info', `${poolType} pool closed`);
            } catch (error) {
                log('error', `Error closing ${poolType} pool: ${error.message}`);
            }
        });

        await Promise.all(shutdownPromises);

        this.pools.clear();
        this.poolStats.clear();
        this.isInitialized = false;

        log('info', 'Connection pool manager shutdown complete');
    }
}

// Singleton instance
let poolManager = null;

/**
 * Get connection pool manager instance (singleton)
 * @returns {ConnectionPoolManager} Pool manager instance
 */
export function getPoolManager() {
    if (!poolManager) {
        poolManager = new ConnectionPoolManager();
    }
    return poolManager;
}

/**
 * Initialize connection pool manager
 * @param {Object} config - Optional configuration override
 * @returns {Promise<ConnectionPoolManager>} Initialized pool manager
 */
export async function initializePoolManager(config = null) {
    const manager = getPoolManager();
    if (config) {
        manager.config = { ...manager.config, ...config };
    }
    await manager.initialize();
    return manager;
}

export default ConnectionPoolManager;

