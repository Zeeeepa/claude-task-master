/**
 * BaseRepository.js
 * Abstract base class for all data repositories
 * Provides common functionality and interface definition
 */

import { log } from '../../utils.js';

/**
 * Abstract base repository class
 * Defines the common interface for all data repositories
 */
export class BaseRepository {
  constructor(cacheManager = null, validationManager = null) {
    this.cacheManager = cacheManager;
    this.validationManager = validationManager;
    
    if (this.constructor === BaseRepository) {
      throw new Error('BaseRepository is abstract and cannot be instantiated directly');
    }
  }

  /**
   * Read data from storage
   * @param {string} path - Path to the data
   * @param {Object} options - Additional options
   * @returns {Promise<any>} The data
   */
  async read(path, options = {}) {
    throw new Error('read() method must be implemented by subclass');
  }

  /**
   * Write data to storage
   * @param {string} path - Path to write data
   * @param {any} data - Data to write
   * @param {Object} options - Additional options
   * @returns {Promise<void>}
   */
  async write(path, data, options = {}) {
    throw new Error('write() method must be implemented by subclass');
  }

  /**
   * Check if data exists at path
   * @param {string} path - Path to check
   * @returns {boolean} True if exists
   */
  exists(path) {
    throw new Error('exists() method must be implemented by subclass');
  }

  /**
   * Delete data at path
   * @param {string} path - Path to delete
   * @returns {Promise<void>}
   */
  async delete(path) {
    throw new Error('delete() method must be implemented by subclass');
  }

  /**
   * Get data from cache if available
   * @param {string} key - Cache key
   * @returns {any|null} Cached data or null
   */
  _getFromCache(key) {
    if (!this.cacheManager) return null;
    return this.cacheManager.get(key);
  }

  /**
   * Set data in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in milliseconds
   */
  _setCache(key, value, ttl = null) {
    if (!this.cacheManager) return;
    this.cacheManager.set(key, value, ttl);
  }

  /**
   * Invalidate cache entry
   * @param {string} key - Cache key to invalidate
   */
  _invalidateCache(key) {
    if (!this.cacheManager) return;
    this.cacheManager.invalidate(key);
  }

  /**
   * Validate data using validation manager
   * @param {any} data - Data to validate
   * @param {string} schema - Schema name to validate against
   * @returns {Object} Validation result
   */
  _validate(data, schema) {
    if (!this.validationManager) {
      return { success: true, data };
    }
    return this.validationManager.validate(data, schema);
  }

  /**
   * Generate cache key for a path
   * @param {string} path - File path
   * @returns {string} Cache key
   */
  _getCacheKey(path) {
    return `repo:${this.constructor.name}:${path}`;
  }

  /**
   * Log repository operations
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {any} data - Additional data
   */
  _log(level, message, data = null) {
    const prefix = `[${this.constructor.name}]`;
    if (data) {
      log(level, `${prefix} ${message}`, data);
    } else {
      log(level, `${prefix} ${message}`);
    }
  }

  /**
   * Handle repository errors consistently
   * @param {Error} error - The error that occurred
   * @param {string} operation - The operation that failed
   * @param {string} path - The path involved in the operation
   * @throws {Error} Enhanced error with context
   */
  _handleError(error, operation, path) {
    const enhancedError = new Error(
      `Repository ${operation} failed for path "${path}": ${error.message}`
    );
    enhancedError.originalError = error;
    enhancedError.operation = operation;
    enhancedError.path = path;
    enhancedError.repository = this.constructor.name;
    
    this._log('error', `${operation} failed for path "${path}"`, error);
    throw enhancedError;
  }
}

export default BaseRepository;

