/**
 * AgentAPI Integration Tests
 * Integration tests for the complete AgentAPI middleware
 */

import { jest } from '@jest/globals';
import { AgentAPIMiddleware } from '../../../src/middleware/agentapi/index.js';

describe('AgentAPI Integration', () => {
    let middleware;

    beforeEach(() => {
        // Create middleware with test configuration
        middleware = new AgentAPIMiddleware({
            port: 0, // Use random available port
            host: 'localhost',
            maxSessions: 3,
            sessionTimeout: 30000,
            claudeCodePath: '/mock/claude',
            allowedTools: ['Bash(git*)', 'Edit'],
            storageType: 'memory'
        });
    });

    afterEach(async () => {
        if (middleware.isRunning) {
            await middleware.stop();
        }
    });

    describe('Middleware Lifecycle', () => {
        test('should initialize all components', async () => {
            await middleware.initialize();

            expect(middleware.server).toBeDefined();
            expect(middleware.claudeInterface).toBeDefined();
            expect(middleware.messageHandler).toBeDefined();
            expect(middleware.sessionManager).toBeDefined();
        });

        test('should start and stop middleware', async () => {
            // Mock Claude Code health check to avoid dependency
            jest.spyOn(middleware, 'performHealthChecks').mockResolvedValue();

            expect(middleware.isRunning).toBe(false);

            const startResult = await middleware.start();
            expect(middleware.isRunning).toBe(true);
            expect(startResult).toMatchObject({
                status: 'started',
                host: 'localhost',
                port: expect.any(Number),
                timestamp: expect.any(String)
            });

            await middleware.stop();
            expect(middleware.isRunning).toBe(false);
        });

        test('should restart middleware', async () => {
            jest.spyOn(middleware, 'performHealthChecks').mockResolvedValue();

            await middleware.start();
            expect(middleware.isRunning).toBe(true);

            await middleware.restart();
            expect(middleware.isRunning).toBe(true);
        });
    });

    describe('Component Integration', () => {
        beforeEach(async () => {
            jest.spyOn(middleware, 'performHealthChecks').mockResolvedValue();
            await middleware.initialize();
        });

        test('should wire components correctly', () => {
            // Check that message handler has access to Claude interface
            expect(typeof middleware.messageHandler.getClaudeInterface).toBe('function');
            expect(middleware.messageHandler.getClaudeInterface()).toBe(middleware.claudeInterface);
        });

        test('should forward events between components', (done) => {
            let eventCount = 0;
            const expectedEvents = 2;

            // Listen for events from server
            middleware.server.on('message', (event) => {
                expect(event).toMatchObject({
                    type: expect.any(String),
                    timestamp: expect.any(String)
                });
                eventCount++;
                if (eventCount === expectedEvents) done();
            });

            middleware.server.on('sessionUpdate', (event) => {
                expect(event).toMatchObject({
                    type: expect.any(String),
                    timestamp: expect.any(String)
                });
                eventCount++;
                if (eventCount === expectedEvents) done();
            });

            // Emit test events
            middleware.messageHandler.emit('message', {
                type: 'test_message',
                timestamp: new Date().toISOString()
            });

            middleware.sessionManager.emit('sessionUpdate', {
                type: 'test_session_update',
                timestamp: new Date().toISOString()
            });
        });
    });

    describe('Configuration Management', () => {
        test('should get middleware status', () => {
            const status = middleware.getStatus();

            expect(status).toMatchObject({
                running: false,
                startedAt: null,
                uptime: 0,
                config: {
                    host: 'localhost',
                    port: 0,
                    maxSessions: 3,
                    claudeCodePath: '/mock/claude',
                    allowedTools: ['Bash(git*)', 'Edit']
                },
                components: {
                    server: null,
                    sessions: null,
                    messages: null,
                    claude: 0
                }
            });
        });

        test('should update configuration', () => {
            const newConfig = {
                maxSessions: 5,
                sessionTimeout: 60000
            };

            middleware.updateConfig(newConfig);

            expect(middleware.config.maxSessions).toBe(5);
            expect(middleware.config.sessionTimeout).toBe(60000);
        });

        test('should get comprehensive statistics', async () => {
            jest.spyOn(middleware, 'performHealthChecks').mockResolvedValue();
            await middleware.initialize();

            const stats = middleware.getStats();

            expect(stats).toMatchObject({
                middleware: expect.any(Object),
                server: expect.any(Object),
                sessions: expect.any(Object),
                messages: expect.any(Object),
                claude: expect.any(Object),
                system: {
                    memory: expect.any(Object),
                    uptime: expect.any(Number),
                    platform: expect.any(String),
                    nodeVersion: expect.any(String)
                }
            });
        });
    });

    describe('Error Handling', () => {
        test('should handle initialization errors', async () => {
            // Mock a component to throw an error
            jest.spyOn(middleware, 'wireComponents').mockImplementation(() => {
                throw new Error('Component wiring failed');
            });

            await expect(middleware.initialize()).rejects.toThrow('Component wiring failed');
        });

        test('should handle start errors', async () => {
            // Mock server start to fail
            middleware.server = {
                start: jest.fn().mockRejectedValue(new Error('Port already in use'))
            };

            await expect(middleware.start()).rejects.toThrow('Port already in use');
            expect(middleware.isRunning).toBe(false);
        });

        test('should handle stop errors gracefully', async () => {
            jest.spyOn(middleware, 'performHealthChecks').mockResolvedValue();
            await middleware.start();

            // Mock server shutdown to fail
            middleware.server.shutdown = jest.fn().mockRejectedValue(new Error('Shutdown error'));

            await expect(middleware.stop()).rejects.toThrow('Shutdown error');
        });
    });

    describe('Health Checks', () => {
        test('should perform health checks', async () => {
            // Mock Claude interface health check
            middleware.claudeInterface = {
                healthCheck: jest.fn().mockResolvedValue({
                    available: true,
                    version: '1.0.0',
                    path: '/mock/claude'
                })
            };

            // Mock port availability check
            jest.spyOn(middleware, 'checkPortAvailability').mockResolvedValue();

            await middleware.performHealthChecks();

            expect(middleware.claudeInterface.healthCheck).toHaveBeenCalled();
        });

        test('should handle Claude Code unavailability', async () => {
            middleware.claudeInterface = {
                healthCheck: jest.fn().mockResolvedValue({
                    available: false,
                    error: 'Claude Code not found'
                })
            };

            jest.spyOn(middleware, 'checkPortAvailability').mockResolvedValue();
            jest.spyOn(console, 'warn').mockImplementation(() => {});

            await middleware.performHealthChecks();

            expect(console.warn).toHaveBeenCalledWith(
                'Claude Code health check failed:',
                'Claude Code not found'
            );
        });

        test('should handle port unavailability', async () => {
            middleware.claudeInterface = {
                healthCheck: jest.fn().mockResolvedValue({ available: true })
            };

            jest.spyOn(middleware, 'checkPortAvailability').mockRejectedValue(
                new Error('Port 3284 is already in use')
            );

            await expect(middleware.performHealthChecks()).rejects.toThrow(
                'Port 3284 is already in use'
            );
        });
    });
});

