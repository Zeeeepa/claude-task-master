/**
 * @fileoverview Tests for Codegen Client
 * @description Comprehensive tests for the real Codegen API client
 */

import { jest } from '@jest/globals';
import {
	CodegenAgent,
	CodegenTask,
	CodegenError,
	RateLimiter
} from '../../src/ai_cicd_system/core/codegen_client.js';

// Mock fetch globally
global.fetch = jest.fn();

describe('CodegenAgent', () => {
	let agent;
	const mockConfig = {
		org_id: '323',
		token: 'sk-test-token',
		baseURL: 'https://api.codegen.sh',
		timeout: 120000,
		retries: 3
	};

	beforeEach(() => {
		agent = new CodegenAgent(mockConfig);
		fetch.mockClear();
	});

	describe('constructor', () => {
		it('should initialize with valid config', () => {
			expect(agent.orgId).toBe('323');
			expect(agent.token).toBe('sk-test-token');
			expect(agent.baseURL).toBe('https://api.codegen.sh');
		});

		it('should throw error without required config', () => {
			expect(() => new CodegenAgent({})).toThrow(
				'Codegen Agent requires org_id and token'
			);
		});

		it('should use default values for optional config', () => {
			const minimalAgent = new CodegenAgent({ org_id: '123', token: 'test' });
			expect(minimalAgent.timeout).toBe(120000);
			expect(minimalAgent.retries).toBe(3);
		});
	});

	describe('run', () => {
		it('should create and return a task', async () => {
			const mockTaskData = {
				id: 'task-123',
				status: 'pending',
				created_at: new Date().toISOString()
			};
			const mockResponse = {
				ok: true,
				json: jest.fn().mockResolvedValue(mockTaskData)
			};
			fetch.mockResolvedValue(mockResponse);

			const task = await agent.run('Test prompt');

			expect(fetch).toHaveBeenCalledWith(
				'https://api.codegen.sh/v1/tasks',
				expect.objectContaining({
					method: 'POST',
					headers: expect.objectContaining({
						'Content-Type': 'application/json',
						Authorization: 'Bearer sk-test-token',
						'X-Org-ID': '323'
					}),
					body: JSON.stringify({
						prompt: 'Test prompt'
					})
				})
			);

			expect(task).toBeInstanceOf(CodegenTask);
			expect(task.id).toBe('task-123');
			expect(task.status).toBe('pending');
		});

		it('should handle API errors', async () => {
			const mockResponse = {
				ok: false,
				status: 400,
				statusText: 'Bad Request',
				json: jest.fn().mockResolvedValue({ error: 'Invalid prompt' })
			};
			fetch.mockResolvedValue(mockResponse);

			await expect(agent.run('Test prompt')).rejects.toThrow(CodegenError);
		});

		it('should handle network errors', async () => {
			fetch.mockRejectedValue(new Error('Network error'));

			await expect(agent.run('Test prompt')).rejects.toThrow(CodegenError);
		});
	});

	describe('getTask', () => {
		it('should fetch task data', async () => {
			const mockTaskData = {
				id: 'task-123',
				status: 'completed',
				result: { pr_url: 'https://github.com/test/repo/pull/1' },
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			};
			const mockResponse = {
				ok: true,
				json: jest.fn().mockResolvedValue(mockTaskData)
			};
			fetch.mockResolvedValue(mockResponse);

			const taskData = await agent.getTask('task-123');

			expect(fetch).toHaveBeenCalledWith(
				'https://api.codegen.sh/v1/tasks/task-123',
				expect.objectContaining({
					method: 'GET',
					headers: expect.objectContaining({
						Authorization: 'Bearer sk-test-token',
						'X-Org-ID': '323'
					})
				})
			);

			expect(taskData).toEqual(mockTaskData);
		});

		it('should handle task not found', async () => {
			const mockResponse = {
				ok: false,
				status: 404,
				statusText: 'Not Found',
				json: jest.fn().mockResolvedValue({ error: 'Task not found' })
			};
			fetch.mockResolvedValue(mockResponse);

			await expect(agent.getTask('nonexistent')).rejects.toThrow(CodegenError);
		});
	});

	describe('_makeRequest', () => {
		it('should retry on retryable errors', async () => {
			fetch
				.mockResolvedValueOnce({
					ok: false,
					status: 500,
					statusText: 'Server Error'
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 500,
					statusText: 'Server Error'
				})
				.mockResolvedValueOnce({
					ok: true,
					json: jest.fn().mockResolvedValue({})
				});

			const response = await agent._makeRequest('GET', '/test');

			expect(fetch).toHaveBeenCalledTimes(3);
			expect(response.ok).toBe(true);
		});

		it('should not retry on non-retryable errors', async () => {
			fetch.mockResolvedValue({
				ok: false,
				status: 400,
				statusText: 'Bad Request'
			});

			const response = await agent._makeRequest('GET', '/test');

			expect(fetch).toHaveBeenCalledTimes(1);
			expect(response.ok).toBe(false);
		});

		it('should throw after max retries', async () => {
			fetch.mockResolvedValue({
				ok: false,
				status: 500,
				statusText: 'Server Error'
			});

			await expect(agent._makeRequest('GET', '/test')).rejects.toThrow();
			expect(fetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
		});
	});

	describe('_isRetryableError', () => {
		it('should identify retryable errors', () => {
			expect(agent._isRetryableError(500)).toBe(true);
			expect(agent._isRetryableError(502)).toBe(true);
			expect(agent._isRetryableError(503)).toBe(true);
			expect(agent._isRetryableError(429)).toBe(true);
			expect(agent._isRetryableError(408)).toBe(true);
		});

		it('should identify non-retryable errors', () => {
			expect(agent._isRetryableError(400)).toBe(false);
			expect(agent._isRetryableError(401)).toBe(false);
			expect(agent._isRetryableError(403)).toBe(false);
			expect(agent._isRetryableError(404)).toBe(false);
		});
	});
});

describe('CodegenTask', () => {
	let agent;
	let task;

	beforeEach(() => {
		agent = new CodegenAgent({ org_id: '323', token: 'test' });
		task = new CodegenTask('task-123', agent, {
			status: 'pending',
			created_at: new Date().toISOString()
		});
		fetch.mockClear();
	});

	describe('constructor', () => {
		it('should initialize with correct properties', () => {
			expect(task.id).toBe('task-123');
			expect(task.agent).toBe(agent);
			expect(task.status).toBe('pending');
		});

		it('should use default values for missing data', () => {
			const minimalTask = new CodegenTask('task-456', agent);
			expect(minimalTask.status).toBe('pending');
			expect(minimalTask.result).toBeNull();
		});
	});

	describe('refresh', () => {
		it('should update task status', async () => {
			const updatedData = {
				id: 'task-123',
				status: 'completed',
				result: { pr_url: 'https://github.com/test/repo/pull/1' },
				updated_at: new Date().toISOString()
			};
			const mockResponse = {
				ok: true,
				json: jest.fn().mockResolvedValue(updatedData)
			};
			fetch.mockResolvedValue(mockResponse);

			await task.refresh();

			expect(task.status).toBe('completed');
			expect(task.result).toEqual(updatedData.result);
		});

		it('should handle refresh errors', async () => {
			fetch.mockRejectedValue(new Error('Network error'));

			await expect(task.refresh()).rejects.toThrow();
		});
	});

	describe('waitForCompletion', () => {
		it('should wait for task completion', async () => {
			// Mock refresh to return completed status after first call
			let callCount = 0;
			const mockResponse = {
				ok: true,
				json: jest.fn().mockImplementation(() => {
					callCount++;
					return Promise.resolve({
						id: 'task-123',
						status: callCount === 1 ? 'running' : 'completed',
						result: { pr_url: 'https://github.com/test/repo/pull/1' }
					});
				})
			};
			fetch.mockResolvedValue(mockResponse);

			const result = await task.waitForCompletion({
				pollInterval: 100,
				maxWaitTime: 5000
			});

			expect(result).toEqual({ pr_url: 'https://github.com/test/repo/pull/1' });
			expect(task.status).toBe('completed');
		});

		it('should timeout if task takes too long', async () => {
			const mockResponse = {
				ok: true,
				json: jest.fn().mockResolvedValue({
					id: 'task-123',
					status: 'running'
				})
			};
			fetch.mockResolvedValue(mockResponse);

			await expect(
				task.waitForCompletion({
					pollInterval: 100,
					maxWaitTime: 200
				})
			).rejects.toThrow(CodegenError);
		});

		it('should handle failed tasks', async () => {
			const mockResponse = {
				ok: true,
				json: jest.fn().mockResolvedValue({
					id: 'task-123',
					status: 'failed',
					error: 'Task execution failed'
				})
			};
			fetch.mockResolvedValue(mockResponse);

			await expect(task.waitForCompletion()).rejects.toThrow(CodegenError);
		});

		it('should call progress callback', async () => {
			const progressCallback = jest.fn();
			let callCount = 0;
			const mockResponse = {
				ok: true,
				json: jest.fn().mockImplementation(() => {
					callCount++;
					return Promise.resolve({
						id: 'task-123',
						status: callCount === 1 ? 'running' : 'completed',
						result: { success: true }
					});
				})
			};
			fetch.mockResolvedValue(mockResponse);

			await task.waitForCompletion({
				pollInterval: 100,
				onProgress: progressCallback
			});

			expect(progressCallback).toHaveBeenCalledWith(task);
		});
	});

	describe('getMetadata', () => {
		it('should return task metadata', () => {
			task.result = { pr_url: 'test' };
			task.error = 'test error';

			const metadata = task.getMetadata();

			expect(metadata).toEqual({
				id: 'task-123',
				status: 'pending',
				createdAt: task.createdAt,
				updatedAt: task.updatedAt,
				hasResult: true,
				hasError: true
			});
		});
	});
});

describe('CodegenError', () => {
	describe('constructor', () => {
		it('should create error with code and message', () => {
			const error = new CodegenError('TEST_ERROR', 'Test message');

			expect(error.name).toBe('CodegenError');
			expect(error.code).toBe('TEST_ERROR');
			expect(error.message).toBe('Test message');
		});

		it('should preserve original error', () => {
			const originalError = new Error('Original');
			const error = new CodegenError(
				'TEST_ERROR',
				'Test message',
				originalError
			);

			expect(error.originalError).toBe(originalError);
		});
	});

	describe('isRetryable', () => {
		it('should identify retryable errors', () => {
			const retryableError = new CodegenError(
				'NETWORK_ERROR',
				'Network failed'
			);
			expect(retryableError.isRetryable()).toBe(true);
		});

		it('should identify non-retryable errors', () => {
			const nonRetryableError = new CodegenError(
				'AUTHENTICATION_FAILED',
				'Auth failed'
			);
			expect(nonRetryableError.isRetryable()).toBe(false);
		});
	});

	describe('getUserMessage', () => {
		it('should return user-friendly message for known codes', () => {
			const error = new CodegenError('AUTHENTICATION_FAILED', 'Auth failed');
			expect(error.getUserMessage()).toBe(
				'Invalid API credentials. Please check your token and org_id.'
			);
		});

		it('should return original message for unknown codes', () => {
			const error = new CodegenError('UNKNOWN_ERROR', 'Unknown error');
			expect(error.getUserMessage()).toBe('Unknown error');
		});
	});
});

describe('RateLimiter', () => {
	let rateLimiter;

	beforeEach(() => {
		rateLimiter = new RateLimiter({
			requestsPerMinute: 5,
			requestsPerHour: 100
		});
	});

	describe('acquire', () => {
		it('should allow requests within limits', async () => {
			await expect(rateLimiter.acquire()).resolves.toBeUndefined();
		});

		it('should track request timestamps', async () => {
			await rateLimiter.acquire();
			expect(rateLimiter.requests.length).toBe(1);
		});
	});

	describe('getStatus', () => {
		it('should return current status', () => {
			const status = rateLimiter.getStatus();

			expect(status).toHaveProperty('requestsThisMinute');
			expect(status).toHaveProperty('requestsThisHour');
			expect(status).toHaveProperty('minuteLimit');
			expect(status).toHaveProperty('hourlyLimit');
			expect(status).toHaveProperty('canMakeRequest');
		});
	});
});
