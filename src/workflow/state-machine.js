/**
 * Workflow State Machine
 * Manages workflow state transitions and validation
 */

import { EventEmitter } from 'events';

/**
 * Workflow State Machine for managing CI/CD pipeline states
 */
export class WorkflowStateMachine extends EventEmitter {
  constructor() {
    super();
    
    // Define valid state transitions
    this.transitions = {
      'pending': ['processing', 'nlp_parsing', 'cancelled', 'failed'],
      'nlp_parsing': ['task_decomposition', 'failed', 'cancelled'],
      'task_decomposition': ['dependency_resolution', 'failed', 'cancelled'],
      'dependency_resolution': ['agent_assignment', 'failed', 'cancelled'],
      'agent_assignment': ['processing', 'failed', 'cancelled'],
      'processing': ['pr_created', 'validation_running', 'failed', 'cancelled'],
      'pr_created': ['validation_running', 'failed', 'cancelled'],
      'validation_running': ['validation_passed', 'validation_failed', 'cancelled'],
      'validation_failed': ['processing', 'failed', 'cancelled'],
      'validation_passed': ['merged', 'failed'],
      'merged': [], // Terminal state
      'failed': [], // Terminal state
      'cancelled': [] // Terminal state
    };

    // Define state metadata
    this.stateMetadata = {
      'pending': {
        description: 'Workflow is queued and waiting to start',
        category: 'initial',
        allowRetry: true,
        timeout: null
      },
      'nlp_parsing': {
        description: 'Parsing natural language requirements',
        category: 'processing',
        allowRetry: true,
        timeout: 60000 // 1 minute
      },
      'task_decomposition': {
        description: 'Breaking down task into atomic units',
        category: 'processing',
        allowRetry: true,
        timeout: 120000 // 2 minutes
      },
      'dependency_resolution': {
        description: 'Resolving task dependencies and execution order',
        category: 'processing',
        allowRetry: true,
        timeout: 60000 // 1 minute
      },
      'agent_assignment': {
        description: 'Assigning tasks to coding agents',
        category: 'processing',
        allowRetry: true,
        timeout: 30000 // 30 seconds
      },
      'processing': {
        description: 'Executing workflow tasks',
        category: 'execution',
        allowRetry: true,
        timeout: 600000 // 10 minutes
      },
      'pr_created': {
        description: 'Pull request has been created',
        category: 'execution',
        allowRetry: false,
        timeout: null
      },
      'validation_running': {
        description: 'Running validation and tests',
        category: 'validation',
        allowRetry: true,
        timeout: 300000 // 5 minutes
      },
      'validation_failed': {
        description: 'Validation or tests failed',
        category: 'validation',
        allowRetry: true,
        timeout: null
      },
      'validation_passed': {
        description: 'All validations passed',
        category: 'validation',
        allowRetry: false,
        timeout: null
      },
      'merged': {
        description: 'Changes have been merged successfully',
        category: 'terminal',
        allowRetry: false,
        timeout: null
      },
      'failed': {
        description: 'Workflow failed and cannot continue',
        category: 'terminal',
        allowRetry: false,
        timeout: null
      },
      'cancelled': {
        description: 'Workflow was cancelled by user or system',
        category: 'terminal',
        allowRetry: false,
        timeout: null
      }
    };

    // Track active workflows
    this.activeWorkflows = new Map();
    this.stateTimeouts = new Map();
  }

  /**
   * Initialize workflow in state machine
   * @param {Object} workflow - Workflow object
   */
  async initialize(workflow) {
    if (!workflow.id) {
      throw new Error('Workflow must have an ID');
    }

    workflow.currentState = 'pending';
    workflow.stateHistory = [{
      state: 'pending',
      timestamp: new Date(),
      metadata: {}
    }];

    this.activeWorkflows.set(workflow.id, workflow);
    this.emit('workflow:initialized', { workflowId: workflow.id });

    return workflow;
  }

  /**
   * Transition workflow to new state
   * @param {Object} workflow - Workflow object
   * @param {string} newState - Target state
   * @param {Object} metadata - Additional metadata for transition
   */
  async transition(workflow, newState, metadata = {}) {
    const currentState = workflow.currentState;
    
    // Validate transition
    if (!this.isValidTransition(currentState, newState)) {
      throw new Error(
        `Invalid transition from ${currentState} to ${newState}. ` +
        `Valid transitions: ${this.transitions[currentState]?.join(', ') || 'none'}`
      );
    }

    // Clear any existing timeout for current state
    this._clearStateTimeout(workflow.id);

    // Record state transition
    const transitionRecord = {
      state: newState,
      timestamp: new Date(),
      previousState: currentState,
      metadata
    };

    workflow.currentState = newState;
    workflow.stateHistory.push(transitionRecord);

    // Set timeout for new state if applicable
    this._setStateTimeout(workflow, newState);

    // Emit transition event
    this.emit('state:transition', {
      workflowId: workflow.id,
      from: currentState,
      to: newState,
      metadata
    });

    // Emit state-specific events
    this.emit(`state:${newState}`, {
      workflowId: workflow.id,
      workflow,
      metadata
    });

    return workflow;
  }

  /**
   * Check if a state transition is valid
   * @param {string} fromState - Current state
   * @param {string} toState - Target state
   */
  isValidTransition(fromState, toState) {
    const validTransitions = this.transitions[fromState];
    return validTransitions && validTransitions.includes(toState);
  }

  /**
   * Get valid next states for current state
   * @param {string} currentState - Current state
   */
  getValidNextStates(currentState) {
    return this.transitions[currentState] || [];
  }

  /**
   * Get state metadata
   * @param {string} state - State name
   */
  getStateMetadata(state) {
    return this.stateMetadata[state] || null;
  }

  /**
   * Check if state is terminal (no further transitions)
   * @param {string} state - State name
   */
  isTerminalState(state) {
    const metadata = this.getStateMetadata(state);
    return metadata?.category === 'terminal';
  }

  /**
   * Check if state allows retry
   * @param {string} state - State name
   */
  canRetry(state) {
    const metadata = this.getStateMetadata(state);
    return metadata?.allowRetry || false;
  }

  /**
   * Get workflow current state
   * @param {string} workflowId - Workflow ID
   */
  getWorkflowState(workflowId) {
    const workflow = this.activeWorkflows.get(workflowId);
    return workflow?.currentState || null;
  }

  /**
   * Get workflow state history
   * @param {string} workflowId - Workflow ID
   */
  getWorkflowHistory(workflowId) {
    const workflow = this.activeWorkflows.get(workflowId);
    return workflow?.stateHistory || [];
  }

  /**
   * Get workflow duration in current state
   * @param {string} workflowId - Workflow ID
   */
  getTimeInCurrentState(workflowId) {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow || !workflow.stateHistory.length) {
      return 0;
    }

    const lastTransition = workflow.stateHistory[workflow.stateHistory.length - 1];
    return Date.now() - lastTransition.timestamp.getTime();
  }

  /**
   * Check if workflow is stuck (exceeded timeout)
   * @param {string} workflowId - Workflow ID
   */
  isWorkflowStuck(workflowId) {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) return false;

    const currentState = workflow.currentState;
    const metadata = this.getStateMetadata(currentState);
    
    if (!metadata?.timeout) return false;

    const timeInState = this.getTimeInCurrentState(workflowId);
    return timeInState > metadata.timeout;
  }

  /**
   * Get all workflows in a specific state
   * @param {string} state - State name
   */
  getWorkflowsInState(state) {
    const workflows = [];
    for (const [workflowId, workflow] of this.activeWorkflows) {
      if (workflow.currentState === state) {
        workflows.push({ workflowId, workflow });
      }
    }
    return workflows;
  }

  /**
   * Get stuck workflows
   */
  getStuckWorkflows() {
    const stuckWorkflows = [];
    for (const [workflowId] of this.activeWorkflows) {
      if (this.isWorkflowStuck(workflowId)) {
        stuckWorkflows.push(workflowId);
      }
    }
    return stuckWorkflows;
  }

  /**
   * Force transition (bypass validation) - use with caution
   * @param {Object} workflow - Workflow object
   * @param {string} newState - Target state
   * @param {Object} metadata - Additional metadata
   */
  async forceTransition(workflow, newState, metadata = {}) {
    console.warn(`⚠️ Force transitioning workflow ${workflow.id} to ${newState}`);
    
    const currentState = workflow.currentState;
    
    // Clear timeout
    this._clearStateTimeout(workflow.id);

    // Record forced transition
    const transitionRecord = {
      state: newState,
      timestamp: new Date(),
      previousState: currentState,
      forced: true,
      metadata
    };

    workflow.currentState = newState;
    workflow.stateHistory.push(transitionRecord);

    // Set new timeout
    this._setStateTimeout(workflow, newState);

    this.emit('state:forced_transition', {
      workflowId: workflow.id,
      from: currentState,
      to: newState,
      metadata
    });

    return workflow;
  }

  /**
   * Remove workflow from state machine
   * @param {string} workflowId - Workflow ID
   */
  removeWorkflow(workflowId) {
    this._clearStateTimeout(workflowId);
    this.activeWorkflows.delete(workflowId);
    this.emit('workflow:removed', { workflowId });
  }

  /**
   * Get state machine statistics
   */
  getStatistics() {
    const stats = {
      totalWorkflows: this.activeWorkflows.size,
      stateDistribution: {},
      stuckWorkflows: this.getStuckWorkflows().length
    };

    // Count workflows by state
    for (const [, workflow] of this.activeWorkflows) {
      const state = workflow.currentState;
      stats.stateDistribution[state] = (stats.stateDistribution[state] || 0) + 1;
    }

    return stats;
  }

  /**
   * Private: Set state timeout
   */
  _setStateTimeout(workflow, state) {
    const metadata = this.getStateMetadata(state);
    if (!metadata?.timeout) return;

    const timeoutId = setTimeout(() => {
      this.emit('state:timeout', {
        workflowId: workflow.id,
        state,
        timeout: metadata.timeout
      });
    }, metadata.timeout);

    this.stateTimeouts.set(workflow.id, timeoutId);
  }

  /**
   * Private: Clear state timeout
   */
  _clearStateTimeout(workflowId) {
    const timeoutId = this.stateTimeouts.get(workflowId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.stateTimeouts.delete(workflowId);
    }
  }

  /**
   * Cleanup and shutdown
   */
  shutdown() {
    // Clear all timeouts
    for (const [workflowId] of this.stateTimeouts) {
      this._clearStateTimeout(workflowId);
    }

    // Clear workflows
    this.activeWorkflows.clear();
    
    this.emit('state_machine:shutdown');
  }
}

export default WorkflowStateMachine;

