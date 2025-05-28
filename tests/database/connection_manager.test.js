/**
 * @fileoverview Database Connection Manager Tests
 * @description Comprehensive tests for database connection pooling and management
 */

import { jest } from '@jest/globals';
import { DatabaseConnectionManager } from '../../src/database/connection_manager.js';

// Mock dependencies
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
    end: jest.fn(),
    query: jest.fn(),
    on: jest.fn(),
    totalCount: 5,
    idleCount: 3,
    waitingCount: 0
  }))
}));

jest.mock('../../src/ai_cicd_system/core/error_handler.js', () => ({
  CodegenErrorHandler: jest.fn().mockImplementation(() => ({
    handleError: jest.fn().mockImplementation(async (fn) => await fn())
  }))
}));

jest.mock('../../src/scripts/modules/utils.js', () => ({
  log: jest.fn()
}));

describe('DatabaseConnectionManager', () => {
  let connectionManager;
  let mockPool;
  let mockClient;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create mock client
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    
    // Create mock pool
    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      end: jest.fn().mockResolvedValue(),
      query: jest.fn(),
      on: jest.fn(),
      totalCount: 5,
      idleCount: 3,
      waitingCount: 0
    };
    
    // Mock pg.Pool constructor
    const { Pool } = require('pg');
    Pool.mockImplementation(() => mockPool);
    
    // Create connection manager instance
    connectionManager = new DatabaseConnectionManager({
      host: 'localhost',
      port: 5432,
      database: 'test_db',
      username: 'test_user',
      password: 'test_pass'
    });
  });

  afterEach(async () => {
    if (connectionManager && connectionManager.isConnected) {
      await connectionManager.close();
    }
  });

  describe('Constructor', () => {
    it('should initialize with default configuration', () => {
      const manager = new DatabaseConnectionManager();
      
      expect(manager.config.host).toBe('localhost');
      expect(manager.config.port).toBe(5432);
      expect(manager.config.max).toBe(20);
      expect(manager.isConnected).toBe(false);
    });

    it('should initialize with custom configuration', () => {
      const config = {
        host: 'custom-host',
        port: 3306,
        database: 'custom_db',
        max: 10
      };
      
      const manager = new DatabaseConnectionManager(config);
      
      expect(manager.config.host).toBe('custom-host');
      expect(manager.config.port).toBe(3306);
      expect(manager.config.database).toBe('custom_db');
      expect(manager.config.max).toBe(10);
    });

    it('should initialize error handler with correct configuration', () => {
      const { CodegenErrorHandler } = require('../../src/ai_cicd_system/core/error_handler.js');
      
      expect(CodegenErrorHandler).toHaveBeenCalledWith({
        enableRetry: true,
        enableCircuitBreaker: true,
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        circuitBreakerThreshold: 5,
        circuitBreakerTimeout: 60000
      });
    });
  });

  describe('initialize()', () => {
    it('should initialize connection pool successfully', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ now: new Date() }] });
      
      await connectionManager.initialize();
      
      expect(connectionManager.isConnected).toBe(true);
      expect(connectionManager.pool).toBe(mockPool);
      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('SELECT NOW()');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should set up pool event handlers', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ now: new Date() }] });
      
      await connectionManager.initialize();
      
      expect(mockPool.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockPool.on).toHaveBeenCalledWith('acquire', expect.any(Function));
      expect(mockPool.on).toHaveBeenCalledWith('remove', expect.any(Function));
      expect(mockPool.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should retry on connection failure', async () => {
      mockPool.connect
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValue(mockClient);
      
      mockClient.query.mockResolvedValue({ rows: [{ now: new Date() }] });
      
      // Mock setTimeout to resolve immediately
      jest.spyOn(global, 'setTimeout').mockImplementation((fn) => {
        fn();
        return 1;
      });
      
      await connectionManager.initialize();
      
      expect(connectionManager.isConnected).toBe(true);
      expect(connectionManager.connectionAttempts).toBe(0);
      
      global.setTimeout.mockRestore();
    });

    it('should fail after max connection attempts', async () => {
      mockPool.connect.mockRejectedValue(new Error('Connection failed'));
      
      // Mock setTimeout to resolve immediately
      jest.spyOn(global, 'setTimeout').mockImplementation((fn) => {
        fn();
        return 1;
      });
      
      await expect(connectionManager.initialize()).rejects.toThrow('Failed to initialize database after 5 attempts');
      
      expect(connectionManager.isConnected).toBe(false);
      expect(connectionManager.connectionAttempts).toBe(5);
      
      global.setTimeout.mockRestore();
    });
  });

  describe('executeQuery()', () => {
    beforeEach(async () => {
      mockClient.query.mockResolvedValue({ rows: [{ now: new Date() }] });
      await connectionManager.initialize();
      mockClient.query.mockClear();
    });

    it('should execute query successfully', async () => {
      const mockResult = { rows: [{ id: 1, name: 'test' }], rowCount: 1 };
      mockClient.query.mockResolvedValue(mockResult);
      
      const result = await connectionManager.executeQuery('SELECT * FROM test', []);
      
      expect(result).toBe(mockResult);
      expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM test', []);
      expect(mockClient.release).toHaveBeenCalled();
      expect(connectionManager.stats.successfulQueries).toBe(1);
      expect(connectionManager.stats.totalQueries).toBe(1);
    });

    it('should handle query with parameters', async () => {
      const mockResult = { rows: [{ id: 1 }], rowCount: 1 };
      mockClient.query.mockResolvedValue(mockResult);
      
      await connectionManager.executeQuery('SELECT * FROM test WHERE id = $1', [1]);
      
      expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM test WHERE id = $1', [1]);
    });

    it('should track slow queries', async () => {
      const mockResult = { rows: [], rowCount: 0 };
      mockClient.query.mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => resolve(mockResult), 1100); // Simulate slow query
        });
      });
      
      await connectionManager.executeQuery('SELECT * FROM test');
      
      expect(connectionManager.stats.slowQueries).toBe(1);
    });

    it('should handle query errors', async () => {
      const error = new Error('Query failed');
      mockClient.query.mockRejectedValue(error);
      
      await expect(connectionManager.executeQuery('SELECT * FROM test')).rejects.toThrow('Query failed');
      
      expect(connectionManager.stats.failedQueries).toBe(1);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should throw error when not connected', async () => {
      connectionManager.isConnected = false;
      
      await expect(connectionManager.executeQuery('SELECT 1')).rejects.toThrow('Database connection not initialized');
    });
  });

  describe('executeTransaction()', () => {
    beforeEach(async () => {
      mockClient.query.mockResolvedValue({ rows: [{ now: new Date() }] });
      await connectionManager.initialize();
      mockClient.query.mockClear();
    });

    it('should execute transaction successfully', async () => {
      const transactionFn = jest.fn().mockResolvedValue('transaction result');
      
      const result = await connectionManager.executeTransaction(transactionFn);
      
      expect(result).toBe('transaction result');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(transactionFn).toHaveBeenCalledWith(mockClient);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should rollback transaction on error', async () => {
      const error = new Error('Transaction failed');
      const transactionFn = jest.fn().mockRejectedValue(error);
      
      await expect(connectionManager.executeTransaction(transactionFn)).rejects.toThrow('Transaction failed');
      
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should throw error when not connected', async () => {
      connectionManager.isConnected = false;
      
      await expect(connectionManager.executeTransaction(() => {})).rejects.toThrow('Database connection not initialized');
    });
  });

  describe('getStats()', () => {
    beforeEach(async () => {
      mockClient.query.mockResolvedValue({ rows: [{ now: new Date() }] });
      await connectionManager.initialize();
    });

    it('should return comprehensive statistics', () => {
      connectionManager.stats.totalQueries = 10;
      connectionManager.stats.successfulQueries = 8;
      connectionManager.stats.totalExecutionTime = 5000;
      
      const stats = connectionManager.getStats();
      
      expect(stats.totalQueries).toBe(10);
      expect(stats.successfulQueries).toBe(8);
      expect(stats.avgExecutionTime).toBe(500);
      expect(stats.successRate).toBe(80);
      expect(stats.isConnected).toBe(true);
      expect(stats.pool.totalCount).toBe(5);
      expect(stats.pool.idleCount).toBe(3);
    });

    it('should handle zero queries', () => {
      const stats = connectionManager.getStats();
      
      expect(stats.avgExecutionTime).toBe(0);
      expect(stats.successRate).toBe(0);
    });
  });

  describe('healthCheck()', () => {
    beforeEach(async () => {
      mockClient.query.mockResolvedValue({ rows: [{ now: new Date() }] });
      await connectionManager.initialize();
      mockClient.query.mockClear();
    });

    it('should return healthy status', async () => {
      const mockTimestamp = new Date();
      mockClient.query.mockResolvedValue({ 
        rows: [{ health_check: 1, timestamp: mockTimestamp }] 
      });
      
      const health = await connectionManager.healthCheck();
      
      expect(health.healthy).toBe(true);
      expect(health.timestamp).toBe(mockTimestamp);
      expect(health.responseTime).toBeGreaterThan(0);
      expect(health.stats).toBeDefined();
      expect(connectionManager.stats.lastHealthCheck).toBeInstanceOf(Date);
    });

    it('should return unhealthy status on error', async () => {
      mockClient.query.mockRejectedValue(new Error('Health check failed'));
      
      const health = await connectionManager.healthCheck();
      
      expect(health.healthy).toBe(false);
      expect(health.error).toBe('Health check failed');
      expect(health.stats).toBeDefined();
    });
  });

  describe('close()', () => {
    beforeEach(async () => {
      mockClient.query.mockResolvedValue({ rows: [{ now: new Date() }] });
      await connectionManager.initialize();
    });

    it('should close connection pool successfully', async () => {
      await connectionManager.close();
      
      expect(mockPool.end).toHaveBeenCalled();
      expect(connectionManager.isConnected).toBe(false);
      expect(connectionManager.pool).toBeNull();
    });

    it('should clear health check interval', async () => {
      // Start health check interval
      connectionManager._startHealthCheck();
      const intervalId = connectionManager.healthCheckInterval;
      
      jest.spyOn(global, 'clearInterval');
      
      await connectionManager.close();
      
      expect(global.clearInterval).toHaveBeenCalledWith(intervalId);
      expect(connectionManager.healthCheckInterval).toBeNull();
      
      global.clearInterval.mockRestore();
    });

    it('should handle close errors', async () => {
      mockPool.end.mockRejectedValue(new Error('Close failed'));
      
      await expect(connectionManager.close()).rejects.toThrow('Close failed');
    });
  });

  describe('Pool Event Handlers', () => {
    beforeEach(async () => {
      mockClient.query.mockResolvedValue({ rows: [{ now: new Date() }] });
      await connectionManager.initialize();
    });

    it('should handle connect events', () => {
      const connectHandler = mockPool.on.mock.calls.find(call => call[0] === 'connect')[1];
      
      connectHandler(mockClient);
      
      expect(connectionManager.stats.totalConnections).toBe(1);
    });

    it('should handle error events', () => {
      const errorHandler = mockPool.on.mock.calls.find(call => call[0] === 'error')[1];
      
      errorHandler(new Error('Pool error'), mockClient);
      
      expect(connectionManager.stats.connectionErrors).toBe(1);
    });
  });
});

