/**
 * @fileoverview System Orchestrator - Central coordination hub
 * @description Main orchestrator class that coordinates all workflows and manages component communication
 */

import { EventEmitter } from 'events';
import { log } from '../../scripts/modules/utils.js';
import { WorkflowManager } from './workflow-manager.js';
import { ComponentCoordinator } from './component-coordinator.js';
import { TaskScheduler } from './task-scheduler.js';
import { StateManager } from './state-manager.js';

/**
 * System Orchestrator - Central coordination hub for the unified AI CI/CD system
 * Manages all workflows, component communication, and system state
 */
export class SystemOrchestrator extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            maxConcurrentWorkflows: config.maxConcurrentWorkflows || 10,
            maxConcurrentTasks: config.maxConcurrentTasks || 50,
            healthCheckInterval: config.healthCheckInterval || 30000, // 30 seconds
            componentTimeout: config.componentTimeout || 60000, // 1 minute
            enableMonitoring: config.enableMonitoring !== false,
            enableErrorRecovery: config.enableErrorRecovery !== false,
            retryAttempts: config.retryAttempts || 3,
            retryDelay: config.retryDelay || 1000,
            ...config
        };

        // Core components
        this.workflowManager = new WorkflowManager(this.config);
        this.componentCoordinator = new ComponentCoordinator(this.config);
        this.taskScheduler = new TaskScheduler(this.config);
        this.stateManager = new StateManager(this.config);

        // System state
        this.isInitialized = false;
        this.isShuttingDown = false;
        this.startTime = null;
        this.healthCheckTimer = null;
        this.metrics = {
            workflowsCreated: 0,
            workflowsCompleted: 0,
            workflowsFailed: 0,
            tasksScheduled: 0,
            tasksCompleted: 0,
            componentMessages: 0,
            errors: 0,
            uptime: 0
        };

        // Bind event handlers
        this._setupEventHandlers();
    }

    /**
     * Initialize the System Orchestrator
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            log('warn', 'System Orchestrator already initialized');
            return;
        }

        try {
            log('info', 'Initializing System Orchestrator...');
            this.startTime = Date.now();

            // Initialize core components in order
            await this.stateManager.initialize();
            await this.componentCoordinator.initialize();
            await this.taskScheduler.initialize();
            await this.workflowManager.initialize();

            // Start health monitoring
            if (this.config.enableMonitoring) {
                this._startHealthMonitoring();
            }

            this.isInitialized = true;
            this.emit('initialized');
            
            log('info', 'System Orchestrator initialized successfully');
        } catch (error) {
            log('error', 'Failed to initialize System Orchestrator:', error);
            throw new Error(`Orchestrator initialization failed: ${error.message}`);
        }
    }

    /**
     * Create and start a new workflow
     * @param {Object} workflowDefinition - Workflow definition
     * @returns {Promise<string>} Workflow ID
     */
    async createWorkflow(workflowDefinition) {
        this._ensureInitialized();

        try {
            log('debug', 'Creating new workflow:', workflowDefinition.name);

            // Validate workflow definition
            this._validateWorkflowDefinition(workflowDefinition);

            // Create workflow through workflow manager
            const workflowId = await this.workflowManager.createWorkflow(workflowDefinition);

            // Update metrics
            this.metrics.workflowsCreated++;

            // Emit event
            this.emit('workflowCreated', { workflowId, definition: workflowDefinition });

            log('info', `Workflow created successfully: ${workflowId}`);
            return workflowId;

        } catch (error) {
            this.metrics.errors++;
            log('error', 'Failed to create workflow:', error);
            throw error;
        }
    }

    /**
     * Schedule a task for execution
     * @param {Object} task - Task definition
     * @param {Object} options - Scheduling options
     * @returns {Promise<string>} Task ID
     */
    async scheduleTask(task, options = {}) {
        this._ensureInitialized();

        try {
            log('debug', 'Scheduling task:', task.name);

            // Schedule task through task scheduler
            const taskId = await this.taskScheduler.scheduleTask(task, options);

            // Update metrics
            this.metrics.tasksScheduled++;

            // Emit event
            this.emit('taskScheduled', { taskId, task, options });

            return taskId;

        } catch (error) {
            this.metrics.errors++;
            log('error', 'Failed to schedule task:', error);
            throw error;
        }
    }

    /**
     * Send a message to a component
     * @param {string} componentId - Target component ID
     * @param {Object} message - Message to send
     * @returns {Promise<Object>} Response from component
     */
    async sendMessage(componentId, message) {
        this._ensureInitialized();

        try {
            log('debug', `Sending message to component ${componentId}:`, message.type);

            // Send message through component coordinator
            const response = await this.componentCoordinator.sendMessage(componentId, message);

            // Update metrics
            this.metrics.componentMessages++;

            return response;

        } catch (error) {
            this.metrics.errors++;
            log('error', `Failed to send message to component ${componentId}:`, error);
            throw error;
        }
    }

    /**
     * Get system status and metrics
     * @returns {Object} System status
     */
    getStatus() {
        const uptime = this.startTime ? Date.now() - this.startTime : 0;
        
        return {
            initialized: this.isInitialized,
            shuttingDown: this.isShuttingDown,
            uptime,
            metrics: {
                ...this.metrics,
                uptime
            },
            components: {
                workflowManager: this.workflowManager.getStatus(),
                componentCoordinator: this.componentCoordinator.getStatus(),
                taskScheduler: this.taskScheduler.getStatus(),
                stateManager: this.stateManager.getStatus()
            }
        };
    }

    /**
     * Get workflow status
     * @param {string} workflowId - Workflow ID
     * @returns {Promise<Object>} Workflow status
     */
    async getWorkflowStatus(workflowId) {
        this._ensureInitialized();
        return await this.workflowManager.getWorkflowStatus(workflowId);
    }

    /**
     * Get task status
     * @param {string} taskId - Task ID
     * @returns {Promise<Object>} Task status
     */
    async getTaskStatus(taskId) {
        this._ensureInitialized();
        return await this.taskScheduler.getTaskStatus(taskId);
    }

    /**
     * Shutdown the System Orchestrator gracefully
     * @returns {Promise<void>}
     */
    async shutdown() {
        if (this.isShuttingDown) {
            log('warn', 'System Orchestrator already shutting down');
            return;
        }

        try {
            log('info', 'Shutting down System Orchestrator...');
            this.isShuttingDown = true;

            // Stop health monitoring
            if (this.healthCheckTimer) {
                clearInterval(this.healthCheckTimer);
                this.healthCheckTimer = null;
            }

            // Shutdown components in reverse order
            await this.workflowManager.shutdown();
            await this.taskScheduler.shutdown();
            await this.componentCoordinator.shutdown();
            await this.stateManager.shutdown();

            this.emit('shutdown');
            log('info', 'System Orchestrator shutdown complete');

        } catch (error) {
            log('error', 'Error during shutdown:', error);
            throw error;
        }
    }

    /**
     * Setup event handlers for component communication
     * @private
     */
    _setupEventHandlers() {
        // Workflow events
        this.workflowManager.on('workflowCompleted', (data) => {
            this.metrics.workflowsCompleted++;
            this.emit('workflowCompleted', data);
        });

        this.workflowManager.on('workflowFailed', (data) => {
            this.metrics.workflowsFailed++;
            this.emit('workflowFailed', data);
        });

        // Task events
        this.taskScheduler.on('taskCompleted', (data) => {
            this.metrics.tasksCompleted++;
            this.emit('taskCompleted', data);
        });

        this.taskScheduler.on('taskFailed', (data) => {
            this.metrics.errors++;
            this.emit('taskFailed', data);
        });

        // Component events
        this.componentCoordinator.on('componentConnected', (data) => {
            this.emit('componentConnected', data);
        });

        this.componentCoordinator.on('componentDisconnected', (data) => {
            this.emit('componentDisconnected', data);
        });

        // Error handling
        this.on('error', (error) => {
            this.metrics.errors++;
            log('error', 'System Orchestrator error:', error);
            
            if (this.config.enableErrorRecovery) {
                this._handleError(error);
            }
        });
    }

    /**
     * Start health monitoring
     * @private
     */
    _startHealthMonitoring() {
        this.healthCheckTimer = setInterval(() => {
            this._performHealthCheck();
        }, this.config.healthCheckInterval);

        log('debug', 'Health monitoring started');
    }

    /**
     * Perform health check on all components
     * @private
     */
    async _performHealthCheck() {
        try {
            const status = this.getStatus();
            
            // Check component health
            const unhealthyComponents = [];
            for (const [name, componentStatus] of Object.entries(status.components)) {
                if (!componentStatus.healthy) {
                    unhealthyComponents.push(name);
                }
            }

            if (unhealthyComponents.length > 0) {
                log('warn', 'Unhealthy components detected:', unhealthyComponents);
                this.emit('healthCheckFailed', { unhealthyComponents });
            } else {
                this.emit('healthCheckPassed', status);
            }

        } catch (error) {
            log('error', 'Health check failed:', error);
            this.emit('healthCheckError', error);
        }
    }

    /**
     * Handle system errors with recovery attempts
     * @param {Error} error - Error to handle
     * @private
     */
    async _handleError(error) {
        log('warn', 'Attempting error recovery for:', error.message);
        
        try {
            // Implement error recovery logic based on error type
            if (error.code === 'COMPONENT_TIMEOUT') {
                await this.componentCoordinator.reconnectComponent(error.componentId);
            } else if (error.code === 'WORKFLOW_FAILED') {
                await this.workflowManager.retryWorkflow(error.workflowId);
            } else if (error.code === 'TASK_FAILED') {
                await this.taskScheduler.retryTask(error.taskId);
            }

            log('info', 'Error recovery successful');
            this.emit('errorRecovered', error);

        } catch (recoveryError) {
            log('error', 'Error recovery failed:', recoveryError);
            this.emit('errorRecoveryFailed', { originalError: error, recoveryError });
        }
    }

    /**
     * Validate workflow definition
     * @param {Object} workflowDefinition - Workflow definition to validate
     * @private
     */
    _validateWorkflowDefinition(workflowDefinition) {
        if (!workflowDefinition) {
            throw new Error('Workflow definition is required');
        }

        if (!workflowDefinition.name) {
            throw new Error('Workflow name is required');
        }

        if (!workflowDefinition.steps || !Array.isArray(workflowDefinition.steps)) {
            throw new Error('Workflow steps must be an array');
        }

        if (workflowDefinition.steps.length === 0) {
            throw new Error('Workflow must have at least one step');
        }
    }

    /**
     * Ensure the orchestrator is initialized
     * @private
     */
    _ensureInitialized() {
        if (!this.isInitialized) {
            throw new Error('System Orchestrator not initialized. Call initialize() first.');
        }

        if (this.isShuttingDown) {
            throw new Error('System Orchestrator is shutting down');
        }
    }
}

export default SystemOrchestrator;

