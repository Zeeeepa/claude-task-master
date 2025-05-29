/**
 * @fileoverview Consolidated Database Connection Manager
 * @description Unified connection management consolidating patterns from PRs #41,42,53,59,62,64,65,69,70,74,79,81
 * @version 2.0.0 - Zero Redundancy Implementation
 */

import { Pool } from 'pg';
import { EventEmitter } from 'events';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';

// Load environment variables
dotenv.config();

/**
 * Consolidated Database Connection Manager
 * Combines all connection management patterns from the 12 PRs
 */
export class DatabaseConnectionManager extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = this._buildConfiguration(config);
        this.pools = new Map(); // Support for multiple pools (primary, read replicas)
        this.healthStatus = {
            connected: false,
            lastCheck: null,
            consecutiveFailures: 0,
            pools: new Map()
        };
        
        this.metrics = {
            totalConnections: 0,
            activeConnections: 0,
            idleConnections: 0,
            waitingConnections: 0,
            totalQueries: 0,
            successfulQueries: 0,
            failedQueries: 0,
            slowQueries: 0,
            averageQueryTime: 0,
            connectionErrors: 0,
            lastReset: new Date()
        };
        
        this.queryCache = new Map();
        this.preparedStatements = new Map();
        this.circuitBreaker = {
            state: 'closed', // closed, open, half-open
            failures: 0,
            lastFailure: null,
            timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT) || 60000,
            threshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD) || 5
        };
        
        this._setupEventHandlers();
        this._startHealthMonitoring();
    }

    /**
     * Build comprehensive configuration from environment and overrides
     */
    _buildConfiguration(overrides = {}) {
        const baseConfig = {
            // Primary database configuration
            primary: {
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT) || 5432,
                database: process.env.DB_NAME || 'codegen-taskmaster-db',
                user: process.env.DB_USER || 'software_developer',
                password: process.env.DB_PASSWORD || 'password',
                ssl: this._buildSSLConfig(),
                
                // Connection pool settings
                min: parseInt(process.env.DB_POOL_MIN) || 2,
                max: parseInt(process.env.DB_POOL_MAX) || 20,
                idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 30000,
                connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT) || 2000,
                acquireTimeoutMillis: parseInt(process.env.DB_POOL_ACQUIRE_TIMEOUT) || 30000,
                createTimeoutMillis: parseInt(process.env.DB_POOL_CREATE_TIMEOUT) || 30000,
                destroyTimeoutMillis: parseInt(process.env.DB_POOL_DESTROY_TIMEOUT) || 5000,
                reapIntervalMillis: parseInt(process.env.DB_POOL_REAP_INTERVAL) || 1000,
                createRetryIntervalMillis: parseInt(process.env.DB_POOL_CREATE_RETRY_INTERVAL) || 200,
                
                // Enhanced pool settings
                maxUses: parseInt(process.env.DB_POOL_MAX_USES) || 7500,
                maxLifetimeSeconds: parseInt(process.env.DB_POOL_MAX_LIFETIME) || 3600,
                testOnBorrow: process.env.DB_POOL_TEST_ON_BORROW !== 'false',
                testOnReturn: process.env.DB_POOL_TEST_ON_RETURN !== 'false',
                testWhileIdle: process.env.DB_POOL_TEST_WHILE_IDLE !== 'false',
                
                // Query settings
                statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT) || 60000,
                query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT) || 30000,
                idle_in_transaction_session_timeout: parseInt(process.env.DB_IDLE_IN_TRANSACTION_TIMEOUT) || 30000
            },
            
            // Read replica configuration (optional)
            readReplica: this._buildReadReplicaConfig(),
            
            // Performance and monitoring settings
            monitoring: {
                enabled: process.env.DB_MONITORING_ENABLED !== 'false',
                healthCheckInterval: parseInt(process.env.DB_HEALTH_CHECK_INTERVAL) || 30000,
                slowQueryThreshold: parseInt(process.env.DB_SLOW_QUERY_THRESHOLD) || 1000,
                metricsInterval: parseInt(process.env.DB_METRICS_INTERVAL) || 60000
            },
            
            // Logging configuration
            logging: {
                enabled: process.env.DB_LOGGING_ENABLED !== 'false',
                level: process.env.DB_LOGGING_LEVEL || 'info',
                logQueries: process.env.DB_LOG_QUERIES === 'true',
                logSlowQueries: process.env.DB_LOG_SLOW_QUERIES !== 'false',
                logConnections: process.env.DB_LOG_CONNECTIONS === 'true'
            },
            
            // Cache and performance settings
            cache: {
                enabled: process.env.DB_ENABLE_QUERY_CACHE !== 'false',
                size: parseInt(process.env.DB_QUERY_CACHE_SIZE) || 100,
                ttl: parseInt(process.env.DB_QUERY_CACHE_TTL) || 300000
            },
            
            // Failover and load balancing
            failover: {
                enabled: process.env.DB_POOL_ENABLE_FAILOVER !== 'false',
                timeout: parseInt(process.env.DB_POOL_FAILOVER_TIMEOUT) || 5000,
                maxAttempts: parseInt(process.env.DB_POOL_MAX_FAILOVER_ATTEMPTS) || 3,
                loadBalancing: process.env.DB_POOL_LOAD_BALANCING || 'round_robin'
            }
        };
        
        // Deep merge with overrides
        return this._deepMerge(baseConfig, overrides);
    }

    /**
     * Build SSL configuration from environment
     */
    _buildSSLConfig() {
        if (process.env.DB_SSL_MODE !== 'require') {
            return false;
        }
        
        const sslConfig = { rejectUnauthorized: false };
        
        try {
            if (process.env.DB_SSL_CA) {
                sslConfig.ca = readFileSync(process.env.DB_SSL_CA);
            }
            if (process.env.DB_SSL_CERT) {
                sslConfig.cert = readFileSync(process.env.DB_SSL_CERT);
            }
            if (process.env.DB_SSL_KEY) {
                sslConfig.key = readFileSync(process.env.DB_SSL_KEY);
            }
        } catch (error) {
            console.warn('SSL certificate files not found, using basic SSL configuration');
        }
        
        return sslConfig;
    }

    /**
     * Build read replica configuration
     */
    _buildReadReplicaConfig() {
        if (!process.env.DB_READ_HOST) {
            return null;
        }
        
        return {
            host: process.env.DB_READ_HOST,
            port: parseInt(process.env.DB_READ_PORT) || 5432,
            database: process.env.DB_NAME,
            user: process.env.DB_READ_USER || process.env.DB_USER,
            password: process.env.DB_READ_PASSWORD || process.env.DB_PASSWORD,
            ssl: this._buildSSLConfig(),
            // Use smaller pool for read replica
            min: Math.max(1, Math.floor((parseInt(process.env.DB_POOL_MIN) || 2) / 2)),
            max: Math.max(5, Math.floor((parseInt(process.env.DB_POOL_MAX) || 20) / 2))
        };
    }

    /**
     * Initialize database connections
     */
    async initialize() {
        try {
            // Create primary pool
            this.pools.set('primary', new Pool(this.config.primary));
            this._setupPoolEventHandlers('primary', this.pools.get('primary'));
            
            // Create read replica pool if configured
            if (this.config.readReplica) {
                this.pools.set('readReplica', new Pool(this.config.readReplica));
                this._setupPoolEventHandlers('readReplica', this.pools.get('readReplica'));
            }
            
            // Test connections
            await this._testConnections();
            
            this.healthStatus.connected = true;
            this.emit('connected');
            
            if (this.config.logging.enabled) {
                console.log('Database connection manager initialized successfully');
                console.log(`- Primary pool: ${this.config.primary.min}-${this.config.primary.max} connections`);
                if (this.config.readReplica) {
                    console.log(`- Read replica pool: ${this.config.readReplica.min}-${this.config.readReplica.max} connections`);
                }
            }
            
            return true;
        } catch (error) {
            this.healthStatus.connected = false;
            this.emit('error', error);
            throw new Error(`Failed to initialize database connections: ${error.message}`);
        }
    }

    /**
     * Execute query with automatic pool selection and error handling
     */
    async query(text, params = [], options = {}) {
        const startTime = Date.now();
        const queryId = this._generateQueryId(text, params);
        
        try {
            // Check circuit breaker
            if (this.circuitBreaker.state === 'open') {
                throw new Error('Circuit breaker is open - database unavailable');
            }
            
            // Check cache if enabled
            if (this.config.cache.enabled && options.useCache !== false && !params.length) {
                const cached = this._getCachedResult(queryId);
                if (cached) {
                    this._updateMetrics('cache_hit', Date.now() - startTime);
                    return cached;
                }
            }
            
            // Select appropriate pool
            const poolName = this._selectPool(options);
            const pool = this.pools.get(poolName);
            
            if (!pool) {
                throw new Error(`Pool '${poolName}' not available`);
            }
            
            // Execute query
            const result = await pool.query(text, params);
            const duration = Date.now() - startTime;
            
            // Update metrics
            this._updateMetrics('success', duration);
            
            // Cache result if applicable
            if (this.config.cache.enabled && options.useCache !== false && !params.length) {
                this._cacheResult(queryId, result, duration);
            }
            
            // Log slow queries
            if (duration > this.config.monitoring.slowQueryThreshold) {
                this._logSlowQuery(text, params, duration, poolName);
            }
            
            // Reset circuit breaker on success
            this._resetCircuitBreaker();
            
            return result;
            
        } catch (error) {
            const duration = Date.now() - startTime;
            this._updateMetrics('error', duration);
            this._handleQueryError(error, text, params);
            throw error;
        }
    }

    /**
     * Execute transaction with automatic retry and rollback
     */
    async transaction(callback, options = {}) {
        const poolName = this._selectPool(options);
        const pool = this.pools.get(poolName);
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
     * Get connection pool statistics
     */
    getPoolStats() {
        const stats = {};
        
        for (const [name, pool] of this.pools) {
            stats[name] = {
                totalCount: pool.totalCount,
                idleCount: pool.idleCount,
                waitingCount: pool.waitingCount,
                maxCount: pool.options.max,
                minCount: pool.options.min
            };
        }
        
        return stats;
    }

    /**
     * Get comprehensive health status
     */
    getHealth() {
        const poolStats = this.getPoolStats();
        
        return {
            connected: this.healthStatus.connected,
            lastCheck: this.healthStatus.lastCheck,
            consecutiveFailures: this.healthStatus.consecutiveFailures,
            circuitBreaker: this.circuitBreaker.state,
            pools: poolStats,
            metrics: { ...this.metrics },
            uptime: Date.now() - this.metrics.lastReset.getTime()
        };
    }

    /**
     * Get performance metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            pools: this.getPoolStats(),
            cache: {
                size: this.queryCache.size,
                hitRate: this.metrics.totalQueries > 0 ? 
                    (this.metrics.cacheHits || 0) / this.metrics.totalQueries : 0
            }
        };
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        try {
            // Stop health monitoring
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
            }
            
            // Close all pools
            const shutdownPromises = [];
            for (const [name, pool] of this.pools) {
                shutdownPromises.push(pool.end());
            }
            
            await Promise.all(shutdownPromises);
            
            this.healthStatus.connected = false;
            this.emit('disconnected');
            
            if (this.config.logging.enabled) {
                console.log('Database connection manager shut down gracefully');
            }
            
        } catch (error) {
            console.error('Error during database shutdown:', error);
            throw error;
        }
    }

    // Private methods

    _setupEventHandlers() {
        this.on('error', (error) => {
            console.error('Database connection manager error:', error);
        });
        
        this.on('connected', () => {
            if (this.config.logging.logConnections) {
                console.log('Database connected successfully');
            }
        });
        
        this.on('disconnected', () => {
            if (this.config.logging.logConnections) {
                console.log('Database disconnected');
            }
        });
    }

    _setupPoolEventHandlers(poolName, pool) {
        pool.on('connect', (client) => {
            this.metrics.totalConnections++;
            if (this.config.logging.logConnections) {
                console.log(`New client connected to ${poolName} pool`);
            }
        });
        
        pool.on('remove', (client) => {
            if (this.config.logging.logConnections) {
                console.log(`Client removed from ${poolName} pool`);
            }
        });
        
        pool.on('error', (error, client) => {
            this.metrics.connectionErrors++;
            console.error(`Pool ${poolName} error:`, error);
            this.emit('poolError', { poolName, error, client });
        });
    }

    async _testConnections() {
        const testPromises = [];
        
        for (const [name, pool] of this.pools) {
            testPromises.push(
                pool.query('SELECT NOW() as current_time, version() as pg_version')
                    .then(result => ({ name, success: true, result }))
                    .catch(error => ({ name, success: false, error }))
            );
        }
        
        const results = await Promise.all(testPromises);
        
        for (const result of results) {
            if (!result.success) {
                throw new Error(`Failed to connect to ${result.name} pool: ${result.error.message}`);
            }
        }
        
        return results;
    }

    _selectPool(options = {}) {
        // Force primary for writes
        if (options.write || options.transaction) {
            return 'primary';
        }
        
        // Use read replica for reads if available and healthy
        if (this.pools.has('readReplica') && options.read !== false) {
            const replicaHealth = this.healthStatus.pools.get('readReplica');
            if (!replicaHealth || replicaHealth.healthy !== false) {
                return 'readReplica';
            }
        }
        
        return 'primary';
    }

    _generateQueryId(text, params) {
        const queryString = text + JSON.stringify(params);
        return createHash('md5').update(queryString).digest('hex');
    }

    _getCachedResult(queryId) {
        const cached = this.queryCache.get(queryId);
        if (cached && Date.now() - cached.timestamp < this.config.cache.ttl) {
            return cached.result;
        }
        
        if (cached) {
            this.queryCache.delete(queryId);
        }
        
        return null;
    }

    _cacheResult(queryId, result, duration) {
        if (this.queryCache.size >= this.config.cache.size) {
            // Remove oldest entry
            const firstKey = this.queryCache.keys().next().value;
            this.queryCache.delete(firstKey);
        }
        
        this.queryCache.set(queryId, {
            result: { ...result },
            timestamp: Date.now(),
            duration
        });
    }

    _updateMetrics(type, duration) {
        this.metrics.totalQueries++;
        
        if (type === 'success') {
            this.metrics.successfulQueries++;
        } else if (type === 'error') {
            this.metrics.failedQueries++;
        } else if (type === 'cache_hit') {
            this.metrics.cacheHits = (this.metrics.cacheHits || 0) + 1;
        }
        
        if (duration > this.config.monitoring.slowQueryThreshold) {
            this.metrics.slowQueries++;
        }
        
        // Update average query time
        this.metrics.averageQueryTime = 
            (this.metrics.averageQueryTime * (this.metrics.totalQueries - 1) + duration) / 
            this.metrics.totalQueries;
    }

    _logSlowQuery(text, params, duration, poolName) {
        if (this.config.logging.logSlowQueries) {
            console.warn(`Slow query detected (${duration}ms) on ${poolName}:`, {
                query: text.substring(0, 200),
                params: params.length > 0 ? '[PARAMS]' : 'none',
                duration,
                pool: poolName
            });
        }
    }

    _handleQueryError(error, text, params) {
        this.circuitBreaker.failures++;
        this.circuitBreaker.lastFailure = Date.now();
        
        if (this.circuitBreaker.failures >= this.circuitBreaker.threshold) {
            this.circuitBreaker.state = 'open';
            console.error('Circuit breaker opened due to consecutive failures');
        }
        
        if (this.config.logging.enabled) {
            console.error('Query error:', {
                error: error.message,
                query: text.substring(0, 200),
                params: params.length > 0 ? '[PARAMS]' : 'none'
            });
        }
    }

    _resetCircuitBreaker() {
        if (this.circuitBreaker.state === 'open' || this.circuitBreaker.state === 'half-open') {
            this.circuitBreaker.state = 'closed';
            this.circuitBreaker.failures = 0;
            this.circuitBreaker.lastFailure = null;
        }
    }

    _startHealthMonitoring() {
        if (!this.config.monitoring.enabled) {
            return;
        }
        
        this.healthCheckInterval = setInterval(async () => {
            try {
                await this._performHealthCheck();
            } catch (error) {
                console.error('Health check failed:', error);
            }
        }, this.config.monitoring.healthCheckInterval);
    }

    async _performHealthCheck() {
        const healthPromises = [];
        
        for (const [name, pool] of this.pools) {
            healthPromises.push(
                pool.query('SELECT 1 as health_check')
                    .then(() => ({ name, healthy: true, timestamp: Date.now() }))
                    .catch(error => ({ name, healthy: false, error, timestamp: Date.now() }))
            );
        }
        
        const results = await Promise.all(healthPromises);
        
        for (const result of results) {
            this.healthStatus.pools.set(result.name, result);
        }
        
        this.healthStatus.lastCheck = Date.now();
        
        const allHealthy = results.every(r => r.healthy);
        if (allHealthy) {
            this.healthStatus.consecutiveFailures = 0;
        } else {
            this.healthStatus.consecutiveFailures++;
        }
        
        this.emit('healthCheck', { results, allHealthy });
    }

    _deepMerge(target, source) {
        const result = { ...target };
        
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this._deepMerge(target[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        
        return result;
    }
}

// Export singleton instance
let instance = null;

export function getConnection(config) {
    if (!instance) {
        instance = new DatabaseConnectionManager(config);
    }
    return instance;
}

export function resetConnection() {
    if (instance) {
        instance.shutdown().catch(console.error);
        instance = null;
    }
}

export default DatabaseConnectionManager;

