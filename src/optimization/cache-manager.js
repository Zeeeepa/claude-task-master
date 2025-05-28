/**
 * @fileoverview Cache Manager
 * @description Intelligent caching system with multiple strategies and invalidation
 */

import EventEmitter from 'events';
import { performance } from 'perf_hooks';

/**
 * Cache strategies
 */
export const CacheStrategy = {
    LRU: 'lru',
    LFU: 'lfu',
    TTL: 'ttl',
    FIFO: 'fifo'
};

/**
 * Cache Manager for intelligent caching with multiple strategies
 */
export class CacheManager extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            enabled: config.enabled !== false,
            defaultTTL: config.defaultTTL || 300000, // 5 minutes
            maxSize: config.maxSize || 1000,
            strategy: config.strategy || CacheStrategy.LRU,
            enableMetrics: config.enableMetrics !== false,
            enableCompression: config.enableCompression || false,
            compressionThreshold: config.compressionThreshold || 1024, // 1KB
            cleanupInterval: config.cleanupInterval || 60000, // 1 minute
            ...config
        };

        this.caches = new Map();
        this.metrics = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            evictions: 0,
            totalSize: 0,
            compressionSavings: 0
        };
        
        this.cleanupInterval = null;
        this.isInitialized = false;
    }

    /**
     * Initialize the cache manager
     */
    async initialize() {
        if (!this.config.enabled) {
            console.log('Caching disabled');
            return;
        }

        console.log('Initializing cache manager...');
        
        // Create default cache
        this.createCache('default');
        
        // Start cleanup interval
        this.startCleanup();
        
        this.isInitialized = true;
        this.emit('initialized');
        
        console.log('Cache manager initialized');
    }

    /**
     * Create a new cache instance
     */
    createCache(name, config = {}) {
        const cacheConfig = { ...this.config, ...config };
        const cache = new Cache(name, cacheConfig);
        
        // Forward cache events
        cache.on('hit', (data) => this.emit('cache_hit', { cache: name, ...data }));
        cache.on('miss', (data) => this.emit('cache_miss', { cache: name, ...data }));
        cache.on('set', (data) => this.emit('cache_set', { cache: name, ...data }));
        cache.on('delete', (data) => this.emit('cache_delete', { cache: name, ...data }));
        cache.on('eviction', (data) => this.emit('cache_eviction', { cache: name, ...data }));
        
        this.caches.set(name, cache);
        console.log(`Created cache: ${name}`);
        
        return cache;
    }

    /**
     * Get a cache instance
     */
    getCache(name = 'default') {
        let cache = this.caches.get(name);
        if (!cache) {
            cache = this.createCache(name);
        }
        return cache;
    }

    /**
     * Set a value in cache
     */
    async set(key, value, options = {}, cacheName = 'default') {
        if (!this.config.enabled) {
            return false;
        }

        const cache = this.getCache(cacheName);
        const result = await cache.set(key, value, options);
        
        if (result && this.config.enableMetrics) {
            this.metrics.sets++;
            this.updateTotalSize();
        }
        
        return result;
    }

    /**
     * Get a value from cache
     */
    async get(key, cacheName = 'default') {
        if (!this.config.enabled) {
            return null;
        }

        const cache = this.getCache(cacheName);
        const result = await cache.get(key);
        
        if (this.config.enableMetrics) {
            if (result !== null) {
                this.metrics.hits++;
            } else {
                this.metrics.misses++;
            }
        }
        
        return result;
    }

    /**
     * Delete a value from cache
     */
    async delete(key, cacheName = 'default') {
        if (!this.config.enabled) {
            return false;
        }

        const cache = this.getCache(cacheName);
        const result = await cache.delete(key);
        
        if (result && this.config.enableMetrics) {
            this.metrics.deletes++;
            this.updateTotalSize();
        }
        
        return result;
    }

    /**
     * Clear a cache
     */
    async clear(cacheName = 'default') {
        const cache = this.getCache(cacheName);
        await cache.clear();
        this.updateTotalSize();
    }

    /**
     * Clear all caches
     */
    async clearAll() {
        for (const cache of this.caches.values()) {
            await cache.clear();
        }
        this.updateTotalSize();
    }

    /**
     * Get or set with a function (memoization)
     */
    async memoize(key, fn, options = {}, cacheName = 'default') {
        const cached = await this.get(key, cacheName);
        if (cached !== null) {
            return cached;
        }

        const value = await fn();
        await this.set(key, value, options, cacheName);
        return value;
    }

    /**
     * Invalidate cache entries by pattern
     */
    async invalidatePattern(pattern, cacheName = 'default') {
        const cache = this.getCache(cacheName);
        return await cache.invalidatePattern(pattern);
    }

    /**
     * Invalidate cache entries by tags
     */
    async invalidateTags(tags, cacheName = 'default') {
        const cache = this.getCache(cacheName);
        return await cache.invalidateTags(tags);
    }

    /**
     * Start cleanup interval
     */
    startCleanup() {
        if (this.cleanupInterval) {
            return;
        }

        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, this.config.cleanupInterval);
    }

    /**
     * Stop cleanup interval
     */
    stopCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    /**
     * Cleanup expired entries
     */
    async cleanup() {
        for (const cache of this.caches.values()) {
            await cache.cleanup();
        }
        this.updateTotalSize();
    }

    /**
     * Update total size metrics
     */
    updateTotalSize() {
        this.metrics.totalSize = Array.from(this.caches.values())
            .reduce((total, cache) => total + cache.getSize(), 0);
    }

    /**
     * Get cache statistics
     */
    getStats(cacheName = null) {
        if (cacheName) {
            const cache = this.caches.get(cacheName);
            return cache ? cache.getStats() : null;
        }

        const cacheStats = {};
        for (const [name, cache] of this.caches) {
            cacheStats[name] = cache.getStats();
        }

        return {
            global: this.metrics,
            caches: cacheStats,
            hitRate: this.getHitRate(),
            totalCaches: this.caches.size
        };
    }

    /**
     * Get hit rate percentage
     */
    getHitRate() {
        const total = this.metrics.hits + this.metrics.misses;
        return total > 0 ? (this.metrics.hits / total) * 100 : 0;
    }

    /**
     * Shutdown cache manager
     */
    async shutdown() {
        console.log('Shutting down cache manager...');
        
        this.stopCleanup();
        await this.clearAll();
        this.caches.clear();
        
        this.emit('shutdown');
        console.log('Cache manager shut down');
    }
}

/**
 * Individual Cache implementation
 */
class Cache extends EventEmitter {
    constructor(name, config) {
        super();
        
        this.name = name;
        this.config = config;
        this.data = new Map();
        this.accessOrder = new Map(); // For LRU
        this.accessCount = new Map(); // For LFU
        this.tags = new Map(); // For tag-based invalidation
        this.size = 0;
        this.accessCounter = 0;
    }

    /**
     * Set a value in the cache
     */
    async set(key, value, options = {}) {
        const ttl = options.ttl || this.config.defaultTTL;
        const tags = options.tags || [];
        const compress = options.compress !== false && this.config.enableCompression;
        
        // Compress value if needed
        let processedValue = value;
        let compressed = false;
        
        if (compress && this.shouldCompress(value)) {
            processedValue = await this.compress(value);
            compressed = true;
        }

        const entry = {
            value: processedValue,
            compressed,
            originalSize: this.getValueSize(value),
            compressedSize: compressed ? this.getValueSize(processedValue) : this.getValueSize(value),
            ttl,
            createdAt: Date.now(),
            expiresAt: Date.now() + ttl,
            accessCount: 0,
            tags: new Set(tags)
        };

        // Check if we need to evict entries
        if (this.data.size >= this.config.maxSize) {
            await this.evict();
        }

        // Store the entry
        this.data.set(key, entry);
        this.updateAccess(key);
        
        // Update tag mappings
        for (const tag of tags) {
            if (!this.tags.has(tag)) {
                this.tags.set(tag, new Set());
            }
            this.tags.get(tag).add(key);
        }

        this.size += entry.compressedSize;
        
        this.emit('set', { key, size: entry.compressedSize, compressed, tags });
        return true;
    }

    /**
     * Get a value from the cache
     */
    async get(key) {
        const entry = this.data.get(key);
        
        if (!entry) {
            this.emit('miss', { key });
            return null;
        }

        // Check if expired
        if (Date.now() > entry.expiresAt) {
            await this.delete(key);
            this.emit('miss', { key, reason: 'expired' });
            return null;
        }

        // Update access tracking
        this.updateAccess(key);
        entry.accessCount++;

        // Decompress if needed
        let value = entry.value;
        if (entry.compressed) {
            value = await this.decompress(entry.value);
        }

        this.emit('hit', { key, accessCount: entry.accessCount });
        return value;
    }

    /**
     * Delete a value from the cache
     */
    async delete(key) {
        const entry = this.data.get(key);
        if (!entry) {
            return false;
        }

        // Remove from tag mappings
        for (const tag of entry.tags) {
            const tagSet = this.tags.get(tag);
            if (tagSet) {
                tagSet.delete(key);
                if (tagSet.size === 0) {
                    this.tags.delete(tag);
                }
            }
        }

        this.data.delete(key);
        this.accessOrder.delete(key);
        this.accessCount.delete(key);
        this.size -= entry.compressedSize;

        this.emit('delete', { key, size: entry.compressedSize });
        return true;
    }

    /**
     * Clear all entries
     */
    async clear() {
        this.data.clear();
        this.accessOrder.clear();
        this.accessCount.clear();
        this.tags.clear();
        this.size = 0;
        this.accessCounter = 0;
    }

    /**
     * Invalidate entries by pattern
     */
    async invalidatePattern(pattern) {
        const regex = new RegExp(pattern);
        const keysToDelete = [];
        
        for (const key of this.data.keys()) {
            if (regex.test(key)) {
                keysToDelete.push(key);
            }
        }

        for (const key of keysToDelete) {
            await this.delete(key);
        }

        return keysToDelete.length;
    }

    /**
     * Invalidate entries by tags
     */
    async invalidateTags(tags) {
        const keysToDelete = new Set();
        
        for (const tag of tags) {
            const tagSet = this.tags.get(tag);
            if (tagSet) {
                for (const key of tagSet) {
                    keysToDelete.add(key);
                }
            }
        }

        for (const key of keysToDelete) {
            await this.delete(key);
        }

        return keysToDelete.size;
    }

    /**
     * Cleanup expired entries
     */
    async cleanup() {
        const now = Date.now();
        const expiredKeys = [];
        
        for (const [key, entry] of this.data) {
            if (now > entry.expiresAt) {
                expiredKeys.push(key);
            }
        }

        for (const key of expiredKeys) {
            await this.delete(key);
        }

        return expiredKeys.length;
    }

    /**
     * Evict entries based on strategy
     */
    async evict() {
        let keyToEvict;

        switch (this.config.strategy) {
            case CacheStrategy.LRU:
                keyToEvict = this.getLRUKey();
                break;
            case CacheStrategy.LFU:
                keyToEvict = this.getLFUKey();
                break;
            case CacheStrategy.FIFO:
                keyToEvict = this.getFIFOKey();
                break;
            case CacheStrategy.TTL:
                keyToEvict = this.getTTLKey();
                break;
            default:
                keyToEvict = this.getLRUKey();
        }

        if (keyToEvict) {
            await this.delete(keyToEvict);
            this.emit('eviction', { key: keyToEvict, strategy: this.config.strategy });
        }
    }

    /**
     * Get least recently used key
     */
    getLRUKey() {
        let oldestKey = null;
        let oldestAccess = Infinity;

        for (const [key, accessTime] of this.accessOrder) {
            if (accessTime < oldestAccess) {
                oldestAccess = accessTime;
                oldestKey = key;
            }
        }

        return oldestKey;
    }

    /**
     * Get least frequently used key
     */
    getLFUKey() {
        let leastUsedKey = null;
        let leastCount = Infinity;

        for (const [key, count] of this.accessCount) {
            if (count < leastCount) {
                leastCount = count;
                leastUsedKey = key;
            }
        }

        return leastUsedKey;
    }

    /**
     * Get first in, first out key
     */
    getFIFOKey() {
        return this.data.keys().next().value;
    }

    /**
     * Get key with shortest TTL
     */
    getTTLKey() {
        let shortestTTLKey = null;
        let shortestExpiry = Infinity;

        for (const [key, entry] of this.data) {
            if (entry.expiresAt < shortestExpiry) {
                shortestExpiry = entry.expiresAt;
                shortestTTLKey = key;
            }
        }

        return shortestTTLKey;
    }

    /**
     * Update access tracking
     */
    updateAccess(key) {
        this.accessOrder.set(key, ++this.accessCounter);
        this.accessCount.set(key, (this.accessCount.get(key) || 0) + 1);
    }

    /**
     * Check if value should be compressed
     */
    shouldCompress(value) {
        const size = this.getValueSize(value);
        return size > this.config.compressionThreshold;
    }

    /**
     * Compress a value
     */
    async compress(value) {
        // Simple JSON compression (in production, use zlib or similar)
        return JSON.stringify(value);
    }

    /**
     * Decompress a value
     */
    async decompress(value) {
        // Simple JSON decompression
        return JSON.parse(value);
    }

    /**
     * Get size of a value in bytes
     */
    getValueSize(value) {
        return Buffer.byteLength(JSON.stringify(value), 'utf8');
    }

    /**
     * Get cache size
     */
    getSize() {
        return this.size;
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const entries = Array.from(this.data.values());
        const totalOriginalSize = entries.reduce((sum, entry) => sum + entry.originalSize, 0);
        const totalCompressedSize = entries.reduce((sum, entry) => sum + entry.compressedSize, 0);
        const compressionRatio = totalOriginalSize > 0 ? totalCompressedSize / totalOriginalSize : 1;

        return {
            name: this.name,
            size: this.data.size,
            maxSize: this.config.maxSize,
            totalSize: this.size,
            totalOriginalSize,
            totalCompressedSize,
            compressionRatio,
            strategy: this.config.strategy,
            tagCount: this.tags.size
        };
    }
}

export default CacheManager;

