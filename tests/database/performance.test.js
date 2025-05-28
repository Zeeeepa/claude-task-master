/**
 * @fileoverview Performance Tests
 * @description Performance and load testing for PostgreSQL TaskStorageManager
 */

import { jest } from '@jest/globals';
import { TaskStorageManager } from '../../src/ai_cicd_system/core/task_storage_manager.js';
import { DatabaseConnection } from '../../src/ai_cicd_system/database/connection.js';

// Performance tests require a real database
const DB_TEST_URL = process.env.DB_TEST_URL;
const skipPerformanceTests = !DB_TEST_URL;

describe('Performance Tests', () => {
	let connection;
	let taskStorage;

	beforeAll(async () => {
		if (skipPerformanceTests) {
			console.log('Skipping performance tests - DB_TEST_URL not provided');
			return;
		}

		// Parse test database URL
		const url = new URL(DB_TEST_URL);
		const config = {
			host: url.hostname,
			port: parseInt(url.port) || 5432,
			database: url.pathname.slice(1),
			user: url.username,
			password: url.password,
			ssl: url.searchParams.get('ssl') === 'true',
			pool: {
				min: 5,
				max: 20,
				idleTimeoutMillis: 10000,
				acquireTimeoutMillis: 30000
			}
		};

		connection = new DatabaseConnection(config);
		await connection.initialize();

		taskStorage = new TaskStorageManager({
			enable_mock: false,
			auto_migrate: false,
			enable_performance_tracking: true
		});
		taskStorage.connection = connection;
		taskStorage.isInitialized = true;
	});

	afterAll(async () => {
		if (skipPerformanceTests) return;

		if (connection) {
			await connection.query(
				'TRUNCATE TABLE tasks, task_contexts, workflow_states, audit_logs, task_dependencies CASCADE'
			);
			await connection.shutdown();
		}
	});

	beforeEach(async () => {
		if (skipPerformanceTests) return;
		await connection.query(
			'TRUNCATE TABLE tasks, task_contexts, workflow_states, audit_logs, task_dependencies CASCADE'
		);
	});

	describe('Bulk Operations Performance', () => {
		test.skip('should handle bulk task creation efficiently', async () => {
			const taskCount = 1000;
			const tasks = Array.from({ length: taskCount }, (_, i) => ({
				title: `Performance Test Task ${i + 1}`,
				description: `Task ${i + 1} for performance testing`,
				type: ['bug', 'feature', 'enhancement'][i % 3],
				priority: Math.floor(Math.random() * 10),
				complexity_score: Math.floor(Math.random() * 10) + 1,
				requirements: [`Requirement ${i + 1}`, `Requirement ${i + 2}`],
				acceptance_criteria: [`Criteria ${i + 1}`, `Criteria ${i + 2}`],
				affected_files: [`file${i + 1}.js`, `file${i + 2}.js`],
				tags: [`tag-${i % 10}`, `category-${i % 5}`],
				estimated_hours: Math.random() * 10
			}));

			console.log(`Creating ${taskCount} tasks...`);
			const startTime = Date.now();

			// Create tasks in batches to avoid overwhelming the connection pool
			const batchSize = 50;
			const taskIds = [];

			for (let i = 0; i < tasks.length; i += batchSize) {
				const batch = tasks.slice(i, i + batchSize);
				const batchPromises = batch.map((task) => taskStorage.storeTask(task));
				const batchIds = await Promise.all(batchPromises);
				taskIds.push(...batchIds);

				// Log progress
				if ((i + batchSize) % 200 === 0) {
					console.log(`Created ${Math.min(i + batchSize, taskCount)} tasks...`);
				}
			}

			const endTime = Date.now();
			const totalTime = endTime - startTime;
			const tasksPerSecond = (taskCount / totalTime) * 1000;

			console.log(
				`Created ${taskCount} tasks in ${totalTime}ms (${tasksPerSecond.toFixed(2)} tasks/second)`
			);

			expect(taskIds).toHaveLength(taskCount);
			expect(totalTime).toBeLessThan(30000); // Should complete within 30 seconds
			expect(tasksPerSecond).toBeGreaterThan(10); // Should create at least 10 tasks per second
		});

		test.skip('should handle bulk queries efficiently', async () => {
			// First create test data
			const taskCount = 500;
			const tasks = Array.from({ length: taskCount }, (_, i) => ({
				title: `Query Test Task ${i + 1}`,
				type: ['bug', 'feature', 'enhancement'][i % 3],
				priority: Math.floor(Math.random() * 10),
				status: ['pending', 'in_progress', 'completed'][i % 3],
				complexity_score: Math.floor(Math.random() * 10) + 1
			}));

			// Create tasks in batches
			const batchSize = 50;
			for (let i = 0; i < tasks.length; i += batchSize) {
				const batch = tasks.slice(i, i + batchSize);
				const batchPromises = batch.map((task) => taskStorage.storeTask(task));
				await Promise.all(batchPromises);
			}

			console.log(`Running queries on ${taskCount} tasks...`);

			// Test various query patterns
			const queryTests = [
				{ name: 'List all tasks', query: () => taskStorage.listTasks() },
				{
					name: 'Filter by status',
					query: () => taskStorage.listTasks({ status: 'pending' })
				},
				{
					name: 'Filter by type',
					query: () => taskStorage.listTasks({ type: 'bug' })
				},
				{
					name: 'Filter by priority',
					query: () => taskStorage.listTasks({ priority: 8 })
				},
				{
					name: 'Complex filter',
					query: () =>
						taskStorage.listTasks({
							type: 'feature',
							status: 'in_progress',
							sort_by: 'priority',
							sort_order: 'DESC'
						})
				},
				{
					name: 'Paginated query',
					query: () => taskStorage.listTasks({ limit: 50, offset: 100 })
				},
				{ name: 'Get metrics', query: () => taskStorage.getTaskMetrics() }
			];

			const results = [];

			for (const test of queryTests) {
				const startTime = Date.now();
				const result = await test.query();
				const endTime = Date.now();
				const queryTime = endTime - startTime;

				results.push({
					name: test.name,
					time: queryTime,
					resultCount: Array.isArray(result) ? result.length : 1
				});

				console.log(
					`${test.name}: ${queryTime}ms (${Array.isArray(result) ? result.length : 1} results)`
				);
			}

			// All queries should complete within reasonable time
			results.forEach((result) => {
				expect(result.time).toBeLessThan(2000); // 2 seconds max
			});

			// Simple queries should be very fast
			const simpleQueries = results.filter(
				(r) =>
					r.name.includes('List all') || r.name.includes('Filter by status')
			);
			simpleQueries.forEach((result) => {
				expect(result.time).toBeLessThan(500); // 500ms max for simple queries
			});
		});

		test.skip('should handle bulk context operations efficiently', async () => {
			// Create a task first
			const taskId = await taskStorage.storeTask({
				title: 'Context Performance Test Task',
				description: 'Task for context performance testing'
			});

			const contextCount = 200;
			console.log(`Creating ${contextCount} context entries...`);

			const startTime = Date.now();

			// Create various types of context entries
			const contextPromises = [];
			for (let i = 0; i < contextCount; i++) {
				const contextType = [
					'codebase',
					'ai_interaction',
					'validation',
					'performance'
				][i % 4];
				const contextData = {
					iteration: i,
					timestamp: new Date(),
					data: `Context data for iteration ${i}`,
					metrics: {
						value: Math.random() * 100,
						score: Math.floor(Math.random() * 10) + 1
					}
				};

				contextPromises.push(
					taskStorage.storeTaskContext(taskId, contextType, contextData)
				);
			}

			await Promise.all(contextPromises);

			const endTime = Date.now();
			const totalTime = endTime - startTime;
			const contextsPerSecond = (contextCount / totalTime) * 1000;

			console.log(
				`Created ${contextCount} contexts in ${totalTime}ms (${contextsPerSecond.toFixed(2)} contexts/second)`
			);

			// Test context retrieval performance
			const retrievalStart = Date.now();
			const contexts = await taskStorage.getTaskContext(taskId);
			const retrievalTime = Date.now() - retrievalStart;

			console.log(
				`Retrieved ${contexts.length} contexts in ${retrievalTime}ms`
			);

			// Test full context retrieval
			const fullContextStart = Date.now();
			const fullContext = await taskStorage.getTaskFullContext(taskId);
			const fullContextTime = Date.now() - fullContextStart;

			console.log(`Retrieved full context in ${fullContextTime}ms`);

			expect(contexts).toHaveLength(contextCount);
			expect(totalTime).toBeLessThan(10000); // Should complete within 10 seconds
			expect(retrievalTime).toBeLessThan(1000); // Retrieval should be fast
			expect(fullContextTime).toBeLessThan(2000); // Full context should be reasonably fast
		});
	});

	describe('Concurrent Operations Performance', () => {
		test.skip('should handle concurrent task operations', async () => {
			const concurrentUsers = 20;
			const tasksPerUser = 10;
			const totalTasks = concurrentUsers * tasksPerUser;

			console.log(
				`Simulating ${concurrentUsers} concurrent users creating ${tasksPerUser} tasks each...`
			);

			const startTime = Date.now();

			// Simulate concurrent users
			const userPromises = Array.from(
				{ length: concurrentUsers },
				async (_, userIndex) => {
					const userTasks = Array.from(
						{ length: tasksPerUser },
						(_, taskIndex) => ({
							title: `User ${userIndex + 1} Task ${taskIndex + 1}`,
							description: `Task ${taskIndex + 1} created by user ${userIndex + 1}`,
							type: ['bug', 'feature', 'enhancement'][taskIndex % 3],
							priority: Math.floor(Math.random() * 10),
							assigned_to: `user-${userIndex + 1}`
						})
					);

					// Each user creates their tasks sequentially
					const userTaskIds = [];
					for (const task of userTasks) {
						const taskId = await taskStorage.storeTask(task);
						userTaskIds.push(taskId);
					}

					return userTaskIds;
				}
			);

			const allUserResults = await Promise.all(userPromises);
			const allTaskIds = allUserResults.flat();

			const endTime = Date.now();
			const totalTime = endTime - startTime;
			const tasksPerSecond = (totalTasks / totalTime) * 1000;

			console.log(
				`Created ${totalTasks} tasks concurrently in ${totalTime}ms (${tasksPerSecond.toFixed(2)} tasks/second)`
			);

			expect(allTaskIds).toHaveLength(totalTasks);
			expect(totalTime).toBeLessThan(60000); // Should complete within 60 seconds
			expect(tasksPerSecond).toBeGreaterThan(5); // Should maintain reasonable throughput
		});

		test.skip('should handle concurrent read/write operations', async () => {
			// Create initial test data
			const initialTasks = Array.from({ length: 100 }, (_, i) => ({
				title: `Initial Task ${i + 1}`,
				description: `Task ${i + 1} for read/write testing`,
				priority: Math.floor(Math.random() * 10)
			}));

			const taskIds = [];
			for (const task of initialTasks) {
				const taskId = await taskStorage.storeTask(task);
				taskIds.push(taskId);
			}

			console.log('Running concurrent read/write operations...');

			const startTime = Date.now();

			// Simulate mixed read/write workload
			const operations = [];

			// 50% reads
			for (let i = 0; i < 50; i++) {
				operations.push(async () => {
					const randomTaskId =
						taskIds[Math.floor(Math.random() * taskIds.length)];
					return await taskStorage.getTask(randomTaskId);
				});
			}

			// 30% updates
			for (let i = 0; i < 30; i++) {
				operations.push(async () => {
					const randomTaskId =
						taskIds[Math.floor(Math.random() * taskIds.length)];
					return await taskStorage.updateTask(randomTaskId, {
						priority: Math.floor(Math.random() * 10),
						updated_at: new Date()
					});
				});
			}

			// 15% new task creation
			for (let i = 0; i < 15; i++) {
				operations.push(async () => {
					return await taskStorage.storeTask({
						title: `Concurrent Task ${i + 1}`,
						description: `Task created during concurrent test`,
						priority: Math.floor(Math.random() * 10)
					});
				});
			}

			// 5% complex queries
			for (let i = 0; i < 5; i++) {
				operations.push(async () => {
					return await taskStorage.listTasks({
						priority: Math.floor(Math.random() * 10),
						sort_by: 'created_at',
						sort_order: 'DESC',
						limit: 20
					});
				});
			}

			// Shuffle operations to simulate random access patterns
			for (let i = operations.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[operations[i], operations[j]] = [operations[j], operations[i]];
			}

			// Execute all operations concurrently
			const results = await Promise.all(operations.map((op) => op()));

			const endTime = Date.now();
			const totalTime = endTime - startTime;
			const operationsPerSecond = (operations.length / totalTime) * 1000;

			console.log(
				`Completed ${operations.length} concurrent operations in ${totalTime}ms (${operationsPerSecond.toFixed(2)} ops/second)`
			);

			expect(results).toHaveLength(operations.length);
			expect(totalTime).toBeLessThan(30000); // Should complete within 30 seconds
			expect(operationsPerSecond).toBeGreaterThan(10); // Should maintain reasonable throughput
		});
	});

	describe('Memory and Resource Usage', () => {
		test.skip('should maintain stable memory usage under load', async () => {
			const initialMemory = process.memoryUsage();
			console.log('Initial memory usage:', {
				rss: Math.round(initialMemory.rss / 1024 / 1024) + 'MB',
				heapUsed: Math.round(initialMemory.heapUsed / 1024 / 1024) + 'MB'
			});

			// Perform memory-intensive operations
			const iterations = 10;
			const tasksPerIteration = 100;

			for (let iteration = 0; iteration < iterations; iteration++) {
				console.log(`Memory test iteration ${iteration + 1}/${iterations}`);

				// Create tasks
				const tasks = Array.from({ length: tasksPerIteration }, (_, i) => ({
					title: `Memory Test Task ${iteration}-${i}`,
					description: 'A'.repeat(1000), // 1KB description
					requirements: Array.from(
						{ length: 10 },
						(_, j) => `Requirement ${j}`
					),
					acceptance_criteria: Array.from(
						{ length: 5 },
						(_, j) => `Criteria ${j}`
					),
					metadata: {
						large_data: 'B'.repeat(500), // Additional data
						iteration,
						timestamp: new Date()
					}
				}));

				const taskIds = [];
				for (const task of tasks) {
					const taskId = await taskStorage.storeTask(task);
					taskIds.push(taskId);
				}

				// Add contexts to increase memory usage
				for (const taskId of taskIds) {
					await taskStorage.storeTaskContext(taskId, 'performance', {
						large_context: 'C'.repeat(500),
						iteration,
						metrics: Array.from({ length: 20 }, (_, i) => ({
							metric: i,
							value: Math.random()
						}))
					});
				}

				// Query data
				await taskStorage.listTasks({ limit: 50 });
				await taskStorage.getTaskMetrics();

				// Clean up this iteration's data to prevent unbounded growth
				await connection.query('DELETE FROM tasks WHERE title LIKE $1', [
					`Memory Test Task ${iteration}-%`
				]);

				// Force garbage collection if available
				if (global.gc) {
					global.gc();
				}

				const currentMemory = process.memoryUsage();
				console.log(`Memory after iteration ${iteration + 1}:`, {
					rss: Math.round(currentMemory.rss / 1024 / 1024) + 'MB',
					heapUsed: Math.round(currentMemory.heapUsed / 1024 / 1024) + 'MB'
				});
			}

			const finalMemory = process.memoryUsage();
			const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
			const memoryGrowthMB = memoryGrowth / 1024 / 1024;

			console.log('Final memory usage:', {
				rss: Math.round(finalMemory.rss / 1024 / 1024) + 'MB',
				heapUsed: Math.round(finalMemory.heapUsed / 1024 / 1024) + 'MB',
				growth: Math.round(memoryGrowthMB) + 'MB'
			});

			// Memory growth should be reasonable (less than 100MB for this test)
			expect(memoryGrowthMB).toBeLessThan(100);
		});

		test.skip('should handle connection pool efficiently', async () => {
			const poolStats = connection.getHealth().poolStats;
			console.log('Initial pool stats:', poolStats);

			// Perform operations that will use multiple connections
			const concurrentOperations = 50;
			const operations = Array.from(
				{ length: concurrentOperations },
				async (_, i) => {
					const taskId = await taskStorage.storeTask({
						title: `Pool Test Task ${i}`,
						description: `Task ${i} for pool testing`
					});

					await taskStorage.storeTaskContext(taskId, 'test', {
						operation_index: i,
						timestamp: new Date()
					});

					return await taskStorage.getTask(taskId);
				}
			);

			const startTime = Date.now();
			const results = await Promise.all(operations);
			const endTime = Date.now();

			const finalPoolStats = connection.getHealth().poolStats;
			console.log('Final pool stats:', finalPoolStats);
			console.log(
				`Completed ${concurrentOperations} operations in ${endTime - startTime}ms`
			);

			expect(results).toHaveLength(concurrentOperations);
			expect(finalPoolStats.totalCount).toBeLessThanOrEqual(20); // Should not exceed max pool size
			expect(finalPoolStats.idleCount).toBeGreaterThan(0); // Should have idle connections
		});
	});

	describe('Query Performance Optimization', () => {
		test.skip('should demonstrate index effectiveness', async () => {
			// Create a large dataset to test index performance
			const taskCount = 2000;
			console.log(`Creating ${taskCount} tasks for index testing...`);

			const tasks = Array.from({ length: taskCount }, (_, i) => ({
				title: `Index Test Task ${i + 1}`,
				type: ['bug', 'feature', 'enhancement'][i % 3],
				status: ['pending', 'in_progress', 'completed'][i % 3],
				priority: Math.floor(Math.random() * 10),
				assigned_to: `user-${Math.floor(i / 100) + 1}`, // 20 different users
				complexity_score: Math.floor(Math.random() * 10) + 1
			}));

			// Create tasks in batches
			const batchSize = 100;
			for (let i = 0; i < tasks.length; i += batchSize) {
				const batch = tasks.slice(i, i + batchSize);
				const batchPromises = batch.map((task) => taskStorage.storeTask(task));
				await Promise.all(batchPromises);
			}

			// Test queries that should benefit from indexes
			const indexedQueries = [
				{
					name: 'Filter by status (indexed)',
					query: () => taskStorage.listTasks({ status: 'pending' })
				},
				{
					name: 'Filter by priority (indexed)',
					query: () => taskStorage.listTasks({ priority: 8 })
				},
				{
					name: 'Filter by assigned_to (indexed)',
					query: () => taskStorage.listTasks({ assigned_to: 'user-5' })
				},
				{
					name: 'Filter by type (indexed)',
					query: () => taskStorage.listTasks({ type: 'bug' })
				},
				{
					name: 'Sort by created_at (indexed)',
					query: () =>
						taskStorage.listTasks({
							sort_by: 'created_at',
							sort_order: 'DESC',
							limit: 100
						})
				},
				{
					name: 'Complex indexed query',
					query: () =>
						taskStorage.listTasks({
							status: 'in_progress',
							type: 'feature',
							sort_by: 'priority',
							sort_order: 'DESC',
							limit: 50
						})
				}
			];

			console.log('Testing indexed query performance...');

			for (const test of indexedQueries) {
				const startTime = Date.now();
				const result = await test.query();
				const endTime = Date.now();
				const queryTime = endTime - startTime;

				console.log(`${test.name}: ${queryTime}ms (${result.length} results)`);

				// Indexed queries should be fast even with large datasets
				expect(queryTime).toBeLessThan(1000); // 1 second max
				expect(result).toBeDefined();
			}
		});
	});
});
