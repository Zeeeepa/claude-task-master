/**
 * @fileoverview Enhanced Database Connection Pool
 * @description Advanced connection pooling with health monitoring, load balancing, and failover
 * @version 2.0.0
 * @created 2025-05-28
 */

import pg from 'pg';
import { EventEmitter } from 'events';
import { dbConfig } from '../config/database_config.js';

const { Pool } = pg;

/**
 * Enhanced Database Connection Pool Manager
 * Provides advanced connection pooling with monitoring, load balancing, and automatic failover
 */
export class EnhancedConnectionPool extends EventEmitter {
    constructor(config = dbConfig) {
        super();
        
        this.config = {
            ...config,
            // Enhanced pool settings
            pool: {
                ...config.pool,
                // Connection lifecycle
                acquireTimeoutMillis: config.pool?.acquireTimeoutMillis || 30000,
                createTimeoutMillis: config.pool?.createTimeoutMillis || 30000,
                destroyTimeoutMillis: config.pool?.destroyTimeoutMillis || 5000,
                reapIntervalMillis: config.pool?.reapIntervalMillis || 1000,
                createRetryIntervalMillis: config.pool?.createRetryIntervalMillis || 200,
                
                // Enhanced settings
                maxUses: config.pool?.maxUses || 7500, // Max uses per connection
                maxLifetimeSeconds: config.pool?.maxLifetimeSeconds || 3600, // 1 hour
                testOnBorrow: config.pool?.testOnBorrow !== false,
                testOnReturn: config.pool?.testOnReturn !== false,
                testWhileIdle: config.pool?.testWhileIdle !== false,
                
                // Load balancing
                loadBalancingMode: config.pool?.loadBalancingMode || 'round_robin', // round_robin, least_connections, random
                
                // Failover settings
                enableFailover: config.pool?.enableFailover !== false,
                failoverTimeout: config.pool?.failoverTimeout || 5000,
                maxFailoverAttempts: config.pool?.maxFailoverAttempts || 3
            }
        };
        
        this.pools = new Map(); // Multiple pools for load balancing
        this.primaryPool = null;
        this.readOnlyPools = [];
        this.currentPoolIndex = 0;
        
        this.isInitialized = false;
        this.isHealthy = true;
        this.lastHealthCheck = null;
        
        // Metrics and monitoring
        this.metrics = {
            totalConnections: 0,
            activeConnections: 0,
            idleConnections: 0,
            waitingClients: 0,
            totalQueries: 0,
            successfulQueries: 0,
            failedQueries: 0,
            slowQueries: 0,
            averageQueryTime: 0,
            totalQueryTime: 0,
            connectionErrors: 0,
            poolErrors: 0,
            lastError: null,
            uptime: 0,
            startTime: null
        };
        
        // Connection tracking
        this.connectionTracker = new Map();
        this.queryTracker = new Map();
        
        // Health monitoring
        this.healthCheckInterval = null;
        this.metricsInterval = null;
        
        // Load balancing
        this.loadBalancer = new ConnectionLoadBalancer(this.config.pool.loadBalancingMode);
    }

    /**
     * Initialize the connection pool
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            console.log('⚠️ Connection pool already initialized');
            return;
        }

        try {
            console.log('🔄 Initializing enhanced database connection pool...');
            
            this.metrics.startTime = Date.now();
            
            // Create primary pool
            await this._createPrimaryPool();
            
            // Create read-only pools if configured
            await this._createReadOnlyPools();
            
            // Start health monitoring
            this._startHealthMonitoring();
            
            // Start metrics collection
            this._startMetricsCollection();
            
            // Setup event handlers
            this._setupEventHandlers();
            
            this.isInitialized = true;
            this.isHealthy = true;
            
            console.log('✅ Enhanced connection pool initialized successfully');
            this.emit('pool:initialized', this.getStatus());
            
        } catch (error) {
            console.error('❌ Failed to initialize connection pool:', error.message);
            this.emit('pool:error', error);
            throw error;
        }
    }

    /**
     * Get a connection from the pool
     * @param {Object} options - Connection options
     * @returns {Promise<Object>} Database connection
     */
    async getConnection(options = {}) {
        if (!this.isInitialized) {
            throw new Error('Connection pool not initialized');
        }

        const startTime = Date.now();
        const connectionId = this._generateConnectionId();
        
        try {
            // Select appropriate pool
            const pool = this._selectPool(options);
            
            // Get connection from pool
            const client = await pool.connect();
            
            // Track connection
            this._trackConnection(connectionId, client, startTime);
            
            // Wrap client with enhanced functionality
            const enhancedClient = this._enhanceClient(client, connectionId);
            
            this.metrics.activeConnections++;
            this.emit('connection:acquired', { connectionId, pool: pool.poolName });
            
            return enhancedClient;
            
        } catch (error) {
            this.metrics.connectionErrors++;
            this.metrics.lastError = error.message;
            
            console.error(`❌ Failed to get connection ${connectionId}:`, error.message);
            this.emit('connection:error', { connectionId, error: error.message });
            
            // Try failover if enabled
            if (this.config.pool.enableFailover && options.allowFailover !== false) {
                return await this._attemptFailover(options, connectionId);
            }
            
            throw error;
        }
    }

    /**
     * Execute a query with automatic connection management
     * @param {string} text - SQL query
     * @param {Array} params - Query parameters
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Query result
     */
    async query(text, params = [], options = {}) {
        const queryId = this._generateQueryId();
        const startTime = Date.now();
        
        let client = null;
        
        try {
            // Get connection
            client = await this.getConnection(options);
            
            // Execute query
            const result = await client.query(text, params);
            
            // Track query metrics
            this._trackQuery(queryId, text, startTime, true);
            
            return result;
            
        } catch (error) {
            this._trackQuery(queryId, text, startTime, false, error.message);
            throw error;
            
        } finally {
            // Release connection
            if (client) {
                client.release();
            }
        }
    }

    /**
     * Execute a transaction
     * @param {Function} callback - Transaction callback
     * @param {Object} options - Transaction options
     * @returns {Promise<any>} Transaction result
     */
    async transaction(callback, options = {}) {
        const transactionId = this._generateTransactionId();
        let client = null;
        
        try {
            console.log(`🔄 Starting transaction ${transactionId}`);
            
            // Get connection
            client = await this.getConnection(options);
            
            // Begin transaction
            await client.query('BEGIN');
            
            // Execute transaction callback
            const result = await callback(client);
            
            // Commit transaction
            await client.query('COMMIT');
            
            console.log(`✅ Transaction ${transactionId} committed successfully`);
            this.emit('transaction:committed', { transactionId });
            
            return result;
            
        } catch (error) {
            // Rollback transaction
            if (client) {
                try {
                    await client.query('ROLLBACK');
                    console.log(`🔄 Transaction ${transactionId} rolled back`);
                    this.emit('transaction:rolledback', { transactionId, error: error.message });
                } catch (rollbackError) {
                    console.error(`❌ Failed to rollback transaction ${transactionId}:`, rollbackError.message);
                    this.emit('transaction:rollback_failed', { transactionId, error: rollbackError.message });
                }
            }
            
            console.error(`❌ Transaction ${transactionId} failed:`, error.message);
            this.emit('transaction:failed', { transactionId, error: error.message });
            
            throw error;
            
        } finally {
            // Release connection
            if (client) {
                client.release();
            }
        }
    }

    /**
     * Get pool status and metrics
     * @returns {Object} Pool status
     */
    getStatus() {
        const primaryPoolStats = this.primaryPool ? {
            totalCount: this.primaryPool.totalCount,
            idleCount: this.primaryPool.idleCount,
            waitingCount: this.primaryPool.waitingCount
        } : null;
        
        const readOnlyPoolsStats = this.readOnlyPools.map(pool => ({
            name: pool.poolName,
            totalCount: pool.totalCount,
            idleCount: pool.idleCount,
            waitingCount: pool.waitingCount
        }));
        
        return {
            initialized: this.isInitialized,
            healthy: this.isHealthy,
            uptime: this.metrics.startTime ? Date.now() - this.metrics.startTime : 0,
            lastHealthCheck: this.lastHealthCheck,
            
            pools: {
                primary: primaryPoolStats,
                readOnly: readOnlyPoolsStats,
                total: this.pools.size
            },
            
            metrics: {
                ...this.metrics,
                averageQueryTime: this.metrics.totalQueries > 0 
                    ? this.metrics.totalQueryTime / this.metrics.totalQueries 
                    : 0,
                successRate: this.metrics.totalQueries > 0 
                    ? (this.metrics.successfulQueries / this.metrics.totalQueries) * 100 
                    : 0,
                errorRate: this.metrics.totalQueries > 0 
                    ? (this.metrics.failedQueries / this.metrics.totalQueries) * 100 
                    : 0
            },
            
            configuration: {
                maxConnections: this.config.pool.max,
                minConnections: this.config.pool.min,
                acquireTimeout: this.config.pool.acquireTimeoutMillis,
                idleTimeout: this.config.pool.idleTimeoutMillis,
                loadBalancingMode: this.config.pool.loadBalancingMode,
                failoverEnabled: this.config.pool.enableFailover
            }
        };
    }

    /**
     * Shutdown the connection pool
     * @returns {Promise<void>}
     */
    async shutdown() {
        console.log('🛑 Shutting down connection pool...');
        
        try {
            // Stop monitoring
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
                this.healthCheckInterval = null;
            }
            
            if (this.metricsInterval) {
                clearInterval(this.metricsInterval);
                this.metricsInterval = null;
            }
            
            // Close all pools
            const shutdownPromises = [];
            
            if (this.primaryPool) {
                shutdownPromises.push(this.primaryPool.end());
            }
            
            for (const pool of this.readOnlyPools) {
                shutdownPromises.push(pool.end());
            }
            
            await Promise.all(shutdownPromises);
            
            // Clear tracking
            this.connectionTracker.clear();
            this.queryTracker.clear();
            this.pools.clear();
            
            this.isInitialized = false;
            this.isHealthy = false;
            
            console.log('✅ Connection pool shutdown completed');
            this.emit('pool:shutdown');
            
        } catch (error) {
            console.error('❌ Error during pool shutdown:', error.message);
            this.emit('pool:shutdown_error', error);
            throw error;
        }
    }

    /**
     * Create primary pool
     * @private
     */
    async _createPrimaryPool() {
        const poolConfig = {
            ...this.config,
            max: this.config.pool.max,
            min: this.config.pool.min,
            idleTimeoutMillis: this.config.pool.idleTimeoutMillis,
            acquireTimeoutMillis: this.config.pool.acquireTimeoutMillis,
            createTimeoutMillis: this.config.pool.createTimeoutMillis,
            destroyTimeoutMillis: this.config.pool.destroyTimeoutMillis,
            reapIntervalMillis: this.config.pool.reapIntervalMillis,
            createRetryIntervalMillis: this.config.pool.createRetryIntervalMillis
        };
        
        this.primaryPool = new Pool(poolConfig);
        this.primaryPool.poolName = 'primary';
        this.primaryPool.poolType = 'read_write';
        
        this.pools.set('primary', this.primaryPool);
        
        // Test connection
        const client = await this.primaryPool.connect();
        await client.query('SELECT NOW()');
        client.release();
        
        console.log('✅ Primary pool created and tested');
    }

    /**
     * Create read-only pools
     * @private
     */
    async _createReadOnlyPools() {
        const readOnlyHosts = this.config.readOnlyHosts || [];
        
        for (let i = 0; i < readOnlyHosts.length; i++) {
            const host = readOnlyHosts[i];
            const poolName = `readonly_${i}`;
            
            const poolConfig = {
                ...this.config,
                host: host,
                max: Math.floor(this.config.pool.max / 2), // Smaller pools for read-only
                min: Math.floor(this.config.pool.min / 2)
            };
            
            const pool = new Pool(poolConfig);
            pool.poolName = poolName;
            pool.poolType = 'read_only';
            
            try {
                // Test connection
                const client = await pool.connect();
                await client.query('SELECT NOW()');
                client.release();
                
                this.readOnlyPools.push(pool);
                this.pools.set(poolName, pool);
                
                console.log(`✅ Read-only pool ${poolName} created for ${host}`);
                
            } catch (error) {
                console.warn(`⚠️ Failed to create read-only pool for ${host}:`, error.message);
                await pool.end();
            }
        }
    }

    /**
     * Select appropriate pool based on options
     * @private
     */
    _selectPool(options = {}) {
        // Force primary pool for write operations
        if (options.readOnly === false || options.write === true) {
            return this.primaryPool;
        }
        
        // Use read-only pools for read operations if available
        if (options.readOnly === true && this.readOnlyPools.length > 0) {
            return this.loadBalancer.selectPool(this.readOnlyPools);
        }
        
        // Default to primary pool
        return this.primaryPool;
    }

    /**
     * Enhance client with additional functionality
     * @private
     */
    _enhanceClient(client, connectionId) {
        const originalQuery = client.query.bind(client);
        const originalRelease = client.release.bind(client);
        
        // Enhanced query method
        client.query = async (text, params) => {
            const queryStartTime = Date.now();
            const queryId = this._generateQueryId();
            
            try {
                const result = await originalQuery(text, params);
                this._trackQuery(queryId, text, queryStartTime, true);
                return result;
            } catch (error) {
                this._trackQuery(queryId, text, queryStartTime, false, error.message);
                throw error;
            }
        };
        
        // Enhanced release method
        client.release = (error) => {
            this._releaseConnection(connectionId);
            return originalRelease(error);
        };
        
        // Add connection metadata
        client.connectionId = connectionId;
        client.acquiredAt = Date.now();
        
        return client;
    }

    /**
     * Track connection usage
     * @private
     */
    _trackConnection(connectionId, client, startTime) {
        this.connectionTracker.set(connectionId, {
            id: connectionId,
            client: client,
            acquiredAt: startTime,
            queriesExecuted: 0,
            lastQueryAt: null
        });
    }

    /**
     * Release connection tracking
     * @private
     */
    _releaseConnection(connectionId) {
        const connection = this.connectionTracker.get(connectionId);
        if (connection) {
            const duration = Date.now() - connection.acquiredAt;
            this.connectionTracker.delete(connectionId);
            this.metrics.activeConnections--;
            
            this.emit('connection:released', { 
                connectionId, 
                duration, 
                queriesExecuted: connection.queriesExecuted 
            });
        }
    }

    /**
     * Track query execution
     * @private
     */
    _trackQuery(queryId, text, startTime, success, error = null) {
        const duration = Date.now() - startTime;
        
        this.metrics.totalQueries++;
        this.metrics.totalQueryTime += duration;
        
        if (success) {
            this.metrics.successfulQueries++;
        } else {
            this.metrics.failedQueries++;
            this.metrics.lastError = error;
        }
        
        // Track slow queries
        const slowQueryThreshold = this.config.monitoring?.slow_query_threshold_ms || 1000;
        if (duration > slowQueryThreshold) {
            this.metrics.slowQueries++;
            this.emit('query:slow', { queryId, duration, text: text.substring(0, 100) });
        }
        
        this.emit('query:executed', { queryId, duration, success, error });
    }

    /**
     * Start health monitoring
     * @private
     */
    _startHealthMonitoring() {
        const interval = this.config.health_check?.interval_ms || 30000;
        
        this.healthCheckInterval = setInterval(async () => {
            try {
                await this._performHealthCheck();
            } catch (error) {
                console.error('❌ Health check failed:', error.message);
                this.isHealthy = false;
                this.emit('pool:unhealthy', error);
            }
        }, interval);
        
        console.log(`💓 Health monitoring started (interval: ${interval}ms)`);
    }

    /**
     * Perform health check
     * @private
     */
    async _performHealthCheck() {
        const startTime = Date.now();
        
        try {
            // Check primary pool
            const client = await this.primaryPool.connect();
            await client.query('SELECT 1 as health_check');
            client.release();
            
            // Check read-only pools
            for (const pool of this.readOnlyPools) {
                const client = await pool.connect();
                await client.query('SELECT 1 as health_check');
                client.release();
            }
            
            const responseTime = Date.now() - startTime;
            
            this.lastHealthCheck = {
                timestamp: new Date(),
                status: 'healthy',
                responseTime,
                pools_checked: 1 + this.readOnlyPools.length
            };
            
            this.isHealthy = true;
            this.emit('pool:healthy', this.lastHealthCheck);
            
        } catch (error) {
            this.lastHealthCheck = {
                timestamp: new Date(),
                status: 'unhealthy',
                error: error.message
            };
            
            this.isHealthy = false;
            throw error;
        }
    }

    /**
     * Start metrics collection
     * @private
     */
    _startMetricsCollection() {
        this.metricsInterval = setInterval(() => {
            this._collectMetrics();
        }, 10000); // Collect every 10 seconds
        
        console.log('📊 Metrics collection started');
    }

    /**
     * Collect current metrics
     * @private
     */
    _collectMetrics() {
        if (this.primaryPool) {
            this.metrics.totalConnections = this.primaryPool.totalCount;
            this.metrics.idleConnections = this.primaryPool.idleCount;
            this.metrics.waitingClients = this.primaryPool.waitingCount;
        }
        
        this.emit('metrics:collected', this.metrics);
    }

    /**
     * Setup event handlers
     * @private
     */
    _setupEventHandlers() {
        // Primary pool events
        if (this.primaryPool) {
            this.primaryPool.on('connect', () => {
                this.emit('pool:client_connected', { pool: 'primary' });
            });
            
            this.primaryPool.on('error', (error) => {
                this.metrics.poolErrors++;
                this.emit('pool:error', { pool: 'primary', error: error.message });
            });
        }
        
        // Read-only pool events
        this.readOnlyPools.forEach((pool, index) => {
            pool.on('connect', () => {
                this.emit('pool:client_connected', { pool: `readonly_${index}` });
            });
            
            pool.on('error', (error) => {
                this.metrics.poolErrors++;
                this.emit('pool:error', { pool: `readonly_${index}`, error: error.message });
            });
        });
    }

    /**
     * Attempt failover to backup pool
     * @private
     */
    async _attemptFailover(options, connectionId) {
        console.log(`🔄 Attempting failover for connection ${connectionId}`);
        
        const maxAttempts = this.config.pool.maxFailoverAttempts;
        let lastError;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                // Try read-only pools as backup
                if (this.readOnlyPools.length > 0) {
                    const backupPool = this.readOnlyPools[attempt % this.readOnlyPools.length];
                    const client = await backupPool.connect();
                    
                    console.log(`✅ Failover successful on attempt ${attempt}`);
                    this.emit('connection:failover_success', { connectionId, attempt, pool: backupPool.poolName });
                    
                    return this._enhanceClient(client, connectionId);
                }
                
            } catch (error) {
                lastError = error;
                console.warn(`⚠️ Failover attempt ${attempt} failed:`, error.message);
                
                if (attempt < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, this.config.pool.failoverTimeout));
                }
            }
        }
        
        console.error(`❌ All failover attempts failed for connection ${connectionId}`);
        this.emit('connection:failover_failed', { connectionId, attempts: maxAttempts, lastError: lastError.message });
        
        throw lastError;
    }

    /**
     * Generate unique connection ID
     * @private
     */
    _generateConnectionId() {
        return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Generate unique query ID
     * @private
     */
    _generateQueryId() {
        return `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Generate unique transaction ID
     * @private
     */
    _generateTransactionId() {
        return `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

/**
 * Connection Load Balancer
 * Implements different load balancing strategies for connection pools
 */
class ConnectionLoadBalancer {
    constructor(mode = 'round_robin') {
        this.mode = mode;
        this.roundRobinIndex = 0;
    }

    /**
     * Select a pool based on load balancing strategy
     * @param {Array} pools - Available pools
     * @returns {Object} Selected pool
     */
    selectPool(pools) {
        if (pools.length === 0) {
            throw new Error('No pools available');
        }

        if (pools.length === 1) {
            return pools[0];
        }

        switch (this.mode) {
            case 'round_robin':
                return this._roundRobin(pools);
            case 'least_connections':
                return this._leastConnections(pools);
            case 'random':
                return this._random(pools);
            default:
                return this._roundRobin(pools);
        }
    }

    /**
     * Round robin selection
     * @private
     */
    _roundRobin(pools) {
        const pool = pools[this.roundRobinIndex % pools.length];
        this.roundRobinIndex++;
        return pool;
    }

    /**
     * Least connections selection
     * @private
     */
    _leastConnections(pools) {
        return pools.reduce((least, current) => {
            const leastConnections = least.totalCount - least.idleCount;
            const currentConnections = current.totalCount - current.idleCount;
            return currentConnections < leastConnections ? current : least;
        });
    }

    /**
     * Random selection
     * @private
     */
    _random(pools) {
        const randomIndex = Math.floor(Math.random() * pools.length);
        return pools[randomIndex];
    }
}

export default EnhancedConnectionPool;

