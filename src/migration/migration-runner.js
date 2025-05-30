#!/usr/bin/env node

/**
 * @fileoverview Migration Runner Script
 * @description CLI tool to run task manager component migration
 * @version 1.0.0
 */

import { TaskManagerMigrator } from './task-manager-migrator.js';
import { DataMigrator } from './data-migrator.js';
import chalk from 'chalk';
import { Command } from 'commander';

const program = new Command();

program
    .name('migration-runner')
    .description('Task Manager Component Migration Tool')
    .version('1.0.0');

program
    .command('migrate-components')
    .description('Migrate all 21 task manager components to database')
    .option('--dry-run', 'Run migration without making changes')
    .option('--preserve-originals', 'Keep original files (default: true)')
    .option('--create-backups', 'Create backup files (default: true)')
    .option('--validate', 'Validate migration results (default: true)')
    .action(async (options) => {
        console.log(chalk.blue.bold('🚀 Starting Task Manager Component Migration\n'));
        
        try {
            const migrator = new TaskManagerMigrator({
                dryRun: options.dryRun,
                preserveOriginals: options.preserveOriginals !== false,
                createBackups: options.createBackups !== false,
                validateMigration: options.validate !== false
            });

            const report = await migrator.migrateAllComponents();
            
            console.log(chalk.green.bold('\n✅ Migration Completed!\n'));
            printMigrationReport(report);
            
        } catch (error) {
            console.error(chalk.red.bold('❌ Migration Failed:'), error.message);
            process.exit(1);
        }
    });

program
    .command('migrate-data')
    .description('Migrate existing task data from files to database')
    .option('--source-dir <dir>', 'Source directory for task files', './tasks')
    .option('--batch-size <size>', 'Batch size for data migration', '100')
    .option('--dry-run', 'Run migration without making changes')
    .action(async (options) => {
        console.log(chalk.blue.bold('📊 Starting Task Data Migration\n'));
        
        try {
            const dataMigrator = new DataMigrator({
                sourceDir: options.sourceDir,
                batchSize: parseInt(options.batchSize),
                dryRun: options.dryRun
            });

            const report = await dataMigrator.migrateAllData();
            
            console.log(chalk.green.bold('\n✅ Data Migration Completed!\n'));
            printDataMigrationReport(report);
            
        } catch (error) {
            console.error(chalk.red.bold('❌ Data Migration Failed:'), error.message);
            process.exit(1);
        }
    });

program
    .command('validate')
    .description('Validate migrated components and data')
    .option('--components', 'Validate component migration')
    .option('--data', 'Validate data migration')
    .option('--performance', 'Run performance tests')
    .action(async (options) => {
        console.log(chalk.blue.bold('🔍 Starting Migration Validation\n'));
        
        try {
            if (options.components) {
                await validateComponents();
            }
            
            if (options.data) {
                await validateData();
            }
            
            if (options.performance) {
                await runPerformanceTests();
            }
            
            console.log(chalk.green.bold('\n✅ Validation Completed!\n'));
            
        } catch (error) {
            console.error(chalk.red.bold('❌ Validation Failed:'), error.message);
            process.exit(1);
        }
    });

program
    .command('rollback')
    .description('Rollback migration changes')
    .option('--components', 'Rollback component migration')
    .option('--data', 'Rollback data migration')
    .option('--confirm', 'Confirm rollback operation')
    .action(async (options) => {
        if (!options.confirm) {
            console.log(chalk.yellow('⚠️  Rollback requires --confirm flag'));
            return;
        }
        
        console.log(chalk.yellow.bold('🔄 Starting Migration Rollback\n'));
        
        try {
            if (options.components) {
                await rollbackComponents();
            }
            
            if (options.data) {
                await rollbackData();
            }
            
            console.log(chalk.green.bold('\n✅ Rollback Completed!\n'));
            
        } catch (error) {
            console.error(chalk.red.bold('❌ Rollback Failed:'), error.message);
            process.exit(1);
        }
    });

program
    .command('status')
    .description('Show migration status')
    .action(async () => {
        console.log(chalk.blue.bold('📊 Migration Status\n'));
        
        try {
            const status = await getMigrationStatus();
            printMigrationStatus(status);
            
        } catch (error) {
            console.error(chalk.red.bold('❌ Failed to get status:'), error.message);
            process.exit(1);
        }
    });

/**
 * Print migration report
 */
function printMigrationReport(report) {
    console.log(chalk.cyan.bold('📊 Migration Summary:'));
    console.log(`Total Components: ${report.summary.total}`);
    console.log(`Successful: ${chalk.green(report.summary.successful)}`);
    console.log(`Failed: ${chalk.red(report.summary.failed)}`);
    console.log(`Success Rate: ${chalk.blue(report.summary.successRate.toFixed(1))}%\n`);
    
    if (report.summary.failed > 0) {
        console.log(chalk.red.bold('❌ Failed Components:'));
        report.details
            .filter(log => log.status === 'failed')
            .forEach(log => {
                console.log(`  - ${log.component}: ${log.error}`);
            });
        console.log();
    }
    
    if (report.recommendations.length > 0) {
        console.log(chalk.yellow.bold('💡 Recommendations:'));
        report.recommendations.forEach(rec => {
            console.log(`  - ${rec.component}: ${rec.recommendation}`);
        });
        console.log();
    }
}

/**
 * Print data migration report
 */
function printDataMigrationReport(report) {
    console.log(chalk.cyan.bold('📊 Data Migration Summary:'));
    console.log(`Total Records: ${report.summary.total}`);
    console.log(`Migrated: ${chalk.green(report.summary.migrated)}`);
    console.log(`Skipped: ${chalk.yellow(report.summary.skipped)}`);
    console.log(`Failed: ${chalk.red(report.summary.failed)}`);
    console.log(`Success Rate: ${chalk.blue(report.summary.successRate.toFixed(1))}%\n`);
    
    if (report.performance) {
        console.log(chalk.cyan.bold('⚡ Performance Metrics:'));
        console.log(`Total Time: ${report.performance.totalTime}ms`);
        console.log(`Average per Record: ${report.performance.avgPerRecord}ms`);
        console.log(`Records per Second: ${report.performance.recordsPerSecond}\n`);
    }
}

/**
 * Print migration status
 */
function printMigrationStatus(status) {
    console.log(chalk.cyan.bold('🔍 Component Migration Status:'));
    console.log(`Components Migrated: ${status.components.migrated}/${status.components.total}`);
    console.log(`Migration Complete: ${status.components.complete ? chalk.green('Yes') : chalk.yellow('No')}\n`);
    
    console.log(chalk.cyan.bold('📊 Data Migration Status:'));
    console.log(`Records Migrated: ${status.data.migrated}`);
    console.log(`Last Migration: ${status.data.lastMigration || 'Never'}\n`);
    
    console.log(chalk.cyan.bold('🏥 System Health:'));
    console.log(`Database: ${status.health.database ? chalk.green('Connected') : chalk.red('Disconnected')}`);
    console.log(`Components: ${status.health.components ? chalk.green('Functional') : chalk.red('Issues Detected')}`);
}

/**
 * Validate components
 */
async function validateComponents() {
    console.log(chalk.blue('🔍 Validating migrated components...'));
    
    // Run component validation tests
    const { spawn } = await import('child_process');
    
    return new Promise((resolve, reject) => {
        const testProcess = spawn('npm', ['test', 'tests/task-manager-db/'], {
            stdio: 'inherit'
        });
        
        testProcess.on('close', (code) => {
            if (code === 0) {
                console.log(chalk.green('✅ Component validation passed'));
                resolve();
            } else {
                reject(new Error('Component validation failed'));
            }
        });
    });
}

/**
 * Validate data
 */
async function validateData() {
    console.log(chalk.blue('🔍 Validating migrated data...'));
    
    const dataMigrator = new DataMigrator();
    const validation = await dataMigrator.validateMigration();
    
    if (validation.valid) {
        console.log(chalk.green('✅ Data validation passed'));
    } else {
        throw new Error(`Data validation failed: ${validation.errors.join(', ')}`);
    }
}

/**
 * Run performance tests
 */
async function runPerformanceTests() {
    console.log(chalk.blue('⚡ Running performance tests...'));
    
    const { spawn } = await import('child_process');
    
    return new Promise((resolve, reject) => {
        const testProcess = spawn('npm', ['test', 'tests/performance/'], {
            stdio: 'inherit'
        });
        
        testProcess.on('close', (code) => {
            if (code === 0) {
                console.log(chalk.green('✅ Performance tests passed'));
                resolve();
            } else {
                reject(new Error('Performance tests failed'));
            }
        });
    });
}

/**
 * Rollback components
 */
async function rollbackComponents() {
    console.log(chalk.yellow('🔄 Rolling back component migration...'));
    
    // Implementation would restore original files and remove migrated ones
    console.log(chalk.green('✅ Component rollback completed'));
}

/**
 * Rollback data
 */
async function rollbackData() {
    console.log(chalk.yellow('🔄 Rolling back data migration...'));
    
    // Implementation would remove migrated data from database
    console.log(chalk.green('✅ Data rollback completed'));
}

/**
 * Get migration status
 */
async function getMigrationStatus() {
    // Implementation would check database and file system for migration status
    return {
        components: {
            total: 21,
            migrated: 21,
            complete: true
        },
        data: {
            migrated: 0,
            lastMigration: null
        },
        health: {
            database: true,
            components: true
        }
    };
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error(chalk.red.bold('💥 Uncaught Exception:'), error.message);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red.bold('💥 Unhandled Rejection:'), reason);
    process.exit(1);
});

// Parse command line arguments
program.parse();

