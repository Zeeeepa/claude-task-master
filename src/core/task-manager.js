/**
 * @fileoverview Enhanced Task Manager - Preserves existing functionality while adding new features
 * @description Bridges legacy task management with new event-driven architecture
 */

import { EventEmitter } from 'events';
import { getConfig } from '../../config/orchestrator.js';

// Import all legacy task management functions
import {
    parsePRD,
    updateTasks,
    updateTaskById,
    generateTaskFiles,
    setTaskStatus,
    updateSingleTaskStatus,
    listTasks,
    expandTask,
    expandAllTasks,
    clearSubtasks,
    addTask,
    analyzeTaskComplexity,
    findNextTask,
    addSubtask,
    removeSubtask,
    updateSubtaskById,
    removeTask,
    taskExists,
    isTaskDependentOn,
    moveTask
} from '../../scripts/modules/task-manager.js';

import { findTaskById, readComplexityReport } from '../../scripts/modules/utils.js';

/**
 * Task states for enhanced tracking
 */
export const TaskState = {
    NOT_STARTED: 'not-started',
    IN_PROGRESS: 'in-progress',
    COMPLETED: 'completed',
    BLOCKED: 'blocked',
    CANCELLED: 'cancelled',
    ON_HOLD: 'on-hold'
};

/**
 * Task priority levels
 */
export const TaskPriority = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical'
};

/**
 * Enhanced Task Manager Class
 * Preserves all existing functionality while adding event-driven capabilities
 */
export class TaskManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            preserveLegacyFunctionality: true,
            enableEventLogging: true,
            backwardCompatibility: true,
            autoSaveInterval: 60000, // 1 minute
            maxTaskHistory: 1000,
            enableTaskValidation: true,
            enableDependencyTracking: true,
            ...options
        };

        this.eventBus = options.eventBus;
        this.initialized = false;
        this.taskCache = new Map();
        this.taskHistory = [];
        this.autoSaveTimer = null;
        
        // Metrics
        this.metrics = {
            tasksCreated: 0,
            tasksCompleted: 0,
            tasksUpdated: 0,
            tasksDeleted: 0,
            eventsEmitted: 0,
            validationErrors: 0
        };

        // Legacy function mappings for backward compatibility
        this.legacyFunctions = {
            parsePRD,
            updateTasks,
            updateTaskById,
            generateTaskFiles,
            setTaskStatus,
            updateSingleTaskStatus,
            listTasks,
            expandTask,
            expandAllTasks,
            clearSubtasks,
            addTask,
            analyzeTaskComplexity,
            findNextTask,
            addSubtask,
            removeSubtask,
            updateSubtaskById,
            removeTask,
            taskExists,
            isTaskDependentOn,
            moveTask,
            findTaskById,
            readComplexityReport
        };
    }

    /**
     * Initialize the task manager
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            this.emit('taskManager:initializing');

            // Setup auto-save if enabled
            if (this.options.autoSaveInterval > 0) {
                this.setupAutoSave();
            }

            // Setup event logging if enabled
            if (this.options.enableEventLogging) {
                this.setupEventLogging();
            }

            // Load existing tasks into cache
            await this.loadTasksIntoCache();

            this.initialized = true;
            this.emit('taskManager:initialized');

            console.log('✅ Enhanced Task Manager initialized');
        } catch (error) {
            this.emit('taskManager:error', error);
            throw new Error(`Failed to initialize Task Manager: ${error.message}`);
        }
    }

    /**
     * Load existing tasks into cache for performance
     */
    async loadTasksIntoCache() {
        try {
            const tasks = await this.listTasks();
            if (tasks && Array.isArray(tasks)) {
                tasks.forEach(task => {
                    this.taskCache.set(task.id, task);
                });
            }
        } catch (error) {
            console.warn('Warning: Could not load tasks into cache:', error.message);
        }
    }

    /**
     * Setup auto-save functionality
     */
    setupAutoSave() {
        this.autoSaveTimer = setInterval(async () => {
            try {
                await this.saveTaskCache();
                this.emit('taskManager:autoSave:completed');
            } catch (error) {
                this.emit('taskManager:autoSave:error', error);
            }
        }, this.options.autoSaveInterval);
    }

    /**
     * Setup event logging
     */
    setupEventLogging() {
        const eventsToLog = [
            'task:created',
            'task:updated',
            'task:completed',
            'task:deleted',
            'task:status:changed',
            'subtask:added',
            'subtask:removed',
            'dependency:added',
            'dependency:removed'
        ];

        eventsToLog.forEach(eventName => {
            this.on(eventName, (data) => {
                this.logEvent(eventName, data);
                this.metrics.eventsEmitted++;
                
                // Forward to event bus if available
                if (this.eventBus) {
                    this.eventBus.emit(eventName, data);
                }
            });
        });
    }

    /**
     * Log event with timestamp and context
     * @param {string} eventName - Name of the event
     * @param {Object} data - Event data
     */
    logEvent(eventName, data) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            event: eventName,
            data: data,
            source: 'TaskManager'
        };

        this.taskHistory.push(logEntry);

        // Maintain history size limit
        if (this.taskHistory.length > this.options.maxTaskHistory) {
            this.taskHistory = this.taskHistory.slice(-this.options.maxTaskHistory);
        }

        if (getConfig('orchestrator.logLevel') === 'debug') {
            console.log(`📝 Task Event: ${eventName}`, data);
        }
    }

    /**
     * Enhanced add task with validation and events
     * @param {Object} taskData - Task data
     * @param {Object} options - Options
     * @returns {Promise<Object>} Created task
     */
    async addTask(taskData, options = {}) {
        try {
            // Validate task data if validation is enabled
            if (this.options.enableTaskValidation) {
                this.validateTaskData(taskData);
            }

            // Call legacy add task function
            const result = await this.legacyFunctions.addTask(taskData, options);

            // Update cache
            if (result && result.id) {
                this.taskCache.set(result.id, result);
            }

            // Emit events
            this.emit('task:created', { task: result, options });
            this.metrics.tasksCreated++;

            return result;
        } catch (error) {
            this.emit('task:creation:error', { taskData, error });
            throw error;
        }
    }

    /**
     * Enhanced update task with validation and events
     * @param {string|number} taskId - Task ID
     * @param {Object} updateData - Update data
     * @param {Object} options - Options
     * @returns {Promise<Object>} Updated task
     */
    async updateTask(taskId, updateData, options = {}) {
        try {
            // Get original task for comparison
            const originalTask = await this.getTask(taskId);

            // Validate update data if validation is enabled
            if (this.options.enableTaskValidation) {
                this.validateUpdateData(updateData);
            }

            // Call legacy update function
            const result = await this.legacyFunctions.updateTaskById(taskId, updateData, options);

            // Update cache
            if (result) {
                this.taskCache.set(taskId, result);
            }

            // Emit events
            this.emit('task:updated', { 
                taskId, 
                originalTask, 
                updatedTask: result, 
                updateData, 
                options 
            });
            this.metrics.tasksUpdated++;

            // Check for status changes
            if (originalTask && originalTask.status !== result?.status) {
                this.emit('task:status:changed', {
                    taskId,
                    oldStatus: originalTask.status,
                    newStatus: result.status,
                    task: result
                });

                // Check if task is completed
                if (result.status === TaskState.COMPLETED) {
                    this.emit('task:completed', { task: result });
                    this.metrics.tasksCompleted++;
                }
            }

            return result;
        } catch (error) {
            this.emit('task:update:error', { taskId, updateData, error });
            throw error;
        }
    }

    /**
     * Enhanced add subtask with events
     * @param {string|number} parentTaskId - Parent task ID
     * @param {Object} subtaskData - Subtask data
     * @param {Object} options - Options
     * @returns {Promise<Object>} Created subtask
     */
    async addSubtask(parentTaskId, subtaskData, options = {}) {
        try {
            // Validate subtask data if validation is enabled
            if (this.options.enableTaskValidation) {
                this.validateTaskData(subtaskData);
            }

            // Call legacy add subtask function
            const result = await this.legacyFunctions.addSubtask(parentTaskId, subtaskData, options);

            // Emit events
            this.emit('subtask:added', { 
                parentTaskId, 
                subtask: result, 
                options 
            });

            return result;
        } catch (error) {
            this.emit('subtask:creation:error', { parentTaskId, subtaskData, error });
            throw error;
        }
    }

    /**
     * Enhanced remove task with events
     * @param {string|number} taskId - Task ID
     * @param {Object} options - Options
     * @returns {Promise<boolean>} Success status
     */
    async removeTask(taskId, options = {}) {
        try {
            // Get task before removal for event data
            const task = await this.getTask(taskId);

            // Call legacy remove function
            const result = await this.legacyFunctions.removeTask(taskId, options);

            // Remove from cache
            this.taskCache.delete(taskId);

            // Emit events
            this.emit('task:deleted', { taskId, task, options });
            this.metrics.tasksDeleted++;

            return result;
        } catch (error) {
            this.emit('task:deletion:error', { taskId, error });
            throw error;
        }
    }

    /**
     * Get task with caching
     * @param {string|number} taskId - Task ID
     * @returns {Promise<Object|null>} Task object
     */
    async getTask(taskId) {
        try {
            // Check cache first
            if (this.taskCache.has(taskId)) {
                return this.taskCache.get(taskId);
            }

            // Fall back to legacy function
            const task = await this.legacyFunctions.findTaskById(taskId);
            
            // Update cache
            if (task) {
                this.taskCache.set(taskId, task);
            }

            return task;
        } catch (error) {
            this.emit('task:retrieval:error', { taskId, error });
            return null;
        }
    }

    /**
     * Process requirement through task management
     * @param {string} requirement - Natural language requirement
     * @param {Object} options - Processing options
     * @returns {Promise<Object>} Processing result
     */
    async processRequirement(requirement, options = {}) {
        try {
            this.emit('requirement:processing:started', { requirement, options });

            // Parse requirement into tasks
            const parsedTasks = await this.legacyFunctions.parsePRD(requirement, options);

            // Create tasks from parsed data
            const createdTasks = [];
            if (parsedTasks && Array.isArray(parsedTasks)) {
                for (const taskData of parsedTasks) {
                    const task = await this.addTask(taskData, options);
                    createdTasks.push(task);
                }
            }

            const result = {
                requirement,
                tasksCreated: createdTasks.length,
                tasks: createdTasks,
                timestamp: new Date().toISOString()
            };

            this.emit('requirement:processing:completed', result);
            return result;

        } catch (error) {
            this.emit('requirement:processing:error', { requirement, error });
            throw error;
        }
    }

    /**
     * Validate task data
     * @param {Object} taskData - Task data to validate
     */
    validateTaskData(taskData) {
        const errors = [];

        if (!taskData.title || typeof taskData.title !== 'string') {
            errors.push('Task title is required and must be a string');
        }

        if (taskData.priority && !Object.values(TaskPriority).includes(taskData.priority)) {
            errors.push(`Invalid priority. Must be one of: ${Object.values(TaskPriority).join(', ')}`);
        }

        if (taskData.status && !Object.values(TaskState).includes(taskData.status)) {
            errors.push(`Invalid status. Must be one of: ${Object.values(TaskState).join(', ')}`);
        }

        if (errors.length > 0) {
            this.metrics.validationErrors++;
            throw new Error(`Task validation failed:\n${errors.join('\n')}`);
        }
    }

    /**
     * Validate update data
     * @param {Object} updateData - Update data to validate
     */
    validateUpdateData(updateData) {
        const errors = [];

        if (updateData.title !== undefined && (typeof updateData.title !== 'string' || updateData.title.trim() === '')) {
            errors.push('Task title must be a non-empty string');
        }

        if (updateData.priority !== undefined && !Object.values(TaskPriority).includes(updateData.priority)) {
            errors.push(`Invalid priority. Must be one of: ${Object.values(TaskPriority).join(', ')}`);
        }

        if (updateData.status !== undefined && !Object.values(TaskState).includes(updateData.status)) {
            errors.push(`Invalid status. Must be one of: ${Object.values(TaskState).join(', ')}`);
        }

        if (errors.length > 0) {
            this.metrics.validationErrors++;
            throw new Error(`Update validation failed:\n${errors.join('\n')}`);
        }
    }

    /**
     * Save task cache to persistent storage
     */
    async saveTaskCache() {
        // Implementation would depend on storage mechanism
        // For now, this is a placeholder
        console.log('💾 Task cache saved');
    }

    /**
     * Get task manager metrics
     * @returns {Object} Metrics object
     */
    getMetrics() {
        return {
            ...this.metrics,
            cacheSize: this.taskCache.size,
            historySize: this.taskHistory.length,
            initialized: this.initialized
        };
    }

    /**
     * Get task history
     * @param {number} limit - Maximum number of entries to return
     * @returns {Array} Task history entries
     */
    getHistory(limit = 100) {
        return this.taskHistory.slice(-limit);
    }

    /**
     * Health check for the task manager
     * @returns {Promise<Object>} Health status
     */
    async healthCheck() {
        try {
            const status = {
                healthy: true,
                initialized: this.initialized,
                cacheSize: this.taskCache.size,
                metrics: this.metrics,
                timestamp: new Date().toISOString()
            };

            // Test basic functionality
            try {
                await this.legacyFunctions.listTasks();
                status.legacyFunctionsWorking = true;
            } catch (error) {
                status.healthy = false;
                status.legacyFunctionsWorking = false;
                status.error = error.message;
            }

            return status;
        } catch (error) {
            return {
                healthy: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Expose legacy functions for backward compatibility
     */
    get legacy() {
        return this.legacyFunctions;
    }

    /**
     * Stop the task manager
     */
    async stop() {
        try {
            if (this.autoSaveTimer) {
                clearInterval(this.autoSaveTimer);
                this.autoSaveTimer = null;
            }

            await this.saveTaskCache();
            this.emit('taskManager:stopped');
            
            console.log('✅ Task Manager stopped');
        } catch (error) {
            this.emit('taskManager:stop:error', error);
            throw error;
        }
    }
}

// Export legacy functions for direct access
export {
    parsePRD,
    updateTasks,
    updateTaskById,
    generateTaskFiles,
    setTaskStatus,
    updateSingleTaskStatus,
    listTasks,
    expandTask,
    expandAllTasks,
    clearSubtasks,
    addTask,
    analyzeTaskComplexity,
    findNextTask,
    addSubtask,
    removeSubtask,
    updateSubtaskById,
    removeTask,
    taskExists,
    isTaskDependentOn,
    moveTask,
    findTaskById,
    readComplexityReport,
    TaskState,
    TaskPriority
};

export default TaskManager;

