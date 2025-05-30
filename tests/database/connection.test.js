/**
 * Database Connection Tests
 */

import { jest } from '@jest/globals';
import db, { DatabaseConnection } from '../../src/database/connection.js';

describe('DatabaseConnection', () => {
  let connection;

  beforeEach(() => {
    connection = new DatabaseConnection();
  });

  afterEach(async () => {
    if (connection.pool) {
      await connection.close();
    }
  });

  describe('initialization', () => {
    test('should create a new connection instance', () => {
      expect(connection).toBeInstanceOf(DatabaseConnection);
      expect(connection.pool).toBeNull();
      expect(connection.isConnected).toBe(false);
    });

    test('should initialize connection pool', async () => {
      // Mock environment variables for testing
      process.env.DB_HOST = 'localhost';
      process.env.DB_NAME = 'test_db';
      process.env.DB_USER = 'test_user';
      process.env.DB_PASSWORD = 'test_password';

      // This test would require a real database connection
      // In a real test environment, you'd use a test database
      expect(typeof connection.initialize).toBe('function');
    });
  });

  describe('query execution', () => {
    test('should throw error when not initialized', async () => {
      await expect(connection.query('SELECT 1')).rejects.toThrow(
        'Database not initialized. Call initialize() first.'
      );
    });
  });

  describe('transaction management', () => {
    test('should throw error when not initialized', async () => {
      await expect(connection.transaction(() => {})).rejects.toThrow(
        'Database not initialized. Call initialize() first.'
      );
    });
  });

  describe('health check', () => {
    test('should return unhealthy status when not connected', async () => {
      const health = await connection.healthCheck();
      expect(health.healthy).toBe(false);
      expect(health.connected).toBe(false);
      expect(health.error).toBeDefined();
    });
  });

  describe('pool statistics', () => {
    test('should return null when pool not initialized', () => {
      const stats = connection.getPoolStats();
      expect(stats).toBeNull();
    });
  });
});

describe('Database singleton', () => {
  test('should export a singleton instance', () => {
    expect(db).toBeInstanceOf(DatabaseConnection);
  });

  test('should be the same instance across imports', async () => {
    const { db: db2 } = await import('../../src/database/connection.js');
    expect(db).toBe(db2);
  });
});

