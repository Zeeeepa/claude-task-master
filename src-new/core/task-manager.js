/**
 * Task Manager
 * Core task management functionality (preserved from existing system)
 */

import EventEmitter from 'events';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export class TaskManager extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            tasksFile: config.tasksFile || 'tasks.json',
            autoSave: config.autoSave !== false,
            ...config
        };
        this.tasks = [];
        this.isReady = false;
    }

    /**
     * Initialize task manager
     */
    async initialize() {
        try {
            await this.loadTasks();
            this.isReady = true;
            this.emit('initialized');
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Load tasks from file
     */
    async loadTasks() {
        if (!existsSync(this.config.tasksFile)) {
            this.tasks = [];
            return;
        }

        try {
            const data = await readFile(this.config.tasksFile, 'utf8');
            this.tasks = JSON.parse(data);
        } catch (error) {
            console.warn(`Failed to load tasks from ${this.config.tasksFile}:`, error.message);
            this.tasks = [];
        }
    }

    /**
     * Save tasks to file
     */
    async saveTasks() {
        if (!this.config.autoSave) {
            return;
        }

        try {
            await writeFile(
                this.config.tasksFile, 
                JSON.stringify(this.tasks, null, 2)
            );
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Get all tasks
     */
    getAllTasks() {
        return [...this.tasks];
    }

    /**
     * Get task by ID
     */
    async getTask(id) {
        return this.tasks.find(task => task.id === id);
    }

    /**
     * Create new task
     */
    async createTask(taskData) {
        const task = {
            id: this.generateTaskId(),
            title: taskData.title,
            description: taskData.description || '',
            status: taskData.status || 'pending',
            priority: taskData.priority || 'medium',
            dependencies: taskData.dependencies || [],
            details: taskData.details || '',
            testStrategy: taskData.testStrategy || '',
            subtasks: taskData.subtasks || [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            ...taskData
        };

        this.tasks.push(task);
        await this.saveTasks();
        
        this.emit('task.created', task);
        return task;
    }

    /**
     * Update task
     */
    async updateTask(id, updates) {
        const taskIndex = this.tasks.findIndex(task => task.id === id);
        if (taskIndex === -1) {
            throw new Error(`Task ${id} not found`);
        }

        const task = {
            ...this.tasks[taskIndex],
            ...updates,
            updatedAt: new Date().toISOString()
        };

        this.tasks[taskIndex] = task;
        await this.saveTasks();
        
        this.emit('task.updated', task);
        return task;
    }

    /**
     * Delete task
     */
    async deleteTask(id) {
        const taskIndex = this.tasks.findIndex(task => task.id === id);
        if (taskIndex === -1) {
            throw new Error(`Task ${id} not found`);
        }

        const task = this.tasks[taskIndex];
        this.tasks.splice(taskIndex, 1);
        await this.saveTasks();
        
        this.emit('task.deleted', task);
        return task;
    }

    /**
     * Set task status
     */
    async setTaskStatus(id, status) {
        return await this.updateTask(id, { status });
    }

    /**
     * Get tasks by status
     */
    getTasksByStatus(status) {
        return this.tasks.filter(task => task.status === status);
    }

    /**
     * Get next task to work on
     */
    getNextTask() {
        // Find pending tasks with satisfied dependencies
        const pendingTasks = this.tasks.filter(task => 
            task.status === 'pending' || task.status === 'in-progress'
        );

        const availableTasks = pendingTasks.filter(task => {
            return task.dependencies.every(depId => {
                const depTask = this.tasks.find(t => t.id === depId);
                return depTask && depTask.status === 'done';
            });
        });

        if (availableTasks.length === 0) {
            return null;
        }

        // Sort by priority and ID
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        availableTasks.sort((a, b) => {
            const priorityDiff = (priorityOrder[b.priority] || 2) - (priorityOrder[a.priority] || 2);
            if (priorityDiff !== 0) return priorityDiff;
            return a.id - b.id;
        });

        return availableTasks[0];
    }

    /**
     * Validate task dependencies
     */
    validateDependencies() {
        const errors = [];
        
        for (const task of this.tasks) {
            for (const depId of task.dependencies) {
                const depTask = this.tasks.find(t => t.id === depId);
                if (!depTask) {
                    errors.push(`Task ${task.id} depends on non-existent task ${depId}`);
                }
            }
        }

        // Check for circular dependencies
        const visited = new Set();
        const recursionStack = new Set();

        const hasCycle = (taskId) => {
            if (recursionStack.has(taskId)) {
                return true;
            }
            if (visited.has(taskId)) {
                return false;
            }

            visited.add(taskId);
            recursionStack.add(taskId);

            const task = this.tasks.find(t => t.id === taskId);
            if (task) {
                for (const depId of task.dependencies) {
                    if (hasCycle(depId)) {
                        return true;
                    }
                }
            }

            recursionStack.delete(taskId);
            return false;
        };

        for (const task of this.tasks) {
            if (hasCycle(task.id)) {
                errors.push(`Circular dependency detected involving task ${task.id}`);
            }
        }

        return errors;
    }

    /**
     * Generate unique task ID
     */
    generateTaskId() {
        const existingIds = this.tasks.map(task => task.id);
        let id = 1;
        while (existingIds.includes(id)) {
            id++;
        }
        return id;
    }

    /**
     * Check if task manager is ready
     */
    isReady() {
        return this.isReady;
    }

    /**
     * Get task statistics
     */
    getStatistics() {
        const stats = {
            total: this.tasks.length,
            pending: 0,
            'in-progress': 0,
            done: 0,
            deferred: 0
        };

        for (const task of this.tasks) {
            if (stats.hasOwnProperty(task.status)) {
                stats[task.status]++;
            }
        }

        return stats;
    }
}

export default TaskManager;

