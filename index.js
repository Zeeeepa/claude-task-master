#!/usr/bin/env node

/**
 * Task Master
 * Copyright (c) 2025 Eyal Toledano, Ralph Khreish
 *
 * This software is licensed under the MIT License with Commons Clause.
 * You may use this software for any purpose, including commercial applications,
 * and modify and redistribute it freely, subject to the following restrictions:
 *
 * 1. You may not sell this software or offer it as a service.
 * 2. The origin of this software must not be misrepresented.
 * 3. Altered source versions must be plainly marked as such.
 *
 * For the full license text, see the LICENSE file in the root directory.
 */

/**
 * Task Master Orchestrator
 * A comprehensive AI-driven development orchestrator with dual AI coordination,
 * database event storage, Linear integration, and automated WSL2 deployment.
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { Command } from 'commander';

// Import orchestrator components
import { SystemWatcher } from './src/orchestrator/system-watcher.js';
import { CoordinationEngine } from './src/orchestrator/coordination-engine.js';
import { EventDispatcher } from './src/orchestrator/event-dispatcher.js';
import { WorkflowManager } from './src/orchestrator/workflow-manager.js';
import { configManager } from './src/utils/config-manager.js';
import { logger } from './src/utils/logger.js';
import { errorHandler } from './src/utils/error-handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Get package information
const packageJson = require('./package.json');

/**
 * TaskMasterOrchestrator - Main orchestrator class
 */
class TaskMasterOrchestrator {
    constructor(options = {}) {
        this.options = {
            autoStart: false,
            ...options
        };
        
        this.components = {
            systemWatcher: null,
            coordinationEngine: null,
            eventDispatcher: null,
            workflowManager: null
        };
        
        this.isRunning = false;
        this.startTime = null;
    }

    /**
     * Initialize the orchestrator
     */
    async initialize() {
        try {
            logger.info('Initializing Task Master Orchestrator...');
            
            // Initialize configuration manager
            await configManager.initialize();
            
            // Initialize event dispatcher first (other components depend on it)
            this.components.eventDispatcher = new EventDispatcher();
            await this.components.eventDispatcher.initialize();
            
            // Initialize coordination engine
            this.components.coordinationEngine = new CoordinationEngine();
            await this.components.coordinationEngine.initialize();
            
            // Initialize workflow manager
            this.components.workflowManager = new WorkflowManager();
            await this.components.workflowManager.initialize();
            
            // Initialize system watcher
            this.components.systemWatcher = new SystemWatcher();
            await this.components.systemWatcher.initialize();
            
            // Setup component event handlers
            this._setupEventHandlers();
            
            logger.info('Task Master Orchestrator initialized successfully');
            
            if (this.options.autoStart) {
                await this.start();
            }
        } catch (error) {
            logger.error('Failed to initialize orchestrator:', error);
            throw error;
        }
    }

    /**
     * Start the orchestrator
     */
    async start() {
        try {
            if (this.isRunning) {
                logger.warn('Orchestrator is already running');
                return;
            }

            logger.info('Starting Task Master Orchestrator...');
            this.startTime = new Date();
            
            // Start all components
            await this.components.systemWatcher.start();
            // Other components are already initialized and ready
            
            this.isRunning = true;
            
            // Dispatch system start event
            await this.components.eventDispatcher.dispatchEvent('system.start', {
                timestamp: this.startTime,
                version: packageJson.version
            });
            
            logger.info('Task Master Orchestrator started successfully');
        } catch (error) {
            logger.error('Failed to start orchestrator:', error);
            throw error;
        }
    }

    /**
     * Stop the orchestrator
     */
    async stop() {
        try {
            if (!this.isRunning) {
                logger.warn('Orchestrator is not running');
                return;
            }

            logger.info('Stopping Task Master Orchestrator...');
            
            // Dispatch system stop event
            await this.components.eventDispatcher.dispatchEvent('system.stop', {
                timestamp: new Date(),
                uptime: Date.now() - this.startTime.getTime()
            });
            
            // Stop all components
            await this.components.systemWatcher.stop();
            await this.components.workflowManager.shutdown();
            await this.components.coordinationEngine.shutdown();
            await this.components.eventDispatcher.shutdown();
            
            this.isRunning = false;
            this.startTime = null;
            
            logger.info('Task Master Orchestrator stopped');
        } catch (error) {
            logger.error('Failed to stop orchestrator:', error);
            throw error;
        }
    }

    /**
     * Get orchestrator status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            startTime: this.startTime,
            uptime: this.isRunning ? Date.now() - this.startTime.getTime() : 0,
            version: packageJson.version,
            components: {
                systemWatcher: this.components.systemWatcher?.getStatus(),
                coordinationEngine: this.components.coordinationEngine?.getStatus(),
                eventDispatcher: this.components.eventDispatcher?.getStatus(),
                workflowManager: this.components.workflowManager?.getStatus()
            }
        };
    }

    /**
     * Setup event handlers between components
     * @private
     */
    _setupEventHandlers() {
        const { eventDispatcher, coordinationEngine, workflowManager } = this.components;
        
        // System watcher events
        this.components.systemWatcher.on('fileChange', async (event) => {
            await eventDispatcher.dispatchEvent('file.changed', event);
        });
        
        // Coordination engine events
        coordinationEngine.on('taskQueued', async (event) => {
            await eventDispatcher.dispatchEvent('task.queued', event);
        });
        
        // Workflow manager events
        workflowManager.on('workflowStarted', async (event) => {
            await eventDispatcher.dispatchEvent('workflow.started', event);
        });
        
        workflowManager.on('workflowCompleted', async (event) => {
            await eventDispatcher.dispatchEvent('workflow.completed', event);
        });
        
        workflowManager.on('workflowFailed', async (event) => {
            await eventDispatcher.dispatchEvent('workflow.failed', event);
        });
    }
}

// Export the orchestrator class and create singleton instance
export const orchestrator = new TaskMasterOrchestrator();

// Export the path to the dev.js script for programmatic usage
export const devScriptPath = resolve(__dirname, './scripts/dev.js');

// Export a function to initialize a new project programmatically
export const initProject = async (options = {}) => {
    const init = await import('./scripts/init.js');
    return init.initializeProject(options);
};

// Export a function to run init as a CLI command
export const runInitCLI = async (options = {}) => {
    try {
        const init = await import('./scripts/init.js');
        const result = await init.initializeProject(options);
        return result;
    } catch (error) {
        console.error('Initialization failed:', error.message);
        if (process.env.DEBUG === 'true') {
            console.error('Debug stack trace:', error.stack);
        }
        throw error; // Re-throw to be handled by the command handler
    }
};

// Export version information
export const version = packageJson.version;

// CLI implementation
if (import.meta.url === `file://${process.argv[1]}`) {
    const program = new Command();

    program
        .name('task-master')
        .description('Task Master Orchestrator CLI')
        .version(version);

    program
        .command('init')
        .description('Initialize a new project')
        .option('-y, --yes', 'Skip prompts and use default values')
        .option('-n, --name <n>', 'Project name')
        .option('-d, --description <description>', 'Project description')
        .option('-v, --version <version>', 'Project version', '0.1.0')
        .option('-a, --author <author>', 'Author name')
        .option('--skip-install', 'Skip installing dependencies')
        .option('--dry-run', 'Show what would be done without making changes')
        .option('--aliases', 'Add shell aliases (tm, taskmaster)')
        .action(async (cmdOptions) => {
            try {
                await runInitCLI(cmdOptions);
            } catch (err) {
                console.error('Init failed:', err.message);
                process.exit(1);
            }
        });

    program
        .command('start')
        .description('Start the Task Master Orchestrator')
        .option('--config <path>', 'Configuration file path')
        .action(async (cmdOptions) => {
            try {
                await orchestrator.initialize();
                await orchestrator.start();
                
                // Keep the process running
                process.on('SIGINT', async () => {
                    console.log('\nReceived SIGINT, shutting down gracefully...');
                    await orchestrator.stop();
                    process.exit(0);
                });
                
                process.on('SIGTERM', async () => {
                    console.log('\nReceived SIGTERM, shutting down gracefully...');
                    await orchestrator.stop();
                    process.exit(0);
                });
                
            } catch (err) {
                console.error('Failed to start orchestrator:', err.message);
                process.exit(1);
            }
        });

    program
        .command('status')
        .description('Show orchestrator status')
        .action(async () => {
            try {
                const status = orchestrator.getStatus();
                console.log(JSON.stringify(status, null, 2));
            } catch (err) {
                console.error('Failed to get status:', err.message);
                process.exit(1);
            }
        });

    program
        .command('dev')
        .description('Run the dev.js script')
        .allowUnknownOption(true)
        .action(() => {
            const args = process.argv.slice(process.argv.indexOf('dev') + 1);
            const child = spawn('node', [devScriptPath, ...args], {
                stdio: 'inherit',
                cwd: process.cwd()
            });

            child.on('close', (code) => {
                process.exit(code);
            });
        });

    // Add shortcuts for common dev.js commands
    program
        .command('list')
        .description('List all tasks')
        .action(() => {
            const child = spawn('node', [devScriptPath, 'list'], {
                stdio: 'inherit',
                cwd: process.cwd()
            });

            child.on('close', (code) => {
                process.exit(code);
            });
        });

    program
        .command('next')
        .description('Show the next task to work on')
        .action(() => {
            const child = spawn('node', [devScriptPath, 'next'], {
                stdio: 'inherit',
                cwd: process.cwd()
            });

            child.on('close', (code) => {
                process.exit(code);
            });
        });

    program
        .command('generate')
        .description('Generate task files')
        .action(() => {
            const child = spawn('node', [devScriptPath, 'generate'], {
                stdio: 'inherit',
                cwd: process.cwd()
            });

            child.on('close', (code) => {
                process.exit(code);
            });
        });

    program.parse(process.argv);
}
