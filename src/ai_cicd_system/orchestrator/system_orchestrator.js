/**
 * @fileoverview System Orchestrator
 * @description Central coordination hub for the AI CI/CD system
 */

import { log } from '../../../scripts/modules/utils.js';
import { ComponentRegistry } from './component_registry.js';
import { LifecycleManager } from './lifecycle_manager.js';

// Import existing components
import { WorkflowOrchestrator } from '../core/workflow_orchestrator.js';
import { SystemConfig } from '../config/system_config.js';

/**
 * System Orchestrator - Central coordination hub for all system components
 */
export class SystemOrchestrator {
    constructor(config = {}) {
        this.config = config instanceof SystemConfig ? config : new SystemConfig(config);
        this.componentRegistry = new ComponentRegistry();
        this.lifecycleManager = new LifecycleManager(this.componentRegistry);
        this.isInitialized = false;
        this.components = new Map();
        this.startTime = null;
        this.initializationMetrics = null;
    }

    /**
     * Initialize the system orchestrator and all components
     * @param {Object} options - Initialization options
     * @param {boolean} options.registerCoreComponents - Whether to register core components
     * @param {boolean} options.parallel - Whether to initialize components in parallel
     * @param {number} options.timeout - Timeout per component in milliseconds
     * @returns {Promise<Object>} Initialization results
     */
    async initialize(options = {}) {
        const {
            registerCoreComponents = true,
            parallel = true,
            timeout = 30000
        } = options;

        if (this.isInitialized) {
            log('warning', 'System orchestrator already initialized');
            return this.initializationMetrics;
        }

        this.startTime = Date.now();
        log('info', '🚀 Initializing System Orchestrator...');

        try {
            // Initialize core managers
            await this.componentRegistry.initialize();
            await this.lifecycleManager.initialize();

            // Register core components if requested
            if (registerCoreComponents) {
                await this.registerCoreComponents();
            }

            // Initialize all registered components
            this.initializationMetrics = await this.lifecycleManager.initializeAll({
                timeout,
                parallel,
                continueOnError: false
            });

            // Store component references for easy access
            this._populateComponentReferences();

            this.isInitialized = true;
            const totalTime = Date.now() - this.startTime;

            log('info', `✅ System Orchestrator initialized successfully in ${totalTime}ms`);
            log('info', `   Components: ${this.initializationMetrics.successful} successful, ${this.initializationMetrics.failed} failed`);

            return {
                ...this.initializationMetrics,
                total_time_ms: totalTime,
                orchestrator_initialized: true
            };

        } catch (error) {
            this.isInitialized = false;
            log('error', `❌ System Orchestrator initialization failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Register core system components
     * @returns {Promise<void>}
     */
    async registerCoreComponents() {
        log('debug', 'Registering core components...');

        try {
            // Register WorkflowOrchestrator
            const workflowOrchestrator = new WorkflowOrchestrator(this.config.workflow);
            this.componentRegistry.register('workflowOrchestrator', workflowOrchestrator, {
                dependencies: [],
                priority: 10,
                healthCheck: () => workflowOrchestrator.getHealth()
            });

            // Register SystemConfig as a component for consistency
            this.componentRegistry.register('systemConfig', this.config, {
                dependencies: [],
                priority: 1,
                healthCheck: () => ({ status: 'healthy', mode: this.config.config.mode })
            });

            // Note: Other components like PerformanceMonitor, ErrorHandler, DatabaseManager
            // would be registered here when they are implemented in future sub-issues

            log('debug', `Registered ${this.componentRegistry.getComponentNames().length} core components`);

        } catch (error) {
            log('error', `Failed to register core components: ${error.message}`);
            throw error;
        }
    }

    /**
     * Register a new component with the orchestrator
     * @param {string} name - Component name
     * @param {Object} component - Component instance
     * @param {Object} config - Component configuration
     * @returns {void}
     */
    registerComponent(name, component, config = {}) {
        if (this.isInitialized) {
            throw new Error('Cannot register components after orchestrator is initialized');
        }

        this.componentRegistry.register(name, component, config);
        log('debug', `Component registered: ${name}`);
    }

    /**
     * Get a component by name
     * @param {string} name - Component name
     * @returns {Object|null} Component instance or null if not found
     */
    getComponent(name) {
        return this.componentRegistry.get(name);
    }

    /**
     * Check if a component is registered
     * @param {string} name - Component name
     * @returns {boolean} True if component is registered
     */
    hasComponent(name) {
        return this.componentRegistry.has(name);
    }

    /**
     * Get all registered component names
     * @returns {Array<string>} Array of component names
     */
    getComponentNames() {
        return this.componentRegistry.getComponentNames();
    }

    /**
     * Process a task through the orchestrated system
     * @param {Object} task - Task to process
     * @param {Object} context - Processing context
     * @returns {Promise<Object>} Processing result
     */
    async processTask(task, context = {}) {
        if (!this.isInitialized) {
            throw new Error('System orchestrator not initialized');
        }

        log('info', `⚙️ Processing task: ${task.id || 'unknown'}`);

        try {
            const workflowOrchestrator = this.getComponent('workflowOrchestrator');
            if (!workflowOrchestrator) {
                throw new Error('WorkflowOrchestrator component not available');
            }

            // Create workflow definition for the task
            const workflowDefinition = this._createTaskWorkflowDefinition(task, context);

            // Start workflow execution
            const workflowId = await workflowOrchestrator.startWorkflow(workflowDefinition);

            // Monitor workflow progress
            const result = await this._monitorWorkflowExecution(workflowOrchestrator, workflowId);

            log('info', `✅ Task processing completed: ${task.id || 'unknown'}`);
            return result;

        } catch (error) {
            log('error', `❌ Task processing failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create workflow definition for a task
     * @param {Object} task - Task to process
     * @param {Object} context - Processing context
     * @returns {Object} Workflow definition
     * @private
     */
    _createTaskWorkflowDefinition(task, context) {
        return {
            id: `task_${task.id || Date.now()}`,
            name: `Process Task: ${task.title || 'Untitled'}`,
            type: 'task_processing',
            context: {
                task,
                context,
                orchestrator: this
            },
            steps: [
                {
                    id: 'validate_task',
                    name: 'Validate Task',
                    type: 'validation',
                    status: 'pending'
                },
                {
                    id: 'process_requirements',
                    name: 'Process Requirements',
                    type: 'requirement_processing',
                    status: 'pending'
                },
                {
                    id: 'generate_code',
                    name: 'Generate Code',
                    type: 'code_generation',
                    status: 'pending'
                },
                {
                    id: 'validate_output',
                    name: 'Validate Output',
                    type: 'output_validation',
                    status: 'pending'
                }
            ]
        };
    }

    /**
     * Monitor workflow execution
     * @param {Object} workflowOrchestrator - Workflow orchestrator instance
     * @param {string} workflowId - Workflow ID
     * @returns {Promise<Object>} Workflow result
     * @private
     */
    async _monitorWorkflowExecution(workflowOrchestrator, workflowId) {
        const maxWaitTime = 300000; // 5 minutes
        const pollInterval = 1000; // 1 second
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitTime) {
            const status = await workflowOrchestrator.getWorkflowStatus(workflowId);
            
            if (status.status === 'completed') {
                return status.result;
            }
            
            if (status.status === 'failed') {
                throw new Error(`Workflow failed: ${status.error || 'Unknown error'}`);
            }
            
            if (status.status === 'not_found') {
                throw new Error(`Workflow not found: ${workflowId}`);
            }

            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        throw new Error(`Workflow execution timeout: ${workflowId}`);
    }

    /**
     * Populate component references for easy access
     * @private
     */
    _populateComponentReferences() {
        const componentNames = this.componentRegistry.getComponentNames();
        
        for (const name of componentNames) {
            const component = this.componentRegistry.get(name);
            if (component) {
                this.components.set(name, component);
            }
        }
    }

    /**
     * Get system health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        if (!this.isInitialized) {
            return {
                status: 'unhealthy',
                reason: 'System orchestrator not initialized',
                components: {}
            };
        }

        try {
            const lifecycleHealth = await this.lifecycleManager.getHealth();
            const componentHealth = await this.componentRegistry.runHealthChecks();
            
            const unhealthyComponents = Object.entries(componentHealth)
                .filter(([, result]) => result.status !== 'healthy')
                .map(([name]) => name);

            const overallStatus = unhealthyComponents.length === 0 ? 'healthy' : 'degraded';

            return {
                status: overallStatus,
                is_initialized: this.isInitialized,
                uptime_ms: this.startTime ? Date.now() - this.startTime : 0,
                total_components: lifecycleHealth.total_components,
                unhealthy_components: unhealthyComponents,
                lifecycle_health: lifecycleHealth,
                component_health: componentHealth
            };

        } catch (error) {
            return {
                status: 'unhealthy',
                reason: `Health check failed: ${error.message}`,
                is_initialized: this.isInitialized
            };
        }
    }

    /**
     * Get system statistics
     * @returns {Promise<Object>} System statistics
     */
    async getStatistics() {
        const lifecycleStats = this.lifecycleManager.getStatistics();
        const registryStats = this.componentRegistry.getStatistics();

        return {
            is_initialized: this.isInitialized,
            uptime_ms: this.startTime ? Date.now() - this.startTime : 0,
            initialization_metrics: this.initializationMetrics,
            lifecycle_stats: lifecycleStats,
            registry_stats: registryStats,
            config_summary: this.config.getSummary()
        };
    }

    /**
     * Get detailed component information
     * @returns {Array<Object>} Detailed component information
     */
    getComponentDetails() {
        return this.componentRegistry.getDetailedInfo();
    }

    /**
     * Restart a specific component
     * @param {string} name - Component name
     * @param {Object} options - Restart options
     * @returns {Promise<void>}
     */
    async restartComponent(name, options = {}) {
        if (!this.isInitialized) {
            throw new Error('System orchestrator not initialized');
        }

        log('info', `🔄 Restarting component: ${name}`);
        
        try {
            await this.lifecycleManager.restartComponent(name, options);
            
            // Update component reference
            const component = this.componentRegistry.get(name);
            if (component) {
                this.components.set(name, component);
            }
            
            log('info', `✅ Component restarted: ${name}`);
        } catch (error) {
            log('error', `❌ Component restart failed: ${name} - ${error.message}`);
            throw error;
        }
    }

    /**
     * Pause the orchestrator (pause all workflows)
     * @param {string} reason - Pause reason
     * @returns {Promise<void>}
     */
    async pause(reason = 'Manual pause') {
        if (!this.isInitialized) {
            throw new Error('System orchestrator not initialized');
        }

        log('info', `⏸️ Pausing system orchestrator: ${reason}`);
        
        const workflowOrchestrator = this.getComponent('workflowOrchestrator');
        if (workflowOrchestrator) {
            // Note: This would pause all active workflows
            // Implementation depends on WorkflowOrchestrator having a pauseAll method
            log('debug', 'Workflow orchestrator pause functionality not yet implemented');
        }
    }

    /**
     * Resume the orchestrator
     * @returns {Promise<void>}
     */
    async resume() {
        if (!this.isInitialized) {
            throw new Error('System orchestrator not initialized');
        }

        log('info', '▶️ Resuming system orchestrator');
        
        const workflowOrchestrator = this.getComponent('workflowOrchestrator');
        if (workflowOrchestrator) {
            // Note: This would resume all paused workflows
            // Implementation depends on WorkflowOrchestrator having a resumeAll method
            log('debug', 'Workflow orchestrator resume functionality not yet implemented');
        }
    }

    /**
     * Shutdown the system orchestrator and all components
     * @param {Object} options - Shutdown options
     * @param {boolean} options.force - Whether to force shutdown
     * @param {number} options.timeout - Timeout per component
     * @returns {Promise<Object>} Shutdown results
     */
    async shutdown(options = {}) {
        const { force = true, timeout = 30000 } = options;

        log('info', '🛑 Shutting down System Orchestrator...');

        try {
            // Shutdown all components
            const shutdownResults = await this.lifecycleManager.shutdownAll({
                timeout,
                force
            });

            // Shutdown managers
            await this.lifecycleManager.shutdown();
            await this.componentRegistry.shutdown();

            // Clear state
            this.components.clear();
            this.isInitialized = false;
            this.initializationMetrics = null;

            const totalTime = this.startTime ? Date.now() - this.startTime : 0;
            log('info', `✅ System Orchestrator shutdown completed (uptime: ${totalTime}ms)`);

            return {
                ...shutdownResults,
                total_uptime_ms: totalTime,
                orchestrator_shutdown: true
            };

        } catch (error) {
            log('error', `❌ System Orchestrator shutdown failed: ${error.message}`);
            throw error;
        }
    }
}

export default SystemOrchestrator;
