/**
 * @fileoverview Database Migration Runner
 * @description Handles database schema migrations with rollback support and validation
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { DatabaseConnection } from '../connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Database Migration Runner
 * Manages schema migrations with proper versioning and rollback support
 */
export class MigrationRunner {
    constructor(connection) {
        this.connection = connection;
        this.migrationsDir = __dirname;
        this.migrationTableName = 'schema_migrations';
    }

    /**
     * Initialize migration system
     * Creates migration tracking table if it doesn't exist
     */
    async initialize() {
        await this.connection.query(`
            CREATE TABLE IF NOT EXISTS ${this.migrationTableName} (
                id SERIAL PRIMARY KEY,
                version VARCHAR(50) NOT NULL UNIQUE,
                filename VARCHAR(255) NOT NULL,
                checksum VARCHAR(255) NOT NULL,
                applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                execution_time_ms INTEGER,
                description TEXT
            )
        `);
    }

    /**
     * Get list of available migration files
     * @returns {Promise<Array>} Array of migration file objects
     */
    async getAvailableMigrations() {
        try {
            const files = await fs.readdir(this.migrationsDir);
            const migrationFiles = files
                .filter(file => file.endsWith('.sql') && file.match(/^\d{3}_/))
                .sort()
                .map(filename => {
                    const version = filename.split('_')[0];
                    const name = filename.replace(/^\d{3}_/, '').replace('.sql', '');
                    return {
                        version,
                        filename,
                        name,
                        path: path.join(this.migrationsDir, filename)
                    };
                });

            return migrationFiles;
        } catch (error) {
            throw new Error(`Failed to read migrations directory: ${error.message}`);
        }
    }

    /**
     * Get list of applied migrations
     * @returns {Promise<Array>} Array of applied migration records
     */
    async getAppliedMigrations() {
        const result = await this.connection.query(`
            SELECT version, filename, checksum, applied_at, execution_time_ms, description
            FROM ${this.migrationTableName}
            ORDER BY version
        `);
        return result.rows;
    }

    /**
     * Get pending migrations
     * @returns {Promise<Array>} Array of pending migration objects
     */
    async getPendingMigrations() {
        const available = await this.getAvailableMigrations();
        const applied = await this.getAppliedMigrations();
        const appliedVersions = new Set(applied.map(m => m.version));

        return available.filter(migration => !appliedVersions.has(migration.version));
    }

    /**
     * Calculate checksum for migration file
     * @param {string} filePath - Path to migration file
     * @returns {Promise<string>} SHA-256 checksum
     */
    async calculateChecksum(filePath) {
        const content = await fs.readFile(filePath, 'utf8');
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * Validate migration integrity
     * Checks if applied migrations match their checksums
     * @returns {Promise<Object>} Validation result
     */
    async validateMigrations() {
        const applied = await this.getAppliedMigrations();
        const available = await this.getAvailableMigrations();
        const availableMap = new Map(available.map(m => [m.version, m]));

        const errors = [];
        const warnings = [];

        for (const appliedMigration of applied) {
            const availableMigration = availableMap.get(appliedMigration.version);
            
            if (!availableMigration) {
                warnings.push(`Applied migration ${appliedMigration.version} (${appliedMigration.filename}) not found in migrations directory`);
                continue;
            }

            try {
                const currentChecksum = await this.calculateChecksum(availableMigration.path);
                if (currentChecksum !== appliedMigration.checksum) {
                    errors.push(`Migration ${appliedMigration.version} checksum mismatch. File may have been modified after application.`);
                }
            } catch (error) {
                errors.push(`Failed to validate migration ${appliedMigration.version}: ${error.message}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Run a single migration
     * @param {Object} migration - Migration object
     * @returns {Promise<Object>} Migration result
     */
    async runMigration(migration) {
        const startTime = Date.now();
        
        try {
            this.log('info', `Running migration ${migration.version}: ${migration.name}`);
            
            // Read migration file
            const sql = await fs.readFile(migration.path, 'utf8');
            const checksum = await this.calculateChecksum(migration.path);
            
            // Extract description from migration file (first comment line)
            const descriptionMatch = sql.match(/-- Description: (.+)/);
            const description = descriptionMatch ? descriptionMatch[1].trim() : migration.name;
            
            // Execute migration in a transaction
            await this.connection.transaction(async (client) => {
                // Execute the migration SQL
                await client.query(sql);
                
                // Record the migration
                const executionTime = Date.now() - startTime;
                await client.query(`
                    INSERT INTO ${this.migrationTableName} 
                    (version, filename, checksum, execution_time_ms, description)
                    VALUES ($1, $2, $3, $4, $5)
                `, [migration.version, migration.filename, checksum, executionTime, description]);
            });
            
            const executionTime = Date.now() - startTime;
            this.log('info', `Migration ${migration.version} completed in ${executionTime}ms`);
            
            return {
                success: true,
                version: migration.version,
                executionTime,
                description
            };
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            this.log('error', `Migration ${migration.version} failed after ${executionTime}ms: ${error.message}`);
            
            throw new Error(`Migration ${migration.version} failed: ${error.message}`);
        }
    }

    /**
     * Run all pending migrations
     * @param {Object} options - Migration options
     * @returns {Promise<Array>} Array of migration results
     */
    async runMigrations(options = {}) {
        const { dryRun = false, targetVersion = null } = options;
        
        await this.initialize();
        
        // Validate existing migrations
        const validation = await this.validateMigrations();
        if (!validation.valid) {
            throw new Error(`Migration validation failed: ${validation.errors.join(', ')}`);
        }
        
        if (validation.warnings.length > 0) {
            this.log('warn', `Migration warnings: ${validation.warnings.join(', ')}`);
        }
        
        // Get pending migrations
        let pendingMigrations = await this.getPendingMigrations();
        
        // Filter by target version if specified
        if (targetVersion) {
            pendingMigrations = pendingMigrations.filter(m => m.version <= targetVersion);
        }
        
        if (pendingMigrations.length === 0) {
            this.log('info', 'No pending migrations to run');
            return [];
        }
        
        this.log('info', `Found ${pendingMigrations.length} pending migrations`);
        
        if (dryRun) {
            this.log('info', 'DRY RUN - Migrations that would be applied:');
            pendingMigrations.forEach(m => {
                this.log('info', `  ${m.version}: ${m.name}`);
            });
            return pendingMigrations.map(m => ({ ...m, dryRun: true }));
        }
        
        // Run migrations
        const results = [];
        for (const migration of pendingMigrations) {
            try {
                const result = await this.runMigration(migration);
                results.push(result);
            } catch (error) {
                // Stop on first failure
                this.log('error', `Migration process stopped due to failure: ${error.message}`);
                throw error;
            }
        }
        
        this.log('info', `Successfully applied ${results.length} migrations`);
        return results;
    }

    /**
     * Rollback to a specific version
     * @param {string} targetVersion - Version to rollback to
     * @returns {Promise<Array>} Array of rollback results
     */
    async rollbackTo(targetVersion) {
        await this.initialize();
        
        const applied = await this.getAppliedMigrations();
        const toRollback = applied.filter(m => m.version > targetVersion).reverse();
        
        if (toRollback.length === 0) {
            this.log('info', `No migrations to rollback. Current version is already at or below ${targetVersion}`);
            return [];
        }
        
        this.log('warn', `Rolling back ${toRollback.length} migrations to version ${targetVersion}`);
        
        // Note: This is a simplified rollback that just removes migration records
        // In a production system, you'd want to have explicit rollback scripts
        const results = [];
        
        for (const migration of toRollback) {
            try {
                await this.connection.query(`
                    DELETE FROM ${this.migrationTableName} 
                    WHERE version = $1
                `, [migration.version]);
                
                this.log('info', `Rolled back migration ${migration.version}`);
                results.push({
                    success: true,
                    version: migration.version,
                    action: 'rollback'
                });
                
            } catch (error) {
                this.log('error', `Failed to rollback migration ${migration.version}: ${error.message}`);
                throw error;
            }
        }
        
        this.log('warn', `Rollback completed. ${results.length} migrations rolled back.`);
        this.log('warn', 'WARNING: This rollback only removed migration records. Database schema changes were NOT automatically reverted.');
        
        return results;
    }

    /**
     * Get migration status
     * @returns {Promise<Object>} Migration status information
     */
    async getMigrationStatus() {
        await this.initialize();
        
        const available = await this.getAvailableMigrations();
        const applied = await this.getAppliedMigrations();
        const pending = await this.getPendingMigrations();
        
        const currentVersion = applied.length > 0 
            ? applied[applied.length - 1].version 
            : 'none';
        
        const latestVersion = available.length > 0 
            ? available[available.length - 1].version 
            : 'none';
        
        return {
            currentVersion,
            latestVersion,
            totalMigrations: available.length,
            appliedMigrations: applied.length,
            pendingMigrations: pending.length,
            upToDate: pending.length === 0,
            applied: applied.map(m => ({
                version: m.version,
                filename: m.filename,
                appliedAt: m.applied_at,
                executionTime: m.execution_time_ms
            })),
            pending: pending.map(m => ({
                version: m.version,
                filename: m.filename,
                name: m.name
            }))
        };
    }

    /**
     * Create a new migration file
     * @param {string} name - Migration name
     * @param {string} content - Migration SQL content (optional)
     * @returns {Promise<string>} Path to created migration file
     */
    async createMigration(name, content = '') {
        const available = await this.getAvailableMigrations();
        const nextVersion = String(available.length + 1).padStart(3, '0');
        
        const filename = `${nextVersion}_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.sql`;
        const filePath = path.join(this.migrationsDir, filename);
        
        const migrationContent = content || `-- Migration: ${filename}
-- Description: ${name}
-- Created: ${new Date().toISOString().split('T')[0]}
-- Version: ${nextVersion}

-- Add your migration SQL here
-- Example:
-- CREATE TABLE example (
--     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--     name VARCHAR(255) NOT NULL,
--     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
-- );
`;
        
        await fs.writeFile(filePath, migrationContent, 'utf8');
        
        this.log('info', `Created migration file: ${filename}`);
        return filePath;
    }

    /**
     * Reset all migrations (DANGEROUS - for development only)
     * @param {boolean} confirm - Must be true to proceed
     */
    async resetMigrations(confirm = false) {
        if (!confirm) {
            throw new Error('Migration reset requires explicit confirmation. This will drop all tables and data.');
        }
        
        this.log('warn', 'RESETTING ALL MIGRATIONS - THIS WILL DROP ALL TABLES AND DATA');
        
        await this.connection.transaction(async (client) => {
            // Drop all tables in reverse dependency order
            const dropTables = [
                'audit_logs',
                'performance_metrics',
                'integration_events',
                'workflow_stages',
                'task_dependencies',
                'deployments',
                'templates',
                'logs',
                'integrations',
                'workflows',
                'tasks',
                this.migrationTableName,
                'schema_versions'
            ];
            
            for (const table of dropTables) {
                await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
            }
            
            // Drop views
            const dropViews = [
                'task_summary',
                'workflow_progress',
                'integration_health'
            ];
            
            for (const view of dropViews) {
                await client.query(`DROP VIEW IF EXISTS ${view} CASCADE`);
            }
            
            // Drop functions
            await client.query('DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE');
            await client.query('DROP FUNCTION IF EXISTS create_audit_log() CASCADE');
        });
        
        this.log('warn', 'All migrations reset. Database is now empty.');
    }

    /**
     * Logging utility
     * @private
     */
    log(level, message) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [MIGRATION] [${level.toUpperCase()}] ${message}`);
    }
}

/**
 * CLI interface for migration runner
 */
export async function runMigrationCLI() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    try {
        const { initializeDatabase } = await import('../connection.js');
        const connection = await initializeDatabase();
        const runner = new MigrationRunner(connection);
        
        switch (command) {
            case 'status':
                const status = await runner.getMigrationStatus();
                console.log('Migration Status:');
                console.log(`  Current Version: ${status.currentVersion}`);
                console.log(`  Latest Version: ${status.latestVersion}`);
                console.log(`  Applied: ${status.appliedMigrations}/${status.totalMigrations}`);
                console.log(`  Pending: ${status.pendingMigrations}`);
                console.log(`  Up to Date: ${status.upToDate ? 'Yes' : 'No'}`);
                break;
                
            case 'migrate':
                const dryRun = args.includes('--dry-run');
                const targetVersion = args.find(arg => arg.startsWith('--to='))?.split('=')[1];
                await runner.runMigrations({ dryRun, targetVersion });
                break;
                
            case 'rollback':
                const version = args[1];
                if (!version) {
                    throw new Error('Rollback requires target version: npm run migrate rollback 001');
                }
                await runner.rollbackTo(version);
                break;
                
            case 'create':
                const name = args[1];
                if (!name) {
                    throw new Error('Create requires migration name: npm run migrate create add_new_table');
                }
                await runner.createMigration(name);
                break;
                
            case 'validate':
                const validation = await runner.validateMigrations();
                if (validation.valid) {
                    console.log('✅ All migrations are valid');
                } else {
                    console.log('❌ Migration validation failed:');
                    validation.errors.forEach(error => console.log(`  - ${error}`));
                }
                if (validation.warnings.length > 0) {
                    console.log('⚠️  Warnings:');
                    validation.warnings.forEach(warning => console.log(`  - ${warning}`));
                }
                break;
                
            case 'reset':
                const confirm = args.includes('--confirm');
                await runner.resetMigrations(confirm);
                break;
                
            default:
                console.log('Available commands:');
                console.log('  status                    - Show migration status');
                console.log('  migrate [--dry-run]       - Run pending migrations');
                console.log('  migrate --to=VERSION      - Migrate to specific version');
                console.log('  rollback VERSION          - Rollback to version');
                console.log('  create NAME               - Create new migration');
                console.log('  validate                  - Validate migration integrity');
                console.log('  reset --confirm           - Reset all migrations (DANGEROUS)');
                break;
        }
        
        await connection.shutdown();
        
    } catch (error) {
        console.error('Migration failed:', error.message);
        process.exit(1);
    }
}

// Run CLI if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runMigrationCLI();
}

export default MigrationRunner;

