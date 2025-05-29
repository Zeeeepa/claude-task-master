/**
 * @fileoverview Workflow State Machine Tests
 * @description Unit tests for the WorkflowStateMachine class
 */

import { jest } from '@jest/globals';
import { WorkflowStateMachine } from '../workflow_state_machine.js';

// Mock logger
jest.mock('../../utils/logger.js', () => ({
  log: jest.fn()
}));

describe('WorkflowStateMachine', () => {
  let stateMachine;

  beforeEach(() => {
    stateMachine = new WorkflowStateMachine();
  });

  describe('constructor', () => {
    it('should initialize with predefined workflows', () => {
      expect(stateMachine.workflows).toBeDefined();
      expect(stateMachine.workflows.default).toBeDefined();
      expect(stateMachine.workflows.hotfix).toBeDefined();
      expect(stateMachine.workflows.feature).toBeDefined();
      expect(stateMachine.workflows.bugfix).toBeDefined();
      expect(stateMachine.workflows.refactor).toBeDefined();
    });

    it('should initialize with stage types', () => {
      expect(stateMachine.stageTypes).toBeDefined();
      expect(stateMachine.stageTypes.analysis).toBeDefined();
      expect(stateMachine.stageTypes.code_generation).toBeDefined();
      expect(stateMachine.stageTypes.testing).toBeDefined();
    });
  });

  describe('createWorkflow', () => {
    it('should create default workflow instance', () => {
      const workflow = stateMachine.createWorkflow();
      
      expect(workflow.type).toBe('default');
      expect(workflow.stages).toBeDefined();
      expect(workflow.stages.length).toBeGreaterThan(0);
      expect(workflow.getProgress).toBeDefined();
    });

    it('should create specific workflow type', () => {
      const workflow = stateMachine.createWorkflow('hotfix');
      
      expect(workflow.type).toBe('hotfix');
      expect(workflow.name).toBe('Hotfix Workflow');
    });

    it('should fallback to default for unknown type', () => {
      const workflow = stateMachine.createWorkflow('unknown');
      
      expect(workflow.type).toBe('unknown');
      expect(workflow.stages).toEqual(stateMachine.workflows.default.stages);
    });
  });

  describe('getAvailableWorkflows', () => {
    it('should return all available workflow types', () => {
      const workflows = stateMachine.getAvailableWorkflows();
      
      expect(workflows).toBeInstanceOf(Array);
      expect(workflows.length).toBeGreaterThan(0);
      
      const workflowTypes = workflows.map(w => w.type);
      expect(workflowTypes).toContain('default');
      expect(workflowTypes).toContain('hotfix');
      expect(workflowTypes).toContain('feature');
    });

    it('should include workflow metadata', () => {
      const workflows = stateMachine.getAvailableWorkflows();
      const defaultWorkflow = workflows.find(w => w.type === 'default');
      
      expect(defaultWorkflow.name).toBeDefined();
      expect(defaultWorkflow.description).toBeDefined();
      expect(defaultWorkflow.stages).toBeDefined();
    });
  });

  describe('registerWorkflow', () => {
    it('should register custom workflow', () => {
      const customWorkflow = {
        name: 'Custom Workflow',
        description: 'A custom workflow for testing',
        stages: [
          { name: 'custom_stage', type: 'code_generation', required: true }
        ]
      };

      stateMachine.registerWorkflow('custom', customWorkflow);
      
      expect(stateMachine.workflows.custom).toBeDefined();
      expect(stateMachine.workflows.custom.name).toBe('Custom Workflow');
    });

    it('should throw error for invalid workflow definition', () => {
      const invalidWorkflow = {
        description: 'Missing name and stages'
      };

      expect(() => {
        stateMachine.registerWorkflow('invalid', invalidWorkflow);
      }).toThrow('Invalid workflow definition');
    });

    it('should set default values for stage properties', () => {
      const customWorkflow = {
        name: 'Test Workflow',
        stages: [
          { name: 'test_stage', type: 'code_generation' }
        ]
      };

      stateMachine.registerWorkflow('test', customWorkflow);
      
      const stage = stateMachine.workflows.test.stages[0];
      expect(stage.required).toBe(true); // Default value
      expect(stage.timeout).toBe(600000); // Default value
    });
  });

  describe('validateWorkflow', () => {
    it('should validate correct workflow definition', () => {
      const validWorkflow = {
        name: 'Valid Workflow',
        stages: [
          { name: 'stage1', type: 'code_generation' },
          { name: 'stage2', type: 'testing' }
        ]
      };

      const result = stateMachine.validateWorkflow(validWorkflow);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing name', () => {
      const invalidWorkflow = {
        stages: [
          { name: 'stage1', type: 'code_generation' }
        ]
      };

      const result = stateMachine.validateWorkflow(invalidWorkflow);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Workflow name is required');
    });

    it('should detect missing stages', () => {
      const invalidWorkflow = {
        name: 'Invalid Workflow'
      };

      const result = stateMachine.validateWorkflow(invalidWorkflow);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Workflow stages must be an array');
    });

    it('should detect stage validation errors', () => {
      const invalidWorkflow = {
        name: 'Invalid Workflow',
        stages: [
          { type: 'code_generation' }, // Missing name
          { name: 'stage2' } // Missing type
        ]
      };

      const result = stateMachine.validateWorkflow(invalidWorkflow);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Stage 0 is missing name');
      expect(result.errors).toContain('Stage 1 is missing type');
    });

    it('should warn about unknown stage types', () => {
      const workflowWithUnknownStage = {
        name: 'Test Workflow',
        stages: [
          { name: 'unknown_stage', type: 'unknown_type' }
        ]
      };

      const result = stateMachine.validateWorkflow(workflowWithUnknownStage);
      
      expect(result.warnings).toContain('Stage 0 uses unknown type: unknown_type');
    });
  });

  describe('getStageType', () => {
    it('should return stage type information', () => {
      const stageType = stateMachine.getStageType('code_generation');
      
      expect(stageType).toBeDefined();
      expect(stageType.name).toBe('Code Generation');
      expect(stageType.description).toBeDefined();
      expect(stageType.dependencies).toBeDefined();
      expect(stageType.outputs).toBeDefined();
    });

    it('should return null for unknown stage type', () => {
      const stageType = stateMachine.getStageType('unknown');
      expect(stageType).toBeNull();
    });
  });
});

describe('WorkflowInstance', () => {
  let stateMachine;
  let workflow;

  beforeEach(() => {
    stateMachine = new WorkflowStateMachine();
    workflow = stateMachine.createWorkflow('default');
  });

  describe('getProgress', () => {
    it('should return 0 for new workflow', () => {
      expect(workflow.getProgress()).toBe(0);
    });

    it('should calculate progress correctly', () => {
      workflow.completeStage('code_generation', { success: true });
      
      const progress = workflow.getProgress();
      expect(progress).toBeGreaterThan(0);
      expect(progress).toBeLessThanOrEqual(1);
    });

    it('should return 1 for empty workflow', () => {
      workflow.stages = [];
      expect(workflow.getProgress()).toBe(1);
    });
  });

  describe('getCurrentStage', () => {
    it('should return first stage initially', () => {
      const currentStage = workflow.getCurrentStage();
      expect(currentStage).toBe(workflow.stages[0]);
    });

    it('should return null when all stages completed', () => {
      workflow.currentStageIndex = workflow.stages.length;
      const currentStage = workflow.getCurrentStage();
      expect(currentStage).toBeNull();
    });
  });

  describe('completeStage', () => {
    it('should mark stage as completed', () => {
      const stageName = workflow.stages[0].name;
      const result = { success: true };
      
      workflow.completeStage(stageName, result);
      
      expect(workflow.completedStages).toContain(stageName);
      expect(workflow.results[stageName]).toBe(result);
      expect(workflow.currentStageIndex).toBe(1);
    });

    it('should throw error for unknown stage', () => {
      expect(() => {
        workflow.completeStage('unknown_stage', {});
      }).toThrow('Stage not found: unknown_stage');
    });

    it('should record stage history', () => {
      const stageName = workflow.stages[0].name;
      
      workflow.completeStage(stageName, { success: true });
      
      const historyEntry = workflow.stageHistory.find(h => h.stage === stageName);
      expect(historyEntry).toBeDefined();
      expect(historyEntry.status).toBe('completed');
    });
  });

  describe('failStage', () => {
    it('should mark stage as failed', () => {
      const stageName = workflow.stages[0].name;
      const error = new Error('Stage failed');
      
      workflow.failStage(stageName, error);
      
      expect(workflow.failedStages).toHaveLength(1);
      expect(workflow.failedStages[0].stage).toBe(stageName);
      expect(workflow.failedStages[0].error).toBe('Stage failed');
    });

    it('should record failure in stage history', () => {
      const stageName = workflow.stages[0].name;
      const error = new Error('Stage failed');
      
      workflow.failStage(stageName, error);
      
      const historyEntry = workflow.stageHistory.find(h => h.stage === stageName);
      expect(historyEntry).toBeDefined();
      expect(historyEntry.status).toBe('failed');
      expect(historyEntry.error).toBe('Stage failed');
    });
  });

  describe('skipStage', () => {
    it('should mark stage as skipped', () => {
      const stageName = workflow.stages[0].name;
      const reason = 'Not required';
      
      workflow.skipStage(stageName, reason);
      
      expect(workflow.skippedStages).toHaveLength(1);
      expect(workflow.skippedStages[0].stage).toBe(stageName);
      expect(workflow.skippedStages[0].reason).toBe(reason);
      expect(workflow.currentStageIndex).toBe(1);
    });
  });

  describe('isComplete', () => {
    it('should return false for new workflow', () => {
      expect(workflow.isComplete()).toBe(false);
    });

    it('should return true when all required stages completed', () => {
      // Complete all required stages
      workflow.stages.forEach(stage => {
        if (stage.required) {
          workflow.completeStage(stage.name, { success: true });
        }
      });
      
      expect(workflow.isComplete()).toBe(true);
    });

    it('should return true even if optional stages are skipped', () => {
      // Make last stage optional
      workflow.stages[workflow.stages.length - 1].required = false;
      
      // Complete only required stages
      workflow.stages.forEach(stage => {
        if (stage.required) {
          workflow.completeStage(stage.name, { success: true });
        }
      });
      
      expect(workflow.isComplete()).toBe(true);
    });
  });

  describe('hasFailed', () => {
    it('should return false for new workflow', () => {
      expect(workflow.hasFailed()).toBe(false);
    });

    it('should return true when required stage fails', () => {
      const requiredStage = workflow.stages.find(s => s.required);
      workflow.failStage(requiredStage.name, new Error('Failed'));
      
      expect(workflow.hasFailed()).toBe(true);
    });

    it('should return false when only optional stage fails', () => {
      // Make a stage optional and fail it
      workflow.stages[0].required = false;
      workflow.failStage(workflow.stages[0].name, new Error('Failed'));
      
      expect(workflow.hasFailed()).toBe(false);
    });
  });

  describe('getResult', () => {
    it('should return comprehensive workflow result', () => {
      workflow.completeStage(workflow.stages[0].name, { success: true });
      
      const result = workflow.getResult();
      
      expect(result.type).toBe(workflow.type);
      expect(result.status).toBeDefined();
      expect(result.completed).toBeInstanceOf(Array);
      expect(result.failed).toBeInstanceOf(Array);
      expect(result.progress).toBeDefined();
      expect(result.executionTime).toBeDefined();
      expect(result.summary).toBeDefined();
    });

    it('should set status to completed when workflow is complete', () => {
      // Complete all required stages
      workflow.stages.forEach(stage => {
        if (stage.required) {
          workflow.completeStage(stage.name, { success: true });
        }
      });
      
      const result = workflow.getResult();
      expect(result.status).toBe('completed');
    });

    it('should set status to failed when workflow has failed', () => {
      const requiredStage = workflow.stages.find(s => s.required);
      workflow.failStage(requiredStage.name, new Error('Failed'));
      
      const result = workflow.getResult();
      expect(result.status).toBe('failed');
    });
  });

  describe('reset', () => {
    it('should reset workflow to initial state', () => {
      // Make some progress
      workflow.completeStage(workflow.stages[0].name, { success: true });
      workflow.failStage(workflow.stages[1].name, new Error('Failed'));
      
      // Reset
      workflow.reset();
      
      expect(workflow.currentStageIndex).toBe(0);
      expect(workflow.completedStages).toHaveLength(0);
      expect(workflow.failedStages).toHaveLength(0);
      expect(workflow.results).toEqual({});
      expect(workflow.status).toBe('pending');
    });
  });
});

