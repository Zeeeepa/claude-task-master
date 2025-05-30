/**
 * @fileoverview Tests for AI Development Engine
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AIDevelopmentEngine } from '../../../src/integrations/codegen/engine.js';

// Mock dependencies
const mockCodegenClient = {
    generateCode: jest.fn(),
    monitorTask: jest.fn(),
    createPR: jest.fn(),
    getHealth: jest.fn()
};

const mockDatabase = {
    getTaskByLinearId: jest.fn(),
    createTask: jest.fn(),
    updateTask: jest.fn(),
    getTask: jest.fn(),
    getHealth: jest.fn()
};

const mockLinearClient = {
    getIssue: jest.fn(),
    updateIssue: jest.fn(),
    createComment: jest.fn(),
    getHealth: jest.fn()
};

describe('AIDevelopmentEngine', () => {
    let engine;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        
        // Create engine instance
        engine = new AIDevelopmentEngine(
            mockCodegenClient,
            mockDatabase,
            mockLinearClient,
            {
                enableProgressUpdates: true,
                pollInterval: 1000 // Faster for testing
            }
        );
    });

    afterEach(async () => {
        if (engine) {
            await engine.shutdown();
        }
    });

    describe('constructor', () => {
        test('should initialize with required dependencies', () => {
            expect(engine.codegen).toBe(mockCodegenClient);
            expect(engine.db).toBe(mockDatabase);
            expect(engine.linear).toBe(mockLinearClient);
            expect(engine.activeTasks).toBeInstanceOf(Map);
        });

        test('should accept custom options', () => {
            const customEngine = new AIDevelopmentEngine(
                mockCodegenClient,
                mockDatabase,
                mockLinearClient,
                {
                    enableProgressUpdates: false,
                    maxRetries: 5
                }
            );

            expect(customEngine.options.enableProgressUpdates).toBe(false);
            expect(customEngine.options.maxRetries).toBe(5);
        });
    });

    describe('processLinearTask', () => {
        test('should process Linear task successfully', async () => {
            const mockIssue = {
                id: 'linear-123',
                title: 'Test Feature',
                description: '## Description\nImplement test feature\n\n## Acceptance Criteria\n- Should work'
            };

            const mockTaskData = {
                id: 'task-123',
                title: 'Test Feature',
                linearIssueId: 'linear-123'
            };

            const mockCodegenTask = {
                id: 'codegen-456',
                status: 'pending'
            };

            mockLinearClient.getIssue.mockResolvedValue(mockIssue);
            mockDatabase.getTaskByLinearId.mockResolvedValue(mockTaskData);
            mockCodegenClient.generateCode.mockResolvedValue(mockCodegenTask);
            mockDatabase.updateTask.mockResolvedValue(mockTaskData);

            const result = await engine.processLinearTask('linear-123');

            expect(mockLinearClient.getIssue).toHaveBeenCalledWith('linear-123');
            expect(mockCodegenClient.generateCode).toHaveBeenCalled();
            expect(mockDatabase.updateTask).toHaveBeenCalledWith('task-123', {
                codegenTaskId: 'codegen-456',
                status: 'generating',
                lastUpdated: expect.any(Date),
                requirements: expect.any(Object)
            });

            expect(result.success).toBe(true);
            expect(result.taskId).toBe('task-123');
            expect(result.codegenTaskId).toBe('codegen-456');
        });

        test('should create new task if not exists', async () => {
            const mockIssue = {
                id: 'linear-123',
                title: 'New Feature',
                description: 'New feature description'
            };

            const mockNewTask = {
                id: 'task-new',
                title: 'New Feature',
                linearIssueId: 'linear-123'
            };

            const mockCodegenTask = {
                id: 'codegen-456',
                status: 'pending'
            };

            mockLinearClient.getIssue.mockResolvedValue(mockIssue);
            mockDatabase.getTaskByLinearId.mockResolvedValue(null);
            mockDatabase.createTask.mockResolvedValue(mockNewTask);
            mockCodegenClient.generateCode.mockResolvedValue(mockCodegenTask);
            mockDatabase.updateTask.mockResolvedValue(mockNewTask);

            const result = await engine.processLinearTask('linear-123');

            expect(mockDatabase.createTask).toHaveBeenCalledWith({
                title: 'New Feature',
                description: 'New feature description',
                linearIssueId: 'linear-123',
                status: 'pending',
                createdAt: expect.any(Date),
                priority: 3
            });

            expect(result.success).toBe(true);
            expect(result.taskId).toBe('task-new');
        });

        test('should handle Linear issue not found', async () => {
            mockLinearClient.getIssue.mockResolvedValue(null);

            await expect(engine.processLinearTask('invalid-issue'))
                .rejects.toThrow('Linear issue invalid-issue not found');
        });

        test('should handle code generation failure', async () => {
            const mockIssue = {
                id: 'linear-123',
                title: 'Test Feature',
                description: 'Test description'
            };

            const mockTaskData = {
                id: 'task-123',
                linearIssueId: 'linear-123'
            };

            mockLinearClient.getIssue.mockResolvedValue(mockIssue);
            mockDatabase.getTaskByLinearId.mockResolvedValue(mockTaskData);
            mockCodegenClient.generateCode.mockRejectedValue(new Error('Generation failed'));
            mockLinearClient.createComment.mockResolvedValue({});

            await expect(engine.processLinearTask('linear-123'))
                .rejects.toThrow('Generation failed');

            expect(mockLinearClient.createComment).toHaveBeenCalledWith('linear-123', {
                body: expect.stringContaining('Processing Error')
            });
        });
    });

    describe('updateTaskProgress', () => {
        test('should update task progress successfully', async () => {
            const mockCodegenTask = {
                status: 'running',
                progress: 50,
                logs: ['Step 1 complete', 'Step 2 in progress']
            };

            mockDatabase.updateTask.mockResolvedValue({});
            mockDatabase.getTask.mockResolvedValue({
                id: 'task-123',
                linearIssueId: 'linear-123'
            });
            mockLinearClient.createComment.mockResolvedValue({});

            await engine.updateTaskProgress('task-123', mockCodegenTask);

            expect(mockDatabase.updateTask).toHaveBeenCalledWith('task-123', {
                codegenStatus: 'running',
                codegenProgress: 50,
                lastCodegenUpdate: expect.any(Date),
                codegenLogs: ['Step 1 complete', 'Step 2 in progress']
            });
        });

        test('should handle progress update errors gracefully', async () => {
            const mockCodegenTask = {
                status: 'running',
                progress: 50
            };

            mockDatabase.updateTask.mockRejectedValue(new Error('Database error'));

            // Should not throw
            await expect(engine.updateTaskProgress('task-123', mockCodegenTask))
                .resolves.toBeUndefined();
        });
    });

    describe('handleCodegenCompletion', () => {
        test('should handle successful completion', async () => {
            const mockCodegenTask = {
                status: 'completed',
                generatedFiles: ['src/feature.js', 'tests/feature.test.js']
            };

            const mockTaskData = {
                id: 'task-123',
                title: 'Test Feature',
                description: 'Test description',
                linearIssueId: 'linear-123'
            };

            const mockPR = {
                url: 'https://github.com/org/repo/pull/123',
                number: 123
            };

            mockDatabase.getTask.mockResolvedValue(mockTaskData);
            mockCodegenClient.createPR.mockResolvedValue(mockPR);
            mockDatabase.updateTask.mockResolvedValue({});
            mockLinearClient.updateIssue.mockResolvedValue({});
            mockLinearClient.createComment.mockResolvedValue({});

            const result = await engine.handleCodegenCompletion('task-123', mockCodegenTask);

            expect(mockCodegenClient.createPR).toHaveBeenCalledWith({
                title: '🤖 Test Feature',
                description: expect.stringContaining('# 🤖 Automated Implementation'),
                files: ['src/feature.js', 'tests/feature.test.js'],
                branch: 'codegen-bot/task-123',
                baseBranch: 'main',
                taskId: 'task-123',
                linearIssueId: 'linear-123'
            });

            expect(mockDatabase.updateTask).toHaveBeenCalledWith('task-123', {
                status: 'pr_created',
                prUrl: 'https://github.com/org/repo/pull/123',
                prNumber: 123,
                generatedFiles: ['src/feature.js', 'tests/feature.test.js'],
                completedAt: expect.any(Date)
            });

            expect(mockLinearClient.updateIssue).toHaveBeenCalledWith('linear-123', {
                state: 'in_review',
                description: expect.stringContaining('🔗 **Generated PR**')
            });

            expect(result).toBe(mockPR);
        });

        test('should handle completion processing errors', async () => {
            const mockCodegenTask = {
                status: 'completed',
                generatedFiles: []
            };

            const mockTaskData = {
                id: 'task-123',
                title: 'Test Feature',
                linearIssueId: 'linear-123'
            };

            mockDatabase.getTask.mockResolvedValue(mockTaskData);
            mockCodegenClient.createPR.mockRejectedValue(new Error('PR creation failed'));
            mockDatabase.updateTask.mockResolvedValue({});
            mockLinearClient.createComment.mockResolvedValue({});

            // Should handle error and call failure handler
            await engine.handleCodegenCompletion('task-123', mockCodegenTask);

            expect(mockDatabase.updateTask).toHaveBeenCalledWith('task-123', {
                status: 'failed',
                error: expect.stringContaining('Post-completion processing failed'),
                failedAt: expect.any(Date)
            });
        });
    });

    describe('handleCodegenFailure', () => {
        test('should handle failure correctly', async () => {
            const mockCodegenTask = {
                status: 'failed',
                error: 'Code generation failed due to invalid requirements'
            };

            const mockTaskData = {
                id: 'task-123',
                linearIssueId: 'linear-123'
            };

            mockDatabase.getTask.mockResolvedValue(mockTaskData);
            mockDatabase.updateTask.mockResolvedValue({});
            mockLinearClient.updateIssue.mockResolvedValue({});
            mockLinearClient.createComment.mockResolvedValue({});

            await engine.handleCodegenFailure('task-123', mockCodegenTask);

            expect(mockDatabase.updateTask).toHaveBeenCalledWith('task-123', {
                status: 'failed',
                error: 'Code generation failed due to invalid requirements',
                failedAt: expect.any(Date)
            });

            expect(mockLinearClient.updateIssue).toHaveBeenCalledWith('linear-123', {
                state: 'todo'
            });

            expect(mockLinearClient.createComment).toHaveBeenCalledWith('linear-123', {
                body: expect.stringContaining('❌ **Code Generation Failed**')
            });
        });
    });

    describe('extractRequirements', () => {
        test('should extract requirements from Linear issue', () => {
            const mockIssue = {
                title: 'Test Feature',
                description: '## Description\nImplement test feature\n\n## Acceptance Criteria\n- Should work\n- Should be tested'
            };

            const mockTaskData = {
                repository: 'test-repo',
                branch: 'feature-branch'
            };

            const requirements = engine.extractRequirements(mockIssue, mockTaskData);

            expect(requirements.title).toBe('Test Feature');
            expect(requirements.description).toBe('## Description\nImplement test feature\n\n## Acceptance Criteria\n- Should work\n- Should be tested');
            expect(requirements.repository).toBe('test-repo');
            expect(requirements.branch).toBe('feature-branch');
        });

        test('should use defaults for missing task data', () => {
            const mockIssue = {
                title: 'Test Feature',
                description: 'Test description'
            };

            const mockTaskData = {};

            const requirements = engine.extractRequirements(mockIssue, mockTaskData);

            expect(requirements.repository).toBe('default');
            expect(requirements.branch).toBe('main');
            expect(requirements.contextFiles).toEqual([]);
        });
    });

    describe('formatProgressComment', () => {
        test('should format progress comment correctly', () => {
            const mockCodegenTask = {
                status: 'running',
                progress: 75,
                logs: ['Step 1 complete', 'Step 2 complete', 'Step 3 in progress']
            };

            const comment = engine.formatProgressComment(mockCodegenTask);

            expect(comment).toContain('🤖 **Codegen Progress Update**');
            expect(comment).toContain('**Status**: running');
            expect(comment).toContain('**Progress**: 75%');
            expect(comment).toContain('**Latest Logs**:');
            expect(comment).toContain('Step 1 complete');
            expect(comment).toContain('Step 3 in progress');
        });

        test('should handle missing progress and logs', () => {
            const mockCodegenTask = {
                status: 'pending'
            };

            const comment = engine.formatProgressComment(mockCodegenTask);

            expect(comment).toContain('**Status**: pending');
            expect(comment).toContain('**Progress**: 0%');
            expect(comment).not.toContain('**Latest Logs**:');
        });
    });

    describe('getHealth', () => {
        test('should return comprehensive health status', async () => {
            mockCodegenClient.getHealth.mockResolvedValue({ status: 'healthy' });
            mockDatabase.getHealth.mockResolvedValue({ status: 'healthy' });
            mockLinearClient.getHealth.mockResolvedValue({ status: 'healthy' });

            const health = await engine.getHealth();

            expect(health.status).toBe('healthy');
            expect(health.activeTasks).toBe(0);
            expect(health.components.codegen.status).toBe('healthy');
            expect(health.components.database.status).toBe('healthy');
            expect(health.components.linear.status).toBe('healthy');
        });
    });

    describe('shutdown', () => {
        test('should shutdown gracefully', async () => {
            // Add some active tasks
            engine.activeTasks.set('task-1', {
                pollInterval: setInterval(() => {}, 1000)
            });
            engine.activeTasks.set('task-2', {
                pollInterval: setInterval(() => {}, 1000)
            });

            await engine.shutdown();

            expect(engine.activeTasks.size).toBe(0);
        });
    });
});

