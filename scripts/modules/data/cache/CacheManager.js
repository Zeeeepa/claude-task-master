/**
 * CacheManager.js
 * In-memory caching with TTL and invalidation support
 * Provides caching functionality for the data access layer
 */

import { log } from '../../utils.js';

/**
 * Cache entry structure
 */
class CacheEntry {
  constructor(value, ttl = null) {
    this.value = value;
    this.createdAt = Date.now();
    this.expiresAt = ttl ? this.createdAt + ttl : null;
    this.accessCount = 0;
    this.lastAccessed = this.createdAt;
  }

  /**
   * Check if cache entry is expired
   * @returns {boolean} True if expired
   */
  isExpired() {
    if (this.expiresAt === null) return false;
    return Date.now() > this.expiresAt;
  }

  /**
   * Update access statistics
   */
  updateAccess() {
    this.accessCount++;
    this.lastAccessed = Date.now();
  }

  /**
   * Get remaining TTL in milliseconds
   * @returns {number|null} Remaining TTL or null if no expiration
   */
  getRemainingTtl() {
    if (this.expiresAt === null) return null;
    const remaining = this.expiresAt - Date.now();
    return Math.max(0, remaining);
  }
}

/**
 * In-memory cache manager with TTL support
 */
export class CacheManager {
  constructor(options = {}) {
    this.options = {
      maxSize: 1000,
      defaultTtl: 5 * 60 * 1000, // 5 minutes
      cleanupInterval: 60 * 1000, // 1 minute
      enableStats: true,
      ...options
    };

    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      cleanups: 0
    };

    // Start cleanup interval
    if (this.options.cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => {
        this.cleanup();
      }, this.options.cleanupInterval);
    }
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {any|null} Cached value or null if not found/expired
   */
  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this._updateStats('misses');
      return null;
    }

    if (entry.isExpired()) {
      this.cache.delete(key);
      this._updateStats('misses');
      return null;
    }

    entry.updateAccess();
    this._updateStats('hits');
    return entry.value;
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number|null} ttl - Time to live in milliseconds
   */
  set(key, value, ttl = null) {
    // Use default TTL if not specified
    const effectiveTtl = ttl !== null ? ttl : this.options.defaultTtl;
    
    // Check if we need to evict entries to make room
    if (this.cache.size >= this.options.maxSize && !this.cache.has(key)) {
      this._evictLeastRecentlyUsed();
    }

    const entry = new CacheEntry(value, effectiveTtl);
    this.cache.set(key, entry);
    this._updateStats('sets');
  }

  /**
   * Check if key exists in cache (and is not expired)
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists and is not expired
   */
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (entry.isExpired()) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Delete specific key from cache
   * @param {string} key - Cache key to delete
   * @returns {boolean} True if key was deleted
   */
  delete(key) {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this._updateStats('deletes');
    }
    return deleted;
  }

  /**
   * Invalidate cache entry (alias for delete)
   * @param {string} key - Cache key to invalidate
   * @returns {boolean} True if key was invalidated
   */
  invalidate(key) {
    return this.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this._updateStats('deletes', size);
  }

  /**
   * Clear cache entries by key prefix
   * @param {string} prefix - Key prefix to match
   * @returns {number} Number of entries cleared
   */
  clearByPrefix(prefix) {
    let cleared = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        cleared++;
      }
    }
    this._updateStats('deletes', cleared);
    return cleared;
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;
    
    return {
      ...this.stats,
      size: this.cache.size,
      maxSize: this.options.maxSize,
      hitRate: Math.round(hitRate * 100) / 100,
      totalRequests
    };
  }

  /**
   * Get cache entry information
   * @param {string} key - Cache key
   * @returns {Object|null} Entry information or null if not found
   */
  getEntryInfo(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    return {
      key,
      createdAt: entry.createdAt,
      expiresAt: entry.expiresAt,
      lastAccessed: entry.lastAccessed,
      accessCount: entry.accessCount,
      remainingTtl: entry.getRemainingTtl(),
      isExpired: entry.isExpired()
    };
  }

  /**
   * Get all cache keys
   * @returns {string[]} Array of cache keys
   */
  keys() {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache entries by pattern
   * @param {RegExp|string} pattern - Pattern to match keys
   * @returns {Object[]} Array of matching entries with key and value
   */
  getByPattern(pattern) {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    const matches = [];

    for (const [key, entry] of this.cache.entries()) {
      if (regex.test(key) && !entry.isExpired()) {
        matches.push({
          key,
          value: entry.value,
          info: this.getEntryInfo(key)
        });
      }
    }

    return matches;
  }

  /**
   * Cleanup expired entries
   * @returns {number} Number of entries cleaned up
   */
  cleanup() {
    let cleaned = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.isExpired()) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this._updateStats('cleanups');
      log('debug', `[CacheManager] Cleaned up ${cleaned} expired entries`);
    }

    return cleaned;
  }

  /**
   * Evict least recently used entry
   * @private
   */
  _evictLeastRecentlyUsed() {
    let oldestKey = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this._updateStats('evictions');
      log('debug', `[CacheManager] Evicted LRU entry: ${oldestKey}`);
    }
  }

  /**
   * Update cache statistics
   * @param {string} stat - Statistic to update
   * @param {number} count - Count to add (default: 1)
   * @private
   */
  _updateStats(stat, count = 1) {
    if (this.options.enableStats) {
      this.stats[stat] += count;
    }
  }

  /**
   * Destroy cache manager and cleanup resources
   */
  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
  }

  /**
   * Export cache data for persistence
   * @returns {Object} Serializable cache data
   */
  export() {
    const data = {};
    for (const [key, entry] of this.cache.entries()) {
      if (!entry.isExpired()) {
        data[key] = {
          value: entry.value,
          expiresAt: entry.expiresAt,
          createdAt: entry.createdAt
        };
      }
    }
    return data;
  }

  /**
   * Import cache data from persistence
   * @param {Object} data - Cache data to import
   */
  import(data) {
    this.clear();
    const now = Date.now();

    for (const [key, entryData] of Object.entries(data)) {
      // Skip expired entries
      if (entryData.expiresAt && now > entryData.expiresAt) {
        continue;
      }

      const ttl = entryData.expiresAt ? entryData.expiresAt - now : null;
      this.set(key, entryData.value, ttl);
    }
  }
}

export default CacheManager;

