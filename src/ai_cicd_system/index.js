/**
 * @fileoverview Comprehensive AI-Driven CI/CD Development Flow System
 * @description Unified system integrating requirement analysis, task storage, 
 *              codegen integration, validation, and workflow orchestration
 */

import { SystemConfig } from './config/system_config.js';
import { RequirementProcessor } from './core/requirement_processor.js';
import { TaskStorageManager } from './core/task_storage_manager.js';
import { CodegenIntegrator } from './core/codegen_integrator.js';
import { ValidationEngine } from './core/validation_engine.js';
import { WorkflowOrchestrator } from './core/workflow_orchestrator.js';
import { ContextManager } from './core/context_manager.js';
import { SystemMonitor } from './monitoring/system_monitor.js';
import { log } from '../scripts/modules/utils.js';

/**
 * Main AI-Driven CI/CD System
 * Coordinates all components for maximum concurrency and efficiency
 */
export class AICICDSystem {
    constructor(config = {}) {
        this.config = new SystemConfig(config);
        this.components = new Map();
        this.isInitialized = false;
        this.activeWorkflows = new Map();
        
        // Initialize core components
        this._initializeComponents();
    }

    /**
     * Initialize the complete system
     */
    async initialize() {
        if (this.isInitialized) {
            log('warning', 'System already initialized');
            return;
        }

        log('info', 'Initializing AI-Driven CI/CD System...');

        try {
            // Initialize components in dependency order
            await this._initializeInOrder([
                'contextManager',
                'taskStorage',
                'requirementProcessor', 
                'codegenIntegrator',
                'validationEngine',
                'workflowOrchestrator',
                'systemMonitor'
            ]);

            this.isInitialized = true;
            log('info', 'AI-Driven CI/CD System initialized successfully');
            
            // Start system monitoring
            await this.components.get('systemMonitor').startMonitoring();
            
        } catch (error) {
            log('error', `System initialization failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Process a complete development workflow from requirement to PR
     * @param {string} requirement - Natural language requirement
     * @param {Object} options - Processing options
     * @returns {Promise<WorkflowResult>} Complete workflow result
     */
    async processRequirement(requirement, options = {}) {
        if (!this.isInitialized) {
            throw new Error('System not initialized. Call initialize() first.');
        }

        const workflowId = `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        log('info', `Starting workflow ${workflowId} for requirement processing`);

        try {
            // Create workflow context
            const workflowContext = await this._createWorkflowContext(workflowId, requirement, options);
            this.activeWorkflows.set(workflowId, workflowContext);

            // Step 1: Analyze and decompose requirement
            log('debug', 'Step 1: Analyzing requirement');
            const analysisResult = await this.components.get('requirementProcessor')
                .analyzeRequirement(requirement, options.analysisOptions);

            await this._updateWorkflowContext(workflowId, 'analysis', analysisResult);

            // Step 2: Store tasks with comprehensive context
            log('debug', 'Step 2: Storing tasks and context');
            const storedTasks = [];
            for (const task of analysisResult.tasks) {
                const taskId = await this.components.get('taskStorage')
                    .storeAtomicTask(task, analysisResult.requirement);
                storedTasks.push({ ...task, id: taskId });
            }

            await this._updateWorkflowContext(workflowId, 'tasks', storedTasks);

            // Step 3: Generate and execute codegen requests
            log('debug', 'Step 3: Generating code via codegen');
            const codegenResults = [];
            for (const task of storedTasks) {
                const taskContext = await this.components.get('contextManager')
                    .generatePromptContext(task.id);
                
                const codegenResult = await this.components.get('codegenIntegrator')
                    .processTask(task, taskContext);
                
                codegenResults.push(codegenResult);
            }

            await this._updateWorkflowContext(workflowId, 'codegen', codegenResults);

            // Step 4: Validate generated PRs
            log('debug', 'Step 4: Validating generated code');
            const validationResults = [];
            for (const codegenResult of codegenResults) {
                if (codegenResult.pr_info) {
                    const validationResult = await this.components.get('validationEngine')
                        .validatePR(codegenResult.pr_info, codegenResult.task_context);
                    
                    validationResults.push(validationResult);
                }
            }

            await this._updateWorkflowContext(workflowId, 'validation', validationResults);

            // Step 5: Orchestrate workflow completion
            log('debug', 'Step 5: Orchestrating workflow completion');
            const orchestrationResult = await this.components.get('workflowOrchestrator')
                .completeWorkflow(workflowId, {
                    analysis: analysisResult,
                    tasks: storedTasks,
                    codegen: codegenResults,
                    validation: validationResults
                });

            // Compile final result
            const workflowResult = {
                workflow_id: workflowId,
                status: 'completed',
                requirement: requirement,
                analysis: analysisResult,
                tasks: storedTasks,
                codegen_results: codegenResults,
                validation_results: validationResults,
                orchestration: orchestrationResult,
                metrics: await this._calculateWorkflowMetrics(workflowId),
                completed_at: new Date()
            };

            // Clean up workflow context
            this.activeWorkflows.delete(workflowId);

            log('info', `Workflow ${workflowId} completed successfully`);
            return workflowResult;

        } catch (error) {
            log('error', `Workflow ${workflowId} failed: ${error.message}`);
            
            // Update workflow with error state
            const errorResult = {
                workflow_id: workflowId,
                status: 'failed',
                error: error.message,
                failed_at: new Date()
            };

            this.activeWorkflows.delete(workflowId);
            throw errorResult;
        }
    }

    /**
     * Get system health and status
     * @returns {Promise<SystemHealth>} System health information
     */
    async getSystemHealth() {
        if (!this.isInitialized) {
            return { status: 'not_initialized', components: {} };
        }

        const health = {
            status: 'healthy',
            components: {},
            active_workflows: this.activeWorkflows.size,
            system_uptime: Date.now() - this.config.startTime,
            last_check: new Date()
        };

        // Check each component health
        for (const [name, component] of this.components) {
            try {
                if (component.getHealth) {
                    health.components[name] = await component.getHealth();
                } else {
                    health.components[name] = { status: 'unknown' };
                }
            } catch (error) {
                health.components[name] = { 
                    status: 'error', 
                    error: error.message 
                };
                health.status = 'degraded';
            }
        }

        return health;
    }

    /**
     * Get active workflow status
     * @param {string} workflowId - Workflow identifier
     * @returns {Promise<WorkflowStatus>} Workflow status
     */
    async getWorkflowStatus(workflowId) {
        const context = this.activeWorkflows.get(workflowId);
        if (!context) {
            return { status: 'not_found' };
        }

        return {
            workflow_id: workflowId,
            status: context.status,
            current_step: context.currentStep,
            progress: context.progress,
            started_at: context.startedAt,
            last_updated: context.lastUpdated,
            steps_completed: Object.keys(context.completedSteps).length,
            total_steps: context.totalSteps
        };
    }

    /**
     * Shutdown the system gracefully
     */
    async shutdown() {
        log('info', 'Shutting down AI-Driven CI/CD System...');

        try {
            // Stop monitoring
            if (this.components.has('systemMonitor')) {
                await this.components.get('systemMonitor').stopMonitoring();
            }

            // Cancel active workflows
            for (const [workflowId, context] of this.activeWorkflows) {
                log('warning', `Cancelling active workflow: ${workflowId}`);
                context.status = 'cancelled';
            }

            // Shutdown components in reverse order
            const shutdownOrder = [
                'systemMonitor',
                'workflowOrchestrator',
                'validationEngine',
                'codegenIntegrator',
                'requirementProcessor',
                'taskStorage',
                'contextManager'
            ];

            for (const componentName of shutdownOrder) {
                const component = this.components.get(componentName);
                if (component && component.shutdown) {
                    await component.shutdown();
                }
            }

            this.isInitialized = false;
            log('info', 'System shutdown completed');

        } catch (error) {
            log('error', `Error during shutdown: ${error.message}`);
            throw error;
        }
    }

    // Private methods

    /**
     * Initialize core components
     * @private
     */
    _initializeComponents() {
        this.components.set('contextManager', new ContextManager(this.config.context));
        this.components.set('taskStorage', new TaskStorageManager(this.config.database));
        this.components.set('requirementProcessor', new RequirementProcessor(this.config.nlp));
        this.components.set('codegenIntegrator', new CodegenIntegrator(this.config.codegen));
        this.components.set('validationEngine', new ValidationEngine(this.config.validation));
        this.components.set('workflowOrchestrator', new WorkflowOrchestrator(this.config.workflow));
        this.components.set('systemMonitor', new SystemMonitor(this.config.monitoring));
    }

    /**
     * Initialize components in dependency order
     * @param {string[]} componentOrder - Order of component initialization
     * @private
     */
    async _initializeInOrder(componentOrder) {
        for (const componentName of componentOrder) {
            const component = this.components.get(componentName);
            if (component && component.initialize) {
                log('debug', `Initializing ${componentName}...`);
                await component.initialize();
            }
        }
    }

    /**
     * Create workflow context
     * @param {string} workflowId - Workflow identifier
     * @param {string} requirement - Original requirement
     * @param {Object} options - Workflow options
     * @returns {Promise<WorkflowContext>} Workflow context
     * @private
     */
    async _createWorkflowContext(workflowId, requirement, options) {
        return {
            workflowId,
            requirement,
            options,
            status: 'running',
            currentStep: 'analysis',
            progress: 0,
            startedAt: new Date(),
            lastUpdated: new Date(),
            completedSteps: {},
            totalSteps: 5, // analysis, storage, codegen, validation, orchestration
            context: {}
        };
    }

    /**
     * Update workflow context
     * @param {string} workflowId - Workflow identifier
     * @param {string} step - Step name
     * @param {any} result - Step result
     * @private
     */
    async _updateWorkflowContext(workflowId, step, result) {
        const context = this.activeWorkflows.get(workflowId);
        if (context) {
            context.completedSteps[step] = result;
            context.progress = Object.keys(context.completedSteps).length / context.totalSteps;
            context.lastUpdated = new Date();
            
            // Store context for retrieval
            await this.components.get('contextManager')
                .storeWorkflowContext(workflowId, step, result);
        }
    }

    /**
     * Calculate workflow metrics
     * @param {string} workflowId - Workflow identifier
     * @returns {Promise<WorkflowMetrics>} Workflow metrics
     * @private
     */
    async _calculateWorkflowMetrics(workflowId) {
        const context = this.activeWorkflows.get(workflowId);
        if (!context) {
            return {};
        }

        const duration = new Date().getTime() - context.startedAt.getTime();
        
        return {
            total_duration_ms: duration,
            steps_completed: Object.keys(context.completedSteps).length,
            average_step_duration_ms: duration / Object.keys(context.completedSteps).length,
            success_rate: 1.0, // Will be calculated based on actual results
            workflow_efficiency: context.progress
        };
    }
}

/**
 * Factory function to create and initialize the system
 * @param {Object} config - System configuration
 * @returns {Promise<AICICDSystem>} Initialized system instance
 */
export async function createAICICDSystem(config = {}) {
    const system = new AICICDSystem(config);
    await system.initialize();
    return system;
}

/**
 * Convenience function for processing a single requirement
 * @param {string} requirement - Natural language requirement
 * @param {Object} config - System configuration
 * @returns {Promise<WorkflowResult>} Workflow result
 */
export async function processRequirement(requirement, config = {}) {
    const system = await createAICICDSystem(config);
    try {
        return await system.processRequirement(requirement);
    } finally {
        await system.shutdown();
    }
}

export default AICICDSystem;

