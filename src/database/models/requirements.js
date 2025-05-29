/**
 * Requirements Model
 * Database model for requirement definitions in Task Master orchestrator
 * 
 * Manages requirement storage, validation, and relationships with tasks and issues.
 */

import { logger } from '../../utils/logger.js';

/**
 * Requirements model class
 */
export class RequirementsModel {
    constructor(database) {
        this.db = database;
        this.tableName = 'requirements';
    }

    /**
     * Initialize the requirements table
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            await this._createTable();
            logger.debug('Requirements model initialized');
        } catch (error) {
            logger.error('Failed to initialize requirements model:', error);
            throw error;
        }
    }

    /**
     * Create a new requirement
     * @param {Object} requirementData - Requirement data
     * @returns {Promise<Object>} Created requirement
     */
    async create(requirementData) {
        try {
            const requirement = {
                id: this._generateId(),
                title: requirementData.title,
                description: requirementData.description,
                type: requirementData.type || 'functional',
                priority: requirementData.priority || 'medium',
                status: requirementData.status || 'draft',
                source: requirementData.source || 'manual',
                sourceId: requirementData.sourceId || null,
                metadata: JSON.stringify(requirementData.metadata || {}),
                tags: JSON.stringify(requirementData.tags || []),
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: requirementData.createdBy || 'system',
                updatedBy: requirementData.updatedBy || 'system'
            };

            await this._validateRequirement(requirement);
            
            const result = await this.db.insert(this.tableName, requirement);
            logger.debug(`Created requirement: ${requirement.id}`);
            
            return this._formatRequirement(result);
        } catch (error) {
            logger.error('Failed to create requirement:', error);
            throw error;
        }
    }

    /**
     * Get requirement by ID
     * @param {string} id - Requirement ID
     * @returns {Promise<Object|null>} Requirement or null if not found
     */
    async getById(id) {
        try {
            const result = await this.db.findOne(this.tableName, { id });
            return result ? this._formatRequirement(result) : null;
        } catch (error) {
            logger.error(`Failed to get requirement ${id}:`, error);
            throw error;
        }
    }

    /**
     * Update requirement
     * @param {string} id - Requirement ID
     * @param {Object} updates - Updates to apply
     * @returns {Promise<Object>} Updated requirement
     */
    async update(id, updates) {
        try {
            const existing = await this.getById(id);
            if (!existing) {
                throw new Error(`Requirement not found: ${id}`);
            }

            const updatedData = {
                ...updates,
                updatedAt: new Date(),
                updatedBy: updates.updatedBy || 'system'
            };

            // Handle JSON fields
            if (updates.metadata) {
                updatedData.metadata = JSON.stringify(updates.metadata);
            }
            if (updates.tags) {
                updatedData.tags = JSON.stringify(updates.tags);
            }

            await this._validateRequirement({ ...existing, ...updatedData });
            
            const result = await this.db.update(this.tableName, { id }, updatedData);
            logger.debug(`Updated requirement: ${id}`);
            
            return this._formatRequirement(result);
        } catch (error) {
            logger.error(`Failed to update requirement ${id}:`, error);
            throw error;
        }
    }

    /**
     * Delete requirement
     * @param {string} id - Requirement ID
     * @returns {Promise<boolean>} True if deleted
     */
    async delete(id) {
        try {
            const result = await this.db.delete(this.tableName, { id });
            logger.debug(`Deleted requirement: ${id}`);
            return result > 0;
        } catch (error) {
            logger.error(`Failed to delete requirement ${id}:`, error);
            throw error;
        }
    }

    /**
     * Find requirements by criteria
     * @param {Object} criteria - Search criteria
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Array of requirements
     */
    async find(criteria = {}, options = {}) {
        try {
            const results = await this.db.find(this.tableName, criteria, options);
            return results.map(result => this._formatRequirement(result));
        } catch (error) {
            logger.error('Failed to find requirements:', error);
            throw error;
        }
    }

    /**
     * Find requirements by source
     * @param {string} source - Source type (linear, github, manual)
     * @param {string} sourceId - Source ID
     * @returns {Promise<Array>} Array of requirements
     */
    async findBySource(source, sourceId) {
        return this.find({ source, sourceId });
    }

    /**
     * Find requirements by status
     * @param {string} status - Requirement status
     * @returns {Promise<Array>} Array of requirements
     */
    async findByStatus(status) {
        return this.find({ status });
    }

    /**
     * Find requirements by type
     * @param {string} type - Requirement type
     * @returns {Promise<Array>} Array of requirements
     */
    async findByType(type) {
        return this.find({ type });
    }

    /**
     * Search requirements by text
     * @param {string} searchText - Text to search for
     * @returns {Promise<Array>} Array of matching requirements
     */
    async search(searchText) {
        try {
            // This would use full-text search in a real database
            const criteria = {
                $or: [
                    { title: { $like: `%${searchText}%` } },
                    { description: { $like: `%${searchText}%` } }
                ]
            };
            return this.find(criteria);
        } catch (error) {
            logger.error('Failed to search requirements:', error);
            throw error;
        }
    }

    /**
     * Get requirements statistics
     * @returns {Promise<Object>} Statistics object
     */
    async getStatistics() {
        try {
            const stats = {
                total: await this.db.count(this.tableName),
                byStatus: {},
                byType: {},
                byPriority: {}
            };

            // Get counts by status
            const statusCounts = await this.db.aggregate(this.tableName, [
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]);
            statusCounts.forEach(item => {
                stats.byStatus[item._id] = item.count;
            });

            // Get counts by type
            const typeCounts = await this.db.aggregate(this.tableName, [
                { $group: { _id: '$type', count: { $sum: 1 } } }
            ]);
            typeCounts.forEach(item => {
                stats.byType[item._id] = item.count;
            });

            // Get counts by priority
            const priorityCounts = await this.db.aggregate(this.tableName, [
                { $group: { _id: '$priority', count: { $sum: 1 } } }
            ]);
            priorityCounts.forEach(item => {
                stats.byPriority[item._id] = item.count;
            });

            return stats;
        } catch (error) {
            logger.error('Failed to get requirements statistics:', error);
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
                title VARCHAR(500) NOT NULL,
                description TEXT,
                type VARCHAR(50) NOT NULL DEFAULT 'functional',
                priority VARCHAR(20) NOT NULL DEFAULT 'medium',
                status VARCHAR(50) NOT NULL DEFAULT 'draft',
                source VARCHAR(50) NOT NULL DEFAULT 'manual',
                source_id VARCHAR(255),
                metadata TEXT,
                tags TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_by VARCHAR(255) DEFAULT 'system',
                updated_by VARCHAR(255) DEFAULT 'system',
                INDEX idx_status (status),
                INDEX idx_type (type),
                INDEX idx_priority (priority),
                INDEX idx_source (source, source_id),
                INDEX idx_created_at (created_at)
            )
        `;
        
        await this.db.execute(schema);
    }

    /**
     * Validate requirement data
     * @param {Object} requirement - Requirement to validate
     * @private
     */
    async _validateRequirement(requirement) {
        const errors = [];

        if (!requirement.title || requirement.title.trim().length === 0) {
            errors.push('Title is required');
        }

        if (requirement.title && requirement.title.length > 500) {
            errors.push('Title must be 500 characters or less');
        }

        const validTypes = ['functional', 'non-functional', 'technical', 'business', 'user-story'];
        if (!validTypes.includes(requirement.type)) {
            errors.push(`Invalid type. Must be one of: ${validTypes.join(', ')}`);
        }

        const validPriorities = ['low', 'medium', 'high', 'critical'];
        if (!validPriorities.includes(requirement.priority)) {
            errors.push(`Invalid priority. Must be one of: ${validPriorities.join(', ')}`);
        }

        const validStatuses = ['draft', 'active', 'completed', 'cancelled', 'on-hold'];
        if (!validStatuses.includes(requirement.status)) {
            errors.push(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
        }

        if (errors.length > 0) {
            throw new Error(`Requirement validation failed: ${errors.join(', ')}`);
        }
    }

    /**
     * Format requirement for output
     * @param {Object} raw - Raw database result
     * @returns {Object} Formatted requirement
     * @private
     */
    _formatRequirement(raw) {
        return {
            id: raw.id,
            title: raw.title,
            description: raw.description,
            type: raw.type,
            priority: raw.priority,
            status: raw.status,
            source: raw.source,
            sourceId: raw.source_id,
            metadata: raw.metadata ? JSON.parse(raw.metadata) : {},
            tags: raw.tags ? JSON.parse(raw.tags) : [],
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
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

export default RequirementsModel;

