/**
 * resilience-framework.test.js
 * Comprehensive test suite for the unified resilience framework
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  ResilienceFramework,
  ErrorClassifier,
  RetryManager,
  CircuitBreaker,
  UnifiedLogger,
  ResilienceHandler,
  ErrorResponseFormatter,
  ERROR_CATEGORIES,
  ERROR_SEVERITY,
  RECOVERY_STRATEGIES,
  CIRCUIT_STATES
} from '../index.js';

describe('Resilience Framework', () => {
  let framework;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      logError: jest.fn(),
      getErrorMetrics: jest.fn(() => ({ totalErrors: 0, errorRates: {} })),
      getRecentLogs: jest.fn(() => []),
      clearLogs: jest.fn(),
      child: jest.fn(() => mockLogger)
    };

    framework = new ResilienceFramework({
      enableRetries: true,
      enableCircuitBreaker: true,
      enableAutoRecovery: false, // Disable for testing
      enableHealthMonitoring: false // Disable for testing
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Error Classification', () => {
    test('should classify network errors correctly', () => {
      const classifier = new ErrorClassifier();
      const error = new Error('Connection timeout');
      const classification = classifier.classify(error);

      expect(classification.category).toBe(ERROR_CATEGORIES.NETWORK);
      expect(classification.severity).toBe(ERROR_SEVERITY.MEDIUM);
      expect(classification.strategy).toBe(RECOVERY_STRATEGIES.RETRY);
      expect(classification.retryable).toBe(true);
    });

    test('should classify rate limit errors correctly', () => {
      const classifier = new ErrorClassifier();
      const error = new Error('Rate limit exceeded');
      error.status = 429;
      const classification = classifier.classify(error);

      expect(classification.category).toBe(ERROR_CATEGORIES.RATE_LIMIT);
      expect(classification.retryable).toBe(true);
    });

    test('should classify validation errors correctly', () => {
      const classifier = new ErrorClassifier();
      const error = new Error('Invalid input provided');
      const classification = classifier.classify(error);

      expect(classification.category).toBe(ERROR_CATEGORIES.VALIDATION);
      expect(classification.strategy).toBe(RECOVERY_STRATEGIES.FAIL_FAST);
      expect(classification.retryable).toBe(false);
    });

    test('should handle unknown errors', () => {
      const classifier = new ErrorClassifier();
      const error = new Error('Some unknown error');
      const classification = classifier.classify(error);

      expect(classification.category).toBe(ERROR_CATEGORIES.UNKNOWN);
      expect(classification.strategy).toBe(RECOVERY_STRATEGIES.MANUAL_INTERVENTION);
      expect(classification.retryable).toBe(false);
    });
  });

  describe('Retry Manager', () => {
    test('should retry on retryable errors', async () => {
      const retryManager = new RetryManager({
        maxRetries: 3,
        initialDelayMs: 10 // Fast for testing
      });

      let attempts = 0;
      const operation = async () => {
        attempts++;
        if (attempts < 3) {
          const error = new Error('Temporary failure');
          error.status = 500;
          throw error;
        }
        return 'success';
      };

      const result = await retryManager.executeWithRetry(operation);
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    test('should not retry on non-retryable errors', async () => {
      const retryManager = new RetryManager({
        maxRetries: 3,
        initialDelayMs: 10
      });

      let attempts = 0;
      const operation = async () => {
        attempts++;
        const error = new Error('Validation failed');
        error.status = 400;
        throw error;
      };

      await expect(retryManager.executeWithRetry(operation)).rejects.toThrow('Validation failed');
      expect(attempts).toBe(1); // No retries for validation errors
    });

    test('should respect timeout', async () => {
      const retryManager = new RetryManager({
        maxRetries: 1,
        timeoutMs: 50
      });

      const operation = async () => {
        await new Promise(resolve => setTimeout(resolve, 100)); // Longer than timeout
        return 'success';
      };

      await expect(retryManager.executeWithRetry(operation)).rejects.toThrow('timed out');
    });

    test('should calculate exponential backoff correctly', async () => {
      const retryManager = new RetryManager({
        maxRetries: 3,
        initialDelayMs: 100,
        backoffMultiplier: 2,
        jitterEnabled: false
      });

      const delays = [];
      let attempts = 0;

      const operation = async () => {
        attempts++;
        if (attempts <= 3) {
          const error = new Error('Temporary failure');
          error.status = 500;
          throw error;
        }
        return 'success';
      };

      // Mock delay function to capture delays
      const originalDelay = retryManager._delay;
      retryManager._delay = jest.fn(async (ms) => {
        delays.push(ms);
        return originalDelay.call(retryManager, 1); // Fast for testing
      });

      await expect(retryManager.executeWithRetry(operation)).rejects.toThrow();
      
      expect(delays).toHaveLength(3);
      expect(delays[0]).toBe(100); // First retry: 100ms
      expect(delays[1]).toBe(200); // Second retry: 200ms
      expect(delays[2]).toBe(400); // Third retry: 400ms
    });
  });

  describe('Circuit Breaker', () => {
    test('should open circuit after failure threshold', async () => {
      const circuitBreaker = new CircuitBreaker('test_circuit', {
        failureThreshold: 3,
        volumeThreshold: 3
      });

      const failingOperation = async () => {
        throw new Error('Service unavailable');
      };

      // Execute failing operations to reach threshold
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(failingOperation)).rejects.toThrow();
      }

      expect(circuitBreaker.state).toBe(CIRCUIT_STATES.OPEN);
    });

    test('should fail fast when circuit is open', async () => {
      const circuitBreaker = new CircuitBreaker('test_circuit', {
        failureThreshold: 1,
        volumeThreshold: 1,
        timeoutMs: 1000
      });

      // Force circuit to open
      await expect(circuitBreaker.execute(async () => {
        throw new Error('Service failure');
      })).rejects.toThrow();

      expect(circuitBreaker.state).toBe(CIRCUIT_STATES.OPEN);

      // Next call should fail fast
      const startTime = Date.now();
      await expect(circuitBreaker.execute(async () => 'success')).rejects.toThrow('Circuit breaker');
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(100); // Should fail fast
    });

    test('should transition to half-open after timeout', async () => {
      const circuitBreaker = new CircuitBreaker('test_circuit', {
        failureThreshold: 1,
        volumeThreshold: 1,
        timeoutMs: 50 // Short timeout for testing
      });

      // Open the circuit
      await expect(circuitBreaker.execute(async () => {
        throw new Error('Service failure');
      })).rejects.toThrow();

      expect(circuitBreaker.state).toBe(CIRCUIT_STATES.OPEN);

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 60));

      // Next call should transition to half-open
      await expect(circuitBreaker.execute(async () => 'success')).resolves.toBe('success');
      expect(circuitBreaker.state).toBe(CIRCUIT_STATES.CLOSED);
    });

    test('should close circuit after successful operations in half-open state', async () => {
      const circuitBreaker = new CircuitBreaker('test_circuit', {
        failureThreshold: 1,
        successThreshold: 2,
        volumeThreshold: 1,
        timeoutMs: 50
      });

      // Open the circuit
      await expect(circuitBreaker.execute(async () => {
        throw new Error('Service failure');
      })).rejects.toThrow();

      // Force to half-open
      circuitBreaker._transitionToHalfOpen();
      expect(circuitBreaker.state).toBe(CIRCUIT_STATES.HALF_OPEN);

      // Execute successful operations
      await circuitBreaker.execute(async () => 'success1');
      expect(circuitBreaker.state).toBe(CIRCUIT_STATES.HALF_OPEN);

      await circuitBreaker.execute(async () => 'success2');
      expect(circuitBreaker.state).toBe(CIRCUIT_STATES.CLOSED);
    });
  });

  describe('Unified Logger', () => {
    test('should log messages with correct format', () => {
      const logger = new UnifiedLogger({
        enableColors: false,
        enableTimestamps: false
    });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      logger.info('Test message', { key: 'value' }, 'test_context');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[INFO]',
        '[test_context]',
        'Test message',
        '{"key":"value"}'
      );

      consoleSpy.mockRestore();
    });

    test('should respect log levels', () => {
      const logger = new UnifiedLogger({
        level: { name: 'warn', priority: 3 },
        enableColors: false
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      logger.debug('Debug message'); // Should not log
      logger.info('Info message');   // Should not log
      logger.warn('Warn message');   // Should log
      logger.error('Error message'); // Should log

      expect(consoleSpy).toHaveBeenCalledTimes(2);
      consoleSpy.mockRestore();
    });

    test('should track error metrics', () => {
      const logger = new UnifiedLogger();

      logger.error('Error 1', {}, 'network');
      logger.error('Error 2', {}, 'network');
      logger.error('Error 3', {}, 'validation');

      const metrics = logger.getErrorMetrics();
      expect(metrics.errorCounts['network:error']).toBe(2);
      expect(metrics.errorCounts['validation:error']).toBe(1);
      expect(metrics.totalErrors).toBe(3);
    });
  });

  describe('Error Response Formatter', () => {
    test('should format errors consistently', () => {
      const formatter = new ErrorResponseFormatter();
      const error = new Error('Test error');
      error.code = 'TEST_ERROR';

      const classification = {
        category: ERROR_CATEGORIES.NETWORK,
        severity: ERROR_SEVERITY.HIGH,
        retryable: true
      };

      const response = formatter.formatError(error, classification);

      expect(response.success).toBe(false);
      expect(response.error.code).toBe('TEST_ERROR');
      expect(response.error.message).toBe('Test error');
      expect(response.error.category).toBe(ERROR_CATEGORIES.NETWORK);
      expect(response.error.severity).toBe(ERROR_SEVERITY.HIGH);
      expect(response.error.retryable).toBe(true);
      expect(response.error.timestamp).toBeDefined();
    });

    test('should format validation errors', () => {
      const formatter = new ErrorResponseFormatter();
      const validationErrors = [
        { field: 'email', message: 'Invalid email format' },
        { field: 'password', message: 'Password too short' }
      ];

      const response = formatter.formatValidationError(validationErrors);

      expect(response.success).toBe(false);
      expect(response.error.code).toBe('VALIDATION_ERROR');
      expect(response.error.category).toBe(ERROR_CATEGORIES.VALIDATION);
      expect(response.error.details.validationErrors).toEqual(validationErrors);
      expect(response.error.retryable).toBe(false);
    });

    test('should format rate limit errors', () => {
      const formatter = new ErrorResponseFormatter();
      const response = formatter.formatRateLimitError(60);

      expect(response.success).toBe(false);
      expect(response.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(response.error.category).toBe(ERROR_CATEGORIES.RATE_LIMIT);
      expect(response.error.retryAfter).toBe(60);
      expect(response.error.retryable).toBe(true);
    });

    test('should convert to different formats', () => {
      const formatter = new ErrorResponseFormatter();
      const error = new Error('Test error');
      const response = formatter.formatError(error);

      // Test text format
      const textResponse = formatter.convertFormat(response, 'text');
      expect(typeof textResponse).toBe('string');
      expect(textResponse).toContain('Test error');

      // Test HTTP format
      const httpResponse = formatter.convertFormat(response, 'http');
      expect(httpResponse.statusCode).toBe(500);
      expect(httpResponse.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(httpResponse.body)).toEqual(response);
    });
  });

  describe('Resilience Handler', () => {
    test('should handle operations with full resilience protection', async () => {
      const handler = new ResilienceHandler({
        logger: mockLogger,
        errorClassifier: new ErrorClassifier(),
        retryManager: new RetryManager({ maxRetries: 2, initialDelayMs: 10 }),
        circuitBreakerRegistry: framework.circuitBreakerRegistry
      });

      let attempts = 0;
      const operation = async () => {
        attempts++;
        if (attempts < 2) {
          const error = new Error('Temporary failure');
          error.status = 500;
          throw error;
        }
        return 'success';
      };

      const result = await handler.handle(operation, {
        operationName: 'test_operation'
      });

      expect(result).toBe('success');
      expect(attempts).toBe(2);
    });

    test('should use fallback on appropriate errors', async () => {
      const handler = new ResilienceHandler({
        logger: mockLogger,
        errorClassifier: new ErrorClassifier(),
        retryManager: new RetryManager({ maxRetries: 1, initialDelayMs: 10 }),
        circuitBreakerRegistry: framework.circuitBreakerRegistry
      });

      const primaryOperation = async () => {
        const error = new Error('Service overloaded');
        error.status = 503;
        throw error;
      };

      const fallbackOperation = async () => 'fallback_result';

      const result = await handler.handle(primaryOperation, {
        operationName: 'test_operation',
        enableFallback: true,
        fallbackOperation
      });

      expect(result).toBe('fallback_result');
    });

    test('should handle multiple operations in parallel', async () => {
      const handler = new ResilienceHandler({
        logger: mockLogger,
        errorClassifier: new ErrorClassifier(),
        retryManager: new RetryManager(),
        circuitBreakerRegistry: framework.circuitBreakerRegistry
      });

      const operations = [
        { operation: async () => 'result1', name: 'op1' },
        { operation: async () => 'result2', name: 'op2' },
        { operation: async () => { throw new Error('Failed'); }, name: 'op3' }
      ];

      const result = await handler.handleMultiple(operations, {
        mode: 'parallel',
        failFast: false
      });

      expect(result.successCount).toBe(2);
      expect(result.errorCount).toBe(1);
      expect(result.results).toHaveLength(2);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('Integration Tests', () => {
    test('should handle end-to-end resilience scenario', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        if (attempts === 1) {
          // First attempt: network error (retryable)
          const error = new Error('Connection timeout');
          throw error;
        } else if (attempts === 2) {
          // Second attempt: rate limit (retryable)
          const error = new Error('Rate limit exceeded');
          error.status = 429;
          throw error;
        } else {
          // Third attempt: success
          return 'final_success';
        }
      };

      const result = await framework.executeWithResilience(operation, {
        operationName: 'integration_test',
        enableRetries: true,
        enableCircuitBreaker: true,
        retryConfig: { maxRetries: 3, initialDelayMs: 10 }
      });

      expect(result).toBe('final_success');
      expect(attempts).toBe(3);
    });

    test('should provide comprehensive system health', () => {
      const health = framework.getSystemHealth();

      expect(health.timestamp).toBeDefined();
      expect(health.overall).toBeDefined();
      expect(health.components).toBeDefined();
      expect(health.components.circuitBreakers).toBeDefined();
      expect(health.components.retryManager).toBeDefined();
      expect(health.components.errorMetrics).toBeDefined();
    });

    test('should reset all components', () => {
      // Add some state
      framework.circuitBreakerRegistry.getBreaker('test', { failureThreshold: 1 });
      
      // Reset
      framework.reset();

      // Verify reset
      const health = framework.getSystemHealth();
      expect(health.components.circuitBreakers.totalCircuits).toBe(0);
    });
  });

  describe('Performance Tests', () => {
    test('should have minimal overhead for successful operations', async () => {
      const operation = async () => 'success';

      const startTime = Date.now();
      const result = await framework.executeWithResilience(operation, {
        operationName: 'performance_test'
      });
      const duration = Date.now() - startTime;

      expect(result).toBe('success');
      expect(duration).toBeLessThan(50); // Should complete quickly
    });

    test('should handle high concurrency', async () => {
      const operation = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'success';
      };

      const promises = Array.from({ length: 100 }, (_, i) =>
        framework.executeWithResilience(operation, {
          operationName: `concurrent_test_${i}`
        })
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(100);
      expect(results.every(r => r === 'success')).toBe(true);
    });
  });
});

