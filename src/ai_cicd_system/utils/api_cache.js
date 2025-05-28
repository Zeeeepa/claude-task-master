/**
 * @fileoverview API Response Caching
 * @description Intelligent caching system for API responses with TTL and invalidation
 */

import { log } from '../../scripts/modules/utils.js';

/**
 * API response cache with TTL and intelligent invalidation
 */
export class APICache {
    constructor(config = {}) {
        this.config = {
            enabled: config.enabled !== false,
            defaultTTL: config.defaultTTL || 300000, // 5 minutes
            maxSize: config.maxSize || 1000,
            strategy: config.strategy || 'lru', // lru, lfu, fifo
            enableCompression: config.enableCompression !== false,
            enableMetrics: config.enableMetrics !== false,
            ...config
        };

        // Cache storage
        this.cache = new Map();
        this.accessTimes = new Map();
        this.accessCounts = new Map();
        this.insertionOrder = [];

        // Metrics
        this.metrics = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            evictions: 0,
            totalRequests: 0
        };

        // Cleanup interval
        this.cleanupInterval = setInterval(() => {
            this._cleanup();
        }, 60000); // Cleanup every minute

        log('info', 'API cache initialized', {
            enabled: this.config.enabled,
            maxSize: this.config.maxSize,
            strategy: this.config.strategy
        });
    }

    /**
     * Get cached response
     * @param {string} key - Cache key
     * @returns {*} Cached value or null
     */
    get(key) {
        if (!this.config.enabled) {
            return null;
        }

        this.metrics.totalRequests++;

        const entry = this.cache.get(key);
        if (!entry) {
            this.metrics.misses++;
            return null;
        }

        // Check TTL
        if (Date.now() > entry.expiresAt) {
            this.delete(key);
            this.metrics.misses++;
            return null;
        }

        // Update access tracking
        this._updateAccess(key);
        this.metrics.hits++;

        log('debug', 'Cache hit', { key, ttl: entry.expiresAt - Date.now() });

        return this._decompress(entry.value);
    }

    /**
     * Set cached response
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {number} ttl - Time to live in milliseconds
     * @returns {boolean} Success status
     */
    set(key, value, ttl = this.config.defaultTTL) {
        if (!this.config.enabled) {
            return false;
        }

        try {
            // Check cache size and evict if necessary
            if (this.cache.size >= this.config.maxSize) {
                this._evict();
            }

            const compressedValue = this._compress(value);
            const entry = {
                value: compressedValue,
                createdAt: Date.now(),
                expiresAt: Date.now() + ttl,
                ttl,
                size: this._calculateSize(compressedValue)
            };

            this.cache.set(key, entry);
            this._updateAccess(key);
            this._trackInsertion(key);

            this.metrics.sets++;

            log('debug', 'Cache set', { 
                key, 
                ttl, 
                size: entry.size,
                cacheSize: this.cache.size 
            });

            return true;

        } catch (error) {
            log('error', 'Cache set failed', { key, error: error.message });
            return false;
        }
    }

    /**
     * Delete cached entry
     * @param {string} key - Cache key
     * @returns {boolean} Success status
     */
    delete(key) {
        if (!this.config.enabled) {
            return false;
        }

        const deleted = this.cache.delete(key);
        if (deleted) {
            this.accessTimes.delete(key);
            this.accessCounts.delete(key);
            this._removeFromInsertionOrder(key);
            this.metrics.deletes++;

            log('debug', 'Cache delete', { key });
        }

        return deleted;
    }

    /**
     * Clear all cached entries
     */
    clear() {
        this.cache.clear();
        this.accessTimes.clear();
        this.accessCounts.clear();
        this.insertionOrder = [];

        log('debug', 'Cache cleared');
    }

    /**
     * Check if key exists in cache
     * @param {string} key - Cache key
     * @returns {boolean} Existence status
     */
    has(key) {
        if (!this.config.enabled) {
            return false;
        }

        const entry = this.cache.get(key);
        if (!entry) {
            return false;
        }

        // Check TTL
        if (Date.now() > entry.expiresAt) {
            this.delete(key);
            return false;
        }

        return true;
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache statistics
     */
    getStats() {
        const hitRate = this.metrics.totalRequests > 0 ? 
            (this.metrics.hits / this.metrics.totalRequests) * 100 : 0;

        return {
            enabled: this.config.enabled,
            size: this.cache.size,
            maxSize: this.config.maxSize,
            hitRate: Math.round(hitRate * 100) / 100,
            metrics: { ...this.metrics },
            memoryUsage: this._calculateTotalSize(),
            strategy: this.config.strategy
        };
    }

    /**
     * Get cache keys
     * @returns {Array<string>} Cache keys
     */
    keys() {
        return Array.from(this.cache.keys());
    }

    /**
     * Get cache entries with metadata
     * @returns {Array<Object>} Cache entries
     */
    entries() {
        const entries = [];
        
        for (const [key, entry] of this.cache) {
            entries.push({
                key,
                createdAt: entry.createdAt,
                expiresAt: entry.expiresAt,
                ttl: entry.ttl,
                size: entry.size,
                accessCount: this.accessCounts.get(key) || 0,
                lastAccess: this.accessTimes.get(key) || entry.createdAt
            });
        }

        return entries;
    }

    /**
     * Invalidate cache entries by pattern
     * @param {string|RegExp} pattern - Pattern to match keys
     * @returns {number} Number of invalidated entries
     */
    invalidateByPattern(pattern) {
        if (!this.config.enabled) {
            return 0;
        }

        const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
        const keysToDelete = [];

        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                keysToDelete.push(key);
            }
        }

        keysToDelete.forEach(key => this.delete(key));

        log('debug', 'Cache invalidated by pattern', { 
            pattern: pattern.toString(), 
            count: keysToDelete.length 
        });

        return keysToDelete.length;
    }

    /**
     * Invalidate cache entries by tags
     * @param {Array<string>} tags - Tags to invalidate
     * @returns {number} Number of invalidated entries
     */
    invalidateByTags(tags) {
        if (!this.config.enabled) {
            return 0;
        }

        let invalidatedCount = 0;

        for (const [key, entry] of this.cache) {
            if (entry.tags && entry.tags.some(tag => tags.includes(tag))) {
                this.delete(key);
                invalidatedCount++;
            }
        }

        log('debug', 'Cache invalidated by tags', { tags, count: invalidatedCount });

        return invalidatedCount;
    }

    /**
     * Set cache entry with tags
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {Object} options - Cache options
     * @returns {boolean} Success status
     */
    setWithTags(key, value, options = {}) {
        const { ttl = this.config.defaultTTL, tags = [] } = options;

        if (!this.config.enabled) {
            return false;
        }

        try {
            // Check cache size and evict if necessary
            if (this.cache.size >= this.config.maxSize) {
                this._evict();
            }

            const compressedValue = this._compress(value);
            const entry = {
                value: compressedValue,
                createdAt: Date.now(),
                expiresAt: Date.now() + ttl,
                ttl,
                tags,
                size: this._calculateSize(compressedValue)
            };

            this.cache.set(key, entry);
            this._updateAccess(key);
            this._trackInsertion(key);

            this.metrics.sets++;

            log('debug', 'Cache set with tags', { 
                key, 
                ttl, 
                tags,
                size: entry.size 
            });

            return true;

        } catch (error) {
            log('error', 'Cache set with tags failed', { key, error: error.message });
            return false;
        }
    }

    /**
     * Shutdown cache and cleanup resources
     */
    shutdown() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }

        this.clear();
        log('info', 'API cache shutdown complete');
    }

    /**
     * Update access tracking
     * @private
     */
    _updateAccess(key) {
        this.accessTimes.set(key, Date.now());
        this.accessCounts.set(key, (this.accessCounts.get(key) || 0) + 1);
    }

    /**
     * Track insertion order
     * @private
     */
    _trackInsertion(key) {
        // Remove if already exists
        this._removeFromInsertionOrder(key);
        // Add to end
        this.insertionOrder.push(key);
    }

    /**
     * Remove from insertion order
     * @private
     */
    _removeFromInsertionOrder(key) {
        const index = this.insertionOrder.indexOf(key);
        if (index > -1) {
            this.insertionOrder.splice(index, 1);
        }
    }

    /**
     * Evict entries based on strategy
     * @private
     */
    _evict() {
        let keyToEvict;

        switch (this.config.strategy) {
            case 'lru': // Least Recently Used
                keyToEvict = this._findLRUKey();
                break;
            case 'lfu': // Least Frequently Used
                keyToEvict = this._findLFUKey();
                break;
            case 'fifo': // First In, First Out
                keyToEvict = this.insertionOrder[0];
                break;
            default:
                keyToEvict = this._findLRUKey();
        }

        if (keyToEvict) {
            this.delete(keyToEvict);
            this.metrics.evictions++;

            log('debug', 'Cache eviction', { 
                key: keyToEvict, 
                strategy: this.config.strategy 
            });
        }
    }

    /**
     * Find least recently used key
     * @private
     */
    _findLRUKey() {
        let oldestTime = Date.now();
        let oldestKey = null;

        for (const [key, time] of this.accessTimes) {
            if (time < oldestTime) {
                oldestTime = time;
                oldestKey = key;
            }
        }

        return oldestKey;
    }

    /**
     * Find least frequently used key
     * @private
     */
    _findLFUKey() {
        let lowestCount = Infinity;
        let leastUsedKey = null;

        for (const [key, count] of this.accessCounts) {
            if (count < lowestCount) {
                lowestCount = count;
                leastUsedKey = key;
            }
        }

        return leastUsedKey;
    }

    /**
     * Cleanup expired entries
     * @private
     */
    _cleanup() {
        const now = Date.now();
        const expiredKeys = [];

        for (const [key, entry] of this.cache) {
            if (now > entry.expiresAt) {
                expiredKeys.push(key);
            }
        }

        expiredKeys.forEach(key => this.delete(key));

        if (expiredKeys.length > 0) {
            log('debug', 'Cache cleanup', { expiredCount: expiredKeys.length });
        }
    }

    /**
     * Compress value if compression is enabled
     * @private
     */
    _compress(value) {
        if (!this.config.enableCompression) {
            return value;
        }

        try {
            // Simple JSON compression (in production, use a real compression library)
            return JSON.stringify(value);
        } catch (error) {
            log('warn', 'Compression failed', { error: error.message });
            return value;
        }
    }

    /**
     * Decompress value if compression is enabled
     * @private
     */
    _decompress(value) {
        if (!this.config.enableCompression) {
            return value;
        }

        try {
            return typeof value === 'string' ? JSON.parse(value) : value;
        } catch (error) {
            log('warn', 'Decompression failed', { error: error.message });
            return value;
        }
    }

    /**
     * Calculate size of value
     * @private
     */
    _calculateSize(value) {
        try {
            return JSON.stringify(value).length;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Calculate total cache size
     * @private
     */
    _calculateTotalSize() {
        let totalSize = 0;
        
        for (const entry of this.cache.values()) {
            totalSize += entry.size || 0;
        }

        return totalSize;
    }
}

/**
 * Cache key generator utility
 */
export class CacheKeyGenerator {
    /**
     * Generate cache key for API request
     * @param {string} method - HTTP method
     * @param {string} url - Request URL
     * @param {Object} params - Request parameters
     * @param {Object} headers - Request headers (optional)
     * @returns {string} Cache key
     */
    static forAPIRequest(method, url, params = {}, headers = {}) {
        const keyParts = [
            method.toUpperCase(),
            url,
            this._serializeParams(params)
        ];

        // Include relevant headers if specified
        const relevantHeaders = ['authorization', 'content-type', 'accept'];
        const headerParts = relevantHeaders
            .filter(header => headers[header])
            .map(header => `${header}:${headers[header]}`);

        if (headerParts.length > 0) {
            keyParts.push(headerParts.join('|'));
        }

        return this._hash(keyParts.join('::'));
    }

    /**
     * Generate cache key for task processing
     * @param {string} taskType - Task type
     * @param {string} taskDescription - Task description
     * @param {Object} context - Task context
     * @returns {string} Cache key
     */
    static forTask(taskType, taskDescription, context = {}) {
        const keyParts = [
            'task',
            taskType,
            this._hash(taskDescription),
            this._serializeParams(context)
        ];

        return this._hash(keyParts.join('::'));
    }

    /**
     * Generate cache key for prompt generation
     * @param {Object} structuredTask - Structured task
     * @param {Object} context - Context
     * @returns {string} Cache key
     */
    static forPrompt(structuredTask, context = {}) {
        const keyParts = [
            'prompt',
            structuredTask.type,
            structuredTask.complexity.level,
            this._hash(JSON.stringify(structuredTask.objectives)),
            this._serializeParams(context)
        ];

        return this._hash(keyParts.join('::'));
    }

    /**
     * Serialize parameters for cache key
     * @private
     */
    static _serializeParams(params) {
        if (!params || Object.keys(params).length === 0) {
            return '';
        }

        const sortedKeys = Object.keys(params).sort();
        const serialized = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
        return this._hash(serialized);
    }

    /**
     * Simple hash function for cache keys
     * @private
     */
    static _hash(str) {
        let hash = 0;
        if (str.length === 0) return hash.toString();
        
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        
        return Math.abs(hash).toString(36);
    }
}

/**
 * Cache decorator for functions
 */
export function cached(options = {}) {
    const cache = new APICache(options);
    
    return function(target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        
        descriptor.value = async function(...args) {
            const cacheKey = CacheKeyGenerator._hash(
                `${target.constructor.name}.${propertyKey}.${JSON.stringify(args)}`
            );
            
            // Try to get from cache
            const cachedResult = cache.get(cacheKey);
            if (cachedResult !== null) {
                return cachedResult;
            }
            
            // Execute original method
            const result = await originalMethod.apply(this, args);
            
            // Cache the result
            cache.set(cacheKey, result, options.ttl);
            
            return result;
        };
        
        return descriptor;
    };
}

export default APICache;

