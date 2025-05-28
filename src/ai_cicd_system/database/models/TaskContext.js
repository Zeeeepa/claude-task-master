/**
 * @fileoverview TaskContext Model
 * @description Task context data model for storing contextual information
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * TaskContext model class
 */
export class TaskContext {
    constructor(data = {}) {
        this.id = data.id || uuidv4();
        this.task_id = data.task_id;
        this.context_type = data.context_type;
        this.context_data = data.context_data || {};
        this.created_at = data.created_at || new Date();
        this.updated_at = data.updated_at || new Date();
        this.metadata = data.metadata || {};
    }

    /**
     * Validate task context data
     * @returns {Object} Validation result
     */
    validate() {
        const errors = [];
        const warnings = [];

        // Required fields
        if (!this.task_id) {
            errors.push('Task ID is required');
        }

        if (!this.context_type) {
            errors.push('Context type is required');
        }

        if (!this.context_data || typeof this.context_data !== 'object') {
            errors.push('Context data must be an object');
        }

        // Context type validation
        const validTypes = [
            'requirement', 'codebase', 'ai_interaction', 'validation', 
            'workflow', 'status_change', 'completion', 'dependency_parent', 
            'dependency_child', 'error', 'performance'
        ];

        if (this.context_type && !validTypes.includes(this.context_type)) {
            errors.push(`Context type must be one of: ${validTypes.join(', ')}`);
        }

        // Type-specific validations
        if (this.context_type === 'ai_interaction') {
            if (!this.context_data.agent_name) {
                warnings.push('AI interaction should include agent_name');
            }
            if (!this.context_data.interaction_type) {
                warnings.push('AI interaction should include interaction_type');
            }
        }

        if (this.context_type === 'validation') {
            if (!this.context_data.validator_name) {
                warnings.push('Validation context should include validator_name');
            }
            if (this.context_data.score !== undefined && 
                (this.context_data.score < 0 || this.context_data.score > 100)) {
                errors.push('Validation score must be between 0 and 100');
            }
        }

        if (this.context_type === 'status_change') {
            if (!this.context_data.from_status || !this.context_data.to_status) {
                warnings.push('Status change should include from_status and to_status');
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
            task_id: this.task_id,
            context_type: this.context_type,
            context_data: JSON.stringify(this.context_data),
            created_at: this.created_at,
            updated_at: this.updated_at,
            metadata: JSON.stringify(this.metadata)
        };
    }

    /**
     * Create from database row
     * @param {Object} row - Database row
     * @returns {TaskContext} TaskContext instance
     */
    static fromDatabase(row) {
        return new TaskContext({
            id: row.id,
            task_id: row.task_id,
            context_type: row.context_type,
            context_data: typeof row.context_data === 'string' 
                ? JSON.parse(row.context_data) 
                : row.context_data,
            created_at: row.created_at,
            updated_at: row.updated_at,
            metadata: typeof row.metadata === 'string' 
                ? JSON.parse(row.metadata) 
                : row.metadata
        });
    }

    /**
     * Get context summary for display
     * @returns {Object} Context summary
     */
    getSummary() {
        return {
            id: this.id,
            task_id: this.task_id,
            type: this.context_type,
            created_at: this.created_at,
            data_size: JSON.stringify(this.context_data).length,
            has_metadata: Object.keys(this.metadata).length > 0
        };
    }

    /**
     * Create AI interaction context
     * @param {string} taskId - Task ID
     * @param {string} agentName - AI agent name
     * @param {Object} interactionData - Interaction data
     * @returns {TaskContext} TaskContext instance
     */
    static createAIInteraction(taskId, agentName, interactionData) {
        return new TaskContext({
            task_id: taskId,
            context_type: 'ai_interaction',
            context_data: {
                agent_name: agentName,
                interaction_type: interactionData.type || 'unknown',
                request_data: interactionData.request,
                response_data: interactionData.response,
                execution_time_ms: interactionData.execution_time_ms,
                success: interactionData.success !== false,
                session_id: interactionData.session_id,
                timestamp: new Date()
            }
        });
    }

    /**
     * Create validation context
     * @param {string} taskId - Task ID
     * @param {string} validationType - Type of validation
     * @param {string} validatorName - Name of validator
     * @param {string} status - Validation status
     * @param {number} score - Validation score
     * @param {Object} details - Validation details
     * @param {Object} suggestions - Improvement suggestions
     * @returns {TaskContext} TaskContext instance
     */
    static createValidation(taskId, validationType, validatorName, status, score, details, suggestions) {
        return new TaskContext({
            task_id: taskId,
            context_type: 'validation',
            context_data: {
                validation_type: validationType,
                validator_name: validatorName,
                status,
                score,
                details,
                suggestions,
                validated_at: new Date()
            }
        });
    }

    /**
     * Create status change context
     * @param {string} taskId - Task ID
     * @param {string} fromStatus - Previous status
     * @param {string} toStatus - New status
     * @param {Object} context - Additional context
     * @returns {TaskContext} TaskContext instance
     */
    static createStatusChange(taskId, fromStatus, toStatus, context = {}) {
        return new TaskContext({
            task_id: taskId,
            context_type: 'status_change',
            context_data: {
                from_status: fromStatus,
                to_status: toStatus,
                changed_at: new Date(),
                context
            }
        });
    }

    /**
     * Create requirement context
     * @param {string} taskId - Task ID
     * @param {Object} requirement - Original requirement
     * @param {Object} decompositionMetadata - Decomposition metadata
     * @returns {TaskContext} TaskContext instance
     */
    static createRequirement(taskId, requirement, decompositionMetadata = {}) {
        return new TaskContext({
            task_id: taskId,
            context_type: 'requirement',
            context_data: {
                original_requirement: requirement,
                decomposition_metadata: {
                    created_at: new Date(),
                    decomposition_method: 'nlp_analysis',
                    ...decompositionMetadata
                }
            }
        });
    }

    /**
     * Create completion context
     * @param {string} taskId - Task ID
     * @param {Object} results - Completion results
     * @returns {TaskContext} TaskContext instance
     */
    static createCompletion(taskId, results = {}) {
        return new TaskContext({
            task_id: taskId,
            context_type: 'completion',
            context_data: {
                completed_at: new Date(),
                results,
                completion_method: 'automated'
            }
        });
    }

    /**
     * Create dependency context
     * @param {string} taskId - Task ID
     * @param {string} relatedTaskId - Related task ID
     * @param {string} dependencyType - Type of dependency
     * @param {boolean} isParent - Whether this task is the parent
     * @returns {TaskContext} TaskContext instance
     */
    static createDependency(taskId, relatedTaskId, dependencyType = 'blocks', isParent = true) {
        const contextType = isParent ? 'dependency_parent' : 'dependency_child';
        const relatedField = isParent ? 'child_task_id' : 'parent_task_id';
        
        return new TaskContext({
            task_id: taskId,
            context_type: contextType,
            context_data: {
                [relatedField]: relatedTaskId,
                dependency_type: dependencyType,
                created_at: new Date()
            }
        });
    }

    /**
     * Create error context
     * @param {string} taskId - Task ID
     * @param {Error} error - Error object
     * @param {Object} additionalContext - Additional error context
     * @returns {TaskContext} TaskContext instance
     */
    static createError(taskId, error, additionalContext = {}) {
        return new TaskContext({
            task_id: taskId,
            context_type: 'error',
            context_data: {
                error_message: error.message,
                error_stack: error.stack,
                error_type: error.constructor.name,
                occurred_at: new Date(),
                ...additionalContext
            }
        });
    }

    /**
     * Create performance context
     * @param {string} taskId - Task ID
     * @param {Object} performanceData - Performance metrics
     * @returns {TaskContext} TaskContext instance
     */
    static createPerformance(taskId, performanceData) {
        return new TaskContext({
            task_id: taskId,
            context_type: 'performance',
            context_data: {
                ...performanceData,
                recorded_at: new Date()
            }
        });
    }
}

export default TaskContext;

