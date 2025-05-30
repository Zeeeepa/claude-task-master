/**
 * @fileoverview Storage Adapter for unified file and database storage
 * @description Provides a unified interface for task storage with automatic fallback
 * @version 1.0.0
 */

import { getConnection } from '../connection/connection_manager.js';
import { readJSON, writeJSON } from '../../../scripts/modules/utils.js';
import { TaskService } from './TaskService.js';
import { SubtaskService } from './SubtaskService.js';
import { DependencyService } from './DependencyService.js';

/**
 * StorageAdapter class for unified storage operations
 */
export class StorageAdapter {
    constructor() {
        this.config = {
            storageType: process.env.TASK_STORAGE_TYPE || 'file',
            defaultProjectId: process.env.DEFAULT_PROJECT_ID || null
        };
        
        this.isDatabase = this.config.storageType === 'database';
        
        if (this.isDatabase) {
            this.db = getConnection();
            this.taskService = new TaskService();
            this.subtaskService = new SubtaskService();
            this.dependencyService = new DependencyService();
        }
    }

    /**
     * Read tasks from storage
     * @param {string} tasksPath - Path to tasks file (for file storage)
     * @param {string} projectId - Project ID (for database storage)
     * @returns {Promise<Object>} Tasks data
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
     * @param {string} tasksPath - Path to tasks file (for file storage)
     * @param {Object} data - Tasks data
     * @param {string} projectId - Project ID (for database storage)
     * @returns {Promise<boolean>} Success status
     */
    async writeTasks(tasksPath, data, projectId = null) {
        if (this.isDatabase) {
            // For database storage, individual operations are handled by specific methods
            // This method is mainly for compatibility
            return true;
        } else {
            writeJSON(tasksPath, data);
            return true;
        }
    }

    /**
     * Check if a task exists
     * @param {string} tasksPath - Path to tasks file (for file storage)
     * @param {string|number} taskId - Task ID
     * @param {string} projectId - Project ID (for database storage)
     * @returns {Promise<boolean>} Whether task exists
     */
    async taskExists(tasksPath, taskId, projectId = null) {
        if (this.isDatabase) {
            return await this._taskExistsInDatabase(taskId, projectId || this.config.defaultProjectId);
        } else {
            const data = this._readTasksFromFile(tasksPath);
            return data.tasks && data.tasks.some(task => task.id === taskId);
        }
    }

    /**
     * Add a task to storage
     * @param {string} tasksPath - Path to tasks file (for file storage)
     * @param {Object} taskData - Task data
     * @param {string} projectId - Project ID (for database storage)
     * @returns {Promise<Object>} Created task
     */
    async addTask(tasksPath, taskData, projectId = null) {
        if (this.isDatabase) {
            return await this._addTaskToDatabase(taskData, projectId || this.config.defaultProjectId);
        } else {
            const data = this._readTasksFromFile(tasksPath);
            if (!data.tasks) data.tasks = [];
            data.tasks.push(taskData);
            writeJSON(tasksPath, data);
            return taskData;
        }
    }

    /**
     * Update a task in storage
     * @param {string} tasksPath - Path to tasks file (for file storage)
     * @param {string|number} taskId - Task ID
     * @param {Object} updates - Update data
     * @param {string} projectId - Project ID (for database storage)
     * @returns {Promise<Object|null>} Updated task
     */
    async updateTask(tasksPath, taskId, updates, projectId = null) {
        if (this.isDatabase) {
            return await this._updateTaskInDatabase(taskId, updates, projectId || this.config.defaultProjectId);
        } else {
            const data = this._readTasksFromFile(tasksPath);
            if (!data.tasks) return null;
            
            const taskIndex = data.tasks.findIndex(task => task.id === taskId);
            if (taskIndex === -1) return null;
            
            data.tasks[taskIndex] = { ...data.tasks[taskIndex], ...updates };
            writeJSON(tasksPath, data);
            return data.tasks[taskIndex];
        }
    }

    /**
     * Delete a task from storage
     * @param {string} tasksPath - Path to tasks file (for file storage)
     * @param {string|number} taskId - Task ID
     * @param {string} projectId - Project ID (for database storage)
     * @returns {Promise<boolean>} Success status
     */
    async deleteTask(tasksPath, taskId, projectId = null) {
        if (this.isDatabase) {
            return await this._deleteTaskFromDatabase(taskId, projectId || this.config.defaultProjectId);
        } else {
            const data = this._readTasksFromFile(tasksPath);
            if (!data.tasks) return false;
            
            const initialLength = data.tasks.length;
            data.tasks = data.tasks.filter(task => task.id !== taskId);
            
            if (data.tasks.length < initialLength) {
                writeJSON(tasksPath, data);
                return true;
            }
            return false;
        }
    }

    /**
     * Read tasks from database
     * @private
     * @param {string} projectId - Project ID
     * @returns {Promise<Object>} Tasks data in legacy format
     */
    async _readTasksFromDatabase(projectId) {
        try {
            // Get all tasks for the project (assuming workflow-based project organization)
            const tasks = await this.taskService.listTasks({
                // If we have a project ID, we could filter by it
                // For now, get all tasks and convert to legacy format
            });

            // Convert database tasks to legacy format
            const legacyTasks = tasks.map(task => this._convertDbTaskToLegacy(task));

            return {
                tasks: legacyTasks,
                metadata: {
                    source: 'database',
                    projectId: projectId,
                    lastUpdated: new Date().toISOString()
                }
            };
        } catch (error) {
            throw new Error(`Failed to read tasks from database: ${error.message}`);
        }
    }

    /**
     * Read tasks from file
     * @private
     * @param {string} tasksPath - Path to tasks file
     * @returns {Object} Tasks data
     */
    _readTasksFromFile(tasksPath) {
        try {
            return readJSON(tasksPath);
        } catch (error) {
            // Return empty structure if file doesn't exist
            return { tasks: [] };
        }
    }

    /**
     * Convert database task to legacy format
     * @private
     * @param {Object} dbTask - Database task
     * @returns {Object} Legacy task format
     */
    _convertDbTaskToLegacy(dbTask) {
        return {
            id: dbTask.id,
            title: dbTask.title,
            description: dbTask.description,
            status: dbTask.status,
            priority: dbTask.priority,
            complexityScore: dbTask.complexity_score,
            parentTaskId: dbTask.parent_task_id,
            workflowId: dbTask.workflow_id,
            assignedTo: dbTask.assigned_to,
            createdBy: dbTask.created_by,
            estimatedHours: dbTask.estimated_hours,
            actualHours: dbTask.actual_hours,
            dueDate: dbTask.due_date,
            startedAt: dbTask.started_at,
            completedAt: dbTask.completed_at,
            tags: dbTask.tags || [],
            requirements: dbTask.requirements || {},
            context: dbTask.context || {},
            metadata: dbTask.metadata || {},
            createdAt: dbTask.created_at,
            updatedAt: dbTask.updated_at
        };
    }

    /**
     * Convert legacy task to database format
     * @private
     * @param {Object} legacyTask - Legacy task
     * @param {string} projectId - Project ID
     * @returns {Object} Database task format
     */
    _convertLegacyTaskToDb(legacyTask, projectId) {
        return {
            title: legacyTask.title,
            description: legacyTask.description,
            status: legacyTask.status || 'pending',
            priority: legacyTask.priority || 5,
            complexity_score: legacyTask.complexityScore || 50,
            parent_task_id: legacyTask.parentTaskId || null,
            workflow_id: legacyTask.workflowId || null,
            assigned_to: legacyTask.assignedTo || null,
            created_by: legacyTask.createdBy || null,
            estimated_hours: legacyTask.estimatedHours || null,
            actual_hours: legacyTask.actualHours || null,
            due_date: legacyTask.dueDate || null,
            started_at: legacyTask.startedAt || null,
            completed_at: legacyTask.completedAt || null,
            tags: legacyTask.tags || [],
            requirements: legacyTask.requirements || {},
            context: legacyTask.context || {},
            metadata: {
                ...legacyTask.metadata || {},
                projectId: projectId,
                migratedFrom: 'legacy'
            }
        };
    }

    /**
     * Check if task exists in database
     * @private
     * @param {string|number} taskId - Task ID
     * @param {string} projectId - Project ID
     * @returns {Promise<boolean>} Whether task exists
     */
    async _taskExistsInDatabase(taskId, projectId) {
        try {
            const task = await this.taskService.getTask(taskId);
            return task !== null;
        } catch (error) {
            return false;
        }
    }

    /**
     * Add task to database
     * @private
     * @param {Object} taskData - Task data
     * @param {string} projectId - Project ID
     * @returns {Promise<Object>} Created task in legacy format
     */
    async _addTaskToDatabase(taskData, projectId) {
        try {
            const dbTaskData = this._convertLegacyTaskToDb(taskData, projectId);
            const createdTask = await this.taskService.createTask(dbTaskData);
            return this._convertDbTaskToLegacy(createdTask);
        } catch (error) {
            throw new Error(`Failed to add task to database: ${error.message}`);
        }
    }

    /**
     * Update task in database
     * @private
     * @param {string|number} taskId - Task ID
     * @param {Object} updates - Update data
     * @param {string} projectId - Project ID
     * @returns {Promise<Object|null>} Updated task in legacy format
     */
    async _updateTaskInDatabase(taskId, updates, projectId) {
        try {
            // Convert legacy updates to database format
            const dbUpdates = {};
            
            if (updates.title !== undefined) dbUpdates.title = updates.title;
            if (updates.description !== undefined) dbUpdates.description = updates.description;
            if (updates.status !== undefined) dbUpdates.status = updates.status;
            if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
            if (updates.complexityScore !== undefined) dbUpdates.complexity_score = updates.complexityScore;
            if (updates.assignedTo !== undefined) dbUpdates.assigned_to = updates.assignedTo;
            if (updates.estimatedHours !== undefined) dbUpdates.estimated_hours = updates.estimatedHours;
            if (updates.actualHours !== undefined) dbUpdates.actual_hours = updates.actualHours;
            if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate;
            if (updates.startedAt !== undefined) dbUpdates.started_at = updates.startedAt;
            if (updates.completedAt !== undefined) dbUpdates.completed_at = updates.completedAt;
            if (updates.tags !== undefined) dbUpdates.tags = updates.tags;
            if (updates.requirements !== undefined) dbUpdates.requirements = updates.requirements;
            if (updates.context !== undefined) dbUpdates.context = updates.context;
            if (updates.metadata !== undefined) dbUpdates.metadata = updates.metadata;

            const updatedTask = await this.taskService.updateTask(taskId, dbUpdates);
            return updatedTask ? this._convertDbTaskToLegacy(updatedTask) : null;
        } catch (error) {
            throw new Error(`Failed to update task in database: ${error.message}`);
        }
    }

    /**
     * Delete task from database
     * @private
     * @param {string|number} taskId - Task ID
     * @param {string} projectId - Project ID
     * @returns {Promise<boolean>} Success status
     */
    async _deleteTaskFromDatabase(taskId, projectId) {
        try {
            return await this.taskService.deleteTask(taskId);
        } catch (error) {
            throw new Error(`Failed to delete task from database: ${error.message}`);
        }
    }
}

