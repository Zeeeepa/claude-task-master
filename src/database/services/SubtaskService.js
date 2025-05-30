/**
 * @fileoverview Subtask Service for database operations
 * @description Service layer for subtask management extending TaskService
 * @version 1.0.0
 */

import { TaskService } from './TaskService.js';
import { getConnection } from '../connection/connection_manager.js';

/**
 * SubtaskService class extending TaskService for subtask operations
 */
export class SubtaskService extends TaskService {
    constructor() {
        super();
        this.db = getConnection();
    }

    /**
     * Create a new subtask
     * @param {string} parentTaskId - Parent task ID
     * @param {Object} subtaskData - Subtask data
     * @returns {Promise<Object>} Created subtask
     */
    async createSubtask(parentTaskId, subtaskData) {
        const {
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
            parentTaskId, title, description, order_index,
            assigned_to, estimated_hours, JSON.stringify(metadata)
        ];

        const result = await this.db.query(query, values);
        return result.rows[0];
    }

    /**
     * Update a subtask
     * @param {string} subtaskId - Subtask ID
     * @param {Object} updates - Update data
     * @returns {Promise<Object|null>} Updated subtask
     */
    async updateSubtask(subtaskId, updates) {
        const allowedFields = [
            'title', 'description', 'status', 'order_index', 'assigned_to',
            'estimated_hours', 'actual_hours', 'started_at', 'completed_at', 'metadata'
        ];

        const updateFields = [];
        const values = [];
        let paramCount = 0;

        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                updateFields.push(`${key} = $${++paramCount}`);
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

        const query = `
            UPDATE subtasks 
            SET ${updateFields.join(', ')}
            WHERE id = $${++paramCount}
            RETURNING *
        `;

        values.push(subtaskId);

        const result = await this.db.query(query, values);
        return result.rows[0] || null;
    }

    /**
     * Delete a subtask
     * @param {string} subtaskId - Subtask ID
     * @returns {Promise<boolean>} Success status
     */
    async deleteSubtask(subtaskId) {
        const query = 'DELETE FROM subtasks WHERE id = $1';
        const result = await this.db.query(query, [subtaskId]);
        return result.rowCount > 0;
    }

    /**
     * Get subtasks for a parent task
     * @param {string} parentTaskId - Parent task ID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Array of subtasks
     */
    async getSubtasks(parentTaskId, options = {}) {
        const {
            status = null,
            assigned_to = null,
            limit = 100,
            offset = 0
        } = options;

        let whereConditions = ['parent_task_id = $1'];
        let values = [parentTaskId];
        let paramCount = 1;

        if (status) {
            whereConditions.push(`status = $${++paramCount}`);
            values.push(status);
        }

        if (assigned_to) {
            whereConditions.push(`assigned_to = $${++paramCount}`);
            values.push(assigned_to);
        }

        const whereClause = whereConditions.join(' AND ');

        const query = `
            SELECT * FROM subtasks 
            WHERE ${whereClause}
            ORDER BY order_index ASC, created_at ASC
            LIMIT $${++paramCount} OFFSET $${++paramCount}
        `;

        values.push(limit, offset);

        const result = await this.db.query(query, values);
        return result.rows;
    }

    /**
     * Clear all subtasks for a parent task
     * @param {string} parentTaskId - Parent task ID
     * @returns {Promise<number>} Number of deleted subtasks
     */
    async clearSubtasks(parentTaskId) {
        const query = 'DELETE FROM subtasks WHERE parent_task_id = $1';
        const result = await this.db.query(query, [parentTaskId]);
        return result.rowCount;
    }

    /**
     * Reorder subtasks
     * @param {string} parentTaskId - Parent task ID
     * @param {Array<string>} newOrder - Array of subtask IDs in new order
     * @returns {Promise<Array>} Reordered subtasks
     */
    async reorderSubtasks(parentTaskId, newOrder) {
        const client = await this.db.getClient();
        
        try {
            await client.query('BEGIN');

            const reorderedSubtasks = [];
            for (let i = 0; i < newOrder.length; i++) {
                const query = `
                    UPDATE subtasks 
                    SET order_index = $1 
                    WHERE id = $2 AND parent_task_id = $3
                    RETURNING *
                `;
                
                const result = await client.query(query, [i, newOrder[i], parentTaskId]);
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

    /**
     * Get subtask statistics for a parent task
     * @param {string} parentTaskId - Parent task ID
     * @returns {Promise<Object>} Subtask statistics
     */
    async getSubtaskStatistics(parentTaskId) {
        const query = `
            SELECT 
                COUNT(*) as total_subtasks,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_subtasks,
                COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_subtasks,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_subtasks,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_subtasks,
                AVG(EXTRACT(EPOCH FROM (completed_at - started_at))/3600) as avg_completion_hours,
                SUM(estimated_hours) as total_estimated_hours,
                SUM(actual_hours) as total_actual_hours
            FROM subtasks
            WHERE parent_task_id = $1
        `;

        const result = await this.db.query(query, [parentTaskId]);
        return result.rows[0];
    }

    /**
     * Move subtask to a different parent
     * @param {string} subtaskId - Subtask ID
     * @param {string} newParentId - New parent task ID
     * @param {number} orderIndex - Order index in new parent
     * @returns {Promise<Object|null>} Updated subtask
     */
    async moveSubtaskToParent(subtaskId, newParentId, orderIndex = 0) {
        const client = await this.db.getClient();
        
        try {
            await client.query('BEGIN');

            // First, adjust order indexes in the new parent to make room
            await client.query(
                'UPDATE subtasks SET order_index = order_index + 1 WHERE parent_task_id = $1 AND order_index >= $2',
                [newParentId, orderIndex]
            );

            // Move the subtask
            const query = `
                UPDATE subtasks 
                SET parent_task_id = $1, order_index = $2, updated_at = NOW()
                WHERE id = $3
                RETURNING *
            `;

            const result = await client.query(query, [newParentId, orderIndex, subtaskId]);
            
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
     * Bulk update subtask status
     * @param {string} parentTaskId - Parent task ID
     * @param {string} status - New status
     * @param {Object} filters - Additional filters
     * @returns {Promise<Array>} Updated subtasks
     */
    async bulkUpdateSubtaskStatus(parentTaskId, status, filters = {}) {
        const {
            current_status = null,
            assigned_to = null
        } = filters;

        let whereConditions = ['parent_task_id = $1'];
        let values = [parentTaskId];
        let paramCount = 1;

        if (current_status) {
            whereConditions.push(`status = $${++paramCount}`);
            values.push(current_status);
        }

        if (assigned_to) {
            whereConditions.push(`assigned_to = $${++paramCount}`);
            values.push(assigned_to);
        }

        const whereClause = whereConditions.join(' AND ');

        // Auto-set timestamps based on status
        let additionalUpdates = '';
        if (status === 'in_progress') {
            additionalUpdates = ', started_at = COALESCE(started_at, NOW())';
        } else if (status === 'completed') {
            additionalUpdates = ', completed_at = COALESCE(completed_at, NOW())';
        }

        const query = `
            UPDATE subtasks 
            SET status = $${++paramCount}, updated_at = NOW()${additionalUpdates}
            WHERE ${whereClause}
            RETURNING *
        `;

        values.push(status);

        const result = await this.db.query(query, values);
        return result.rows;
    }

    /**
     * Get subtask completion percentage for a parent task
     * @param {string} parentTaskId - Parent task ID
     * @returns {Promise<Object>} Completion statistics
     */
    async getSubtaskCompletion(parentTaskId) {
        const query = `
            SELECT 
                COUNT(*) as total_subtasks,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_subtasks,
                CASE 
                    WHEN COUNT(*) = 0 THEN 0
                    ELSE ROUND((COUNT(CASE WHEN status = 'completed' THEN 1 END)::DECIMAL / COUNT(*)) * 100, 2)
                END as completion_percentage
            FROM subtasks
            WHERE parent_task_id = $1
        `;

        const result = await this.db.query(query, [parentTaskId]);
        return result.rows[0];
    }

    /**
     * Find subtasks by criteria
     * @param {Object} criteria - Search criteria
     * @returns {Promise<Array>} Matching subtasks
     */
    async findSubtasks(criteria = {}) {
        const {
            title_contains = null,
            status = null,
            assigned_to = null,
            parent_task_id = null,
            created_after = null,
            created_before = null,
            limit = 100,
            offset = 0
        } = criteria;

        let whereConditions = [];
        let values = [];
        let paramCount = 0;

        if (title_contains) {
            whereConditions.push(`title ILIKE $${++paramCount}`);
            values.push(`%${title_contains}%`);
        }

        if (status) {
            whereConditions.push(`status = $${++paramCount}`);
            values.push(status);
        }

        if (assigned_to) {
            whereConditions.push(`assigned_to = $${++paramCount}`);
            values.push(assigned_to);
        }

        if (parent_task_id) {
            whereConditions.push(`parent_task_id = $${++paramCount}`);
            values.push(parent_task_id);
        }

        if (created_after) {
            whereConditions.push(`created_at >= $${++paramCount}`);
            values.push(created_after);
        }

        if (created_before) {
            whereConditions.push(`created_at <= $${++paramCount}`);
            values.push(created_before);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        const query = `
            SELECT 
                s.*,
                t.title as parent_task_title,
                t.workflow_id
            FROM subtasks s
            LEFT JOIN tasks t ON s.parent_task_id = t.id
            ${whereClause}
            ORDER BY s.parent_task_id, s.order_index, s.created_at
            LIMIT $${++paramCount} OFFSET $${++paramCount}
        `;

        values.push(limit, offset);

        const result = await this.db.query(query, values);
        return result.rows;
    }
}

