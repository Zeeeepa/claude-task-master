/**
 * utils-migration.js
 * Migration utilities to replace direct filesystem operations with the unified data layer
 * This file provides backward-compatible functions that use the new DataManager
 */

import { getDataManager } from './DataManager.js';
import { log as originalLog } from '../utils.js';

// Get the data manager instance
const dataManager = getDataManager();

/**
 * Enhanced readJSON function using the unified data layer
 * Replaces the original readJSON function in utils.js
 * @param {string} filepath - Path to the JSON file
 * @param {Object} options - Additional options
 * @returns {any|null} Parsed JSON data or null on error
 */
export function readJSON(filepath, options = {}) {
  try {
    // Use async/await in a sync wrapper for backward compatibility
    return dataManager.readJson(filepath, options);
  } catch (error) {
    originalLog('error', `Error reading JSON file ${filepath}:`, error.message);
    return null;
  }
}

/**
 * Enhanced writeJSON function using the unified data layer
 * Replaces the original writeJSON function in utils.js
 * @param {string} filepath - Path to the JSON file
 * @param {Object} data - Data to write
 * @param {Object} options - Additional options
 */
export function writeJSON(filepath, data, options = {}) {
  try {
    // Use async/await in a sync wrapper for backward compatibility
    dataManager.writeJson(filepath, data, options);
  } catch (error) {
    originalLog('error', `Error writing JSON file ${filepath}:`, error.message);
  }
}

/**
 * Async version of readJSON for new code
 * @param {string} filepath - Path to the JSON file
 * @param {Object} options - Additional options
 * @returns {Promise<any|null>} Parsed JSON data or null on error
 */
export async function readJSONAsync(filepath, options = {}) {
  try {
    return await dataManager.readJson(filepath, options);
  } catch (error) {
    originalLog('error', `Error reading JSON file ${filepath}:`, error.message);
    return null;
  }
}

/**
 * Async version of writeJSON for new code
 * @param {string} filepath - Path to the JSON file
 * @param {Object} data - Data to write
 * @param {Object} options - Additional options
 * @returns {Promise<void>}
 */
export async function writeJSONAsync(filepath, data, options = {}) {
  try {
    await dataManager.writeJson(filepath, data, options);
  } catch (error) {
    originalLog('error', `Error writing JSON file ${filepath}:`, error.message);
    throw error;
  }
}

/**
 * Read tasks using the unified data layer
 * @param {string} tasksPath - Path to tasks.json file
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Tasks data structure
 */
export async function readTasks(tasksPath, options = {}) {
  try {
    return await dataManager.readTasks(tasksPath, options);
  } catch (error) {
    originalLog('error', `Error reading tasks file ${tasksPath}:`, error.message);
    throw error;
  }
}

/**
 * Write tasks using the unified data layer
 * @param {string} tasksPath - Path to tasks.json file
 * @param {Object} tasksData - Tasks data structure
 * @param {Object} options - Additional options
 * @returns {Promise<void>}
 */
export async function writeTasks(tasksPath, tasksData, options = {}) {
  try {
    await dataManager.writeTasks(tasksPath, tasksData, options);
  } catch (error) {
    originalLog('error', `Error writing tasks file ${tasksPath}:`, error.message);
    throw error;
  }
}

/**
 * Get a task by ID using the unified data layer
 * @param {string} tasksPath - Path to tasks.json file
 * @param {number} taskId - Task ID
 * @returns {Promise<Object|null>} Task object or null if not found
 */
export async function getTaskById(tasksPath, taskId) {
  try {
    return await dataManager.getTask(tasksPath, taskId);
  } catch (error) {
    originalLog('error', `Error getting task ${taskId} from ${tasksPath}:`, error.message);
    return null;
  }
}

/**
 * Add a task using the unified data layer
 * @param {string} tasksPath - Path to tasks.json file
 * @param {Object} taskData - Task data
 * @returns {Promise<Object>} Added task with generated ID
 */
export async function addTask(tasksPath, taskData) {
  try {
    return await dataManager.addTask(tasksPath, taskData);
  } catch (error) {
    originalLog('error', `Error adding task to ${tasksPath}:`, error.message);
    throw error;
  }
}

/**
 * Update a task using the unified data layer
 * @param {string} tasksPath - Path to tasks.json file
 * @param {number} taskId - Task ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object|null>} Updated task or null if not found
 */
export async function updateTask(tasksPath, taskId, updates) {
  try {
    return await dataManager.updateTask(tasksPath, taskId, updates);
  } catch (error) {
    originalLog('error', `Error updating task ${taskId} in ${tasksPath}:`, error.message);
    throw error;
  }
}

/**
 * Delete a task using the unified data layer
 * @param {string} tasksPath - Path to tasks.json file
 * @param {number} taskId - Task ID
 * @returns {Promise<boolean>} True if task was deleted
 */
export async function deleteTask(tasksPath, taskId) {
  try {
    return await dataManager.deleteTask(tasksPath, taskId);
  } catch (error) {
    originalLog('error', `Error deleting task ${taskId} from ${tasksPath}:`, error.message);
    return false;
  }
}

/**
 * Validate data using the unified validation layer
 * @param {any} data - Data to validate
 * @param {string} schema - Schema name
 * @returns {Object} Validation result
 */
export function validateData(data, schema) {
  return dataManager.validate(data, schema);
}

/**
 * Clear all caches in the data layer
 */
export function clearDataCache() {
  dataManager.clearCache();
  originalLog('debug', 'Cleared all data caches');
}

/**
 * Get data layer statistics
 * @returns {Object} Statistics about the data layer
 */
export function getDataStats() {
  return dataManager.getStats();
}

/**
 * Perform health check on the data layer
 * @returns {Promise<Object>} Health check results
 */
export async function checkDataHealth() {
  return await dataManager.healthCheck();
}

/**
 * Create a transaction for atomic operations
 * @returns {Object} Transaction object
 */
export function createTransaction() {
  return dataManager.createTransaction();
}

/**
 * Backup a JSON file using the data layer
 * @param {string} filePath - Path to backup
 * @param {string} backupPath - Backup destination (optional)
 * @returns {Promise<string>} Path to backup file
 */
export async function backupFile(filePath, backupPath = null) {
  try {
    return await dataManager.json().backup(filePath, backupPath);
  } catch (error) {
    originalLog('error', `Error backing up file ${filePath}:`, error.message);
    throw error;
  }
}

/**
 * Check if a file exists using the data layer
 * @param {string} filePath - Path to check
 * @returns {boolean} True if file exists
 */
export function fileExists(filePath) {
  return dataManager.json().exists(filePath);
}

/**
 * Get file statistics using the data layer
 * @param {string} filePath - Path to file
 * @returns {Object|null} File stats or null if not found
 */
export function getFileStats(filePath) {
  return dataManager.json().getStats(filePath);
}

/**
 * Migration helper to gradually replace direct filesystem operations
 * This function can be used to wrap existing code during migration
 * @param {Function} operation - Operation to wrap
 * @param {string} operationType - Type of operation for logging
 * @returns {Function} Wrapped operation
 */
export function wrapDataOperation(operation, operationType = 'unknown') {
  return async function(...args) {
    try {
      originalLog('debug', `[DataMigration] Executing ${operationType} operation`);
      const result = await operation(...args);
      originalLog('debug', `[DataMigration] Completed ${operationType} operation`);
      return result;
    } catch (error) {
      originalLog('error', `[DataMigration] Failed ${operationType} operation:`, error.message);
      throw error;
    }
  };
}

/**
 * Utility to migrate a module to use the new data layer
 * @param {Object} moduleExports - Module exports to enhance
 * @returns {Object} Enhanced module exports
 */
export function enhanceModuleWithDataLayer(moduleExports) {
  const enhanced = { ...moduleExports };
  
  // Add data layer utilities to the module
  enhanced.dataManager = dataManager;
  enhanced.readJSONAsync = readJSONAsync;
  enhanced.writeJSONAsync = writeJSONAsync;
  enhanced.readTasks = readTasks;
  enhanced.writeTasks = writeTasks;
  enhanced.validateData = validateData;
  enhanced.createTransaction = createTransaction;
  
  return enhanced;
}

// Export the data manager instance for direct access
export { dataManager };

// Re-export commonly used functions for convenience
export {
  readJSON,
  writeJSON,
  readJSONAsync,
  writeJSONAsync,
  readTasks,
  writeTasks,
  getTaskById,
  addTask,
  updateTask,
  deleteTask,
  validateData,
  clearDataCache,
  getDataStats,
  checkDataHealth,
  createTransaction,
  backupFile,
  fileExists,
  getFileStats
};

