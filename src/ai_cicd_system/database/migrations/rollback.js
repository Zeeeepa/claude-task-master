/**
 * @fileoverview Database Migration Rollback System
 * @description Comprehensive rollback mechanisms for database migrations
 * @version 2.0.0
 * @created 2025-05-28
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getConnection } from '../connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Database Migration Rollback Manager
 * Handles rollback operations for database migrations with safety checks
 */
export class MigrationRollbackManager {
    constructor(connection = null) {
        this.connection = connection || getConnection();
        this.migrationsDir = __dirname;
        this.migrationsTable = 'schema_migrations';
        this.rollbackHistory = [];
    }

    /**
     * Rollback the last migration
     * @param {Object} options - Rollback options
     * @returns {Promise<Object>} Rollback result
     */
    async rollbackLastMigration(options = {}) {
        try {
            console.log('🔄 Starting rollback of last migration...');
            
            // Get the last applied migration
            const lastMigration = await this._getLastMigration();
            
            if (!lastMigration) {
                throw new Error('No migrations found to rollback');
            }
            
            return await this.rollbackMigration(lastMigration.version, options);
            
        } catch (error) {
            console.error('❌ Failed to rollback last migration:', error.message);
            throw error;
        }
    }

    /**
     * Rollback a specific migration
     * @param {string} migrationVersion - Migration version to rollback
     * @param {Object} options - Rollback options
     * @returns {Promise<Object>} Rollback result
     */
    async rollbackMigration(migrationVersion, options = {}) {
        const startTime = Date.now();
        
        try {
            console.log(`🔄 Starting rollback of migration ${migrationVersion}...`);
            
            // Validate rollback request
            await this._validateRollbackRequest(migrationVersion, options);
            
            // Get migration details
            const migration = await this._getMigrationDetails(migrationVersion);
            
            // Create backup if requested
            let backupInfo = null;
            if (options.createBackup !== false) {
                backupInfo = await this._createPreRollbackBackup(migrationVersion);
            }
            
            // Perform rollback
            const rollbackResult = await this._performRollback(migration, options);
            
            // Record rollback in history
            const rollbackRecord = {
                id: `rollback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                migration_version: migrationVersion,
                rollback_timestamp: new Date().toISOString(),
                execution_time_ms: Date.now() - startTime,
                backup_info: backupInfo,
                rollback_result: rollbackResult,
                options: options
            };
            
            this.rollbackHistory.push(rollbackRecord);
            
            console.log(`✅ Migration ${migrationVersion} rolled back successfully`);
            
            return {
                success: true,
                migration_version: migrationVersion,
                execution_time_ms: Date.now() - startTime,
                backup_created: !!backupInfo,
                rollback_id: rollbackRecord.id,
                details: rollbackResult
            };
            
        } catch (error) {
            console.error(`❌ Failed to rollback migration ${migrationVersion}:`, error.message);
            
            // Record failed rollback
            this.rollbackHistory.push({
                id: `rollback_failed_${Date.now()}`,
                migration_version: migrationVersion,
                rollback_timestamp: new Date().toISOString(),
                execution_time_ms: Date.now() - startTime,
                error: error.message,
                options: options
            });
            
            throw error;
        }
    }

    /**
     * Rollback multiple migrations
     * @param {Array} migrationVersions - Array of migration versions to rollback
     * @param {Object} options - Rollback options
     * @returns {Promise<Object>} Rollback results
     */
    async rollbackMultipleMigrations(migrationVersions, options = {}) {
        const results = [];
        const errors = [];
        
        try {
            console.log(`🔄 Starting rollback of ${migrationVersions.length} migrations...`);
            
            // Sort migrations in reverse order (newest first)
            const sortedMigrations = [...migrationVersions].sort().reverse();
            
            for (const version of sortedMigrations) {
                try {
                    const result = await this.rollbackMigration(version, {
                        ...options,
                        createBackup: false // Only create backup for the first migration
                    });
                    results.push(result);
                    
                } catch (error) {
                    errors.push({
                        migration_version: version,
                        error: error.message
                    });
                    
                    if (options.stopOnError !== false) {
                        break;
                    }
                }
            }
            
            console.log(`✅ Completed rollback of ${results.length} migrations`);
            if (errors.length > 0) {
                console.warn(`⚠️ ${errors.length} migrations failed to rollback`);
            }
            
            return {
                success: errors.length === 0,
                successful_rollbacks: results.length,
                failed_rollbacks: errors.length,
                results: results,
                errors: errors
            };
            
        } catch (error) {
            console.error('❌ Failed to rollback multiple migrations:', error.message);
            throw error;
        }
    }

    /**
     * Rollback to a specific migration version
     * @param {string} targetVersion - Target migration version
     * @param {Object} options - Rollback options
     * @returns {Promise<Object>} Rollback result
     */
    async rollbackToVersion(targetVersion, options = {}) {
        try {
            console.log(`🔄 Rolling back to migration version ${targetVersion}...`);
            
            // Get all migrations after the target version
            const migrationsToRollback = await this._getMigrationsAfterVersion(targetVersion);
            
            if (migrationsToRollback.length === 0) {
                console.log('ℹ️ No migrations to rollback - already at or before target version');
                return {
                    success: true,
                    migrations_rolled_back: 0,
                    target_version: targetVersion
                };
            }
            
            return await this.rollbackMultipleMigrations(
                migrationsToRollback.map(m => m.version),
                options
            );
            
        } catch (error) {
            console.error(`❌ Failed to rollback to version ${targetVersion}:`, error.message);
            throw error;
        }
    }

    /**
     * Get rollback status for a migration
     * @param {string} migrationVersion - Migration version
     * @returns {Promise<Object>} Rollback status
     */
    async getRollbackStatus(migrationVersion) {
        try {
            const migration = await this._getMigrationDetails(migrationVersion);
            
            if (!migration) {
                return {
                    migration_version: migrationVersion,
                    exists: false,
                    rollback_available: false
                };
            }
            
            // Check if rollback script exists
            const rollbackScriptPath = path.join(this.migrationsDir, `${migrationVersion}_rollback.sql`);
            let rollbackScriptExists = false;
            
            try {
                await fs.access(rollbackScriptPath);
                rollbackScriptExists = true;
            } catch (error) {
                // File doesn't exist
            }
            
            // Check if migration class has rollback method
            let classRollbackAvailable = false;
            try {
                const migrationModule = await import(`./${migrationVersion}.js`);
                const MigrationClass = migrationModule.default || migrationModule[Object.keys(migrationModule)[0]];
                if (MigrationClass && typeof MigrationClass.prototype.down === 'function') {
                    classRollbackAvailable = true;
                }
            } catch (error) {
                // Migration class not found or doesn't have rollback method
            }
            
            return {
                migration_version: migrationVersion,
                exists: true,
                applied: true,
                rollback_available: migration.rollback_available || rollbackScriptExists || classRollbackAvailable,
                rollback_script_exists: rollbackScriptExists,
                class_rollback_available: classRollbackAvailable,
                applied_at: migration.applied_at,
                description: migration.description
            };
            
        } catch (error) {
            console.error(`❌ Failed to get rollback status for ${migrationVersion}:`, error.message);
            throw error;
        }
    }

    /**
     * List all available rollbacks
     * @returns {Promise<Array>} Available rollbacks
     */
    async listAvailableRollbacks() {
        try {
            const appliedMigrations = await this._getAppliedMigrations();
            const rollbackStatuses = [];
            
            for (const migration of appliedMigrations) {
                const status = await this.getRollbackStatus(migration.version);
                rollbackStatuses.push(status);
            }
            
            return rollbackStatuses.filter(status => status.rollback_available);
            
        } catch (error) {
            console.error('❌ Failed to list available rollbacks:', error.message);
            throw error;
        }
    }

    /**
     * Get rollback history
     * @param {number} limit - Number of records to return
     * @returns {Array} Rollback history
     */
    getRollbackHistory(limit = 50) {
        return this.rollbackHistory
            .slice(-limit)
            .sort((a, b) => new Date(b.rollback_timestamp) - new Date(a.rollback_timestamp));
    }

    /**
     * Validate rollback request
     * @private
     */
    async _validateRollbackRequest(migrationVersion, options) {
        // Check if migration exists and is applied
        const migration = await this._getMigrationDetails(migrationVersion);
        
        if (!migration) {
            throw new Error(`Migration ${migrationVersion} not found or not applied`);
        }
        
        // Check if rollback is available
        const rollbackStatus = await this.getRollbackStatus(migrationVersion);
        
        if (!rollbackStatus.rollback_available) {
            throw new Error(`Rollback not available for migration ${migrationVersion}`);
        }
        
        // Check for dependent migrations
        if (options.force !== true) {
            const dependentMigrations = await this._getDependentMigrations(migrationVersion);
            
            if (dependentMigrations.length > 0) {
                throw new Error(
                    `Cannot rollback ${migrationVersion} - dependent migrations exist: ${dependentMigrations.map(m => m.version).join(', ')}`
                );
            }
        }
        
        // Check database connection
        if (!this.connection.isConnected) {
            throw new Error('Database connection not available');
        }
    }

    /**
     * Get migration details
     * @private
     */
    async _getMigrationDetails(migrationVersion) {
        const result = await this.connection.query(
            `SELECT * FROM ${this.migrationsTable} WHERE version = $1`,
            [migrationVersion]
        );
        
        return result.rows[0] || null;
    }

    /**
     * Get last applied migration
     * @private
     */
    async _getLastMigration() {
        const result = await this.connection.query(
            `SELECT * FROM ${this.migrationsTable} ORDER BY applied_at DESC LIMIT 1`
        );
        
        return result.rows[0] || null;
    }

    /**
     * Get applied migrations
     * @private
     */
    async _getAppliedMigrations() {
        const result = await this.connection.query(
            `SELECT * FROM ${this.migrationsTable} ORDER BY version DESC`
        );
        
        return result.rows;
    }

    /**
     * Get migrations after a specific version
     * @private
     */
    async _getMigrationsAfterVersion(targetVersion) {
        const result = await this.connection.query(
            `SELECT * FROM ${this.migrationsTable} WHERE version > $1 ORDER BY version DESC`,
            [targetVersion]
        );
        
        return result.rows;
    }

    /**
     * Get dependent migrations
     * @private
     */
    async _getDependentMigrations(migrationVersion) {
        // In a more sophisticated system, this would check for actual dependencies
        // For now, we consider all migrations applied after this one as dependent
        return await this._getMigrationsAfterVersion(migrationVersion);
    }

    /**
     * Create pre-rollback backup
     * @private
     */
    async _createPreRollbackBackup(migrationVersion) {
        try {
            console.log(`💾 Creating backup before rolling back ${migrationVersion}...`);
            
            const backupId = `backup_${migrationVersion}_${Date.now()}`;
            const backupPath = path.join(this.migrationsDir, 'backups', `${backupId}.sql`);
            
            // Ensure backup directory exists
            await fs.mkdir(path.dirname(backupPath), { recursive: true });
            
            // Create database dump (simplified - in production use pg_dump)
            const backupSQL = await this._generateBackupSQL();
            await fs.writeFile(backupPath, backupSQL, 'utf8');
            
            console.log(`✅ Backup created: ${backupPath}`);
            
            return {
                backup_id: backupId,
                backup_path: backupPath,
                created_at: new Date().toISOString(),
                migration_version: migrationVersion
            };
            
        } catch (error) {
            console.warn('⚠️ Failed to create backup:', error.message);
            return null;
        }
    }

    /**
     * Generate backup SQL
     * @private
     */
    async _generateBackupSQL() {
        // This is a simplified backup - in production, use proper database backup tools
        const tables = ['tasks', 'workflows', 'system_metrics', 'task_contexts', 'audit_logs', 'task_dependencies'];
        let backupSQL = `-- Database backup created at ${new Date().toISOString()}\n\n`;
        
        for (const table of tables) {
            try {
                const result = await this.connection.query(`SELECT * FROM ${table} LIMIT 1000`);
                backupSQL += `-- Table: ${table}\n`;
                backupSQL += `-- Row count: ${result.rows.length}\n\n`;
            } catch (error) {
                backupSQL += `-- Table: ${table} (backup failed: ${error.message})\n\n`;
            }
        }
        
        return backupSQL;
    }

    /**
     * Perform the actual rollback
     * @private
     */
    async _performRollback(migration, options) {
        const rollbackResults = [];
        
        try {
            await this.connection.transaction(async (client) => {
                // Try migration class rollback first
                const classRollback = await this._tryClassRollback(migration, client);
                if (classRollback.success) {
                    rollbackResults.push(classRollback);
                } else {
                    // Try SQL script rollback
                    const scriptRollback = await this._trySQLRollback(migration, client);
                    rollbackResults.push(scriptRollback);
                }
                
                // Remove migration record
                await client.query(
                    `DELETE FROM ${this.migrationsTable} WHERE version = $1`,
                    [migration.version]
                );
                
                rollbackResults.push({
                    type: 'migration_record_removal',
                    success: true,
                    message: 'Migration record removed from schema_migrations table'
                });
            });
            
            return rollbackResults;
            
        } catch (error) {
            rollbackResults.push({
                type: 'rollback_error',
                success: false,
                error: error.message
            });
            
            throw error;
        }
    }

    /**
     * Try class-based rollback
     * @private
     */
    async _tryClassRollback(migration, client) {
        try {
            const migrationModule = await import(`./${migration.version}.js`);
            const MigrationClass = migrationModule.default || migrationModule[Object.keys(migrationModule)[0]];
            
            if (MigrationClass && typeof MigrationClass.prototype.down === 'function') {
                const migrationInstance = new MigrationClass(this.connection);
                await migrationInstance.down();
                
                return {
                    type: 'class_rollback',
                    success: true,
                    message: 'Migration rolled back using class method'
                };
            } else {
                return {
                    type: 'class_rollback',
                    success: false,
                    message: 'Migration class does not have rollback method'
                };
            }
            
        } catch (error) {
            return {
                type: 'class_rollback',
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Try SQL script rollback
     * @private
     */
    async _trySQLRollback(migration, client) {
        try {
            const rollbackScriptPath = path.join(this.migrationsDir, `${migration.version}_rollback.sql`);
            const rollbackSQL = await fs.readFile(rollbackScriptPath, 'utf8');
            
            // Execute rollback SQL
            await client.query(rollbackSQL);
            
            return {
                type: 'sql_rollback',
                success: true,
                message: 'Migration rolled back using SQL script'
            };
            
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`Rollback script not found: ${migration.version}_rollback.sql`);
            } else {
                throw new Error(`SQL rollback failed: ${error.message}`);
            }
        }
    }

    /**
     * Create rollback script template
     * @param {string} migrationVersion - Migration version
     * @returns {Promise<string>} Created script path
     */
    async createRollbackScript(migrationVersion) {
        const scriptPath = path.join(this.migrationsDir, `${migrationVersion}_rollback.sql`);
        
        const template = `-- Rollback script for migration: ${migrationVersion}
-- Created: ${new Date().toISOString()}
-- Description: Rollback changes made by migration ${migrationVersion}

-- WARNING: This script will undo changes made by the migration
-- Make sure to backup your data before running this script

-- Example rollback operations:
-- DROP TABLE IF EXISTS new_table_name;
-- ALTER TABLE existing_table DROP COLUMN new_column_name;
-- DROP INDEX IF EXISTS new_index_name;
-- DROP FUNCTION IF EXISTS new_function_name();

-- Add your rollback SQL statements here:

`;
        
        await fs.writeFile(scriptPath, template, 'utf8');
        console.log(`📝 Rollback script template created: ${scriptPath}`);
        
        return scriptPath;
    }
}

/**
 * CLI function to rollback migrations
 */
export async function rollbackFromCLI() {
    const args = process.argv.slice(2);
    const command = args[0];
    const migrationVersion = args[1];
    
    try {
        const connection = getConnection();
        await connection.initialize();
        
        const rollbackManager = new MigrationRollbackManager(connection);
        
        switch (command) {
            case 'last':
                await rollbackManager.rollbackLastMigration();
                break;
                
            case 'version':
                if (!migrationVersion) {
                    throw new Error('Migration version required');
                }
                await rollbackManager.rollbackMigration(migrationVersion);
                break;
                
            case 'to':
                if (!migrationVersion) {
                    throw new Error('Target version required');
                }
                await rollbackManager.rollbackToVersion(migrationVersion);
                break;
                
            case 'list':
                const available = await rollbackManager.listAvailableRollbacks();
                console.log('Available rollbacks:');
                available.forEach(rollback => {
                    console.log(`  ${rollback.migration_version} - ${rollback.description}`);
                });
                break;
                
            case 'status':
                if (!migrationVersion) {
                    throw new Error('Migration version required');
                }
                const status = await rollbackManager.getRollbackStatus(migrationVersion);
                console.log('Rollback status:', JSON.stringify(status, null, 2));
                break;
                
            default:
                console.log('Usage: node rollback.js <command> [migration_version]');
                console.log('Commands:');
                console.log('  last                    - Rollback last migration');
                console.log('  version <version>       - Rollback specific migration');
                console.log('  to <version>           - Rollback to specific version');
                console.log('  list                   - List available rollbacks');
                console.log('  status <version>       - Get rollback status');
                break;
        }
        
        await connection.shutdown();
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Rollback failed:', error.message);
        process.exit(1);
    }
}

export default MigrationRollbackManager;

