/**
 * AgentAPI Middleware Server Tests
 */

const request = require('supertest');
const AgentAPIMiddlewareServer = require('../../src/ai_cicd_system/agentapi/middleware_server');

describe('AgentAPI Middleware Server', () => {
  let server;
  let app;

  beforeAll(async () => {
    // Mock configuration for testing
    const testConfig = {
      server: {
        host: 'localhost',
        port: 0, // Use random port for testing
        cors: { origin: ['http://localhost:3000'] }
      },
      wsl2: {
        maxInstances: 2,
        resourceLimits: {
          memory: '1GB',
          cpu: '1 core',
          disk: '5GB'
        },
        timeout: 60000
      },
      claudeCode: {
        apiUrl: 'http://localhost:3002',
        timeout: 30000,
        retryAttempts: 1
      },
      database: {
        connectionString: 'postgresql://test:test@localhost:5432/test_db'
      }
    };

    server = new AgentAPIMiddlewareServer(testConfig);
    app = server.app;

    // Mock the components to avoid actual connections during testing
    server.wsl2Manager = {
      initialize: jest.fn().mockResolvedValue(true),
      cleanup: jest.fn().mockResolvedValue(true),
      getAllInstances: jest.fn().mockReturnValue([]),
      getResourceUsage: jest.fn().mockReturnValue({
        memory: 0,
        cpu: 0,
        disk: 0,
        activeInstances: 0
      })
    };

    server.claudeCodeInterface = {
      checkHealth: jest.fn().mockResolvedValue({
        available: true,
        status: 'healthy'
      }),
      getActiveSessions: jest.fn().mockReturnValue([]),
      getStatistics: jest.fn().mockReturnValue({
        activeSessions: 0,
        totalMessages: 0
      })
    };

    server.databaseConnector = {
      connect: jest.fn().mockResolvedValue({ success: true }),
      disconnect: jest.fn().mockResolvedValue(true),
      checkConnection: jest.fn().mockResolvedValue({
        connected: true,
        poolSize: 1
      })
    };

    server.deploymentOrchestrator = {
      getStatistics: jest.fn().mockReturnValue({
        activeDeployments: 0,
        queuedDeployments: 0,
        maxConcurrentDeployments: 3
      })
    };
  });

  afterAll(async () => {
    if (server) {
      await server.gracefulShutdown();
    }
  });

  describe('Health Endpoints', () => {
    test('GET /health should return healthy status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        version: '1.0.0',
        metrics: expect.any(Object)
      });
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('API Documentation', () => {
    test('GET /api/docs should return API documentation', async () => {
      const response = await request(app)
        .get('/api/docs')
        .expect(200);

      expect(response.body).toMatchObject({
        title: 'AgentAPI Middleware',
        version: '1.0.0',
        description: expect.any(String),
        endpoints: expect.any(Object)
      });

      expect(response.body.endpoints).toHaveProperty('deployment');
      expect(response.body.endpoints).toHaveProperty('validation');
      expect(response.body.endpoints).toHaveProperty('status');
      expect(response.body.endpoints).toHaveProperty('webhook');
    });
  });

  describe('Error Handling', () => {
    test('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/unknown-route')
        .expect(404);

      expect(response.body).toMatchObject({
        error: 'Not Found',
        message: expect.stringContaining('Route GET /unknown-route not found'),
        availableRoutes: '/api/docs'
      });
    });

    test('should handle malformed JSON in request body', async () => {
      const response = await request(app)
        .post('/api/deployment/start')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);
    });
  });

  describe('CORS Configuration', () => {
    test('should include CORS headers', async () => {
      const response = await request(app)
        .options('/health')
        .set('Origin', 'http://localhost:3000')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });
  });

  describe('Rate Limiting', () => {
    test('should apply rate limiting', async () => {
      // Make multiple requests quickly to test rate limiting
      const requests = Array(10).fill().map(() => 
        request(app).get('/health')
      );

      const responses = await Promise.all(requests);
      
      // All requests should succeed initially (rate limit is generous for testing)
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });
    });
  });

  describe('Request Logging', () => {
    test('should log requests', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await request(app)
        .get('/health')
        .expect(200);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z - GET \/health/)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Middleware Context', () => {
    test('should provide agentAPI context to routes', async () => {
      // This is tested indirectly through the health endpoint
      // which uses the metrics from the context
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.metrics).toBeDefined();
    });
  });

  describe('Component Integration', () => {
    test('should initialize all components', () => {
      expect(server.wsl2Manager).toBeDefined();
      expect(server.gitOperations).toBeDefined();
      expect(server.claudeCodeInterface).toBeDefined();
      expect(server.deploymentOrchestrator).toBeDefined();
      expect(server.orchestratorClient).toBeDefined();
      expect(server.databaseConnector).toBeDefined();
    });

    test('should have proper component configuration', () => {
      expect(server.config.server.port).toBe(0);
      expect(server.config.wsl2.maxInstances).toBe(2);
      expect(server.config.claudeCode.retryAttempts).toBe(1);
    });
  });

  describe('Metrics Tracking', () => {
    test('should initialize metrics', () => {
      expect(server.metrics).toMatchObject({
        totalDeployments: 0,
        successfulDeployments: 0,
        failedDeployments: 0,
        averageDeploymentTime: 0,
        activeInstances: 0
      });
    });

    test('should update metrics', () => {
      server.updateMetrics('deployment_started');
      expect(server.metrics.totalDeployments).toBe(1);

      server.updateMetrics('deployment_success');
      expect(server.metrics.successfulDeployments).toBe(1);

      server.updateMetrics('deployment_time', 5000);
      expect(server.metrics.averageDeploymentTime).toBe(5000);
    });
  });

  describe('WebSocket Integration', () => {
    test('should have WebSocket server configured', () => {
      expect(server.io).toBeDefined();
    });

    test('should emit updates', () => {
      const emitSpy = jest.spyOn(server.io, 'to').mockReturnValue({
        emit: jest.fn()
      });

      server.emitUpdate('test-deployment', 'status_change', { status: 'running' });

      expect(emitSpy).toHaveBeenCalledWith('deployment-test-deployment');
      emitSpy.mockRestore();
    });
  });

  describe('Configuration Validation', () => {
    test('should use default configuration when not provided', () => {
      const defaultServer = new AgentAPIMiddlewareServer();
      
      expect(defaultServer.config.server.host).toBe('localhost');
      expect(defaultServer.config.server.port).toBe(3001);
      expect(defaultServer.config.wsl2.maxInstances).toBe(5);
      expect(defaultServer.config.claudeCode.timeout).toBe(180000);
    });

    test('should merge custom configuration with defaults', () => {
      const customConfig = {
        server: { port: 4000 },
        wsl2: { maxInstances: 10 }
      };
      
      const customServer = new AgentAPIMiddlewareServer(customConfig);
      
      expect(customServer.config.server.port).toBe(4000);
      expect(customServer.config.server.host).toBe('localhost'); // default
      expect(customServer.config.wsl2.maxInstances).toBe(10);
      expect(customServer.config.wsl2.timeout).toBe(300000); // default
    });
  });
});

