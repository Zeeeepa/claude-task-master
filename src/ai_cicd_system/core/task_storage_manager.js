/**
 * @fileoverview Task Storage Manager
 * @description Unified task storage with comprehensive context preservation
 */

import { log } from '../../../scripts/modules/utils.js';

/**
 * Task storage manager with PostgreSQL backend and mock support
 * Implements the TaskStorageInterface
 */
export class TaskStorageManager {
    constructor(config = {}) {
        this.config = {
            host: config.host || 'localhost',
            port: config.port || 5432,
            database: config.database || 'codegen-taskmaster-db',
            username: config.username || 'software_developer',
            password: config.password || 'password',
            ssl_mode: config.ssl_mode || 'require',
            enable_mock: config.enable_mock || false,
            pool_min_size: config.pool_min_size || 5,
            pool_max_size: config.pool_max_size || 20,
            command_timeout: config.command_timeout || 60000,
            ...config
        };
        
        this.isInitialized = false;
        this.mockStorage = new Map();
        this.mockContext = new Map();
        this.pool = null;
    }

    /**
     * Initialize the task storage
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        log('debug', 'Initializing task storage manager...');
        
        if (this.config.enable_mock) {
            log('info', 'Using mock task storage');
            this.isInitialized = true;
        } else {
            // Real PostgreSQL initialization would go here
            log('info', 'Initializing PostgreSQL connection...');
            await this._initializeDatabase();
            this.isInitialized = true;
        }
        
        log('debug', 'Task storage manager initialized');
    }

    /**
     * Store atomic task with requirement context
     * @param {Object} task - Atomic task to store
     * @param {Object} requirement - Original requirement context
     * @returns {Promise<string>} Task ID
     */
    async storeAtomicTask(task, requirement) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const taskId = task.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const taskEntry = {
            id: taskId,
            title: task.title,
            description: task.description,
            type: task.type || 'feature',
            priority: task.priority || 'medium',
            complexity: task.complexity || 'medium',
            estimated_hours: task.estimated_hours || 0,
            status: 'pending',
            requirement_id: requirement.id,
            requirement_context: requirement,
            created_at: new Date(),
            updated_at: new Date(),
            metadata: task.metadata || {}
        };

        if (this.config.enable_mock) {
            this.mockStorage.set(taskId, taskEntry);
            log('debug', `Mock: Stored task ${taskId}`);
        } else {
            await this._storeTaskInDatabase(taskEntry);
        }

        return taskId;
    }

    /**
     * Retrieve task by ID
     * @param {string} taskId - Task ID
     * @returns {Promise<Object|null>} Task object or null
     */
    async retrieveTaskById(taskId) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (this.config.enable_mock) {
            return this.mockStorage.get(taskId) || null;
        } else {
            return await this._getTaskFromDatabase(taskId);
        }
    }

    /**
     * Update task status
     * @param {string} taskId - Task ID
     * @param {string} status - New status
     * @param {Object} context - Additional context
     */
    async updateTaskStatus(taskId, status, context = {}) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (this.config.enable_mock) {
            const task = this.mockStorage.get(taskId);
            if (task) {
                task.status = status;
                task.updated_at = new Date();
                task.context = { ...task.context, ...context };
                this.mockStorage.set(taskId, task);
                log('debug', `Mock: Updated task ${taskId} status to ${status}`);
            }
        } else {
            await this._updateTaskStatusInDatabase(taskId, status, context);
        }
    }

    /**
     * Get pending tasks
     * @returns {Promise<Array<Object>>} Array of pending tasks
     */
    async getPendingTasks() {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (this.config.enable_mock) {
            const tasks = Array.from(this.mockStorage.values());
            return tasks.filter(task => task.status === 'pending');
        } else {
            return await this._getPendingTasksFromDatabase();
        }
    }

    /**
     * Mark task as completed
     * @param {string} taskId - Task ID
     * @param {Object} results - Task results
     */
    async markTaskCompleted(taskId, results = {}) {
        await this.updateTaskStatus(taskId, 'completed', { 
            results, 
            completed_at: new Date() 
        });
    }

    /**
     * Store task context
     * @param {string} taskId - Task ID
     * @param {string} contextType - Type of context
     * @param {Object} contextData - Context data
     */
    async storeTaskContext(taskId, contextType, contextData) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const contextEntry = {
            task_id: taskId,
            context_type: contextType,
            context_data: contextData,
            created_at: new Date()
        };

        if (this.config.enable_mock) {
            if (!this.mockContext.has(taskId)) {
                this.mockContext.set(taskId, []);
            }
            this.mockContext.get(taskId).push(contextEntry);
            log('debug', `Mock: Stored ${contextType} context for task ${taskId}`);
        } else {
            await this._storeContextInDatabase(contextEntry);
        }
    }

    /**
     * Get full task context
     * @param {string} taskId - Task ID
     * @returns {Promise<Object>} Full context object
     */
    async getTaskFullContext(taskId) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const task = await this.retrieveTaskById(taskId);
        if (!task) {
            return null;
        }

        let contexts = [];
        if (this.config.enable_mock) {
            contexts = this.mockContext.get(taskId) || [];
        } else {
            contexts = await this._getContextFromDatabase(taskId);
        }

        return {
            task,
            contexts: contexts.reduce((acc, ctx) => {
                acc[ctx.context_type] = ctx.context_data;
                return acc;
            }, {}),
            full_context: contexts
        };
    }

    /**
     * Store AI interaction
     * @param {string} taskId - Task ID
     * @param {string} agentName - Agent name
     * @param {Object} interactionData - Interaction data
     */
    async storeAIInteraction(taskId, agentName, interactionData) {
        await this.storeTaskContext(taskId, 'ai_interaction', {
            agent_name: agentName,
            interaction_data: interactionData,
            timestamp: new Date()
        });
    }

    /**
     * Add task dependency
     * @param {string} parentTaskId - Parent task ID
     * @param {string} childTaskId - Child task ID
     * @param {string} dependencyType - Type of dependency
     */
    async addTaskDependency(parentTaskId, childTaskId, dependencyType = 'blocks') {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const dependency = {
            parent_task_id: parentTaskId,
            child_task_id: childTaskId,
            dependency_type: dependencyType,
            created_at: new Date()
        };

        if (this.config.enable_mock) {
            // Store in context for simplicity
            await this.storeTaskContext(parentTaskId, 'dependency', dependency);
            log('debug', `Mock: Added dependency ${parentTaskId} -> ${childTaskId}`);
        } else {
            await this._storeDependencyInDatabase(dependency);
        }
    }

    /**
     * Get task dependencies
     * @param {string} taskId - Task ID
     * @returns {Promise<Array<string>>} Array of dependent task IDs
     */
    async getTaskDependencies(taskId) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (this.config.enable_mock) {
            const contexts = this.mockContext.get(taskId) || [];
            return contexts
                .filter(ctx => ctx.context_type === 'dependency')
                .map(ctx => ctx.context_data.child_task_id);
        } else {
            return await this._getDependenciesFromDatabase(taskId);
        }
    }

    /**
     * Store validation result
     * @param {string} taskId - Task ID
     * @param {string} validationType - Type of validation
     * @param {string} validatorName - Validator name
     * @param {string} status - Validation status
     * @param {number} score - Validation score
     * @param {Object} details - Validation details
     * @param {Object} suggestions - Validation suggestions
     */
    async storeValidationResult(taskId, validationType, validatorName, status, score, details, suggestions) {
        await this.storeTaskContext(taskId, 'validation_result', {
            validation_type: validationType,
            validator_name: validatorName,
            status,
            score,
            details,
            suggestions,
            timestamp: new Date()
        });
    }

    /**
     * Get task metrics
     * @returns {Promise<Object>} Metrics object
     */
    async getTaskMetrics() {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (this.config.enable_mock) {
            const tasks = Array.from(this.mockStorage.values());
            return {
                total_tasks: tasks.length,
                pending_tasks: tasks.filter(t => t.status === 'pending').length,
                completed_tasks: tasks.filter(t => t.status === 'completed').length,
                failed_tasks: tasks.filter(t => t.status === 'failed').length,
                avg_complexity: this._calculateAverageComplexity(tasks)
            };
        } else {
            return await this._getMetricsFromDatabase();
        }
    }

    /**
     * Get health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        return {
            status: 'healthy',
            mode: this.config.enable_mock ? 'mock' : 'production',
            initialized: this.isInitialized,
            storage_type: this.config.enable_mock ? 'memory' : 'postgresql',
            tasks_stored: this.config.enable_mock ? this.mockStorage.size : 'unknown'
        };
    }

    /**
     * Shutdown the storage manager
     */
    async shutdown() {
        log('info', 'Shutting down task storage manager...');
        
        if (this.pool) {
            await this.pool.end();
        }
        
        this.mockStorage.clear();
        this.mockContext.clear();
        this.isInitialized = false;
        
        log('info', 'Task storage manager shut down');
    }

    // Private methods
    async _initializeDatabase() {
        // Real PostgreSQL initialization would go here
        log('debug', 'Mock: PostgreSQL initialization');
    }

    async _storeTaskInDatabase(taskEntry) {
        // Mock database storage
        log('debug', `Mock: Storing task ${taskEntry.id} in database`);
    }

    async _getTaskFromDatabase(taskId) {
        // Mock database retrieval
        log('debug', `Mock: Getting task ${taskId} from database`);
        return null;
    }

    async _updateTaskStatusInDatabase(taskId, status, context) {
        // Mock database update
        log('debug', `Mock: Updating task ${taskId} status to ${status} in database`);
    }

    async _getPendingTasksFromDatabase() {
        // Mock database query
        log('debug', 'Mock: Getting pending tasks from database');
        return [];
    }

    async _storeContextInDatabase(contextEntry) {
        // Mock context storage
        log('debug', `Mock: Storing context for task ${contextEntry.task_id} in database`);
    }

    async _getContextFromDatabase(taskId) {
        // Mock context retrieval
        log('debug', `Mock: Getting context for task ${taskId} from database`);
        return [];
    }

    async _storeDependencyInDatabase(dependency) {
        // Mock dependency storage
        log('debug', `Mock: Storing dependency ${dependency.parent_task_id} -> ${dependency.child_task_id} in database`);
    }

    async _getDependenciesFromDatabase(taskId) {
        // Mock dependency retrieval
        log('debug', `Mock: Getting dependencies for task ${taskId} from database`);
        return [];
    }

    async _getMetricsFromDatabase() {
        // Mock metrics retrieval
        log('debug', 'Mock: Getting metrics from database');
        return {
            total_tasks: 0,
            pending_tasks: 0,
            completed_tasks: 0,
            avg_complexity: 0
        };
    }

    _calculateAverageComplexity(tasks) {
        if (tasks.length === 0) return 0;
        
        const complexityMap = { low: 1, medium: 2, high: 3 };
        const total = tasks.reduce((sum, task) => {
            return sum + (complexityMap[task.complexity] || 2);
        }, 0);
        
        return Math.round((total / tasks.length) * 100) / 100;
    }
}

export default TaskStorageManager;

