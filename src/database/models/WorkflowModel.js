/**
 * @fileoverview Workflow Model - Database operations for workflows and executions
 * @description Comprehensive model for workflow management with CRUD operations
 * @version 1.0.0
 */

import { getConnection } from '../connection/connection_manager.js';

/**
 * Workflow Model class for database operations
 */
export class WorkflowModel {
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
            description,
            github_repo_url,
            requirements_text,
            status = 'draft',
            linear_issue_id,
            version = '1.0.0',
            trigger_type = 'manual',
            schedule_cron,
            timeout_minutes = 60,
            max_retries = 3,
            configuration = {},
            environment_variables = {},
            metadata = {},
            tags = [],
            created_by,
            owner,
            permissions = {}
        } = workflowData;

        const query = `
            INSERT INTO workflows (
                name, description, github_repo_url, requirements_text, status,
                linear_issue_id, version, trigger_type, schedule_cron,
                timeout_minutes, max_retries, configuration, environment_variables,
                metadata, tags, created_by, owner, permissions
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            RETURNING *
        `;

        const values = [
            name, description, github_repo_url, requirements_text, status,
            linear_issue_id, version, trigger_type, schedule_cron,
            timeout_minutes, max_retries, JSON.stringify(configuration),
            JSON.stringify(environment_variables), JSON.stringify(metadata),
            JSON.stringify(tags), created_by, owner, JSON.stringify(permissions)
        ];

        const result = await this.db.query(query, values);
        return result.rows[0];
    }

    /**
     * Find workflow by ID
     * @param {string} id - Workflow ID
     * @returns {Promise<Object|null>} Workflow or null if not found
     */
    async findById(id) {
        const query = `
            SELECT 
                w.*,
                COUNT(t.id) as task_count,
                COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks,
                COUNT(we.id) as execution_count,
                MAX(we.started_at) as last_execution_time
            FROM workflows w
            LEFT JOIN tasks t ON w.id = t.workflow_id
            LEFT JOIN workflow_executions we ON w.id = we.workflow_id
            WHERE w.id = $1
            GROUP BY w.id
        `;
        
        const result = await this.db.query(query, [id]);
        return result.rows[0] || null;
    }

    /**
     * Find workflows with filters and pagination
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Workflows with pagination info
     */
    async findMany(options = {}) {
        const {
            status,
            trigger_type,
            owner,
            created_by,
            tags,
            limit = 50,
            offset = 0,
            orderBy = 'created_at',
            orderDirection = 'DESC'
        } = options;

        let whereConditions = [];
        let values = [];
        let paramCount = 0;

        // Build WHERE conditions dynamically
        if (status) {
            paramCount++;
            whereConditions.push(`w.status = $${paramCount}`);
            values.push(status);
        }

        if (trigger_type) {
            paramCount++;
            whereConditions.push(`w.trigger_type = $${paramCount}`);
            values.push(trigger_type);
        }

        if (owner) {
            paramCount++;
            whereConditions.push(`w.owner = $${paramCount}`);
            values.push(owner);
        }

        if (created_by) {
            paramCount++;
            whereConditions.push(`w.created_by = $${paramCount}`);
            values.push(created_by);
        }

        if (tags && tags.length > 0) {
            paramCount++;
            whereConditions.push(`w.tags @> $${paramCount}`);
            values.push(JSON.stringify(tags));
        }

        const whereClause = whereConditions.length > 0 
            ? `WHERE ${whereConditions.join(' AND ')}`
            : '';

        // Count query for pagination
        const countQuery = `
            SELECT COUNT(*) as total
            FROM workflows w
            ${whereClause}
        `;

        // Main query
        const query = `
            SELECT 
                w.*,
                COUNT(t.id) as task_count,
                COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks,
                COUNT(we.id) as execution_count,
                MAX(we.started_at) as last_execution_time
            FROM workflows w
            LEFT JOIN tasks t ON w.id = t.workflow_id
            LEFT JOIN workflow_executions we ON w.id = we.workflow_id
            ${whereClause}
            GROUP BY w.id
            ORDER BY w.${orderBy} ${orderDirection}
            LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
        `;

        values.push(limit, offset);

        const [countResult, workflowsResult] = await Promise.all([
            this.db.query(countQuery, values.slice(0, -2)),
            this.db.query(query, values)
        ]);

        const total = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(total / limit);
        const currentPage = Math.floor(offset / limit) + 1;

        return {
            data: workflowsResult.rows,
            pagination: {
                total,
                totalPages,
                currentPage,
                limit,
                offset,
                hasNext: currentPage < totalPages,
                hasPrev: currentPage > 1
            }
        };
    }

    /**
     * Update workflow by ID
     * @param {string} id - Workflow ID
     * @param {Object} updateData - Data to update
     * @returns {Promise<Object|null>} Updated workflow or null if not found
     */
    async update(id, updateData) {
        const allowedFields = [
            'name', 'description', 'github_repo_url', 'requirements_text', 'status',
            'linear_issue_id', 'version', 'trigger_type', 'schedule_cron',
            'timeout_minutes', 'max_retries', 'configuration', 'environment_variables',
            'metadata', 'tags', 'owner', 'permissions'
        ];

        const updateFields = [];
        const values = [];
        let paramCount = 0;

        // Build SET clause dynamically
        for (const [key, value] of Object.entries(updateData)) {
            if (allowedFields.includes(key) && value !== undefined) {
                paramCount++;
                updateFields.push(`${key} = $${paramCount}`);
                
                // Handle JSONB fields
                if (['configuration', 'environment_variables', 'metadata', 'tags', 'permissions'].includes(key)) {
                    values.push(JSON.stringify(value));
                } else {
                    values.push(value);
                }
            }
        }

        if (updateFields.length === 0) {
            throw new Error('No valid fields to update');
        }

        paramCount++;
        values.push(id);

        const query = `
            UPDATE workflows 
            SET ${updateFields.join(', ')}, updated_at = NOW()
            WHERE id = $${paramCount}
            RETURNING *
        `;

        const result = await this.db.query(query, values);
        return result.rows[0] || null;
    }

    /**
     * Delete workflow by ID
     * @param {string} id - Workflow ID
     * @returns {Promise<boolean>} True if deleted, false if not found
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
     * @returns {Promise<Object>} Created workflow execution
     */
    async startExecution(workflowId, executionData = {}) {
        const {
            trigger_type = 'manual',
            triggered_by,
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
     * @returns {Promise<Object>} Updated workflow execution
     */
    async completeExecution(executionId, completionData = {}) {
        const {
            status = 'completed',
            result_data = {},
            error_details = {},
            logs,
            total_tasks = 0,
            completed_tasks = 0,
            failed_tasks = 0,
            memory_usage_mb,
            cpu_time_ms,
            metadata = {}
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
                cpu_time_ms = $9,
                metadata = $10
            WHERE id = $11
            RETURNING *
        `;

        const values = [
            status, JSON.stringify(result_data), JSON.stringify(error_details),
            logs, total_tasks, completed_tasks, failed_tasks,
            memory_usage_mb, cpu_time_ms, JSON.stringify(metadata), executionId
        ];

        const result = await this.db.query(query, values);
        return result.rows[0] || null;
    }

    /**
     * Get workflow execution history
     * @param {string} workflowId - Workflow ID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Workflow executions
     */
    async getExecutionHistory(workflowId, options = {}) {
        const { limit = 50, offset = 0 } = options;

        const query = `
            SELECT 
                we.*,
                EXTRACT(EPOCH FROM we.duration) as duration_seconds
            FROM workflow_executions we
            WHERE we.workflow_id = $1
            ORDER BY we.started_at DESC
            LIMIT $2 OFFSET $3
        `;

        const result = await this.db.query(query, [workflowId, limit, offset]);
        return result.rows;
    }

    /**
     * Get active workflows (currently executing)
     * @returns {Promise<Array>} Active workflows
     */
    async getActiveWorkflows() {
        const query = `
            SELECT DISTINCT
                w.*,
                we.id as execution_id,
                we.started_at as execution_started,
                we.trigger_type,
                we.triggered_by
            FROM workflows w
            JOIN workflow_executions we ON w.id = we.workflow_id
            WHERE we.status = 'active'
            ORDER BY we.started_at DESC
        `;

        const result = await this.db.query(query);
        return result.rows;
    }

    /**
     * Search workflows by text
     * @param {string} searchText - Text to search for
     * @param {Object} options - Search options
     * @returns {Promise<Array>} Matching workflows
     */
    async search(searchText, options = {}) {
        const { limit = 50, offset = 0 } = options;

        const query = `
            SELECT 
                w.*,
                ts_rank(
                    to_tsvector('english', w.name || ' ' || COALESCE(w.description, '') || ' ' || COALESCE(w.requirements_text, '')),
                    plainto_tsquery('english', $1)
                ) as rank
            FROM workflows w
            WHERE to_tsvector('english', w.name || ' ' || COALESCE(w.description, '') || ' ' || COALESCE(w.requirements_text, ''))
                  @@ plainto_tsquery('english', $1)
            ORDER BY rank DESC, w.created_at DESC
            LIMIT $2 OFFSET $3
        `;

        const result = await this.db.query(query, [searchText, limit, offset]);
        return result.rows;
    }

    /**
     * Get workflow statistics
     * @param {string} workflowId - Optional workflow ID filter
     * @returns {Promise<Object>} Workflow statistics
     */
    async getStatistics(workflowId = null) {
        let query = `
            SELECT 
                COUNT(DISTINCT w.id) as total_workflows,
                COUNT(DISTINCT CASE WHEN w.status = 'active' THEN w.id END) as active_workflows,
                COUNT(DISTINCT CASE WHEN w.status = 'draft' THEN w.id END) as draft_workflows,
                COUNT(DISTINCT CASE WHEN w.status = 'completed' THEN w.id END) as completed_workflows,
                COUNT(DISTINCT CASE WHEN w.status = 'failed' THEN w.id END) as failed_workflows,
                COUNT(we.id) as total_executions,
                COUNT(CASE WHEN we.status = 'completed' THEN 1 END) as successful_executions,
                COUNT(CASE WHEN we.status = 'failed' THEN 1 END) as failed_executions,
                AVG(EXTRACT(EPOCH FROM we.duration)) as avg_execution_duration_seconds,
                AVG(we.total_tasks) as avg_tasks_per_execution
            FROM workflows w
            LEFT JOIN workflow_executions we ON w.id = we.workflow_id
        `;

        const values = [];
        if (workflowId) {
            query += ' WHERE w.id = $1';
            values.push(workflowId);
        }

        const result = await this.db.query(query, values);
        return result.rows[0];
    }

    /**
     * Get workflow performance metrics
     * @param {string} workflowId - Workflow ID
     * @param {number} days - Number of days to analyze (default: 30)
     * @returns {Promise<Object>} Performance metrics
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
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM we.duration)) as median_duration_seconds,
                AVG(we.total_tasks) as avg_tasks_per_execution,
                AVG(we.memory_usage_mb) as avg_memory_usage_mb,
                AVG(we.cpu_time_ms) as avg_cpu_time_ms
            FROM workflows w
            LEFT JOIN workflow_executions we ON w.id = we.workflow_id 
                AND we.started_at >= NOW() - INTERVAL '$2 days'
                AND we.status = 'completed'
            WHERE w.id = $1
            GROUP BY w.id, w.name, w.execution_count, w.success_count, w.failure_count
        `;

        const result = await this.db.query(query, [workflowId, days]);
        return result.rows[0] || null;
    }
}

/**
 * Workflow Step Model class for database operations
 */
export class WorkflowStepModel {
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
            description,
            step_type,
            order_index,
            configuration = {},
            input_schema = {},
            output_schema = {},
            condition_expression,
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
     * @returns {Promise<Array>} Workflow steps
     */
    async findByWorkflowId(workflowId) {
        const query = `
            SELECT * FROM workflow_steps 
            WHERE workflow_id = $1 
            ORDER BY order_index, created_at
        `;
        
        const result = await this.db.query(query, [workflowId]);
        return result.rows;
    }

    /**
     * Update workflow step by ID
     * @param {string} id - Step ID
     * @param {Object} updateData - Data to update
     * @returns {Promise<Object|null>} Updated step or null if not found
     */
    async update(id, updateData) {
        const allowedFields = [
            'name', 'description', 'step_type', 'order_index', 'configuration',
            'input_schema', 'output_schema', 'condition_expression', 'depends_on_steps',
            'on_failure', 'retry_count', 'timeout_minutes', 'is_active'
        ];

        const updateFields = [];
        const values = [];
        let paramCount = 0;

        for (const [key, value] of Object.entries(updateData)) {
            if (allowedFields.includes(key) && value !== undefined) {
                paramCount++;
                updateFields.push(`${key} = $${paramCount}`);
                
                if (['configuration', 'input_schema', 'output_schema', 'depends_on_steps'].includes(key)) {
                    values.push(JSON.stringify(value));
                } else {
                    values.push(value);
                }
            }
        }

        if (updateFields.length === 0) {
            throw new Error('No valid fields to update');
        }

        paramCount++;
        values.push(id);

        const query = `
            UPDATE workflow_steps 
            SET ${updateFields.join(', ')}, updated_at = NOW()
            WHERE id = $${paramCount}
            RETURNING *
        `;

        const result = await this.db.query(query, values);
        return result.rows[0] || null;
    }

    /**
     * Delete workflow step by ID
     * @param {string} id - Step ID
     * @returns {Promise<boolean>} True if deleted, false if not found
     */
    async delete(id) {
        const query = 'DELETE FROM workflow_steps WHERE id = $1';
        const result = await this.db.query(query, [id]);
        return result.rowCount > 0;
    }

    /**
     * Reorder workflow steps
     * @param {string} workflowId - Workflow ID
     * @param {Array} stepIds - Array of step IDs in new order
     * @returns {Promise<Array>} Updated steps
     */
    async reorder(workflowId, stepIds) {
        const client = await this.db.getClient();
        
        try {
            await client.query('BEGIN');

            const updatePromises = stepIds.map((stepId, index) => {
                return client.query(
                    'UPDATE workflow_steps SET order_index = $1, updated_at = NOW() WHERE id = $2 AND workflow_id = $3',
                    [index, stepId, workflowId]
                );
            });

            await Promise.all(updatePromises);
            await client.query('COMMIT');

            // Return updated steps
            const result = await client.query(
                'SELECT * FROM workflow_steps WHERE workflow_id = $1 ORDER BY order_index',
                [workflowId]
            );

            return result.rows;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}

// Export singleton instances
export const workflowModel = new WorkflowModel();
export const workflowStepModel = new WorkflowStepModel();

export default { WorkflowModel, WorkflowStepModel, workflowModel, workflowStepModel };

