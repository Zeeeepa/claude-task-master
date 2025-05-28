/**
 * @fileoverview Protocol Adapter Tests
 * @description Test suite for protocol adaptation functionality
 */

import { jest } from '@jest/globals';
import { ProtocolAdapter } from '../middleware/protocol_adapter.js';

// Mock dependencies
jest.mock('../utils/simple_logger.js', () => ({
  log: jest.fn()
}));

describe('ProtocolAdapter', () => {
  let adapter;
  let mockConfig;

  beforeEach(() => {
    mockConfig = {
      timeout: 30000,
      retryAttempts: 3
    };
    
    adapter = new ProtocolAdapter(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default protocols', () => {
      expect(adapter.protocolHandlers.size).toBeGreaterThan(0);
      expect(adapter.protocolHandlers.has('agentapi')).toBe(true);
      expect(adapter.protocolHandlers.has('claude_code')).toBe(true);
      expect(adapter.protocolHandlers.has('http_rest')).toBe(true);
      expect(adapter.protocolHandlers.has('websocket')).toBe(true);
    });
  });

  describe('protocol handlers', () => {
    describe('agentapi protocol', () => {
      let agentApiHandler;

      beforeEach(() => {
        agentApiHandler = adapter.protocolHandlers.get('agentapi');
      });

      it('should serialize data correctly', () => {
        const data = { type: 'test', message: 'hello' };
        const serialized = agentApiHandler.serialize(data);
        const parsed = JSON.parse(serialized);
        
        expect(parsed.type).toBe('test');
        expect(parsed.message).toBe('hello');
        expect(parsed.protocol_version).toBe('1.0.0');
        expect(parsed.timestamp).toBeDefined();
      });

      it('should deserialize data correctly', () => {
        const jsonString = '{"type":"test","message":"hello"}';
        const deserialized = agentApiHandler.deserialize(jsonString);
        
        expect(deserialized.type).toBe('test');
        expect(deserialized.message).toBe('hello');
      });

      it('should validate data correctly', () => {
        expect(agentApiHandler.validate({ type: 'test' })).toBe(true);
        expect(agentApiHandler.validate({})).toBe(false);
        expect(agentApiHandler.validate(null)).toBe(false);
      });
    });

    describe('claude_code protocol', () => {
      let claudeCodeHandler;

      beforeEach(() => {
        claudeCodeHandler = adapter.protocolHandlers.get('claude_code');
      });

      it('should serialize data correctly', () => {
        const data = { validationId: 'val-123', result: 'success' };
        const serialized = claudeCodeHandler.serialize(data);
        const parsed = JSON.parse(serialized);
        
        expect(parsed.validationId).toBe('val-123');
        expect(parsed.result).toBe('success');
        expect(parsed.claude_code_version).toBe('1.0.0');
        expect(parsed.processed_at).toBeDefined();
      });

      it('should validate data correctly', () => {
        expect(claudeCodeHandler.validate({ type: 'validation' })).toBe(true);
        expect(claudeCodeHandler.validate({ validationId: 'val-123' })).toBe(true);
        expect(claudeCodeHandler.validate({})).toBe(false);
      });
    });

    describe('http_rest protocol', () => {
      let httpHandler;

      beforeEach(() => {
        httpHandler = adapter.protocolHandlers.get('http_rest');
      });

      it('should format HTTP request correctly', () => {
        const data = { message: 'test' };
        const endpoint = '/api/test';
        const request = httpHandler.formatRequest(data, endpoint);
        
        expect(request.method).toBe('POST');
        expect(request.url).toBe(endpoint);
        expect(request.headers['Content-Type']).toBe('application/json');
        expect(request.body).toBe(JSON.stringify(data));
      });

      it('should format HTTP response correctly', () => {
        const response = { body: '{"result":"success"}' };
        const formatted = httpHandler.formatResponse(response);
        
        expect(formatted.result).toBe('success');
      });
    });

    describe('websocket protocol', () => {
      let wsHandler;

      beforeEach(() => {
        wsHandler = adapter.protocolHandlers.get('websocket');
      });

      it('should serialize with WebSocket metadata', () => {
        const data = { message: 'test' };
        const serialized = wsHandler.serialize(data);
        const parsed = JSON.parse(serialized);
        
        expect(parsed.message).toBe('test');
        expect(parsed.ws_message_id).toBeDefined();
        expect(parsed.timestamp).toBeDefined();
      });

      it('should format WebSocket message correctly', () => {
        const data = { content: 'test' };
        const message = wsHandler.formatMessage(data, 'notification');
        
        expect(message.type).toBe('notification');
        expect(message.payload).toEqual(data);
        expect(message.timestamp).toBeDefined();
      });
    });
  });

  describe('adaptProtocol', () => {
    it('should adapt between different protocols', async () => {
      const data = { type: 'test', message: 'hello' };
      
      const result = await adapter.adaptProtocol(data, 'agentapi', 'claude_code');
      
      expect(typeof result).toBe('string');
      const parsed = JSON.parse(result);
      expect(parsed.type).toBe('test');
      expect(parsed.message).toBe('hello');
      expect(parsed.claude_code_version).toBe('1.0.0');
    });

    it('should handle unknown source protocol', async () => {
      const data = { test: 'data' };
      
      await expect(adapter.adaptProtocol(data, 'unknown', 'agentapi'))
        .rejects.toThrow('Unknown source protocol: unknown');
    });

    it('should handle unknown target protocol', async () => {
      const data = { test: 'data' };
      
      await expect(adapter.adaptProtocol(data, 'agentapi', 'unknown'))
        .rejects.toThrow('Unknown target protocol: unknown');
    });

    it('should validate source data', async () => {
      const invalidData = {}; // Missing required fields
      
      await expect(adapter.adaptProtocol(invalidData, 'agentapi', 'claude_code'))
        .rejects.toThrow('Invalid data for protocol agentapi');
    });
  });

  describe('serialize and deserialize', () => {
    it('should serialize data for specific protocol', () => {
      const data = { type: 'test', value: 123 };
      
      const serialized = adapter.serialize(data, 'agentapi');
      
      expect(typeof serialized).toBe('string');
      const parsed = JSON.parse(serialized);
      expect(parsed.type).toBe('test');
      expect(parsed.value).toBe(123);
    });

    it('should deserialize data from specific protocol', () => {
      const jsonString = '{"type":"test","value":123}';
      
      const deserialized = adapter.deserialize(jsonString, 'agentapi');
      
      expect(deserialized.type).toBe('test');
      expect(deserialized.value).toBe(123);
    });

    it('should handle unknown protocol in serialize', () => {
      const data = { test: 'data' };
      
      expect(() => adapter.serialize(data, 'unknown'))
        .toThrow('Unknown protocol: unknown');
    });

    it('should handle unknown protocol in deserialize', () => {
      const data = '{"test":"data"}';
      
      expect(() => adapter.deserialize(data, 'unknown'))
        .toThrow('Unknown protocol: unknown');
    });
  });

  describe('validate', () => {
    it('should validate data for specific protocol', () => {
      const validData = { type: 'test' };
      const invalidData = {};
      
      expect(adapter.validate(validData, 'agentapi')).toBe(true);
      expect(adapter.validate(invalidData, 'agentapi')).toBe(false);
    });

    it('should handle unknown protocol in validate', () => {
      const data = { test: 'data' };
      
      expect(() => adapter.validate(data, 'unknown'))
        .toThrow('Unknown protocol: unknown');
    });
  });

  describe('formatHttpRequest', () => {
    it('should format HTTP request with default settings', () => {
      const data = { message: 'test' };
      const endpoint = '/api/endpoint';
      
      const request = adapter.formatHttpRequest(data, endpoint);
      
      expect(request.method).toBe('POST');
      expect(request.url).toBe(endpoint);
      expect(request.headers['Content-Type']).toBe('application/json');
      expect(request.body).toBe(JSON.stringify(data));
    });
  });

  describe('formatWebSocketMessage', () => {
    it('should format WebSocket message with default type', () => {
      const data = { content: 'test' };
      
      const message = adapter.formatWebSocketMessage(data);
      
      expect(message.type).toBe('data');
      expect(message.payload).toEqual(data);
    });

    it('should format WebSocket message with custom type', () => {
      const data = { content: 'test' };
      
      const message = adapter.formatWebSocketMessage(data, 'notification');
      
      expect(message.type).toBe('notification');
      expect(message.payload).toEqual(data);
    });
  });

  describe('protocol management', () => {
    it('should add custom protocol handler', () => {
      const customHandler = {
        serialize: jest.fn(),
        deserialize: jest.fn(),
        validate: jest.fn()
      };
      
      adapter.addProtocolHandler('custom', customHandler);
      
      expect(adapter.protocolHandlers.has('custom')).toBe(true);
      expect(adapter.protocolHandlers.get('custom')).toBe(customHandler);
    });

    it('should reject invalid protocol handler', () => {
      const invalidHandler = { serialize: jest.fn() }; // Missing deserialize and validate
      
      expect(() => adapter.addProtocolHandler('invalid', invalidHandler))
        .toThrow('Protocol handler must have serialize, deserialize, and validate methods');
    });

    it('should remove protocol handler', () => {
      const result = adapter.removeProtocolHandler('agentapi');
      
      expect(result).toBe(true);
      expect(adapter.protocolHandlers.has('agentapi')).toBe(false);
    });

    it('should return false when removing non-existent handler', () => {
      const result = adapter.removeProtocolHandler('nonexistent');
      
      expect(result).toBe(false);
    });

    it('should get protocol handler', () => {
      const handler = adapter.getProtocolHandler('agentapi');
      
      expect(handler).toBeDefined();
      expect(handler.serialize).toBeDefined();
      expect(handler.deserialize).toBeDefined();
      expect(handler.validate).toBeDefined();
    });

    it('should return null for non-existent protocol handler', () => {
      const handler = adapter.getProtocolHandler('nonexistent');
      
      expect(handler).toBeNull();
    });

    it('should list all protocols', () => {
      const protocols = adapter.listProtocols();
      
      expect(protocols).toContain('agentapi');
      expect(protocols).toContain('claude_code');
      expect(protocols).toContain('http_rest');
      expect(protocols).toContain('websocket');
    });

    it('should get protocol information', () => {
      const info = adapter.getProtocolInfo('agentapi');
      
      expect(info.id).toBe('agentapi');
      expect(info.name).toBeDefined();
      expect(info.version).toBeDefined();
      expect(info.contentType).toBeDefined();
    });

    it('should return null for non-existent protocol info', () => {
      const info = adapter.getProtocolInfo('nonexistent');
      
      expect(info).toBeNull();
    });
  });

  describe('getStatistics', () => {
    it('should return adapter statistics', () => {
      const stats = adapter.getStatistics();
      
      expect(stats.total_protocols).toBeGreaterThan(0);
      expect(stats.available_protocols).toBeInstanceOf(Array);
      expect(stats.available_protocols.length).toBe(stats.total_protocols);
    });
  });

  describe('getHealth', () => {
    it('should return healthy status with all default protocols', () => {
      const health = adapter.getHealth();
      
      expect(health.status).toBe('healthy');
      expect(health.protocols_loaded).toBeGreaterThan(0);
      expect(health.default_protocols_available).toBe(true);
    });

    it('should return unhealthy status when default protocols are missing', () => {
      adapter.removeProtocolHandler('agentapi');
      
      const health = adapter.getHealth();
      
      expect(health.default_protocols_available).toBe(false);
    });
  });
});

