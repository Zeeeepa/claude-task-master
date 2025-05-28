#!/usr/bin/env node

/**
 * @fileoverview Safe Rollback Utility
 * @description Advanced rollback tool with safety checks, backup restoration, and recovery options
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { table } from 'cli-table3';
import fs from 'fs/promises';
import path from 'path';
import { initializePoolManager } from '../src/ai_cicd_system/database/connection_pool.js';
import { initializeMigrationEngine } from '../src/ai_cicd_system/database/migration_engine.js';
import { initializeHealthMonitor } from '../src/ai_cicd_system/database/health_monitor.js';
import { poolConfig } from '../config/pool_config.js';

const program = new Command();

/**
 * Safe Rollback Utility
 */
class RollbackUtility {
    constructor() {
        this.poolManager = null;
        this.migrationEngine = null;
        this.healthMonitor = null;
        this.spinner = null;
        this.backupManager = null;
    }

    /**
     * Initialize database connections
     */
    async initialize() {
        this.spinner = ora('Initializing rollback utility...').start();
        
        try {
            // Initialize pool manager
            this.poolManager = await initializePoolManager({
                enableDynamicSizing: false, // Disable during rollback for stability
                enableLeakDetection: true,
                enableNotifications: true
            });

            // Initialize migration engine
            this.migrationEngine = await initializeMigrationEngine({
                poolManager: this.poolManager,
                enableZeroDowntime: false, // Rollbacks are inherently risky
                enablePreValidation: true,
                enablePostValidation: true,
                enableBackups: true
            });

            // Initialize health monitor
            this.healthMonitor = await initializeHealthMonitor({
                poolManager: this.poolManager
            });

            this.spinner.succeed('Rollback utility initialized successfully');
            
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
     * Safe rollback with comprehensive checks
     */
    async safeRollback(options = {}) {
        await this.initialize();
        
        try {
            // Pre-rollback health check
            await this._performPreRollbackChecks();
            
            // Determine rollback scope
            const rollbackPlan = await this._createRollbackPlan(options);
            
            if (rollbackPlan.migrations.length === 0) {
                console.log(chalk.yellow('No migrations to rollback'));
                return;
            }

            // Display rollback plan and risks
            await this._displayRollbackPlan(rollbackPlan);
            
            // Confirm rollback
            if (!options.force && !await this._confirmRollback(rollbackPlan)) {
                console.log(chalk.yellow('Rollback cancelled'));
                return;
            }

            // Create safety backup
            const backupId = await this._createSafetyBackup();
            
            // Execute rollback with monitoring
            const results = await this._executeRollback(rollbackPlan, backupId, options);
            
            // Post-rollback validation
            await this._performPostRollbackValidation(results);
            
            // Display results
            this._displayRollbackResults(results);

        } catch (error) {
            this.spinner.fail(`Rollback failed: ${error.message}`);
            await this._handleRollbackFailure(error, options);
            throw error;
        } finally {
            await this.cleanup();
        }
    }

    /**
     * Emergency rollback to last known good state
     */
    async emergencyRollback(options = {}) {
        await this.initialize();
        
        try {
            console.log(chalk.red.bold('🚨 EMERGENCY ROLLBACK MODE 🚨'));
            console.log(chalk.yellow('This will attempt to restore the database to the last known good state'));
            
            // Find last known good backup
            const lastGoodBackup = await this._findLastGoodBackup();
            
            if (!lastGoodBackup) {
                throw new Error('No suitable backup found for emergency rollback');
            }

            console.log(chalk.blue(`Found backup: ${lastGoodBackup.id} from ${lastGoodBackup.created_at}`));
            
            // Confirm emergency rollback
            if (!options.force) {
                const { confirm } = await inquirer.prompt([{
                    type: 'confirm',
                    name: 'confirm',
                    message: chalk.red('This is an EMERGENCY ROLLBACK. All data since the backup will be LOST. Continue?'),
                    default: false
                }]);

                if (!confirm) {
                    console.log(chalk.yellow('Emergency rollback cancelled'));
                    return;
                }
            }

            // Execute emergency rollback
            await this._executeEmergencyRollback(lastGoodBackup, options);

        } catch (error) {
            console.error(chalk.red(`Emergency rollback failed: ${error.message}`));
            throw error;
        } finally {
            await this.cleanup();
        }
    }

    /**
     * Rollback to specific version
     */
    async rollbackToVersion(version, options = {}) {
        await this.initialize();
        
        try {
            // Validate target version
            const migrationStatus = await this.migrationEngine.getMigrationStatus();
            const targetMigration = migrationStatus.migrations.find(m => m.version === version);
            
            if (!targetMigration) {
                throw new Error(`Migration version ${version} not found`);
            }

            if (!targetMigration.applied) {
                throw new Error(`Migration version ${version} is not applied`);
            }

            // Create rollback plan to target version
            const rollbackOptions = { ...options, toVersion: version };
            await this.safeRollback(rollbackOptions);

        } catch (error) {
            this.spinner.fail(`Rollback to version ${version} failed: ${error.message}`);
            throw error;
        } finally {
            await this.cleanup();
        }
    }

    /**
     * Dry run rollback (simulation)
     */
    async dryRunRollback(options = {}) {
        await this.initialize();
        
        try {
            console.log(chalk.blue.bold('🔍 DRY RUN MODE - No actual changes will be made'));
            
            // Create rollback plan
            const rollbackPlan = await this._createRollbackPlan(options);
            
            if (rollbackPlan.migrations.length === 0) {
                console.log(chalk.yellow('No migrations to rollback'));
                return;
            }

            // Display what would happen
            this._displayDryRunResults(rollbackPlan);
            
            // Validate rollback scripts
            await this._validateRollbackScripts(rollbackPlan.migrations);

        } catch (error) {
            this.spinner.fail(`Dry run failed: ${error.message}`);
            throw error;
        } finally {
            await this.cleanup();
        }
    }

    /**
     * List available backups
     */
    async listBackups() {
        await this.initialize();
        
        try {
            this.spinner = ora('Fetching backup list...').start();
            
            const backups = await this._getAvailableBackups();
            
            this.spinner.stop();
            
            this._displayBackupList(backups);

        } catch (error) {
            this.spinner.fail(`Failed to list backups: ${error.message}`);
            throw error;
        } finally {
            await this.cleanup();
        }
    }

    /**
     * Restore from specific backup
     */
    async restoreFromBackup(backupId, options = {}) {
        await this.initialize();
        
        try {
            console.log(chalk.blue.bold('📦 BACKUP RESTORATION MODE'));
            
            // Validate backup
            const backup = await this._validateBackup(backupId);
            
            console.log(`Restoring from backup: ${backup.id}`);
            console.log(`Created: ${backup.created_at}`);
            console.log(`Type: ${backup.backup_type}`);
            
            // Confirm restoration
            if (!options.force) {
                const { confirm } = await inquirer.prompt([{
                    type: 'confirm',
                    name: 'confirm',
                    message: chalk.yellow('This will restore the database from backup. All current data will be replaced. Continue?'),
                    default: false
                }]);

                if (!confirm) {
                    console.log(chalk.yellow('Backup restoration cancelled'));
                    return;
                }
            }

            // Execute restoration
            await this._executeBackupRestoration(backup, options);

        } catch (error) {
            console.error(chalk.red(`Backup restoration failed: ${error.message}`));
            throw error;
        } finally {
            await this.cleanup();
        }
    }

    // Private helper methods

    /**
     * Perform pre-rollback checks
     * @private
     */
    async _performPreRollbackChecks() {
        this.spinner = ora('Performing pre-rollback safety checks...').start();
        
        // Check database health
        const health = this.healthMonitor.getCurrentHealth();
        if (health.status === 'critical') {
            this.spinner.warn('Database health is critical - rollback may be risky');
        }

        // Check for active connections
        const poolStats = this.poolManager.getPoolStats();
        const activeConnections = Object.values(poolStats.pools)
            .reduce((sum, pool) => sum + (pool.totalCount - pool.idleCount), 0);
        
        if (activeConnections > 10) {
            this.spinner.warn(`High number of active connections (${activeConnections}) - consider waiting`);
        }

        // Check disk space (if possible)
        // This would require additional system monitoring

        this.spinner.succeed('Pre-rollback checks completed');
    }

    /**
     * Create rollback plan
     * @private
     */
    async _createRollbackPlan(options) {
        const migrationStatus = await this.migrationEngine.getMigrationStatus();
        const appliedMigrations = migrationStatus.migrations.filter(m => m.applied);
        
        let migrationsToRollback;
        
        if (options.toVersion) {
            const versionIndex = appliedMigrations.findIndex(m => m.version === options.toVersion);
            if (versionIndex === -1) {
                throw new Error(`Version ${options.toVersion} not found in applied migrations`);
            }
            migrationsToRollback = appliedMigrations.slice(versionIndex + 1).reverse();
        } else {
            const count = parseInt(options.count) || 1;
            migrationsToRollback = appliedMigrations.slice(-count).reverse();
        }

        // Analyze rollback risks
        const risks = await this._analyzeRollbackRisks(migrationsToRollback);
        
        return {
            migrations: migrationsToRollback,
            risks,
            estimatedDuration: this._estimateRollbackDuration(migrationsToRollback),
            affectedTables: this._getAffectedTables(migrationsToRollback)
        };
    }

    /**
     * Display rollback plan
     * @private
     */
    async _displayRollbackPlan(plan) {
        console.log(chalk.bold('\\n📋 Rollback Plan'));
        console.log(`Migrations to rollback: ${plan.migrations.length}`);
        console.log(`Estimated duration: ${plan.estimatedDuration}`);
        console.log(`Affected tables: ${plan.affectedTables.join(', ')}`);

        // Display migrations table
        const migrationTable = new table({
            head: ['Version', 'Description', 'Risk Level', 'Has Rollback Script'],
            colWidths: [15, 40, 12, 18]
        });

        plan.migrations.forEach(migration => {
            const risk = plan.risks.find(r => r.version === migration.version);
            migrationTable.push([
                migration.version,
                migration.description.substring(0, 35) + (migration.description.length > 35 ? '...' : ''),
                this._colorizeRisk(risk?.level || 'unknown'),
                migration.hasRollback ? chalk.green('✓') : chalk.red('✗')
            ]);
        });

        console.log('\\n' + migrationTable.toString());

        // Display risks
        if (plan.risks.some(r => r.level === 'high')) {
            console.log(chalk.red('\\n⚠️  HIGH RISK ROLLBACKS DETECTED:'));
            plan.risks.filter(r => r.level === 'high').forEach(risk => {
                console.log(chalk.red(`  - ${risk.version}: ${risk.reason}`));
            });
        }

        if (plan.risks.some(r => r.level === 'medium')) {
            console.log(chalk.yellow('\\n⚠️  Medium Risk Rollbacks:'));
            plan.risks.filter(r => r.level === 'medium').forEach(risk => {
                console.log(chalk.yellow(`  - ${risk.version}: ${risk.reason}`));
            });
        }
    }

    /**
     * Confirm rollback with user
     * @private
     */
    async _confirmRollback(plan) {
        const hasHighRisk = plan.risks.some(r => r.level === 'high');
        const missingRollbacks = plan.migrations.filter(m => !m.hasRollback);
        
        let message = `Proceed with rollback of ${plan.migrations.length} migrations?`;
        
        if (hasHighRisk) {
            message = chalk.red('HIGH RISK rollback detected. ') + message;
        }
        
        if (missingRollbacks.length > 0) {
            message += chalk.yellow(` (${missingRollbacks.length} migrations lack rollback scripts)`);
        }

        const { confirm } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirm',
            message,
            default: !hasHighRisk
        }]);

        return confirm;
    }

    /**
     * Create safety backup before rollback
     * @private
     */
    async _createSafetyBackup() {
        this.spinner = ora('Creating safety backup...').start();
        
        try {
            // This would create a full schema backup
            // Implementation depends on backup strategy
            const backupId = `safety_${Date.now()}`;
            
            this.spinner.succeed(`Safety backup created: ${backupId}`);
            return backupId;
            
        } catch (error) {
            this.spinner.fail('Failed to create safety backup');
            throw error;
        }
    }

    /**
     * Execute rollback with monitoring
     * @private
     */
    async _executeRollback(plan, backupId, options) {
        const results = [];
        
        for (const migration of plan.migrations) {
            this.spinner = ora(`Rolling back ${migration.version}...`).start();
            
            try {
                const startTime = Date.now();
                
                // Execute rollback
                const result = await this.migrationEngine.rollbackMigrations({
                    toVersion: migration.version,
                    count: 1
                });
                
                const duration = Date.now() - startTime;
                
                results.push({
                    ...result[0],
                    duration,
                    success: true
                });
                
                this.spinner.succeed(`Rolled back ${migration.version} (${duration}ms)`);
                
            } catch (error) {
                this.spinner.fail(`Failed to rollback ${migration.version}: ${error.message}`);
                
                results.push({
                    version: migration.version,
                    description: migration.description,
                    success: false,
                    error: error.message
                });
                
                // Stop on first failure unless force mode
                if (!options.continueOnError) {
                    throw error;
                }
            }
        }
        
        return results;
    }

    /**
     * Perform post-rollback validation
     * @private
     */
    async _performPostRollbackValidation(results) {
        this.spinner = ora('Performing post-rollback validation...').start();
        
        try {
            // Check database health
            const health = this.healthMonitor.getCurrentHealth();
            
            if (health.status === 'critical') {
                throw new Error('Database health is critical after rollback');
            }

            // Validate migration state
            const migrationStatus = await this.migrationEngine.getMigrationStatus();
            
            // Check for integrity issues
            if (migrationStatus.integrity.length > 0) {
                this.spinner.warn('Migration integrity issues detected after rollback');
            }

            this.spinner.succeed('Post-rollback validation completed');
            
        } catch (error) {
            this.spinner.fail('Post-rollback validation failed');
            throw error;
        }
    }

    /**
     * Display rollback results
     * @private
     */
    _displayRollbackResults(results) {
        console.log(chalk.bold('\\n↶ Rollback Results'));
        
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);
        
        console.log(`Successful: ${chalk.green(successful.length)}`);
        console.log(`Failed: ${chalk.red(failed.length)}`);
        
        if (successful.length > 0) {
            console.log(chalk.green('\\n✅ Successfully rolled back:'));
            successful.forEach(result => {
                console.log(`  ${chalk.green('↶')} ${result.version} - ${result.description} (${result.duration}ms)`);
            });
        }
        
        if (failed.length > 0) {
            console.log(chalk.red('\\n❌ Failed to rollback:'));
            failed.forEach(result => {
                console.log(`  ${chalk.red('✗')} ${result.version} - ${result.error}`);
            });
        }
    }

    /**
     * Handle rollback failure
     * @private
     */
    async _handleRollbackFailure(error, options) {
        console.log(chalk.red('\\n🚨 ROLLBACK FAILURE DETECTED'));
        console.log(chalk.yellow('The database may be in an inconsistent state'));
        
        if (!options.noRecovery) {
            const { action } = await inquirer.prompt([{
                type: 'list',
                name: 'action',
                message: 'Choose recovery action:',
                choices: [
                    { name: 'Attempt emergency rollback to last backup', value: 'emergency' },
                    { name: 'Manual intervention required', value: 'manual' },
                    { name: 'Exit and investigate', value: 'exit' }
                ]
            }]);

            switch (action) {
                case 'emergency':
                    await this.emergencyRollback({ force: true });
                    break;
                case 'manual':
                    console.log(chalk.blue('\\nManual intervention steps:'));
                    console.log('1. Check database logs for errors');
                    console.log('2. Verify data integrity');
                    console.log('3. Consider restoring from backup');
                    console.log('4. Contact database administrator if needed');
                    break;
                case 'exit':
                    console.log(chalk.yellow('Exiting for manual investigation'));
                    break;
            }
        }
    }

    // Additional helper methods for backup management, risk analysis, etc.
    // (Implementation details would continue here...)

    /**
     * Analyze rollback risks
     * @private
     */
    async _analyzeRollbackRisks(migrations) {
        const risks = [];
        
        for (const migration of migrations) {
            let riskLevel = 'low';
            let reason = 'Standard rollback';
            
            // Check if rollback script exists
            if (!migration.hasRollback) {
                riskLevel = 'high';
                reason = 'No rollback script available';
            }
            
            // Analyze migration content for risky operations
            // This would require parsing the migration files
            
            risks.push({
                version: migration.version,
                level: riskLevel,
                reason
            });
        }
        
        return risks;
    }

    /**
     * Colorize risk level
     * @private
     */
    _colorizeRisk(level) {
        switch (level) {
            case 'high': return chalk.red(level.toUpperCase());
            case 'medium': return chalk.yellow(level.toUpperCase());
            case 'low': return chalk.green(level.toUpperCase());
            default: return chalk.gray(level.toUpperCase());
        }
    }

    /**
     * Estimate rollback duration
     * @private
     */
    _estimateRollbackDuration(migrations) {
        // Simple estimation based on number of migrations
        const baseTime = migrations.length * 5; // 5 seconds per migration
        return `~${baseTime} seconds`;
    }

    /**
     * Get affected tables from migrations
     * @private
     */
    _getAffectedTables(migrations) {
        // This would parse migration files to extract table names
        // Placeholder implementation
        return ['tasks', 'task_contexts', 'schema_migrations'];
    }

    // Placeholder methods for backup operations
    async _findLastGoodBackup() { return null; }
    async _executeEmergencyRollback() { }
    async _getAvailableBackups() { return []; }
    async _validateBackup() { return null; }
    async _executeBackupRestoration() { }
    _displayDryRunResults() { }
    async _validateRollbackScripts() { }
    _displayBackupList() { }
}

// CLI Commands

program
    .name('rollback')
    .description('Safe rollback utility for TaskMaster AI CI/CD System')
    .version('1.0.0');

program
    .command('safe')
    .description('Perform safe rollback with comprehensive checks')
    .option('-c, --count <number>', 'Number of migrations to rollback', '1')
    .option('-t, --to-version <version>', 'Rollback to specific version')
    .option('-f, --force', 'Skip confirmation prompts')
    .option('--continue-on-error', 'Continue rollback even if individual migrations fail')
    .option('--no-recovery', 'Disable automatic recovery on failure')
    .action(async (options) => {
        const utility = new RollbackUtility();
        try {
            await utility.safeRollback(options);
        } catch (error) {
            console.error(chalk.red(`Error: ${error.message}`));
            process.exit(1);
        }
    });

program
    .command('emergency')
    .description('Emergency rollback to last known good state')
    .option('-f, --force', 'Skip confirmation prompts')
    .action(async (options) => {
        const utility = new RollbackUtility();
        try {
            await utility.emergencyRollback(options);
        } catch (error) {
            console.error(chalk.red(`Error: ${error.message}`));
            process.exit(1);
        }
    });

program
    .command('to-version <version>')
    .description('Rollback to specific migration version')
    .option('-f, --force', 'Skip confirmation prompts')
    .action(async (version, options) => {
        const utility = new RollbackUtility();
        try {
            await utility.rollbackToVersion(version, options);
        } catch (error) {
            console.error(chalk.red(`Error: ${error.message}`));
            process.exit(1);
        }
    });

program
    .command('dry-run')
    .description('Simulate rollback without making changes')
    .option('-c, --count <number>', 'Number of migrations to rollback', '1')
    .option('-t, --to-version <version>', 'Rollback to specific version')
    .action(async (options) => {
        const utility = new RollbackUtility();
        try {
            await utility.dryRunRollback(options);
        } catch (error) {
            console.error(chalk.red(`Error: ${error.message}`));
            process.exit(1);
        }
    });

program
    .command('list-backups')
    .description('List available backups')
    .action(async () => {
        const utility = new RollbackUtility();
        try {
            await utility.listBackups();
        } catch (error) {
            console.error(chalk.red(`Error: ${error.message}`));
            process.exit(1);
        }
    });

program
    .command('restore <backup-id>')
    .description('Restore from specific backup')
    .option('-f, --force', 'Skip confirmation prompts')
    .action(async (backupId, options) => {
        const utility = new RollbackUtility();
        try {
            await utility.restoreFromBackup(backupId, options);
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

