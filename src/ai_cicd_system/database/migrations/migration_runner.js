/**
 * @fileoverview Migration Runner
 * @description Database migration management system
 */

import { log } from '../../../scripts/modules/utils.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Database migration runner with version tracking
 */
export class MigrationRunner {
    constructor(dbManager, config = {}) {
        this.db = dbManager;
        this.config = {
            migrationsTable: config.migrationsTable || 'schema_migrations',
            migrationsPath: config.migrationsPath || path.join(__dirname, '../schema'),
            dryRun: config.dryRun || false,
            ...config
        };
        
        this.migrations = [];
    }

    /**
     * Initialize migration system
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            await this._createMigrationsTable();
            await this._loadMigrations();
            
            log('info', '✅ Migration system initialized', {
                migrationsFound: this.migrations.length
            });
            
        } catch (error) {
            log('error', '❌ Failed to initialize migration system', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Run all pending migrations
     * @returns {Promise<Array>} Applied migrations
     */
    async runMigrations() {
        try {
            const appliedMigrations = await this._getAppliedMigrations();
            const pendingMigrations = this.migrations.filter(
                migration => !appliedMigrations.includes(migration.version)
            );

            if (pendingMigrations.length === 0) {
                log('info', '✅ No pending migrations');
                return [];
            }

            log('info', `🔄 Running ${pendingMigrations.length} pending migrations...`);

            const results = [];
            
            for (const migration of pendingMigrations) {
                try {
                    await this._runMigration(migration);
                    results.push(migration);
                    
                    log('info', `✅ Migration applied: ${migration.version}`, {
                        description: migration.description
                    });
                    
                } catch (error) {
                    log('error', `❌ Migration failed: ${migration.version}`, {
                        error: error.message
                    });
                    throw error;
                }
            }

            log('info', `✅ All migrations completed successfully`, {
                appliedCount: results.length
            });

            return results;
            
        } catch (error) {
            log('error', '❌ Migration process failed', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Rollback last migration
     * @returns {Promise<object|null>} Rolled back migration
     */
    async rollbackLastMigration() {
        try {
            const lastMigration = await this._getLastAppliedMigration();
            
            if (!lastMigration) {
                log('info', 'No migrations to rollback');
                return null;
            }

            const migration = this.migrations.find(m => m.version === lastMigration.version);
            
            if (!migration || !migration.rollback) {
                throw new Error(`Rollback not available for migration: ${lastMigration.version}`);
            }

            if (this.config.dryRun) {
                log('info', `[DRY RUN] Would rollback migration: ${migration.version}`);
                return migration;
            }

            await this.db.transaction(async (client) => {
                // Execute rollback SQL
                await client.query(migration.rollback);
                
                // Remove from migrations table
                await client.query(`
                    DELETE FROM ${this.config.migrationsTable} 
                    WHERE version = $1
                `, [migration.version]);
            });

            log('info', `✅ Migration rolled back: ${migration.version}`);
            return migration;
            
        } catch (error) {
            log('error', '❌ Rollback failed', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get migration status
     * @returns {Promise<object>} Migration status
     */
    async getStatus() {
        try {
            const appliedMigrations = await this._getAppliedMigrations();
            const pendingMigrations = this.migrations.filter(
                migration => !appliedMigrations.includes(migration.version)
            );

            return {
                totalMigrations: this.migrations.length,
                appliedMigrations: appliedMigrations.length,
                pendingMigrations: pendingMigrations.length,
                lastApplied: appliedMigrations.length > 0 ? appliedMigrations[appliedMigrations.length - 1] : null,
                pending: pendingMigrations.map(m => ({
                    version: m.version,
                    description: m.description
                }))
            };
            
        } catch (error) {
            log('error', '❌ Failed to get migration status', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Validate database schema
     * @returns {Promise<object>} Validation result
     */
    async validateSchema() {
        try {
            const requiredTables = ['tasks', 'contexts', 'workflows', 'pr_tracking'];
            const existingTables = await this._getExistingTables();
            
            const missingTables = requiredTables.filter(
                table => !existingTables.includes(table)
            );

            const isValid = missingTables.length === 0;
            
            return {
                isValid,
                requiredTables,
                existingTables,
                missingTables,
                extraTables: existingTables.filter(
                    table => !requiredTables.includes(table) && 
                            table !== this.config.migrationsTable
                )
            };
            
        } catch (error) {
            log('error', '❌ Schema validation failed', {
                error: error.message
            });
            throw error;
        }
    }

    // Private methods

    /**
     * Create migrations tracking table
     * @private
     */
    async _createMigrationsTable() {
        const createTableSql = `
            CREATE TABLE IF NOT EXISTS ${this.config.migrationsTable} (
                id SERIAL PRIMARY KEY,
                version VARCHAR(50) NOT NULL UNIQUE,
                description TEXT,
                applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                checksum VARCHAR(64)
            )
        `;
        
        await this.db.query(createTableSql);
    }

    /**
     * Load migration definitions
     * @private
     */
    async _loadMigrations() {
        // Define migrations in order
        this.migrations = [
            {
                version: '1.0.0',
                description: 'Initial schema setup',
                sql: await this._loadSchemaFile('tasks.sql'),
                rollback: 'DROP TABLE IF EXISTS tasks CASCADE;'
            },
            {
                version: '1.0.1',
                description: 'Add contexts table',
                sql: await this._loadSchemaFile('contexts.sql'),
                rollback: 'DROP TABLE IF EXISTS contexts CASCADE;'
            },
            {
                version: '1.0.2',
                description: 'Add workflows table',
                sql: await this._loadSchemaFile('workflows.sql'),
                rollback: 'DROP TABLE IF EXISTS workflows CASCADE;'
            },
            {
                version: '1.0.3',
                description: 'Add PR tracking table',
                sql: await this._loadSchemaFile('pr_tracking.sql'),
                rollback: 'DROP TABLE IF EXISTS pr_tracking CASCADE;'
            }
        ];
    }

    /**
     * Load SQL from schema file
     * @private
     */
    async _loadSchemaFile(filename) {
        try {
            const filePath = path.join(this.config.migrationsPath, filename);
            return await fs.readFile(filePath, 'utf8');
        } catch (error) {
            log('warn', `⚠️ Could not load schema file: ${filename}`, {
                error: error.message
            });
            return '';
        }
    }

    /**
     * Get applied migrations
     * @private
     */
    async _getAppliedMigrations() {
        try {
            const result = await this.db.query(`
                SELECT version FROM ${this.config.migrationsTable} 
                ORDER BY applied_at ASC
            `);
            
            return result.rows.map(row => row.version);
        } catch (error) {
            // Table might not exist yet
            return [];
        }
    }

    /**
     * Get last applied migration
     * @private
     */
    async _getLastAppliedMigration() {
        try {
            const result = await this.db.query(`
                SELECT * FROM ${this.config.migrationsTable} 
                ORDER BY applied_at DESC 
                LIMIT 1
            `);
            
            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Run a single migration
     * @private
     */
    async _runMigration(migration) {
        if (this.config.dryRun) {
            log('info', `[DRY RUN] Would apply migration: ${migration.version}`);
            return;
        }

        await this.db.transaction(async (client) => {
            // Execute migration SQL
            if (migration.sql) {
                await client.query(migration.sql);
            }
            
            // Record migration
            await client.query(`
                INSERT INTO ${this.config.migrationsTable} (version, description)
                VALUES ($1, $2)
            `, [migration.version, migration.description]);
        });
    }

    /**
     * Get existing tables
     * @private
     */
    async _getExistingTables() {
        const result = await this.db.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        
        return result.rows.map(row => row.table_name);
    }
}

export default MigrationRunner;

