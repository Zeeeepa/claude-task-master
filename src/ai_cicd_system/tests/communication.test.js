/**
 * @fileoverview Communication Tests
 * @description Test suite for communication components (HTTP and WebSocket clients)
 */

import { jest } from '@jest/globals';
import { HTTPClient } from '../communication/http_client.js';
import { WebSocketClient } from '../communication/websocket_client.js';

// Mock dependencies
jest.mock('../utils/simple_logger.js', () => ({
  log: jest.fn()
}));

// Mock fetch for HTTPClient tests
global.fetch = jest.fn();

// Mock WebSocket for WebSocketClient tests
global.WebSocket = jest.fn();

describe('Communication Components', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('HTTPClient', () => {
    let httpClient;
    let mockConfig;

    beforeEach(() => {
      mockConfig = {
        agentApiUrl: 'http://test-api:8000',
        apiKey: 'test-key',
        timeout: 30000,
        retryAttempts: 2
      };
      
      httpClient = new HTTPClient(mockConfig);
    });

    describe('constructor', () => {
      it('should initialize with provided configuration', () => {
        expect(httpClient.baseUrl).toBe('http://test-api:8000');
        expect(httpClient.timeout).toBe(30000);
        expect(httpClient.retryAttempts).toBe(2);
        expect(httpClient.headers['Authorization']).toBe('Bearer test-key');
      });

      it('should use default configuration when not provided', () => {
        const defaultClient = new HTTPClient();
        
        expect(defaultClient.baseUrl).toBe('http://localhost:8000');
        expect(defaultClient.timeout).toBe(120000);
        expect(defaultClient.retryAttempts).toBe(3);
      });
    });

    describe('initialize', () => {
      it('should initialize successfully', async () => {
        // Mock successful health check
        fetch.mockResolvedValueOnce({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ status: 'ok' })
        });

        await httpClient.initialize();
        
        expect(httpClient.isInitialized).toBe(true);
      });

      it('should handle initialization failure', async () => {
        // Mock failed health check
        fetch.mockRejectedValueOnce(new Error('Connection failed'));

        await expect(httpClient.initialize()).rejects.toThrow('Connection failed');
        expect(httpClient.isInitialized).toBe(false);
      });
    });

    describe('send', () => {
      beforeEach(async () => {
        // Mock successful initialization
        fetch.mockResolvedValueOnce({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ status: 'ok' })
        });
        await httpClient.initialize();
        fetch.mockClear();
      });

      it('should send POST request successfully', async () => {
        const mockData = { message: 'test' };
        const mockResponse = { result: 'success' };

        fetch.mockResolvedValueOnce({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockResponse)
        });

        const result = await httpClient.send(mockData);

        expect(fetch).toHaveBeenCalledWith(
          'http://test-api:8000/api/v1/process',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'Content-Type': 'application/json',
              'Authorization': 'Bearer test-key'
            }),
            body: JSON.stringify(mockData)
          })
        );
        expect(result).toEqual(mockResponse);
      });

      it('should handle HTTP errors', async () => {
        const mockData = { message: 'test' };

        fetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error'
        });

        await expect(httpClient.send(mockData)).rejects.toThrow('HTTP 500: Internal Server Error');
      });

      it('should retry on retryable errors', async () => {
        const mockData = { message: 'test' };

        // First call fails, second succeeds
        fetch
          .mockRejectedValueOnce(new Error('ECONNRESET'))
          .mockResolvedValueOnce({
            ok: true,
            headers: { get: () => 'application/json' },
            json: () => Promise.resolve({ result: 'success' })
          });

        const result = await httpClient.send(mockData, { retries: 2 });

        expect(fetch).toHaveBeenCalledTimes(2);
        expect(result).toEqual({ result: 'success' });
      });

      it('should not retry on non-retryable errors', async () => {
        const mockData = { message: 'test' };

        fetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: 'Bad Request'
        });

        await expect(httpClient.send(mockData, { retries: 2 }))
          .rejects.toThrow('HTTP 400: Bad Request');
        
        expect(fetch).toHaveBeenCalledTimes(1);
      });
    });

    describe('HTTP methods', () => {
      beforeEach(async () => {
        fetch.mockResolvedValue({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ status: 'ok' })
        });
        await httpClient.initialize();
        fetch.mockClear();
      });

      it('should send GET request', async () => {
        fetch.mockResolvedValueOnce({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ data: 'test' })
        });

        await httpClient.get('/test');

        expect(fetch).toHaveBeenCalledWith(
          'http://test-api:8000/test',
          expect.objectContaining({ method: 'GET' })
        );
      });

      it('should send PUT request', async () => {
        const data = { update: 'test' };
        
        fetch.mockResolvedValueOnce({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ updated: true })
        });

        await httpClient.put('/test', data);

        expect(fetch).toHaveBeenCalledWith(
          'http://test-api:8000/test',
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify(data)
          })
        );
      });

      it('should send DELETE request', async () => {
        fetch.mockResolvedValueOnce({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ deleted: true })
        });

        await httpClient.delete('/test');

        expect(fetch).toHaveBeenCalledWith(
          'http://test-api:8000/test',
          expect.objectContaining({ method: 'DELETE' })
        );
      });
    });

    describe('getStatistics', () => {
      it('should return client statistics', () => {
        // Add some mock history
        httpClient.requestHistory.push(
          { status: 'success', duration: 100 },
          { status: 'success', duration: 200 },
          { status: 'failed', duration: 50 }
        );

        const stats = httpClient.getStatistics();

        expect(stats.total_requests).toBe(3);
        expect(stats.successful_requests).toBe(2);
        expect(stats.failed_requests).toBe(1);
        expect(stats.success_rate).toBe(66.66666666666666);
        expect(stats.average_duration_ms).toBe(116.66666666666667);
      });
    });
  });

  describe('WebSocketClient', () => {
    let wsClient;
    let mockConfig;
    let mockWebSocket;

    beforeEach(() => {
      mockConfig = {
        agentApiUrl: 'ws://test-api:8000',
        reconnectAttempts: 2,
        heartbeatInterval: 10000
      };
      
      mockWebSocket = {
        onopen: null,
        onclose: null,
        onerror: null,
        onmessage: null,
        send: jest.fn(),
        close: jest.fn(),
        readyState: 1 // OPEN
      };
      
      WebSocket.mockImplementation(() => mockWebSocket);
      
      wsClient = new WebSocketClient(mockConfig);
    });

    describe('constructor', () => {
      it('should initialize with provided configuration', () => {
        expect(wsClient.url).toBe('ws://test-api:8000/ws');
        expect(wsClient.reconnectAttempts).toBe(2);
        expect(wsClient.heartbeatInterval).toBe(10000);
      });

      it('should build WebSocket URL from HTTP URL', () => {
        const httpConfig = { agentApiUrl: 'http://test-api:8000' };
        const client = new WebSocketClient(httpConfig);
        
        expect(client.url).toBe('ws://test-api:8000/ws');
      });

      it('should build secure WebSocket URL from HTTPS URL', () => {
        const httpsConfig = { agentApiUrl: 'https://test-api:8000' };
        const client = new WebSocketClient(httpsConfig);
        
        expect(client.url).toBe('wss://test-api:8000/ws');
      });
    });

    describe('initialize', () => {
      it('should initialize successfully', async () => {
        const initPromise = wsClient.initialize();
        
        // Simulate successful connection
        mockWebSocket.onopen();
        
        await initPromise;
        
        expect(wsClient.isInitialized).toBe(true);
        expect(wsClient.isConnected).toBe(true);
      });

      it('should handle initialization failure', async () => {
        const initPromise = wsClient.initialize();
        
        // Simulate connection error
        mockWebSocket.onerror(new Error('Connection failed'));
        
        await expect(initPromise).rejects.toThrow('Connection failed');
        expect(wsClient.isInitialized).toBe(false);
      });
    });

    describe('send', () => {
      beforeEach(async () => {
        const initPromise = wsClient.initialize();
        mockWebSocket.onopen();
        await initPromise;
      });

      it('should send message successfully', async () => {
        const mockData = { message: 'test' };
        const mockResponse = { id: 'response-123', result: 'success' };

        const sendPromise = wsClient.send(mockData);
        
        // Simulate response
        const sentMessage = JSON.parse(mockWebSocket.send.mock.calls[0][0]);
        mockWebSocket.onmessage({
          data: JSON.stringify({
            ...mockResponse,
            response_to: sentMessage.id
          })
        });

        const result = await sendPromise;

        expect(mockWebSocket.send).toHaveBeenCalled();
        expect(result).toEqual(expect.objectContaining(mockResponse));
      });

      it('should handle message timeout', async () => {
        const mockData = { message: 'test' };

        const sendPromise = wsClient.send(mockData, { timeout: 100 });

        await expect(sendPromise).rejects.toThrow(/timeout/);
      });

      it('should handle connection not available', async () => {
        wsClient.isConnected = false;

        await expect(wsClient.send({ message: 'test' }))
          .rejects.toThrow('WebSocket not connected');
      });
    });

    describe('message handling', () => {
      beforeEach(async () => {
        const initPromise = wsClient.initialize();
        mockWebSocket.onopen();
        await initPromise;
      });

      it('should handle heartbeat messages', () => {
        const heartbeatMessage = {
          id: 'heartbeat-123',
          type: 'heartbeat',
          timestamp: new Date().toISOString()
        };

        mockWebSocket.onmessage({
          data: JSON.stringify(heartbeatMessage)
        });

        expect(mockWebSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('heartbeat_response')
        );
      });

      it('should handle notification messages', () => {
        const notificationHandler = jest.fn();
        wsClient.on('notification', notificationHandler);

        const notification = {
          id: 'notif-123',
          type: 'notification',
          payload: { message: 'test notification' }
        };

        mockWebSocket.onmessage({
          data: JSON.stringify(notification)
        });

        expect(notificationHandler).toHaveBeenCalledWith(notification);
      });

      it('should handle request messages with registered handler', async () => {
        const requestHandler = jest.fn().mockResolvedValue({ result: 'handled' });
        wsClient.onMessage('test_request', requestHandler);

        const request = {
          id: 'req-123',
          type: 'request',
          payload: { type: 'test_request', data: 'test' }
        };

        mockWebSocket.onmessage({
          data: JSON.stringify(request)
        });

        await new Promise(resolve => setTimeout(resolve, 10)); // Allow async handling

        expect(requestHandler).toHaveBeenCalledWith(request.payload, request);
        expect(mockWebSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('response')
        );
      });
    });

    describe('reconnection', () => {
      beforeEach(async () => {
        const initPromise = wsClient.initialize();
        mockWebSocket.onopen();
        await initPromise;
      });

      it('should attempt reconnection on disconnect', () => {
        jest.useFakeTimers();
        
        // Simulate disconnect
        mockWebSocket.onclose({ code: 1006, reason: 'Connection lost' });

        expect(wsClient.isConnected).toBe(false);
        expect(wsClient.isReconnecting).toBe(true);

        jest.useRealTimers();
      });

      it('should stop reconnecting after max attempts', () => {
        jest.useFakeTimers();
        
        wsClient.reconnectCount = wsClient.reconnectAttempts;
        
        // Simulate disconnect
        mockWebSocket.onclose({ code: 1006, reason: 'Connection lost' });

        expect(wsClient.isReconnecting).toBe(false);

        jest.useRealTimers();
      });
    });

    describe('getStatistics', () => {
      it('should return client statistics', () => {
        // Add some mock history
        wsClient.messageHistory.push(
          { type: 'sent', timestamp: new Date() },
          { type: 'received', timestamp: new Date() },
          { type: 'sent', timestamp: new Date() }
        );

        const stats = wsClient.getStatistics();

        expect(stats.is_connected).toBe(false); // Not connected in test
        expect(stats.total_messages).toBe(3);
        expect(stats.sent_messages).toBe(2);
        expect(stats.received_messages).toBe(1);
      });
    });

    describe('getHealth', () => {
      it('should return healthy status when connected', async () => {
        const initPromise = wsClient.initialize();
        mockWebSocket.onopen();
        await initPromise;

        const health = wsClient.getHealth();

        expect(health.status).toBe('healthy');
        expect(health.is_connected).toBe(true);
      });

      it('should return unhealthy status when not connected', () => {
        const health = wsClient.getHealth();

        expect(health.status).toBe('unhealthy');
        expect(health.is_connected).toBe(false);
      });
    });

    describe('shutdown', () => {
      beforeEach(async () => {
        const initPromise = wsClient.initialize();
        mockWebSocket.onopen();
        await initPromise;
      });

      it('should shutdown cleanly', async () => {
        await wsClient.shutdown();

        expect(mockWebSocket.close).toHaveBeenCalled();
        expect(wsClient.isInitialized).toBe(false);
        expect(wsClient.messageHandlers.size).toBe(0);
        expect(wsClient.eventListeners.size).toBe(0);
      });
    });
  });
});

