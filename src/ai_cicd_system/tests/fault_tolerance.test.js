/**
 * Fault Tolerance Tests
 * 
 * Comprehensive test suite for fault tolerance mechanisms including
 * bulkheads, rate limiting, health checks, and resource pools.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  Bulkhead,
  RateLimiter,
  HealthCheck,
  TimeoutWrapper,
  ResourcePool,
  FaultToleranceManager
} from '../utils/fault_tolerance.js';
import { ErrorTypes, SystemError, TimeoutError } from '../utils/error_types.js';

describe('Bulkhead Pattern', () => {
  let bulkhead;

  beforeEach(() => {
    bulkhead = new Bulkhead({
      maxConcurrent: 3,
      queueSize: 2,
      timeout: 100,
      name: 'test-bulkhead'
    });
  });

  test('should execute operations within concurrency limits', async () => {
    const operation = jest.fn().mockResolvedValue('success');
    
    const result = await bulkhead.execute(operation);
    
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalled();
  });

  test('should queue operations when at capacity', async () => {
    const slowOperation = () => new Promise(resolve => 
      setTimeout(() => resolve('slow'), 50)
    );
    
    // Start 3 concurrent operations (at capacity)
    const promises = [
      bulkhead.execute(slowOperation),
      bulkhead.execute(slowOperation),
      bulkhead.execute(slowOperation)
    ];
    
    // This should be queued
    const queuedPromise = bulkhead.execute(() => Promise.resolve('queued'));
    
    // Wait a bit to ensure operations are running
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(bulkhead.activeRequests).toBe(3);
    expect(bulkhead.queue.length).toBe(1);
    
    // Wait for all to complete
    const results = await Promise.all([...promises, queuedPromise]);
    expect(results).toEqual(['slow', 'slow', 'slow', 'queued']);
  });

  test('should reject operations when queue is full', async () => {
    const slowOperation = () => new Promise(resolve => 
      setTimeout(() => resolve('slow'), 100)
    );
    
    // Fill capacity and queue
    const promises = [];
    for (let i = 0; i < 5; i++) { // 3 active + 2 queued
      promises.push(bulkhead.execute(slowOperation));
    }
    
    // This should be rejected
    await expect(bulkhead.execute(() => Promise.resolve('rejected')))
      .rejects.toThrow('Bulkhead \'test-bulkhead\' is at capacity');
    
    // Clean up
    await Promise.all(promises);
  });

  test('should timeout long-running operations', async () => {
    const longOperation = () => new Promise(resolve => 
      setTimeout(() => resolve('long'), 200)
    );
    
    await expect(bulkhead.execute(longOperation))
      .rejects.toThrow('timed out');
  });

  test('should provide accurate status information', async () => {
    const slowOperation = () => new Promise(resolve => 
      setTimeout(() => resolve('slow'), 50)
    );
    
    // Start some operations
    bulkhead.execute(slowOperation);
    bulkhead.execute(slowOperation);
    
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const status = bulkhead.getStatus();
    
    expect(status.name).toBe('test-bulkhead');
    expect(status.activeRequests).toBe(2);
    expect(status.maxConcurrent).toBe(3);
    expect(status.utilization).toBeCloseTo(2/3);
  });
});

describe('Rate Limiter', () => {
  let rateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 1000,
      name: 'test-limiter'
    });
  });

  test('should allow requests within limit', async () => {
    const operation = jest.fn().mockResolvedValue('success');
    
    for (let i = 0; i < 5; i++) {
      const result = await rateLimiter.execute(operation);
      expect(result).toBe('success');
    }
    
    expect(operation).toHaveBeenCalledTimes(5);
  });

  test('should reject requests exceeding limit', async () => {
    const operation = jest.fn().mockResolvedValue('success');
    
    // Use up the limit
    for (let i = 0; i < 5; i++) {
      await rateLimiter.execute(operation);
    }
    
    // This should be rejected
    await expect(rateLimiter.execute(operation))
      .rejects.toThrow('Rate limit exceeded');
  });

  test('should reset after time window', async () => {
    const operation = jest.fn().mockResolvedValue('success');
    
    // Use up the limit
    for (let i = 0; i < 5; i++) {
      await rateLimiter.execute(operation);
    }
    
    // Wait for window to reset
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    // Should be able to make requests again
    const result = await rateLimiter.execute(operation);
    expect(result).toBe('success');
  });

  test('should provide accurate status', () => {
    // Make some requests
    for (let i = 0; i < 3; i++) {
      rateLimiter.isAllowed();
    }
    
    const status = rateLimiter.getStatus();
    
    expect(status.name).toBe('test-limiter');
    expect(status.currentRequests).toBe(3);
    expect(status.maxRequests).toBe(5);
    expect(status.remaining).toBe(2);
  });

  test('should include retry-after in rate limit error', async () => {
    const operation = () => Promise.resolve('success');
    
    // Exhaust rate limit
    for (let i = 0; i < 5; i++) {
      await rateLimiter.execute(operation);
    }
    
    try {
      await rateLimiter.execute(operation);
    } catch (error) {
      expect(error.type).toBe(ErrorTypes.RATE_LIMIT_ERROR);
      expect(error.metadata.retryAfter).toBeDefined();
      expect(error.metadata.retryAfter).toBeGreaterThan(0);
    }
  });
});

describe('Health Check', () => {
  let healthCheck;
  let mockHealthFunction;

  beforeEach(() => {
    mockHealthFunction = jest.fn().mockResolvedValue({ status: 'OK' });
    
    healthCheck = new HealthCheck({
      name: 'test-service',
      checkInterval: 50,
      timeout: 100,
      healthyThreshold: 2,
      unhealthyThreshold: 2,
      healthCheckFunction: mockHealthFunction,
      autoStart: false
    });
  });

  afterEach(() => {
    healthCheck.stop();
  });

  test('should perform health check successfully', async () => {
    const result = await healthCheck.performCheck();
    
    expect(result.status).toBe('OK');
    expect(mockHealthFunction).toHaveBeenCalled();
    expect(healthCheck.consecutiveSuccesses).toBe(1);
  });

  test('should handle health check failures', async () => {
    mockHealthFunction.mockRejectedValue(new Error('Service down'));
    
    await expect(healthCheck.performCheck())
      .rejects.toThrow('Service down');
    
    expect(healthCheck.consecutiveFailures).toBe(1);
    expect(healthCheck.lastError).toBe('Service down');
  });

  test('should transition to healthy after threshold successes', async () => {
    // Start in unknown state
    expect(healthCheck.status).toBe('UNKNOWN');
    
    // Perform successful checks
    await healthCheck.performCheck();
    await healthCheck.performCheck();
    
    expect(healthCheck.status).toBe('HEALTHY');
  });

  test('should transition to unhealthy after threshold failures', async () => {
    mockHealthFunction.mockRejectedValue(new Error('Service down'));
    
    // Perform failing checks
    try { await healthCheck.performCheck(); } catch {}
    try { await healthCheck.performCheck(); } catch {}
    
    expect(healthCheck.status).toBe('UNHEALTHY');
  });

  test('should timeout slow health checks', async () => {
    mockHealthFunction.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({ status: 'OK' }), 200))
    );
    
    await expect(healthCheck.performCheck())
      .rejects.toThrow('Health check timeout');
  });

  test('should provide comprehensive status', () => {
    const status = healthCheck.getStatus();
    
    expect(status.name).toBe('test-service');
    expect(status.status).toBe('UNKNOWN');
    expect(status.consecutiveSuccesses).toBe(0);
    expect(status.consecutiveFailures).toBe(0);
    expect(status.metrics).toBeDefined();
  });

  test('should calculate uptime correctly', async () => {
    // Perform some successful checks
    await healthCheck.performCheck();
    await healthCheck.performCheck();
    
    const uptime = healthCheck.calculateUptime();
    expect(uptime).toBe(1.0); // 100% uptime with only successes
  });

  test('should auto-start health checking', (done) => {
    const autoHealthCheck = new HealthCheck({
      name: 'auto-test',
      checkInterval: 50,
      healthCheckFunction: mockHealthFunction,
      autoStart: true
    });
    
    setTimeout(() => {
      expect(mockHealthFunction).toHaveBeenCalled();
      autoHealthCheck.stop();
      done();
    }, 100);
  });
});

describe('Timeout Wrapper', () => {
  let timeoutWrapper;

  beforeEach(() => {
    timeoutWrapper = new TimeoutWrapper(100);
  });

  test('should execute fast operations successfully', async () => {
    const fastOperation = () => Promise.resolve('fast');
    
    const result = await timeoutWrapper.execute(fastOperation);
    
    expect(result).toBe('fast');
  });

  test('should timeout slow operations', async () => {
    const slowOperation = () => new Promise(resolve => 
      setTimeout(() => resolve('slow'), 200)
    );
    
    await expect(timeoutWrapper.execute(slowOperation))
      .rejects.toThrow('timed out');
  });

  test('should create wrapper with specific timeout', async () => {
    const shortWrapper = TimeoutWrapper.withTimeout(50);
    const operation = () => new Promise(resolve => 
      setTimeout(() => resolve('result'), 100)
    );
    
    await expect(shortWrapper.execute(operation))
      .rejects.toThrow('timed out');
  });

  test('should include operation context in timeout error', async () => {
    const operation = () => new Promise(resolve => 
      setTimeout(() => resolve('result'), 200)
    );
    
    try {
      await timeoutWrapper.execute(operation, { operationId: 'test-op-123' });
    } catch (error) {
      expect(error).toBeInstanceOf(TimeoutError);
      expect(error.metadata.operationId).toBe('test-op-123');
      expect(error.metadata.timeoutMs).toBe(100);
    }
  });
});

describe('Resource Pool', () => {
  let resourcePool;
  let mockResourceFactory;
  let mockResourceValidator;
  let mockResourceDestroyer;

  beforeEach(() => {
    let resourceCounter = 0;
    mockResourceFactory = jest.fn(() => {
      resourceCounter++;
      return Promise.resolve({ id: resourceCounter, valid: true });
    });
    
    mockResourceValidator = jest.fn(resource => Promise.resolve(resource.valid));
    mockResourceDestroyer = jest.fn(() => Promise.resolve());
    
    resourcePool = new ResourcePool({
      minSize: 2,
      maxSize: 5,
      acquireTimeout: 100,
      name: 'test-pool',
      resourceFactory: mockResourceFactory,
      resourceValidator: mockResourceValidator,
      resourceDestroyer: mockResourceDestroyer
    });
  });

  afterEach(async () => {
    await resourcePool.shutdown();
  });

  test('should create minimum number of resources on initialization', async () => {
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 50));
    
    expect(mockResourceFactory).toHaveBeenCalledTimes(2);
    expect(resourcePool.available.length).toBe(2);
  });

  test('should acquire and release resources', async () => {
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const resource = await resourcePool.acquire();
    
    expect(resource).toBeDefined();
    expect(resource.id).toBeDefined();
    expect(resourcePool.inUse.size).toBe(1);
    expect(resourcePool.available.length).toBe(1);
    
    await resourcePool.release(resource);
    
    expect(resourcePool.inUse.size).toBe(0);
    expect(resourcePool.available.length).toBe(2);
  });

  test('should create new resources when needed', async () => {
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Acquire all available resources
    const resource1 = await resourcePool.acquire();
    const resource2 = await resourcePool.acquire();
    
    // This should create a new resource
    const resource3 = await resourcePool.acquire();
    
    expect(mockResourceFactory).toHaveBeenCalledTimes(3); // 2 initial + 1 new
    expect(resource3.id).toBe(3);
    
    // Clean up
    await resourcePool.release(resource1);
    await resourcePool.release(resource2);
    await resourcePool.release(resource3);
  });

  test('should timeout when pool is exhausted', async () => {
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Acquire all possible resources
    const resources = [];
    for (let i = 0; i < 5; i++) {
      resources.push(await resourcePool.acquire());
    }
    
    // This should timeout
    await expect(resourcePool.acquire())
      .rejects.toThrow('Resource acquisition timeout');
    
    // Clean up
    for (const resource of resources) {
      await resourcePool.release(resource);
    }
  });

  test('should validate resources before use', async () => {
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Make a resource invalid
    resourcePool.available[0].valid = false;
    
    const resource = await resourcePool.acquire();
    
    // Should have destroyed the invalid resource and created a new one
    expect(mockResourceDestroyer).toHaveBeenCalled();
    expect(resource.valid).toBe(true);
  });

  test('should provide pool status', async () => {
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const resource = await resourcePool.acquire();
    
    const status = resourcePool.getStatus();
    
    expect(status.name).toBe('test-pool');
    expect(status.totalResources).toBe(2);
    expect(status.availableResources).toBe(1);
    expect(status.inUseResources).toBe(1);
    expect(status.waitingRequests).toBe(0);
    
    await resourcePool.release(resource);
  });

  test('should handle resource factory failures gracefully', async () => {
    mockResourceFactory.mockRejectedValueOnce(new Error('Factory error'));
    
    const failingPool = new ResourcePool({
      minSize: 1,
      maxSize: 2,
      resourceFactory: mockResourceFactory,
      resourceValidator: mockResourceValidator,
      resourceDestroyer: mockResourceDestroyer
    });
    
    // Should not throw during initialization
    await new Promise(resolve => setTimeout(resolve, 50));
    
    await failingPool.shutdown();
  });
});

describe('Fault Tolerance Manager', () => {
  let manager;

  beforeEach(() => {
    manager = new FaultToleranceManager();
  });

  test('should create and manage bulkheads', () => {
    const bulkhead1 = manager.getBulkhead('service1', { maxConcurrent: 5 });
    const bulkhead2 = manager.getBulkhead('service2', { maxConcurrent: 10 });
    
    expect(bulkhead1).toBeDefined();
    expect(bulkhead2).toBeDefined();
    expect(bulkhead1).not.toBe(bulkhead2);
    
    // Should return same instance for same service
    const bulkhead1Again = manager.getBulkhead('service1');
    expect(bulkhead1Again).toBe(bulkhead1);
  });

  test('should create and manage rate limiters', () => {
    const limiter1 = manager.getRateLimiter('api1', { maxRequests: 100 });
    const limiter2 = manager.getRateLimiter('api2', { maxRequests: 50 });
    
    expect(limiter1).toBeDefined();
    expect(limiter2).toBeDefined();
    expect(limiter1).not.toBe(limiter2);
  });

  test('should create and manage health checks', () => {
    const healthCheck1 = manager.getHealthCheck('service1', { 
      checkInterval: 30000,
      autoStart: false 
    });
    const healthCheck2 = manager.getHealthCheck('service2', { 
      checkInterval: 60000,
      autoStart: false 
    });
    
    expect(healthCheck1).toBeDefined();
    expect(healthCheck2).toBeDefined();
    expect(healthCheck1).not.toBe(healthCheck2);
    
    // Clean up
    healthCheck1.stop();
    healthCheck2.stop();
  });

  test('should create and manage resource pools', () => {
    const pool1 = manager.getResourcePool('db1', { 
      minSize: 2,
      maxSize: 10,
      resourceFactory: () => Promise.resolve({ id: 'db-conn' })
    });
    const pool2 = manager.getResourcePool('db2', { 
      minSize: 1,
      maxSize: 5,
      resourceFactory: () => Promise.resolve({ id: 'cache-conn' })
    });
    
    expect(pool1).toBeDefined();
    expect(pool2).toBeDefined();
    expect(pool1).not.toBe(pool2);
  });

  test('should provide comprehensive system status', async () => {
    // Create some components
    manager.getBulkhead('service1');
    manager.getRateLimiter('api1');
    const healthCheck = manager.getHealthCheck('service1', { autoStart: false });
    
    const status = manager.getSystemStatus();
    
    expect(status.bulkheads).toHaveProperty('service1');
    expect(status.rateLimiters).toHaveProperty('api1');
    expect(status.healthChecks).toHaveProperty('service1');
    expect(status.timestamp).toBeDefined();
    
    // Clean up
    healthCheck.stop();
  });
});

describe('Integration Tests', () => {
  test('should combine bulkhead and rate limiting', async () => {
    const manager = new FaultToleranceManager();
    const bulkhead = manager.getBulkhead('service', { maxConcurrent: 2 });
    const rateLimiter = manager.getRateLimiter('service', { maxRequests: 5, windowMs: 1000 });
    
    const operation = jest.fn().mockResolvedValue('success');
    
    // Execute operations through both bulkhead and rate limiter
    const executeProtected = async () => {
      return await bulkhead.execute(async () => {
        return await rateLimiter.execute(operation);
      });
    };
    
    // Should succeed within limits
    const results = await Promise.all([
      executeProtected(),
      executeProtected(),
      executeProtected()
    ]);
    
    expect(results).toEqual(['success', 'success', 'success']);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  test('should handle cascading failures with multiple protection layers', async () => {
    const manager = new FaultToleranceManager();
    const bulkhead = manager.getBulkhead('failing-service', { 
      maxConcurrent: 1,
      timeout: 50
    });
    
    const slowFailingOperation = () => new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Service down')), 100)
    );
    
    // This should be rejected by bulkhead timeout, not the operation error
    await expect(bulkhead.execute(slowFailingOperation))
      .rejects.toThrow('timed out');
  });

  test('should provide fault tolerance for resource-intensive operations', async () => {
    const manager = new FaultToleranceManager();
    
    // Create a resource pool for database connections
    const dbPool = manager.getResourcePool('database', {
      minSize: 1,
      maxSize: 3,
      resourceFactory: () => Promise.resolve({ 
        id: Math.random().toString(36),
        query: jest.fn().mockResolvedValue('query-result')
      }),
      resourceValidator: resource => Promise.resolve(!!resource.id)
    });
    
    // Create a bulkhead for database operations
    const dbBulkhead = manager.getBulkhead('database', { maxConcurrent: 2 });
    
    const databaseOperation = async () => {
      return await dbBulkhead.execute(async () => {
        const connection = await dbPool.acquire();
        try {
          return await connection.query();
        } finally {
          await dbPool.release(connection);
        }
      });
    };
    
    // Execute multiple database operations
    const results = await Promise.all([
      databaseOperation(),
      databaseOperation(),
      databaseOperation()
    ]);
    
    expect(results).toEqual(['query-result', 'query-result', 'query-result']);
    
    // Clean up
    await dbPool.shutdown();
  });
});

describe('Performance and Stress Tests', () => {
  test('should handle high-frequency operations efficiently', async () => {
    const bulkhead = new Bulkhead({ maxConcurrent: 10, queueSize: 100 });
    const operations = Array(50).fill().map((_, i) => 
      () => Promise.resolve(`result-${i}`)
    );
    
    const startTime = Date.now();
    const results = await Promise.all(
      operations.map(op => bulkhead.execute(op))
    );
    const endTime = Date.now();
    
    expect(results).toHaveLength(50);
    expect(endTime - startTime).toBeLessThan(1000); // Should complete quickly
  });

  test('should maintain performance under rate limiting pressure', async () => {
    const rateLimiter = new RateLimiter({ maxRequests: 100, windowMs: 1000 });
    const operation = () => Promise.resolve('success');
    
    const startTime = Date.now();
    
    // Execute operations up to the limit
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(rateLimiter.execute(operation));
    }
    
    const results = await Promise.all(promises);
    const endTime = Date.now();
    
    expect(results).toHaveLength(100);
    expect(endTime - startTime).toBeLessThan(500); // Should be fast
  });

  test('should handle resource pool under heavy load', async () => {
    const resourcePool = new ResourcePool({
      minSize: 5,
      maxSize: 20,
      acquireTimeout: 1000,
      resourceFactory: () => Promise.resolve({ id: Math.random() }),
      resourceValidator: () => Promise.resolve(true),
      resourceDestroyer: () => Promise.resolve()
    });
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const operations = Array(50).fill().map(async (_, i) => {
      const resource = await resourcePool.acquire();
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
      await resourcePool.release(resource);
      return `operation-${i}`;
    });
    
    const results = await Promise.all(operations);
    
    expect(results).toHaveLength(50);
    
    // Clean up
    await resourcePool.shutdown();
  });
});

