/**
 * Tests for Deployment Validation Engine
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DeploymentValidationEngine } from '../../src/engines/deployment-validation-engine.js';

// Mock dependencies
const mockClaudeCodeClient = {
    getHealthStatus: vi.fn(),
    deployAndValidate: vi.fn(),
    monitorDeployment: vi.fn(),
    getDeploymentLogs: vi.fn(),
    triggerAutoFix: vi.fn()
};

const mockDatabase = {
    getTask: vi.fn(),
    updateTask: vi.fn()
};

const mockGithubClient = {
    createStatus: vi.fn()
};

const mockLinearClient = {
    createIssue: vi.fn(),
    commentOnIssue: vi.fn()
};

describe('DeploymentValidationEngine', () => {
    let engine;

    beforeEach(() => {
        vi.clearAllMocks();
        
        engine = new DeploymentValidationEngine(
            mockClaudeCodeClient,
            mockDatabase,
            mockGithubClient,
            mockLinearClient
        );
    });

    afterEach(() => {
        vi.clearAllTimers();
    });

    describe('initialize', () => {
        it('should initialize successfully when Claude Code is healthy', async () => {
            mockClaudeCodeClient.getHealthStatus.mockResolvedValue({
                status: 'healthy'
            });

            const result = await engine.initialize();

            expect(result).toBe(true);
            expect(mockClaudeCodeClient.getHealthStatus).toHaveBeenCalled();
        });

        it('should throw error when Claude Code is unhealthy', async () => {
            mockClaudeCodeClient.getHealthStatus.mockResolvedValue({
                status: 'unhealthy',
                message: 'Service unavailable'
            });

            await expect(engine.initialize())
                .rejects.toThrow('Claude Code service is not healthy: Service unavailable');
        });
    });

    describe('handlePRWebhook', () => {
        const mockPREvent = {
            action: 'opened',
            pull_request: {
                number: 123,
                head: { ref: 'codegen-bot/feature-test' },
                base: { ref: 'main', repo: { full_name: 'test/repo' } }
            }
        };

        it('should process PR opened event', async () => {
            const mockDeployment = {
                id: 'deployment-123',
                status: 'validating'
            };

            mockClaudeCodeClient.deployAndValidate.mockResolvedValue(mockDeployment);
            mockDatabase.getTask.mockResolvedValue({ id: 'task-123' });
            mockDatabase.updateTask.mockResolvedValue();

            const result = await engine.handlePRWebhook(mockPREvent);

            expect(result).toEqual(mockDeployment);
            expect(mockClaudeCodeClient.deployAndValidate).toHaveBeenCalledWith({
                repository: 'test/repo',
                branch: 'codegen-bot/feature-test',
                number: 123,
                baseBranch: 'main'
            });
        });

        it('should ignore non-Codegen PRs', async () => {
            const nonCodegenPREvent = {
                ...mockPREvent,
                pull_request: {
                    ...mockPREvent.pull_request,
                    head: { ref: 'feature/user-branch' }
                }
            };

            const result = await engine.handlePRWebhook(nonCodegenPREvent);

            expect(result).toEqual({
                status: 'skipped',
                reason: 'Not a Codegen PR'
            });
            expect(mockClaudeCodeClient.deployAndValidate).not.toHaveBeenCalled();
        });

        it('should ignore unsupported actions', async () => {
            const closedPREvent = {
                ...mockPREvent,
                action: 'closed'
            };

            const result = await engine.handlePRWebhook(closedPREvent);

            expect(result).toEqual({
                status: 'ignored',
                reason: 'Action closed not handled'
            });
        });
    });

    describe('validatePR', () => {
        const mockPR = {
            number: 123,
            head: { ref: 'codegen-bot/feature-test' },
            base: { ref: 'main', repo: { full_name: 'test/repo' } }
        };

        it('should validate Codegen PR successfully', async () => {
            const mockDeployment = {
                id: 'deployment-123',
                status: 'validating'
            };

            mockClaudeCodeClient.deployAndValidate.mockResolvedValue(mockDeployment);
            mockDatabase.getTask.mockResolvedValue({ id: 'task-123' });
            mockDatabase.updateTask.mockResolvedValue();

            // Mock the monitorDeployment method to avoid actual monitoring
            vi.spyOn(engine, 'monitorDeployment').mockImplementation(() => {});

            const result = await engine.validatePR(mockPR);

            expect(result).toEqual(mockDeployment);
            expect(engine.metrics.totalValidations).toBe(1);
        });

        it('should handle validation failure', async () => {
            mockClaudeCodeClient.deployAndValidate.mockRejectedValue(
                new Error('Deployment failed')
            );

            await expect(engine.validatePR(mockPR))
                .rejects.toThrow('Deployment failed');

            expect(engine.metrics.failedValidations).toBe(1);
        });
    });

    describe('extractTaskIdFromBranch', () => {
        it('should extract task ID from codegen-bot branch', () => {
            const taskId = engine.extractTaskIdFromBranch('codegen-bot/task-123-feature');
            expect(taskId).toBe('123');
        });

        it('should extract task ID from codegen branch', () => {
            const taskId = engine.extractTaskIdFromBranch('codegen/zam-884-sub-issue-4');
            expect(taskId).toBe('884');
        });

        it('should return null for non-matching branches', () => {
            const taskId = engine.extractTaskIdFromBranch('feature/user-branch');
            expect(taskId).toBeNull();
        });
    });

    describe('monitorDeployment', () => {
        it('should start monitoring deployment', () => {
            const deploymentId = 'deployment-123';
            const taskId = 'task-123';
            const pr = { number: 123 };

            // Mock pollDeployment to avoid actual polling
            vi.spyOn(engine, 'pollDeployment').mockImplementation(() => {});

            engine.monitorDeployment(deploymentId, taskId, pr);

            expect(engine.activeDeployments.has(deploymentId)).toBe(true);
            expect(engine.pollDeployment).toHaveBeenCalledWith(deploymentId);
        });
    });

    describe('handleDeploymentSuccess', () => {
        it('should handle successful deployment', async () => {
            const monitor = {
                deploymentId: 'deployment-123',
                taskId: 'task-123',
                startTime: Date.now() - 60000,
                pr: { head: { sha: 'abc123' } }
            };

            const deployment = {
                id: 'deployment-123',
                status: 'completed'
            };

            mockDatabase.updateTask.mockResolvedValue();
            mockGithubClient.createStatus.mockResolvedValue();
            mockLinearClient.commentOnIssue.mockResolvedValue();

            await engine.handleDeploymentSuccess(monitor, deployment);

            expect(mockDatabase.updateTask).toHaveBeenCalledWith('task-123', {
                deploymentStatus: 'completed',
                deploymentResult: deployment,
                completedAt: expect.any(Date)
            });

            expect(mockGithubClient.createStatus).toHaveBeenCalledWith('abc123', {
                state: 'success',
                description: 'All validation layers passed',
                context: 'claude-code/validation'
            });

            expect(engine.metrics.successfulValidations).toBe(1);
        });
    });

    describe('handleDeploymentFailure', () => {
        it('should trigger auto-fix on first failure', async () => {
            const monitor = {
                deploymentId: 'deployment-123',
                taskId: 'task-123',
                attempts: 0,
                maxAttempts: 3
            };

            const deployment = {
                id: 'deployment-123',
                status: 'failed',
                errors: ['Test error']
            };

            const autoFixResult = {
                id: 'autofix-123',
                status: 'running'
            };

            mockClaudeCodeClient.triggerAutoFix.mockResolvedValue(autoFixResult);
            mockDatabase.updateTask.mockResolvedValue();

            // Mock setTimeout to avoid actual delays
            vi.spyOn(global, 'setTimeout').mockImplementation((fn) => fn());
            vi.spyOn(engine, 'pollDeployment').mockImplementation(() => {});

            await engine.handleDeploymentFailure(monitor, deployment);

            expect(mockClaudeCodeClient.triggerAutoFix).toHaveBeenCalledWith(
                'deployment-123',
                ['Test error']
            );

            expect(mockDatabase.updateTask).toHaveBeenCalledWith('task-123', {
                autoFixAttempt: 1,
                autoFixId: 'autofix-123',
                deploymentStatus: 'auto_fixing'
            });
        });

        it('should escalate after max attempts', async () => {
            const monitor = {
                deploymentId: 'deployment-123',
                taskId: 'task-123',
                attempts: 3,
                maxAttempts: 3
            };

            const deployment = {
                id: 'deployment-123',
                status: 'failed',
                errors: ['Test error']
            };

            vi.spyOn(engine, 'escalateToCodegen').mockResolvedValue();

            await engine.handleDeploymentFailure(monitor, deployment);

            expect(engine.escalateToCodegen).toHaveBeenCalledWith(monitor, deployment);
            expect(engine.activeDeployments.has('deployment-123')).toBe(false);
        });
    });

    describe('escalateToCodegen', () => {
        it('should create Linear issue for escalation', async () => {
            const monitor = {
                deploymentId: 'deployment-123',
                taskId: 'task-123',
                pr: { number: 123, title: 'Test PR' }
            };

            const deployment = {
                id: 'deployment-123',
                status: 'failed',
                errors: ['Test error']
            };

            const logs = { output: 'Test logs' };
            const taskData = { title: 'Test Task', linearIssueId: 'issue-123' };
            const fixIssue = { id: 'fix-issue-123' };

            mockClaudeCodeClient.getDeploymentLogs.mockResolvedValue(logs);
            mockDatabase.getTask.mockResolvedValue(taskData);
            mockLinearClient.createIssue.mockResolvedValue(fixIssue);
            mockDatabase.updateTask.mockResolvedValue();

            // Mock getCodegenUserId
            vi.spyOn(engine, 'getCodegenUserId').mockResolvedValue('codegen-user-id');

            const result = await engine.escalateToCodegen(monitor, deployment);

            expect(mockLinearClient.createIssue).toHaveBeenCalledWith({
                title: '🔧 Fix Deployment Errors: Test Task',
                description: expect.stringContaining('Deployment validation failed'),
                parentId: 'issue-123',
                assigneeId: 'codegen-user-id',
                priority: 1
            });

            expect(result).toEqual(fixIssue);
            expect(engine.metrics.escalations).toBe(1);
        });
    });

    describe('getMetrics', () => {
        it('should return current metrics', () => {
            engine.metrics.totalValidations = 10;
            engine.metrics.successfulValidations = 8;
            engine.metrics.failedValidations = 2;

            const metrics = engine.getMetrics();

            expect(metrics).toEqual({
                totalValidations: 10,
                successfulValidations: 8,
                failedValidations: 2,
                autoFixSuccesses: 0,
                escalations: 0,
                averageValidationTime: 0,
                activeDeployments: 0,
                successRate: 80
            });
        });
    });

    describe('shutdown', () => {
        it('should clear active deployments', async () => {
            engine.activeDeployments.set('deployment-1', {});
            engine.activeDeployments.set('deployment-2', {});

            await engine.shutdown();

            expect(engine.activeDeployments.size).toBe(0);
        });
    });
});

