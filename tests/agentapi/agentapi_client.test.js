/**
 * @fileoverview AgentAPI Client Tests
 * @description Comprehensive tests for AgentAPI client functionality
 */

import { jest } from '@jest/globals';
import axios from 'axios';
import { AgentAPIClient } from '../../src/ai_cicd_system/core/agentapi_client.js';
import { DEFAULT_AGENTAPI_CONFIG } from '../../src/ai_cicd_system/config/agentapi_config.js';

// Mock axios
jest.mock('axios');
const mockedAxios = axios;

describe('AgentAPIClient', () => {
    let client;
    let mockAxiosInstance;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();
        
        // Mock axios.create
        mockAxiosInstance = {
            request: jest.fn(),
            interceptors: {
                request: { use: jest.fn() },
                response: { use: jest.fn() }
            }
        };
        mockedAxios.create.mockReturnValue(mockAxiosInstance);
        
        // Create client with test config
        client = new AgentAPIClient({
            baseURL: 'http://localhost:3284',
            timeout: 5000,
            retries: 1,
            healthCheckInterval: 1000
        });
    });

    afterEach(async () => {
        if (client) {
            await client.shutdown();
        }
    });

    describe('Constructor', () => {
        test('should initialize with default config', () => {
            const defaultClient = new AgentAPIClient();
            expect(defaultClient.config.baseURL).toBe(DEFAULT_AGENTAPI_CONFIG.baseURL);
            expect(defaultClient.config.timeout).toBe(DEFAULT_AGENTAPI_CONFIG.timeout);
        });

        test('should merge custom config with defaults', () => {
            const customConfig = {
                baseURL: 'http://custom:3284',
                timeout: 10000
            };
            const customClient = new AgentAPIClient(customConfig);
            
            expect(customClient.config.baseURL).toBe('http://custom:3284');
            expect(customClient.config.timeout).toBe(10000);
            expect(customClient.config.retries).toBe(DEFAULT_AGENTAPI_CONFIG.retries);
        });

        test('should throw error for invalid config', () => {
            expect(() => {
                new AgentAPIClient({ baseURL: 'invalid-url' });
            }).toThrow('Invalid AgentAPI configuration');
        });
    });

    describe('Session Management', () => {
        test('should start Claude Code session successfully', async () => {
            const mockResponse = { sessionId: 'test-session-123' };
            mockAxiosInstance.request.mockResolvedValue({ data: mockResponse });

            const sessionId = await client.startClaudeCodeSession({
                workingDirectory: '/tmp/test',
                args: ['--test']
            });

            expect(sessionId).toBe('test-session-123');
            expect(mockAxiosInstance.request).toHaveBeenCalledWith({
                method: 'POST',
                url: '/session/start',
                data: {
                    agent: 'claude',
                    args: ['--test'],
                    workingDirectory: '/tmp/test',
                    environment: expect.any(Object)
                }
            });
            expect(client.activeSessions.has('test-session-123')).toBe(true);
        });

        test('should handle session start failure', async () => {
            mockAxiosInstance.request.mockRejectedValue(new Error('Connection failed'));

            await expect(client.startClaudeCodeSession()).rejects.toThrow(
                'Failed to start Claude Code session: Connection failed'
            );
        });

        test('should send message to session', async () => {
            // First start a session
            mockAxiosInstance.request.mockResolvedValueOnce({ 
                data: { sessionId: 'test-session-123' } 
            });
            const sessionId = await client.startClaudeCodeSession();

            // Then send a message
            const mockMessageResponse = { success: true };
            mockAxiosInstance.request.mockResolvedValueOnce({ 
                data: mockMessageResponse 
            });

            const result = await client.sendMessage(sessionId, 'Hello Claude');

            expect(result).toEqual(mockMessageResponse);
            expect(mockAxiosInstance.request).toHaveBeenLastCalledWith({
                method: 'POST',
                url: '/session/test-session-123/message',
                data: {
                    content: 'Hello Claude',
                    type: 'user'
                }
            });
        });

        test('should reject message to non-existent session', async () => {
            await expect(client.sendMessage('invalid-session', 'test')).rejects.toThrow(
                'Session invalid-session not found or inactive'
            );
        });

        test('should get session messages', async () => {
            // Start session
            mockAxiosInstance.request.mockResolvedValueOnce({ 
                data: { sessionId: 'test-session-123' } 
            });
            const sessionId = await client.startClaudeCodeSession();

            // Get messages
            const mockMessages = [
                { type: 'user', content: 'Hello' },
                { type: 'agent', content: 'Hi there!' }
            ];
            mockAxiosInstance.request.mockResolvedValueOnce({ 
                data: mockMessages 
            });

            const messages = await client.getMessages(sessionId);

            expect(messages).toEqual(mockMessages);
            expect(mockAxiosInstance.request).toHaveBeenLastCalledWith({
                method: 'GET',
                url: '/session/test-session-123/messages',
                data: null
            });
        });

        test('should get session status', async () => {
            // Start session
            mockAxiosInstance.request.mockResolvedValueOnce({ 
                data: { sessionId: 'test-session-123' } 
            });
            const sessionId = await client.startClaudeCodeSession();

            // Get status
            const mockStatus = { status: 'running' };
            mockAxiosInstance.request.mockResolvedValueOnce({ 
                data: mockStatus 
            });

            const status = await client.getSessionStatus(sessionId);

            expect(status).toEqual(mockStatus);
            expect(client.activeSessions.get(sessionId).status).toBe('running');
        });

        test('should stop session', async () => {
            // Start session
            mockAxiosInstance.request.mockResolvedValueOnce({ 
                data: { sessionId: 'test-session-123' } 
            });
            const sessionId = await client.startClaudeCodeSession();

            // Stop session
            mockAxiosInstance.request.mockResolvedValueOnce({ data: { success: true } });

            await client.stopSession(sessionId);

            expect(mockAxiosInstance.request).toHaveBeenLastCalledWith({
                method: 'POST',
                url: '/session/test-session-123/stop'
            });
            expect(client.activeSessions.has(sessionId)).toBe(false);
        });
    });

    describe('Health Monitoring', () => {
        test('should perform health check', async () => {
            const mockHealthResponse = { status: 'healthy', version: '1.0.0' };
            mockAxiosInstance.request.mockResolvedValue({ data: mockHealthResponse });

            const health = await client.checkHealth();

            expect(health).toEqual(mockHealthResponse);
            expect(client.isHealthy).toBe(true);
            expect(mockAxiosInstance.request).toHaveBeenCalledWith({
                method: 'GET',
                url: '/health',
                data: null,
                timeout: client.config.healthCheckTimeout
            });
        });

        test('should handle health check failure', async () => {
            mockAxiosInstance.request.mockRejectedValue(new Error('Health check failed'));

            await expect(client.checkHealth()).rejects.toThrow('Health check failed');
            expect(client.isHealthy).toBe(false);
        });

        test('should emit health check events', async () => {
            const passedHandler = jest.fn();
            const failedHandler = jest.fn();
            
            client.on('healthCheckPassed', passedHandler);
            client.on('healthCheckFailed', failedHandler);

            // Successful health check
            mockAxiosInstance.request.mockResolvedValueOnce({ 
                data: { status: 'healthy' } 
            });
            await client.checkHealth();
            expect(passedHandler).toHaveBeenCalled();

            // Failed health check
            mockAxiosInstance.request.mockRejectedValueOnce(new Error('Failed'));
            await expect(client.checkHealth()).rejects.toThrow();
            expect(failedHandler).toHaveBeenCalled();
        });
    });

    describe('Circuit Breaker', () => {
        test('should open circuit breaker after threshold failures', async () => {
            const error = new Error('Request failed');
            
            // Configure low threshold for testing
            client.config.errorHandling.circuitBreakerThreshold = 2;
            
            // Simulate failures
            mockAxiosInstance.request.mockRejectedValue(error);
            
            await expect(client.makeRequest('GET', '/test')).rejects.toThrow();
            await expect(client.makeRequest('GET', '/test')).rejects.toThrow();
            
            // Circuit breaker should now be open
            expect(client.circuitBreaker.state).toBe('open');
            
            // Next request should be rejected immediately
            await expect(client.makeRequest('GET', '/test')).rejects.toThrow(
                'Circuit breaker is open'
            );
        });

        test('should reset circuit breaker on successful request', async () => {
            // Open circuit breaker
            client.circuitBreaker.state = 'open';
            client.circuitBreaker.failures = 5;
            
            // Successful request should reset it
            mockAxiosInstance.request.mockResolvedValue({ data: { success: true } });
            
            // Move to half-open first
            client.circuitBreaker.state = 'half-open';
            
            await client.makeRequest('GET', '/test');
            
            expect(client.circuitBreaker.state).toBe('closed');
            expect(client.circuitBreaker.failures).toBe(0);
        });
    });

    describe('Retry Logic', () => {
        test('should retry failed requests', async () => {
            const error = new Error('Temporary failure');
            
            // First call fails, second succeeds
            mockAxiosInstance.request
                .mockRejectedValueOnce(error)
                .mockResolvedValueOnce({ data: { success: true } });

            const result = await client.makeRequest('GET', '/test', null, { retries: 1 });

            expect(result).toEqual({ success: true });
            expect(mockAxiosInstance.request).toHaveBeenCalledTimes(2);
        });

        test('should fail after max retries', async () => {
            const error = new Error('Persistent failure');
            mockAxiosInstance.request.mockRejectedValue(error);

            await expect(client.makeRequest('GET', '/test', null, { retries: 1 }))
                .rejects.toThrow('Persistent failure');
            
            expect(mockAxiosInstance.request).toHaveBeenCalledTimes(2); // Initial + 1 retry
        });
    });

    describe('Status and Metrics', () => {
        test('should return client status', () => {
            const status = client.getStatus();

            expect(status).toMatchObject({
                isHealthy: expect.any(Boolean),
                activeSessions: expect.any(Number),
                circuitBreaker: {
                    state: expect.any(String),
                    failures: expect.any(Number)
                },
                config: {
                    baseURL: expect.any(String),
                    timeout: expect.any(Number),
                    retries: expect.any(Number)
                }
            });
        });

        test('should track active sessions', async () => {
            mockAxiosInstance.request.mockResolvedValue({ 
                data: { sessionId: 'test-session-123' } 
            });

            expect(client.getStatus().activeSessions).toBe(0);

            await client.startClaudeCodeSession();
            expect(client.getStatus().activeSessions).toBe(1);

            mockAxiosInstance.request.mockResolvedValue({ data: { success: true } });
            await client.stopSession('test-session-123');
            expect(client.getStatus().activeSessions).toBe(0);
        });
    });

    describe('Session Cleanup', () => {
        test('should cleanup expired sessions', async () => {
            // Start a session
            mockAxiosInstance.request.mockResolvedValue({ 
                data: { sessionId: 'test-session-123' } 
            });
            const sessionId = await client.startClaudeCodeSession();

            // Manually set old timestamp to simulate expiration
            const session = client.activeSessions.get(sessionId);
            session.lastActivity = new Date(Date.now() - client.config.sessionTimeout - 1000);

            // Mock stop session call
            mockAxiosInstance.request.mockResolvedValue({ data: { success: true } });

            // Run cleanup
            client.cleanupExpiredSessions();

            // Wait a bit for async cleanup
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(client.activeSessions.has(sessionId)).toBe(false);
        });
    });

    describe('Shutdown', () => {
        test('should shutdown gracefully', async () => {
            // Start a session
            mockAxiosInstance.request.mockResolvedValue({ 
                data: { sessionId: 'test-session-123' } 
            });
            await client.startClaudeCodeSession();

            // Mock stop session
            mockAxiosInstance.request.mockResolvedValue({ data: { success: true } });

            await client.shutdown();

            expect(client.activeSessions.size).toBe(0);
            expect(client.healthCheckInterval).toBeNull();
        });
    });
});

