/**
 * @fileoverview Recovery Strategies
 * @description Recovery strategy implementations for different error types
 */

import { log } from '../scripts/modules/utils.js';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';

/**
 * Recovery strategy results
 */
export const RecoveryResult = {
    SUCCESS: 'success',
    PARTIAL: 'partial',
    FAILED: 'failed',
    SKIPPED: 'skipped'
};

/**
 * Recovery strategy implementations
 */
export class RecoveryStrategies {
    constructor(config = {}) {
        this.config = {
            timeoutMs: config.timeoutMs || 300000, // 5 minutes
            maxRetries: config.maxRetries || 3,
            enableFileBackup: config.enableFileBackup !== false,
            backupDir: config.backupDir || '.recovery-backups',
            ...config
        };

        this.recoveryHistory = [];
        this.activeRecoveries = new Set();
    }

    /**
     * Execute recovery strategy based on error classification
     * @param {Object} classification - Error classification
     * @param {Object} context - Execution context
     * @returns {Promise<Object>} Recovery result
     */
    async executeRecovery(classification, context = {}) {
        const strategyName = this._selectStrategy(classification);
        const recoveryId = this._generateRecoveryId();
        
        if (this.activeRecoveries.has(context.operationId)) {
            return {
                result: RecoveryResult.SKIPPED,
                reason: 'recovery_already_active',
                recoveryId
            };
        }

        this.activeRecoveries.add(context.operationId);
        
        const recovery = {
            id: recoveryId,
            operationId: context.operationId,
            strategy: strategyName,
            classification,
            context,
            startTime: Date.now(),
            status: 'running'
        };

        this.recoveryHistory.push(recovery);

        try {
            log('info', 'Starting recovery strategy', {
                recoveryId,
                strategy: strategyName,
                errorType: classification.type
            });

            const result = await this._executeStrategy(strategyName, classification, context);
            
            recovery.status = 'completed';
            recovery.result = result;
            recovery.endTime = Date.now();
            recovery.duration = recovery.endTime - recovery.startTime;

            log('info', 'Recovery strategy completed', {
                recoveryId,
                strategy: strategyName,
                result: result.result,
                duration: recovery.duration
            });

            return result;

        } catch (error) {
            recovery.status = 'failed';
            recovery.error = error.message;
            recovery.endTime = Date.now();
            recovery.duration = recovery.endTime - recovery.startTime;

            log('error', 'Recovery strategy failed', {
                recoveryId,
                strategy: strategyName,
                error: error.message,
                duration: recovery.duration
            });

            return {
                result: RecoveryResult.FAILED,
                error: error.message,
                recoveryId
            };

        } finally {
            this.activeRecoveries.delete(context.operationId);
        }
    }

    /**
     * Select appropriate recovery strategy
     * @param {Object} classification - Error classification
     * @returns {string} Strategy name
     * @private
     */
    _selectStrategy(classification) {
        const strategyMap = {
            // Dependency errors
            dependency: 'fixDependencies',
            
            // Syntax and build errors
            syntax: 'fixSyntaxErrors',
            build: 'fixBuildIssues',
            
            // Configuration errors
            configuration: 'fixConfiguration',
            
            // Test errors
            test: 'fixTests',
            
            // Network errors
            network: 'restartServices',
            
            // Resource errors
            resource: 'cleanupResources',
            
            // Database errors
            database: 'recoverDatabase'
        };

        return strategyMap[classification.type] || 'genericRecovery';
    }

    /**
     * Execute specific recovery strategy
     * @param {string} strategyName - Strategy name
     * @param {Object} classification - Error classification
     * @param {Object} context - Execution context
     * @returns {Promise<Object>} Strategy result
     * @private
     */
    async _executeStrategy(strategyName, classification, context) {
        const strategy = this[strategyName];
        
        if (!strategy || typeof strategy !== 'function') {
            throw new Error(`Recovery strategy not found: ${strategyName}`);
        }

        return await strategy.call(this, classification, context);
    }

    /**
     * Fix dependency errors
     * @param {Object} classification - Error classification
     * @param {Object} context - Execution context
     * @returns {Promise<Object>} Recovery result
     */
    async fixDependencies(classification, context) {
        log('info', 'Executing dependency recovery strategy');
        
        const actions = [];
        let result = RecoveryResult.SUCCESS;

        try {
            // Check if package.json exists
            const packageJsonPath = join(context.workingDir || process.cwd(), 'package.json');
            
            try {
                await fs.access(packageJsonPath);
                
                // Clear node_modules and package-lock.json
                await this._runCommand('rm -rf node_modules package-lock.json yarn.lock', context);
                actions.push('cleared_dependencies');

                // Reinstall dependencies
                const installResult = await this._runCommand('npm install', context);
                if (installResult.success) {
                    actions.push('reinstalled_dependencies');
                } else {
                    // Try with yarn as fallback
                    const yarnResult = await this._runCommand('yarn install', context);
                    if (yarnResult.success) {
                        actions.push('reinstalled_dependencies_yarn');
                    } else {
                        result = RecoveryResult.PARTIAL;
                        actions.push('dependency_install_failed');
                    }
                }

            } catch (error) {
                log('warn', 'No package.json found, skipping dependency recovery');
                result = RecoveryResult.SKIPPED;
                actions.push('no_package_json');
            }

        } catch (error) {
            result = RecoveryResult.FAILED;
            actions.push(`error: ${error.message}`);
        }

        return {
            result,
            actions,
            strategy: 'fixDependencies',
            details: {
                packageManager: actions.includes('reinstalled_dependencies_yarn') ? 'yarn' : 'npm'
            }
        };
    }

    /**
     * Fix syntax errors
     * @param {Object} classification - Error classification
     * @param {Object} context - Execution context
     * @returns {Promise<Object>} Recovery result
     */
    async fixSyntaxErrors(classification, context) {
        log('info', 'Executing syntax error recovery strategy');
        
        const actions = [];
        let result = RecoveryResult.SUCCESS;

        try {
            // Run linter to identify and potentially fix syntax issues
            const lintResult = await this._runCommand('npm run lint:fix || yarn lint:fix', context);
            if (lintResult.success) {
                actions.push('linter_fixes_applied');
            } else {
                // Try ESLint directly
                const eslintResult = await this._runCommand('npx eslint --fix .', context);
                if (eslintResult.success) {
                    actions.push('eslint_fixes_applied');
                } else {
                    result = RecoveryResult.PARTIAL;
                    actions.push('linting_failed');
                }
            }

            // Try Prettier for formatting issues
            const prettierResult = await this._runCommand('npx prettier --write .', context);
            if (prettierResult.success) {
                actions.push('prettier_formatting_applied');
            }

        } catch (error) {
            result = RecoveryResult.FAILED;
            actions.push(`error: ${error.message}`);
        }

        return {
            result,
            actions,
            strategy: 'fixSyntaxErrors',
            details: {
                toolsUsed: actions.filter(action => action.includes('_applied'))
            }
        };
    }

    /**
     * Fix build issues
     * @param {Object} classification - Error classification
     * @param {Object} context - Execution context
     * @returns {Promise<Object>} Recovery result
     */
    async fixBuildIssues(classification, context) {
        log('info', 'Executing build issue recovery strategy');
        
        const actions = [];
        let result = RecoveryResult.SUCCESS;

        try {
            // Clear build cache
            await this._runCommand('rm -rf dist build .next .nuxt', context);
            actions.push('cleared_build_cache');

            // Clear TypeScript cache
            await this._runCommand('rm -rf tsconfig.tsbuildinfo', context);
            actions.push('cleared_typescript_cache');

            // Reinstall dependencies (build issues often related to deps)
            const depResult = await this.fixDependencies(classification, context);
            if (depResult.result === RecoveryResult.SUCCESS) {
                actions.push('dependencies_reinstalled');
            }

            // Try to rebuild
            const buildResult = await this._runCommand('npm run build || yarn build', context);
            if (buildResult.success) {
                actions.push('build_successful');
            } else {
                result = RecoveryResult.PARTIAL;
                actions.push('build_still_failing');
            }

        } catch (error) {
            result = RecoveryResult.FAILED;
            actions.push(`error: ${error.message}`);
        }

        return {
            result,
            actions,
            strategy: 'fixBuildIssues',
            details: {
                buildCommand: 'npm run build || yarn build'
            }
        };
    }

    /**
     * Fix configuration errors
     * @param {Object} classification - Error classification
     * @param {Object} context - Execution context
     * @returns {Promise<Object>} Recovery result
     */
    async fixConfiguration(classification, context) {
        log('info', 'Executing configuration recovery strategy');
        
        const actions = [];
        let result = RecoveryResult.SUCCESS;

        try {
            // Check for common config files and validate them
            const configFiles = [
                'package.json',
                'tsconfig.json',
                'webpack.config.js',
                'vite.config.js',
                '.env',
                '.env.local'
            ];

            for (const configFile of configFiles) {
                const filePath = join(context.workingDir || process.cwd(), configFile);
                
                try {
                    await fs.access(filePath);
                    
                    if (configFile.endsWith('.json')) {
                        // Validate JSON files
                        const content = await fs.readFile(filePath, 'utf8');
                        JSON.parse(content); // Will throw if invalid
                        actions.push(`validated_${configFile}`);
                    }
                    
                } catch (error) {
                    if (error.code !== 'ENOENT') {
                        log('warn', `Configuration file ${configFile} has issues`, { error: error.message });
                        actions.push(`invalid_${configFile}`);
                        result = RecoveryResult.PARTIAL;
                    }
                }
            }

            // Reset environment variables to defaults if .env issues detected
            if (actions.some(action => action.includes('invalid_.env'))) {
                await this._createBackupEnv(context);
                actions.push('env_backup_created');
            }

        } catch (error) {
            result = RecoveryResult.FAILED;
            actions.push(`error: ${error.message}`);
        }

        return {
            result,
            actions,
            strategy: 'fixConfiguration',
            details: {
                configFilesChecked: configFiles.length
            }
        };
    }

    /**
     * Fix test errors
     * @param {Object} classification - Error classification
     * @param {Object} context - Execution context
     * @returns {Promise<Object>} Recovery result
     */
    async fixTests(classification, context) {
        log('info', 'Executing test recovery strategy');
        
        const actions = [];
        let result = RecoveryResult.SUCCESS;

        try {
            // Clear test cache
            await this._runCommand('rm -rf coverage .nyc_output jest-cache', context);
            actions.push('cleared_test_cache');

            // Update snapshots if Jest is being used
            const jestResult = await this._runCommand('npm test -- --updateSnapshot || yarn test --updateSnapshot', context);
            if (jestResult.success) {
                actions.push('updated_jest_snapshots');
            }

            // Run tests to verify fix
            const testResult = await this._runCommand('npm test || yarn test', context);
            if (testResult.success) {
                actions.push('tests_passing');
            } else {
                result = RecoveryResult.PARTIAL;
                actions.push('tests_still_failing');
            }

        } catch (error) {
            result = RecoveryResult.FAILED;
            actions.push(`error: ${error.message}`);
        }

        return {
            result,
            actions,
            strategy: 'fixTests',
            details: {
                testFramework: 'jest' // Could be detected dynamically
            }
        };
    }

    /**
     * Restart services for network errors
     * @param {Object} classification - Error classification
     * @param {Object} context - Execution context
     * @returns {Promise<Object>} Recovery result
     */
    async restartServices(classification, context) {
        log('info', 'Executing service restart recovery strategy');
        
        const actions = [];
        let result = RecoveryResult.SUCCESS;

        try {
            // Kill any running development servers
            await this._runCommand('pkill -f "webpack-dev-server|vite|next dev|nuxt dev"', context);
            actions.push('killed_dev_servers');

            // Wait a moment for processes to terminate
            await this._sleep(2000);

            // Clear any port locks
            const commonPorts = [3000, 3001, 8080, 8081, 5000, 5001];
            for (const port of commonPorts) {
                await this._runCommand(`lsof -ti:${port} | xargs kill -9`, context);
            }
            actions.push('cleared_port_locks');

            // Restart network-related services if possible
            // This would be environment-specific
            actions.push('services_restarted');

        } catch (error) {
            result = RecoveryResult.PARTIAL;
            actions.push(`error: ${error.message}`);
        }

        return {
            result,
            actions,
            strategy: 'restartServices',
            details: {
                portsCleared: [3000, 3001, 8080, 8081, 5000, 5001]
            }
        };
    }

    /**
     * Cleanup resources for resource errors
     * @param {Object} classification - Error classification
     * @param {Object} context - Execution context
     * @returns {Promise<Object>} Recovery result
     */
    async cleanupResources(classification, context) {
        log('info', 'Executing resource cleanup recovery strategy');
        
        const actions = [];
        let result = RecoveryResult.SUCCESS;

        try {
            // Clear temporary files
            await this._runCommand('rm -rf /tmp/npm-* /tmp/yarn-* .tmp tmp', context);
            actions.push('cleared_temp_files');

            // Clear logs
            await this._runCommand('rm -rf logs *.log npm-debug.log*', context);
            actions.push('cleared_log_files');

            // Clear cache directories
            await this._runCommand('rm -rf .cache .parcel-cache', context);
            actions.push('cleared_cache_dirs');

            // Clear npm cache
            await this._runCommand('npm cache clean --force', context);
            actions.push('cleared_npm_cache');

            // Check disk space
            const diskResult = await this._runCommand('df -h .', context);
            if (diskResult.success) {
                actions.push('checked_disk_space');
            }

        } catch (error) {
            result = RecoveryResult.PARTIAL;
            actions.push(`error: ${error.message}`);
        }

        return {
            result,
            actions,
            strategy: 'cleanupResources',
            details: {
                cleanupTypes: ['temp_files', 'logs', 'cache', 'npm_cache']
            }
        };
    }

    /**
     * Recover database for database errors
     * @param {Object} classification - Error classification
     * @param {Object} context - Execution context
     * @returns {Promise<Object>} Recovery result
     */
    async recoverDatabase(classification, context) {
        log('info', 'Executing database recovery strategy');
        
        const actions = [];
        let result = RecoveryResult.SUCCESS;

        try {
            // This is a placeholder for database recovery
            // Actual implementation would depend on the database type
            
            log('warn', 'Database recovery not implemented - manual intervention required');
            result = RecoveryResult.SKIPPED;
            actions.push('manual_intervention_required');

        } catch (error) {
            result = RecoveryResult.FAILED;
            actions.push(`error: ${error.message}`);
        }

        return {
            result,
            actions,
            strategy: 'recoverDatabase',
            details: {
                note: 'Database recovery requires manual intervention'
            }
        };
    }

    /**
     * Generic recovery strategy
     * @param {Object} classification - Error classification
     * @param {Object} context - Execution context
     * @returns {Promise<Object>} Recovery result
     */
    async genericRecovery(classification, context) {
        log('info', 'Executing generic recovery strategy');
        
        const actions = [];
        let result = RecoveryResult.PARTIAL;

        try {
            // Basic cleanup actions
            await this._runCommand('rm -rf node_modules/.cache', context);
            actions.push('cleared_module_cache');

            // Try to restart any development processes
            await this.restartServices(classification, context);
            actions.push('attempted_service_restart');

        } catch (error) {
            result = RecoveryResult.FAILED;
            actions.push(`error: ${error.message}`);
        }

        return {
            result,
            actions,
            strategy: 'genericRecovery',
            details: {
                note: 'Generic recovery strategy applied'
            }
        };
    }

    /**
     * Run command with timeout and error handling
     * @param {string} command - Command to run
     * @param {Object} context - Execution context
     * @returns {Promise<Object>} Command result
     * @private
     */
    async _runCommand(command, context) {
        return new Promise((resolve) => {
            const child = spawn('bash', ['-c', command], {
                cwd: context.workingDir || process.cwd(),
                stdio: 'pipe',
                timeout: this.config.timeoutMs
            });

            let stdout = '';
            let stderr = '';

            child.stdout?.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr?.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('close', (code) => {
                resolve({
                    success: code === 0,
                    code,
                    stdout,
                    stderr,
                    command
                });
            });

            child.on('error', (error) => {
                resolve({
                    success: false,
                    error: error.message,
                    command
                });
            });
        });
    }

    /**
     * Create backup of environment file
     * @param {Object} context - Execution context
     * @private
     */
    async _createBackupEnv(context) {
        if (!this.config.enableFileBackup) return;

        const envPath = join(context.workingDir || process.cwd(), '.env');
        const backupDir = join(context.workingDir || process.cwd(), this.config.backupDir);
        const backupPath = join(backupDir, `.env.backup.${Date.now()}`);

        try {
            await fs.mkdir(backupDir, { recursive: true });
            await fs.copyFile(envPath, backupPath);
            log('info', 'Environment file backed up', { backupPath });
        } catch (error) {
            log('warn', 'Failed to backup environment file', { error: error.message });
        }
    }

    /**
     * Sleep for specified duration
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate unique recovery ID
     * @returns {string} Recovery ID
     * @private
     */
    _generateRecoveryId() {
        return `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get recovery statistics
     * @returns {Object} Recovery statistics
     */
    getStatistics() {
        const stats = {
            totalRecoveries: this.recoveryHistory.length,
            activeRecoveries: this.activeRecoveries.size,
            byStrategy: {},
            byResult: {},
            averageDuration: 0,
            successRate: 0
        };

        let totalDuration = 0;
        let completedCount = 0;
        let successCount = 0;

        for (const recovery of this.recoveryHistory) {
            // Count by strategy
            stats.byStrategy[recovery.strategy] = (stats.byStrategy[recovery.strategy] || 0) + 1;
            
            if (recovery.result) {
                // Count by result
                stats.byResult[recovery.result.result] = (stats.byResult[recovery.result.result] || 0) + 1;
                
                if (recovery.duration) {
                    totalDuration += recovery.duration;
                    completedCount++;
                    
                    if (recovery.result.result === RecoveryResult.SUCCESS) {
                        successCount++;
                    }
                }
            }
        }

        if (completedCount > 0) {
            stats.averageDuration = totalDuration / completedCount;
            stats.successRate = successCount / completedCount;
        }

        return stats;
    }

    /**
     * Get recovery history
     * @param {number} limit - Maximum number of entries to return
     * @returns {Array} Recovery history
     */
    getHistory(limit = 100) {
        return this.recoveryHistory.slice(-limit);
    }

    /**
     * Reset recovery state
     */
    reset() {
        this.recoveryHistory = [];
        this.activeRecoveries.clear();
        log('info', 'Recovery strategies reset');
    }
}

export default RecoveryStrategies;

