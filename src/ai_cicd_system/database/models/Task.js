/**
 * @fileoverview Enhanced Task Model
 * @description Enhanced task data model with CI/CD specific fields, validation and business logic
 * @version 2.0.0
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Enhanced Task model class with CI/CD specific functionality
 */
export class Task {
    constructor(data = {}) {
        this.id = data.id || uuidv4();
        this.title = data.title || '';
        this.description = data.description || '';
        
        // Enhanced CI/CD specific fields
        this.requirements = data.requirements || [];
        this.acceptance_criteria = data.acceptance_criteria || [];
        this.complexity_score = data.complexity_score || 5;
        this.priority = data.priority || 'medium';
        this.status = data.status || 'pending';
        
        // Technology stack information
        this.language = data.language || null;
        this.framework = data.framework || null;
        this.testing_framework = data.testing_framework || null;
        
        // Repository and CI/CD integration
        this.repository_url = data.repository_url || null;
        this.branch_name = data.branch_name || null;
        this.pr_number = data.pr_number || null;
        this.pr_url = data.pr_url || null;
        this.codegen_request_id = data.codegen_request_id || null;
        
        // Error handling and retry logic
        this.error_logs = data.error_logs || [];
        this.retry_count = data.retry_count || 0;
        
        // Timestamps
        this.created_at = data.created_at || new Date();
        this.updated_at = data.updated_at || new Date();
        this.completed_at = data.completed_at || null;
        
        // Assignment and hierarchy
        this.assigned_to = data.assigned_to || null;
        this.parent_task_id = data.parent_task_id || null;
        this.workflow_id = data.workflow_id || null;
        
        // Flexible metadata storage
        this.metadata = data.metadata || {};
        
        // Legacy fields for backward compatibility
        this.type = data.type || 'general';
        this.affected_files = data.affected_files || [];
        this.tags = data.tags || [];
        this.estimated_hours = data.estimated_hours || null;
        this.actual_hours = data.actual_hours || null;
    }

    /**
     * Enhanced validation with CI/CD specific rules
     * @returns {Object} Validation result
     */
    validate() {
        const errors = [];
        const warnings = [];

        // Required fields validation
        if (!this.title || this.title.trim().length === 0) {
            errors.push('Title is required');
        }

        if (this.title && this.title.length > 255) {
            errors.push('Title must be 255 characters or less');
        }

        if (this.title && this.title.length < 3) {
            errors.push('Title must be at least 3 characters long');
        }

        // Status validation with enhanced CI/CD statuses
        const validStatuses = [
            'pending', 'in_progress', 'completed', 'failed', 'cancelled', 
            'blocked', 'review', 'testing', 'deployed'
        ];
        if (!validStatuses.includes(this.status)) {
            errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
        }

        // Priority validation with enhanced options
        const validPriorities = ['low', 'medium', 'high', 'critical'];
        if (!validPriorities.includes(this.priority)) {
            errors.push(`Priority must be one of: ${validPriorities.join(', ')}`);
        }

        // Complexity validation
        if (this.complexity_score < 1 || this.complexity_score > 10) {
            errors.push('Complexity score must be between 1 and 10');
        }

        // Retry count validation
        if (this.retry_count < 0 || this.retry_count > 10) {
            errors.push('Retry count must be between 0 and 10');
        }

        // Array validations
        if (!Array.isArray(this.requirements)) {
            errors.push('Requirements must be an array');
        }

        if (!Array.isArray(this.acceptance_criteria)) {
            errors.push('Acceptance criteria must be an array');
        }

        if (!Array.isArray(this.error_logs)) {
            errors.push('Error logs must be an array');
        }

        // URL validations
        if (this.repository_url && !this.isValidUrl(this.repository_url)) {
            errors.push('Repository URL must be a valid URL');
        }

        if (this.pr_url && !this.isValidUrl(this.pr_url)) {
            errors.push('PR URL must be a valid URL');
        }

        // CI/CD specific validations
        if (this.pr_number && (this.pr_number < 1 || !Number.isInteger(this.pr_number))) {
            errors.push('PR number must be a positive integer');
        }

        if (this.branch_name && this.branch_name.length > 255) {
            errors.push('Branch name must be 255 characters or less');
        }

        // Business logic warnings
        if (this.status === 'completed' && !this.completed_at) {
            warnings.push('Completed tasks should have a completion date');
        }

        if (this.status === 'failed' && this.retry_count === 0) {
            warnings.push('Failed tasks should have retry attempts recorded');
        }

        if (this.complexity_score > 8 && !this.estimated_hours) {
            warnings.push('High complexity tasks should have estimated hours');
        }

        if (this.pr_number && !this.pr_url) {
            warnings.push('Tasks with PR numbers should have PR URLs');
        }

        if (this.repository_url && !this.branch_name) {
            warnings.push('Tasks with repository URLs should have branch names');
        }

        if (this.status === 'in_progress' && !this.assigned_to) {
            warnings.push('In-progress tasks should be assigned to someone');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate URL format
     * @param {string} url - URL to validate
     * @returns {boolean} True if valid URL
     */
    isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Convert to database format with enhanced fields
     * @returns {Object} Database-ready object
     */
    toDatabase() {
        return {
            id: this.id,
            title: this.title,
            description: this.description,
            requirements: JSON.stringify(this.requirements),
            acceptance_criteria: JSON.stringify(this.acceptance_criteria),
            complexity_score: this.complexity_score,
            priority: this.priority,
            status: this.status,
            language: this.language,
            framework: this.framework,
            testing_framework: this.testing_framework,
            repository_url: this.repository_url,
            branch_name: this.branch_name,
            pr_number: this.pr_number,
            pr_url: this.pr_url,
            codegen_request_id: this.codegen_request_id,
            error_logs: JSON.stringify(this.error_logs),
            retry_count: this.retry_count,
            created_at: this.created_at,
            updated_at: this.updated_at,
            completed_at: this.completed_at,
            assigned_to: this.assigned_to,
            parent_task_id: this.parent_task_id,
            workflow_id: this.workflow_id,
            metadata: JSON.stringify(this.metadata),
            // Legacy fields
            type: this.type,
            affected_files: JSON.stringify(this.affected_files),
            tags: JSON.stringify(this.tags),
            estimated_hours: this.estimated_hours,
            actual_hours: this.actual_hours
        };
    }

    /**
     * Create from database row with enhanced field handling
     * @param {Object} row - Database row
     * @returns {Task} Task instance
     */
    static fromDatabase(row) {
        return new Task({
            id: row.id,
            title: row.title,
            description: row.description,
            requirements: typeof row.requirements === 'string' 
                ? JSON.parse(row.requirements) 
                : row.requirements || [],
            acceptance_criteria: typeof row.acceptance_criteria === 'string' 
                ? JSON.parse(row.acceptance_criteria) 
                : row.acceptance_criteria || [],
            complexity_score: row.complexity_score,
            priority: row.priority,
            status: row.status,
            language: row.language,
            framework: row.framework,
            testing_framework: row.testing_framework,
            repository_url: row.repository_url,
            branch_name: row.branch_name,
            pr_number: row.pr_number,
            pr_url: row.pr_url,
            codegen_request_id: row.codegen_request_id,
            error_logs: typeof row.error_logs === 'string' 
                ? JSON.parse(row.error_logs) 
                : row.error_logs || [],
            retry_count: row.retry_count,
            created_at: row.created_at,
            updated_at: row.updated_at,
            completed_at: row.completed_at,
            assigned_to: row.assigned_to,
            parent_task_id: row.parent_task_id,
            workflow_id: row.workflow_id,
            metadata: typeof row.metadata === 'string' 
                ? JSON.parse(row.metadata) 
                : row.metadata || {},
            // Legacy fields
            type: row.type,
            affected_files: typeof row.affected_files === 'string' 
                ? JSON.parse(row.affected_files) 
                : row.affected_files || [],
            tags: typeof row.tags === 'string' 
                ? JSON.parse(row.tags) 
                : row.tags || [],
            estimated_hours: row.estimated_hours,
            actual_hours: row.actual_hours
        });
    }

    /**
     * Update task status with enhanced validation and CI/CD logic
     * @param {string} newStatus - New status
     * @param {Object} context - Update context
     */
    updateStatus(newStatus, context = {}) {
        const validStatuses = [
            'pending', 'in_progress', 'completed', 'failed', 'cancelled', 
            'blocked', 'review', 'testing', 'deployed'
        ];
        
        if (!validStatuses.includes(newStatus)) {
            throw new Error(`Invalid status: ${newStatus}`);
        }

        const oldStatus = this.status;
        this.status = newStatus;
        this.updated_at = new Date();

        // Enhanced status transition logic
        if (newStatus === 'completed' && !this.completed_at) {
            this.completed_at = new Date();
        }

        if (oldStatus === 'completed' && newStatus !== 'completed') {
            this.completed_at = null;
        }

        // CI/CD specific status handling
        if (newStatus === 'failed') {
            this.retry_count = Math.min(this.retry_count + 1, 10);
            
            // Add error log entry if context provided
            if (context.error) {
                this.addErrorLog(context.error, context);
            }
        }

        if (newStatus === 'in_progress' && !this.assigned_to && context.assignee) {
            this.assigned_to = context.assignee;
        }

        return {
            oldStatus,
            newStatus,
            context,
            canRetry: newStatus === 'failed' && this.retry_count < 10
        };
    }

    /**
     * Add error log entry
     * @param {string|Error} error - Error message or Error object
     * @param {Object} context - Additional context
     */
    addErrorLog(error, context = {}) {
        const errorEntry = {
            timestamp: new Date().toISOString(),
            message: error instanceof Error ? error.message : error,
            stack: error instanceof Error ? error.stack : null,
            retry_count: this.retry_count,
            context: context
        };

        this.error_logs.push(errorEntry);
        
        // Keep only last 10 error logs to prevent excessive growth
        if (this.error_logs.length > 10) {
            this.error_logs = this.error_logs.slice(-10);
        }
    }

    /**
     * Check if task can be retried
     * @returns {boolean} True if task can be retried
     */
    canRetry() {
        return this.status === 'failed' && this.retry_count < 10;
    }

    /**
     * Get CI/CD pipeline status
     * @returns {Object} Pipeline status information
     */
    getPipelineStatus() {
        const hasRepository = !!this.repository_url;
        const hasBranch = !!this.branch_name;
        const hasPR = !!this.pr_number;
        const isDeployed = this.status === 'deployed';
        
        return {
            hasRepository,
            hasBranch,
            hasPR,
            isDeployed,
            pipelineStage: this.getPipelineStage(),
            readyForDeployment: this.status === 'completed' && hasPR
        };
    }

    /**
     * Get current pipeline stage
     * @returns {string} Current pipeline stage
     */
    getPipelineStage() {
        if (!this.repository_url) return 'not_started';
        if (!this.branch_name) return 'repository_setup';
        if (this.status === 'in_progress') return 'development';
        if (this.status === 'review') return 'code_review';
        if (this.status === 'testing') return 'testing';
        if (this.status === 'completed') return 'ready_for_deployment';
        if (this.status === 'deployed') return 'deployed';
        if (this.status === 'failed') return 'failed';
        return 'unknown';
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
