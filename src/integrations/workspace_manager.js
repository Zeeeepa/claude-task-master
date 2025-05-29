/**
 * @fileoverview Workspace Manager
 * @description WSL2 workspace management for Claude Code integration
 */

import { spawn, exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

/**
 * Workspace Manager for WSL2 environments
 */
export class WorkspaceManager extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            basePath: config.basePath || '/tmp/workspace',
            maxConcurrent: config.maxConcurrent || 10,
            cleanupAfter: config.cleanupAfter || 3600000, // 1 hour
            wsl: {
                distribution: config.wsl?.distribution || 'Ubuntu-22.04',
                user: config.wsl?.user || 'ubuntu',
                ...config.wsl
            },
            git: {
                defaultBranch: config.git?.defaultBranch || 'main',
                depth: config.git?.depth || 1,
                ...config.git
            },
            ...config
        };

        this.activeWorkspaces = new Map();
        this.workspaceQueue = [];
        this.cleanupInterval = null;
    }

    /**
     * Initialize workspace manager
     */
    async initialize() {
        try {
            // Ensure base directory exists
            await this._ensureDirectory(this.config.basePath);
            
            // Check WSL2 availability
            await this._checkWSL2();
            
            // Start cleanup interval
            this._startCleanupInterval();
            
            this.emit('initialized');
        } catch (error) {
            this.emit('initialization_failed', { error });
            throw error;
        }
    }

    /**
     * Create workspace for task execution
     */
    async createWorkspace(taskId, options = {}) {
        if (this.activeWorkspaces.size >= this.config.maxConcurrent) {
            return this._queueWorkspaceCreation(taskId, options);
        }

        return this._createWorkspaceNow(taskId, options);
    }

    /**
     * Get workspace information
     */
    getWorkspace(taskId) {
        return this.activeWorkspaces.get(taskId);
    }

    /**
     * List all active workspaces
     */
    listWorkspaces() {
        return Array.from(this.activeWorkspaces.values());
    }

    /**
     * Cleanup workspace
     */
    async cleanupWorkspace(taskId, force = false) {
        const workspace = this.activeWorkspaces.get(taskId);
        if (!workspace) {
            throw new Error(`Workspace ${taskId} not found`);
        }

        if (!force && workspace.status === 'active') {
            throw new Error(`Cannot cleanup active workspace ${taskId}`);
        }

        try {
            // Remove workspace directory
            await this._executeWSLCommand(`rm -rf ${workspace.path}`);
            
            workspace.status = 'cleaned';
            workspace.cleanedAt = new Date().toISOString();
            
            this.activeWorkspaces.delete(taskId);
            this._processWorkspaceQueue();

            this.emit('workspace_cleaned', {
                taskId,
                path: workspace.path,
                duration: Date.now() - new Date(workspace.createdAt).getTime()
            });

            return true;
        } catch (error) {
            this.emit('cleanup_failed', { taskId, error });
            throw error;
        }
    }

    /**
     * Execute command in workspace
     */
    async executeInWorkspace(taskId, command, options = {}) {
        const workspace = this.activeWorkspaces.get(taskId);
        if (!workspace) {
            throw new Error(`Workspace ${taskId} not found`);
        }

        const fullCommand = `cd ${workspace.path} && ${command}`;
        
        try {
            const result = await this._executeWSLCommand(fullCommand, options);
            
            this.emit('command_executed', {
                taskId,
                command,
                success: true,
                output: result.stdout
            });

            return result;
        } catch (error) {
            this.emit('command_failed', {
                taskId,
                command,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get workspace statistics
     */
    async getStatistics() {
        const stats = {
            activeWorkspaces: this.activeWorkspaces.size,
            queuedWorkspaces: this.workspaceQueue.length,
            totalCapacity: this.config.maxConcurrent,
            diskUsage: await this._getDiskUsage()
        };

        return stats;
    }

    /**
     * Private methods
     */
    async _createWorkspaceNow(taskId, options = {}) {
        const workspacePath = path.join(this.config.basePath, taskId);
        
        const workspace = {
            taskId,
            path: workspacePath,
            status: 'creating',
            createdAt: new Date().toISOString(),
            lastActivity: new Date().toISOString(),
            options
        };

        this.activeWorkspaces.set(taskId, workspace);

        try {
            // Create workspace directory
            await this._executeWSLCommand(`mkdir -p ${workspacePath}`);
            
            // Clone repository if specified
            if (options.repository) {
                await this._cloneRepository(workspace, options);
            }

            // Set up environment
            if (options.environment) {
                await this._setupEnvironment(workspace, options.environment);
            }

            workspace.status = 'ready';
            workspace.readyAt = new Date().toISOString();

            this.emit('workspace_created', {
                taskId,
                path: workspacePath,
                repository: options.repository
            });

            return workspace;
        } catch (error) {
            workspace.status = 'failed';
            workspace.error = error.message;
            
            // Cleanup failed workspace
            try {
                await this._executeWSLCommand(`rm -rf ${workspacePath}`);
            } catch (cleanupError) {
                // Ignore cleanup errors
            }

            this.activeWorkspaces.delete(taskId);
            this._processWorkspaceQueue();

            this.emit('workspace_creation_failed', {
                taskId,
                error: error.message
            });

            throw error;
        }
    }

    async _queueWorkspaceCreation(taskId, options) {
        const queuedWorkspace = {
            taskId,
            options,
            queuedAt: new Date().toISOString()
        };

        this.workspaceQueue.push(queuedWorkspace);

        this.emit('workspace_queued', {
            taskId,
            queuePosition: this.workspaceQueue.length
        });

        return {
            taskId,
            status: 'queued',
            queuePosition: this.workspaceQueue.length,
            queuedAt: queuedWorkspace.queuedAt
        };
    }

    _processWorkspaceQueue() {
        if (this.workspaceQueue.length === 0) return;
        if (this.activeWorkspaces.size >= this.config.maxConcurrent) return;

        const queuedWorkspace = this.workspaceQueue.shift();
        this._createWorkspaceNow(queuedWorkspace.taskId, queuedWorkspace.options);
    }

    async _cloneRepository(workspace, options) {
        const { repository, branch = this.config.git.defaultBranch } = options;
        
        const cloneCommand = [
            'git clone',
            `--branch ${branch}`,
            `--depth ${this.config.git.depth}`,
            repository,
            '.'
        ].join(' ');

        await this._executeWSLCommand(`cd ${workspace.path} && ${cloneCommand}`);
        
        workspace.repository = repository;
        workspace.branch = branch;
    }

    async _setupEnvironment(workspace, environment) {
        // Set environment variables
        if (environment.variables) {
            const envVars = Object.entries(environment.variables)
                .map(([key, value]) => `export ${key}="${value}"`)
                .join('\n');
            
            await this._executeWSLCommand(
                `cd ${workspace.path} && echo '${envVars}' > .env`
            );
        }

        // Install dependencies
        if (environment.dependencies) {
            await this._installDependencies(workspace, environment.dependencies);
        }

        // Run setup commands
        if (environment.setupCommands) {
            for (const command of environment.setupCommands) {
                await this._executeWSLCommand(`cd ${workspace.path} && ${command}`);
            }
        }
    }

    async _installDependencies(workspace, dependencies) {
        // Install Node.js packages
        if (dependencies.nodePackages) {
            const packages = dependencies.nodePackages.join(' ');
            await this._executeWSLCommand(
                `cd ${workspace.path} && npm install ${packages}`
            );
        }

        // Install Python packages
        if (dependencies.pythonPackages) {
            const packages = dependencies.pythonPackages.join(' ');
            await this._executeWSLCommand(
                `cd ${workspace.path} && pip install ${packages}`
            );
        }

        // Install system packages
        if (dependencies.systemPackages) {
            const packages = dependencies.systemPackages.join(' ');
            await this._executeWSLCommand(
                `sudo apt-get update && sudo apt-get install -y ${packages}`
            );
        }
    }

    async _executeWSLCommand(command, options = {}) {
        return new Promise((resolve, reject) => {
            const wslCommand = `wsl -d ${this.config.wsl.distribution} -u ${this.config.wsl.user} -- ${command}`;
            
            exec(wslCommand, {
                timeout: options.timeout || 30000,
                maxBuffer: options.maxBuffer || 1024 * 1024 // 1MB
            }, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`WSL command failed: ${error.message}\nStderr: ${stderr}`));
                } else {
                    resolve({ stdout, stderr });
                }
            });
        });
    }

    async _checkWSL2() {
        try {
            const result = await this._executeWSLCommand('echo "WSL2 check"');
            return result.stdout.includes('WSL2 check');
        } catch (error) {
            throw new Error(`WSL2 not available: ${error.message}`);
        }
    }

    async _ensureDirectory(dirPath) {
        try {
            await fs.access(dirPath);
        } catch (error) {
            await fs.mkdir(dirPath, { recursive: true });
        }
    }

    async _getDiskUsage() {
        try {
            const result = await this._executeWSLCommand(`du -sh ${this.config.basePath}`);
            const usage = result.stdout.split('\t')[0];
            return { total: usage, path: this.config.basePath };
        } catch (error) {
            return { total: 'unknown', path: this.config.basePath };
        }
    }

    _startCleanupInterval() {
        this.cleanupInterval = setInterval(() => {
            this._performCleanup();
        }, 60000); // Check every minute
    }

    async _performCleanup() {
        const now = Date.now();
        const cleanupThreshold = now - this.config.cleanupAfter;

        for (const [taskId, workspace] of this.activeWorkspaces) {
            const lastActivity = new Date(workspace.lastActivity).getTime();
            
            if (lastActivity < cleanupThreshold && workspace.status !== 'active') {
                try {
                    await this.cleanupWorkspace(taskId, true);
                } catch (error) {
                    this.emit('auto_cleanup_failed', { taskId, error });
                }
            }
        }
    }

    /**
     * Cleanup on shutdown
     */
    async shutdown() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        // Cleanup all workspaces
        const cleanupPromises = Array.from(this.activeWorkspaces.keys())
            .map(taskId => this.cleanupWorkspace(taskId, true).catch(() => {}));
        
        await Promise.all(cleanupPromises);
        
        this.emit('shutdown');
    }
}

export default WorkspaceManager;

