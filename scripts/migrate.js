#!/usr/bin/env node

/**
 * @fileoverview CLI Migration Tool
 * @description Command-line interface for database migrations with comprehensive options
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { table } from 'cli-table3';
import { initializePoolManager } from '../src/ai_cicd_system/database/connection_pool.js';
import { initializeMigrationEngine } from '../src/ai_cicd_system/database/migration_engine.js';
import { initializeHealthMonitor } from '../src/ai_cicd_system/database/health_monitor.js';
import { poolConfig, configValidation } from '../config/pool_config.js';

const program = new Command();

/**
 * CLI Application
 */
class MigrationCLI {
    constructor() {
        this.poolManager = null;
        this.migrationEngine = null;
        this.healthMonitor = null;
        this.spinner = null;
    }

    /**
     * Initialize database connections
     */
    async initialize() {
        this.spinner = ora('Initializing database connections...').start();
        
        try {
            // Validate configuration
            if (!configValidation.valid) {
                throw new Error(`Configuration errors: ${configValidation.errors.join(', ')}`);
            }

            // Initialize pool manager
            this.poolManager = await initializePoolManager({
                enableDynamicSizing: true,
                enableLeakDetection: true,
                enableNotifications: true
            });

            // Initialize migration engine
            this.migrationEngine = await initializeMigrationEngine({
                poolManager: this.poolManager,
                enableZeroDowntime: true,
                enablePreValidation: true,
                enablePostValidation: true,
                enableBackups: true
            });

            // Initialize health monitor
            this.healthMonitor = await initializeHealthMonitor({
                poolManager: this.poolManager
            });

            this.spinner.succeed('Database connections initialized successfully');
            
        } catch (error) {
            this.spinner.fail(`Initialization failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        if (this.healthMonitor) {
            await this.healthMonitor.stopMonitoring();
        }
        if (this.poolManager) {
            await this.poolManager.shutdown();
        }
    }

    /**
     * Run migrations
     */
    async runMigrations(options = {}) {
        await this.initialize();
        
        try {
            this.spinner = ora('Checking migration status...').start();
            
            const status = await this.migrationEngine.getMigrationStatus();
            
            if (status.pending === 0) {
                this.spinner.succeed('No pending migrations found');
                return;
            }

            this.spinner.info(`Found ${status.pending} pending migrations`);

            // Show pending migrations
            if (!options.yes) {
                this._displayMigrationStatus(status);
                
                const { confirm } = await inquirer.prompt([{
                    type: 'confirm',
                    name: 'confirm',
                    message: `Apply ${status.pending} pending migrations?`,
                    default: false
                }]);

                if (!confirm) {
                    console.log(chalk.yellow('Migration cancelled'));
                    return;
                }
            }

            // Run migrations
            this.spinner = ora('Running migrations...').start();
            
            const results = await this.migrationEngine.runMigrations({
                autoRollback: !options.noRollback,
                skipBackup: options.skipBackup
            });

            this.spinner.succeed(`Successfully applied ${results.length} migrations`);
            
            // Display results
            this._displayMigrationResults(results);

        } catch (error) {
            this.spinner.fail(`Migration failed: ${error.message}`);
            throw error;
        } finally {
            await this.cleanup();
        }
    }

    /**
     * Rollback migrations
     */
    async rollbackMigrations(options = {}) {
        await this.initialize();
        
        try {
            this.spinner = ora('Checking migration status...').start();
            
            const status = await this.migrationEngine.getMigrationStatus();
            
            if (status.applied === 0) {
                this.spinner.succeed('No migrations to rollback');
                return;
            }

            this.spinner.info(`Found ${status.applied} applied migrations`);

            // Determine rollback scope
            let rollbackOptions = {};
            
            if (options.count) {
                rollbackOptions.count = parseInt(options.count);
            } else if (options.toVersion) {
                rollbackOptions.toVersion = options.toVersion;
            } else {
                rollbackOptions.count = 1; // Default to last migration
            }

            // Show rollback plan
            if (!options.yes) {
                const rollbackPlan = await this.migrationEngine.rollbackMigrations({
                    ...rollbackOptions,
                    dryRun: true
                });

                this._displayRollbackPlan(rollbackPlan);
                
                const { confirm } = await inquirer.prompt([{
                    type: 'confirm',
                    name: 'confirm',
                    message: `Rollback ${rollbackPlan.length} migrations?`,
                    default: false
                }]);

                if (!confirm) {
                    console.log(chalk.yellow('Rollback cancelled'));
                    return;
                }
            }

            // Perform rollback
            this.spinner = ora('Rolling back migrations...').start();
            
            const results = await this.migrationEngine.rollbackMigrations(rollbackOptions);

            this.spinner.succeed(`Successfully rolled back ${results.length} migrations`);
            
            // Display results
            this._displayRollbackResults(results);

        } catch (error) {
            this.spinner.fail(`Rollback failed: ${error.message}`);
            throw error;
        } finally {
            await this.cleanup();
        }
    }

    /**
     * Show migration status
     */
    async showStatus() {
        await this.initialize();
        
        try {
            this.spinner = ora('Fetching migration status...').start();
            
            const status = await this.migrationEngine.getMigrationStatus();
            
            this.spinner.stop();
            
            this._displayMigrationStatus(status);
            
            // Show health status
            const health = this.healthMonitor.getCurrentHealth();
            this._displayHealthStatus(health);

        } catch (error) {
            this.spinner.fail(`Failed to get status: ${error.message}`);
            throw error;
        } finally {
            await this.cleanup();
        }
    }

    /**
     * Validate migrations
     */
    async validateMigrations() {
        await this.initialize();
        
        try {
            this.spinner = ora('Validating migrations...').start();
            
            const validation = await this.migrationEngine.validateMigrations();
            
            this.spinner.stop();
            
            this._displayValidationResults(validation);

        } catch (error) {
            this.spinner.fail(`Validation failed: ${error.message}`);
            throw error;
        } finally {
            await this.cleanup();
        }
    }

    /**
     * Create new migration
     */
    async createMigration(description, options = {}) {
        await this.initialize();
        
        try {
            this.spinner = ora('Creating migration file...').start();
            
            const filepath = await this.migrationEngine.createMigration(description, {
                createRollback: !options.noRollback,
                zeroDowntime: options.zeroDowntime,
                estimatedDuration: options.estimatedDuration,
                riskLevel: options.riskLevel,
                dependencies: options.dependencies ? options.dependencies.split(',') : []
            });

            this.spinner.succeed(`Migration created: ${filepath}`);

        } catch (error) {
            this.spinner.fail(`Failed to create migration: ${error.message}`);
            throw error;
        } finally {
            await this.cleanup();
        }
    }

    /**
     * Show health report
     */
    async showHealth() {
        await this.initialize();
        
        try {
            this.spinner = ora('Generating health report...').start();
            
            const report = this.healthMonitor.getHealthReport();
            
            this.spinner.stop();
            
            this._displayHealthReport(report);

        } catch (error) {
            this.spinner.fail(`Failed to generate health report: ${error.message}`);
            throw error;
        } finally {
            await this.cleanup();
        }
    }

    // Display methods

    /**
     * Display migration status
     */
    _displayMigrationStatus(status) {
        console.log(chalk.bold('\\n📊 Migration Status'));
        console.log(`Total migrations: ${status.total}`);
        console.log(`Applied: ${chalk.green(status.applied)}`);
        console.log(`Pending: ${chalk.yellow(status.pending)}`);
        
        if (status.lastMigration) {
            console.log(`Last migration: ${status.lastMigration.version} (${status.lastMigration.applied_at})`);
        }

        if (status.migrations.length > 0) {
            const migrationTable = new table({
                head: ['Version', 'Description', 'Status', 'Applied At'],
                colWidths: [15, 40, 10, 20]
            });

            status.migrations.forEach(migration => {
                migrationTable.push([
                    migration.version,
                    migration.description.substring(0, 35) + (migration.description.length > 35 ? '...' : ''),
                    migration.applied ? chalk.green('✓') : chalk.yellow('○'),
                    migration.appliedAt ? new Date(migration.appliedAt).toLocaleString() : '-'
                ]);
            });

            console.log('\\n' + migrationTable.toString());
        }

        if (status.integrity.length > 0) {
            console.log(chalk.red('\\n⚠️  Integrity Issues:'));
            status.integrity.forEach(issue => {
                console.log(chalk.red(`  - ${issue}`));
            });
        }
    }

    /**
     * Display migration results
     */
    _displayMigrationResults(results) {
        console.log(chalk.bold('\\n✅ Migration Results'));
        
        results.forEach(result => {
            console.log(`${chalk.green('✓')} ${result.version} - ${result.description} (${result.duration}ms)`);
        });
    }

    /**
     * Display rollback plan
     */
    _displayRollbackPlan(plan) {
        console.log(chalk.bold('\\n📋 Rollback Plan'));
        
        plan.forEach(migration => {
            console.log(`${chalk.yellow('↶')} ${migration.version} - ${migration.description}`);
        });
    }

    /**
     * Display rollback results
     */
    _displayRollbackResults(results) {
        console.log(chalk.bold('\\n↶ Rollback Results'));
        
        results.forEach(result => {
            console.log(`${chalk.yellow('↶')} ${result.version} - ${result.description}`);
        });
    }

    /**
     * Display health status
     */
    _displayHealthStatus(health) {
        console.log(chalk.bold('\\n🏥 Database Health'));
        
        const statusColor = health.status === 'healthy' ? 'green' : 
                           health.status === 'warning' ? 'yellow' : 'red';
        
        console.log(`Status: ${chalk[statusColor](health.status.toUpperCase())}`);
        console.log(`Monitoring: ${health.monitoring ? chalk.green('enabled') : chalk.red('disabled')}`);
        
        if (health.lastCheck) {
            console.log(`Last check: ${new Date(health.lastCheck).toLocaleString()}`);
        }
    }

    /**
     * Display validation results
     */
    _displayValidationResults(validation) {
        console.log(chalk.bold('\\n🔍 Migration Validation'));
        
        if (validation.valid) {
            console.log(chalk.green('✓ All migrations are valid'));
        } else {
            console.log(chalk.red('✗ Validation failed'));
        }

        console.log(`\\nSummary:`);
        console.log(`  Total migrations: ${validation.summary.totalMigrations}`);
        console.log(`  Valid: ${chalk.green(validation.summary.validMigrations)}`);
        console.log(`  With warnings: ${chalk.yellow(validation.summary.migrationsWithWarnings)}`);
        console.log(`  With errors: ${chalk.red(validation.summary.migrationsWithErrors)}`);

        if (validation.errors.length > 0) {
            console.log(chalk.red('\\nErrors:'));
            validation.errors.forEach(error => {
                console.log(chalk.red(`  - ${error}`));
            });
        }

        if (validation.warnings.length > 0) {
            console.log(chalk.yellow('\\nWarnings:'));
            validation.warnings.forEach(warning => {
                console.log(chalk.yellow(`  - ${warning}`));
            });
        }
    }

    /**
     * Display health report
     */
    _displayHealthReport(report) {
        console.log(chalk.bold('\\n🏥 Database Health Report'));
        
        // Current status
        const statusColor = report.current.status === 'healthy' ? 'green' : 
                           report.current.status === 'warning' ? 'yellow' : 'red';
        
        console.log(`\\nCurrent Status: ${chalk[statusColor](report.current.status.toUpperCase())}`);
        
        // Performance metrics
        console.log(`\\nPerformance:`);
        console.log(`  Uptime: ${report.uptime.toFixed(2)}%`);
        console.log(`  Total queries: ${report.performance.totalQueries}`);
        console.log(`  Success rate: ${report.performance.successRate.toFixed(2)}%`);
        console.log(`  Avg response time: ${report.performance.avgResponseTime.toFixed(2)}ms`);

        // Recent alerts
        if (report.alerts.recent.length > 0) {
            console.log(chalk.yellow('\\nRecent Alerts:'));
            report.alerts.recent.slice(-5).forEach(alert => {
                console.log(`  ${alert.timestamp}: ${alert.message}`);
            });
        }

        // Recommendations
        if (report.recommendations.length > 0) {
            console.log(chalk.blue('\\nRecommendations:'));
            report.recommendations.forEach(rec => {
                console.log(`  ${rec.priority.toUpperCase()}: ${rec.message}`);
            });
        }
    }
}

// CLI Commands

program
    .name('migrate')
    .description('Database migration tool for TaskMaster AI CI/CD System')
    .version('1.0.0');

program
    .command('up')
    .description('Run pending migrations')
    .option('-y, --yes', 'Skip confirmation prompts')
    .option('--no-rollback', 'Disable automatic rollback on failure')
    .option('--skip-backup', 'Skip creating backup before migration')
    .action(async (options) => {
        const cli = new MigrationCLI();
        try {
            await cli.runMigrations(options);
        } catch (error) {
            console.error(chalk.red(`Error: ${error.message}`));
            process.exit(1);
        }
    });

program
    .command('down')
    .description('Rollback migrations')
    .option('-c, --count <number>', 'Number of migrations to rollback')
    .option('-t, --to-version <version>', 'Rollback to specific version')
    .option('-y, --yes', 'Skip confirmation prompts')
    .action(async (options) => {
        const cli = new MigrationCLI();
        try {
            await cli.rollbackMigrations(options);
        } catch (error) {
            console.error(chalk.red(`Error: ${error.message}`));
            process.exit(1);
        }
    });

program
    .command('status')
    .description('Show migration status')
    .action(async () => {
        const cli = new MigrationCLI();
        try {
            await cli.showStatus();
        } catch (error) {
            console.error(chalk.red(`Error: ${error.message}`));
            process.exit(1);
        }
    });

program
    .command('validate')
    .description('Validate all migrations')
    .action(async () => {
        const cli = new MigrationCLI();
        try {
            await cli.validateMigrations();
        } catch (error) {
            console.error(chalk.red(`Error: ${error.message}`));
            process.exit(1);
        }
    });

program
    .command('create <description>')
    .description('Create a new migration')
    .option('--no-rollback', 'Do not create rollback file')
    .option('--zero-downtime', 'Mark as zero-downtime migration')
    .option('--estimated-duration <duration>', 'Estimated execution duration')
    .option('--risk-level <level>', 'Risk level (low, medium, high)')
    .option('--dependencies <deps>', 'Comma-separated list of dependencies')
    .action(async (description, options) => {
        const cli = new MigrationCLI();
        try {
            await cli.createMigration(description, options);
        } catch (error) {
            console.error(chalk.red(`Error: ${error.message}`));
            process.exit(1);
        }
    });

program
    .command('health')
    .description('Show database health report')
    .action(async () => {
        const cli = new MigrationCLI();
        try {
            await cli.showHealth();
        } catch (error) {
            console.error(chalk.red(`Error: ${error.message}`));
            process.exit(1);
        }
    });

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error(chalk.red(`Uncaught exception: ${error.message}`));
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red(`Unhandled rejection at: ${promise}, reason: ${reason}`));
    process.exit(1);
});

// Parse command line arguments
program.parse();

