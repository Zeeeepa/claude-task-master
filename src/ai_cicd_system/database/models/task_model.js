/**
 * @fileoverview Task Data Model
 * @description Data access layer for task operations
 */

import { log } from '../../../scripts/modules/utils.js';

/**
 * Task data model with comprehensive CRUD operations
 */
export class TaskModel {
    constructor(dbManager) {
        this.db = dbManager;
    }

    /**
     * Create a new task
     * @param {object} taskData - Task data
     * @returns {Promise<object>} Created task
     */
    async create(taskData) {
        try {
            const query = `
                INSERT INTO tasks (
                    title, description, requirements, acceptance_criteria, 
                    complexity_score, priority, dependencies, metadata,
                    affected_files, assigned_to, tags, estimated_hours
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING *
            `;
            
            const values = [
                taskData.title,
                taskData.description || null,
                JSON.stringify(taskData.requirements || []),
                JSON.stringify(taskData.acceptanceCriteria || []),
                taskData.complexityScore || 5,
                taskData.priority || 0,
                JSON.stringify(taskData.dependencies || []),
                JSON.stringify(taskData.metadata || {}),
                JSON.stringify(taskData.affectedFiles || []),
                taskData.assignedTo || null,
                JSON.stringify(taskData.tags || []),
                taskData.estimatedHours || null
            ];

            const result = await this.db.query(query, values);
            const task = this.transformRow(result.rows[0]);
            
            log('debug', `✅ Task created: ${task.id}`, {
                title: task.title,
                complexity: task.complexityScore
            });
            
            return task;
            
        } catch (error) {
            log('error', '❌ Failed to create task', {
                error: error.message,
                title: taskData.title
            });
            throw error;
        }
    }

    /**
     * Find task by ID
     * @param {string} id - Task ID
     * @returns {Promise<object|null>} Task or null
     */
    async findById(id) {
        try {
            const query = 'SELECT * FROM tasks WHERE id = $1';
            const result = await this.db.query(query, [id]);
            
            if (result.rows.length === 0) {
                return null;
            }
            
            return this.transformRow(result.rows[0]);
            
        } catch (error) {
            log('error', '❌ Failed to find task by ID', {
                error: error.message,
                taskId: id
            });
            throw error;
        }
    }

    /**
     * Update task status
     * @param {string} id - Task ID
     * @param {string} status - New status
     * @param {Date} completedAt - Completion timestamp
     * @returns {Promise<object|null>} Updated task
     */
    async updateStatus(id, status, completedAt = null) {
        try {
            const query = `
                UPDATE tasks 
                SET status = $1, completed_at = $2, updated_at = NOW()
                WHERE id = $3
                RETURNING *
            `;
            
            const result = await this.db.query(query, [status, completedAt, id]);
            
            if (result.rows.length === 0) {
                return null;
            }
            
            const task = this.transformRow(result.rows[0]);
            
            log('debug', `✅ Task status updated: ${id}`, {
                status,
                completedAt
            });
            
            return task;
            
        } catch (error) {
            log('error', '❌ Failed to update task status', {
                error: error.message,
                taskId: id,
                status
            });
            throw error;
        }
    }

    /**
     * Update task data
     * @param {string} id - Task ID
     * @param {object} updates - Fields to update
     * @returns {Promise<object|null>} Updated task
     */
    async update(id, updates) {
        try {
            const allowedFields = [
                'title', 'description', 'requirements', 'acceptance_criteria',
                'complexity_score', 'priority', 'dependencies', 'metadata',
                'affected_files', 'assigned_to', 'tags', 'estimated_hours',
                'actual_hours', 'status'
            ];
            
            const updateFields = [];
            const values = [];
            let paramIndex = 1;
            
            for (const [field, value] of Object.entries(updates)) {
                if (allowedFields.includes(field)) {
                    const dbField = this._camelToSnake(field);
                    updateFields.push(`${dbField} = $${paramIndex}`);
                    
                    // Handle JSON fields
                    if (['requirements', 'acceptance_criteria', 'dependencies', 
                         'metadata', 'affected_files', 'tags'].includes(field)) {
                        values.push(JSON.stringify(value));
                    } else {
                        values.push(value);
                    }
                    paramIndex++;
                }
            }
            
            if (updateFields.length === 0) {
                throw new Error('No valid fields to update');
            }
            
            updateFields.push(`updated_at = NOW()`);
            values.push(id);
            
            const query = `
                UPDATE tasks 
                SET ${updateFields.join(', ')}
                WHERE id = $${paramIndex}
                RETURNING *
            `;
            
            const result = await this.db.query(query, values);
            
            if (result.rows.length === 0) {
                return null;
            }
            
            const task = this.transformRow(result.rows[0]);
            
            log('debug', `✅ Task updated: ${id}`, {
                fieldsUpdated: Object.keys(updates)
            });
            
            return task;
            
        } catch (error) {
            log('error', '❌ Failed to update task', {
                error: error.message,
                taskId: id,
                updates: Object.keys(updates)
            });
            throw error;
        }
    }

    /**
     * Find tasks by status
     * @param {string} status - Task status
     * @param {number} limit - Maximum number of results
     * @param {number} offset - Offset for pagination
     * @returns {Promise<Array>} Array of tasks
     */
    async findByStatus(status, limit = 100, offset = 0) {
        try {
            const query = `
                SELECT * FROM tasks 
                WHERE status = $1 
                ORDER BY created_at DESC 
                LIMIT $2 OFFSET $3
            `;
            
            const result = await this.db.query(query, [status, limit, offset]);
            return result.rows.map(row => this.transformRow(row));
            
        } catch (error) {
            log('error', '❌ Failed to find tasks by status', {
                error: error.message,
                status
            });
            throw error;
        }
    }

    /**
     * Find tasks by assignee
     * @param {string} assignedTo - Assignee identifier
     * @param {number} limit - Maximum number of results
     * @returns {Promise<Array>} Array of tasks
     */
    async findByAssignee(assignedTo, limit = 100) {
        try {
            const query = `
                SELECT * FROM tasks 
                WHERE assigned_to = $1 
                ORDER BY priority DESC, created_at DESC 
                LIMIT $2
            `;
            
            const result = await this.db.query(query, [assignedTo, limit]);
            return result.rows.map(row => this.transformRow(row));
            
        } catch (error) {
            log('error', '❌ Failed to find tasks by assignee', {
                error: error.message,
                assignedTo
            });
            throw error;
        }
    }

    /**
     * Search tasks by text
     * @param {string} searchText - Search text
     * @param {number} limit - Maximum number of results
     * @returns {Promise<Array>} Array of tasks
     */
    async search(searchText, limit = 50) {
        try {
            const query = `
                SELECT *, 
                       ts_rank(to_tsvector('english', title || ' ' || COALESCE(description, '')), 
                              plainto_tsquery('english', $1)) as rank
                FROM tasks 
                WHERE to_tsvector('english', title || ' ' || COALESCE(description, '')) 
                      @@ plainto_tsquery('english', $1)
                ORDER BY rank DESC, created_at DESC
                LIMIT $2
            `;
            
            const result = await this.db.query(query, [searchText, limit]);
            return result.rows.map(row => this.transformRow(row));
            
        } catch (error) {
            log('error', '❌ Failed to search tasks', {
                error: error.message,
                searchText
            });
            throw error;
        }
    }

    /**
     * Get task statistics
     * @returns {Promise<object>} Task statistics
     */
    async getStatistics() {
        try {
            const query = `
                SELECT 
                    COUNT(*) as total_tasks,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_tasks,
                    COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_tasks,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tasks,
                    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_tasks,
                    COUNT(CASE WHEN status = 'blocked' THEN 1 END) as blocked_tasks,
                    AVG(complexity_score) as avg_complexity,
                    SUM(estimated_hours) as total_estimated_hours,
                    SUM(actual_hours) as total_actual_hours,
                    AVG(CASE WHEN completed_at IS NOT NULL AND estimated_hours IS NOT NULL 
                        THEN actual_hours / estimated_hours END) as avg_estimation_accuracy
                FROM tasks
            `;
            
            const result = await this.db.query(query);
            const stats = result.rows[0];
            
            return {
                totalTasks: parseInt(stats.total_tasks),
                pendingTasks: parseInt(stats.pending_tasks),
                inProgressTasks: parseInt(stats.in_progress_tasks),
                completedTasks: parseInt(stats.completed_tasks),
                failedTasks: parseInt(stats.failed_tasks),
                blockedTasks: parseInt(stats.blocked_tasks),
                avgComplexity: parseFloat(stats.avg_complexity) || 0,
                totalEstimatedHours: parseFloat(stats.total_estimated_hours) || 0,
                totalActualHours: parseFloat(stats.total_actual_hours) || 0,
                avgEstimationAccuracy: parseFloat(stats.avg_estimation_accuracy) || 0
            };
            
        } catch (error) {
            log('error', '❌ Failed to get task statistics', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Delete task by ID
     * @param {string} id - Task ID
     * @returns {Promise<boolean>} Success status
     */
    async delete(id) {
        try {
            const query = 'DELETE FROM tasks WHERE id = $1';
            const result = await this.db.query(query, [id]);
            
            const deleted = result.rowCount > 0;
            
            if (deleted) {
                log('debug', `✅ Task deleted: ${id}`);
            }
            
            return deleted;
            
        } catch (error) {
            log('error', '❌ Failed to delete task', {
                error: error.message,
                taskId: id
            });
            throw error;
        }
    }

    /**
     * Transform database row to application object
     * @param {object} row - Database row
     * @returns {object} Transformed task object
     */
    transformRow(row) {
        return {
            id: row.id,
            title: row.title,
            description: row.description,
            requirements: row.requirements || [],
            acceptanceCriteria: row.acceptance_criteria || [],
            complexityScore: row.complexity_score,
            status: row.status,
            priority: row.priority,
            dependencies: row.dependencies || [],
            metadata: row.metadata || {},
            affectedFiles: row.affected_files || [],
            assignedTo: row.assigned_to,
            tags: row.tags || [],
            estimatedHours: row.estimated_hours,
            actualHours: row.actual_hours,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            completedAt: row.completed_at
        };
    }

    /**
     * Convert camelCase to snake_case
     * @private
     */
    _camelToSnake(str) {
        return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    }
}

export default TaskModel;

