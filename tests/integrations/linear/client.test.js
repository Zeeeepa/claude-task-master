import { jest } from '@jest/globals';
import { LinearIntegration } from '../../../src/integrations/linear/client.js';

// Mock the Linear SDK
jest.mock('@linear/sdk', () => ({
    LinearClient: jest.fn().mockImplementation(() => ({
        createIssue: jest.fn(),
        updateIssue: jest.fn(),
        createComment: jest.fn(),
        issue: jest.fn(),
        issues: jest.fn(),
        issueLabels: jest.fn(),
        createIssueLabel: jest.fn(),
        workflowStates: jest.fn(),
        users: jest.fn(),
        viewer: jest.fn()
    }))
}));

describe('LinearIntegration', () => {
    let linearIntegration;
    let mockClient;

    beforeEach(() => {
        jest.clearAllMocks();
        linearIntegration = new LinearIntegration('test-api-key', 'test-team-id');
        mockClient = linearIntegration.client;
    });

    describe('constructor', () => {
        it('should create instance with required parameters', () => {
            expect(linearIntegration.teamId).toBe('test-team-id');
            expect(linearIntegration.options.retryAttempts).toBe(3);
        });

        it('should throw error without API key', () => {
            expect(() => new LinearIntegration()).toThrow('Linear API key is required');
        });

        it('should accept custom options', () => {
            const customOptions = { retryAttempts: 5, retryDelay: 2000 };
            const integration = new LinearIntegration('test-key', 'test-team', customOptions);
            
            expect(integration.options.retryAttempts).toBe(5);
            expect(integration.options.retryDelay).toBe(2000);
        });
    });

    describe('createTaskIssue', () => {
        it('should create issue with basic data', async () => {
            const mockIssue = { id: 'issue-1', title: 'Test Issue' };
            mockClient.createIssue.mockResolvedValue(mockIssue);

            const taskData = {
                title: 'Test Task',
                description: 'Test description',
                complexity: 'Medium'
            };

            const result = await linearIntegration.createTaskIssue(taskData);

            expect(mockClient.createIssue).toHaveBeenCalledWith({
                teamId: 'test-team-id',
                title: 'Test Task',
                description: expect.stringContaining('Test Task'),
                priority: 3, // Medium complexity maps to priority 3
                assigneeId: undefined,
                labelIds: []
            });

            expect(result).toEqual(mockIssue);
        });

        it('should create sub-issues when subtasks provided', async () => {
            const mockMainIssue = { id: 'main-issue-1', title: 'Main Issue' };
            const mockSubIssue = { id: 'sub-issue-1', title: 'Sub Issue' };
            
            mockClient.createIssue
                .mockResolvedValueOnce(mockMainIssue)
                .mockResolvedValueOnce(mockSubIssue);

            const taskData = {
                title: 'Main Task',
                subtasks: [
                    { title: 'Subtask 1', description: 'First subtask' }
                ]
            };

            const result = await linearIntegration.createTaskIssue(taskData);

            expect(mockClient.createIssue).toHaveBeenCalledTimes(2);
            expect(result.subIssues).toHaveLength(1);
            expect(result.subIssues[0]).toEqual(mockSubIssue);
        });

        it('should handle errors gracefully', async () => {
            mockClient.createIssue.mockRejectedValue(new Error('API Error'));

            const taskData = { title: 'Test Task' };

            await expect(linearIntegration.createTaskIssue(taskData))
                .rejects.toThrow('Failed to create task issue: API Error');
        });
    });

    describe('createSubIssue', () => {
        it('should create sub-issue with parent reference', async () => {
            const mockSubIssue = { id: 'sub-issue-1', title: '📋 Sub Task' };
            mockClient.createIssue.mockResolvedValue(mockSubIssue);
            
            // Mock getCodegenUserId
            linearIntegration.getCodegenUserId = jest.fn().mockResolvedValue('codegen-user-id');

            const subtaskData = {
                title: 'Sub Task',
                description: 'Sub task description'
            };

            const result = await linearIntegration.createSubIssue('parent-id', subtaskData);

            expect(mockClient.createIssue).toHaveBeenCalledWith({
                teamId: 'test-team-id',
                title: '📋 Sub Task',
                description: expect.stringContaining('Sub Task'),
                parentId: 'parent-id',
                priority: 0,
                assigneeId: 'codegen-user-id'
            });

            expect(result).toEqual(mockSubIssue);
        });
    });

    describe('updateIssue', () => {
        it('should update issue with provided data', async () => {
            const mockUpdatedIssue = { id: 'issue-1', title: 'Updated Issue' };
            mockClient.updateIssue.mockResolvedValue(mockUpdatedIssue);

            const updates = { title: 'Updated Title' };
            const result = await linearIntegration.updateIssue('issue-1', updates);

            expect(mockClient.updateIssue).toHaveBeenCalledWith('issue-1', updates);
            expect(result).toEqual(mockUpdatedIssue);
        });

        it('should convert status to stateId', async () => {
            const mockUpdatedIssue = { id: 'issue-1', title: 'Updated Issue' };
            mockClient.updateIssue.mockResolvedValue(mockUpdatedIssue);
            
            // Mock getStateIdByName
            linearIntegration.getStateIdByName = jest.fn().mockResolvedValue('state-id-123');

            const updates = { status: 'In Progress' };
            await linearIntegration.updateIssue('issue-1', updates);

            expect(linearIntegration.getStateIdByName).toHaveBeenCalledWith('In Progress');
            expect(mockClient.updateIssue).toHaveBeenCalledWith('issue-1', {
                stateId: 'state-id-123'
            });
        });
    });

    describe('createComment', () => {
        it('should create comment on issue', async () => {
            const mockComment = { id: 'comment-1', body: 'Test comment' };
            mockClient.createComment.mockResolvedValue(mockComment);

            const result = await linearIntegration.createComment('issue-1', 'Test comment');

            expect(mockClient.createComment).toHaveBeenCalledWith({
                issueId: 'issue-1',
                body: 'Test comment'
            });

            expect(result).toEqual(mockComment);
        });
    });

    describe('getOrCreateLabels', () => {
        it('should return empty array for no labels', async () => {
            const result = await linearIntegration.getOrCreateLabels([]);
            expect(result).toEqual([]);
        });

        it('should return existing label IDs', async () => {
            const mockLabels = {
                nodes: [{ id: 'label-1', name: 'bug' }]
            };
            mockClient.issueLabels.mockResolvedValue(mockLabels);

            const result = await linearIntegration.getOrCreateLabels(['bug']);

            expect(mockClient.issueLabels).toHaveBeenCalledWith({
                filter: { name: { eq: 'bug' } }
            });
            expect(result).toEqual(['label-1']);
        });

        it('should create new labels if they do not exist', async () => {
            const mockEmptyLabels = { nodes: [] };
            const mockNewLabel = { id: 'new-label-1', name: 'feature' };
            
            mockClient.issueLabels.mockResolvedValue(mockEmptyLabels);
            mockClient.createIssueLabel.mockResolvedValue(mockNewLabel);

            const result = await linearIntegration.getOrCreateLabels(['feature']);

            expect(mockClient.createIssueLabel).toHaveBeenCalledWith({
                name: 'feature',
                teamId: 'test-team-id'
            });
            expect(result).toEqual(['new-label-1']);
        });
    });

    describe('mapComplexityToPriority', () => {
        it('should map complexity levels to correct priorities', () => {
            expect(linearIntegration.mapComplexityToPriority('Low')).toBe(4);
            expect(linearIntegration.mapComplexityToPriority('Medium')).toBe(3);
            expect(linearIntegration.mapComplexityToPriority('High')).toBe(2);
            expect(linearIntegration.mapComplexityToPriority('Critical')).toBe(1);
            expect(linearIntegration.mapComplexityToPriority('Urgent')).toBe(0);
            expect(linearIntegration.mapComplexityToPriority('Unknown')).toBe(3);
        });
    });

    describe('formatTaskDescription', () => {
        it('should format task description with all sections', () => {
            const taskData = {
                title: 'Test Task',
                description: 'Task description',
                requirements: ['Req 1', 'Req 2'],
                acceptanceCriteria: ['Criteria 1', 'Criteria 2'],
                technicalSpecs: 'Technical specifications',
                dependencies: ['Dep 1'],
                complexity: 'High'
            };

            const result = linearIntegration.formatTaskDescription(taskData);

            expect(result).toContain('# 🎯 Test Task');
            expect(result).toContain('## 📋 Description');
            expect(result).toContain('Task description');
            expect(result).toContain('## ✅ Requirements');
            expect(result).toContain('- Req 1');
            expect(result).toContain('## 🎯 Acceptance Criteria');
            expect(result).toContain('- [ ] Criteria 1');
            expect(result).toContain('## 🔧 Technical Specifications');
            expect(result).toContain('Technical specifications');
            expect(result).toContain('## 🔗 Dependencies');
            expect(result).toContain('- Dep 1');
            expect(result).toContain('**Complexity**: High');
        });

        it('should handle minimal task data', () => {
            const taskData = { title: 'Simple Task' };
            const result = linearIntegration.formatTaskDescription(taskData);

            expect(result).toContain('# 🎯 Simple Task');
            expect(result).toContain('**Complexity**: Medium');
        });
    });

    describe('healthCheck', () => {
        it('should return true for successful health check', async () => {
            mockClient.viewer = Promise.resolve({ id: 'user-1' });

            const result = await linearIntegration.healthCheck();
            expect(result).toBe(true);
        });

        it('should return false for failed health check', async () => {
            mockClient.viewer = Promise.reject(new Error('API Error'));

            const result = await linearIntegration.healthCheck();
            expect(result).toBe(false);
        });
    });

    describe('event emission', () => {
        it('should emit issueCreated event', async () => {
            const mockIssue = { id: 'issue-1', title: 'Test Issue' };
            mockClient.createIssue.mockResolvedValue(mockIssue);

            const eventSpy = jest.fn();
            linearIntegration.on('issueCreated', eventSpy);

            const taskData = { title: 'Test Task' };
            await linearIntegration.createTaskIssue(taskData);

            expect(eventSpy).toHaveBeenCalledWith({
                issue: mockIssue,
                taskData
            });
        });

        it('should emit error event on failure', async () => {
            mockClient.createIssue.mockRejectedValue(new Error('API Error'));

            const errorSpy = jest.fn();
            linearIntegration.on('error', errorSpy);

            const taskData = { title: 'Test Task' };
            
            try {
                await linearIntegration.createTaskIssue(taskData);
            } catch (error) {
                // Expected to throw
            }

            expect(errorSpy).toHaveBeenCalledWith({
                operation: 'createTaskIssue',
                error: expect.any(Error),
                taskData
            });
        });
    });

    describe('cache functionality', () => {
        it('should cache label IDs', async () => {
            const mockLabels = {
                nodes: [{ id: 'label-1', name: 'bug' }]
            };
            mockClient.issueLabels.mockResolvedValue(mockLabels);

            // First call
            await linearIntegration.getOrCreateLabels(['bug']);
            
            // Second call should use cache
            await linearIntegration.getOrCreateLabels(['bug']);

            expect(mockClient.issueLabels).toHaveBeenCalledTimes(1);
        });

        it('should clear cache', () => {
            linearIntegration.cache.labels.set('test', 'value');
            linearIntegration.clearCache();
            
            expect(linearIntegration.cache.labels.size).toBe(0);
        });
    });
});

