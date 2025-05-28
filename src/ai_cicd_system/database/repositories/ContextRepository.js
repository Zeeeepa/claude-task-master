/**
 * @fileoverview Context Repository
 * @description Data access layer for TaskContext operations
 */

import { TaskContext } from '../models/TaskContext.js';
import { getConnection } from '../connection.js';

/**
 * Context Repository class
 * Provides data access methods for TaskContext entities
 */
export class ContextRepository {
    constructor(connection = null) {
        this.connection = connection || getConnection();
    }

    /**
     * Create a new task context
     * @param {TaskContext|Object} contextData - TaskContext instance or data object
     * @returns {Promise<TaskContext>} Created context
     */
    async create(contextData) {
        const context = contextData instanceof TaskContext ? contextData : new TaskContext(contextData);
        
        // Validate context before creation
        const validation = context.validate();
        if (!validation.valid) {
            throw new Error(`Context validation failed: ${validation.errors.join(', ')}`);
        }

        const dbData = context.toDatabase();
        const query = `
            INSERT INTO task_contexts (
                id, task_id, context_type, context_data, created_at, updated_at, metadata
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7
            ) RETURNING *
        `;

        const values = [
            dbData.id, dbData.task_id, dbData.context_type, dbData.context_data,
            dbData.created_at, dbData.updated_at, dbData.metadata
        ];

        const result = await this.connection.query(query, values);
        return TaskContext.fromDatabase(result.rows[0]);
    }

    /**
     * Find context by ID
     * @param {string} id - Context ID
     * @returns {Promise<TaskContext|null>} Context or null if not found
     */
    async findById(id) {
        const query = 'SELECT * FROM task_contexts WHERE id = $1';
        const result = await this.connection.query(query, [id]);
        
        if (result.rows.length === 0) {
            return null;
        }
        
        return TaskContext.fromDatabase(result.rows[0]);
    }

    /**
     * Find contexts by task ID
     * @param {string} taskId - Task ID
     * @param {Object} options - Query options
     * @returns {Promise<TaskContext[]>} Task contexts
     */
    async findByTaskId(taskId, options = {}) {
        const { contextType, limit = 100, offset = 0, orderBy = 'created_at DESC' } = options;
        
        let query = 'SELECT * FROM task_contexts WHERE task_id = $1';
        const values = [taskId];
        let paramIndex = 2;

        if (contextType) {
            query += ` AND context_type = $${paramIndex}`;
            values.push(contextType);
            paramIndex++;
        }

        query += ` ORDER BY ${orderBy} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await this.connection.query(query, values);
        return result.rows.map(row => TaskContext.fromDatabase(row));
    }

    /**
     * Find contexts by criteria
     * @param {Object} criteria - Search criteria
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Results with contexts and pagination info
     */
    async findBy(criteria = {}, options = {}) {
        const { limit = 50, offset = 0, orderBy = 'created_at DESC' } = options;
        
        let whereClause = 'WHERE 1=1';
        const values = [];
        let paramIndex = 1;

        if (criteria.task_id) {
            whereClause += ` AND task_id = $${paramIndex}`;
            values.push(criteria.task_id);
            paramIndex++;
        }

        if (criteria.context_type) {
            whereClause += ` AND context_type = $${paramIndex}`;
            values.push(criteria.context_type);
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
        const countQuery = `SELECT COUNT(*) FROM task_contexts ${whereClause}`;
        const countResult = await this.connection.query(countQuery, values);
        const total = parseInt(countResult.rows[0].count);

        // Main query
        const query = `
            SELECT * FROM task_contexts 
            ${whereClause} 
            ORDER BY ${orderBy} 
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        values.push(limit, offset);

        const result = await this.connection.query(query, values);
        const contexts = result.rows.map(row => TaskContext.fromDatabase(row));

        return {
            contexts,
            pagination: {
                total,
                limit,
                offset,
                hasMore: offset + limit < total
            }
        };
    }

    /**
     * Update context
     * @param {string} id - Context ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<TaskContext|null>} Updated context or null if not found
     */
    async update(id, updates) {
        const existingContext = await this.findById(id);
        if (!existingContext) {
            return null;
        }

        Object.assign(existingContext, updates);
        existingContext.updated_at = new Date();

        const validation = existingContext.validate();
        if (!validation.valid) {
            throw new Error(`Context validation failed: ${validation.errors.join(', ')}`);
        }

        const dbData = existingContext.toDatabase();
        const query = `
            UPDATE task_contexts SET
                context_type = $2, context_data = $3, updated_at = $4, metadata = $5
            WHERE id = $1
            RETURNING *
        `;

        const values = [id, dbData.context_type, dbData.context_data, dbData.updated_at, dbData.metadata];
        const result = await this.connection.query(query, values);
        return TaskContext.fromDatabase(result.rows[0]);
    }

    /**
     * Delete context
     * @param {string} id - Context ID
     * @returns {Promise<boolean>} True if deleted, false if not found
     */
    async delete(id) {
        const query = 'DELETE FROM task_contexts WHERE id = $1';
        const result = await this.connection.query(query, [id]);
        return result.rowCount > 0;
    }

    /**
     * Delete all contexts for a task
     * @param {string} taskId - Task ID
     * @returns {Promise<number>} Number of deleted contexts
     */
    async deleteByTaskId(taskId) {
        const query = 'DELETE FROM task_contexts WHERE task_id = $1';
        const result = await this.connection.query(query, [taskId]);
        return result.rowCount;
    }

    /**
     * Get context statistics
     * @param {Object} filters - Optional filters
     * @returns {Promise<Object>} Context statistics
     */
    async getStatistics(filters = {}) {
        let whereClause = 'WHERE 1=1';
        const values = [];
        let paramIndex = 1;

        if (filters.task_id) {
            whereClause += ` AND task_id = $${paramIndex}`;
            values.push(filters.task_id);
            paramIndex++;
        }

        if (filters.created_after) {
            whereClause += ` AND created_at >= $${paramIndex}`;
            values.push(filters.created_after);
            paramIndex++;
        }

        const query = `
            SELECT 
                COUNT(*) as total_contexts,
                COUNT(DISTINCT task_id) as tasks_with_contexts,
                COUNT(CASE WHEN context_type = 'requirement' THEN 1 END) as requirement_contexts,
                COUNT(CASE WHEN context_type = 'codebase' THEN 1 END) as codebase_contexts,
                COUNT(CASE WHEN context_type = 'ai_interaction' THEN 1 END) as ai_interaction_contexts,
                COUNT(CASE WHEN context_type = 'validation' THEN 1 END) as validation_contexts,
                COUNT(CASE WHEN context_type = 'workflow' THEN 1 END) as workflow_contexts,
                COUNT(CASE WHEN context_type = 'error' THEN 1 END) as error_contexts,
                AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/3600) as avg_context_lifetime_hours
            FROM task_contexts ${whereClause}
        `;

        const result = await this.connection.query(query, values);
        return result.rows[0];
    }

    /**
     * Get context timeline for a task
     * @param {string} taskId - Task ID
     * @param {Object} options - Query options
     * @returns {Promise<Object[]>} Context timeline
     */
    async getTaskTimeline(taskId, options = {}) {
        const { limit = 100, offset = 0 } = options;
        
        const query = `
            SELECT 
                tc.*,
                t.title as task_title,
                t.status as task_status
            FROM task_contexts tc
            JOIN tasks t ON tc.task_id = t.id
            WHERE tc.task_id = $1
            ORDER BY tc.created_at ASC
            LIMIT $2 OFFSET $3
        `;

        const result = await this.connection.query(query, [taskId, limit, offset]);
        return result.rows.map(row => ({
            context: TaskContext.fromDatabase(row),
            task_title: row.task_title,
            task_status: row.task_status
        }));
    }

    /**
     * Search contexts by content
     * @param {string} searchText - Text to search for in context data
     * @param {Object} options - Search options
     * @returns {Promise<TaskContext[]>} Matching contexts
     */
    async search(searchText, options = {}) {
        const { limit = 50, offset = 0, contextType } = options;
        
        let query = `
            SELECT tc.*, t.title as task_title
            FROM task_contexts tc
            JOIN tasks t ON tc.task_id = t.id
            WHERE tc.context_data::text ILIKE $1
        `;
        const values = [`%${searchText}%`];
        let paramIndex = 2;

        if (contextType) {
            query += ` AND tc.context_type = $${paramIndex}`;
            values.push(contextType);
            paramIndex++;
        }

        query += ` ORDER BY tc.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await this.connection.query(query, values);
        return result.rows.map(row => ({
            context: TaskContext.fromDatabase(row),
            task_title: row.task_title
        }));
    }

    /**
     * Get latest context by type for a task
     * @param {string} taskId - Task ID
     * @param {string} contextType - Context type
     * @returns {Promise<TaskContext|null>} Latest context or null
     */
    async getLatestByType(taskId, contextType) {
        const query = `
            SELECT * FROM task_contexts 
            WHERE task_id = $1 AND context_type = $2 
            ORDER BY created_at DESC 
            LIMIT 1
        `;
        
        const result = await this.connection.query(query, [taskId, contextType]);
        
        if (result.rows.length === 0) {
            return null;
        }
        
        return TaskContext.fromDatabase(result.rows[0]);
    }

    /**
     * Bulk create contexts
     * @param {Array} contextsData - Array of context data objects
     * @returns {Promise<TaskContext[]>} Created contexts
     */
    async bulkCreate(contextsData) {
        if (!Array.isArray(contextsData) || contextsData.length === 0) {
            return [];
        }

        const contexts = contextsData.map(data => 
            data instanceof TaskContext ? data : new TaskContext(data)
        );

        // Validate all contexts
        for (const context of contexts) {
            const validation = context.validate();
            if (!validation.valid) {
                throw new Error(`Context validation failed: ${validation.errors.join(', ')}`);
            }
        }

        // Build bulk insert query
        const valuesClauses = [];
        const allValues = [];
        let paramIndex = 1;

        for (const context of contexts) {
            const dbData = context.toDatabase();
            valuesClauses.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6})`);
            allValues.push(
                dbData.id, dbData.task_id, dbData.context_type, dbData.context_data,
                dbData.created_at, dbData.updated_at, dbData.metadata
            );
            paramIndex += 7;
        }

        const query = `
            INSERT INTO task_contexts (
                id, task_id, context_type, context_data, created_at, updated_at, metadata
            ) VALUES ${valuesClauses.join(', ')}
            RETURNING *
        `;

        const result = await this.connection.query(query, allValues);
        return result.rows.map(row => TaskContext.fromDatabase(row));
    }
}

export default ContextRepository;

