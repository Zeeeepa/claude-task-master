/**
 * @fileoverview Claude Code Manager Tests
 * @description Tests for Claude Code Manager functionality
 */

import { jest } from '@jest/globals';
import { ClaudeCodeManager } from '../../src/ai_cicd_system/core/claude_code_manager.js';
import { AgentAPIClient } from '../../src/ai_cicd_system/core/agentapi_client.js';

// Mock AgentAPIClient
jest.mock('../../src/ai_cicd_system/core/agentapi_client.js');

describe('ClaudeCodeManager', () => {
    let manager;
    let mockAgentAPIClient;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();
        
        // Mock AgentAPIClient
        mockAgentAPIClient = {
            startClaudeCodeSession: jest.fn(),
            sendMessage: jest.fn(),
            getMessages: jest.fn(),
            getSessionStatus: jest.fn(),
            stopSession: jest.fn(),
            getStatus: jest.fn(),
            shutdown: jest.fn(),
            on: jest.fn(),
            emit: jest.fn()
        };
        
        AgentAPIClient.mockImplementation(() => mockAgentAPIClient);
        
        // Create manager
        manager = new ClaudeCodeManager({
            maxConcurrentSessions: 2,
            sessionTimeout: 5000,
            validationTimeout: 10000
        });
    });

    afterEach(async () => {
        if (manager) {
            await manager.shutdown();
        }
    });

    describe('Constructor', () => {
        test('should initialize with default config', () => {
            const defaultManager = new ClaudeCodeManager();
            expect(defaultManager.config.maxConcurrentSessions).toBe(3);
            expect(defaultManager.activeSessions.size).toBe(0);
        });

        test('should setup event handlers', () => {
            expect(mockAgentAPIClient.on).toHaveBeenCalledWith('sessionStarted', expect.any(Function));
            expect(mockAgentAPIClient.on).toHaveBeenCalledWith('sessionStopped', expect.any(Function));
            expect(mockAgentAPIClient.on).toHaveBeenCalledWith('healthCheckFailed', expect.any(Function));
            expect(mockAgentAPIClient.on).toHaveBeenCalledWith('circuitBreakerOpen', expect.any(Function));
        });
    });

    describe('PR Validation', () => {
        const mockPRData = {
            url: 'https://github.com/test/repo',
            branch: 'feature-branch',
            number: 123
        };

        const mockOptions = {
            enableSecurity: true,
            enablePerformance: true
        };

        test('should validate PR successfully', async () => {
            const mockSessionId = 'session-123';
            const mockValidationResult = {
                operationId: 'validate-123',
                score: 0.85,
                summary: { status: 'excellent' },
                steps: {
                    clone_repository: { success: true, score: 0.9 },
                    analyze_changes: { success: true, score: 0.8 }
                },
                recommendations: [],
                timestamp: new Date()
            };

            // Mock session start
            mockAgentAPIClient.startClaudeCodeSession.mockResolvedValue(mockSessionId);
            
            // Mock validation steps
            mockAgentAPIClient.sendMessage.mockResolvedValue({ success: true });
            mockAgentAPIClient.getMessages.mockResolvedValue([
                { type: 'agent', content: 'Repository cloned successfully' }
            ]);
            
            // Mock session stop
            mockAgentAPIClient.stopSession.mockResolvedValue();

            const result = await manager.validatePR(mockPRData, mockOptions);

            expect(result).toMatchObject({
                operationId: expect.any(String),
                prData: mockPRData,
                score: expect.any(Number),
                steps: expect.any(Object),
                summary: expect.any(Object),
                recommendations: expect.any(Array),
                timestamp: expect.any(Date)
            });

            expect(mockAgentAPIClient.startClaudeCodeSession).toHaveBeenCalledWith({
                workingDirectory: expect.stringContaining('/tmp/validation/'),
                environment: expect.objectContaining({
                    PR_URL: mockPRData.url,
                    PR_BRANCH: mockPRData.branch
                })
            });

            expect(mockAgentAPIClient.stopSession).toHaveBeenCalledWith(mockSessionId);
        });

        test('should handle validation failure', async () => {
            mockAgentAPIClient.startClaudeCodeSession.mockRejectedValue(
                new Error('Failed to start session')
            );

            await expect(manager.validatePR(mockPRData, mockOptions))
                .rejects.toThrow('Failed to start session');
        });

        test('should queue validation when max sessions reached', async () => {
            // Fill up concurrent sessions
            manager.activeSessions.set('session-1', { type: 'validation' });
            manager.activeSessions.set('session-2', { type: 'validation' });

            const validationPromise = manager.validatePR(mockPRData, mockOptions);

            // Should be queued
            expect(manager.sessionQueue.length).toBe(1);

            // Simulate session completion to process queue
            manager.activeSessions.delete('session-1');
            
            // Mock successful validation for queued operation
            mockAgentAPIClient.startClaudeCodeSession.mockResolvedValue('session-3');
            mockAgentAPIClient.sendMessage.mockResolvedValue({ success: true });
            mockAgentAPIClient.getMessages.mockResolvedValue([
                { type: 'agent', content: 'Test output' }
            ]);
            mockAgentAPIClient.stopSession.mockResolvedValue();

            manager.processQueue();

            await expect(validationPromise).resolves.toBeDefined();
        });
    });

    describe('Validation Steps', () => {
        test('should execute clone repository step', async () => {
            const sessionId = 'test-session';
            const prData = { url: 'https://github.com/test/repo', branch: 'main' };

            mockAgentAPIClient.sendMessage.mockResolvedValue({ success: true });
            mockAgentAPIClient.getMessages.mockResolvedValue([
                { type: 'agent', content: 'Repository cloned successfully' }
            ]);

            const result = await manager.executeValidationStep(sessionId, 'clone_repository', prData, {});

            expect(result.success).toBe(true);
            expect(result.score).toBeGreaterThan(0);
            expect(mockAgentAPIClient.sendMessage).toHaveBeenCalledWith(
                sessionId,
                expect.stringContaining('git clone')
            );
        });

        test('should handle step execution failure', async () => {
            const sessionId = 'test-session';
            const prData = { url: 'https://github.com/test/repo', branch: 'main' };

            mockAgentAPIClient.sendMessage.mockRejectedValue(new Error('Command failed'));

            const result = await manager.executeValidationStep(sessionId, 'clone_repository', prData, {});

            expect(result.success).toBe(false);
            expect(result.score).toBe(0);
            expect(result.error).toBe('Command failed');
        });
    });

    describe('Step Output Analysis', () => {
        test('should analyze successful step output', () => {
            const outputs = ['Repository cloned successfully', 'Operation completed'];
            const result = manager.analyzeStepOutput('clone_repository', outputs);

            expect(result.score).toBeGreaterThan(0.8);
            expect(result.analysis.hasSuccess).toBe(true);
            expect(result.analysis.hasError).toBe(false);
        });

        test('should analyze failed step output', () => {
            const outputs = ['Error: Permission denied', 'Failed to clone repository'];
            const result = manager.analyzeStepOutput('clone_repository', outputs);

            expect(result.score).toBeLessThan(0.7);
            expect(result.analysis.hasError).toBe(true);
        });

        test('should handle unknown step types', () => {
            const outputs = ['Some output'];
            const result = manager.analyzeStepOutput('unknown_step', outputs);

            expect(result.score).toBe(0.5); // Default base score
        });
    });

    describe('Validation Summary Generation', () => {
        test('should generate excellent status for high scores', () => {
            const results = {
                step1: { success: true, score: 0.9 },
                step2: { success: true, score: 0.8 }
            };
            const totalScore = 0.85;

            const summary = manager.generateValidationSummary(results, totalScore);

            expect(summary.status).toBe('excellent');
            expect(summary.score).toBe(0.85);
            expect(summary.successfulSteps).toBe(2);
            expect(summary.totalSteps).toBe(2);
            expect(summary.completionRate).toBe(100);
        });

        test('should generate failed status for low scores', () => {
            const results = {
                step1: { success: false, score: 0.2 },
                step2: { success: true, score: 0.3 }
            };
            const totalScore = 0.25;

            const summary = manager.generateValidationSummary(results, totalScore);

            expect(summary.status).toBe('failed');
            expect(summary.successfulSteps).toBe(1);
            expect(summary.completionRate).toBe(50);
        });
    });

    describe('Recommendations Generation', () => {
        test('should generate testing recommendations for failed tests', () => {
            const results = {
                run_tests: { success: false, score: 0.3 }
            };

            const recommendations = manager.generateRecommendations(results);

            expect(recommendations).toHaveLength(1);
            expect(recommendations[0].type).toBe('testing');
            expect(recommendations[0].priority).toBe('high');
        });

        test('should generate security recommendations for security issues', () => {
            const results = {
                security_scan: { success: false, score: 0.4 }
            };

            const recommendations = manager.generateRecommendations(results);

            expect(recommendations).toHaveLength(1);
            expect(recommendations[0].type).toBe('security');
            expect(recommendations[0].priority).toBe('critical');
        });

        test('should generate no recommendations for successful validation', () => {
            const results = {
                run_tests: { success: true, score: 0.9 },
                security_scan: { success: true, score: 0.8 }
            };

            const recommendations = manager.generateRecommendations(results);

            expect(recommendations).toHaveLength(0);
        });
    });

    describe('Queue Management', () => {
        test('should process queued operations when session becomes available', async () => {
            const mockResolve = jest.fn();
            const mockReject = jest.fn();

            // Add operation to queue
            manager.sessionQueue.push({
                type: 'validatePR',
                data: { prData: mockPRData, options: {} },
                resolve: mockResolve,
                reject: mockReject
            });

            // Mock successful validation
            mockAgentAPIClient.startClaudeCodeSession.mockResolvedValue('session-123');
            mockAgentAPIClient.sendMessage.mockResolvedValue({ success: true });
            mockAgentAPIClient.getMessages.mockResolvedValue([
                { type: 'agent', content: 'Test output' }
            ]);
            mockAgentAPIClient.stopSession.mockResolvedValue();

            await manager.processQueue();

            expect(mockResolve).toHaveBeenCalled();
            expect(manager.sessionQueue.length).toBe(0);
        });

        test('should handle queued operation failure', async () => {
            const mockResolve = jest.fn();
            const mockReject = jest.fn();

            manager.sessionQueue.push({
                type: 'validatePR',
                data: { prData: mockPRData, options: {} },
                resolve: mockResolve,
                reject: mockReject
            });

            mockAgentAPIClient.startClaudeCodeSession.mockRejectedValue(
                new Error('Session start failed')
            );

            await manager.processQueue();

            expect(mockReject).toHaveBeenCalledWith(expect.any(Error));
        });
    });

    describe('Status and Metrics', () => {
        test('should return manager status', () => {
            mockAgentAPIClient.getStatus.mockReturnValue({
                isHealthy: true,
                activeSessions: 0
            });

            const status = manager.getStatus();

            expect(status).toMatchObject({
                activeSessions: 0,
                queuedOperations: 0,
                totalOperations: 0,
                agentAPIStatus: expect.any(Object),
                config: expect.any(Object)
            });
        });

        test('should return operation history', () => {
            // Add some mock history
            manager.operationHistory.push(
                { operationId: 'op1', type: 'validation' },
                { operationId: 'op2', type: 'validation' },
                { operationId: 'op3', type: 'validation' }
            );

            const history = manager.getOperationHistory(2);

            expect(history).toHaveLength(2);
            expect(history[0].operationId).toBe('op3'); // Most recent first
            expect(history[1].operationId).toBe('op2');
        });
    });

    describe('Shutdown', () => {
        test('should shutdown gracefully', async () => {
            // Add queued operations
            manager.sessionQueue.push({
                resolve: jest.fn(),
                reject: jest.fn()
            });

            await manager.shutdown();

            expect(mockAgentAPIClient.shutdown).toHaveBeenCalled();
            expect(manager.sessionQueue).toHaveLength(0);
            expect(manager.activeSessions.size).toBe(0);
        });

        test('should reject queued operations on shutdown', async () => {
            const mockReject = jest.fn();
            manager.sessionQueue.push({
                resolve: jest.fn(),
                reject: mockReject
            });

            await manager.shutdown();

            expect(mockReject).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Manager is shutting down'
                })
            );
        });
    });
});

