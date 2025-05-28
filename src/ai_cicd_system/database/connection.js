/**
 * @fileoverview Database Connection Manager
 * @description Production-ready PostgreSQL connection management with pooling, health checks, and retry logic
 */

import pg from 'pg';
import { dbConfig, validateConfig, getConnectionString } from '../config/database_config.js';
import { log } from '../../../scripts/modules/utils.js';

const { Pool } = pg;

/**
 * Database Connection Manager
 * Handles connection pooling, health monitoring, and graceful shutdown
 */
export class DatabaseConnection {
    constructor(config = dbConfig) {
        this.config = config;
        this.pool = null;
        this.isConnected = false;
        this.healthCheckInterval = null;
        this.connectionAttempts = 0;
        this.lastHealthCheck = null;
        this.queryStats = {
            total: 0,
            successful: 0,
            failed: 0,
            slowQueries: 0,
            totalExecutionTime: 0
        };
    }

    /**
     * Initialize database connection with retry logic
     * @returns {Promise<void>}
     */
    async initialize() {
        // Validate configuration
        const validation = validateConfig();
        if (!validation.valid) {
            throw new Error(`Database configuration invalid: ${validation.errors.join(', ')}`);
        }

        if (validation.warnings.length > 0) {
            log('warn', `Database configuration warnings: ${validation.warnings.join(', ')}`);
        }

        log('info', `Initializing database connection to ${getConnectionString()}`);

        // Create connection pool with retry logic
        await this._createPoolWithRetry();

        // Start health monitoring if enabled
        if (this.config.health_check.enabled) {
            this._startHealthMonitoring();
        }

        log('info', 'Database connection initialized successfully');
    }

    /**
     * Create connection pool with retry logic
     * @private
     */
    async _createPoolWithRetry() {
        const maxAttempts = this.config.retry.max_attempts;
        let lastError;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                this.connectionAttempts = attempt;
                await this._createPool();
                await this._testConnection();
                this.isConnected = true;
                return;
            } catch (error) {
                lastError = error;
                log('warn', `Database connection attempt ${attempt}/${maxAttempts} failed: ${error.message}`);

                if (attempt < maxAttempts) {
                    const delay = this.config.retry.delay_ms * Math.pow(this.config.retry.backoff_factor, attempt - 1);
                    log('info', `Retrying in ${delay}ms...`);
                    await this._sleep(delay);
                }
            }
        }

        throw new Error(`Failed to connect to database after ${maxAttempts} attempts. Last error: ${lastError.message}`);
    }

    /**
     * Create the connection pool
     * @private
     */
    async _createPool() {
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
        };

        this.pool = new Pool(poolConfig);

        // Set up pool event handlers
        this.pool.on('connect', (client) => {
            log('debug', 'New database client connected');
        });

        this.pool.on('acquire', (client) => {
            log('debug', 'Database client acquired from pool');
        });

        this.pool.on('remove', (client) => {
            log('debug', 'Database client removed from pool');
        });

        this.pool.on('error', (err, client) => {
            log('error', `Database pool error: ${err.message}`);
            this.isConnected = false;
        });
    }

    /**
     * Test database connection
     * @private
     */
    async _testConnection() {
        const client = await this.pool.connect();
        try {
            const result = await client.query('SELECT NOW() as current_time, version() as version');
            log('debug', `Database connection test successful. Server time: ${result.rows[0].current_time}`);
        } finally {
            client.release();
        }
    }

    /**
     * Execute a query with monitoring and error handling
     * @param {string} text - SQL query text
     * @param {Array} params - Query parameters
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Query result
     */
    async query(text, params = [], options = {}) {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }

        const startTime = Date.now();
        const queryId = `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        try {
            if (this.config.monitoring.log_queries) {
                log('debug', `Executing query ${queryId}: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
            }

            // Set query timeout
            const client = await this.pool.connect();
            try {
                if (options.timeout || this.config.query_timeout) {
                    client.query('SET statement_timeout = $1', [options.timeout || this.config.query_timeout]);
                }

                const result = await client.query(text, params);
                const executionTime = Date.now() - startTime;

                // Update statistics
                this.queryStats.total++;
                this.queryStats.successful++;
                this.queryStats.totalExecutionTime += executionTime;

                // Log slow queries
                if (executionTime > this.config.monitoring.slow_query_threshold_ms) {
                    this.queryStats.slowQueries++;
                    if (this.config.monitoring.log_slow_queries) {
                        log('warn', `Slow query detected (${executionTime}ms): ${text.substring(0, 200)}${text.length > 200 ? '...' : ''}`);
                    }
                }

                log('debug', `Query ${queryId} completed in ${executionTime}ms`);
                return result;

            } finally {
                client.release();
            }

        } catch (error) {
            const executionTime = Date.now() - startTime;
            this.queryStats.total++;
            this.queryStats.failed++;

            log('error', `Query ${queryId} failed after ${executionTime}ms: ${error.message}`);
            throw error;
        }
    }

    /**
     * Execute a transaction
     * @param {Function} callback - Transaction callback function
     * @returns {Promise<any>} Transaction result
     */
    async transaction(callback) {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }

        const client = await this.pool.connect();
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
     * Start health monitoring
     * @private
     */
    _startHealthMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        this.healthCheckInterval = setInterval(async () => {
            try {
                await this._performHealthCheck();
            } catch (error) {
                log('error', `Health check failed: ${error.message}`);
                this.isConnected = false;
            }
        }, this.config.health_check.interval_ms);

        log('debug', `Health monitoring started (interval: ${this.config.health_check.interval_ms}ms)`);
    }

    /**
     * Perform health check
     * @private
     */
    async _performHealthCheck() {
        const startTime = Date.now();
        
        try {
            const result = await this.query('SELECT 1 as health_check', [], { 
                timeout: this.config.health_check.timeout_ms 
            });
            
            const responseTime = Date.now() - startTime;
            this.lastHealthCheck = {
                timestamp: new Date(),
                status: 'healthy',
                responseTime,
                poolStats: this._getPoolStats()
            };

            if (responseTime > this.config.health_check.timeout_ms / 2) {
                log('warn', `Health check slow response: ${responseTime}ms`);
            }

        } catch (error) {
            this.lastHealthCheck = {
                timestamp: new Date(),
                status: 'unhealthy',
                error: error.message,
                poolStats: this._getPoolStats()
            };
            throw error;
        }
    }

    /**
     * Get connection pool statistics
     * @private
     */
    _getPoolStats() {
        if (!this.pool) return null;

        return {
            totalCount: this.pool.totalCount,
            idleCount: this.pool.idleCount,
            waitingCount: this.pool.waitingCount
        };
    }

    /**
     * Get database health status
     * @returns {Object} Health status
     */
    getHealth() {
        return {
            connected: this.isConnected,
            connectionAttempts: this.connectionAttempts,
            lastHealthCheck: this.lastHealthCheck,
            poolStats: this._getPoolStats(),
            queryStats: { ...this.queryStats },
            config: {
                host: this.config.host,
                port: this.config.port,
                database: this.config.database,
                poolSize: `${this.config.pool.min}-${this.config.pool.max}`,
                healthCheckEnabled: this.config.health_check.enabled
            }
        };
    }

    /**
     * Get query performance metrics
     * @returns {Object} Performance metrics
     */
    getMetrics() {
        const avgExecutionTime = this.queryStats.total > 0 
            ? this.queryStats.totalExecutionTime / this.queryStats.total 
            : 0;

        return {
            ...this.queryStats,
            avgExecutionTime,
            successRate: this.queryStats.total > 0 
                ? (this.queryStats.successful / this.queryStats.total) * 100 
                : 0,
            slowQueryRate: this.queryStats.total > 0 
                ? (this.queryStats.slowQueries / this.queryStats.total) * 100 
                : 0
        };
    }

    /**
     * Gracefully shutdown the database connection
     * @returns {Promise<void>}
     */
    async shutdown() {
        log('info', 'Shutting down database connection...');

        // Stop health monitoring
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

        // Close connection pool
        if (this.pool) {
            try {
                await this.pool.end();
                log('info', 'Database connection pool closed');
            } catch (error) {
                log('error', `Error closing database pool: ${error.message}`);
            }
        }

        this.isConnected = false;
        this.pool = null;
    }

    /**
     * Sleep utility function
     * @param {number} ms - Milliseconds to sleep
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Singleton instance
let dbConnection = null;

/**
 * Get database connection instance (singleton)
 * @returns {DatabaseConnection} Database connection instance
 */
export function getConnection() {
    if (!dbConnection) {
        dbConnection = new DatabaseConnection();
    }
    return dbConnection;
}

/**
 * Initialize database connection
 * @param {Object} config - Optional configuration override
 * @returns {Promise<DatabaseConnection>} Initialized connection
 */
export async function initializeDatabase(config = null) {
    const connection = getConnection();
    if (config) {
        connection.config = { ...connection.config, ...config };
    }
    await connection.initialize();
    return connection;
}

export default DatabaseConnection;

