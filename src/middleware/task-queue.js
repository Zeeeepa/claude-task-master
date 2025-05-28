/**
 * Task Queue and Scheduling System
 * 
 * Manages task queue with priority-based scheduling, concurrent execution management,
 * resource allocation, and timeout handling.
 */

import { EventEmitter } from 'events';
import { setTimeout, clearTimeout } from 'timers';

export class TaskQueue extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      maxConcurrentTasks: config.maxConcurrentTasks || 3,
      defaultPriority: config.defaultPriority || 5,
      taskTimeout: config.taskTimeout || 300000, // 5 minutes
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 5000,
      queueProcessInterval: config.queueProcessInterval || 1000,
      maxQueueSize: config.maxQueueSize || 1000,
      enablePersistence: config.enablePersistence || false,
      ...config
    };

    this.queue = [];
    this.activeTasks = new Map();
    this.completedTasks = new Map();
    this.failedTasks = new Map();
    this.processingTimer = null;
    this.taskCounter = 0;
    this.isProcessing = false;

    this._startProcessing();
  }

  /**
   * Start the queue processing loop
   */
  _startProcessing() {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
    }

    this.processingTimer = setInterval(() => {
      this._processQueue();
    }, this.config.queueProcessInterval);

    this.isProcessing = true;
    this.emit('processingStarted');
  }

  /**
   * Stop the queue processing
   */
  stopProcessing() {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = null;
    }

    this.isProcessing = false;
    this.emit('processingStopped');
  }

  /**
   * Add a task to the queue
   * @param {Object} taskData - Task data
   * @returns {string} Task ID
   */
  addTask(taskData) {
    if (this.queue.length >= this.config.maxQueueSize) {
      throw new Error(`Queue is full (max size: ${this.config.maxQueueSize})`);
    }

    const taskId = `task-${++this.taskCounter}-${Date.now()}`;
    
    const task = {
      id: taskId,
      type: taskData.type || 'default',
      priority: taskData.priority || this.config.defaultPriority,
      data: taskData.data || {},
      context: taskData.context || {},
      createdAt: Date.now(),
      attempts: 0,
      maxAttempts: taskData.maxAttempts || this.config.retryAttempts,
      timeout: taskData.timeout || this.config.taskTimeout,
      dependencies: taskData.dependencies || [],
      tags: taskData.tags || [],
      metadata: taskData.metadata || {}
    };

    // Insert task in priority order (higher priority first)
    const insertIndex = this.queue.findIndex(t => t.priority < task.priority);
    if (insertIndex === -1) {
      this.queue.push(task);
    } else {
      this.queue.splice(insertIndex, 0, task);
    }

    this.emit('taskAdded', { taskId, task });
    return taskId;
  }

  /**
   * Process the queue
   */
  async _processQueue() {
    if (!this.isProcessing) return;

    // Check if we can process more tasks
    if (this.activeTasks.size >= this.config.maxConcurrentTasks) {
      return;
    }

    // Find next available task
    const availableTask = this._findNextAvailableTask();
    if (!availableTask) {
      return;
    }

    // Remove task from queue and start processing
    const taskIndex = this.queue.indexOf(availableTask);
    this.queue.splice(taskIndex, 1);
    
    await this._executeTask(availableTask);
  }

  /**
   * Find the next available task that can be executed
   * @returns {Object|null} Next available task
   */
  _findNextAvailableTask() {
    for (const task of this.queue) {
      // Check if dependencies are satisfied
      if (this._areDependenciesSatisfied(task)) {
        return task;
      }
    }
    return null;
  }

  /**
   * Check if task dependencies are satisfied
   * @param {Object} task - Task to check
   * @returns {boolean} True if dependencies are satisfied
   */
  _areDependenciesSatisfied(task) {
    if (!task.dependencies || task.dependencies.length === 0) {
      return true;
    }

    return task.dependencies.every(depId => {
      return this.completedTasks.has(depId) && 
             this.completedTasks.get(depId).status === 'completed';
    });
  }

  /**
   * Execute a task
   * @param {Object} task - Task to execute
   */
  async _executeTask(task) {
    const startTime = Date.now();
    task.attempts++;
    task.startedAt = startTime;

    // Add to active tasks
    this.activeTasks.set(task.id, task);
    this.emit('taskStarted', { taskId: task.id, task });

    // Set up timeout
    const timeoutHandle = setTimeout(() => {
      this._handleTaskTimeout(task.id);
    }, task.timeout);

    try {
      // Execute the task
      const result = await this._runTask(task);
      
      // Clear timeout
      clearTimeout(timeoutHandle);

      // Mark as completed
      const completedTask = {
        ...task,
        status: 'completed',
        result,
        completedAt: Date.now(),
        duration: Date.now() - startTime
      };

      this.activeTasks.delete(task.id);
      this.completedTasks.set(task.id, completedTask);
      
      this.emit('taskCompleted', { taskId: task.id, task: completedTask, result });

    } catch (error) {
      clearTimeout(timeoutHandle);
      await this._handleTaskError(task, error);
    }
  }

  /**
   * Run the actual task logic
   * @param {Object} task - Task to run
   * @returns {Promise<any>} Task result
   */
  async _runTask(task) {
    // Emit event for external handlers
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Task ${task.id} execution timeout`));
      }, task.timeout);

      this.emit('executeTask', {
        task,
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
  }

  /**
   * Handle task timeout
   * @param {string} taskId - Task ID
   */
  _handleTaskTimeout(taskId) {
    const task = this.activeTasks.get(taskId);
    if (!task) return;

    const error = new Error(`Task ${taskId} timed out after ${task.timeout}ms`);
    this._handleTaskError(task, error);
  }

  /**
   * Handle task error
   * @param {Object} task - Task that failed
   * @param {Error} error - Error that occurred
   */
  async _handleTaskError(task, error) {
    this.activeTasks.delete(task.id);

    const failedTask = {
      ...task,
      status: 'failed',
      error: {
        message: error.message,
        stack: error.stack,
        timestamp: Date.now()
      },
      failedAt: Date.now(),
      duration: Date.now() - task.startedAt
    };

    // Check if we should retry
    if (task.attempts < task.maxAttempts) {
      // Add back to queue with delay
      setTimeout(() => {
        const retryTask = {
          ...task,
          retryOf: task.id,
          retryAttempt: task.attempts
        };
        
        // Insert at appropriate priority position
        const insertIndex = this.queue.findIndex(t => t.priority < retryTask.priority);
        if (insertIndex === -1) {
          this.queue.push(retryTask);
        } else {
          this.queue.splice(insertIndex, 0, retryTask);
        }

        this.emit('taskRetry', { taskId: task.id, attempt: task.attempts, error });
      }, this.config.retryDelay);

    } else {
      // Mark as permanently failed
      this.failedTasks.set(task.id, failedTask);
      this.emit('taskFailed', { taskId: task.id, task: failedTask, error });
    }
  }

  /**
   * Cancel a task
   * @param {string} taskId - Task ID to cancel
   * @returns {boolean} True if task was cancelled
   */
  cancelTask(taskId) {
    // Check if task is in queue
    const queueIndex = this.queue.findIndex(t => t.id === taskId);
    if (queueIndex !== -1) {
      const task = this.queue.splice(queueIndex, 1)[0];
      const cancelledTask = {
        ...task,
        status: 'cancelled',
        cancelledAt: Date.now()
      };
      
      this.failedTasks.set(taskId, cancelledTask);
      this.emit('taskCancelled', { taskId, task: cancelledTask });
      return true;
    }

    // Check if task is active
    if (this.activeTasks.has(taskId)) {
      const task = this.activeTasks.get(taskId);
      this.activeTasks.delete(taskId);
      
      const cancelledTask = {
        ...task,
        status: 'cancelled',
        cancelledAt: Date.now(),
        duration: Date.now() - task.startedAt
      };
      
      this.failedTasks.set(taskId, cancelledTask);
      this.emit('taskCancelled', { taskId, task: cancelledTask });
      return true;
    }

    return false;
  }

  /**
   * Get task information
   * @param {string} taskId - Task ID
   * @returns {Object|null} Task information
   */
  getTask(taskId) {
    // Check completed tasks
    if (this.completedTasks.has(taskId)) {
      return this.completedTasks.get(taskId);
    }

    // Check failed tasks
    if (this.failedTasks.has(taskId)) {
      return this.failedTasks.get(taskId);
    }

    // Check active tasks
    if (this.activeTasks.has(taskId)) {
      return this.activeTasks.get(taskId);
    }

    // Check queued tasks
    const queuedTask = this.queue.find(t => t.id === taskId);
    if (queuedTask) {
      return { ...queuedTask, status: 'queued' };
    }

    return null;
  }

  /**
   * List tasks by status
   * @param {string} status - Task status ('queued', 'active', 'completed', 'failed')
   * @returns {Array} Array of tasks
   */
  listTasks(status = null) {
    const tasks = [];

    if (!status || status === 'queued') {
      tasks.push(...this.queue.map(t => ({ ...t, status: 'queued' })));
    }

    if (!status || status === 'active') {
      tasks.push(...Array.from(this.activeTasks.values()).map(t => ({ ...t, status: 'active' })));
    }

    if (!status || status === 'completed') {
      tasks.push(...Array.from(this.completedTasks.values()));
    }

    if (!status || status === 'failed') {
      tasks.push(...Array.from(this.failedTasks.values()));
    }

    return tasks;
  }

  /**
   * Get queue statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const now = Date.now();
    const activeTasks = Array.from(this.activeTasks.values());
    const completedTasks = Array.from(this.completedTasks.values());
    const failedTasks = Array.from(this.failedTasks.values());

    return {
      queue: {
        size: this.queue.length,
        maxSize: this.config.maxQueueSize,
        oldestTask: this.queue.length > 0 ? now - this.queue[this.queue.length - 1].createdAt : 0
      },
      active: {
        count: activeTasks.length,
        maxConcurrent: this.config.maxConcurrentTasks,
        averageDuration: activeTasks.length > 0 
          ? activeTasks.reduce((sum, t) => sum + (now - t.startedAt), 0) / activeTasks.length
          : 0
      },
      completed: {
        count: completedTasks.length,
        averageDuration: completedTasks.length > 0
          ? completedTasks.reduce((sum, t) => sum + t.duration, 0) / completedTasks.length
          : 0,
        successRate: completedTasks.length / (completedTasks.length + failedTasks.length) || 0
      },
      failed: {
        count: failedTasks.length,
        recentFailures: failedTasks.filter(t => now - t.failedAt < 3600000).length // Last hour
      },
      processing: {
        isActive: this.isProcessing,
        interval: this.config.queueProcessInterval
      },
      config: {
        maxConcurrentTasks: this.config.maxConcurrentTasks,
        taskTimeout: this.config.taskTimeout,
        retryAttempts: this.config.retryAttempts
      }
    };
  }

  /**
   * Clear completed and failed tasks
   * @param {Object} options - Clear options
   */
  clearTasks(options = {}) {
    const { 
      clearCompleted = true, 
      clearFailed = true, 
      olderThan = null 
    } = options;

    let clearedCount = 0;

    if (clearCompleted) {
      if (olderThan) {
        const cutoff = Date.now() - olderThan;
        for (const [taskId, task] of this.completedTasks.entries()) {
          if (task.completedAt < cutoff) {
            this.completedTasks.delete(taskId);
            clearedCount++;
          }
        }
      } else {
        clearedCount += this.completedTasks.size;
        this.completedTasks.clear();
      }
    }

    if (clearFailed) {
      if (olderThan) {
        const cutoff = Date.now() - olderThan;
        for (const [taskId, task] of this.failedTasks.entries()) {
          if (task.failedAt < cutoff) {
            this.failedTasks.delete(taskId);
            clearedCount++;
          }
        }
      } else {
        clearedCount += this.failedTasks.size;
        this.failedTasks.clear();
      }
    }

    this.emit('tasksCleared', { clearedCount, options });
    return clearedCount;
  }

  /**
   * Shutdown the task queue
   */
  async shutdown() {
    this.stopProcessing();

    // Cancel all active tasks
    const activeTasks = Array.from(this.activeTasks.keys());
    for (const taskId of activeTasks) {
      this.cancelTask(taskId);
    }

    // Clear the queue
    this.queue.length = 0;

    this.emit('shutdown');
  }
}

export default TaskQueue;

