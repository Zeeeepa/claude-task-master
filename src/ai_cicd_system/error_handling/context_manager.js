/**
 * @fileoverview Intelligent Context Manager
 * @description Manages context preservation across retry attempts and error recovery
 */

import { log } from '../../../scripts/modules/utils.js';

/**
 * Context types for different scenarios
 */
export const CONTEXT_TYPES = {
    ERROR: 'ERROR',
    RECOVERY: 'RECOVERY',
    RETRY: 'RETRY',
    ESCALATION: 'ESCALATION',
    OPERATION: 'OPERATION'
};

/**
 * Context preservation strategies
 */
export const PRESERVATION_STRATEGIES = {
    FULL: 'FULL',
    SELECTIVE: 'SELECTIVE',
    MINIMAL: 'MINIMAL',
    ADAPTIVE: 'ADAPTIVE'
};

/**
 * Intelligent Context Manager
 */
export class ContextManager {
    constructor(config = {}) {
        this.config = {
            enableContextPreservation: config.enableContextPreservation !== false,
            defaultStrategy: config.defaultStrategy || PRESERVATION_STRATEGIES.SELECTIVE,
            maxContextSize: config.maxContextSize || 1024 * 1024, // 1MB
            maxContextAge: config.maxContextAge || 3600000, // 1 hour
            enableCompression: config.enableCompression !== false,
            enableEncryption: config.enableEncryption || false,
            ...config
        };

        this.contexts = new Map();
        this.contextHistory = [];
        this.contextMetrics = new ContextMetrics();
        this.serializer = new ContextSerializer(this.config);
        this.compressor = new ContextCompressor(this.config);
    }

    /**
     * Create and store context for operation
     * @param {string} type - Context type
     * @param {Object} data - Context data
     * @param {Object} options - Context options
     * @returns {Promise<string>} Context ID
     */
    async createContext(type, data, options = {}) {
        if (!this.config.enableContextPreservation) {
            return null;
        }

        const contextId = this._generateContextId();
        const strategy = options.strategy || this.config.defaultStrategy;

        try {
            // Process context data based on strategy
            const processedData = await this._processContextData(data, strategy, type);

            // Create context record
            const context = {
                id: contextId,
                type,
                strategy,
                timestamp: new Date(),
                data: processedData,
                metadata: {
                    originalSize: this._calculateSize(data),
                    processedSize: this._calculateSize(processedData),
                    compressionRatio: 0,
                    ...options.metadata
                },
                options,
                accessCount: 0,
                lastAccessed: new Date()
            };

            // Compress if enabled and beneficial
            if (this.config.enableCompression && context.metadata.processedSize > 1024) {
                const compressed = await this.compressor.compress(processedData);
                if (compressed.size < context.metadata.processedSize * 0.8) {
                    context.data = compressed.data;
                    context.metadata.compressed = true;
                    context.metadata.compressionRatio = compressed.size / context.metadata.processedSize;
                }
            }

            // Store context
            this.contexts.set(contextId, context);
            this.contextHistory.push({
                id: contextId,
                type,
                timestamp: context.timestamp,
                size: context.metadata.processedSize
            });

            // Cleanup old contexts
            this._cleanupContexts();

            // Update metrics
            this.contextMetrics.recordCreation(context);

            log('debug', 'Context created', {
                contextId,
                type,
                strategy,
                originalSize: context.metadata.originalSize,
                processedSize: context.metadata.processedSize,
                compressed: context.metadata.compressed || false
            });

            return contextId;

        } catch (error) {
            log('error', 'Failed to create context', {
                contextId,
                type,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Retrieve context by ID
     * @param {string} contextId - Context ID
     * @param {Object} options - Retrieval options
     * @returns {Promise<Object>} Context data
     */
    async getContext(contextId, options = {}) {
        if (!contextId || !this.contexts.has(contextId)) {
            return null;
        }

        const context = this.contexts.get(contextId);
        
        try {
            // Update access tracking
            context.accessCount++;
            context.lastAccessed = new Date();

            // Decompress if needed
            let data = context.data;
            if (context.metadata.compressed) {
                data = await this.compressor.decompress(data);
            }

            // Apply any transformations based on options
            if (options.transform) {
                data = await this._transformContextData(data, options.transform);
            }

            // Update metrics
            this.contextMetrics.recordAccess(context);

            log('debug', 'Context retrieved', {
                contextId,
                type: context.type,
                accessCount: context.accessCount,
                age: Date.now() - context.timestamp.getTime()
            });

            return {
                id: contextId,
                type: context.type,
                data,
                metadata: context.metadata,
                timestamp: context.timestamp
            };

        } catch (error) {
            log('error', 'Failed to retrieve context', {
                contextId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Update existing context
     * @param {string} contextId - Context ID
     * @param {Object} updates - Context updates
     * @param {Object} options - Update options
     * @returns {Promise<boolean>} Success status
     */
    async updateContext(contextId, updates, options = {}) {
        if (!contextId || !this.contexts.has(contextId)) {
            return false;
        }

        const context = this.contexts.get(contextId);

        try {
            // Merge updates with existing data
            let updatedData;
            if (context.metadata.compressed) {
                const decompressed = await this.compressor.decompress(context.data);
                updatedData = this._mergeContextData(decompressed, updates, options.mergeStrategy);
            } else {
                updatedData = this._mergeContextData(context.data, updates, options.mergeStrategy);
            }

            // Process updated data
            const processedData = await this._processContextData(
                updatedData, 
                context.strategy, 
                context.type
            );

            // Update context
            context.data = processedData;
            context.metadata.processedSize = this._calculateSize(processedData);
            context.metadata.lastUpdated = new Date();

            // Re-compress if needed
            if (this.config.enableCompression && context.metadata.processedSize > 1024) {
                const compressed = await this.compressor.compress(processedData);
                if (compressed.size < context.metadata.processedSize * 0.8) {
                    context.data = compressed.data;
                    context.metadata.compressed = true;
                    context.metadata.compressionRatio = compressed.size / context.metadata.processedSize;
                }
            }

            // Update metrics
            this.contextMetrics.recordUpdate(context);

            log('debug', 'Context updated', {
                contextId,
                newSize: context.metadata.processedSize,
                compressed: context.metadata.compressed || false
            });

            return true;

        } catch (error) {
            log('error', 'Failed to update context', {
                contextId,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Clone context for new operation
     * @param {string} sourceContextId - Source context ID
     * @param {string} newType - New context type
     * @param {Object} options - Clone options
     * @returns {Promise<string>} New context ID
     */
    async cloneContext(sourceContextId, newType, options = {}) {
        const sourceContext = await this.getContext(sourceContextId);
        if (!sourceContext) {
            throw new Error(`Source context not found: ${sourceContextId}`);
        }

        // Create clone with modifications
        const cloneData = options.transform 
            ? await this._transformContextData(sourceContext.data, options.transform)
            : sourceContext.data;

        return await this.createContext(newType, cloneData, {
            ...options,
            metadata: {
                ...options.metadata,
                clonedFrom: sourceContextId,
                clonedAt: new Date()
            }
        });
    }

    /**
     * Link contexts together for relationship tracking
     * @param {string} parentContextId - Parent context ID
     * @param {string} childContextId - Child context ID
     * @param {string} relationship - Relationship type
     * @returns {boolean} Success status
     */
    linkContexts(parentContextId, childContextId, relationship = 'child') {
        const parentContext = this.contexts.get(parentContextId);
        const childContext = this.contexts.get(childContextId);

        if (!parentContext || !childContext) {
            return false;
        }

        // Add relationship metadata
        if (!parentContext.metadata.relationships) {
            parentContext.metadata.relationships = [];
        }
        
        parentContext.metadata.relationships.push({
            type: relationship,
            contextId: childContextId,
            createdAt: new Date()
        });

        if (!childContext.metadata.parent) {
            childContext.metadata.parent = {
                contextId: parentContextId,
                relationship,
                createdAt: new Date()
            };
        }

        return true;
    }

    /**
     * Process context data based on preservation strategy
     * @param {Object} data - Raw context data
     * @param {string} strategy - Preservation strategy
     * @param {string} type - Context type
     * @returns {Promise<Object>} Processed data
     * @private
     */
    async _processContextData(data, strategy, type) {
        switch (strategy) {
            case PRESERVATION_STRATEGIES.FULL:
                return this._deepClone(data);

            case PRESERVATION_STRATEGIES.SELECTIVE:
                return this._selectivePreservation(data, type);

            case PRESERVATION_STRATEGIES.MINIMAL:
                return this._minimalPreservation(data, type);

            case PRESERVATION_STRATEGIES.ADAPTIVE:
                return this._adaptivePreservation(data, type);

            default:
                return this._selectivePreservation(data, type);
        }
    }

    /**
     * Selective preservation based on context type
     * @param {Object} data - Context data
     * @param {string} type - Context type
     * @returns {Object} Preserved data
     * @private
     */
    _selectivePreservation(data, type) {
        const preserved = {};

        switch (type) {
            case CONTEXT_TYPES.ERROR:
                preserved.error = data.error;
                preserved.stackTrace = data.stackTrace;
                preserved.environment = data.environment;
                preserved.timestamp = data.timestamp;
                preserved.operation = data.operation;
                break;

            case CONTEXT_TYPES.RECOVERY:
                preserved.errorContext = data.errorContext;
                preserved.recoveryAttempts = data.recoveryAttempts;
                preserved.strategy = data.strategy;
                preserved.checkpoint = data.checkpoint;
                break;

            case CONTEXT_TYPES.RETRY:
                preserved.attempts = data.attempts;
                preserved.delays = data.delays;
                preserved.strategy = data.strategy;
                preserved.lastError = data.lastError;
                break;

            case CONTEXT_TYPES.ESCALATION:
                preserved.triggers = data.triggers;
                preserved.level = data.level;
                preserved.notifications = data.notifications;
                preserved.slaDeadline = data.slaDeadline;
                break;

            case CONTEXT_TYPES.OPERATION:
                preserved.operationId = data.operationId;
                preserved.parameters = data.parameters;
                preserved.startTime = data.startTime;
                preserved.metadata = data.metadata;
                break;

            default:
                // Preserve essential fields for unknown types
                preserved.id = data.id;
                preserved.timestamp = data.timestamp;
                preserved.type = data.type;
                preserved.metadata = data.metadata;
        }

        return preserved;
    }

    /**
     * Minimal preservation - only essential data
     * @param {Object} data - Context data
     * @param {string} type - Context type
     * @returns {Object} Minimal data
     * @private
     */
    _minimalPreservation(data, type) {
        return {
            id: data.id,
            type,
            timestamp: data.timestamp || new Date(),
            essential: this._extractEssentialData(data, type)
        };
    }

    /**
     * Adaptive preservation based on context usage patterns
     * @param {Object} data - Context data
     * @param {string} type - Context type
     * @returns {Object} Adaptively preserved data
     * @private
     */
    _adaptivePreservation(data, type) {
        // Get usage patterns for this context type
        const patterns = this.contextMetrics.getUsagePatterns(type);
        
        if (!patterns || patterns.accessCount < 10) {
            // Fall back to selective preservation if insufficient data
            return this._selectivePreservation(data, type);
        }

        // Preserve fields based on access frequency
        const preserved = {};
        const frequentlyAccessed = patterns.frequentlyAccessedFields || [];

        for (const field of frequentlyAccessed) {
            if (data.hasOwnProperty(field)) {
                preserved[field] = data[field];
            }
        }

        // Always preserve essential fields
        const essential = this._extractEssentialData(data, type);
        return { ...preserved, ...essential };
    }

    /**
     * Extract essential data for context type
     * @param {Object} data - Context data
     * @param {string} type - Context type
     * @returns {Object} Essential data
     * @private
     */
    _extractEssentialData(data, type) {
        const essential = {
            timestamp: data.timestamp || new Date()
        };

        switch (type) {
            case CONTEXT_TYPES.ERROR:
                essential.errorMessage = data.error?.message;
                essential.errorCode = data.error?.code;
                break;

            case CONTEXT_TYPES.RECOVERY:
                essential.recoveryStrategy = data.strategy;
                essential.attemptCount = data.recoveryAttempts?.length || 0;
                break;

            case CONTEXT_TYPES.RETRY:
                essential.retryCount = data.attempts?.length || 0;
                essential.lastErrorCode = data.lastError?.code;
                break;

            case CONTEXT_TYPES.ESCALATION:
                essential.escalationLevel = data.level;
                essential.triggerCount = data.triggers?.length || 0;
                break;

            case CONTEXT_TYPES.OPERATION:
                essential.operationId = data.operationId;
                essential.operationType = data.type;
                break;
        }

        return essential;
    }

    /**
     * Merge context data with updates
     * @param {Object} existing - Existing context data
     * @param {Object} updates - Updates to apply
     * @param {string} strategy - Merge strategy
     * @returns {Object} Merged data
     * @private
     */
    _mergeContextData(existing, updates, strategy = 'deep') {
        switch (strategy) {
            case 'shallow':
                return { ...existing, ...updates };

            case 'deep':
                return this._deepMerge(existing, updates);

            case 'replace':
                return updates;

            case 'append':
                return this._appendMerge(existing, updates);

            default:
                return this._deepMerge(existing, updates);
        }
    }

    /**
     * Transform context data
     * @param {Object} data - Context data
     * @param {Object} transform - Transformation configuration
     * @returns {Promise<Object>} Transformed data
     * @private
     */
    async _transformContextData(data, transform) {
        let result = data;

        if (transform.filter) {
            result = this._filterData(result, transform.filter);
        }

        if (transform.map) {
            result = this._mapData(result, transform.map);
        }

        if (transform.reduce) {
            result = this._reduceData(result, transform.reduce);
        }

        if (transform.custom && typeof transform.custom === 'function') {
            result = await transform.custom(result);
        }

        return result;
    }

    /**
     * Filter context data
     * @param {Object} data - Data to filter
     * @param {Object} filter - Filter configuration
     * @returns {Object} Filtered data
     * @private
     */
    _filterData(data, filter) {
        const result = {};

        for (const [key, value] of Object.entries(data)) {
            if (filter.include && filter.include.includes(key)) {
                result[key] = value;
            } else if (filter.exclude && !filter.exclude.includes(key)) {
                result[key] = value;
            } else if (!filter.include && !filter.exclude) {
                result[key] = value;
            }
        }

        return result;
    }

    /**
     * Deep clone object
     * @param {Object} obj - Object to clone
     * @returns {Object} Cloned object
     * @private
     */
    _deepClone(obj) {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        if (obj instanceof Date) {
            return new Date(obj.getTime());
        }

        if (obj instanceof Array) {
            return obj.map(item => this._deepClone(item));
        }

        const cloned = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                cloned[key] = this._deepClone(obj[key]);
            }
        }

        return cloned;
    }

    /**
     * Deep merge objects
     * @param {Object} target - Target object
     * @param {Object} source - Source object
     * @returns {Object} Merged object
     * @private
     */
    _deepMerge(target, source) {
        const result = { ...target };

        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    result[key] = this._deepMerge(result[key] || {}, source[key]);
                } else {
                    result[key] = source[key];
                }
            }
        }

        return result;
    }

    /**
     * Calculate object size in bytes
     * @param {Object} obj - Object to measure
     * @returns {number} Size in bytes
     * @private
     */
    _calculateSize(obj) {
        return JSON.stringify(obj).length * 2; // Rough estimate
    }

    /**
     * Generate unique context ID
     * @returns {string} Unique ID
     * @private
     */
    _generateContextId() {
        return `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Cleanup old contexts
     * @private
     */
    _cleanupContexts() {
        const now = Date.now();
        const maxAge = this.config.maxContextAge;
        const maxSize = this.config.maxContextSize;

        // Remove expired contexts
        for (const [id, context] of this.contexts.entries()) {
            if (now - context.timestamp.getTime() > maxAge) {
                this.contexts.delete(id);
                this.contextMetrics.recordDeletion(context, 'expired');
            }
        }

        // Remove contexts if total size exceeds limit
        let totalSize = 0;
        const contextsByAge = Array.from(this.contexts.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp);

        for (const [id, context] of contextsByAge) {
            totalSize += context.metadata.processedSize;
        }

        if (totalSize > maxSize) {
            const toRemove = Math.ceil(this.contexts.size * 0.1); // Remove 10%
            for (let i = 0; i < toRemove && i < contextsByAge.length; i++) {
                const [id, context] = contextsByAge[i];
                this.contexts.delete(id);
                this.contextMetrics.recordDeletion(context, 'size_limit');
            }
        }

        // Prune history
        const maxHistory = 1000;
        if (this.contextHistory.length > maxHistory) {
            this.contextHistory = this.contextHistory.slice(-maxHistory);
        }
    }

    /**
     * Get context statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        const typeStats = {};
        const strategyStats = {};
        let totalSize = 0;

        for (const context of this.contexts.values()) {
            typeStats[context.type] = (typeStats[context.type] || 0) + 1;
            strategyStats[context.strategy] = (strategyStats[context.strategy] || 0) + 1;
            totalSize += context.metadata.processedSize;
        }

        return {
            totalContexts: this.contexts.size,
            totalSize,
            averageSize: this.contexts.size > 0 ? totalSize / this.contexts.size : 0,
            typeStats,
            strategyStats,
            metrics: this.contextMetrics.getStatistics(),
            historySize: this.contextHistory.length
        };
    }

    /**
     * Reset context manager
     */
    reset() {
        this.contexts.clear();
        this.contextHistory = [];
        this.contextMetrics.reset();
    }
}

/**
 * Context Metrics for tracking usage patterns
 */
class ContextMetrics {
    constructor() {
        this.metrics = new Map();
        this.usagePatterns = new Map();
    }

    /**
     * Record context creation
     * @param {Object} context - Context record
     */
    recordCreation(context) {
        this._updateMetrics(context.type, 'created');
    }

    /**
     * Record context access
     * @param {Object} context - Context record
     */
    recordAccess(context) {
        this._updateMetrics(context.type, 'accessed');
        this._updateUsagePatterns(context);
    }

    /**
     * Record context update
     * @param {Object} context - Context record
     */
    recordUpdate(context) {
        this._updateMetrics(context.type, 'updated');
    }

    /**
     * Record context deletion
     * @param {Object} context - Context record
     * @param {string} reason - Deletion reason
     */
    recordDeletion(context, reason) {
        this._updateMetrics(context.type, 'deleted');
        this._updateMetrics(context.type, `deleted_${reason}`);
    }

    /**
     * Update metrics for context type
     * @param {string} type - Context type
     * @param {string} action - Action performed
     * @private
     */
    _updateMetrics(type, action) {
        if (!this.metrics.has(type)) {
            this.metrics.set(type, {});
        }

        const typeMetrics = this.metrics.get(type);
        typeMetrics[action] = (typeMetrics[action] || 0) + 1;
    }

    /**
     * Update usage patterns
     * @param {Object} context - Context record
     * @private
     */
    _updateUsagePatterns(context) {
        const type = context.type;
        
        if (!this.usagePatterns.has(type)) {
            this.usagePatterns.set(type, {
                accessCount: 0,
                fieldAccess: new Map(),
                frequentlyAccessedFields: []
            });
        }

        const patterns = this.usagePatterns.get(type);
        patterns.accessCount++;

        // Track field access (simplified)
        if (context.data && typeof context.data === 'object') {
            for (const field of Object.keys(context.data)) {
                const count = patterns.fieldAccess.get(field) || 0;
                patterns.fieldAccess.set(field, count + 1);
            }

            // Update frequently accessed fields
            patterns.frequentlyAccessedFields = Array.from(patterns.fieldAccess.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([field]) => field);
        }
    }

    /**
     * Get usage patterns for context type
     * @param {string} type - Context type
     * @returns {Object} Usage patterns
     */
    getUsagePatterns(type) {
        return this.usagePatterns.get(type);
    }

    /**
     * Get all statistics
     * @returns {Object} All metrics
     */
    getStatistics() {
        const result = {};
        for (const [type, metrics] of this.metrics.entries()) {
            result[type] = { ...metrics };
        }
        return result;
    }

    /**
     * Reset metrics
     */
    reset() {
        this.metrics.clear();
        this.usagePatterns.clear();
    }
}

/**
 * Context Serializer for data serialization
 */
class ContextSerializer {
    constructor(config) {
        this.config = config;
    }

    /**
     * Serialize context data
     * @param {Object} data - Data to serialize
     * @returns {string} Serialized data
     */
    serialize(data) {
        return JSON.stringify(data);
    }

    /**
     * Deserialize context data
     * @param {string} serialized - Serialized data
     * @returns {Object} Deserialized data
     */
    deserialize(serialized) {
        return JSON.parse(serialized);
    }
}

/**
 * Context Compressor for data compression
 */
class ContextCompressor {
    constructor(config) {
        this.config = config;
    }

    /**
     * Compress context data
     * @param {Object} data - Data to compress
     * @returns {Promise<Object>} Compressed data
     */
    async compress(data) {
        // Simplified compression (in real implementation, use proper compression library)
        const serialized = JSON.stringify(data);
        return {
            data: serialized,
            size: serialized.length,
            compressed: true
        };
    }

    /**
     * Decompress context data
     * @param {Object} compressed - Compressed data
     * @returns {Promise<Object>} Decompressed data
     */
    async decompress(compressed) {
        if (compressed.compressed) {
            return JSON.parse(compressed.data);
        }
        return compressed;
    }
}

export default ContextManager;

