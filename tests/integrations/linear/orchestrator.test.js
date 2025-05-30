import { jest } from '@jest/globals';
import { LinearOrchestrator } from '../../../src/integrations/linear/orchestrator.js';

// Mock dependencies
const mockLinearClient = {
    createTaskIssue: jest.fn(),
    createSubIssue: jest.fn(),
    getIssue: jest.fn(),
    getSubIssues: jest.fn(),
    updateIssue: jest.fn(),
    createComment: jest.fn(),
    getCodegenUserId: jest.fn(),
    on: jest.fn(),
    teamId: 'test-team-id'
};

const mockDatabase = {
    query: jest.fn()
};

describe('LinearOrchestrator', () => {
    let orchestrator;

    beforeEach(() => {
        jest.clearAllMocks();
        orchestrator = new LinearOrchestrator(mockLinearClient, mockDatabase);
    });

    afterEach(() => {
        orchestrator.cleanup();
    });

    describe('constructor', () => {
        it('should create instance with default options', () => {
            expect(orchestrator.linear).toBe(mockLinearClient);
            expect(orchestrator.db).toBe(mockDatabase);
            expect(orchestrator.options.progressCheckInterval).toBe(30000);
        });

        it('should accept custom options', () => {
            const customOptions = { progressCheckInterval: 60000, maxRetries: 5 };
            const customOrchestrator = new LinearOrchestrator(
                mockLinearClient, 
                mockDatabase, 
                customOptions
            );
            
            expect(customOrchestrator.options.progressCheckInterval).toBe(60000);
            expect(customOrchestrator.options.maxRetries).toBe(5);
        });
    });

    describe('createProjectIssues', () => {
        it('should create main issue and sub-issues', async () => {
            const mockMainIssue = { id: 'main-1', title: 'Main Issue' };
            const mockSubIssue1 = { id: 'sub-1', title: 'Sub Issue 1' };
            const mockSubIssue2 = { id: 'sub-2', title: 'Sub Issue 2' };

            mockLinearClient.createTaskIssue.mockResolvedValue(mockMainIssue);
            mockLinearClient.createSubIssue
                .mockResolvedValueOnce(mockSubIssue1)
                .mockResolvedValueOnce(mockSubIssue2);
            mockLinearClient.getCodegenUserId.mockResolvedValue('codegen-user-id');

            const projectData = {
                id: 'project-1',
                name: 'Test Project',
                description: 'Test project description',
                tasks: [
                    {
                        id: 'task-1',
                        title: 'Task 1',
                        description: 'First task'
                    },
                    {
                        id: 'task-2',
                        title: 'Task 2',
                        description: 'Second task'
                    }
                ]
            };

            const result = await orchestrator.createProjectIssues(projectData);

            expect(mockLinearClient.createTaskIssue).toHaveBeenCalledWith({
                title: '🚀 Test Project - Main Implementation',
                description: expect.stringContaining('Test Project'),
                priority: 1,
                complexity: 'High',
                labels: ['project', 'main-issue'],
                requirements: [],
                acceptanceCriteria: [],
                technicalSpecs: undefined
            });

            expect(mockLinearClient.createSubIssue).toHaveBeenCalledTimes(2);
            expect(result.mainIssue).toEqual(mockMainIssue);
            expect(result.subIssues).toHaveLength(2);
            expect(result.subIssues[0]).toEqual(mockSubIssue1);
            expect(result.subIssues[1]).toEqual(mockSubIssue2);
        });

        it('should store issue mappings in database', async () => {
            const mockMainIssue = { id: 'main-1', title: 'Main Issue' };
            const mockSubIssue = { id: 'sub-1', title: 'Sub Issue' };

            mockLinearClient.createTaskIssue.mockResolvedValue(mockMainIssue);
            mockLinearClient.createSubIssue.mockResolvedValue(mockSubIssue);
            mockLinearClient.getCodegenUserId.mockResolvedValue('codegen-user-id');

            const projectData = {
                id: 'project-1',
                name: 'Test Project',
                tasks: [{ id: 'task-1', title: 'Task 1' }]
            };

            await orchestrator.createProjectIssues(projectData);

            expect(mockDatabase.query).toHaveBeenCalledTimes(2);
            expect(mockDatabase.query).toHaveBeenCalledWith(
                'INSERT INTO linear_issue_mappings (issue_id, mapping_data, created_at) VALUES ($1, $2, $3)',
                ['sub-1', expect.stringContaining('project-1'), expect.any(Date)]
            );
        });

        it('should start progress monitoring', async () => {
            const mockMainIssue = { id: 'main-1', title: 'Main Issue' };
            mockLinearClient.createTaskIssue.mockResolvedValue(mockMainIssue);

            const startMonitoringSpy = jest.spyOn(orchestrator, 'startProgressMonitoring');

            const projectData = {
                name: 'Test Project',
                tasks: []
            };

            await orchestrator.createProjectIssues(projectData);

            expect(startMonitoringSpy).toHaveBeenCalledWith('main-1');
        });
    });

    describe('validateSubIssueProgress', () => {
        it('should calculate progress correctly', async () => {
            const mockSubIssues = [
                { id: 'sub-1', title: 'Sub 1', state: { name: 'Done', type: 'completed' } },
                { id: 'sub-2', title: 'Sub 2', state: { name: 'In Progress', type: 'started' } },
                { id: 'sub-3', title: 'Sub 3', state: { name: 'Todo', type: 'unstarted' } }
            ];

            mockLinearClient.getSubIssues.mockResolvedValue(mockSubIssues);

            const result = await orchestrator.validateSubIssueProgress('main-1');

            expect(result.total).toBe(3);
            expect(result.completed).toBe(1);
            expect(result.inProgress).toBe(1);
            expect(result.todo).toBe(1);
            expect(result.progress).toBeCloseTo(33.33, 2);
        });

        it('should handle main issue completion', async () => {
            const mockSubIssues = [
                { id: 'sub-1', title: 'Sub 1', state: { name: 'Done', type: 'completed' } },
                { id: 'sub-2', title: 'Sub 2', state: { name: 'Done', type: 'completed' } }
            ];

            mockLinearClient.getSubIssues.mockResolvedValue(mockSubIssues);

            const handleCompletionSpy = jest.spyOn(orchestrator, 'handleMainIssueCompletion');

            await orchestrator.validateSubIssueProgress('main-1');

            expect(handleCompletionSpy).toHaveBeenCalledWith('main-1');
        });

        it('should update main issue with progress', async () => {
            const mockSubIssues = [
                { id: 'sub-1', title: 'Sub 1', state: { name: 'Done', type: 'completed' } }
            ];

            mockLinearClient.getSubIssues.mockResolvedValue(mockSubIssues);

            const updateProgressSpy = jest.spyOn(orchestrator, 'updateMainIssueProgress');

            await orchestrator.validateSubIssueProgress('main-1');

            expect(updateProgressSpy).toHaveBeenCalledWith('main-1', expect.objectContaining({
                total: 1,
                completed: 1,
                progress: 100
            }));
        });
    });

    describe('handleMainIssueCompletion', () => {
        it('should update issue status and add comment', async () => {
            await orchestrator.handleMainIssueCompletion('main-1');

            expect(mockLinearClient.updateIssue).toHaveBeenCalledWith('main-1', {
                status: 'completed'
            });

            expect(mockLinearClient.createComment).toHaveBeenCalledWith(
                'main-1',
                expect.stringContaining('Project Completed!')
            );
        });

        it('should stop progress monitoring', async () => {
            const stopMonitoringSpy = jest.spyOn(orchestrator, 'stopProgressMonitoring');

            await orchestrator.handleMainIssueCompletion('main-1');

            expect(stopMonitoringSpy).toHaveBeenCalledWith('main-1');
        });

        it('should trigger completion workflow', async () => {
            const triggerWorkflowSpy = jest.spyOn(orchestrator, 'triggerCompletionWorkflow');

            await orchestrator.handleMainIssueCompletion('main-1');

            expect(triggerWorkflowSpy).toHaveBeenCalledWith('main-1');
        });
    });

    describe('handleErrorsAndRestructure', () => {
        it('should create restructure sub-issue', async () => {
            const mockOriginalIssue = { id: 'issue-1', title: 'Original Issue' };
            const mockRestructureIssue = { id: 'restructure-1', title: 'Restructure Issue' };

            mockLinearClient.getIssue.mockResolvedValue(mockOriginalIssue);
            mockLinearClient.createSubIssue.mockResolvedValue(mockRestructureIssue);
            mockLinearClient.getCodegenUserId.mockResolvedValue('codegen-user-id');

            const errors = [
                { message: 'Syntax error', type: 'syntax', file: 'test.js', line: 10 },
                { message: 'Type error', type: 'type', file: 'test.js', line: 20 }
            ];

            const result = await orchestrator.handleErrorsAndRestructure('issue-1', errors);

            expect(mockLinearClient.createSubIssue).toHaveBeenCalledWith('issue-1', {
                title: '🔧 Restructure: Original Issue',
                description: expect.stringContaining('Error Analysis'),
                priority: 1,
                assigneeId: 'codegen-user-id'
            });

            expect(result.originalIssueId).toBe('issue-1');
            expect(result.restructureIssue).toEqual(mockRestructureIssue);
            expect(result.errors).toEqual(errors);
        });

        it('should update original issue status', async () => {
            const mockOriginalIssue = { id: 'issue-1', title: 'Original Issue' };
            const mockRestructureIssue = { id: 'restructure-1' };

            mockLinearClient.getIssue.mockResolvedValue(mockOriginalIssue);
            mockLinearClient.createSubIssue.mockResolvedValue(mockRestructureIssue);
            mockLinearClient.getCodegenUserId.mockResolvedValue('codegen-user-id');

            const errors = [{ message: 'Error', type: 'error' }];

            await orchestrator.handleErrorsAndRestructure('issue-1', errors);

            expect(mockLinearClient.updateIssue).toHaveBeenCalledWith('issue-1', {
                status: 'needs-restructure'
            });
        });

        it('should add explanatory comment', async () => {
            const mockOriginalIssue = { id: 'issue-1', title: 'Original Issue' };
            const mockRestructureIssue = { id: 'restructure-1', identifier: 'TEST-123' };

            mockLinearClient.getIssue.mockResolvedValue(mockOriginalIssue);
            mockLinearClient.createSubIssue.mockResolvedValue(mockRestructureIssue);
            mockLinearClient.getCodegenUserId.mockResolvedValue('codegen-user-id');

            const errors = [{ message: 'Error', type: 'error' }];

            await orchestrator.handleErrorsAndRestructure('issue-1', errors);

            expect(mockLinearClient.createComment).toHaveBeenCalledWith(
                'issue-1',
                expect.stringContaining('Restructure Required')
            );
        });
    });

    describe('progress monitoring', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should start monitoring with interval', () => {
            orchestrator.startProgressMonitoring('main-1');

            expect(orchestrator.monitoringSessions.has('main-1')).toBe(true);
        });

        it('should not start duplicate monitoring', () => {
            orchestrator.startProgressMonitoring('main-1');
            orchestrator.startProgressMonitoring('main-1');

            expect(orchestrator.monitoringSessions.size).toBe(1);
        });

        it('should stop monitoring', () => {
            orchestrator.startProgressMonitoring('main-1');
            orchestrator.stopProgressMonitoring('main-1');

            expect(orchestrator.monitoringSessions.has('main-1')).toBe(false);
        });

        it('should validate progress on interval', async () => {
            const validateSpy = jest.spyOn(orchestrator, 'validateSubIssueProgress')
                .mockResolvedValue({});

            orchestrator.startProgressMonitoring('main-1');

            // Fast-forward time
            jest.advanceTimersByTime(30000);

            expect(validateSpy).toHaveBeenCalledWith('main-1');
        });
    });

    describe('generateMainIssueDescription', () => {
        it('should generate complete description', () => {
            const projectData = {
                name: 'Test Project',
                description: 'Project description',
                tasks: [
                    { title: 'Task 1', description: 'First task' },
                    { title: 'Task 2', description: 'Second task' }
                ],
                successCriteria: ['Criteria 1', 'Criteria 2'],
                id: 'project-123'
            };

            const result = orchestrator.generateMainIssueDescription(projectData);

            expect(result).toContain('# 🚀 Test Project - Autonomous Development Pipeline');
            expect(result).toContain('## 🎯 Objective');
            expect(result).toContain('Project description');
            expect(result).toContain('## 📋 Sub-Issues Breakdown');
            expect(result).toContain('1. **Task 1** - First task');
            expect(result).toContain('2. **Task 2** - Second task');
            expect(result).toContain('## 🔄 Workflow Status');
            expect(result).toContain('## 📈 Progress Tracking');
            expect(result).toContain('- **Total Sub-Issues**: 2');
            expect(result).toContain('## 🎯 Success Criteria');
            expect(result).toContain('- Criteria 1');
            expect(result).toContain('**Project ID**: project-123');
        });

        it('should handle minimal project data', () => {
            const projectData = {
                name: 'Simple Project'
            };

            const result = orchestrator.generateMainIssueDescription(projectData);

            expect(result).toContain('# 🚀 Simple Project - Autonomous Development Pipeline');
            expect(result).toContain('No description provided');
            expect(result).toContain('- **Total Sub-Issues**: 0');
        });
    });

    describe('event handling', () => {
        it('should emit projectIssuesCreated event', async () => {
            const mockMainIssue = { id: 'main-1', title: 'Main Issue' };
            mockLinearClient.createTaskIssue.mockResolvedValue(mockMainIssue);

            const eventSpy = jest.fn();
            orchestrator.on('projectIssuesCreated', eventSpy);

            const projectData = { name: 'Test Project', tasks: [] };
            const result = await orchestrator.createProjectIssues(projectData);

            expect(eventSpy).toHaveBeenCalledWith(result);
        });

        it('should emit progressValidated event', async () => {
            const mockSubIssues = [];
            mockLinearClient.getSubIssues.mockResolvedValue(mockSubIssues);

            const eventSpy = jest.fn();
            orchestrator.on('progressValidated', eventSpy);

            await orchestrator.validateSubIssueProgress('main-1');

            expect(eventSpy).toHaveBeenCalledWith({
                mainIssueId: 'main-1',
                progressData: expect.any(Object)
            });
        });

        it('should emit restructureCreated event', async () => {
            const mockOriginalIssue = { id: 'issue-1', title: 'Original Issue' };
            const mockRestructureIssue = { id: 'restructure-1' };

            mockLinearClient.getIssue.mockResolvedValue(mockOriginalIssue);
            mockLinearClient.createSubIssue.mockResolvedValue(mockRestructureIssue);
            mockLinearClient.getCodegenUserId.mockResolvedValue('codegen-user-id');

            const eventSpy = jest.fn();
            orchestrator.on('restructureCreated', eventSpy);

            const errors = [{ message: 'Error' }];
            await orchestrator.handleErrorsAndRestructure('issue-1', errors);

            expect(eventSpy).toHaveBeenCalledWith({
                originalIssueId: 'issue-1',
                restructureIssue: mockRestructureIssue,
                errors
            });
        });
    });

    describe('cleanup', () => {
        it('should clear all monitoring sessions', () => {
            orchestrator.startProgressMonitoring('main-1');
            orchestrator.startProgressMonitoring('main-2');

            expect(orchestrator.monitoringSessions.size).toBe(2);

            orchestrator.cleanup();

            expect(orchestrator.monitoringSessions.size).toBe(0);
        });

        it('should remove all event listeners', () => {
            const removeAllListenersSpy = jest.spyOn(orchestrator, 'removeAllListeners');

            orchestrator.cleanup();

            expect(removeAllListenersSpy).toHaveBeenCalled();
        });
    });
});

