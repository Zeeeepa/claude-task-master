/**
 * @fileoverview AgentAPI Middleware Tests
 * @description Test suite for AgentAPI middleware functionality
 */

import { jest } from '@jest/globals';
import { AgentAPIMiddleware } from '../middleware/agent_api_middleware.js';

// Mock dependencies
jest.mock('../utils/simple_logger.js', () => ({
  log: jest.fn()
}));

jest.mock('../middleware/request_transformer.js', () => ({
  RequestTransformer: jest.fn().mockImplementation(() => ({
    transformTaskToAgentRequest: jest.fn().mockResolvedValue({ type: 'code_generation_request' }),
    transformAgentResponseToClaudeCode: jest.fn().mockResolvedValue({ type: 'validation_request' }),
    transformClaudeCodeResponseToAgent: jest.fn().mockResolvedValue({ type: 'validation_update' })
  }))
}));

jest.mock('../middleware/session_manager.js', () => ({
  SessionManager: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(),
    getOrCreateSession: jest.fn().mockResolvedValue({ id: 'test-session' }),
    updateSession: jest.fn().mockResolvedValue(),
    shutdown: jest.fn().mockResolvedValue()
  }))
}));

jest.mock('../middleware/protocol_adapter.js', () => ({
  ProtocolAdapter: jest.fn().mockImplementation(() => ({}))
}));

jest.mock('../middleware/message_queue.js', () => ({
  MessageQueue: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(),
    shutdown: jest.fn().mockResolvedValue()
  }))
}));

jest.mock('../communication/http_client.js', () => ({
  HTTPClient: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(),
    send: jest.fn().mockResolvedValue({ status: 'ok' }),
    shutdown: jest.fn().mockResolvedValue(),
    getStatistics: jest.fn().mockReturnValue({}),
    getHealth: jest.fn().mockReturnValue({ status: 'healthy' })
  }))
}));

describe('AgentAPIMiddleware', () => {
  let middleware;
  let mockConfig;

  beforeEach(() => {
    mockConfig = {
      agentApiUrl: 'http://test-api:8000',
      apiKey: 'test-key',
      timeout: 30000,
      enableWebSocket: false
    };
    
    middleware = new AgentAPIMiddleware(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const defaultMiddleware = new AgentAPIMiddleware();
      
      expect(defaultMiddleware.config.agentApiUrl).toBe('http://localhost:8000');
      expect(defaultMiddleware.config.timeout).toBe(120000);
      expect(defaultMiddleware.config.maxConcurrentRequests).toBe(10);
    });

    it('should merge provided configuration with defaults', () => {
      expect(middleware.config.agentApiUrl).toBe('http://test-api:8000');
      expect(middleware.config.apiKey).toBe('test-key');
      expect(middleware.config.timeout).toBe(30000);
    });

    it('should initialize internal components', () => {
      expect(middleware.requestTransformer).toBeDefined();
      expect(middleware.sessionManager).toBeDefined();
      expect(middleware.protocolAdapter).toBeDefined();
      expect(middleware.messageQueue).toBeDefined();
      expect(middleware.activeRequests).toBeInstanceOf(Map);
      expect(middleware.requestHistory).toBeInstanceOf(Array);
    });
  });

  describe('initialize', () => {
    it('should initialize all components successfully', async () => {
      await middleware.initialize();
      
      expect(middleware.isInitialized).toBe(true);
      expect(middleware.sessionManager.initialize).toHaveBeenCalled();
      expect(middleware.messageQueue.initialize).toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      middleware.sessionManager.initialize.mockRejectedValue(new Error('Init failed'));
      
      await expect(middleware.initialize()).rejects.toThrow('Init failed');
      expect(middleware.isInitialized).toBe(false);
    });
  });

  describe('processTaskRequest', () => {
    const mockTask = {
      id: 'task-123',
      title: 'Test Task',
      description: 'Test task description',
      requirements: ['req1', 'req2']
    };

    const mockContext = {
      repository: 'test-repo',
      branch: 'main',
      user: 'test-user'
    };

    beforeEach(async () => {
      await middleware.initialize();
    });

    it('should process task request successfully', async () => {
      const result = await middleware.processTaskRequest(mockTask, mockContext);
      
      expect(result).toEqual({ type: 'validation_request' });
      expect(middleware.sessionManager.getOrCreateSession).toHaveBeenCalledWith(mockTask, mockContext);
      expect(middleware.requestTransformer.transformTaskToAgentRequest).toHaveBeenCalled();
      expect(middleware.requestTransformer.transformAgentResponseToClaudeCode).toHaveBeenCalled();
    });

    it('should track active requests', async () => {
      const requestPromise = middleware.processTaskRequest(mockTask, mockContext);
      
      expect(middleware.activeRequests.size).toBe(1);
      
      await requestPromise;
      
      expect(middleware.activeRequests.size).toBe(0);
      expect(middleware.requestHistory.length).toBe(1);
    });

    it('should handle concurrent request limit', async () => {
      // Fill up to the limit
      const promises = [];
      for (let i = 0; i < middleware.config.maxConcurrentRequests; i++) {
        promises.push(middleware.processTaskRequest({ ...mockTask, id: `task-${i}` }, mockContext));
      }
      
      // This should fail due to limit
      await expect(
        middleware.processTaskRequest({ ...mockTask, id: 'task-overflow' }, mockContext)
      ).rejects.toThrow('Maximum concurrent requests reached');
      
      // Clean up
      await Promise.all(promises);
    });

    it('should handle processing errors', async () => {
      middleware.requestTransformer.transformTaskToAgentRequest.mockRejectedValue(
        new Error('Transform failed')
      );
      
      await expect(middleware.processTaskRequest(mockTask, mockContext))
        .rejects.toThrow('Transform failed');
      
      expect(middleware.activeRequests.size).toBe(0);
      expect(middleware.requestHistory.length).toBe(1);
      expect(middleware.requestHistory[0].status).toBe('failed');
    });
  });

  describe('sendToAgentAPI', () => {
    beforeEach(async () => {
      await middleware.initialize();
    });

    it('should send request to AgentAPI', async () => {
      const mockRequest = { type: 'test_request', data: 'test' };
      const mockResponse = { status: 'success', data: 'response' };
      
      middleware.communicationClient.send.mockResolvedValue(mockResponse);
      
      const result = await middleware.sendToAgentAPI(mockRequest);
      
      expect(middleware.communicationClient.send).toHaveBeenCalledWith(mockRequest);
      expect(result).toEqual(mockResponse);
    });

    it('should handle communication errors', async () => {
      const mockRequest = { type: 'test_request' };
      
      middleware.communicationClient.send.mockRejectedValue(new Error('Network error'));
      
      await expect(middleware.sendToAgentAPI(mockRequest))
        .rejects.toThrow('Network error');
    });
  });

  describe('processClaudeCodeResponse', () => {
    beforeEach(async () => {
      await middleware.initialize();
    });

    it('should process Claude Code response successfully', async () => {
      const mockResponse = {
        validationId: 'validation-123',
        success: true,
        issues: []
      };
      
      const mockContext = {
        sessionId: 'session-123'
      };
      
      const result = await middleware.processClaudeCodeResponse(mockResponse, mockContext);
      
      expect(middleware.requestTransformer.transformClaudeCodeResponseToAgent)
        .toHaveBeenCalledWith(mockResponse, mockContext);
      expect(middleware.sessionManager.updateSession).toHaveBeenCalledWith(
        'session-123',
        expect.objectContaining({
          claudeCodeResponse: mockResponse
        })
      );
      expect(result).toEqual({ type: 'validation_update' });
    });
  });

  describe('testConnection', () => {
    beforeEach(async () => {
      await middleware.initialize();
    });

    it('should test connection successfully', async () => {
      middleware.communicationClient.send.mockResolvedValue({ status: 'ok' });
      
      const result = await middleware.testConnection();
      
      expect(result).toBe(true);
      expect(middleware.communicationClient.send).toHaveBeenCalledWith({
        type: 'health_check',
        timestamp: expect.any(String)
      });
    });

    it('should handle connection test failure', async () => {
      middleware.communicationClient.send.mockResolvedValue({ status: 'error' });
      
      await expect(middleware.testConnection())
        .rejects.toThrow('Unexpected response: error');
    });
  });

  describe('getStatistics', () => {
    it('should return middleware statistics', () => {
      // Add some mock history
      middleware.requestHistory.push(
        { status: 'completed' },
        { status: 'completed' },
        { status: 'failed' }
      );
      
      const stats = middleware.getStatistics();
      
      expect(stats).toEqual({
        active_requests: 0,
        completed_requests: 2,
        failed_requests: 1,
        total_requests: 3,
        success_rate: expect.any(Number),
        average_processing_time_ms: expect.any(Number),
        session_manager_stats: expect.any(Object),
        communication_client_stats: expect.any(Object)
      });
    });
  });

  describe('getHealth', () => {
    it('should return health status when initialized', async () => {
      await middleware.initialize();
      
      const health = middleware.getHealth();
      
      expect(health.status).toBe('healthy');
      expect(health.active_requests).toBe(0);
      expect(health.session_manager).toBeDefined();
      expect(health.communication_client).toBeDefined();
    });

    it('should return unhealthy status when not initialized', () => {
      const health = middleware.getHealth();
      
      expect(health.status).toBe('not_initialized');
    });
  });

  describe('shutdown', () => {
    beforeEach(async () => {
      await middleware.initialize();
    });

    it('should shutdown all components', async () => {
      // Add some active requests
      middleware.activeRequests.set('req1', { status: 'processing' });
      middleware.activeRequests.set('req2', { status: 'processing' });
      
      await middleware.shutdown();
      
      expect(middleware.sessionManager.shutdown).toHaveBeenCalled();
      expect(middleware.messageQueue.shutdown).toHaveBeenCalled();
      expect(middleware.communicationClient.shutdown).toHaveBeenCalled();
      expect(middleware.isInitialized).toBe(false);
      expect(middleware.activeRequests.size).toBe(0);
      expect(middleware.requestHistory.length).toBe(2); // Moved to history
    });
  });
});

