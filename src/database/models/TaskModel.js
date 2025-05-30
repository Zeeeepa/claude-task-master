/**
 * @fileoverview Task and Subtask ORM Models
 * @description Comprehensive models for task management with hierarchical support
 * @version 1.0.0
 */

import { getConnection } from '../connection/connection_manager.js';

/**
 * TaskModel class for managing tasks with hierarchical support
 */
class TaskModel {
    constructor() {
        this.db = getConnection();
    }

    /**
     * Create a new task
     * @param {Object} taskData - Task data
     * @returns {Promise<Object>} Created task
     */
    async create(taskData) {
        const {
            title,
            description,
            workflow_id,
            parent_task_id = null,
            priority = 5,
            complexity_score = 50,
            assigned_to = null,
            created_by = null,
            estimated_hours = null,
            due_date = null,
            tags = [],
            requirements = {},
            context = {},
            metadata = {}
        } = taskData;

        const query = `
            INSERT INTO tasks (
                title, description, workflow_id, parent_task_id, priority, 
                complexity_score, assigned_to, created_by, estimated_hours, 
                due_date, tags, requirements, context, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *
        `;

        const values = [
            title, description, workflow_id, parent_task_id, priority,
            complexity_score, assigned_to, created_by, estimated_hours,
            due_date, JSON.stringify(tags), JSON.stringify(requirements),
            JSON.stringify(context), JSON.stringify(metadata)
        ];

        const result = await this.db.query(query, values);
        return result.rows[0];
    }

    /**
     * Find task by ID with workflow information
     * @param {string} id - Task ID
     * @returns {Promise<Object|null>} Task with workflow info
     */
    async findById(id) {
        const query = `
            SELECT 
                t.*,
                w.name as workflow_name,
                w.status as workflow_status,
                COUNT(st.id) as subtask_count,
                COUNT(CASE WHEN st.status = 'completed' THEN 1 END) as completed_subtasks,
                COUNT(td.id) as dependency_count,
                COUNT(CASE WHEN td.status = 'satisfied' THEN 1 END) as satisfied_dependencies
            FROM tasks t
            LEFT JOIN workflows w ON t.workflow_id = w.id
            LEFT JOIN subtasks st ON t.id = st.parent_task_id
            LEFT JOIN task_dependencies td ON t.id = td.task_id
            WHERE t.id = $1
            GROUP BY t.id, w.name, w.status
        `;

        const result = await this.db.query(query, [id]);
        return result.rows[0] || null;
    }

    /**
     * Find tasks with filters and pagination
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Paginated results
     */
    async findMany(options = {}) {
        const {
            status = null,
            workflow_id = null,
            assigned_to = null,
            priority_min = null,
            priority_max = null,
            parent_task_id = null,
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
            whereConditions.push(`t.status = $${++paramCount}`);
            values.push(status);
        }

        if (workflow_id) {
            whereConditions.push(`t.workflow_id = $${++paramCount}`);
            values.push(workflow_id);
        }

        if (assigned_to) {
            whereConditions.push(`t.assigned_to = $${++paramCount}`);
            values.push(assigned_to);
        }

        if (priority_min !== null) {
            whereConditions.push(`t.priority >= $${++paramCount}`);
            values.push(priority_min);
        }

        if (priority_max !== null) {
            whereConditions.push(`t.priority <= $${++paramCount}`);
            values.push(priority_max);
        }

        if (parent_task_id !== undefined) {
            if (parent_task_id === null) {
                whereConditions.push(`t.parent_task_id IS NULL`);
            } else {
                whereConditions.push(`t.parent_task_id = $${++paramCount}`);
                values.push(parent_task_id);
            }
        }

        if (tags && tags.length > 0) {
            whereConditions.push(`t.tags ?| $${++paramCount}`);
            values.push(tags);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Count query
        const countQuery = `
            SELECT COUNT(*) as total
            FROM tasks t
            ${whereClause}
        `;

        // Data query
        const dataQuery = `
            SELECT 
                t.*,
                w.name as workflow_name,
                COUNT(st.id) as subtask_count,
                COUNT(CASE WHEN st.status = 'completed' THEN 1 END) as completed_subtasks
            FROM tasks t
            LEFT JOIN workflows w ON t.workflow_id = w.id
            LEFT JOIN subtasks st ON t.id = st.parent_task_id
            ${whereClause}
            GROUP BY t.id, w.name
            ORDER BY t.${sort_by} ${sort_order}
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
     * Update task
     * @param {string} id - Task ID
     * @param {Object} updateData - Update data
     * @returns {Promise<Object|null>} Updated task
     */
    async update(id, updateData) {
        const allowedFields = [
            'title', 'description', 'status', 'priority', 'complexity_score',
            'assigned_to', 'estimated_hours', 'actual_hours', 'due_date',
            'started_at', 'completed_at', 'tags', 'requirements', 'context', 'metadata'
        ];

        const updates = [];
        const values = [];
        let paramCount = 0;

        for (const [key, value] of Object.entries(updateData)) {
            if (allowedFields.includes(key)) {
                updates.push(`${key} = $${++paramCount}`);
                if (['tags', 'requirements', 'context', 'metadata'].includes(key)) {
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
            UPDATE tasks 
            SET ${updates.join(', ')}
            WHERE id = $${++paramCount}
            RETURNING *
        `;

        values.push(id);

        const result = await this.db.query(query, values);
        return result.rows[0] || null;
    }

    /**
     * Update task status with optional additional data
     * @param {string} id - Task ID
     * @param {string} status - New status
     * @param {Object} additionalData - Additional fields to update
     * @returns {Promise<Object|null>} Updated task
     */
    async updateStatus(id, status, additionalData = {}) {
        const updateData = { status, ...additionalData };

        // Auto-set timestamps based on status
        if (status === 'in_progress' && !updateData.started_at) {
            updateData.started_at = new Date().toISOString();
        } else if (status === 'completed' && !updateData.completed_at) {
            updateData.completed_at = new Date().toISOString();
        }

        return this.update(id, updateData);
    }

    /**
     * Delete task
     * @param {string} id - Task ID
     * @returns {Promise<boolean>} Success status
     */
    async delete(id) {
        const query = 'DELETE FROM tasks WHERE id = $1';
        const result = await this.db.query(query, [id]);
        return result.rowCount > 0;
    }

    /**
     * Get task hierarchy (parent and all children)
     * @param {string} taskId - Task ID
     * @returns {Promise<Array>} Hierarchical task structure
     */
    async getHierarchy(taskId) {
        const query = `
            WITH RECURSIVE task_hierarchy AS (
                -- Start with the specified task
                SELECT 
                    t.*,
                    0 as level,
                    ARRAY[t.id] as path
                FROM tasks t
                WHERE t.id = $1
                
                UNION ALL
                
                -- Get all children recursively
                SELECT 
                    t.*,
                    th.level + 1,
                    th.path || t.id
                FROM tasks t
                JOIN task_hierarchy th ON t.parent_task_id = th.id
                WHERE NOT (t.id = ANY(th.path)) -- Prevent cycles
                AND th.level < 20 -- Limit recursion depth
            )
            SELECT * FROM task_hierarchy
            ORDER BY level, created_at
        `;

        const result = await this.db.query(query, [taskId]);
        return result.rows;
    }

    /**
     * Get ready tasks (no blocking dependencies)
     * @param {string|null} workflowId - Optional workflow filter
     * @returns {Promise<Array>} Ready tasks
     */
    async getReadyTasks(workflowId = null) {
        let query = `
            SELECT 
                t.*,
                w.name as workflow_name,
                COUNT(td.id) as total_dependencies,
                COUNT(CASE WHEN td.status = 'satisfied' THEN 1 END) as satisfied_dependencies
            FROM tasks t
            LEFT JOIN workflows w ON t.workflow_id = w.id
            LEFT JOIN task_dependencies td ON t.id = td.task_id
            WHERE t.status = 'pending'
        `;

        const values = [];
        if (workflowId) {
            query += ` AND t.workflow_id = $1`;
            values.push(workflowId);
        }

        query += `
            GROUP BY t.id, w.name
            HAVING COUNT(td.id) = 0 OR COUNT(td.id) = COUNT(CASE WHEN td.status = 'satisfied' THEN 1 END)
            ORDER BY t.priority DESC, t.created_at ASC
        `;

        const result = await this.db.query(query, values);
        return result.rows;
    }

    /**
     * Search tasks by text
     * @param {string} searchText - Search text
     * @param {Object} options - Search options
     * @returns {Promise<Array>} Search results
     */
    async search(searchText, options = {}) {
        const { limit = 20, workflow_id = null } = options;

        let query = `
            SELECT 
                t.*,
                w.name as workflow_name,
                ts_rank(
                    to_tsvector('english', t.title || ' ' || COALESCE(t.description, '')),
                    plainto_tsquery('english', $1)
                ) as rank
            FROM tasks t
            LEFT JOIN workflows w ON t.workflow_id = w.id
            WHERE to_tsvector('english', t.title || ' ' || COALESCE(t.description, '')) 
                  @@ plainto_tsquery('english', $1)
        `;

        const values = [searchText];
        if (workflow_id) {
            query += ` AND t.workflow_id = $2`;
            values.push(workflow_id);
        }

        query += `
            ORDER BY rank DESC, t.priority DESC
            LIMIT $${values.length + 1}
        `;

        values.push(limit);

        const result = await this.db.query(query, values);
        return result.rows;
    }

    /**
     * Get task statistics
     * @param {string|null} workflowId - Optional workflow filter
     * @returns {Promise<Object>} Task statistics
     */
    async getStatistics(workflowId = null) {
        let query = `
            SELECT 
                COUNT(*) as total_tasks,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_tasks,
                COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_tasks,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tasks,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_tasks,
                COUNT(CASE WHEN status = 'blocked' THEN 1 END) as blocked_tasks,
                AVG(priority) as avg_priority,
                AVG(complexity_score) as avg_complexity,
                AVG(EXTRACT(EPOCH FROM (completed_at - started_at))/3600) as avg_completion_hours
            FROM tasks
        `;

        const values = [];
        if (workflowId) {
            query += ` WHERE workflow_id = $1`;
            values.push(workflowId);
        }

        const result = await this.db.query(query, values);
        return result.rows[0];
    }
}

/**
 * SubtaskModel class for managing subtasks
 */
class SubtaskModel {
    constructor() {
        this.db = getConnection();
    }

    /**
     * Create a new subtask
     * @param {Object} subtaskData - Subtask data
     * @returns {Promise<Object>} Created subtask
     */
    async create(subtaskData) {
        const {
            parent_task_id,
            title,
            description = null,
            order_index = 0,
            assigned_to = null,
            estimated_hours = null,
            metadata = {}
        } = subtaskData;

        const query = `
            INSERT INTO subtasks (
                parent_task_id, title, description, order_index, 
                assigned_to, estimated_hours, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;

        const values = [
            parent_task_id, title, description, order_index,
            assigned_to, estimated_hours, JSON.stringify(metadata)
        ];

        const result = await this.db.query(query, values);
        return result.rows[0];
    }

    /**
     * Find subtasks by parent task ID
     * @param {string} parentTaskId - Parent task ID
     * @returns {Promise<Array>} Subtasks ordered by order_index
     */
    async findByParentId(parentTaskId) {
        const query = `
            SELECT * FROM subtasks 
            WHERE parent_task_id = $1 
            ORDER BY order_index ASC, created_at ASC
        `;

        const result = await this.db.query(query, [parentTaskId]);
        return result.rows;
    }

    /**
     * Update subtask
     * @param {string} id - Subtask ID
     * @param {Object} updateData - Update data
     * @returns {Promise<Object|null>} Updated subtask
     */
    async update(id, updateData) {
        const allowedFields = [
            'title', 'description', 'status', 'order_index', 'assigned_to',
            'estimated_hours', 'actual_hours', 'started_at', 'completed_at', 'metadata'
        ];

        const updates = [];
        const values = [];
        let paramCount = 0;

        for (const [key, value] of Object.entries(updateData)) {
            if (allowedFields.includes(key)) {
                updates.push(`${key} = $${++paramCount}`);
                if (key === 'metadata') {
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
            UPDATE subtasks 
            SET ${updates.join(', ')}
            WHERE id = $${++paramCount}
            RETURNING *
        `;

        values.push(id);

        const result = await this.db.query(query, values);
        return result.rows[0] || null;
    }

    /**
     * Delete subtask
     * @param {string} id - Subtask ID
     * @returns {Promise<boolean>} Success status
     */
    async delete(id) {
        const query = 'DELETE FROM subtasks WHERE id = $1';
        const result = await this.db.query(query, [id]);
        return result.rowCount > 0;
    }

    /**
     * Reorder subtasks
     * @param {string} parentTaskId - Parent task ID
     * @param {Array<string>} subtaskIds - Ordered array of subtask IDs
     * @returns {Promise<Array>} Reordered subtasks
     */
    async reorder(parentTaskId, subtaskIds) {
        const client = await this.db.getClient();
        
        try {
            await client.query('BEGIN');

            const reorderedSubtasks = [];
            for (let i = 0; i < subtaskIds.length; i++) {
                const query = `
                    UPDATE subtasks 
                    SET order_index = $1 
                    WHERE id = $2 AND parent_task_id = $3
                    RETURNING *
                `;
                
                const result = await client.query(query, [i, subtaskIds[i], parentTaskId]);
                if (result.rows[0]) {
                    reorderedSubtasks.push(result.rows[0]);
                }
            }

            await client.query('COMMIT');
            return reorderedSubtasks;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}

// Create and export model instances
const taskModel = new TaskModel();
const subtaskModel = new SubtaskModel();

export { taskModel, subtaskModel, TaskModel, SubtaskModel };

