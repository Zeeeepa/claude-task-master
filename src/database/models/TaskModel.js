/**
 * Task Model
 * Handles task-related database operations
 */

import { BaseModel } from './BaseModel.js';

export class TaskModel extends BaseModel {
    constructor() {
        super('tasks');
    }

    /**
     * Create a new task
     */
    async createTask(taskData) {
        const task = await this.create({
            workflow_id: taskData.workflow_id,
            name: taskData.name,
            description: taskData.description,
            type: taskData.type,
            status: taskData.status || 'pending',
            priority: taskData.priority || 0,
            command: taskData.command,
            parameters: JSON.stringify(taskData.parameters || {}),
            environment: JSON.stringify(taskData.environment || {}),
            working_directory: taskData.working_directory,
            depends_on: taskData.depends_on || [],
            execution_order: taskData.execution_order || 0,
            max_retries: taskData.max_retries || 3,
            estimated_duration_seconds: taskData.estimated_duration_seconds,
            timeout_seconds: taskData.timeout_seconds || 1800,
            tags: taskData.tags || [],
            metadata: JSON.stringify(taskData.metadata || {}),
            assigned_to: taskData.assigned_to,
            created_by: taskData.created_by
        });

        return task;
    }

    /**
     * Get tasks by workflow
     */
    async getByWorkflow(workflowId, options = {}) {
        return this.findBy({ workflow_id: workflowId }, {
            ...options,
            orderBy: 'execution_order',
            orderDirection: 'ASC'
        });
    }

    /**
     * Get tasks by status
     */
    async getByStatus(status, options = {}) {
        return this.findBy({ status }, options);
    }

    /**
     * Get tasks assigned to user
     */
    async getByAssignee(userId, options = {}) {
        return this.findBy({ assigned_to: userId }, options);
    }

    /**
     * Get pending tasks
     */
    async getPendingTasks(options = {}) {
        return this.findBy({ status: 'pending' }, options);
    }

    /**
     * Get runnable tasks (pending tasks with no unmet dependencies)
     */
    async getRunnableTasks(workflowId) {
        const query = `
            WITH completed_tasks AS (
                SELECT id FROM tasks 
                WHERE workflow_id = $1 AND status = 'completed'
            )
            SELECT t.*
            FROM tasks t
            WHERE t.workflow_id = $1
            AND t.status = 'pending'
            AND (
                t.depends_on = '{}' 
                OR t.depends_on <@ (SELECT array_agg(id) FROM completed_tasks)
            )
            ORDER BY t.priority DESC, t.execution_order ASC
        `;

        const result = await this.query(query, [workflowId]);
        return result.rows;
    }

    /**
     * Update task status
     */
    async updateStatus(id, status, additionalData = {}) {
        const updateData = { status, ...additionalData };
        
        // Set timestamps based on status
        if (status === 'running' && !additionalData.started_at) {
            updateData.started_at = new Date().toISOString();
        } else if (['completed', 'failed', 'cancelled', 'skipped'].includes(status) && !additionalData.completed_at) {
            updateData.completed_at = new Date().toISOString();
        }

        return this.updateById(id, updateData);
    }

    /**
     * Update task result
     */
    async updateResult(id, result, output = null, errorMessage = null, exitCode = null) {
        const updateData = {
            result: JSON.stringify(result),
            output,
            error_message: errorMessage,
            exit_code: exitCode,
            completed_at: new Date().toISOString()
        };

        // Determine status based on exit code
        if (exitCode !== null) {
            updateData.status = exitCode === 0 ? 'completed' : 'failed';
        }

        return this.updateById(id, updateData);
    }

    /**
     * Increment retry count
     */
    async incrementRetryCount(id) {
        const query = `
            UPDATE tasks 
            SET retry_count = retry_count + 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *
        `;

        const result = await this.query(query, [id]);
        return result.rows[0];
    }

    /**
     * Get task dependencies
     */
    async getDependencies(id) {
        const task = await this.findById(id);
        if (!task || !task.depends_on || task.depends_on.length === 0) {
            return [];
        }

        const query = `
            SELECT * FROM tasks 
            WHERE id = ANY($1)
            ORDER BY execution_order ASC
        `;

        const result = await this.query(query, [task.depends_on]);
        return result.rows;
    }

    /**
     * Get dependent tasks (tasks that depend on this task)
     */
    async getDependentTasks(id) {
        const query = `
            SELECT * FROM tasks 
            WHERE $1 = ANY(depends_on)
            ORDER BY execution_order ASC
        `;

        const result = await this.query(query, [id]);
        return result.rows;
    }

    /**
     * Check if task can be executed (all dependencies are completed)
     */
    async canExecute(id) {
        const task = await this.findById(id);
        if (!task) {
            return false;
        }

        if (!task.depends_on || task.depends_on.length === 0) {
            return task.status === 'pending';
        }

        const query = `
            SELECT COUNT(*) as total_deps,
                   COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_deps
            FROM tasks 
            WHERE id = ANY($1)
        `;

        const result = await this.query(query, [task.depends_on]);
        const { total_deps, completed_deps } = result.rows[0];

        return task.status === 'pending' && parseInt(total_deps) === parseInt(completed_deps);
    }

    /**
     * Get task execution history
     */
    async getExecutionHistory(id, options = {}) {
        const { limit = 10, offset = 0 } = options;
        
        const query = `
            SELECT te.*, we.execution_number as workflow_execution_number
            FROM task_executions te
            JOIN workflow_executions we ON te.workflow_execution_id = we.id
            WHERE te.task_id = $1
            ORDER BY te.created_at DESC
            LIMIT $2 OFFSET $3
        `;

        const result = await this.query(query, [id, limit, offset]);
        return result.rows;
    }

    /**
     * Get task statistics
     */
    async getStatistics(filters = {}) {
        let whereClause = '';
        const params = [];

        if (filters.workflow_id) {
            params.push(filters.workflow_id);
            whereClause += ` WHERE workflow_id = $${params.length}`;
        }

        if (filters.created_after) {
            params.push(filters.created_after);
            whereClause += whereClause ? ' AND' : ' WHERE';
            whereClause += ` created_at >= $${params.length}`;
        }

        const query = `
            SELECT 
                COUNT(*) as total_tasks,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_tasks,
                COUNT(CASE WHEN status = 'running' THEN 1 END) as running_tasks,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tasks,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_tasks,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_tasks,
                AVG(CASE 
                    WHEN completed_at IS NOT NULL AND started_at IS NOT NULL 
                    THEN EXTRACT(EPOCH FROM (completed_at - started_at))
                END) as avg_duration_seconds,
                AVG(retry_count) as avg_retry_count
            FROM tasks
            ${whereClause}
        `;

        const result = await this.query(query, params);
        return result.rows[0];
    }

    /**
     * Search tasks
     */
    async search(searchTerm, options = {}) {
        const { limit = 50, offset = 0, workflowId = null } = options;
        
        let query = `
            SELECT t.*, w.name as workflow_name
            FROM tasks t
            JOIN workflows w ON t.workflow_id = w.id
            WHERE 
                t.name ILIKE $1 
                OR t.description ILIKE $1
                OR t.tags && ARRAY[$2]
        `;

        const params = [`%${searchTerm}%`, searchTerm];

        if (workflowId) {
            params.push(workflowId);
            query += ` AND t.workflow_id = $${params.length}`;
        }

        query += ` ORDER BY t.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await this.query(query, params);
        return result.rows;
    }

    /**
     * Get tasks by priority
     */
    async getByPriority(minPriority = 0, options = {}) {
        const query = `
            SELECT t.*, w.name as workflow_name
            FROM tasks t
            JOIN workflows w ON t.workflow_id = w.id
            WHERE t.priority >= $1
            ORDER BY t.priority DESC, t.created_at DESC
            LIMIT $2 OFFSET $3
        `;

        const { limit = 50, offset = 0 } = options;
        const result = await this.query(query, [minPriority, limit, offset]);
        return result.rows;
    }

    /**
     * Get overdue tasks
     */
    async getOverdueTasks() {
        const query = `
            SELECT t.*, w.name as workflow_name
            FROM tasks t
            JOIN workflows w ON t.workflow_id = w.id
            WHERE t.status = 'running'
            AND t.started_at IS NOT NULL
            AND t.started_at + INTERVAL '1 second' * t.timeout_seconds < CURRENT_TIMESTAMP
            ORDER BY t.started_at ASC
        `;

        const result = await this.query(query);
        return result.rows;
    }

    /**
     * Clone tasks from one workflow to another
     */
    async cloneTasks(sourceWorkflowId, targetWorkflowId, createdBy) {
        const sourceTasks = await this.getByWorkflow(sourceWorkflowId);
        const clonedTasks = [];

        for (const task of sourceTasks) {
            const clonedTask = await this.create({
                workflow_id: targetWorkflowId,
                name: task.name,
                description: task.description,
                type: task.type,
                status: 'pending',
                priority: task.priority,
                command: task.command,
                parameters: task.parameters,
                environment: task.environment,
                working_directory: task.working_directory,
                depends_on: task.depends_on,
                execution_order: task.execution_order,
                max_retries: task.max_retries,
                estimated_duration_seconds: task.estimated_duration_seconds,
                timeout_seconds: task.timeout_seconds,
                tags: task.tags,
                metadata: task.metadata,
                created_by: createdBy
            });

            clonedTasks.push(clonedTask);
        }

        return clonedTasks;
    }
}

