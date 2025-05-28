/**
 * Task Orchestration Engine
 * Core system for processing natural language requirements and coordinating CI/CD workflows
 */

import { EventEmitter } from 'events';
import { TaskNLP } from '../nlp/task-nlp.js';
import { WorkflowStateMachine } from '../workflow/state-machine.js';
import { DatabaseManager } from '../database/database-manager.js';
import { AgentCoordinator } from '../integrations/agent-coordinator.js';
import { ErrorRecoveryManager } from '../workflow/error-recovery.js';
import { DependencyResolver } from '../workflow/dependency-resolver.js';

/**
 * Workflow States for CI/CD Pipeline
 */
export const WorkflowStates = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  NLP_PARSING: 'nlp_parsing',
  TASK_DECOMPOSITION: 'task_decomposition',
  DEPENDENCY_RESOLUTION: 'dependency_resolution',
  AGENT_ASSIGNMENT: 'agent_assignment',
  PR_CREATION: 'pr_created',
  VALIDATION_RUNNING: 'validation_running',
  VALIDATION_FAILED: 'validation_failed',
  VALIDATION_PASSED: 'validation_passed',
  MERGED: 'merged',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

/**
 * Task Orchestrator - Main orchestration engine
 */
export class TaskOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      maxConcurrentWorkflows: 20,
      taskTimeout: 600000, // 10 minutes
      retryAttempts: 3,
      enableNLP: true,
      enableAgentCoordination: true,
      ...options
    };

    // Initialize core components
    this.nlp = new TaskNLP(options.nlp);
    this.stateMachine = new WorkflowStateMachine();
    this.database = new DatabaseManager(options.database);
    this.agentCoordinator = new AgentCoordinator(options.agentapi);
    this.errorRecovery = new ErrorRecoveryManager(this);
    this.dependencyResolver = new DependencyResolver();

    // Active workflows tracking
    this.activeWorkflows = new Map();
    this.workflowQueue = [];
    this.metrics = {
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      averageExecutionTime: 0
    };

    this._setupEventHandlers();
  }

  /**
   * Initialize the orchestration engine
   */
  async initialize() {
    try {
      await this.database.initialize();
      await this.agentCoordinator.initialize();
      
      this.emit('orchestrator:initialized');
      console.log('🚀 Task Orchestrator initialized successfully');
      
      return true;
    } catch (error) {
      this.emit('orchestrator:error', error);
      throw new Error(`Failed to initialize orchestrator: ${error.message}`);
    }
  }

  /**
   * Process a task from the database
   * @param {string|number} taskId - Task ID to process
   * @param {Object} options - Processing options
   */
  async processTask(taskId, options = {}) {
    const startTime = Date.now();
    const workflowId = `workflow_${taskId}_${Date.now()}`;
    
    try {
      // Check concurrent workflow limit
      if (this.activeWorkflows.size >= this.options.maxConcurrentWorkflows) {
        this.workflowQueue.push({ taskId, options, workflowId });
        this.emit('workflow:queued', { workflowId, taskId });
        return { workflowId, status: 'queued' };
      }

      // Start workflow
      const workflow = await this._startWorkflow(workflowId, taskId, options);
      this.activeWorkflows.set(workflowId, workflow);
      
      this.emit('workflow:started', { workflowId, taskId });

      // Execute workflow steps
      const result = await this._executeWorkflow(workflow);
      
      // Update metrics
      this._updateMetrics(startTime, result.success);
      
      return result;
      
    } catch (error) {
      this.emit('workflow:error', { workflowId, taskId, error });
      await this.errorRecovery.handleWorkflowError(workflowId, error);
      throw error;
    } finally {
      this.activeWorkflows.delete(workflowId);
      this._processQueue();
    }
  }

  /**
   * Process multiple tasks concurrently
   * @param {Array} taskIds - Array of task IDs to process
   * @param {Object} options - Processing options
   */
  async processBatch(taskIds, options = {}) {
    const batchId = `batch_${Date.now()}`;
    this.emit('batch:started', { batchId, taskIds });

    try {
      const promises = taskIds.map(taskId => 
        this.processTask(taskId, { ...options, batchId })
      );

      const results = await Promise.allSettled(promises);
      
      const summary = {
        batchId,
        total: taskIds.length,
        successful: results.filter(r => r.status === 'fulfilled').length,
        failed: results.filter(r => r.status === 'rejected').length,
        results
      };

      this.emit('batch:completed', summary);
      return summary;
      
    } catch (error) {
      this.emit('batch:error', { batchId, error });
      throw error;
    }
  }

  /**
   * Get workflow status
   * @param {string} workflowId - Workflow ID
   */
  async getWorkflowStatus(workflowId) {
    const workflow = this.activeWorkflows.get(workflowId);
    if (workflow) {
      return {
        id: workflowId,
        status: workflow.currentState,
        progress: workflow.progress,
        startTime: workflow.startTime,
        currentStep: workflow.currentStep,
        error: workflow.error
      };
    }

    // Check database for completed workflows
    return await this.database.getWorkflowStatus(workflowId);
  }

  /**
   * Cancel a workflow
   * @param {string} workflowId - Workflow ID to cancel
   */
  async cancelWorkflow(workflowId) {
    const workflow = this.activeWorkflows.get(workflowId);
    if (workflow) {
      workflow.cancelled = true;
      await this.stateMachine.transition(workflow, WorkflowStates.CANCELLED);
      this.emit('workflow:cancelled', { workflowId });
      return true;
    }
    return false;
  }

  /**
   * Get orchestrator metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeWorkflows: this.activeWorkflows.size,
      queuedWorkflows: this.workflowQueue.length,
      uptime: process.uptime()
    };
  }

  /**
   * Private: Start a new workflow
   */
  async _startWorkflow(workflowId, taskId, options) {
    // 1. Fetch task from database
    const task = await this.database.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // 2. Create workflow context
    const workflow = {
      id: workflowId,
      taskId,
      task,
      currentState: WorkflowStates.PENDING,
      startTime: Date.now(),
      progress: 0,
      currentStep: 'initialization',
      options,
      context: {},
      history: [],
      cancelled: false
    };

    // 3. Initialize state machine
    await this.stateMachine.initialize(workflow);
    
    return workflow;
  }

  /**
   * Private: Execute workflow steps
   */
  async _executeWorkflow(workflow) {
    try {
      // Step 1: Parse natural language requirements
      await this._stepNLPParsing(workflow);
      
      // Step 2: Decompose into atomic subtasks
      await this._stepTaskDecomposition(workflow);
      
      // Step 3: Resolve dependencies
      await this._stepDependencyResolution(workflow);
      
      // Step 4: Assign to agents
      await this._stepAgentAssignment(workflow);
      
      // Step 5: Monitor execution
      await this._stepMonitorExecution(workflow);
      
      // Step 6: Handle completion
      await this._stepHandleCompletion(workflow);

      return {
        workflowId: workflow.id,
        success: true,
        finalState: workflow.currentState,
        executionTime: Date.now() - workflow.startTime
      };
      
    } catch (error) {
      workflow.error = error;
      await this.stateMachine.transition(workflow, WorkflowStates.FAILED);
      throw error;
    }
  }

  /**
   * Private: NLP Parsing Step
   */
  async _stepNLPParsing(workflow) {
    if (workflow.cancelled) return;
    
    await this.stateMachine.transition(workflow, WorkflowStates.NLP_PARSING);
    workflow.currentStep = 'nlp_parsing';
    workflow.progress = 10;

    if (this.options.enableNLP) {
      const nlpResult = await this.nlp.parseRequirements(workflow.task.description);
      workflow.context.nlpResult = nlpResult;
      workflow.context.actionableItems = nlpResult.actionableItems;
      workflow.context.dependencies = nlpResult.dependencies;
    } else {
      // Fallback to basic parsing
      workflow.context.actionableItems = [workflow.task];
    }

    this.emit('workflow:step_completed', {
      workflowId: workflow.id,
      step: 'nlp_parsing',
      result: workflow.context.nlpResult
    });
  }

  /**
   * Private: Task Decomposition Step
   */
  async _stepTaskDecomposition(workflow) {
    if (workflow.cancelled) return;
    
    await this.stateMachine.transition(workflow, WorkflowStates.TASK_DECOMPOSITION);
    workflow.currentStep = 'task_decomposition';
    workflow.progress = 25;

    const decomposedTasks = await this.nlp.decomposeTask(
      workflow.context.actionableItems,
      workflow.task
    );

    workflow.context.atomicTasks = decomposedTasks;

    this.emit('workflow:step_completed', {
      workflowId: workflow.id,
      step: 'task_decomposition',
      result: decomposedTasks
    });
  }

  /**
   * Private: Dependency Resolution Step
   */
  async _stepDependencyResolution(workflow) {
    if (workflow.cancelled) return;
    
    await this.stateMachine.transition(workflow, WorkflowStates.DEPENDENCY_RESOLUTION);
    workflow.currentStep = 'dependency_resolution';
    workflow.progress = 40;

    const executionPlan = await this.dependencyResolver.resolveDependencies(
      workflow.context.atomicTasks
    );

    workflow.context.executionPlan = executionPlan;

    this.emit('workflow:step_completed', {
      workflowId: workflow.id,
      step: 'dependency_resolution',
      result: executionPlan
    });
  }

  /**
   * Private: Agent Assignment Step
   */
  async _stepAgentAssignment(workflow) {
    if (workflow.cancelled) return;
    
    await this.stateMachine.transition(workflow, WorkflowStates.AGENT_ASSIGNMENT);
    workflow.currentStep = 'agent_assignment';
    workflow.progress = 55;

    if (this.options.enableAgentCoordination) {
      const assignments = await this.agentCoordinator.assignTasks(
        workflow.context.executionPlan
      );
      workflow.context.agentAssignments = assignments;
    }

    this.emit('workflow:step_completed', {
      workflowId: workflow.id,
      step: 'agent_assignment',
      result: workflow.context.agentAssignments
    });
  }

  /**
   * Private: Monitor Execution Step
   */
  async _stepMonitorExecution(workflow) {
    if (workflow.cancelled) return;
    
    await this.stateMachine.transition(workflow, WorkflowStates.PROCESSING);
    workflow.currentStep = 'execution_monitoring';
    workflow.progress = 70;

    // Monitor task execution and handle state transitions
    const executionResult = await this._monitorTaskExecution(workflow);
    workflow.context.executionResult = executionResult;

    this.emit('workflow:step_completed', {
      workflowId: workflow.id,
      step: 'execution_monitoring',
      result: executionResult
    });
  }

  /**
   * Private: Handle Completion Step
   */
  async _stepHandleCompletion(workflow) {
    if (workflow.cancelled) return;
    
    workflow.currentStep = 'completion';
    workflow.progress = 100;

    // Determine final state based on execution results
    const success = workflow.context.executionResult?.success || false;
    const finalState = success ? WorkflowStates.VALIDATION_PASSED : WorkflowStates.FAILED;
    
    await this.stateMachine.transition(workflow, finalState);

    // Update database with final results
    await this.database.updateWorkflowStatus(workflow.id, {
      status: finalState,
      completedAt: new Date(),
      result: workflow.context.executionResult
    });

    this.emit('workflow:completed', {
      workflowId: workflow.id,
      success,
      finalState
    });
  }

  /**
   * Private: Monitor task execution
   */
  async _monitorTaskExecution(workflow) {
    // This would integrate with external systems like agentapi, codegen, etc.
    // For now, return a mock successful result
    return {
      success: true,
      prUrl: 'https://github.com/example/repo/pull/123',
      validationStatus: 'passed'
    };
  }

  /**
   * Private: Setup event handlers
   */
  _setupEventHandlers() {
    this.on('workflow:error', async ({ workflowId, error }) => {
      console.error(`❌ Workflow ${workflowId} error:`, error.message);
    });

    this.on('workflow:completed', ({ workflowId, success }) => {
      const status = success ? '✅' : '❌';
      console.log(`${status} Workflow ${workflowId} completed`);
    });
  }

  /**
   * Private: Update metrics
   */
  _updateMetrics(startTime, success) {
    this.metrics.totalProcessed++;
    if (success) {
      this.metrics.successful++;
    } else {
      this.metrics.failed++;
    }
    
    const executionTime = Date.now() - startTime;
    this.metrics.averageExecutionTime = 
      (this.metrics.averageExecutionTime * (this.metrics.totalProcessed - 1) + executionTime) / 
      this.metrics.totalProcessed;
  }

  /**
   * Private: Process queued workflows
   */
  _processQueue() {
    if (this.workflowQueue.length > 0 && 
        this.activeWorkflows.size < this.options.maxConcurrentWorkflows) {
      const { taskId, options, workflowId } = this.workflowQueue.shift();
      setImmediate(() => this.processTask(taskId, options));
    }
  }

  /**
   * Shutdown the orchestrator gracefully
   */
  async shutdown() {
    console.log('🛑 Shutting down Task Orchestrator...');
    
    // Cancel all active workflows
    for (const [workflowId] of this.activeWorkflows) {
      await this.cancelWorkflow(workflowId);
    }
    
    // Close database connections
    await this.database.close();
    
    this.emit('orchestrator:shutdown');
    console.log('✅ Task Orchestrator shutdown complete');
  }
}

export default TaskOrchestrator;

