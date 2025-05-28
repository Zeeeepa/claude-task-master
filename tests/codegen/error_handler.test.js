/**
 * @fileoverview Tests for Codegen Error Handler
 * @description Comprehensive tests for error handling and recovery
 */

import { jest } from '@jest/globals';
import { CodegenErrorHandler } from '../../src/ai_cicd_system/core/error_handler.js';
import { CodegenError } from '../../src/ai_cicd_system/core/codegen_client.js';

describe('CodegenErrorHandler', () => {
	let errorHandler;

	beforeEach(() => {
		errorHandler = new CodegenErrorHandler({
			enableRetry: true,
			maxRetries: 3,
			baseDelay: 1000,
			enableCircuitBreaker: true,
			circuitBreakerThreshold: 3
		});
	});

	describe('constructor', () => {
		it('should initialize with default config', () => {
			const handler = new CodegenErrorHandler();
			expect(handler.config.enableRetry).toBe(true);
			expect(handler.config.maxRetries).toBe(3);
		});

		it('should use provided config', () => {
			const config = { maxRetries: 5, baseDelay: 2000 };
			const handler = new CodegenErrorHandler(config);
			expect(handler.config.maxRetries).toBe(5);
			expect(handler.config.baseDelay).toBe(2000);
		});
	});

	describe('handleError', () => {
		it('should handle CodegenError instances', async () => {
			const error = new CodegenError(
				'RATE_LIMIT_EXCEEDED',
				'Rate limit exceeded'
			);
			const result = await errorHandler.handleError(error);

			expect(result.success).toBe(false);
			expect(result.error).toBeInstanceOf(CodegenError);
			expect(result.retryable).toBe(true);
		});

		it('should handle HTTP errors', async () => {
			const error = new Error('HTTP Error');
			error.response = { status: 500 };

			const result = await errorHandler.handleError(error);

			expect(result.success).toBe(false);
			expect(result.retryable).toBe(true);
		});

		it('should handle network errors', async () => {
			const error = new Error('Network Error');
			error.code = 'ECONNREFUSED';

			const result = await errorHandler.handleError(error);

			expect(result.success).toBe(false);
			expect(result.retryable).toBe(true);
		});

		it('should record error statistics', async () => {
			const error = new CodegenError('TEST_ERROR', 'Test error');
			await errorHandler.handleError(error);

			const stats = errorHandler.getStatistics();
			expect(stats.totalErrors).toBe(1);
		});
	});

	describe('_analyzeError', () => {
		it('should analyze CodegenError correctly', () => {
			const error = new CodegenError('AUTHENTICATION_FAILED', 'Auth failed');
			const analysis = errorHandler._analyzeError(error);

			expect(analysis.type).toBe('AUTHENTICATION_FAILED');
			expect(analysis.retryable).toBe(false);
		});

		it('should analyze HTTP errors correctly', () => {
			const error = new Error('HTTP Error');
			error.response = { status: 429 };

			const analysis = errorHandler._analyzeError(error);

			expect(analysis.type).toBe('RATE_LIMIT_EXCEEDED');
			expect(analysis.retryable).toBe(true);
		});

		it('should analyze timeout errors correctly', () => {
			const error = new Error('Timeout');
			error.code = 'ETIMEDOUT';

			const analysis = errorHandler._analyzeError(error);

			expect(analysis.type).toBe('TIMEOUT_ERROR');
			expect(analysis.retryable).toBe(true);
		});
	});

	describe('_getHttpErrorInfo', () => {
		it('should map HTTP status codes correctly', () => {
			const testCases = [
				{ status: 400, expectedType: 'BAD_REQUEST', retryable: false },
				{
					status: 401,
					expectedType: 'AUTHENTICATION_FAILED',
					retryable: false
				},
				{ status: 429, expectedType: 'RATE_LIMIT_EXCEEDED', retryable: true },
				{ status: 500, expectedType: 'SERVER_ERROR', retryable: true },
				{ status: 502, expectedType: 'SERVER_ERROR', retryable: true }
			];

			testCases.forEach(({ status, expectedType, retryable }) => {
				const info = errorHandler._getHttpErrorInfo(status);
				expect(info.type).toBe(expectedType);
				expect(info.retryable).toBe(retryable);
			});
		});

		it('should handle unknown status codes', () => {
			const info = errorHandler._getHttpErrorInfo(999);
			expect(info.type).toBe('HTTP_ERROR');
			expect(info.code).toBe('HTTP_999');
		});
	});

	describe('_handleRateLimitError', () => {
		it('should handle rate limit errors with backoff', async () => {
			const errorInfo = {
				type: 'RATE_LIMIT_EXCEEDED',
				delay: 60000,
				userMessage: 'Rate limit exceeded'
			};

			const result = await errorHandler._handleRateLimitError(errorInfo);

			expect(result.success).toBe(false);
			expect(result.retryable).toBe(true);
			expect(result.delay).toBe(30000); // Limited by maxDelay default (30000)
			expect(result.strategy).toBe('exponential_backoff');
		});
	});

	describe('_handleAuthError', () => {
		it('should handle authentication errors as non-retryable', async () => {
			const errorInfo = {
				type: 'AUTHENTICATION_FAILED',
				userMessage: 'Authentication failed'
			};

			const result = await errorHandler._handleAuthError(errorInfo);

			expect(result.success).toBe(false);
			expect(result.retryable).toBe(false);
			expect(result.requiresUserAction).toBe(true);
		});
	});

	describe('circuit breaker', () => {
		it('should open circuit after threshold failures', async () => {
			const error = new CodegenError('SERVER_ERROR', 'Server error');

			// Trigger failures to open circuit
			for (let i = 0; i < 3; i++) {
				await errorHandler.handleError(error);
			}

			// Circuit should be open now
			await expect(errorHandler.handleError(error)).rejects.toThrow(
				'Circuit breaker is open'
			);
		});

		it('should reset circuit on success', async () => {
			const error = new CodegenError('SERVER_ERROR', 'Server error');

			// Trigger some failures
			await errorHandler.handleError(error);
			await errorHandler.handleError(error);

			// Simulate success
			errorHandler.circuitBreaker.recordSuccess();

			// Should not throw circuit breaker error
			const result = await errorHandler.handleError(error);
			expect(result.success).toBe(false);
		});
	});

	describe('getStatistics', () => {
		it('should return error statistics', async () => {
			const error1 = new CodegenError('NETWORK_ERROR', 'Network error');
			const error2 = new CodegenError('TIMEOUT_ERROR', 'Timeout error');

			await errorHandler.handleError(error1);
			await errorHandler.handleError(error2);

			const stats = errorHandler.getStatistics();

			expect(stats.totalErrors).toBe(2);
			expect(stats.errorsByType).toHaveProperty('NETWORK_ERROR');
			expect(stats.errorsByType).toHaveProperty('TIMEOUT_ERROR');
		});
	});

	describe('resetStatistics', () => {
		it('should reset all statistics', async () => {
			const error = new CodegenError('TEST_ERROR', 'Test error');
			await errorHandler.handleError(error);

			errorHandler.resetStatistics();

			const stats = errorHandler.getStatistics();
			expect(stats.totalErrors).toBe(0);
		});
	});
});

describe('CircuitBreaker Integration', () => {
	let errorHandler;

	beforeEach(() => {
		errorHandler = new CodegenErrorHandler({
			enableRetry: true,
			maxRetries: 3,
			baseDelay: 1000,
			enableCircuitBreaker: true,
			circuitBreakerThreshold: 3
		});
	});

	describe('circuit breaker functionality', () => {
		it('should open circuit after threshold failures', async () => {
			// Simulate multiple failures to trigger circuit breaker
			const mockError = new CodegenError('TEST_ERROR', 'Test error', false);
			
			// Record multiple failures
			for (let i = 0; i < 3; i++) {
				try {
					await errorHandler.handleError(mockError, async () => {
						throw mockError;
					});
				} catch (e) {
					// Expected to fail
				}
			}

			// Circuit should be open now, so next call should fail fast
			const startTime = Date.now();
			try {
				await errorHandler.handleError(mockError, async () => {
					throw mockError;
				});
			} catch (e) {
				const duration = Date.now() - startTime;
				// Should fail fast (less than retry delay)
				expect(duration).toBeLessThan(500);
			}
		});
	});
});

describe('ErrorStatistics Integration', () => {
	let errorHandler;

	beforeEach(() => {
		errorHandler = new CodegenErrorHandler({
			enableRetry: true,
			maxRetries: 3,
			baseDelay: 1000
		});
	});

	describe('error tracking', () => {
		it('should track error statistics', async () => {
			const mockError = new CodegenError('TEST_ERROR', 'Test error', false);
			
			try {
				await errorHandler.handleError(mockError, async () => {
					throw mockError;
				});
			} catch (e) {
				// Expected to fail
			}

			const stats = errorHandler.getStatistics();
			expect(stats).toHaveProperty('totalErrors');
			expect(stats.totalErrors).toBeGreaterThan(0);
		});
	});
});
