/**
 * Database Configuration and Connection Management
 * Claude Task Master AI-Driven CI/CD System
 * 
 * Supports both local JSON file mode and PostgreSQL database mode
 * with Cloudflare proxy integration for secure external access
 */

import { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database configuration
const DB_CONFIG = {
    // Local mode configuration
    local: {
        tasksFile: 'tasks/tasks.json',
        backupDir: 'tasks/backups'
    },
    
    // PostgreSQL configuration
    postgres: {
        // Default configuration
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'codegen_taskmaster_db',
        user: process.env.DB_USER || 'software_developer',
        password: process.env.DB_PASSWORD || 'password',
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
        
        // Cloudflare proxy configuration
        cloudflare: {
            enabled: process.env.CLOUDFLARE_DB_PROXY === 'true',
            url: process.env.CLOUDFLARE_DB_URL,
            token: process.env.CLOUDFLARE_DB_TOKEN
        },
        
        // Connection pool configuration
        pool: {
            min: parseInt(process.env.DB_POOL_MIN) || 2,
            max: parseInt(process.env.DB_POOL_MAX) || 20,
            idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
            connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 10000,
            acquireTimeoutMillis: parseInt(process.env.DB_ACQUIRE_TIMEOUT) || 60000,
            createTimeoutMillis: parseInt(process.env.DB_CREATE_TIMEOUT) || 30000,
            destroyTimeoutMillis: parseInt(process.env.DB_DESTROY_TIMEOUT) || 5000,
            reapIntervalMillis: parseInt(process.env.DB_REAP_INTERVAL) || 1000,
            createRetryIntervalMillis: parseInt(process.env.DB_CREATE_RETRY_INTERVAL) || 200
        }
    }
};

// Database mode selection
const DATABASE_MODE = process.env.DATABASE_MODE || 'local'; // 'local' or 'postgres'

// Connection pool instance
let pool = null;

/**
 * Get database configuration based on current mode
 */
export function getDatabaseConfig() {
    return {
        mode: DATABASE_MODE,
        config: DB_CONFIG[DATABASE_MODE] || DB_CONFIG.local
    };
}

/**
 * Initialize database connection
 */
export async function initializeDatabase() {
    if (DATABASE_MODE === 'postgres') {
        await initializePostgreSQL();
    } else {
        await initializeLocalMode();
    }
}

/**
 * Initialize PostgreSQL connection with Cloudflare proxy support
 */
async function initializePostgreSQL() {
    try {
        const config = DB_CONFIG.postgres;
        
        // Configure connection parameters
        let connectionConfig = {
            host: config.host,
            port: config.port,
            database: config.database,
            user: config.user,
            password: config.password,
            ssl: config.ssl,
            ...config.pool
        };
        
        // Use Cloudflare proxy if enabled
        if (config.cloudflare.enabled && config.cloudflare.url) {
            connectionConfig = {
                ...connectionConfig,
                host: new URL(config.cloudflare.url).hostname,
                port: new URL(config.cloudflare.url).port || 5432,
                ssl: { rejectUnauthorized: false }
            };
            
            // Add Cloudflare authentication if token provided
            if (config.cloudflare.token) {
                connectionConfig.password = config.cloudflare.token;
            }
        }
        
        // Create connection pool
        pool = new Pool(connectionConfig);
        
        // Test connection
        const client = await pool.connect();
        await client.query('SELECT NOW()');
        client.release();
        
        console.log('✅ PostgreSQL database connection established');
        
        // Set up connection event handlers
        pool.on('connect', (client) => {
            console.log('🔗 New database client connected');
        });
        
        pool.on('error', (err, client) => {
            console.error('❌ Database connection error:', err);
        });
        
        pool.on('remove', (client) => {
            console.log('🔌 Database client disconnected');
        });
        
    } catch (error) {
        console.error('❌ Failed to initialize PostgreSQL connection:', error);
        throw error;
    }
}

/**
 * Initialize local JSON file mode
 */
async function initializeLocalMode() {
    try {
        const config = DB_CONFIG.local;
        
        // Ensure tasks directory exists
        const tasksDir = path.dirname(config.tasksFile);
        await fs.mkdir(tasksDir, { recursive: true });
        
        // Ensure backup directory exists
        await fs.mkdir(config.backupDir, { recursive: true });
        
        // Check if tasks.json exists, create if not
        try {
            await fs.access(config.tasksFile);
        } catch (error) {
            // Create initial tasks.json structure
            const initialData = {
                metadata: {
                    version: '1.0.0',
                    created: new Date().toISOString(),
                    updated: new Date().toISOString()
                },
                tasks: []
            };
            await fs.writeFile(config.tasksFile, JSON.stringify(initialData, null, 2));
        }
        
        console.log('✅ Local JSON file mode initialized');
        
    } catch (error) {
        console.error('❌ Failed to initialize local mode:', error);
        throw error;
    }
}

/**
 * Get database connection (PostgreSQL pool or null for local mode)
 */
export function getConnection() {
    if (DATABASE_MODE === 'postgres') {
        if (!pool) {
            throw new Error('PostgreSQL connection not initialized. Call initializeDatabase() first.');
        }
        return pool;
    }
    return null;
}

/**
 * Execute a database query (PostgreSQL only)
 */
export async function query(text, params = []) {
    if (DATABASE_MODE !== 'postgres') {
        throw new Error('Query execution is only available in PostgreSQL mode');
    }
    
    if (!pool) {
        throw new Error('Database connection not initialized');
    }
    
    const start = Date.now();
    try {
        const result = await pool.query(text, params);
        const duration = Date.now() - start;
        
        // Log slow queries (>100ms as per requirements)
        if (duration > 100) {
            console.warn(`⚠️ Slow query detected (${duration}ms):`, text.substring(0, 100));
        }
        
        return result;
    } catch (error) {
        console.error('❌ Database query error:', error);
        throw error;
    }
}

/**
 * Execute a transaction (PostgreSQL only)
 */
export async function transaction(callback) {
    if (DATABASE_MODE !== 'postgres') {
        throw new Error('Transactions are only available in PostgreSQL mode');
    }
    
    if (!pool) {
        throw new Error('Database connection not initialized');
    }
    
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
 * Close database connection
 */
export async function closeConnection() {
    if (pool) {
        await pool.end();
        pool = null;
        console.log('🔌 Database connection closed');
    }
}

/**
 * Health check for database connection
 */
export async function healthCheck() {
    try {
        if (DATABASE_MODE === 'postgres') {
            if (!pool) {
                return { status: 'error', message: 'Database connection not initialized' };
            }
            
            const start = Date.now();
            await pool.query('SELECT 1');
            const duration = Date.now() - start;
            
            return {
                status: 'healthy',
                mode: 'postgres',
                responseTime: duration,
                poolSize: pool.totalCount,
                idleConnections: pool.idleCount,
                waitingClients: pool.waitingCount
            };
        } else {
            const config = DB_CONFIG.local;
            try {
                await fs.access(config.tasksFile);
                return {
                    status: 'healthy',
                    mode: 'local',
                    tasksFile: config.tasksFile
                };
            } catch (error) {
                return {
                    status: 'error',
                    mode: 'local',
                    message: 'Tasks file not accessible'
                };
            }
        }
    } catch (error) {
        return {
            status: 'error',
            message: error.message
        };
    }
}

/**
 * Get database statistics
 */
export async function getDatabaseStats() {
    if (DATABASE_MODE === 'postgres') {
        try {
            const stats = await query(`
                SELECT 
                    schemaname,
                    tablename,
                    n_tup_ins as inserts,
                    n_tup_upd as updates,
                    n_tup_del as deletes,
                    n_live_tup as live_tuples,
                    n_dead_tup as dead_tuples,
                    last_vacuum,
                    last_autovacuum,
                    last_analyze,
                    last_autoanalyze
                FROM pg_stat_user_tables
                ORDER BY schemaname, tablename
            `);
            
            return {
                mode: 'postgres',
                tables: stats.rows
            };
        } catch (error) {
            return {
                mode: 'postgres',
                error: error.message
            };
        }
    } else {
        try {
            const config = DB_CONFIG.local;
            const stats = await fs.stat(config.tasksFile);
            const data = JSON.parse(await fs.readFile(config.tasksFile, 'utf8'));
            
            return {
                mode: 'local',
                fileSize: stats.size,
                lastModified: stats.mtime,
                taskCount: data.tasks?.length || 0
            };
        } catch (error) {
            return {
                mode: 'local',
                error: error.message
            };
        }
    }
}

/**
 * Backup database (works for both modes)
 */
export async function backupDatabase() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    if (DATABASE_MODE === 'postgres') {
        // For PostgreSQL, we'll export key tables to JSON
        try {
            const tables = ['tasks', 'task_dependencies', 'workflow_states', 'pr_metadata', 'linear_sync'];
            const backup = {
                timestamp,
                mode: 'postgres',
                data: {}
            };
            
            for (const table of tables) {
                const result = await query(`SELECT * FROM ${table}`);
                backup.data[table] = result.rows;
            }
            
            const backupFile = path.join(DB_CONFIG.local.backupDir, `postgres-backup-${timestamp}.json`);
            await fs.writeFile(backupFile, JSON.stringify(backup, null, 2));
            
            return { success: true, file: backupFile };
        } catch (error) {
            return { success: false, error: error.message };
        }
    } else {
        // For local mode, copy the tasks.json file
        try {
            const config = DB_CONFIG.local;
            const backupFile = path.join(config.backupDir, `tasks-backup-${timestamp}.json`);
            await fs.copyFile(config.tasksFile, backupFile);
            
            return { success: true, file: backupFile };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

// Export configuration for external use
export { DATABASE_MODE, DB_CONFIG };

