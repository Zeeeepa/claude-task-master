/**
 * @fileoverview OpenEvolve Orchestrator Tests
 * @description Unit tests for the OpenEvolve Central Orchestrator
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { OpenEvolveOrchestrator } from '../../src/orchestrator/openevolve-orchestrator.js';

// Mock dependencies
const mockDatabase = {
    createWorkflow: jest.fn(),
    updateWorkflow: jest.fn(),
    getWorkflow: jest.fn(),
    createTask: jest.fn(),
    getWorkflowTasks: jest.fn()
};

const mockLinearClient = {
    createIssue: jest.fn(),
    updateIssue: jest.fn(),
    addComment: jest.fn()
};

const mockCodegenClient = {
    assignTask: jest.fn(),
    getStatus: jest.fn()
};

const mockClaudeCodeClient = {
    validateDeployment: jest.fn(),
    getValidationResults: jest.fn()
};

describe('OpenEvolveOrchestrator', () => {
    let orchestrator;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();
        
        // Create orchestrator instance
        orchestrator = new OpenEvolveOrchestrator(
            mockDatabase,
            mockLinearClient,
            mockCodegenClient,
            mockClaudeCodeClient
        );
    });

    afterEach(async () => {
        if (orchestrator.isInitialized) {
            await orchestrator.shutdown();
        }
    });

    describe('Initialization', () => {
        test('should initialize successfully', async () => {
            await orchestrator.initialize();
            expect(orchestrator.isInitialized).toBe(true);
        });

        test('should not initialize twice', async () => {
            await orchestrator.initialize();
            await orchestrator.initialize(); // Should not throw
            expect(orchestrator.isInitialized).toBe(true);
        });

        test('should throw error when using uninitialized orchestrator', async () => {
            const requirementText = 'Create a simple web application';
            
            await expect(orchestrator.processRequirement(requirementText))
                .rejects.toThrow('OpenEvolve Orchestrator not initialized');
        });
    });

    describe('Requirement Processing', () => {
        beforeEach(async () => {
            await orchestrator.initialize();
        });

        test('should process simple requirement successfully', async () => {
            const requirementText = 'Create a simple web application with user authentication';
            const projectContext = { projectId: 'test-project' };

            // Mock database responses
            mockDatabase.createWorkflow.mockResolvedValue({
                id: 'workflow-123',
                status: 'initiated'
            });

            // Mock Linear responses
            mockLinearClient.createIssue.mockResolvedValue({
                id: 'issue-123',
                title: 'Main Issue'
            });

            const result = await orchestrator.processRequirement(requirementText, projectContext);

            expect(result).toBeDefined();
            expect(result.workflow).toBeDefined();
            expect(result.mainIssue).toBeDefined();
            expect(mockDatabase.createWorkflow).toHaveBeenCalled();
            expect(mockLinearClient.createIssue).toHaveBeenCalled();
        });

        test('should handle complex requirements', async () => {
            const requirementText = `
                Create a microservices-based e-commerce platform with:
                - User authentication and authorization
                - Product catalog management
                - Shopping cart functionality
                - Payment processing integration
                - Order management system
                - Real-time notifications
                - Analytics dashboard
            `;
            const projectContext = { 
                projectId: 'ecommerce-project',
                technology: { primary: ['node.js', 'react', 'postgresql'] }
            };

            // Mock responses
            mockDatabase.createWorkflow.mockResolvedValue({
                id: 'workflow-456',
                status: 'initiated'
            });

            mockLinearClient.createIssue.mockResolvedValue({
                id: 'issue-456',
                title: 'E-commerce Platform'
            });

            const result = await orchestrator.processRequirement(requirementText, projectContext);

            expect(result).toBeDefined();
            expect(result.workflow).toBeDefined();
            expect(result.mainIssue).toBeDefined();
            expect(result.subIssues).toBeDefined();
            expect(result.subIssues.length).toBeGreaterThan(0);
        });

        test('should handle empty requirement text', async () => {
            const requirementText = '';
            
            await expect(orchestrator.processRequirement(requirementText))
                .rejects.toThrow();
        });
    });

    describe('Execution Planning', () => {
        beforeEach(async () => {
            await orchestrator.initialize();
        });

        test('should create execution plan with proper phases', async () => {
            const dependencyGraph = {
                nodes: [
                    { id: 'task-1', task: { id: 'task-1', type: 'setup', estimatedEffort: 1 } },
                    { id: 'task-2', task: { id: 'task-2', type: 'implementation', estimatedEffort: 5 } },
                    { id: 'task-3', task: { id: 'task-3', type: 'testing', estimatedEffort: 3 } }
                ],
                edges: [
                    { from: 'task-1', to: 'task-2', type: 'blocks' },
                    { from: 'task-2', to: 'task-3', type: 'blocks' }
                ]
            };

            const analysis = {
                originalText: 'Test requirement',
                insights: { features: [{ description: 'Test feature' }] }
            };

            const executionPlan = await orchestrator.createExecutionPlan(dependencyGraph, analysis);

            expect(executionPlan).toBeDefined();
            expect(executionPlan.id).toBeDefined();
            expect(executionPlan.phases).toBeDefined();
            expect(executionPlan.phases.length).toBeGreaterThan(0);
            expect(executionPlan.totalTasks).toBe(3);
            expect(executionPlan.estimatedDuration).toBeGreaterThan(0);
        });

        test('should handle circular dependencies', async () => {
            const dependencyGraph = {
                nodes: [
                    { id: 'task-1', task: { id: 'task-1', type: 'implementation' } },
                    { id: 'task-2', task: { id: 'task-2', type: 'implementation' } }
                ],
                edges: [
                    { from: 'task-1', to: 'task-2', type: 'blocks' },
                    { from: 'task-2', to: 'task-1', type: 'blocks' } // Circular dependency
                ]
            };

            const analysis = {
                originalText: 'Test requirement',
                insights: { features: [] }
            };

            await expect(orchestrator.createExecutionPlan(dependencyGraph, analysis))
                .rejects.toThrow('Circular dependency detected');
        });
    });

    describe('Topological Sort', () => {
        beforeEach(async () => {
            await orchestrator.initialize();
        });

        test('should sort tasks correctly', () => {
            const dependencyGraph = {
                nodes: [
                    { id: 'task-1', task: { id: 'task-1', title: 'Setup' } },
                    { id: 'task-2', task: { id: 'task-2', title: 'Implementation' } },
                    { id: 'task-3', task: { id: 'task-3', title: 'Testing' } }
                ],
                edges: [
                    { from: 'task-1', to: 'task-2', type: 'blocks' },
                    { from: 'task-2', to: 'task-3', type: 'blocks' }
                ]
            };

            const sortedTasks = orchestrator.topologicalSort(dependencyGraph);

            expect(sortedTasks).toHaveLength(3);
            expect(sortedTasks[0].title).toBe('Setup');
            expect(sortedTasks[1].title).toBe('Implementation');
            expect(sortedTasks[2].title).toBe('Testing');
        });

        test('should handle tasks with no dependencies', () => {
            const dependencyGraph = {
                nodes: [
                    { id: 'task-1', task: { id: 'task-1', title: 'Independent Task 1' } },
                    { id: 'task-2', task: { id: 'task-2', title: 'Independent Task 2' } }
                ],
                edges: []
            };

            const sortedTasks = orchestrator.topologicalSort(dependencyGraph);

            expect(sortedTasks).toHaveLength(2);
        });
    });

    describe('Phase Grouping', () => {
        beforeEach(async () => {
            await orchestrator.initialize();
        });

        test('should group tasks into phases correctly', () => {
            const sortedTasks = [
                { id: 'task-1', title: 'Setup', estimatedEffort: 1 },
                { id: 'task-2', title: 'Implementation', estimatedEffort: 5 },
                { id: 'task-3', title: 'Testing', estimatedEffort: 3 }
            ];

            const dependencyGraph = {
                edges: [
                    { from: 'task-1', to: 'task-2', type: 'blocks' },
                    { from: 'task-2', to: 'task-3', type: 'blocks' }
                ]
            };

            const phases = orchestrator.groupIntoPhases(sortedTasks, dependencyGraph);

            expect(phases).toHaveLength(3);
            expect(phases[0].tasks).toHaveLength(1);
            expect(phases[0].tasks[0].title).toBe('Setup');
            expect(phases[1].tasks[0].title).toBe('Implementation');
            expect(phases[2].tasks[0].title).toBe('Testing');
        });

        test('should handle parallel tasks', () => {
            const sortedTasks = [
                { id: 'task-1', title: 'Setup', estimatedEffort: 1 },
                { id: 'task-2', title: 'Frontend', estimatedEffort: 3 },
                { id: 'task-3', title: 'Backend', estimatedEffort: 4 }
            ];

            const dependencyGraph = {
                edges: [
                    { from: 'task-1', to: 'task-2', type: 'blocks' },
                    { from: 'task-1', to: 'task-3', type: 'blocks' }
                ]
            };

            const phases = orchestrator.groupIntoPhases(sortedTasks, dependencyGraph);

            expect(phases).toHaveLength(2);
            expect(phases[0].tasks).toHaveLength(1); // Setup
            expect(phases[1].tasks).toHaveLength(2); // Frontend and Backend in parallel
        });
    });

    describe('Statistics', () => {
        test('should return correct statistics', () => {
            const stats = orchestrator.getStatistics();

            expect(stats).toBeDefined();
            expect(stats.activeWorkflows).toBe(0);
            expect(stats.isInitialized).toBe(false);
        });

        test('should update statistics after initialization', async () => {
            await orchestrator.initialize();
            const stats = orchestrator.getStatistics();

            expect(stats.isInitialized).toBe(true);
        });
    });

    describe('Error Handling', () => {
        beforeEach(async () => {
            await orchestrator.initialize();
        });

        test('should handle database errors gracefully', async () => {
            const requirementText = 'Create a web application';
            
            mockDatabase.createWorkflow.mockRejectedValue(new Error('Database connection failed'));

            await expect(orchestrator.processRequirement(requirementText))
                .rejects.toThrow('Database connection failed');
        });

        test('should handle Linear API errors gracefully', async () => {
            const requirementText = 'Create a web application';
            
            mockDatabase.createWorkflow.mockResolvedValue({ id: 'workflow-123' });
            mockLinearClient.createIssue.mockRejectedValue(new Error('Linear API error'));

            await expect(orchestrator.processRequirement(requirementText))
                .rejects.toThrow('Linear API error');
        });
    });

    describe('Shutdown', () => {
        test('should shutdown gracefully', async () => {
            await orchestrator.initialize();
            expect(orchestrator.isInitialized).toBe(true);

            await orchestrator.shutdown();
            expect(orchestrator.isInitialized).toBe(false);
        });

        test('should clear active workflows on shutdown', async () => {
            await orchestrator.initialize();
            
            // Simulate active workflow
            orchestrator.activeWorkflows.set('workflow-1', { id: 'workflow-1' });
            expect(orchestrator.activeWorkflows.size).toBe(1);

            await orchestrator.shutdown();
            expect(orchestrator.activeWorkflows.size).toBe(0);
        });
    });
});

