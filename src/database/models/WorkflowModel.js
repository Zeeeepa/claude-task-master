/**
 * @fileoverview Workflow and WorkflowStep ORM Models
 * @description Comprehensive models for workflow orchestration and execution tracking
 * @version 1.0.0
 */

import { getConnection } from '../connection/connection_manager.js';

/**
 * WorkflowModel class for managing workflows and executions
 */
class WorkflowModel {
    constructor() {
        this.db = getConnection();
    }

    /**
     * Create a new workflow
     * @param {Object} workflowData - Workflow data
     * @returns {Promise<Object>} Created workflow
     */
    async create(workflowData) {
        const {
            name,
            description = null,
            github_repo_url = null,
            requirements_text = null,
            status = 'draft',
            linear_issue_id = null,
            version = '1.0.0',
            trigger_type = 'manual',
            schedule_cron = null,
            timeout_minutes = 60,
            max_retries = 3,
            configuration = {},
            environment_variables = {},
            metadata = {},
            tags = [],
            created_by = null,
            owner = null,
            permissions = {}
        } = workflowData;

        const query = `
            INSERT INTO workflows (
                name, description, github_repo_url, requirements_text, status,
                linear_issue_id, version, trigger_type, schedule_cron, timeout_minutes,
                max_retries, configuration, environment_variables, metadata, tags,
                created_by, owner, permissions
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            RETURNING *
        `;

        const values = [
            name, description, github_repo_url, requirements_text, status,
            linear_issue_id, version, trigger_type, schedule_cron, timeout_minutes,
            max_retries, JSON.stringify(configuration), JSON.stringify(environment_variables),
            JSON.stringify(metadata), JSON.stringify(tags), created_by, owner, JSON.stringify(permissions)
        ];

        const result = await this.db.query(query, values);
        return result.rows[0];
    }

    /**
     * Find workflow by ID with statistics
     * @param {string} id - Workflow ID
     * @returns {Promise<Object|null>} Workflow with statistics
     */
    async findById(id) {
        const query = `
            SELECT 
                w.*,
                COUNT(DISTINCT t.id) as task_count,
                COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) as completed_tasks,
                COUNT(DISTINCT CASE WHEN t.status = 'pending' THEN t.id END) as pending_tasks,
                COUNT(DISTINCT CASE WHEN t.status = 'in_progress' THEN t.id END) as in_progress_tasks,
                COUNT(DISTINCT we.id) as total_executions,
                COUNT(DISTINCT ws.id) as step_count
            FROM workflows w
            LEFT JOIN tasks t ON w.id = t.workflow_id
            LEFT JOIN workflow_executions we ON w.id = we.workflow_id
            LEFT JOIN workflow_steps ws ON w.id = ws.workflow_id
            WHERE w.id = $1
            GROUP BY w.id
        `;

        const result = await this.db.query(query, [id]);
        return result.rows[0] || null;
    }

    /**
     * Find workflows with filters and pagination
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Paginated results
     */
    async findMany(options = {}) {
        const {
            status = null,
            owner = null,
            trigger_type = null,
            tags = null,
            limit = 20,
            offset = 0,
            sort_by = 'created_at',
            sort_order = 'DESC'
        } = options;

        let whereConditions = [];
        let values = [];
        let paramCount = 0;

        if (status) {
            whereConditions.push(`w.status = $${++paramCount}`);
            values.push(status);
        }

        if (owner) {
            whereConditions.push(`w.owner = $${++paramCount}`);
            values.push(owner);
        }

        if (trigger_type) {
            whereConditions.push(`w.trigger_type = $${++paramCount}`);
            values.push(trigger_type);
        }

        if (tags && tags.length > 0) {
            whereConditions.push(`w.tags ?| $${++paramCount}`);
            values.push(tags);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Count query
        const countQuery = `
            SELECT COUNT(*) as total
            FROM workflows w
            ${whereClause}
        `;

        // Data query
        const dataQuery = `
            SELECT 
                w.*,
                COUNT(DISTINCT t.id) as task_count,
                COUNT(DISTINCT we.id) as execution_count
            FROM workflows w
            LEFT JOIN tasks t ON w.id = t.workflow_id
            LEFT JOIN workflow_executions we ON w.id = we.workflow_id
            ${whereClause}
            GROUP BY w.id
            ORDER BY w.${sort_by} ${sort_order}
            LIMIT $${++paramCount} OFFSET $${++paramCount}
        `;

        values.push(limit, offset);

        const [countResult, dataResult] = await Promise.all([
            this.db.query(countQuery, values.slice(0, -2)),
            this.db.query(dataQuery, values)
        ]);

        const total = parseInt(countResult.rows[0].total);

        return {
            data: dataResult.rows,
            pagination: {
                total,
                limit,
                offset,
                pages: Math.ceil(total / limit),
                current_page: Math.floor(offset / limit) + 1
            }
        };
    }

    /**
     * Update workflow
     * @param {string} id - Workflow ID
     * @param {Object} updateData - Update data
     * @returns {Promise<Object|null>} Updated workflow
     */
    async update(id, updateData) {
        const allowedFields = [
            'name', 'description', 'github_repo_url', 'requirements_text', 'status',
            'linear_issue_id', 'version', 'trigger_type', 'schedule_cron', 'timeout_minutes',
            'max_retries', 'configuration', 'environment_variables', 'metadata', 'tags',
            'owner', 'permissions'
        ];

        const updates = [];
        const values = [];
        let paramCount = 0;

        for (const [key, value] of Object.entries(updateData)) {
            if (allowedFields.includes(key)) {
                updates.push(`${key} = $${++paramCount}`);
                if (['configuration', 'environment_variables', 'metadata', 'tags', 'permissions'].includes(key)) {
                    values.push(JSON.stringify(value));
                } else {
                    values.push(value);
                }
            }
        }

        if (updates.length === 0) {
            throw new Error('No valid fields to update');
        }

        const query = `
            UPDATE workflows 
            SET ${updates.join(', ')}
            WHERE id = $${++paramCount}
            RETURNING *
        `;

        values.push(id);

        const result = await this.db.query(query, values);
        return result.rows[0] || null;
    }

    /**
     * Delete workflow
     * @param {string} id - Workflow ID
     * @returns {Promise<boolean>} Success status
     */
    async delete(id) {
        const query = 'DELETE FROM workflows WHERE id = $1';
        const result = await this.db.query(query, [id]);
        return result.rowCount > 0;
    }

    /**
     * Start workflow execution
     * @param {string} workflowId - Workflow ID
     * @param {Object} executionData - Execution data
     * @returns {Promise<Object>} Created execution
     */
    async startExecution(workflowId, executionData = {}) {
        const {
            trigger_type = 'manual',
            triggered_by = null,
            trigger_data = {},
            metadata = {}
        } = executionData;

        const query = `
            INSERT INTO workflow_executions (
                workflow_id, trigger_type, triggered_by, trigger_data, metadata
            ) VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;

        const values = [
            workflowId, trigger_type, triggered_by,
            JSON.stringify(trigger_data), JSON.stringify(metadata)
        ];

        const result = await this.db.query(query, values);
        return result.rows[0];
    }

    /**
     * Complete workflow execution
     * @param {string} executionId - Execution ID
     * @param {Object} completionData - Completion data
     * @returns {Promise<Object|null>} Updated execution
     */
    async completeExecution(executionId, completionData) {
        const {
            status,
            result_data = {},
            error_details = {},
            logs = null,
            total_tasks = 0,
            completed_tasks = 0,
            failed_tasks = 0,
            memory_usage_mb = null,
            cpu_time_ms = null
        } = completionData;

        const query = `
            UPDATE workflow_executions 
            SET 
                status = $1,
                completed_at = NOW(),
                result_data = $2,
                error_details = $3,
                logs = $4,
                total_tasks = $5,
                completed_tasks = $6,
                failed_tasks = $7,
                memory_usage_mb = $8,
                cpu_time_ms = $9
            WHERE id = $10
            RETURNING *
        `;

        const values = [
            status, JSON.stringify(result_data), JSON.stringify(error_details),
            logs, total_tasks, completed_tasks, failed_tasks,
            memory_usage_mb, cpu_time_ms, executionId
        ];

        const result = await this.db.query(query, values);
        return result.rows[0] || null;
    }

    /**
     * Get workflow execution history
     * @param {string} workflowId - Workflow ID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Execution history
     */
    async getExecutionHistory(workflowId, options = {}) {
        const { limit = 50, offset = 0 } = options;

        const query = `
            SELECT 
                we.*,
                COUNT(wse.id) as step_executions,
                COUNT(CASE WHEN wse.status = 'completed' THEN 1 END) as completed_steps,
                COUNT(CASE WHEN wse.status = 'failed' THEN 1 END) as failed_steps
            FROM workflow_executions we
            LEFT JOIN workflow_step_executions wse ON we.id = wse.workflow_execution_id
            WHERE we.workflow_id = $1
            GROUP BY we.id
            ORDER BY we.started_at DESC
            LIMIT $2 OFFSET $3
        `;

        const result = await this.db.query(query, [workflowId, limit, offset]);
        return result.rows;
    }

    /**
     * Get active workflows
     * @returns {Promise<Array>} Active workflows
     */
    async getActiveWorkflows() {
        const query = `
            SELECT * FROM active_workflows
            ORDER BY last_execution_time DESC NULLS LAST, created_at DESC
        `;

        const result = await this.db.query(query);
        return result.rows;
    }

    /**
     * Search workflows by text
     * @param {string} searchText - Search text
     * @param {Object} options - Search options
     * @returns {Promise<Array>} Search results
     */
    async search(searchText, options = {}) {
        const { limit = 20 } = options;

        const query = `
            SELECT 
                w.*,
                ts_rank(
                    to_tsvector('english', w.name || ' ' || COALESCE(w.description, '') || ' ' || COALESCE(w.requirements_text, '')),
                    plainto_tsquery('english', $1)
                ) as rank,
                COUNT(DISTINCT t.id) as task_count
            FROM workflows w
            LEFT JOIN tasks t ON w.id = t.workflow_id
            WHERE to_tsvector('english', w.name || ' ' || COALESCE(w.description, '') || ' ' || COALESCE(w.requirements_text, '')) 
                  @@ plainto_tsquery('english', $1)
            GROUP BY w.id
            ORDER BY rank DESC, w.created_at DESC
            LIMIT $2
        `;

        const result = await this.db.query(query, [searchText, limit]);
        return result.rows;
    }

    /**
     * Get workflow statistics
     * @param {string|null} workflowId - Optional workflow filter
     * @returns {Promise<Object>} Workflow statistics
     */
    async getStatistics(workflowId = null) {
        let query = `
            SELECT 
                COUNT(*) as total_workflows,
                COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_workflows,
                COUNT(CASE WHEN status = 'active' THEN 1 END) as active_workflows,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_workflows,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_workflows,
                SUM(execution_count) as total_executions,
                SUM(success_count) as total_successes,
                SUM(failure_count) as total_failures,
                AVG(CASE WHEN execution_count > 0 THEN (success_count::DECIMAL / execution_count) * 100 END) as avg_success_rate
            FROM workflows
        `;

        const values = [];
        if (workflowId) {
            query += ` WHERE id = $1`;
            values.push(workflowId);
        }

        const result = await this.db.query(query, values);
        return result.rows[0];
    }

    /**
     * Get workflow performance metrics
     * @param {string} workflowId - Workflow ID
     * @param {number} days - Number of days to analyze
     * @returns {Promise<Object|null>} Performance metrics
     */
    async getPerformanceMetrics(workflowId, days = 30) {
        const query = `
            SELECT 
                w.name,
                w.execution_count,
                w.success_count,
                w.failure_count,
                CASE 
                    WHEN w.execution_count = 0 THEN 0
                    ELSE ROUND((w.success_count::DECIMAL / w.execution_count) * 100, 2)
                END as success_rate,
                COUNT(we.id) as recent_executions,
                AVG(EXTRACT(EPOCH FROM we.duration)) as avg_duration_seconds,
                MIN(EXTRACT(EPOCH FROM we.duration)) as min_duration_seconds,
                MAX(EXTRACT(EPOCH FROM we.duration)) as max_duration_seconds,
                AVG(we.total_tasks) as avg_tasks_per_execution,
                AVG(we.memory_usage_mb) as avg_memory_usage_mb,
                AVG(we.cpu_time_ms) as avg_cpu_time_ms
            FROM workflows w
            LEFT JOIN workflow_executions we ON w.id = we.workflow_id 
                AND we.started_at >= NOW() - INTERVAL '${days} days'
                AND we.status = 'completed'
            WHERE w.id = $1
            GROUP BY w.id, w.name, w.execution_count, w.success_count, w.failure_count
        `;

        const result = await this.db.query(query, [workflowId]);
        return result.rows[0] || null;
    }
}

/**
 * WorkflowStepModel class for managing workflow steps
 */
class WorkflowStepModel {
    constructor() {
        this.db = getConnection();
    }

    /**
     * Create a new workflow step
     * @param {Object} stepData - Step data
     * @returns {Promise<Object>} Created step
     */
    async create(stepData) {
        const {
            workflow_id,
            name,
            description = null,
            step_type,
            order_index,
            configuration = {},
            input_schema = {},
            output_schema = {},
            condition_expression = null,
            depends_on_steps = [],
            on_failure = 'stop',
            retry_count = 0,
            timeout_minutes = 30,
            is_active = true
        } = stepData;

        const query = `
            INSERT INTO workflow_steps (
                workflow_id, name, description, step_type, order_index,
                configuration, input_schema, output_schema, condition_expression,
                depends_on_steps, on_failure, retry_count, timeout_minutes, is_active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *
        `;

        const values = [
            workflow_id, name, description, step_type, order_index,
            JSON.stringify(configuration), JSON.stringify(input_schema),
            JSON.stringify(output_schema), condition_expression,
            JSON.stringify(depends_on_steps), on_failure, retry_count,
            timeout_minutes, is_active
        ];

        const result = await this.db.query(query, values);
        return result.rows[0];
    }

    /**
     * Find steps by workflow ID
     * @param {string} workflowId - Workflow ID
     * @returns {Promise<Array>} Workflow steps ordered by order_index
     */
    async findByWorkflowId(workflowId) {
        const query = `
            SELECT * FROM workflow_steps 
            WHERE workflow_id = $1 
            ORDER BY order_index ASC, created_at ASC
        `;

        const result = await this.db.query(query, [workflowId]);
        return result.rows;
    }

    /**
     * Update workflow step
     * @param {string} id - Step ID
     * @param {Object} updateData - Update data
     * @returns {Promise<Object|null>} Updated step
     */
    async update(id, updateData) {
        const allowedFields = [
            'name', 'description', 'step_type', 'order_index', 'configuration',
            'input_schema', 'output_schema', 'condition_expression', 'depends_on_steps',
            'on_failure', 'retry_count', 'timeout_minutes', 'is_active'
        ];

        const updates = [];
        const values = [];
        let paramCount = 0;

        for (const [key, value] of Object.entries(updateData)) {
            if (allowedFields.includes(key)) {
                updates.push(`${key} = $${++paramCount}`);
                if (['configuration', 'input_schema', 'output_schema', 'depends_on_steps'].includes(key)) {
                    values.push(JSON.stringify(value));
                } else {
                    values.push(value);
                }
            }
        }

        if (updates.length === 0) {
            throw new Error('No valid fields to update');
        }

        const query = `
            UPDATE workflow_steps 
            SET ${updates.join(', ')}
            WHERE id = $${++paramCount}
            RETURNING *
        `;

        values.push(id);

        const result = await this.db.query(query, values);
        return result.rows[0] || null;
    }

    /**
     * Delete workflow step
     * @param {string} id - Step ID
     * @returns {Promise<boolean>} Success status
     */
    async delete(id) {
        const query = 'DELETE FROM workflow_steps WHERE id = $1';
        const result = await this.db.query(query, [id]);
        return result.rowCount > 0;
    }

    /**
     * Get step execution history
     * @param {string} stepId - Step ID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Step execution history
     */
    async getExecutionHistory(stepId, options = {}) {
        const { limit = 50, offset = 0 } = options;

        const query = `
            SELECT 
                wse.*,
                we.workflow_id,
                we.triggered_by,
                we.started_at as workflow_started_at
            FROM workflow_step_executions wse
            JOIN workflow_executions we ON wse.workflow_execution_id = we.id
            WHERE wse.workflow_step_id = $1
            ORDER BY wse.started_at DESC
            LIMIT $2 OFFSET $3
        `;

        const result = await this.db.query(query, [stepId, limit, offset]);
        return result.rows;
    }
}

// Create and export model instances
const workflowModel = new WorkflowModel();
const workflowStepModel = new WorkflowStepModel();

export { workflowModel, workflowStepModel, WorkflowModel, WorkflowStepModel };

