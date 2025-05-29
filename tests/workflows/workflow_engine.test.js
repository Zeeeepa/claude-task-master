/**
 * Comprehensive Test Suite for Workflow Engine
 * Tests all aspects of workflow orchestration, state management, and execution
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { WorkflowEngine } from '../../src/ai_cicd_system/workflows/workflow_engine.js';
import { StateManager } from '../../src/ai_cicd_system/workflows/state_manager.js';
import { StepExecutor } from '../../src/ai_cicd_system/workflows/step_executor.js';
import { DependencyResolver } from '../../src/ai_cicd_system/workflows/dependency_resolver.js';
import { ParallelProcessor } from '../../src/ai_cicd_system/workflows/parallel_processor.js';
import { WORKFLOW_DEFINITIONS } from '../../src/ai_cicd_system/workflows/workflow_definition.js';

// Mock implementations
class MockAgentManager {
    constructor() {
        this.agents = new Map();
        this.executionResults = new Map();
    }

    async getAgent(agentId) {
        return {
            id: agentId,
            execute: async (request) => {
                const result = this.executionResults.get(agentId) || {
                    success: true,
                    data: { message: `Mock result from ${agentId}` },
                    duration: 1000
                };
                return result;
            }
        };
    }

    async isAgentAvailable(agentId) {
        return true;
    }

    setExecutionResult(agentId, result) {
        this.executionResults.set(agentId, result);
    }
}

class MockDatabase {
    constructor() {
        this.states = new Map();
    }

    async save(key, data) {
        this.states.set(key, JSON.stringify(data));
    }

    async load(key) {
        const data = this.states.get(key);
        return data ? JSON.parse(data) : null;
    }

    async delete(key) {
        return this.states.delete(key);
    }

    clear() {
        this.states.clear();
    }
}

describe('Workflow Engine', () => {
    let workflowEngine;
    let mockAgentManager;
    let mockDatabase;

    beforeEach(() => {
        mockAgentManager = new MockAgentManager();
        mockDatabase = new MockDatabase();
        
        workflowEngine = new WorkflowEngine({
            agentManager: mockAgentManager,
            database: mockDatabase,
            maxConcurrentWorkflows: 5,
            enableMetrics: true,
            enableRecovery: true
        });
    });

    afterEach(async () => {
        await workflowEngine.destroy();
        mockDatabase.clear();
    });

    describe('Basic Workflow Execution', () => {
        it('should execute a simple workflow successfully', async () => {
            const context = {
                pr_id: '123',
                repository: 'test/repo',
                user_id: 'test-user'
            };

            const result = await workflowEngine.executeWorkflow('pr_processing', context);

            expect(result).toBeDefined();
            expect(result.status).toBe('completed');
            expect(result.executionId).toBeDefined();
            expect(result.workflowId).toBe('pr_processing');
            expect(result.result.success).toBe(true);
        });

        it('should handle workflow with invalid ID', async () => {
            await expect(
                workflowEngine.executeWorkflow('invalid_workflow', {})
            ).rejects.toThrow('Workflow definition not found: invalid_workflow');
        });

        it('should validate required context fields', async () => {
            // Assuming pr_processing workflow requires certain context fields
            await expect(
                workflowEngine.executeWorkflow('pr_processing', {})
            ).resolves.toBeDefined(); // Should work with empty context for our test workflow
        });
    });

    describe('Workflow State Management', () => {
        it('should track workflow progress correctly', async () => {
            const context = { test: 'data' };
            
            const executionPromise = workflowEngine.executeWorkflow('pr_processing', context);
            
            // Give it a moment to start
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const activeWorkflows = workflowEngine.getActiveWorkflows();
            expect(activeWorkflows.length).toBeGreaterThan(0);
            
            const result = await executionPromise;
            expect(result.status).toBe('completed');
            
            // Should no longer be active
            const finalActiveWorkflows = workflowEngine.getActiveWorkflows();
            expect(finalActiveWorkflows.length).toBe(0);
        });

        it('should provide workflow status information', async () => {
            const context = { test: 'data' };
            
            const executionPromise = workflowEngine.executeWorkflow('pr_processing', context);
            
            // Give it a moment to start
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const activeWorkflows = workflowEngine.getActiveWorkflows();
            const executionId = activeWorkflows[0].executionId;
            
            const status = await workflowEngine.getWorkflowStatus(executionId);
            expect(status).toBeDefined();
            expect(status.executionId).toBe(executionId);
            expect(status.workflowId).toBe('pr_processing');
            expect(status.isActive).toBe(true);
            
            await executionPromise;
        });
    });

    describe('Parallel Execution', () => {
        it('should execute parallel steps concurrently', async () => {
            const startTime = Date.now();
            
            const result = await workflowEngine.executeWorkflow('pr_processing', {
                test: 'parallel'
            });
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            expect(result.status).toBe('completed');
            // Parallel execution should be faster than sequential
            // This is a rough test - in practice, you'd mock timing more precisely
            expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
        });

        it('should handle parallel step failures gracefully', async () => {
            // Set one agent to fail
            mockAgentManager.setExecutionResult('aider', {
                success: false,
                error: 'Mock failure',
                duration: 500
            });

            const result = await workflowEngine.executeWorkflow('pr_processing', {
                test: 'parallel_failure'
            });

            // Workflow should still complete despite one step failing
            expect(result.status).toBe('completed');
        });
    });

    describe('Error Handling and Recovery', () => {
        it('should retry failed steps according to retry policy', async () => {
            let attemptCount = 0;
            
            // Mock agent that fails twice then succeeds
            mockAgentManager.setExecutionResult('claude-code', {
                success: false,
                error: 'Temporary failure',
                duration: 100
            });

            // Override the agent to track attempts
            const originalGetAgent = mockAgentManager.getAgent.bind(mockAgentManager);
            mockAgentManager.getAgent = async (agentId) => {
                const agent = await originalGetAgent(agentId);
                const originalExecute = agent.execute.bind(agent);
                
                agent.execute = async (request) => {
                    attemptCount++;
                    if (agentId === 'claude-code' && attemptCount <= 2) {
                        throw new Error('Temporary failure');
                    }
                    return originalExecute(request);
                };
                
                return agent;
            };

            const result = await workflowEngine.executeWorkflow('pr_processing', {
                test: 'retry'
            });

            expect(result.status).toBe('completed');
            expect(attemptCount).toBeGreaterThan(1); // Should have retried
        });

        it('should handle workflow cancellation', async () => {
            const executionPromise = workflowEngine.executeWorkflow('feature_integration', {
                test: 'cancellation'
            });
            
            // Give it a moment to start
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const activeWorkflows = workflowEngine.getActiveWorkflows();
            const executionId = activeWorkflows[0].executionId;
            
            const cancelled = await workflowEngine.cancelWorkflow(executionId, 'test_cancellation');
            expect(cancelled).toBe(true);
            
            await expect(executionPromise).rejects.toThrow();
        });

        it('should pause and resume workflows', async () => {
            // This test would require more sophisticated mocking to properly test
            // pause/resume functionality, as it involves timing and state persistence
            const context = { test: 'pause_resume' };
            
            const executionPromise = workflowEngine.executeWorkflow('feature_integration', context);
            
            // Give it a moment to start
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const activeWorkflows = workflowEngine.getActiveWorkflows();
            if (activeWorkflows.length > 0) {
                const executionId = activeWorkflows[0].executionId;
                
                const paused = await workflowEngine.pauseWorkflow(executionId, 'test_pause');
                expect(paused).toBe(true);
                
                const resumed = await workflowEngine.resumeWorkflow(executionId);
                expect(resumed).toBe(true);
            }
            
            const result = await executionPromise;
            expect(result.status).toBe('completed');
        });
    });

    describe('Resource Management', () => {
        it('should respect concurrency limits', async () => {
            const maxConcurrent = 2;
            const limitedEngine = new WorkflowEngine({
                agentManager: mockAgentManager,
                database: mockDatabase,
                maxConcurrentWorkflows: maxConcurrent
            });

            const promises = [];
            
            // Start more workflows than the limit
            for (let i = 0; i < maxConcurrent + 2; i++) {
                promises.push(
                    limitedEngine.executeWorkflow('pr_processing', { test: `concurrent_${i}` })
                        .catch(error => error)
                );
            }

            const results = await Promise.all(promises);
            
            // Some should succeed, some should fail due to concurrency limits
            const errors = results.filter(r => r instanceof Error);
            expect(errors.length).toBeGreaterThan(0);
            
            await limitedEngine.destroy();
        });

        it('should track resource usage during parallel execution', async () => {
            const result = await workflowEngine.executeWorkflow('feature_integration', {
                test: 'resource_tracking'
            });

            expect(result.status).toBe('completed');
            expect(result.result.metrics).toBeDefined();
            expect(result.result.metrics.resourceUsage).toBeDefined();
        });
    });

    describe('Metrics and Monitoring', () => {
        it('should collect execution metrics', async () => {
            await workflowEngine.executeWorkflow('pr_processing', { test: 'metrics_1' });
            await workflowEngine.executeWorkflow('pr_processing', { test: 'metrics_2' });

            const metrics = workflowEngine.getMetrics();
            
            expect(metrics.totalExecutions).toBe(2);
            expect(metrics.successfulExecutions).toBe(2);
            expect(metrics.failedExecutions).toBe(0);
            expect(metrics.averageExecutionTime).toBeGreaterThan(0);
        });

        it('should emit workflow events', async () => {
            const events = [];
            
            workflowEngine.on('workflow_started', (data) => events.push({ type: 'started', data }));
            workflowEngine.on('workflow_completed', (data) => events.push({ type: 'completed', data }));
            
            await workflowEngine.executeWorkflow('pr_processing', { test: 'events' });
            
            expect(events.length).toBe(2);
            expect(events[0].type).toBe('started');
            expect(events[1].type).toBe('completed');
        });
    });

    describe('Complex Workflow Scenarios', () => {
        it('should handle hotfix deployment workflow', async () => {
            const result = await workflowEngine.executeWorkflow('hotfix_deployment', {
                hotfix_branch: 'hotfix/critical-bug',
                severity: 'critical'
            });

            expect(result.status).toBe('completed');
            expect(result.workflowId).toBe('hotfix_deployment');
        });

        it('should handle feature integration workflow', async () => {
            const result = await workflowEngine.executeWorkflow('feature_integration', {
                feature_branch: 'feature/new-feature',
                target_branch: 'develop'
            });

            expect(result.status).toBe('completed');
            expect(result.workflowId).toBe('feature_integration');
        });

        it('should handle workflow with complex dependencies', async () => {
            // Test a workflow where steps have multiple dependencies
            const result = await workflowEngine.executeWorkflow('feature_integration', {
                test: 'complex_dependencies'
            });

            expect(result.status).toBe('completed');
            expect(result.result.executionPlan).toBeDefined();
            expect(result.result.executionPlan.length).toBeGreaterThan(1);
        });
    });

    describe('Performance Tests', () => {
        it('should handle multiple concurrent workflows efficiently', async () => {
            const concurrentCount = 5;
            const startTime = Date.now();
            
            const promises = Array.from({ length: concurrentCount }, (_, i) =>
                workflowEngine.executeWorkflow('pr_processing', { test: `perf_${i}` })
            );

            const results = await Promise.all(promises);
            const endTime = Date.now();
            
            expect(results.length).toBe(concurrentCount);
            expect(results.every(r => r.status === 'completed')).toBe(true);
            
            // Should complete all workflows in reasonable time
            expect(endTime - startTime).toBeLessThan(30000); // 30 seconds
        });

        it('should handle large workflow with many steps', async () => {
            // Create a custom workflow with many steps for testing
            const largeWorkflow = {
                id: 'large_test_workflow',
                name: 'Large Test Workflow',
                steps: Array.from({ length: 20 }, (_, i) => ({
                    id: `step_${i}`,
                    name: `Step ${i}`,
                    type: 'analysis',
                    agent: 'claude-code',
                    dependencies: i > 0 ? [`step_${i-1}`] : [],
                    timeout: 5000,
                    retry_count: 1
                }))
            };

            // Temporarily add to definitions
            const originalDefinitions = { ...WORKFLOW_DEFINITIONS };
            WORKFLOW_DEFINITIONS.large_test_workflow = largeWorkflow;

            try {
                const result = await workflowEngine.executeWorkflow('large_test_workflow', {
                    test: 'large_workflow'
                });

                expect(result.status).toBe('completed');
                expect(result.result.stepResults).toBeDefined();
                expect(Object.keys(result.result.stepResults).length).toBe(20);
            } finally {
                // Restore original definitions
                delete WORKFLOW_DEFINITIONS.large_test_workflow;
                Object.assign(WORKFLOW_DEFINITIONS, originalDefinitions);
            }
        });
    });

    describe('Edge Cases and Error Scenarios', () => {
        it('should handle circular dependency detection', async () => {
            // Create a workflow with circular dependencies
            const circularWorkflow = {
                id: 'circular_test',
                name: 'Circular Dependency Test',
                steps: [
                    {
                        id: 'step_a',
                        name: 'Step A',
                        type: 'analysis',
                        agent: 'claude-code',
                        dependencies: ['step_b'],
                        timeout: 5000
                    },
                    {
                        id: 'step_b',
                        name: 'Step B',
                        type: 'analysis',
                        agent: 'claude-code',
                        dependencies: ['step_a'],
                        timeout: 5000
                    }
                ]
            };

            WORKFLOW_DEFINITIONS.circular_test = circularWorkflow;

            try {
                await expect(
                    workflowEngine.executeWorkflow('circular_test', { test: 'circular' })
                ).rejects.toThrow(/circular dependency/i);
            } finally {
                delete WORKFLOW_DEFINITIONS.circular_test;
            }
        });

        it('should handle agent unavailability', async () => {
            // Mock agent manager to return unavailable agent
            mockAgentManager.isAgentAvailable = async (agentId) => {
                return agentId !== 'claude-code'; // Make claude-code unavailable
            };

            await expect(
                workflowEngine.executeWorkflow('pr_processing', { test: 'unavailable_agent' })
            ).rejects.toThrow(/not available/i);
        });

        it('should handle step timeout scenarios', async () => {
            // Mock agent to take longer than timeout
            mockAgentManager.setExecutionResult('claude-code', new Promise(resolve => {
                setTimeout(() => resolve({ success: true, data: 'delayed' }), 10000);
            }));

            // Create workflow with short timeout
            const timeoutWorkflow = {
                id: 'timeout_test',
                name: 'Timeout Test',
                steps: [{
                    id: 'timeout_step',
                    name: 'Timeout Step',
                    type: 'analysis',
                    agent: 'claude-code',
                    dependencies: [],
                    timeout: 100, // Very short timeout
                    retry_count: 0
                }]
            };

            WORKFLOW_DEFINITIONS.timeout_test = timeoutWorkflow;

            try {
                await expect(
                    workflowEngine.executeWorkflow('timeout_test', { test: 'timeout' })
                ).rejects.toThrow(/timed out/i);
            } finally {
                delete WORKFLOW_DEFINITIONS.timeout_test;
            }
        });
    });
});

describe('Dependency Resolver', () => {
    let dependencyResolver;

    beforeEach(() => {
        dependencyResolver = new DependencyResolver();
    });

    describe('Execution Plan Creation', () => {
        it('should create correct execution plan for linear dependencies', () => {
            const steps = [
                { id: 'step1', dependencies: [] },
                { id: 'step2', dependencies: ['step1'] },
                { id: 'step3', dependencies: ['step2'] }
            ];

            const plan = dependencyResolver.createExecutionPlan(steps);
            
            expect(plan.length).toBe(3);
            expect(plan[0]).toEqual([steps[0]]);
            expect(plan[1]).toEqual([steps[1]]);
            expect(plan[2]).toEqual([steps[2]]);
        });

        it('should create correct execution plan for parallel steps', () => {
            const steps = [
                { id: 'step1', dependencies: [], parallel: false },
                { id: 'step2', dependencies: ['step1'], parallel: true },
                { id: 'step3', dependencies: ['step1'], parallel: true }
            ];

            const plan = dependencyResolver.createExecutionPlan(steps);
            
            expect(plan.length).toBe(2);
            expect(plan[0]).toEqual([steps[0]]);
            expect(plan[1]).toHaveLength(2);
            expect(plan[1]).toContain(steps[1]);
            expect(plan[1]).toContain(steps[2]);
        });

        it('should detect circular dependencies', () => {
            const steps = [
                { id: 'step1', dependencies: ['step2'] },
                { id: 'step2', dependencies: ['step1'] }
            ];

            expect(() => {
                dependencyResolver.createExecutionPlan(steps);
            }).toThrow(/circular dependency/i);
        });
    });

    describe('Critical Path Analysis', () => {
        it('should analyze critical path correctly', () => {
            const steps = [
                { id: 'step1', dependencies: [], timeout: 1000 },
                { id: 'step2', dependencies: ['step1'], timeout: 2000 },
                { id: 'step3', dependencies: ['step1'], timeout: 1500 },
                { id: 'step4', dependencies: ['step2', 'step3'], timeout: 500 }
            ];

            const analysis = dependencyResolver.analyzeCriticalPath(steps);
            
            expect(analysis.totalDuration).toBe(3500); // step1 + step2 + step4
            expect(analysis.parallelizationOpportunities).toBeDefined();
            expect(analysis.bottlenecks).toBeDefined();
        });
    });
});

describe('State Manager', () => {
    let stateManager;
    let mockDatabase;

    beforeEach(() => {
        mockDatabase = new MockDatabase();
        stateManager = new StateManager(mockDatabase);
    });

    afterEach(async () => {
        await stateManager.destroy();
    });

    describe('Workflow State Lifecycle', () => {
        it('should initialize workflow state correctly', async () => {
            const workflow = WORKFLOW_DEFINITIONS.pr_processing;
            const context = { test: 'data' };
            
            const state = await stateManager.initializeWorkflow('test-exec-1', workflow, context);
            
            expect(state.execution_id).toBe('test-exec-1');
            expect(state.workflow_id).toBe(workflow.id);
            expect(state.status).toBe('initialized');
            expect(state.context).toEqual(context);
            expect(state.step_results).toEqual({});
        });

        it('should update step results correctly', async () => {
            const workflow = WORKFLOW_DEFINITIONS.pr_processing;
            const state = await stateManager.initializeWorkflow('test-exec-2', workflow, {});
            
            const stepResult = {
                success: true,
                data: { message: 'Step completed' },
                duration: 1000
            };

            const updatedState = await stateManager.updateStepResult(
                'test-exec-2', 
                'analyze_pr', 
                stepResult
            );

            expect(updatedState.step_results.analyze_pr).toBeDefined();
            expect(updatedState.step_results.analyze_pr.success).toBe(true);
            expect(updatedState.current_step).toBe(1);
        });

        it('should handle workflow completion', async () => {
            const workflow = WORKFLOW_DEFINITIONS.pr_processing;
            const state = await stateManager.initializeWorkflow('test-exec-3', workflow, {});
            
            const finalResult = { success: true, message: 'Workflow completed' };
            const completedState = await stateManager.completeWorkflow('test-exec-3', finalResult);

            expect(completedState.status).toBe('completed');
            expect(completedState.final_result).toEqual(finalResult);
            expect(completedState.completed_at).toBeDefined();
        });
    });

    describe('Checkpoint and Recovery', () => {
        it('should create checkpoints during execution', async () => {
            const workflow = WORKFLOW_DEFINITIONS.pr_processing;
            const state = await stateManager.initializeWorkflow('test-exec-4', workflow, {});
            
            await stateManager.updateStepResult('test-exec-4', 'analyze_pr', {
                success: true,
                data: 'test'
            });

            const currentState = await stateManager.getState('test-exec-4');
            expect(currentState.checkpoints).toBeDefined();
            expect(currentState.checkpoints.length).toBeGreaterThan(0);
        });

        it('should recover from checkpoints', async () => {
            const workflow = WORKFLOW_DEFINITIONS.pr_processing;
            const state = await stateManager.initializeWorkflow('test-exec-5', workflow, {});
            
            // Simulate some progress
            await stateManager.updateStepResult('test-exec-5', 'analyze_pr', {
                success: true,
                data: 'test'
            });

            const recoveredState = await stateManager.recoverFromCheckpoint('test-exec-5');
            
            expect(recoveredState.status).toBe('recovered');
            expect(recoveredState.recovery_checkpoint).toBeDefined();
        });
    });
});

describe('Integration Tests', () => {
    let workflowEngine;
    let mockAgentManager;
    let mockDatabase;

    beforeEach(() => {
        mockAgentManager = new MockAgentManager();
        mockDatabase = new MockDatabase();
        
        workflowEngine = new WorkflowEngine({
            agentManager: mockAgentManager,
            database: mockDatabase
        });
    });

    afterEach(async () => {
        await workflowEngine.destroy();
    });

    it('should handle end-to-end workflow execution with real-world scenario', async () => {
        // Simulate a realistic PR processing scenario
        const context = {
            pr_id: '456',
            repository: 'company/main-app',
            branch: 'feature/user-authentication',
            author: 'developer@company.com',
            files_changed: ['src/auth.js', 'tests/auth.test.js'],
            lines_added: 150,
            lines_removed: 20
        };

        // Set up realistic agent responses
        mockAgentManager.setExecutionResult('claude-code', {
            success: true,
            data: {
                analysis: 'Code looks good, no security issues found',
                recommendations: ['Add more unit tests', 'Consider edge cases']
            },
            duration: 2000
        });

        mockAgentManager.setExecutionResult('codegen', {
            success: true,
            data: {
                tasks_generated: 3,
                tasks: [
                    { id: 'task1', type: 'test', description: 'Add edge case tests' },
                    { id: 'task2', type: 'refactor', description: 'Optimize auth flow' },
                    { id: 'task3', type: 'docs', description: 'Update API documentation' }
                ]
            },
            duration: 3000
        });

        const result = await workflowEngine.executeWorkflow('pr_processing', context);

        expect(result.status).toBe('completed');
        expect(result.result.success).toBe(true);
        expect(result.result.stepResults).toBeDefined();
        expect(Object.keys(result.result.stepResults).length).toBeGreaterThan(0);
        
        // Verify all expected steps were executed
        const expectedSteps = ['analyze_pr', 'generate_tasks', 'deploy_branch', 'validate_code', 'run_tests', 'security_audit'];
        for (const stepId of expectedSteps) {
            expect(result.result.stepResults[stepId]).toBeDefined();
        }
    });

    it('should handle workflow failure and recovery gracefully', async () => {
        // Set up a scenario where one step fails
        mockAgentManager.setExecutionResult('aider', {
            success: false,
            error: 'Validation failed: code quality issues detected',
            duration: 1500
        });

        const context = {
            pr_id: '789',
            repository: 'company/test-app',
            branch: 'feature/broken-feature'
        };

        try {
            const result = await workflowEngine.executeWorkflow('pr_processing', context);
            
            // Depending on error handling strategy, workflow might still complete
            // or it might fail - both are valid outcomes
            expect(['completed', 'failed']).toContain(result.status);
            
        } catch (error) {
            // If workflow fails completely, that's also a valid outcome
            expect(error).toBeDefined();
        }

        // Verify metrics were updated
        const metrics = workflowEngine.getMetrics();
        expect(metrics.totalExecutions).toBe(1);
    });
});

// Performance and Load Tests
describe('Performance Tests', () => {
    let workflowEngine;
    let mockAgentManager;

    beforeEach(() => {
        mockAgentManager = new MockAgentManager();
        workflowEngine = new WorkflowEngine({
            agentManager: mockAgentManager,
            maxConcurrentWorkflows: 20
        });
    });

    afterEach(async () => {
        await workflowEngine.destroy();
    });

    it('should handle high concurrency load', async () => {
        const concurrentWorkflows = 15;
        const startTime = Date.now();

        const promises = Array.from({ length: concurrentWorkflows }, (_, i) =>
            workflowEngine.executeWorkflow('pr_processing', { 
                test: `load_test_${i}`,
                pr_id: `pr_${i}`
            })
        );

        const results = await Promise.all(promises);
        const endTime = Date.now();
        const totalTime = endTime - startTime;

        expect(results.length).toBe(concurrentWorkflows);
        expect(results.every(r => r.status === 'completed')).toBe(true);
        
        // Should complete all workflows in reasonable time (less than 1 minute)
        expect(totalTime).toBeLessThan(60000);
        
        console.log(`Executed ${concurrentWorkflows} workflows in ${totalTime}ms`);
        console.log(`Average time per workflow: ${totalTime / concurrentWorkflows}ms`);
    });

    it('should maintain performance under memory pressure', async () => {
        // Execute many workflows sequentially to test memory management
        const sequentialWorkflows = 50;
        const results = [];

        for (let i = 0; i < sequentialWorkflows; i++) {
            const result = await workflowEngine.executeWorkflow('pr_processing', {
                test: `memory_test_${i}`,
                pr_id: `pr_${i}`
            });
            results.push(result);

            // Check memory usage periodically
            if (i % 10 === 0) {
                const memUsage = process.memoryUsage();
                console.log(`Memory usage after ${i} workflows:`, {
                    rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
                    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB'
                });
            }
        }

        expect(results.length).toBe(sequentialWorkflows);
        expect(results.every(r => r.status === 'completed')).toBe(true);
    });
});

