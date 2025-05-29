/**
 * @fileoverview State Repository
 * @description Data access layer for WorkflowState operations
 */

import { WorkflowState } from '../models/WorkflowState.js';
import { getConnection } from '../connection.js';

/**
 * State Repository class
 * Provides data access methods for WorkflowState entities
 */
export class StateRepository {
    constructor(connection = null) {
        this.connection = connection || getConnection();
    }

    /**
     * Create a new workflow state
     * @param {WorkflowState|Object} stateData - WorkflowState instance or data object
     * @returns {Promise<WorkflowState>} Created state
     */
    async create(stateData) {
        const state = stateData instanceof WorkflowState ? stateData : new WorkflowState(stateData);
        
        // Validate state before creation
        const validation = state.validate();
        if (!validation.valid) {
            throw new Error(`State validation failed: ${validation.errors.join(', ')}`);
        }

        const dbData = state.toDatabase();
        const query = `
            INSERT INTO workflow_states (
                id, workflow_id, task_id, step, status, result, started_at,
                completed_at, error_message, retry_count, metadata
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
            ) RETURNING *
        `;

        const values = [
            dbData.id, dbData.workflow_id, dbData.task_id, dbData.step, dbData.status,
            dbData.result, dbData.started_at, dbData.completed_at, dbData.error_message,
            dbData.retry_count, dbData.metadata
        ];

        const result = await this.connection.query(query, values);
        return WorkflowState.fromDatabase(result.rows[0]);
    }

    /**
     * Find state by ID
     * @param {string} id - State ID
     * @returns {Promise<WorkflowState|null>} State or null if not found
     */
    async findById(id) {
        const query = 'SELECT * FROM workflow_states WHERE id = $1';
        const result = await this.connection.query(query, [id]);
        
        if (result.rows.length === 0) {
            return null;
        }
        
        return WorkflowState.fromDatabase(result.rows[0]);
    }

    /**
     * Find states by workflow ID
     * @param {string} workflowId - Workflow ID
     * @param {Object} options - Query options
     * @returns {Promise<WorkflowState[]>} Workflow states
     */
    async findByWorkflowId(workflowId, options = {}) {
        const { status, limit = 100, offset = 0, orderBy = 'started_at ASC' } = options;
        
        let query = 'SELECT * FROM workflow_states WHERE workflow_id = $1';
        const values = [workflowId];
        let paramIndex = 2;

        if (status) {
            query += ` AND status = $${paramIndex}`;
            values.push(status);
            paramIndex++;
        }

        query += ` ORDER BY ${orderBy} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await this.connection.query(query, values);
        return result.rows.map(row => WorkflowState.fromDatabase(row));
    }

    /**
     * Find states by task ID
     * @param {string} taskId - Task ID
     * @param {Object} options - Query options
     * @returns {Promise<WorkflowState[]>} Task workflow states
     */
    async findByTaskId(taskId, options = {}) {
        const { status, limit = 100, offset = 0, orderBy = 'started_at ASC' } = options;
        
        let query = 'SELECT * FROM workflow_states WHERE task_id = $1';
        const values = [taskId];
        let paramIndex = 2;

        if (status) {
            query += ` AND status = $${paramIndex}`;
            values.push(status);
            paramIndex++;
        }

        query += ` ORDER BY ${orderBy} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await this.connection.query(query, values);
        return result.rows.map(row => WorkflowState.fromDatabase(row));
    }

    /**
     * Find states by criteria
     * @param {Object} criteria - Search criteria
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Results with states and pagination info
     */
    async findBy(criteria = {}, options = {}) {
        const { limit = 50, offset = 0, orderBy = 'started_at DESC' } = options;
        
        let whereClause = 'WHERE 1=1';
        const values = [];
        let paramIndex = 1;

        if (criteria.workflow_id) {
            whereClause += ` AND workflow_id = $${paramIndex}`;
            values.push(criteria.workflow_id);
            paramIndex++;
        }

        if (criteria.task_id) {
            whereClause += ` AND task_id = $${paramIndex}`;
            values.push(criteria.task_id);
            paramIndex++;
        }

        if (criteria.status) {
            whereClause += ` AND status = $${paramIndex}`;
            values.push(criteria.status);
            paramIndex++;
        }

        if (criteria.step) {
            whereClause += ` AND step = $${paramIndex}`;
            values.push(criteria.step);
            paramIndex++;
        }

        if (criteria.started_after) {
            whereClause += ` AND started_at >= $${paramIndex}`;
            values.push(criteria.started_after);
            paramIndex++;
        }

        if (criteria.started_before) {
            whereClause += ` AND started_at <= $${paramIndex}`;
            values.push(criteria.started_before);
            paramIndex++;
        }

        if (criteria.has_error !== undefined) {
            if (criteria.has_error) {
                whereClause += ` AND error_message IS NOT NULL`;
            } else {
                whereClause += ` AND error_message IS NULL`;
            }
        }

        // Count query for pagination
        const countQuery = `SELECT COUNT(*) FROM workflow_states ${whereClause}`;
        const countResult = await this.connection.query(countQuery, values);
        const total = parseInt(countResult.rows[0].count);

        // Main query
        const query = `
            SELECT * FROM workflow_states 
            ${whereClause} 
            ORDER BY ${orderBy} 
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        values.push(limit, offset);

        const result = await this.connection.query(query, values);
        const states = result.rows.map(row => WorkflowState.fromDatabase(row));

        return {
            states,
            pagination: {
                total,
                limit,
                offset,
                hasMore: offset + limit < total
            }
        };
    }

    /**
     * Update state
     * @param {string} id - State ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<WorkflowState|null>} Updated state or null if not found
     */
    async update(id, updates) {
        const existingState = await this.findById(id);
        if (!existingState) {
            return null;
        }

        Object.assign(existingState, updates);

        const validation = existingState.validate();
        if (!validation.valid) {
            throw new Error(`State validation failed: ${validation.errors.join(', ')}`);
        }

        const dbData = existingState.toDatabase();
        const query = `
            UPDATE workflow_states SET
                status = $2, result = $3, completed_at = $4, error_message = $5,
                retry_count = $6, metadata = $7
            WHERE id = $1
            RETURNING *
        `;

        const values = [
            id, dbData.status, dbData.result, dbData.completed_at,
            dbData.error_message, dbData.retry_count, dbData.metadata
        ];

        const result = await this.connection.query(query, values);
        return WorkflowState.fromDatabase(result.rows[0]);
    }

    /**
     * Update state status
     * @param {string} id - State ID
     * @param {string} status - New status
     * @param {Object} context - Update context
     * @returns {Promise<WorkflowState|null>} Updated state or null if not found
     */
    async updateStatus(id, status, context = {}) {
        const state = await this.findById(id);
        if (!state) {
            return null;
        }

        state.updateStatus(status, context);
        return await this.update(id, {
            status: state.status,
            completed_at: state.completed_at
        });
    }

    /**
     * Set state result
     * @param {string} id - State ID
     * @param {Object} result - State result
     * @returns {Promise<WorkflowState|null>} Updated state or null if not found
     */
    async setResult(id, result) {
        const state = await this.findById(id);
        if (!state) {
            return null;
        }

        state.setResult(result);
        return await this.update(id, {
            result: state.result,
            status: state.status,
            completed_at: state.completed_at
        });
    }

    /**
     * Set state error
     * @param {string} id - State ID
     * @param {string} errorMessage - Error message
     * @returns {Promise<WorkflowState|null>} Updated state or null if not found
     */
    async setError(id, errorMessage) {
        const state = await this.findById(id);
        if (!state) {
            return null;
        }

        state.setError(errorMessage);
        return await this.update(id, {
            error_message: state.error_message,
            status: state.status,
            completed_at: state.completed_at
        });
    }

    /**
     * Increment retry count
     * @param {string} id - State ID
     * @param {string} errorMessage - Optional error message
     * @returns {Promise<WorkflowState|null>} Updated state or null if not found
     */
    async incrementRetry(id, errorMessage = null) {
        const state = await this.findById(id);
        if (!state) {
            return null;
        }

        state.incrementRetry(errorMessage);
        return await this.update(id, {
            retry_count: state.retry_count,
            error_message: state.error_message,
            status: state.status,
            completed_at: state.completed_at
        });
    }

    /**
     * Delete state
     * @param {string} id - State ID
     * @returns {Promise<boolean>} True if deleted, false if not found
     */
    async delete(id) {
        const query = 'DELETE FROM workflow_states WHERE id = $1';
        const result = await this.connection.query(query, [id]);
        return result.rowCount > 0;
    }

    /**
     * Delete all states for a workflow
     * @param {string} workflowId - Workflow ID
     * @returns {Promise<number>} Number of deleted states
     */
    async deleteByWorkflowId(workflowId) {
        const query = 'DELETE FROM workflow_states WHERE workflow_id = $1';
        const result = await this.connection.query(query, [workflowId]);
        return result.rowCount;
    }

    /**
     * Get workflow progress
     * @param {string} workflowId - Workflow ID
     * @returns {Promise<Object>} Workflow progress information
     */
    async getWorkflowProgress(workflowId) {
        const query = `
            SELECT 
                COUNT(*) as total_steps,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_steps,
                COUNT(CASE WHEN status = 'running' THEN 1 END) as running_steps,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_steps,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_steps,
                COUNT(CASE WHEN status = 'skipped' THEN 1 END) as skipped_steps,
                AVG(CASE WHEN completed_at IS NOT NULL 
                    THEN EXTRACT(EPOCH FROM (completed_at - started_at)) 
                    ELSE NULL END) as avg_step_duration_seconds,
                SUM(retry_count) as total_retries,
                MIN(started_at) as workflow_started_at,
                MAX(completed_at) as workflow_completed_at
            FROM workflow_states 
            WHERE workflow_id = $1
        `;

        const result = await this.connection.query(query, [workflowId]);
        const stats = result.rows[0];

        const totalSteps = parseInt(stats.total_steps);
        const completedSteps = parseInt(stats.completed_steps);
        const failedSteps = parseInt(stats.failed_steps);
        const skippedSteps = parseInt(stats.skipped_steps);

        return {
            ...stats,
            total_steps: totalSteps,
            pending_steps: parseInt(stats.pending_steps),
            running_steps: parseInt(stats.running_steps),
            completed_steps: completedSteps,
            failed_steps: failedSteps,
            skipped_steps: skippedSteps,
            total_retries: parseInt(stats.total_retries),
            progress_percentage: totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0,
            is_completed: totalSteps > 0 && (completedSteps + failedSteps + skippedSteps) === totalSteps,
            has_failures: failedSteps > 0
        };
    }

    /**
     * Get state statistics
     * @param {Object} filters - Optional filters
     * @returns {Promise<Object>} State statistics
     */
    async getStatistics(filters = {}) {
        let whereClause = 'WHERE 1=1';
        const values = [];
        let paramIndex = 1;

        if (filters.workflow_id) {
            whereClause += ` AND workflow_id = $${paramIndex}`;
            values.push(filters.workflow_id);
            paramIndex++;
        }

        if (filters.started_after) {
            whereClause += ` AND started_at >= $${paramIndex}`;
            values.push(filters.started_after);
            paramIndex++;
        }

        const query = `
            SELECT 
                COUNT(*) as total_states,
                COUNT(DISTINCT workflow_id) as unique_workflows,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_states,
                COUNT(CASE WHEN status = 'running' THEN 1 END) as running_states,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_states,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_states,
                COUNT(CASE WHEN status = 'skipped' THEN 1 END) as skipped_states,
                AVG(retry_count) as avg_retry_count,
                AVG(CASE WHEN completed_at IS NOT NULL 
                    THEN EXTRACT(EPOCH FROM (completed_at - started_at)) 
                    ELSE NULL END) as avg_execution_time_seconds,
                COUNT(CASE WHEN error_message IS NOT NULL THEN 1 END) as states_with_errors
            FROM workflow_states ${whereClause}
        `;

        const result = await this.connection.query(query, values);
        return result.rows[0];
    }

    /**
     * Get failed states with retry potential
     * @param {Object} options - Query options
     * @returns {Promise<WorkflowState[]>} Failed states that can be retried
     */
    async getRetryableFailedStates(options = {}) {
        const { maxRetries = 3, limit = 50, offset = 0 } = options;
        
        const query = `
            SELECT * FROM workflow_states 
            WHERE status = 'failed' 
                AND retry_count < $1
                AND started_at > NOW() - INTERVAL '24 hours'
            ORDER BY started_at DESC
            LIMIT $2 OFFSET $3
        `;

        const result = await this.connection.query(query, [maxRetries, limit, offset]);
        return result.rows.map(row => WorkflowState.fromDatabase(row));
    }

    /**
     * Get workflow execution timeline
     * @param {string} workflowId - Workflow ID
     * @returns {Promise<Object[]>} Execution timeline
     */
    async getWorkflowTimeline(workflowId) {
        const query = `
            SELECT 
                ws.*,
                t.title as task_title,
                t.status as task_status
            FROM workflow_states ws
            LEFT JOIN tasks t ON ws.task_id = t.id
            WHERE ws.workflow_id = $1
            ORDER BY ws.started_at ASC
        `;

        const result = await this.connection.query(query, [workflowId]);
        return result.rows.map(row => ({
            state: WorkflowState.fromDatabase(row),
            task_title: row.task_title,
            task_status: row.task_status
        }));
    }
}

export default StateRepository;

