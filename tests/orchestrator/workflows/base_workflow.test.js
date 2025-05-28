/**
 * @fileoverview Base Workflow Tests
 * @description Comprehensive tests for the BaseWorkflow class
 */

import { jest } from '@jest/globals';
import { BaseWorkflow } from '../../../src/ai_cicd_system/orchestrator/workflow_definitions/base_workflow.js';

// Test workflow implementation
class TestWorkflow extends BaseWorkflow {
    constructor(context) {
        super(context);
        this.setupTestSteps();
    }

    setupTestSteps() {
        this.addStep('step1', async () => {
            return { status: 'step1_completed', data: 'test_data_1' };
        });

        this.addStep('step2', async () => {
            return { status: 'step2_completed', data: 'test_data_2' };
        });
    }

    validateContext() {
        super.validateContext();
        if (!this.context.testData) {
            throw new Error('Test data is required');
        }
    }

    buildResult() {
        const baseResult = super.buildResult();
        return {
            ...baseResult,
            customData: 'test_custom_data'
        };
    }
}

// Failing workflow for error testing
class FailingWorkflow extends BaseWorkflow {
    constructor(context) {
        super(context);
        this.addStep('failing_step', async () => {
            throw new Error('Intentional step failure');
        });
    }
}

// Retryable workflow for retry testing
class RetryableWorkflow extends BaseWorkflow {
    constructor(context) {
        super(context);
        this.attemptCount = 0;
        this.addStep('retryable_step', async () => {
            this.attemptCount++;
            if (this.attemptCount < 3) {
                throw new Error('Retry needed');
            }
            return { success: true, attempts: this.attemptCount };
        }, {
            retryable: true,
            maxRetries: 3,
            retryDelay: 10
        });
    }
}

describe('BaseWorkflow', () => {
    let mockEventBus;
    let mockOrchestrator;

    beforeEach(() => {
        mockEventBus = {
            emit: jest.fn()
        };

        mockOrchestrator = {
            performanceMonitor: {
                startTimer: jest.fn(),
                endTimer: jest.fn()
            }
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Constructor and Initialization', () => {
        test('should throw error when instantiated directly', () => {
            expect(() => {
                new BaseWorkflow({});
            }).toThrow('BaseWorkflow is abstract and cannot be instantiated directly');
        });

        test('should initialize with context', () => {
            const context = {
                testData: 'test_value',
                orchestrator: mockOrchestrator,
                eventBus: mockEventBus
            };

            const workflow = new TestWorkflow(context);

            expect(workflow.context).toBe(context);
            expect(workflow.orchestrator).toBe(mockOrchestrator);
            expect(workflow.eventBus).toBe(mockEventBus);
            expect(workflow.status).toBe('created');
            expect(workflow.steps).toHaveLength(2);
        });

        test('should initialize with empty context', () => {
            const workflow = new TestWorkflow({});

            expect(workflow.context).toEqual({});
            expect(workflow.steps).toHaveLength(2);
            expect(workflow.currentStep).toBe(0);
            expect(workflow.stepResults).toEqual([]);
        });

        test('should set creation timestamp', () => {
            const beforeCreation = new Date();
            const workflow = new TestWorkflow({});
            const afterCreation = new Date();

            expect(workflow.createdAt).toBeInstanceOf(Date);
            expect(workflow.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreation.getTime());
            expect(workflow.createdAt.getTime()).toBeLessThanOrEqual(afterCreation.getTime());
        });
    });

    describe('Step Management', () => {
        let workflow;

        beforeEach(() => {
            workflow = new TestWorkflow({ testData: 'test_value' });
        });

        test('should add step successfully', () => {
            const stepFunction = jest.fn();
            workflow.addStep('new_step', stepFunction, { retryable: true });

            expect(workflow.steps).toHaveLength(3);
            expect(workflow.steps[2].name).toBe('new_step');
            expect(workflow.steps[2].execute).toBe(stepFunction);
            expect(workflow.steps[2].retryable).toBe(true);
        });

        test('should throw error for non-function step', () => {
            expect(() => {
                workflow.addStep('invalid_step', 'not a function');
            }).toThrow('Step execute function must be a function');
        });

        test('should insert step at specific position', () => {
            const stepFunction = jest.fn();
            workflow.insertStep(1, 'inserted_step', stepFunction);

            expect(workflow.steps).toHaveLength(3);
            expect(workflow.steps[1].name).toBe('inserted_step');
            expect(workflow.steps[2].name).toBe('step2');
        });

        test('should throw error for invalid insert index', () => {
            expect(() => {
                workflow.insertStep(-1, 'invalid', jest.fn());
            }).toThrow('Invalid step index');

            expect(() => {
                workflow.insertStep(10, 'invalid', jest.fn());
            }).toThrow('Invalid step index');
        });

        test('should remove step by name', () => {
            const removed = workflow.removeStep('step1');

            expect(removed).toBe(true);
            expect(workflow.steps).toHaveLength(1);
            expect(workflow.steps[0].name).toBe('step2');
        });

        test('should return false when removing non-existent step', () => {
            const removed = workflow.removeStep('non_existent');

            expect(removed).toBe(false);
            expect(workflow.steps).toHaveLength(2);
        });

        test('should get step by name', () => {
            const step = workflow.getStep('step1');

            expect(step).toBeDefined();
            expect(step.name).toBe('step1');
        });

        test('should return null for non-existent step', () => {
            const step = workflow.getStep('non_existent');

            expect(step).toBeNull();
        });

        test('should get all step names', () => {
            const stepNames = workflow.getStepNames();

            expect(stepNames).toEqual(['step1', 'step2']);
        });
    });

    describe('Workflow Execution', () => {
        test('should execute workflow successfully', async () => {
            const workflow = new TestWorkflow({
                testData: 'test_value',
                eventBus: mockEventBus
            });

            const result = await workflow.execute();

            expect(workflow.status).toBe('completed');
            expect(workflow.startedAt).toBeInstanceOf(Date);
            expect(workflow.completedAt).toBeInstanceOf(Date);
            expect(workflow.stepResults).toHaveLength(2);
            expect(result.workflowId).toBe(workflow.id);
            expect(result.status).toBe('completed');
            expect(result.customData).toBe('test_custom_data');
        });

        test('should emit step events during execution', async () => {
            const workflow = new TestWorkflow({
                testData: 'test_value',
                eventBus: mockEventBus
            });
            workflow.id = 'test_workflow_id';

            await workflow.execute();

            expect(mockEventBus.emit).toHaveBeenCalledWith('workflow.step.started', expect.objectContaining({
                workflowId: 'test_workflow_id',
                step: 'step1',
                stepIndex: 0
            }));

            expect(mockEventBus.emit).toHaveBeenCalledWith('workflow.step.completed', expect.objectContaining({
                workflowId: 'test_workflow_id',
                step: 'step1',
                stepIndex: 0
            }));
        });

        test('should handle workflow execution failure', async () => {
            const workflow = new FailingWorkflow({
                eventBus: mockEventBus
            });
            workflow.id = 'failing_workflow_id';

            await expect(workflow.execute()).rejects.toThrow('Intentional step failure');

            expect(workflow.status).toBe('failed');
            expect(workflow.failedAt).toBeInstanceOf(Date);
            expect(workflow.error).toBeInstanceOf(Error);
            expect(mockEventBus.emit).toHaveBeenCalledWith('workflow.step.failed', expect.objectContaining({
                workflowId: 'failing_workflow_id',
                error: 'Intentional step failure'
            }));
        });

        test('should validate context before execution', async () => {
            const workflow = new TestWorkflow({});

            await expect(workflow.execute()).rejects.toThrow('Test data is required');
        });

        test('should handle step retry logic', async () => {
            const workflow = new RetryableWorkflow({
                eventBus: mockEventBus
            });
            workflow.id = 'retryable_workflow_id';

            const result = await workflow.execute();

            expect(result.steps[0].success).toBe(true);
            expect(result.steps[0].attempts).toBe(3);
            expect(mockEventBus.emit).toHaveBeenCalledWith('workflow.step.failed', expect.objectContaining({
                willRetry: true
            }));
        });

        test('should fail after max retries exceeded', async () => {
            const workflow = new RetryableWorkflow({
                eventBus: mockEventBus
            });
            // Override to always fail
            workflow.attemptCount = 10;

            await expect(workflow.execute()).rejects.toThrow('Retry needed');
        });

        test('should handle step timeout', async () => {
            const workflow = new TestWorkflow({
                testData: 'test_value',
                eventBus: mockEventBus
            });

            // Add a slow step with timeout
            workflow.addStep('slow_step', async () => {
                await new Promise(resolve => setTimeout(resolve, 100));
                return { completed: true };
            }, {
                timeout: 50
            });

            await expect(workflow.execute()).rejects.toThrow('timed out');
        });
    });

    describe('Workflow State Management', () => {
        let workflow;

        beforeEach(() => {
            workflow = new TestWorkflow({ testData: 'test_value' });
        });

        test('should pause workflow when running', () => {
            workflow.status = 'running';

            expect(workflow.canPause()).toBe(true);
            workflow.pause();

            expect(workflow.status).toBe('paused');
            expect(workflow.pausedAt).toBeInstanceOf(Date);
        });

        test('should not pause workflow when not running', () => {
            workflow.status = 'created';

            expect(workflow.canPause()).toBe(false);
            workflow.pause();

            expect(workflow.status).toBe('created');
        });

        test('should resume workflow when paused', () => {
            workflow.status = 'paused';

            expect(workflow.canResume()).toBe(true);
            workflow.resume();

            expect(workflow.status).toBe('running');
            expect(workflow.resumedAt).toBeInstanceOf(Date);
        });

        test('should not resume workflow when not paused', () => {
            workflow.status = 'running';

            expect(workflow.canResume()).toBe(false);
            workflow.resume();

            expect(workflow.status).toBe('running');
        });

        test('should cancel workflow', () => {
            const reason = 'Test cancellation';
            workflow.cancel(reason);

            expect(workflow.status).toBe('cancelled');
            expect(workflow.cancelledAt).toBeInstanceOf(Date);
            expect(workflow.cancellationReason).toBe(reason);
        });

        test('should cancel workflow with default reason', () => {
            workflow.cancel();

            expect(workflow.status).toBe('cancelled');
            expect(workflow.cancellationReason).toBe('Cancelled by user');
        });
    });

    describe('Progress Tracking', () => {
        let workflow;

        beforeEach(() => {
            workflow = new TestWorkflow({ testData: 'test_value' });
        });

        test('should calculate progress correctly', () => {
            expect(workflow.getProgress()).toBe(0);

            workflow.currentStep = 1;
            expect(workflow.getProgress()).toBe(50);

            workflow.currentStep = 2;
            expect(workflow.getProgress()).toBe(100);
        });

        test('should handle empty workflow progress', () => {
            const emptyWorkflow = new TestWorkflow({ testData: 'test_value' });
            emptyWorkflow.steps = [];

            expect(emptyWorkflow.getProgress()).toBe(0);

            emptyWorkflow.status = 'completed';
            expect(emptyWorkflow.getProgress()).toBe(100);
        });

        test('should get workflow summary', () => {
            workflow.id = 'test_id';
            workflow.status = 'running';
            workflow.currentStep = 1;
            workflow.startedAt = new Date();

            const summary = workflow.getSummary();

            expect(summary.id).toBe('test_id');
            expect(summary.status).toBe('running');
            expect(summary.progress).toBe(50);
            expect(summary.totalSteps).toBe(2);
            expect(summary.currentStep).toBe(1);
            expect(summary.executionTime).toBeGreaterThan(0);
        });
    });

    describe('Context Validation', () => {
        test('should validate base context requirements', () => {
            const workflow = new TestWorkflow({});

            expect(() => workflow.validateContext()).toThrow('Test data is required');
        });

        test('should pass validation with valid context', () => {
            const workflow = new TestWorkflow({ testData: 'valid_data' });

            expect(() => workflow.validateContext()).not.toThrow();
        });

        test('should throw error for null context', () => {
            const workflow = new TestWorkflow(null);

            expect(() => workflow.validateContext()).toThrow('Workflow context is required');
        });
    });

    describe('Result Building', () => {
        test('should build default result structure', async () => {
            const workflow = new TestWorkflow({ testData: 'test_value' });
            workflow.id = 'test_id';

            const result = await workflow.execute();

            expect(result).toHaveProperty('workflowId', 'test_id');
            expect(result).toHaveProperty('status', 'completed');
            expect(result).toHaveProperty('steps');
            expect(result).toHaveProperty('metadata');
            expect(result).toHaveProperty('executionTime');
            expect(result).toHaveProperty('totalSteps', 2);
            expect(result).toHaveProperty('completedSteps', 2);
            expect(result).toHaveProperty('createdAt');
            expect(result).toHaveProperty('startedAt');
            expect(result).toHaveProperty('completedAt');
        });

        test('should include custom result data', async () => {
            const workflow = new TestWorkflow({ testData: 'test_value' });

            const result = await workflow.execute();

            expect(result).toHaveProperty('customData', 'test_custom_data');
        });
    });

    describe('Error Handling', () => {
        test('should handle step execution without event bus', async () => {
            const workflow = new TestWorkflow({ testData: 'test_value' });
            // No event bus set

            const result = await workflow.execute();

            expect(result).toBeDefined();
            expect(workflow.status).toBe('completed');
        });

        test('should handle step with zero timeout', async () => {
            const workflow = new TestWorkflow({ testData: 'test_value' });
            workflow.addStep('zero_timeout_step', async () => {
                return { completed: true };
            }, {
                timeout: 0
            });

            const result = await workflow.execute();

            expect(result.steps).toHaveLength(3);
            expect(result.steps[2].completed).toBe(true);
        });

        test('should handle step with negative timeout', async () => {
            const workflow = new TestWorkflow({ testData: 'test_value' });
            workflow.addStep('negative_timeout_step', async () => {
                return { completed: true };
            }, {
                timeout: -1
            });

            const result = await workflow.execute();

            expect(result.steps).toHaveLength(3);
            expect(result.steps[2].completed).toBe(true);
        });
    });

    describe('Step Options', () => {
        test('should handle step with all options', () => {
            const workflow = new TestWorkflow({ testData: 'test_value' });
            const stepFunction = jest.fn();
            const options = {
                retryable: true,
                maxRetries: 5,
                retryDelay: 2000,
                timeout: 10000,
                metadata: { custom: 'data' },
                dependencies: ['step1'],
                condition: () => true
            };

            workflow.addStep('full_options_step', stepFunction, options);

            const step = workflow.getStep('full_options_step');
            expect(step.retryable).toBe(true);
            expect(step.maxRetries).toBe(5);
            expect(step.retryDelay).toBe(2000);
            expect(step.timeout).toBe(10000);
            expect(step.metadata.custom).toBe('data');
            expect(step.dependencies).toEqual(['step1']);
            expect(step.condition).toBeInstanceOf(Function);
        });

        test('should use default step options', () => {
            const workflow = new TestWorkflow({ testData: 'test_value' });
            const stepFunction = jest.fn();

            workflow.addStep('default_options_step', stepFunction);

            const step = workflow.getStep('default_options_step');
            expect(step.retryable).toBe(false);
            expect(step.maxRetries).toBe(3);
            expect(step.retryDelay).toBe(1000);
            expect(step.timeout).toBe(30000);
            expect(step.metadata).toEqual({});
            expect(step.dependencies).toEqual([]);
            expect(step.condition).toBeNull();
        });
    });

    describe('Performance', () => {
        test('should handle workflow with many steps', async () => {
            const workflow = new TestWorkflow({ testData: 'test_value' });
            
            // Add many steps
            for (let i = 0; i < 100; i++) {
                workflow.addStep(`step_${i}`, async () => ({ index: i }));
            }

            const startTime = Date.now();
            const result = await workflow.execute();
            const endTime = Date.now();

            expect(result.totalSteps).toBe(102); // 2 original + 100 added
            expect(result.completedSteps).toBe(102);
            expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
        });

        test('should handle concurrent step execution simulation', async () => {
            const workflow = new TestWorkflow({ testData: 'test_value' });
            
            // Add steps that simulate async work
            for (let i = 0; i < 10; i++) {
                workflow.addStep(`async_step_${i}`, async () => {
                    await new Promise(resolve => setTimeout(resolve, 10));
                    return { index: i };
                });
            }

            const result = await workflow.execute();

            expect(result.totalSteps).toBe(12); // 2 original + 10 added
            expect(result.completedSteps).toBe(12);
        });
    });
});

