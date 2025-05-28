/**
 * @fileoverview Database Pool Manager
 * @description Manages PostgreSQL connection pooling with health monitoring
 */

import { Pool } from 'pg';
import { log } from '../../../scripts/modules/utils.js';

/**
 * Database connection pool manager with health monitoring and retry logic
 */
export class DatabasePoolManager {
    constructor(config) {
        this.config = {
            host: config.host || 'localhost',
            port: config.port || 5432,
            database: config.database || 'codegen_taskmaster',
            user: config.user || 'software_developer',
            password: config.password,
            ssl: config.ssl || false,
            max: config.max_connections || 20,
            min: config.min_connections || 5,
            idleTimeoutMillis: config.idle_timeout || 30000,
            connectionTimeoutMillis: config.connection_timeout || 2000,
            statement_timeout: config.statement_timeout || 60000,
            query_timeout: config.query_timeout || 30000,
            enable_logging: config.enable_logging !== false,
            log_level: config.log_level || 'info',
            ...config
        };
        
        this.pool = null;
        this.isConnected = false;
        this.connectionAttempts = 0;
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 second
        this.healthCheckInterval = null;
        this.metrics = {
            totalQueries: 0,
            successfulQueries: 0,
            failedQueries: 0,
            totalConnections: 0,
            activeConnections: 0,
            lastHealthCheck: null
        };
    }

    /**
     * Initialize the database connection pool
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            this.pool = new Pool(this.config);
            
            // Set up event listeners
            this._setupEventListeners();
            
            // Test the connection
            await this._testConnection();
            
            this.isConnected = true;
            this.connectionAttempts = 0;
            
            // Start health monitoring
            this._startHealthMonitoring();
            
            this._log('info', '✅ Database connection pool established', {
                host: this.config.host,
                port: this.config.port,
                database: this.config.database,
                maxConnections: this.config.max
            });
            
        } catch (error) {
            this.connectionAttempts++;
            this._log('error', '❌ Database connection failed', {
                attempt: this.connectionAttempts,
                error: error.message,
                host: this.config.host,
                port: this.config.port
            });
            
            if (this.connectionAttempts < this.maxRetries) {
                this._log('info', `🔄 Retrying connection in ${this.retryDelay}ms...`);
                await this._delay(this.retryDelay);
                this.retryDelay *= 2; // Exponential backoff
                return this.initialize();
            }
            
            throw new Error(`Failed to connect to database after ${this.maxRetries} attempts: ${error.message}`);
        }
    }

    /**
     * Execute a SQL query with metrics tracking
     * @param {string} text - SQL query text
     * @param {Array} params - Query parameters
     * @returns {Promise<object>} Query result
     */
    async query(text, params = []) {
        if (!this.isConnected) {
            throw new Error('Database not connected. Call initialize() first.');
        }

        const start = Date.now();
        const queryId = `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            this.metrics.totalQueries++;
            
            this._log('debug', '🔍 Executing query', {
                queryId,
                text: this._sanitizeQuery(text),
                paramCount: params.length
            });
            
            const result = await this.pool.query(text, params);
            const duration = Date.now() - start;
            
            this.metrics.successfulQueries++;
            
            this._log('debug', '✅ Query executed successfully', {
                queryId,
                duration,
                rowCount: result.rowCount,
                rows: result.rows?.length || 0
            });
            
            return result;
            
        } catch (error) {
            const duration = Date.now() - start;
            this.metrics.failedQueries++;
            
            this._log('error', '❌ Query execution failed', {
                queryId,
                duration,
                error: error.message,
                text: this._sanitizeQuery(text),
                paramCount: params.length
            });
            
            throw error;
        }
    }

    /**
     * Get a client from the pool for transactions
     * @returns {Promise<object>} Database client
     */
    async getClient() {
        if (!this.isConnected) {
            throw new Error('Database not connected. Call initialize() first.');
        }

        try {
            const client = await this.pool.connect();
            this.metrics.totalConnections++;
            this.metrics.activeConnections++;
            
            // Wrap the release method to update metrics
            const originalRelease = client.release.bind(client);
            client.release = (err) => {
                this.metrics.activeConnections--;
                return originalRelease(err);
            };
            
            this._log('debug', '🔗 Client acquired from pool', {
                activeConnections: this.metrics.activeConnections,
                totalConnections: this.metrics.totalConnections
            });
            
            return client;
            
        } catch (error) {
            this._log('error', '❌ Failed to acquire client from pool', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Execute a transaction
     * @param {Function} callback - Transaction callback function
     * @returns {Promise<any>} Transaction result
     */
    async transaction(callback) {
        const client = await this.getClient();
        
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
     * Get connection pool health status
     * @returns {Promise<object>} Health status
     */
    async getHealth() {
        if (!this.isConnected) {
            return {
                status: 'disconnected',
                isHealthy: false,
                metrics: this.metrics
            };
        }

        try {
            const start = Date.now();
            await this.query('SELECT NOW() as current_time, version() as pg_version');
            const responseTime = Date.now() - start;
            
            this.metrics.lastHealthCheck = new Date();
            
            const poolInfo = {
                totalCount: this.pool.totalCount,
                idleCount: this.pool.idleCount,
                waitingCount: this.pool.waitingCount
            };
            
            const isHealthy = responseTime < 1000 && this.pool.totalCount > 0;
            
            return {
                status: isHealthy ? 'healthy' : 'degraded',
                isHealthy,
                responseTime,
                pool: poolInfo,
                metrics: this.metrics,
                lastCheck: this.metrics.lastHealthCheck
            };
            
        } catch (error) {
            this._log('error', '❌ Health check failed', { error: error.message });
            
            return {
                status: 'unhealthy',
                isHealthy: false,
                error: error.message,
                metrics: this.metrics
            };
        }
    }

    /**
     * Close the connection pool
     * @returns {Promise<void>}
     */
    async close() {
        this._log('info', '🔄 Shutting down database connection pool...');
        
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
        }
        
        this.isConnected = false;
        
        this._log('info', '✅ Database connection pool closed');
    }

    /**
     * Get current metrics
     * @returns {object} Current metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            pool: this.pool ? {
                totalCount: this.pool.totalCount,
                idleCount: this.pool.idleCount,
                waitingCount: this.pool.waitingCount
            } : null
        };
    }

    // Private methods

    /**
     * Test database connection
     * @private
     */
    async _testConnection() {
        const client = await this.pool.connect();
        try {
            await client.query('SELECT NOW()');
        } finally {
            client.release();
        }
    }

    /**
     * Set up pool event listeners
     * @private
     */
    _setupEventListeners() {
        this.pool.on('connect', (client) => {
            this._log('debug', '🔗 New client connected to database');
        });

        this.pool.on('acquire', (client) => {
            this._log('debug', '📥 Client acquired from pool');
        });

        this.pool.on('remove', (client) => {
            this._log('debug', '📤 Client removed from pool');
        });

        this.pool.on('error', (err, client) => {
            this._log('error', '❌ Pool error occurred', {
                error: err.message,
                client: client ? 'with client' : 'without client'
            });
        });
    }

    /**
     * Start health monitoring
     * @private
     */
    _startHealthMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        
        // Health check every 30 seconds
        this.healthCheckInterval = setInterval(async () => {
            try {
                const health = await this.getHealth();
                if (!health.isHealthy) {
                    this._log('warn', '⚠️ Database health check failed', health);
                }
            } catch (error) {
                this._log('error', '❌ Health check error', { error: error.message });
            }
        }, 30000);
    }

    /**
     * Sanitize query for logging (remove sensitive data)
     * @private
     */
    _sanitizeQuery(text) {
        if (!this.config.enable_logging) {
            return '[QUERY HIDDEN]';
        }
        
        // Remove potential passwords or sensitive data
        return text.replace(/password\s*=\s*'[^']*'/gi, "password='***'")
                  .replace(/token\s*=\s*'[^']*'/gi, "token='***'");
    }

    /**
     * Log with level checking
     * @private
     */
    _log(level, message, data = {}) {
        if (!this.config.enable_logging) {
            return;
        }
        
        const levels = { debug: 0, info: 1, warn: 2, error: 3 };
        const currentLevel = levels[this.config.log_level] || 1;
        const messageLevel = levels[level] || 1;
        
        if (messageLevel >= currentLevel) {
            log(level, `[DatabasePool] ${message}`, data);
        }
    }

    /**
     * Delay utility for retries
     * @private
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default DatabasePoolManager;

