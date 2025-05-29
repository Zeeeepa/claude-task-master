/**
 * @fileoverview Database Migration Runner
 * @description Handles database schema migrations with version tracking
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { getConnection } from '../connection.js';
import { log } from '../../../../../scripts/modules/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Database Migration Runner
 */
export class MigrationRunner {
    constructor(connection = null) {
        this.connection = connection || getConnection();
        this.migrationsDir = __dirname;
        this.migrationsTable = 'schema_migrations';
    }

    /**
     * Run all pending migrations
     * @returns {Promise<Array>} Applied migrations
     */
    async runMigrations() {
        if (!this.connection.isConnected) {
            throw new Error('Database connection not initialized');
        }

        log('info', 'Starting database migrations...');

        // Ensure migrations table exists
        await this._ensureMigrationsTable();

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

        const appliedMigrationsList = [];

        // Apply each pending migration
        for (const migration of pendingMigrations) {
            try {
                await this._applyMigration(migration);
                appliedMigrationsList.push(migration);
                log('info', `Applied migration: ${migration.version} - ${migration.description}`);
            } catch (error) {
                log('error', `Failed to apply migration ${migration.version}: ${error.message}`);
                throw error;
            }
        }

        log('info', `Successfully applied ${appliedMigrationsList.length} migrations`);
        return appliedMigrationsList;
    }

    /**
     * Rollback the last migration
     * @returns {Promise<Object>} Rolled back migration
     */
    async rollbackLastMigration() {
        log('warn', 'Migration rollback requested');
        
        const appliedMigrations = await this._getAppliedMigrations();
        if (appliedMigrations.length === 0) {
            throw new Error('No migrations to rollback');
        }

        const lastMigration = appliedMigrations[appliedMigrations.length - 1];
        
        // Check if rollback script exists
        const rollbackFile = path.join(this.migrationsDir, `${lastMigration}_rollback.sql`);
        
        try {
            await fs.access(rollbackFile);
        } catch (error) {
            throw new Error(`Rollback script not found for migration ${lastMigration}`);
        }

        // Execute rollback
        const rollbackSql = await fs.readFile(rollbackFile, 'utf8');
        
        await this.connection.transaction(async (client) => {
            // Execute rollback SQL
            await client.query(rollbackSql);
            
            // Remove migration record
            await client.query(
                `DELETE FROM ${this.migrationsTable} WHERE version = $1`,
                [lastMigration]
            );
        });

        log('warn', `Rolled back migration: ${lastMigration}`);
        return { version: lastMigration };
    }

    /**
     * Get migration status
     * @returns {Promise<Object>} Migration status
     */
    async getMigrationStatus() {
        const migrationFiles = await this._getMigrationFiles();
        const appliedMigrations = await this._getAppliedMigrations();
        
        const status = migrationFiles.map(file => ({
            version: file.version,
            description: file.description,
            applied: appliedMigrations.includes(file.version),
            file: file.filename
        }));

        const pendingCount = status.filter(s => !s.applied).length;
        const appliedCount = status.filter(s => s.applied).length;

        return {
            total: status.length,
            applied: appliedCount,
            pending: pendingCount,
            migrations: status
        };
    }

    /**
     * Validate all migrations
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

        // Check for missing files
        for (const migration of migrationFiles) {
            try {
                await fs.access(migration.filepath);
            } catch (error) {
                errors.push(`Migration file not found: ${migration.filename}`);
            }
        }

        // Check for syntax errors (basic validation)
        for (const migration of migrationFiles) {
            try {
                const content = await fs.readFile(migration.filepath, 'utf8');
                if (!content.trim()) {
                    warnings.push(`Migration file is empty: ${migration.filename}`);
                }
                
                // Check for common SQL syntax issues
                if (!content.toLowerCase().includes('create') && 
                    !content.toLowerCase().includes('alter') &&
                    !content.toLowerCase().includes('insert')) {
                    warnings.push(`Migration may not contain any DDL statements: ${migration.filename}`);
                }
            } catch (error) {
                errors.push(`Cannot read migration file: ${migration.filename}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Ensure migrations table exists
     * @private
     */
    async _ensureMigrationsTable() {
        const createTableSql = `
            CREATE TABLE IF NOT EXISTS ${this.migrationsTable} (
                version VARCHAR(50) PRIMARY KEY,
                description TEXT,
                applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                checksum VARCHAR(64)
            )
        `;
        
        await this.connection.query(createTableSql);
    }

    /**
     * Get all migration files
     * @private
     */
    async _getMigrationFiles() {
        const files = await fs.readdir(this.migrationsDir);
        const migrationFiles = files
            .filter(file => file.endsWith('.sql') && !file.endsWith('_rollback.sql'))
            .filter(file => file !== 'runner.js')
            .map(file => {
                const version = file.split('_')[0];
                const description = file
                    .replace(/^\d+_/, '')
                    .replace(/\.sql$/, '')
                    .replace(/_/g, ' ');
                
                return {
                    version,
                    description,
                    filename: file,
                    filepath: path.join(this.migrationsDir, file)
                };
            })
            .sort((a, b) => a.version.localeCompare(b.version));

        return migrationFiles;
    }

    /**
     * Get applied migrations
     * @private
     */
    async _getAppliedMigrations() {
        try {
            const result = await this.connection.query(
                `SELECT version FROM ${this.migrationsTable} ORDER BY version`
            );
            return result.rows.map(row => row.version);
        } catch (error) {
            // Table might not exist yet
            return [];
        }
    }

    /**
     * Apply a single migration
     * @private
     */
    async _applyMigration(migration) {
        const sql = await fs.readFile(migration.filepath, 'utf8');
        const checksum = crypto.createHash('sha256').update(sql).digest('hex');

        await this.connection.transaction(async (client) => {
            // Execute migration SQL
            await client.query(sql);
            
            // Record migration
            await client.query(
                `INSERT INTO ${this.migrationsTable} (version, description, checksum) 
                 VALUES ($1, $2, $3)`,
                [migration.version, migration.description, checksum]
            );
        });
    }

    /**
     * Create a new migration file
     * @param {string} description - Migration description
     * @returns {Promise<string>} Created file path
     */
    async createMigration(description) {
        const timestamp = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];
        const version = timestamp.substring(0, 14); // YYYYMMDDHHMMSS
        const filename = `${version}_${description.toLowerCase().replace(/\s+/g, '_')}.sql`;
        const filepath = path.join(this.migrationsDir, filename);

        const template = `-- Migration: ${filename}
-- Description: ${description}
-- Created: ${new Date().toISOString().split('T')[0]}
-- Version: ${version}

-- Add your migration SQL here

-- Example:
-- CREATE TABLE example (
--     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--     name VARCHAR(255) NOT NULL,
--     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
-- );

-- Don't forget to add appropriate indexes and constraints
`;

        await fs.writeFile(filepath, template);
        log('info', `Created migration file: ${filename}`);
        
        return filepath;
    }
}

/**
 * Run migrations from command line
 */
export async function runMigrationsFromCLI() {
    try {
        const connection = getConnection();
        await connection.initialize();
        
        const runner = new MigrationRunner(connection);
        await runner.runMigrations();
        
        await connection.shutdown();
        process.exit(0);
    } catch (error) {
        log('error', `Migration failed: ${error.message}`);
        process.exit(1);
    }
}

export default MigrationRunner;

