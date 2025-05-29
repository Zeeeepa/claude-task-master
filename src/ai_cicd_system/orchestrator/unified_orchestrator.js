/**
 * @fileoverview Unified Orchestrator - Consolidates all orchestration functionality
 * @description Combines SystemOrchestrator, WorkflowOrchestrator, and TaskOrchestrator into a single unified system
 */

import { log } from '../utils/simple_logger.js';
import { SystemOrchestrator } from './system_orchestrator.js';
import { WorkflowOrchestrator } from '../core/workflow_orchestrator.js';
import { TaskOrchestrator } from '../../orchestrator/task_orchestrator.js';
import { ComponentRegistry } from './component_registry.js';
import { LifecycleManager } from './lifecycle_manager.js';

/**
 * Unified Orchestrator - Central coordination hub for all orchestration needs
 * Consolidates system, workflow, and task orchestration into a single interface
 */
export class UnifiedOrchestrator {
	constructor(config = {}) {
		this.config = {
			// System orchestration config
			enableParallelInitialization: config.enableParallelInitialization ?? true,
			componentInitializationTimeout: config.componentInitializationTimeout ?? 30000,
			enableHealthMonitoring: config.enableHealthMonitoring ?? true,
			healthCheckInterval: config.healthCheckInterval ?? 60000,
			enableComponentRestart: config.enableComponentRestart ?? true,
			maxRestartAttempts: config.maxRestartAttempts ?? 3,
			restartDelay: config.restartDelay ?? 5000,

			// Workflow orchestration config
			maxConcurrentWorkflows: config.maxConcurrentWorkflows ?? 10,
			maxConcurrentSteps: config.maxConcurrentSteps ?? 5,
			stepTimeout: config.stepTimeout ?? 300000,
			enableParallelExecution: config.enableParallelExecution ?? true,
			enableStatePersistence: config.enableStatePersistence ?? true,
			enableRollback: config.enableRollback ?? true,
			maxHistoryEntries: config.maxHistoryEntries ?? 1000,

			// Task orchestration config
			maxParallelTasks: config.maxParallelTasks ?? 20,
			maxStageRetries: config.maxStageRetries ?? 3,
			timeoutMs: config.timeoutMs ?? 1800000,
			retryDelay: config.retryDelay ?? 30000,

			...config
		};

		// Initialize component orchestrators
		this.systemOrchestrator = new SystemOrchestrator(this.config);
		this.workflowOrchestrator = new WorkflowOrchestrator(this.config);
		this.taskOrchestrator = new TaskOrchestrator(this.config);

		// Shared components
		this.componentRegistry = new ComponentRegistry();
		this.lifecycleManager = new LifecycleManager(this.config);

		// State management
		this.isInitialized = false;
		this.isRunning = false;
		this.activeWorkflows = new Map();
		this.activeTasks = new Map();
		this.systemComponents = new Map();

		// Metrics
		this.metrics = {
			systemStartTime: Date.now(),
			totalWorkflowsProcessed: 0,
			totalTasksProcessed: 0,
			totalComponentsManaged: 0,
			successfulOperations: 0,
			failedOperations: 0
		};
	}

	/**
	 * Initialize the unified orchestrator system
	 * @returns {Promise<void>}
	 */
	async initialize() {
		if (this.isInitialized) {
			log('warn', 'UnifiedOrchestrator already initialized');
			return;
		}

		log('info', '🚀 Initializing Unified Orchestrator System');

		try {
			// Initialize component registry
			await this.componentRegistry.initialize();

			// Initialize lifecycle manager
			await this.lifecycleManager.initialize();

			// Initialize sub-orchestrators in parallel
			if (this.config.enableParallelInitialization) {
				await Promise.all([
					this.systemOrchestrator.initialize(),
					this.workflowOrchestrator.initialize(),
					this.taskOrchestrator.initialize()
				]);
			} else {
				await this.systemOrchestrator.initialize();
				await this.workflowOrchestrator.initialize();
				await this.taskOrchestrator.initialize();
			}

			// Register system components
			await this.registerSystemComponents();

			// Start health monitoring if enabled
			if (this.config.enableHealthMonitoring) {
				this.startHealthMonitoring();
			}

			this.isInitialized = true;
			this.isRunning = true;

			log('info', '✅ Unified Orchestrator System initialized successfully');

		} catch (error) {
			log('error', '❌ Failed to initialize Unified Orchestrator System', { error: error.message });
			throw error;
		}
	}

	/**
	 * Register system components with the unified orchestrator
	 * @returns {Promise<void>}
	 */
	async registerSystemComponents() {
		// Register orchestrator components
		this.componentRegistry.register('systemOrchestrator', this.systemOrchestrator);
		this.componentRegistry.register('workflowOrchestrator', this.workflowOrchestrator);
		this.componentRegistry.register('taskOrchestrator', this.taskOrchestrator);
		this.componentRegistry.register('lifecycleManager', this.lifecycleManager);

		// Register with lifecycle manager
		await this.lifecycleManager.registerComponent('unifiedOrchestrator', this);

		this.metrics.totalComponentsManaged = this.componentRegistry.getComponentCount();
	}

	/**
	 * Process a task through the unified orchestration system
	 * @param {Object} task - Task to process
	 * @param {Object} options - Processing options
	 * @returns {Promise<Object>} Processing result
	 */
	async processTask(task, options = {}) {
		if (!this.isInitialized) {
			throw new Error('UnifiedOrchestrator not initialized');
		}

		const taskId = task.id || `task_${Date.now()}`;
		const startTime = Date.now();

		log('info', '📋 Processing task through unified orchestrator', {
			taskId,
			title: task.title,
			type: task.type
		});

		try {
			// Create workflow for task
			const workflow = await this.workflowOrchestrator.createWorkflow({
				id: `workflow_${taskId}`,
				type: task.type || 'default',
				task: task,
				options: options
			});

			this.activeWorkflows.set(workflow.id, workflow);

			// Process task through task orchestrator
			const taskResult = await this.taskOrchestrator.processTask(task, {
				workflowId: workflow.id,
				...options
			});

			this.activeTasks.set(taskId, taskResult);

			// Execute workflow
			const workflowResult = await this.workflowOrchestrator.executeWorkflow(workflow.id);

			// Combine results
			const result = {
				taskId,
				workflowId: workflow.id,
				success: true,
				duration: Date.now() - startTime,
				taskResult,
				workflowResult,
				metrics: {
					stagesCompleted: workflowResult.stagesCompleted || 0,
					totalStages: workflowResult.totalStages || 0,
					retryCount: taskResult.retryCount || 0
				}
			};

			this.metrics.totalTasksProcessed++;
			this.metrics.totalWorkflowsProcessed++;
			this.metrics.successfulOperations++;

			log('info', '✅ Task processed successfully', {
				taskId,
				duration: result.duration,
				stagesCompleted: result.metrics.stagesCompleted
			});

			return result;

		} catch (error) {
			this.metrics.failedOperations++;

			log('error', '❌ Task processing failed', {
				taskId,
				error: error.message,
				duration: Date.now() - startTime
			});

			throw error;

		} finally {
			// Cleanup
			this.activeWorkflows.delete(`workflow_${taskId}`);
			this.activeTasks.delete(taskId);
		}
	}

	/**
	 * Create and execute a workflow
	 * @param {Object} workflowConfig - Workflow configuration
	 * @returns {Promise<Object>} Workflow result
	 */
	async executeWorkflow(workflowConfig) {
		if (!this.isInitialized) {
			throw new Error('UnifiedOrchestrator not initialized');
		}

		return await this.workflowOrchestrator.executeWorkflow(workflowConfig);
	}

	/**
	 * Manage system components
	 * @param {string} action - Action to perform (start, stop, restart, status)
	 * @param {string} componentName - Component name (optional)
	 * @returns {Promise<Object>} Action result
	 */
	async manageComponents(action, componentName = null) {
		if (!this.isInitialized) {
			throw new Error('UnifiedOrchestrator not initialized');
		}

		return await this.systemOrchestrator.manageComponents(action, componentName);
	}

	/**
	 * Get system health status
	 * @returns {Promise<Object>} Health status
	 */
	async getHealthStatus() {
		if (!this.isInitialized) {
			return {
				status: 'not_initialized',
				message: 'UnifiedOrchestrator not initialized'
			};
		}

		try {
			const [systemHealth, workflowHealth, taskHealth] = await Promise.all([
				this.systemOrchestrator.getHealthStatus(),
				this.workflowOrchestrator.getHealthStatus(),
				this.taskOrchestrator.getHealthStatus()
			]);

			const overallStatus = [systemHealth, workflowHealth, taskHealth].every(h => h.status === 'healthy') 
				? 'healthy' 
				: 'unhealthy';

			return {
				status: overallStatus,
				timestamp: new Date(),
				uptime: Date.now() - this.metrics.systemStartTime,
				components: {
					system: systemHealth,
					workflow: workflowHealth,
					task: taskHealth
				},
				metrics: this.metrics,
				activeOperations: {
					workflows: this.activeWorkflows.size,
					tasks: this.activeTasks.size,
					components: this.systemComponents.size
				}
			};

		} catch (error) {
			return {
				status: 'error',
				message: error.message,
				timestamp: new Date()
			};
		}
	}

	/**
	 * Get comprehensive system metrics
	 * @returns {Object} System metrics
	 */
	getMetrics() {
		return {
			...this.metrics,
			uptime: Date.now() - this.metrics.systemStartTime,
			activeOperations: {
				workflows: this.activeWorkflows.size,
				tasks: this.activeTasks.size,
				components: this.systemComponents.size
			},
			componentMetrics: {
				system: this.systemOrchestrator.getMetrics(),
				workflow: this.workflowOrchestrator.getMetrics(),
				task: this.taskOrchestrator.getMetrics()
			}
		};
	}

	/**
	 * Start health monitoring
	 * @private
	 */
	startHealthMonitoring() {
		if (this.healthMonitorInterval) {
			clearInterval(this.healthMonitorInterval);
		}

		this.healthMonitorInterval = setInterval(async () => {
			try {
				const health = await this.getHealthStatus();
				
				if (health.status !== 'healthy') {
					log('warn', '⚠️ System health check failed', { health });
					
					// Attempt component restart if enabled
					if (this.config.enableComponentRestart) {
						await this.attemptComponentRecovery();
					}
				}

			} catch (error) {
				log('error', '❌ Health monitoring error', { error: error.message });
			}
		}, this.config.healthCheckInterval);

		log('info', '💓 Health monitoring started', {
			interval: this.config.healthCheckInterval
		});
	}

	/**
	 * Attempt to recover unhealthy components
	 * @private
	 */
	async attemptComponentRecovery() {
		log('info', '🔄 Attempting component recovery');

		try {
			// Check each orchestrator and attempt restart if needed
			const orchestrators = [
				{ name: 'system', instance: this.systemOrchestrator },
				{ name: 'workflow', instance: this.workflowOrchestrator },
				{ name: 'task', instance: this.taskOrchestrator }
			];

			for (const orchestrator of orchestrators) {
				try {
					const health = await orchestrator.instance.getHealthStatus();
					
					if (health.status !== 'healthy') {
						log('info', `🔄 Restarting ${orchestrator.name} orchestrator`);
						await orchestrator.instance.restart();
					}

				} catch (error) {
					log('error', `❌ Failed to restart ${orchestrator.name} orchestrator`, {
						error: error.message
					});
				}
			}

		} catch (error) {
			log('error', '❌ Component recovery failed', { error: error.message });
		}
	}

	/**
	 * Gracefully shutdown the unified orchestrator
	 * @returns {Promise<void>}
	 */
	async shutdown() {
		if (!this.isRunning) {
			log('warn', 'UnifiedOrchestrator already stopped');
			return;
		}

		log('info', '🛑 Shutting down Unified Orchestrator System');

		try {
			// Stop health monitoring
			if (this.healthMonitorInterval) {
				clearInterval(this.healthMonitorInterval);
				this.healthMonitorInterval = null;
			}

			// Cancel active operations
			await this.cancelActiveOperations();

			// Shutdown sub-orchestrators
			await Promise.all([
				this.systemOrchestrator.shutdown(),
				this.workflowOrchestrator.shutdown(),
				this.taskOrchestrator.shutdown()
			]);

			// Shutdown lifecycle manager
			await this.lifecycleManager.shutdown();

			// Shutdown component registry
			await this.componentRegistry.shutdown();

			this.isRunning = false;

			log('info', '✅ Unified Orchestrator System shutdown complete');

		} catch (error) {
			log('error', '❌ Error during shutdown', { error: error.message });
			throw error;
		}
	}

	/**
	 * Cancel all active operations
	 * @private
	 */
	async cancelActiveOperations() {
		log('info', '🚫 Cancelling active operations', {
			workflows: this.activeWorkflows.size,
			tasks: this.activeTasks.size
		});

		// Cancel active workflows
		const workflowCancellations = Array.from(this.activeWorkflows.keys()).map(async (workflowId) => {
			try {
				await this.workflowOrchestrator.cancelWorkflow(workflowId);
			} catch (error) {
				log('error', `Failed to cancel workflow ${workflowId}`, { error: error.message });
			}
		});

		// Cancel active tasks
		const taskCancellations = Array.from(this.activeTasks.keys()).map(async (taskId) => {
			try {
				await this.taskOrchestrator.cancelTask(taskId);
			} catch (error) {
				log('error', `Failed to cancel task ${taskId}`, { error: error.message });
			}
		});

		await Promise.all([...workflowCancellations, ...taskCancellations]);

		this.activeWorkflows.clear();
		this.activeTasks.clear();
	}

	/**
	 * Get active operations summary
	 * @returns {Object} Active operations
	 */
	getActiveOperations() {
		return {
			workflows: Array.from(this.activeWorkflows.entries()).map(([id, workflow]) => ({
				id,
				type: workflow.type,
				status: workflow.status,
				startTime: workflow.startTime
			})),
			tasks: Array.from(this.activeTasks.entries()).map(([id, task]) => ({
				id,
				title: task.title,
				status: task.status,
				startTime: task.startTime
			})),
			components: Array.from(this.systemComponents.entries()).map(([name, component]) => ({
				name,
				status: component.status,
				lastHealthCheck: component.lastHealthCheck
			}))
		};
	}
}

/**
 * Create and initialize a unified orchestrator instance
 * @param {Object} config - Configuration options
 * @returns {Promise<UnifiedOrchestrator>} Initialized orchestrator
 */
export async function createUnifiedOrchestrator(config = {}) {
	const orchestrator = new UnifiedOrchestrator(config);
	await orchestrator.initialize();
	return orchestrator;
}

export default UnifiedOrchestrator;

