/**
 * @fileoverview Task Model
 * @description Task data model with validation and business logic
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Task model class
 */
export class Task {
    constructor(data = {}) {
        this.id = data.id || uuidv4();
        this.title = data.title || '';
        this.description = data.description || '';
        this.type = data.type || 'general';
        this.status = data.status || 'pending';
        this.priority = data.priority || 0;
        this.complexity_score = data.complexity_score || 5;
        this.affected_files = data.affected_files || [];
        this.requirements = data.requirements || [];
        this.acceptance_criteria = data.acceptance_criteria || [];
        this.parent_task_id = data.parent_task_id || null;
        this.assigned_to = data.assigned_to || null;
        this.tags = data.tags || [];
        this.estimated_hours = data.estimated_hours || null;
        this.actual_hours = data.actual_hours || null;
        this.created_at = data.created_at || new Date();
        this.updated_at = data.updated_at || new Date();
        this.completed_at = data.completed_at || null;
        this.metadata = data.metadata || {};
    }

    /**
     * Validate task data
     * @returns {Object} Validation result
     */
    validate() {
        const errors = [];
        const warnings = [];

        // Required fields
        if (!this.title || this.title.trim().length === 0) {
            errors.push('Title is required');
        }

        if (this.title && this.title.length > 255) {
            errors.push('Title must be 255 characters or less');
        }

        // Status validation
        const validStatuses = ['pending', 'in_progress', 'completed', 'failed', 'cancelled'];
        if (!validStatuses.includes(this.status)) {
            errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
        }

        // Priority validation
        if (this.priority < 0 || this.priority > 10) {
            errors.push('Priority must be between 0 and 10');
        }

        // Complexity validation
        if (this.complexity_score < 1 || this.complexity_score > 10) {
            errors.push('Complexity score must be between 1 and 10');
        }

        // Hours validation
        if (this.estimated_hours !== null && this.estimated_hours < 0) {
            errors.push('Estimated hours must be non-negative');
        }

        if (this.actual_hours !== null && this.actual_hours < 0) {
            errors.push('Actual hours must be non-negative');
        }

        // Array validations
        if (!Array.isArray(this.affected_files)) {
            errors.push('Affected files must be an array');
        }

        if (!Array.isArray(this.requirements)) {
            errors.push('Requirements must be an array');
        }

        if (!Array.isArray(this.acceptance_criteria)) {
            errors.push('Acceptance criteria must be an array');
        }

        if (!Array.isArray(this.tags)) {
            errors.push('Tags must be an array');
        }

        // Business logic warnings
        if (this.status === 'completed' && !this.completed_at) {
            warnings.push('Completed tasks should have a completion date');
        }

        if (this.status === 'completed' && !this.actual_hours && this.estimated_hours) {
            warnings.push('Completed tasks should have actual hours recorded');
        }

        if (this.complexity_score > 8 && !this.estimated_hours) {
            warnings.push('High complexity tasks should have estimated hours');
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
            title: this.title,
            description: this.description,
            type: this.type,
            status: this.status,
            priority: this.priority,
            complexity_score: this.complexity_score,
            affected_files: JSON.stringify(this.affected_files),
            requirements: JSON.stringify(this.requirements),
            acceptance_criteria: JSON.stringify(this.acceptance_criteria),
            parent_task_id: this.parent_task_id,
            assigned_to: this.assigned_to,
            tags: JSON.stringify(this.tags),
            estimated_hours: this.estimated_hours,
            actual_hours: this.actual_hours,
            created_at: this.created_at,
            updated_at: this.updated_at,
            completed_at: this.completed_at,
            metadata: JSON.stringify(this.metadata)
        };
    }

    /**
     * Create from database row
     * @param {Object} row - Database row
     * @returns {Task} Task instance
     */
    static fromDatabase(row) {
        return new Task({
            id: row.id,
            title: row.title,
            description: row.description,
            type: row.type,
            status: row.status,
            priority: row.priority,
            complexity_score: row.complexity_score,
            affected_files: typeof row.affected_files === 'string' 
                ? JSON.parse(row.affected_files) 
                : row.affected_files,
            requirements: typeof row.requirements === 'string' 
                ? JSON.parse(row.requirements) 
                : row.requirements,
            acceptance_criteria: typeof row.acceptance_criteria === 'string' 
                ? JSON.parse(row.acceptance_criteria) 
                : row.acceptance_criteria,
            parent_task_id: row.parent_task_id,
            assigned_to: row.assigned_to,
            tags: typeof row.tags === 'string' 
                ? JSON.parse(row.tags) 
                : row.tags,
            estimated_hours: row.estimated_hours,
            actual_hours: row.actual_hours,
            created_at: row.created_at,
            updated_at: row.updated_at,
            completed_at: row.completed_at,
            metadata: typeof row.metadata === 'string' 
                ? JSON.parse(row.metadata) 
                : row.metadata
        });
    }

    /**
     * Update task status with validation
     * @param {string} newStatus - New status
     * @param {Object} context - Update context
     */
    updateStatus(newStatus, context = {}) {
        const validStatuses = ['pending', 'in_progress', 'completed', 'failed', 'cancelled'];
        if (!validStatuses.includes(newStatus)) {
            throw new Error(`Invalid status: ${newStatus}`);
        }

        const oldStatus = this.status;
        this.status = newStatus;
        this.updated_at = new Date();

        // Set completion date for completed tasks
        if (newStatus === 'completed' && !this.completed_at) {
            this.completed_at = new Date();
        }

        // Clear completion date if moving away from completed
        if (oldStatus === 'completed' && newStatus !== 'completed') {
            this.completed_at = null;
        }

        return {
            oldStatus,
            newStatus,
            context
        };
    }

    /**
     * Calculate task progress percentage
     * @returns {number} Progress percentage (0-100)
     */
    getProgress() {
        switch (this.status) {
            case 'pending':
                return 0;
            case 'in_progress':
                return 50;
            case 'completed':
                return 100;
            case 'failed':
            case 'cancelled':
                return 0;
            default:
                return 0;
        }
    }

    /**
     * Get task age in days
     * @returns {number} Age in days
     */
    getAge() {
        const now = new Date();
        const created = new Date(this.created_at);
        return Math.floor((now - created) / (1000 * 60 * 60 * 24));
    }

    /**
     * Check if task is overdue (for completed tasks)
     * @returns {boolean} True if overdue
     */
    isOverdue() {
        if (!this.estimated_hours || this.status !== 'completed') {
            return false;
        }

        return this.actual_hours > this.estimated_hours * 1.2; // 20% buffer
    }

    /**
     * Get task summary for display
     * @returns {Object} Task summary
     */
    getSummary() {
        return {
            id: this.id,
            title: this.title,
            status: this.status,
            priority: this.priority,
            complexity: this.complexity_score,
            assignee: this.assigned_to,
            progress: this.getProgress(),
            age: this.getAge(),
            isOverdue: this.isOverdue(),
            tags: this.tags
        };
    }

    /**
     * Clone task with new ID
     * @param {Object} overrides - Properties to override
     * @returns {Task} Cloned task
     */
    clone(overrides = {}) {
        const clonedData = {
            ...this.toDatabase(),
            id: uuidv4(),
            created_at: new Date(),
            updated_at: new Date(),
            completed_at: null,
            status: 'pending',
            actual_hours: null,
            ...overrides
        };

        // Parse JSON strings back to objects for the clone
        if (typeof clonedData.affected_files === 'string') {
            clonedData.affected_files = JSON.parse(clonedData.affected_files);
        }
        if (typeof clonedData.requirements === 'string') {
            clonedData.requirements = JSON.parse(clonedData.requirements);
        }
        if (typeof clonedData.acceptance_criteria === 'string') {
            clonedData.acceptance_criteria = JSON.parse(clonedData.acceptance_criteria);
        }
        if (typeof clonedData.tags === 'string') {
            clonedData.tags = JSON.parse(clonedData.tags);
        }
        if (typeof clonedData.metadata === 'string') {
            clonedData.metadata = JSON.parse(clonedData.metadata);
        }

        return new Task(clonedData);
    }
}

export default Task;

