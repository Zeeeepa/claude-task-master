/**
 * @fileoverview Workflow Engine Implementation
 * @description Core workflow execution and management system
 */

import { BaseWorkflow } from './workflow_definitions/base_workflow.js';
import { TaskProcessingWorkflow } from './workflow_definitions/task_processing_workflow.js';
import { PRCreationWorkflow } from './workflow_definitions/pr_creation_workflow.js';
import { ValidationWorkflow } from './workflow_definitions/validation_workflow.js';

/**
 * Workflow Engine for managing and executing workflows
 */
export class WorkflowEngine {
    constructor(orchestrator) {
        this.orchestrator = orchestrator;
        this.activeWorkflows = new Map();
        this.workflowDefinitions = new Map();
        this.eventBus = orchestrator.eventBus;
        this.workflowHistory = [];
        this.maxConcurrentWorkflows = 100;
        this.isInitialized = false;
        this.stats = {
            totalCreated: 0,
            totalExecuted: 0,
            totalCompleted: 0,
            totalFailed: 0,
            totalCancelled: 0
        };
    }

    /**
     * Initialize the workflow engine
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        // Register built-in workflow types
        this.registerWorkflow('task_processing', TaskProcessingWorkflow);
        this.registerWorkflow('pr_creation', PRCreationWorkflow);
        this.registerWorkflow('validation', ValidationWorkflow);
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Initialize workflow persistence
        await this.initializeWorkflowPersistence();
        
        this.isInitialized = true;
    }

    /**
     * Register a workflow type
     * @param {string} name - Workflow type name
     * @param {Class} workflowClass - Workflow class
     */
    registerWorkflow(name, workflowClass) {
        if (!workflowClass.prototype instanceof BaseWorkflow) {
            throw new Error(`Workflow '${name}' must extend BaseWorkflow`);
        }
        
        this.workflowDefinitions.set(name, workflowClass);
    }

    /**
     * Unregister a workflow type
     * @param {string} name - Workflow type name
     * @returns {boolean} True if workflow was unregistered
     */
    unregisterWorkflow(name) {
        return this.workflowDefinitions.delete(name);
    }

    /**
     * Get registered workflow types
     * @returns {Array<string>} Array of registered workflow type names
     */
    getRegisteredWorkflows() {
        return Array.from(this.workflowDefinitions.keys());
    }

    /**
     * Create a new workflow instance
     * @param {string} name - Workflow type name
     * @param {Object} context - Workflow context
     * @returns {Promise<Object>} Created workflow instance
     */
    async createWorkflow(name, context) {
        if (!this.isInitialized) {
            throw new Error('Workflow engine not initialized');
        }

        if (this.activeWorkflows.size >= this.maxConcurrentWorkflows) {
            throw new Error('Maximum concurrent workflows reached');
        }

        const WorkflowClass = this.workflowDefinitions.get(name);
        if (!WorkflowClass) {
            throw new Error(`Workflow '${name}' not found`);
        }
        
        const workflow = new WorkflowClass({
            ...context,
            orchestrator: this.orchestrator,
            eventBus: this.eventBus
        });
        
        workflow.id = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        workflow.createdAt = new Date();
        workflow.status = 'created';
        
        this.activeWorkflows.set(workflow.id, workflow);
        this.stats.totalCreated++;
        
        // Emit workflow created event
        if (this.eventBus) {
            this.eventBus.emit('workflow.created', {
                workflowId: workflow.id,
                type: name,
                context: this._sanitizeContext(context)
            });
        }
        
        return workflow;
    }

    /**
     * Execute a workflow
     * @param {Object} workflow - Workflow instance to execute
     * @returns {Promise<Object>} Execution result
     */
    async executeWorkflow(workflow) {
        if (!workflow || !workflow.id) {
            throw new Error('Invalid workflow instance');
        }

        const workflowId = workflow.id;
        
        try {
            workflow.status = 'running';
            workflow.startedAt = new Date();
            this.stats.totalExecuted++;
            
            // Emit workflow started event
            if (this.eventBus) {
                this.eventBus.emit('workflow.started', {
                    workflowId: workflow.id,
                    type: workflow.constructor.name,
                    startedAt: workflow.startedAt
                });
            }
            
            // Start performance monitoring
            const timerId = this.orchestrator.performanceMonitor?.startTimer(
                'workflow_execution',
                { workflow: workflow.constructor.name }
            );
            
            // Execute workflow steps
            const result = await workflow.execute();
            
            // End performance monitoring
            if (timerId) {
                this.orchestrator.performanceMonitor.endTimer(timerId);
            }
            
            // Update workflow status
            workflow.status = 'completed';
            workflow.completedAt = new Date();
            workflow.result = result;
            this.stats.totalCompleted++;
            
            // Emit completion event
            if (this.eventBus) {
                this.eventBus.emit('workflow.completed', {
                    workflowId: workflow.id,
                    result: this._sanitizeResult(result),
                    duration: workflow.completedAt - workflow.startedAt,
                    completedAt: workflow.completedAt
                });
            }
            
            return result;
            
        } catch (error) {
            workflow.status = 'failed';
            workflow.error = error;
            workflow.failedAt = new Date();
            this.stats.totalFailed++;
            
            // Handle error through error handler
            if (this.orchestrator.errorHandler) {
                await this.orchestrator.errorHandler.handleError(error, {
                    workflow: workflow.constructor.name,
                    workflowId: workflow.id,
                    context: workflow.context
                });
            }
            
            // Emit failure event
            if (this.eventBus) {
                this.eventBus.emit('workflow.failed', {
                    workflowId: workflow.id,
                    error: error.message,
                    stack: error.stack,
                    failedAt: workflow.failedAt
                });
            }
            
            throw error;
        } finally {
            // Move to history and clean up
            this._archiveWorkflow(workflow);
        }
    }

    /**
     * Pause a workflow
     * @param {string} workflowId - Workflow ID
     * @param {string} reason - Pause reason
     */
    async pauseWorkflow(workflowId, reason = 'Paused by system') {
        const workflow = this.activeWorkflows.get(workflowId);
        if (workflow && workflow.canPause()) {
            workflow.pause();
            workflow.pauseReason = reason;
            
            if (this.eventBus) {
                this.eventBus.emit('workflow.paused', { 
                    workflowId, 
                    reason,
                    pausedAt: workflow.pausedAt
                });
            }
        }
    }

    /**
     * Resume a workflow
     * @param {string} workflowId - Workflow ID
     */
    async resumeWorkflow(workflowId) {
        const workflow = this.activeWorkflows.get(workflowId);
        if (workflow && workflow.canResume()) {
            workflow.resume();
            
            if (this.eventBus) {
                this.eventBus.emit('workflow.resumed', { 
                    workflowId,
                    resumedAt: workflow.resumedAt
                });
            }
        }
    }

    /**
     * Cancel a workflow
     * @param {string} workflowId - Workflow ID
     * @param {string} reason - Cancellation reason
     */
    async cancelWorkflow(workflowId, reason = 'Cancelled by system') {
        const workflow = this.activeWorkflows.get(workflowId);
        if (workflow) {
            workflow.cancel(reason);
            this.stats.totalCancelled++;
            
            if (this.eventBus) {
                this.eventBus.emit('workflow.cancelled', { 
                    workflowId, 
                    reason,
                    cancelledAt: workflow.cancelledAt
                });
            }
            
            // Archive cancelled workflow
            this._archiveWorkflow(workflow);
        }
    }

    /**
     * Get workflow status
     * @param {string} workflowId - Workflow ID
     * @returns {Object|null} Workflow status or null if not found
     */
    getWorkflowStatus(workflowId) {
        const workflow = this.activeWorkflows.get(workflowId);
        if (workflow) {
            return {
                id: workflow.id,
                status: workflow.status,
                progress: workflow.getProgress(),
                createdAt: workflow.createdAt,
                startedAt: workflow.startedAt,
                currentStep: workflow.currentStep,
                totalSteps: workflow.steps.length,
                metadata: workflow.metadata
            };
        }
        
        // Check history
        const historyEntry = this.workflowHistory.find(h => h.workflowId === workflowId);
        if (historyEntry) {
            return {
                id: workflowId,
                status: historyEntry.status,
                progress: 100,
                archivedAt: historyEntry.archivedAt,
                result: historyEntry.result
            };
        }
        
        return null;
    }

    /**
     * Get all active workflows
     * @returns {Array<Object>} Array of active workflow summaries
     */
    getActiveWorkflows() {
        return Array.from(this.activeWorkflows.values()).map(workflow => workflow.getSummary());
    }

    /**
     * Get workflow history
     * @param {number} limit - Maximum number of entries to return
     * @returns {Array<Object>} Workflow history
     */
    getWorkflowHistory(limit = 100) {
        return this.workflowHistory.slice(-limit);
    }

    /**
     * Get engine statistics
     * @returns {Object} Engine statistics
     */
    getStats() {
        return {
            ...this.stats,
            activeWorkflows: this.activeWorkflows.size,
            registeredWorkflowTypes: this.workflowDefinitions.size,
            historySize: this.workflowHistory.length,
            successRate: this.stats.totalExecuted > 0 ? 
                (this.stats.totalCompleted / this.stats.totalExecuted) * 100 : 0
        };
    }

    /**
     * Setup event listeners
     * @private
     */
    setupEventListeners() {
        if (!this.eventBus) {
            return;
        }

        // Listen for system events that might affect workflows
        this.eventBus.on('system.shutdown', () => {
            this._handleSystemShutdown();
        });

        this.eventBus.on('system.maintenance', (data) => {
            this._handleMaintenanceMode(data);
        });
    }

    /**
     * Initialize workflow persistence
     * @private
     */
    async initializeWorkflowPersistence() {
        // Mock implementation - in real scenario, load persisted workflows
        console.debug('Workflow persistence initialized');
    }

    /**
     * Archive a workflow
     * @param {Object} workflow - Workflow to archive
     * @private
     */
    _archiveWorkflow(workflow) {
        this.workflowHistory.push({
            workflowId: workflow.id,
            type: workflow.constructor.name,
            status: workflow.status,
            result: workflow.result,
            error: workflow.error ? workflow.error.message : null,
            createdAt: workflow.createdAt,
            startedAt: workflow.startedAt,
            completedAt: workflow.completedAt,
            failedAt: workflow.failedAt,
            cancelledAt: workflow.cancelledAt,
            archivedAt: new Date()
        });
        
        // Clean up active workflow after delay
        setTimeout(() => {
            this.activeWorkflows.delete(workflow.id);
        }, 60000); // Keep for 1 minute for debugging
    }

    /**
     * Handle system shutdown
     * @private
     */
    async _handleSystemShutdown() {
        console.log('Workflow engine: Handling system shutdown');
        
        // Cancel all active workflows
        const activeWorkflowIds = Array.from(this.activeWorkflows.keys());
        for (const workflowId of activeWorkflowIds) {
            await this.cancelWorkflow(workflowId, 'System shutdown');
        }
    }

    /**
     * Handle maintenance mode
     * @param {Object} data - Maintenance data
     * @private
     */
    async _handleMaintenanceMode(data) {
        console.log('Workflow engine: Entering maintenance mode');
        
        // Pause all active workflows
        const activeWorkflowIds = Array.from(this.activeWorkflows.keys());
        for (const workflowId of activeWorkflowIds) {
            await this.pauseWorkflow(workflowId, 'System maintenance');
        }
    }

    /**
     * Sanitize context for events (remove sensitive data)
     * @param {Object} context - Context to sanitize
     * @returns {Object} Sanitized context
     * @private
     */
    _sanitizeContext(context) {
        // Remove potentially sensitive information
        const sanitized = { ...context };
        delete sanitized.apiKeys;
        delete sanitized.passwords;
        delete sanitized.tokens;
        return sanitized;
    }

    /**
     * Sanitize result for events (remove sensitive data)
     * @param {Object} result - Result to sanitize
     * @returns {Object} Sanitized result
     * @private
     */
    _sanitizeResult(result) {
        // Remove potentially sensitive information
        const sanitized = { ...result };
        delete sanitized.credentials;
        delete sanitized.secrets;
        return sanitized;
    }

    /**
     * Shutdown the workflow engine
     */
    async shutdown() {
        if (!this.isInitialized) {
            return;
        }

        // Cancel all active workflows
        await this._handleSystemShutdown();
        
        // Clear all data
        this.activeWorkflows.clear();
        this.workflowDefinitions.clear();
        this.workflowHistory = [];
        
        this.isInitialized = false;
    }
}

export default WorkflowEngine;

