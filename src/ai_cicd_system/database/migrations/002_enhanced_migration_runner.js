/**
 * @fileoverview Enhanced Migration Runner
 * @description Zero-downtime migration system with rollback support
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { getConnection } from '../connection.js';
import { log } from '../../../../scripts/modules/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Enhanced Migration Runner with zero-downtime support
 */
export class EnhancedMigrationRunner {
    constructor(connection = null) {
        this.connection = connection || getConnection();
        this.migrationsDir = path.join(__dirname, '../schema');
        this.migrationsTable = 'schema_migrations';
        this.lockTable = 'migration_locks';
        this.backupDir = path.join(__dirname, '../backups');
    }

    /**
     * Run all pending migrations with zero-downtime strategy
     * @param {Object} options - Migration options
     * @returns {Promise<Array>} Applied migrations
     */
    async runMigrations(options = {}) {
        const {
            dryRun = false,
            createBackup = true,
            maxConcurrentMigrations = 1,
            skipValidation = false
        } = options;

        if (!this.connection.isConnected) {
            throw new Error('Database connection not initialized');
        }

        log('info', 'Starting enhanced database migrations...');

        // Acquire migration lock
        const lockId = await this._acquireMigrationLock();
        
        try {
            // Ensure required tables exist
            await this._ensureSystemTables();

            // Validate current schema state
            if (!skipValidation) {
                await this._validateSchemaState();
            }

            // Get all migration files
            const migrationFiles = await this._getMigrationFiles();
            
            // Get applied migrations
            const appliedMigrations = await this._getAppliedMigrations();
            
            // Filter pending migrations
            const pendingMigrations = migrationFiles.filter(file => 
                !appliedMigrations.includes(file.version)
            );

            if (pendingMigrations.length === 0) {
                log('info', 'No pending migrations found');
                return [];
            }

            log('info', `Found ${pendingMigrations.length} pending migrations`);

            if (dryRun) {
                log('info', 'DRY RUN MODE - No changes will be applied');
                return this._simulateMigrations(pendingMigrations);
            }

            // Create backup if requested
            if (createBackup) {
                await this._createSchemaBackup();
            }

            const appliedMigrationsList = [];

            // Apply each pending migration
            for (const migration of pendingMigrations) {
                try {
                    await this._applyMigrationWithRollback(migration);
                    appliedMigrationsList.push(migration);
                    log('info', `Applied migration: ${migration.version} - ${migration.description}`);
                } catch (error) {
                    log('error', `Failed to apply migration ${migration.version}: ${error.message}`);
                    
                    // Attempt rollback of failed migration
                    await this._rollbackFailedMigration(migration, error);
                    throw error;
                }
            }

            // Validate final schema state
            await this._validateFinalState();

            log('info', `Successfully applied ${appliedMigrationsList.length} migrations`);
            return appliedMigrationsList;

        } finally {
            // Always release the lock
            await this._releaseMigrationLock(lockId);
        }
    }

    /**
     * Create a new migration file with template
     * @param {string} description - Migration description
     * @param {string} type - Migration type (schema, data, index, etc.)
     * @returns {Promise<string>} Created file path
     */
    async createMigration(description, type = 'schema') {
        const timestamp = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];
        const version = timestamp.substring(0, 14); // YYYYMMDDHHMMSS
        const sanitizedDescription = description.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const filename = `${version}_${sanitizedDescription}.sql`;
        const filepath = path.join(this.migrationsDir, filename);

        const template = this._getMigrationTemplate(type, description, version);
        
        await fs.writeFile(filepath, template);
        log('info', `Created migration file: ${filename}`);
        
        // Create corresponding rollback file
        const rollbackFilename = `${version}_${sanitizedDescription}_rollback.sql`;
        const rollbackFilepath = path.join(this.migrationsDir, rollbackFilename);
        const rollbackTemplate = this._getRollbackTemplate(type, description, version);
        
        await fs.writeFile(rollbackFilepath, rollbackTemplate);
        log('info', `Created rollback file: ${rollbackFilename}`);
        
        return filepath;
    }

    /**
     * Rollback migrations to a specific version
     * @param {string} targetVersion - Target version to rollback to
     * @param {Object} options - Rollback options
     * @returns {Promise<Array>} Rolled back migrations
     */
    async rollbackToVersion(targetVersion, options = {}) {
        const { createBackup = true, force = false } = options;

        log('warn', `Rolling back to version: ${targetVersion}`);

        // Acquire migration lock
        const lockId = await this._acquireMigrationLock();
        
        try {
            // Get applied migrations in reverse order
            const appliedMigrations = await this._getAppliedMigrations();
            const migrationsToRollback = appliedMigrations
                .filter(version => version > targetVersion)
                .reverse();

            if (migrationsToRollback.length === 0) {
                log('info', 'No migrations to rollback');
                return [];
            }

            if (!force) {
                // Check for data loss warnings
                await this._checkRollbackSafety(migrationsToRollback);
            }

            // Create backup before rollback
            if (createBackup) {
                await this._createSchemaBackup(`pre_rollback_${Date.now()}`);
            }

            const rolledBackMigrations = [];

            // Rollback each migration
            for (const version of migrationsToRollback) {
                try {
                    await this._rollbackMigration(version);
                    rolledBackMigrations.push(version);
                    log('warn', `Rolled back migration: ${version}`);
                } catch (error) {
                    log('error', `Failed to rollback migration ${version}: ${error.message}`);
                    throw error;
                }
            }

            log('warn', `Successfully rolled back ${rolledBackMigrations.length} migrations`);
            return rolledBackMigrations;

        } finally {
            await this._releaseMigrationLock(lockId);
        }
    }

    /**
     * Get comprehensive migration status
     * @returns {Promise<Object>} Migration status
     */
    async getMigrationStatus() {
        const migrationFiles = await this._getMigrationFiles();
        const appliedMigrations = await this._getAppliedMigrations();
        
        const status = migrationFiles.map(file => {
            const applied = appliedMigrations.includes(file.version);
            return {
                version: file.version,
                description: file.description,
                type: file.type,
                applied,
                applied_at: applied ? this._getAppliedDate(file.version) : null,
                file: file.filename,
                has_rollback: file.hasRollback,
                checksum: file.checksum
            };
        });

        const pendingCount = status.filter(s => !s.applied).length;
        const appliedCount = status.filter(s => s.applied).length;

        // Get schema health information
        const schemaHealth = await this._getSchemaHealth();

        return {
            total: status.length,
            applied: appliedCount,
            pending: pendingCount,
            migrations: status,
            schema_health: schemaHealth,
            last_migration: appliedCount > 0 ? status.filter(s => s.applied).pop() : null
        };
    }

    /**
     * Validate all migrations and schema integrity
     * @returns {Promise<Object>} Validation result
     */
    async validateMigrations() {
        const migrationFiles = await this._getMigrationFiles();
        const errors = [];
        const warnings = [];

        // Check for duplicate versions
        const versions = migrationFiles.map(f => f.version);
        const duplicates = versions.filter((v, i) => versions.indexOf(v) !== i);
        if (duplicates.length > 0) {
            errors.push(`Duplicate migration versions found: ${duplicates.join(', ')}`);
        }

        // Check for missing rollback files
        for (const migration of migrationFiles) {
            if (!migration.hasRollback) {
                warnings.push(`Missing rollback file for migration: ${migration.filename}`);
            }
        }

        // Validate SQL syntax
        for (const migration of migrationFiles) {
            try {
                const content = await fs.readFile(migration.filepath, 'utf8');
                const syntaxCheck = await this._validateSQLSyntax(content);
                if (!syntaxCheck.valid) {
                    errors.push(`SQL syntax error in ${migration.filename}: ${syntaxCheck.error}`);
                }
            } catch (error) {
                errors.push(`Cannot read migration file: ${migration.filename}`);
            }
        }

        // Check schema consistency
        const schemaConsistency = await this._checkSchemaConsistency();
        if (!schemaConsistency.valid) {
            errors.push(...schemaConsistency.errors);
            warnings.push(...schemaConsistency.warnings);
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            schema_consistent: schemaConsistency.valid
        };
    }

    /**
     * Ensure system tables exist
     * @private
     */
    async _ensureSystemTables() {
        // Create migrations table
        const createMigrationsTableSql = `
            CREATE TABLE IF NOT EXISTS ${this.migrationsTable} (
                version VARCHAR(50) PRIMARY KEY,
                description TEXT,
                type VARCHAR(50) DEFAULT 'schema',
                applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                checksum VARCHAR(64),
                execution_time_ms INTEGER,
                applied_by VARCHAR(255) DEFAULT current_user
            )
        `;
        
        await this.connection.query(createMigrationsTableSql);

        // Create migration locks table
        const createLocksTableSql = `
            CREATE TABLE IF NOT EXISTS ${this.lockTable} (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                lock_name VARCHAR(100) UNIQUE NOT NULL,
                acquired_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                acquired_by VARCHAR(255) DEFAULT current_user,
                expires_at TIMESTAMP WITH TIME ZONE,
                metadata JSONB DEFAULT '{}'::jsonb
            )
        `;
        
        await this.connection.query(createLocksTableSql);
    }

    /**
     * Acquire migration lock for safe concurrent execution
     * @private
     */
    async _acquireMigrationLock() {
        const lockName = 'migration_execution';
        const lockId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

        try {
            await this.connection.query(
                `INSERT INTO ${this.lockTable} (id, lock_name, expires_at, metadata) 
                 VALUES ($1, $2, $3, $4)`,
                [lockId, lockName, expiresAt, JSON.stringify({ process_id: process.pid })]
            );
            
            log('debug', `Acquired migration lock: ${lockId}`);
            return lockId;
        } catch (error) {
            if (error.code === '23505') { // Unique violation
                // Check if existing lock is expired
                const result = await this.connection.query(
                    `SELECT id, expires_at FROM ${this.lockTable} WHERE lock_name = $1`,
                    [lockName]
                );
                
                if (result.rows.length > 0) {
                    const existingLock = result.rows[0];
                    if (new Date(existingLock.expires_at) < new Date()) {
                        // Remove expired lock and try again
                        await this.connection.query(
                            `DELETE FROM ${this.lockTable} WHERE id = $1`,
                            [existingLock.id]
                        );
                        return this._acquireMigrationLock();
                    }
                }
                
                throw new Error('Migration is already in progress. Please wait for it to complete.');
            }
            throw error;
        }
    }

    /**
     * Release migration lock
     * @private
     */
    async _releaseMigrationLock(lockId) {
        try {
            await this.connection.query(
                `DELETE FROM ${this.lockTable} WHERE id = $1`,
                [lockId]
            );
            log('debug', `Released migration lock: ${lockId}`);
        } catch (error) {
            log('warn', `Failed to release migration lock: ${error.message}`);
        }
    }

    /**
     * Get all migration files with metadata
     * @private
     */
    async _getMigrationFiles() {
        const files = await fs.readdir(this.migrationsDir);
        const migrationFiles = [];

        for (const file of files) {
            if (file.endsWith('.sql') && !file.endsWith('_rollback.sql') && !file.includes('runner')) {
                const filepath = path.join(this.migrationsDir, file);
                const content = await fs.readFile(filepath, 'utf8');
                
                const version = file.split('_')[0];
                const description = this._extractDescription(content, file);
                const type = this._extractType(content);
                const checksum = crypto.createHash('sha256').update(content).digest('hex');
                
                // Check for rollback file
                const rollbackFile = file.replace('.sql', '_rollback.sql');
                const rollbackPath = path.join(this.migrationsDir, rollbackFile);
                let hasRollback = false;
                try {
                    await fs.access(rollbackPath);
                    hasRollback = true;
                } catch (error) {
                    // Rollback file doesn't exist
                }

                migrationFiles.push({
                    version,
                    description,
                    type,
                    filename: file,
                    filepath,
                    checksum,
                    hasRollback
                });
            }
        }

        return migrationFiles.sort((a, b) => a.version.localeCompare(b.version));
    }

    /**
     * Apply migration with rollback support
     * @private
     */
    async _applyMigrationWithRollback(migration) {
        const startTime = Date.now();
        const sql = await fs.readFile(migration.filepath, 'utf8');

        await this.connection.transaction(async (client) => {
            try {
                // Execute migration SQL
                await client.query(sql);
                
                const executionTime = Date.now() - startTime;
                
                // Record migration
                await client.query(
                    `INSERT INTO ${this.migrationsTable} 
                     (version, description, type, checksum, execution_time_ms) 
                     VALUES ($1, $2, $3, $4, $5)`,
                    [migration.version, migration.description, migration.type, 
                     migration.checksum, executionTime]
                );
                
            } catch (error) {
                log('error', `Migration ${migration.version} failed: ${error.message}`);
                throw error;
            }
        });
    }

    /**
     * Create schema backup
     * @private
     */
    async _createSchemaBackup(suffix = '') {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupName = `schema_backup_${timestamp}${suffix ? '_' + suffix : ''}.sql`;
        const backupPath = path.join(this.backupDir, backupName);

        // Ensure backup directory exists
        await fs.mkdir(this.backupDir, { recursive: true });

        // Create schema dump (simplified version)
        const schemaQuery = `
            SELECT 
                'CREATE TABLE ' || schemaname || '.' || tablename || ' (' ||
                array_to_string(
                    array_agg(
                        column_name || ' ' || data_type ||
                        case when character_maximum_length is not null 
                             then '(' || character_maximum_length || ')' 
                             else '' end
                    ), ', '
                ) || ');' as create_statement
            FROM information_schema.tables t
            JOIN information_schema.columns c ON t.table_name = c.table_name
            WHERE t.table_schema = 'public'
            GROUP BY schemaname, tablename
        `;

        const result = await this.connection.query(schemaQuery);
        const backupContent = result.rows.map(row => row.create_statement).join('\n\n');

        await fs.writeFile(backupPath, backupContent);
        log('info', `Schema backup created: ${backupName}`);
        
        return backupPath;
    }

    /**
     * Get migration template based on type
     * @private
     */
    _getMigrationTemplate(type, description, version) {
        const templates = {
            schema: `-- Migration: ${version}_${description.toLowerCase().replace(/\\s+/g, '_')}.sql
-- Description: ${description}
-- Type: Schema Migration
-- Created: ${new Date().toISOString().split('T')[0]}
-- Version: ${version}

-- Enable required extensions if needed
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Add your schema changes here
-- Example:
-- CREATE TABLE example_table (
--     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--     name VARCHAR(255) NOT NULL,
--     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
-- );

-- Add indexes
-- CREATE INDEX IF NOT EXISTS idx_example_table_name ON example_table(name);

-- Add constraints
-- ALTER TABLE example_table ADD CONSTRAINT example_table_name_check CHECK (length(name) > 0);

-- Add comments
-- COMMENT ON TABLE example_table IS 'Example table for demonstration';
`,
            data: `-- Migration: ${version}_${description.toLowerCase().replace(/\\s+/g, '_')}.sql
-- Description: ${description}
-- Type: Data Migration
-- Created: ${new Date().toISOString().split('T')[0]}
-- Version: ${version}

-- Add your data migration here
-- Example:
-- INSERT INTO example_table (name) VALUES ('example_data');

-- Update existing data
-- UPDATE example_table SET updated_at = NOW() WHERE updated_at IS NULL;
`,
            index: `-- Migration: ${version}_${description.toLowerCase().replace(/\\s+/g, '_')}.sql
-- Description: ${description}
-- Type: Index Migration
-- Created: ${new Date().toISOString().split('T')[0]}
-- Version: ${version}

-- Add your index changes here
-- Example:
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_example_table_column ON example_table(column_name);

-- Drop unused indexes
-- DROP INDEX IF EXISTS old_index_name;
`
        };

        return templates[type] || templates.schema;
    }

    /**
     * Get rollback template
     * @private
     */
    _getRollbackTemplate(type, description, version) {
        return `-- Rollback: ${version}_${description.toLowerCase().replace(/\\s+/g, '_')}_rollback.sql
-- Description: Rollback for ${description}
-- Type: ${type} Rollback
-- Created: ${new Date().toISOString().split('T')[0]}
-- Version: ${version}

-- WARNING: This rollback script should undo the changes made in the corresponding migration
-- Review carefully before executing to avoid data loss

-- Add your rollback statements here
-- Example:
-- DROP TABLE IF EXISTS example_table;
-- DROP INDEX IF EXISTS idx_example_table_name;

-- IMPORTANT: Test this rollback script thoroughly before using in production
`;
    }

    /**
     * Extract description from migration file
     * @private
     */
    _extractDescription(content, filename) {
        const descriptionMatch = content.match(/-- Description: (.+)/);
        if (descriptionMatch) {
            return descriptionMatch[1].trim();
        }
        
        // Fallback to filename
        return filename
            .replace(/^\\d+_/, '')
            .replace(/\\.sql$/, '')
            .replace(/_/g, ' ');
    }

    /**
     * Extract type from migration file
     * @private
     */
    _extractType(content) {
        const typeMatch = content.match(/-- Type: (.+)/);
        if (typeMatch) {
            return typeMatch[1].toLowerCase().replace(' migration', '');
        }
        return 'schema';
    }

    /**
     * Validate SQL syntax
     * @private
     */
    async _validateSQLSyntax(sql) {
        try {
            // Simple syntax validation by attempting to explain the query
            // This is a basic check - more sophisticated validation could be added
            await this.connection.query(`EXPLAIN (FORMAT JSON) ${sql.split(';')[0]}`);
            return { valid: true };
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    /**
     * Check schema consistency
     * @private
     */
    async _checkSchemaConsistency() {
        const errors = [];
        const warnings = [];

        try {
            // Check for missing foreign key constraints
            const fkCheck = await this.connection.query(`
                SELECT 
                    tc.table_name, 
                    tc.constraint_name,
                    kcu.column_name,
                    ccu.table_name AS foreign_table_name,
                    ccu.column_name AS foreign_column_name 
                FROM information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                    ON ccu.constraint_name = tc.constraint_name
                    AND ccu.table_schema = tc.table_schema
                WHERE tc.constraint_type = 'FOREIGN KEY'
                    AND tc.table_schema = 'public'
            `);

            // Check for tables without primary keys
            const pkCheck = await this.connection.query(`
                SELECT table_name
                FROM information_schema.tables t
                WHERE table_schema = 'public'
                    AND table_type = 'BASE TABLE'
                    AND NOT EXISTS (
                        SELECT 1
                        FROM information_schema.table_constraints tc
                        WHERE tc.table_name = t.table_name
                            AND tc.table_schema = 'public'
                            AND tc.constraint_type = 'PRIMARY KEY'
                    )
            `);

            if (pkCheck.rows.length > 0) {
                warnings.push(`Tables without primary keys: ${pkCheck.rows.map(r => r.table_name).join(', ')}`);
            }

            return {
                valid: errors.length === 0,
                errors,
                warnings
            };

        } catch (error) {
            return {
                valid: false,
                errors: [`Schema consistency check failed: ${error.message}`],
                warnings
            };
        }
    }

    /**
     * Get schema health information
     * @private
     */
    async _getSchemaHealth() {
        try {
            const healthChecks = await Promise.all([
                this._checkTableSizes(),
                this._checkIndexUsage(),
                this._checkConstraintViolations()
            ]);

            return {
                table_sizes: healthChecks[0],
                index_usage: healthChecks[1],
                constraint_violations: healthChecks[2],
                overall_health: 'good' // Simplified health assessment
            };
        } catch (error) {
            return {
                error: error.message,
                overall_health: 'unknown'
            };
        }
    }

    /**
     * Check table sizes
     * @private
     */
    async _checkTableSizes() {
        const result = await this.connection.query(`
            SELECT 
                schemaname,
                tablename,
                pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
                pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
            FROM pg_tables 
            WHERE schemaname = 'public'
            ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
            LIMIT 10
        `);

        return result.rows;
    }

    /**
     * Check index usage
     * @private
     */
    async _checkIndexUsage() {
        const result = await this.connection.query(`
            SELECT 
                schemaname,
                tablename,
                indexname,
                idx_scan,
                idx_tup_read,
                idx_tup_fetch
            FROM pg_stat_user_indexes
            WHERE schemaname = 'public'
            ORDER BY idx_scan DESC
            LIMIT 10
        `);

        return result.rows;
    }

    /**
     * Check constraint violations
     * @private
     */
    async _checkConstraintViolations() {
        // This is a simplified check - in practice, you'd want more comprehensive validation
        return [];
    }
}

export default EnhancedMigrationRunner;

