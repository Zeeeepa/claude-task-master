/**
 * Retry Logic Tests
 * 
 * Comprehensive test suite for retry mechanisms, backoff strategies,
 * and retry policy configurations.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
  RetryManager, 
  RetryUtils, 
  RetryPolicies 
} from '../core/retry_manager.js';
import { 
  ErrorTypes, 
  SystemError, 
  NetworkError, 
  TimeoutError, 
  RateLimitError 
} from '../utils/error_types.js';

describe('Retry Manager Configuration', () => {
  test('should use default configuration', () => {
    const retryManager = new RetryManager();
    
    expect(retryManager.config.maxRetries).toBe(3);
    expect(retryManager.config.baseDelay).toBe(1000);
    expect(retryManager.config.backoffMultiplier).toBe(2);
    expect(retryManager.config.jitterEnabled).toBe(true);
  });

  test('should accept custom configuration', () => {
    const config = {
      maxRetries: 5,
      baseDelay: 500,
      backoffMultiplier: 1.5,
      jitterEnabled: false,
      timeoutMs: 30000
    };
    
    const retryManager = new RetryManager(config);
    
    expect(retryManager.config.maxRetries).toBe(5);
    expect(retryManager.config.baseDelay).toBe(500);
    expect(retryManager.config.backoffMultiplier).toBe(1.5);
    expect(retryManager.config.jitterEnabled).toBe(false);
    expect(retryManager.config.timeoutMs).toBe(30000);
  });

  test('should create retry manager with predefined policy', () => {
    const retryManager = RetryManager.withPolicy('API_CALLS');
    
    expect(retryManager.config.maxRetries).toBe(RetryPolicies.API_CALLS.maxRetries);
    expect(retryManager.config.baseDelay).toBe(RetryPolicies.API_CALLS.baseDelay);
  });

  test('should override policy with custom config', () => {
    const retryManager = RetryManager.withPolicy('API_CALLS', {
      maxRetries: 10
    });
    
    expect(retryManager.config.maxRetries).toBe(10);
    expect(retryManager.config.baseDelay).toBe(RetryPolicies.API_CALLS.baseDelay);
  });
});

describe('Exponential Backoff Calculation', () => {
  let retryManager;

  beforeEach(() => {
    retryManager = new RetryManager({
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitterEnabled: false
    });
  });

  test('should calculate exponential backoff correctly', () => {
    expect(retryManager.calculateDelay(1)).toBe(1000);  // 1000 * 2^0
    expect(retryManager.calculateDelay(2)).toBe(2000);  // 1000 * 2^1
    expect(retryManager.calculateDelay(3)).toBe(4000);  // 1000 * 2^2
    expect(retryManager.calculateDelay(4)).toBe(8000);  // 1000 * 2^3
  });

  test('should respect maximum delay', () => {
    const delay = retryManager.calculateDelay(10); // Would be 512000 without max
    expect(delay).toBe(30000);
  });

  test('should add jitter when enabled', () => {
    const jitteredRetryManager = new RetryManager({
      baseDelay: 1000,
      backoffMultiplier: 2,
      jitterEnabled: true
    });
    
    const delay1 = jitteredRetryManager.calculateDelay(2);
    const delay2 = jitteredRetryManager.calculateDelay(2);
    
    // With jitter, delays should be different
    expect(delay1).not.toBe(delay2);
    
    // Both should be around 2000ms but with variation
    expect(delay1).toBeGreaterThan(1800);
    expect(delay1).toBeLessThan(2200);
    expect(delay2).toBeGreaterThan(1800);
    expect(delay2).toBeLessThan(2200);
  });

  test('should handle rate limit retry-after header', () => {
    const rateLimitError = new RateLimitError('Rate limited', 45);
    const delay = retryManager.calculateDelay(1, rateLimitError);
    
    expect(delay).toBe(45000); // 45 seconds
  });
});

describe('Retry Logic Execution', () => {
  let retryManager;
  let mockOperation;

  beforeEach(() => {
    retryManager = new RetryManager({
      maxRetries: 3,
      baseDelay: 10, // Fast for testing
      backoffMultiplier: 2,
      jitterEnabled: false
    });
    
    mockOperation = jest.fn();
  });

  test('should succeed immediately on first attempt', async () => {
    mockOperation.mockResolvedValueOnce('success');
    
    const result = await retryManager.executeWithRetry(mockOperation);
    
    expect(result).toBe('success');
    expect(mockOperation).toHaveBeenCalledTimes(1);
  });

  test('should retry on retryable errors', async () => {
    mockOperation
      .mockRejectedValueOnce(new NetworkError('Connection failed'))
      .mockRejectedValueOnce(new TimeoutError('Request timeout'))
      .mockResolvedValueOnce('success');

    const result = await retryManager.executeWithRetry(mockOperation);
    
    expect(result).toBe('success');
    expect(mockOperation).toHaveBeenCalledTimes(3);
  });

  test('should not retry on non-retryable errors', async () => {
    const authError = new SystemError(
      'Unauthorized',
      ErrorTypes.AUTHENTICATION_ERROR,
      false
    );
    
    mockOperation.mockRejectedValueOnce(authError);
    
    await expect(retryManager.executeWithRetry(mockOperation))
      .rejects.toThrow('Unauthorized');
    
    expect(mockOperation).toHaveBeenCalledTimes(1);
  });

  test('should exhaust retries and throw last error', async () => {
    const networkError = new NetworkError('Persistent network error');
    mockOperation.mockRejectedValue(networkError);
    
    await expect(retryManager.executeWithRetry(mockOperation))
      .rejects.toThrow('Persistent network error');
    
    expect(mockOperation).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  test('should call retry callbacks', async () => {
    const onRetry = jest.fn();
    const onSuccess = jest.fn();
    const onFailure = jest.fn();
    
    const callbackRetryManager = new RetryManager({
      maxRetries: 2,
      baseDelay: 10,
      onRetry,
      onSuccess,
      onFailure
    });
    
    mockOperation
      .mockRejectedValueOnce(new NetworkError('Network error'))
      .mockResolvedValueOnce('success');
    
    const result = await callbackRetryManager.executeWithRetry(mockOperation);
    
    expect(result).toBe('success');
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onFailure).not.toHaveBeenCalled();
  });

  test('should call failure callback when all retries exhausted', async () => {
    const onFailure = jest.fn();
    
    const callbackRetryManager = new RetryManager({
      maxRetries: 1,
      baseDelay: 10,
      onFailure
    });
    
    mockOperation.mockRejectedValue(new NetworkError('Persistent error'));
    
    await expect(callbackRetryManager.executeWithRetry(mockOperation))
      .rejects.toThrow('Persistent error');
    
    expect(onFailure).toHaveBeenCalledTimes(1);
  });
});

describe('Timeout Handling', () => {
  let retryManager;

  beforeEach(() => {
    retryManager = new RetryManager({
      maxRetries: 2,
      baseDelay: 10,
      timeoutMs: 50
    });
  });

  test('should timeout slow operations', async () => {
    const slowOperation = () => new Promise(resolve => 
      setTimeout(() => resolve('slow'), 100)
    );
    
    await expect(retryManager.executeWithRetry(slowOperation))
      .rejects.toThrow('timed out');
  });

  test('should respect custom timeout in context', async () => {
    const slowOperation = () => new Promise(resolve => 
      setTimeout(() => resolve('slow'), 30)
    );
    
    const result = await retryManager.executeWithRetry(
      slowOperation,
      { timeoutMs: 100 }
    );
    
    expect(result).toBe('slow');
  });

  test('should retry timeout errors', async () => {
    let callCount = 0;
    const timeoutOperation = () => {
      callCount++;
      return new Promise(resolve => 
        setTimeout(() => resolve(`attempt-${callCount}`), callCount === 3 ? 10 : 100)
      );
    };
    
    const result = await retryManager.executeWithRetry(timeoutOperation);
    
    expect(result).toBe('attempt-3');
    expect(callCount).toBe(3);
  });
});

describe('Parallel and Sequential Execution', () => {
  let retryManager;

  beforeEach(() => {
    retryManager = new RetryManager({
      maxRetries: 2,
      baseDelay: 10
    });
  });

  test('should execute operations in parallel', async () => {
    const operations = [
      () => Promise.resolve('result1'),
      () => Promise.resolve('result2'),
      () => Promise.resolve('result3')
    ];
    
    const startTime = Date.now();
    const results = await retryManager.executeParallel(operations);
    const endTime = Date.now();
    
    expect(results).toEqual(['result1', 'result2', 'result3']);
    expect(endTime - startTime).toBeLessThan(100); // Should be fast for parallel
  });

  test('should handle failures in parallel execution', async () => {
    const operations = [
      () => Promise.resolve('success'),
      () => Promise.reject(new SystemError('Auth error', ErrorTypes.AUTHENTICATION_ERROR, false)),
      () => Promise.resolve('success2')
    ];
    
    await expect(retryManager.executeParallel(operations))
      .rejects.toThrow('Auth error');
  });

  test('should execute operations sequentially', async () => {
    const executionOrder = [];
    const operations = [
      () => { executionOrder.push(1); return Promise.resolve('result1'); },
      () => { executionOrder.push(2); return Promise.resolve('result2'); },
      () => { executionOrder.push(3); return Promise.resolve('result3'); }
    ];
    
    const results = await retryManager.executeSequential(operations);
    
    expect(results).toEqual(['result1', 'result2', 'result3']);
    expect(executionOrder).toEqual([1, 2, 3]);
  });

  test('should stop sequential execution on failure', async () => {
    const executionOrder = [];
    const operations = [
      () => { executionOrder.push(1); return Promise.resolve('result1'); },
      () => { 
        executionOrder.push(2); 
        return Promise.reject(new SystemError('Stop here', ErrorTypes.VALIDATION_ERROR, false)); 
      },
      () => { executionOrder.push(3); return Promise.resolve('result3'); }
    ];
    
    await expect(retryManager.executeSequential(operations))
      .rejects.toThrow('Stop here');
    
    expect(executionOrder).toEqual([1, 2]); // Third operation should not execute
  });
});

describe('Function Wrapping', () => {
  let retryManager;

  beforeEach(() => {
    retryManager = new RetryManager({
      maxRetries: 2,
      baseDelay: 10
    });
  });

  test('should wrap function with retry logic', async () => {
    let callCount = 0;
    const flakyFunction = (arg1, arg2) => {
      callCount++;
      if (callCount <= 2) {
        throw new NetworkError('Network error');
      }
      return `${arg1}-${arg2}`;
    };
    
    const wrappedFunction = retryManager.wrap(flakyFunction);
    const result = await wrappedFunction('hello', 'world');
    
    expect(result).toBe('hello-world');
    expect(callCount).toBe(3);
  });

  test('should preserve function arguments in wrapped function', async () => {
    const mockFunction = jest.fn().mockResolvedValue('success');
    const wrappedFunction = retryManager.wrap(mockFunction);
    
    await wrappedFunction('arg1', 'arg2', { key: 'value' });
    
    expect(mockFunction).toHaveBeenCalledWith('arg1', 'arg2', { key: 'value' });
  });
});

describe('Retry Utilities', () => {
  test('should create API retry manager', () => {
    const apiRetryManager = RetryUtils.forApiCalls();
    
    expect(apiRetryManager.config.maxRetries).toBe(RetryPolicies.API_CALLS.maxRetries);
    expect(apiRetryManager.config.timeoutMs).toBe(RetryPolicies.API_CALLS.timeoutMs);
  });

  test('should create network retry manager', () => {
    const networkRetryManager = RetryUtils.forNetworkOps();
    
    expect(networkRetryManager.config.maxRetries).toBe(RetryPolicies.NETWORK_OPERATIONS.maxRetries);
  });

  test('should create database retry manager', () => {
    const dbRetryManager = RetryUtils.forDatabaseOps();
    
    expect(dbRetryManager.config.maxRetries).toBe(RetryPolicies.DATABASE_OPERATIONS.maxRetries);
  });

  test('should retry simple function with default settings', async () => {
    let callCount = 0;
    const flakyOperation = () => {
      callCount++;
      if (callCount <= 2) {
        throw new NetworkError('Network error');
      }
      return 'success';
    };
    
    const result = await RetryUtils.retry(flakyOperation);
    
    expect(result).toBe('success');
    expect(callCount).toBe(3);
  });

  test('should retry with custom backoff configuration', async () => {
    let callCount = 0;
    const flakyOperation = () => {
      callCount++;
      if (callCount <= 1) {
        throw new NetworkError('Network error');
      }
      return 'success';
    };
    
    const result = await RetryUtils.retryWithBackoff(flakyOperation, {
      maxRetries: 5,
      baseDelay: 5
    });
    
    expect(result).toBe('success');
    expect(callCount).toBe(2);
  });
});

describe('Metrics and Monitoring', () => {
  let retryManager;

  beforeEach(() => {
    retryManager = new RetryManager({
      maxRetries: 2,
      baseDelay: 10
    });
  });

  test('should track retry metrics', async () => {
    const operations = [
      () => Promise.resolve('success'),
      () => Promise.reject(new NetworkError('Network error')).then(() => 'success'),
      () => Promise.resolve('success')
    ];
    
    // Execute some operations
    await retryManager.executeWithRetry(operations[0]);
    
    try {
      await retryManager.executeWithRetry(operations[1]);
    } catch (error) {
      // Expected to fail
    }
    
    await retryManager.executeWithRetry(operations[2]);
    
    const metrics = retryManager.getMetrics();
    
    expect(metrics.totalAttempts).toBeGreaterThan(0);
    expect(metrics.successRate).toBeGreaterThan(0);
    expect(metrics.successRate).toBeLessThanOrEqual(1);
  });

  test('should reset metrics', () => {
    // Execute an operation to generate metrics
    retryManager.executeWithRetry(() => Promise.resolve('success'));
    
    let metrics = retryManager.getMetrics();
    expect(metrics.totalAttempts).toBeGreaterThan(0);
    
    retryManager.resetMetrics();
    
    metrics = retryManager.getMetrics();
    expect(metrics.totalAttempts).toBe(0);
    expect(metrics.successfulRetries).toBe(0);
    expect(metrics.failedRetries).toBe(0);
  });

  test('should calculate average delay', async () => {
    let callCount = 0;
    const flakyOperation = () => {
      callCount++;
      if (callCount <= 2) {
        throw new NetworkError('Network error');
      }
      return 'success';
    };
    
    await retryManager.executeWithRetry(flakyOperation);
    
    const metrics = retryManager.getMetrics();
    expect(metrics.averageDelay).toBeGreaterThan(0);
  });
});

describe('Error Context Enhancement', () => {
  let retryManager;

  beforeEach(() => {
    retryManager = new RetryManager({
      maxRetries: 2,
      baseDelay: 10
    });
  });

  test('should enhance errors with retry context', async () => {
    const originalError = new NetworkError('Original network error');
    const operation = jest.fn().mockRejectedValue(originalError);
    
    try {
      await retryManager.executeWithRetry(operation, {
        operationId: 'test-op-123',
        errorContext: { component: 'test-component' }
      });
    } catch (enhancedError) {
      expect(enhancedError.metadata.retryContext).toBeDefined();
      expect(enhancedError.metadata.retryContext.operationId).toBe('test-op-123');
      expect(enhancedError.metadata.retryContext.attempt).toBe(3); // Final attempt
    }
  });

  test('should preserve original error information', async () => {
    const originalError = new NetworkError('Original error');
    originalError.customProperty = 'custom-value';
    
    const operation = jest.fn().mockRejectedValue(originalError);
    
    try {
      await retryManager.executeWithRetry(operation);
    } catch (enhancedError) {
      expect(enhancedError.message).toBe('Original error');
      expect(enhancedError.type).toBe(ErrorTypes.NETWORK_ERROR);
      expect(enhancedError.customProperty).toBe('custom-value');
    }
  });
});

describe('Edge Cases and Error Conditions', () => {
  test('should handle invalid operation type', async () => {
    const retryManager = new RetryManager();
    
    await expect(retryManager.executeWithRetry('not-a-function'))
      .rejects.toThrow('Operation must be a function');
  });

  test('should handle unknown retry policy', () => {
    expect(() => RetryManager.withPolicy('UNKNOWN_POLICY'))
      .toThrow('Unknown retry policy: UNKNOWN_POLICY');
  });

  test('should handle zero max retries', async () => {
    const retryManager = new RetryManager({ maxRetries: 0 });
    const operation = jest.fn().mockRejectedValue(new NetworkError('Error'));
    
    await expect(retryManager.executeWithRetry(operation))
      .rejects.toThrow('Error');
    
    expect(operation).toHaveBeenCalledTimes(1); // Only initial attempt
  });

  test('should handle negative delays gracefully', () => {
    const retryManager = new RetryManager({
      baseDelay: -1000,
      jitterEnabled: true
    });
    
    const delay = retryManager.calculateDelay(1);
    expect(delay).toBeGreaterThanOrEqual(0);
  });
});

