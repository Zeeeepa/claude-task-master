/**
 * PostgreSQL Connection Manager for Claude Task Master
 * Provides connection pooling, transaction management, and query execution
 */

import pg from 'pg';
import { config, getEnvironmentConfig, validateConfig } from '../config/database.js';

const { Pool } = pg;

/**
 * Database Connection Manager Class
 */
class DatabaseConnection {
  constructor() {
    this.pool = null;
    this.isConnected = false;
    this.config = getEnvironmentConfig();
    this.connectionAttempts = 0;
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
  }

  /**
   * Initialize database connection pool
   */
  async initialize() {
    try {
      // Validate configuration
      const validation = validateConfig();
      if (!validation.valid) {
        throw new Error(`Database configuration invalid: ${validation.errors.join(', ')}`);
      }

      // Create connection pool
      this.pool = new Pool({
        ...this.config.postgres,
        // Connection event handlers
        onConnect: (client) => {
          if (this.config.development?.debug) {
            console.log('New database client connected');
          }
        },
        onRemove: (client) => {
          if (this.config.development?.debug) {
            console.log('Database client removed from pool');
          }
        }
      });

      // Set up pool event handlers
      this.pool.on('error', (err) => {
        console.error('Unexpected error on idle client', err);
        this.isConnected = false;
      });

      this.pool.on('connect', () => {
        if (this.config.development?.debug) {
          console.log('Database pool connected');
        }
        this.isConnected = true;
        this.connectionAttempts = 0;
      });

      this.pool.on('remove', () => {
        if (this.config.development?.debug) {
          console.log('Client removed from pool');
        }
      });

      // Test connection
      await this.testConnection();
      
      console.log('Database connection pool initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize database connection:', error.message);
      throw error;
    }
  }

  /**
   * Test database connection
   */
  async testConnection() {
    try {
      const client = await this.pool.connect();
      const result = await client.query('SELECT NOW() as current_time, version() as version');
      client.release();
      
      if (this.config.development?.debug) {
        console.log('Database connection test successful:', result.rows[0]);
      }
      
      this.isConnected = true;
      return result.rows[0];
    } catch (error) {
      this.isConnected = false;
      throw new Error(`Database connection test failed: ${error.message}`);
    }
  }

  /**
   * Execute a query with optional parameters
   */
  async query(text, params = []) {
    if (!this.pool) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    const start = Date.now();
    let client;

    try {
      client = await this.pool.connect();
      
      // Log query if enabled
      if (this.config.development?.logQueries) {
        console.log('Executing query:', text, params);
      }

      const result = await client.query(text, params);
      const duration = Date.now() - start;

      if (this.config.development?.logQueries) {
        console.log(`Query executed in ${duration}ms, returned ${result.rowCount} rows`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      console.error(`Query failed after ${duration}ms:`, error.message);
      console.error('Query:', text);
      console.error('Params:', params);
      throw error;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction(callback) {
    if (!this.pool) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      if (this.config.development?.debug) {
        console.log('Transaction started');
      }

      const result = await callback(client);
      
      await client.query('COMMIT');
      
      if (this.config.development?.debug) {
        console.log('Transaction committed');
      }

      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      
      if (this.config.development?.debug) {
        console.log('Transaction rolled back due to error:', error.message);
      }

      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a query within a transaction context
   */
  async transactionQuery(client, text, params = []) {
    const start = Date.now();

    try {
      if (this.config.development?.logQueries) {
        console.log('Executing transaction query:', text, params);
      }

      const result = await client.query(text, params);
      const duration = Date.now() - start;

      if (this.config.development?.logQueries) {
        console.log(`Transaction query executed in ${duration}ms, returned ${result.rowCount} rows`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      console.error(`Transaction query failed after ${duration}ms:`, error.message);
      throw error;
    }
  }

  /**
   * Get a client from the pool for manual transaction management
   */
  async getClient() {
    if (!this.pool) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return await this.pool.connect();
  }

  /**
   * Check if database is connected and healthy
   */
  async healthCheck() {
    try {
      const result = await this.query('SELECT 1 as health_check');
      return {
        healthy: true,
        connected: this.isConnected,
        timestamp: new Date().toISOString(),
        response_time: result.duration || 0
      };
    } catch (error) {
      return {
        healthy: false,
        connected: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get connection pool statistics
   */
  getPoolStats() {
    if (!this.pool) {
      return null;
    }

    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
      maxConnections: this.config.postgres.max,
      minConnections: this.config.postgres.min
    };
  }

  /**
   * Close all connections and clean up
   */
  async close() {
    if (this.pool) {
      try {
        await this.pool.end();
        this.isConnected = false;
        console.log('Database connection pool closed');
      } catch (error) {
        console.error('Error closing database pool:', error.message);
        throw error;
      }
    }
  }

  /**
   * Reconnect to database with retry logic
   */
  async reconnect() {
    if (this.connectionAttempts >= this.maxRetries) {
      throw new Error(`Failed to reconnect after ${this.maxRetries} attempts`);
    }

    this.connectionAttempts++;
    
    try {
      await this.close();
      await new Promise(resolve => setTimeout(resolve, this.retryDelay * this.connectionAttempts));
      await this.initialize();
    } catch (error) {
      console.error(`Reconnection attempt ${this.connectionAttempts} failed:`, error.message);
      if (this.connectionAttempts < this.maxRetries) {
        return await this.reconnect();
      }
      throw error;
    }
  }
}

// Create singleton instance
const db = new DatabaseConnection();

// Export both the class and instance
export { DatabaseConnection, db };
export default db;

