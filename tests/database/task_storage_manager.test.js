/**
 * @fileoverview TaskStorageManager Tests
 * @description Comprehensive tests for PostgreSQL TaskStorageManager implementation
 */

import { jest } from '@jest/globals';
import { TaskStorageManager } from '../../src/ai_cicd_system/core/task_storage_manager.js';
import { Task } from '../../src/ai_cicd_system/database/models/Task.js';
import { TaskContext } from '../../src/ai_cicd_system/database/models/TaskContext.js';

// Mock the database connection
jest.mock('../../src/ai_cicd_system/database/connection.js', () => ({
	getConnection: jest.fn(),
	initializeDatabase: jest.fn()
}));

describe('TaskStorageManager', () => {
	let taskStorageManager;
	let mockConnection;

	beforeEach(() => {
		// Reset mocks
		jest.clearAllMocks();

		// Create mock connection
		mockConnection = {
			initialize: jest.fn(),
			query: jest.fn(),
			transaction: jest.fn(),
			shutdown: jest.fn(),
			getHealth: jest.fn(() => ({ connected: true })),
			isConnected: true
		};

		// Configure mock to run in mock mode for most tests
		taskStorageManager = new TaskStorageManager({
			enable_mock: true,
			auto_migrate: false
		});
	});

	afterEach(async () => {
		if (taskStorageManager.isInitialized) {
			await taskStorageManager.shutdown();
		}
	});

	describe('Initialization', () => {
		test('should initialize in mock mode', async () => {
			await taskStorageManager.initialize();

			expect(taskStorageManager.isInitialized).toBe(true);
			expect(taskStorageManager.config.enable_mock).toBe(true);
		});

		test('should handle initialization errors gracefully', async () => {
			const dbTaskStorage = new TaskStorageManager({
				enable_mock: false,
				auto_migrate: false
			});

			// Mock database initialization failure
			const { initializeDatabase } = await import(
				'../../src/ai_cicd_system/database/connection.js'
			);
			initializeDatabase.mockRejectedValue(
				new Error('Database connection failed')
			);

			await dbTaskStorage.initialize();

			// Should fallback to mock mode
			expect(dbTaskStorage.config.enable_mock).toBe(true);
			expect(dbTaskStorage.isInitialized).toBe(true);
		});
	});

	describe('Task Storage Operations', () => {
		beforeEach(async () => {
			await taskStorageManager.initialize();
		});

		test('should store a task successfully', async () => {
			const task = {
				title: 'Test Task',
				description: 'Test task description',
				type: 'feature',
				priority: 5,
				complexity_score: 7,
				requirements: ['Requirement 1', 'Requirement 2'],
				acceptance_criteria: ['Criteria 1', 'Criteria 2'],
				affected_files: ['file1.js', 'file2.js'],
				tags: ['frontend', 'urgent']
			};

			const requirement = {
				id: 'req-123',
				description: 'Original requirement'
			};

			const taskId = await taskStorageManager.storeTask(task, requirement);

			expect(taskId).toBeDefined();
			expect(typeof taskId).toBe('string');

			// Verify task was stored
			const storedTask = await taskStorageManager.getTask(taskId);
			expect(storedTask).toBeDefined();
			expect(storedTask.title).toBe(task.title);
			expect(storedTask.description).toBe(task.description);
			expect(storedTask.type).toBe(task.type);
			expect(storedTask.priority).toBe(task.priority);
			expect(storedTask.complexity_score).toBe(task.complexity_score);
		});

		test('should validate task data before storing', async () => {
			const invalidTask = {
				// Missing required title
				description: 'Task without title',
				priority: 15 // Invalid priority (should be 0-10)
			};

			await expect(taskStorageManager.storeTask(invalidTask)).rejects.toThrow(
				'Task validation failed'
			);
		});

		test('should retrieve task by ID', async () => {
			const task = {
				title: 'Retrievable Task',
				description: 'Task for retrieval test'
			};

			const taskId = await taskStorageManager.storeTask(task);
			const retrievedTask = await taskStorageManager.getTask(taskId);

			expect(retrievedTask).toBeDefined();
			expect(retrievedTask.id).toBe(taskId);
			expect(retrievedTask.title).toBe(task.title);
		});

		test('should return null for non-existent task', async () => {
			const nonExistentTask =
				await taskStorageManager.getTask('non-existent-id');
			expect(nonExistentTask).toBeNull();
		});

		test('should update task successfully', async () => {
			const task = {
				title: 'Original Title',
				description: 'Original description',
				priority: 3
			};

			const taskId = await taskStorageManager.storeTask(task);

			const updates = {
				title: 'Updated Title',
				priority: 8,
				estimated_hours: 5.5
			};

			await taskStorageManager.updateTask(taskId, updates);

			const updatedTask = await taskStorageManager.getTask(taskId);
			expect(updatedTask.title).toBe(updates.title);
			expect(updatedTask.priority).toBe(updates.priority);
			expect(updatedTask.estimated_hours).toBe(updates.estimated_hours);
		});

		test('should update task status with context tracking', async () => {
			const task = {
				title: 'Status Update Task',
				description: 'Task for status update test'
			};

			const taskId = await taskStorageManager.storeTask(task);

			await taskStorageManager.updateTaskStatus(taskId, 'in_progress', {
				started_by: 'test-user',
				notes: 'Starting work on this task'
			});

			const updatedTask = await taskStorageManager.getTask(taskId);
			expect(updatedTask.status).toBe('in_progress');

			// Check that status change context was stored
			const context = await taskStorageManager.getTaskContext(taskId);
			const statusChangeContext = context.find(
				(c) => c.context_type === 'status_change'
			);
			expect(statusChangeContext).toBeDefined();
			expect(statusChangeContext.context_data.from_status).toBe('pending');
			expect(statusChangeContext.context_data.to_status).toBe('in_progress');
		});

		test('should mark task as completed', async () => {
			const task = {
				title: 'Completable Task',
				estimated_hours: 4
			};

			const taskId = await taskStorageManager.storeTask(task);

			await taskStorageManager.markTaskCompleted(taskId, {
				actual_hours: 3.5,
				completion_notes: 'Task completed successfully'
			});

			const completedTask = await taskStorageManager.getTask(taskId);
			expect(completedTask.status).toBe('completed');
			expect(completedTask.actual_hours).toBe(3.5);
			expect(completedTask.completed_at).toBeDefined();
		});

		test('should delete task (soft delete)', async () => {
			const task = {
				title: 'Deletable Task',
				description: 'Task for deletion test'
			};

			const taskId = await taskStorageManager.storeTask(task);

			await taskStorageManager.deleteTask(taskId);

			// In mock mode, task is actually deleted
			const deletedTask = await taskStorageManager.getTask(taskId);
			expect(deletedTask).toBeNull();
		});
	});

	describe('Task Listing and Filtering', () => {
		beforeEach(async () => {
			await taskStorageManager.initialize();

			// Create test tasks
			const tasks = [
				{
					title: 'High Priority Task',
					priority: 9,
					status: 'pending',
					type: 'bug'
				},
				{
					title: 'Medium Priority Task',
					priority: 5,
					status: 'in_progress',
					type: 'feature'
				},
				{
					title: 'Low Priority Task',
					priority: 2,
					status: 'completed',
					type: 'feature'
				},
				{
					title: 'Another High Priority',
					priority: 8,
					status: 'pending',
					type: 'enhancement'
				}
			];

			for (const task of tasks) {
				await taskStorageManager.storeTask(task);
			}
		});

		test('should list all tasks', async () => {
			const allTasks = await taskStorageManager.listTasks();
			expect(allTasks).toHaveLength(4);
		});

		test('should filter tasks by status', async () => {
			const pendingTasks = await taskStorageManager.getTasksByStatus('pending');
			expect(pendingTasks).toHaveLength(2);
			expect(pendingTasks.every((task) => task.status === 'pending')).toBe(
				true
			);
		});

		test('should filter tasks by priority', async () => {
			const highPriorityTasks = await taskStorageManager.getTasksByPriority(9);
			expect(highPriorityTasks).toHaveLength(1);
			expect(highPriorityTasks[0].priority).toBe(9);
		});

		test('should get pending tasks', async () => {
			const pendingTasks = await taskStorageManager.getPendingTasks();
			expect(pendingTasks).toHaveLength(2);
			expect(pendingTasks.every((task) => task.status === 'pending')).toBe(
				true
			);
		});

		test('should filter tasks with multiple criteria', async () => {
			const filteredTasks = await taskStorageManager.listTasks({
				type: 'feature',
				status: 'in_progress'
			});
			expect(filteredTasks).toHaveLength(1);
			expect(filteredTasks[0].type).toBe('feature');
			expect(filteredTasks[0].status).toBe('in_progress');
		});

		test('should support pagination', async () => {
			const firstPage = await taskStorageManager.listTasks({
				limit: 2,
				offset: 0
			});
			expect(firstPage).toHaveLength(2);

			const secondPage = await taskStorageManager.listTasks({
				limit: 2,
				offset: 2
			});
			expect(secondPage).toHaveLength(2);
		});

		test('should support sorting', async () => {
			const tasksByPriority = await taskStorageManager.listTasks({
				sort_by: 'priority',
				sort_order: 'DESC'
			});

			expect(tasksByPriority[0].priority).toBeGreaterThanOrEqual(
				tasksByPriority[1].priority
			);
		});
	});

	describe('Context Management', () => {
		let taskId;

		beforeEach(async () => {
			await taskStorageManager.initialize();

			const task = {
				title: 'Context Test Task',
				description: 'Task for context testing'
			};
			taskId = await taskStorageManager.storeTask(task);
		});

		test('should store task context', async () => {
			const contextData = {
				test_data: 'test value',
				timestamp: new Date(),
				metadata: { source: 'test' }
			};

			await taskStorageManager.storeTaskContext(
				taskId,
				'test_context',
				contextData
			);

			const contexts = await taskStorageManager.getTaskContext(taskId);
			const testContext = contexts.find(
				(c) => c.context_type === 'test_context'
			);

			expect(testContext).toBeDefined();
			expect(testContext.context_data.test_data).toBe('test value');
		});

		test('should validate context data', async () => {
			await expect(
				taskStorageManager.storeTaskContext(taskId, 'invalid_type', {})
			).rejects.toThrow('Context validation failed');
		});

		test('should store AI interaction context', async () => {
			const interactionData = {
				type: 'code_generation',
				request: { prompt: 'Generate a function' },
				response: { code: 'function test() {}' },
				execution_time_ms: 1500,
				success: true,
				session_id: 'session-123'
			};

			await taskStorageManager.storeAIInteraction(
				taskId,
				'claude-3',
				interactionData
			);

			const contexts = await taskStorageManager.getTaskContext(taskId);
			const aiContext = contexts.find(
				(c) => c.context_type === 'ai_interaction'
			);

			expect(aiContext).toBeDefined();
			expect(aiContext.context_data.agent_name).toBe('claude-3');
			expect(aiContext.context_data.interaction_type).toBe('code_generation');
		});

		test('should store validation result', async () => {
			await taskStorageManager.storeValidationResult(
				taskId,
				'code_quality',
				'eslint',
				'passed',
				85,
				{ issues: 2, warnings: 1 },
				{ improve_naming: true }
			);

			const contexts = await taskStorageManager.getTaskContext(taskId);
			const validationContext = contexts.find(
				(c) => c.context_type === 'validation'
			);

			expect(validationContext).toBeDefined();
			expect(validationContext.context_data.validator_name).toBe('eslint');
			expect(validationContext.context_data.score).toBe(85);
		});

		test('should get full task context organized by type', async () => {
			// Add various types of context
			await taskStorageManager.storeTaskContext(taskId, 'codebase', {
				files: ['test.js']
			});
			await taskStorageManager.storeAIInteraction(taskId, 'gpt-4', {
				type: 'analysis'
			});
			await taskStorageManager.storeValidationResult(
				taskId,
				'test',
				'jest',
				'passed',
				100,
				{},
				{}
			);

			const fullContext = await taskStorageManager.getTaskFullContext(taskId);

			expect(fullContext.task).toBeDefined();
			expect(fullContext.codebase_context).toBeDefined();
			expect(fullContext.ai_interactions).toHaveLength(1);
			expect(fullContext.validation_results).toHaveLength(1);
		});
	});

	describe('Workflow State Management', () => {
		beforeEach(async () => {
			await taskStorageManager.initialize();
		});

		test('should store workflow state', async () => {
			const workflowId = 'workflow-123';
			const state = {
				task_id: 'task-456',
				step: 'code_generation',
				status: 'running',
				result: null,
				metadata: { attempt: 1 }
			};

			await taskStorageManager.storeWorkflowState(workflowId, state);

			const states = await taskStorageManager.getWorkflowState(workflowId);
			expect(states).toHaveLength(1);
			expect(states[0].step).toBe('code_generation');
			expect(states[0].status).toBe('running');
		});

		test('should update workflow state', async () => {
			const workflowId = 'workflow-456';
			const initialState = {
				step: 'validation',
				status: 'running'
			};

			await taskStorageManager.storeWorkflowState(workflowId, initialState);

			const updates = {
				status: 'completed',
				result: { success: true },
				completed_at: new Date()
			};

			await taskStorageManager.updateWorkflowState(workflowId, updates);

			const states = await taskStorageManager.getWorkflowState(workflowId);
			expect(states[0].status).toBe('completed');
		});
	});

	describe('Task Dependencies', () => {
		let parentTaskId, childTaskId;

		beforeEach(async () => {
			await taskStorageManager.initialize();

			parentTaskId = await taskStorageManager.storeTask({
				title: 'Parent Task',
				description: 'Parent task for dependency test'
			});

			childTaskId = await taskStorageManager.storeTask({
				title: 'Child Task',
				description: 'Child task for dependency test'
			});
		});

		test('should add task dependency', async () => {
			await taskStorageManager.addTaskDependency(
				parentTaskId,
				childTaskId,
				'blocks'
			);

			const dependencies =
				await taskStorageManager.getTaskDependencies(childTaskId);
			expect(dependencies).toContain(parentTaskId);
		});

		test('should store dependency context for both tasks', async () => {
			await taskStorageManager.addTaskDependency(
				parentTaskId,
				childTaskId,
				'depends_on'
			);

			const parentContext =
				await taskStorageManager.getTaskContext(parentTaskId);
			const childContext = await taskStorageManager.getTaskContext(childTaskId);

			const parentDependencyContext = parentContext.find(
				(c) => c.context_type === 'dependency_parent'
			);
			const childDependencyContext = childContext.find(
				(c) => c.context_type === 'dependency_child'
			);

			expect(parentDependencyContext).toBeDefined();
			expect(childDependencyContext).toBeDefined();
			expect(parentDependencyContext.context_data.child_task_id).toBe(
				childTaskId
			);
			expect(childDependencyContext.context_data.parent_task_id).toBe(
				parentTaskId
			);
		});
	});

	describe('Metrics and Analytics', () => {
		beforeEach(async () => {
			await taskStorageManager.initialize();

			// Create tasks with different statuses
			const tasks = [
				{
					title: 'Pending Task 1',
					status: 'pending',
					complexity_score: 5,
					estimated_hours: 2
				},
				{
					title: 'Pending Task 2',
					status: 'pending',
					complexity_score: 7,
					estimated_hours: 4
				},
				{
					title: 'In Progress Task',
					status: 'in_progress',
					complexity_score: 6,
					estimated_hours: 3
				},
				{
					title: 'Completed Task 1',
					status: 'completed',
					complexity_score: 4,
					estimated_hours: 2,
					actual_hours: 2.5
				},
				{
					title: 'Completed Task 2',
					status: 'completed',
					complexity_score: 8,
					estimated_hours: 5,
					actual_hours: 4.5
				},
				{
					title: 'Failed Task',
					status: 'failed',
					complexity_score: 9,
					estimated_hours: 6
				}
			];

			for (const task of tasks) {
				const taskId = await taskStorageManager.storeTask(task);
				if (task.status !== 'pending') {
					await taskStorageManager.updateTaskStatus(taskId, task.status);
				}
				if (task.actual_hours) {
					await taskStorageManager.updateTask(taskId, {
						actual_hours: task.actual_hours
					});
				}
			}
		});

		test('should get task metrics', async () => {
			const metrics = await taskStorageManager.getTaskMetrics();

			expect(metrics.total_tasks).toBe(6);
			expect(metrics.pending_tasks).toBe(2);
			expect(metrics.in_progress_tasks).toBe(1);
			expect(metrics.completed_tasks).toBe(2);
			expect(metrics.failed_tasks).toBe(1);
			expect(metrics.avg_complexity).toBeCloseTo(6.5, 1);
			expect(metrics.total_estimated_hours).toBe(22);
			expect(metrics.total_actual_hours).toBe(7);
		});
	});

	describe('Health Monitoring', () => {
		test('should return health status when not initialized', async () => {
			const health = await taskStorageManager.getHealth();

			expect(health.status).toBe('not_initialized');
			expect(health.mode).toBe('mock');
		});

		test('should return health status when initialized in mock mode', async () => {
			await taskStorageManager.initialize();

			// Add some test data
			await taskStorageManager.storeTask({ title: 'Health Test Task' });

			const health = await taskStorageManager.getHealth();

			expect(health.status).toBe('healthy');
			expect(health.mode).toBe('mock');
			expect(health.tasks_stored).toBe(1);
			expect(health.performance_metrics).toBeDefined();
		});
	});

	describe('Error Handling', () => {
		beforeEach(async () => {
			await taskStorageManager.initialize();
		});

		test('should handle errors when task storage not initialized', async () => {
			const uninitializedStorage = new TaskStorageManager({
				enable_mock: true
			});

			await expect(
				uninitializedStorage.storeTask({ title: 'Test' })
			).rejects.toThrow('Task storage not initialized');
		});

		test('should track performance metrics on errors', async () => {
			// Force an error by trying to update non-existent task
			try {
				await taskStorageManager.updateTask('non-existent-id', {
					title: 'Updated'
				});
			} catch (error) {
				// Expected to fail
			}

			const health = await taskStorageManager.getHealth();
			expect(health.performance_metrics.errors).toBeGreaterThan(0);
		});
	});

	describe('Legacy Compatibility', () => {
		beforeEach(async () => {
			await taskStorageManager.initialize();
		});

		test('should support legacy storeAtomicTask method', async () => {
			const task = {
				title: 'Legacy Task',
				description: 'Task stored via legacy method'
			};

			const taskId = await taskStorageManager.storeAtomicTask(task);
			expect(taskId).toBeDefined();

			const storedTask = await taskStorageManager.retrieveTaskById(taskId);
			expect(storedTask.title).toBe(task.title);
		});

		test('should support legacy retrieveTaskById method', async () => {
			const task = {
				title: 'Legacy Retrieval Task',
				description: 'Task for legacy retrieval test'
			};

			const taskId = await taskStorageManager.storeTask(task);
			const retrievedTask = await taskStorageManager.retrieveTaskById(taskId);

			expect(retrievedTask).toBeDefined();
			expect(retrievedTask.title).toBe(task.title);
		});
	});
});

describe('Task Model', () => {
	test('should create task with default values', () => {
		const task = new Task();

		expect(task.id).toBeDefined();
		expect(task.status).toBe('pending');
		expect(task.priority).toBe(0);
		expect(task.complexity_score).toBe(5);
		expect(task.created_at).toBeDefined();
	});

	test('should validate task data', () => {
		const validTask = new Task({
			title: 'Valid Task',
			priority: 5,
			complexity_score: 7
		});

		const validation = validTask.validate();
		expect(validation.valid).toBe(true);
		expect(validation.errors).toHaveLength(0);
	});

	test('should detect validation errors', () => {
		const invalidTask = new Task({
			title: '', // Empty title
			priority: 15, // Invalid priority
			complexity_score: 0 // Invalid complexity
		});

		const validation = invalidTask.validate();
		expect(validation.valid).toBe(false);
		expect(validation.errors.length).toBeGreaterThan(0);
	});

	test('should update status correctly', () => {
		const task = new Task({ title: 'Status Test Task' });

		const statusChange = task.updateStatus('in_progress');

		expect(task.status).toBe('in_progress');
		expect(statusChange.oldStatus).toBe('pending');
		expect(statusChange.newStatus).toBe('in_progress');
	});

	test('should calculate progress correctly', () => {
		const task = new Task({ title: 'Progress Test Task' });

		expect(task.getProgress()).toBe(0); // pending

		task.updateStatus('in_progress');
		expect(task.getProgress()).toBe(50);

		task.updateStatus('completed');
		expect(task.getProgress()).toBe(100);
	});

	test('should convert to/from database format', () => {
		const originalTask = new Task({
			title: 'Database Test Task',
			requirements: ['req1', 'req2'],
			tags: ['tag1', 'tag2'],
			metadata: { source: 'test' }
		});

		const dbFormat = originalTask.toDatabase();
		expect(typeof dbFormat.requirements).toBe('string');
		expect(typeof dbFormat.tags).toBe('string');
		expect(typeof dbFormat.metadata).toBe('string');

		const restoredTask = Task.fromDatabase(dbFormat);
		expect(Array.isArray(restoredTask.requirements)).toBe(true);
		expect(Array.isArray(restoredTask.tags)).toBe(true);
		expect(typeof restoredTask.metadata).toBe('object');
		expect(restoredTask.title).toBe(originalTask.title);
	});
});

describe('TaskContext Model', () => {
	test('should create context with default values', () => {
		const context = new TaskContext({
			task_id: 'task-123',
			context_type: 'test',
			context_data: { test: 'data' }
		});

		expect(context.id).toBeDefined();
		expect(context.created_at).toBeDefined();
		expect(context.metadata).toEqual({});
	});

	test('should validate context data', () => {
		const validContext = new TaskContext({
			task_id: 'task-123',
			context_type: 'ai_interaction',
			context_data: { agent_name: 'claude', type: 'analysis' }
		});

		const validation = validContext.validate();
		expect(validation.valid).toBe(true);
	});

	test('should create AI interaction context', () => {
		const context = TaskContext.createAIInteraction('task-123', 'gpt-4', {
			type: 'code_generation',
			request: { prompt: 'Generate code' },
			response: { code: 'function test() {}' },
			execution_time_ms: 1000,
			success: true
		});

		expect(context.context_type).toBe('ai_interaction');
		expect(context.context_data.agent_name).toBe('gpt-4');
		expect(context.context_data.interaction_type).toBe('code_generation');
	});

	test('should create validation context', () => {
		const context = TaskContext.createValidation(
			'task-123',
			'code_quality',
			'eslint',
			'passed',
			85,
			{ issues: 2 },
			{ improve_naming: true }
		);

		expect(context.context_type).toBe('validation');
		expect(context.context_data.validator_name).toBe('eslint');
		expect(context.context_data.score).toBe(85);
	});

	test('should create status change context', () => {
		const context = TaskContext.createStatusChange(
			'task-123',
			'pending',
			'in_progress',
			{ started_by: 'user-456' }
		);

		expect(context.context_type).toBe('status_change');
		expect(context.context_data.from_status).toBe('pending');
		expect(context.context_data.to_status).toBe('in_progress');
	});
});
