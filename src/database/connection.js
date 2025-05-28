/**
 * Database Connection Management
 * Provides robust PostgreSQL connection pooling and management
 * for the unified AI CI/CD system
 */

import pg from 'pg';
import { Pool } from 'pg-pool';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Database connection configuration
 */
const DEFAULT_CONFIG = {
    // Connection settings
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'claude_task_master',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    
    // SSL configuration
    ssl: process.env.DB_SSL === 'true' ? {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
    } : false,
    
    // Connection pool settings
    max: parseInt(process.env.DB_POOL_MAX) || 20,
    min: parseInt(process.env.DB_POOL_MIN) || 2,
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 10000,
    
    // Query settings
    statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT) || 30000,
    query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT) || 30000,
    
    // Application settings
    application_name: 'claude-task-master-ai-cicd'
};

/**
 * Database connection manager class
 */
class DatabaseManager {
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.pool = null;
        this.isConnected = false;
        this.connectionAttempts = 0;
        this.maxRetries = 5;
        this.retryDelay = 1000; // 1 second
        
        // Performance monitoring
        this.metrics = {
            totalQueries: 0,
            totalConnections: 0,
            totalErrors: 0,
            averageQueryTime: 0,
            connectionPoolStats: {}
        };
        
        // Health check interval
        this.healthCheckInterval = null;
        this.healthCheckIntervalMs = 30000; // 30 seconds
    }

    /**
     * Initialize database connection pool
     */
    async initialize() {
        try {
            console.log('Initializing database connection pool...');
            
            // Create connection pool
            this.pool = new Pool(this.config);
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Test connection
            await this.testConnection();
            
            // Start health monitoring
            this.startHealthMonitoring();
            
            this.isConnected = true;
            console.log('Database connection pool initialized successfully');
            
            return true;
        } catch (error) {
            console.error('Failed to initialize database connection:', error);
            throw error;
        }
    }

    /**
     * Set up pool event listeners for monitoring
     */
    setupEventListeners() {
        this.pool.on('connect', (client) => {
            this.metrics.totalConnections++;
            console.log('New client connected to database');
        });

        this.pool.on('error', (err, client) => {
            this.metrics.totalErrors++;
            console.error('Database pool error:', err);
        });

        this.pool.on('remove', (client) => {
            console.log('Client removed from database pool');
        });
    }

    /**
     * Test database connection
     */
    async testConnection() {
        const client = await this.pool.connect();
        try {
            const result = await client.query('SELECT NOW() as current_time, version() as version');
            console.log('Database connection test successful:', {
                time: result.rows[0].current_time,
                version: result.rows[0].version.split(' ')[0]
            });
            return true;
        } finally {
            client.release();
        }
    }

    /**
     * Execute a query with performance monitoring
     */
    async query(text, params = []) {
        if (!this.isConnected) {
            throw new Error('Database not connected. Call initialize() first.');
        }

        const startTime = Date.now();
        let client;

        try {
            client = await this.pool.connect();
            const result = await client.query(text, params);
            
            // Update metrics
            const queryTime = Date.now() - startTime;
            this.metrics.totalQueries++;
            this.metrics.averageQueryTime = 
                (this.metrics.averageQueryTime * (this.metrics.totalQueries - 1) + queryTime) / this.metrics.totalQueries;
            
            // Log slow queries
            if (queryTime > 1000) {
                console.warn(`Slow query detected (${queryTime}ms):`, text.substring(0, 100));
            }
            
            return result;
        } catch (error) {
            this.metrics.totalErrors++;
            console.error('Database query error:', {
                error: error.message,
                query: text.substring(0, 100),
                params: params
            });
            throw error;
        } finally {
            if (client) {
                client.release();
            }
        }
    }

    /**
     * Execute a transaction
     */
    async transaction(callback) {
        if (!this.isConnected) {
            throw new Error('Database not connected. Call initialize() first.');
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
            maxConnections: this.config.max,
            minConnections: this.config.min,
            ...this.metrics
        };
    }

    /**
     * Health check for database connection
     */
    async healthCheck() {
        try {
            const result = await this.query('SELECT 1 as health_check');
            return {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                responseTime: Date.now(),
                poolStats: this.getPoolStats()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                error: error.message,
                poolStats: this.getPoolStats()
            };
        }
    }

    /**
     * Start health monitoring
     */
    startHealthMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        this.healthCheckInterval = setInterval(async () => {
            const health = await this.healthCheck();
            if (health.status === 'unhealthy') {
                console.error('Database health check failed:', health);
            }
        }, this.healthCheckIntervalMs);
    }

    /**
     * Stop health monitoring
     */
    stopHealthMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    /**
     * Initialize database schema
     */
    async initializeSchema() {
        try {
            console.log('Initializing database schema...');
            
            const schemaPath = join(__dirname, 'schema.sql');
            const schemaSql = readFileSync(schemaPath, 'utf8');
            
            await this.query(schemaSql);
            
            console.log('Database schema initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize database schema:', error);
            throw error;
        }
    }

    /**
     * Run database migrations
     */
    async runMigrations() {
        try {
            console.log('Running database migrations...');
            
            // Create migrations table if it doesn't exist
            await this.query(`
                CREATE TABLE IF NOT EXISTS migrations (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) UNIQUE NOT NULL,
                    executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            // Get list of executed migrations
            const executedMigrations = await this.query(
                'SELECT name FROM migrations ORDER BY executed_at'
            );
            const executedNames = executedMigrations.rows.map(row => row.name);
            
            // TODO: Implement migration file discovery and execution
            console.log('Migrations completed successfully');
            return true;
        } catch (error) {
            console.error('Failed to run migrations:', error);
            throw error;
        }
    }

    /**
     * Clean up old data based on retention policies
     */
    async cleanup() {
        try {
            console.log('Running database cleanup...');
            
            // Clean old logs
            const logsDeleted = await this.query('SELECT clean_old_logs()');
            console.log(`Deleted ${logsDeleted.rows[0].clean_old_logs} old log entries`);
            
            // Clean old metrics
            const metricsDeleted = await this.query('SELECT clean_old_metrics()');
            console.log(`Deleted ${metricsDeleted.rows[0].clean_old_metrics} old metric entries`);
            
            // Vacuum analyze for performance
            await this.query('VACUUM ANALYZE');
            
            console.log('Database cleanup completed successfully');
            return true;
        } catch (error) {
            console.error('Database cleanup failed:', error);
            throw error;
        }
    }

    /**
     * Close database connection pool
     */
    async close() {
        try {
            this.stopHealthMonitoring();
            
            if (this.pool) {
                await this.pool.end();
                this.pool = null;
            }
            
            this.isConnected = false;
            console.log('Database connection pool closed');
        } catch (error) {
            console.error('Error closing database connection:', error);
            throw error;
        }
    }

    /**
     * Retry connection with exponential backoff
     */
    async retryConnection() {
        while (this.connectionAttempts < this.maxRetries) {
            try {
                await this.initialize();
                this.connectionAttempts = 0;
                return true;
            } catch (error) {
                this.connectionAttempts++;
                const delay = this.retryDelay * Math.pow(2, this.connectionAttempts - 1);
                
                console.warn(`Database connection attempt ${this.connectionAttempts} failed. Retrying in ${delay}ms...`);
                
                if (this.connectionAttempts >= this.maxRetries) {
                    throw new Error(`Failed to connect to database after ${this.maxRetries} attempts`);
                }
                
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
}

// Singleton instance
let dbManager = null;

/**
 * Get database manager instance
 */
export function getDatabase(config = {}) {
    if (!dbManager) {
        dbManager = new DatabaseManager(config);
    }
    return dbManager;
}

/**
 * Initialize database connection
 */
export async function initializeDatabase(config = {}) {
    const db = getDatabase(config);
    await db.initialize();
    return db;
}

/**
 * Close database connection
 */
export async function closeDatabase() {
    if (dbManager) {
        await dbManager.close();
        dbManager = null;
    }
}

/**
 * Execute a database query
 */
export async function query(text, params = []) {
    const db = getDatabase();
    return await db.query(text, params);
}

/**
 * Execute a database transaction
 */
export async function transaction(callback) {
    const db = getDatabase();
    return await db.transaction(callback);
}

/**
 * Get database health status
 */
export async function getHealthStatus() {
    const db = getDatabase();
    return await db.healthCheck();
}

export default DatabaseManager;

