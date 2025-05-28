/**
 * @fileoverview Orchestrator Usage Example
 * @description Example demonstrating how to use the System Orchestrator
 */

import { UnifiedSystem } from '../core/unified_system.js';
import { SystemOrchestrator } from '../orchestrator/system_orchestrator.js';
import {
	ComponentInterface,
	ServiceComponentInterface
} from '../core/component_interface.js';
import { log } from '../../../scripts/modules/utils.js';

// Example custom service component
class ExampleService extends ServiceComponentInterface {
	constructor(config = {}) {
		super(config);
		this.name = 'ExampleService';
		this.version = '1.0.0';
		this.processedTasks = 0;
	}

	async initialize() {
		log('info', `Initializing ${this.name}...`);

		// Register service endpoints
		this.registerEndpoint('processTask', this.processTask.bind(this));
		this.registerEndpoint('getStats', this.getStats.bind(this));
		this.registerEndpoint('reset', this.reset.bind(this));

		this.isInitialized = true;
		log('info', `${this.name} initialized successfully`);
	}

	async processTask(task) {
		log('debug', `Processing task: ${task.id}`);

		// Simulate task processing
		await new Promise((resolve) => setTimeout(resolve, 100));

		this.processedTasks++;

		return {
			task_id: task.id,
			processed_by: this.name,
			processed_at: new Date().toISOString(),
			result: 'success'
		};
	}

	async getStats() {
		return {
			service: this.name,
			processed_tasks: this.processedTasks,
			uptime: this.isInitialized ? 'running' : 'stopped'
		};
	}

	async reset() {
		this.processedTasks = 0;
		return { message: 'Stats reset successfully' };
	}

	async getHealth() {
		return {
			status: this.isInitialized ? 'healthy' : 'unhealthy',
			name: this.name,
			version: this.version,
			processed_tasks: this.processedTasks
		};
	}

	async shutdown() {
		log('info', `Shutting down ${this.name}...`);
		this.isInitialized = false;
		log('info', `${this.name} shutdown complete`);
	}
}

// Example storage component
class ExampleStorage extends ComponentInterface {
	constructor(config = {}) {
		super(config);
		this.name = 'ExampleStorage';
		this.version = '1.0.0';
		this.dependencies = ['ExampleService'];
		this.storage = new Map();
	}

	async initialize() {
		log('info', `Initializing ${this.name}...`);
		this.isInitialized = true;
		log('info', `${this.name} initialized successfully`);
	}

	async store(key, value) {
		this.storage.set(key, {
			value,
			stored_at: new Date().toISOString()
		});
		return true;
	}

	async retrieve(key) {
		return this.storage.get(key) || null;
	}

	async list() {
		return Array.from(this.storage.keys());
	}

	async clear() {
		this.storage.clear();
		return true;
	}

	async getHealth() {
		return {
			status: this.isInitialized ? 'healthy' : 'unhealthy',
			name: this.name,
			version: this.version,
			stored_items: this.storage.size
		};
	}

	async shutdown() {
		log('info', `Shutting down ${this.name}...`);
		this.isInitialized = false;
		log('info', `${this.name} shutdown complete`);
	}
}

/**
 * Example 1: Basic Orchestrator Usage
 */
async function basicOrchestratorExample() {
	log('info', '🚀 Starting Basic Orchestrator Example');

	try {
		// Create orchestrator with custom configuration
		const orchestrator = new SystemOrchestrator({
			mode: 'development',
			orchestrator: {
				enable_parallel_initialization: true,
				component_initialization_timeout: 10000
			}
		});

		// Register custom components
		const exampleService = new ExampleService();
		const exampleStorage = new ExampleStorage();

		orchestrator.registerComponent('exampleService', exampleService, {
			priority: 10,
			healthCheck: () => exampleService.getHealth()
		});

		orchestrator.registerComponent('exampleStorage', exampleStorage, {
			dependencies: ['exampleService'],
			priority: 20,
			healthCheck: () => exampleStorage.getHealth()
		});

		// Initialize the orchestrator
		log('info', 'Initializing orchestrator...');
		const initResults = await orchestrator.initialize();
		log(
			'info',
			`Orchestrator initialized: ${initResults.successful} components successful`
		);

		// Get system health
		const health = await orchestrator.getHealth();
		log('info', `System health: ${health.status}`);

		// Use the components
		const service = orchestrator.getComponent('exampleService');
		const storage = orchestrator.getComponent('exampleStorage');

		// Process some tasks
		const task1 = { id: 'task-1', title: 'Example Task 1' };
		const task2 = { id: 'task-2', title: 'Example Task 2' };

		const result1 = await service.callEndpoint('processTask', task1);
		const result2 = await service.callEndpoint('processTask', task2);

		log('info', `Task 1 result: ${JSON.stringify(result1)}`);
		log('info', `Task 2 result: ${JSON.stringify(result2)}`);

		// Store results
		await storage.store('task-1-result', result1);
		await storage.store('task-2-result', result2);

		// Get service stats
		const stats = await service.callEndpoint('getStats');
		log('info', `Service stats: ${JSON.stringify(stats)}`);

		// Get final health check
		const finalHealth = await orchestrator.getHealth();
		log('info', `Final system health: ${finalHealth.status}`);

		// Shutdown
		await orchestrator.shutdown();
		log('info', '✅ Basic Orchestrator Example completed successfully');
	} catch (error) {
		log('error', `❌ Basic Orchestrator Example failed: ${error.message}`);
		throw error;
	}
}

/**
 * Example 2: Unified System Usage
 */
async function unifiedSystemExample() {
	log('info', '🌟 Starting Unified System Example');

	try {
		// Create unified system for development
		const system = UnifiedSystem.forDevelopment({
			orchestrator: {
				enable_parallel_initialization: true
			}
		});

		// Register custom components
		const exampleService = new ExampleService();
		system.registerComponent('exampleService', exampleService, {
			healthCheck: () => exampleService.getHealth()
		});

		// Start the system
		log('info', 'Starting unified system...');
		const startResults = await system.start();
		log('info', `System started in ${startResults.startup_time_ms}ms`);

		// Process tasks through the unified system
		const tasks = [
			{
				id: 'unified-task-1',
				title: 'Unified Task 1',
				description: 'First unified task'
			},
			{
				id: 'unified-task-2',
				title: 'Unified Task 2',
				description: 'Second unified task'
			},
			{
				id: 'unified-task-3',
				title: 'Unified Task 3',
				description: 'Third unified task'
			}
		];

		// Process tasks in batch
		log('info', 'Processing batch of tasks...');
		const batchResults = await system.processBatch(tasks, {
			parallel: true,
			continueOnError: true
		});

		log(
			'info',
			`Batch processing completed: ${batchResults.successful} successful, ${batchResults.failed} failed`
		);

		// Get system statistics
		const stats = await system.getStatistics();
		log(
			'info',
			`System processed ${stats.system_metrics.totalRequests} total requests`
		);
		log(
			'info',
			`Average response time: ${stats.system_metrics.averageResponseTime.toFixed(2)}ms`
		);

		// Stop the system
		await system.stop();
		log('info', '✅ Unified System Example completed successfully');
	} catch (error) {
		log('error', `❌ Unified System Example failed: ${error.message}`);
		throw error;
	}
}

/**
 * Example 3: Error Handling and Recovery
 */
async function errorHandlingExample() {
	log('info', '🛠️ Starting Error Handling Example');

	try {
		const orchestrator = new SystemOrchestrator({
			mode: 'development'
		});

		// Create a component that will fail initially
		class FlakeyComponent extends ComponentInterface {
			constructor() {
				super();
				this.name = 'FlakeyComponent';
				this.initAttempts = 0;
			}

			async initialize() {
				this.initAttempts++;
				if (this.initAttempts === 1) {
					throw new Error('Simulated initialization failure');
				}
				this.isInitialized = true;
				log('info', 'FlakeyComponent initialized successfully on retry');
			}

			async getHealth() {
				return {
					status: this.isInitialized ? 'healthy' : 'unhealthy',
					name: this.name,
					init_attempts: this.initAttempts
				};
			}
		}

		const flakeyComponent = new FlakeyComponent();
		const goodComponent = new ExampleService();

		orchestrator.registerComponent('flakey', flakeyComponent);
		orchestrator.registerComponent('good', goodComponent);

		// First initialization will fail
		try {
			await orchestrator.initialize();
		} catch (error) {
			log('warning', `Expected initialization failure: ${error.message}`);
		}

		// Restart the failed component
		log('info', 'Attempting to restart failed component...');
		await orchestrator.restartComponent('flakey');

		// Check health after restart
		const health = await orchestrator.getHealth();
		log('info', `System health after restart: ${health.status}`);

		await orchestrator.shutdown();
		log('info', '✅ Error Handling Example completed successfully');
	} catch (error) {
		log('error', `❌ Error Handling Example failed: ${error.message}`);
		throw error;
	}
}

/**
 * Example 4: Performance Monitoring
 */
async function performanceExample() {
	log('info', '📊 Starting Performance Example');

	try {
		const system = UnifiedSystem.forTesting();

		// Add a performance monitoring component
		class PerformanceMonitor extends ComponentInterface {
			constructor() {
				super();
				this.name = 'PerformanceMonitor';
				this.metrics = new Map();
			}

			async initialize() {
				this.isInitialized = true;
				this.startTime = Date.now();
			}

			recordMetric(name, value) {
				this.metrics.set(name, {
					value,
					timestamp: Date.now()
				});
			}

			getMetrics() {
				const result = {};
				for (const [name, metric] of this.metrics) {
					result[name] = metric;
				}
				return result;
			}

			async getHealth() {
				return {
					status: 'healthy',
					name: this.name,
					uptime_ms: Date.now() - this.startTime,
					metrics_count: this.metrics.size
				};
			}
		}

		const perfMonitor = new PerformanceMonitor();
		system.registerComponent('perfMonitor', perfMonitor);

		await system.start();

		// Simulate load and measure performance
		const taskCount = 20;
		const tasks = Array.from({ length: taskCount }, (_, i) => ({
			id: `perf-task-${i}`,
			title: `Performance Task ${i}`
		}));

		const startTime = Date.now();
		const results = await system.processBatch(tasks, {
			parallel: true,
			maxConcurrency: 5
		});
		const duration = Date.now() - startTime;

		// Record performance metrics
		perfMonitor.recordMetric('batch_processing_time', duration);
		perfMonitor.recordMetric('tasks_processed', results.successful);
		perfMonitor.recordMetric(
			'throughput_tasks_per_second',
			results.successful / (duration / 1000)
		);

		const metrics = perfMonitor.getMetrics();
		log('info', `Performance metrics: ${JSON.stringify(metrics, null, 2)}`);

		const finalStats = await system.getStatistics();
		log(
			'info',
			`Final system stats: Success rate: ${((finalStats.system_metrics.successfulRequests / finalStats.system_metrics.totalRequests) * 100).toFixed(2)}%`
		);

		await system.stop();
		log('info', '✅ Performance Example completed successfully');
	} catch (error) {
		log('error', `❌ Performance Example failed: ${error.message}`);
		throw error;
	}
}

/**
 * Run all examples
 */
async function runAllExamples() {
	log('info', '🎯 Running All Orchestrator Examples');

	try {
		await basicOrchestratorExample();
		await unifiedSystemExample();
		await errorHandlingExample();
		await performanceExample();

		log('info', '🎉 All examples completed successfully!');
	} catch (error) {
		log('error', `❌ Examples failed: ${error.message}`);
		process.exit(1);
	}
}

// Export examples for use in other modules
export {
	basicOrchestratorExample,
	unifiedSystemExample,
	errorHandlingExample,
	performanceExample,
	runAllExamples,
	ExampleService,
	ExampleStorage
};

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	runAllExamples();
}
