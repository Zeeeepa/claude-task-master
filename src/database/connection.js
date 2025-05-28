/**
 * @fileoverview Database Connection Manager for AI-Powered CI/CD System
 * @description Production-ready PostgreSQL connection management with pooling, 
 * health checks, retry logic, and Cloudflare integration support
 */

import pg from 'pg';
import crypto from 'crypto';
import { EventEmitter } from 'events';

const { Pool } = pg;

/**
 * Database Connection Configuration
 */
export const defaultConfig = {
    // Connection settings
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'codegen-taskmaster-db',
    user: process.env.DB_USER || 'software_developer',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL_MODE === 'require' ? { rejectUnauthorized: false } : false,
    
    // Connection pool configuration
    pool: {
        min: parseInt(process.env.DB_POOL_MIN) || 2,
        max: parseInt(process.env.DB_POOL_MAX) || 10,
        idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 10000,
        acquireTimeoutMillis: parseInt(process.env.DB_POOL_ACQUIRE_TIMEOUT) || 30000,
        createTimeoutMillis: parseInt(process.env.DB_POOL_CREATE_TIMEOUT) || 30000,
        destroyTimeoutMillis: parseInt(process.env.DB_POOL_DESTROY_TIMEOUT) || 5000,
        reapIntervalMillis: parseInt(process.env.DB_POOL_REAP_INTERVAL) || 1000,
        createRetryIntervalMillis: parseInt(process.env.DB_POOL_CREATE_RETRY_INTERVAL) || 200,
    },
    
    // Query timeout
    query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT) || 60000,
    
    // Connection retry configuration
    retry: {
        max_attempts: parseInt(process.env.DB_RETRY_MAX_ATTEMPTS) || 3,
        delay_ms: parseInt(process.env.DB_RETRY_DELAY_MS) || 1000,
        backoff_factor: parseFloat(process.env.DB_RETRY_BACKOFF_FACTOR) || 2,
    },
    
    // Health check configuration
    health_check: {
        enabled: process.env.DB_HEALTH_CHECK_ENABLED !== 'false',
        interval_ms: parseInt(process.env.DB_HEALTH_CHECK_INTERVAL) || 30000,
        timeout_ms: parseInt(process.env.DB_HEALTH_CHECK_TIMEOUT) || 5000,
    },
    
    // Performance monitoring
    monitoring: {
        slow_query_threshold_ms: parseInt(process.env.DB_SLOW_QUERY_THRESHOLD) || 1000,
        log_queries: process.env.DB_LOG_QUERIES === 'true',
        log_slow_queries: process.env.DB_LOG_SLOW_QUERIES !== 'false',
        enable_metrics: process.env.DB_ENABLE_METRICS !== 'false',
    },
    
    // Cloudflare integration
    cloudflare: {
        enabled: process.env.CLOUDFLARE_ENABLED === 'true',
        worker_url: process.env.CLOUDFLARE_WORKER_URL || '',
        api_token: process.env.CLOUDFLARE_API_TOKEN || '',
        zone_id: process.env.CLOUDFLARE_ZONE_ID || '',
        rate_limit: {
            requests_per_minute: parseInt(process.env.CLOUDFLARE_RATE_LIMIT_RPM) || 1000,
            burst_limit: parseInt(process.env.CLOUDFLARE_BURST_LIMIT) || 100,
        }
    }
};

/**
 * Enhanced Database Connection Manager
 * Handles connection pooling, health monitoring, graceful shutdown, and Cloudflare integration
 */
export class DatabaseConnection extends EventEmitter {
    constructor(config = defaultConfig) {
        super();
        this.config = { ...defaultConfig, ...config };
        this.pool = null;
        this.isConnected = false;
        this.healthCheckInterval = null;
        this.connectionAttempts = 0;
        this.lastHealthCheck = null;
        this.startTime = Date.now();
        
        // Enhanced query statistics
        this.queryStats = {
            total: 0,
            successful: 0,
            failed: 0,
            slowQueries: 0,
            totalExecutionTime: 0,
            averageExecutionTime: 0,
            queriesPerSecond: 0,
            lastQueryTime: null,
            queryTypes: new Map(), // Track different query types
        };
        
        // Connection pool statistics
        this.poolStats = {
            connectionsCreated: 0,
            connectionsDestroyed: 0,
            connectionsAcquired: 0,
            connectionsReleased: 0,
            errors: 0,
        };
        
        // Rate limiting for Cloudflare
        this.rateLimiter = {
            requests: [],
            lastReset: Date.now(),
        };
    }

    /**
     * Initialize database connection with comprehensive error handling
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            this.log('info', 'Initializing database connection...');
            
            // Validate configuration
            this._validateConfig();
            
            // Create connection pool with retry logic
            await this._createPoolWithRetry();
            
            // Run initial health check
            await this._performHealthCheck();
            
            // Start health monitoring if enabled
            if (this.config.health_check.enabled) {
                this._startHealthMonitoring();
            }
            
            // Initialize Cloudflare integration if enabled
            if (this.config.cloudflare.enabled) {
                await this._initializeCloudflareIntegration();
            }
            
            this.isConnected = true;
            this.emit('connected');
            this.log('info', 'Database connection initialized successfully');
            
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to initialize database connection: ${error.message}`);
        }
    }

    /**
     * Validate database configuration
     * @private
     */
    _validateConfig() {
        const errors = [];
        const warnings = [];
        
        // Required fields
        if (!this.config.host) errors.push('DB_HOST is required');
        if (!this.config.database) errors.push('DB_NAME is required');
        if (!this.config.user) errors.push('DB_USER is required');
        if (!this.config.password) warnings.push('DB_PASSWORD is not set');
        
        // Pool configuration validation
        if (this.config.pool.min < 0) errors.push('DB_POOL_MIN must be >= 0');
        if (this.config.pool.max < this.config.pool.min) errors.push('DB_POOL_MAX must be >= DB_POOL_MIN');
        if (this.config.pool.max > 100) warnings.push('DB_POOL_MAX is very high (>100)');
        
        // Cloudflare validation
        if (this.config.cloudflare.enabled) {
            if (!this.config.cloudflare.worker_url) errors.push('CLOUDFLARE_WORKER_URL is required when Cloudflare is enabled');
            if (!this.config.cloudflare.api_token) warnings.push('CLOUDFLARE_API_TOKEN is not set');
        }
        
        if (errors.length > 0) {
            throw new Error(`Configuration errors: ${errors.join(', ')}`);
        }
        
        if (warnings.length > 0) {
            this.log('warn', `Configuration warnings: ${warnings.join(', ')}`);
        }
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
                return;
            } catch (error) {
                lastError = error;
                this.log('warn', `Connection attempt ${attempt}/${maxAttempts} failed: ${error.message}`);

                if (attempt < maxAttempts) {
                    const delay = this.config.retry.delay_ms * Math.pow(this.config.retry.backoff_factor, attempt - 1);
                    this.log('info', `Retrying in ${delay}ms...`);
                    await this._sleep(delay);
                }
            }
        }

        throw new Error(`Failed to connect after ${maxAttempts} attempts. Last error: ${lastError.message}`);
    }

    /**
     * Create the connection pool with enhanced monitoring
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

        // Enhanced pool event handlers
        this.pool.on('connect', (client) => {
            this.poolStats.connectionsCreated++;
            this.log('debug', 'New database client connected');
            this.emit('client_connected', client);
        });

        this.pool.on('acquire', (client) => {
            this.poolStats.connectionsAcquired++;
            this.log('debug', 'Database client acquired from pool');
        });

        this.pool.on('release', (client) => {
            this.poolStats.connectionsReleased++;
            this.log('debug', 'Database client released to pool');
        });

        this.pool.on('remove', (client) => {
            this.poolStats.connectionsDestroyed++;
            this.log('debug', 'Database client removed from pool');
        });

        this.pool.on('error', (err, client) => {
            this.poolStats.errors++;
            this.log('error', `Database pool error: ${err.message}`);
            this.emit('pool_error', err, client);
            this.isConnected = false;
        });
    }

    /**
     * Test database connection with comprehensive checks
     * @private
     */
    async _testConnection() {
        const client = await this.pool.connect();
        try {
            // Basic connectivity test
            const result = await client.query('SELECT NOW() as current_time, version() as version');
            this.log('debug', `Database connection test successful. Server time: ${result.rows[0].current_time}`);
            
            // Test schema existence
            const schemaCheck = await client.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('tasks', 'workflows', 'integrations', 'logs', 'templates', 'deployments')
            `);
            
            this.log('debug', `Found ${schemaCheck.rows.length} core tables in database`);
            
        } finally {
            client.release();
        }
    }

    /**
     * Execute a query with comprehensive monitoring and error handling
     * @param {string} text - SQL query text
     * @param {Array} params - Query parameters
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Query result
     */
    async query(text, params = [], options = {}) {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }

        // Rate limiting for Cloudflare
        if (this.config.cloudflare.enabled) {
            await this._checkRateLimit();
        }

        const startTime = Date.now();
        const queryId = this._generateQueryId();
        const queryType = this._extractQueryType(text);

        try {
            if (this.config.monitoring.log_queries) {
                this.log('debug', `Executing query ${queryId}: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
            }

            const client = await this.pool.connect();
            try {
                // Set query timeout
                if (options.timeout || this.config.query_timeout) {
                    await client.query('SET statement_timeout = $1', [options.timeout || this.config.query_timeout]);
                }

                // Set session variables for audit logging
                if (options.userId) {
                    await client.query('SET app.current_user_id = $1', [options.userId]);
                }
                if (options.sessionId) {
                    await client.query('SET app.current_session_id = $1', [options.sessionId]);
                }
                if (options.ipAddress) {
                    await client.query('SET app.current_ip_address = $1', [options.ipAddress]);
                }

                const result = await client.query(text, params);
                const executionTime = Date.now() - startTime;

                // Update statistics
                this._updateQueryStats(queryType, executionTime, true);

                // Log slow queries
                if (executionTime > this.config.monitoring.slow_query_threshold_ms) {
                    this.queryStats.slowQueries++;
                    if (this.config.monitoring.log_slow_queries) {
                        this.log('warn', `Slow query detected (${executionTime}ms): ${text.substring(0, 200)}${text.length > 200 ? '...' : ''}`);
                    }
                    this.emit('slow_query', { queryId, text, executionTime, params });
                }

                this.log('debug', `Query ${queryId} completed in ${executionTime}ms`);
                this.emit('query_completed', { queryId, executionTime, rowCount: result.rowCount });
                
                return result;

            } finally {
                client.release();
            }

        } catch (error) {
            const executionTime = Date.now() - startTime;
            this._updateQueryStats(queryType, executionTime, false);

            this.log('error', `Query ${queryId} failed after ${executionTime}ms: ${error.message}`);
            this.emit('query_failed', { queryId, error, executionTime, text: text.substring(0, 200) });
            
            throw error;
        }
    }

    /**
     * Execute a transaction with enhanced error handling
     * @param {Function} callback - Transaction callback function
     * @param {Object} options - Transaction options
     * @returns {Promise<any>} Transaction result
     */
    async transaction(callback, options = {}) {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }

        const transactionId = this._generateQueryId();
        const startTime = Date.now();

        const client = await this.pool.connect();
        try {
            this.log('debug', `Starting transaction ${transactionId}`);
            
            // Set isolation level if specified
            if (options.isolationLevel) {
                await client.query(`SET TRANSACTION ISOLATION LEVEL ${options.isolationLevel}`);
            }
            
            await client.query('BEGIN');
            
            const result = await callback(client);
            
            await client.query('COMMIT');
            
            const executionTime = Date.now() - startTime;
            this.log('debug', `Transaction ${transactionId} committed in ${executionTime}ms`);
            this.emit('transaction_committed', { transactionId, executionTime });
            
            return result;
            
        } catch (error) {
            await client.query('ROLLBACK');
            
            const executionTime = Date.now() - startTime;
            this.log('error', `Transaction ${transactionId} rolled back after ${executionTime}ms: ${error.message}`);
            this.emit('transaction_rolled_back', { transactionId, error, executionTime });
            
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Initialize Cloudflare integration
     * @private
     */
    async _initializeCloudflareIntegration() {
        try {
            this.log('info', 'Initializing Cloudflare integration...');
            
            // Test Cloudflare Worker connectivity
            if (this.config.cloudflare.worker_url) {
                const response = await fetch(`${this.config.cloudflare.worker_url}/health`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${this.config.cloudflare.api_token}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 5000,
                });
                
                if (response.ok) {
                    this.log('info', 'Cloudflare Worker connectivity verified');
                } else {
                    this.log('warn', `Cloudflare Worker health check failed: ${response.status}`);
                }
            }
            
        } catch (error) {
            this.log('warn', `Cloudflare integration initialization failed: ${error.message}`);
        }
    }

    /**
     * Check rate limiting for Cloudflare
     * @private
     */
    async _checkRateLimit() {
        const now = Date.now();
        const windowMs = 60000; // 1 minute window
        
        // Clean old requests
        this.rateLimiter.requests = this.rateLimiter.requests.filter(
            timestamp => now - timestamp < windowMs
        );
        
        // Check if we're within limits
        if (this.rateLimiter.requests.length >= this.config.cloudflare.rate_limit.requests_per_minute) {
            const oldestRequest = Math.min(...this.rateLimiter.requests);
            const waitTime = windowMs - (now - oldestRequest);
            
            this.log('warn', `Rate limit exceeded, waiting ${waitTime}ms`);
            await this._sleep(waitTime);
        }
        
        // Add current request
        this.rateLimiter.requests.push(now);
    }

    /**
     * Start health monitoring with enhanced checks
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
                this.log('error', `Health check failed: ${error.message}`);
                this.isConnected = false;
                this.emit('health_check_failed', error);
            }
        }, this.config.health_check.interval_ms);

        this.log('debug', `Health monitoring started (interval: ${this.config.health_check.interval_ms}ms)`);
    }

    /**
     * Perform comprehensive health check
     * @private
     */
    async _performHealthCheck() {
        const startTime = Date.now();
        
        try {
            // Basic connectivity check
            const result = await this.query('SELECT 1 as health_check', [], { 
                timeout: this.config.health_check.timeout_ms 
            });
            
            // Check pool statistics
            const poolStats = this._getPoolStats();
            
            // Check for connection leaks
            if (poolStats.totalCount > this.config.pool.max * 0.9) {
                this.log('warn', 'Connection pool near capacity');
            }
            
            const responseTime = Date.now() - startTime;
            this.lastHealthCheck = {
                timestamp: new Date(),
                status: 'healthy',
                responseTime,
                poolStats,
                queryStats: this._getQueryMetrics(),
            };

            if (responseTime > this.config.health_check.timeout_ms / 2) {
                this.log('warn', `Health check slow response: ${responseTime}ms`);
            }

            this.emit('health_check_passed', this.lastHealthCheck);

        } catch (error) {
            this.lastHealthCheck = {
                timestamp: new Date(),
                status: 'unhealthy',
                error: error.message,
                poolStats: this._getPoolStats(),
            };
            
            this.emit('health_check_failed', this.lastHealthCheck);
            throw error;
        }
    }

    /**
     * Update query statistics
     * @private
     */
    _updateQueryStats(queryType, executionTime, success) {
        this.queryStats.total++;
        this.queryStats.totalExecutionTime += executionTime;
        this.queryStats.averageExecutionTime = this.queryStats.totalExecutionTime / this.queryStats.total;
        this.queryStats.lastQueryTime = Date.now();
        
        // Calculate queries per second
        const uptimeSeconds = (Date.now() - this.startTime) / 1000;
        this.queryStats.queriesPerSecond = this.queryStats.total / uptimeSeconds;
        
        if (success) {
            this.queryStats.successful++;
        } else {
            this.queryStats.failed++;
        }
        
        // Track query types
        if (!this.queryStats.queryTypes.has(queryType)) {
            this.queryStats.queryTypes.set(queryType, { count: 0, totalTime: 0 });
        }
        const typeStats = this.queryStats.queryTypes.get(queryType);
        typeStats.count++;
        typeStats.totalTime += executionTime;
    }

    /**
     * Extract query type from SQL text
     * @private
     */
    _extractQueryType(text) {
        const trimmed = text.trim().toUpperCase();
        if (trimmed.startsWith('SELECT')) return 'SELECT';
        if (trimmed.startsWith('INSERT')) return 'INSERT';
        if (trimmed.startsWith('UPDATE')) return 'UPDATE';
        if (trimmed.startsWith('DELETE')) return 'DELETE';
        if (trimmed.startsWith('CREATE')) return 'CREATE';
        if (trimmed.startsWith('ALTER')) return 'ALTER';
        if (trimmed.startsWith('DROP')) return 'DROP';
        return 'OTHER';
    }

    /**
     * Generate unique query ID
     * @private
     */
    _generateQueryId() {
        return `query_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
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
            waitingCount: this.pool.waitingCount,
            ...this.poolStats,
        };
    }

    /**
     * Get comprehensive query performance metrics
     * @returns {Object} Performance metrics
     */
    _getQueryMetrics() {
        const queryTypeMetrics = {};
        for (const [type, stats] of this.queryStats.queryTypes) {
            queryTypeMetrics[type] = {
                count: stats.count,
                averageTime: stats.count > 0 ? stats.totalTime / stats.count : 0,
            };
        }

        return {
            ...this.queryStats,
            queryTypes: queryTypeMetrics,
            successRate: this.queryStats.total > 0 
                ? (this.queryStats.successful / this.queryStats.total) * 100 
                : 0,
            slowQueryRate: this.queryStats.total > 0 
                ? (this.queryStats.slowQueries / this.queryStats.total) * 100 
                : 0,
        };
    }

    /**
     * Get comprehensive database health status
     * @returns {Object} Health status
     */
    getHealth() {
        return {
            connected: this.isConnected,
            connectionAttempts: this.connectionAttempts,
            uptime: Date.now() - this.startTime,
            lastHealthCheck: this.lastHealthCheck,
            poolStats: this._getPoolStats(),
            queryStats: this._getQueryMetrics(),
            config: {
                host: this.config.host,
                port: this.config.port,
                database: this.config.database,
                poolSize: `${this.config.pool.min}-${this.config.pool.max}`,
                healthCheckEnabled: this.config.health_check.enabled,
                cloudflareEnabled: this.config.cloudflare.enabled,
            }
        };
    }

    /**
     * Gracefully shutdown the database connection
     * @returns {Promise<void>}
     */
    async shutdown() {
        this.log('info', 'Shutting down database connection...');

        // Stop health monitoring
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

        // Close connection pool
        if (this.pool) {
            try {
                await this.pool.end();
                this.log('info', 'Database connection pool closed');
            } catch (error) {
                this.log('error', `Error closing database pool: ${error.message}`);
            }
        }

        this.isConnected = false;
        this.pool = null;
        this.emit('disconnected');
    }

    /**
     * Logging utility
     * @private
     */
    log(level, message) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [DB] [${level.toUpperCase()}] ${message}`);
    }

    /**
     * Sleep utility function
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

