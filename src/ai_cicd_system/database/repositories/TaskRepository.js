/**
 * @fileoverview Task Repository
 * @description Data access layer for Task operations with proper abstraction
 */

import { Task } from '../models/Task.js';
import { getConnection } from '../connection.js';

/**
 * Task Repository class
 * Provides data access methods for Task entities
 */
export class TaskRepository {
    constructor(connection = null) {
        this.connection = connection || getConnection();
    }

    /**
     * Create a new task
     * @param {Task|Object} taskData - Task instance or data object
     * @returns {Promise<Task>} Created task
     */
    async create(taskData) {
        const task = taskData instanceof Task ? taskData : new Task(taskData);
        
        // Validate task before creation
        const validation = task.validate();
        if (!validation.valid) {
            throw new Error(`Task validation failed: ${validation.errors.join(', ')}`);
        }

        const dbData = task.toDatabase();
        const query = `
            INSERT INTO tasks (
                id, title, description, type, status, priority, complexity_score,
                affected_files, requirements, acceptance_criteria, parent_task_id,
                assigned_to, tags, estimated_hours, actual_hours, created_at,
                updated_at, completed_at, metadata
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
            ) RETURNING *
        `;

        const values = [
            dbData.id, dbData.title, dbData.description, dbData.type, dbData.status,
            dbData.priority, dbData.complexity_score, dbData.affected_files,
            dbData.requirements, dbData.acceptance_criteria, dbData.parent_task_id,
            dbData.assigned_to, dbData.tags, dbData.estimated_hours, dbData.actual_hours,
            dbData.created_at, dbData.updated_at, dbData.completed_at, dbData.metadata
        ];

        const result = await this.connection.query(query, values);
        return Task.fromDatabase(result.rows[0]);
    }

    /**
     * Find task by ID
     * @param {string} id - Task ID
     * @returns {Promise<Task|null>} Task or null if not found
     */
    async findById(id) {
        const query = 'SELECT * FROM tasks WHERE id = $1';
        const result = await this.connection.query(query, [id]);
        
        if (result.rows.length === 0) {
            return null;
        }
        
        return Task.fromDatabase(result.rows[0]);
    }

    /**
     * Find tasks by criteria
     * @param {Object} criteria - Search criteria
     * @param {Object} options - Query options (limit, offset, orderBy)
     * @returns {Promise<Object>} Results with tasks and pagination info
     */
    async findBy(criteria = {}, options = {}) {
        const { limit = 50, offset = 0, orderBy = 'created_at DESC' } = options;
        
        let whereClause = 'WHERE 1=1';
        const values = [];
        let paramIndex = 1;

        // Build WHERE clause dynamically
        if (criteria.status) {
            whereClause += ` AND status = $${paramIndex}`;
            values.push(criteria.status);
            paramIndex++;
        }

        if (criteria.assigned_to) {
            whereClause += ` AND assigned_to = $${paramIndex}`;
            values.push(criteria.assigned_to);
            paramIndex++;
        }

        if (criteria.type) {
            whereClause += ` AND type = $${paramIndex}`;
            values.push(criteria.type);
            paramIndex++;
        }

        if (criteria.priority !== undefined) {
            whereClause += ` AND priority = $${paramIndex}`;
            values.push(criteria.priority);
            paramIndex++;
        }

        if (criteria.parent_task_id) {
            whereClause += ` AND parent_task_id = $${paramIndex}`;
            values.push(criteria.parent_task_id);
            paramIndex++;
        }

        if (criteria.tags && criteria.tags.length > 0) {
            whereClause += ` AND tags @> $${paramIndex}`;
            values.push(JSON.stringify(criteria.tags));
            paramIndex++;
        }

        if (criteria.created_after) {
            whereClause += ` AND created_at >= $${paramIndex}`;
            values.push(criteria.created_after);
            paramIndex++;
        }

        if (criteria.created_before) {
            whereClause += ` AND created_at <= $${paramIndex}`;
            values.push(criteria.created_before);
            paramIndex++;
        }

        // Count query for pagination
        const countQuery = `SELECT COUNT(*) FROM tasks ${whereClause}`;
        const countResult = await this.connection.query(countQuery, values);
        const total = parseInt(countResult.rows[0].count);

        // Main query
        const query = `
            SELECT * FROM tasks 
            ${whereClause} 
            ORDER BY ${orderBy} 
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        values.push(limit, offset);

        const result = await this.connection.query(query, values);
        const tasks = result.rows.map(row => Task.fromDatabase(row));

        return {
            tasks,
            pagination: {
                total,
                limit,
                offset,
                hasMore: offset + limit < total
            }
        };
    }

    /**
     * Update task
     * @param {string} id - Task ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Task|null>} Updated task or null if not found
     */
    async update(id, updates) {
        // First, get the existing task
        const existingTask = await this.findById(id);
        if (!existingTask) {
            return null;
        }

        // Apply updates
        Object.assign(existingTask, updates);
        existingTask.updated_at = new Date();

        // Validate updated task
        const validation = existingTask.validate();
        if (!validation.valid) {
            throw new Error(`Task validation failed: ${validation.errors.join(', ')}`);
        }

        const dbData = existingTask.toDatabase();
        const query = `
            UPDATE tasks SET
                title = $2, description = $3, type = $4, status = $5, priority = $6,
                complexity_score = $7, affected_files = $8, requirements = $9,
                acceptance_criteria = $10, parent_task_id = $11, assigned_to = $12,
                tags = $13, estimated_hours = $14, actual_hours = $15,
                updated_at = $16, completed_at = $17, metadata = $18
            WHERE id = $1
            RETURNING *
        `;

        const values = [
            id, dbData.title, dbData.description, dbData.type, dbData.status,
            dbData.priority, dbData.complexity_score, dbData.affected_files,
            dbData.requirements, dbData.acceptance_criteria, dbData.parent_task_id,
            dbData.assigned_to, dbData.tags, dbData.estimated_hours, dbData.actual_hours,
            dbData.updated_at, dbData.completed_at, dbData.metadata
        ];

        const result = await this.connection.query(query, values);
        return Task.fromDatabase(result.rows[0]);
    }

    /**
     * Update task status
     * @param {string} id - Task ID
     * @param {string} status - New status
     * @param {Object} context - Update context
     * @returns {Promise<Task|null>} Updated task or null if not found
     */
    async updateStatus(id, status, context = {}) {
        const task = await this.findById(id);
        if (!task) {
            return null;
        }

        task.updateStatus(status, context);
        return await this.update(id, {
            status: task.status,
            completed_at: task.completed_at,
            updated_at: task.updated_at
        });
    }

    /**
     * Delete task
     * @param {string} id - Task ID
     * @returns {Promise<boolean>} True if deleted, false if not found
     */
    async delete(id) {
        const query = 'DELETE FROM tasks WHERE id = $1';
        const result = await this.connection.query(query, [id]);
        return result.rowCount > 0;
    }

    /**
     * Get task with its contexts
     * @param {string} id - Task ID
     * @returns {Promise<Object|null>} Task with contexts or null if not found
     */
    async findWithContexts(id) {
        const task = await this.findById(id);
        if (!task) {
            return null;
        }

        const contextQuery = 'SELECT * FROM task_contexts WHERE task_id = $1 ORDER BY created_at DESC';
        const contextResult = await this.connection.query(contextQuery, [id]);

        return {
            task,
            contexts: contextResult.rows
        };
    }

    /**
     * Get task dependencies
     * @param {string} id - Task ID
     * @returns {Promise<Object>} Dependencies (parents and children)
     */
    async getDependencies(id) {
        const parentQuery = `
            SELECT t.*, td.dependency_type 
            FROM tasks t 
            JOIN task_dependencies td ON t.id = td.parent_task_id 
            WHERE td.child_task_id = $1
        `;
        
        const childQuery = `
            SELECT t.*, td.dependency_type 
            FROM tasks t 
            JOIN task_dependencies td ON t.id = td.child_task_id 
            WHERE td.parent_task_id = $1
        `;

        const [parentResult, childResult] = await Promise.all([
            this.connection.query(parentQuery, [id]),
            this.connection.query(childQuery, [id])
        ]);

        return {
            parents: parentResult.rows.map(row => ({
                task: Task.fromDatabase(row),
                dependency_type: row.dependency_type
            })),
            children: childResult.rows.map(row => ({
                task: Task.fromDatabase(row),
                dependency_type: row.dependency_type
            }))
        };
    }

    /**
     * Get task statistics
     * @param {Object} filters - Optional filters
     * @returns {Promise<Object>} Task statistics
     */
    async getStatistics(filters = {}) {
        let whereClause = 'WHERE 1=1';
        const values = [];
        let paramIndex = 1;

        if (filters.assigned_to) {
            whereClause += ` AND assigned_to = $${paramIndex}`;
            values.push(filters.assigned_to);
            paramIndex++;
        }

        if (filters.created_after) {
            whereClause += ` AND created_at >= $${paramIndex}`;
            values.push(filters.created_after);
            paramIndex++;
        }

        const query = `
            SELECT 
                COUNT(*) as total_tasks,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_tasks,
                COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_tasks,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tasks,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_tasks,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_tasks,
                AVG(complexity_score) as avg_complexity,
                AVG(priority) as avg_priority,
                SUM(estimated_hours) as total_estimated_hours,
                SUM(actual_hours) as total_actual_hours,
                AVG(CASE WHEN status = 'completed' AND actual_hours IS NOT NULL AND estimated_hours IS NOT NULL 
                    THEN actual_hours / estimated_hours ELSE NULL END) as avg_estimation_accuracy
            FROM tasks ${whereClause}
        `;

        const result = await this.connection.query(query, values);
        return result.rows[0];
    }

    /**
     * Search tasks by text
     * @param {string} searchText - Text to search for
     * @param {Object} options - Search options
     * @returns {Promise<Task[]>} Matching tasks
     */
    async search(searchText, options = {}) {
        const { limit = 50, offset = 0 } = options;
        
        const query = `
            SELECT *, 
                   ts_rank(to_tsvector('english', title || ' ' || COALESCE(description, '')), 
                          plainto_tsquery('english', $1)) as rank
            FROM tasks 
            WHERE to_tsvector('english', title || ' ' || COALESCE(description, '')) 
                  @@ plainto_tsquery('english', $1)
            ORDER BY rank DESC, created_at DESC
            LIMIT $2 OFFSET $3
        `;

        const result = await this.connection.query(query, [searchText, limit, offset]);
        return result.rows.map(row => Task.fromDatabase(row));
    }
}

export default TaskRepository;

