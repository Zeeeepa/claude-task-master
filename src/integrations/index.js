/**
 * @fileoverview Claude Code Integration - Main Entry Point
 * @description Consolidated Claude Code integration with AgentAPI middleware
 */

import AgentAPIClient from './agentapi/client.js';
import AuthManager from './agentapi/auth_manager.js';
import ClaudeCodeExecutor from './claude_code/executor.js';
import WorkspaceManager from './workspace_manager.js';
import { EventEmitter } from 'events';

/**
 * Main Claude Code Integration class
 */
export class ClaudeCodeIntegration extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            environment: config.environment || 'development',
            agentAPI: {
                baseURL: config.agentAPI?.baseURL || 'http://localhost:3284',
                timeout: config.agentAPI?.timeout || 30000,
                retryAttempts: config.agentAPI?.retryAttempts || 3,
                ...config.agentAPI
            },
            workspace: {
                basePath: config.workspace?.basePath || '/tmp/workspace',
                maxConcurrent: config.workspace?.maxConcurrent || 10,
                ...config.workspace
            },
            claude: {
                maxTokens: config.claude?.maxTokens || 4000,
                temperature: config.claude?.temperature || 0.1,
                allowedTools: config.claude?.allowedTools || ['Bash(git*)', 'Edit', 'Replace'],
                ...config.claude
            },
            monitoring: {
                healthCheckInterval: config.monitoring?.healthCheckInterval || 30000,
                errorRateThreshold: config.monitoring?.errorRateThreshold || 10,
                ...config.monitoring
            },
            ...config
        };

        this.agentAPIClient = null;
        this.authManager = null;
        this.executor = null;
        this.workspaceManager = null;
        this.monitor = null;
        this.isInitialized = false;
    }

    /**
     * Initialize the integration
     */
    async initialize() {
        if (this.isInitialized) return;

        try {
            // Initialize components
            this.agentAPIClient = new AgentAPIClient(this.config.agentAPI);
            this.authManager = new AuthManager();
            this.executor = new ClaudeCodeExecutor({
                agentAPI: this.config.agentAPI,
                claude: this.config.claude
            });
            this.workspaceManager = new WorkspaceManager(this.config.workspace);

            // Initialize all components
            await Promise.all([
                this.executor.initialize(),
                this.workspaceManager.initialize()
            ]);

            // Set up event forwarding
            this._setupEventForwarding();

            this.isInitialized = true;
            this.emit('initialized');
        } catch (error) {
            this.emit('initialization_failed', { error });
            throw error;
        }
    }

    /**
     * Execute a task with full integration
     */
    async executeTask(task, options = {}) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const executionId = options.executionId || this._generateExecutionId();
        
        try {
            // Create workspace if needed
            let workspace = null;
            if (options.createWorkspace !== false) {
                workspace = await this.workspaceManager.createWorkspace(executionId, {
                    repository: options.repository,
                    branch: options.branch,
                    environment: options.environment
                });
            }

            // Execute task
            const execution = await this.executor.executeTask(task, executionId);

            // Wait for completion if requested
            if (options.waitForCompletion) {
                const results = await this._waitForCompletion(executionId, options.timeout);
                
                // Cleanup workspace if created
                if (workspace && options.cleanupWorkspace !== false) {
                    await this.workspaceManager.cleanupWorkspace(executionId);
                }

                return {
                    executionId,
                    task,
                    workspace,
                    execution,
                    results,
                    completed: true
                };
            }

            return {
                executionId,
                task,
                workspace,
                execution,
                completed: false
            };
        } catch (error) {
            // Cleanup on error
            if (options.createWorkspace !== false) {
                try {
                    await this.workspaceManager.cleanupWorkspace(executionId, true);
                } catch (cleanupError) {
                    // Ignore cleanup errors
                }
            }

            this.emit('task_execution_failed', {
                executionId,
                taskTitle: task.title,
                error: error.message
            });

            throw error;
        }
    }

    /**
     * Get execution status
     */
    async getExecutionStatus(executionId) {
        const [executionStatus, workspace] = await Promise.all([
            this.executor.getExecutionStatus(executionId),
            this.workspaceManager.getWorkspace(executionId)
        ]);

        return {
            execution: executionStatus,
            workspace: workspace ? {
                status: workspace.status,
                path: workspace.path,
                createdAt: workspace.createdAt
            } : null
        };
    }

    /**
     * Get execution results
     */
    async getExecutionResults(executionId) {
        return await this.executor.getExecutionResults(executionId);
    }

    /**
     * Cancel execution
     */
    async cancelExecution(executionId) {
        const [executionCancelled, workspaceCleaned] = await Promise.all([
            this.executor.cancelExecution(executionId),
            this.workspaceManager.cleanupWorkspace(executionId, true).catch(() => false)
        ]);

        return {
            executionCancelled,
            workspaceCleaned
        };
    }

    /**
     * Get system status
     */
    getSystemStatus() {
        return {
            initialized: this.isInitialized,
            agentAPI: this.agentAPIClient?.getConnectionStatus() || null,
            executor: this.executor?.getExecutionStats() || null,
            workspace: this.workspaceManager ? {
                activeWorkspaces: this.workspaceManager.activeWorkspaces.size,
                queuedWorkspaces: this.workspaceManager.workspaceQueue.length
            } : null,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Shutdown the integration
     */
    async shutdown() {
        if (!this.isInitialized) return;

        try {
            // Shutdown components
            if (this.agentAPIClient) {
                this.agentAPIClient.disconnect();
            }

            if (this.workspaceManager) {
                await this.workspaceManager.shutdown();
            }

            this.isInitialized = false;
            this.emit('shutdown');
        } catch (error) {
            this.emit('shutdown_failed', { error });
            throw error;
        }
    }

    /**
     * Private methods
     */
    async _waitForCompletion(executionId, timeout = 30 * 60 * 1000) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`Execution ${executionId} timed out after ${timeout}ms`));
            }, timeout);

            const checkCompletion = async () => {
                try {
                    const status = await this.executor.getExecutionStatus(executionId);
                    
                    if (status.status === 'completed') {
                        clearTimeout(timeoutId);
                        const results = await this.executor.getExecutionResults(executionId);
                        resolve(results);
                    } else if (status.status === 'failed' || status.status === 'cancelled') {
                        clearTimeout(timeoutId);
                        reject(new Error(`Execution ${executionId} ${status.status}`));
                    } else {
                        // Still running, check again in 5 seconds
                        setTimeout(checkCompletion, 5000);
                    }
                } catch (error) {
                    clearTimeout(timeoutId);
                    reject(error);
                }
            };

            checkCompletion();
        });
    }

    _setupEventForwarding() {
        // Forward executor events
        if (this.executor) {
            this.executor.on('execution_started', (data) => this.emit('execution_started', data));
            this.executor.on('execution_completed', (data) => this.emit('execution_completed', data));
            this.executor.on('execution_failed', (data) => this.emit('execution_failed', data));
            this.executor.on('execution_cancelled', (data) => this.emit('execution_cancelled', data));
        }

        // Forward workspace events
        if (this.workspaceManager) {
            this.workspaceManager.on('workspace_created', (data) => this.emit('workspace_created', data));
            this.workspaceManager.on('workspace_cleaned', (data) => this.emit('workspace_cleaned', data));
            this.workspaceManager.on('workspace_creation_failed', (data) => this.emit('workspace_creation_failed', data));
        }

        // Forward AgentAPI events
        if (this.agentAPIClient) {
            this.agentAPIClient.on('connected', (data) => this.emit('agentapi_connected', data));
            this.agentAPIClient.on('disconnected', (data) => this.emit('agentapi_disconnected', data));
            this.agentAPIClient.on('connection_failed', (data) => this.emit('agentapi_connection_failed', data));
        }
    }

    _generateExecutionId() {
        return `claude_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

/**
 * Quick setup functions
 */
export const quickSetup = {
    development: () => new ClaudeCodeIntegration({
        environment: 'development',
        agentAPI: {
            baseURL: 'http://localhost:3284',
            timeout: 30000
        },
        workspace: {
            basePath: '/tmp/workspace-dev',
            maxConcurrent: 5
        }
    }),

    production: () => new ClaudeCodeIntegration({
        environment: 'production',
        agentAPI: {
            baseURL: process.env.AGENTAPI_URL || 'http://localhost:3284',
            timeout: 60000,
            retryAttempts: 5
        },
        workspace: {
            basePath: process.env.WORKSPACE_BASE_PATH || '/tmp/workspace',
            maxConcurrent: 20
        }
    }),

    custom: (config) => new ClaudeCodeIntegration(config)
};

/**
 * Create integration instance
 */
export function createClaudeCodeIntegration(config = {}) {
    return new ClaudeCodeIntegration(config);
}

// Export individual components
export {
    AgentAPIClient,
    AuthManager,
    ClaudeCodeExecutor,
    WorkspaceManager
};

// Default export
export default ClaudeCodeIntegration;

