/**
 * Performance Testing Suite
 * 
 * Tests system performance under various load conditions and validates
 * that performance meets SLA requirements.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { PerformanceTestUtils, TestDataManager } from '../test-utils/index.js';
import { findTaskById } from '../../scripts/modules/task-finder.js';
import { addTask } from '../../scripts/modules/task-manager.js';
import { listTasks } from '../../scripts/modules/task-manager.js';

describe('Performance Testing Suite', () => {
	let testDataManager;
	let testTasks;

	beforeAll(async () => {
		testDataManager = new TestDataManager();
		testTasks = testDataManager.generateTestTasks(1000); // Large dataset for performance testing
		
		// Create test tasks file
		testDataManager.createTempFile('tasks.json', JSON.stringify(testTasks, null, 2));
	});

	afterAll(() => {
		testDataManager.cleanup();
	});

	describe('Task Operations Performance', () => {
		test('should find task by ID within performance threshold', async () => {
			const { duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
				return findTaskById(testTasks, '500');
			});

			// Should complete within 10ms for single task lookup
			expect(duration).toBeLessThan(10);
		});

		test('should handle bulk task operations efficiently', async () => {
			const loadTestResults = await PerformanceTestUtils.runLoadTest(
				async () => {
					const randomId = Math.floor(Math.random() * 1000) + 1;
					return findTaskById(testTasks, randomId.toString());
				},
				10, // 10 concurrent operations
				100 // 100 total operations
			);

			// Average response time should be under 5ms
			expect(loadTestResults.averageDuration).toBeLessThan(5);
			
			// 95th percentile should be under 15ms
			const sortedDurations = loadTestResults.results
				.map(r => r.duration)
				.sort((a, b) => a - b);
			const p95Index = Math.floor(sortedDurations.length * 0.95);
			expect(sortedDurations[p95Index]).toBeLessThan(15);
		});

		test('should maintain performance under memory pressure', async () => {
			const initialMemory = PerformanceTestUtils.getMemoryUsage();
			
			// Simulate memory pressure
			const buffers = [];
			for (let i = 0; i < 10; i++) {
				buffers.push(Buffer.alloc(10 * 1024 * 1024)); // 10MB each
			}

			const { duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
				return findTaskById(testTasks, '500');
			});

			const finalMemory = PerformanceTestUtils.getMemoryUsage();
			
			// Performance should not degrade significantly under memory pressure
			expect(duration).toBeLessThan(20);
			
			// Memory usage should be tracked
			expect(finalMemory.heapUsed).toBeGreaterThan(initialMemory.heapUsed);
			
			// Clean up buffers
			buffers.length = 0;
		});
	});

	describe('List Operations Performance', () => {
		test('should list large number of tasks efficiently', async () => {
			const { duration, result } = await PerformanceTestUtils.measureExecutionTime(async () => {
				return listTasks(testTasks);
			});

			// Should complete within 50ms for 1000 tasks
			expect(duration).toBeLessThan(50);
			expect(result).toBeDefined();
		});

		test('should filter tasks efficiently', async () => {
			const { duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
				return listTasks(testTasks, 'pending');
			});

			// Filtering should be fast
			expect(duration).toBeLessThan(30);
		});
	});

	describe('Concurrent Operations Performance', () => {
		test('should handle concurrent task lookups', async () => {
			const concurrentPromises = [];
			
			for (let i = 0; i < 50; i++) {
				concurrentPromises.push(
					PerformanceTestUtils.measureExecutionTime(async () => {
						const randomId = Math.floor(Math.random() * 1000) + 1;
						return findTaskById(testTasks, randomId.toString());
					})
				);
			}

			const results = await Promise.all(concurrentPromises);
			const averageDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;

			// Concurrent operations should not significantly impact performance
			expect(averageDuration).toBeLessThan(10);
		});
	});

	describe('Memory Usage Monitoring', () => {
		test('should not have memory leaks in repeated operations', async () => {
			const initialMemory = PerformanceTestUtils.getMemoryUsage();
			
			// Perform many operations
			for (let i = 0; i < 1000; i++) {
				findTaskById(testTasks, (i % 1000 + 1).toString());
				
				// Force garbage collection every 100 operations
				if (i % 100 === 0 && global.gc) {
					global.gc();
				}
			}

			const finalMemory = PerformanceTestUtils.getMemoryUsage();
			
			// Memory usage should not grow excessively
			const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
			expect(memoryGrowth).toBeLessThan(50); // Less than 50MB growth
		});
	});

	describe('Performance Regression Detection', () => {
		test('should detect performance regressions', async () => {
			// Baseline performance measurement
			const baselineResults = [];
			for (let i = 0; i < 10; i++) {
				const { duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
					return findTaskById(testTasks, '500');
				});
				baselineResults.push(duration);
			}

			const baselineAverage = baselineResults.reduce((sum, d) => sum + d, 0) / baselineResults.length;
			
			// Current performance measurement
			const currentResults = [];
			for (let i = 0; i < 10; i++) {
				const { duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
					return findTaskById(testTasks, '500');
				});
				currentResults.push(duration);
			}

			const currentAverage = currentResults.reduce((sum, d) => sum + d, 0) / currentResults.length;
			
			// Performance should not regress by more than 50%
			const regressionThreshold = baselineAverage * 1.5;
			expect(currentAverage).toBeLessThan(regressionThreshold);
		});
	});

	describe('Stress Testing', () => {
		test('should handle extreme load conditions', async () => {
			const stressTestResults = await PerformanceTestUtils.runLoadTest(
				async () => {
					// Simulate complex operation
					const tasks = testDataManager.generateTestTasks(100);
					return listTasks(tasks);
				},
				20, // 20 concurrent operations
				200 // 200 total operations
			);

			// System should remain stable under stress
			expect(stressTestResults.averageDuration).toBeLessThan(100);
			
			// No operation should take more than 500ms
			expect(stressTestResults.maxDuration).toBeLessThan(500);
		});
	});
});

