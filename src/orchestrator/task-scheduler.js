/**
 * @fileoverview Task Scheduler - Task prioritization and scheduling
 * @description Manages task scheduling, prioritization, and execution based on dependencies
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { log } from '../../scripts/modules/utils.js';

/**
 * Task states
 */
export const TaskState = {
    PENDING: 'pending',
    QUEUED: 'queued',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    BLOCKED: 'blocked'
};

/**
 * Task priorities
 */
export const TaskPriority = {
    LOW: 1,
    NORMAL: 2,
    HIGH: 3,
    CRITICAL: 4,
    URGENT: 5
};

/**
 * Task Scheduler - Manages task prioritization and scheduling
 */
export class TaskScheduler extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            maxConcurrentTasks: config.maxConcurrentTasks || 10,
            taskTimeout: config.taskTimeout || 300000, // 5 minutes
            schedulingInterval: config.schedulingInterval || 1000, // 1 second
            enablePriorityScheduling: config.enablePriorityScheduling !== false,
            enableDependencyResolution: config.enableDependencyResolution !== false,
            maxRetryAttempts: config.maxRetryAttempts || 3,
            retryDelay: config.retryDelay || 5000,
            deadlockDetectionInterval: config.deadlockDetectionInterval || 30000,
            ...config
        };

        this.tasks = new Map();
        this.taskQueue = [];
        this.runningTasks = new Set();
        this.completedTasks = new Set();
        this.failedTasks = new Set();
        this.dependencyGraph = new Map();
        
        this.isInitialized = false;
        this.isShuttingDown = false;
        this.schedulerTimer = null;
        this.deadlockTimer = null;

        this.metrics = {
            scheduled: 0,
            completed: 0,
            failed: 0,
            cancelled: 0,
            retried: 0,
            deadlocksDetected: 0,
            averageExecutionTime: 0,
            totalExecutionTime: 0
        };
    }

    /**
     * Initialize the Task Scheduler
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            log('warn', 'Task Scheduler already initialized');
            return;
        }

        try {
            log('info', 'Initializing Task Scheduler...');

            // Start scheduling loop
            this._startScheduler();

            // Start deadlock detection
            if (this.config.enableDependencyResolution) {
                this._startDeadlockDetection();
            }

            this.isInitialized = true;
            this.emit('initialized');

            log('info', 'Task Scheduler initialized successfully');
        } catch (error) {
            log('error', 'Failed to initialize Task Scheduler:', error);
            throw error;
        }
    }

    /**
     * Schedule a task for execution
     * @param {Object} task - Task definition
     * @param {Object} options - Scheduling options
     * @returns {Promise<string>} Task ID
     */
    async scheduleTask(task, options = {}) {
        this._ensureInitialized();

        try {
            const taskId = uuidv4();
            const scheduledTask = {
                id: taskId,
                name: task.name || `Task ${taskId}`,
                type: task.type || 'generic',
                priority: task.priority || TaskPriority.NORMAL,
                state: TaskState.PENDING,
                dependencies: task.dependencies || [],
                payload: task.payload || {},
                config: task.config || {},
                metadata: task.metadata || {},
                
                // Scheduling info
                scheduledAt: new Date().toISOString(),
                queuedAt: null,
                startedAt: null,
                completedAt: null,
                
                // Execution info
                timeout: options.timeout || this.config.taskTimeout,
                retryCount: 0,
                maxRetries: options.maxRetries || this.config.maxRetryAttempts,
                retryDelay: options.retryDelay || this.config.retryDelay,
                
                // Results
                result: null,
                error: null,
                executionTime: 0,
                
                // Options
                autoStart: options.autoStart !== false,
                allowParallel: options.allowParallel !== false,
                ...task
            };

            // Store task
            this.tasks.set(taskId, scheduledTask);
            this.metrics.scheduled++;

            // Build dependency graph
            if (this.config.enableDependencyResolution) {
                this._updateDependencyGraph(taskId, scheduledTask.dependencies);
            }

            // Queue task if auto-start is enabled
            if (scheduledTask.autoStart) {
                await this._queueTask(taskId);
            }

            this.emit('taskScheduled', { taskId, task: scheduledTask });
            log('debug', `Task scheduled: ${taskId} (${scheduledTask.name})`);

            return taskId;

        } catch (error) {
            log('error', 'Failed to schedule task:', error);
            throw error;
        }
    }

    /**
     * Start a task manually
     * @param {string} taskId - Task ID
     * @returns {Promise<void>}
     */
    async startTask(taskId) {
        this._ensureInitialized();

        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error(`Task not found: ${taskId}`);
        }

        if (task.state !== TaskState.PENDING) {
            throw new Error(`Task ${taskId} is not in pending state: ${task.state}`);
        }

        await this._queueTask(taskId);
    }

    /**
     * Cancel a task
     * @param {string} taskId - Task ID
     * @returns {Promise<void>}
     */
    async cancelTask(taskId) {
        this._ensureInitialized();

        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error(`Task not found: ${taskId}`);
        }

        if ([TaskState.COMPLETED, TaskState.FAILED, TaskState.CANCELLED].includes(task.state)) {
            throw new Error(`Cannot cancel task ${taskId} in state: ${task.state}`);
        }

        try {
            log('info', `Cancelling task: ${taskId}`);

            task.state = TaskState.CANCELLED;
            task.completedAt = new Date().toISOString();

            // Remove from running tasks
            this.runningTasks.delete(taskId);

            // Remove from queue
            this.taskQueue = this.taskQueue.filter(queuedTaskId => queuedTaskId !== taskId);

            this.metrics.cancelled++;
            this.emit('taskCancelled', { taskId, task });

            log('info', `Task cancelled: ${taskId}`);

        } catch (error) {
            log('error', `Failed to cancel task ${taskId}:`, error);
            throw error;
        }
    }

    /**
     * Retry a failed task
     * @param {string} taskId - Task ID
     * @returns {Promise<void>}
     */
    async retryTask(taskId) {
        this._ensureInitialized();

        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error(`Task not found: ${taskId}`);
        }

        if (task.state !== TaskState.FAILED) {
            throw new Error(`Cannot retry task ${taskId} in state: ${task.state}`);
        }

        if (task.retryCount >= task.maxRetries) {
            throw new Error(`Task ${taskId} has exceeded maximum retry attempts`);
        }

        try {
            log('info', `Retrying task: ${taskId} (attempt ${task.retryCount + 1})`);

            task.retryCount++;
            task.state = TaskState.PENDING;
            task.error = null;
            task.startedAt = null;
            task.completedAt = null;

            this.failedTasks.delete(taskId);
            this.metrics.retried++;

            // Add delay before retry
            setTimeout(async () => {
                await this._queueTask(taskId);
            }, task.retryDelay);

        } catch (error) {
            log('error', `Failed to retry task ${taskId}:`, error);
            throw error;
        }
    }

    /**
     * Get task status
     * @param {string} taskId - Task ID
     * @returns {Promise<Object>} Task status
     */
    async getTaskStatus(taskId) {
        this._ensureInitialized();

        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error(`Task not found: ${taskId}`);
        }

        return {
            id: task.id,
            name: task.name,
            type: task.type,
            state: task.state,
            priority: task.priority,
            scheduledAt: task.scheduledAt,
            queuedAt: task.queuedAt,
            startedAt: task.startedAt,
            completedAt: task.completedAt,
            executionTime: task.executionTime,
            retryCount: task.retryCount,
            maxRetries: task.maxRetries,
            dependencies: task.dependencies,
            dependenciesMet: this._areDependenciesMet(taskId),
            error: task.error,
            result: task.result
        };
    }

    /**
     * Get tasks by state
     * @param {string} state - Task state
     * @returns {Array} Tasks in the specified state
     */
    getTasksByState(state) {
        return Array.from(this.tasks.values())
            .filter(task => task.state === state)
            .map(task => ({
                id: task.id,
                name: task.name,
                type: task.type,
                priority: task.priority,
                scheduledAt: task.scheduledAt,
                startedAt: task.startedAt
            }));
    }

    /**
     * Get scheduler status
     * @returns {Object} Scheduler status
     */
    getStatus() {
        const pendingTasks = this.getTasksByState(TaskState.PENDING).length;
        const queuedTasks = this.getTasksByState(TaskState.QUEUED).length;
        const runningTasks = this.runningTasks.size;
        const completedTasks = this.completedTasks.size;
        const failedTasks = this.failedTasks.size;

        return {
            initialized: this.isInitialized,
            shuttingDown: this.isShuttingDown,
            healthy: this.isInitialized && !this.isShuttingDown,
            totalTasks: this.tasks.size,
            pendingTasks,
            queuedTasks,
            runningTasks,
            completedTasks,
            failedTasks,
            queueLength: this.taskQueue.length,
            metrics: { ...this.metrics }
        };
    }

    /**
     * Shutdown the Task Scheduler
     * @returns {Promise<void>}
     */
    async shutdown() {
        if (this.isShuttingDown) {
            return;
        }

        try {
            log('info', 'Shutting down Task Scheduler...');
            this.isShuttingDown = true;

            // Stop timers
            if (this.schedulerTimer) {
                clearInterval(this.schedulerTimer);
                this.schedulerTimer = null;
            }

            if (this.deadlockTimer) {
                clearInterval(this.deadlockTimer);
                this.deadlockTimer = null;
            }

            // Cancel all running tasks
            for (const taskId of this.runningTasks) {
                try {
                    await this.cancelTask(taskId);
                } catch (error) {
                    log('warn', `Failed to cancel task ${taskId} during shutdown:`, error);
                }
            }

            this.emit('shutdown');
            log('info', 'Task Scheduler shutdown complete');

        } catch (error) {
            log('error', 'Error during Task Scheduler shutdown:', error);
            throw error;
        }
    }

    /**
     * Start the scheduling loop
     * @private
     */
    _startScheduler() {
        this.schedulerTimer = setInterval(() => {
            this._processTaskQueue();
        }, this.config.schedulingInterval);

        log('debug', 'Task scheduler started');
    }

    /**
     * Process the task queue
     * @private
     */
    async _processTaskQueue() {
        if (this.taskQueue.length === 0 || this.runningTasks.size >= this.config.maxConcurrentTasks) {
            return;
        }

        try {
            // Sort queue by priority if enabled
            if (this.config.enablePriorityScheduling) {
                this._sortQueueByPriority();
            }

            // Process tasks from queue
            while (this.taskQueue.length > 0 && this.runningTasks.size < this.config.maxConcurrentTasks) {
                const taskId = this.taskQueue[0];
                const task = this.tasks.get(taskId);

                if (!task) {
                    this.taskQueue.shift();
                    continue;
                }

                // Check if dependencies are met
                if (this.config.enableDependencyResolution && !this._areDependenciesMet(taskId)) {
                    // Move to end of queue or mark as blocked
                    this.taskQueue.shift();
                    if (this._hasCircularDependency(taskId)) {
                        await this._failTask(taskId, new Error('Circular dependency detected'));
                    } else {
                        task.state = TaskState.BLOCKED;
                        this.taskQueue.push(taskId);
                    }
                    continue;
                }

                // Remove from queue and start execution
                this.taskQueue.shift();
                await this._executeTask(taskId);
            }

        } catch (error) {
            log('error', 'Error processing task queue:', error);
        }
    }

    /**
     * Sort queue by priority
     * @private
     */
    _sortQueueByPriority() {
        this.taskQueue.sort((a, b) => {
            const taskA = this.tasks.get(a);
            const taskB = this.tasks.get(b);
            
            if (!taskA || !taskB) return 0;
            
            // Higher priority first
            if (taskA.priority !== taskB.priority) {
                return taskB.priority - taskA.priority;
            }
            
            // Earlier scheduled time first for same priority
            return new Date(taskA.scheduledAt) - new Date(taskB.scheduledAt);
        });
    }

    /**
     * Queue a task for execution
     * @param {string} taskId - Task ID
     * @private
     */
    async _queueTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error(`Task not found: ${taskId}`);
        }

        if (task.state !== TaskState.PENDING) {
            log('warn', `Task ${taskId} is not in pending state: ${task.state}`);
            return;
        }

        task.state = TaskState.QUEUED;
        task.queuedAt = new Date().toISOString();

        if (!this.taskQueue.includes(taskId)) {
            this.taskQueue.push(taskId);
        }

        this.emit('taskQueued', { taskId, task });
        log('debug', `Task queued: ${taskId}`);
    }

    /**
     * Execute a task
     * @param {string} taskId - Task ID
     * @private
     */
    async _executeTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error(`Task not found: ${taskId}`);
        }

        try {
            log('debug', `Executing task: ${taskId} (${task.name})`);

            task.state = TaskState.RUNNING;
            task.startedAt = new Date().toISOString();
            
            this.runningTasks.add(taskId);

            this.emit('taskStarted', { taskId, task });

            // Set execution timeout
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`Task timeout: ${task.name}`));
                }, task.timeout);
            });

            // Execute task
            const executionPromise = this._performTaskExecution(taskId, task);

            // Race between execution and timeout
            const result = await Promise.race([executionPromise, timeoutPromise]);

            await this._completeTask(taskId, result);

        } catch (error) {
            await this._failTask(taskId, error);
        }
    }

    /**
     * Perform actual task execution
     * @param {string} taskId - Task ID
     * @param {Object} task - Task object
     * @returns {Promise<any>} Task result
     * @private
     */
    async _performTaskExecution(taskId, task) {
        // Emit task execution request
        return new Promise((resolve, reject) => {
            this.emit('executeTask', {
                taskId,
                task,
                callback: (error, result) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(result);
                    }
                }
            });
        });
    }

    /**
     * Complete a task
     * @param {string} taskId - Task ID
     * @param {any} result - Task result
     * @private
     */
    async _completeTask(taskId, result) {
        const task = this.tasks.get(taskId);
        const startTime = new Date(task.startedAt);
        const endTime = new Date();
        
        task.state = TaskState.COMPLETED;
        task.completedAt = endTime.toISOString();
        task.result = result;
        task.executionTime = endTime - startTime;

        this.runningTasks.delete(taskId);
        this.completedTasks.add(taskId);
        this.metrics.completed++;

        // Update metrics
        this.metrics.totalExecutionTime += task.executionTime;
        this.metrics.averageExecutionTime = this.metrics.totalExecutionTime / this.metrics.completed;

        this.emit('taskCompleted', { taskId, task, result });
        log('debug', `Task completed: ${taskId} (${task.executionTime}ms)`);

        // Check for dependent tasks
        await this._checkDependentTasks(taskId);
    }

    /**
     * Fail a task
     * @param {string} taskId - Task ID
     * @param {Error} error - Error that caused failure
     * @private
     */
    async _failTask(taskId, error) {
        const task = this.tasks.get(taskId);
        
        task.state = TaskState.FAILED;
        task.error = error.message;
        task.completedAt = new Date().toISOString();

        if (task.startedAt) {
            task.executionTime = new Date() - new Date(task.startedAt);
        }

        this.runningTasks.delete(taskId);
        this.failedTasks.add(taskId);
        this.metrics.failed++;

        this.emit('taskFailed', { taskId, task, error });
        log('error', `Task failed: ${taskId} - ${error.message}`);

        // Attempt retry if configured
        if (task.retryCount < task.maxRetries) {
            setTimeout(async () => {
                try {
                    await this.retryTask(taskId);
                } catch (retryError) {
                    log('error', `Failed to retry task ${taskId}:`, retryError);
                }
            }, task.retryDelay);
        }
    }

    /**
     * Check if task dependencies are met
     * @param {string} taskId - Task ID
     * @returns {boolean} True if dependencies are met
     * @private
     */
    _areDependenciesMet(taskId) {
        const task = this.tasks.get(taskId);
        if (!task || !task.dependencies || task.dependencies.length === 0) {
            return true;
        }

        return task.dependencies.every(depId => {
            const depTask = this.tasks.get(depId);
            return depTask && depTask.state === TaskState.COMPLETED;
        });
    }

    /**
     * Check for dependent tasks that can now be executed
     * @param {string} completedTaskId - ID of completed task
     * @private
     */
    async _checkDependentTasks(completedTaskId) {
        const dependents = this.dependencyGraph.get(completedTaskId) || [];
        
        for (const dependentId of dependents) {
            const dependentTask = this.tasks.get(dependentId);
            
            if (dependentTask && 
                (dependentTask.state === TaskState.BLOCKED || dependentTask.state === TaskState.PENDING) &&
                this._areDependenciesMet(dependentId)) {
                
                await this._queueTask(dependentId);
            }
        }
    }

    /**
     * Update dependency graph
     * @param {string} taskId - Task ID
     * @param {Array} dependencies - Task dependencies
     * @private
     */
    _updateDependencyGraph(taskId, dependencies) {
        for (const depId of dependencies) {
            if (!this.dependencyGraph.has(depId)) {
                this.dependencyGraph.set(depId, []);
            }
            this.dependencyGraph.get(depId).push(taskId);
        }
    }

    /**
     * Check for circular dependencies
     * @param {string} taskId - Task ID
     * @returns {boolean} True if circular dependency exists
     * @private
     */
    _hasCircularDependency(taskId, visited = new Set(), path = new Set()) {
        if (path.has(taskId)) {
            return true; // Circular dependency found
        }

        if (visited.has(taskId)) {
            return false; // Already checked this path
        }

        visited.add(taskId);
        path.add(taskId);

        const task = this.tasks.get(taskId);
        if (task && task.dependencies) {
            for (const depId of task.dependencies) {
                if (this._hasCircularDependency(depId, visited, path)) {
                    return true;
                }
            }
        }

        path.delete(taskId);
        return false;
    }

    /**
     * Start deadlock detection
     * @private
     */
    _startDeadlockDetection() {
        this.deadlockTimer = setInterval(() => {
            this._detectDeadlocks();
        }, this.config.deadlockDetectionInterval);

        log('debug', 'Deadlock detection started');
    }

    /**
     * Detect deadlocks in task dependencies
     * @private
     */
    _detectDeadlocks() {
        const blockedTasks = this.getTasksByState(TaskState.BLOCKED);
        
        for (const blockedTask of blockedTasks) {
            if (this._hasCircularDependency(blockedTask.id)) {
                log('warn', `Deadlock detected for task: ${blockedTask.id}`);
                this.metrics.deadlocksDetected++;
                
                this.emit('deadlockDetected', { taskId: blockedTask.id, task: blockedTask });
                
                // Fail the task to break the deadlock
                this._failTask(blockedTask.id, new Error('Deadlock detected'));
            }
        }
    }

    /**
     * Ensure the scheduler is initialized
     * @private
     */
    _ensureInitialized() {
        if (!this.isInitialized) {
            throw new Error('Task Scheduler not initialized');
        }

        if (this.isShuttingDown) {
            throw new Error('Task Scheduler is shutting down');
        }
    }
}

export default TaskScheduler;

