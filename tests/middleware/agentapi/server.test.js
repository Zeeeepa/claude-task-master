/**
 * AgentAPI Server Tests
 * Unit tests for the AgentAPI server component
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import { AgentAPIServer } from '../../../src/middleware/agentapi/server.js';

describe('AgentAPIServer', () => {
    let server;
    let app;

    beforeEach(async () => {
        // Create server with test configuration
        server = new AgentAPIServer({
            port: 0, // Use random available port
            host: 'localhost',
            maxSessions: 5,
            sessionTimeout: 60000,
            claudeCodePath: '/mock/claude',
            allowedTools: ['Bash(git*)', 'Edit']
        });

        // Mock dependencies
        server.sessionManager = {
            getActiveSessions: jest.fn(() => []),
            getSession: jest.fn(),
            createSession: jest.fn(),
            attachClient: jest.fn(),
            detachClient: jest.fn()
        };

        server.messageHandler = {
            sendMessage: jest.fn(),
            getMessages: jest.fn(() => []),
            on: jest.fn(),
            removeListener: jest.fn()
        };

        server.claudeInterface = {
            on: jest.fn()
        };

        app = server.app;
    });

    afterEach(async () => {
        if (server.isRunning) {
            await server.shutdown();
        }
    });

    describe('Health Check', () => {
        test('should return health status', async () => {
            const response = await request(app)
                .get('/health')
                .expect(200);

            expect(response.body).toMatchObject({
                status: 'healthy',
                timestamp: expect.any(String),
                uptime: expect.any(Number),
                sessions: 0
            });
        });
    });

    describe('Status Endpoint', () => {
        test('should return server status', async () => {
            const response = await request(app)
                .get('/status')
                .expect(200);

            expect(response.body).toMatchObject({
                server: {
                    running: false,
                    uptime: expect.any(Number),
                    connections: 0
                },
                sessions: [],
                config: {
                    maxSessions: 5,
                    sessionTimeout: 60000,
                    allowedTools: ['Bash(git*)', 'Edit']
                }
            });
        });
    });

    describe('Message Endpoint', () => {
        test('should reject message without sessionId', async () => {
            const response = await request(app)
                .post('/message')
                .send({ message: 'test message' })
                .expect(400);

            expect(response.body).toMatchObject({
                error: 'Missing required fields: sessionId, message'
            });
        });

        test('should reject message without message content', async () => {
            const response = await request(app)
                .post('/message')
                .send({ sessionId: 'test-session' })
                .expect(400);

            expect(response.body).toMatchObject({
                error: 'Missing required fields: sessionId, message'
            });
        });

        test('should return 404 for non-existent session', async () => {
            server.sessionManager.getSession.mockResolvedValue(null);

            const response = await request(app)
                .post('/message')
                .send({ 
                    sessionId: 'non-existent-session',
                    message: 'test message'
                })
                .expect(404);

            expect(response.body).toMatchObject({
                error: 'Session not found'
            });
        });

        test('should send message successfully', async () => {
            const mockSession = { id: 'test-session', status: 'active' };
            const mockResult = { messageId: 'msg-123' };

            server.sessionManager.getSession.mockResolvedValue(mockSession);
            server.messageHandler.sendMessage.mockResolvedValue(mockResult);

            const response = await request(app)
                .post('/message')
                .send({
                    sessionId: 'test-session',
                    message: 'test message'
                })
                .expect(200);

            expect(response.body).toMatchObject({
                success: true,
                messageId: 'msg-123',
                sessionId: 'test-session',
                timestamp: expect.any(String)
            });

            expect(server.messageHandler.sendMessage).toHaveBeenCalledWith(
                'test-session',
                'test message',
                {}
            );
        });
    });

    describe('Session Attachment', () => {
        test('should reject attachment without clientId', async () => {
            const response = await request(app)
                .post('/attach')
                .send({})
                .expect(400);

            expect(response.body).toMatchObject({
                error: 'Missing required field: clientId'
            });
        });

        test('should create new session when no sessionId provided', async () => {
            const mockSession = { 
                id: 'new-session',
                status: 'active'
            };

            server.sessionManager.createSession.mockResolvedValue(mockSession);
            server.sessionManager.attachClient.mockResolvedValue();

            const response = await request(app)
                .post('/attach')
                .send({ clientId: 'test-client' })
                .expect(200);

            expect(response.body).toMatchObject({
                success: true,
                sessionId: 'new-session',
                status: 'active',
                timestamp: expect.any(String)
            });

            expect(server.sessionManager.createSession).toHaveBeenCalledWith({
                clientId: 'test-client',
                claudeCodePath: '/mock/claude',
                allowedTools: ['Bash(git*)', 'Edit']
            });
        });

        test('should attach to existing session', async () => {
            const mockSession = { 
                id: 'existing-session',
                status: 'active'
            };

            server.sessionManager.getSession.mockResolvedValue(mockSession);
            server.sessionManager.attachClient.mockResolvedValue();

            const response = await request(app)
                .post('/attach')
                .send({ 
                    sessionId: 'existing-session',
                    clientId: 'test-client'
                })
                .expect(200);

            expect(response.body).toMatchObject({
                success: true,
                sessionId: 'existing-session',
                status: 'active'
            });

            expect(server.sessionManager.attachClient).toHaveBeenCalledWith(
                'existing-session',
                'test-client'
            );
        });
    });

    describe('Session Detachment', () => {
        test('should reject detachment without required fields', async () => {
            const response = await request(app)
                .post('/detach')
                .send({ sessionId: 'test-session' })
                .expect(400);

            expect(response.body).toMatchObject({
                error: 'Missing required fields: sessionId, clientId'
            });
        });

        test('should detach from session successfully', async () => {
            server.sessionManager.detachClient.mockResolvedValue();

            const response = await request(app)
                .post('/detach')
                .send({
                    sessionId: 'test-session',
                    clientId: 'test-client'
                })
                .expect(200);

            expect(response.body).toMatchObject({
                success: true,
                sessionId: 'test-session',
                timestamp: expect.any(String)
            });

            expect(server.sessionManager.detachClient).toHaveBeenCalledWith(
                'test-session',
                'test-client'
            );
        });
    });

    describe('Messages Retrieval', () => {
        test('should return 404 for non-existent session', async () => {
            server.sessionManager.getSession.mockResolvedValue(null);

            const response = await request(app)
                .get('/messages/non-existent-session')
                .expect(404);

            expect(response.body).toMatchObject({
                error: 'Session not found'
            });
        });

        test('should return messages for existing session', async () => {
            const mockSession = { id: 'test-session' };
            const mockMessages = [
                { id: 'msg-1', content: 'Hello', timestamp: '2023-01-01T00:00:00Z' },
                { id: 'msg-2', content: 'World', timestamp: '2023-01-01T00:01:00Z' }
            ];

            server.sessionManager.getSession.mockResolvedValue(mockSession);
            server.messageHandler.getMessages.mockResolvedValue(mockMessages);

            const response = await request(app)
                .get('/messages/test-session')
                .expect(200);

            expect(response.body).toMatchObject({
                sessionId: 'test-session',
                messages: mockMessages,
                total: 2,
                limit: 50,
                offset: 0
            });

            expect(server.messageHandler.getMessages).toHaveBeenCalledWith(
                'test-session',
                { limit: 50, offset: 0 }
            );
        });

        test('should handle pagination parameters', async () => {
            const mockSession = { id: 'test-session' };
            const mockMessages = [];

            server.sessionManager.getSession.mockResolvedValue(mockSession);
            server.messageHandler.getMessages.mockResolvedValue(mockMessages);

            const response = await request(app)
                .get('/messages/test-session?limit=10&offset=20')
                .expect(200);

            expect(response.body).toMatchObject({
                limit: 10,
                offset: 20
            });

            expect(server.messageHandler.getMessages).toHaveBeenCalledWith(
                'test-session',
                { limit: 10, offset: 20 }
            );
        });
    });

    describe('Error Handling', () => {
        test('should handle 404 for unknown endpoints', async () => {
            const response = await request(app)
                .get('/unknown-endpoint')
                .expect(404);

            expect(response.body).toMatchObject({
                error: 'Endpoint not found',
                path: '/unknown-endpoint',
                method: 'GET'
            });
        });

        test('should handle internal server errors', async () => {
            server.sessionManager.getSession.mockRejectedValue(new Error('Database error'));

            const response = await request(app)
                .post('/message')
                .send({
                    sessionId: 'test-session',
                    message: 'test message'
                })
                .expect(500);

            expect(response.body).toMatchObject({
                error: 'Failed to send message',
                details: 'Database error'
            });
        });
    });

    describe('Server Lifecycle', () => {
        test('should start and stop server', async () => {
            expect(server.isRunning).toBe(false);

            await server.start();
            expect(server.isRunning).toBe(true);

            await server.shutdown();
            expect(server.isRunning).toBe(false);
        });

        test('should get server statistics', () => {
            const stats = server.getStats();

            expect(stats).toMatchObject({
                uptime: expect.any(Number),
                connections: 0,
                sessions: 0,
                memory: expect.any(Object),
                config: expect.any(Object)
            });
        });
    });
});

