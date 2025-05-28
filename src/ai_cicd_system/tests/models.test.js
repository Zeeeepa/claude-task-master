/**
 * @fileoverview Model Unit Tests
 * @description Unit tests for database models
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { TaskModel } from '../database/models/task_model.js';
import { ContextModel } from '../database/models/context_model.js';
import { WorkflowModel } from '../database/models/workflow_model.js';

// Mock database manager for unit testing
class MockDatabaseManager {
    constructor() {
        this.queries = [];
        this.mockResults = new Map();
    }

    async query(text, params = []) {
        this.queries.push({ text, params });
        
        const key = this._normalizeQuery(text);
        const mockResult = this.mockResults.get(key);
        
        if (mockResult) {
            return mockResult;
        }
        
        // Default mock responses
        if (text.includes('INSERT') && text.includes('RETURNING')) {
            return {
                rows: [{
                    id: 'mock_id_' + Date.now(),
                    title: params[0] || 'Mock Title',
                    status: 'pending',
                    created_at: new Date(),
                    updated_at: new Date()
                }],
                rowCount: 1
            };
        }
        
        if (text.includes('SELECT') && text.includes('WHERE id =')) {
            return {
                rows: [{
                    id: params[0],
                    title: 'Mock Task',
                    status: 'pending',
                    created_at: new Date(),
                    updated_at: new Date()
                }],
                rowCount: 1
            };
        }
        
        if (text.includes('UPDATE') && text.includes('RETURNING')) {
            return {
                rows: [{
                    id: params[params.length - 1],
                    status: params[0],
                    updated_at: new Date()
                }],
                rowCount: 1
            };
        }
        
        return { rows: [], rowCount: 0 };
    }

    setMockResult(queryPattern, result) {
        this.mockResults.set(this._normalizeQuery(queryPattern), result);
    }

    getLastQuery() {
        return this.queries[this.queries.length - 1];
    }

    clearQueries() {
        this.queries = [];
    }

    _normalizeQuery(query) {
        return query.replace(/\s+/g, ' ').trim().toLowerCase();
    }
}

describe('TaskModel Unit Tests', () => {
    let taskModel;
    let mockDb;

    beforeEach(() => {
        mockDb = new MockDatabaseManager();
        taskModel = new TaskModel(mockDb);
    });

    describe('create', () => {
        test('should create task with all fields', async () => {
            const taskData = {
                title: 'Test Task',
                description: 'Test description',
                requirements: ['Req 1', 'Req 2'],
                acceptanceCriteria: ['Criteria 1'],
                complexityScore: 7,
                priority: 1,
                dependencies: ['dep1'],
                metadata: { source: 'test' },
                affectedFiles: ['file1.js'],
                assignedTo: 'user1',
                tags: ['tag1', 'tag2'],
                estimatedHours: 8.5
            };

            const result = await taskModel.create(taskData);

            expect(result).toHaveProperty('id');
            expect(result.title).toBe(taskData.title);
            
            const lastQuery = mockDb.getLastQuery();
            expect(lastQuery.text).toContain('INSERT INTO tasks');
            expect(lastQuery.params[0]).toBe(taskData.title);
            expect(lastQuery.params[1]).toBe(taskData.description);
        });

        test('should create task with minimal data', async () => {
            const taskData = {
                title: 'Minimal Task'
            };

            const result = await taskModel.create(taskData);

            expect(result).toHaveProperty('id');
            expect(result.title).toBe(taskData.title);
            
            const lastQuery = mockDb.getLastQuery();
            expect(lastQuery.params[4]).toBe(5); // default complexity score
            expect(lastQuery.params[5]).toBe(0); // default priority
        });

        test('should handle JSON serialization', async () => {
            const taskData = {
                title: 'JSON Test Task',
                requirements: ['Req 1', 'Req 2'],
                metadata: { complex: { nested: 'value' } }
            };

            await taskModel.create(taskData);

            const lastQuery = mockDb.getLastQuery();
            expect(lastQuery.params[2]).toBe(JSON.stringify(taskData.requirements));
            expect(lastQuery.params[7]).toBe(JSON.stringify(taskData.metadata));
        });
    });

    describe('findById', () => {
        test('should find existing task', async () => {
            const taskId = 'test_task_id';
            
            mockDb.setMockResult('select * from tasks where id = $1', {
                rows: [{
                    id: taskId,
                    title: 'Found Task',
                    description: 'Task description',
                    requirements: ['Req 1'],
                    acceptance_criteria: ['Criteria 1'],
                    complexity_score: 5,
                    status: 'pending',
                    priority: 0,
                    dependencies: [],
                    metadata: {},
                    affected_files: [],
                    assigned_to: null,
                    tags: [],
                    estimated_hours: null,
                    actual_hours: null,
                    created_at: new Date(),
                    updated_at: new Date(),
                    completed_at: null
                }],
                rowCount: 1
            });

            const result = await taskModel.findById(taskId);

            expect(result).toBeDefined();
            expect(result.id).toBe(taskId);
            expect(result.title).toBe('Found Task');
            expect(result.requirements).toEqual(['Req 1']);
        });

        test('should return null for non-existent task', async () => {
            mockDb.setMockResult('select * from tasks where id = $1', {
                rows: [],
                rowCount: 0
            });

            const result = await taskModel.findById('non_existent');

            expect(result).toBeNull();
        });
    });

    describe('updateStatus', () => {
        test('should update task status', async () => {
            const taskId = 'test_task_id';
            const newStatus = 'in_progress';

            mockDb.setMockResult('update tasks set status = $1, completed_at = $2, updated_at = now() where id = $3 returning *', {
                rows: [{
                    id: taskId,
                    status: newStatus,
                    updated_at: new Date()
                }],
                rowCount: 1
            });

            const result = await taskModel.updateStatus(taskId, newStatus);

            expect(result).toBeDefined();
            expect(result.status).toBe(newStatus);
            
            const lastQuery = mockDb.getLastQuery();
            expect(lastQuery.params[0]).toBe(newStatus);
            expect(lastQuery.params[2]).toBe(taskId);
        });

        test('should set completed_at when status is completed', async () => {
            const taskId = 'test_task_id';
            const completedAt = new Date();

            await taskModel.updateStatus(taskId, 'completed', completedAt);

            const lastQuery = mockDb.getLastQuery();
            expect(lastQuery.params[1]).toBe(completedAt);
        });
    });

    describe('findByStatus', () => {
        test('should find tasks by status', async () => {
            const status = 'pending';
            
            mockDb.setMockResult('select * from tasks where status = $1 order by created_at desc limit $2 offset $3', {
                rows: [
                    { id: '1', title: 'Task 1', status },
                    { id: '2', title: 'Task 2', status }
                ],
                rowCount: 2
            });

            const result = await taskModel.findByStatus(status);

            expect(result).toHaveLength(2);
            expect(result[0].status).toBe(status);
            expect(result[1].status).toBe(status);
        });
    });

    describe('search', () => {
        test('should search tasks by text', async () => {
            const searchText = 'test search';
            
            mockDb.setMockResult('select *, ts_rank(to_tsvector', {
                rows: [
                    { id: '1', title: 'Test Search Task', rank: 0.8 }
                ],
                rowCount: 1
            });

            const result = await taskModel.search(searchText);

            expect(result).toHaveLength(1);
            expect(result[0].title).toBe('Test Search Task');
            
            const lastQuery = mockDb.getLastQuery();
            expect(lastQuery.params[0]).toBe(searchText);
        });
    });

    describe('getStatistics', () => {
        test('should return task statistics', async () => {
            mockDb.setMockResult('select count(*) as total_tasks', {
                rows: [{
                    total_tasks: '10',
                    pending_tasks: '3',
                    in_progress_tasks: '2',
                    completed_tasks: '4',
                    failed_tasks: '1',
                    blocked_tasks: '0',
                    avg_complexity: '6.5',
                    total_estimated_hours: '80.5',
                    total_actual_hours: '75.0',
                    avg_estimation_accuracy: '0.93'
                }],
                rowCount: 1
            });

            const result = await taskModel.getStatistics();

            expect(result.totalTasks).toBe(10);
            expect(result.pendingTasks).toBe(3);
            expect(result.completedTasks).toBe(4);
            expect(result.avgComplexity).toBe(6.5);
            expect(result.avgEstimationAccuracy).toBe(0.93);
        });
    });

    describe('transformRow', () => {
        test('should transform database row to application object', () => {
            const dbRow = {
                id: 'test_id',
                title: 'Test Task',
                description: 'Description',
                requirements: ['Req 1'],
                acceptance_criteria: ['Criteria 1'],
                complexity_score: 7,
                status: 'pending',
                priority: 1,
                dependencies: [],
                metadata: { source: 'test' },
                affected_files: ['file1.js'],
                assigned_to: 'user1',
                tags: ['tag1'],
                estimated_hours: 8.5,
                actual_hours: 7.0,
                created_at: new Date('2023-01-01'),
                updated_at: new Date('2023-01-02'),
                completed_at: new Date('2023-01-03')
            };

            const result = taskModel.transformRow(dbRow);

            expect(result.id).toBe(dbRow.id);
            expect(result.title).toBe(dbRow.title);
            expect(result.acceptanceCriteria).toEqual(dbRow.acceptance_criteria);
            expect(result.complexityScore).toBe(dbRow.complexity_score);
            expect(result.affectedFiles).toEqual(dbRow.affected_files);
            expect(result.assignedTo).toBe(dbRow.assigned_to);
            expect(result.estimatedHours).toBe(dbRow.estimated_hours);
            expect(result.actualHours).toBe(dbRow.actual_hours);
            expect(result.createdAt).toBe(dbRow.created_at);
            expect(result.updatedAt).toBe(dbRow.updated_at);
            expect(result.completedAt).toBe(dbRow.completed_at);
        });
    });
});

describe('ContextModel Unit Tests', () => {
    let contextModel;
    let mockDb;

    beforeEach(() => {
        mockDb = new MockDatabaseManager();
        contextModel = new ContextModel(mockDb);
    });

    describe('create', () => {
        test('should create context entry', async () => {
            const taskId = 'test_task_id';
            const contextType = 'ai_interaction';
            const contextData = { agent: 'test_agent', response: 'test_response' };
            const metadata = { version: '1.0' };

            mockDb.setMockResult('insert into contexts', {
                rows: [{
                    id: 'context_id',
                    task_id: taskId,
                    context_type: contextType,
                    context_data: contextData,
                    metadata: metadata,
                    created_at: new Date(),
                    updated_at: new Date()
                }],
                rowCount: 1
            });

            const result = await contextModel.create(taskId, contextType, contextData, metadata);

            expect(result).toHaveProperty('id');
            expect(result.taskId).toBe(taskId);
            expect(result.contextType).toBe(contextType);
            
            const lastQuery = mockDb.getLastQuery();
            expect(lastQuery.params[0]).toBe(taskId);
            expect(lastQuery.params[1]).toBe(contextType);
            expect(lastQuery.params[2]).toBe(JSON.stringify(contextData));
            expect(lastQuery.params[3]).toBe(JSON.stringify(metadata));
        });
    });

    describe('findByTaskId', () => {
        test('should find contexts for a task', async () => {
            const taskId = 'test_task_id';
            
            mockDb.setMockResult('select * from contexts where task_id = $1', {
                rows: [
                    {
                        id: 'ctx1',
                        task_id: taskId,
                        context_type: 'validation',
                        context_data: { score: 95 },
                        metadata: {},
                        created_at: new Date(),
                        updated_at: new Date()
                    },
                    {
                        id: 'ctx2',
                        task_id: taskId,
                        context_type: 'ai_interaction',
                        context_data: { agent: 'test' },
                        metadata: {},
                        created_at: new Date(),
                        updated_at: new Date()
                    }
                ],
                rowCount: 2
            });

            const result = await contextModel.findByTaskId(taskId);

            expect(result).toHaveLength(2);
            expect(result[0].taskId).toBe(taskId);
            expect(result[1].taskId).toBe(taskId);
        });

        test('should filter by context type', async () => {
            const taskId = 'test_task_id';
            const contextType = 'validation';

            await contextModel.findByTaskId(taskId, contextType);

            const lastQuery = mockDb.getLastQuery();
            expect(lastQuery.text).toContain('AND context_type = $2');
            expect(lastQuery.params[1]).toBe(contextType);
        });
    });

    describe('getTaskContextStats', () => {
        test('should return context statistics', async () => {
            const taskId = 'test_task_id';
            
            mockDb.setMockResult('select context_type, count(*) as count', {
                rows: [
                    {
                        context_type: 'validation',
                        count: '3',
                        first_created: new Date('2023-01-01'),
                        last_created: new Date('2023-01-03')
                    },
                    {
                        context_type: 'ai_interaction',
                        count: '2',
                        first_created: new Date('2023-01-02'),
                        last_created: new Date('2023-01-04')
                    }
                ],
                rowCount: 2
            });

            const result = await contextModel.getTaskContextStats(taskId);

            expect(result.totalContexts).toBe(5);
            expect(result.contextTypes.validation.count).toBe(3);
            expect(result.contextTypes.ai_interaction.count).toBe(2);
            expect(result.firstContext).toEqual(new Date('2023-01-01'));
            expect(result.lastContext).toEqual(new Date('2023-01-04'));
        });
    });

    describe('transformRow', () => {
        test('should transform database row to application object', () => {
            const dbRow = {
                id: 'context_id',
                task_id: 'task_id',
                context_type: 'validation',
                context_data: { score: 95 },
                metadata: { version: '1.0' },
                created_at: new Date('2023-01-01'),
                updated_at: new Date('2023-01-02')
            };

            const result = contextModel.transformRow(dbRow);

            expect(result.id).toBe(dbRow.id);
            expect(result.taskId).toBe(dbRow.task_id);
            expect(result.contextType).toBe(dbRow.context_type);
            expect(result.contextData).toEqual(dbRow.context_data);
            expect(result.metadata).toEqual(dbRow.metadata);
            expect(result.createdAt).toBe(dbRow.created_at);
            expect(result.updatedAt).toBe(dbRow.updated_at);
        });
    });
});

describe('WorkflowModel Unit Tests', () => {
    let workflowModel;
    let mockDb;

    beforeEach(() => {
        mockDb = new MockDatabaseManager();
        workflowModel = new WorkflowModel(mockDb);
    });

    describe('create', () => {
        test('should create workflow', async () => {
            const workflowData = {
                name: 'Test Workflow',
                status: 'pending',
                configuration: { max_tasks: 5 },
                state: { step: 1 },
                taskIds: ['task1', 'task2'],
                metadata: { created_by: 'user1' }
            };

            mockDb.setMockResult('insert into workflows', {
                rows: [{
                    id: 'workflow_id',
                    name: workflowData.name,
                    status: workflowData.status,
                    configuration: workflowData.configuration,
                    state: workflowData.state,
                    task_ids: workflowData.taskIds,
                    metadata: workflowData.metadata,
                    created_at: new Date(),
                    updated_at: new Date(),
                    completed_at: null
                }],
                rowCount: 1
            });

            const result = await workflowModel.create(workflowData);

            expect(result).toHaveProperty('id');
            expect(result.name).toBe(workflowData.name);
            expect(result.taskIds).toEqual(workflowData.taskIds);
            
            const lastQuery = mockDb.getLastQuery();
            expect(lastQuery.params[0]).toBe(workflowData.name);
            expect(lastQuery.params[4]).toBe(JSON.stringify(workflowData.taskIds));
        });
    });

    describe('addTask', () => {
        test('should add task to workflow', async () => {
            const workflowId = 'workflow_id';
            const taskId = 'new_task_id';

            mockDb.setMockResult('update workflows set task_ids = task_ids || $1::jsonb', {
                rows: [{
                    id: workflowId,
                    task_ids: ['existing_task', taskId]
                }],
                rowCount: 1
            });

            const result = await workflowModel.addTask(workflowId, taskId);

            expect(result).toBeDefined();
            
            const lastQuery = mockDb.getLastQuery();
            expect(lastQuery.params[0]).toBe(JSON.stringify([taskId]));
            expect(lastQuery.params[1]).toBe(workflowId);
            expect(lastQuery.params[2]).toBe(taskId);
        });
    });

    describe('removeTask', () => {
        test('should remove task from workflow', async () => {
            const workflowId = 'workflow_id';
            const taskId = 'task_to_remove';

            mockDb.setMockResult('update workflows set task_ids = task_ids - $1', {
                rows: [{
                    id: workflowId,
                    task_ids: ['remaining_task']
                }],
                rowCount: 1
            });

            const result = await workflowModel.removeTask(workflowId, taskId);

            expect(result).toBeDefined();
            
            const lastQuery = mockDb.getLastQuery();
            expect(lastQuery.params[0]).toBe(taskId);
            expect(lastQuery.params[1]).toBe(workflowId);
        });
    });

    describe('getProgress', () => {
        test('should calculate workflow progress', async () => {
            const workflowId = 'workflow_id';
            
            // Mock workflow retrieval
            mockDb.setMockResult('select * from workflows where id = $1', {
                rows: [{
                    id: workflowId,
                    name: 'Test Workflow',
                    task_ids: ['task1', 'task2', 'task3']
                }],
                rowCount: 1
            });

            // Mock task statistics query
            mockDb.setMockResult('select count(*) as total', {
                rows: [{
                    total: '3',
                    completed: '2',
                    in_progress: '1',
                    pending: '0',
                    failed: '0'
                }],
                rowCount: 1
            });

            const result = await workflowModel.getProgress(workflowId);

            expect(result.workflowId).toBe(workflowId);
            expect(result.totalTasks).toBe(3);
            expect(result.completedTasks).toBe(2);
            expect(result.progressPercentage).toBe(67); // Math.round((2/3) * 100)
        });

        test('should handle empty workflow', async () => {
            const workflowId = 'empty_workflow_id';
            
            mockDb.setMockResult('select * from workflows where id = $1', {
                rows: [{
                    id: workflowId,
                    name: 'Empty Workflow',
                    task_ids: []
                }],
                rowCount: 1
            });

            const result = await workflowModel.getProgress(workflowId);

            expect(result.totalTasks).toBe(0);
            expect(result.progressPercentage).toBe(0);
        });
    });

    describe('transformRow', () => {
        test('should transform database row to application object', () => {
            const dbRow = {
                id: 'workflow_id',
                name: 'Test Workflow',
                status: 'running',
                configuration: { max_tasks: 5 },
                state: { current_step: 2 },
                task_ids: ['task1', 'task2'],
                metadata: { created_by: 'user1' },
                created_at: new Date('2023-01-01'),
                updated_at: new Date('2023-01-02'),
                completed_at: null
            };

            const result = workflowModel.transformRow(dbRow);

            expect(result.id).toBe(dbRow.id);
            expect(result.name).toBe(dbRow.name);
            expect(result.status).toBe(dbRow.status);
            expect(result.configuration).toEqual(dbRow.configuration);
            expect(result.state).toEqual(dbRow.state);
            expect(result.taskIds).toEqual(dbRow.task_ids);
            expect(result.metadata).toEqual(dbRow.metadata);
            expect(result.createdAt).toBe(dbRow.created_at);
            expect(result.updatedAt).toBe(dbRow.updated_at);
            expect(result.completedAt).toBe(dbRow.completed_at);
        });
    });
});

