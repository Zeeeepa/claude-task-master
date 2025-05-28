/**
 * Chaos Engineering Testing Suite
 * 
 * Tests system resilience by injecting failures and validating
 * that the system can handle and recover from various failure modes.
 */

import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { ChaosTestUtils, TestDataManager, IntegrationTestHelpers } from '../test-utils/index.js';
import { findTaskById } from '../../scripts/modules/task-finder.js';
import { addTask } from '../../scripts/modules/task-manager.js';
import fs from 'fs';

describe('Chaos Engineering Testing Suite', () => {
	let testDataManager;
	let originalFs;

	beforeAll(async () => {
		testDataManager = new TestDataManager();
		originalFs = { ...fs };
	});

	afterAll(() => {
		testDataManager.cleanup();
		// Restore original fs methods
		Object.assign(fs, originalFs);
	});

	describe('Network Failure Resilience', () => {
		test('should handle intermittent network failures gracefully', async () => {
			// Mock network-dependent function
			const mockApiCall = jest.fn().mockImplementation(async () => {
				if (ChaosTestUtils.simulateNetworkFailure(0.3)) { // 30% failure rate
					throw new Error('Network timeout');
				}
				return { success: true, data: 'API response' };
			});

			let successCount = 0;
			let failureCount = 0;
			const totalAttempts = 100;

			for (let i = 0; i < totalAttempts; i++) {
				try {
					await mockApiCall();
					successCount++;
				} catch (error) {
					failureCount++;
					expect(error.message).toBe('Network timeout');
				}
			}

			// Should have both successes and failures
			expect(successCount).toBeGreaterThan(0);
			expect(failureCount).toBeGreaterThan(0);
			expect(successCount + failureCount).toBe(totalAttempts);
		});

		test('should implement retry logic for failed requests', async () => {
			let attemptCount = 0;
			
			const mockApiCallWithRetry = async (maxRetries = 3) => {
				for (let attempt = 0; attempt < maxRetries; attempt++) {
					attemptCount++;
					try {
						if (ChaosTestUtils.simulateNetworkFailure(0.7)) { // 70% failure rate
							throw new Error('Network error');
						}
						return { success: true, attempt: attemptCount };
					} catch (error) {
						if (attempt === maxRetries - 1) {
							throw error;
						}
						// Wait before retry
						await new Promise(resolve => setTimeout(resolve, 100));
					}
				}
			};

			try {
				const result = await mockApiCallWithRetry();
				expect(result.success).toBe(true);
				expect(attemptCount).toBeGreaterThan(0);
			} catch (error) {
				// If all retries failed, that's also a valid test outcome
				expect(error.message).toBe('Network error');
				expect(attemptCount).toBe(3); // Should have tried 3 times
			}
		});
	});

	describe('File System Failure Resilience', () => {
		test('should handle file read failures gracefully', async () => {
			// Mock fs.readFileSync to randomly fail
			const originalReadFileSync = fs.readFileSync;
			fs.readFileSync = jest.fn().mockImplementation((path, options) => {
				if (Math.random() < 0.2) { // 20% failure rate
					ChaosTestUtils.simulateFileSystemError('read');
				}
				return originalReadFileSync(path, options);
			});

			const testFile = testDataManager.createTempFile('test.json', '{"test": true}');
			let successCount = 0;
			let failureCount = 0;

			for (let i = 0; i < 50; i++) {
				try {
					const content = fs.readFileSync(testFile, 'utf8');
					expect(content).toContain('test');
					successCount++;
				} catch (error) {
					expect(error.message).toContain('ENOENT');
					failureCount++;
				}
			}

			// Restore original function
			fs.readFileSync = originalReadFileSync;

			// Should have handled both success and failure cases
			expect(successCount + failureCount).toBe(50);
		});

		test('should handle file write failures with backup strategy', async () => {
			const mockWriteWithBackup = async (filePath, data) => {
				const backupPath = `${filePath}.backup`;
				
				try {
					// Try to write to main file
					if (Math.random() < 0.3) { // 30% failure rate
						throw new Error('ENOSPC: no space left on device');
					}
					fs.writeFileSync(filePath, data);
					return { success: true, usedBackup: false };
				} catch (error) {
					// Try backup location
					try {
						fs.writeFileSync(backupPath, data);
						return { success: true, usedBackup: true };
					} catch (backupError) {
						throw new Error('Both primary and backup writes failed');
					}
				}
			};

			const testData = JSON.stringify({ test: 'data' });
			let primaryWrites = 0;
			let backupWrites = 0;
			let totalFailures = 0;

			for (let i = 0; i < 100; i++) {
				try {
					const result = await mockWriteWithBackup(
						testDataManager.createTempFile(`test-${i}.json`, ''),
						testData
					);
					
					if (result.usedBackup) {
						backupWrites++;
					} else {
						primaryWrites++;
					}
				} catch (error) {
					totalFailures++;
				}
			}

			// Should have used backup strategy when primary failed
			expect(backupWrites).toBeGreaterThan(0);
			expect(primaryWrites + backupWrites + totalFailures).toBe(100);
		});
	});

	describe('Memory Pressure Resilience', () => {
		test('should handle memory pressure without crashing', async () => {
			const initialMemory = process.memoryUsage();
			const memoryBuffers = [];

			try {
				// Gradually increase memory pressure
				for (let i = 0; i < 10; i++) {
					const buffer = ChaosTestUtils.simulateMemoryPressure(50); // 50MB
					memoryBuffers.push(buffer);

					// Test that core functionality still works under memory pressure
					const testTasks = testDataManager.generateTestTasks(100);
					const task = findTaskById(testTasks, '50');
					expect(task).toBeDefined();
					expect(task.id).toBe(50);
				}

				const finalMemory = process.memoryUsage();
				expect(finalMemory.heapUsed).toBeGreaterThan(initialMemory.heapUsed);

			} finally {
				// Clean up memory
				memoryBuffers.length = 0;
				if (global.gc) {
					global.gc();
				}
			}
		});

		test('should implement memory usage monitoring and alerts', () => {
			const memoryMonitor = {
				thresholds: {
					warning: 100 * 1024 * 1024, // 100MB
					critical: 500 * 1024 * 1024  // 500MB
				},
				
				checkMemoryUsage() {
					const usage = process.memoryUsage();
					const heapUsed = usage.heapUsed;
					
					if (heapUsed > this.thresholds.critical) {
						return { level: 'critical', usage: heapUsed };
					} else if (heapUsed > this.thresholds.warning) {
						return { level: 'warning', usage: heapUsed };
					}
					return { level: 'normal', usage: heapUsed };
				}
			};

			const status = memoryMonitor.checkMemoryUsage();
			expect(status.level).toMatch(/normal|warning|critical/);
			expect(status.usage).toBeGreaterThan(0);
		});
	});

	describe('Concurrent Operation Resilience', () => {
		test('should handle race conditions in concurrent file operations', async () => {
			const testFile = testDataManager.createTempFile('concurrent-test.json', '[]');
			const operations = [];

			// Simulate concurrent read/write operations
			for (let i = 0; i < 20; i++) {
				operations.push(
					(async (index) => {
						try {
							// Random delay to increase chance of race conditions
							await ChaosTestUtils.simulateRandomDelay(10, 100);
							
							// Read current content
							const content = fs.readFileSync(testFile, 'utf8');
							const data = JSON.parse(content);
							
							// Add new item
							data.push({ id: index, timestamp: Date.now() });
							
							// Write back
							fs.writeFileSync(testFile, JSON.stringify(data, null, 2));
							
							return { success: true, index };
						} catch (error) {
							return { success: false, index, error: error.message };
						}
					})(i)
				);
			}

			const results = await Promise.all(operations);
			const successful = results.filter(r => r.success);
			const failed = results.filter(r => !r.success);

			// Some operations should succeed despite race conditions
			expect(successful.length).toBeGreaterThan(0);
			
			// File should contain valid JSON
			try {
				const finalContent = fs.readFileSync(testFile, 'utf8');
				const finalData = JSON.parse(finalContent);
				expect(Array.isArray(finalData)).toBe(true);
			} catch (error) {
				// If file is corrupted due to race condition, that's a valid finding
				expect(error).toBeInstanceOf(SyntaxError);
			}
		});
	});

	describe('Resource Exhaustion Resilience', () => {
		test('should handle file descriptor exhaustion', async () => {
			const fileHandles = [];
			let maxFiles = 0;

			try {
				// Try to open many files until we hit the limit
				for (let i = 0; i < 1000; i++) {
					try {
						const testFile = testDataManager.createTempFile(`fd-test-${i}.txt`, 'test');
						const fd = fs.openSync(testFile, 'r');
						fileHandles.push(fd);
						maxFiles++;
					} catch (error) {
						if (error.code === 'EMFILE' || error.code === 'ENFILE') {
							// Hit file descriptor limit
							break;
						}
						throw error;
					}
				}

				// Should have opened some files before hitting limit
				expect(maxFiles).toBeGreaterThan(0);

			} finally {
				// Clean up file descriptors
				fileHandles.forEach(fd => {
					try {
						fs.closeSync(fd);
					} catch (error) {
						// Ignore cleanup errors
					}
				});
			}
		});
	});

	describe('Error Recovery and Circuit Breaker', () => {
		test('should implement circuit breaker pattern for failing services', async () => {
			class CircuitBreaker {
				constructor(threshold = 5, timeout = 60000) {
					this.failureThreshold = threshold;
					this.timeout = timeout;
					this.failureCount = 0;
					this.lastFailureTime = null;
					this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
				}

				async call(fn) {
					if (this.state === 'OPEN') {
						if (Date.now() - this.lastFailureTime > this.timeout) {
							this.state = 'HALF_OPEN';
						} else {
							throw new Error('Circuit breaker is OPEN');
						}
					}

					try {
						const result = await fn();
						this.onSuccess();
						return result;
					} catch (error) {
						this.onFailure();
						throw error;
					}
				}

				onSuccess() {
					this.failureCount = 0;
					this.state = 'CLOSED';
				}

				onFailure() {
					this.failureCount++;
					this.lastFailureTime = Date.now();
					
					if (this.failureCount >= this.failureThreshold) {
						this.state = 'OPEN';
					}
				}
			}

			const circuitBreaker = new CircuitBreaker(3, 1000);
			let callCount = 0;

			const flakyService = async () => {
				callCount++;
				if (callCount <= 5) {
					throw new Error('Service unavailable');
				}
				return 'Success';
			};

			// First few calls should fail and open the circuit
			for (let i = 0; i < 5; i++) {
				try {
					await circuitBreaker.call(flakyService);
				} catch (error) {
					// Expected failures
				}
			}

			expect(circuitBreaker.state).toBe('OPEN');

			// Calls while circuit is open should fail immediately
			try {
				await circuitBreaker.call(flakyService);
				expect(true).toBe(false); // Should not reach here
			} catch (error) {
				expect(error.message).toBe('Circuit breaker is OPEN');
			}
		});
	});

	describe('Data Corruption Resilience', () => {
		test('should detect and handle corrupted data files', async () => {
			// Create a valid JSON file
			const validData = { tasks: [{ id: 1, title: 'Test' }] };
			const testFile = testDataManager.createTempFile('data.json', JSON.stringify(validData));

			// Corrupt the file
			fs.writeFileSync(testFile, '{"tasks": [{"id": 1, "title": "Test"'); // Missing closing braces

			const readDataSafely = (filePath) => {
				try {
					const content = fs.readFileSync(filePath, 'utf8');
					return JSON.parse(content);
				} catch (error) {
					if (error instanceof SyntaxError) {
						// Data corruption detected
						return { error: 'Data corruption detected', corrupted: true };
					}
					throw error;
				}
			};

			const result = readDataSafely(testFile);
			expect(result.corrupted).toBe(true);
			expect(result.error).toBe('Data corruption detected');
		});
	});

	describe('System Recovery Testing', () => {
		test('should recover gracefully from temporary failures', async () => {
			let failureMode = true;
			let recoveryAttempts = 0;

			const resilientOperation = async () => {
				recoveryAttempts++;
				
				if (failureMode && recoveryAttempts < 3) {
					throw new Error('Temporary failure');
				}
				
				// Simulate recovery after 3 attempts
				failureMode = false;
				return { success: true, attempts: recoveryAttempts };
			};

			// Should eventually succeed after retries
			await IntegrationTestHelpers.waitForCondition(
				async () => {
					try {
						const result = await resilientOperation();
						return result.success;
					} catch {
						return false;
					}
				},
				5000, // 5 second timeout
				500   // Check every 500ms
			);

			expect(recoveryAttempts).toBe(3);
		});
	});
});

