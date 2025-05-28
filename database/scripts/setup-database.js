#!/usr/bin/env node

/**
 * Database Setup Script
 * Claude Task Master AI-Driven CI/CD System
 * 
 * Complete database setup and initialization script
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { 
    initializeDatabase, 
    healthCheck, 
    getDatabaseConfig,
    closeConnection 
} from '../config/database.js';
import { runMigrations, getMigrationStatus } from '../migrations/migration-runner.js';
import { migrateJSONToPostgreSQL } from './migrate-json-to-postgres.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Display welcome banner
 */
function displayBanner() {
    console.log(chalk.blue.bold('\n🗄️ Claude Task Master Database Setup'));
    console.log(chalk.gray('AI-Driven CI/CD Task Orchestration Database\n'));
}

/**
 * Check prerequisites
 */
async function checkPrerequisites() {
    const spinner = ora('Checking prerequisites...').start();
    const issues = [];

    try {
        // Check Node.js version
        const nodeVersion = process.version;
        const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
        if (majorVersion < 18) {
            issues.push(`Node.js 18+ required (current: ${nodeVersion})`);
        }

        // Check if .env file exists
        try {
            await fs.access('.env');
        } catch (error) {
            issues.push('No .env file found. Copy .env.database.example to .env and configure');
        }

        // Check database configuration
        const config = getDatabaseConfig();
        if (config.mode === 'postgres') {
            // Check if pg module is available
            try {
                await import('pg');
            } catch (error) {
                issues.push('PostgreSQL driver (pg) not installed. Run: npm install pg');
            }
        }

        spinner.stop();

        if (issues.length > 0) {
            console.log(chalk.red('❌ Prerequisites check failed:'));
            issues.forEach(issue => console.log(chalk.red(`  - ${issue}`)));
            return false;
        }

        console.log(chalk.green('✅ Prerequisites check passed'));
        return true;
    } catch (error) {
        spinner.stop();
        console.error(chalk.red('❌ Prerequisites check failed:'), error.message);
        return false;
    }
}

/**
 * Setup database configuration
 */
async function setupConfiguration() {
    console.log(chalk.blue('\n📋 Database Configuration'));
    
    const config = getDatabaseConfig();
    console.log(chalk.cyan(`Current mode: ${config.mode}`));

    if (config.mode === 'postgres') {
        console.log(chalk.cyan(`Host: ${config.config.host}`));
        console.log(chalk.cyan(`Port: ${config.config.port}`));
        console.log(chalk.cyan(`Database: ${config.config.database}`));
        console.log(chalk.cyan(`User: ${config.config.user}`));
    } else {
        console.log(chalk.cyan(`Tasks file: ${config.config.tasksFile}`));
    }

    const { confirmConfig } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'confirmConfig',
            message: 'Is this configuration correct?',
            default: true
        }
    ]);

    if (!confirmConfig) {
        console.log(chalk.yellow('Please update your .env file and run the setup again.'));
        return false;
    }

    return true;
}

/**
 * Initialize database connection
 */
async function initializeConnection() {
    const spinner = ora('Initializing database connection...').start();

    try {
        await initializeDatabase();
        spinner.stop();
        console.log(chalk.green('✅ Database connection initialized'));
        return true;
    } catch (error) {
        spinner.stop();
        console.error(chalk.red('❌ Database initialization failed:'), error.message);
        
        const config = getDatabaseConfig();
        if (config.mode === 'postgres') {
            console.log(chalk.yellow('\n💡 Troubleshooting tips:'));
            console.log(chalk.yellow('  - Ensure PostgreSQL is running'));
            console.log(chalk.yellow('  - Check connection parameters in .env'));
            console.log(chalk.yellow('  - Verify database exists and user has permissions'));
            console.log(chalk.yellow('  - Check firewall settings'));
        }
        
        return false;
    }
}

/**
 * Run database health check
 */
async function performHealthCheck() {
    const spinner = ora('Performing health check...').start();

    try {
        const health = await healthCheck();
        spinner.stop();

        if (health.status === 'healthy') {
            console.log(chalk.green('✅ Database health check passed'));
            
            if (health.mode === 'postgres') {
                console.log(chalk.cyan(`  Response time: ${health.responseTime}ms`));
                console.log(chalk.cyan(`  Pool size: ${health.poolSize}`));
            }
            return true;
        } else {
            console.log(chalk.red('❌ Database health check failed'));
            console.log(chalk.red(`  Error: ${health.message}`));
            return false;
        }
    } catch (error) {
        spinner.stop();
        console.error(chalk.red('❌ Health check failed:'), error.message);
        return false;
    }
}

/**
 * Setup database schema
 */
async function setupSchema() {
    const config = getDatabaseConfig();
    
    if (config.mode !== 'postgres') {
        console.log(chalk.yellow('📄 Local mode - no schema setup needed'));
        return true;
    }

    console.log(chalk.blue('\n🏗️ Database Schema Setup'));

    // Check migration status
    const spinner = ora('Checking migration status...').start();
    try {
        const status = await getMigrationStatus();
        spinner.stop();

        console.log(chalk.cyan(`Total migrations: ${status.totalMigrations}`));
        console.log(chalk.cyan(`Applied migrations: ${status.appliedMigrations}`));
        console.log(chalk.cyan(`Pending migrations: ${status.pendingMigrations}`));

        if (status.pendingMigrations > 0) {
            const { runMigrationsNow } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'runMigrationsNow',
                    message: `Run ${status.pendingMigrations} pending migration(s)?`,
                    default: true
                }
            ]);

            if (runMigrationsNow) {
                const migrationSpinner = ora('Running migrations...').start();
                try {
                    const result = await runMigrations();
                    migrationSpinner.stop();

                    if (result.success) {
                        console.log(chalk.green('✅ Migrations completed successfully'));
                        if (result.appliedCount > 0) {
                            console.log(chalk.cyan(`  Applied ${result.appliedCount} migration(s)`));
                        }
                    } else {
                        console.log(chalk.red('❌ Migration failed'));
                        console.log(chalk.red(`  Error: ${result.error}`));
                        return false;
                    }
                } catch (error) {
                    migrationSpinner.stop();
                    console.error(chalk.red('❌ Migration failed:'), error.message);
                    return false;
                }
            }
        } else {
            console.log(chalk.green('✅ Database schema is up to date'));
        }

        return true;
    } catch (error) {
        spinner.stop();
        console.error(chalk.red('❌ Migration status check failed:'), error.message);
        return false;
    }
}

/**
 * Migrate existing JSON data
 */
async function migrateExistingData() {
    const config = getDatabaseConfig();
    
    if (config.mode !== 'postgres') {
        return true; // No migration needed for local mode
    }

    // Check if tasks.json exists
    try {
        await fs.access('tasks/tasks.json');
    } catch (error) {
        console.log(chalk.yellow('📄 No existing tasks.json found - skipping data migration'));
        return true;
    }

    console.log(chalk.blue('\n📦 Data Migration'));
    console.log(chalk.yellow('Found existing tasks.json file'));

    const { migrateData } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'migrateData',
            message: 'Migrate existing JSON data to PostgreSQL?',
            default: true
        }
    ]);

    if (!migrateData) {
        console.log(chalk.yellow('⏭️ Skipping data migration'));
        return true;
    }

    const spinner = ora('Migrating JSON data to PostgreSQL...').start();
    try {
        const result = await migrateJSONToPostgreSQL({
            tasksFile: 'tasks/tasks.json',
            createBackupFirst: true,
            validateAfter: true,
            dryRun: false
        });

        spinner.stop();

        if (result.success) {
            console.log(chalk.green('✅ Data migration completed successfully'));
            if (result.stats) {
                console.log(chalk.cyan(`  Tasks migrated: ${result.stats.migratedTasks}`));
                console.log(chalk.cyan(`  Dependencies migrated: ${result.stats.migratedDependencies}`));
                if (result.stats.errors.length > 0) {
                    console.log(chalk.yellow(`  Errors: ${result.stats.errors.length}`));
                }
            }
        } else {
            console.log(chalk.red('❌ Data migration failed'));
            console.log(chalk.red(`  Error: ${result.error}`));
            return false;
        }

        return true;
    } catch (error) {
        spinner.stop();
        console.error(chalk.red('❌ Data migration failed:'), error.message);
        return false;
    }
}

/**
 * Load sample data
 */
async function loadSampleData() {
    const config = getDatabaseConfig();
    
    if (config.mode !== 'postgres') {
        return true; // No sample data for local mode
    }

    console.log(chalk.blue('\n🎯 Sample Data'));

    const { loadSamples } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'loadSamples',
            message: 'Load sample data for development and testing?',
            default: false
        }
    ]);

    if (!loadSamples) {
        console.log(chalk.yellow('⏭️ Skipping sample data'));
        return true;
    }

    const spinner = ora('Loading sample data...').start();
    try {
        // Import and execute sample data SQL
        const { query } = await import('../config/database.js');
        const sampleDataPath = path.join(__dirname, '../seeds/001_sample_data.sql');
        const sampleDataSQL = await fs.readFile(sampleDataPath, 'utf8');
        
        await query(sampleDataSQL);
        
        spinner.stop();
        console.log(chalk.green('✅ Sample data loaded successfully'));
        return true;
    } catch (error) {
        spinner.stop();
        console.error(chalk.red('❌ Failed to load sample data:'), error.message);
        return false;
    }
}

/**
 * Display setup summary
 */
async function displaySummary() {
    console.log(chalk.blue('\n📊 Setup Summary'));
    
    const config = getDatabaseConfig();
    const health = await healthCheck();
    
    console.log(chalk.green('✅ Database setup completed successfully!'));
    console.log(chalk.cyan(`Mode: ${config.mode}`));
    console.log(chalk.cyan(`Status: ${health.status}`));
    
    if (config.mode === 'postgres') {
        const status = await getMigrationStatus();
        console.log(chalk.cyan(`Migrations applied: ${status.appliedMigrations}/${status.totalMigrations}`));
    }

    console.log(chalk.blue('\n🚀 Next Steps:'));
    console.log(chalk.white('  1. Start using the task management system'));
    console.log(chalk.white('  2. Run tests: npm test'));
    console.log(chalk.white('  3. Check database health: node database/scripts/database-cli.js health'));
    console.log(chalk.white('  4. View documentation: database/README.md'));
    
    if (config.mode === 'postgres') {
        console.log(chalk.white('  5. Monitor performance and optimize as needed'));
        console.log(chalk.white('  6. Set up regular backups'));
    }
}

/**
 * Main setup function
 */
async function main() {
    try {
        displayBanner();

        // Step 1: Check prerequisites
        const prereqsOk = await checkPrerequisites();
        if (!prereqsOk) {
            process.exit(1);
        }

        // Step 2: Confirm configuration
        const configOk = await setupConfiguration();
        if (!configOk) {
            process.exit(1);
        }

        // Step 3: Initialize connection
        const connectionOk = await initializeConnection();
        if (!connectionOk) {
            process.exit(1);
        }

        // Step 4: Health check
        const healthOk = await performHealthCheck();
        if (!healthOk) {
            process.exit(1);
        }

        // Step 5: Setup schema
        const schemaOk = await setupSchema();
        if (!schemaOk) {
            process.exit(1);
        }

        // Step 6: Migrate existing data
        const migrationOk = await migrateExistingData();
        if (!migrationOk) {
            process.exit(1);
        }

        // Step 7: Load sample data (optional)
        const sampleDataOk = await loadSampleData();
        if (!sampleDataOk) {
            console.log(chalk.yellow('⚠️ Sample data loading failed, but setup can continue'));
        }

        // Step 8: Display summary
        await displaySummary();

    } catch (error) {
        console.error(chalk.red('\n❌ Setup failed:'), error.message);
        process.exit(1);
    } finally {
        await closeConnection();
    }
}

// Handle graceful shutdown
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

// Run setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error(chalk.red('❌ Setup script failed:'), error);
        process.exit(1);
    });
}

export { main as setupDatabase };

