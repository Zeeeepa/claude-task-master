/**
 * Error Handling Tests
 * 
 * Comprehensive test suite for error handling, retry logic, and fault tolerance.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
  ErrorTypes, 
  SystemError, 
  NetworkError, 
  TimeoutError, 
  RateLimitError,
  ErrorClassifier 
} from '../utils/error_types.js';
import { RetryManager, RetryUtils } from '../core/retry_manager.js';
import { CircuitBreaker, CircuitBreakerManager } from '../core/circuit_breaker.js';
import { ErrorHandler } from '../core/error_handler.js';

describe('Error Types and Classification', () => {
  test('should create SystemError with proper metadata', () => {
    const error = new SystemError(
      'Test error',
      ErrorTypes.NETWORK_ERROR,
      true,
      { component: 'test' }
    );
    
    expect(error.message).toBe('Test error');
    expect(error.type).toBe(ErrorTypes.NETWORK_ERROR);
    expect(error.retryable).toBe(true);
    expect(error.metadata.component).toBe('test');
    expect(error.metadata.id).toBeDefined();
    expect(error.metadata.timestamp).toBeDefined();
  });

  test('should classify generic errors correctly', () => {
    const networkError = new Error('ECONNREFUSED');
    networkError.code = 'ECONNREFUSED';
    
    const classified = ErrorClassifier.classifyError(networkError);
    
    expect(classified).toBeInstanceOf(NetworkError);
    expect(classified.type).toBe(ErrorTypes.NETWORK_ERROR);
    expect(classified.retryable).toBe(true);
  });

  test('should classify HTTP errors correctly', () => {
    const httpError = new Error('Unauthorized');
    httpError.response = { status: 401 };
    
    const classified = ErrorClassifier.classifyError(httpError);
    
    expect(classified.type).toBe(ErrorTypes.AUTHENTICATION_ERROR);
    expect(classified.retryable).toBe(false);
  });

  test('should determine retry delay correctly', () => {
    const rateLimitError = new RateLimitError('Rate limited', 30);
    const delay = ErrorClassifier.getRetryDelay(rateLimitError);
    
    expect(delay).toBe(30000); // 30 seconds in milliseconds
  });
});

describe('Retry Manager', () => {
  let retryManager;
  let mockOperation;

  beforeEach(() => {
    retryManager = new RetryManager({
      maxRetries: 3,
      baseDelay: 100,
      backoffMultiplier: 2,
      jitterEnabled: false
    });
    
    mockOperation = jest.fn();
  });

  test('should succeed on first attempt', async () => {
    mockOperation.mockResolvedValueOnce('success');
    
    const result = await retryManager.executeWithRetry(mockOperation);
    
    expect(result).toBe('success');
    expect(mockOperation).toHaveBeenCalledTimes(1);
  });

  test('should retry retryable errors with exponential backoff', async () => {
    mockOperation
      .mockRejectedValueOnce(new NetworkError('Network error'))
      .mockRejectedValueOnce(new TimeoutError('Timeout'))
      .mockResolvedValueOnce('success');

    const startTime = Date.now();
    const result = await retryManager.executeWithRetry(mockOperation);
    const endTime = Date.now();
    
    expect(result).toBe('success');
    expect(mockOperation).toHaveBeenCalledTimes(3);
    
    // Should have waited for delays (100ms + 200ms = 300ms minimum)
    expect(endTime - startTime).toBeGreaterThan(250);
  });

  test('should not retry non-retryable errors', async () => {
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

  test('should respect timeout', async () => {
    const slowOperation = () => new Promise(resolve => 
      setTimeout(() => resolve('slow'), 200)
    );
    
    const fastRetryManager = new RetryManager({ timeoutMs: 50 });
    
    await expect(fastRetryManager.executeWithRetry(slowOperation))
      .rejects.toThrow('timed out');
  });

  test('should execute operations in parallel', async () => {
    const operations = [
      () => Promise.resolve('result1'),
      () => Promise.resolve('result2'),
      () => Promise.resolve('result3')
    ];
    
    const results = await retryManager.executeParallel(operations);
    
    expect(results).toEqual(['result1', 'result2', 'result3']);
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

  test('should provide correct metrics', () => {
    const metrics = retryManager.getMetrics();
    
    expect(metrics).toHaveProperty('totalAttempts');
    expect(metrics).toHaveProperty('successfulRetries');
    expect(metrics).toHaveProperty('failedRetries');
    expect(metrics).toHaveProperty('successRate');
  });
});

describe('Circuit Breaker', () => {
  let circuitBreaker;
  let mockOperation;
  let mockFallback;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      recoveryTimeout: 100,
      name: 'test-service'
    });
    
    mockOperation = jest.fn();
    mockFallback = jest.fn().mockResolvedValue('fallback-result');
  });

  test('should execute operation when circuit is closed', async () => {
    mockOperation.mockResolvedValueOnce('success');
    
    const result = await circuitBreaker.execute(mockOperation);
    
    expect(result).toBe('success');
    expect(circuitBreaker.state).toBe('CLOSED');
  });

  test('should open circuit after threshold failures', async () => {
    mockOperation.mockRejectedValue(new Error('Service error'));
    
    // Trigger failures to open circuit
    for (let i = 0; i < 3; i++) {
      await expect(circuitBreaker.execute(mockOperation, mockFallback))
        .rejects.toThrow();
    }
    
    expect(circuitBreaker.state).toBe('OPEN');
  });

  test('should execute fallback when circuit is open', async () => {
    // Force circuit open
    circuitBreaker.forceOpen();
    
    const result = await circuitBreaker.execute(mockOperation, mockFallback);
    
    expect(result).toBe('fallback-result');
    expect(mockOperation).not.toHaveBeenCalled();
    expect(mockFallback).toHaveBeenCalled();
  });

  test('should transition to half-open after recovery timeout', async () => {
    // Force circuit open
    circuitBreaker.forceOpen();
    expect(circuitBreaker.state).toBe('OPEN');
    
    // Wait for recovery timeout
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Next operation should transition to half-open
    mockOperation.mockResolvedValueOnce('success');
    await circuitBreaker.execute(mockOperation);
    
    expect(circuitBreaker.state).toBe('CLOSED');
  });

  test('should provide circuit breaker status', () => {
    const status = circuitBreaker.getStatus();
    
    expect(status).toHaveProperty('name', 'test-service');
    expect(status).toHaveProperty('state');
    expect(status).toHaveProperty('failureCount');
    expect(status).toHaveProperty('metrics');
  });
});

describe('Circuit Breaker Manager', () => {
  let manager;

  beforeEach(() => {
    manager = new CircuitBreakerManager();
  });

  test('should create and manage multiple circuit breakers', () => {
    const cb1 = manager.getCircuitBreaker('service1');
    const cb2 = manager.getCircuitBreaker('service2');
    
    expect(cb1).toBeDefined();
    expect(cb2).toBeDefined();
    expect(cb1).not.toBe(cb2);
    
    // Should return same instance for same service
    const cb1Again = manager.getCircuitBreaker('service1');
    expect(cb1Again).toBe(cb1);
  });

  test('should execute operations with circuit breaker protection', async () => {
    const operation = jest.fn().mockResolvedValue('success');
    
    const result = await manager.execute('test-service', operation);
    
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalled();
  });

  test('should provide aggregated metrics', () => {
    manager.getCircuitBreaker('service1');
    manager.getCircuitBreaker('service2');
    
    const metrics = manager.getAggregatedMetrics();
    
    expect(metrics).toHaveProperty('totalCircuitBreakers', 2);
    expect(metrics).toHaveProperty('systemHealth');
  });
});

describe('Error Handler', () => {
  let errorHandler;
  let mockErrorTracker;
  let mockAlertManager;

  beforeEach(() => {
    mockErrorTracker = {
      track: jest.fn().mockResolvedValue('tracked')
    };
    
    mockAlertManager = {
      sendAlert: jest.fn().mockResolvedValue('alerted')
    };
    
    errorHandler = new ErrorHandler({
      errorTracker: mockErrorTracker,
      alertManager: mockAlertManager
    });
  });

  test('should handle errors with tracking and alerting', async () => {
    const error = new SystemError(
      'Test error',
      ErrorTypes.SERVER_ERROR,
      true
    );
    
    const context = { component: 'test-component' };
    
    await expect(errorHandler.handleError(error, context))
      .rejects.toThrow('Test error');
    
    expect(mockErrorTracker.track).toHaveBeenCalledWith(
      expect.objectContaining({ type: ErrorTypes.SERVER_ERROR }),
      expect.objectContaining({ component: 'test-component' })
    );
  });

  test('should execute operations with protection', async () => {
    const operation = jest.fn().mockResolvedValue('success');
    
    const result = await errorHandler.executeWithProtection(
      operation,
      { component: 'test-component' }
    );
    
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalled();
  });

  test('should provide error handler metrics', () => {
    const metrics = errorHandler.getMetrics();
    
    expect(metrics).toHaveProperty('errorsHandled');
    expect(metrics).toHaveProperty('errorsRecovered');
    expect(metrics).toHaveProperty('recoveryRate');
  });

  test('should provide health status', () => {
    const health = errorHandler.getHealthStatus();
    
    expect(health).toHaveProperty('status');
    expect(health).toHaveProperty('recoveryRate');
    expect(health).toHaveProperty('totalErrors');
  });
});

describe('Integration Tests', () => {
  test('should handle complex error scenarios with retry and circuit breaker', async () => {
    const errorHandler = new ErrorHandler({
      enableRetry: true,
      enableCircuitBreaker: true
    });
    
    let callCount = 0;
    const flakyOperation = () => {
      callCount++;
      if (callCount <= 2) {
        throw new NetworkError('Network temporarily unavailable');
      }
      return 'success';
    };
    
    const result = await errorHandler.executeWithRetry(
      flakyOperation,
      { component: 'integration-test' }
    );
    
    expect(result).toBe('success');
    expect(callCount).toBe(3);
  });

  test('should handle cascading failures with circuit breaker', async () => {
    const manager = new CircuitBreakerManager();
    
    const failingService = () => {
      throw new Error('Service down');
    };
    
    const fallback = () => 'fallback-response';
    
    // Trigger circuit breaker
    for (let i = 0; i < 5; i++) {
      try {
        await manager.execute('failing-service', failingService, fallback);
      } catch (error) {
        // Expected failures
      }
    }
    
    // Circuit should be open, fallback should be used
    const result = await manager.execute('failing-service', failingService, fallback);
    expect(result).toBe('fallback-response');
  });
});

describe('Error Simulation and Chaos Testing', () => {
  test('should handle random network failures', async () => {
    const retryManager = new RetryManager({ maxRetries: 5 });
    
    const chaoticOperation = () => {
      if (Math.random() < 0.7) { // 70% failure rate
        throw new NetworkError('Random network failure');
      }
      return 'success';
    };
    
    // This might fail or succeed, but should handle errors gracefully
    try {
      const result = await retryManager.executeWithRetry(chaoticOperation);
      expect(result).toBe('success');
    } catch (error) {
      expect(error).toBeInstanceOf(NetworkError);
    }
  });

  test('should handle resource exhaustion scenarios', async () => {
    const errorHandler = new ErrorHandler();
    
    const resourceExhaustedOperation = () => {
      throw new SystemError(
        'Out of memory',
        ErrorTypes.RESOURCE_EXHAUSTED,
        false
      );
    };
    
    await expect(
      errorHandler.executeWithProtection(
        resourceExhaustedOperation,
        { component: 'memory-intensive' }
      )
    ).rejects.toThrow('Out of memory');
  });

  test('should handle timeout scenarios under load', async () => {
    const operations = Array(10).fill().map((_, i) => 
      () => new Promise(resolve => 
        setTimeout(() => resolve(`result-${i}`), 100)
      )
    );
    
    const retryManager = new RetryManager({ timeoutMs: 50 });
    
    const results = await Promise.allSettled(
      operations.map(op => retryManager.executeWithRetry(op))
    );
    
    // All should be rejected due to timeout
    results.forEach(result => {
      expect(result.status).toBe('rejected');
      expect(result.reason.type).toBe(ErrorTypes.TIMEOUT_ERROR);
    });
  });
});

describe('Performance Tests', () => {
  test('should handle high-frequency operations efficiently', async () => {
    const retryManager = new RetryManager();
    const operations = Array(100).fill().map((_, i) => 
      () => Promise.resolve(`result-${i}`)
    );
    
    const startTime = Date.now();
    const results = await retryManager.executeParallel(operations);
    const endTime = Date.now();
    
    expect(results).toHaveLength(100);
    expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
  });

  test('should maintain low overhead for error handling', async () => {
    const errorHandler = new ErrorHandler();
    const operation = () => Promise.resolve('success');
    
    const iterations = 1000;
    const startTime = Date.now();
    
    for (let i = 0; i < iterations; i++) {
      await errorHandler.executeWithProtection(operation);
    }
    
    const endTime = Date.now();
    const avgTime = (endTime - startTime) / iterations;
    
    expect(avgTime).toBeLessThan(10); // Less than 10ms per operation
  });
});

