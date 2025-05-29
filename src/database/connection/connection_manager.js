/**
 * @fileoverview Consolidated Database Connection Manager
 * @description Robust PostgreSQL connection pooling and management with error handling integration
 * Consolidates connection management patterns from PRs #41,42,53,59,62,64,65,69,70,74,79,81
 * @version 2.0.0
 */

import pg from 'pg';
import { EventEmitter } from 'events';
import { createConnectionConfig, validateDatabaseConfig } from '../config/database_config.js';

const { Pool } = pg;

/**
 * Consolidated Database Connection Manager
 * Provides robust connection pooling with integrated error handling and monitoring
 */
export class DatabaseConnectionManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    // Merge provided config with defaults
    this.config = createConnectionConfig(config.environment || process.env.NODE_ENV);
    Object.assign(this.config, config);
    
    // Validate configuration
    const validation = validateDatabaseConfig(this.config);
    if (!validation.valid) {
      throw new Error(`Database configuration invalid: ${validation.errors.join(', ')}`);
    }
    
    // Connection pools for different operation types
    this.pools = new Map();
    this.isInitialized = false;
    this.healthCheckInterval = null;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 5;
    
    // Connection and query statistics
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      slowQueries: 0,
      totalExecutionTime: 0,
      lastHealthCheck: null,
      connectionErrors: 0,
      poolStats: new Map()
    };
    
    // Circuit breaker state
    this.circuitBreaker = {
      state: 'closed', // closed, open, half-open
      failures: 0,
      threshold: this.config.circuitBreakerThreshold || 5,
      timeout: this.config.circuitBreakerTimeout || 60000,
      lastFailureTime: null
    };
    
    // Query cache for performance optimization
    this.queryCache = this.config.performance?.enableQueryCache ? new Map() : null;
    this.preparedStatements = this.config.performance?.enablePreparedStatements ? new Map() : null;
  }

  /**
   * Initialize the database connection pools
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      this.log('info', 'Initializing database connection pools', {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        maxConnections: this.config.max
      });

      // Create multiple pools for different operation types
      await this._createPools();
      
      // Test connections
      await this._testConnections();
      
      this.isInitialized = true;
      this.connectionAttempts = 0;
      
      // Start health check monitoring
      this._startHealthCheck();
      
      // Start metrics collection
      this._startMetricsCollection();
      
      this.log('info', 'Database connection pools initialized successfully', {
        pools: Array.from(this.pools.keys()),
        totalMaxConnections: this._getTotalMaxConnections()
      });
      
      this.emit('initialized');
      
    } catch (error) {
      this.connectionAttempts++;
      this.stats.connectionErrors++;
      
      this.log('error', 'Failed to initialize database connection pools', {
        error: error.message,
        attempt: this.connectionAttempts,
        maxAttempts: this.maxConnectionAttempts
      });
      
      if (this.connectionAttempts < this.maxConnectionAttempts) {
        const delay = Math.min(1000 * Math.pow(2, this.connectionAttempts), 30000);
        this.log('info', `Retrying database connection in ${delay}ms`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.initialize();
      }
      
      throw new Error(`Failed to initialize database after ${this.maxConnectionAttempts} attempts: ${error.message}`);
    }
  }

  /**
   * Create connection pools for different operation types
   * @private
   */
  async _createPools() {
    const poolTypes = ['primary', 'readonly', 'background', 'priority'];
    
    for (const poolType of poolTypes) {
      const poolConfig = this._getPoolConfig(poolType);
      const pool = new Pool(poolConfig);
      
      // Set up pool event handlers
      this._setupPoolEventHandlers(pool, poolType);
      
      this.pools.set(poolType, pool);
      this.stats.poolStats.set(poolType, {
        totalConnections: 0,
        activeConnections: 0,
        idleConnections: 0,
        waitingClients: 0,
        totalQueries: 0,
        successfulQueries: 0,
        failedQueries: 0,
        avgExecutionTime: 0
      });
    }
  }

  /**
   * Get pool-specific configuration
   * @param {string} poolType - Type of pool (primary, readonly, background, priority)
   * @returns {Object} Pool configuration
   * @private
   */
  _getPoolConfig(poolType) {
    const baseConfig = {
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl,
      idleTimeoutMillis: this.config.idleTimeoutMillis,
      connectionTimeoutMillis: this.config.connectionTimeoutMillis,
      acquireTimeoutMillis: this.config.acquireTimeoutMillis,
      createTimeoutMillis: this.config.createTimeoutMillis,
      destroyTimeoutMillis: this.config.destroyTimeoutMillis,
      reapIntervalMillis: this.config.reapIntervalMillis,
      createRetryIntervalMillis: this.config.createRetryIntervalMillis
    };

    const poolConfigs = {
      primary: {
        ...baseConfig,
        max: this.config.max,
        min: this.config.min
      },
      readonly: {
        ...baseConfig,
        max: Math.ceil(this.config.max * 0.3), // 30% of primary pool
        min: Math.max(1, Math.ceil(this.config.min * 0.5)),
        // Use read replica if available
        host: process.env.DB_READ_HOST || this.config.host,
        port: process.env.DB_READ_PORT || this.config.port
      },
      background: {
        ...baseConfig,
        max: Math.ceil(this.config.max * 0.2), // 20% of primary pool
        min: 1
      },
      priority: {
        ...baseConfig,
        max: Math.ceil(this.config.max * 0.1), // 10% of primary pool
        min: 1,
        acquireTimeoutMillis: this.config.acquireTimeoutMillis * 0.5 // Faster timeout
      }
    };

    return poolConfigs[poolType] || poolConfigs.primary;
  }

  /**
   * Set up pool event handlers
   * @param {Pool} pool - Database pool
   * @param {string} poolType - Type of pool
   * @private
   */
  _setupPoolEventHandlers(pool, poolType) {
    pool.on('connect', (client) => {
      this.stats.totalConnections++;
      this.stats.poolStats.get(poolType).totalConnections++;
      this.log('debug', `New client connected to ${poolType} pool`, {
        poolType,
        totalConnections: pool.totalCount,
        idleConnections: pool.idleCount,
        waitingClients: pool.waitingCount
      });
    });

    pool.on('acquire', (client) => {
      this.stats.activeConnections++;
      this.stats.poolStats.get(poolType).activeConnections++;
    });

    pool.on('release', (client) => {
      this.stats.activeConnections--;
      this.stats.poolStats.get(poolType).activeConnections--;
    });

    pool.on('remove', (client) => {
      this.stats.totalConnections--;
      this.stats.poolStats.get(poolType).totalConnections--;
      this.log('debug', `Client removed from ${poolType} pool`);
    });

    pool.on('error', (error, client) => {
      this.stats.connectionErrors++;
      this.log('error', `Database pool error in ${poolType} pool`, {
        error: error.message,
        poolType
      });
      this.emit('poolError', { poolType, error });
    });
  }

  /**
   * Test all pool connections
   * @private
   */
  async _testConnections() {
    for (const [poolType, pool] of this.pools) {
      try {
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        this.log('debug', `${poolType} pool connection test successful`);
      } catch (error) {
        throw new Error(`${poolType} pool connection test failed: ${error.message}`);
      }
    }
  }

  /**
   * Execute a database query with error handling and monitoring
   * @param {string} query - SQL query string
   * @param {Array} params - Query parameters
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Query result
   */
  async executeQuery(query, params = [], options = {}) {
    const startTime = Date.now();
    const queryId = `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const poolType = options.poolType || 'primary';
    
    // Check circuit breaker
    if (this._isCircuitBreakerOpen()) {
      throw new Error('Circuit breaker is open - database operations temporarily disabled');
    }

    try {
      if (!this.isInitialized) {
        throw new Error('Database connection not initialized');
      }

      const pool = this.pools.get(poolType);
      if (!pool) {
        throw new Error(`Pool type '${poolType}' not found`);
      }

      this.stats.totalQueries++;
      this.stats.poolStats.get(poolType).totalQueries++;
      
      // Check query cache
      const cacheKey = this._getCacheKey(query, params);
      if (this.queryCache && options.useCache && this.queryCache.has(cacheKey)) {
        const cachedResult = this.queryCache.get(cacheKey);
        if (Date.now() - cachedResult.timestamp < this.config.performance.queryCacheTTL) {
          this.log('debug', 'Query result served from cache', { queryId, cacheKey });
          return cachedResult.result;
        } else {
          this.queryCache.delete(cacheKey);
        }
      }
      
      this.log('debug', 'Executing database query', {
        queryId,
        poolType,
        query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
        paramCount: params.length
      });

      const client = await pool.connect();
      
      try {
        // Set query timeout
        if (this.config.query.timeout) {
          await client.query(`SET statement_timeout = ${this.config.query.timeout}`);
        }

        const result = await client.query(query, params);
        const executionTime = Date.now() - startTime;
        
        this.stats.successfulQueries++;
        this.stats.poolStats.get(poolType).successfulQueries++;
        this.stats.totalExecutionTime += executionTime;
        
        // Update average execution time
        const poolStats = this.stats.poolStats.get(poolType);
        poolStats.avgExecutionTime = poolStats.totalQueries > 0 
          ? this.stats.totalExecutionTime / poolStats.totalQueries 
          : 0;
        
        // Track slow queries
        if (executionTime > this.config.query.slowQueryThreshold) {
          this.stats.slowQueries++;
          this.log('warn', 'Slow query detected', {
            queryId,
            executionTime,
            threshold: this.config.query.slowQueryThreshold,
            query: query.substring(0, 200)
          });
          this.emit('slowQuery', { queryId, query, executionTime, params });
        }
        
        // Cache result if enabled
        if (this.queryCache && options.useCache && this._isCacheable(query)) {
          this.queryCache.set(cacheKey, {
            result: result,
            timestamp: Date.now()
          });
          
          // Limit cache size
          if (this.queryCache.size > this.config.performance.queryCacheSize) {
            const firstKey = this.queryCache.keys().next().value;
            this.queryCache.delete(firstKey);
          }
        }
        
        this.log('debug', 'Query executed successfully', {
          queryId,
          executionTime,
          rowCount: result.rowCount,
          poolType
        });
        
        // Reset circuit breaker on success
        this._resetCircuitBreaker();
        
        return result;
        
      } finally {
        client.release();
      }
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      this.stats.failedQueries++;
      this.stats.poolStats.get(poolType).failedQueries++;
      
      this.log('error', 'Query execution failed', {
        queryId,
        error: error.message,
        executionTime,
        poolType,
        query: query.substring(0, 200)
      });
      
      // Update circuit breaker
      this._recordFailure();
      
      this.emit('queryError', { queryId, query, params, error, poolType });
      
      throw error;
    }
  }

  /**
   * Execute a transaction with automatic rollback on error
   * @param {Function} callback - Transaction callback function
   * @param {Object} options - Transaction options
   * @returns {Promise<any>} Transaction result
   */
  async executeTransaction(callback, options = {}) {
    const poolType = options.poolType || 'primary';
    const pool = this.pools.get(poolType);
    
    if (!pool) {
      throw new Error(`Pool type '${poolType}' not found`);
    }

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Set transaction isolation level if specified
      if (options.isolationLevel) {
        await client.query(`SET TRANSACTION ISOLATION LEVEL ${options.isolationLevel}`);
      }
      
      const result = await callback(client);
      
      await client.query('COMMIT');
      
      this.log('debug', 'Transaction completed successfully', { poolType });
      
      return result;
      
    } catch (error) {
      await client.query('ROLLBACK');
      
      this.log('error', 'Transaction rolled back due to error', {
        error: error.message,
        poolType
      });
      
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get database health status
   * @returns {Promise<Object>} Health status
   */
  async getHealth() {
    try {
      const startTime = Date.now();
      
      // Test primary pool connection
      await this.executeQuery('SELECT 1', [], { poolType: 'primary' });
      
      const responseTime = Date.now() - startTime;
      this.stats.lastHealthCheck = new Date().toISOString();
      
      const poolStats = {};
      for (const [poolType, pool] of this.pools) {
        poolStats[poolType] = {
          totalCount: pool.totalCount,
          idleCount: pool.idleCount,
          waitingCount: pool.waitingCount
        };
      }
      
      return {
        healthy: true,
        responseTime,
        timestamp: this.stats.lastHealthCheck,
        stats: {
          ...this.stats,
          pools: poolStats,
          circuitBreaker: this.circuitBreaker
        }
      };
    } catch (error) {
      this.log('error', 'Health check failed', { error: error.message });
      
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString(),
        stats: this.stats
      };
    }
  }

  /**
   * Get connection statistics
   * @returns {Object} Connection statistics
   */
  getStatistics() {
    const poolStats = {};
    for (const [poolType, stats] of this.stats.poolStats) {
      const pool = this.pools.get(poolType);
      poolStats[poolType] = {
        ...stats,
        pool: pool ? {
          totalCount: pool.totalCount,
          idleCount: pool.idleCount,
          waitingCount: pool.waitingCount
        } : null
      };
    }

    return {
      ...this.stats,
      pools: poolStats,
      successRate: this.stats.totalQueries > 0 
        ? (this.stats.successfulQueries / this.stats.totalQueries) * 100 
        : 0,
      avgExecutionTime: this.stats.totalQueries > 0 
        ? this.stats.totalExecutionTime / this.stats.totalQueries 
        : 0,
      circuitBreaker: this.circuitBreaker,
      cacheStats: this.queryCache ? {
        size: this.queryCache.size,
        maxSize: this.config.performance.queryCacheSize
      } : null
    };
  }

  /**
   * Close all database connections
   * @returns {Promise<void>}
   */
  async close() {
    try {
      this.log('info', 'Closing database connections');
      
      // Stop health check
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }
      
      // Close all pools
      const closePromises = Array.from(this.pools.values()).map(pool => pool.end());
      await Promise.all(closePromises);
      
      this.pools.clear();
      this.isInitialized = false;
      
      // Clear caches
      if (this.queryCache) {
        this.queryCache.clear();
      }
      if (this.preparedStatements) {
        this.preparedStatements.clear();
      }
      
      this.log('info', 'Database connections closed successfully');
      this.emit('closed');
      
    } catch (error) {
      this.log('error', 'Error closing database connections', { error: error.message });
      throw error;
    }
  }

  /**
   * Start health check monitoring
   * @private
   */
  _startHealthCheck() {
    if (!this.config.healthCheck.enabled) {
      return;
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.getHealth();
      } catch (error) {
        this.log('error', 'Health check failed', { error: error.message });
        this.emit('healthCheckFailed', error);
      }
    }, this.config.healthCheck.interval);
  }

  /**
   * Start metrics collection
   * @private
   */
  _startMetricsCollection() {
    if (!this.config.monitoring.enabled) {
      return;
    }

    setInterval(() => {
      const stats = this.getStatistics();
      this.emit('metricsCollected', stats);
      
      // Check alert thresholds
      this._checkAlertThresholds(stats);
    }, this.config.monitoring.metricsInterval);
  }

  /**
   * Check alert thresholds
   * @param {Object} stats - Current statistics
   * @private
   */
  _checkAlertThresholds(stats) {
    const thresholds = this.config.monitoring.alertThresholds;
    
    // Check connection usage
    for (const [poolType, poolStats] of Object.entries(stats.pools)) {
      if (poolStats.pool) {
        const usage = (poolStats.pool.totalCount / this._getPoolConfig(poolType).max) * 100;
        if (usage > thresholds.connectionUsage) {
          this.emit('alert', {
            type: 'high_connection_usage',
            poolType,
            usage,
            threshold: thresholds.connectionUsage
          });
        }
      }
    }
    
    // Check error rate
    if (stats.successRate < (100 - thresholds.errorRate)) {
      this.emit('alert', {
        type: 'high_error_rate',
        errorRate: 100 - stats.successRate,
        threshold: thresholds.errorRate
      });
    }
    
    // Check average query time
    if (stats.avgExecutionTime > thresholds.queryTime) {
      this.emit('alert', {
        type: 'slow_queries',
        avgTime: stats.avgExecutionTime,
        threshold: thresholds.queryTime
      });
    }
  }

  /**
   * Circuit breaker methods
   */
  _isCircuitBreakerOpen() {
    if (this.circuitBreaker.state === 'open') {
      if (Date.now() - this.circuitBreaker.lastFailureTime > this.circuitBreaker.timeout) {
        this.circuitBreaker.state = 'half-open';
        this.log('info', 'Circuit breaker moved to half-open state');
      } else {
        return true;
      }
    }
    return false;
  }

  _recordFailure() {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailureTime = Date.now();
    
    if (this.circuitBreaker.failures >= this.circuitBreaker.threshold) {
      this.circuitBreaker.state = 'open';
      this.log('warn', 'Circuit breaker opened due to failures', {
        failures: this.circuitBreaker.failures,
        threshold: this.circuitBreaker.threshold
      });
      this.emit('circuitBreakerOpened');
    }
  }

  _resetCircuitBreaker() {
    if (this.circuitBreaker.state === 'half-open') {
      this.circuitBreaker.state = 'closed';
      this.circuitBreaker.failures = 0;
      this.log('info', 'Circuit breaker closed - system recovered');
      this.emit('circuitBreakerClosed');
    }
  }

  /**
   * Utility methods
   */
  _getTotalMaxConnections() {
    return Array.from(this.pools.values()).reduce((total, pool) => total + pool.options.max, 0);
  }

  _getCacheKey(query, params) {
    return `${query}:${JSON.stringify(params)}`;
  }

  _isCacheable(query) {
    const lowerQuery = query.toLowerCase().trim();
    return lowerQuery.startsWith('select') && 
           !lowerQuery.includes('now()') && 
           !lowerQuery.includes('current_timestamp') &&
           !lowerQuery.includes('random()');
  }

  /**
   * Logging method
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   * @private
   */
  log(level, message, meta = {}) {
    if (!this.config.logging.enabled) {
      return;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      component: 'DatabaseConnectionManager',
      message,
      ...meta
    };

    // Use console for now, can be replaced with proper logger
    console[level === 'error' ? 'error' : 'log'](JSON.stringify(logEntry));
  }
}

export default DatabaseConnectionManager;

