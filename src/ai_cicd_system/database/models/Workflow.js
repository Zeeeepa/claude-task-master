/**
 * @fileoverview Workflow Model
 * @description Enhanced workflow data model for AI-driven CI/CD orchestration
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Workflow model class for end-to-end development workflows
 */
export class Workflow {
    constructor(data = {}) {
        this.id = data.id || uuidv4();
        this.name = data.name || '';
        this.description = data.description || '';
        this.workflow_type = data.workflow_type || 'ci_cd';
        this.status = data.status || 'pending';
        this.priority = data.priority || 0;
        
        // Configuration and environment
        this.configuration = data.configuration || {};
        this.environment = data.environment || 'development';
        
        // Timing information
        this.started_at = data.started_at || null;
        this.completed_at = data.completed_at || null;
        this.estimated_duration_minutes = data.estimated_duration_minutes || null;
        this.actual_duration_minutes = data.actual_duration_minutes || null;
        
        // Relationships
        this.parent_workflow_id = data.parent_workflow_id || null;
        this.triggered_by = data.triggered_by || 'system';
        
        // Metadata and tracking
        this.tags = data.tags || [];
        this.metadata = data.metadata || {};
        
        // Audit fields
        this.created_at = data.created_at || new Date();
        this.updated_at = data.updated_at || new Date();
        this.created_by = data.created_by || null;
        this.updated_by = data.updated_by || null;
    }

    /**
     * Validate workflow data
     * @returns {Object} Validation result
     */
    validate() {
        const errors = [];
        const warnings = [];

        // Required fields
        if (!this.name || this.name.trim().length === 0) {
            errors.push('Workflow name is required');
        }

        if (this.name && this.name.length > 255) {
            errors.push('Workflow name must be 255 characters or less');
        }

        // Status validation
        const validStatuses = ['pending', 'running', 'paused', 'completed', 'failed', 'cancelled', 'timeout'];
        if (!validStatuses.includes(this.status)) {
            errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
        }

        // Workflow type validation
        const validTypes = ['ci_cd', 'deployment', 'testing', 'code_review', 'hotfix', 'rollback'];
        if (!validTypes.includes(this.workflow_type)) {
            errors.push(`Workflow type must be one of: ${validTypes.join(', ')}`);
        }

        // Priority validation
        if (this.priority < 0 || this.priority > 10) {
            errors.push('Priority must be between 0 and 10');
        }

        // Duration validation
        if (this.estimated_duration_minutes !== null && this.estimated_duration_minutes < 0) {
            errors.push('Estimated duration must be non-negative');
        }

        if (this.actual_duration_minutes !== null && this.actual_duration_minutes < 0) {
            errors.push('Actual duration must be non-negative');
        }

        // Array validations
        if (!Array.isArray(this.tags)) {
            errors.push('Tags must be an array');
        }

        // Object validations
        if (typeof this.configuration !== 'object' || this.configuration === null) {
            errors.push('Configuration must be an object');
        }

        if (typeof this.metadata !== 'object' || this.metadata === null) {
            errors.push('Metadata must be an object');
        }

        // Business logic warnings
        if (this.status === 'completed' && !this.completed_at) {
            warnings.push('Completed workflows should have a completion date');
        }

        if (this.status === 'running' && !this.started_at) {
            warnings.push('Running workflows should have a start date');
        }

        if (this.actual_duration_minutes && this.estimated_duration_minutes) {
            const variance = Math.abs(this.actual_duration_minutes - this.estimated_duration_minutes) / this.estimated_duration_minutes;
            if (variance > 0.5) {
                warnings.push('Actual duration significantly differs from estimate (>50% variance)');
            }
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
            workflow_type: this.workflow_type,
            status: this.status,
            priority: this.priority,
            configuration: JSON.stringify(this.configuration),
            environment: this.environment,
            started_at: this.started_at,
            completed_at: this.completed_at,
            estimated_duration_minutes: this.estimated_duration_minutes,
            actual_duration_minutes: this.actual_duration_minutes,
            parent_workflow_id: this.parent_workflow_id,
            triggered_by: this.triggered_by,
            tags: JSON.stringify(this.tags),
            metadata: JSON.stringify(this.metadata),
            created_at: this.created_at,
            updated_at: this.updated_at,
            created_by: this.created_by,
            updated_by: this.updated_by
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
            workflow_type: row.workflow_type,
            status: row.status,
            priority: row.priority,
            configuration: typeof row.configuration === 'string' 
                ? JSON.parse(row.configuration) 
                : row.configuration,
            environment: row.environment,
            started_at: row.started_at,
            completed_at: row.completed_at,
            estimated_duration_minutes: row.estimated_duration_minutes,
            actual_duration_minutes: row.actual_duration_minutes,
            parent_workflow_id: row.parent_workflow_id,
            triggered_by: row.triggered_by,
            tags: typeof row.tags === 'string' 
                ? JSON.parse(row.tags) 
                : row.tags,
            metadata: typeof row.metadata === 'string' 
                ? JSON.parse(row.metadata) 
                : row.metadata,
            created_at: row.created_at,
            updated_at: row.updated_at,
            created_by: row.created_by,
            updated_by: row.updated_by
        });
    }

    /**
     * Update workflow status with validation
     * @param {string} newStatus - New status
     * @param {Object} context - Update context
     */
    updateStatus(newStatus, context = {}) {
        const validStatuses = ['pending', 'running', 'paused', 'completed', 'failed', 'cancelled', 'timeout'];
        if (!validStatuses.includes(newStatus)) {
            throw new Error(`Invalid status: ${newStatus}`);
        }

        const oldStatus = this.status;
        this.status = newStatus;
        this.updated_at = new Date();

        // Set start date for running workflows
        if (newStatus === 'running' && !this.started_at) {
            this.started_at = new Date();
        }

        // Set completion date for completed workflows
        if (['completed', 'failed', 'cancelled', 'timeout'].includes(newStatus) && !this.completed_at) {
            this.completed_at = new Date();
            
            // Calculate actual duration
            if (this.started_at) {
                this.actual_duration_minutes = Math.round(
                    (this.completed_at - this.started_at) / (1000 * 60)
                );
            }
        }

        // Clear completion date if moving away from completed states
        if (!['completed', 'failed', 'cancelled', 'timeout'].includes(newStatus) && 
            ['completed', 'failed', 'cancelled', 'timeout'].includes(oldStatus)) {
            this.completed_at = null;
            this.actual_duration_minutes = null;
        }

        return {
            oldStatus,
            newStatus,
            context
        };
    }

    /**
     * Calculate workflow progress percentage
     * @returns {number} Progress percentage (0-100)
     */
    getProgress() {
        switch (this.status) {
            case 'pending':
                return 0;
            case 'running':
                return 50;
            case 'paused':
                return 25;
            case 'completed':
                return 100;
            case 'failed':
            case 'cancelled':
            case 'timeout':
                return 0;
            default:
                return 0;
        }
    }

    /**
     * Get workflow duration in minutes
     * @returns {number|null} Duration in minutes
     */
    getDuration() {
        if (this.actual_duration_minutes !== null) {
            return this.actual_duration_minutes;
        }

        if (this.started_at) {
            const endTime = this.completed_at || new Date();
            return Math.round((endTime - this.started_at) / (1000 * 60));
        }

        return null;
    }

    /**
     * Check if workflow is overdue
     * @returns {boolean} True if overdue
     */
    isOverdue() {
        if (!this.estimated_duration_minutes || this.status === 'completed') {
            return false;
        }

        const currentDuration = this.getDuration();
        if (!currentDuration) {
            return false;
        }

        return currentDuration > this.estimated_duration_minutes * 1.2; // 20% buffer
    }

    /**
     * Get estimation accuracy percentage
     * @returns {number|null} Accuracy percentage (0-100)
     */
    getEstimationAccuracy() {
        if (!this.estimated_duration_minutes || !this.actual_duration_minutes) {
            return null;
        }

        const variance = Math.abs(this.actual_duration_minutes - this.estimated_duration_minutes);
        const accuracy = Math.max(0, 100 - (variance / this.estimated_duration_minutes * 100));
        return Math.round(accuracy * 100) / 100;
    }

    /**
     * Get workflow summary for display
     * @returns {Object} Workflow summary
     */
    getSummary() {
        return {
            id: this.id,
            name: this.name,
            workflow_type: this.workflow_type,
            status: this.status,
            priority: this.priority,
            environment: this.environment,
            progress: this.getProgress(),
            duration: this.getDuration(),
            isOverdue: this.isOverdue(),
            estimationAccuracy: this.getEstimationAccuracy(),
            tags: this.tags,
            triggered_by: this.triggered_by
        };
    }

    /**
     * Add configuration parameter
     * @param {string} key - Configuration key
     * @param {any} value - Configuration value
     */
    setConfiguration(key, value) {
        this.configuration[key] = value;
        this.updated_at = new Date();
    }

    /**
     * Get configuration parameter
     * @param {string} key - Configuration key
     * @param {any} defaultValue - Default value if key not found
     * @returns {any} Configuration value
     */
    getConfiguration(key, defaultValue = null) {
        return this.configuration[key] !== undefined ? this.configuration[key] : defaultValue;
    }

    /**
     * Add tag to workflow
     * @param {string} tag - Tag to add
     */
    addTag(tag) {
        if (!this.tags.includes(tag)) {
            this.tags.push(tag);
            this.updated_at = new Date();
        }
    }

    /**
     * Remove tag from workflow
     * @param {string} tag - Tag to remove
     */
    removeTag(tag) {
        const index = this.tags.indexOf(tag);
        if (index > -1) {
            this.tags.splice(index, 1);
            this.updated_at = new Date();
        }
    }

    /**
     * Set metadata field
     * @param {string} key - Metadata key
     * @param {any} value - Metadata value
     */
    setMetadata(key, value) {
        this.metadata[key] = value;
        this.updated_at = new Date();
    }

    /**
     * Get metadata field
     * @param {string} key - Metadata key
     * @param {any} defaultValue - Default value if key not found
     * @returns {any} Metadata value
     */
    getMetadata(key, defaultValue = null) {
        return this.metadata[key] !== undefined ? this.metadata[key] : defaultValue;
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
            started_at: null,
            completed_at: null,
            actual_duration_minutes: null,
            status: 'pending',
            ...overrides
        };

        // Parse JSON strings back to objects for the clone
        if (typeof clonedData.configuration === 'string') {
            clonedData.configuration = JSON.parse(clonedData.configuration);
        }
        if (typeof clonedData.tags === 'string') {
            clonedData.tags = JSON.parse(clonedData.tags);
        }
        if (typeof clonedData.metadata === 'string') {
            clonedData.metadata = JSON.parse(clonedData.metadata);
        }

        return new Workflow(clonedData);
    }

    /**
     * Create a workflow from template
     * @param {Object} template - Workflow template
     * @param {Object} parameters - Template parameters
     * @returns {Workflow} Workflow instance
     */
    static fromTemplate(template, parameters = {}) {
        const workflowData = {
            name: template.name || 'Untitled Workflow',
            description: template.description || '',
            workflow_type: template.workflow_type || 'ci_cd',
            environment: parameters.environment || template.environment || 'development',
            priority: parameters.priority || template.priority || 0,
            estimated_duration_minutes: template.estimated_duration_minutes || null,
            configuration: { ...template.configuration, ...parameters.configuration },
            tags: [...(template.tags || []), ...(parameters.tags || [])],
            metadata: { ...template.metadata, ...parameters.metadata, template_id: template.id },
            triggered_by: parameters.triggered_by || 'template'
        };

        return new Workflow(workflowData);
    }
}

export default Workflow;

