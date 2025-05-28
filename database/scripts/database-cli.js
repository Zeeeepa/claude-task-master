#!/usr/bin/env node

/**
 * Database CLI Tool
 * Claude Task Master AI-Driven CI/CD System
 * 
 * Command-line interface for database management operations
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { 
    initializeDatabase, 
    healthCheck, 
    getDatabaseStats, 
    backupDatabase,
    closeConnection,
    getDatabaseConfig 
} from '../config/database.js';
import { 
    runMigrations, 
    getMigrationStatus, 
    validateMigrations,
    createMigration,
    rollbackLastMigration 
} from '../migrations/migration-runner.js';
import { migrateJSONToPostgreSQL } from './migrate-json-to-postgres.js';

const program = new Command();

program
    .name('database-cli')
    .description('Database management CLI for Claude Task Master')
    .version('1.0.0');

// Health check command
program
    .command('health')
    .description('Check database health and connection status')
    .action(async () => {
        const spinner = ora('Checking database health...').start();
        
        try {
            const health = await healthCheck();
            spinner.stop();
            
            if (health.status === 'healthy') {
                console.log(chalk.green('✅ Database is healthy'));
                console.log(chalk.cyan(`Mode: ${health.mode}`));
                
                if (health.mode === 'postgres') {
                    console.log(chalk.cyan(`Response time: ${health.responseTime}ms`));
                    console.log(chalk.cyan(`Pool size: ${health.poolSize}`));
                    console.log(chalk.cyan(`Idle connections: ${health.idleConnections}`));
                    console.log(chalk.cyan(`Waiting clients: ${health.waitingClients}`));
                } else {
                    console.log(chalk.cyan(`Tasks file: ${health.tasksFile}`));
                }
            } else {
                console.log(chalk.red('❌ Database health check failed'));
                console.log(chalk.red(`Error: ${health.message}`));
                process.exit(1);
            }
        } catch (error) {
            spinner.stop();
            console.error(chalk.red('❌ Health check failed:'), error.message);
            process.exit(1);
        }
    });

// Statistics command
program
    .command('stats')
    .description('Display database statistics')
    .action(async () => {
        const spinner = ora('Gathering database statistics...').start();
        
        try {
            const stats = await getDatabaseStats();
            spinner.stop();
            
            console.log(chalk.blue('📊 Database Statistics'));
            console.log(chalk.cyan(`Mode: ${stats.mode}`));
            
            if (stats.mode === 'postgres' && stats.tables) {
                console.log('\n📋 Table Statistics:');
                stats.tables.forEach(table => {
                    console.log(chalk.white(`  ${table.tablename}:`));
                    console.log(chalk.gray(`    Inserts: ${table.inserts}`));
                    console.log(chalk.gray(`    Updates: ${table.updates}`));
                    console.log(chalk.gray(`    Deletes: ${table.deletes}`));
                    console.log(chalk.gray(`    Live tuples: ${table.live_tuples}`));
                    console.log(chalk.gray(`    Dead tuples: ${table.dead_tuples}`));
                });
            } else if (stats.mode === 'local') {
                console.log(chalk.cyan(`File size: ${stats.fileSize} bytes`));
                console.log(chalk.cyan(`Last modified: ${stats.lastModified}`));
                console.log(chalk.cyan(`Task count: ${stats.taskCount}`));
            }
            
            if (stats.error) {
                console.log(chalk.red(`Error: ${stats.error}`));
            }
        } catch (error) {
            spinner.stop();
            console.error(chalk.red('❌ Failed to get statistics:'), error.message);
            process.exit(1);
        }
    });

// Backup command
program
    .command('backup')
    .description('Create a database backup')
    .action(async () => {
        const spinner = ora('Creating database backup...').start();
        
        try {
            const result = await backupDatabase();
            spinner.stop();
            
            if (result.success) {
                console.log(chalk.green('✅ Backup created successfully'));
                console.log(chalk.cyan(`File: ${result.file}`));
            } else {
                console.log(chalk.red('❌ Backup failed'));
                console.log(chalk.red(`Error: ${result.error}`));
                process.exit(1);
            }
        } catch (error) {
            spinner.stop();
            console.error(chalk.red('❌ Backup failed:'), error.message);
            process.exit(1);
        }
    });

// Migration commands
const migrationCmd = program
    .command('migration')
    .description('Database migration management');

migrationCmd
    .command('status')
    .description('Show migration status')
    .action(async () => {
        const spinner = ora('Checking migration status...').start();
        
        try {
            const status = await getMigrationStatus();
            spinner.stop();
            
            console.log(chalk.blue('📋 Migration Status'));
            console.log(chalk.cyan(`Mode: ${status.mode}`));
            
            if (status.mode === 'postgres') {
                console.log(chalk.cyan(`Total migrations: ${status.totalMigrations}`));
                console.log(chalk.cyan(`Applied migrations: ${status.appliedMigrations}`));
                console.log(chalk.cyan(`Pending migrations: ${status.pendingMigrations}`));
                
                if (status.status && status.status.length > 0) {
                    console.log('\n📄 Migration Details:');
                    status.status.forEach(migration => {
                        const icon = migration.applied ? '✅' : '⏳';
                        const appliedText = migration.applied 
                            ? chalk.green(`Applied: ${migration.appliedAt}`)
                            : chalk.yellow('Pending');
                        
                        console.log(`  ${icon} ${migration.version}: ${migration.name}`);
                        console.log(`     ${appliedText}`);
                        if (migration.executionTime) {
                            console.log(chalk.gray(`     Execution time: ${migration.executionTime}ms`));
                        }
                    });
                }
            } else {
                console.log(chalk.yellow(status.message));
            }
            
            if (status.error) {
                console.log(chalk.red(`Error: ${status.error}`));
            }
        } catch (error) {
            spinner.stop();
            console.error(chalk.red('❌ Failed to get migration status:'), error.message);
            process.exit(1);
        }
    });

migrationCmd
    .command('run')
    .description('Run pending migrations')
    .action(async () => {
        const spinner = ora('Running migrations...').start();
        
        try {
            const result = await runMigrations();
            spinner.stop();
            
            if (result.success) {
                console.log(chalk.green('✅ Migrations completed successfully'));
                if (result.appliedCount > 0) {
                    console.log(chalk.cyan(`Applied ${result.appliedCount} migration(s)`));
                } else {
                    console.log(chalk.cyan(result.message));
                }
            } else {
                console.log(chalk.red('❌ Migration failed'));
                console.log(chalk.red(`Error: ${result.error}`));
                process.exit(1);
            }
        } catch (error) {
            spinner.stop();
            console.error(chalk.red('❌ Migration failed:'), error.message);
            process.exit(1);
        }
    });

migrationCmd
    .command('validate')
    .description('Validate migration integrity')
    .action(async () => {
        const spinner = ora('Validating migrations...').start();
        
        try {
            const result = await validateMigrations();
            spinner.stop();
            
            if (result.valid) {
                console.log(chalk.green('✅ All migrations are valid'));
            } else {
                console.log(chalk.red('❌ Migration validation failed'));
                if (result.issues) {
                    console.log('\n🚨 Issues found:');
                    result.issues.forEach(issue => {
                        console.log(chalk.red(`  - ${issue.type}: ${issue.message}`));
                    });
                }
                process.exit(1);
            }
            
            if (result.error) {
                console.log(chalk.red(`Error: ${result.error}`));
                process.exit(1);
            }
        } catch (error) {
            spinner.stop();
            console.error(chalk.red('❌ Validation failed:'), error.message);
            process.exit(1);
        }
    });

migrationCmd
    .command('create <name>')
    .description('Create a new migration file')
    .action(async (name) => {
        const spinner = ora('Creating migration file...').start();
        
        try {
            const result = await createMigration(name);
            spinner.stop();
            
            if (result.success) {
                console.log(chalk.green('✅ Migration file created'));
                console.log(chalk.cyan(`Version: ${result.version}`));
                console.log(chalk.cyan(`File: ${result.filename}`));
                console.log(chalk.cyan(`Path: ${result.path}`));
            } else {
                console.log(chalk.red('❌ Failed to create migration'));
                console.log(chalk.red(`Error: ${result.error}`));
                process.exit(1);
            }
        } catch (error) {
            spinner.stop();
            console.error(chalk.red('❌ Migration creation failed:'), error.message);
            process.exit(1);
        }
    });

migrationCmd
    .command('rollback')
    .description('Rollback the last migration (DANGEROUS)')
    .option('--confirm', 'Confirm the rollback operation')
    .action(async (options) => {
        if (!options.confirm) {
            console.log(chalk.red('⚠️ This is a dangerous operation that may result in data loss!'));
            console.log(chalk.yellow('Use --confirm flag to proceed with rollback'));
            process.exit(1);
        }
        
        const spinner = ora('Rolling back last migration...').start();
        
        try {
            const result = await rollbackLastMigration();
            spinner.stop();
            
            if (result.success) {
                console.log(chalk.green('✅ Rollback completed'));
                console.log(chalk.cyan(`Rolled back version: ${result.rolledBackVersion}`));
                if (result.warning) {
                    console.log(chalk.yellow(`⚠️ Warning: ${result.warning}`));
                }
            } else {
                console.log(chalk.red('❌ Rollback failed'));
                console.log(chalk.red(`Error: ${result.error || result.message}`));
                process.exit(1);
            }
        } catch (error) {
            spinner.stop();
            console.error(chalk.red('❌ Rollback failed:'), error.message);
            process.exit(1);
        }
    });

// JSON migration command
program
    .command('migrate-json')
    .description('Migrate data from JSON file to PostgreSQL')
    .option('-f, --file <path>', 'Path to tasks.json file', 'tasks/tasks.json')
    .option('--dry-run', 'Perform a dry run without actual migration')
    .option('--no-backup', 'Skip creating backup before migration')
    .option('--no-validate', 'Skip validation after migration')
    .action(async (options) => {
        const { mode } = getDatabaseConfig();
        
        if (mode !== 'postgres') {
            console.log(chalk.red('❌ JSON migration requires PostgreSQL mode'));
            console.log(chalk.yellow('Set DATABASE_MODE=postgres in your environment'));
            process.exit(1);
        }
        
        const action = options.dryRun ? 'Analyzing' : 'Migrating';
        const spinner = ora(`${action} JSON data to PostgreSQL...`).start();
        
        try {
            const result = await migrateJSONToPostgreSQL({
                tasksFile: options.file,
                createBackupFirst: !options.noBackup,
                validateAfter: !options.noValidate,
                dryRun: options.dryRun
            });
            
            spinner.stop();
            
            if (result.success) {
                if (options.dryRun) {
                    console.log(chalk.green('✅ Dry run completed'));
                    console.log(chalk.cyan(result.message));
                } else {
                    console.log(chalk.green('✅ Migration completed successfully'));
                    if (result.stats) {
                        console.log(chalk.cyan(`Tasks migrated: ${result.stats.migratedTasks}`));
                        console.log(chalk.cyan(`Dependencies migrated: ${result.stats.migratedDependencies}`));
                        console.log(chalk.cyan(`Errors: ${result.stats.errors.length}`));
                    }
                }
            } else {
                console.log(chalk.red('❌ Migration failed'));
                console.log(chalk.red(`Error: ${result.error}`));
                process.exit(1);
            }
        } catch (error) {
            spinner.stop();
            console.error(chalk.red('❌ Migration failed:'), error.message);
            process.exit(1);
        }
    });

// Initialize command
program
    .command('init')
    .description('Initialize database connection and schema')
    .action(async () => {
        const spinner = ora('Initializing database...').start();
        
        try {
            await initializeDatabase();
            spinner.stop();
            console.log(chalk.green('✅ Database initialized successfully'));
            
            // Run migrations if in PostgreSQL mode
            const { mode } = getDatabaseConfig();
            if (mode === 'postgres') {
                console.log(chalk.blue('🔄 Running migrations...'));
                const migrationResult = await runMigrations();
                if (migrationResult.success) {
                    console.log(chalk.green('✅ Migrations completed'));
                } else {
                    console.log(chalk.yellow('⚠️ Migration issues detected'));
                }
            }
        } catch (error) {
            spinner.stop();
            console.error(chalk.red('❌ Initialization failed:'), error.message);
            process.exit(1);
        }
    });

// Config command
program
    .command('config')
    .description('Display current database configuration')
    .action(() => {
        const config = getDatabaseConfig();
        
        console.log(chalk.blue('⚙️ Database Configuration'));
        console.log(chalk.cyan(`Mode: ${config.mode}`));
        
        if (config.mode === 'postgres') {
            console.log(chalk.cyan(`Host: ${config.config.host}`));
            console.log(chalk.cyan(`Port: ${config.config.port}`));
            console.log(chalk.cyan(`Database: ${config.config.database}`));
            console.log(chalk.cyan(`User: ${config.config.user}`));
            console.log(chalk.cyan(`SSL: ${config.config.ssl ? 'enabled' : 'disabled'}`));
            console.log(chalk.cyan(`Cloudflare Proxy: ${config.config.cloudflare.enabled ? 'enabled' : 'disabled'}`));
            console.log(chalk.cyan(`Pool Min: ${config.config.pool.min}`));
            console.log(chalk.cyan(`Pool Max: ${config.config.pool.max}`));
        } else {
            console.log(chalk.cyan(`Tasks File: ${config.config.tasksFile}`));
            console.log(chalk.cyan(`Backup Dir: ${config.config.backupDir}`));
        }
    });

// Error handling
program.on('command:*', () => {
    console.error(chalk.red('❌ Invalid command: %s'), program.args.join(' '));
    console.log(chalk.yellow('See --help for a list of available commands.'));
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log(chalk.yellow('\n🔌 Closing database connections...'));
    await closeConnection();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log(chalk.yellow('\n🔌 Closing database connections...'));
    await closeConnection();
    process.exit(0);
});

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
    program.outputHelp();
}

