/**
 * DataManager.js
 * Central data management service that coordinates all data operations
 * Provides a unified interface for all data access throughout the application
 */

import { JsonRepository } from './repositories/JsonRepository.js';
import { TaskRepository } from './repositories/TaskRepository.js';
import { CacheManager } from './cache/CacheManager.js';
import { ValidationManager } from './validation/ValidationManager.js';
import { log } from '../utils.js';

/**
 * Central data manager
 * Coordinates all data operations and provides unified access to repositories
 */
export class DataManager {
  constructor(options = {}) {
    this.options = {
      enableCache: true,
      cacheOptions: {
        maxSize: 1000,
        defaultTtl: 5 * 60 * 1000, // 5 minutes
        cleanupInterval: 60 * 1000 // 1 minute
      },
      enableValidation: true,
      ...options
    };

    // Initialize core components
    this.cacheManager = this.options.enableCache 
      ? new CacheManager(this.options.cacheOptions)
      : null;
    
    this.validationManager = this.options.enableValidation 
      ? new ValidationManager()
      : null;

    // Initialize repositories
    this.repositories = new Map();
    this._initializeRepositories();

    log('info', '[DataManager] Initialized with cache and validation support');
  }

  /**
   * Initialize default repositories
   * @private
   */
  _initializeRepositories() {
    // JSON repository for general JSON operations
    this.repositories.set('json', new JsonRepository(
      this.cacheManager,
      this.validationManager
    ));

    // Task repository for task-specific operations
    this.repositories.set('tasks', new TaskRepository(
      this.cacheManager,
      this.validationManager
    ));

    log('debug', '[DataManager] Initialized default repositories');
  }

  /**
   * Get a repository by name
   * @param {string} name - Repository name
   * @returns {BaseRepository|null} Repository instance or null if not found
   */
  getRepository(name) {
    return this.repositories.get(name) || null;
  }

  /**
   * Register a custom repository
   * @param {string} name - Repository name
   * @param {BaseRepository} repository - Repository instance
   */
  registerRepository(name, repository) {
    this.repositories.set(name, repository);
    log('debug', `[DataManager] Registered repository: ${name}`);
  }

  /**
   * Remove a repository
   * @param {string} name - Repository name
   * @returns {boolean} True if repository was removed
   */
  removeRepository(name) {
    const removed = this.repositories.delete(name);
    if (removed) {
      log('debug', `[DataManager] Removed repository: ${name}`);
    }
    return removed;
  }

  /**
   * Get the JSON repository
   * @returns {JsonRepository} JSON repository instance
   */
  json() {
    return this.getRepository('json');
  }

  /**
   * Get the task repository
   * @returns {TaskRepository} Task repository instance
   */
  tasks() {
    return this.getRepository('tasks');
  }

  /**
   * Get the cache manager
   * @returns {CacheManager|null} Cache manager instance or null if disabled
   */
  cache() {
    return this.cacheManager;
  }

  /**
   * Get the validation manager
   * @returns {ValidationManager|null} Validation manager instance or null if disabled
   */
  validation() {
    return this.validationManager;
  }

  /**
   * Read JSON file (convenience method)
   * @param {string} filePath - Path to JSON file
   * @param {Object} options - Read options
   * @returns {Promise<any>} Parsed JSON data
   */
  async readJson(filePath, options = {}) {
    return this.json().read(filePath, options);
  }

  /**
   * Write JSON file (convenience method)
   * @param {string} filePath - Path to JSON file
   * @param {any} data - Data to write
   * @param {Object} options - Write options
   * @returns {Promise<void>}
   */
  async writeJson(filePath, data, options = {}) {
    return this.json().write(filePath, data, options);
  }

  /**
   * Read tasks file (convenience method)
   * @param {string} tasksPath - Path to tasks.json file
   * @param {Object} options - Read options
   * @returns {Promise<Object>} Tasks data structure
   */
  async readTasks(tasksPath, options = {}) {
    return this.tasks().readTasks(tasksPath, options);
  }

  /**
   * Write tasks file (convenience method)
   * @param {string} tasksPath - Path to tasks.json file
   * @param {Object} tasksData - Tasks data structure
   * @param {Object} options - Write options
   * @returns {Promise<void>}
   */
  async writeTasks(tasksPath, tasksData, options = {}) {
    return this.tasks().writeTasks(tasksPath, tasksData, options);
  }

  /**
   * Get task by ID (convenience method)
   * @param {string} tasksPath - Path to tasks.json file
   * @param {number} taskId - Task ID
   * @returns {Promise<Object|null>} Task object or null if not found
   */
  async getTask(tasksPath, taskId) {
    return this.tasks().getTaskById(tasksPath, taskId);
  }

  /**
   * Add task (convenience method)
   * @param {string} tasksPath - Path to tasks.json file
   * @param {Object} taskData - Task data
   * @returns {Promise<Object>} Added task with generated ID
   */
  async addTask(tasksPath, taskData) {
    return this.tasks().addTask(tasksPath, taskData);
  }

  /**
   * Update task (convenience method)
   * @param {string} tasksPath - Path to tasks.json file
   * @param {number} taskId - Task ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated task or null if not found
   */
  async updateTask(tasksPath, taskId, updates) {
    return this.tasks().updateTask(tasksPath, taskId, updates);
  }

  /**
   * Delete task (convenience method)
   * @param {string} tasksPath - Path to tasks.json file
   * @param {number} taskId - Task ID
   * @returns {Promise<boolean>} True if task was deleted
   */
  async deleteTask(tasksPath, taskId) {
    return this.tasks().deleteTask(tasksPath, taskId);
  }

  /**
   * Validate data against schema (convenience method)
   * @param {any} data - Data to validate
   * @param {string} schema - Schema name
   * @returns {Object} Validation result
   */
  validate(data, schema) {
    if (!this.validationManager) {
      return { success: true, data };
    }
    return this.validationManager.validate(data, schema);
  }

  /**
   * Clear all caches
   */
  clearCache() {
    if (this.cacheManager) {
      this.cacheManager.clear();
      log('debug', '[DataManager] Cleared all caches');
    }
  }

  /**
   * Get data manager statistics
   * @returns {Object} Statistics about the data manager
   */
  getStats() {
    const stats = {
      repositories: Array.from(this.repositories.keys()),
      cacheEnabled: !!this.cacheManager,
      validationEnabled: !!this.validationManager
    };

    if (this.cacheManager) {
      stats.cache = this.cacheManager.getStats();
    }

    if (this.validationManager) {
      stats.validation = this.validationManager.getStats();
    }

    return stats;
  }

  /**
   * Perform health check on all components
   * @returns {Object} Health check results
   */
  async healthCheck() {
    const health = {
      status: 'healthy',
      components: {},
      timestamp: new Date().toISOString()
    };

    try {
      // Check cache manager
      if (this.cacheManager) {
        health.components.cache = {
          status: 'healthy',
          stats: this.cacheManager.getStats()
        };
      }

      // Check validation manager
      if (this.validationManager) {
        health.components.validation = {
          status: 'healthy',
          stats: this.validationManager.getStats()
        };
      }

      // Check repositories
      health.components.repositories = {};
      for (const [name, repo] of this.repositories.entries()) {
        health.components.repositories[name] = {
          status: 'healthy',
          type: repo.constructor.name
        };
      }

    } catch (error) {
      health.status = 'unhealthy';
      health.error = error.message;
      log('error', '[DataManager] Health check failed:', error);
    }

    return health;
  }

  /**
   * Create a transaction for atomic operations
   * @returns {Object} Transaction object
   */
  createTransaction() {
    // Simple transaction implementation
    // In a more complex system, this would integrate with a proper transaction manager
    const operations = [];
    const rollbackOperations = [];

    return {
      /**
       * Add an operation to the transaction
       * @param {Function} operation - Operation to execute
       * @param {Function} rollback - Rollback operation
       */
      addOperation(operation, rollback = null) {
        operations.push(operation);
        if (rollback) {
          rollbackOperations.unshift(rollback); // Reverse order for rollback
        }
      },

      /**
       * Execute all operations in the transaction
       * @returns {Promise<any[]>} Results of all operations
       */
      async execute() {
        const results = [];
        let executedCount = 0;

        try {
          for (const operation of operations) {
            const result = await operation();
            results.push(result);
            executedCount++;
          }
          return results;
        } catch (error) {
          // Rollback executed operations
          log('warn', `[DataManager] Transaction failed, rolling back ${executedCount} operations`);
          
          for (let i = 0; i < executedCount && i < rollbackOperations.length; i++) {
            try {
              await rollbackOperations[i]();
            } catch (rollbackError) {
              log('error', '[DataManager] Rollback operation failed:', rollbackError);
            }
          }
          
          throw error;
        }
      }
    };
  }

  /**
   * Destroy the data manager and cleanup resources
   */
  destroy() {
    if (this.cacheManager) {
      this.cacheManager.destroy();
    }

    this.repositories.clear();
    
    log('info', '[DataManager] Destroyed and cleaned up resources');
  }
}

// Create and export a singleton instance
let dataManagerInstance = null;

/**
 * Get the singleton data manager instance
 * @param {Object} options - Options for data manager (only used on first call)
 * @returns {DataManager} Data manager instance
 */
export function getDataManager(options = {}) {
  if (!dataManagerInstance) {
    dataManagerInstance = new DataManager(options);
  }
  return dataManagerInstance;
}

/**
 * Reset the singleton instance (mainly for testing)
 */
export function resetDataManager() {
  if (dataManagerInstance) {
    dataManagerInstance.destroy();
    dataManagerInstance = null;
  }
}

export default DataManager;

