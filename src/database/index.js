/**
 * Database Module Entry Point
 * Exports all database functionality for the unified AI CI/CD system
 */

// Core database functionality
export { 
    getDatabase, 
    initializeDatabase, 
    closeDatabase, 
    query, 
    transaction, 
    getHealthStatus 
} from './connection.js';

// Models
export { BaseModel } from './models/BaseModel.js';
export { WorkflowModel } from './models/WorkflowModel.js';
export { TaskModel } from './models/TaskModel.js';

// Model instances (singletons)
let workflowModel = null;
let taskModel = null;

/**
 * Get workflow model instance
 */
export function getWorkflowModel() {
    if (!workflowModel) {
        workflowModel = new WorkflowModel();
    }
    return workflowModel;
}

/**
 * Get task model instance
 */
export function getTaskModel() {
    if (!taskModel) {
        taskModel = new TaskModel();
    }
    return taskModel;
}

/**
 * Initialize all database components
 */
export async function initializeAllDatabase(config = {}) {
    try {
        console.log('Initializing database system...');
        
        // Initialize connection
        const db = await initializeDatabase(config);
        
        // Initialize schema if needed
        if (config.initializeSchema) {
            await db.initializeSchema();
        }
        
        // Run migrations if needed
        if (config.runMigrations) {
            await db.runMigrations();
        }
        
        console.log('Database system initialized successfully');
        return db;
    } catch (error) {
        console.error('Failed to initialize database system:', error);
        throw error;
    }
}

/**
 * Database health check with detailed status
 */
export async function getDatabaseHealth() {
    try {
        const db = getDatabase();
        const health = await db.healthCheck();
        
        // Add model-specific health checks
        const modelHealth = {
            workflows: await testModelHealth('workflows'),
            tasks: await testModelHealth('tasks'),
            components: await testModelHealth('components'),
            logs: await testModelHealth('logs'),
            configurations: await testModelHealth('configurations')
        };
        
        return {
            ...health,
            models: modelHealth
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Test model health by performing a simple query
 */
async function testModelHealth(tableName) {
    try {
        const result = await query(`SELECT COUNT(*) as count FROM ${tableName}`);
        return {
            status: 'healthy',
            recordCount: parseInt(result.rows[0].count)
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            error: error.message
        };
    }
}

/**
 * Get database statistics
 */
export async function getDatabaseStatistics() {
    try {
        const stats = {};
        
        // Get table statistics
        const tableStatsQuery = `
            SELECT 
                schemaname,
                tablename,
                n_tup_ins as inserts,
                n_tup_upd as updates,
                n_tup_del as deletes,
                n_live_tup as live_tuples,
                n_dead_tup as dead_tuples
            FROM pg_stat_user_tables
            ORDER BY tablename
        `;
        
        const tableStats = await query(tableStatsQuery);
        stats.tables = tableStats.rows;
        
        // Get index statistics
        const indexStatsQuery = `
            SELECT 
                schemaname,
                tablename,
                indexname,
                idx_scan as scans,
                idx_tup_read as tuples_read,
                idx_tup_fetch as tuples_fetched
            FROM pg_stat_user_indexes
            ORDER BY tablename, indexname
        `;
        
        const indexStats = await query(indexStatsQuery);
        stats.indexes = indexStats.rows;
        
        // Get database size
        const sizeQuery = `
            SELECT 
                pg_size_pretty(pg_database_size(current_database())) as database_size,
                pg_database_size(current_database()) as database_size_bytes
        `;
        
        const sizeResult = await query(sizeQuery);
        stats.size = sizeResult.rows[0];
        
        // Get connection statistics
        const connectionQuery = `
            SELECT 
                COUNT(*) as total_connections,
                COUNT(CASE WHEN state = 'active' THEN 1 END) as active_connections,
                COUNT(CASE WHEN state = 'idle' THEN 1 END) as idle_connections
            FROM pg_stat_activity
            WHERE datname = current_database()
        `;
        
        const connectionResult = await query(connectionQuery);
        stats.connections = connectionResult.rows[0];
        
        return stats;
    } catch (error) {
        console.error('Failed to get database statistics:', error);
        throw error;
    }
}

/**
 * Cleanup old data based on retention policies
 */
export async function cleanupOldData() {
    try {
        const db = getDatabase();
        return await db.cleanup();
    } catch (error) {
        console.error('Failed to cleanup old data:', error);
        throw error;
    }
}

/**
 * Export default database instance getter
 */
export default getDatabase;

