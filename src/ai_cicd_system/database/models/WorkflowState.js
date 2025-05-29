/**
 * @fileoverview WorkflowState Model
 * @description Workflow state tracking model with validation and business logic
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * WorkflowState model class
 */
export class WorkflowState {
    constructor(data = {}) {
        this.id = data.id || uuidv4();
        this.workflow_id = data.workflow_id || '';
        this.task_id = data.task_id || null;
        this.step = data.step || '';
        this.status = data.status || 'pending';
        this.result = data.result || null;
        this.started_at = data.started_at || new Date();
        this.completed_at = data.completed_at || null;
        this.error_message = data.error_message || null;
        this.retry_count = data.retry_count || 0;
        this.metadata = data.metadata || {};
    }

    /**
     * Validate workflow state data
     * @returns {Object} Validation result
     */
    validate() {
        const errors = [];
        const warnings = [];

        // Required fields
        if (!this.workflow_id || this.workflow_id.trim().length === 0) {
            errors.push('Workflow ID is required');
        }

        if (!this.step || this.step.trim().length === 0) {
            errors.push('Step is required');
        }

        if (this.step && this.step.length > 100) {
            errors.push('Step must be 100 characters or less');
        }

        // Status validation
        const validStatuses = ['pending', 'running', 'completed', 'failed', 'skipped'];
        if (!validStatuses.includes(this.status)) {
            errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
        }

        // Retry count validation
        if (this.retry_count < 0) {
            errors.push('Retry count must be non-negative');
        }

        // Business logic validations
        if (this.status === 'completed' && !this.completed_at) {
            warnings.push('Completed workflow states should have a completion date');
        }

        if (this.status === 'failed' && !this.error_message) {
            warnings.push('Failed workflow states should have an error message');
        }

        if (this.retry_count > 5) {
            warnings.push('High retry count may indicate a systemic issue');
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
            workflow_id: this.workflow_id,
            task_id: this.task_id,
            step: this.step,
            status: this.status,
            result: this.result ? JSON.stringify(this.result) : null,
            started_at: this.started_at,
            completed_at: this.completed_at,
            error_message: this.error_message,
            retry_count: this.retry_count,
            metadata: JSON.stringify(this.metadata)
        };
    }

    /**
     * Create from database row
     * @param {Object} row - Database row
     * @returns {WorkflowState} WorkflowState instance
     */
    static fromDatabase(row) {
        return new WorkflowState({
            id: row.id,
            workflow_id: row.workflow_id,
            task_id: row.task_id,
            step: row.step,
            status: row.status,
            result: row.result ? JSON.parse(row.result) : null,
            started_at: row.started_at,
            completed_at: row.completed_at,
            error_message: row.error_message,
            retry_count: row.retry_count,
            metadata: typeof row.metadata === 'string' 
                ? JSON.parse(row.metadata) 
                : row.metadata
        });
    }

    /**
     * Update workflow state status
     * @param {string} newStatus - New status
     * @param {Object} context - Update context
     */
    updateStatus(newStatus, context = {}) {
        const validStatuses = ['pending', 'running', 'completed', 'failed', 'skipped'];
        if (!validStatuses.includes(newStatus)) {
            throw new Error(`Invalid status: ${newStatus}`);
        }

        const oldStatus = this.status;
        this.status = newStatus;

        // Set completion date for completed/failed/skipped states
        if (['completed', 'failed', 'skipped'].includes(newStatus) && !this.completed_at) {
            this.completed_at = new Date();
        }

        // Clear completion date if moving back to pending/running
        if (['pending', 'running'].includes(newStatus)) {
            this.completed_at = null;
        }

        return {
            oldStatus,
            newStatus,
            context
        };
    }

    /**
     * Increment retry count
     * @param {string} errorMessage - Error message for the retry
     */
    incrementRetry(errorMessage = null) {
        this.retry_count += 1;
        if (errorMessage) {
            this.error_message = errorMessage;
        }
        this.status = 'pending'; // Reset to pending for retry
        this.completed_at = null;
    }

    /**
     * Set workflow result
     * @param {Object} result - Workflow step result
     */
    setResult(result) {
        this.result = result;
        if (this.status === 'running') {
            this.status = 'completed';
            this.completed_at = new Date();
        }
    }

    /**
     * Set error and mark as failed
     * @param {string} errorMessage - Error message
     */
    setError(errorMessage) {
        this.error_message = errorMessage;
        this.status = 'failed';
        this.completed_at = new Date();
    }

    /**
     * Get execution duration in milliseconds
     * @returns {number|null} Duration in milliseconds
     */
    getDuration() {
        if (!this.completed_at) {
            return null;
        }
        return new Date(this.completed_at) - new Date(this.started_at);
    }

    /**
     * Check if workflow state is terminal (completed, failed, or skipped)
     * @returns {boolean} True if terminal
     */
    isTerminal() {
        return ['completed', 'failed', 'skipped'].includes(this.status);
    }

    /**
     * Get workflow state summary
     * @returns {Object} Summary object
     */
    getSummary() {
        return {
            id: this.id,
            workflow_id: this.workflow_id,
            task_id: this.task_id,
            step: this.step,
            status: this.status,
            retry_count: this.retry_count,
            duration: this.getDuration(),
            isTerminal: this.isTerminal(),
            hasError: !!this.error_message
        };
    }
}

export default WorkflowState;

