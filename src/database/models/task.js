/**
 * @fileoverview Task Model - Database operations for tasks
 * @description Enhanced task model with relationships, validation, and advanced querying
 * @version 1.0.0
 */

import { DatabaseConnectionManager } from '../connection/connection_manager.js';

export class TaskModel {
    static db = null;

    /**
     * Initialize the database connection
     */
    static async initialize() {
        if (!this.db) {
            this.db = new DatabaseConnectionManager();
            await this.db.connect();
        }
        return this.db;
    }

    /**
     * Create a new task
     * @param {Object} client - Database client (for transactions)
     * @param {Object} taskData - Task data
     * @returns {Promise<Object>} Created task
     */
    static async create(client, taskData) {
        const db = client || await this.initialize();
        
        const query = `
            INSERT INTO tasks (
                project_id, parent_task_id, title, description, status, priority,
                requirements, dependencies, context, tags, assigned_agent,
                estimated_duration, due_date, created_by
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
            ) RETURNING *
        `;

        const values = [
            taskData.project_id || null,
            taskData.parent_task_id || null,
            taskData.title,
            taskData.description || null,
            taskData.status || 'pending',
            taskData.priority || 0,
            JSON.stringify(taskData.requirements || {}),
            JSON.stringify(taskData.dependencies || []),
            JSON.stringify(taskData.context || {}),
            JSON.stringify(taskData.tags || []),
            taskData.assigned_agent || null,
            taskData.estimated_duration || null,
            taskData.due_date || null,
            taskData.created_by || 'system'
        ];

        const result = await db.query(query, values);
        return result.rows[0];
    }

    /**
     * Find task by ID
     * @param {string} taskId - Task ID
     * @returns {Promise<Object|null>} Task or null if not found
     */
    static async findById(taskId) {
        const db = await this.initialize();
        
        const query = `
            SELECT t.*, 
                   p.name as project_name,
                   COUNT(st.id) as subtask_count,
                   COUNT(d.depends_on_task_id) as dependency_count
            FROM tasks t
            LEFT JOIN projects p ON t.project_id = p.id
            LEFT JOIN tasks st ON st.parent_task_id = t.id
            LEFT JOIN task_dependencies d ON t.id = d.task_id
            WHERE t.id = $1
            GROUP BY t.id, p.name
        `;

        const result = await db.query(query, [taskId]);
        return result.rows[0] || null;
    }

    /**
     * Update task by ID
     * @param {string} taskId - Task ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated task
     */
    static async updateById(taskId, updates) {
        const db = await this.initialize();
        
        const setClause = [];
        const values = [];
        let paramIndex = 1;

        // Build dynamic SET clause
        for (const [key, value] of Object.entries(updates)) {
            if (key === 'requirements' || key === 'dependencies' || key === 'context' || key === 'tags') {
                setClause.push(`${key} = $${paramIndex}`);
                values.push(JSON.stringify(value));
            } else {
                setClause.push(`${key} = $${paramIndex}`);
                values.push(value);
            }
            paramIndex++;
        }

        setClause.push(`updated_at = NOW()`);
        values.push(taskId);

        const query = `
            UPDATE tasks 
            SET ${setClause.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
        `;

        const result = await db.query(query, values);
        return result.rows[0];
    }

    /**
     * Delete task by ID
     * @param {string} taskId - Task ID
     * @returns {Promise<boolean>} Success status
     */
    static async deleteById(taskId) {
        const db = await this.initialize();
        
        const query = `DELETE FROM tasks WHERE id = $1`;
        const result = await db.query(query, [taskId]);
        
        return result.rowCount > 0;
    }

    /**
     * Find tasks with advanced filtering
     * @param {Object} criteria - Search criteria
     * @returns {Promise<Array>} Array of tasks
     */
    static async findWithCriteria(criteria = {}) {
        const db = await this.initialize();
        
        let query = `
            SELECT t.*, 
                   p.name as project_name,
                   COUNT(st.id) as subtask_count,
                   COUNT(d.depends_on_task_id) as dependency_count
            FROM tasks t
            LEFT JOIN projects p ON t.project_id = p.id
            LEFT JOIN tasks st ON st.parent_task_id = t.id
            LEFT JOIN task_dependencies d ON t.id = d.task_id
            WHERE 1=1
        `;

        const values = [];
        let paramIndex = 1;

        // Add filters
        if (criteria.status) {
            if (Array.isArray(criteria.status)) {
                query += ` AND t.status = ANY($${paramIndex})`;
                values.push(criteria.status);
            } else {
                query += ` AND t.status = $${paramIndex}`;
                values.push(criteria.status);
            }
            paramIndex++;
        }

        if (criteria.assigned_agent) {
            query += ` AND t.assigned_agent = $${paramIndex}`;
            values.push(criteria.assigned_agent);
            paramIndex++;
        }

        if (criteria.project_id) {
            query += ` AND t.project_id = $${paramIndex}`;
            values.push(criteria.project_id);
            paramIndex++;
        }

        if (criteria.parent_task_id !== undefined) {
            if (criteria.parent_task_id === null) {
                query += ` AND t.parent_task_id IS NULL`;
            } else {
                query += ` AND t.parent_task_id = $${paramIndex}`;
                values.push(criteria.parent_task_id);
                paramIndex++;
            }
        }

        if (criteria.priority_min !== undefined) {
            query += ` AND t.priority >= $${paramIndex}`;
            values.push(criteria.priority_min);
            paramIndex++;
        }

        if (criteria.priority_max !== undefined) {
            query += ` AND t.priority <= $${paramIndex}`;
            values.push(criteria.priority_max);
            paramIndex++;
        }

        if (criteria.search) {
            query += ` AND (t.title ILIKE $${paramIndex} OR t.description ILIKE $${paramIndex})`;
            values.push(`%${criteria.search}%`);
            paramIndex++;
        }

        // Add GROUP BY
        query += ` GROUP BY t.id, p.name`;

        // Add ordering
        if (criteria.order_by) {
            const validOrderFields = ['created_at', 'updated_at', 'priority', 'title', 'status'];
            const orderField = validOrderFields.includes(criteria.order_by) ? criteria.order_by : 'created_at';
            const orderDirection = criteria.order_direction === 'ASC' ? 'ASC' : 'DESC';
            query += ` ORDER BY t.${orderField} ${orderDirection}`;
        } else {
            query += ` ORDER BY t.created_at DESC`;
        }

        // Add pagination
        if (criteria.limit) {
            query += ` LIMIT $${paramIndex}`;
            values.push(criteria.limit);
            paramIndex++;
        }

        if (criteria.offset) {
            query += ` OFFSET $${paramIndex}`;
            values.push(criteria.offset);
            paramIndex++;
        }

        const result = await db.query(query, values);
        return result.rows;
    }

    /**
     * Get task dependencies
     * @param {string} taskId - Task ID
     * @returns {Promise<Array>} Array of dependency tasks
     */
    static async getDependencies(taskId) {
        const db = await this.initialize();
        
        const query = `
            SELECT t.*, td.dependency_type
            FROM tasks t
            JOIN task_dependencies td ON t.id = td.depends_on_task_id
            WHERE td.task_id = $1
            ORDER BY td.created_at
        `;

        const result = await db.query(query, [taskId]);
        return result.rows;
    }

    /**
     * Get tasks that depend on this task
     * @param {string} taskId - Task ID
     * @returns {Promise<Array>} Array of dependent tasks
     */
    static async getDependents(taskId) {
        const db = await this.initialize();
        
        const query = `
            SELECT t.*, td.dependency_type
            FROM tasks t
            JOIN task_dependencies td ON t.id = td.task_id
            WHERE td.depends_on_task_id = $1
            ORDER BY td.created_at
        `;

        const result = await db.query(query, [taskId]);
        return result.rows;
    }

    /**
     * Get subtasks
     * @param {string} taskId - Parent task ID
     * @returns {Promise<Array>} Array of subtasks
     */
    static async getSubtasks(taskId) {
        const db = await this.initialize();
        
        const query = `
            SELECT t.*, s.order_index
            FROM tasks t
            LEFT JOIN subtasks s ON t.id = s.child_task_id
            WHERE t.parent_task_id = $1
            ORDER BY s.order_index ASC, t.created_at ASC
        `;

        const result = await db.query(query, [taskId]);
        return result.rows;
    }

    /**
     * Check if task exists
     * @param {string} taskId - Task ID
     * @returns {Promise<boolean>} True if task exists
     */
    static async exists(taskId) {
        const db = await this.initialize();
        
        const query = `SELECT 1 FROM tasks WHERE id = $1 LIMIT 1`;
        const result = await db.query(query, [taskId]);
        
        return result.rows.length > 0;
    }

    /**
     * Get task statistics
     * @param {Object} filters - Optional filters
     * @returns {Promise<Object>} Task statistics
     */
    static async getStatistics(filters = {}) {
        const db = await this.initialize();
        
        let query = `
            SELECT 
                COUNT(*) as total_tasks,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_tasks,
                COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_tasks,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tasks,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_tasks,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_tasks,
                AVG(priority) as avg_priority,
                COUNT(CASE WHEN parent_task_id IS NULL THEN 1 END) as root_tasks,
                COUNT(CASE WHEN parent_task_id IS NOT NULL THEN 1 END) as subtasks
            FROM tasks
            WHERE 1=1
        `;

        const values = [];
        let paramIndex = 1;

        if (filters.project_id) {
            query += ` AND project_id = $${paramIndex}`;
            values.push(filters.project_id);
            paramIndex++;
        }

        if (filters.assigned_agent) {
            query += ` AND assigned_agent = $${paramIndex}`;
            values.push(filters.assigned_agent);
            paramIndex++;
        }

        const result = await db.query(query, values);
        return result.rows[0];
    }
}

