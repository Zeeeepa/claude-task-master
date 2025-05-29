/**
 * @fileoverview Event Store
 * @description Event persistence and history management for debugging and analytics
 */

/**
 * Event Store class
 */
export class EventStore {
    constructor(config = {}) {
        this.config = {
            backend: config.backend || 'memory', // 'memory', 'postgresql', 'mongodb'
            maxEvents: config.maxEvents || 100000,
            retentionDays: config.retentionDays || 30,
            enableCompression: config.enableCompression !== false,
            enableIndexing: config.enableIndexing !== false,
            batchSize: config.batchSize || 100,
            flushInterval: config.flushInterval || 5000, // 5 seconds
            ...config
        };

        this.events = new Map();
        this.eventErrors = new Map();
        this.eventMetrics = new Map();
        this.pendingWrites = [];
        this.flushTimer = null;
        
        this.statistics = {
            eventsStored: 0,
            eventsRetrieved: 0,
            errorsStored: 0,
            storageSize: 0,
            lastCleanup: null
        };

        this.indexes = {
            bySource: new Map(),
            byType: new Map(),
            byTimestamp: new Map(),
            byStatus: new Map()
        };

        this.startFlushTimer();
    }

    /**
     * Initialize the event store
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            if (this.config.backend === 'postgresql') {
                await this.initializePostgreSQL();
            } else if (this.config.backend === 'mongodb') {
                await this.initializeMongoDB();
            }

            // Start cleanup timer
            this.startCleanupTimer();

            console.log(`Event store initialized with ${this.config.backend} backend`);
        } catch (error) {
            console.error('Failed to initialize event store:', error);
            throw error;
        }
    }

    /**
     * Initialize PostgreSQL backend
     * @returns {Promise<void>}
     */
    async initializePostgreSQL() {
        // Mock PostgreSQL initialization
        console.log('PostgreSQL event store initialized (mock)');
    }

    /**
     * Initialize MongoDB backend
     * @returns {Promise<void>}
     */
    async initializeMongoDB() {
        // Mock MongoDB initialization
        console.log('MongoDB event store initialized (mock)');
    }

    /**
     * Store an event
     * @param {Object} event - Event to store
     * @returns {Promise<string>} Event ID
     */
    async storeEvent(event) {
        try {
            const eventRecord = {
                id: event.id,
                source: event.source,
                type: event.type,
                payload: event.payload,
                headers: event.headers,
                timestamp: event.timestamp,
                metadata: event.metadata,
                context: event.context,
                routing: event.routing,
                status: 'received',
                storedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            // Compress payload if enabled
            if (this.config.enableCompression) {
                eventRecord.payload = this.compressData(eventRecord.payload);
                eventRecord.compressed = true;
            }

            // Store in memory
            this.events.set(event.id, eventRecord);
            
            // Update indexes
            if (this.config.enableIndexing) {
                this.updateIndexes(eventRecord);
            }

            // Add to pending writes for batch processing
            this.pendingWrites.push(eventRecord);

            // Update statistics
            this.statistics.eventsStored++;
            this.statistics.storageSize = this.events.size;

            return event.id;

        } catch (error) {
            console.error('Failed to store event:', error);
            throw error;
        }
    }

    /**
     * Update event status
     * @param {string} eventId - Event ID
     * @param {string} status - New status
     * @param {Object} metadata - Additional metadata
     * @returns {Promise<boolean>} Success status
     */
    async updateEventStatus(eventId, status, metadata = {}) {
        try {
            const event = this.events.get(eventId);
            if (!event) {
                return false;
            }

            event.status = status;
            event.updatedAt = new Date().toISOString();
            event.metadata = { ...event.metadata, ...metadata };

            // Update indexes
            if (this.config.enableIndexing) {
                this.updateStatusIndex(event);
            }

            // Add to pending writes
            this.pendingWrites.push(event);

            return true;

        } catch (error) {
            console.error('Failed to update event status:', error);
            return false;
        }
    }

    /**
     * Store event error
     * @param {string} eventId - Event ID
     * @param {Error} error - Error object
     * @returns {Promise<string>} Error record ID
     */
    async storeEventError(eventId, error) {
        try {
            const errorRecord = {
                id: this.generateErrorId(),
                eventId,
                error: {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                },
                timestamp: new Date().toISOString()
            };

            this.eventErrors.set(errorRecord.id, errorRecord);
            this.statistics.errorsStored++;

            // Update event status
            await this.updateEventStatus(eventId, 'failed', {
                errorId: errorRecord.id,
                errorMessage: error.message
            });

            return errorRecord.id;

        } catch (err) {
            console.error('Failed to store event error:', err);
            throw err;
        }
    }

    /**
     * Get event by ID
     * @param {string} eventId - Event ID
     * @returns {Promise<Object|null>} Event record
     */
    async getEvent(eventId) {
        try {
            const event = this.events.get(eventId);
            if (!event) {
                return null;
            }

            this.statistics.eventsRetrieved++;

            // Decompress if needed
            if (event.compressed) {
                return {
                    ...event,
                    payload: this.decompressData(event.payload)
                };
            }

            return event;

        } catch (error) {
            console.error('Failed to get event:', error);
            return null;
        }
    }

    /**
     * Get event status
     * @param {string} eventId - Event ID
     * @returns {Promise<Object|null>} Event status
     */
    async getEventStatus(eventId) {
        try {
            const event = this.events.get(eventId);
            if (!event) {
                return null;
            }

            return {
                id: event.id,
                status: event.status,
                timestamp: event.timestamp,
                storedAt: event.storedAt,
                updatedAt: event.updatedAt,
                metadata: event.metadata
            };

        } catch (error) {
            console.error('Failed to get event status:', error);
            return null;
        }
    }

    /**
     * Query events
     * @param {Object} query - Query parameters
     * @returns {Promise<Array>} Matching events
     */
    async queryEvents(query = {}) {
        try {
            let events = Array.from(this.events.values());

            // Apply filters
            if (query.source) {
                events = events.filter(event => event.source === query.source);
            }

            if (query.type) {
                events = events.filter(event => event.type === query.type);
            }

            if (query.status) {
                events = events.filter(event => event.status === query.status);
            }

            if (query.since) {
                const sinceDate = new Date(query.since);
                events = events.filter(event => new Date(event.timestamp) >= sinceDate);
            }

            if (query.until) {
                const untilDate = new Date(query.until);
                events = events.filter(event => new Date(event.timestamp) <= untilDate);
            }

            // Sort by timestamp (newest first)
            events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            // Apply pagination
            const limit = query.limit || 100;
            const offset = query.offset || 0;
            events = events.slice(offset, offset + limit);

            // Decompress if needed
            return events.map(event => {
                if (event.compressed) {
                    return {
                        ...event,
                        payload: this.decompressData(event.payload)
                    };
                }
                return event;
            });

        } catch (error) {
            console.error('Failed to query events:', error);
            return [];
        }
    }

    /**
     * Get events by source
     * @param {string} source - Event source
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Events from source
     */
    async getEventsBySource(source, options = {}) {
        if (this.config.enableIndexing && this.indexes.bySource.has(source)) {
            const eventIds = this.indexes.bySource.get(source);
            const events = eventIds.map(id => this.events.get(id)).filter(Boolean);
            
            return this.applyQueryOptions(events, options);
        }

        return await this.queryEvents({ source, ...options });
    }

    /**
     * Get events by type
     * @param {string} type - Event type
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Events of type
     */
    async getEventsByType(type, options = {}) {
        if (this.config.enableIndexing && this.indexes.byType.has(type)) {
            const eventIds = this.indexes.byType.get(type);
            const events = eventIds.map(id => this.events.get(id)).filter(Boolean);
            
            return this.applyQueryOptions(events, options);
        }

        return await this.queryEvents({ type, ...options });
    }

    /**
     * Get event errors
     * @param {string} eventId - Event ID (optional)
     * @returns {Promise<Array>} Event errors
     */
    async getEventErrors(eventId = null) {
        try {
            let errors = Array.from(this.eventErrors.values());

            if (eventId) {
                errors = errors.filter(error => error.eventId === eventId);
            }

            // Sort by timestamp (newest first)
            errors.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            return errors;

        } catch (error) {
            console.error('Failed to get event errors:', error);
            return [];
        }
    }

    /**
     * Delete event
     * @param {string} eventId - Event ID
     * @returns {Promise<boolean>} Success status
     */
    async deleteEvent(eventId) {
        try {
            const event = this.events.get(eventId);
            if (!event) {
                return false;
            }

            // Remove from indexes
            if (this.config.enableIndexing) {
                this.removeFromIndexes(event);
            }

            // Remove event
            this.events.delete(eventId);
            
            // Remove associated errors
            const errors = await this.getEventErrors(eventId);
            for (const error of errors) {
                this.eventErrors.delete(error.id);
            }

            this.statistics.storageSize = this.events.size;

            return true;

        } catch (error) {
            console.error('Failed to delete event:', error);
            return false;
        }
    }

    /**
     * Clean up old events
     * @returns {Promise<number>} Number of events cleaned up
     */
    async cleanupOldEvents() {
        try {
            const cutoffDate = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);
            let cleanedCount = 0;

            for (const [eventId, event] of this.events) {
                if (new Date(event.timestamp) < cutoffDate) {
                    await this.deleteEvent(eventId);
                    cleanedCount++;
                }
            }

            this.statistics.lastCleanup = new Date().toISOString();

            console.log(`Cleaned up ${cleanedCount} old events`);
            return cleanedCount;

        } catch (error) {
            console.error('Failed to cleanup old events:', error);
            return 0;
        }
    }

    /**
     * Update indexes for event
     * @param {Object} event - Event record
     */
    updateIndexes(event) {
        // Source index
        if (!this.indexes.bySource.has(event.source)) {
            this.indexes.bySource.set(event.source, new Set());
        }
        this.indexes.bySource.get(event.source).add(event.id);

        // Type index
        if (!this.indexes.byType.has(event.type)) {
            this.indexes.byType.set(event.type, new Set());
        }
        this.indexes.byType.get(event.type).add(event.id);

        // Status index
        this.updateStatusIndex(event);

        // Timestamp index (by hour)
        const hour = new Date(event.timestamp).toISOString().substr(0, 13);
        if (!this.indexes.byTimestamp.has(hour)) {
            this.indexes.byTimestamp.set(hour, new Set());
        }
        this.indexes.byTimestamp.get(hour).add(event.id);
    }

    /**
     * Update status index for event
     * @param {Object} event - Event record
     */
    updateStatusIndex(event) {
        if (!this.indexes.byStatus.has(event.status)) {
            this.indexes.byStatus.set(event.status, new Set());
        }
        this.indexes.byStatus.get(event.status).add(event.id);
    }

    /**
     * Remove event from indexes
     * @param {Object} event - Event record
     */
    removeFromIndexes(event) {
        // Remove from all indexes
        this.indexes.bySource.get(event.source)?.delete(event.id);
        this.indexes.byType.get(event.type)?.delete(event.id);
        this.indexes.byStatus.get(event.status)?.delete(event.id);

        // Remove from timestamp index
        const hour = new Date(event.timestamp).toISOString().substr(0, 13);
        this.indexes.byTimestamp.get(hour)?.delete(event.id);
    }

    /**
     * Apply query options to events
     * @param {Array} events - Events array
     * @param {Object} options - Query options
     * @returns {Array} Filtered events
     */
    applyQueryOptions(events, options) {
        let result = [...events];

        // Sort by timestamp (newest first)
        result.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Apply pagination
        const limit = options.limit || 100;
        const offset = options.offset || 0;
        result = result.slice(offset, offset + limit);

        return result;
    }

    /**
     * Compress data
     * @param {Object} data - Data to compress
     * @returns {string} Compressed data
     */
    compressData(data) {
        // Mock compression - replace with actual compression library
        return JSON.stringify(data);
    }

    /**
     * Decompress data
     * @param {string} compressedData - Compressed data
     * @returns {Object} Decompressed data
     */
    decompressData(compressedData) {
        // Mock decompression - replace with actual decompression library
        return JSON.parse(compressedData);
    }

    /**
     * Start flush timer for batch writes
     */
    startFlushTimer() {
        this.flushTimer = setInterval(() => {
            this.flushPendingWrites();
        }, this.config.flushInterval);
    }

    /**
     * Flush pending writes
     */
    async flushPendingWrites() {
        if (this.pendingWrites.length === 0) {
            return;
        }

        try {
            const writes = this.pendingWrites.splice(0, this.config.batchSize);
            
            // Mock batch write - replace with actual database batch operation
            console.log(`Flushing ${writes.length} pending writes`);

        } catch (error) {
            console.error('Failed to flush pending writes:', error);
        }
    }

    /**
     * Start cleanup timer
     */
    startCleanupTimer() {
        // Run cleanup every 6 hours
        setInterval(() => {
            this.cleanupOldEvents();
        }, 6 * 60 * 60 * 1000);
    }

    /**
     * Generate error ID
     * @returns {string} Error ID
     */
    generateErrorId() {
        return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get store metrics
     * @returns {Promise<Object>} Store metrics
     */
    async getMetrics() {
        return {
            ...this.statistics,
            currentSize: this.events.size,
            errorCount: this.eventErrors.size,
            pendingWrites: this.pendingWrites.length,
            indexSizes: {
                bySource: this.indexes.bySource.size,
                byType: this.indexes.byType.size,
                byStatus: this.indexes.byStatus.size,
                byTimestamp: this.indexes.byTimestamp.size
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get health status
     * @returns {Promise<string>} Health status
     */
    async getHealth() {
        try {
            // Check storage size
            if (this.events.size > this.config.maxEvents * 0.9) {
                return 'degraded';
            }

            // Check pending writes
            if (this.pendingWrites.length > this.config.batchSize * 5) {
                return 'degraded';
            }

            return 'healthy';
        } catch (error) {
            return 'unhealthy';
        }
    }

    /**
     * Shutdown the event store
     * @returns {Promise<void>}
     */
    async shutdown() {
        console.log('Shutting down event store...');
        
        // Stop timers
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }

        // Flush remaining writes
        await this.flushPendingWrites();

        console.log('Event store shut down successfully');
    }
}

export default EventStore;

