/**
 * Correlations Model
 * Database model for Linear-Task correlations in Task Master orchestrator
 * 
 * Manages bidirectional relationships between Linear issues and internal tasks,
 * enabling seamless synchronization and tracking.
 */

import { logger } from '../../utils/logger.js';

/**
 * Correlations model class
 */
export class CorrelationsModel {
    constructor(database) {
        this.db = database;
        this.tableName = 'correlations';
    }

    /**
     * Initialize the correlations table
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            await this._createTable();
            logger.debug('Correlations model initialized');
        } catch (error) {
            logger.error('Failed to initialize correlations model:', error);
            throw error;
        }
    }

    /**
     * Create a new correlation
     * @param {Object} correlationData - Correlation data
     * @returns {Promise<Object>} Created correlation
     */
    async create(correlationData) {
        try {
            const correlation = {
                id: this._generateId(),
                linearIssueId: correlationData.linearIssueId,
                linearIssueNumber: correlationData.linearIssueNumber,
                linearTeamId: correlationData.linearTeamId,
                taskId: correlationData.taskId,
                requirementId: correlationData.requirementId || null,
                correlationType: correlationData.correlationType || 'one-to-one',
                syncDirection: correlationData.syncDirection || 'bidirectional',
                syncStatus: correlationData.syncStatus || 'active',
                lastSyncAt: correlationData.lastSyncAt || null,
                linearData: JSON.stringify(correlationData.linearData || {}),
                taskData: JSON.stringify(correlationData.taskData || {}),
                metadata: JSON.stringify(correlationData.metadata || {}),
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: correlationData.createdBy || 'system',
                updatedBy: correlationData.updatedBy || 'system'
            };

            await this._validateCorrelation(correlation);
            
            const result = await this.db.insert(this.tableName, correlation);
            logger.debug(`Created correlation: ${correlation.id}`);
            
            return this._formatCorrelation(result);
        } catch (error) {
            logger.error('Failed to create correlation:', error);
            throw error;
        }
    }

    /**
     * Get correlation by ID
     * @param {string} id - Correlation ID
     * @returns {Promise<Object|null>} Correlation or null if not found
     */
    async getById(id) {
        try {
            const result = await this.db.findOne(this.tableName, { id });
            return result ? this._formatCorrelation(result) : null;
        } catch (error) {
            logger.error(`Failed to get correlation ${id}:`, error);
            throw error;
        }
    }

    /**
     * Update correlation
     * @param {string} id - Correlation ID
     * @param {Object} updates - Updates to apply
     * @returns {Promise<Object>} Updated correlation
     */
    async update(id, updates) {
        try {
            const existing = await this.getById(id);
            if (!existing) {
                throw new Error(`Correlation not found: ${id}`);
            }

            const updatedData = {
                ...updates,
                updatedAt: new Date(),
                updatedBy: updates.updatedBy || 'system'
            };

            // Handle JSON fields
            if (updates.linearData) {
                updatedData.linearData = JSON.stringify(updates.linearData);
            }
            if (updates.taskData) {
                updatedData.taskData = JSON.stringify(updates.taskData);
            }
            if (updates.metadata) {
                updatedData.metadata = JSON.stringify(updates.metadata);
            }

            await this._validateCorrelation({ ...existing, ...updatedData });
            
            const result = await this.db.update(this.tableName, { id }, updatedData);
            logger.debug(`Updated correlation: ${id}`);
            
            return this._formatCorrelation(result);
        } catch (error) {
            logger.error(`Failed to update correlation ${id}:`, error);
            throw error;
        }
    }

    /**
     * Delete correlation
     * @param {string} id - Correlation ID
     * @returns {Promise<boolean>} True if deleted
     */
    async delete(id) {
        try {
            const result = await this.db.delete(this.tableName, { id });
            logger.debug(`Deleted correlation: ${id}`);
            return result > 0;
        } catch (error) {
            logger.error(`Failed to delete correlation ${id}:`, error);
            throw error;
        }
    }

    /**
     * Find correlations by criteria
     * @param {Object} criteria - Search criteria
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Array of correlations
     */
    async find(criteria = {}, options = {}) {
        try {
            const results = await this.db.find(this.tableName, criteria, options);
            return results.map(result => this._formatCorrelation(result));
        } catch (error) {
            logger.error('Failed to find correlations:', error);
            throw error;
        }
    }

    /**
     * Find correlation by Linear issue ID
     * @param {string} linearIssueId - Linear issue ID
     * @returns {Promise<Object|null>} Correlation or null if not found
     */
    async findByLinearIssue(linearIssueId) {
        try {
            const result = await this.db.findOne(this.tableName, { linearIssueId });
            return result ? this._formatCorrelation(result) : null;
        } catch (error) {
            logger.error(`Failed to find correlation for Linear issue ${linearIssueId}:`, error);
            throw error;
        }
    }

    /**
     * Find correlation by task ID
     * @param {string} taskId - Task ID
     * @returns {Promise<Object|null>} Correlation or null if not found
     */
    async findByTask(taskId) {
        try {
            const result = await this.db.findOne(this.tableName, { taskId });
            return result ? this._formatCorrelation(result) : null;
        } catch (error) {
            logger.error(`Failed to find correlation for task ${taskId}:`, error);
            throw error;
        }
    }

    /**
     * Find correlations by Linear team
     * @param {string} linearTeamId - Linear team ID
     * @returns {Promise<Array>} Array of correlations
     */
    async findByLinearTeam(linearTeamId) {
        return this.find({ linearTeamId });
    }

    /**
     * Find correlations by requirement
     * @param {string} requirementId - Requirement ID
     * @returns {Promise<Array>} Array of correlations
     */
    async findByRequirement(requirementId) {
        return this.find({ requirementId });
    }

    /**
     * Find correlations by sync status
     * @param {string} syncStatus - Sync status
     * @returns {Promise<Array>} Array of correlations
     */
    async findBySyncStatus(syncStatus) {
        return this.find({ syncStatus });
    }

    /**
     * Find correlations needing sync
     * @param {number} olderThanMinutes - Find correlations not synced in X minutes
     * @returns {Promise<Array>} Array of correlations needing sync
     */
    async findNeedingSync(olderThanMinutes = 60) {
        try {
            const cutoffTime = new Date(Date.now() - (olderThanMinutes * 60 * 1000));
            const criteria = {
                syncStatus: 'active',
                $or: [
                    { lastSyncAt: null },
                    { lastSyncAt: { $lt: cutoffTime } }
                ]
            };
            return this.find(criteria);
        } catch (error) {
            logger.error('Failed to find correlations needing sync:', error);
            throw error;
        }
    }

    /**
     * Update sync status
     * @param {string} id - Correlation ID
     * @param {string} status - New sync status
     * @param {Date} lastSyncAt - Last sync timestamp
     * @returns {Promise<Object>} Updated correlation
     */
    async updateSyncStatus(id, status, lastSyncAt = new Date()) {
        return this.update(id, {
            syncStatus: status,
            lastSyncAt: lastSyncAt
        });
    }

    /**
     * Create or update correlation
     * @param {Object} correlationData - Correlation data
     * @returns {Promise<Object>} Created or updated correlation
     */
    async upsert(correlationData) {
        try {
            // Try to find existing correlation
            let existing = null;
            
            if (correlationData.linearIssueId) {
                existing = await this.findByLinearIssue(correlationData.linearIssueId);
            } else if (correlationData.taskId) {
                existing = await this.findByTask(correlationData.taskId);
            }

            if (existing) {
                return this.update(existing.id, correlationData);
            } else {
                return this.create(correlationData);
            }
        } catch (error) {
            logger.error('Failed to upsert correlation:', error);
            throw error;
        }
    }

    /**
     * Get correlation statistics
     * @returns {Promise<Object>} Statistics object
     */
    async getStatistics() {
        try {
            const stats = {
                total: await this.db.count(this.tableName),
                byType: {},
                bySyncStatus: {},
                byDirection: {},
                recentlyActive: 0,
                needingSync: 0
            };

            // Get counts by correlation type
            const typeCounts = await this.db.aggregate(this.tableName, [
                { $group: { _id: '$correlation_type', count: { $sum: 1 } } }
            ]);
            typeCounts.forEach(item => {
                stats.byType[item._id] = item.count;
            });

            // Get counts by sync status
            const statusCounts = await this.db.aggregate(this.tableName, [
                { $group: { _id: '$sync_status', count: { $sum: 1 } } }
            ]);
            statusCounts.forEach(item => {
                stats.bySyncStatus[item._id] = item.count;
            });

            // Get counts by sync direction
            const directionCounts = await this.db.aggregate(this.tableName, [
                { $group: { _id: '$sync_direction', count: { $sum: 1 } } }
            ]);
            directionCounts.forEach(item => {
                stats.byDirection[item._id] = item.count;
            });

            // Get recently active count (synced in last hour)
            const oneHourAgo = new Date(Date.now() - (60 * 60 * 1000));
            stats.recentlyActive = await this.db.count(this.tableName, {
                lastSyncAt: { $gte: oneHourAgo }
            });

            // Get needing sync count
            const needingSyncCorrelations = await this.findNeedingSync();
            stats.needingSync = needingSyncCorrelations.length;

            return stats;
        } catch (error) {
            logger.error('Failed to get correlation statistics:', error);
            throw error;
        }
    }

    /**
     * Create table schema
     * @private
     */
    async _createTable() {
        const schema = `
            CREATE TABLE IF NOT EXISTS ${this.tableName} (
                id VARCHAR(255) PRIMARY KEY,
                linear_issue_id VARCHAR(255) NOT NULL,
                linear_issue_number INTEGER,
                linear_team_id VARCHAR(255),
                task_id VARCHAR(255) NOT NULL,
                requirement_id VARCHAR(255),
                correlation_type VARCHAR(50) NOT NULL DEFAULT 'one-to-one',
                sync_direction VARCHAR(50) NOT NULL DEFAULT 'bidirectional',
                sync_status VARCHAR(50) NOT NULL DEFAULT 'active',
                last_sync_at TIMESTAMP,
                linear_data TEXT,
                task_data TEXT,
                metadata TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_by VARCHAR(255) DEFAULT 'system',
                updated_by VARCHAR(255) DEFAULT 'system',
                UNIQUE KEY unique_linear_issue (linear_issue_id),
                UNIQUE KEY unique_task (task_id),
                INDEX idx_linear_team (linear_team_id),
                INDEX idx_requirement (requirement_id),
                INDEX idx_sync_status (sync_status),
                INDEX idx_sync_direction (sync_direction),
                INDEX idx_last_sync (last_sync_at),
                INDEX idx_created_at (created_at)
            )
        `;
        
        await this.db.execute(schema);
    }

    /**
     * Validate correlation data
     * @param {Object} correlation - Correlation to validate
     * @private
     */
    async _validateCorrelation(correlation) {
        const errors = [];

        if (!correlation.linearIssueId || correlation.linearIssueId.trim().length === 0) {
            errors.push('Linear issue ID is required');
        }

        if (!correlation.taskId || correlation.taskId.trim().length === 0) {
            errors.push('Task ID is required');
        }

        const validTypes = ['one-to-one', 'one-to-many', 'many-to-one', 'many-to-many'];
        if (!validTypes.includes(correlation.correlationType)) {
            errors.push(`Invalid correlation type. Must be one of: ${validTypes.join(', ')}`);
        }

        const validDirections = ['bidirectional', 'linear-to-task', 'task-to-linear'];
        if (!validDirections.includes(correlation.syncDirection)) {
            errors.push(`Invalid sync direction. Must be one of: ${validDirections.join(', ')}`);
        }

        const validStatuses = ['active', 'paused', 'disabled', 'error'];
        if (!validStatuses.includes(correlation.syncStatus)) {
            errors.push(`Invalid sync status. Must be one of: ${validStatuses.join(', ')}`);
        }

        if (errors.length > 0) {
            throw new Error(`Correlation validation failed: ${errors.join(', ')}`);
        }
    }

    /**
     * Format correlation for output
     * @param {Object} raw - Raw database result
     * @returns {Object} Formatted correlation
     * @private
     */
    _formatCorrelation(raw) {
        return {
            id: raw.id,
            linearIssueId: raw.linear_issue_id,
            linearIssueNumber: raw.linear_issue_number,
            linearTeamId: raw.linear_team_id,
            taskId: raw.task_id,
            requirementId: raw.requirement_id,
            correlationType: raw.correlation_type,
            syncDirection: raw.sync_direction,
            syncStatus: raw.sync_status,
            lastSyncAt: raw.last_sync_at,
            linearData: raw.linear_data ? JSON.parse(raw.linear_data) : {},
            taskData: raw.task_data ? JSON.parse(raw.task_data) : {},
            metadata: raw.metadata ? JSON.parse(raw.metadata) : {},
            createdAt: raw.created_at,
            updatedAt: raw.updated_at,
            createdBy: raw.created_by,
            updatedBy: raw.updated_by
        };
    }

    /**
     * Generate unique ID
     * @returns {string} Unique ID
     * @private
     */
    _generateId() {
        return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

export default CorrelationsModel;

