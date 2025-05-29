/**
 * @fileoverview ErrorLog Model
 * @description Error logging model for comprehensive error tracking and debugging
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * ErrorLog model class
 */
export class ErrorLog {
    constructor(data = {}) {
        this.id = data.id || uuidv4();
        this.error_type = data.error_type || 'general';
        this.error_code = data.error_code || null;
        this.error_message = data.error_message || '';
        this.stack_trace = data.stack_trace || null;
        this.context = data.context || {};
        this.task_id = data.task_id || null;
        this.workflow_id = data.workflow_id || null;
        this.user_id = data.user_id || null;
        this.session_id = data.session_id || null;
        this.severity = data.severity || 'error';
        this.resolved = data.resolved || false;
        this.resolution_notes = data.resolution_notes || null;
        this.created_at = data.created_at || new Date();
        this.resolved_at = data.resolved_at || null;
        this.metadata = data.metadata || {};
    }

    /**
     * Validate error log data
     * @returns {Object} Validation result
     */
    validate() {
        const errors = [];
        const warnings = [];

        // Required fields
        if (!this.error_message || this.error_message.trim().length === 0) {
            errors.push('Error message is required');
        }

        // Error type validation
        const validErrorTypes = [
            'general', 'validation', 'database', 'network', 'authentication',
            'authorization', 'business_logic', 'external_api', 'system',
            'configuration', 'timeout', 'rate_limit'
        ];
        if (!validErrorTypes.includes(this.error_type)) {
            errors.push(`Error type must be one of: ${validErrorTypes.join(', ')}`);
        }

        // Severity validation
        const validSeverities = ['debug', 'info', 'warn', 'error', 'fatal'];
        if (!validSeverities.includes(this.severity)) {
            errors.push(`Severity must be one of: ${validSeverities.join(', ')}`);
        }

        // Business logic validations
        if (this.resolved && !this.resolved_at) {
            warnings.push('Resolved errors should have a resolution date');
        }

        if (this.resolved && !this.resolution_notes) {
            warnings.push('Resolved errors should have resolution notes');
        }

        if (this.severity === 'fatal' && !this.stack_trace) {
            warnings.push('Fatal errors should include stack trace');
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
            error_type: this.error_type,
            error_code: this.error_code,
            error_message: this.error_message,
            stack_trace: this.stack_trace,
            context: JSON.stringify(this.context),
            task_id: this.task_id,
            workflow_id: this.workflow_id,
            user_id: this.user_id,
            session_id: this.session_id,
            severity: this.severity,
            resolved: this.resolved,
            resolution_notes: this.resolution_notes,
            created_at: this.created_at,
            resolved_at: this.resolved_at,
            metadata: JSON.stringify(this.metadata)
        };
    }

    /**
     * Create from database row
     * @param {Object} row - Database row
     * @returns {ErrorLog} ErrorLog instance
     */
    static fromDatabase(row) {
        return new ErrorLog({
            id: row.id,
            error_type: row.error_type,
            error_code: row.error_code,
            error_message: row.error_message,
            stack_trace: row.stack_trace,
            context: typeof row.context === 'string' 
                ? JSON.parse(row.context) 
                : row.context,
            task_id: row.task_id,
            workflow_id: row.workflow_id,
            user_id: row.user_id,
            session_id: row.session_id,
            severity: row.severity,
            resolved: row.resolved,
            resolution_notes: row.resolution_notes,
            created_at: row.created_at,
            resolved_at: row.resolved_at,
            metadata: typeof row.metadata === 'string' 
                ? JSON.parse(row.metadata) 
                : row.metadata
        });
    }

    /**
     * Create error log from JavaScript Error object
     * @param {Error} error - JavaScript Error object
     * @param {Object} context - Additional context
     * @returns {ErrorLog} ErrorLog instance
     */
    static fromError(error, context = {}) {
        return new ErrorLog({
            error_type: context.error_type || 'general',
            error_code: error.code || null,
            error_message: error.message,
            stack_trace: error.stack,
            context: {
                name: error.name,
                ...context
            },
            task_id: context.task_id || null,
            workflow_id: context.workflow_id || null,
            user_id: context.user_id || null,
            session_id: context.session_id || null,
            severity: context.severity || 'error'
        });
    }

    /**
     * Mark error as resolved
     * @param {string} resolutionNotes - Notes about the resolution
     * @param {string} resolvedBy - User who resolved the error
     */
    resolve(resolutionNotes, resolvedBy = null) {
        this.resolved = true;
        this.resolved_at = new Date();
        this.resolution_notes = resolutionNotes;
        
        if (resolvedBy) {
            this.metadata = {
                ...this.metadata,
                resolved_by: resolvedBy
            };
        }
    }

    /**
     * Get error age in hours
     * @returns {number} Age in hours
     */
    getAge() {
        const now = new Date();
        const created = new Date(this.created_at);
        return Math.floor((now - created) / (1000 * 60 * 60));
    }

    /**
     * Get resolution time in hours
     * @returns {number|null} Resolution time in hours
     */
    getResolutionTime() {
        if (!this.resolved_at) {
            return null;
        }
        const resolved = new Date(this.resolved_at);
        const created = new Date(this.created_at);
        return Math.floor((resolved - created) / (1000 * 60 * 60));
    }

    /**
     * Check if error is critical (fatal or error severity)
     * @returns {boolean} True if critical
     */
    isCritical() {
        return ['error', 'fatal'].includes(this.severity);
    }

    /**
     * Get error summary for display
     * @returns {Object} Error summary
     */
    getSummary() {
        return {
            id: this.id,
            error_type: this.error_type,
            error_code: this.error_code,
            error_message: this.error_message.substring(0, 100) + 
                (this.error_message.length > 100 ? '...' : ''),
            severity: this.severity,
            resolved: this.resolved,
            age: this.getAge(),
            resolutionTime: this.getResolutionTime(),
            isCritical: this.isCritical(),
            task_id: this.task_id,
            workflow_id: this.workflow_id
        };
    }

    /**
     * Get error context for debugging
     * @returns {Object} Debug context
     */
    getDebugContext() {
        return {
            error_details: {
                type: this.error_type,
                code: this.error_code,
                message: this.error_message,
                severity: this.severity
            },
            execution_context: {
                task_id: this.task_id,
                workflow_id: this.workflow_id,
                user_id: this.user_id,
                session_id: this.session_id
            },
            timing: {
                created_at: this.created_at,
                age_hours: this.getAge(),
                resolved: this.resolved,
                resolution_time_hours: this.getResolutionTime()
            },
            technical_details: {
                stack_trace: this.stack_trace,
                context: this.context,
                metadata: this.metadata
            }
        };
    }
}

export default ErrorLog;

