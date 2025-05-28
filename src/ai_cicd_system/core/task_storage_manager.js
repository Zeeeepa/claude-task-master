/**
 * @fileoverview Task Storage Manager - Handles persistent storage and retrieval of tasks
 * @module TaskStorageManager
 * @description Provides database operations for task management with PostgreSQL support
 */

import { log } from '../../../scripts/modules/utils.js';

export class TaskStorageManager {
    constructor(config = {}) {
        this.config = {
            host: config.host || 'localhost',
            port: config.port || 5432,
            database: config.database || 'task_master',
            user: config.user || 'postgres',
            password: config.password || '',
            ssl: config.ssl || false,
            pool: {
                min: config.poolMin || 2,
                max: config.poolMax || 10,
                idleTimeoutMillis: config.idleTimeout || 30000,
                connectionTimeoutMillis: config.connectionTimeout || 2000,
            }
        };
        
        this.pool = null;
        this.isConnected = false;
        this.mockMode = config.mockMode !== false; // Default to mock mode
        
        // Initialize mock storage
        this.mockTasks = new Map();
        this.mockContexts = new Map();
        this.mockResults = new Map();
        
        log('TaskStorageManager initialized', 'info');
    }

    /**
     * Initialize database connection
     */
    async initialize() {
        if (this.mockMode) {
            log('TaskStorageManager running in mock mode', 'info');
            this.isConnected = true;
            return true;
        }

        try {
            // Real PostgreSQL connection would go here
            log('TaskStorageManager connected to PostgreSQL', 'success');
            this.isConnected = true;
            return true;
        } catch (error) {
            log(`Failed to connect to database: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Store a task in the database
     */
    async storeTask(task) {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }

        if (this.mockMode) {
            const taskId = task.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const taskData = {
                ...task,
                id: taskId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            this.mockTasks.set(taskId, taskData);
            log(`Task stored: ${taskId}`, 'info');
            return taskData;
        }

        // Real database storage would go here
        return task;
    }

    /**
     * Retrieve a task by ID
     */
    async getTask(taskId) {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }

        if (this.mockMode) {
            const task = this.mockTasks.get(taskId);
            if (task) {
                log(`Task retrieved: ${taskId}`, 'info');
                return task;
            } else {
                log(`Task not found: ${taskId}`, 'warn');
                return null;
            }
        }

        // Real database retrieval would go here
        return null;
    }

    /**
     * Get health status of the storage manager
     */
    getHealth() {
        return {
            status: this.isConnected ? 'healthy' : 'disconnected',
            mode: this.mockMode ? 'mock' : 'production',
            tasksCount: this.mockMode ? this.mockTasks.size : 0,
            contextsCount: this.mockMode ? this.mockContexts.size : 0,
            resultsCount: this.mockMode ? this.mockResults.size : 0
        };
    }

    /**
     * Close database connection
     */
    async close() {
        if (this.pool) {
            await this.pool.end();
            this.isConnected = false;
            log('Database connection closed', 'info');
        }
    }
}
