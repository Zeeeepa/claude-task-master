/**
 * @fileoverview Core workflow orchestration types and interfaces
 * @description Defines the foundational types for the workflow orchestration system
 */

/**
 * Workflow states and their allowed transitions
 * @type {Object<string, string[]>}
 */
export const WORKFLOW_STATES = {
    'CREATED': ['ANALYZING'],
    'ANALYZING': ['ANALYZED', 'ANALYSIS_FAILED'],
    'ANALYZED': ['GENERATING_CODE'],
    'GENERATING_CODE': ['CODE_GENERATED', 'CODE_GENERATION_FAILED'],
    'CODE_GENERATED': ['VALIDATING'],
    'VALIDATING': ['VALIDATION_PASSED', 'VALIDATION_FAILED'],
    'VALIDATION_FAILED': ['GENERATING_CODE', 'MANUAL_REVIEW'],
    'VALIDATION_PASSED': ['COMPLETED'],
    'COMPLETED': [],
    'FAILED': [],
    'CANCELLED': []
};

/**
 * Workflow step types
 * @type {string[]}
 */
export const WORKFLOW_STEP_TYPES = [
    'analysis',
    'codegen', 
    'validation',
    'completion',
    'error_handling',
    'manual_review'
];

/**
 * Workflow priority levels
 * @type {Object<string, number>}
 */
export const WORKFLOW_PRIORITY = {
    LOW: 1,
    NORMAL: 2,
    HIGH: 3,
    CRITICAL: 4
};

/**
 * @typedef {Object} WorkflowStep
 * @property {string} id - Unique step identifier
 * @property {string} name - Human-readable step name
 * @property {string} type - Step type from WORKFLOW_STEP_TYPES
 * @property {string[]} dependencies - Array of step IDs this step depends on
 * @property {number} timeout - Timeout in milliseconds
 * @property {number} retry_count - Number of retry attempts
 * @property {Object<string, any>} parameters - Step-specific parameters
 * @property {string} status - Current step status
 * @property {Date} created_at - Step creation timestamp
 * @property {Date} [started_at] - Step start timestamp
 * @property {Date} [completed_at] - Step completion timestamp
 */

/**
 * @typedef {Object} WorkflowInstance
 * @property {string} id - Unique workflow identifier
 * @property {string} task_id - Associated task identifier
 * @property {string} current_state - Current workflow state
 * @property {WorkflowStep[]} steps - Array of workflow steps
 * @property {Object<string, any>} context - Workflow execution context
 * @property {number} priority - Workflow priority level
 * @property {Date} created_at - Workflow creation timestamp
 * @property {Date} [started_at] - Workflow start timestamp
 * @property {Date} [completed_at] - Workflow completion timestamp
 * @property {Object<string, any>} metadata - Additional workflow metadata
 */

/**
 * @typedef {Object} WorkflowStatus
 * @property {string} workflow_id - Workflow identifier
 * @property {string} current_state - Current workflow state
 * @property {number} progress_percentage - Completion percentage (0-100)
 * @property {WorkflowStep[]} completed_steps - Array of completed steps
 * @property {WorkflowStep[]} pending_steps - Array of pending steps
 * @property {WorkflowStep} [current_step] - Currently executing step
 * @property {Date} last_updated - Last status update timestamp
 * @property {Object<string, any>} metrics - Performance metrics
 */

/**
 * @typedef {Object} WorkflowEvent
 * @property {string} type - Event type
 * @property {string} workflow_id - Workflow identifier
 * @property {Object<string, any>} data - Event data
 * @property {Date} timestamp - Event timestamp
 * @property {string} [step_id] - Associated step identifier
 */

/**
 * @typedef {Object} WorkflowError
 * @property {string} code - Error code
 * @property {string} message - Error message
 * @property {string} workflow_id - Workflow identifier
 * @property {string} [step_id] - Associated step identifier
 * @property {Error} [original_error] - Original error object
 * @property {Date} timestamp - Error timestamp
 * @property {boolean} recoverable - Whether error is recoverable
 */

/**
 * @typedef {Object} WorkflowResult
 * @property {string} workflow_id - Workflow identifier
 * @property {string} status - Final workflow status
 * @property {Object<string, any>} output - Workflow output data
 * @property {WorkflowMetrics} metrics - Workflow performance metrics
 * @property {Date} completed_at - Completion timestamp
 */

/**
 * @typedef {Object} WorkflowMetrics
 * @property {string} workflow_id - Workflow identifier
 * @property {number} total_duration_ms - Total execution time in milliseconds
 * @property {number} steps_completed - Number of completed steps
 * @property {number} steps_failed - Number of failed steps
 * @property {number} retry_count - Total number of retries
 * @property {Object<string, number>} step_durations - Duration per step type
 * @property {Date} started_at - Workflow start time
 * @property {Date} completed_at - Workflow completion time
 */

/**
 * @typedef {Object} StateTransition
 * @property {string} workflow_id - Workflow identifier
 * @property {string} from_state - Previous state
 * @property {string} to_state - New state
 * @property {Date} timestamp - Transition timestamp
 * @property {string} [trigger] - What triggered the transition
 * @property {Object<string, any>} [metadata] - Additional transition data
 */

/**
 * @typedef {Object} WorkflowState
 * @property {string} workflow_id - Workflow identifier
 * @property {string} current_state - Current state
 * @property {Object<string, any>} context - State context data
 * @property {StateTransition[]} history - State transition history
 * @property {Date} last_updated - Last state update timestamp
 */

/**
 * @typedef {Object} StepResult
 * @property {string} step_id - Step identifier
 * @property {string} status - Step completion status ('success', 'failure', 'retry')
 * @property {Object<string, any>} output - Step output data
 * @property {string} [error_message] - Error message if failed
 * @property {number} duration_ms - Step execution duration
 * @property {Date} completed_at - Step completion timestamp
 */

/**
 * @typedef {Object} StepError
 * @property {string} step_id - Step identifier
 * @property {string} error_code - Error code
 * @property {string} message - Error message
 * @property {Error} [original_error] - Original error object
 * @property {boolean} recoverable - Whether error is recoverable
 * @property {number} retry_count - Current retry count
 * @property {Date} timestamp - Error timestamp
 */

