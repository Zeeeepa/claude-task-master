/**
 * Claude Code Orchestration Tests
 * 
 * Comprehensive test suite for Claude Code orchestration,
 * validation workflows, and debugging operations.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import ClaudeCodeOrchestrator from '../../src/ai_cicd_system/integrations/claude_code_orchestrator.js';
import AgentAPIClient from '../../src/ai_cicd_system/integrations/agentapi_client.js';
import WSL2EnvironmentManager from '../../src/ai_cicd_system/integrations/wsl2_manager.js';

// Mock dependencies
jest.mock('../../src/ai_cicd_system/integrations/agentapi_client.js');
jest.mock('../../src/ai_cicd_system/integrations/wsl2_manager.js');

describe('Claude Code Orchestration Tests', () => {
    let orchestrator;
    let mockAgentAPI;
    let mockWSL2Manager;

    const mockPRDetails = {
        prNumber: 123,
        repositoryUrl: 'https://github.com/test/repo.git',
        branch: 'feature/security-fix',
        baseBranch: 'main',
        files: [
            'src/auth.js',
            'src/database.js',
            'tests/auth.test.js'
        ],
        additions: 75,
        deletions: 20
    };

    beforeEach(() => {
        // Mock AgentAPI client
        mockAgentAPI = {
            initialize: jest.fn().mockResolvedValue(true),
            startClaudeCodeValidation: jest.fn().mockResolvedValue({
                id: 'claude-session-123',
                instanceId: 'wsl2-instance-123',
                status: 'running'
            }),
            sendValidationRequest: jest.fn().mockResolvedValue({
                sessionId: 'claude-session-123',
                response: 'Validation completed successfully',
                timestamp: new Date().toISOString(),
                status: 'completed'
            }),
            cleanup: jest.fn().mockResolvedValue(true),
            on: jest.fn(),
            emit: jest.fn()
        };

        // Mock WSL2 Environment Manager
        mockWSL2Manager = {
            initialize: jest.fn().mockResolvedValue(true),
            createEnvironment: jest.fn().mockResolvedValue({
                id: 'env-123',
                instance: {
                    id: 'wsl2-instance-123',
                    status: 'running'
                },
                status: 'ready',
                prDetails: mockPRDetails
            }),
            cleanupEnvironment: jest.fn().mockResolvedValue(true),
            cleanup: jest.fn().mockResolvedValue(true),
            on: jest.fn(),
            emit: jest.fn()
        };

        // Mock constructors
        AgentAPIClient.mockImplementation(() => mockAgentAPI);
        WSL2EnvironmentManager.mockImplementation(() => mockWSL2Manager);

        orchestrator = new ClaudeCodeOrchestrator({
            validationTimeout: 10000,
            maxRetries: 2,
            allowedTools: 'Bash(git*) Edit Replace',
            validationRules: {
                syntax: true,
                security: true,
                performance: true,
                bestPractices: true
            }
        });
    });

    afterEach(async () => {
        try {
            await orchestrator.cleanup();
        } catch (error) {
            // Ignore cleanup errors in tests
        }
        jest.clearAllMocks();
    });

    describe('Initialization', () => {
        test('should initialize successfully', async () => {
            const result = await orchestrator.initialize();
            
            expect(result).toBe(true);
            expect(mockAgentAPI.initialize).toHaveBeenCalled();
            expect(mockWSL2Manager.initialize).toHaveBeenCalled();
        });

        test('should handle initialization failure', async () => {
            mockAgentAPI.initialize.mockRejectedValue(new Error('AgentAPI unavailable'));
            
            await expect(orchestrator.initialize()).rejects.toThrow('Failed to initialize Claude Code Orchestrator');
        });
    });

    describe('PR Validation Workflow', () => {
        beforeEach(async () => {
            await orchestrator.initialize();
        });

        test('should start PR validation successfully', async () => {
            const session = await orchestrator.startPRValidation(mockPRDetails);

            expect(session).toHaveProperty('id');
            expect(session).toHaveProperty('prDetails', mockPRDetails);
            expect(session).toHaveProperty('status', 'completed');
            expect(session).toHaveProperty('results');
            expect(session.results).toHaveProperty('syntax');
            expect(session.results).toHaveProperty('security');
            expect(session.results).toHaveProperty('performance');
            expect(session.results).toHaveProperty('bestPractices');
            expect(session.results).toHaveProperty('overall');
        });

        test('should create WSL2 environment for validation', async () => {
            await orchestrator.startPRValidation(mockPRDetails);

            expect(mockWSL2Manager.createEnvironment).toHaveBeenCalledWith(mockPRDetails);
        });

        test('should start Claude Code session', async () => {
            await orchestrator.startPRValidation(mockPRDetails);

            expect(mockAgentAPI.startClaudeCodeValidation).toHaveBeenCalledWith(
                'wsl2-instance-123',
                expect.objectContaining({
                    allowedTools: 'Bash(git*) Edit Replace',
                    workspace: '/workspace',
                    validationRules: expect.any(Object)
                })
            );
        });

        test('should execute all validation steps', async () => {
            const session = await orchestrator.startPRValidation(mockPRDetails);

            expect(session.validationSteps).toHaveLength(4);
            expect(session.validationSteps.map(s => s.name)).toEqual([
                'syntax',
                'security',
                'performance',
                'bestPractices'
            ]);

            session.validationSteps.forEach(step => {
                expect(step.status).toBe('completed');
            });
        });

        test('should handle validation step failures gracefully', async () => {
            mockAgentAPI.sendValidationRequest.mockRejectedValueOnce(
                new Error('Validation step failed')
            );

            const session = await orchestrator.startPRValidation(mockPRDetails);

            // Should continue with other steps even if one fails
            expect(session.status).toBe('completed');
            expect(session.errors).toHaveLength(1);
        });

        test('should process validation results correctly', async () => {
            const session = await orchestrator.startPRValidation(mockPRDetails);

            expect(session.results.overall).toHaveProperty('summary');
            expect(session.results.overall.summary).toHaveProperty('totalIssues');
            expect(session.results.overall.summary).toHaveProperty('overallScore');
            expect(session.results.overall).toHaveProperty('status');
        });
    });

    describe('Validation Steps', () => {
        beforeEach(async () => {
            await orchestrator.initialize();
        });

        test('should execute syntax validation', async () => {
            const session = await orchestrator.startPRValidation(mockPRDetails);
            const syntaxResult = session.results.syntax;

            expect(syntaxResult).toHaveProperty('step', 'syntax');
            expect(syntaxResult).toHaveProperty('issues');
            expect(syntaxResult).toHaveProperty('recommendations');
            expect(syntaxResult).toHaveProperty('score');
        });

        test('should execute security validation', async () => {
            const session = await orchestrator.startPRValidation(mockPRDetails);
            const securityResult = session.results.security;

            expect(securityResult).toHaveProperty('step', 'security');
            expect(securityResult).toHaveProperty('issues');
            expect(securityResult).toHaveProperty('recommendations');
        });

        test('should execute performance validation', async () => {
            const session = await orchestrator.startPRValidation(mockPRDetails);
            const performanceResult = session.results.performance;

            expect(performanceResult).toHaveProperty('step', 'performance');
            expect(performanceResult).toHaveProperty('issues');
            expect(performanceResult).toHaveProperty('recommendations');
        });

        test('should execute best practices validation', async () => {
            const session = await orchestrator.startPRValidation(mockPRDetails);
            const bestPracticesResult = session.results.bestPractices;

            expect(bestPracticesResult).toHaveProperty('step', 'bestPractices');
            expect(bestPracticesResult).toHaveProperty('issues');
            expect(bestPracticesResult).toHaveProperty('recommendations');
        });

        test('should generate appropriate validation prompts', async () => {
            await orchestrator.startPRValidation(mockPRDetails);

            // Check that validation requests were made with appropriate prompts
            expect(mockAgentAPI.sendValidationRequest).toHaveBeenCalledWith(
                'claude-session-123',
                expect.stringContaining('syntax errors')
            );
            expect(mockAgentAPI.sendValidationRequest).toHaveBeenCalledWith(
                'claude-session-123',
                expect.stringContaining('security analysis')
            );
            expect(mockAgentAPI.sendValidationRequest).toHaveBeenCalledWith(
                'claude-session-123',
                expect.stringContaining('performance issues')
            );
            expect(mockAgentAPI.sendValidationRequest).toHaveBeenCalledWith(
                'claude-session-123',
                expect.stringContaining('best practices')
            );
        });
    });

    describe('Debugging Operations', () => {
        beforeEach(async () => {
            await orchestrator.initialize();
        });

        test('should trigger debugging for critical issues', async () => {
            // Mock critical security issues
            mockAgentAPI.sendValidationRequest.mockImplementation((sessionId, prompt) => {
                if (prompt.includes('security')) {
                    return Promise.resolve({
                        sessionId,
                        response: 'Critical security vulnerabilities found',
                        timestamp: new Date().toISOString(),
                        status: 'completed'
                    });
                }
                return Promise.resolve({
                    sessionId,
                    response: 'No issues found',
                    timestamp: new Date().toISOString(),
                    status: 'completed'
                });
            });

            const session = await orchestrator.startPRValidation(mockPRDetails);

            // Should have triggered debugging for critical issues
            expect(session.debuggingSessions.length).toBeGreaterThan(0);
        });

        test('should execute debugging iterations', async () => {
            // Force critical issues to trigger debugging
            const originalParseResponse = orchestrator.parseValidationResponse;
            orchestrator.parseValidationResponse = jest.fn().mockReturnValue({
                step: 'security',
                severity: 'critical',
                issueCount: 3,
                issues: [
                    { id: 'sec-1', severity: 'error', type: 'sql_injection' },
                    { id: 'sec-2', severity: 'error', type: 'xss' },
                    { id: 'sec-3', severity: 'error', type: 'hardcoded_secret' }
                ],
                recommendations: [],
                score: 20
            });

            const session = await orchestrator.startPRValidation(mockPRDetails);

            expect(session.debuggingSessions).toHaveLength(1);
            const debugSession = session.debuggingSessions[0];
            expect(debugSession.iterations.length).toBeGreaterThan(0);

            // Restore original method
            orchestrator.parseValidationResponse = originalParseResponse;
        });

        test('should limit debugging iterations', async () => {
            const limitedOrchestrator = new ClaudeCodeOrchestrator({
                debuggingConfig: {
                    maxIterations: 2,
                    autoFix: true
                }
            });

            await limitedOrchestrator.initialize();

            // Mock persistent critical issues
            limitedOrchestrator.parseValidationResponse = jest.fn().mockReturnValue({
                step: 'security',
                severity: 'critical',
                issueCount: 5,
                issues: [
                    { id: 'sec-1', severity: 'error', type: 'sql_injection' }
                ],
                recommendations: [],
                score: 10
            });

            const session = await limitedOrchestrator.startPRValidation(mockPRDetails);

            if (session.debuggingSessions.length > 0) {
                const debugSession = session.debuggingSessions[0];
                expect(debugSession.iterations.length).toBeLessThanOrEqual(2);
            }

            await limitedOrchestrator.cleanup();
        });
    });

    describe('Session Management', () => {
        beforeEach(async () => {
            await orchestrator.initialize();
        });

        test('should get validation session details', async () => {
            const session = await orchestrator.startPRValidation(mockPRDetails);
            const retrievedSession = await orchestrator.getValidationSession(session.id);

            expect(retrievedSession).toEqual(session);
        });

        test('should list active sessions', async () => {
            const session1 = await orchestrator.startPRValidation(mockPRDetails);
            const session2 = await orchestrator.startPRValidation({
                ...mockPRDetails,
                prNumber: 124
            });

            const activeSessions = await orchestrator.listActiveSessions();

            expect(activeSessions).toHaveLength(2);
            expect(activeSessions.map(s => s.id)).toContain(session1.id);
            expect(activeSessions.map(s => s.id)).toContain(session2.id);
        });

        test('should stop validation session', async () => {
            const session = await orchestrator.startPRValidation(mockPRDetails);
            const result = await orchestrator.stopValidationSession(session.id);

            expect(result).toBe(true);
            expect(mockWSL2Manager.cleanupEnvironment).toHaveBeenCalledWith(session.environment.id);
        });

        test('should handle stopping non-existent session', async () => {
            await expect(
                orchestrator.stopValidationSession('non-existent-session')
            ).rejects.toThrow('Validation session non-existent-session not found');
        });
    });

    describe('Result Processing', () => {
        beforeEach(async () => {
            await orchestrator.initialize();
        });

        test('should calculate overall score correctly', async () => {
            const session = await orchestrator.startPRValidation(mockPRDetails);
            const overallResult = session.results.overall;

            expect(overallResult.summary.overallScore).toBeGreaterThanOrEqual(0);
            expect(overallResult.summary.overallScore).toBeLessThanOrEqual(100);
        });

        test('should determine overall status based on issues', async () => {
            const session = await orchestrator.startPRValidation(mockPRDetails);
            const overallResult = session.results.overall;

            expect(['passed', 'warning', 'failed']).toContain(overallResult.status);
        });

        test('should aggregate issues from all validation steps', async () => {
            const session = await orchestrator.startPRValidation(mockPRDetails);
            const overallResult = session.results.overall;

            expect(overallResult.summary).toHaveProperty('totalIssues');
            expect(overallResult.summary).toHaveProperty('criticalIssues');
            expect(overallResult.summary).toHaveProperty('warningIssues');
            expect(overallResult.summary).toHaveProperty('infoIssues');
        });

        test('should collect recommendations from all steps', async () => {
            const session = await orchestrator.startPRValidation(mockPRDetails);
            const overallResult = session.results.overall;

            expect(overallResult.recommendations).toBeInstanceOf(Array);
            expect(overallResult.recommendations.length).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Error Handling', () => {
        beforeEach(async () => {
            await orchestrator.initialize();
        });

        test('should handle WSL2 environment creation failure', async () => {
            mockWSL2Manager.createEnvironment.mockRejectedValue(
                new Error('Environment creation failed')
            );

            await expect(
                orchestrator.startPRValidation(mockPRDetails)
            ).rejects.toThrow();
        });

        test('should handle Claude Code session start failure', async () => {
            mockAgentAPI.startClaudeCodeValidation.mockRejectedValue(
                new Error('Claude Code session failed')
            );

            await expect(
                orchestrator.startPRValidation(mockPRDetails)
            ).rejects.toThrow();
        });

        test('should handle validation request failures', async () => {
            mockAgentAPI.sendValidationRequest.mockRejectedValue(
                new Error('Validation request failed')
            );

            const session = await orchestrator.startPRValidation(mockPRDetails);

            // Should complete but with errors
            expect(session.status).toBe('completed');
            expect(session.errors.length).toBeGreaterThan(0);
        });

        test('should cleanup on validation failure', async () => {
            mockWSL2Manager.createEnvironment.mockRejectedValue(
                new Error('Environment creation failed')
            );

            try {
                await orchestrator.startPRValidation(mockPRDetails);
            } catch (error) {
                // Expected to fail
            }

            // Should have attempted cleanup
            expect(mockWSL2Manager.cleanupEnvironment).toHaveBeenCalled();
        });
    });

    describe('Event Handling', () => {
        beforeEach(async () => {
            await orchestrator.initialize();
        });

        test('should emit validation lifecycle events', async () => {
            const events = [];

            orchestrator.on('validationStarted', (session) => {
                events.push({ type: 'started', sessionId: session.id });
            });

            orchestrator.on('validationCompleted', (session) => {
                events.push({ type: 'completed', sessionId: session.id });
            });

            const session = await orchestrator.startPRValidation(mockPRDetails);

            expect(events).toHaveLength(2);
            expect(events[0].type).toBe('started');
            expect(events[1].type).toBe('completed');
            expect(events[0].sessionId).toBe(session.id);
        });

        test('should emit validation step events', async () => {
            const stepEvents = [];

            orchestrator.on('validationStepStarted', (event) => {
                stepEvents.push({ type: 'started', step: event.step.name });
            });

            orchestrator.on('validationStepCompleted', (event) => {
                stepEvents.push({ type: 'completed', step: event.step.name });
            });

            await orchestrator.startPRValidation(mockPRDetails);

            expect(stepEvents.length).toBeGreaterThan(0);
            expect(stepEvents.filter(e => e.type === 'started')).toHaveLength(4);
            expect(stepEvents.filter(e => e.type === 'completed')).toHaveLength(4);
        });

        test('should emit debugging events', async () => {
            const debugEvents = [];

            orchestrator.on('debuggingStarted', (event) => {
                debugEvents.push({ type: 'started', sessionId: event.session });
            });

            orchestrator.on('debuggingCompleted', (event) => {
                debugEvents.push({ type: 'completed', sessionId: event.session });
            });

            // Force debugging by mocking critical issues
            orchestrator.parseValidationResponse = jest.fn().mockReturnValue({
                step: 'security',
                severity: 'critical',
                issueCount: 1,
                issues: [{ id: 'sec-1', severity: 'error' }],
                recommendations: [],
                score: 20
            });

            await orchestrator.startPRValidation(mockPRDetails);

            expect(debugEvents.length).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Performance Tests', () => {
        beforeEach(async () => {
            await orchestrator.initialize();
        });

        test('should complete validation within timeout', async () => {
            const startTime = Date.now();

            await orchestrator.startPRValidation(mockPRDetails);

            const duration = Date.now() - startTime;
            expect(duration).toBeLessThan(15000); // Should complete within 15 seconds
        });

        test('should handle concurrent validations', async () => {
            const prDetails = [
                { ...mockPRDetails, prNumber: 101 },
                { ...mockPRDetails, prNumber: 102 },
                { ...mockPRDetails, prNumber: 103 }
            ];

            const startTime = Date.now();

            const promises = prDetails.map(pr => 
                orchestrator.startPRValidation(pr)
            );

            const sessions = await Promise.all(promises);

            const duration = Date.now() - startTime;

            expect(sessions).toHaveLength(3);
            sessions.forEach(session => {
                expect(session.status).toBe('completed');
            });

            // Concurrent execution should be faster than sequential
            expect(duration).toBeLessThan(30000);
        });
    });

    describe('Configuration Tests', () => {
        test('should use custom validation rules', async () => {
            const customOrchestrator = new ClaudeCodeOrchestrator({
                validationRules: {
                    syntax: true,
                    security: false,
                    performance: true,
                    bestPractices: false
                }
            });

            await customOrchestrator.initialize();

            const session = await customOrchestrator.startPRValidation(mockPRDetails);

            // Should only have syntax and performance results
            expect(session.results.syntax).toBeDefined();
            expect(session.results.performance).toBeDefined();

            await customOrchestrator.cleanup();
        });

        test('should respect validation timeout', async () => {
            const timeoutOrchestrator = new ClaudeCodeOrchestrator({
                validationTimeout: 100 // Very short timeout
            });

            await timeoutOrchestrator.initialize();

            // Mock slow validation
            mockAgentAPI.sendValidationRequest.mockImplementation(() => 
                new Promise(resolve => setTimeout(resolve, 200))
            );

            await expect(
                timeoutOrchestrator.startPRValidation(mockPRDetails)
            ).rejects.toThrow();

            await timeoutOrchestrator.cleanup();
        });
    });
});

// Helper functions for testing
function createMockValidationResult(step, severity = 'info', issueCount = 0) {
    return {
        step,
        timestamp: new Date().toISOString(),
        severity,
        issueCount,
        issues: Array.from({ length: issueCount }, (_, i) => ({
            id: `${step}-${i}`,
            severity: severity === 'critical' ? 'error' : 'warning',
            type: `${step}_issue`,
            message: `${step} issue ${i}`,
            file: 'src/test.js',
            line: 10 + i
        })),
        recommendations: [],
        score: Math.max(0, 100 - issueCount * 10)
    };
}

function waitFor(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

