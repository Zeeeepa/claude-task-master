/**
 * @fileoverview Subtask Model - Database operations for subtask relationships
 * @description Enhanced subtask model for managing hierarchical task relationships
 * @version 1.0.0
 */

import { DatabaseConnectionManager } from '../connection/connection_manager.js';

export class SubtaskModel {
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
     * Create a subtask relationship
     * @param {Object} client - Database client (for transactions)
     * @param {string} parentTaskId - Parent task ID
     * @param {string} childTaskId - Child task ID
     * @param {number} orderIndex - Order index for subtask
     * @returns {Promise<Object>} Created subtask relationship
     */
    static async create(client, parentTaskId, childTaskId, orderIndex = 0) {
        const db = client || await this.initialize();
        
        const query = `
            INSERT INTO subtasks (parent_task_id, child_task_id, order_index)
            VALUES ($1, $2, $3)
            RETURNING *
        `;

        const values = [parentTaskId, childTaskId, orderIndex];
        const result = await db.query(query, values);
        return result.rows[0];
    }

    /**
     * Get all subtasks for a parent task
     * @param {string} parentTaskId - Parent task ID
     * @returns {Promise<Array>} Array of subtask relationships
     */
    static async getByParentId(parentTaskId) {
        const db = await this.initialize();
        
        const query = `
            SELECT s.*, t.title, t.description, t.status, t.priority
            FROM subtasks s
            JOIN tasks t ON s.child_task_id = t.id
            WHERE s.parent_task_id = $1
            ORDER BY s.order_index ASC, s.created_at ASC
        `;

        const result = await db.query(query, [parentTaskId]);
        return result.rows;
    }

    /**
     * Update subtask order
     * @param {string} parentTaskId - Parent task ID
     * @param {Array} subtaskOrder - Array of {childTaskId, orderIndex} objects
     * @returns {Promise<boolean>} Success status
     */
    static async updateOrder(parentTaskId, subtaskOrder) {
        const db = await this.initialize();
        
        // Use transaction for atomic updates
        return await db.transaction(async (client) => {
            for (const { childTaskId, orderIndex } of subtaskOrder) {
                const query = `
                    UPDATE subtasks 
                    SET order_index = $1, updated_at = NOW()
                    WHERE parent_task_id = $2 AND child_task_id = $3
                `;
                await client.query(query, [orderIndex, parentTaskId, childTaskId]);
            }
            return true;
        });
    }

    /**
     * Remove subtask relationship
     * @param {string} parentTaskId - Parent task ID
     * @param {string} childTaskId - Child task ID
     * @returns {Promise<boolean>} Success status
     */
    static async remove(parentTaskId, childTaskId) {
        const db = await this.initialize();
        
        const query = `
            DELETE FROM subtasks 
            WHERE parent_task_id = $1 AND child_task_id = $2
        `;

        const result = await db.query(query, [parentTaskId, childTaskId]);
        return result.rowCount > 0;
    }

    /**
     * Remove all subtasks for a parent task
     * @param {string} parentTaskId - Parent task ID
     * @returns {Promise<number>} Number of removed subtasks
     */
    static async removeAllByParentId(parentTaskId) {
        const db = await this.initialize();
        
        const query = `DELETE FROM subtasks WHERE parent_task_id = $1`;
        const result = await db.query(query, [parentTaskId]);
        
        return result.rowCount;
    }

    /**
     * Get subtask hierarchy (recursive)
     * @param {string} rootTaskId - Root task ID
     * @param {number} maxDepth - Maximum depth to traverse
     * @returns {Promise<Object>} Hierarchical task structure
     */
    static async getHierarchy(rootTaskId, maxDepth = 10) {
        const db = await this.initialize();
        
        const query = `
            WITH RECURSIVE task_hierarchy AS (
                -- Base case: root task
                SELECT 
                    t.id, t.title, t.description, t.status, t.priority,
                    t.parent_task_id, 0 as depth,
                    ARRAY[t.id] as path
                FROM tasks t
                WHERE t.id = $1
                
                UNION ALL
                
                -- Recursive case: subtasks
                SELECT 
                    t.id, t.title, t.description, t.status, t.priority,
                    t.parent_task_id, th.depth + 1,
                    th.path || t.id
                FROM tasks t
                JOIN subtasks s ON t.id = s.child_task_id
                JOIN task_hierarchy th ON s.parent_task_id = th.id
                WHERE th.depth < $2
                  AND NOT t.id = ANY(th.path) -- Prevent cycles
            )
            SELECT * FROM task_hierarchy
            ORDER BY depth, path
        `;

        const result = await db.query(query, [rootTaskId, maxDepth]);
        return this._buildHierarchyTree(result.rows);
    }

    /**
     * Build hierarchical tree structure from flat results
     * @private
     */
    static _buildHierarchyTree(flatResults) {
        const taskMap = new Map();
        const rootTasks = [];

        // First pass: create task objects
        for (const row of flatResults) {
            const task = {
                id: row.id,
                title: row.title,
                description: row.description,
                status: row.status,
                priority: row.priority,
                depth: row.depth,
                subtasks: []
            };
            taskMap.set(row.id, task);
        }

        // Second pass: build hierarchy
        for (const row of flatResults) {
            if (row.depth === 0) {
                rootTasks.push(taskMap.get(row.id));
            } else {
                const parent = taskMap.get(row.parent_task_id);
                if (parent) {
                    parent.subtasks.push(taskMap.get(row.id));
                }
            }
        }

        return rootTasks[0] || null;
    }

    /**
     * Get subtask completion statistics
     * @param {string} parentTaskId - Parent task ID
     * @returns {Promise<Object>} Completion statistics
     */
    static async getCompletionStats(parentTaskId) {
        const db = await this.initialize();
        
        const query = `
            SELECT 
                COUNT(*) as total_subtasks,
                COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_subtasks,
                COUNT(CASE WHEN t.status = 'in_progress' THEN 1 END) as in_progress_subtasks,
                COUNT(CASE WHEN t.status = 'pending' THEN 1 END) as pending_subtasks,
                COUNT(CASE WHEN t.status = 'failed' THEN 1 END) as failed_subtasks,
                ROUND(
                    COUNT(CASE WHEN t.status = 'completed' THEN 1 END) * 100.0 / COUNT(*), 
                    2
                ) as completion_percentage
            FROM subtasks s
            JOIN tasks t ON s.child_task_id = t.id
            WHERE s.parent_task_id = $1
        `;

        const result = await db.query(query, [parentTaskId]);
        return result.rows[0];
    }

    /**
     * Check if task has subtasks
     * @param {string} taskId - Task ID
     * @returns {Promise<boolean>} True if task has subtasks
     */
    static async hasSubtasks(taskId) {
        const db = await this.initialize();
        
        const query = `SELECT 1 FROM subtasks WHERE parent_task_id = $1 LIMIT 1`;
        const result = await db.query(query, [taskId]);
        
        return result.rows.length > 0;
    }

    /**
     * Get next available order index for subtasks
     * @param {string} parentTaskId - Parent task ID
     * @returns {Promise<number>} Next order index
     */
    static async getNextOrderIndex(parentTaskId) {
        const db = await this.initialize();
        
        const query = `
            SELECT COALESCE(MAX(order_index), -1) + 1 as next_index
            FROM subtasks 
            WHERE parent_task_id = $1
        `;

        const result = await db.query(query, [parentTaskId]);
        return result.rows[0].next_index;
    }
}

