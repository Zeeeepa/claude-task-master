/**
 * @fileoverview Context Data Model
 * @description Data access layer for context operations
 */

import { log } from '../../../scripts/modules/utils.js';

/**
 * Context data model for storing task-related contextual information
 */
export class ContextModel {
    constructor(dbManager) {
        this.db = dbManager;
    }

    /**
     * Create a new context entry
     * @param {string} taskId - Task ID
     * @param {string} contextType - Type of context
     * @param {object} contextData - Context data
     * @param {object} metadata - Additional metadata
     * @returns {Promise<object>} Created context entry
     */
    async create(taskId, contextType, contextData, metadata = {}) {
        try {
            const query = `
                INSERT INTO contexts (task_id, context_type, context_data, metadata)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            `;
            
            const values = [
                taskId,
                contextType,
                JSON.stringify(contextData),
                JSON.stringify(metadata)
            ];

            const result = await this.db.query(query, values);
            const context = this.transformRow(result.rows[0]);
            
            log('debug', `✅ Context created: ${context.id}`, {
                taskId,
                contextType
            });
            
            return context;
            
        } catch (error) {
            log('error', '❌ Failed to create context', {
                error: error.message,
                taskId,
                contextType
            });
            throw error;
        }
    }

    /**
     * Find context by ID
     * @param {string} id - Context ID
     * @returns {Promise<object|null>} Context or null
     */
    async findById(id) {
        try {
            const query = 'SELECT * FROM contexts WHERE id = $1';
            const result = await this.db.query(query, [id]);
            
            if (result.rows.length === 0) {
                return null;
            }
            
            return this.transformRow(result.rows[0]);
            
        } catch (error) {
            log('error', '❌ Failed to find context by ID', {
                error: error.message,
                contextId: id
            });
            throw error;
        }
    }

    /**
     * Find all contexts for a task
     * @param {string} taskId - Task ID
     * @param {string} contextType - Optional context type filter
     * @returns {Promise<Array>} Array of contexts
     */
    async findByTaskId(taskId, contextType = null) {
        try {
            let query = 'SELECT * FROM contexts WHERE task_id = $1';
            const values = [taskId];
            
            if (contextType) {
                query += ' AND context_type = $2';
                values.push(contextType);
            }
            
            query += ' ORDER BY created_at ASC';
            
            const result = await this.db.query(query, values);
            return result.rows.map(row => this.transformRow(row));
            
        } catch (error) {
            log('error', '❌ Failed to find contexts by task ID', {
                error: error.message,
                taskId,
                contextType
            });
            throw error;
        }
    }

    /**
     * Find contexts by type across all tasks
     * @param {string} contextType - Context type
     * @param {number} limit - Maximum number of results
     * @param {number} offset - Offset for pagination
     * @returns {Promise<Array>} Array of contexts
     */
    async findByType(contextType, limit = 100, offset = 0) {
        try {
            const query = `
                SELECT * FROM contexts 
                WHERE context_type = $1 
                ORDER BY created_at DESC 
                LIMIT $2 OFFSET $3
            `;
            
            const result = await this.db.query(query, [contextType, limit, offset]);
            return result.rows.map(row => this.transformRow(row));
            
        } catch (error) {
            log('error', '❌ Failed to find contexts by type', {
                error: error.message,
                contextType
            });
            throw error;
        }
    }

    /**
     * Update context data
     * @param {string} id - Context ID
     * @param {object} contextData - New context data
     * @param {object} metadata - Updated metadata
     * @returns {Promise<object|null>} Updated context
     */
    async update(id, contextData, metadata = null) {
        try {
            let query = `
                UPDATE contexts 
                SET context_data = $1, updated_at = NOW()
            `;
            const values = [JSON.stringify(contextData)];
            let paramIndex = 2;
            
            if (metadata !== null) {
                query += `, metadata = $${paramIndex}`;
                values.push(JSON.stringify(metadata));
                paramIndex++;
            }
            
            query += ` WHERE id = $${paramIndex} RETURNING *`;
            values.push(id);
            
            const result = await this.db.query(query, values);
            
            if (result.rows.length === 0) {
                return null;
            }
            
            const context = this.transformRow(result.rows[0]);
            
            log('debug', `✅ Context updated: ${id}`);
            
            return context;
            
        } catch (error) {
            log('error', '❌ Failed to update context', {
                error: error.message,
                contextId: id
            });
            throw error;
        }
    }

    /**
     * Get context statistics for a task
     * @param {string} taskId - Task ID
     * @returns {Promise<object>} Context statistics
     */
    async getTaskContextStats(taskId) {
        try {
            const query = `
                SELECT 
                    context_type,
                    COUNT(*) as count,
                    MIN(created_at) as first_created,
                    MAX(created_at) as last_created
                FROM contexts 
                WHERE task_id = $1 
                GROUP BY context_type
                ORDER BY count DESC
            `;
            
            const result = await this.db.query(query, [taskId]);
            
            const stats = {
                totalContexts: 0,
                contextTypes: {},
                firstContext: null,
                lastContext: null
            };
            
            result.rows.forEach(row => {
                stats.totalContexts += parseInt(row.count);
                stats.contextTypes[row.context_type] = {
                    count: parseInt(row.count),
                    firstCreated: row.first_created,
                    lastCreated: row.last_created
                };
                
                if (!stats.firstContext || row.first_created < stats.firstContext) {
                    stats.firstContext = row.first_created;
                }
                
                if (!stats.lastContext || row.last_created > stats.lastContext) {
                    stats.lastContext = row.last_created;
                }
            });
            
            return stats;
            
        } catch (error) {
            log('error', '❌ Failed to get context statistics', {
                error: error.message,
                taskId
            });
            throw error;
        }
    }

    /**
     * Search contexts by content
     * @param {string} searchText - Search text
     * @param {string} contextType - Optional context type filter
     * @param {number} limit - Maximum number of results
     * @returns {Promise<Array>} Array of contexts
     */
    async search(searchText, contextType = null, limit = 50) {
        try {
            let query = `
                SELECT * FROM contexts 
                WHERE context_data::text ILIKE $1
            `;
            const values = [`%${searchText}%`];
            let paramIndex = 2;
            
            if (contextType) {
                query += ` AND context_type = $${paramIndex}`;
                values.push(contextType);
                paramIndex++;
            }
            
            query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
            values.push(limit);
            
            const result = await this.db.query(query, values);
            return result.rows.map(row => this.transformRow(row));
            
        } catch (error) {
            log('error', '❌ Failed to search contexts', {
                error: error.message,
                searchText,
                contextType
            });
            throw error;
        }
    }

    /**
     * Get recent AI interactions for a task
     * @param {string} taskId - Task ID
     * @param {number} limit - Maximum number of results
     * @returns {Promise<Array>} Array of AI interaction contexts
     */
    async getRecentAIInteractions(taskId, limit = 10) {
        try {
            const query = `
                SELECT * FROM contexts 
                WHERE task_id = $1 AND context_type = 'ai_interaction'
                ORDER BY created_at DESC 
                LIMIT $2
            `;
            
            const result = await this.db.query(query, [taskId, limit]);
            return result.rows.map(row => this.transformRow(row));
            
        } catch (error) {
            log('error', '❌ Failed to get recent AI interactions', {
                error: error.message,
                taskId
            });
            throw error;
        }
    }

    /**
     * Get validation results for a task
     * @param {string} taskId - Task ID
     * @returns {Promise<Array>} Array of validation contexts
     */
    async getValidationResults(taskId) {
        try {
            const query = `
                SELECT * FROM contexts 
                WHERE task_id = $1 AND context_type = 'validation'
                ORDER BY created_at DESC
            `;
            
            const result = await this.db.query(query, [taskId]);
            return result.rows.map(row => this.transformRow(row));
            
        } catch (error) {
            log('error', '❌ Failed to get validation results', {
                error: error.message,
                taskId
            });
            throw error;
        }
    }

    /**
     * Delete context by ID
     * @param {string} id - Context ID
     * @returns {Promise<boolean>} Success status
     */
    async delete(id) {
        try {
            const query = 'DELETE FROM contexts WHERE id = $1';
            const result = await this.db.query(query, [id]);
            
            const deleted = result.rowCount > 0;
            
            if (deleted) {
                log('debug', `✅ Context deleted: ${id}`);
            }
            
            return deleted;
            
        } catch (error) {
            log('error', '❌ Failed to delete context', {
                error: error.message,
                contextId: id
            });
            throw error;
        }
    }

    /**
     * Delete all contexts for a task
     * @param {string} taskId - Task ID
     * @param {string} contextType - Optional context type filter
     * @returns {Promise<number>} Number of deleted contexts
     */
    async deleteByTaskId(taskId, contextType = null) {
        try {
            let query = 'DELETE FROM contexts WHERE task_id = $1';
            const values = [taskId];
            
            if (contextType) {
                query += ' AND context_type = $2';
                values.push(contextType);
            }
            
            const result = await this.db.query(query, values);
            
            log('debug', `✅ Deleted ${result.rowCount} contexts for task: ${taskId}`, {
                contextType
            });
            
            return result.rowCount;
            
        } catch (error) {
            log('error', '❌ Failed to delete contexts by task ID', {
                error: error.message,
                taskId,
                contextType
            });
            throw error;
        }
    }

    /**
     * Transform database row to application object
     * @param {object} row - Database row
     * @returns {object} Transformed context object
     */
    transformRow(row) {
        return {
            id: row.id,
            taskId: row.task_id,
            contextType: row.context_type,
            contextData: row.context_data,
            metadata: row.metadata || {},
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}

export default ContextModel;

