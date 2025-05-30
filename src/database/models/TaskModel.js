/**
 * @fileoverview Task Model - Database operations for tasks and subtasks
 * @description Comprehensive model for task management with CRUD operations
 * @version 1.0.0
 */

import { getConnection } from '../connection/connection_manager.js';

/**
 * Task Model class for database operations
 */
export class TaskModel {
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
            status = 'pending',
            priority = 0,
            complexity_score = 0,
            parent_task_id,
            workflow_id,
            estimated_duration,
            assigned_to,
            tags = [],
            requirements = {},
            context = {},
            metadata = {}
        } = taskData;

        const query = `
            INSERT INTO tasks (
                title, description, status, priority, complexity_score,
                parent_task_id, workflow_id, estimated_duration, assigned_to,
                tags, requirements, context, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
        `;

        const values = [
            title, description, status, priority, complexity_score,
            parent_task_id, workflow_id, estimated_duration, assigned_to,
            JSON.stringify(tags), JSON.stringify(requirements),
            JSON.stringify(context), JSON.stringify(metadata)
        ];

        const result = await this.db.query(query, values);
        return result.rows[0];
    }

    /**
     * Find task by ID
     * @param {string} id - Task ID
     * @returns {Promise<Object|null>} Task or null if not found
     */
    async findById(id) {
        const query = `
            SELECT t.*, w.name as workflow_name
            FROM tasks t
            LEFT JOIN workflows w ON t.workflow_id = w.id
            WHERE t.id = $1
        `;
        
        const result = await this.db.query(query, [id]);
        return result.rows[0] || null;
    }

    /**
     * Find tasks with filters and pagination
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Tasks with pagination info
     */
    async findMany(options = {}) {
        const {
            status,
            priority,
            workflow_id,
            parent_task_id,
            assigned_to,
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
            whereConditions.push(`t.status = $${paramCount}`);
            values.push(status);
        }

        if (priority !== undefined) {
            paramCount++;
            whereConditions.push(`t.priority = $${paramCount}`);
            values.push(priority);
        }

        if (workflow_id) {
            paramCount++;
            whereConditions.push(`t.workflow_id = $${paramCount}`);
            values.push(workflow_id);
        }

        if (parent_task_id) {
            paramCount++;
            whereConditions.push(`t.parent_task_id = $${paramCount}`);
            values.push(parent_task_id);
        }

        if (assigned_to) {
            paramCount++;
            whereConditions.push(`t.assigned_to = $${paramCount}`);
            values.push(assigned_to);
        }

        if (tags && tags.length > 0) {
            paramCount++;
            whereConditions.push(`t.tags @> $${paramCount}`);
            values.push(JSON.stringify(tags));
        }

        const whereClause = whereConditions.length > 0 
            ? `WHERE ${whereConditions.join(' AND ')}`
            : '';

        // Count query for pagination
        const countQuery = `
            SELECT COUNT(*) as total
            FROM tasks t
            ${whereClause}
        `;

        // Main query
        const query = `
            SELECT 
                t.*,
                w.name as workflow_name,
                COUNT(st.id) as subtask_count,
                COUNT(CASE WHEN st.status = 'completed' THEN 1 END) as completed_subtasks,
                COUNT(tf.id) as file_count
            FROM tasks t
            LEFT JOIN workflows w ON t.workflow_id = w.id
            LEFT JOIN subtasks st ON t.id = st.parent_task_id
            LEFT JOIN task_files tf ON t.id = tf.task_id
            ${whereClause}
            GROUP BY t.id, w.name
            ORDER BY t.${orderBy} ${orderDirection}
            LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
        `;

        values.push(limit, offset);

        const [countResult, tasksResult] = await Promise.all([
            this.db.query(countQuery, values.slice(0, -2)),
            this.db.query(query, values)
        ]);

        const total = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(total / limit);
        const currentPage = Math.floor(offset / limit) + 1;

        return {
            data: tasksResult.rows,
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
     * Update task by ID
     * @param {string} id - Task ID
     * @param {Object} updateData - Data to update
     * @returns {Promise<Object|null>} Updated task or null if not found
     */
    async update(id, updateData) {
        const allowedFields = [
            'title', 'description', 'status', 'priority', 'complexity_score',
            'parent_task_id', 'workflow_id', 'estimated_duration', 'actual_duration',
            'assigned_to', 'tags', 'requirements', 'context', 'metadata'
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
                if (['tags', 'requirements', 'context', 'metadata'].includes(key)) {
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
            UPDATE tasks 
            SET ${updateFields.join(', ')}, updated_at = NOW()
            WHERE id = $${paramCount}
            RETURNING *
        `;

        const result = await this.db.query(query, values);
        return result.rows[0] || null;
    }

    /**
     * Delete task by ID
     * @param {string} id - Task ID
     * @returns {Promise<boolean>} True if deleted, false if not found
     */
    async delete(id) {
        const query = 'DELETE FROM tasks WHERE id = $1';
        const result = await this.db.query(query, [id]);
        return result.rowCount > 0;
    }

    /**
     * Get task hierarchy (parent and children)
     * @param {string} taskId - Task ID
     * @returns {Promise<Object>} Task hierarchy
     */
    async getHierarchy(taskId) {
        const query = `
            WITH RECURSIVE task_tree AS (
                -- Get the specified task
                SELECT 
                    id, title, status, priority, parent_task_id, workflow_id,
                    0 as level, ARRAY[id] as path, 'current' as relation
                FROM tasks 
                WHERE id = $1
                
                UNION ALL
                
                -- Get parent tasks (going up)
                SELECT 
                    t.id, t.title, t.status, t.priority, t.parent_task_id, t.workflow_id,
                    tt.level - 1, t.id || tt.path, 'parent'
                FROM tasks t
                JOIN task_tree tt ON t.id = tt.parent_task_id
                WHERE tt.level > -10 -- Prevent infinite recursion
                
                UNION ALL
                
                -- Get child tasks (going down)
                SELECT 
                    t.id, t.title, t.status, t.priority, t.parent_task_id, t.workflow_id,
                    tt.level + 1, tt.path || t.id, 'child'
                FROM tasks t
                JOIN task_tree tt ON t.parent_task_id = tt.id
                WHERE tt.level < 10 -- Prevent infinite recursion
            )
            SELECT * FROM task_tree ORDER BY level, title
        `;

        const result = await this.db.query(query, [taskId]);
        return result.rows;
    }

    /**
     * Get tasks ready for execution (all dependencies satisfied)
     * @param {string} workflowId - Optional workflow ID filter
     * @returns {Promise<Array>} Ready tasks
     */
    async getReadyTasks(workflowId = null) {
        let query = `
            SELECT t.*
            FROM tasks t
            LEFT JOIN task_dependencies td ON t.id = td.task_id
            WHERE t.status = 'pending'
            AND (
                -- No dependencies
                td.id IS NULL
                OR
                -- All dependencies satisfied
                NOT EXISTS (
                    SELECT 1 FROM task_dependencies td2 
                    WHERE td2.task_id = t.id 
                    AND td2.status != 'satisfied'
                    AND td2.dependency_type = 'blocks'
                )
            )
        `;

        const values = [];
        if (workflowId) {
            query += ' AND t.workflow_id = $1';
            values.push(workflowId);
        }

        query += ' GROUP BY t.id ORDER BY t.priority DESC, t.created_at';

        const result = await this.db.query(query, values);
        return result.rows;
    }

    /**
     * Update task status and handle dependency cascading
     * @param {string} id - Task ID
     * @param {string} status - New status
     * @param {Object} additionalData - Additional data to update
     * @returns {Promise<Object>} Updated task
     */
    async updateStatus(id, status, additionalData = {}) {
        const updateData = { status, ...additionalData };

        // Set actual_duration if task is being completed
        if (status === 'completed' && !updateData.actual_duration) {
            const task = await this.findById(id);
            if (task && task.created_at) {
                const now = new Date();
                const created = new Date(task.created_at);
                const durationMs = now - created;
                updateData.actual_duration = `${Math.floor(durationMs / 1000)} seconds`;
            }
        }

        return await this.update(id, updateData);
    }

    /**
     * Search tasks by text
     * @param {string} searchText - Text to search for
     * @param {Object} options - Search options
     * @returns {Promise<Array>} Matching tasks
     */
    async search(searchText, options = {}) {
        const { limit = 50, offset = 0 } = options;

        const query = `
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
            ORDER BY rank DESC, t.created_at DESC
            LIMIT $2 OFFSET $3
        `;

        const result = await this.db.query(query, [searchText, limit, offset]);
        return result.rows;
    }

    /**
     * Get task statistics
     * @param {string} workflowId - Optional workflow ID filter
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
                AVG(priority) as avg_priority,
                AVG(complexity_score) as avg_complexity,
                COUNT(CASE WHEN parent_task_id IS NULL THEN 1 END) as root_tasks,
                COUNT(CASE WHEN parent_task_id IS NOT NULL THEN 1 END) as child_tasks
            FROM tasks
        `;

        const values = [];
        if (workflowId) {
            query += ' WHERE workflow_id = $1';
            values.push(workflowId);
        }

        const result = await this.db.query(query, values);
        return result.rows[0];
    }
}

/**
 * Subtask Model class for database operations
 */
export class SubtaskModel {
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
            description,
            status = 'pending',
            order_index = 0,
            estimated_duration,
            assigned_to,
            metadata = {}
        } = subtaskData;

        const query = `
            INSERT INTO subtasks (
                parent_task_id, title, description, status, order_index,
                estimated_duration, assigned_to, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `;

        const values = [
            parent_task_id, title, description, status, order_index,
            estimated_duration, assigned_to, JSON.stringify(metadata)
        ];

        const result = await this.db.query(query, values);
        return result.rows[0];
    }

    /**
     * Find subtasks by parent task ID
     * @param {string} parentTaskId - Parent task ID
     * @returns {Promise<Array>} Subtasks
     */
    async findByParentId(parentTaskId) {
        const query = `
            SELECT * FROM subtasks 
            WHERE parent_task_id = $1 
            ORDER BY order_index, created_at
        `;
        
        const result = await this.db.query(query, [parentTaskId]);
        return result.rows;
    }

    /**
     * Update subtask by ID
     * @param {string} id - Subtask ID
     * @param {Object} updateData - Data to update
     * @returns {Promise<Object|null>} Updated subtask or null if not found
     */
    async update(id, updateData) {
        const allowedFields = [
            'title', 'description', 'status', 'order_index',
            'estimated_duration', 'actual_duration', 'assigned_to', 'metadata'
        ];

        const updateFields = [];
        const values = [];
        let paramCount = 0;

        for (const [key, value] of Object.entries(updateData)) {
            if (allowedFields.includes(key) && value !== undefined) {
                paramCount++;
                updateFields.push(`${key} = $${paramCount}`);
                
                if (key === 'metadata') {
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
            UPDATE subtasks 
            SET ${updateFields.join(', ')}, updated_at = NOW()
            WHERE id = $${paramCount}
            RETURNING *
        `;

        const result = await this.db.query(query, values);
        return result.rows[0] || null;
    }

    /**
     * Delete subtask by ID
     * @param {string} id - Subtask ID
     * @returns {Promise<boolean>} True if deleted, false if not found
     */
    async delete(id) {
        const query = 'DELETE FROM subtasks WHERE id = $1';
        const result = await this.db.query(query, [id]);
        return result.rowCount > 0;
    }

    /**
     * Reorder subtasks for a parent task
     * @param {string} parentTaskId - Parent task ID
     * @param {Array} subtaskIds - Array of subtask IDs in new order
     * @returns {Promise<Array>} Updated subtasks
     */
    async reorder(parentTaskId, subtaskIds) {
        const client = await this.db.getClient();
        
        try {
            await client.query('BEGIN');

            const updatePromises = subtaskIds.map((subtaskId, index) => {
                return client.query(
                    'UPDATE subtasks SET order_index = $1, updated_at = NOW() WHERE id = $2 AND parent_task_id = $3',
                    [index, subtaskId, parentTaskId]
                );
            });

            await Promise.all(updatePromises);
            await client.query('COMMIT');

            // Return updated subtasks
            const result = await client.query(
                'SELECT * FROM subtasks WHERE parent_task_id = $1 ORDER BY order_index',
                [parentTaskId]
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
export const taskModel = new TaskModel();
export const subtaskModel = new SubtaskModel();

export default { TaskModel, SubtaskModel, taskModel, subtaskModel };

