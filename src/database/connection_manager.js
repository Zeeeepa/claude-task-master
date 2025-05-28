/**
 * @fileoverview Database Connection Manager
 * @description Robust PostgreSQL connection pooling and management with error handling integration
 */

import pg from 'pg';
import { CodegenErrorHandler } from '../ai_cicd_system/core/error_handler.js';
import { log } from '../ai_cicd_system/utils/simple_logger.js';

const { Pool } = pg;

/**
 * Database Connection Manager
 * Provides robust connection pooling with integrated error handling and monitoring
 */
export class DatabaseConnectionManager {
  constructor(config = {}) {
    this.config = {
      host: config.host || process.env.DB_HOST || 'localhost',
      port: config.port || process.env.DB_PORT || 5432,
      database: config.database || process.env.DB_NAME || 'ai_cicd_system',
      user: config.username || process.env.DB_USER || 'postgres',
      password: config.password || process.env.DB_PASSWORD || 'password',
      ssl: config.ssl || (process.env.DB_SSL_MODE === 'require' ? { rejectUnauthorized: false } : false),
      max: config.max || 20,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 2000,
      acquireTimeoutMillis: config.acquireTimeoutMillis || 30000,
      createTimeoutMillis: config.createTimeoutMillis || 30000,
      destroyTimeoutMillis: config.destroyTimeoutMillis || 5000,
      reapIntervalMillis: config.reapIntervalMillis || 1000,
      createRetryIntervalMillis: config.createRetryIntervalMillis || 200,
      ...config
    };
    
    this.pool = null;
    this.isConnected = false;
    this.healthCheckInterval = null;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 5;
    
    // Initialize error handler with circuit breaker and retry logic
    this.errorHandler = new CodegenErrorHandler({
      enableRetry: true,
      enableCircuitBreaker: true,
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      circuitBreakerThreshold: 5,
      circuitBreakerTimeout: 60000
    });
    
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
      connectionErrors: 0
    };
  }

  /**
   * Initialize the database connection pool
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      log('info', 'Initializing database connection pool', {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        maxConnections: this.config.max
      });

      this.pool = new Pool(this.config);
      
      // Set up pool event handlers
      this._setupPoolEventHandlers();
      
      // Test the connection
      await this._testConnection();
      
      this.isConnected = true;
      this.connectionAttempts = 0;
      
      // Start health check monitoring
      this._startHealthCheck();
      
      log('info', 'Database connection pool initialized successfully', {
        poolSize: this.config.max,
        idleTimeout: this.config.idleTimeoutMillis
      });
      
    } catch (error) {
      this.connectionAttempts++;
      this.stats.connectionErrors++;
      
      log('error', 'Failed to initialize database connection pool', {
        error: error.message,
        attempt: this.connectionAttempts,
        maxAttempts: this.maxConnectionAttempts
      });
      
      if (this.connectionAttempts < this.maxConnectionAttempts) {
        const delay = Math.min(1000 * Math.pow(2, this.connectionAttempts), 30000);
        log('info', `Retrying database connection in ${delay}ms`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.initialize();
      }
      
      throw new Error(`Failed to initialize database after ${this.maxConnectionAttempts} attempts: ${error.message}`);
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
    
    return this.errorHandler.handleError(
      async () => {
        if (!this.isConnected || !this.pool) {
          throw new Error('Database connection not initialized');
        }

        this.stats.totalQueries++;
        
        log('debug', 'Executing database query', {
          queryId,
          query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
          paramCount: params.length
        });

        const client = await this.pool.connect();
        this.stats.activeConnections++;
        
        try {
          const result = await client.query(query, params);
          const executionTime = Date.now() - startTime;
          
          this.stats.successfulQueries++;
          this.stats.totalExecutionTime += executionTime;
          
          // Track slow queries (> 1000ms)
          if (executionTime > 1000) {
            this.stats.slowQueries++;
            log('warn', 'Slow query detected', {
              queryId,
              executionTime,
              query: query.substring(0, 200)
            });
          }
          
          log('debug', 'Query executed successfully', {
            queryId,
            executionTime,
            rowCount: result.rowCount
          });
          
          return result;
          
        } finally {
          client.release();
          this.stats.activeConnections--;
        }
      },
      { 
        component: 'database', 
        operation: 'query',
        queryId,
        query: query.substring(0, 100)
      }
    ).catch(error => {
      this.stats.failedQueries++;
      
      log('error', 'Database query failed', {
        queryId,
        error: error.message,
        executionTime: Date.now() - startTime
      });
      
      throw error;
    });
  }

  /**
   * Execute a transaction with multiple queries
   * @param {Function} transactionFn - Function containing transaction logic
   * @returns {Promise<any>} Transaction result
   */
  async executeTransaction(transactionFn) {
    return this.errorHandler.handleError(
      async () => {
        if (!this.isConnected || !this.pool) {
          throw new Error('Database connection not initialized');
        }

        const client = await this.pool.connect();
        this.stats.activeConnections++;
        
        try {
          await client.query('BEGIN');
          
          const result = await transactionFn(client);
          
          await client.query('COMMIT');
          
          log('debug', 'Transaction completed successfully');
          
          return result;
          
        } catch (error) {
          await client.query('ROLLBACK');
          
          log('error', 'Transaction rolled back due to error', {
            error: error.message
          });
          
          throw error;
          
        } finally {
          client.release();
          this.stats.activeConnections--;
        }
      },
      { component: 'database', operation: 'transaction' }
    );
  }

  /**
   * Get connection pool statistics
   * @returns {Object} Pool statistics
   */
  getStats() {
    const poolStats = this.pool ? {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount
    } : {};

    return {
      ...this.stats,
      pool: poolStats,
      isConnected: this.isConnected,
      avgExecutionTime: this.stats.totalQueries > 0 
        ? this.stats.totalExecutionTime / this.stats.totalQueries 
        : 0,
      successRate: this.stats.totalQueries > 0 
        ? (this.stats.successfulQueries / this.stats.totalQueries) * 100 
        : 0
    };
  }

  /**
   * Perform health check on the database connection
   * @returns {Promise<Object>} Health check result
   */
  async healthCheck() {
    try {
      const startTime = Date.now();
      const result = await this.executeQuery('SELECT 1 as health_check, NOW() as timestamp');
      const responseTime = Date.now() - startTime;
      
      this.stats.lastHealthCheck = new Date();
      
      return {
        healthy: true,
        responseTime,
        timestamp: result.rows[0].timestamp,
        stats: this.getStats()
      };
      
    } catch (error) {
      log('error', 'Database health check failed', { error: error.message });
      
      return {
        healthy: false,
        error: error.message,
        stats: this.getStats()
      };
    }
  }

  /**
   * Gracefully close the database connection pool
   * @returns {Promise<void>}
   */
  async close() {
    try {
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }
      
      if (this.pool) {
        await this.pool.end();
        this.pool = null;
      }
      
      this.isConnected = false;
      
      log('info', 'Database connection pool closed successfully');
      
    } catch (error) {
      log('error', 'Error closing database connection pool', { error: error.message });
      throw error;
    }
  }

  /**
   * Set up pool event handlers for monitoring
   * @private
   */
  _setupPoolEventHandlers() {
    this.pool.on('connect', (client) => {
      this.stats.totalConnections++;
      log('debug', 'New database client connected', {
        totalConnections: this.stats.totalConnections
      });
    });

    this.pool.on('acquire', (client) => {
      log('debug', 'Database client acquired from pool');
    });

    this.pool.on('remove', (client) => {
      log('debug', 'Database client removed from pool');
    });

    this.pool.on('error', (error, client) => {
      this.stats.connectionErrors++;
      log('error', 'Database pool error', { error: error.message });
    });
  }

  /**
   * Test the database connection
   * @private
   */
  async _testConnection() {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT NOW()');
      log('debug', 'Database connection test successful');
    } finally {
      client.release();
    }
  }

  /**
   * Start periodic health check monitoring
   * @private
   */
  _startHealthCheck() {
    const healthCheckInterval = 30000; // 30 seconds
    
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.healthCheck();
      } catch (error) {
        log('error', 'Health check interval error', { error: error.message });
      }
    }, healthCheckInterval);
    
    log('debug', 'Health check monitoring started', { interval: healthCheckInterval });
  }
}

export default DatabaseConnectionManager;
