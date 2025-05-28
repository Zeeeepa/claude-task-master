/**
 * @fileoverview Database Manager
 * @description Core database operations and migration management
 */

import { DatabasePoolManager } from '../database/connection/pool_manager.js';
import { DatabaseHealthChecker } from '../database/connection/health_checker.js';
import { DatabaseConfig } from '../config/database_config.js';
import { log } from '../../scripts/modules/utils.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Core database manager with migration support
 */
export class DatabaseManager {
    constructor(config = {}) {
        this.config = new DatabaseConfig(config);
        this.poolManager = new DatabasePoolManager(this.config.getPoolConfig());
        this.healthChecker = new DatabaseHealthChecker(this.poolManager, {
            enableAlerts: config.enable_health_alerts !== false,
            enableMetrics: config.enable_health_metrics !== false
        });
        
        this.isInitialized = false;
        this.schemaVersion = null;
        this.migrationsPath = path.join(__dirname, '../database/schema');
    }

    /**
     * Initialize the database manager
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            log('info', '🚀 Initializing database manager...');
            
            // Initialize connection pool
            await this.poolManager.initialize();
            
            // Run migrations if enabled
            if (this.config.config.auto_migrate) {
                await this.runMigrations();
            } else {
                await this.checkSchema();
            }
            
            // Start health monitoring
            this.healthChecker.start();
            
            this.isInitialized = true;
            
            log('info', '✅ Database manager initialized successfully', {
                host: this.config.config.host,
                database: this.config.config.database,
                schemaVersion: this.schemaVersion
            });
            
        } catch (error) {
            log('error', '❌ Failed to initialize database manager', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Run database migrations
     * @returns {Promise<void>}
     */
    async runMigrations() {
        try {
            log('info', '🔄 Running database migrations...');
            
            // Create migrations table if it doesn't exist
            await this._createMigrationsTable();
            
            // Check current schema version
            const currentVersion = await this._getCurrentSchemaVersion();
            log('info', `Current schema version: ${currentVersion || 'none'}`);
            
            // Run schema initialization
            await this._runSchemaInit();
            
            // Update schema version
            await this._updateSchemaVersion('1.0.0');
            this.schemaVersion = '1.0.0';
            
            log('info', '✅ Database migrations completed successfully');
            
        } catch (error) {
            log('error', '❌ Migration failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Check if schema exists and is up to date
     * @returns {Promise<void>}
     */
    async checkSchema() {
        try {
            // Check if main tables exist
            const tablesExist = await this._checkTablesExist();
            
            if (!tablesExist) {
                log('warn', '⚠️ Database schema not found. Run migrations to initialize.');
                this.schemaVersion = null;
                return;
            }
            
            // Get current schema version
            this.schemaVersion = await this._getCurrentSchemaVersion();
            
            log('info', '✅ Database schema check completed', {
                schemaVersion: this.schemaVersion
            });
            
        } catch (error) {
            log('error', '❌ Schema check failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Execute a query with error handling
     * @param {string} text - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<object>} Query result
     */
    async query(text, params = []) {
        if (!this.isInitialized) {
            throw new Error('Database manager not initialized');
        }
        
        return await this.poolManager.query(text, params);
    }

    /**
     * Execute a transaction
     * @param {Function} callback - Transaction callback
     * @returns {Promise<any>} Transaction result
     */
    async transaction(callback) {
        if (!this.isInitialized) {
            throw new Error('Database manager not initialized');
        }
        
        return await this.poolManager.transaction(callback);
    }

    /**
     * Get a database client for complex operations
     * @returns {Promise<object>} Database client
     */
    async getClient() {
        if (!this.isInitialized) {
            throw new Error('Database manager not initialized');
        }
        
        return await this.poolManager.getClient();
    }

    /**
     * Get database health status
     * @returns {Promise<object>} Health status
     */
    async getHealth() {
        return await this.healthChecker.getDetailedMetrics();
    }

    /**
     * Get database metrics
     * @returns {object} Database metrics
     */
    getMetrics() {
        return this.poolManager.getMetrics();
    }

    /**
     * Backup database schema
     * @returns {Promise<string>} Backup SQL
     */
    async backupSchema() {
        try {
            log('info', '💾 Creating database schema backup...');
            
            const tables = ['tasks', 'contexts', 'workflows', 'pr_tracking'];
            let backupSql = '-- Database Schema Backup\n';
            backupSql += `-- Generated: ${new Date().toISOString()}\n\n`;
            
            for (const table of tables) {
                const result = await this.query(`
                    SELECT column_name, data_type, is_nullable, column_default
                    FROM information_schema.columns 
                    WHERE table_name = $1 
                    ORDER BY ordinal_position
                `, [table]);
                
                if (result.rows.length > 0) {
                    backupSql += `-- Table: ${table}\n`;
                    backupSql += `-- Columns: ${result.rows.length}\n`;
                    result.rows.forEach(row => {
                        backupSql += `-- ${row.column_name}: ${row.data_type}\n`;
                    });
                    backupSql += '\n';
                }
            }
            
            log('info', '✅ Schema backup created');
            return backupSql;
            
        } catch (error) {
            log('error', '❌ Schema backup failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Shutdown the database manager
     * @returns {Promise<void>}
     */
    async shutdown() {
        log('info', '🔄 Shutting down database manager...');
        
        this.healthChecker.stop();
        await this.poolManager.close();
        this.isInitialized = false;
        
        log('info', '✅ Database manager shutdown complete');
    }

    // Private methods

    /**
     * Create migrations tracking table
     * @private
     */
    async _createMigrationsTable() {
        const createTableSql = `
            CREATE TABLE IF NOT EXISTS ${this.config.config.migrations_table} (
                id SERIAL PRIMARY KEY,
                version VARCHAR(50) NOT NULL UNIQUE,
                description TEXT,
                applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        `;
        
        await this.poolManager.query(createTableSql);
    }

    /**
     * Get current schema version
     * @private
     */
    async _getCurrentSchemaVersion() {
        try {
            const result = await this.poolManager.query(`
                SELECT version FROM ${this.config.config.migrations_table} 
                ORDER BY applied_at DESC 
                LIMIT 1
            `);
            
            return result.rows.length > 0 ? result.rows[0].version : null;
        } catch (error) {
            // Table might not exist yet
            return null;
        }
    }

    /**
     * Update schema version
     * @private
     */
    async _updateSchemaVersion(version, description = 'Schema initialization') {
        await this.poolManager.query(`
            INSERT INTO ${this.config.config.migrations_table} (version, description)
            VALUES ($1, $2)
            ON CONFLICT (version) DO NOTHING
        `, [version, description]);
    }

    /**
     * Check if main tables exist
     * @private
     */
    async _checkTablesExist() {
        try {
            const result = await this.poolManager.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('tasks', 'contexts', 'workflows', 'pr_tracking')
            `);
            
            return result.rows.length === 4;
        } catch (error) {
            return false;
        }
    }

    /**
     * Run schema initialization
     * @private
     */
    async _runSchemaInit() {
        try {
            // Read and execute schema files in order
            const schemaFiles = [
                'tasks.sql',
                'contexts.sql', 
                'workflows.sql',
                'pr_tracking.sql'
            ];
            
            for (const file of schemaFiles) {
                const filePath = path.join(this.migrationsPath, file);
                
                try {
                    const sql = await fs.readFile(filePath, 'utf8');
                    await this.poolManager.query(sql);
                    log('debug', `✅ Executed schema file: ${file}`);
                } catch (error) {
                    log('error', `❌ Failed to execute schema file: ${file}`, {
                        error: error.message
                    });
                    throw error;
                }
            }
            
        } catch (error) {
            log('error', '❌ Schema initialization failed', { error: error.message });
            throw error;
        }
    }
}

export default DatabaseManager;

