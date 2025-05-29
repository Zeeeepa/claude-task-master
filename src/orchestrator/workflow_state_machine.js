/**
 * @fileoverview Workflow State Machine
 * @description Flexible workflow definitions and state management for different task types
 */

import { log } from '../utils/logger.js';

/**
 * Workflow State Machine - Manages workflow definitions and execution state
 */
export class WorkflowStateMachine {
  constructor() {
    this.workflows = {
      default: {
        name: 'Default Workflow',
        description: 'Standard development workflow',
        stages: [
          { name: 'code_generation', type: 'code_generation', required: true, timeout: 600000 },
          { name: 'pr_creation', type: 'pr_creation', required: true, timeout: 120000 },
          { name: 'validation', type: 'validation', required: true, timeout: 300000 },
          { name: 'deployment', type: 'deployment', required: false, timeout: 600000 }
        ]
      },
      
      hotfix: {
        name: 'Hotfix Workflow',
        description: 'Fast-track workflow for critical fixes',
        stages: [
          { name: 'code_generation', type: 'code_generation', required: true, timeout: 300000 },
          { name: 'validation', type: 'validation', required: true, timeout: 180000 },
          { name: 'pr_creation', type: 'pr_creation', required: true, timeout: 60000 },
          { name: 'deployment', type: 'deployment', required: true, timeout: 300000 }
        ]
      },
      
      feature: {
        name: 'Feature Workflow',
        description: 'Comprehensive workflow for new features',
        stages: [
          { name: 'analysis', type: 'analysis', required: true, timeout: 300000 },
          { name: 'code_generation', type: 'code_generation', required: true, timeout: 900000 },
          { name: 'testing', type: 'testing', required: true, timeout: 600000 },
          { name: 'pr_creation', type: 'pr_creation', required: true, timeout: 120000 },
          { name: 'validation', type: 'validation', required: true, timeout: 600000 }
        ]
      },

      bugfix: {
        name: 'Bug Fix Workflow',
        description: 'Standard workflow for bug fixes',
        stages: [
          { name: 'analysis', type: 'analysis', required: true, timeout: 180000 },
          { name: 'code_generation', type: 'code_generation', required: true, timeout: 600000 },
          { name: 'testing', type: 'testing', required: true, timeout: 300000 },
          { name: 'pr_creation', type: 'pr_creation', required: true, timeout: 120000 },
          { name: 'validation', type: 'validation', required: true, timeout: 300000 }
        ]
      },

      refactor: {
        name: 'Refactor Workflow',
        description: 'Workflow for code refactoring tasks',
        stages: [
          { name: 'analysis', type: 'analysis', required: true, timeout: 600000 },
          { name: 'code_generation', type: 'code_generation', required: true, timeout: 1200000 },
          { name: 'testing', type: 'testing', required: true, timeout: 900000 },
          { name: 'pr_creation', type: 'pr_creation', required: true, timeout: 120000 },
          { name: 'validation', type: 'validation', required: true, timeout: 600000 }
        ]
      },

      experimental: {
        name: 'Experimental Workflow',
        description: 'Workflow for experimental features and prototypes',
        stages: [
          { name: 'analysis', type: 'analysis', required: false, timeout: 300000 },
          { name: 'code_generation', type: 'code_generation', required: true, timeout: 600000 },
          { name: 'pr_creation', type: 'pr_creation', required: true, timeout: 120000 },
          { name: 'validation', type: 'validation', required: false, timeout: 300000 }
        ]
      }
    };

    this.stageTypes = {
      analysis: {
        name: 'Analysis',
        description: 'Analyze requirements and plan implementation',
        dependencies: [],
        outputs: ['analysis_report', 'implementation_plan']
      },
      code_generation: {
        name: 'Code Generation',
        description: 'Generate or modify code based on requirements',
        dependencies: ['analysis'],
        outputs: ['modified_files', 'commit_hash', 'branch_name']
      },
      testing: {
        name: 'Testing',
        description: 'Run automated tests and quality checks',
        dependencies: ['code_generation'],
        outputs: ['test_results', 'coverage_report']
      },
      pr_creation: {
        name: 'PR Creation',
        description: 'Create pull request with changes',
        dependencies: ['code_generation'],
        outputs: ['pr_number', 'pr_url']
      },
      validation: {
        name: 'Validation',
        description: 'Validate changes through CI/CD pipeline',
        dependencies: ['pr_creation'],
        outputs: ['validation_status', 'check_results']
      },
      deployment: {
        name: 'Deployment',
        description: 'Deploy changes to target environment',
        dependencies: ['validation'],
        outputs: ['deployment_status', 'deployed_version']
      }
    };
  }

  /**
   * Create a workflow instance for execution
   * @param {string} type - Workflow type
   * @param {Object} options - Workflow options
   * @returns {Object} Workflow instance
   */
  createWorkflow(type = 'default', options = {}) {
    const template = this.workflows[type] || this.workflows.default;
    
    log('info', `🔄 Creating workflow: ${template.name}`, {
      type,
      stages: template.stages.length
    });
    
    return new WorkflowInstance(template, options);
  }

  /**
   * Get available workflow types
   * @returns {Array} Available workflow types
   */
  getAvailableWorkflows() {
    return Object.keys(this.workflows).map(key => ({
      type: key,
      name: this.workflows[key].name,
      description: this.workflows[key].description,
      stages: this.workflows[key].stages.length
    }));
  }

  /**
   * Get workflow template by type
   * @param {string} type - Workflow type
   * @returns {Object} Workflow template
   */
  getWorkflowTemplate(type) {
    return this.workflows[type] || null;
  }

  /**
   * Register a custom workflow
   * @param {string} type - Workflow type
   * @param {Object} definition - Workflow definition
   */
  registerWorkflow(type, definition) {
    if (!definition.name || !definition.stages || !Array.isArray(definition.stages)) {
      throw new Error('Invalid workflow definition');
    }

    this.workflows[type] = {
      name: definition.name,
      description: definition.description || '',
      stages: definition.stages.map(stage => ({
        name: stage.name,
        type: stage.type,
        required: stage.required !== false,
        timeout: stage.timeout || 600000,
        ...stage
      }))
    };

    log('info', `📝 Registered custom workflow: ${type}`, {
      name: definition.name,
      stages: definition.stages.length
    });
  }

  /**
   * Validate workflow definition
   * @param {Object} definition - Workflow definition
   * @returns {Object} Validation result
   */
  validateWorkflow(definition) {
    const errors = [];
    const warnings = [];

    if (!definition.name) {
      errors.push('Workflow name is required');
    }

    if (!definition.stages || !Array.isArray(definition.stages)) {
      errors.push('Workflow stages must be an array');
    } else {
      definition.stages.forEach((stage, index) => {
        if (!stage.name) {
          errors.push(`Stage ${index} is missing name`);
        }
        if (!stage.type) {
          errors.push(`Stage ${index} is missing type`);
        }
        if (!this.stageTypes[stage.type]) {
          warnings.push(`Stage ${index} uses unknown type: ${stage.type}`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get stage type information
   * @param {string} type - Stage type
   * @returns {Object} Stage type info
   */
  getStageType(type) {
    return this.stageTypes[type] || null;
  }

  /**
   * Get all available stage types
   * @returns {Object} Stage types
   */
  getStageTypes() {
    return { ...this.stageTypes };
  }
}

/**
 * Workflow Instance - Represents an executing workflow
 */
class WorkflowInstance {
  constructor(template, options = {}) {
    this.type = template.type || 'custom';
    this.name = template.name;
    this.description = template.description;
    this.stages = [...template.stages];
    this.options = options;
    
    // Execution state
    this.currentStageIndex = 0;
    this.completedStages = [];
    this.failedStages = [];
    this.skippedStages = [];
    this.results = {};
    this.startTime = new Date();
    this.endTime = null;
    this.status = 'pending';
    
    // Stage execution tracking
    this.stageHistory = [];
  }

  /**
   * Get current progress as a percentage
   * @returns {number} Progress percentage (0-1)
   */
  getProgress() {
    if (this.stages.length === 0) return 1;
    return this.completedStages.length / this.stages.length;
  }

  /**
   * Get current stage
   * @returns {Object|null} Current stage
   */
  getCurrentStage() {
    if (this.currentStageIndex >= this.stages.length) {
      return null;
    }
    return this.stages[this.currentStageIndex];
  }

  /**
   * Get next stage
   * @returns {Object|null} Next stage
   */
  getNextStage() {
    const nextIndex = this.currentStageIndex + 1;
    if (nextIndex >= this.stages.length) {
      return null;
    }
    return this.stages[nextIndex];
  }

  /**
   * Mark a stage as completed
   * @param {string} stageName - Stage name
   * @param {Object} result - Stage result
   */
  completeStage(stageName, result = {}) {
    const stage = this.stages.find(s => s.name === stageName);
    if (!stage) {
      throw new Error(`Stage not found: ${stageName}`);
    }

    this.completedStages.push(stageName);
    this.results[stageName] = result;
    
    this.stageHistory.push({
      stage: stageName,
      status: 'completed',
      result,
      timestamp: new Date(),
      duration: this.getStageExecutionTime(stageName)
    });

    // Move to next stage
    if (this.currentStageIndex < this.stages.length - 1) {
      this.currentStageIndex++;
    }

    log('info', `✅ Stage completed: ${stageName}`, {
      workflow: this.type,
      progress: this.getProgress()
    });
  }

  /**
   * Mark a stage as failed
   * @param {string} stageName - Stage name
   * @param {Error} error - Error that occurred
   */
  failStage(stageName, error) {
    const stage = this.stages.find(s => s.name === stageName);
    if (!stage) {
      throw new Error(`Stage not found: ${stageName}`);
    }

    this.failedStages.push({ 
      stage: stageName, 
      error: error.message,
      timestamp: new Date()
    });
    
    this.stageHistory.push({
      stage: stageName,
      status: 'failed',
      error: error.message,
      timestamp: new Date(),
      duration: this.getStageExecutionTime(stageName)
    });

    log('error', `❌ Stage failed: ${stageName}`, {
      workflow: this.type,
      error: error.message
    });
  }

  /**
   * Skip a stage
   * @param {string} stageName - Stage name
   * @param {string} reason - Reason for skipping
   */
  skipStage(stageName, reason = 'Not required') {
    const stage = this.stages.find(s => s.name === stageName);
    if (!stage) {
      throw new Error(`Stage not found: ${stageName}`);
    }

    this.skippedStages.push({ 
      stage: stageName, 
      reason,
      timestamp: new Date()
    });
    
    this.stageHistory.push({
      stage: stageName,
      status: 'skipped',
      reason,
      timestamp: new Date()
    });

    // Move to next stage
    if (this.currentStageIndex < this.stages.length - 1) {
      this.currentStageIndex++;
    }

    log('info', `⏭️ Stage skipped: ${stageName}`, {
      workflow: this.type,
      reason
    });
  }

  /**
   * Check if workflow is complete
   * @returns {boolean} True if complete
   */
  isComplete() {
    const requiredStages = this.stages.filter(s => s.required);
    const completedRequiredStages = requiredStages.filter(s => 
      this.completedStages.includes(s.name)
    );
    
    return completedRequiredStages.length === requiredStages.length;
  }

  /**
   * Check if workflow has failed
   * @returns {boolean} True if failed
   */
  hasFailed() {
    return this.failedStages.some(failed => {
      const stage = this.stages.find(s => s.name === failed.stage);
      return stage && stage.required;
    });
  }

  /**
   * Get workflow execution time
   * @returns {number} Execution time in milliseconds
   */
  getExecutionTime() {
    const endTime = this.endTime || new Date();
    return endTime.getTime() - this.startTime.getTime();
  }

  /**
   * Get stage execution time
   * @param {string} stageName - Stage name
   * @returns {number} Stage execution time in milliseconds
   */
  getStageExecutionTime(stageName) {
    const stageEntries = this.stageHistory.filter(h => h.stage === stageName);
    if (stageEntries.length === 0) return 0;
    
    // Find start and end times for the stage
    const startEntry = stageEntries.find(e => e.status === 'started');
    const endEntry = stageEntries.find(e => ['completed', 'failed', 'skipped'].includes(e.status));
    
    if (!startEntry || !endEntry) return 0;
    
    return endEntry.timestamp.getTime() - startEntry.timestamp.getTime();
  }

  /**
   * Get workflow result summary
   * @returns {Object} Result summary
   */
  getResult() {
    this.endTime = new Date();
    this.status = this.hasFailed() ? 'failed' : 
                  this.isComplete() ? 'completed' : 'running';

    return {
      type: this.type,
      name: this.name,
      status: this.status,
      completed: this.completedStages,
      failed: this.failedStages,
      skipped: this.skippedStages,
      results: this.results,
      progress: this.getProgress(),
      executionTime: this.getExecutionTime(),
      startTime: this.startTime,
      endTime: this.endTime,
      stageHistory: this.stageHistory,
      summary: this.generateSummary()
    };
  }

  /**
   * Generate workflow execution summary
   * @returns {Object} Execution summary
   */
  generateSummary() {
    const totalStages = this.stages.length;
    const requiredStages = this.stages.filter(s => s.required).length;
    const completedRequired = this.stages.filter(s => 
      s.required && this.completedStages.includes(s.name)
    ).length;

    return {
      totalStages,
      requiredStages,
      completedStages: this.completedStages.length,
      completedRequired,
      failedStages: this.failedStages.length,
      skippedStages: this.skippedStages.length,
      successRate: totalStages > 0 ? this.completedStages.length / totalStages : 0,
      requiredSuccessRate: requiredStages > 0 ? completedRequired / requiredStages : 0
    };
  }

  /**
   * Reset workflow to initial state
   */
  reset() {
    this.currentStageIndex = 0;
    this.completedStages = [];
    this.failedStages = [];
    this.skippedStages = [];
    this.results = {};
    this.startTime = new Date();
    this.endTime = null;
    this.status = 'pending';
    this.stageHistory = [];
  }

  /**
   * Get workflow status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      type: this.type,
      status: this.status,
      currentStage: this.getCurrentStage()?.name,
      progress: this.getProgress(),
      executionTime: this.getExecutionTime(),
      completedStages: this.completedStages.length,
      totalStages: this.stages.length
    };
  }
}

