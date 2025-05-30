/**
 * @fileoverview Task Service - Database operations for task management
 * @description Provides database persistence layer for task operations
 * @version 1.0.0
 */

import { DatabaseConnectionManager } from '../connection/connection_manager.js';

/**
 * Task Service class for database operations
 */
export class TaskService {
    constructor(connectionManager = null) {
        this.db = connectionManager || new DatabaseConnectionManager();
    }

    /**
     * Create a new task
     * @param {Object} taskData - Task data
     * @param {string} taskData.title - Task title
     * @param {string} taskData.description - Task description
     * @param {string} taskData.project_id - Project ID
     * @param {string} [taskData.parent_task_id] - Parent task ID for subtasks
     * @param {number} [taskData.priority] - Task priority
     * @param {Object} [taskData.requirements] - Task requirements
     * @param {Array} [taskData.dependencies] - Task dependencies
     * @param {Object} [taskData.context] - Task context
     * @param {Array} [taskData.tags] - Task tags
     * @param {string} [taskData.created_by] - Creator identifier
     * @returns {Promise<Object>} Created task
     */
    async createTask(taskData) {
        const client = await this.db.getConnection();
        
        try {
            await client.query('BEGIN');

            const query = `
                INSERT INTO tasks (
                    project_id, parent_task_id, title, description, priority,
                    requirements, dependencies, context, tags, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING *
            `;

            const values = [
                taskData.project_id,
                taskData.parent_task_id || null,
                taskData.title,
                taskData.description || '',
                taskData.priority || 0,
                JSON.stringify(taskData.requirements || {}),
                JSON.stringify(taskData.dependencies || []),
                JSON.stringify(taskData.context || {}),
                JSON.stringify(taskData.tags || []),
                taskData.created_by || 'system'
            ];

            const result = await client.query(query, values);
            await client.query('COMMIT');

            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw new Error(`Failed to create task: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Update an existing task
     * @param {string} taskId - Task ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated task
     */
    async updateTask(taskId, updates) {
        const client = await this.db.getConnection();
        
        try {
            await client.query('BEGIN');

            // Build dynamic update query
            const updateFields = [];
            const values = [];
            let paramIndex = 1;

            for (const [key, value] of Object.entries(updates)) {
                if (key === 'id' || key === 'created_at') continue; // Skip immutable fields
                
                if (['requirements', 'dependencies', 'context', 'tags'].includes(key)) {
                    updateFields.push(`${key} = $${paramIndex}`);
                    values.push(JSON.stringify(value));
                } else {
                    updateFields.push(`${key} = $${paramIndex}`);
                    values.push(value);
                }
                paramIndex++;
            }

            if (updateFields.length === 0) {
                throw new Error('No valid fields to update');
            }

            // Always update the updated_at timestamp
            updateFields.push(`updated_at = NOW()`);
            values.push(taskId);

            const query = `
                UPDATE tasks 
                SET ${updateFields.join(', ')}
                WHERE id = $${paramIndex}
                RETURNING *
            `;

            const result = await client.query(query, values);
            
            if (result.rows.length === 0) {
                throw new Error(`Task with ID ${taskId} not found`);
            }

            await client.query('COMMIT');
            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw new Error(`Failed to update task: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Delete a task
     * @param {string} taskId - Task ID
     * @returns {Promise<boolean>} Success status
     */
    async deleteTask(taskId) {
        const client = await this.db.getConnection();
        
        try {
            await client.query('BEGIN');

            const query = 'DELETE FROM tasks WHERE id = $1';
            const result = await client.query(query, [taskId]);

            await client.query('COMMIT');
            return result.rowCount > 0;
        } catch (error) {
            await client.query('ROLLBACK');
            throw new Error(`Failed to delete task: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Get a task by ID
     * @param {string} taskId - Task ID
     * @returns {Promise<Object|null>} Task or null if not found
     */
    async getTask(taskId) {
        const client = await this.db.getConnection();
        
        try {
            const query = 'SELECT * FROM tasks WHERE id = $1';
            const result = await client.query(query, [taskId]);
            
            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            throw new Error(`Failed to get task: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * List tasks with optional filters
     * @param {Object} filters - Filter options
     * @param {string} [filters.project_id] - Project ID filter
     * @param {string} [filters.parent_task_id] - Parent task ID filter
     * @param {string} [filters.status] - Status filter
     * @param {number} [filters.priority] - Priority filter
     * @param {number} [filters.limit] - Limit results
     * @param {number} [filters.offset] - Offset for pagination
     * @param {string} [filters.order_by] - Order by field
     * @param {string} [filters.order_direction] - Order direction (ASC/DESC)
     * @returns {Promise<Array>} List of tasks
     */
    async listTasks(filters = {}) {
        const client = await this.db.getConnection();
        
        try {
            let query = 'SELECT * FROM tasks WHERE 1=1';
            const values = [];
            let paramIndex = 1;

            // Apply filters
            if (filters.project_id) {
                query += ` AND project_id = $${paramIndex}`;
                values.push(filters.project_id);
                paramIndex++;
            }

            if (filters.parent_task_id !== undefined) {
                if (filters.parent_task_id === null) {
                    query += ' AND parent_task_id IS NULL';
                } else {
                    query += ` AND parent_task_id = $${paramIndex}`;
                    values.push(filters.parent_task_id);
                    paramIndex++;
                }
            }

            if (filters.status) {
                query += ` AND status = $${paramIndex}`;
                values.push(filters.status);
                paramIndex++;
            }

            if (filters.priority !== undefined) {
                query += ` AND priority = $${paramIndex}`;
                values.push(filters.priority);
                paramIndex++;
            }

            // Add ordering
            const orderBy = filters.order_by || 'created_at';
            const orderDirection = filters.order_direction || 'DESC';
            query += ` ORDER BY ${orderBy} ${orderDirection}`;

            // Add pagination
            if (filters.limit) {
                query += ` LIMIT $${paramIndex}`;
                values.push(filters.limit);
                paramIndex++;
            }

            if (filters.offset) {
                query += ` OFFSET $${paramIndex}`;
                values.push(filters.offset);
                paramIndex++;
            }

            const result = await client.query(query, values);
            return result.rows;
        } catch (error) {
            throw new Error(`Failed to list tasks: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Set task status
     * @param {string} taskId - Task ID
     * @param {string} status - New status
     * @returns {Promise<Object>} Updated task
     */
    async setTaskStatus(taskId, status) {
        const updates = { status };
        
        // If completing the task, set completed_at timestamp
        if (status === 'completed') {
            updates.completed_at = new Date().toISOString();
        }

        return this.updateTask(taskId, updates);
    }

    /**
     * Move task to a new parent
     * @param {string} taskId - Task ID
     * @param {string|null} newParentId - New parent task ID (null for root level)
     * @returns {Promise<Object>} Updated task
     */
    async moveTask(taskId, newParentId) {
        const client = await this.db.getConnection();
        
        try {
            await client.query('BEGIN');

            // Validate that we're not creating a circular dependency
            if (newParentId) {
                const isCircular = await this._checkCircularDependency(client, taskId, newParentId);
                if (isCircular) {
                    throw new Error('Cannot move task: would create circular dependency');
                }
            }

            const updates = { parent_task_id: newParentId };
            const result = await this.updateTask(taskId, updates);

            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Check for circular dependencies
     * @private
     * @param {Object} client - Database client
     * @param {string} taskId - Task ID
     * @param {string} potentialParentId - Potential parent ID
     * @returns {Promise<boolean>} True if circular dependency exists
     */
    async _checkCircularDependency(client, taskId, potentialParentId) {
        const query = `
            WITH RECURSIVE task_hierarchy AS (
                SELECT id, parent_task_id, 1 as level
                FROM tasks 
                WHERE id = $1
                
                UNION ALL
                
                SELECT t.id, t.parent_task_id, th.level + 1
                FROM tasks t
                INNER JOIN task_hierarchy th ON t.parent_task_id = th.id
                WHERE th.level < 10 -- Prevent infinite recursion
            )
            SELECT COUNT(*) as count
            FROM task_hierarchy 
            WHERE id = $2
        `;

        const result = await client.query(query, [potentialParentId, taskId]);
        return parseInt(result.rows[0].count) > 0;
    }

    /**
     * Get task hierarchy (parent and children)
     * @param {string} taskId - Task ID
     * @returns {Promise<Object>} Task with hierarchy information
     */
    async getTaskHierarchy(taskId) {
        const client = await this.db.getConnection();
        
        try {
            const query = `
                WITH RECURSIVE task_tree AS (
                    -- Get the target task
                    SELECT id, parent_task_id, title, status, 0 as level, 'current' as relation
                    FROM tasks 
                    WHERE id = $1
                    
                    UNION ALL
                    
                    -- Get children
                    SELECT t.id, t.parent_task_id, t.title, t.status, 1 as level, 'child' as relation
                    FROM tasks t
                    WHERE t.parent_task_id = $1
                    
                    UNION ALL
                    
                    -- Get parent
                    SELECT t.id, t.parent_task_id, t.title, t.status, -1 as level, 'parent' as relation
                    FROM tasks t
                    INNER JOIN tasks current ON current.parent_task_id = t.id
                    WHERE current.id = $1
                )
                SELECT * FROM task_tree ORDER BY level, title
            `;

            const result = await client.query(query, [taskId]);
            return result.rows;
        } catch (error) {
            throw new Error(`Failed to get task hierarchy: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Get task statistics
     * @param {string} [projectId] - Optional project ID filter
     * @returns {Promise<Object>} Task statistics
     */
    async getTaskStatistics(projectId = null) {
        const client = await this.db.getConnection();
        
        try {
            let query = `
                SELECT 
                    COUNT(*) as total_tasks,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_tasks,
                    COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_tasks,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tasks,
                    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_tasks,
                    COUNT(CASE WHEN parent_task_id IS NULL THEN 1 END) as root_tasks,
                    COUNT(CASE WHEN parent_task_id IS NOT NULL THEN 1 END) as subtasks,
                    AVG(priority) as avg_priority
                FROM tasks
            `;

            const values = [];
            if (projectId) {
                query += ' WHERE project_id = $1';
                values.push(projectId);
            }

            const result = await client.query(query, values);
            return result.rows[0];
        } catch (error) {
            throw new Error(`Failed to get task statistics: ${error.message}`);
        } finally {
            client.release();
        }
    }
}

export default TaskService;

