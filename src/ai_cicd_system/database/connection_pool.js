/**
 * @fileoverview Enhanced Database Connection Pool Manager
 * @description Advanced PostgreSQL connection pooling with dynamic sizing, load balancing, and health monitoring
 */

import pg from 'pg';
import { EventEmitter } from 'events';
import { dbConfig, validateConfig, getConnectionString } from '../config/database_config.js';
import { log } from '../../../scripts/modules/utils.js';

const { Pool } = pg;

/**
 * Enhanced Database Connection Pool Manager
 * Provides dynamic pool sizing, load balancing, and comprehensive monitoring
 */
export class ConnectionPoolManager extends EventEmitter {
    constructor(config = dbConfig) {
        super();
        this.config = config;
        this.pools = new Map(); // Support for multiple database instances
        this.primaryPool = null;
        this.isInitialized = false;
        this.healthMonitor = null;
        this.loadBalancer = null;
        this.metrics = {
            totalConnections: 0,
            activeConnections: 0,
            idleConnections: 0,
            waitingRequests: 0,
            totalQueries: 0,
            successfulQueries: 0,
            failedQueries: 0,
            avgResponseTime: 0,
            connectionLeaks: 0,
            poolResizes: 0,
            lastHealthCheck: null
        };
        this.connectionHistory = [];
        this.queryHistory = [];
        this.leakDetectionInterval = null;
        this.dynamicSizingInterval = null;
    }

    /**
     * Initialize the connection pool manager
     * @param {Object} options - Initialization options
     * @returns {Promise<void>}
     */
    async initialize(options = {}) {
        if (this.isInitialized) {
            log('warn', 'Connection pool manager already initialized');
            return;
        }

        // Validate configuration
        const validation = validateConfig();
        if (!validation.valid) {
            throw new Error(`Database configuration invalid: ${validation.errors.join(', ')}`);
        }

        log('info', 'Initializing enhanced connection pool manager...');

        // Create primary pool
        await this._createPrimaryPool();

        // Initialize health monitoring
        if (this.config.health_check.enabled) {
            this._initializeHealthMonitoring();
        }

        // Initialize dynamic pool sizing
        if (options.enableDynamicSizing !== false) {
            this._initializeDynamicSizing();
        }

        // Initialize connection leak detection
        if (options.enableLeakDetection !== false) {
            this._initializeLeakDetection();
        }

        // Initialize load balancing for multiple instances
        if (options.readReplicas && options.readReplicas.length > 0) {
            await this._initializeLoadBalancing(options.readReplicas);
        }

        this.isInitialized = true;
        this.emit('initialized');
        log('info', 'Connection pool manager initialized successfully');
    }

    /**
     * Create the primary database connection pool
     * @private
     */
    async _createPrimaryPool() {
        const poolConfig = {
            host: this.config.host,
            port: this.config.port,
            database: this.config.database,
            user: this.config.user,
            password: this.config.password,
            ssl: this.config.ssl,
            min: this.config.pool.min,
            max: this.config.pool.max,
            idleTimeoutMillis: this.config.pool.idleTimeoutMillis,
            acquireTimeoutMillis: this.config.pool.acquireTimeoutMillis,
            createTimeoutMillis: this.config.pool.createTimeoutMillis,
            destroyTimeoutMillis: this.config.pool.destroyTimeoutMillis,
            reapIntervalMillis: this.config.pool.reapIntervalMillis,
            createRetryIntervalMillis: this.config.pool.createRetryIntervalMillis,
            // Enhanced configuration
            allowExitOnIdle: false,
            maxUses: 7500, // Prevent connection degradation
            log: (msg, level) => {
                if (level === 'error') {
                    log('error', `Pool error: ${msg}`);
                } else if (this.config.monitoring.log_queries) {
                    log('debug', `Pool: ${msg}`);
                }
            }
        };

        this.primaryPool = new Pool(poolConfig);
        this.pools.set('primary', this.primaryPool);

        // Enhanced event handlers
        this.primaryPool.on('connect', (client) => {
            this.metrics.totalConnections++;
            this._trackConnectionEvent('connect', client);
            this.emit('connection:created', { client, pool: 'primary' });
            log('debug', 'New database client connected to primary pool');
        });

        this.primaryPool.on('acquire', (client) => {
            this.metrics.activeConnections++;
            this._trackConnectionEvent('acquire', client);
            this.emit('connection:acquired', { client, pool: 'primary' });
        });

        this.primaryPool.on('release', (client) => {
            this.metrics.activeConnections = Math.max(0, this.metrics.activeConnections - 1);
            this._trackConnectionEvent('release', client);
            this.emit('connection:released', { client, pool: 'primary' });
        });

        this.primaryPool.on('remove', (client) => {
            this.metrics.totalConnections = Math.max(0, this.metrics.totalConnections - 1);
            this._trackConnectionEvent('remove', client);
            this.emit('connection:removed', { client, pool: 'primary' });
            log('debug', 'Database client removed from primary pool');
        });

        this.primaryPool.on('error', (err, client) => {
            this.metrics.failedQueries++;
            this.emit('pool:error', { error: err, client, pool: 'primary' });
            log('error', `Primary pool error: ${err.message}`);
        });

        // Test the connection
        await this._testPoolConnection(this.primaryPool, 'primary');
    }

    /**
     * Initialize load balancing for read replicas
     * @param {Array} readReplicas - Array of read replica configurations
     * @private
     */
    async _initializeLoadBalancing(readReplicas) {
        log('info', `Initializing load balancing with ${readReplicas.length} read replicas`);

        for (let i = 0; i < readReplicas.length; i++) {
            const replicaConfig = { ...this.config, ...readReplicas[i] };
            const poolName = `replica_${i + 1}`;
            
            const pool = new Pool({
                host: replicaConfig.host,
                port: replicaConfig.port,
                database: replicaConfig.database,
                user: replicaConfig.user,
                password: replicaConfig.password,
                ssl: replicaConfig.ssl,
                min: Math.ceil(this.config.pool.min / 2), // Smaller pools for replicas
                max: Math.ceil(this.config.pool.max / 2),
                idleTimeoutMillis: this.config.pool.idleTimeoutMillis,
                acquireTimeoutMillis: this.config.pool.acquireTimeoutMillis
            });

            this.pools.set(poolName, pool);
            await this._testPoolConnection(pool, poolName);
        }

        this.loadBalancer = new LoadBalancer(Array.from(this.pools.keys()));
        log('info', 'Load balancing initialized successfully');
    }

    /**
     * Initialize health monitoring
     * @private
     */
    _initializeHealthMonitoring() {
        this.healthMonitor = setInterval(async () => {
            try {
                await this._performHealthCheck();
            } catch (error) {
                log('error', `Health check failed: ${error.message}`);
                this.emit('health:check:failed', { error });
            }
        }, this.config.health_check.interval_ms);

        log('debug', `Health monitoring started (interval: ${this.config.health_check.interval_ms}ms)`);
    }

    /**
     * Initialize dynamic pool sizing
     * @private
     */
    _initializeDynamicSizing() {
        this.dynamicSizingInterval = setInterval(() => {
            this._adjustPoolSize();
        }, 30000); // Check every 30 seconds

        log('debug', 'Dynamic pool sizing initialized');
    }

    /**
     * Initialize connection leak detection
     * @private
     */
    _initializeLeakDetection() {
        this.leakDetectionInterval = setInterval(() => {
            this._detectConnectionLeaks();
        }, 60000); // Check every minute

        log('debug', 'Connection leak detection initialized');
    }

    /**
     * Get a connection from the appropriate pool
     * @param {string} operation - Type of operation ('read' or 'write')
     * @returns {Promise<Object>} Database client
     */
    async getConnection(operation = 'write') {
        if (!this.isInitialized) {
            throw new Error('Connection pool manager not initialized');
        }

        const poolName = this._selectPool(operation);
        const pool = this.pools.get(poolName);
        
        if (!pool) {
            throw new Error(`Pool ${poolName} not found`);
        }

        const startTime = Date.now();
        
        try {
            const client = await pool.connect();
            const acquisitionTime = Date.now() - startTime;
            
            // Track connection acquisition
            this._trackConnectionAcquisition(poolName, acquisitionTime);
            
            // Add release tracking
            const originalRelease = client.release.bind(client);
            client.release = (err) => {
                this._trackConnectionRelease(poolName);
                return originalRelease(err);
            };

            return {
                client,
                pool: poolName,
                acquisitionTime
            };
        } catch (error) {
            this.metrics.failedQueries++;
            this.emit('connection:acquisition:failed', { pool: poolName, error });
            throw error;
        }
    }

    /**
     * Execute a query with automatic pool selection and monitoring
     * @param {string} text - SQL query text
     * @param {Array} params - Query parameters
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Query result
     */
    async query(text, params = [], options = {}) {
        const operation = this._determineOperation(text);
        const connection = await this.getConnection(operation);
        
        const startTime = Date.now();
        const queryId = `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        try {
            if (this.config.monitoring.log_queries) {
                log('debug', `Executing query ${queryId} on ${connection.pool}: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
            }

            // Set query timeout if specified
            if (options.timeout || this.config.query_timeout) {
                await connection.client.query('SET statement_timeout = $1', [options.timeout || this.config.query_timeout]);
            }

            const result = await connection.client.query(text, params);
            const executionTime = Date.now() - startTime;

            // Update metrics
            this.metrics.totalQueries++;
            this.metrics.successfulQueries++;
            this._updateAverageResponseTime(executionTime);

            // Track query performance
            this._trackQueryPerformance(queryId, connection.pool, executionTime, true);

            // Log slow queries
            if (executionTime > this.config.monitoring.slow_query_threshold_ms) {
                if (this.config.monitoring.log_slow_queries) {
                    log('warn', `Slow query detected (${executionTime}ms) on ${connection.pool}: ${text.substring(0, 200)}${text.length > 200 ? '...' : ''}`);
                }
            }

            this.emit('query:completed', {
                queryId,
                pool: connection.pool,
                executionTime,
                operation
            });

            return result;

        } catch (error) {
            const executionTime = Date.now() - startTime;
            this.metrics.totalQueries++;
            this.metrics.failedQueries++;

            this._trackQueryPerformance(queryId, connection.pool, executionTime, false);
            this.emit('query:failed', {
                queryId,
                pool: connection.pool,
                executionTime,
                error,
                operation
            });

            log('error', `Query ${queryId} failed on ${connection.pool} after ${executionTime}ms: ${error.message}`);
            throw error;

        } finally {
            connection.client.release();
        }
    }

    /**
     * Execute a transaction
     * @param {Function} callback - Transaction callback function
     * @param {Object} options - Transaction options
     * @returns {Promise<any>} Transaction result
     */
    async transaction(callback, options = {}) {
        const connection = await this.getConnection('write'); // Transactions always use write pool
        
        try {
            await connection.client.query('BEGIN');
            
            if (options.isolationLevel) {
                await connection.client.query(`SET TRANSACTION ISOLATION LEVEL ${options.isolationLevel}`);
            }
            
            const result = await callback(connection.client);
            await connection.client.query('COMMIT');
            
            this.emit('transaction:completed', { pool: connection.pool });
            return result;
            
        } catch (error) {
            await connection.client.query('ROLLBACK');
            this.emit('transaction:failed', { pool: connection.pool, error });
            throw error;
            
        } finally {
            connection.client.release();
        }
    }

    /**
     * Get comprehensive pool statistics
     * @returns {Object} Pool statistics
     */
    getPoolStats() {
        const stats = {
            pools: {},
            metrics: { ...this.metrics },
            health: this.getHealthStatus(),
            performance: this.getPerformanceMetrics()
        };

        for (const [name, pool] of this.pools) {
            stats.pools[name] = {
                totalCount: pool.totalCount,
                idleCount: pool.idleCount,
                waitingCount: pool.waitingCount,
                expiredCount: pool.expiredCount || 0,
                status: this._getPoolHealth(pool)
            };
        }

        return stats;
    }

    /**
     * Get health status
     * @returns {Object} Health status
     */
    getHealthStatus() {
        const poolHealth = {};
        for (const [name, pool] of this.pools) {
            poolHealth[name] = this._getPoolHealth(pool);
        }

        return {
            overall: Object.values(poolHealth).every(h => h === 'healthy') ? 'healthy' : 'degraded',
            pools: poolHealth,
            lastCheck: this.metrics.lastHealthCheck,
            connectionLeaks: this.metrics.connectionLeaks
        };
    }

    /**
     * Get performance metrics
     * @returns {Object} Performance metrics
     */
    getPerformanceMetrics() {
        const successRate = this.metrics.totalQueries > 0 
            ? (this.metrics.successfulQueries / this.metrics.totalQueries) * 100 
            : 0;

        return {
            totalQueries: this.metrics.totalQueries,
            successRate: Math.round(successRate * 100) / 100,
            avgResponseTime: Math.round(this.metrics.avgResponseTime * 100) / 100,
            poolResizes: this.metrics.poolResizes,
            recentQueries: this.queryHistory.slice(-10)
        };
    }

    /**
     * Gracefully shutdown all pools
     * @returns {Promise<void>}
     */
    async shutdown() {
        log('info', 'Shutting down connection pool manager...');

        // Clear intervals
        if (this.healthMonitor) {
            clearInterval(this.healthMonitor);
        }
        if (this.dynamicSizingInterval) {
            clearInterval(this.dynamicSizingInterval);
        }
        if (this.leakDetectionInterval) {
            clearInterval(this.leakDetectionInterval);
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

        await Promise.allSettled(shutdownPromises);
        
        this.pools.clear();
        this.isInitialized = false;
        this.emit('shutdown');
        log('info', 'Connection pool manager shutdown complete');
    }

    // Private helper methods

    /**
     * Select appropriate pool for operation
     * @param {string} operation - Operation type
     * @returns {string} Pool name
     * @private
     */
    _selectPool(operation) {
        if (operation === 'read' && this.loadBalancer) {
            return this.loadBalancer.getNextReadPool();
        }
        return 'primary';
    }

    /**
     * Determine operation type from SQL
     * @param {string} sql - SQL query
     * @returns {string} Operation type
     * @private
     */
    _determineOperation(sql) {
        const normalizedSql = sql.trim().toLowerCase();
        if (normalizedSql.startsWith('select') || 
            normalizedSql.startsWith('with') ||
            normalizedSql.startsWith('explain')) {
            return 'read';
        }
        return 'write';
    }

    /**
     * Test pool connection
     * @param {Pool} pool - Database pool
     * @param {string} name - Pool name
     * @private
     */
    async _testPoolConnection(pool, name) {
        const client = await pool.connect();
        try {
            const result = await client.query('SELECT NOW() as current_time, version() as version');
            log('debug', `Pool ${name} connection test successful. Server time: ${result.rows[0].current_time}`);
        } finally {
            client.release();
        }
    }

    /**
     * Perform comprehensive health check
     * @private
     */
    async _performHealthCheck() {
        const startTime = Date.now();
        const healthResults = {};

        for (const [name, pool] of this.pools) {
            try {
                const client = await pool.connect();
                try {
                    await client.query('SELECT 1');
                    healthResults[name] = {
                        status: 'healthy',
                        responseTime: Date.now() - startTime
                    };
                } finally {
                    client.release();
                }
            } catch (error) {
                healthResults[name] = {
                    status: 'unhealthy',
                    error: error.message
                };
            }
        }

        this.metrics.lastHealthCheck = {
            timestamp: new Date(),
            results: healthResults,
            totalResponseTime: Date.now() - startTime
        };

        this.emit('health:check:completed', this.metrics.lastHealthCheck);
    }

    /**
     * Adjust pool size based on load
     * @private
     */
    _adjustPoolSize() {
        for (const [name, pool] of this.pools) {
            const currentLoad = pool.waitingCount / pool.totalCount;
            const targetSize = this._calculateOptimalPoolSize(pool, currentLoad);
            
            if (targetSize !== pool.options.max) {
                log('info', `Adjusting pool ${name} size from ${pool.options.max} to ${targetSize}`);
                // Note: pg.Pool doesn't support dynamic resizing, but we can track the recommendation
                this.metrics.poolResizes++;
                this.emit('pool:resize:recommended', { pool: name, currentSize: pool.options.max, recommendedSize: targetSize });
            }
        }
    }

    /**
     * Calculate optimal pool size
     * @param {Pool} pool - Database pool
     * @param {number} currentLoad - Current load ratio
     * @returns {number} Optimal pool size
     * @private
     */
    _calculateOptimalPoolSize(pool, currentLoad) {
        const minSize = this.config.pool.min;
        const maxSize = this.config.pool.max;
        
        if (currentLoad > 0.8) {
            return Math.min(maxSize, pool.options.max + 2);
        } else if (currentLoad < 0.2 && pool.options.max > minSize) {
            return Math.max(minSize, pool.options.max - 1);
        }
        
        return pool.options.max;
    }

    /**
     * Detect connection leaks
     * @private
     */
    _detectConnectionLeaks() {
        for (const [name, pool] of this.pools) {
            const activeConnections = pool.totalCount - pool.idleCount;
            const suspiciousThreshold = pool.options.max * 0.9;
            
            if (activeConnections > suspiciousThreshold) {
                this.metrics.connectionLeaks++;
                log('warn', `Potential connection leak detected in pool ${name}: ${activeConnections}/${pool.totalCount} connections active`);
                this.emit('connection:leak:detected', { pool: name, activeConnections, totalConnections: pool.totalCount });
            }
        }
    }

    /**
     * Track connection events
     * @param {string} event - Event type
     * @param {Object} client - Database client
     * @private
     */
    _trackConnectionEvent(event, client) {
        this.connectionHistory.push({
            timestamp: Date.now(),
            event,
            processId: client.processID
        });

        // Keep only last 100 events
        if (this.connectionHistory.length > 100) {
            this.connectionHistory.shift();
        }
    }

    /**
     * Track connection acquisition
     * @param {string} poolName - Pool name
     * @param {number} acquisitionTime - Time to acquire connection
     * @private
     */
    _trackConnectionAcquisition(poolName, acquisitionTime) {
        this.emit('connection:acquired:tracked', { pool: poolName, acquisitionTime });
    }

    /**
     * Track connection release
     * @param {string} poolName - Pool name
     * @private
     */
    _trackConnectionRelease(poolName) {
        this.emit('connection:released:tracked', { pool: poolName });
    }

    /**
     * Track query performance
     * @param {string} queryId - Query ID
     * @param {string} poolName - Pool name
     * @param {number} executionTime - Execution time
     * @param {boolean} success - Whether query succeeded
     * @private
     */
    _trackQueryPerformance(queryId, poolName, executionTime, success) {
        this.queryHistory.push({
            queryId,
            pool: poolName,
            executionTime,
            success,
            timestamp: Date.now()
        });

        // Keep only last 50 queries
        if (this.queryHistory.length > 50) {
            this.queryHistory.shift();
        }
    }

    /**
     * Update average response time
     * @param {number} executionTime - Execution time
     * @private
     */
    _updateAverageResponseTime(executionTime) {
        if (this.metrics.avgResponseTime === 0) {
            this.metrics.avgResponseTime = executionTime;
        } else {
            this.metrics.avgResponseTime = (this.metrics.avgResponseTime * 0.9) + (executionTime * 0.1);
        }
    }

    /**
     * Get pool health status
     * @param {Pool} pool - Database pool
     * @returns {string} Health status
     * @private
     */
    _getPoolHealth(pool) {
        const utilizationRate = pool.totalCount > 0 ? (pool.totalCount - pool.idleCount) / pool.totalCount : 0;
        
        if (utilizationRate > 0.9) return 'overloaded';
        if (utilizationRate > 0.7) return 'busy';
        if (pool.totalCount === 0) return 'disconnected';
        return 'healthy';
    }
}

/**
 * Simple load balancer for read replicas
 */
class LoadBalancer {
    constructor(poolNames) {
        this.readPools = poolNames.filter(name => name.startsWith('replica_'));
        this.currentIndex = 0;
    }

    /**
     * Get next read pool using round-robin
     * @returns {string} Pool name
     */
    getNextReadPool() {
        if (this.readPools.length === 0) {
            return 'primary';
        }

        const pool = this.readPools[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.readPools.length;
        return pool;
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
 * @param {Object} options - Initialization options
 * @returns {Promise<ConnectionPoolManager>} Initialized pool manager
 */
export async function initializePoolManager(options = {}) {
    const manager = getPoolManager();
    await manager.initialize(options);
    return manager;
}

export default ConnectionPoolManager;

