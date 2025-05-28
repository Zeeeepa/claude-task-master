/**
 * @fileoverview Task Orchestrator Tests
 * @description Unit tests for the TaskOrchestrator class
 */

import { jest } from '@jest/globals';
import { TaskOrchestrator } from '../task_orchestrator.js';
import { WorkflowStateMachine } from '../workflow_state_machine.js';
import { TaskExecution } from '../models/task_execution.js';

// Mock dependencies
jest.mock('../models/task_execution.js');
jest.mock('../../ai_cicd_system/core/error_handler.js');
jest.mock('../../integrations/claude-code/claude_code_executor.js');
jest.mock('../../utils/logger.js', () => ({
  log: jest.fn()
}));

describe('TaskOrchestrator', () => {
  let orchestrator;
  let mockConfig;

  beforeEach(() => {
    mockConfig = {
      concurrency: {
        maxParallelTasks: 5,
        maxStageRetries: 2,
        timeoutMs: 60000
      },
      workflows: {
        defaultTimeout: 30000,
        retryDelay: 1000,
        maxRetries: 2
      },
      ai: {
        model: 'claude-3-5-sonnet-20241022',
        maxTokens: 4000,
        temperature: 0.1
      }
    };

    orchestrator = new TaskOrchestrator(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const defaultOrchestrator = new TaskOrchestrator();
      expect(defaultOrchestrator.config).toBeDefined();
      expect(defaultOrchestrator.config.concurrency.maxParallelTasks).toBe(20);
    });

    it('should merge custom configuration with defaults', () => {
      expect(orchestrator.config.concurrency.maxParallelTasks).toBe(5);
      expect(orchestrator.config.workflows.defaultTimeout).toBe(30000);
    });

    it('should initialize required components', () => {
      expect(orchestrator.errorHandler).toBeDefined();
      expect(orchestrator.claudeExecutor).toBeDefined();
      expect(orchestrator.stateMachine).toBeDefined();
      expect(orchestrator.activeExecutions).toBeInstanceOf(Map);
    });
  });

  describe('processTask', () => {
    let mockTask;
    let mockExecution;

    beforeEach(() => {
      mockTask = {
        id: 'task-123',
        title: 'Test Task',
        type: 'feature',
        requirements: {
          workflow: 'default'
        }
      };

      mockExecution = {
        id: 'execution-123',
        updateStatus: jest.fn(),
        updateLogs: jest.fn(),
        getExecutionTime: jest.fn().mockReturnValue(5000)
      };

      // Mock Task.findById
      const mockTaskClass = {
        findById: jest.fn().mockResolvedValue(mockTask)
      };
      
      // Mock TaskExecution.create
      TaskExecution.create = jest.fn().mockResolvedValue(mockExecution);
    });

    it('should process a task successfully', async () => {
      // Mock successful workflow execution
      orchestrator.executeWorkflow = jest.fn().mockResolvedValue({
        completed: ['code_generation', 'pr_creation'],
        failed: [],
        results: {},
        progress: 1.0
      });

      const result = await orchestrator.processTask('task-123');

      expect(result).toBeDefined();
      expect(orchestrator.metrics.tasksProcessed).toBe(1);
      expect(orchestrator.metrics.tasksSucceeded).toBe(1);
    });

    it('should handle task not found error', async () => {
      // Mock Task.findById to return null
      const mockTaskClass = {
        findById: jest.fn().mockResolvedValue(null)
      };

      await expect(orchestrator.processTask('nonexistent-task')).rejects.toThrow('Task nonexistent-task not found');
    });

    it('should handle workflow execution failure', async () => {
      orchestrator.executeWorkflow = jest.fn().mockRejectedValue(new Error('Workflow failed'));
      orchestrator.handleExecutionError = jest.fn();

      await expect(orchestrator.processTask('task-123')).rejects.toThrow('Workflow failed');
      expect(orchestrator.metrics.tasksFailed).toBe(1);
    });

    it('should clean up active executions after completion', async () => {
      orchestrator.executeWorkflow = jest.fn().mockResolvedValue({});
      
      await orchestrator.processTask('task-123');
      
      expect(orchestrator.activeExecutions.has('task-123')).toBe(false);
    });
  });

  describe('executeWorkflow', () => {
    let mockTask;
    let mockExecution;
    let mockWorkflow;

    beforeEach(() => {
      mockTask = {
        id: 'task-123',
        title: 'Test Task',
        requirements: { workflow: 'default' }
      };

      mockExecution = {
        updateStatus: jest.fn(),
        updateLogs: jest.fn()
      };

      mockWorkflow = {
        type: 'default',
        stages: [
          { name: 'code_generation', type: 'code_generation', required: true },
          { name: 'pr_creation', type: 'pr_creation', required: true }
        ],
        getProgress: jest.fn().mockReturnValue(0.5),
        completeStage: jest.fn(),
        failStage: jest.fn(),
        getResult: jest.fn().mockReturnValue({
          completed: ['code_generation'],
          failed: [],
          results: {},
          progress: 1.0
        })
      };

      orchestrator.stateMachine.createWorkflow = jest.fn().mockReturnValue(mockWorkflow);
    });

    it('should execute all workflow stages successfully', async () => {
      orchestrator.executeStage = jest.fn().mockResolvedValue({ success: true });

      const result = await orchestrator.executeWorkflow(mockTask, mockExecution);

      expect(orchestrator.executeStage).toHaveBeenCalledTimes(2);
      expect(mockWorkflow.completeStage).toHaveBeenCalledTimes(2);
      expect(result).toBeDefined();
    });

    it('should handle required stage failure', async () => {
      orchestrator.executeStage = jest.fn()
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error('Stage failed'));

      await expect(orchestrator.executeWorkflow(mockTask, mockExecution)).rejects.toThrow('Stage failed');
      expect(mockWorkflow.failStage).toHaveBeenCalled();
    });

    it('should continue on optional stage failure', async () => {
      // Make second stage optional
      mockWorkflow.stages[1].required = false;
      
      orchestrator.executeStage = jest.fn()
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error('Optional stage failed'));

      const result = await orchestrator.executeWorkflow(mockTask, mockExecution);

      expect(result).toBeDefined();
      expect(mockWorkflow.completeStage).toHaveBeenCalledTimes(1);
      expect(mockWorkflow.failStage).toHaveBeenCalledTimes(1);
    });
  });

  describe('executeStage', () => {
    let mockStage;
    let mockTask;
    let mockExecution;

    beforeEach(() => {
      mockTask = { id: 'task-123', title: 'Test Task' };
      mockExecution = { id: 'execution-123' };
    });

    it('should execute code_generation stage', async () => {
      mockStage = { name: 'code_generation', type: 'code_generation' };
      orchestrator.executeCodeGeneration = jest.fn().mockResolvedValue({ success: true });

      const result = await orchestrator.executeStage(mockStage, mockTask, mockExecution);

      expect(orchestrator.executeCodeGeneration).toHaveBeenCalledWith(mockStage, mockTask, mockExecution);
      expect(result.success).toBe(true);
    });

    it('should execute pr_creation stage', async () => {
      mockStage = { name: 'pr_creation', type: 'pr_creation' };
      orchestrator.executePRCreation = jest.fn().mockResolvedValue({ pr_number: 123 });

      const result = await orchestrator.executeStage(mockStage, mockTask, mockExecution);

      expect(orchestrator.executePRCreation).toHaveBeenCalledWith(mockStage, mockTask, mockExecution);
      expect(result.pr_number).toBe(123);
    });

    it('should throw error for unknown stage type', async () => {
      mockStage = { name: 'unknown', type: 'unknown' };

      await expect(orchestrator.executeStage(mockStage, mockTask, mockExecution)).rejects.toThrow('Unknown stage type: unknown');
    });
  });

  describe('getMetrics', () => {
    it('should return current metrics', () => {
      orchestrator.metrics.tasksProcessed = 10;
      orchestrator.metrics.tasksSucceeded = 8;
      orchestrator.metrics.tasksFailed = 2;
      orchestrator.activeExecutions.set('task-1', {});
      orchestrator.activeExecutions.set('task-2', {});

      const metrics = orchestrator.getMetrics();

      expect(metrics.tasksProcessed).toBe(10);
      expect(metrics.tasksSucceeded).toBe(8);
      expect(metrics.tasksFailed).toBe(2);
      expect(metrics.activeExecutions).toBe(2);
      expect(metrics.failureRate).toBe(0.2);
    });

    it('should handle zero tasks processed', () => {
      const metrics = orchestrator.getMetrics();
      expect(metrics.failureRate).toBe(0);
    });
  });

  describe('cancelExecution', () => {
    it('should cancel active execution', async () => {
      const mockExecution = {
        updateStatus: jest.fn()
      };
      
      orchestrator.activeExecutions.set('task-123', mockExecution);

      const result = await orchestrator.cancelExecution('task-123');

      expect(result).toBe(true);
      expect(mockExecution.updateStatus).toHaveBeenCalledWith('cancelled', {
        cancelled_at: expect.any(Date)
      });
      expect(orchestrator.activeExecutions.has('task-123')).toBe(false);
    });

    it('should return false for non-existent execution', async () => {
      const result = await orchestrator.cancelExecution('nonexistent-task');
      expect(result).toBe(false);
    });
  });

  describe('estimateExecutionTime', () => {
    it('should estimate time based on complexity', () => {
      const simpleTask = { complexity_score: 3 };
      const complexTask = { complexity_score: 8 };

      const simpleTime = orchestrator.estimateExecutionTime(simpleTask);
      const complexTime = orchestrator.estimateExecutionTime(complexTask);

      expect(complexTime).toBeGreaterThan(simpleTime);
    });

    it('should use default complexity if not provided', () => {
      const task = {};
      const time = orchestrator.estimateExecutionTime(task);
      expect(time).toBe(60000 * 5); // base time * default complexity
    });
  });

  describe('identifyRiskFactors', () => {
    it('should identify high complexity risk', () => {
      const task = { complexity_score: 9 };
      const risks = orchestrator.identifyRiskFactors(task);
      expect(risks).toContain('high_complexity');
    });

    it('should identify many files affected risk', () => {
      const task = { affected_files: new Array(15).fill('file.js') };
      const risks = orchestrator.identifyRiskFactors(task);
      expect(risks).toContain('many_files_affected');
    });

    it('should identify urgent deployment risk for hotfix', () => {
      const task = { type: 'hotfix' };
      const risks = orchestrator.identifyRiskFactors(task);
      expect(risks).toContain('urgent_deployment');
    });

    it('should return empty array for low-risk task', () => {
      const task = { complexity_score: 3, affected_files: ['file.js'], type: 'feature' };
      const risks = orchestrator.identifyRiskFactors(task);
      expect(risks).toEqual([]);
    });
  });
});

