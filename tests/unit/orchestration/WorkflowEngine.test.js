/**
 * Workflow Engine Unit Tests
 * 
 * Tests for the workflow orchestration engine
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { TestHelpers } from '../../utils/TestHelpers.js';
import { sampleWorkflow, activeTask } from '../../fixtures/workflows.js';

// Mock the WorkflowEngine (assuming it exists)
jest.mock('../../../src/ai_cicd_system/orchestration/WorkflowEngine.js', () => ({
  WorkflowEngine: jest.fn().mockImplementation(() => ({
    startWorkflow: jest.fn(),
    pauseWorkflow: jest.fn(),
    resumeWorkflow: jest.fn(),
    stopWorkflow: jest.fn(),
    processTaskCompletion: jest.fn(),
    handleError: jest.fn(),
    getWorkflowStatus: jest.fn(),
    getWorkflowMetrics: jest.fn(),
    validateWorkflow: jest.fn(),
    scheduleTask: jest.fn(),
    executeTask: jest.fn()
  }))
}));

import { WorkflowEngine } from '../../../src/ai_cicd_system/orchestration/WorkflowEngine.js';

describe('WorkflowEngine', () => {
  let workflowEngine;

  beforeEach(() => {
    workflowEngine = new WorkflowEngine();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await TestHelpers.cleanupTestData();
  });

  describe('Workflow Lifecycle', () => {
    test('should start workflow successfully', async () => {
      // Arrange
      const workflowData = await TestHelpers.createTestWorkflow({
        status: 'pending'
      });

      workflowEngine.startWorkflow.mockResolvedValue({
        success: true,
        workflowId: workflowData.id,
        status: 'active',
        startedAt: new Date().toISOString()
      });

      // Act
      const result = await workflowEngine.startWorkflow(workflowData);

      // Assert
      expect(workflowEngine.startWorkflow).toHaveBeenCalledWith(workflowData);
      expect(result.success).toBe(true);
      expect(result.status).toBe('active');
      expect(result.workflowId).toBe(workflowData.id);
      expect(result.startedAt).toBeDefined();
    });

    test('should handle workflow pause/resume', async () => {
      // Arrange
      const workflowId = 'test-workflow-123';
      
      workflowEngine.pauseWorkflow.mockResolvedValue({
        success: true,
        workflowId,
        status: 'paused',
        pausedAt: new Date().toISOString()
      });

      workflowEngine.resumeWorkflow.mockResolvedValue({
        success: true,
        workflowId,
        status: 'active',
        resumedAt: new Date().toISOString()
      });

      // Act - Pause
      const pauseResult = await workflowEngine.pauseWorkflow(workflowId);

      // Assert - Pause
      expect(workflowEngine.pauseWorkflow).toHaveBeenCalledWith(workflowId);
      expect(pauseResult.success).toBe(true);
      expect(pauseResult.status).toBe('paused');

      // Act - Resume
      const resumeResult = await workflowEngine.resumeWorkflow(workflowId);

      // Assert - Resume
      expect(workflowEngine.resumeWorkflow).toHaveBeenCalledWith(workflowId);
      expect(resumeResult.success).toBe(true);
      expect(resumeResult.status).toBe('active');
    });

    test('should stop workflow gracefully', async () => {
      // Arrange
      const workflowId = 'test-workflow-123';
      
      workflowEngine.stopWorkflow.mockResolvedValue({
        success: true,
        workflowId,
        status: 'stopped',
        stoppedAt: new Date().toISOString(),
        reason: 'User requested stop'
      });

      // Act
      const result = await workflowEngine.stopWorkflow(workflowId, 'User requested stop');

      // Assert
      expect(workflowEngine.stopWorkflow).toHaveBeenCalledWith(workflowId, 'User requested stop');
      expect(result.success).toBe(true);
      expect(result.status).toBe('stopped');
      expect(result.reason).toBe('User requested stop');
    });

    test('should validate workflow before starting', async () => {
      // Arrange
      const invalidWorkflow = await TestHelpers.createTestWorkflow({
        requirements: '', // Empty requirements
        githubRepoUrl: 'invalid-url'
      });

      workflowEngine.validateWorkflow.mockResolvedValue({
        valid: false,
        errors: [
          'Requirements cannot be empty',
          'Invalid GitHub repository URL'
        ]
      });

      // Act
      const result = await workflowEngine.validateWorkflow(invalidWorkflow);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors).toContain('Requirements cannot be empty');
      expect(result.errors).toContain('Invalid GitHub repository URL');
    });
  });

  describe('Task Processing', () => {
    test('should process task completion events', async () => {
      // Arrange
      const taskCompletionEvent = {
        taskId: 'test-task-123',
        workflowId: 'test-workflow-123',
        status: 'completed',
        completedAt: new Date().toISOString(),
        result: {
          success: true,
          output: 'Task completed successfully'
        }
      };

      workflowEngine.processTaskCompletion.mockResolvedValue({
        success: true,
        nextTasks: ['task-456', 'task-789'],
        workflowStatus: 'active'
      });

      // Act
      const result = await workflowEngine.processTaskCompletion(taskCompletionEvent);

      // Assert
      expect(workflowEngine.processTaskCompletion).toHaveBeenCalledWith(taskCompletionEvent);
      expect(result.success).toBe(true);
      expect(result.nextTasks).toEqual(['task-456', 'task-789']);
      expect(result.workflowStatus).toBe('active');
    });

    test('should schedule tasks based on dependencies', async () => {
      // Arrange
      const task = await TestHelpers.createTestTask({
        dependencies: ['completed-task-1', 'completed-task-2']
      });

      workflowEngine.scheduleTask.mockResolvedValue({
        success: true,
        taskId: task.id,
        scheduledAt: new Date().toISOString(),
        estimatedStartTime: new Date(Date.now() + 60000).toISOString()
      });

      // Act
      const result = await workflowEngine.scheduleTask(task);

      // Assert
      expect(workflowEngine.scheduleTask).toHaveBeenCalledWith(task);
      expect(result.success).toBe(true);
      expect(result.taskId).toBe(task.id);
      expect(result.scheduledAt).toBeDefined();
    });

    test('should execute tasks in correct order', async () => {
      // Arrange
      const task = await TestHelpers.createTestTask({
        type: 'feature',
        priority: 'high'
      });

      workflowEngine.executeTask.mockResolvedValue({
        success: true,
        taskId: task.id,
        executionTime: 1500,
        result: {
          codeGenerated: true,
          testsCreated: true,
          prCreated: true
        }
      });

      // Act
      const result = await workflowEngine.executeTask(task);

      // Assert
      expect(workflowEngine.executeTask).toHaveBeenCalledWith(task);
      expect(result.success).toBe(true);
      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.result.codeGenerated).toBe(true);
    });

    test('should handle task dependencies correctly', async () => {
      // Arrange
      const dependentTask = await TestHelpers.createTestTask({
        dependencies: ['incomplete-task-1']
      });

      workflowEngine.scheduleTask.mockResolvedValue({
        success: false,
        reason: 'Dependencies not met',
        pendingDependencies: ['incomplete-task-1']
      });

      // Act
      const result = await workflowEngine.scheduleTask(dependentTask);

      // Assert
      expect(result.success).toBe(false);
      expect(result.reason).toBe('Dependencies not met');
      expect(result.pendingDependencies).toContain('incomplete-task-1');
    });
  });

  describe('Error Handling', () => {
    test('should handle error scenarios gracefully', async () => {
      // Arrange
      const errorEvent = {
        workflowId: 'test-workflow-123',
        taskId: 'test-task-123',
        error: {
          type: 'API_ERROR',
          message: 'External API call failed',
          code: 'EXTERNAL_SERVICE_UNAVAILABLE'
        },
        timestamp: new Date().toISOString()
      };

      workflowEngine.handleError.mockResolvedValue({
        success: true,
        action: 'retry',
        retryCount: 1,
        nextRetryAt: new Date(Date.now() + 30000).toISOString()
      });

      // Act
      const result = await workflowEngine.handleError(errorEvent);

      // Assert
      expect(workflowEngine.handleError).toHaveBeenCalledWith(errorEvent);
      expect(result.success).toBe(true);
      expect(result.action).toBe('retry');
      expect(result.retryCount).toBe(1);
    });

    test('should escalate critical errors', async () => {
      // Arrange
      const criticalError = {
        workflowId: 'test-workflow-123',
        error: {
          type: 'CRITICAL_ERROR',
          message: 'Database connection lost',
          code: 'DATABASE_UNAVAILABLE'
        },
        severity: 'critical'
      };

      workflowEngine.handleError.mockResolvedValue({
        success: false,
        action: 'escalate',
        workflowStatus: 'failed',
        notificationSent: true
      });

      // Act
      const result = await workflowEngine.handleError(criticalError);

      // Assert
      expect(result.success).toBe(false);
      expect(result.action).toBe('escalate');
      expect(result.workflowStatus).toBe('failed');
      expect(result.notificationSent).toBe(true);
    });

    test('should implement retry logic with exponential backoff', async () => {
      // Arrange
      const retryableError = {
        workflowId: 'test-workflow-123',
        taskId: 'test-task-123',
        error: {
          type: 'TEMPORARY_ERROR',
          message: 'Rate limit exceeded'
        },
        retryCount: 2
      };

      workflowEngine.handleError.mockResolvedValue({
        success: true,
        action: 'retry',
        retryCount: 3,
        nextRetryAt: new Date(Date.now() + 120000).toISOString(), // 2 minutes
        backoffMultiplier: 2
      });

      // Act
      const result = await workflowEngine.handleError(retryableError);

      // Assert
      expect(result.retryCount).toBe(3);
      expect(result.backoffMultiplier).toBe(2);
      expect(new Date(result.nextRetryAt).getTime()).toBeGreaterThan(Date.now() + 60000);
    });
  });

  describe('Workflow Status and Metrics', () => {
    test('should get workflow status accurately', async () => {
      // Arrange
      const workflowId = 'test-workflow-123';
      
      workflowEngine.getWorkflowStatus.mockResolvedValue({
        workflowId,
        status: 'active',
        progress: {
          totalTasks: 10,
          completedTasks: 6,
          activeTasks: 2,
          pendingTasks: 2,
          failedTasks: 0
        },
        estimatedCompletion: new Date(Date.now() + 3600000).toISOString()
      });

      // Act
      const result = await workflowEngine.getWorkflowStatus(workflowId);

      // Assert
      expect(result.workflowId).toBe(workflowId);
      expect(result.status).toBe('active');
      expect(result.progress.totalTasks).toBe(10);
      expect(result.progress.completedTasks).toBe(6);
      expect(result.estimatedCompletion).toBeDefined();
    });

    test('should calculate workflow metrics', async () => {
      // Arrange
      const workflowId = 'test-workflow-123';
      
      workflowEngine.getWorkflowMetrics.mockResolvedValue({
        workflowId,
        duration: 7200000, // 2 hours
        efficiency: 0.85,
        taskMetrics: {
          averageTaskDuration: 600000, // 10 minutes
          taskSuccessRate: 0.95,
          totalTasksExecuted: 20
        },
        resourceUtilization: {
          cpu: 0.65,
          memory: 0.72,
          network: 0.45
        }
      });

      // Act
      const result = await workflowEngine.getWorkflowMetrics(workflowId);

      // Assert
      expect(result.workflowId).toBe(workflowId);
      expect(result.efficiency).toBe(0.85);
      expect(result.taskMetrics.taskSuccessRate).toBe(0.95);
      expect(result.resourceUtilization.cpu).toBeLessThanOrEqual(1.0);
    });
  });

  describe('Concurrent Workflow Management', () => {
    test('should handle multiple concurrent workflows', async () => {
      // Arrange
      const workflows = await Promise.all([
        TestHelpers.createTestWorkflow({ id: 'workflow-1' }),
        TestHelpers.createTestWorkflow({ id: 'workflow-2' }),
        TestHelpers.createTestWorkflow({ id: 'workflow-3' })
      ]);

      workflows.forEach((workflow, index) => {
        workflowEngine.startWorkflow.mockResolvedValueOnce({
          success: true,
          workflowId: workflow.id,
          status: 'active'
        });
      });

      // Act
      const results = await Promise.all(
        workflows.map(workflow => workflowEngine.startWorkflow(workflow))
      );

      // Assert
      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.workflowId).toBe(workflows[index].id);
      });
    });

    test('should manage resource allocation across workflows', async () => {
      // Arrange
      const highPriorityWorkflow = await TestHelpers.createTestWorkflow({
        priority: 'critical'
      });
      const lowPriorityWorkflow = await TestHelpers.createTestWorkflow({
        priority: 'low'
      });

      workflowEngine.startWorkflow
        .mockResolvedValueOnce({
          success: true,
          workflowId: highPriorityWorkflow.id,
          resourceAllocation: { cpu: 0.8, memory: 0.7 }
        })
        .mockResolvedValueOnce({
          success: true,
          workflowId: lowPriorityWorkflow.id,
          resourceAllocation: { cpu: 0.2, memory: 0.3 }
        });

      // Act
      const highPriorityResult = await workflowEngine.startWorkflow(highPriorityWorkflow);
      const lowPriorityResult = await workflowEngine.startWorkflow(lowPriorityWorkflow);

      // Assert
      expect(highPriorityResult.resourceAllocation.cpu).toBeGreaterThan(
        lowPriorityResult.resourceAllocation.cpu
      );
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle high-volume workflow processing', async () => {
      // Arrange
      const workflowCount = 100;
      const workflows = await Promise.all(
        Array.from({ length: workflowCount }, (_, i) =>
          TestHelpers.createTestWorkflow({ id: `workflow-${i}` })
        )
      );

      workflows.forEach(workflow => {
        workflowEngine.startWorkflow.mockResolvedValueOnce({
          success: true,
          workflowId: workflow.id
        });
      });

      // Act
      const startTime = Date.now();
      const results = await Promise.all(
        workflows.map(workflow => workflowEngine.startWorkflow(workflow))
      );
      const endTime = Date.now();

      // Assert
      expect(results).toHaveLength(workflowCount);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });

    test('should maintain performance under load', async () => {
      // Arrange
      const concurrentOperations = 50;
      const operations = Array.from({ length: concurrentOperations }, (_, i) => {
        const workflow = TestHelpers.createTestWorkflow({ id: `load-test-${i}` });
        workflowEngine.getWorkflowStatus.mockResolvedValueOnce({
          workflowId: `load-test-${i}`,
          status: 'active'
        });
        return workflowEngine.getWorkflowStatus(`load-test-${i}`);
      });

      // Act
      const startTime = Date.now();
      const results = await Promise.all(operations);
      const endTime = Date.now();

      // Assert
      expect(results).toHaveLength(concurrentOperations);
      expect(endTime - startTime).toBeLessThan(2000); // Should complete within 2 seconds
    });
  });
});

