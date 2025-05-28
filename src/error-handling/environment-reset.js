/**
 * @fileoverview Environment Reset
 * @description Environment cleanup and reset capabilities
 */

import { log } from '../scripts/modules/utils.js';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * Reset types
 */
export const ResetType = {
    SOFT: 'soft',
    MEDIUM: 'medium',
    HARD: 'hard',
    FULL: 'full'
};

/**
 * Environment reset and cleanup capabilities
 */
export class EnvironmentReset {
    constructor(config = {}) {
        this.config = {
            timeoutMs: config.timeoutMs || 600000, // 10 minutes
            backupEnabled: config.backupEnabled !== false,
            backupDir: config.backupDir || '.environment-backups',
            preserveUserData: config.preserveUserData !== false,
            allowDestructiveOperations: config.allowDestructiveOperations === true,
            ...config
        };

        this.resetHistory = [];
        this.activeResets = new Set();
    }

    /**
     * Reset environment based on error classification
     * @param {Object} escalation - Escalation details
     * @returns {Promise<Object>} Reset result
     */
    async resetEnvironment(escalation) {
        const resetId = this._generateResetId();
        const resetType = this._determineResetType(escalation.classification, escalation.context);
        
        if (this.activeResets.has(escalation.operationId)) {
            return {
                success: false,
                reason: 'reset_already_active',
                resetId
            };
        }

        this.activeResets.add(escalation.operationId);

        const reset = {
            id: resetId,
            operationId: escalation.operationId,
            type: resetType,
            classification: escalation.classification,
            context: escalation.context,
            startTime: Date.now(),
            status: 'running',
            actions: []
        };

        this.resetHistory.push(reset);

        try {
            log('info', 'Starting environment reset', {
                resetId,
                type: resetType,
                operationId: escalation.operationId
            });

            // Create backup if enabled
            if (this.config.backupEnabled) {
                await this._createBackup(reset);
            }

            // Execute reset based on type
            const result = await this._executeReset(reset);
            
            reset.status = 'completed';
            reset.result = result;
            reset.endTime = Date.now();
            reset.duration = reset.endTime - reset.startTime;

            log('info', 'Environment reset completed', {
                resetId,
                type: resetType,
                duration: reset.duration,
                actionsPerformed: reset.actions.length
            });

            return result;

        } catch (error) {
            reset.status = 'failed';
            reset.error = error.message;
            reset.endTime = Date.now();
            reset.duration = reset.endTime - reset.startTime;

            log('error', 'Environment reset failed', {
                resetId,
                error: error.message,
                duration: reset.duration
            });

            return {
                success: false,
                error: error.message,
                resetId,
                actionsPerformed: reset.actions
            };

        } finally {
            this.activeResets.delete(escalation.operationId);
        }
    }

    /**
     * Determine reset type based on error classification
     * @param {Object} classification - Error classification
     * @param {Object} context - Execution context
     * @returns {string} Reset type
     * @private
     */
    _determineResetType(classification, context) {
        // Critical errors may need full reset
        if (classification.severity === 'critical') {
            return ResetType.HARD;
        }

        // Configuration errors typically need medium reset
        if (classification.type === 'configuration') {
            return ResetType.MEDIUM;
        }

        // Dependency errors need medium reset
        if (classification.type === 'dependency') {
            return ResetType.MEDIUM;
        }

        // Build errors need soft reset
        if (classification.type === 'build') {
            return ResetType.SOFT;
        }

        // System errors may need hard reset
        if (classification.category === 'critical' && classification.type === 'system') {
            return ResetType.HARD;
        }

        // Default to soft reset
        return ResetType.SOFT;
    }

    /**
     * Execute reset based on type
     * @param {Object} reset - Reset details
     * @returns {Promise<Object>} Reset result
     * @private
     */
    async _executeReset(reset) {
        switch (reset.type) {
            case ResetType.SOFT:
                return await this._executeSoftReset(reset);
            case ResetType.MEDIUM:
                return await this._executeMediumReset(reset);
            case ResetType.HARD:
                return await this._executeHardReset(reset);
            case ResetType.FULL:
                return await this._executeFullReset(reset);
            default:
                throw new Error(`Unknown reset type: ${reset.type}`);
        }
    }

    /**
     * Execute soft reset (minimal cleanup)
     * @param {Object} reset - Reset details
     * @returns {Promise<Object>} Reset result
     * @private
     */
    async _executeSoftReset(reset) {
        log('info', 'Executing soft environment reset');

        const actions = [];

        try {
            // Clear temporary files
            await this._runCommand('rm -rf .tmp tmp *.tmp', reset.context);
            actions.push('cleared_temp_files');

            // Clear build cache
            await this._runCommand('rm -rf dist build .next .nuxt .cache', reset.context);
            actions.push('cleared_build_cache');

            // Clear logs
            await this._runCommand('rm -rf logs *.log npm-debug.log*', reset.context);
            actions.push('cleared_logs');

            // Kill development servers
            await this._runCommand('pkill -f "webpack-dev-server|vite|next dev|nuxt dev" || true', reset.context);
            actions.push('killed_dev_servers');

            reset.actions = actions;

            return {
                success: true,
                type: ResetType.SOFT,
                actions,
                message: 'Soft reset completed successfully'
            };

        } catch (error) {
            return {
                success: false,
                type: ResetType.SOFT,
                actions,
                error: error.message
            };
        }
    }

    /**
     * Execute medium reset (moderate cleanup)
     * @param {Object} reset - Reset details
     * @returns {Promise<Object>} Reset result
     * @private
     */
    async _executeMediumReset(reset) {
        log('info', 'Executing medium environment reset');

        const actions = [];

        try {
            // Start with soft reset actions
            const softResult = await this._executeSoftReset(reset);
            actions.push(...softResult.actions);

            // Clear node_modules
            await this._runCommand('rm -rf node_modules', reset.context);
            actions.push('cleared_node_modules');

            // Clear package lock files
            await this._runCommand('rm -rf package-lock.json yarn.lock pnpm-lock.yaml', reset.context);
            actions.push('cleared_lock_files');

            // Clear npm cache
            await this._runCommand('npm cache clean --force || true', reset.context);
            actions.push('cleared_npm_cache');

            // Clear yarn cache
            await this._runCommand('yarn cache clean || true', reset.context);
            actions.push('cleared_yarn_cache');

            // Reinstall dependencies
            const installResult = await this._runCommand('npm install || yarn install', reset.context);
            if (installResult.success) {
                actions.push('reinstalled_dependencies');
            } else {
                actions.push('dependency_install_failed');
            }

            reset.actions = actions;

            return {
                success: true,
                type: ResetType.MEDIUM,
                actions,
                message: 'Medium reset completed successfully'
            };

        } catch (error) {
            return {
                success: false,
                type: ResetType.MEDIUM,
                actions,
                error: error.message
            };
        }
    }

    /**
     * Execute hard reset (extensive cleanup)
     * @param {Object} reset - Reset details
     * @returns {Promise<Object>} Reset result
     * @private
     */
    async _executeHardReset(reset) {
        log('info', 'Executing hard environment reset');

        const actions = [];

        try {
            // Start with medium reset actions
            const mediumResult = await this._executeMediumReset(reset);
            actions.push(...mediumResult.actions);

            // Clear all cache directories
            await this._runCommand('rm -rf .cache .parcel-cache .eslintcache .stylelintcache', reset.context);
            actions.push('cleared_all_caches');

            // Clear TypeScript cache
            await this._runCommand('rm -rf tsconfig.tsbuildinfo', reset.context);
            actions.push('cleared_typescript_cache');

            // Clear test coverage
            await this._runCommand('rm -rf coverage .nyc_output', reset.context);
            actions.push('cleared_test_coverage');

            // Reset git working directory (if safe)
            if (this.config.allowDestructiveOperations) {
                await this._runCommand('git clean -fd', reset.context);
                actions.push('git_clean_performed');
                
                await this._runCommand('git reset --hard HEAD', reset.context);
                actions.push('git_reset_performed');
            }

            // Clear environment-specific files
            await this._clearEnvironmentFiles(reset.context);
            actions.push('cleared_environment_files');

            // Restart system services if needed
            await this._restartServices(reset.context);
            actions.push('restarted_services');

            reset.actions = actions;

            return {
                success: true,
                type: ResetType.HARD,
                actions,
                message: 'Hard reset completed successfully'
            };

        } catch (error) {
            return {
                success: false,
                type: ResetType.HARD,
                actions,
                error: error.message
            };
        }
    }

    /**
     * Execute full reset (complete environment recreation)
     * @param {Object} reset - Reset details
     * @returns {Promise<Object>} Reset result
     * @private
     */
    async _executeFullReset(reset) {
        log('warn', 'Executing full environment reset - this is destructive!');

        if (!this.config.allowDestructiveOperations) {
            throw new Error('Full reset requires allowDestructiveOperations to be enabled');
        }

        const actions = [];

        try {
            // Start with hard reset actions
            const hardResult = await this._executeHardReset(reset);
            actions.push(...hardResult.actions);

            // Remove all non-essential files
            await this._runCommand('find . -name "*.log" -delete', reset.context);
            await this._runCommand('find . -name "*.tmp" -delete', reset.context);
            await this._runCommand('find . -name ".DS_Store" -delete', reset.context);
            actions.push('removed_system_files');

            // Reset configuration files to defaults
            await this._resetConfigurationFiles(reset.context);
            actions.push('reset_configuration_files');

            // Recreate essential directories
            await this._recreateDirectories(reset.context);
            actions.push('recreated_directories');

            reset.actions = actions;

            return {
                success: true,
                type: ResetType.FULL,
                actions,
                message: 'Full reset completed successfully',
                warning: 'Environment has been completely reset'
            };

        } catch (error) {
            return {
                success: false,
                type: ResetType.FULL,
                actions,
                error: error.message
            };
        }
    }

    /**
     * Clear environment-specific files
     * @param {Object} context - Execution context
     * @private
     */
    async _clearEnvironmentFiles(context) {
        const filesToClear = [
            '.env.local',
            '.env.development.local',
            '.env.test.local',
            '.env.production.local'
        ];

        for (const file of filesToClear) {
            if (!this.config.preserveUserData) {
                await this._runCommand(`rm -f ${file}`, context);
            }
        }
    }

    /**
     * Restart system services
     * @param {Object} context - Execution context
     * @private
     */
    async _restartServices(context) {
        // Kill any running processes on common ports
        const commonPorts = [3000, 3001, 8080, 8081, 5000, 5001, 9000];
        
        for (const port of commonPorts) {
            await this._runCommand(`lsof -ti:${port} | xargs kill -9 || true`, context);
        }

        // Clear any socket files
        await this._runCommand('rm -f /tmp/*.sock', context);
    }

    /**
     * Reset configuration files to defaults
     * @param {Object} context - Execution context
     * @private
     */
    async _resetConfigurationFiles(context) {
        // This would reset configuration files to their defaults
        // Implementation depends on the specific project structure
        log('info', 'Resetting configuration files to defaults');
    }

    /**
     * Recreate essential directories
     * @param {Object} context - Execution context
     * @private
     */
    async _recreateDirectories(context) {
        const directories = ['logs', 'tmp', '.cache'];
        
        for (const dir of directories) {
            await this._runCommand(`mkdir -p ${dir}`, context);
        }
    }

    /**
     * Create backup of current environment
     * @param {Object} reset - Reset details
     * @private
     */
    async _createBackup(reset) {
        const backupDir = join(reset.context.workingDir || process.cwd(), this.config.backupDir);
        const backupPath = join(backupDir, `backup_${reset.id}_${Date.now()}`);

        try {
            await fs.mkdir(backupDir, { recursive: true });
            
            // Backup important files
            const filesToBackup = [
                'package.json',
                'package-lock.json',
                'yarn.lock',
                '.env',
                '.env.local',
                'tsconfig.json',
                'webpack.config.js',
                'vite.config.js'
            ];

            await fs.mkdir(backupPath, { recursive: true });

            for (const file of filesToBackup) {
                const sourcePath = join(reset.context.workingDir || process.cwd(), file);
                const destPath = join(backupPath, file);
                
                try {
                    await fs.copyFile(sourcePath, destPath);
                } catch (error) {
                    // File doesn't exist, skip
                }
            }

            reset.backupPath = backupPath;
            log('info', 'Environment backup created', { backupPath });

        } catch (error) {
            log('warn', 'Failed to create environment backup', { error: error.message });
        }
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
     * Generate unique reset ID
     * @returns {string} Reset ID
     * @private
     */
    _generateResetId() {
        return `rst_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get reset statistics
     * @returns {Object} Reset statistics
     */
    getStatistics() {
        const stats = {
            totalResets: this.resetHistory.length,
            activeResets: this.activeResets.size,
            byType: {},
            byStatus: {},
            averageDuration: 0,
            successRate: 0
        };

        let totalDuration = 0;
        let completedCount = 0;
        let successCount = 0;

        for (const reset of this.resetHistory) {
            // Count by type
            stats.byType[reset.type] = (stats.byType[reset.type] || 0) + 1;
            
            // Count by status
            stats.byStatus[reset.status] = (stats.byStatus[reset.status] || 0) + 1;
            
            if (reset.duration) {
                totalDuration += reset.duration;
                completedCount++;
                
                if (reset.status === 'completed' && reset.result && reset.result.success) {
                    successCount++;
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
     * Get reset history
     * @param {number} limit - Maximum number of entries to return
     * @returns {Array} Reset history
     */
    getHistory(limit = 100) {
        return this.resetHistory.slice(-limit);
    }

    /**
     * Get active resets
     * @returns {Array} Active reset operation IDs
     */
    getActiveResets() {
        return Array.from(this.activeResets);
    }

    /**
     * Cancel active reset
     * @param {string} operationId - Operation ID
     * @returns {boolean} Whether reset was cancelled
     */
    cancelReset(operationId) {
        if (this.activeResets.has(operationId)) {
            this.activeResets.delete(operationId);
            log('info', 'Environment reset cancelled', { operationId });
            return true;
        }
        return false;
    }

    /**
     * Restore from backup
     * @param {string} backupPath - Path to backup
     * @param {Object} context - Execution context
     * @returns {Promise<Object>} Restore result
     */
    async restoreFromBackup(backupPath, context = {}) {
        try {
            log('info', 'Restoring from backup', { backupPath });

            const workingDir = context.workingDir || process.cwd();
            
            // Copy backup files back
            const result = await this._runCommand(`cp -r ${backupPath}/* ${workingDir}/`, context);
            
            if (result.success) {
                log('info', 'Backup restored successfully', { backupPath });
                return { success: true, backupPath };
            } else {
                throw new Error(`Restore failed: ${result.stderr}`);
            }

        } catch (error) {
            log('error', 'Backup restore failed', { error: error.message, backupPath });
            return { success: false, error: error.message };
        }
    }

    /**
     * Reset environment reset state
     */
    reset() {
        this.resetHistory = [];
        this.activeResets.clear();
        log('info', 'Environment reset state cleared');
    }
}

export default EnvironmentReset;

