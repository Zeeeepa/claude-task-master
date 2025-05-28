/**
 * Task Manager for AgentAPI Integration
 * 
 * Handles task submission, tracking, and lifecycle management for
 * Claude Code deployments via AgentAPI.
 */

import { EventEmitter } from 'events';
import { SimpleLogger } from '../ai_cicd_system/utils/simple_logger.js';
import { StatusTracker } from './status-tracker.js';
import { ErrorHandler } from './error-handler.js';

export class TaskManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      maxConcurrentTasks: config.maxConcurrentTasks || 10,
      taskTimeout: config.taskTimeout || 600000, // 10 minutes
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 5000,
      cleanupInterval: config.cleanupInterval || 300000, // 5 minutes
      ...config
    };

    this.logger = new SimpleLogger('TaskManager');
    this.statusTracker = new StatusTracker();
    this.errorHandler = new ErrorHandler();
    
    this.tasks = new Map();
    this.runningTasks = new Set();
    this.taskQueue = [];
    this.isProcessing = false;
    
    // Start cleanup interval
    this._startCleanupInterval();
  }

  /**
   * Submit a new task for processing
   * @param {Object} taskData - Task data
   * @returns {Promise<string>} Task ID
   */
  async submitTask(taskData) {
    const taskId = this._generateTaskId();
    const task = {
      id: taskId,
      type: taskData.type,
      data: taskData,
      status: 'pending',
      priority: taskData.priority || 5,
      submittedAt: new Date().toISOString(),
      attempts: 0,
      maxAttempts: this.config.retryAttempts,
      timeout: taskData.timeout || this.config.taskTimeout,
      metadata: {
        repository: taskData.repository,
        branch: taskData.branch,
        prNumber: taskData.prNumber,
        ...taskData.metadata
      }
    };

    this.tasks.set(taskId, task);
    this.taskQueue.push(task);
    
    // Sort queue by priority (lower number = higher priority)
    this.taskQueue.sort((a, b) => a.priority - b.priority);

    this.logger.info(`Task submitted: ${taskId}`, {
      taskId,
      type: task.type,
      priority: task.priority,
      queueLength: this.taskQueue.length
    });

    // Emit task submitted event
    this.emit('taskSubmitted', task);

    // Start processing if not already running
    if (!this.isProcessing) {
      this._processQueue();
    }

    return taskId;
  }

  /**
   * Get task status
   * @param {string} taskId - Task ID
   * @returns {Object|null} Task status
   */
  getTaskStatus(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return null;
    }

    return {
      id: task.id,
      type: task.type,
      status: task.status,
      progress: task.progress || 0,
      submittedAt: task.submittedAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      attempts: task.attempts,
      maxAttempts: task.maxAttempts,
      error: task.error,
      result: task.result,
      metadata: task.metadata
    };
  }

  /**
   * Get all tasks with optional filtering
   * @param {Object} filters - Filter options
   * @returns {Array} Filtered tasks
   */
  getTasks(filters = {}) {
    let tasks = Array.from(this.tasks.values());

    // Apply filters
    if (filters.status) {
      tasks = tasks.filter(task => task.status === filters.status);
    }

    if (filters.type) {
      tasks = tasks.filter(task => task.type === filters.type);
    }

    if (filters.repository) {
      tasks = tasks.filter(task => task.metadata?.repository === filters.repository);
    }

    if (filters.since) {
      const since = new Date(filters.since);
      tasks = tasks.filter(task => new Date(task.submittedAt) >= since);
    }

    // Sort by submission time (newest first)
    tasks.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    // Apply limit
    if (filters.limit) {
      tasks = tasks.slice(0, parseInt(filters.limit));
    }

    return tasks.map(task => this.getTaskStatus(task.id));
  }

  /**
   * Cancel a task
   * @param {string} taskId - Task ID
   * @returns {boolean} Success status
   */
  async cancelTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      return false;
    }

    // Remove from queue if pending
    if (task.status === 'pending') {
      const queueIndex = this.taskQueue.findIndex(t => t.id === taskId);
      if (queueIndex !== -1) {
        this.taskQueue.splice(queueIndex, 1);
      }
    }

    // Update task status
    task.status = 'cancelled';
    task.completedAt = new Date().toISOString();
    task.error = 'Task cancelled by user';

    // Remove from running tasks
    this.runningTasks.delete(taskId);

    this.logger.info(`Task cancelled: ${taskId}`);
    this.emit('taskCancelled', task);

    return true;
  }

  /**
   * Update task progress
   * @param {string} taskId - Task ID
   * @param {number} progress - Progress percentage (0-100)
   * @param {string} message - Progress message
   */
  updateTaskProgress(taskId, progress, message = '') {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    task.progress = Math.max(0, Math.min(100, progress));
    task.lastUpdate = new Date().toISOString();
    
    if (message) {
      task.progressMessage = message;
    }

    this.logger.debug(`Task progress updated: ${taskId}`, {
      taskId,
      progress: task.progress,
      message
    });

    this.emit('taskProgress', {
      taskId,
      progress: task.progress,
      message,
      timestamp: task.lastUpdate
    });
  }

  /**
   * Mark task as completed
   * @param {string} taskId - Task ID
   * @param {Object} result - Task result
   */
  completeTask(taskId, result) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    task.status = 'completed';
    task.progress = 100;
    task.completedAt = new Date().toISOString();
    task.result = result;

    this.runningTasks.delete(taskId);

    this.logger.info(`Task completed: ${taskId}`, {
      taskId,
      duration: new Date(task.completedAt) - new Date(task.startedAt || task.submittedAt)
    });

    this.emit('taskCompleted', task);
  }

  /**
   * Mark task as failed
   * @param {string} taskId - Task ID
   * @param {Error|string} error - Error details
   */
  failTask(taskId, error) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    task.attempts++;
    task.error = error instanceof Error ? error.message : error;
    task.lastError = new Date().toISOString();

    // Check if we should retry
    if (task.attempts < task.maxAttempts) {
      task.status = 'retrying';
      
      this.logger.warn(`Task failed, retrying: ${taskId}`, {
        taskId,
        attempt: task.attempts,
        maxAttempts: task.maxAttempts,
        error: task.error
      });

      // Schedule retry
      setTimeout(() => {
        if (task.status === 'retrying') {
          task.status = 'pending';
          this.taskQueue.unshift(task); // Add to front of queue for retry
          this._processQueue();
        }
      }, this.config.retryDelay * task.attempts); // Exponential backoff

      this.emit('taskRetrying', task);
    } else {
      // Max attempts reached, mark as failed
      task.status = 'failed';
      task.completedAt = new Date().toISOString();
      
      this.runningTasks.delete(taskId);

      this.logger.error(`Task failed permanently: ${taskId}`, {
        taskId,
        attempts: task.attempts,
        error: task.error
      });

      this.emit('taskFailed', task);
    }
  }

  /**
   * Process the task queue
   */
  async _processQueue() {
    if (this.isProcessing || this.taskQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.taskQueue.length > 0 && this.runningTasks.size < this.config.maxConcurrentTasks) {
        const task = this.taskQueue.shift();
        
        if (task.status === 'cancelled') {
          continue;
        }

        await this._processTask(task);
      }
    } catch (error) {
      this.logger.error('Error processing task queue:', error);
    } finally {
      this.isProcessing = false;
      
      // Continue processing if there are more tasks
      if (this.taskQueue.length > 0 && this.runningTasks.size < this.config.maxConcurrentTasks) {
        setTimeout(() => this._processQueue(), 1000);
      }
    }
  }

  /**
   * Process a single task
   * @param {Object} task - Task to process
   */
  async _processTask(task) {
    try {
      task.status = 'running';
      task.startedAt = new Date().toISOString();
      this.runningTasks.add(task.id);

      this.logger.info(`Starting task: ${task.id}`, {
        taskId: task.id,
        type: task.type,
        attempt: task.attempts + 1
      });

      this.emit('taskStarted', task);

      // Set timeout for task
      const timeoutId = setTimeout(() => {
        this.failTask(task.id, 'Task timeout');
      }, task.timeout);

      try {
        // Process the task based on type
        let result;
        switch (task.type) {
          case 'pr_deployment':
            result = await this._processPRDeployment(task);
            break;
          case 'code_analysis':
            result = await this._processCodeAnalysis(task);
            break;
          case 'validation':
            result = await this._processValidation(task);
            break;
          default:
            throw new Error(`Unknown task type: ${task.type}`);
        }

        clearTimeout(timeoutId);
        this.completeTask(task.id, result);
      } catch (error) {
        clearTimeout(timeoutId);
        this.failTask(task.id, error);
      }
    } catch (error) {
      this.logger.error(`Error processing task ${task.id}:`, error);
      this.failTask(task.id, error);
    }
  }

  /**
   * Process PR deployment task
   * @param {Object} task - Task data
   * @returns {Promise<Object>} Result
   */
  async _processPRDeployment(task) {
    this.updateTaskProgress(task.id, 10, 'Initializing PR deployment');
    
    // This would integrate with the actual AgentAPI
    // For now, simulate the process
    await this._simulateAsyncWork(2000);
    this.updateTaskProgress(task.id, 30, 'Allocating WSL2 instance');
    
    await this._simulateAsyncWork(3000);
    this.updateTaskProgress(task.id, 60, 'Cloning repository');
    
    await this._simulateAsyncWork(5000);
    this.updateTaskProgress(task.id, 90, 'Executing Claude Code');
    
    await this._simulateAsyncWork(2000);
    
    return {
      deploymentId: `deploy_${task.id}`,
      instanceId: `wsl2_${Math.random().toString(36).substring(7)}`,
      status: 'deployed',
      cloneUrl: task.data.cloneUrl,
      branch: task.data.branch,
      sha: task.data.sha
    };
  }

  /**
   * Process code analysis task
   * @param {Object} task - Task data
   * @returns {Promise<Object>} Result
   */
  async _processCodeAnalysis(task) {
    this.updateTaskProgress(task.id, 20, 'Starting code analysis');
    await this._simulateAsyncWork(3000);
    
    this.updateTaskProgress(task.id, 70, 'Analyzing codebase');
    await this._simulateAsyncWork(4000);
    
    return {
      analysisId: `analysis_${task.id}`,
      findings: [],
      metrics: {
        linesOfCode: 1234,
        complexity: 'medium',
        coverage: 85
      }
    };
  }

  /**
   * Process validation task
   * @param {Object} task - Task data
   * @returns {Promise<Object>} Result
   */
  async _processValidation(task) {
    this.updateTaskProgress(task.id, 30, 'Running validation checks');
    await this._simulateAsyncWork(2000);
    
    this.updateTaskProgress(task.id, 80, 'Generating validation report');
    await this._simulateAsyncWork(1000);
    
    return {
      validationId: `validation_${task.id}`,
      passed: true,
      checks: [
        { name: 'syntax', status: 'passed' },
        { name: 'tests', status: 'passed' },
        { name: 'linting', status: 'passed' }
      ]
    };
  }

  /**
   * Simulate async work (for testing/demo purposes)
   * @param {number} ms - Milliseconds to wait
   */
  async _simulateAsyncWork(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate unique task ID
   * @returns {string} Task ID
   */
  _generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Start cleanup interval to remove old completed tasks
   */
  _startCleanupInterval() {
    setInterval(() => {
      this._cleanupOldTasks();
    }, this.config.cleanupInterval);
  }

  /**
   * Clean up old completed tasks
   */
  _cleanupOldTasks() {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    let cleanedCount = 0;

    for (const [taskId, task] of this.tasks.entries()) {
      if (
        (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') &&
        task.completedAt &&
        new Date(task.completedAt) < cutoffTime
      ) {
        this.tasks.delete(taskId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.info(`Cleaned up ${cleanedCount} old tasks`);
    }
  }

  /**
   * Get task manager statistics
   * @returns {Object} Statistics
   */
  getStatistics() {
    const tasks = Array.from(this.tasks.values());
    
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      running: tasks.filter(t => t.status === 'running').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      cancelled: tasks.filter(t => t.status === 'cancelled').length,
      retrying: tasks.filter(t => t.status === 'retrying').length,
      queueLength: this.taskQueue.length,
      runningTasks: this.runningTasks.size,
      maxConcurrent: this.config.maxConcurrentTasks
    };
  }

  /**
   * Shutdown task manager
   */
  async shutdown() {
    this.logger.info('Shutting down task manager');
    
    // Cancel all pending tasks
    for (const task of this.taskQueue) {
      await this.cancelTask(task.id);
    }
    
    // Wait for running tasks to complete (with timeout)
    const shutdownTimeout = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.runningTasks.size > 0 && (Date.now() - startTime) < shutdownTimeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Force cancel remaining running tasks
    for (const taskId of this.runningTasks) {
      await this.cancelTask(taskId);
    }
    
    this.logger.info('Task manager shutdown complete');
  }
}

export default TaskManager;

