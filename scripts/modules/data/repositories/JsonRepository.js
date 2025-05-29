/**
 * JsonRepository.js
 * Unified JSON file operations with caching and validation
 * Replaces direct filesystem operations throughout the codebase
 */

import fs from 'fs';
import path from 'path';
import { BaseRepository } from './BaseRepository.js';

/**
 * Repository for JSON file operations
 * Provides caching, validation, and error handling for JSON files
 */
export class JsonRepository extends BaseRepository {
  constructor(cacheManager = null, validationManager = null, options = {}) {
    super(cacheManager, validationManager);
    
    this.options = {
      encoding: 'utf8',
      createDirectories: true,
      prettyPrint: true,
      cacheEnabled: true,
      cacheTtl: 5 * 60 * 1000, // 5 minutes default
      ...options
    };
  }

  /**
   * Read JSON data from file
   * @param {string} filePath - Path to JSON file
   * @param {Object} options - Read options
   * @returns {Promise<any>} Parsed JSON data
   */
  async read(filePath, options = {}) {
    const resolvedPath = path.resolve(filePath);
    const cacheKey = this._getCacheKey(resolvedPath);
    
    try {
      // Check cache first if enabled
      if (this.options.cacheEnabled && !options.skipCache) {
        const cached = this._getFromCache(cacheKey);
        if (cached !== null) {
          this._log('debug', `Cache hit for path: ${resolvedPath}`);
          return cached;
        }
      }

      // Check if file exists
      if (!this.exists(resolvedPath)) {
        throw new Error(`File does not exist: ${resolvedPath}`);
      }

      // Read and parse file
      const rawData = fs.readFileSync(resolvedPath, this.options.encoding);
      const parsedData = JSON.parse(rawData);

      // Validate if validation manager is available
      if (this.validationManager && options.schema) {
        const validation = this._validate(parsedData, options.schema);
        if (!validation.success) {
          throw new Error(`Validation failed: ${validation.error}`);
        }
      }

      // Cache the result if caching is enabled
      if (this.options.cacheEnabled && !options.skipCache) {
        this._setCache(cacheKey, parsedData, this.options.cacheTtl);
        this._log('debug', `Cached data for path: ${resolvedPath}`);
      }

      this._log('debug', `Successfully read JSON from: ${resolvedPath}`);
      return parsedData;

    } catch (error) {
      this._handleError(error, 'read', resolvedPath);
    }
  }

  /**
   * Write JSON data to file
   * @param {string} filePath - Path to JSON file
   * @param {any} data - Data to write
   * @param {Object} options - Write options
   * @returns {Promise<void>}
   */
  async write(filePath, data, options = {}) {
    const resolvedPath = path.resolve(filePath);
    const cacheKey = this._getCacheKey(resolvedPath);
    
    try {
      // Validate data if validation manager is available
      if (this.validationManager && options.schema) {
        const validation = this._validate(data, options.schema);
        if (!validation.success) {
          throw new Error(`Validation failed: ${validation.error}`);
        }
      }

      // Create directory if it doesn't exist
      if (this.options.createDirectories) {
        const dir = path.dirname(resolvedPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          this._log('debug', `Created directory: ${dir}`);
        }
      }

      // Serialize data
      const jsonString = this.options.prettyPrint 
        ? JSON.stringify(data, null, 2)
        : JSON.stringify(data);

      // Write to file
      fs.writeFileSync(resolvedPath, jsonString, this.options.encoding);

      // Update cache
      if (this.options.cacheEnabled) {
        this._setCache(cacheKey, data, this.options.cacheTtl);
        this._log('debug', `Updated cache for path: ${resolvedPath}`);
      }

      this._log('debug', `Successfully wrote JSON to: ${resolvedPath}`);

    } catch (error) {
      this._handleError(error, 'write', resolvedPath);
    }
  }

  /**
   * Check if JSON file exists
   * @param {string} filePath - Path to check
   * @returns {boolean} True if file exists
   */
  exists(filePath) {
    try {
      const resolvedPath = path.resolve(filePath);
      return fs.existsSync(resolvedPath);
    } catch (error) {
      this._log('warn', `Error checking existence of: ${filePath}`, error);
      return false;
    }
  }

  /**
   * Delete JSON file
   * @param {string} filePath - Path to delete
   * @returns {Promise<void>}
   */
  async delete(filePath) {
    const resolvedPath = path.resolve(filePath);
    const cacheKey = this._getCacheKey(resolvedPath);
    
    try {
      if (this.exists(resolvedPath)) {
        fs.unlinkSync(resolvedPath);
        this._log('debug', `Successfully deleted: ${resolvedPath}`);
      }

      // Remove from cache
      this._invalidateCache(cacheKey);

    } catch (error) {
      this._handleError(error, 'delete', resolvedPath);
    }
  }

  /**
   * Update specific fields in JSON file
   * @param {string} filePath - Path to JSON file
   * @param {Object} updates - Object with fields to update
   * @param {Object} options - Update options
   * @returns {Promise<any>} Updated data
   */
  async update(filePath, updates, options = {}) {
    try {
      const currentData = await this.read(filePath, options);
      const updatedData = { ...currentData, ...updates };
      await this.write(filePath, updatedData, options);
      return updatedData;
    } catch (error) {
      this._handleError(error, 'update', filePath);
    }
  }

  /**
   * Append data to JSON array file
   * @param {string} filePath - Path to JSON file containing array
   * @param {any} item - Item to append
   * @param {Object} options - Append options
   * @returns {Promise<any>} Updated array
   */
  async append(filePath, item, options = {}) {
    try {
      let currentData;
      
      if (this.exists(filePath)) {
        currentData = await this.read(filePath, options);
        if (!Array.isArray(currentData)) {
          throw new Error('File does not contain an array');
        }
      } else {
        currentData = [];
      }

      currentData.push(item);
      await this.write(filePath, currentData, options);
      return currentData;
    } catch (error) {
      this._handleError(error, 'append', filePath);
    }
  }

  /**
   * Get file stats
   * @param {string} filePath - Path to file
   * @returns {Object} File stats including size, modified time, etc.
   */
  getStats(filePath) {
    try {
      const resolvedPath = path.resolve(filePath);
      if (!this.exists(resolvedPath)) {
        return null;
      }
      
      const stats = fs.statSync(resolvedPath);
      return {
        size: stats.size,
        modified: stats.mtime,
        created: stats.birthtime,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory()
      };
    } catch (error) {
      this._log('warn', `Error getting stats for: ${filePath}`, error);
      return null;
    }
  }

  /**
   * Clear all cached data for this repository
   */
  clearCache() {
    if (this.cacheManager) {
      // Clear all cache entries for this repository
      this.cacheManager.clearByPrefix(`repo:${this.constructor.name}:`);
      this._log('debug', 'Cleared all cache entries');
    }
  }

  /**
   * Backup a JSON file
   * @param {string} filePath - Path to backup
   * @param {string} backupPath - Backup destination (optional)
   * @returns {Promise<string>} Path to backup file
   */
  async backup(filePath, backupPath = null) {
    try {
      const resolvedPath = path.resolve(filePath);
      
      if (!this.exists(resolvedPath)) {
        throw new Error(`Source file does not exist: ${resolvedPath}`);
      }

      const backupDestination = backupPath || 
        `${resolvedPath}.backup.${Date.now()}`;

      const data = await this.read(resolvedPath, { skipCache: true });
      await this.write(backupDestination, data);

      this._log('debug', `Created backup: ${resolvedPath} -> ${backupDestination}`);
      return backupDestination;
    } catch (error) {
      this._handleError(error, 'backup', filePath);
    }
  }
}

export default JsonRepository;

