/**
 * Events Model
 * Database model for system events in Task Master orchestrator
 * 
 * Manages event storage, querying, and lifecycle for comprehensive system tracking.
 */

import { logger } from '../../utils/logger.js';

/**
 * Events model class
 */
export class EventsModel {
    constructor(database) {
        this.db = database;
        this.tableName = 'events';
    }

    /**
     * Initialize the events table
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            await this._createTable();
            logger.debug('Events model initialized');
        } catch (error) {
            logger.error('Failed to initialize events model:', error);
            throw error;
        }
    }

    /**
     * Create a new event
     * @param {Object} eventData - Event data
     * @returns {Promise<Object>} Created event
     */
    async create(eventData) {
        try {
            const event = {
                id: this._generateId(),
                type: eventData.type,
                category: eventData.category || 'system',
                source: eventData.source || 'orchestrator',
                sourceId: eventData.sourceId || null,
                entityType: eventData.entityType || null,
                entityId: eventData.entityId || null,
                action: eventData.action || 'unknown',
                status: eventData.status || 'success',
                message: eventData.message || '',
                data: JSON.stringify(eventData.data || {}),
                metadata: JSON.stringify(eventData.metadata || {}),
                correlationId: eventData.correlationId || null,
                userId: eventData.userId || null,
                sessionId: eventData.sessionId || null,
                timestamp: eventData.timestamp || new Date(),
                createdAt: new Date()
            };

            await this._validateEvent(event);
            
            const result = await this.db.insert(this.tableName, event);
            logger.debug(`Created event: ${event.id} (${event.type})`);
            
            return this._formatEvent(result);
        } catch (error) {
            logger.error('Failed to create event:', error);
            throw error;
        }
    }

    /**
     * Get event by ID
     * @param {string} id - Event ID
     * @returns {Promise<Object|null>} Event or null if not found
     */
    async getById(id) {
        try {
            const result = await this.db.findOne(this.tableName, { id });
            return result ? this._formatEvent(result) : null;
        } catch (error) {
            logger.error(`Failed to get event ${id}:`, error);
            throw error;
        }
    }

    /**
     * Find events by criteria
     * @param {Object} criteria - Search criteria
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Array of events
     */
    async find(criteria = {}, options = {}) {
        try {
            const defaultOptions = {
                orderBy: 'timestamp DESC',
                limit: 100,
                ...options
            };
            
            const results = await this.db.find(this.tableName, criteria, defaultOptions);
            return results.map(result => this._formatEvent(result));
        } catch (error) {
            logger.error('Failed to find events:', error);
            throw error;
        }
    }

    /**
     * Find events by type
     * @param {string} type - Event type
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Array of events
     */
    async findByType(type, options = {}) {
        return this.find({ type }, options);
    }

    /**
     * Find events by category
     * @param {string} category - Event category
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Array of events
     */
    async findByCategory(category, options = {}) {
        return this.find({ category }, options);
    }

    /**
     * Find events by entity
     * @param {string} entityType - Entity type
     * @param {string} entityId - Entity ID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Array of events
     */
    async findByEntity(entityType, entityId, options = {}) {
        return this.find({ entityType, entityId }, options);
    }

    /**
     * Find events by correlation ID
     * @param {string} correlationId - Correlation ID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Array of events
     */
    async findByCorrelation(correlationId, options = {}) {
        return this.find({ correlationId }, options);
    }

    /**
     * Find events by time range
     * @param {Date} startTime - Start time
     * @param {Date} endTime - End time
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Array of events
     */
    async findByTimeRange(startTime, endTime, options = {}) {
        const criteria = {
            timestamp: {
                $gte: startTime,
                $lte: endTime
            }
        };
        return this.find(criteria, options);
    }

    /**
     * Find recent events
     * @param {number} minutes - Number of minutes back
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Array of recent events
     */
    async findRecent(minutes = 60, options = {}) {
        const startTime = new Date(Date.now() - (minutes * 60 * 1000));
        const endTime = new Date();
        return this.findByTimeRange(startTime, endTime, options);
    }

    /**
     * Get event statistics
     * @param {Object} filters - Optional filters
     * @returns {Promise<Object>} Statistics object
     */
    async getStatistics(filters = {}) {
        try {
            const baseQuery = this._buildFilterQuery(filters);
            
            const stats = {
                total: await this.db.count(this.tableName, baseQuery),
                byType: {},
                byCategory: {},
                byStatus: {},
                byHour: {},
                recentActivity: 0
            };

            // Get counts by type
            const typeCounts = await this.db.aggregate(this.tableName, [
                { $match: baseQuery },
                { $group: { _id: '$type', count: { $sum: 1 } } }
            ]);
            typeCounts.forEach(item => {
                stats.byType[item._id] = item.count;
            });

            // Get counts by category
            const categoryCounts = await this.db.aggregate(this.tableName, [
                { $match: baseQuery },
                { $group: { _id: '$category', count: { $sum: 1 } } }
            ]);
            categoryCounts.forEach(item => {
                stats.byCategory[item._id] = item.count;
            });

            // Get counts by status
            const statusCounts = await this.db.aggregate(this.tableName, [
                { $match: baseQuery },
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]);
            statusCounts.forEach(item => {
                stats.byStatus[item._id] = item.count;
            });

            // Get recent activity (last hour)
            const oneHourAgo = new Date(Date.now() - (60 * 60 * 1000));
            stats.recentActivity = await this.db.count(this.tableName, {
                ...baseQuery,
                timestamp: { $gte: oneHourAgo }
            });

            return stats;
        } catch (error) {
            logger.error('Failed to get event statistics:', error);
            throw error;
        }
    }

    /**
     * Get event timeline
     * @param {Object} filters - Optional filters
     * @param {string} interval - Time interval (hour, day, week)
     * @returns {Promise<Array>} Timeline data
     */
    async getTimeline(filters = {}, interval = 'hour') {
        try {
            const baseQuery = this._buildFilterQuery(filters);
            
            // This would be implemented differently based on the database
            // For now, return a simplified timeline
            const timeline = await this.db.aggregate(this.tableName, [
                { $match: baseQuery },
                {
                    $group: {
                        _id: {
                            $dateToString: {
                                format: this._getDateFormat(interval),
                                date: '$timestamp'
                            }
                        },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { '_id': 1 } }
            ]);

            return timeline.map(item => ({
                time: item._id,
                count: item.count
            }));
        } catch (error) {
            logger.error('Failed to get event timeline:', error);
            throw error;
        }
    }

    /**
     * Delete old events
     * @param {Date} olderThan - Delete events older than this date
     * @returns {Promise<number>} Number of deleted events
     */
    async deleteOldEvents(olderThan) {
        try {
            const result = await this.db.delete(this.tableName, {
                timestamp: { $lt: olderThan }
            });
            logger.info(`Deleted ${result} old events`);
            return result;
        } catch (error) {
            logger.error('Failed to delete old events:', error);
            throw error;
        }
    }

    /**
     * Archive events
     * @param {Date} olderThan - Archive events older than this date
     * @returns {Promise<number>} Number of archived events
     */
    async archiveEvents(olderThan) {
        try {
            // In a real implementation, this would move events to an archive table
            const events = await this.find({
                timestamp: { $lt: olderThan }
            });
            
            // Archive logic would go here
            logger.info(`Would archive ${events.length} events`);
            return events.length;
        } catch (error) {
            logger.error('Failed to archive events:', error);
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
                type VARCHAR(100) NOT NULL,
                category VARCHAR(50) NOT NULL DEFAULT 'system',
                source VARCHAR(100) NOT NULL DEFAULT 'orchestrator',
                source_id VARCHAR(255),
                entity_type VARCHAR(100),
                entity_id VARCHAR(255),
                action VARCHAR(100) NOT NULL DEFAULT 'unknown',
                status VARCHAR(50) NOT NULL DEFAULT 'success',
                message TEXT,
                data TEXT,
                metadata TEXT,
                correlation_id VARCHAR(255),
                user_id VARCHAR(255),
                session_id VARCHAR(255),
                timestamp TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_type (type),
                INDEX idx_category (category),
                INDEX idx_source (source, source_id),
                INDEX idx_entity (entity_type, entity_id),
                INDEX idx_correlation (correlation_id),
                INDEX idx_timestamp (timestamp),
                INDEX idx_status (status),
                INDEX idx_user (user_id),
                INDEX idx_created_at (created_at)
            )
        `;
        
        await this.db.execute(schema);
    }

    /**
     * Validate event data
     * @param {Object} event - Event to validate
     * @private
     */
    async _validateEvent(event) {
        const errors = [];

        if (!event.type || event.type.trim().length === 0) {
            errors.push('Event type is required');
        }

        if (event.type && event.type.length > 100) {
            errors.push('Event type must be 100 characters or less');
        }

        const validCategories = ['system', 'user', 'integration', 'workflow', 'error', 'security'];
        if (!validCategories.includes(event.category)) {
            errors.push(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
        }

        const validStatuses = ['success', 'error', 'warning', 'info', 'pending'];
        if (!validStatuses.includes(event.status)) {
            errors.push(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
        }

        if (!event.timestamp || !(event.timestamp instanceof Date)) {
            errors.push('Valid timestamp is required');
        }

        if (errors.length > 0) {
            throw new Error(`Event validation failed: ${errors.join(', ')}`);
        }
    }

    /**
     * Build filter query from filters object
     * @param {Object} filters - Filters to apply
     * @returns {Object} Database query object
     * @private
     */
    _buildFilterQuery(filters) {
        const query = {};

        if (filters.type) query.type = filters.type;
        if (filters.category) query.category = filters.category;
        if (filters.source) query.source = filters.source;
        if (filters.entityType) query.entity_type = filters.entityType;
        if (filters.entityId) query.entity_id = filters.entityId;
        if (filters.status) query.status = filters.status;
        if (filters.userId) query.user_id = filters.userId;

        if (filters.startTime || filters.endTime) {
            query.timestamp = {};
            if (filters.startTime) query.timestamp.$gte = filters.startTime;
            if (filters.endTime) query.timestamp.$lte = filters.endTime;
        }

        return query;
    }

    /**
     * Get date format for timeline aggregation
     * @param {string} interval - Time interval
     * @returns {string} Date format string
     * @private
     */
    _getDateFormat(interval) {
        switch (interval) {
            case 'hour':
                return '%Y-%m-%d %H:00:00';
            case 'day':
                return '%Y-%m-%d';
            case 'week':
                return '%Y-%U';
            case 'month':
                return '%Y-%m';
            default:
                return '%Y-%m-%d %H:00:00';
        }
    }

    /**
     * Format event for output
     * @param {Object} raw - Raw database result
     * @returns {Object} Formatted event
     * @private
     */
    _formatEvent(raw) {
        return {
            id: raw.id,
            type: raw.type,
            category: raw.category,
            source: raw.source,
            sourceId: raw.source_id,
            entityType: raw.entity_type,
            entityId: raw.entity_id,
            action: raw.action,
            status: raw.status,
            message: raw.message,
            data: raw.data ? JSON.parse(raw.data) : {},
            metadata: raw.metadata ? JSON.parse(raw.metadata) : {},
            correlationId: raw.correlation_id,
            userId: raw.user_id,
            sessionId: raw.session_id,
            timestamp: raw.timestamp,
            createdAt: raw.created_at
        };
    }

    /**
     * Generate unique ID
     * @returns {string} Unique ID
     * @private
     */
    _generateId() {
        return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

export default EventsModel;

