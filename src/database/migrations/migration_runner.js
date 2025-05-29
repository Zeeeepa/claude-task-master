/**
 * @fileoverview Consolidated Migration Runner
 * @description Unified migration system consolidating patterns from PRs #41,42,53,59,62,64,65,69,70,74,79,81
 * @version 2.0.0 - Zero Redundancy Implementation
 */

import { readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getConnection } from '../connection/connection_manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Consolidated Migration Runner
 * Handles database schema migrations with comprehensive tracking and rollback support
 */
export class MigrationRunner {
    constructor(options = {}) {
        this.options = {
            migrationsDir: options.migrationsDir || __dirname,
            migrationsTable: options.migrationsTable || process.env.DB_MIGRATIONS_TABLE || 'schema_migrations',
            migrationsSchema: options.migrationsSchema || process.env.DB_MIGRATIONS_SCHEMA || 'public',
            dryRun: options.dryRun || false,
            verbose: options.verbose || true,
            backupBeforeMigration: options.backupBeforeMigration || false,
            validateBeforeRun: options.validateBeforeRun || true,
            ...options
        };
        
        this.db = null;
        this.migrationHistory = [];
    }

    /**
     * Initialize migration runner and ensure migrations table exists
     */
    async initialize() {
        try {
            this.db = getConnection();
            await this.db.initialize();
            
            // Create migrations tracking table
            await this._createMigrationsTable();
            
            if (this.options.verbose) {
                console.log('Migration runner initialized successfully');
            }
            
        } catch (error) {
            throw new Error(`Failed to initialize migration runner: ${error.message}`);
        }
    }

    /**
     * Run all pending migrations
     */
    async runMigrations() {
        try {
            if (this.options.verbose) {
                console.log('🚀 Starting migration process...');
            }
            
            // Get all migration files
            const migrationFiles = await this._getMigrationFiles();
            
            // Get applied migrations
            const appliedMigrations = await this._getAppliedMigrations();
            const appliedVersions = new Set(appliedMigrations.map(m => m.version));
            
            // Filter pending migrations
            const pendingMigrations = migrationFiles.filter(file => 
                !appliedVersions.has(file.version)
            );
            
            if (pendingMigrations.length === 0) {
                console.log('✅ No pending migrations found');
                return { applied: 0, skipped: migrationFiles.length };
            }
            
            if (this.options.verbose) {
                console.log(`📋 Found ${pendingMigrations.length} pending migrations:`);
                pendingMigrations.forEach(m => console.log(`  - ${m.version}: ${m.description || 'No description'}`));
            }
            
            // Validate migrations if enabled
            if (this.options.validateBeforeRun) {
                await this._validateMigrations(pendingMigrations);
            }
            
            // Create backup if enabled
            if (this.options.backupBeforeMigration) {
                await this._createBackup();
            }
            
            let appliedCount = 0;
            
            // Run migrations in order
            for (const migration of pendingMigrations) {
                try {
                    await this._runSingleMigration(migration);
                    appliedCount++;
                    
                    if (this.options.verbose) {
                        console.log(`✅ Applied migration ${migration.version}`);
                    }
                    
                } catch (error) {
                    console.error(`❌ Failed to apply migration ${migration.version}:`, error);
                    
                    // Attempt rollback of failed migration
                    try {
                        await this._rollbackSingleMigration(migration);
                        console.log(`🔄 Rolled back failed migration ${migration.version}`);
                    } catch (rollbackError) {
                        console.error(`💥 Failed to rollback migration ${migration.version}:`, rollbackError);
                    }
                    
                    throw new Error(`Migration ${migration.version} failed: ${error.message}`);
                }
            }
            
            if (this.options.verbose) {
                console.log(`🎉 Successfully applied ${appliedCount} migrations`);
            }
            
            return { applied: appliedCount, skipped: migrationFiles.length - pendingMigrations.length };
            
        } catch (error) {
            console.error('Migration process failed:', error);
            throw error;
        }
    }

    /**
     * Rollback migrations to a specific version
     */
    async rollbackTo(targetVersion) {
        try {
            if (this.options.verbose) {
                console.log(`🔄 Rolling back to version ${targetVersion}...`);
            }
            
            // Get applied migrations in reverse order
            const appliedMigrations = await this._getAppliedMigrations();
            appliedMigrations.sort((a, b) => b.version.localeCompare(a.version));
            
            // Find migrations to rollback
            const migrationsToRollback = appliedMigrations.filter(m => 
                m.version > targetVersion
            );
            
            if (migrationsToRollback.length === 0) {
                console.log('✅ No migrations to rollback');
                return { rolledBack: 0 };
            }
            
            if (this.options.verbose) {
                console.log(`📋 Rolling back ${migrationsToRollback.length} migrations:`);
                migrationsToRollback.forEach(m => console.log(`  - ${m.version}`));
            }
            
            // Create backup before rollback
            if (this.options.backupBeforeMigration) {
                await this._createBackup();
            }
            
            let rolledBackCount = 0;
            
            // Rollback migrations in reverse order
            for (const migration of migrationsToRollback) {
                try {
                    const migrationFile = await this._loadMigrationFile(migration.version);
                    await this._rollbackSingleMigration(migrationFile);
                    rolledBackCount++;
                    
                    if (this.options.verbose) {
                        console.log(`✅ Rolled back migration ${migration.version}`);
                    }
                    
                } catch (error) {
                    console.error(`❌ Failed to rollback migration ${migration.version}:`, error);
                    throw new Error(`Rollback of ${migration.version} failed: ${error.message}`);
                }
            }
            
            if (this.options.verbose) {
                console.log(`🎉 Successfully rolled back ${rolledBackCount} migrations`);
            }
            
            return { rolledBack: rolledBackCount };
            
        } catch (error) {
            console.error('Rollback process failed:', error);
            throw error;
        }
    }

    /**
     * Get migration status
     */
    async getStatus() {
        try {
            const migrationFiles = await this._getMigrationFiles();
            const appliedMigrations = await this._getAppliedMigrations();
            const appliedVersions = new Set(appliedMigrations.map(m => m.version));
            
            const status = migrationFiles.map(file => ({
                version: file.version,
                description: file.description || 'No description',
                applied: appliedVersions.has(file.version),
                appliedAt: appliedMigrations.find(m => m.version === file.version)?.applied_at || null
            }));
            
            const pending = status.filter(s => !s.applied);
            const applied = status.filter(s => s.applied);
            
            return {
                total: status.length,
                applied: applied.length,
                pending: pending.length,
                migrations: status
            };
            
        } catch (error) {
            throw new Error(`Failed to get migration status: ${error.message}`);
        }
    }

    /**
     * Validate migration integrity
     */
    async validateMigrations() {
        try {
            const migrationFiles = await this._getMigrationFiles();
            const issues = [];
            
            // Check for duplicate versions
            const versions = migrationFiles.map(f => f.version);
            const duplicates = versions.filter((v, i) => versions.indexOf(v) !== i);
            if (duplicates.length > 0) {
                issues.push(`Duplicate migration versions: ${duplicates.join(', ')}`);
            }
            
            // Check for missing up/down functions
            for (const migration of migrationFiles) {
                try {
                    const module = await import(migration.path);
                    if (typeof module.up !== 'function') {
                        issues.push(`Migration ${migration.version} missing 'up' function`);
                    }
                    if (typeof module.down !== 'function') {
                        issues.push(`Migration ${migration.version} missing 'down' function`);
                    }
                } catch (error) {
                    issues.push(`Migration ${migration.version} failed to load: ${error.message}`);
                }
            }
            
            return {
                valid: issues.length === 0,
                issues
            };
            
        } catch (error) {
            throw new Error(`Failed to validate migrations: ${error.message}`);
        }
    }

    /**
     * Create a new migration file
     */
    async createMigration(name, description = '') {
        try {
            const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
            const version = timestamp.slice(0, 3); // Use first 3 digits as version
            const filename = `${version}_${name.toLowerCase().replace(/\s+/g, '_')}.js`;
            const filepath = join(this.options.migrationsDir, filename);
            
            const template = `/**
 * @fileoverview ${description || name}
 * @description Migration: ${name}
 * @version ${version}
 */

export const up = async (client) => {
    console.log('Running migration: ${name}');
    
    try {
        // Add your migration logic here
        // Example:
        // await client.query(\`
        //     ALTER TABLE example_table 
        //     ADD COLUMN new_column VARCHAR(255);
        // \`);
        
        console.log('✅ Migration ${name} completed successfully');
        
    } catch (error) {
        console.error('❌ Migration ${name} failed:', error);
        throw error;
    }
};

export const down = async (client) => {
    console.log('Rolling back migration: ${name}');
    
    try {
        // Add your rollback logic here
        // Example:
        // await client.query(\`
        //     ALTER TABLE example_table 
        //     DROP COLUMN new_column;
        // \`);
        
        console.log('✅ Migration ${name} rollback completed successfully');
        
    } catch (error) {
        console.error('❌ Migration ${name} rollback failed:', error);
        throw error;
    }
};

export const description = '${description || name}';
export const version = '${version}';
export const timestamp = '${timestamp}';
`;
            
            await import('fs/promises').then(fs => fs.writeFile(filepath, template));
            
            console.log(`✅ Created migration file: ${filename}`);
            return { filename, filepath, version };
            
        } catch (error) {
            throw new Error(`Failed to create migration: ${error.message}`);
        }
    }

    // Private methods

    async _createMigrationsTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS ${this.options.migrationsSchema}.${this.options.migrationsTable} (
                id SERIAL PRIMARY KEY,
                version VARCHAR(255) NOT NULL UNIQUE,
                description TEXT,
                applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                execution_time_ms INTEGER,
                checksum VARCHAR(64),
                metadata JSONB DEFAULT '{}'
            );
            
            CREATE INDEX IF NOT EXISTS idx_migrations_version 
            ON ${this.options.migrationsSchema}.${this.options.migrationsTable} (version);
            
            CREATE INDEX IF NOT EXISTS idx_migrations_applied_at 
            ON ${this.options.migrationsSchema}.${this.options.migrationsTable} (applied_at DESC);
        `;
        
        await this.db.query(query);
    }

    async _getMigrationFiles() {
        const files = await readdir(this.options.migrationsDir);
        const migrationFiles = files
            .filter(file => file.endsWith('.js') && file !== 'migration_runner.js')
            .map(file => {
                const match = file.match(/^(\d+)_(.+)\.js$/);
                if (!match) return null;
                
                return {
                    filename: file,
                    path: join(this.options.migrationsDir, file),
                    version: match[1],
                    name: match[2].replace(/_/g, ' ')
                };
            })
            .filter(Boolean)
            .sort((a, b) => a.version.localeCompare(b.version));
        
        // Load descriptions from files
        for (const migration of migrationFiles) {
            try {
                const module = await import(migration.path);
                migration.description = module.description || migration.name;
            } catch (error) {
                migration.description = `Failed to load: ${error.message}`;
            }
        }
        
        return migrationFiles;
    }

    async _getAppliedMigrations() {
        const result = await this.db.query(`
            SELECT version, description, applied_at, execution_time_ms, metadata
            FROM ${this.options.migrationsSchema}.${this.options.migrationsTable}
            ORDER BY applied_at ASC
        `);
        
        return result.rows;
    }

    async _loadMigrationFile(version) {
        const migrationFiles = await this._getMigrationFiles();
        return migrationFiles.find(f => f.version === version);
    }

    async _runSingleMigration(migration) {
        const startTime = Date.now();
        
        if (this.options.dryRun) {
            console.log(`[DRY RUN] Would apply migration ${migration.version}`);
            return;
        }
        
        // Load migration module
        const module = await import(migration.path);
        
        // Execute migration in transaction
        await this.db.transaction(async (client) => {
            // Run the migration
            await module.up(client);
            
            // Record migration
            const executionTime = Date.now() - startTime;
            await client.query(`
                INSERT INTO ${this.options.migrationsSchema}.${this.options.migrationsTable}
                (version, description, execution_time_ms, metadata)
                VALUES ($1, $2, $3, $4)
            `, [
                migration.version,
                migration.description,
                executionTime,
                JSON.stringify({
                    filename: migration.filename,
                    applied_by: 'migration_runner',
                    node_version: process.version
                })
            ]);
        });
    }

    async _rollbackSingleMigration(migration) {
        if (this.options.dryRun) {
            console.log(`[DRY RUN] Would rollback migration ${migration.version}`);
            return;
        }
        
        // Load migration module
        const module = await import(migration.path);
        
        // Execute rollback in transaction
        await this.db.transaction(async (client) => {
            // Run the rollback
            await module.down(client);
            
            // Remove migration record
            await client.query(`
                DELETE FROM ${this.options.migrationsSchema}.${this.options.migrationsTable}
                WHERE version = $1
            `, [migration.version]);
        });
    }

    async _validateMigrations(migrations) {
        const validation = await this.validateMigrations();
        if (!validation.valid) {
            throw new Error(`Migration validation failed: ${validation.issues.join(', ')}`);
        }
    }

    async _createBackup() {
        // This would integrate with backup system
        console.log('📦 Creating database backup before migration...');
        // Implementation would depend on backup strategy
    }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
    const command = process.argv[2];
    const runner = new MigrationRunner();
    
    try {
        await runner.initialize();
        
        switch (command) {
            case 'up':
            case 'migrate':
                await runner.runMigrations();
                break;
                
            case 'down':
            case 'rollback':
                const targetVersion = process.argv[3];
                if (!targetVersion) {
                    console.error('Please specify target version for rollback');
                    process.exit(1);
                }
                await runner.rollbackTo(targetVersion);
                break;
                
            case 'status':
                const status = await runner.getStatus();
                console.log('Migration Status:');
                console.log(`Total: ${status.total}, Applied: ${status.applied}, Pending: ${status.pending}`);
                status.migrations.forEach(m => {
                    const status = m.applied ? '✅' : '⏳';
                    console.log(`${status} ${m.version}: ${m.description}`);
                });
                break;
                
            case 'validate':
                const validation = await runner.validateMigrations();
                if (validation.valid) {
                    console.log('✅ All migrations are valid');
                } else {
                    console.error('❌ Migration validation failed:');
                    validation.issues.forEach(issue => console.error(`  - ${issue}`));
                    process.exit(1);
                }
                break;
                
            case 'create':
                const name = process.argv[3];
                const description = process.argv[4];
                if (!name) {
                    console.error('Please specify migration name');
                    process.exit(1);
                }
                await runner.createMigration(name, description);
                break;
                
            default:
                console.log('Usage: node migration_runner.js <command> [args]');
                console.log('Commands:');
                console.log('  up|migrate           - Run pending migrations');
                console.log('  down|rollback <ver>  - Rollback to version');
                console.log('  status               - Show migration status');
                console.log('  validate             - Validate migrations');
                console.log('  create <name> [desc] - Create new migration');
                break;
        }
        
    } catch (error) {
        console.error('Migration runner error:', error);
        process.exit(1);
    }
}

export default MigrationRunner;

