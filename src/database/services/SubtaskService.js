/**
 * @fileoverview Subtask Service - Database operations for subtask management
 * @description Provides database persistence layer for subtask operations
 * @version 1.0.0
 */

import { TaskService } from './TaskService.js';

/**
 * Subtask Service class for database operations
 * Extends TaskService to provide subtask-specific functionality
 */
export class SubtaskService extends TaskService {
    constructor(connectionManager = null) {
        super(connectionManager);
    }

    /**
     * Create a new subtask
     * @param {string} parentTaskId - Parent task ID
     * @param {Object} subtaskData - Subtask data
     * @param {string} subtaskData.title - Subtask title
     * @param {string} subtaskData.description - Subtask description
     * @param {number} [subtaskData.priority] - Subtask priority
     * @param {number} [subtaskData.order_index] - Order index for subtask ordering
     * @param {Object} [subtaskData.requirements] - Subtask requirements
     * @param {Object} [subtaskData.context] - Subtask context
     * @param {Array} [subtaskData.tags] - Subtask tags
     * @param {string} [subtaskData.created_by] - Creator identifier
     * @returns {Promise<Object>} Created subtask
     */
    async createSubtask(parentTaskId, subtaskData) {
        const client = await this.db.getConnection();
        
        try {
            await client.query('BEGIN');

            // Validate parent task exists
            const parentTask = await this.getTask(parentTaskId);
            if (!parentTask) {
                throw new Error(`Parent task with ID ${parentTaskId} not found`);
            }

            // Get the next order index if not provided
            let orderIndex = subtaskData.order_index;
            if (orderIndex === undefined) {
                const maxOrderQuery = `
                    SELECT COALESCE(MAX(CAST(context->>'order_index' AS INTEGER)), 0) + 1 as next_order
                    FROM tasks 
                    WHERE parent_task_id = $1
                `;
                const orderResult = await client.query(maxOrderQuery, [parentTaskId]);
                orderIndex = orderResult.rows[0].next_order;
            }

            // Prepare subtask data with parent reference and order
            const taskData = {
                ...subtaskData,
                project_id: parentTask.project_id,
                parent_task_id: parentTaskId,
                context: {
                    ...subtaskData.context,
                    order_index: orderIndex,
                    is_subtask: true
                }
            };

            const result = await this.createTask(taskData);
            await client.query('COMMIT');

            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw new Error(`Failed to create subtask: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Update a subtask
     * @param {string} subtaskId - Subtask ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated subtask
     */
    async updateSubtask(subtaskId, updates) {
        const client = await this.db.getConnection();
        
        try {
            await client.query('BEGIN');

            // Validate subtask exists and is actually a subtask
            const subtask = await this.getTask(subtaskId);
            if (!subtask) {
                throw new Error(`Subtask with ID ${subtaskId} not found`);
            }

            if (!subtask.parent_task_id) {
                throw new Error(`Task with ID ${subtaskId} is not a subtask`);
            }

            const result = await this.updateTask(subtaskId, updates);
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
     * Delete a subtask
     * @param {string} subtaskId - Subtask ID
     * @returns {Promise<boolean>} Success status
     */
    async deleteSubtask(subtaskId) {
        const client = await this.db.getConnection();
        
        try {
            await client.query('BEGIN');

            // Validate subtask exists and is actually a subtask
            const subtask = await this.getTask(subtaskId);
            if (!subtask) {
                throw new Error(`Subtask with ID ${subtaskId} not found`);
            }

            if (!subtask.parent_task_id) {
                throw new Error(`Task with ID ${subtaskId} is not a subtask`);
            }

            const result = await this.deleteTask(subtaskId);
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
     * Get all subtasks for a parent task
     * @param {string} parentTaskId - Parent task ID
     * @param {Object} [options] - Query options
     * @param {string} [options.status] - Filter by status
     * @param {string} [options.order_by] - Order by field (default: order_index)
     * @param {string} [options.order_direction] - Order direction (default: ASC)
     * @returns {Promise<Array>} List of subtasks
     */
    async getSubtasks(parentTaskId, options = {}) {
        const client = await this.db.getConnection();
        
        try {
            let query = `
                SELECT *, 
                       CAST(context->>'order_index' AS INTEGER) as order_index
                FROM tasks 
                WHERE parent_task_id = $1
            `;
            const values = [parentTaskId];
            let paramIndex = 2;

            // Apply status filter if provided
            if (options.status) {
                query += ` AND status = $${paramIndex}`;
                values.push(options.status);
                paramIndex++;
            }

            // Add ordering
            const orderBy = options.order_by || 'CAST(context->>\'order_index\' AS INTEGER)';
            const orderDirection = options.order_direction || 'ASC';
            query += ` ORDER BY ${orderBy} ${orderDirection}`;

            const result = await client.query(query, values);
            return result.rows;
        } catch (error) {
            throw new Error(`Failed to get subtasks: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Clear all subtasks for a parent task
     * @param {string} parentTaskId - Parent task ID
     * @returns {Promise<number>} Number of deleted subtasks
     */
    async clearSubtasks(parentTaskId) {
        const client = await this.db.getConnection();
        
        try {
            await client.query('BEGIN');

            // Validate parent task exists
            const parentTask = await this.getTask(parentTaskId);
            if (!parentTask) {
                throw new Error(`Parent task with ID ${parentTaskId} not found`);
            }

            const query = 'DELETE FROM tasks WHERE parent_task_id = $1';
            const result = await client.query(query, [parentTaskId]);

            await client.query('COMMIT');
            return result.rowCount;
        } catch (error) {
            await client.query('ROLLBACK');
            throw new Error(`Failed to clear subtasks: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Reorder subtasks for a parent task
     * @param {string} parentTaskId - Parent task ID
     * @param {Array} newOrder - Array of subtask IDs in new order
     * @returns {Promise<Array>} Updated subtasks
     */
    async reorderSubtasks(parentTaskId, newOrder) {
        const client = await this.db.getConnection();
        
        try {
            await client.query('BEGIN');

            // Validate parent task exists
            const parentTask = await this.getTask(parentTaskId);
            if (!parentTask) {
                throw new Error(`Parent task with ID ${parentTaskId} not found`);
            }

            // Validate all subtask IDs belong to the parent
            const existingSubtasks = await this.getSubtasks(parentTaskId);
            const existingIds = existingSubtasks.map(st => st.id);
            
            for (const subtaskId of newOrder) {
                if (!existingIds.includes(subtaskId)) {
                    throw new Error(`Subtask ${subtaskId} does not belong to parent task ${parentTaskId}`);
                }
            }

            // Update order_index for each subtask
            const updatedSubtasks = [];
            for (let i = 0; i < newOrder.length; i++) {
                const subtaskId = newOrder[i];
                const subtask = await this.getTask(subtaskId);
                
                const updatedContext = {
                    ...subtask.context,
                    order_index: i + 1
                };

                const updatedSubtask = await this.updateTask(subtaskId, {
                    context: updatedContext
                });
                
                updatedSubtasks.push(updatedSubtask);
            }

            await client.query('COMMIT');
            return updatedSubtasks;
        } catch (error) {
            await client.query('ROLLBACK');
            throw new Error(`Failed to reorder subtasks: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Get subtask statistics for a parent task
     * @param {string} parentTaskId - Parent task ID
     * @returns {Promise<Object>} Subtask statistics
     */
    async getSubtaskStatistics(parentTaskId) {
        const client = await this.db.getConnection();
        
        try {
            const query = `
                SELECT 
                    COUNT(*) as total_subtasks,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_subtasks,
                    COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_subtasks,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_subtasks,
                    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_subtasks,
                    AVG(priority) as avg_priority,
                    ROUND(
                        COUNT(CASE WHEN status = 'completed' THEN 1 END) * 100.0 / COUNT(*), 2
                    ) as completion_percentage
                FROM tasks
                WHERE parent_task_id = $1
            `;

            const result = await client.query(query, [parentTaskId]);
            return result.rows[0];
        } catch (error) {
            throw new Error(`Failed to get subtask statistics: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Move subtask to a different parent
     * @param {string} subtaskId - Subtask ID
     * @param {string} newParentId - New parent task ID
     * @param {number} [orderIndex] - Order index in new parent (defaults to last)
     * @returns {Promise<Object>} Updated subtask
     */
    async moveSubtaskToParent(subtaskId, newParentId, orderIndex = null) {
        const client = await this.db.getConnection();
        
        try {
            await client.query('BEGIN');

            // Validate subtask exists
            const subtask = await this.getTask(subtaskId);
            if (!subtask) {
                throw new Error(`Subtask with ID ${subtaskId} not found`);
            }

            if (!subtask.parent_task_id) {
                throw new Error(`Task with ID ${subtaskId} is not a subtask`);
            }

            // Validate new parent exists
            const newParent = await this.getTask(newParentId);
            if (!newParent) {
                throw new Error(`New parent task with ID ${newParentId} not found`);
            }

            // Get order index if not provided
            if (orderIndex === null) {
                const maxOrderQuery = `
                    SELECT COALESCE(MAX(CAST(context->>'order_index' AS INTEGER)), 0) + 1 as next_order
                    FROM tasks 
                    WHERE parent_task_id = $1
                `;
                const orderResult = await client.query(maxOrderQuery, [newParentId]);
                orderIndex = orderResult.rows[0].next_order;
            }

            // Update subtask with new parent and order
            const updatedContext = {
                ...subtask.context,
                order_index: orderIndex
            };

            const result = await this.updateTask(subtaskId, {
                parent_task_id: newParentId,
                project_id: newParent.project_id,
                context: updatedContext
            });

            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw new Error(`Failed to move subtask: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Bulk update subtask statuses
     * @param {string} parentTaskId - Parent task ID
     * @param {string} status - New status for all subtasks
     * @param {Object} [filters] - Optional filters for which subtasks to update
     * @returns {Promise<Array>} Updated subtasks
     */
    async bulkUpdateSubtaskStatus(parentTaskId, status, filters = {}) {
        const client = await this.db.getConnection();
        
        try {
            await client.query('BEGIN');

            let query = `
                UPDATE tasks 
                SET status = $1, updated_at = NOW()
                WHERE parent_task_id = $2
            `;
            const values = [status, parentTaskId];
            let paramIndex = 3;

            // Apply additional filters
            if (filters.current_status) {
                query += ` AND status = $${paramIndex}`;
                values.push(filters.current_status);
                paramIndex++;
            }

            if (filters.priority !== undefined) {
                query += ` AND priority = $${paramIndex}`;
                values.push(filters.priority);
                paramIndex++;
            }

            query += ' RETURNING *';

            const result = await client.query(query, values);
            await client.query('COMMIT');

            return result.rows;
        } catch (error) {
            await client.query('ROLLBACK');
            throw new Error(`Failed to bulk update subtask status: ${error.message}`);
        } finally {
            client.release();
        }
    }
}

export default SubtaskService;

