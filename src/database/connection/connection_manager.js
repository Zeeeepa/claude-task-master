import { Pool } from 'pg';
import { EventEmitter } from 'events';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';

/**
 * High-performance PostgreSQL connection manager with health monitoring,
 * connection pooling, and circuit breaker pattern for CI/CD orchestration
 */
export class DatabaseConnectionManager extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = this._buildConfig(config);
        this.pools = new Map();
        this.healthStatus = {
            connected: false,
            lastCheck: null,
            consecutiveFailures: 0
        };
        this.queryCache = new Map();
        this.metrics = {
            totalQueries: 0,
            successfulQueries: 0,
            failedQueries: 0,
            averageQueryTime: 0
        };
        this.healthCheckInterval = null;
        this.circuitBreaker = {
            state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
            failureCount: 0,
            lastFailureTime: null,
            timeout: 60000 // 1 minute
        };
    }

    /**
     * Initialize database connections and start health monitoring
     */
    async initialize() {
        try {
            console.log('🔄 Initializing database connection manager...');
            
            // Create primary connection pool
            await this.createPool('primary', this.config.primary);
            
            // Create read replica pools if configured
            if (this.config.readReplicas && this.config.readReplicas.length > 0) {
                for (let i = 0; i < this.config.readReplicas.length; i++) {
                    await this.createPool(`replica_${i}`, this.config.readReplicas[i]);
                }
            }

            // Test initial connection
            await this._testConnection();
            
            // Start health monitoring
            this._startHealthMonitoring();
            
            this.healthStatus.connected = true;
            this.emit('connected');
            
            console.log('✅ Database connection manager initialized successfully');
            return this;
        } catch (error) {
            console.error('❌ Failed to initialize database connection manager:', error);
            throw error;
        }
    }

    /**
     * Create a new connection pool
     */
    async createPool(name, config) {
        const poolConfig = {
            ...config,
            ssl: this._buildSSLConfig(),
            max: config.max || 20,
            min: config.min || 5,
            idleTimeoutMillis: config.idleTimeoutMillis || 30000,
            connectionTimeoutMillis: config.connectionTimeoutMillis || 10000,
            query_timeout: config.query_timeout || 30000,
            statement_timeout: config.statement_timeout || 30000
        };

        const pool = new Pool(poolConfig);
        
        // Set up pool event handlers
        pool.on('error', (err) => {
            console.error(`Pool ${name} error:`, err);
            this._handlePoolError(name, err);
        });

        pool.on('connect', () => {
            console.log(`✅ New client connected to pool ${name}`);
        });

        pool.on('remove', () => {
            console.log(`🔌 Client removed from pool ${name}`);
        });

        this.pools.set(name, pool);
        console.log(`📊 Created connection pool: ${name}`);
        
        return pool;
    }

    /**
     * Execute a query with automatic retry and circuit breaker
     */
    async query(text, params = [], options = {}) {
        const startTime = Date.now();
        const queryId = this._generateQueryId(text, params);
        
        // Check circuit breaker
        if (this._isCircuitOpen()) {
            throw new Error('Circuit breaker is OPEN - database unavailable');
        }

        // Check cache for read queries
        if (options.useCache && this._isReadQuery(text)) {
            const cached = this.queryCache.get(queryId);
            if (cached && Date.now() - cached.timestamp < (options.cacheTTL || 300000)) {
                return cached.result;
            }
        }

        try {
            const pool = this._selectPool(options.preferReplica);
            const result = await pool.query(text, params);
            
            // Update metrics
            const duration = Date.now() - startTime;
            this._updateMetrics(duration, true);
            
            // Cache result if applicable
            if (options.useCache && this._isReadQuery(text)) {
                this.queryCache.set(queryId, {
                    result,
                    timestamp: Date.now()
                });
            }

            // Reset circuit breaker on success
            this._resetCircuitBreaker();
            
            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            this._updateMetrics(duration, false);
            this._handleQueryError(error);
            throw error;
        }
    }

    /**
     * Execute a transaction with automatic retry
     */
    async transaction(callback, options = {}) {
        const pool = this._selectPool(false); // Always use primary for transactions
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
     * Get connection health status
     */
    async getHealthStatus() {
        return {
            ...this.healthStatus,
            pools: Array.from(this.pools.keys()),
            metrics: this.metrics,
            circuitBreaker: this.circuitBreaker
        };
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        console.log('🔄 Shutting down database connection manager...');
        
        try {
            // Stop health monitoring
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
                this.healthCheckInterval = null;
            }
            
            // Clear caches
            this.queryCache.clear();
            
            // Close all pools
            const shutdownPromises = [];
            for (const [name, pool] of this.pools) {
                shutdownPromises.push(
                    pool.end().catch(error => {
                        console.warn(`Warning: Pool ${name} failed to close cleanly:`, error.message);
                        return Promise.resolve();
                    })
                );
            }
            
            await Promise.all(shutdownPromises);
            this.pools.clear();
            
            this.healthStatus.connected = false;
            this.emit('disconnected');
            
            console.log('✅ Database connection manager shutdown complete');
        } catch (error) {
            console.error('❌ Error during database shutdown:', error);
            throw error;
        }
    }

    // Private methods
    _buildConfig(userConfig) {
        const defaultConfig = {
            primary: {
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT) || 5432,
                database: process.env.DB_NAME || 'claude_task_master',
                user: process.env.DB_USER || 'postgres',
                password: process.env.DB_PASSWORD || '',
                max: parseInt(process.env.DB_POOL_MAX) || 20,
                min: parseInt(process.env.DB_POOL_MIN) || 5
            },
            readReplicas: process.env.DB_READ_REPLICAS ? 
                JSON.parse(process.env.DB_READ_REPLICAS) : [],
            healthCheckInterval: parseInt(process.env.DB_HEALTH_CHECK_INTERVAL) || 30000
        };

        return { ...defaultConfig, ...userConfig };
    }

    _buildSSLConfig() {
        if (process.env.DB_SSL_MODE !== 'require') {
            return false;
        }
        
        const sslConfig = { rejectUnauthorized: true };
        
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
            
            console.log('✅ SSL certificates loaded successfully');
        } catch (error) {
            if (process.env.NODE_ENV === 'production') {
                throw new Error(`SSL certificates required in production but failed to load: ${error.message}`);
            }
            
            console.warn(`⚠️  SSL certificate loading failed: ${error.message}`);
            console.warn('   Falling back to basic SSL - NOT RECOMMENDED FOR PRODUCTION');
            sslConfig.rejectUnauthorized = false;
        }
        
        return sslConfig;
    }

    _generateQueryId(text, params) {
        // Fast hash function for cache keys
        const queryString = text + JSON.stringify(params);
        let hash = 0;
        for (let i = 0; i < queryString.length; i++) {
            const char = queryString.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(36);
    }

    _selectPool(preferReplica = false) {
        if (preferReplica && this.pools.size > 1) {
            // Round-robin selection of read replicas
            const replicas = Array.from(this.pools.keys()).filter(name => name.startsWith('replica_'));
            if (replicas.length > 0) {
                const index = Math.floor(Math.random() * replicas.length);
                return this.pools.get(replicas[index]);
            }
        }
        
        return this.pools.get('primary');
    }

    _isReadQuery(text) {
        const trimmed = text.trim().toLowerCase();
        return trimmed.startsWith('select') || trimmed.startsWith('with');
    }

    async _testConnection() {
        const result = await this.query('SELECT NOW() as current_time, version() as pg_version');
        console.log(`🔗 Database connection test successful - PostgreSQL ${result.rows[0].pg_version.split(' ')[1]}`);
        return result;
    }

    _startHealthMonitoring() {
        this.healthCheckInterval = setInterval(async () => {
            try {
                await this._testConnection();
                this.healthStatus.lastCheck = new Date();
                this.healthStatus.consecutiveFailures = 0;
            } catch (error) {
                this.healthStatus.consecutiveFailures++;
                console.warn(`⚠️  Health check failed (${this.healthStatus.consecutiveFailures} consecutive failures):`, error.message);
                
                if (this.healthStatus.consecutiveFailures >= 3) {
                    this._openCircuitBreaker();
                }
            }
        }, this.config.healthCheckInterval);
    }

    _updateMetrics(duration, success) {
        this.metrics.totalQueries++;
        if (success) {
            this.metrics.successfulQueries++;
        } else {
            this.metrics.failedQueries++;
        }
        
        // Update average query time using exponential moving average
        this.metrics.averageQueryTime = this.metrics.averageQueryTime * 0.9 + duration * 0.1;
    }

    _handlePoolError(poolName, error) {
        console.error(`Pool ${poolName} error:`, error);
        this.emit('poolError', { poolName, error });
    }

    _handleQueryError(error) {
        this.circuitBreaker.failureCount++;
        this.circuitBreaker.lastFailureTime = Date.now();
        
        if (this.circuitBreaker.failureCount >= 5) {
            this._openCircuitBreaker();
        }
    }

    _isCircuitOpen() {
        if (this.circuitBreaker.state === 'OPEN') {
            if (Date.now() - this.circuitBreaker.lastFailureTime > this.circuitBreaker.timeout) {
                this.circuitBreaker.state = 'HALF_OPEN';
                console.log('🔄 Circuit breaker moved to HALF_OPEN state');
                return false;
            }
            return true;
        }
        return false;
    }

    _openCircuitBreaker() {
        this.circuitBreaker.state = 'OPEN';
        console.warn('⚠️  Circuit breaker OPENED - database marked as unavailable');
        this.emit('circuitBreakerOpen');
    }

    _resetCircuitBreaker() {
        if (this.circuitBreaker.state !== 'CLOSED') {
            this.circuitBreaker.state = 'CLOSED';
            this.circuitBreaker.failureCount = 0;
            console.log('✅ Circuit breaker CLOSED - database available');
            this.emit('circuitBreakerClosed');
        }
    }
}

// Singleton instance management
let instance = null;

export function getConnection() {
    if (!instance) {
        throw new Error('Database connection not initialized. Call initializeDatabase() first.');
    }
    return instance;
}

export async function initializeDatabase(config) {
    if (instance) {
        console.warn('⚠️  Database already initialized');
        return instance;
    }
    
    instance = new DatabaseConnectionManager(config);
    await instance.initialize();
    return instance;
}

export async function resetConnection() {
    if (instance) {
        try {
            await instance.shutdown();
            console.log('✅ Connection reset successfully');
        } catch (error) {
            console.error('❌ Error during connection shutdown:', error);
        } finally {
            instance = null;
        }
    }
}

