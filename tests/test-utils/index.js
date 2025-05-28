/**
 * Comprehensive Test Utilities
 * 
 * This module provides utilities for testing across all components of the system.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test Data Management
 */
export class TestDataManager {
	constructor() {
		this.tempDir = path.join(__dirname, '..', 'temp');
		this.fixturesDir = path.join(__dirname, '..', 'fixtures');
	}

	/**
	 * Create a temporary test file
	 */
	createTempFile(filename, content) {
		const filePath = path.join(this.tempDir, filename);
		fs.writeFileSync(filePath, content);
		return filePath;
	}

	/**
	 * Create a temporary test directory
	 */
	createTempDir(dirname) {
		const dirPath = path.join(this.tempDir, dirname);
		fs.mkdirSync(dirPath, { recursive: true });
		return dirPath;
	}

	/**
	 * Clean up temporary files
	 */
	cleanup() {
		if (fs.existsSync(this.tempDir)) {
			fs.rmSync(this.tempDir, { recursive: true, force: true });
		}
	}

	/**
	 * Load test fixture
	 */
	loadFixture(filename) {
		const fixturePath = path.join(this.fixturesDir, filename);
		if (!fs.existsSync(fixturePath)) {
			throw new Error(`Fixture not found: ${filename}`);
		}
		return fs.readFileSync(fixturePath, 'utf8');
	}

	/**
	 * Generate realistic test data
	 */
	generateTestTasks(count = 5) {
		const tasks = [];
		for (let i = 1; i <= count; i++) {
			tasks.push({
				id: i,
				title: `Test Task ${i}`,
				description: `This is a test task description for task ${i}`,
				status: i % 3 === 0 ? 'done' : 'pending',
				priority: ['low', 'medium', 'high'][i % 3],
				dependencies: i > 1 ? [i - 1] : [],
				subtasks: i === 1 ? [
					{
						id: `${i}.1`,
						title: `Subtask ${i}.1`,
						description: `Subtask description`,
						status: 'pending'
					}
				] : []
			});
		}
		return tasks;
	}
}

/**
 * Mock Factory for AI Services
 */
export class MockAIFactory {
	/**
	 * Create mock for Claude API
	 */
	static createClaudeMock() {
		return {
			generateText: jest.fn().mockResolvedValue('Mock Claude response'),
			streamText: jest.fn().mockResolvedValue({
				textStream: async function* () {
					yield 'Mock ';
					yield 'Claude ';
					yield 'stream';
				}
			})
		};
	}

	/**
	 * Create mock for OpenAI API
	 */
	static createOpenAIMock() {
		return {
			chat: {
				completions: {
					create: jest.fn().mockResolvedValue({
						choices: [{
							message: {
								content: 'Mock OpenAI response'
							}
						}]
					})
				}
			}
		};
	}

	/**
	 * Create mock for Perplexity API
	 */
	static createPerplexityMock() {
		return {
			generateText: jest.fn().mockResolvedValue('Mock Perplexity response')
		};
	}
}

/**
 * Performance Testing Utilities
 */
export class PerformanceTestUtils {
	/**
	 * Measure execution time of a function
	 */
	static async measureExecutionTime(fn) {
		const start = process.hrtime.bigint();
		const result = await fn();
		const end = process.hrtime.bigint();
		const duration = Number(end - start) / 1000000; // Convert to milliseconds
		
		return {
			result,
			duration,
			durationMs: duration
		};
	}

	/**
	 * Run load test with multiple concurrent executions
	 */
	static async runLoadTest(fn, concurrency = 10, iterations = 100) {
		const results = [];
		const promises = [];

		for (let i = 0; i < concurrency; i++) {
			const promise = (async () => {
				const iterationResults = [];
				for (let j = 0; j < iterations / concurrency; j++) {
					const measurement = await this.measureExecutionTime(fn);
					iterationResults.push(measurement);
				}
				return iterationResults;
			})();
			promises.push(promise);
		}

		const concurrentResults = await Promise.all(promises);
		concurrentResults.forEach(batch => results.push(...batch));

		return {
			totalExecutions: results.length,
			averageDuration: results.reduce((sum, r) => sum + r.duration, 0) / results.length,
			minDuration: Math.min(...results.map(r => r.duration)),
			maxDuration: Math.max(...results.map(r => r.duration)),
			results
		};
	}

	/**
	 * Memory usage monitoring
	 */
	static getMemoryUsage() {
		const usage = process.memoryUsage();
		return {
			rss: usage.rss / 1024 / 1024, // MB
			heapTotal: usage.heapTotal / 1024 / 1024, // MB
			heapUsed: usage.heapUsed / 1024 / 1024, // MB
			external: usage.external / 1024 / 1024 // MB
		};
	}
}

/**
 * Security Testing Utilities
 */
export class SecurityTestUtils {
	/**
	 * Test for SQL injection vulnerabilities
	 */
	static getSQLInjectionPayloads() {
		return [
			"'; DROP TABLE users; --",
			"' OR '1'='1",
			"' UNION SELECT * FROM users --",
			"'; INSERT INTO users VALUES ('hacker', 'password'); --"
		];
	}

	/**
	 * Test for XSS vulnerabilities
	 */
	static getXSSPayloads() {
		return [
			"<script>alert('XSS')</script>",
			"javascript:alert('XSS')",
			"<img src=x onerror=alert('XSS')>",
			"<svg onload=alert('XSS')>"
		];
	}

	/**
	 * Test for path traversal vulnerabilities
	 */
	static getPathTraversalPayloads() {
		return [
			"../../../etc/passwd",
			"..\\..\\..\\windows\\system32\\config\\sam",
			"....//....//....//etc/passwd",
			"%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd"
		];
	}

	/**
	 * Validate input sanitization
	 */
	static testInputSanitization(sanitizeFunction, maliciousInputs) {
		const results = [];
		for (const input of maliciousInputs) {
			try {
				const sanitized = sanitizeFunction(input);
				results.push({
					input,
					sanitized,
					safe: !sanitized.includes('<script>') && !sanitized.includes('javascript:')
				});
			} catch (error) {
				results.push({
					input,
					error: error.message,
					safe: true // Error is better than executing malicious code
				});
			}
		}
		return results;
	}
}

/**
 * Chaos Engineering Utilities
 */
export class ChaosTestUtils {
	/**
	 * Simulate network failures
	 */
	static simulateNetworkFailure(probability = 0.1) {
		return Math.random() < probability;
	}

	/**
	 * Simulate random delays
	 */
	static async simulateRandomDelay(minMs = 100, maxMs = 1000) {
		const delay = Math.random() * (maxMs - minMs) + minMs;
		await new Promise(resolve => setTimeout(resolve, delay));
	}

	/**
	 * Simulate memory pressure
	 */
	static simulateMemoryPressure(sizeMB = 100) {
		const buffer = Buffer.alloc(sizeMB * 1024 * 1024);
		return buffer;
	}

	/**
	 * Simulate file system errors
	 */
	static simulateFileSystemError(operation = 'read') {
		const errors = {
			read: new Error('ENOENT: no such file or directory'),
			write: new Error('EACCES: permission denied'),
			delete: new Error('EBUSY: resource busy or locked')
		};
		throw errors[operation] || new Error('Unknown file system error');
	}
}

/**
 * Integration Test Helpers
 */
export class IntegrationTestHelpers {
	/**
	 * Set up test database
	 */
	static async setupTestDatabase() {
		// Mock database setup for testing
		return {
			connect: jest.fn().mockResolvedValue(true),
			disconnect: jest.fn().mockResolvedValue(true),
			query: jest.fn().mockResolvedValue([]),
			insert: jest.fn().mockResolvedValue({ id: 1 }),
			update: jest.fn().mockResolvedValue({ affected: 1 }),
			delete: jest.fn().mockResolvedValue({ affected: 1 })
		};
	}

	/**
	 * Set up test webhook server
	 */
	static async setupTestWebhookServer(port = 3001) {
		const express = await import('express');
		const app = express.default();
		
		app.use(express.json());
		
		const receivedWebhooks = [];
		
		app.post('/webhook', (req, res) => {
			receivedWebhooks.push({
				timestamp: new Date().toISOString(),
				headers: req.headers,
				body: req.body
			});
			res.status(200).json({ received: true });
		});

		const server = app.listen(port);
		
		return {
			server,
			receivedWebhooks,
			close: () => server.close()
		};
	}

	/**
	 * Wait for condition to be met
	 */
	static async waitForCondition(conditionFn, timeoutMs = 5000, intervalMs = 100) {
		const startTime = Date.now();
		
		while (Date.now() - startTime < timeoutMs) {
			if (await conditionFn()) {
				return true;
			}
			await new Promise(resolve => setTimeout(resolve, intervalMs));
		}
		
		throw new Error(`Condition not met within ${timeoutMs}ms`);
	}
}

// Export all utilities
export {
	TestDataManager,
	MockAIFactory,
	PerformanceTestUtils,
	SecurityTestUtils,
	ChaosTestUtils,
	IntegrationTestHelpers
};

// Default export for convenience
export default {
	TestDataManager,
	MockAIFactory,
	PerformanceTestUtils,
	SecurityTestUtils,
	ChaosTestUtils,
	IntegrationTestHelpers
};

