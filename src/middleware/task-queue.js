/**
 * Task Queue
 * 
 * Priority-based task scheduling with concurrent execution:
 * - Priority scheduling: higher priority tasks execute first
 * - Concurrent execution: configurable number of simultaneous tasks
 * - Dependency management: support for task dependencies
 * - Retry logic: automatic retry with configurable attempts
 * - Timeout handling: task-level timeout management
 */

import { EventEmitter } from 'events';

export class TaskQueue extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      maxConcurrentTasks: 3,
      defaultPriority: 5,
      taskTimeout: 300000, // 5 minutes
      retryAttempts: 3,
      retryDelay: 5000,
      queueProcessInterval: 1000,
      maxQueueSize: 1000,
      enablePersistence: false,
      ...config
    };
    
    this.queue = [];
    this.activeTasks = new Map();
    this.completedTasks = new Map();
    this.failedTasks = new Map();
    this.processingTimer = null;
    this.isProcessing = false;
    this.isInitialized = false;
    
    this.metrics = {
      tasksAdded: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      tasksRetried: 0,
      averageWaitTime: 0,
      averageProcessingTime: 0,
      totalProcessingTime: 0
    };
  }

  /**
   * Initialize the task queue
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }
    
    console.log('Initializing Task Queue...');
    
    // Load persisted tasks if enabled
    if (this.config.enablePersistence) {
      await this.loadPersistedTasks();
    }
    
    this.isInitialized = true;
    console.log('Task Queue initialized');
    this.emit('initialized');
  }

  /**
   * Start the task queue processing
   */
  async start() {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    if (this.isProcessing) {
      return;
    }
    
    console.log('Starting Task Queue processing...');
    this.isProcessing = true;
    
    // Start processing loop
    this.processingTimer = setInterval(() => {
      this.processQueue();
    }, this.config.queueProcessInterval);
    
    console.log('Task Queue processing started');
    this.emit('started');
  }

  /**
   * Stop the task queue processing
   */
  async stop() {
    if (!this.isProcessing) {
      return;
    }
    
    console.log('Stopping Task Queue processing...');
    this.isProcessing = false;
    
    // Stop processing timer
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = null;
    }
    
    // Wait for active tasks to complete or timeout
    await this.waitForActiveTasks();
    
    // Persist tasks if enabled
    if (this.config.enablePersistence) {
      await this.persistTasks();
    }
    
    console.log('Task Queue processing stopped');
    this.emit('stopped');
  }

  /**
   * Add a task to the queue
   */
  addTask(task) {
    if (this.queue.length >= this.config.maxQueueSize) {
      throw new Error(`Queue is full (max size: ${this.config.maxQueueSize})`);
    }
    
    // Validate task
    if (!task || typeof task !== 'object') {
      throw new Error('Task must be an object');
    }
    
    // Ensure required fields
    const queueTask = {
      id: task.id || this.generateTaskId(),
      type: task.type || 'generic',
      priority: task.priority || this.config.defaultPriority,
      data: task.data || task,
      options: {
        timeout: task.options?.timeout || this.config.taskTimeout,
        retryAttempts: task.options?.retryAttempts || this.config.retryAttempts,
        retryDelay: task.options?.retryDelay || this.config.retryDelay,
        dependencies: task.options?.dependencies || [],
        ...task.options
      },
      status: 'queued',
      createdAt: new Date(),
      queuedAt: new Date(),
      attempts: 0,
      lastError: null
    };
    
    // Insert task in priority order
    this.insertTaskByPriority(queueTask);
    
    this.metrics.tasksAdded++;
    
    console.log(`Task ${queueTask.id} added to queue (priority: ${queueTask.priority})`);
    this.emit('taskAdded', { task: queueTask });
    
    return queueTask.id;
  }

  /**
   * Insert task in queue maintaining priority order
   */
  insertTaskByPriority(task) {
    let insertIndex = this.queue.length;
    
    // Find insertion point (higher priority = lower number = earlier in queue)
    for (let i = 0; i < this.queue.length; i++) {
      if (task.priority < this.queue[i].priority) {
        insertIndex = i;
        break;
      }
    }
    
    this.queue.splice(insertIndex, 0, task);
  }

  /**
   * Process the queue
   */
  async processQueue() {
    if (!this.isProcessing) {
      return;
    }
    
    // Check if we can process more tasks
    if (this.activeTasks.size >= this.config.maxConcurrentTasks) {
      return;
    }
    
    // Find next available task
    const task = this.getNextAvailableTask();
    if (!task) {
      return;
    }
    
    // Remove from queue and add to active tasks
    const taskIndex = this.queue.indexOf(task);
    this.queue.splice(taskIndex, 1);
    this.activeTasks.set(task.id, task);
    
    // Process the task
    this.processTask(task);
  }

  /**
   * Get next available task (considering dependencies)
   */
  getNextAvailableTask() {
    for (const task of this.queue) {
      if (this.areTaskDependenciesMet(task)) {
        return task;
      }
    }
    return null;
  }

  /**
   * Check if task dependencies are met
   */
  areTaskDependenciesMet(task) {
    if (!task.options.dependencies || task.options.dependencies.length === 0) {
      return true;
    }
    
    return task.options.dependencies.every(depId => {
      return this.completedTasks.has(depId);
    });
  }

  /**
   * Process a single task
   */
  async processTask(task) {
    const startTime = Date.now();
    task.status = 'processing';
    task.startedAt = new Date();
    task.attempts++;
    
    console.log(`Processing task ${task.id} (attempt ${task.attempts})`);
    this.emit('taskStarted', { task });
    
    try {
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Task timeout after ${task.options.timeout}ms`));
        }, task.options.timeout);
      });
      
      // Create execution promise
      const executionPromise = new Promise((resolve, reject) => {
        this.emit('executeTask', { task, resolve, reject });
      });
      
      // Race between execution and timeout
      const result = await Promise.race([executionPromise, timeoutPromise]);
      
      // Task completed successfully
      const processingTime = Date.now() - startTime;
      const waitTime = task.startedAt.getTime() - task.queuedAt.getTime();
      
      task.status = 'completed';
      task.completedAt = new Date();
      task.result = result;
      task.processingTime = processingTime;
      task.waitTime = waitTime;
      
      // Move to completed tasks
      this.activeTasks.delete(task.id);
      this.completedTasks.set(task.id, task);
      
      // Update metrics
      this.metrics.tasksCompleted++;
      this.metrics.totalProcessingTime += processingTime;
      this.metrics.averageProcessingTime = 
        this.metrics.totalProcessingTime / this.metrics.tasksCompleted;
      this.updateAverageWaitTime(waitTime);
      
      console.log(`Task ${task.id} completed in ${processingTime}ms`);
      this.emit('taskCompleted', { task, result });
      
    } catch (error) {
      await this.handleTaskError(task, error);
    }
  }

  /**
   * Handle task execution error
   */
  async handleTaskError(task, error) {
    const processingTime = Date.now() - task.startedAt.getTime();
    
    task.lastError = error.message;
    task.processingTime = processingTime;
    
    console.error(`Task ${task.id} failed (attempt ${task.attempts}): ${error.message}`);
    
    // Check if we should retry
    if (task.attempts < task.options.retryAttempts) {
      // Retry the task
      task.status = 'retrying';
      task.retryAt = new Date(Date.now() + task.options.retryDelay);
      
      this.metrics.tasksRetried++;
      
      console.log(`Retrying task ${task.id} in ${task.options.retryDelay}ms`);
      this.emit('taskRetrying', { task, error });
      
      // Schedule retry
      setTimeout(() => {
        if (this.activeTasks.has(task.id)) {
          this.activeTasks.delete(task.id);
          this.insertTaskByPriority(task);
        }
      }, task.options.retryDelay);
      
    } else {
      // Task failed permanently
      task.status = 'failed';
      task.failedAt = new Date();
      
      // Move to failed tasks
      this.activeTasks.delete(task.id);
      this.failedTasks.set(task.id, task);
      
      this.metrics.tasksFailed++;
      
      console.error(`Task ${task.id} failed permanently after ${task.attempts} attempts`);
      this.emit('taskFailed', { task, error });
    }
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId) {
    // Check active tasks
    if (this.activeTasks.has(taskId)) {
      return { found: true, ...this.activeTasks.get(taskId) };
    }
    
    // Check completed tasks
    if (this.completedTasks.has(taskId)) {
      return { found: true, ...this.completedTasks.get(taskId) };
    }
    
    // Check failed tasks
    if (this.failedTasks.has(taskId)) {
      return { found: true, ...this.failedTasks.get(taskId) };
    }
    
    // Check queued tasks
    const queuedTask = this.queue.find(task => task.id === taskId);
    if (queuedTask) {
      return { found: true, ...queuedTask };
    }
    
    return { found: false };
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId) {
    // Remove from queue
    const queueIndex = this.queue.findIndex(task => task.id === taskId);
    if (queueIndex !== -1) {
      const task = this.queue[queueIndex];
      this.queue.splice(queueIndex, 1);
      task.status = 'cancelled';
      task.cancelledAt = new Date();
      
      this.emit('taskCancelled', { task });
      return { success: true, message: 'Task cancelled from queue' };
    }
    
    // Check if task is active (cannot cancel active tasks)
    if (this.activeTasks.has(taskId)) {
      return { success: false, message: 'Cannot cancel active task' };
    }
    
    return { success: false, message: 'Task not found' };
  }

  /**
   * Get queue statistics
   */
  getStatistics() {
    return {
      ...this.metrics,
      queueLength: this.queue.length,
      activeTasks: this.activeTasks.size,
      completedTasks: this.completedTasks.size,
      failedTasks: this.failedTasks.size,
      successRate: this.metrics.tasksAdded > 0 
        ? this.metrics.tasksCompleted / this.metrics.tasksAdded 
        : 0,
      retryRate: this.metrics.tasksAdded > 0 
        ? this.metrics.tasksRetried / this.metrics.tasksAdded 
        : 0
    };
  }

  /**
   * Get queue health status
   */
  getHealth() {
    const stats = this.getStatistics();
    const queueUtilization = this.queue.length / this.config.maxQueueSize;
    const taskUtilization = this.activeTasks.size / this.config.maxConcurrentTasks;
    
    let status = 'healthy';
    if (queueUtilization > 0.8 || taskUtilization > 0.9) {
      status = 'degraded';
    }
    if (queueUtilization > 0.95 || stats.successRate < 0.5) {
      status = 'unhealthy';
    }
    
    return {
      status,
      queueUtilization,
      taskUtilization,
      successRate: stats.successRate,
      averageWaitTime: stats.averageWaitTime,
      averageProcessingTime: stats.averageProcessingTime,
      isProcessing: this.isProcessing
    };
  }

  /**
   * Update average wait time
   */
  updateAverageWaitTime(newWaitTime) {
    if (this.metrics.tasksCompleted === 1) {
      this.metrics.averageWaitTime = newWaitTime;
    } else {
      this.metrics.averageWaitTime = 
        (this.metrics.averageWaitTime * (this.metrics.tasksCompleted - 1) + newWaitTime) / 
        this.metrics.tasksCompleted;
    }
  }

  /**
   * Generate unique task ID
   */
  generateTaskId() {
    return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Wait for all active tasks to complete
   */
  async waitForActiveTasks(timeout = 30000) {
    const startTime = Date.now();
    
    while (this.activeTasks.size > 0 && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (this.activeTasks.size > 0) {
      console.warn(`${this.activeTasks.size} tasks still active after timeout`);
    }
  }

  /**
   * Load persisted tasks (placeholder for persistence implementation)
   */
  async loadPersistedTasks() {
    // Implementation would load tasks from database or file system
    console.log('Loading persisted tasks...');
  }

  /**
   * Persist tasks (placeholder for persistence implementation)
   */
  async persistTasks() {
    // Implementation would save tasks to database or file system
    console.log('Persisting tasks...');
  }

  /**
   * Clear completed and failed tasks
   */
  clearHistory() {
    this.completedTasks.clear();
    this.failedTasks.clear();
    console.log('Task history cleared');
    this.emit('historyCleared');
  }

  /**
   * Get queue snapshot
   */
  getSnapshot() {
    return {
      queue: this.queue.map(task => ({ ...task })),
      activeTasks: Array.from(this.activeTasks.values()),
      completedTasks: Array.from(this.completedTasks.values()),
      failedTasks: Array.from(this.failedTasks.values()),
      statistics: this.getStatistics(),
      health: this.getHealth()
    };
  }
}

export default TaskQueue;

