/**
 * End-to-End Workflow Validator
 * 
 * Validates complete end-to-end workflows from task creation through
 * PR validation and deployment in the claude-task-master system.
 */

import { performance } from 'perf_hooks';
import logger from '../../mcp-server/src/logger.js';

/**
 * Workflow Validator Class
 */
export class WorkflowValidator {
  constructor() {
    this.workflows = new Map();
    this.validationResults = new Map();
    this.workflowMetrics = {
      totalWorkflows: 0,
      completedWorkflows: 0,
      failedWorkflows: 0,
      averageCompletionTime: 0,
      workflowTimes: []
    };

    this.workflowSteps = {
      taskCreation: 'Task Creation',
      orchestrationTrigger: 'Orchestration Trigger',
      prGeneration: 'PR Generation',
      prValidation: 'PR Validation',
      linearUpdate: 'Linear Ticket Update',
      prMerge: 'PR Merge',
      workflowCompletion: 'Workflow Completion'
    };

    this.slaRequirements = {
      maxWorkflowTime: 900000, // 15 minutes
      maxStepTime: 300000, // 5 minutes per step
      minSuccessRate: 0.95, // 95% success rate
      maxErrorRate: 0.05 // 5% error rate
    };
  }

  /**
   * Initialize workflow validator
   */
  async initialize() {
    logger.info('Initializing workflow validator...');
    
    // Setup workflow templates
    this.setupWorkflowTemplates();
    
    logger.info('Workflow validator initialized');
  }

  /**
   * Setup workflow templates
   */
  setupWorkflowTemplates() {
    // Happy path workflow
    this.workflows.set('happy_path', {
      name: 'Happy Path Workflow',
      description: 'Complete successful workflow from task to merged PR',
      steps: Object.keys(this.workflowSteps),
      expectedDuration: 600000, // 10 minutes
      criticalPath: true
    });

    // Error recovery workflow
    this.workflows.set('error_recovery', {
      name: 'Error Recovery Workflow',
      description: 'Workflow with error injection and recovery testing',
      steps: Object.keys(this.workflowSteps),
      expectedDuration: 900000, // 15 minutes
      criticalPath: true,
      errorInjection: true
    });

    // Concurrent workflow
    this.workflows.set('concurrent', {
      name: 'Concurrent Workflow',
      description: 'Multiple workflows running simultaneously',
      steps: Object.keys(this.workflowSteps),
      expectedDuration: 720000, // 12 minutes
      concurrency: 3,
      criticalPath: false
    });

    // Complex task workflow
    this.workflows.set('complex_task', {
      name: 'Complex Task Workflow',
      description: 'Workflow with complex, multi-step task',
      steps: Object.keys(this.workflowSteps),
      expectedDuration: 1200000, // 20 minutes
      complexity: 'high',
      criticalPath: false
    });
  }

  /**
   * Validate all workflows
   */
  async validateAllWorkflows() {
    logger.info('Starting end-to-end workflow validation...');
    
    const results = new Map();
    
    for (const [workflowId, workflow] of this.workflows) {
      try {
        logger.info(`Validating workflow: ${workflow.name}`);
        
        const result = await this.validateWorkflow(workflowId, workflow);
        results.set(workflowId, result);
        
        this.workflowMetrics.totalWorkflows++;
        if (result.success) {
          this.workflowMetrics.completedWorkflows++;
          this.workflowMetrics.workflowTimes.push(result.duration);
        } else {
          this.workflowMetrics.failedWorkflows++;
        }
        
      } catch (error) {
        logger.error(`Workflow validation failed for ${workflow.name}: ${error.message}`);
        results.set(workflowId, {
          success: false,
          error: error.message,
          workflow: workflow.name
        });
        this.workflowMetrics.totalWorkflows++;
        this.workflowMetrics.failedWorkflows++;
      }
    }

    // Calculate metrics
    this.calculateWorkflowMetrics();
    
    logger.info(`Workflow validation completed: ${this.workflowMetrics.completedWorkflows}/${this.workflowMetrics.totalWorkflows} workflows successful`);
    
    return results;
  }

  /**
   * Validate single workflow
   */
  async validateWorkflow(workflowId, workflow) {
    const startTime = performance.now();
    const workflowInstance = {
      id: `${workflowId}_${Date.now()}`,
      name: workflow.name,
      startTime: new Date().toISOString(),
      steps: [],
      status: 'running',
      errors: []
    };

    try {
      logger.info(`Starting workflow: ${workflow.name}`);

      // Execute workflow steps
      for (const stepKey of workflow.steps) {
        const stepResult = await this.executeWorkflowStep(
          workflowInstance, 
          stepKey, 
          this.workflowSteps[stepKey],
          workflow
        );
        
        workflowInstance.steps.push(stepResult);
        
        if (!stepResult.success) {
          throw new Error(`Step '${stepResult.name}' failed: ${stepResult.error}`);
        }
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      workflowInstance.status = 'completed';
      workflowInstance.endTime = new Date().toISOString();
      workflowInstance.duration = duration;

      // Validate against SLA requirements
      const slaValidation = this.validateWorkflowSLA(workflowInstance, workflow);

      logger.info(`Workflow '${workflow.name}' completed in ${(duration / 1000).toFixed(2)} seconds`);

      return {
        success: true,
        workflowId,
        workflowInstance,
        duration,
        slaValidation,
        stepsCompleted: workflowInstance.steps.length,
        averageStepTime: duration / workflowInstance.steps.length
      };

    } catch (error) {
      const endTime = performance.now();
      const duration = endTime - startTime;

      workflowInstance.status = 'failed';
      workflowInstance.endTime = new Date().toISOString();
      workflowInstance.duration = duration;
      workflowInstance.error = error.message;

      logger.error(`Workflow '${workflow.name}' failed after ${(duration / 1000).toFixed(2)} seconds: ${error.message}`);

      return {
        success: false,
        workflowId,
        workflowInstance,
        duration,
        error: error.message,
        stepsCompleted: workflowInstance.steps.length,
        failedStep: workflowInstance.steps[workflowInstance.steps.length - 1]?.name
      };
    }
  }

  /**
   * Execute workflow step
   */
  async executeWorkflowStep(workflowInstance, stepKey, stepName, workflow) {
    const stepStartTime = performance.now();
    
    logger.debug(`Executing step: ${stepName}`);

    const stepResult = {
      key: stepKey,
      name: stepName,
      startTime: new Date().toISOString(),
      success: false,
      duration: 0,
      data: {}
    };

    try {
      // Execute step based on type
      switch (stepKey) {
        case 'taskCreation':
          stepResult.data = await this.executeTaskCreation(workflowInstance, workflow);
          break;
        case 'orchestrationTrigger':
          stepResult.data = await this.executeOrchestrationTrigger(workflowInstance, workflow);
          break;
        case 'prGeneration':
          stepResult.data = await this.executePRGeneration(workflowInstance, workflow);
          break;
        case 'prValidation':
          stepResult.data = await this.executePRValidation(workflowInstance, workflow);
          break;
        case 'linearUpdate':
          stepResult.data = await this.executeLinearUpdate(workflowInstance, workflow);
          break;
        case 'prMerge':
          stepResult.data = await this.executePRMerge(workflowInstance, workflow);
          break;
        case 'workflowCompletion':
          stepResult.data = await this.executeWorkflowCompletion(workflowInstance, workflow);
          break;
        default:
          throw new Error(`Unknown workflow step: ${stepKey}`);
      }

      const stepEndTime = performance.now();
      stepResult.duration = stepEndTime - stepStartTime;
      stepResult.endTime = new Date().toISOString();
      stepResult.success = true;

      // Validate step timing
      if (stepResult.duration > this.slaRequirements.maxStepTime) {
        logger.warn(`Step '${stepName}' exceeded maximum time: ${stepResult.duration}ms`);
      }

      logger.debug(`Step '${stepName}' completed in ${stepResult.duration.toFixed(2)}ms`);

      return stepResult;

    } catch (error) {
      const stepEndTime = performance.now();
      stepResult.duration = stepEndTime - stepStartTime;
      stepResult.endTime = new Date().toISOString();
      stepResult.error = error.message;
      stepResult.success = false;

      logger.error(`Step '${stepName}' failed: ${error.message}`);

      // Add to workflow errors
      workflowInstance.errors.push({
        step: stepName,
        error: error.message,
        timestamp: new Date().toISOString()
      });

      return stepResult;
    }
  }

  /**
   * Execute task creation step
   */
  async executeTaskCreation(workflowInstance, workflow) {
    // Simulate task creation in database
    const taskData = {
      id: `task_${workflowInstance.id}`,
      title: `Integration Test Task for ${workflow.name}`,
      description: `This task was created for workflow validation: ${workflow.description}`,
      priority: workflow.complexity === 'high' ? 'high' : 'medium',
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    // Simulate database operation
    await this.simulateAsyncOperation(100, 300); // 100-300ms

    // Inject error if specified
    if (workflow.errorInjection && Math.random() < 0.1) { // 10% error rate
      throw new Error('Simulated task creation failure');
    }

    return {
      taskId: taskData.id,
      taskCreated: true,
      taskData
    };
  }

  /**
   * Execute orchestration trigger step
   */
  async executeOrchestrationTrigger(workflowInstance, workflow) {
    // Simulate orchestration engine trigger
    const orchestrationData = {
      workflowId: workflowInstance.id,
      taskId: workflowInstance.steps[0]?.data?.taskId,
      orchestrationTriggered: true,
      timestamp: new Date().toISOString()
    };

    // Simulate orchestration processing
    await this.simulateAsyncOperation(200, 500); // 200-500ms

    // Inject error if specified
    if (workflow.errorInjection && Math.random() < 0.05) { // 5% error rate
      throw new Error('Simulated orchestration failure');
    }

    return orchestrationData;
  }

  /**
   * Execute PR generation step
   */
  async executePRGeneration(workflowInstance, workflow) {
    // Simulate PR generation via codegen
    const prData = {
      prId: `pr_${workflowInstance.id}`,
      prNumber: Math.floor(Math.random() * 1000) + 1,
      title: `Fix for task ${workflowInstance.steps[0]?.data?.taskId}`,
      branch: `feature/task-${workflowInstance.id}`,
      status: 'open',
      createdAt: new Date().toISOString()
    };

    // Simulate PR generation time (longer for complex tasks)
    const baseTime = workflow.complexity === 'high' ? 2000 : 1000;
    await this.simulateAsyncOperation(baseTime, baseTime + 1000);

    // Inject error if specified
    if (workflow.errorInjection && Math.random() < 0.08) { // 8% error rate
      throw new Error('Simulated PR generation failure');
    }

    return prData;
  }

  /**
   * Execute PR validation step
   */
  async executePRValidation(workflowInstance, workflow) {
    // Simulate PR validation via agentapi
    const validationData = {
      prId: workflowInstance.steps[2]?.data?.prId,
      validationStatus: 'passed',
      checksRun: ['lint', 'test', 'security', 'build'],
      validatedAt: new Date().toISOString()
    };

    // Simulate validation processing
    await this.simulateAsyncOperation(500, 1500); // 500-1500ms

    // Inject error if specified
    if (workflow.errorInjection && Math.random() < 0.12) { // 12% error rate
      validationData.validationStatus = 'failed';
      validationData.errors = ['Test failures detected'];
      throw new Error('Simulated PR validation failure');
    }

    return validationData;
  }

  /**
   * Execute Linear update step
   */
  async executeLinearUpdate(workflowInstance, workflow) {
    // Simulate Linear ticket update
    const updateData = {
      taskId: workflowInstance.steps[0]?.data?.taskId,
      prId: workflowInstance.steps[2]?.data?.prId,
      status: 'in_review',
      updatedAt: new Date().toISOString(),
      linearUpdated: true
    };

    // Simulate Linear API call
    await this.simulateAsyncOperation(100, 200); // 100-200ms

    // Inject error if specified
    if (workflow.errorInjection && Math.random() < 0.03) { // 3% error rate
      throw new Error('Simulated Linear update failure');
    }

    return updateData;
  }

  /**
   * Execute PR merge step
   */
  async executePRMerge(workflowInstance, workflow) {
    // Simulate PR merge
    const mergeData = {
      prId: workflowInstance.steps[2]?.data?.prId,
      prNumber: workflowInstance.steps[2]?.data?.prNumber,
      mergeStatus: 'merged',
      mergedAt: new Date().toISOString(),
      mergeCommit: `commit_${workflowInstance.id}`
    };

    // Simulate merge processing
    await this.simulateAsyncOperation(200, 400); // 200-400ms

    // Inject error if specified
    if (workflow.errorInjection && Math.random() < 0.05) { // 5% error rate
      mergeData.mergeStatus = 'failed';
      throw new Error('Simulated PR merge failure');
    }

    return mergeData;
  }

  /**
   * Execute workflow completion step
   */
  async executeWorkflowCompletion(workflowInstance, workflow) {
    // Simulate workflow completion and cleanup
    const completionData = {
      workflowId: workflowInstance.id,
      taskId: workflowInstance.steps[0]?.data?.taskId,
      prId: workflowInstance.steps[2]?.data?.prId,
      completionStatus: 'completed',
      completedAt: new Date().toISOString(),
      workflowCompleted: true
    };

    // Simulate completion processing
    await this.simulateAsyncOperation(50, 150); // 50-150ms

    return completionData;
  }

  /**
   * Simulate async operation with random delay
   */
  async simulateAsyncOperation(minMs, maxMs) {
    const delay = Math.random() * (maxMs - minMs) + minMs;
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Validate workflow against SLA requirements
   */
  validateWorkflowSLA(workflowInstance, workflow) {
    const validation = {
      workflowTime: {
        requirement: `< ${this.slaRequirements.maxWorkflowTime}ms`,
        actual: `${workflowInstance.duration.toFixed(2)}ms`,
        passed: workflowInstance.duration < this.slaRequirements.maxWorkflowTime
      },
      stepTimes: {
        requirement: `All steps < ${this.slaRequirements.maxStepTime}ms`,
        violations: [],
        passed: true
      },
      errorRate: {
        requirement: `< ${(this.slaRequirements.maxErrorRate * 100).toFixed(1)}%`,
        actual: `${((workflowInstance.errors.length / workflowInstance.steps.length) * 100).toFixed(1)}%`,
        passed: (workflowInstance.errors.length / workflowInstance.steps.length) < this.slaRequirements.maxErrorRate
      }
    };

    // Check individual step times
    for (const step of workflowInstance.steps) {
      if (step.duration > this.slaRequirements.maxStepTime) {
        validation.stepTimes.violations.push({
          step: step.name,
          duration: step.duration.toFixed(2),
          limit: this.slaRequirements.maxStepTime
        });
        validation.stepTimes.passed = false;
      }
    }

    const allPassed = validation.workflowTime.passed && 
                     validation.stepTimes.passed && 
                     validation.errorRate.passed;

    return {
      allRequirementsMet: allPassed,
      details: validation,
      summary: allPassed ? 'All SLA requirements met' : 'Some SLA requirements not met'
    };
  }

  /**
   * Calculate workflow metrics
   */
  calculateWorkflowMetrics() {
    if (this.workflowMetrics.workflowTimes.length > 0) {
      this.workflowMetrics.averageCompletionTime = 
        this.workflowMetrics.workflowTimes.reduce((a, b) => a + b, 0) / 
        this.workflowMetrics.workflowTimes.length;
    }

    this.workflowMetrics.successRate = this.workflowMetrics.totalWorkflows > 0 
      ? this.workflowMetrics.completedWorkflows / this.workflowMetrics.totalWorkflows 
      : 0;

    this.workflowMetrics.failureRate = this.workflowMetrics.totalWorkflows > 0 
      ? this.workflowMetrics.failedWorkflows / this.workflowMetrics.totalWorkflows 
      : 0;
  }

  /**
   * Generate workflow validation report
   */
  generateWorkflowReport(validationResults) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalWorkflows: this.workflowMetrics.totalWorkflows,
        completedWorkflows: this.workflowMetrics.completedWorkflows,
        failedWorkflows: this.workflowMetrics.failedWorkflows,
        successRate: `${(this.workflowMetrics.successRate * 100).toFixed(1)}%`,
        averageCompletionTime: `${(this.workflowMetrics.averageCompletionTime / 1000).toFixed(2)} seconds`
      },
      slaCompliance: {
        overallCompliance: this.workflowMetrics.successRate >= this.slaRequirements.minSuccessRate,
        requirements: this.slaRequirements,
        metrics: this.workflowMetrics
      },
      workflowResults: Object.fromEntries(validationResults),
      recommendations: this.generateWorkflowRecommendations(validationResults)
    };

    return report;
  }

  /**
   * Generate workflow recommendations
   */
  generateWorkflowRecommendations(validationResults) {
    const recommendations = [];

    // Check success rate
    if (this.workflowMetrics.successRate < this.slaRequirements.minSuccessRate) {
      recommendations.push({
        priority: 'high',
        category: 'reliability',
        message: `Workflow success rate (${(this.workflowMetrics.successRate * 100).toFixed(1)}%) below SLA requirement (${(this.slaRequirements.minSuccessRate * 100).toFixed(1)}%)`
      });
    }

    // Check average completion time
    if (this.workflowMetrics.averageCompletionTime > this.slaRequirements.maxWorkflowTime * 0.8) {
      recommendations.push({
        priority: 'medium',
        category: 'performance',
        message: `Average workflow completion time approaching SLA limit - consider optimization`
      });
    }

    // Check individual workflow results
    for (const [workflowId, result] of validationResults) {
      if (!result.success) {
        recommendations.push({
          priority: 'high',
          category: 'reliability',
          message: `Workflow '${workflowId}' consistently failing - investigate root cause`
        });
      } else if (result.slaValidation && !result.slaValidation.allRequirementsMet) {
        recommendations.push({
          priority: 'medium',
          category: 'performance',
          message: `Workflow '${workflowId}' not meeting SLA requirements`
        });
      }
    }

    // Add general recommendations if no issues
    if (recommendations.length === 0) {
      recommendations.push({
        priority: 'low',
        category: 'optimization',
        message: 'All workflows meeting SLA requirements - consider additional optimization opportunities'
      });
    }

    return recommendations;
  }

  /**
   * Get workflow metrics summary
   */
  getWorkflowMetrics() {
    return {
      ...this.workflowMetrics,
      slaCompliance: this.workflowMetrics.successRate >= this.slaRequirements.minSuccessRate
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    logger.info('Cleaning up workflow validator...');
    
    // Clear workflow data
    this.validationResults.clear();
    
    // Reset metrics
    this.workflowMetrics = {
      totalWorkflows: 0,
      completedWorkflows: 0,
      failedWorkflows: 0,
      averageCompletionTime: 0,
      workflowTimes: []
    };

    logger.info('Workflow validator cleanup complete');
  }
}

export default WorkflowValidator;

