/**
 * @fileoverview Enhanced Migration Runner
 * @description Production-ready database migration runner with enhanced CI/CD schema support
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getConnection, initializeDatabase } from '../connection.js';
import { log } from '../../../scripts/modules/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Enhanced Migration Runner for CI/CD schema
 */
export class MigrationRunner {
    constructor() {
        this.migrationsDir = __dirname;
        this.db = null;
    }

    /**
     * Initialize the migration runner
     */
    async initialize() {
        try {
            this.db = await initializeDatabase();
            log('info', 'Migration runner initialized successfully');
        } catch (error) {
            log('error', `Failed to initialize migration runner: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get all migration files
     * @returns {Array} Array of migration files
     */
    getMigrationFiles() {
        const files = fs.readdirSync(this.migrationsDir)
            .filter(file => file.endsWith('.sql') && file.match(/^\d{3}_/))
            .sort();
        
        return files.map(file => ({
            version: file.substring(0, 3),
            filename: file,
            path: path.join(this.migrationsDir, file)
        }));
    }

    /**
     * Get applied migrations from database
     * @returns {Array} Array of applied migration versions
     */
    async getAppliedMigrations() {
        try {
            const result = await this.db.query(
                'SELECT version FROM schema_migrations ORDER BY version'
            );
            return result.rows.map(row => row.version);
        } catch (error) {
            // If table doesn't exist, no migrations have been applied
            if (error.code === '42P01') {
                return [];
            }
            throw error;
        }
    }

    /**
     * Run a single migration
     * @param {Object} migration - Migration object
     */
    async runMigration(migration) {
        log('info', `Running migration ${migration.version}: ${migration.filename}`);
        
        try {
            const sql = fs.readFileSync(migration.path, 'utf8');
            
            // Execute migration in a transaction
            await this.db.transaction(async (client) => {
                await client.query(sql);
                log('info', `Migration ${migration.version} completed successfully`);
            });
            
        } catch (error) {
            log('error', `Migration ${migration.version} failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Run all pending migrations
     */
    async runPendingMigrations() {
        const allMigrations = this.getMigrationFiles();
        const appliedMigrations = await this.getAppliedMigrations();
        
        const pendingMigrations = allMigrations.filter(
            migration => !appliedMigrations.includes(migration.version)
        );
        
        if (pendingMigrations.length === 0) {
            log('info', 'No pending migrations to run');
            return;
        }
        
        log('info', `Found ${pendingMigrations.length} pending migrations`);
        
        for (const migration of pendingMigrations) {
            await this.runMigration(migration);
        }
        
        log('info', 'All pending migrations completed successfully');
    }

    /**
     * Validate database schema
     */
    async validateSchema() {
        log('info', 'Validating database schema...');
        
        const requiredTables = [
            'tasks',
            'task_contexts', 
            'workflow_states',
            'audit_logs',
            'task_dependencies',
            'performance_metrics',
            'schema_migrations',
            'deployments',
            'validation_results',
            'prompt_templates',
            'deployment_scripts',
            'system_logs'
        ];
        
        const requiredViews = [
            'active_tasks',
            'task_summary',
            'recent_activity',
            'active_deployments',
            'deployment_summary',
            'system_health',
            'task_deployment_status'
        ];
        
        const requiredFunctions = [
            'update_updated_at_column',
            'audit_trigger_function',
            'update_deployment_status',
            'log_system_event'
        ];
        
        // Check tables
        for (const table of requiredTables) {
            const result = await this.db.query(
                `SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = $1
                )`,
                [table]
            );
            
            if (!result.rows[0].exists) {
                throw new Error(`Required table '${table}' is missing`);
            }
        }
        
        // Check views
        for (const view of requiredViews) {
            const result = await this.db.query(
                `SELECT EXISTS (
                    SELECT FROM information_schema.views 
                    WHERE table_schema = 'public' 
                    AND table_name = $1
                )`,
                [view]
            );
            
            if (!result.rows[0].exists) {
                throw new Error(`Required view '${view}' is missing`);
            }
        }
        
        // Check functions
        for (const func of requiredFunctions) {
            const result = await this.db.query(
                `SELECT EXISTS (
                    SELECT FROM information_schema.routines 
                    WHERE routine_schema = 'public' 
                    AND routine_name = $1
                )`,
                [func]
            );
            
            if (!result.rows[0].exists) {
                throw new Error(`Required function '${func}' is missing`);
            }
        }
        
        log('info', 'Database schema validation completed successfully');
    }

    /**
     * Get migration status
     */
    async getStatus() {
        const allMigrations = this.getMigrationFiles();
        const appliedMigrations = await this.getAppliedMigrations();
        
        const status = {
            total: allMigrations.length,
            applied: appliedMigrations.length,
            pending: allMigrations.length - appliedMigrations.length,
            migrations: allMigrations.map(migration => ({
                ...migration,
                applied: appliedMigrations.includes(migration.version)
            }))
        };
        
        return status;
    }

    /**
     * Shutdown the migration runner
     */
    async shutdown() {
        if (this.db) {
            await this.db.shutdown();
            log('info', 'Migration runner shutdown completed');
        }
    }
}

/**
 * CLI interface for migration runner
 */
async function runCLI() {
    const command = process.argv[2] || 'migrate';
    const runner = new MigrationRunner();
    
    try {
        await runner.initialize();
        
        switch (command) {
            case 'migrate':
                await runner.runPendingMigrations();
                await runner.validateSchema();
                break;
                
            case 'status':
                const status = await runner.getStatus();
                console.log('Migration Status:');
                console.log(`Total: ${status.total}`);
                console.log(`Applied: ${status.applied}`);
                console.log(`Pending: ${status.pending}`);
                console.log('\nMigrations:');
                status.migrations.forEach(migration => {
                    const status = migration.applied ? '✓' : '✗';
                    console.log(`  ${status} ${migration.version} - ${migration.filename}`);
                });
                break;
                
            case 'validate':
                await runner.validateSchema();
                console.log('Schema validation passed');
                break;
                
            default:
                console.log('Usage: node runner.js [migrate|status|validate]');
                process.exit(1);
        }
        
    } catch (error) {
        log('error', `Migration failed: ${error.message}`);
        console.error('Migration failed:', error.message);
        process.exit(1);
    } finally {
        await runner.shutdown();
    }
}

// Run CLI if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runCLI();
}

export default MigrationRunner;
