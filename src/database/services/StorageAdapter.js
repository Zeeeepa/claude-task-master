/**
 * @fileoverview Storage Adapter - Abstraction layer for task storage
 * @description Provides unified interface for file-based and database storage
 * @version 1.0.0
 */

import { readJSON, writeJSON } from '../../../scripts/modules/utils.js';
import { TaskService } from './TaskService.js';
import { SubtaskService } from './SubtaskService.js';
import { DependencyService } from './DependencyService.js';
import { DatabaseConnectionManager } from '../connection/connection_manager.js';

/**
 * Storage configuration
 */
const STORAGE_CONFIG = {
    // Default to file-based storage for backward compatibility
    // Set TASK_STORAGE_TYPE=database to use database storage
    type: process.env.TASK_STORAGE_TYPE || 'file',
    
    // Default project ID for database storage
    defaultProjectId: process.env.DEFAULT_PROJECT_ID || '00000000-0000-0000-0000-000000000001'
};

/**
 * Storage Adapter class that provides unified interface
 */
export class StorageAdapter {
    constructor(config = {}) {
        this.config = { ...STORAGE_CONFIG, ...config };
        this.isDatabase = this.config.type === 'database';
        
        if (this.isDatabase) {
            this.db = new DatabaseConnectionManager();
            this.taskService = new TaskService(this.db);
            this.subtaskService = new SubtaskService(this.db);
            this.dependencyService = new DependencyService(this.db);
        }
    }

    /**
     * Read tasks from storage
     * @param {string} tasksPath - Path to tasks file (used for file storage)
     * @param {string} [projectId] - Project ID (used for database storage)
     * @returns {Promise<Object>} Tasks data in legacy format
     */
    async readTasks(tasksPath, projectId = null) {
        if (this.isDatabase) {
            return await this._readTasksFromDatabase(projectId || this.config.defaultProjectId);
        } else {
            return this._readTasksFromFile(tasksPath);
        }
    }

    /**
     * Write tasks to storage
     * @param {string} tasksPath - Path to tasks file (used for file storage)
     * @param {Object} data - Tasks data in legacy format
     * @param {string} [projectId] - Project ID (used for database storage)
     * @returns {Promise<void>}
     */
    async writeTasks(tasksPath, data, projectId = null) {
        if (this.isDatabase) {
            await this._writeTasksToDatabase(data, projectId || this.config.defaultProjectId);
        } else {
            this._writeTasksToFile(tasksPath, data);
        }
    }

    /**
     * Check if a task exists
     * @param {string} tasksPath - Path to tasks file
     * @param {string|number} taskId - Task ID
     * @param {string} [projectId] - Project ID
     * @returns {Promise<boolean>}
     */
    async taskExists(tasksPath, taskId, projectId = null) {
        if (this.isDatabase) {
            return await this._taskExistsInDatabase(taskId, projectId || this.config.defaultProjectId);
        } else {
            const data = this._readTasksFromFile(tasksPath);
            return this._taskExistsInData(data, taskId);
        }
    }

    /**
     * Add a new task
     * @param {string} tasksPath - Path to tasks file
     * @param {Object} taskData - Task data
     * @param {string} [projectId] - Project ID
     * @returns {Promise<Object>} Created task
     */
    async addTask(tasksPath, taskData, projectId = null) {
        if (this.isDatabase) {
            return await this._addTaskToDatabase(taskData, projectId || this.config.defaultProjectId);
        } else {
            return await this._addTaskToFile(tasksPath, taskData);
        }
    }

    /**
     * Update a task
     * @param {string} tasksPath - Path to tasks file
     * @param {string|number} taskId - Task ID
     * @param {Object} updates - Updates to apply
     * @param {string} [projectId] - Project ID
     * @returns {Promise<Object>} Updated task
     */
    async updateTask(tasksPath, taskId, updates, projectId = null) {
        if (this.isDatabase) {
            return await this._updateTaskInDatabase(taskId, updates, projectId || this.config.defaultProjectId);
        } else {
            return await this._updateTaskInFile(tasksPath, taskId, updates);
        }
    }

    /**
     * Delete a task
     * @param {string} tasksPath - Path to tasks file
     * @param {string|number} taskId - Task ID
     * @param {string} [projectId] - Project ID
     * @returns {Promise<boolean>} Success status
     */
    async deleteTask(tasksPath, taskId, projectId = null) {
        if (this.isDatabase) {
            return await this._deleteTaskFromDatabase(taskId, projectId || this.config.defaultProjectId);
        } else {
            return await this._deleteTaskFromFile(tasksPath, taskId);
        }
    }

    // Private methods for database operations

    async _readTasksFromDatabase(projectId) {
        try {
            const tasks = await this.taskService.listTasks({ 
                project_id: projectId,
                order_by: 'created_at',
                order_direction: 'ASC'
            });

            // Convert database format to legacy format
            const legacyTasks = await Promise.all(tasks.map(async (task) => {
                const legacyTask = this._convertDbTaskToLegacy(task);
                
                // Get subtasks if any
                if (task.parent_task_id === null) {
                    const subtasks = await this.subtaskService.getSubtasks(task.id);
                    legacyTask.subtasks = subtasks.map(st => this._convertDbSubtaskToLegacy(st));
                }
                
                return legacyTask;
            }));

            return { tasks: legacyTasks };
        } catch (error) {
            throw new Error(`Failed to read tasks from database: ${error.message}`);
        }
    }

    async _writeTasksToDatabase(data, projectId) {
        // This method is complex as it needs to sync the entire legacy format
        // For now, we'll implement individual operations (add, update, delete)
        // Full sync can be implemented later if needed
        throw new Error('Full data sync to database not implemented. Use individual operations.');
    }

    async _taskExistsInDatabase(taskId, projectId) {
        try {
            // Handle subtask IDs (e.g., "1.2")
            if (typeof taskId === 'string' && taskId.includes('.')) {
                const [parentIdStr, subtaskIdStr] = taskId.split('.');
                const parentId = this._findTaskByLegacyId(parentIdStr, projectId);
                if (!parentId) return false;
                
                const subtasks = await this.subtaskService.getSubtasks(parentId);
                return subtasks.some(st => {
                    const legacyId = parseInt(st.context?.legacy_id || st.context?.order_index, 10);
                    return legacyId === parseInt(subtaskIdStr, 10);
                });
            }

            // Handle regular task IDs
            const dbTaskId = await this._findTaskByLegacyId(taskId, projectId);
            return dbTaskId !== null;
        } catch (error) {
            return false;
        }
    }

    async _addTaskToDatabase(taskData, projectId) {
        try {
            // Convert legacy format to database format
            const dbTaskData = this._convertLegacyTaskToDb(taskData, projectId);
            const createdTask = await this.taskService.createTask(dbTaskData);
            
            // Convert back to legacy format for return
            return this._convertDbTaskToLegacy(createdTask);
        } catch (error) {
            throw new Error(`Failed to add task to database: ${error.message}`);
        }
    }

    async _updateTaskInDatabase(taskId, updates, projectId) {
        try {
            const dbTaskId = await this._findTaskByLegacyId(taskId, projectId);
            if (!dbTaskId) {
                throw new Error(`Task with ID ${taskId} not found`);
            }

            const dbUpdates = this._convertLegacyUpdatesToDb(updates);
            const updatedTask = await this.taskService.updateTask(dbTaskId, dbUpdates);
            
            return this._convertDbTaskToLegacy(updatedTask);
        } catch (error) {
            throw new Error(`Failed to update task in database: ${error.message}`);
        }
    }

    async _deleteTaskFromDatabase(taskId, projectId) {
        try {
            const dbTaskId = await this._findTaskByLegacyId(taskId, projectId);
            if (!dbTaskId) {
                return false;
            }

            return await this.taskService.deleteTask(dbTaskId);
        } catch (error) {
            throw new Error(`Failed to delete task from database: ${error.message}`);
        }
    }

    // Private methods for file operations

    _readTasksFromFile(tasksPath) {
        const data = readJSON(tasksPath);
        if (!data || !data.tasks) {
            return { tasks: [] };
        }
        return data;
    }

    _writeTasksToFile(tasksPath, data) {
        writeJSON(tasksPath, data);
    }

    _taskExistsInData(data, taskId) {
        if (!data || !data.tasks) return false;

        // Handle subtask IDs (e.g., "1.2")
        if (typeof taskId === 'string' && taskId.includes('.')) {
            const [parentIdStr, subtaskIdStr] = taskId.split('.');
            const parentId = parseInt(parentIdStr, 10);
            const subtaskId = parseInt(subtaskIdStr, 10);

            const parentTask = data.tasks.find((t) => t.id === parentId);
            return (
                parentTask &&
                parentTask.subtasks &&
                parentTask.subtasks.some((st) => st.id === subtaskId)
            );
        }

        // Handle regular task IDs
        const id = parseInt(taskId, 10);
        return data.tasks.some((t) => t.id === id);
    }

    async _addTaskToFile(tasksPath, taskData) {
        const data = this._readTasksFromFile(tasksPath);
        
        // Find the highest task ID to determine the next ID
        const highestId = data.tasks.length > 0 ? Math.max(...data.tasks.map((t) => t.id)) : 0;
        const newTaskId = highestId + 1;

        const newTask = {
            id: newTaskId,
            ...taskData,
            subtasks: taskData.subtasks || []
        };

        data.tasks.push(newTask);
        this._writeTasksToFile(tasksPath, data);
        
        return newTask;
    }

    async _updateTaskInFile(tasksPath, taskId, updates) {
        const data = this._readTasksFromFile(tasksPath);
        const taskIndex = data.tasks.findIndex(t => t.id === parseInt(taskId, 10));
        
        if (taskIndex === -1) {
            throw new Error(`Task with ID ${taskId} not found`);
        }

        data.tasks[taskIndex] = { ...data.tasks[taskIndex], ...updates };
        this._writeTasksToFile(tasksPath, data);
        
        return data.tasks[taskIndex];
    }

    async _deleteTaskFromFile(tasksPath, taskId) {
        const data = this._readTasksFromFile(tasksPath);
        const taskIndex = data.tasks.findIndex(t => t.id === parseInt(taskId, 10));
        
        if (taskIndex === -1) {
            return false;
        }

        data.tasks.splice(taskIndex, 1);
        this._writeTasksToFile(tasksPath, data);
        
        return true;
    }

    // Helper methods for format conversion

    _convertDbTaskToLegacy(dbTask) {
        return {
            id: parseInt(dbTask.context?.legacy_id || dbTask.id, 10),
            title: dbTask.title,
            description: dbTask.description,
            details: dbTask.context?.details || '',
            testStrategy: dbTask.context?.testStrategy || '',
            status: this._convertDbStatusToLegacy(dbTask.status),
            dependencies: dbTask.dependencies || [],
            priority: dbTask.context?.priority || dbTask.priority || 0,
            subtasks: [] // Will be populated separately
        };
    }

    _convertDbSubtaskToLegacy(dbSubtask) {
        return {
            id: parseInt(dbSubtask.context?.legacy_id || dbSubtask.context?.order_index, 10),
            title: dbSubtask.title,
            description: dbSubtask.description,
            status: this._convertDbStatusToLegacy(dbSubtask.status)
        };
    }

    _convertLegacyTaskToDb(legacyTask, projectId) {
        return {
            project_id: projectId,
            title: legacyTask.title,
            description: legacyTask.description,
            priority: legacyTask.priority || 0,
            status: this._convertLegacyStatusToDb(legacyTask.status),
            dependencies: legacyTask.dependencies || [],
            context: {
                legacy_id: legacyTask.id,
                details: legacyTask.details,
                testStrategy: legacyTask.testStrategy,
                priority: legacyTask.priority
            }
        };
    }

    _convertLegacyUpdatesToDb(legacyUpdates) {
        const dbUpdates = { ...legacyUpdates };
        
        if (legacyUpdates.status) {
            dbUpdates.status = this._convertLegacyStatusToDb(legacyUpdates.status);
        }

        // Move certain fields to context
        if (legacyUpdates.details || legacyUpdates.testStrategy) {
            dbUpdates.context = {
                ...(dbUpdates.context || {}),
                details: legacyUpdates.details,
                testStrategy: legacyUpdates.testStrategy
            };
            delete dbUpdates.details;
            delete dbUpdates.testStrategy;
        }

        return dbUpdates;
    }

    _convertDbStatusToLegacy(dbStatus) {
        const statusMap = {
            'pending': 'pending',
            'in_progress': 'in-progress',
            'completed': 'done',
            'failed': 'failed',
            'cancelled': 'cancelled'
        };
        return statusMap[dbStatus] || dbStatus;
    }

    _convertLegacyStatusToDb(legacyStatus) {
        const statusMap = {
            'pending': 'pending',
            'in-progress': 'in_progress',
            'done': 'completed',
            'completed': 'completed',
            'failed': 'failed',
            'cancelled': 'cancelled',
            'blocked': 'pending', // Map blocked to pending for now
            'deferred': 'pending' // Map deferred to pending for now
        };
        return statusMap[legacyStatus] || 'pending';
    }

    async _findTaskByLegacyId(legacyId, projectId) {
        try {
            const tasks = await this.taskService.listTasks({ 
                project_id: projectId 
            });
            
            const task = tasks.find(t => 
                parseInt(t.context?.legacy_id, 10) === parseInt(legacyId, 10)
            );
            
            return task ? task.id : null;
        } catch (error) {
            return null;
        }
    }
}

export default StorageAdapter;

