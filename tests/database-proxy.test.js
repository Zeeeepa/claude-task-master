/**
 * Comprehensive Test Suite for Cloudflare Database Proxy
 * Tests for security, performance, reliability, and functionality
 */

import { jest } from '@jest/globals';
import { CloudflareProxyClient } from '../src/database/cloudflare-proxy-client.js';
import { DatabaseMonitor } from '../src/utils/database-monitoring.js';
import { getConfig, validateConfig } from '../config/database-proxy.js';

// Mock fetch for testing
global.fetch = jest.fn();

describe('Cloudflare Database Proxy', () => {
  let client;
  let monitor;

  beforeEach(() => {
    jest.clearAllMocks();
    
    client = new CloudflareProxyClient({
      PROXY_URL: 'https://test-worker.workers.dev',
      API_TOKEN: 'test-token',
      CONNECTION: { timeout: 5000, retries: 2, retryDelay: 100 },
    });
    
    monitor = new DatabaseMonitor({
      PROXY_URL: 'https://test-worker.workers.dev',
      API_TOKEN: 'test-token',
    });
  });

  afterEach(() => {
    if (monitor.isMonitoring) {
      monitor.stopMonitoring();
    }
  });

  describe('Configuration', () => {
    test('should validate required configuration', () => {
      expect(() => validateConfig({
        PROXY_URL: 'https://test.workers.dev',
        API_TOKEN: 'test-token',
      })).not.toThrow();
    });

    test('should throw error for missing configuration', () => {
      expect(() => validateConfig({
        PROXY_URL: 'https://test.workers.dev',
        // Missing API_TOKEN
      })).toThrow('Missing required configuration');
    });

    test('should load environment-specific configuration', () => {
      const devConfig = getConfig('development');
      const prodConfig = getConfig('production');
      
      expect(devConfig.SECURITY.validateSSL).toBe(false);
      expect(prodConfig.SECURITY.validateSSL).toBe(true);
    });
  });

  describe('Database Client', () => {
    describe('Query Execution', () => {
      test('should execute query successfully', async () => {
        const mockResponse = {
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: [{ id: 1, name: 'Test' }],
            rowCount: 1,
            executionTime: 150,
          }),
        };
        
        global.fetch.mockResolvedValue(mockResponse);
        
        const result = await client.query('SELECT * FROM test_table');
        
        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].name).toBe('Test');
        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-worker.workers.dev',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'Authorization': 'Bearer test-token',
              'Content-Type': 'application/json',
            }),
            body: JSON.stringify({
              query: 'SELECT * FROM test_table',
              params: [],
            }),
          })
        );
      });

      test('should handle query with parameters', async () => {
        const mockResponse = {
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: [{ id: 1, name: 'John' }],
            rowCount: 1,
          }),
        };
        
        global.fetch.mockResolvedValue(mockResponse);
        
        await client.query('SELECT * FROM users WHERE id = $1', [1]);
        
        expect(global.fetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: JSON.stringify({
              query: 'SELECT * FROM users WHERE id = $1',
              params: [1],
            }),
          })
        );
      });

      test('should validate dangerous queries', async () => {
        const dangerousQueries = [
          'DROP TABLE users',
          'DELETE FROM users',
          'TRUNCATE TABLE users',
        ];
        
        for (const query of dangerousQueries) {
          await expect(client.query(query)).rejects.toThrow(
            'Query contains potentially dangerous operations'
          );
        }
      });

      test('should validate query length', async () => {
        const longQuery = 'SELECT * FROM test ' + 'x'.repeat(10000);
        
        await expect(client.query(longQuery)).rejects.toThrow(
          'Query exceeds maximum length'
        );
      });
    });

    describe('Error Handling', () => {
      test('should handle HTTP errors', async () => {
        const mockResponse = {
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: () => Promise.resolve('{"error": "Invalid query"}'),
        };
        
        global.fetch.mockResolvedValue(mockResponse);
        
        await expect(client.query('INVALID SQL')).rejects.toThrow('Invalid query');
      });

      test('should handle network errors', async () => {
        global.fetch.mockRejectedValue(new Error('Network error'));
        
        await expect(client.query('SELECT 1')).rejects.toThrow('Network error');
      });

      test('should handle rate limiting', async () => {
        const mockResponse = {
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          text: () => Promise.resolve('{"error": "Rate limit exceeded", "retryAfter": 60}'),
        };
        
        global.fetch.mockResolvedValue(mockResponse);
        
        await expect(client.query('SELECT 1')).rejects.toThrow('Rate limit exceeded');
      });
    });

    describe('Retry Logic', () => {
      test('should retry on retryable errors', async () => {
        global.fetch
          .mockRejectedValueOnce(new Error('ECONNRESET'))
          .mockRejectedValueOnce(new Error('ETIMEDOUT'))
          .mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              data: [{ result: 1 }],
            }),
          });
        
        const result = await client.query('SELECT 1');
        
        expect(result.success).toBe(true);
        expect(global.fetch).toHaveBeenCalledTimes(3);
      });

      test('should not retry on non-retryable errors', async () => {
        global.fetch.mockRejectedValue(new Error('Invalid credentials'));
        
        await expect(client.query('SELECT 1')).rejects.toThrow('Invalid credentials');
        expect(global.fetch).toHaveBeenCalledTimes(1);
      });

      test('should respect retry limit', async () => {
        global.fetch.mockRejectedValue(new Error('ECONNRESET'));
        
        await expect(client.query('SELECT 1')).rejects.toThrow('ECONNRESET');
        expect(global.fetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
      });
    });

    describe('Health Monitoring', () => {
      test('should perform health check', async () => {
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: [{ health_check: 1 }],
          }),
        });
        
        await client.healthCheck();
        
        expect(client.isHealthy).toBe(true);
        expect(client.failureCount).toBe(0);
      });

      test('should mark as unhealthy on failed health checks', async () => {
        global.fetch.mockRejectedValue(new Error('Connection failed'));
        
        // Simulate multiple failures to trigger unhealthy state
        for (let i = 0; i < 5; i++) {
          try {
            await client.healthCheck();
          } catch (error) {
            // Expected to fail
          }
        }
        
        expect(client.isHealthy).toBe(false);
        expect(client.failureCount).toBeGreaterThanOrEqual(3);
      });
    });
  });

  describe('Database Monitor', () => {
    describe('Health Monitoring', () => {
      test('should perform comprehensive health check', async () => {
        // Mock successful responses for all health check queries
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: [{ connectivity_test: 1 }],
          }),
        });
        
        const healthCheck = await monitor.performHealthCheck();
        
        expect(healthCheck.status).toBe('healthy');
        expect(healthCheck.details).toHaveProperty('connectivity');
        expect(healthCheck.details).toHaveProperty('performance');
        expect(healthCheck.details).toHaveProperty('rateLimit');
        expect(healthCheck.details).toHaveProperty('connectionPool');
      });

      test('should detect unhealthy status', async () => {
        global.fetch.mockRejectedValue(new Error('Database unavailable'));
        
        const healthCheck = await monitor.performHealthCheck();
        
        expect(healthCheck.status).toBe('error');
        expect(healthCheck.details.error).toBe('Database unavailable');
      });
    });

    describe('Metrics Collection', () => {
      test('should track request metrics', async () => {
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: [{ test: 1 }],
          }),
        });
        
        // Perform some operations
        await monitor.performHealthCheck();
        await monitor.performHealthCheck();
        
        const metrics = monitor.getMetrics();
        
        expect(metrics.totalRequests).toBeGreaterThan(0);
        expect(metrics.successfulRequests).toBeGreaterThan(0);
        expect(metrics.averageResponseTime).toBeGreaterThan(0);
      });

      test('should calculate success rate correctly', async () => {
        global.fetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ success: true, data: [] }),
          })
          .mockRejectedValueOnce(new Error('Failed'))
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ success: true, data: [] }),
          });
        
        // Perform mixed successful and failed operations
        await monitor.performHealthCheck();
        try {
          await monitor.performHealthCheck();
        } catch (error) {
          // Expected failure
        }
        await monitor.performHealthCheck();
        
        const successRate = monitor.getSuccessRate();
        expect(successRate).toBeGreaterThan(50);
        expect(successRate).toBeLessThan(100);
      });
    });

    describe('Monitoring Lifecycle', () => {
      test('should start and stop monitoring', () => {
        expect(monitor.isMonitoring).toBe(false);
        
        monitor.startMonitoring(1000);
        expect(monitor.isMonitoring).toBe(true);
        
        monitor.stopMonitoring();
        expect(monitor.isMonitoring).toBe(false);
      });

      test('should not start monitoring if already running', () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
        
        monitor.startMonitoring(1000);
        monitor.startMonitoring(1000); // Should warn
        
        expect(consoleSpy).toHaveBeenCalledWith('Monitoring is already running');
        
        monitor.stopMonitoring();
        consoleSpy.mockRestore();
      });
    });

    describe('Report Generation', () => {
      test('should generate health report', async () => {
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: [{ test: 1 }],
          }),
        });
        
        await monitor.performHealthCheck();
        
        const report = monitor.generateHealthReport();
        
        expect(report).toHaveProperty('timestamp');
        expect(report).toHaveProperty('summary');
        expect(report).toHaveProperty('metrics');
        expect(report).toHaveProperty('configuration');
        expect(report).toHaveProperty('recommendations');
        
        expect(report.summary).toHaveProperty('status');
        expect(report.summary).toHaveProperty('successRate');
        expect(report.summary).toHaveProperty('averageResponseTime');
      });

      test('should provide recommendations based on health', async () => {
        // Simulate poor performance
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: [{ test: 1 }],
            executionTime: 10000, // Very slow
          }),
        });
        
        await monitor.performHealthCheck();
        
        const report = monitor.generateHealthReport();
        const hasPerformanceRecommendation = report.recommendations.some(
          rec => rec.message.includes('response time')
        );
        
        expect(hasPerformanceRecommendation).toBe(true);
      });
    });
  });

  describe('Security Tests', () => {
    test('should require authentication', async () => {
      const clientWithoutToken = new CloudflareProxyClient({
        PROXY_URL: 'https://test-worker.workers.dev',
        API_TOKEN: '',
      });
      
      global.fetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('{"error": "Unauthorized"}'),
      });
      
      await expect(clientWithoutToken.query('SELECT 1')).rejects.toThrow('Unauthorized');
    });

    test('should validate SSL in production', () => {
      const prodConfig = getConfig('production');
      expect(prodConfig.SECURITY.validateSSL).toBe(true);
    });

    test('should prevent SQL injection attempts', async () => {
      const maliciousQueries = [
        "SELECT * FROM users WHERE id = '1; DROP TABLE users; --'",
        "SELECT * FROM users UNION SELECT * FROM passwords",
        "SELECT * FROM users; DELETE FROM users; --",
      ];
      
      for (const query of maliciousQueries) {
        await expect(client.query(query)).rejects.toThrow();
      }
    });
  });

  describe('Performance Tests', () => {
    test('should handle concurrent requests', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: [{ result: 1 }],
        }),
      });
      
      const concurrentRequests = Array(10).fill().map(() =>
        client.query('SELECT 1')
      );
      
      const results = await Promise.all(concurrentRequests);
      
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });

    test('should timeout long-running requests', async () => {
      const slowClient = new CloudflareProxyClient({
        PROXY_URL: 'https://test-worker.workers.dev',
        API_TOKEN: 'test-token',
        CONNECTION: { timeout: 100 }, // Very short timeout
      });
      
      global.fetch.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 200)) // Slower than timeout
      );
      
      await expect(slowClient.query('SELECT 1')).rejects.toThrow();
    });

    test('should measure response times accurately', async () => {
      const delay = 100;
      global.fetch.mockImplementation(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              data: [{ test: 1 }],
            }),
          }), delay)
        )
      );
      
      const startTime = Date.now();
      await client.query('SELECT 1');
      const actualTime = Date.now() - startTime;
      
      expect(actualTime).toBeGreaterThanOrEqual(delay);
    });
  });

  describe('Failover and Reliability', () => {
    test('should handle primary endpoint failure', async () => {
      const clientWithFailover = new CloudflareProxyClient({
        PROXY_URL: 'https://primary.workers.dev',
        API_TOKEN: 'test-token',
        FAILOVER: {
          enabled: true,
          fallbackUrls: ['https://backup.workers.dev'],
          maxFailures: 2,
        },
      });
      
      // Simulate primary failure, then success on fallback
      global.fetch
        .mockRejectedValueOnce(new Error('Primary failed'))
        .mockRejectedValueOnce(new Error('Primary failed'))
        .mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: [{ result: 1 }],
          }),
        });
      
      // Trigger failures to mark as unhealthy
      clientWithFailover.failureCount = 3;
      clientWithFailover.isHealthy = false;
      
      const result = await clientWithFailover.query('SELECT 1');
      expect(result.success).toBe(true);
    });

    test('should recover from temporary failures', async () => {
      global.fetch
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: [{ result: 1 }],
          }),
        });
      
      const result = await client.query('SELECT 1');
      
      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2); // Initial failure + retry
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty query results', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: [],
          rowCount: 0,
        }),
      });
      
      const result = await client.query('SELECT * FROM empty_table');
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });

    test('should handle large result sets', async () => {
      const largeDataset = Array(15000).fill().map((_, i) => ({ id: i }));
      
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: largeDataset.slice(0, 10000), // Truncated
          rowCount: 15000,
          truncated: true,
          totalRows: 15000,
        }),
      });
      
      const result = await client.query('SELECT * FROM large_table');
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(10000);
      expect(result.truncated).toBe(true);
      expect(result.totalRows).toBe(15000);
    });

    test('should handle malformed JSON responses', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });
      
      await expect(client.query('SELECT 1')).rejects.toThrow('Invalid JSON');
    });

    test('should handle null and undefined parameters', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: [{ result: null }],
        }),
      });
      
      const result = await client.query('SELECT $1 as result', [null]);
      
      expect(result.success).toBe(true);
      expect(result.data[0].result).toBeNull();
    });
  });
});

describe('Integration Tests', () => {
  // These tests would run against a real Cloudflare Worker in CI/CD
  describe('Real Environment Tests', () => {
    test.skip('should connect to staging environment', async () => {
      // This test would be enabled in CI/CD with real credentials
      const client = new CloudflareProxyClient({
        PROXY_URL: process.env.STAGING_PROXY_URL,
        API_TOKEN: process.env.STAGING_API_TOKEN,
      });
      
      const result = await client.query('SELECT 1 as integration_test');
      expect(result.success).toBe(true);
    });

    test.skip('should handle production load', async () => {
      // Load testing would be performed here
      const client = new CloudflareProxyClient();
      const promises = Array(100).fill().map(() =>
        client.query('SELECT NOW()')
      );
      
      const results = await Promise.all(promises);
      const successRate = results.filter(r => r.success).length / results.length;
      
      expect(successRate).toBeGreaterThan(0.95); // 95% success rate
    });
  });
});

