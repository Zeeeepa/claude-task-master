/**
 * @fileoverview Workflow Model
 * @description Comprehensive workflow data model for AI CI/CD orchestration system
 * @version 2.0.0
 * @created 2025-05-28
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Workflow model class for managing CI/CD orchestration workflows
 */
export class Workflow {
    constructor(data = {}) {
        this.id = data.id || uuidv4();
        this.name = data.name || '';
        this.description = data.description || '';
        
        // Workflow state and control
        this.status = data.status || 'active';
        
        // Trigger configuration
        this.trigger_type = data.trigger_type || 'manual';
        this.trigger_config = data.trigger_config || {};
        
        // Workflow steps and execution
        this.steps = data.steps || [];
        this.current_step = data.current_step || 0;
        this.total_steps = data.total_steps || 0;
        
        // Execution timestamps
        this.started_at = data.started_at || new Date();
        this.completed_at = data.completed_at || null;
        
        // Error handling
        this.error_message = data.error_message || null;
        this.retry_count = data.retry_count || 0;
        
        // Configuration
        this.timeout_minutes = data.timeout_minutes || 60;
        this.max_retries = data.max_retries || 3;
        
        // Timestamps
        this.created_at = data.created_at || new Date();
        this.updated_at = data.updated_at || new Date();
        
        // Flexible metadata storage
        this.metadata = data.metadata || {};
    }

    /**
     * Validate workflow data
     * @returns {Object} Validation result
     */
    validate() {
        const errors = [];
        const warnings = [];

        // Required fields validation
        if (!this.name || this.name.trim().length === 0) {
            errors.push('Workflow name is required');
        }

        if (this.name && this.name.length > 255) {
            errors.push('Workflow name must be 255 characters or less');
        }

        if (this.name && this.name.length < 3) {
            errors.push('Workflow name must be at least 3 characters long');
        }

        // Status validation
        const validStatuses = ['active', 'paused', 'completed', 'failed', 'cancelled', 'archived'];
        if (!validStatuses.includes(this.status)) {
            errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
        }

        // Trigger type validation
        const validTriggerTypes = [
            'manual', 'webhook', 'schedule', 'event', 'dependency', 'api', 
            'git_push', 'pr_created', 'pr_merged'
        ];
        if (!validTriggerTypes.includes(this.trigger_type)) {
            errors.push(`Trigger type must be one of: ${validTriggerTypes.join(', ')}`);
        }

        // Steps validation
        if (!Array.isArray(this.steps)) {
            errors.push('Steps must be an array');
        } else {
            this.steps.forEach((step, index) => {
                if (!step.name) {
                    errors.push(`Step ${index + 1} must have a name`);
                }
                if (!step.type) {
                    errors.push(`Step ${index + 1} must have a type`);
                }
            });
        }

        // Current step validation
        if (this.current_step < 0) {
            errors.push('Current step must be non-negative');
        }

        if (this.current_step > this.total_steps) {
            errors.push('Current step cannot exceed total steps');
        }

        // Retry count validation
        if (this.retry_count < 0 || this.retry_count > 10) {
            errors.push('Retry count must be between 0 and 10');
        }

        // Timeout validation
        if (this.timeout_minutes <= 0) {
            errors.push('Timeout must be positive');
        }

        if (this.max_retries < 0 || this.max_retries > 10) {
            errors.push('Max retries must be between 0 and 10');
        }

        // Business logic warnings
        if (this.status === 'completed' && !this.completed_at) {
            warnings.push('Completed workflows should have a completion date');
        }

        if (this.status === 'failed' && this.retry_count === 0) {
            warnings.push('Failed workflows should have retry attempts recorded');
        }

        if (this.timeout_minutes > 1440) { // 24 hours
            warnings.push('Workflow timeout is very long (>24 hours)');
        }

        if (this.steps.length === 0) {
            warnings.push('Workflow has no steps defined');
        }

        if (this.total_steps !== this.steps.length) {
            warnings.push('Total steps count does not match steps array length');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Convert to database format
     * @returns {Object} Database-ready object
     */
    toDatabase() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            status: this.status,
            trigger_type: this.trigger_type,
            trigger_config: JSON.stringify(this.trigger_config),
            steps: JSON.stringify(this.steps),
            current_step: this.current_step,
            total_steps: this.total_steps,
            started_at: this.started_at,
            completed_at: this.completed_at,
            error_message: this.error_message,
            retry_count: this.retry_count,
            timeout_minutes: this.timeout_minutes,
            max_retries: this.max_retries,
            created_at: this.created_at,
            updated_at: this.updated_at,
            metadata: JSON.stringify(this.metadata)
        };
    }

    /**
     * Create from database row
     * @param {Object} row - Database row
     * @returns {Workflow} Workflow instance
     */
    static fromDatabase(row) {
        return new Workflow({
            id: row.id,
            name: row.name,
            description: row.description,
            status: row.status,
            trigger_type: row.trigger_type,
            trigger_config: typeof row.trigger_config === 'string' 
                ? JSON.parse(row.trigger_config) 
                : row.trigger_config || {},
            steps: typeof row.steps === 'string' 
                ? JSON.parse(row.steps) 
                : row.steps || [],
            current_step: row.current_step,
            total_steps: row.total_steps,
            started_at: row.started_at,
            completed_at: row.completed_at,
            error_message: row.error_message,
            retry_count: row.retry_count,
            timeout_minutes: row.timeout_minutes,
            max_retries: row.max_retries,
            created_at: row.created_at,
            updated_at: row.updated_at,
            metadata: typeof row.metadata === 'string' 
                ? JSON.parse(row.metadata) 
                : row.metadata || {}
        });
    }

    /**
     * Update workflow status with validation
     * @param {string} newStatus - New status
     * @param {Object} context - Update context
     */
    updateStatus(newStatus, context = {}) {
        const validStatuses = ['active', 'paused', 'completed', 'failed', 'cancelled', 'archived'];
        if (!validStatuses.includes(newStatus)) {
            throw new Error(`Invalid status: ${newStatus}`);
        }

        const oldStatus = this.status;
        this.status = newStatus;
        this.updated_at = new Date();

        // Set completion date for completed workflows
        if (newStatus === 'completed' && !this.completed_at) {
            this.completed_at = new Date();
        }

        // Clear completion date if moving away from completed
        if (oldStatus === 'completed' && newStatus !== 'completed') {
            this.completed_at = null;
        }

        // Handle failed status
        if (newStatus === 'failed') {
            this.retry_count = Math.min(this.retry_count + 1, this.max_retries);
            
            if (context.error) {
                this.error_message = context.error instanceof Error 
                    ? context.error.message 
                    : context.error;
            }
        }

        return {
            oldStatus,
            newStatus,
            context,
            canRetry: newStatus === 'failed' && this.retry_count < this.max_retries
        };
    }

    /**
     * Advance to next step
     * @param {Object} stepResult - Result from current step
     * @returns {Object} Step advancement result
     */
    advanceStep(stepResult = {}) {
        if (this.current_step >= this.total_steps) {
            throw new Error('Cannot advance beyond total steps');
        }

        const previousStep = this.current_step;
        this.current_step += 1;
        this.updated_at = new Date();

        // Check if workflow is completed
        if (this.current_step >= this.total_steps) {
            this.updateStatus('completed', { stepResult });
        }

        return {
            previousStep,
            currentStep: this.current_step,
            isCompleted: this.status === 'completed',
            stepResult
        };
    }

    /**
     * Reset workflow to beginning
     * @param {Object} context - Reset context
     */
    reset(context = {}) {
        this.current_step = 0;
        this.status = 'active';
        this.completed_at = null;
        this.error_message = null;
        this.retry_count = 0;
        this.started_at = new Date();
        this.updated_at = new Date();

        return {
            action: 'reset',
            context
        };
    }

    /**
     * Pause workflow execution
     * @param {Object} context - Pause context
     */
    pause(context = {}) {
        if (this.status !== 'active') {
            throw new Error('Can only pause active workflows');
        }

        this.updateStatus('paused', context);
        
        return {
            action: 'paused',
            pausedAt: this.updated_at,
            context
        };
    }

    /**
     * Resume workflow execution
     * @param {Object} context - Resume context
     */
    resume(context = {}) {
        if (this.status !== 'paused') {
            throw new Error('Can only resume paused workflows');
        }

        this.updateStatus('active', context);
        
        return {
            action: 'resumed',
            resumedAt: this.updated_at,
            context
        };
    }

    /**
     * Check if workflow can be retried
     * @returns {boolean} True if workflow can be retried
     */
    canRetry() {
        return this.status === 'failed' && this.retry_count < this.max_retries;
    }

    /**
     * Get workflow progress percentage
     * @returns {number} Progress percentage (0-100)
     */
    getProgress() {
        if (this.total_steps === 0) return 0;
        return Math.round((this.current_step / this.total_steps) * 100);
    }

    /**
     * Get workflow runtime in minutes
     * @returns {number} Runtime in minutes
     */
    getRuntime() {
        const endTime = this.completed_at || new Date();
        return Math.round((endTime - this.started_at) / (1000 * 60));
    }

    /**
     * Check if workflow is timed out
     * @returns {boolean} True if workflow is timed out
     */
    isTimedOut() {
        if (this.status === 'completed') return false;
        return this.getRuntime() > this.timeout_minutes;
    }

    /**
     * Get current step information
     * @returns {Object|null} Current step details
     */
    getCurrentStep() {
        if (this.current_step >= this.steps.length) return null;
        return this.steps[this.current_step];
    }

    /**
     * Get next step information
     * @returns {Object|null} Next step details
     */
    getNextStep() {
        const nextIndex = this.current_step + 1;
        if (nextIndex >= this.steps.length) return null;
        return this.steps[nextIndex];
    }

    /**
     * Get workflow summary for display
     * @returns {Object} Workflow summary
     */
    getSummary() {
        return {
            id: this.id,
            name: this.name,
            status: this.status,
            trigger_type: this.trigger_type,
            progress: this.getProgress(),
            runtime: this.getRuntime(),
            isTimedOut: this.isTimedOut(),
            canRetry: this.canRetry(),
            currentStep: this.current_step,
            totalSteps: this.total_steps,
            retryCount: this.retry_count,
            maxRetries: this.max_retries
        };
    }

    /**
     * Clone workflow with new ID
     * @param {Object} overrides - Properties to override
     * @returns {Workflow} Cloned workflow
     */
    clone(overrides = {}) {
        const clonedData = {
            ...this.toDatabase(),
            id: uuidv4(),
            created_at: new Date(),
            updated_at: new Date(),
            started_at: new Date(),
            completed_at: null,
            status: 'active',
            current_step: 0,
            retry_count: 0,
            error_message: null,
            ...overrides
        };

        // Parse JSON strings back to objects for the clone
        if (typeof clonedData.trigger_config === 'string') {
            clonedData.trigger_config = JSON.parse(clonedData.trigger_config);
        }
        if (typeof clonedData.steps === 'string') {
            clonedData.steps = JSON.parse(clonedData.steps);
        }
        if (typeof clonedData.metadata === 'string') {
            clonedData.metadata = JSON.parse(clonedData.metadata);
        }

        return new Workflow(clonedData);
    }

    /**
     * Add step to workflow
     * @param {Object} step - Step configuration
     * @param {number} position - Position to insert step (optional)
     */
    addStep(step, position = null) {
        const validation = this.validateStep(step);
        if (!validation.valid) {
            throw new Error(`Invalid step: ${validation.errors.join(', ')}`);
        }

        if (position === null) {
            this.steps.push(step);
        } else {
            this.steps.splice(position, 0, step);
        }

        this.total_steps = this.steps.length;
        this.updated_at = new Date();

        return {
            action: 'step_added',
            step,
            position: position || this.steps.length - 1,
            totalSteps: this.total_steps
        };
    }

    /**
     * Remove step from workflow
     * @param {number} position - Position of step to remove
     */
    removeStep(position) {
        if (position < 0 || position >= this.steps.length) {
            throw new Error('Invalid step position');
        }

        if (position <= this.current_step) {
            throw new Error('Cannot remove step at or before current position');
        }

        const removedStep = this.steps.splice(position, 1)[0];
        this.total_steps = this.steps.length;
        this.updated_at = new Date();

        return {
            action: 'step_removed',
            removedStep,
            position,
            totalSteps: this.total_steps
        };
    }

    /**
     * Validate step configuration
     * @param {Object} step - Step to validate
     * @returns {Object} Validation result
     */
    validateStep(step) {
        const errors = [];

        if (!step.name) {
            errors.push('Step name is required');
        }

        if (!step.type) {
            errors.push('Step type is required');
        }

        const validStepTypes = [
            'task_creation', 'code_generation', 'validation', 'testing', 
            'deployment', 'notification', 'approval', 'conditional', 
            'parallel', 'sequential'
        ];

        if (step.type && !validStepTypes.includes(step.type)) {
            errors.push(`Step type must be one of: ${validStepTypes.join(', ')}`);
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

/**
 * Workflow execution step model
 */
export class WorkflowExecutionStep {
    constructor(data = {}) {
        this.id = data.id || uuidv4();
        this.workflow_id = data.workflow_id;
        this.step_number = data.step_number || 0;
        this.step_name = data.step_name || '';
        this.step_type = data.step_type || 'sequential';
        this.step_config = data.step_config || {};
        this.status = data.status || 'pending';
        this.result = data.result || {};
        this.output_data = data.output_data || {};
        this.started_at = data.started_at || null;
        this.completed_at = data.completed_at || null;
        this.duration_ms = data.duration_ms || null;
        this.error_message = data.error_message || null;
        this.error_details = data.error_details || {};
        this.retry_count = data.retry_count || 0;
        this.depends_on_steps = data.depends_on_steps || [];
        this.created_at = data.created_at || new Date();
        this.updated_at = data.updated_at || new Date();
    }

    /**
     * Convert to database format
     * @returns {Object} Database-ready object
     */
    toDatabase() {
        return {
            id: this.id,
            workflow_id: this.workflow_id,
            step_number: this.step_number,
            step_name: this.step_name,
            step_type: this.step_type,
            step_config: JSON.stringify(this.step_config),
            status: this.status,
            result: JSON.stringify(this.result),
            output_data: JSON.stringify(this.output_data),
            started_at: this.started_at,
            completed_at: this.completed_at,
            duration_ms: this.duration_ms,
            error_message: this.error_message,
            error_details: JSON.stringify(this.error_details),
            retry_count: this.retry_count,
            depends_on_steps: this.depends_on_steps,
            created_at: this.created_at,
            updated_at: this.updated_at
        };
    }

    /**
     * Create from database row
     * @param {Object} row - Database row
     * @returns {WorkflowExecutionStep} Step instance
     */
    static fromDatabase(row) {
        return new WorkflowExecutionStep({
            id: row.id,
            workflow_id: row.workflow_id,
            step_number: row.step_number,
            step_name: row.step_name,
            step_type: row.step_type,
            step_config: typeof row.step_config === 'string' 
                ? JSON.parse(row.step_config) 
                : row.step_config || {},
            status: row.status,
            result: typeof row.result === 'string' 
                ? JSON.parse(row.result) 
                : row.result || {},
            output_data: typeof row.output_data === 'string' 
                ? JSON.parse(row.output_data) 
                : row.output_data || {},
            started_at: row.started_at,
            completed_at: row.completed_at,
            duration_ms: row.duration_ms,
            error_message: row.error_message,
            error_details: typeof row.error_details === 'string' 
                ? JSON.parse(row.error_details) 
                : row.error_details || {},
            retry_count: row.retry_count,
            depends_on_steps: row.depends_on_steps || [],
            created_at: row.created_at,
            updated_at: row.updated_at
        });
    }

    /**
     * Start step execution
     */
    start() {
        this.status = 'running';
        this.started_at = new Date();
        this.updated_at = new Date();
    }

    /**
     * Complete step execution
     * @param {Object} result - Execution result
     * @param {Object} outputData - Output data
     */
    complete(result = {}, outputData = {}) {
        this.status = 'completed';
        this.completed_at = new Date();
        this.result = result;
        this.output_data = outputData;
        this.updated_at = new Date();
        
        if (this.started_at) {
            this.duration_ms = this.completed_at - this.started_at;
        }
    }

    /**
     * Fail step execution
     * @param {string|Error} error - Error message or Error object
     * @param {Object} errorDetails - Additional error details
     */
    fail(error, errorDetails = {}) {
        this.status = 'failed';
        this.completed_at = new Date();
        this.error_message = error instanceof Error ? error.message : error;
        this.error_details = {
            ...errorDetails,
            stack: error instanceof Error ? error.stack : null,
            timestamp: new Date().toISOString()
        };
        this.retry_count += 1;
        this.updated_at = new Date();
        
        if (this.started_at) {
            this.duration_ms = this.completed_at - this.started_at;
        }
    }
}

export default Workflow;

