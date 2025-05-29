/**
 * @fileoverview Claude Code Integration Tests
 * @description Test suite for Claude Code integration components
 */

import { jest } from '@jest/globals';
import { 
    ClaudeCodeIntegration,
    AgentAPIClient,
    AuthManager,
    ClaudeCodeExecutor,
    WorkspaceManager,
    quickSetup
} from '../index.js';

// Mock external dependencies
jest.mock('eventsource');
jest.mock('child_process');
jest.mock('fs/promises');

describe('ClaudeCodeIntegration', () => {
    let integration;

    beforeEach(() => {
        integration = new ClaudeCodeIntegration({
            environment: 'test',
            agentAPI: {
                baseURL: 'http://localhost:3284'
            }
        });
    });

    afterEach(async () => {
        if (integration.isInitialized) {
            await integration.shutdown();
        }
    });

    describe('Initialization', () => {
        it('should initialize successfully', async () => {
            // Mock successful initialization
            jest.spyOn(integration, '_setupEventForwarding').mockImplementation(() => {});
            
            const mockExecutor = {
                initialize: jest.fn().mockResolvedValue(true)
            };
            const mockWorkspaceManager = {
                initialize: jest.fn().mockResolvedValue(true)
            };
            
            integration.executor = mockExecutor;
            integration.workspaceManager = mockWorkspaceManager;

            await integration.initialize();

            expect(integration.isInitialized).toBe(true);
            expect(mockExecutor.initialize).toHaveBeenCalled();
            expect(mockWorkspaceManager.initialize).toHaveBeenCalled();
        });

        it('should handle initialization failure', async () => {
            const mockExecutor = {
                initialize: jest.fn().mockRejectedValue(new Error('Initialization failed'))
            };
            
            integration.executor = mockExecutor;

            await expect(integration.initialize()).rejects.toThrow('Initialization failed');
            expect(integration.isInitialized).toBe(false);
        });
    });

    describe('Task Execution', () => {
        beforeEach(async () => {
            // Mock successful initialization
            jest.spyOn(integration, '_setupEventForwarding').mockImplementation(() => {});
            
            integration.executor = {
                initialize: jest.fn().mockResolvedValue(true),
                executeTask: jest.fn().mockResolvedValue({
                    executionId: 'test-exec-123',
                    status: 'running'
                }),
                getExecutionStatus: jest.fn().mockResolvedValue({
                    status: 'completed'
                }),
                getExecutionResults: jest.fn().mockResolvedValue({
                    summary: 'Task completed successfully',
                    filesModified: ['test.js'],
                    commandsExecuted: ['npm test']
                })
            };
            
            integration.workspaceManager = {
                initialize: jest.fn().mockResolvedValue(true),
                createWorkspace: jest.fn().mockResolvedValue({
                    taskId: 'test-task',
                    path: '/tmp/workspace/test-task',
                    status: 'ready'
                }),
                cleanupWorkspace: jest.fn().mockResolvedValue(true)
            };

            await integration.initialize();
        });

        it('should execute task successfully', async () => {
            const task = {
                id: 'test-001',
                title: 'Test task',
                description: 'A test task',
                type: 'test'
            };

            const result = await integration.executeTask(task, {
                waitForCompletion: false,
                createWorkspace: false
            });

            expect(result.executionId).toBeDefined();
            expect(result.task).toEqual(task);
            expect(result.completed).toBe(false);
            expect(integration.executor.executeTask).toHaveBeenCalledWith(task, expect.any(String));
        });

        it('should execute task with workspace', async () => {
            const task = {
                id: 'test-002',
                title: 'Test task with workspace',
                description: 'A test task requiring workspace',
                type: 'test'
            };

            const result = await integration.executeTask(task, {
                waitForCompletion: false,
                createWorkspace: true,
                repository: 'https://github.com/test/repo.git'
            });

            expect(result.workspace).toBeDefined();
            expect(integration.workspaceManager.createWorkspace).toHaveBeenCalled();
        });

        it('should handle task execution failure', async () => {
            integration.executor.executeTask.mockRejectedValue(new Error('Execution failed'));

            const task = {
                id: 'test-003',
                title: 'Failing task',
                description: 'A task that will fail',
                type: 'test'
            };

            await expect(integration.executeTask(task)).rejects.toThrow('Execution failed');
        });
    });

    describe('System Status', () => {
        it('should return system status', () => {
            const status = integration.getSystemStatus();

            expect(status).toHaveProperty('initialized');
            expect(status).toHaveProperty('timestamp');
            expect(status.initialized).toBe(false); // Not initialized in this test
        });
    });
});

describe('AgentAPIClient', () => {
    let client;

    beforeEach(() => {
        client = new AgentAPIClient({
            baseURL: 'http://localhost:3284',
            timeout: 5000
        });
    });

    afterEach(() => {
        if (client.isConnected) {
            client.disconnect();
        }
    });

    describe('Connection', () => {
        it('should create client with default config', () => {
            expect(client.config.baseURL).toBe('http://localhost:3284');
            expect(client.config.timeout).toBe(5000);
            expect(client.isConnected).toBe(false);
        });

        it('should return connection status', () => {
            const status = client.getConnectionStatus();

            expect(status).toHaveProperty('connected');
            expect(status).toHaveProperty('activeRequests');
            expect(status).toHaveProperty('queuedRequests');
            expect(status.connected).toBe(false);
        });
    });

    describe('Request Generation', () => {
        it('should generate unique request IDs', () => {
            const id1 = client._generateRequestId();
            const id2 = client._generateRequestId();

            expect(id1).toMatch(/^req_\d+_[a-z0-9]+$/);
            expect(id2).toMatch(/^req_\d+_[a-z0-9]+$/);
            expect(id1).not.toBe(id2);
        });

        it('should generate unique execution IDs', () => {
            const id1 = client._generateExecutionId();
            const id2 = client._generateExecutionId();

            expect(id1).toMatch(/^exec_\d+_[a-z0-9]+$/);
            expect(id2).toMatch(/^exec_\d+_[a-z0-9]+$/);
            expect(id1).not.toBe(id2);
        });
    });
});

describe('AuthManager', () => {
    let authManager;

    beforeEach(() => {
        authManager = new AuthManager({
            jwtSecret: 'test-secret',
            apiKeyLength: 16
        });
    });

    describe('API Key Management', () => {
        it('should generate API key', () => {
            const apiKey = authManager.generateApiKey('user-123', {
                permissions: ['read', 'write'],
                description: 'Test API key'
            });

            expect(apiKey).toHaveProperty('key');
            expect(apiKey).toHaveProperty('keyId');
            expect(apiKey).toHaveProperty('permissions');
            expect(apiKey.permissions).toEqual(['read', 'write']);
            expect(apiKey.key).toHaveLength(32); // 16 bytes = 32 hex chars
        });

        it('should validate API key', async () => {
            const apiKey = authManager.generateApiKey('user-123', {
                permissions: ['read']
            });

            const validation = await authManager.validateApiKey(apiKey.key);

            expect(validation.isValid).toBe(true);
            expect(validation.userId).toBe('user-123');
            expect(validation.permissions).toEqual(['read']);
        });

        it('should reject invalid API key', async () => {
            await expect(authManager.validateApiKey('invalid-key'))
                .rejects.toThrow('Invalid API key');
        });

        it('should revoke API key', () => {
            const apiKey = authManager.generateApiKey('user-123');
            const revoked = authManager.revokeApiKey(apiKey.key, 'Test revocation');

            expect(revoked).toBe(true);
            
            // Should reject revoked key
            expect(authManager.validateApiKey(apiKey.key))
                .rejects.toThrow('API key is inactive');
        });
    });

    describe('JWT Token Management', () => {
        it('should generate JWT token', () => {
            const tokenResult = authManager.generateJWTToken('user-123', ['read', 'write']);

            expect(tokenResult).toHaveProperty('token');
            expect(tokenResult).toHaveProperty('expiresAt');
            expect(tokenResult).toHaveProperty('permissions');
            expect(tokenResult.permissions).toEqual(['read', 'write']);
        });

        it('should validate JWT token', async () => {
            const tokenResult = authManager.generateJWTToken('user-123', ['read']);
            const validation = await authManager.validateJWTToken(tokenResult.token);

            expect(validation.isValid).toBe(true);
            expect(validation.userId).toBe('user-123');
            expect(validation.permissions).toEqual(['read']);
        });

        it('should reject invalid JWT token', async () => {
            await expect(authManager.validateJWTToken('invalid.jwt.token'))
                .rejects.toThrow('Invalid JWT token');
        });
    });

    describe('Permission Checking', () => {
        it('should check permissions correctly', () => {
            expect(authManager.hasPermission(['read', 'write'], 'read')).toBe(true);
            expect(authManager.hasPermission(['read'], 'write')).toBe(false);
            expect(authManager.hasPermission(['admin'], 'write')).toBe(true); // admin has all permissions
        });
    });

    describe('Statistics', () => {
        it('should return auth statistics', () => {
            authManager.generateApiKey('user-1');
            authManager.generateApiKey('user-2');
            authManager.generateJWTToken('user-1', ['read']);

            const stats = authManager.getAuthStats();

            expect(stats.activeApiKeys).toBe(2);
            expect(stats.activeJWTTokens).toBe(1);
            expect(stats.totalApiKeys).toBe(2);
            expect(stats.totalJWTTokens).toBe(1);
        });
    });
});

describe('Quick Setup', () => {
    it('should create development setup', () => {
        const integration = quickSetup.development();

        expect(integration).toBeInstanceOf(ClaudeCodeIntegration);
        expect(integration.config.environment).toBe('development');
        expect(integration.config.agentAPI.baseURL).toBe('http://localhost:3284');
    });

    it('should create production setup', () => {
        const integration = quickSetup.production();

        expect(integration).toBeInstanceOf(ClaudeCodeIntegration);
        expect(integration.config.environment).toBe('production');
        expect(integration.config.agentAPI.timeout).toBe(60000);
    });

    it('should create custom setup', () => {
        const customConfig = {
            environment: 'custom',
            agentAPI: {
                baseURL: 'https://custom-api.com',
                timeout: 45000
            }
        };

        const integration = quickSetup.custom(customConfig);

        expect(integration).toBeInstanceOf(ClaudeCodeIntegration);
        expect(integration.config.environment).toBe('custom');
        expect(integration.config.agentAPI.baseURL).toBe('https://custom-api.com');
        expect(integration.config.agentAPI.timeout).toBe(45000);
    });
});

describe('Integration Events', () => {
    let integration;

    beforeEach(() => {
        integration = new ClaudeCodeIntegration({
            environment: 'test'
        });
    });

    it('should emit initialization events', (done) => {
        integration.on('initialized', () => {
            expect(integration.isInitialized).toBe(true);
            done();
        });

        // Mock successful initialization
        jest.spyOn(integration, '_setupEventForwarding').mockImplementation(() => {});
        integration.executor = { initialize: jest.fn().mockResolvedValue(true) };
        integration.workspaceManager = { initialize: jest.fn().mockResolvedValue(true) };

        integration.initialize();
    });

    it('should emit shutdown events', (done) => {
        integration.on('shutdown', () => {
            expect(integration.isInitialized).toBe(false);
            done();
        });

        // Mock components
        integration.agentAPIClient = { disconnect: jest.fn() };
        integration.workspaceManager = { shutdown: jest.fn().mockResolvedValue(true) };
        integration.isInitialized = true;

        integration.shutdown();
    });
});

