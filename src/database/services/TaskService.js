/**
 * @fileoverview Task Service for database operations
 * @description Service layer for task management with database persistence
 * @version 1.0.0
 */

import { getConnection } from '../connection/connection_manager.js';

/**
 * TaskService class for task database operations
 */
export class TaskService {
    constructor() {
        this.db = getConnection();
    }

    /**
     * Create a new task
     * @param {Object} taskData - Task data
     * @returns {Promise<Object>} Created task
     */
    async createTask(taskData) {
        const {
            title,
            description = null,
            workflow_id = null,
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
     * Update a task
     * @param {string} taskId - Task ID
     * @param {Object} updates - Update data
     * @returns {Promise<Object|null>} Updated task
     */
    async updateTask(taskId, updates) {
        const allowedFields = [
            'title', 'description', 'status', 'priority', 'complexity_score',
            'assigned_to', 'estimated_hours', 'actual_hours', 'due_date',
            'started_at', 'completed_at', 'tags', 'requirements', 'context', 'metadata'
        ];

        const updateFields = [];
        const values = [];
        let paramCount = 0;

        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                updateFields.push(`${key} = $${++paramCount}`);
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

        const query = `
            UPDATE tasks 
            SET ${updateFields.join(', ')}
            WHERE id = $${++paramCount}
            RETURNING *
        `;

        values.push(taskId);

        const result = await this.db.query(query, values);
        return result.rows[0] || null;
    }

    /**
     * Delete a task
     * @param {string} taskId - Task ID
     * @returns {Promise<boolean>} Success status
     */
    async deleteTask(taskId) {
        const query = 'DELETE FROM tasks WHERE id = $1';
        const result = await this.db.query(query, [taskId]);
        return result.rowCount > 0;
    }

    /**
     * Get a task by ID
     * @param {string} taskId - Task ID
     * @returns {Promise<Object|null>} Task or null if not found
     */
    async getTask(taskId) {
        const query = `
            SELECT 
                t.*,
                w.name as workflow_name,
                COUNT(st.id) as subtask_count,
                COUNT(CASE WHEN st.status = 'completed' THEN 1 END) as completed_subtasks
            FROM tasks t
            LEFT JOIN workflows w ON t.workflow_id = w.id
            LEFT JOIN subtasks st ON t.id = st.parent_task_id
            WHERE t.id = $1
            GROUP BY t.id, w.name
        `;

        const result = await this.db.query(query, [taskId]);
        return result.rows[0] || null;
    }

    /**
     * List tasks with filters
     * @param {Object} filters - Filter options
     * @returns {Promise<Array>} Array of tasks
     */
    async listTasks(filters = {}) {
        const {
            status = null,
            workflow_id = null,
            assigned_to = null,
            parent_task_id = null,
            priority_min = null,
            priority_max = null,
            tags = null,
            limit = 100,
            offset = 0
        } = filters;

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

        if (parent_task_id !== undefined) {
            if (parent_task_id === null) {
                whereConditions.push(`t.parent_task_id IS NULL`);
            } else {
                whereConditions.push(`t.parent_task_id = $${++paramCount}`);
                values.push(parent_task_id);
            }
        }

        if (priority_min !== null) {
            whereConditions.push(`t.priority >= $${++paramCount}`);
            values.push(priority_min);
        }

        if (priority_max !== null) {
            whereConditions.push(`t.priority <= $${++paramCount}`);
            values.push(priority_max);
        }

        if (tags && tags.length > 0) {
            whereConditions.push(`t.tags ?| $${++paramCount}`);
            values.push(tags);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        const query = `
            SELECT 
                t.*,
                w.name as workflow_name,
                COUNT(st.id) as subtask_count
            FROM tasks t
            LEFT JOIN workflows w ON t.workflow_id = w.id
            LEFT JOIN subtasks st ON t.id = st.parent_task_id
            ${whereClause}
            GROUP BY t.id, w.name
            ORDER BY t.priority DESC, t.created_at DESC
            LIMIT $${++paramCount} OFFSET $${++paramCount}
        `;

        values.push(limit, offset);

        const result = await this.db.query(query, values);
        return result.rows;
    }

    /**
     * Set task status
     * @param {string} taskId - Task ID
     * @param {string} status - New status
     * @param {Object} additionalData - Additional fields to update
     * @returns {Promise<Object|null>} Updated task
     */
    async setTaskStatus(taskId, status, additionalData = {}) {
        const updateData = { status, ...additionalData };

        // Auto-set timestamps based on status
        if (status === 'in_progress' && !updateData.started_at) {
            updateData.started_at = new Date().toISOString();
        } else if (status === 'completed' && !updateData.completed_at) {
            updateData.completed_at = new Date().toISOString();
        }

        return this.updateTask(taskId, updateData);
    }

    /**
     * Move task to a new parent
     * @param {string} taskId - Task ID
     * @param {string|null} newParentId - New parent task ID
     * @returns {Promise<Object|null>} Updated task
     */
    async moveTask(taskId, newParentId) {
        const client = await this.db.getClient();
        
        try {
            await client.query('BEGIN');

            // Check for circular dependency if moving to a parent
            if (newParentId) {
                const wouldCreateCircle = await this._checkCircularDependency(client, taskId, newParentId);
                if (wouldCreateCircle) {
                    throw new Error('Moving task would create a circular dependency');
                }
            }

            // Update the task's parent
            const query = `
                UPDATE tasks 
                SET parent_task_id = $1, updated_at = NOW()
                WHERE id = $2
                RETURNING *
            `;

            const result = await client.query(query, [newParentId, taskId]);
            
            await client.query('COMMIT');
            return result.rows[0] || null;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Check for circular dependency
     * @private
     * @param {Object} client - Database client
     * @param {string} taskId - Task ID
     * @param {string} potentialParentId - Potential parent ID
     * @returns {Promise<boolean>} Whether it would create a circular dependency
     */
    async _checkCircularDependency(client, taskId, potentialParentId) {
        const query = `
            WITH RECURSIVE task_hierarchy AS (
                -- Start with the potential parent
                SELECT id, parent_task_id, 1 as depth
                FROM tasks
                WHERE id = $1
                
                UNION ALL
                
                -- Follow the parent chain
                SELECT t.id, t.parent_task_id, th.depth + 1
                FROM tasks t
                JOIN task_hierarchy th ON t.id = th.parent_task_id
                WHERE th.depth < 50 -- Prevent infinite recursion
            )
            SELECT 1 FROM task_hierarchy WHERE id = $2
        `;

        const result = await client.query(query, [potentialParentId, taskId]);
        return result.rows.length > 0;
    }

    /**
     * Get task hierarchy
     * @param {string} taskId - Task ID
     * @returns {Promise<Object>} Task hierarchy
     */
    async getTaskHierarchy(taskId) {
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
        
        // Build hierarchical structure
        const tasks = result.rows;
        const hierarchy = {
            root: null,
            children: {}
        };

        tasks.forEach(task => {
            if (task.level === 0) {
                hierarchy.root = task;
            } else {
                const parentId = task.path[task.level - 1];
                if (!hierarchy.children[parentId]) {
                    hierarchy.children[parentId] = [];
                }
                hierarchy.children[parentId].push(task);
            }
        });

        return hierarchy;
    }

    /**
     * Get task statistics
     * @param {string} projectId - Project ID (optional)
     * @returns {Promise<Object>} Task statistics
     */
    async getTaskStatistics(projectId = null) {
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
            FROM tasks t
        `;

        const values = [];
        if (projectId) {
            query += ` JOIN workflows w ON t.workflow_id = w.id WHERE w.metadata->>'projectId' = $1`;
            values.push(projectId);
        }

        const result = await this.db.query(query, values);
        return result.rows[0];
    }

    /**
     * Search tasks by text
     * @param {string} searchText - Search text
     * @param {Object} options - Search options
     * @returns {Promise<Array>} Search results
     */
    async searchTasks(searchText, options = {}) {
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
     * Get ready tasks (no blocking dependencies)
     * @param {string} workflowId - Workflow ID (optional)
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
}

