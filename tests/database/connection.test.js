/**
 * @fileoverview Database Connection Tests
 * @description Comprehensive tests for database connection functionality
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { DatabaseConnection } from '../../src/database/connection.js';

describe('DatabaseConnection', () => {
    let connection;
    const testConfig = {
        host: process.env.DB_TEST_HOST || 'localhost',
        port: parseInt(process.env.DB_TEST_PORT) || 5432,
        database: process.env.DB_TEST_NAME || 'test_db',
        user: process.env.DB_TEST_USER || 'test_user',
        password: process.env.DB_TEST_PASSWORD || 'test_password',
        ssl: false,
        pool: {
            min: 1,
            max: 5,
            idleTimeoutMillis: 5000,
            acquireTimeoutMillis: 10000
        },
        health_check: {
            enabled: true,
            interval_ms: 10000,
            timeout_ms: 2000
        },
        monitoring: {
            slow_query_threshold_ms: 100,
            log_queries: false,
            log_slow_queries: true
        }
    };

    beforeAll(async () => {
        // Skip tests if no test database is configured
        if (!process.env.DB_TEST_URL && !process.env.DB_TEST_HOST) {
            console.log('Skipping database tests - no test database configured');
            return;
        }
    });

    beforeEach(() => {
        connection = new DatabaseConnection(testConfig);
    });

    afterEach(async () => {
        if (connection && connection.isConnected) {
            await connection.shutdown();
        }
    });

    describe('Configuration Validation', () => {
        it('should validate valid configuration', () => {
            expect(() => connection._validateConfig()).not.toThrow();
        });

        it('should throw error for missing required fields', () => {
            const invalidConnection = new DatabaseConnection({
                ...testConfig,
                host: '',
                database: ''
            });
            
            expect(() => invalidConnection._validateConfig()).toThrow(/Configuration errors/);
        });

        it('should warn about missing password', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            
            const connectionWithoutPassword = new DatabaseConnection({
                ...testConfig,
                password: ''
            });
            
            expect(() => connectionWithoutPassword._validateConfig()).not.toThrow();
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('DB_PASSWORD is not set')
            );
            
            consoleSpy.mockRestore();
        });
    });

    describe('Connection Management', () => {
        it('should initialize connection successfully', async () => {
            if (!process.env.DB_TEST_URL && !process.env.DB_TEST_HOST) {
                return; // Skip if no test database
            }

            await connection.initialize();
            
            expect(connection.isConnected).toBe(true);
            expect(connection.pool).toBeDefined();
        });

        it('should handle connection retry logic', async () => {
            if (!process.env.DB_TEST_URL && !process.env.DB_TEST_HOST) {
                return; // Skip if no test database
            }

            const invalidConnection = new DatabaseConnection({
                ...testConfig,
                host: 'invalid-host',
                retry: {
                    max_attempts: 2,
                    delay_ms: 100,
                    backoff_factor: 1
                }
            });

            await expect(invalidConnection.initialize()).rejects.toThrow(/Failed to connect/);
            expect(invalidConnection.connectionAttempts).toBe(2);
        });

        it('should shutdown gracefully', async () => {
            if (!process.env.DB_TEST_URL && !process.env.DB_TEST_HOST) {
                return; // Skip if no test database
            }

            await connection.initialize();
            expect(connection.isConnected).toBe(true);
            
            await connection.shutdown();
            expect(connection.isConnected).toBe(false);
            expect(connection.pool).toBeNull();
        });
    });

    describe('Query Execution', () => {
        beforeEach(async () => {
            if (!process.env.DB_TEST_URL && !process.env.DB_TEST_HOST) {
                return; // Skip if no test database
            }
            await connection.initialize();
        });

        it('should execute simple queries', async () => {
            if (!process.env.DB_TEST_URL && !process.env.DB_TEST_HOST) {
                return; // Skip if no test database
            }

            const result = await connection.query('SELECT 1 as test_value');
            
            expect(result.rows).toHaveLength(1);
            expect(result.rows[0].test_value).toBe(1);
        });

        it('should execute parameterized queries', async () => {
            if (!process.env.DB_TEST_URL && !process.env.DB_TEST_HOST) {
                return; // Skip if no test database
            }

            const result = await connection.query(
                'SELECT $1::text as test_param',
                ['hello world']
            );
            
            expect(result.rows[0].test_param).toBe('hello world');
        });

        it('should handle query errors', async () => {
            if (!process.env.DB_TEST_URL && !process.env.DB_TEST_HOST) {
                return; // Skip if no test database
            }

            await expect(
                connection.query('SELECT * FROM non_existent_table')
            ).rejects.toThrow();
        });

        it('should track query statistics', async () => {
            if (!process.env.DB_TEST_URL && !process.env.DB_TEST_HOST) {
                return; // Skip if no test database
            }

            const initialStats = { ...connection.queryStats };
            
            await connection.query('SELECT 1');
            
            expect(connection.queryStats.total).toBe(initialStats.total + 1);
            expect(connection.queryStats.successful).toBe(initialStats.successful + 1);
        });

        it('should detect slow queries', async () => {
            if (!process.env.DB_TEST_URL && !process.env.DB_TEST_HOST) {
                return; // Skip if no test database
            }

            const slowConnection = new DatabaseConnection({
                ...testConfig,
                monitoring: {
                    slow_query_threshold_ms: 1, // Very low threshold
                    log_slow_queries: true
                }
            });
            
            await slowConnection.initialize();
            
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            
            await slowConnection.query('SELECT pg_sleep(0.01)'); // 10ms sleep
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Slow query detected')
            );
            
            consoleSpy.mockRestore();
            await slowConnection.shutdown();
        });
    });

    describe('Transaction Management', () => {
        beforeEach(async () => {
            if (!process.env.DB_TEST_URL && !process.env.DB_TEST_HOST) {
                return; // Skip if no test database
            }
            await connection.initialize();
        });

        it('should execute successful transactions', async () => {
            if (!process.env.DB_TEST_URL && !process.env.DB_TEST_HOST) {
                return; // Skip if no test database
            }

            const result = await connection.transaction(async (client) => {
                const res1 = await client.query('SELECT 1 as value');
                const res2 = await client.query('SELECT 2 as value');
                return { first: res1.rows[0].value, second: res2.rows[0].value };
            });
            
            expect(result.first).toBe(1);
            expect(result.second).toBe(2);
        });

        it('should rollback failed transactions', async () => {
            if (!process.env.DB_TEST_URL && !process.env.DB_TEST_HOST) {
                return; // Skip if no test database
            }

            await expect(
                connection.transaction(async (client) => {
                    await client.query('SELECT 1');
                    throw new Error('Transaction error');
                })
            ).rejects.toThrow('Transaction error');
        });
    });

    describe('Health Monitoring', () => {
        it('should perform health checks', async () => {
            if (!process.env.DB_TEST_URL && !process.env.DB_TEST_HOST) {
                return; // Skip if no test database
            }

            await connection.initialize();
            
            // Wait for initial health check
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const health = connection.getHealth();
            
            expect(health.connected).toBe(true);
            expect(health.lastHealthCheck).toBeDefined();
            expect(health.poolStats).toBeDefined();
        });

        it('should provide comprehensive metrics', async () => {
            if (!process.env.DB_TEST_URL && !process.env.DB_TEST_HOST) {
                return; // Skip if no test database
            }

            await connection.initialize();
            
            // Execute some queries to generate metrics
            await connection.query('SELECT 1');
            await connection.query('SELECT 2');
            
            const metrics = connection._getQueryMetrics();
            
            expect(metrics.total).toBeGreaterThan(0);
            expect(metrics.successful).toBeGreaterThan(0);
            expect(metrics.averageExecutionTime).toBeGreaterThan(0);
            expect(metrics.successRate).toBeGreaterThan(0);
        });
    });

    describe('Event Emission', () => {
        it('should emit connection events', async () => {
            if (!process.env.DB_TEST_URL && !process.env.DB_TEST_HOST) {
                return; // Skip if no test database
            }

            const events = [];
            
            connection.on('connected', () => events.push('connected'));
            connection.on('disconnected', () => events.push('disconnected'));
            
            await connection.initialize();
            await connection.shutdown();
            
            expect(events).toContain('connected');
            expect(events).toContain('disconnected');
        });

        it('should emit query events', async () => {
            if (!process.env.DB_TEST_URL && !process.env.DB_TEST_HOST) {
                return; // Skip if no test database
            }

            await connection.initialize();
            
            const queryEvents = [];
            
            connection.on('query_completed', (event) => {
                queryEvents.push(event);
            });
            
            await connection.query('SELECT 1');
            
            expect(queryEvents).toHaveLength(1);
            expect(queryEvents[0]).toHaveProperty('queryId');
            expect(queryEvents[0]).toHaveProperty('executionTime');
        });
    });

    describe('Rate Limiting', () => {
        it('should handle Cloudflare rate limiting', async () => {
            const cloudflareConnection = new DatabaseConnection({
                ...testConfig,
                cloudflare: {
                    enabled: true,
                    rate_limit: {
                        requests_per_minute: 2,
                        burst_limit: 1
                    }
                }
            });

            // Test rate limiting logic
            await cloudflareConnection._checkRateLimit();
            await cloudflareConnection._checkRateLimit();
            
            // Third request should be rate limited
            const start = Date.now();
            await cloudflareConnection._checkRateLimit();
            const duration = Date.now() - start;
            
            // Should have waited due to rate limiting
            expect(duration).toBeGreaterThan(50);
        });
    });

    describe('Error Handling', () => {
        it('should handle pool errors gracefully', async () => {
            if (!process.env.DB_TEST_URL && !process.env.DB_TEST_HOST) {
                return; // Skip if no test database
            }

            await connection.initialize();
            
            const errorEvents = [];
            connection.on('pool_error', (error) => {
                errorEvents.push(error);
            });
            
            // Simulate pool error by closing the pool
            if (connection.pool) {
                connection.pool.emit('error', new Error('Test pool error'));
            }
            
            expect(connection.isConnected).toBe(false);
        });

        it('should handle query timeouts', async () => {
            if (!process.env.DB_TEST_URL && !process.env.DB_TEST_HOST) {
                return; // Skip if no test database
            }

            const timeoutConnection = new DatabaseConnection({
                ...testConfig,
                query_timeout: 100 // Very short timeout
            });
            
            await timeoutConnection.initialize();
            
            await expect(
                timeoutConnection.query('SELECT pg_sleep(1)') // 1 second sleep
            ).rejects.toThrow();
            
            await timeoutConnection.shutdown();
        });
    });
});

// Integration test helper
export async function createTestDatabase() {
    if (!process.env.DB_TEST_URL && !process.env.DB_TEST_HOST) {
        throw new Error('Test database not configured');
    }
    
    const connection = new DatabaseConnection({
        host: process.env.DB_TEST_HOST || 'localhost',
        port: parseInt(process.env.DB_TEST_PORT) || 5432,
        database: 'postgres', // Connect to default database first
        user: process.env.DB_TEST_USER || 'test_user',
        password: process.env.DB_TEST_PASSWORD || 'test_password',
        ssl: false
    });
    
    await connection.initialize();
    
    try {
        await connection.query(`DROP DATABASE IF EXISTS ${process.env.DB_TEST_NAME || 'test_db'}`);
        await connection.query(`CREATE DATABASE ${process.env.DB_TEST_NAME || 'test_db'}`);
    } finally {
        await connection.shutdown();
    }
}

export async function dropTestDatabase() {
    if (!process.env.DB_TEST_URL && !process.env.DB_TEST_HOST) {
        return;
    }
    
    const connection = new DatabaseConnection({
        host: process.env.DB_TEST_HOST || 'localhost',
        port: parseInt(process.env.DB_TEST_PORT) || 5432,
        database: 'postgres',
        user: process.env.DB_TEST_USER || 'test_user',
        password: process.env.DB_TEST_PASSWORD || 'test_password',
        ssl: false
    });
    
    await connection.initialize();
    
    try {
        await connection.query(`DROP DATABASE IF EXISTS ${process.env.DB_TEST_NAME || 'test_db'}`);
    } finally {
        await connection.shutdown();
    }
}

