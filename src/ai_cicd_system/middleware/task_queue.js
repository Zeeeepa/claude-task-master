/**
 * @fileoverview Task Queue System
 * @description Priority-based task queue with concurrent execution, retry logic,
 * and persistence support. Consolidates task management from PRs #43, #92.
 */

import EventEmitter from 'events';
import { performance } from 'perf_hooks';
import { SimpleLogger } from '../utils/simple_logger.js';

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

        this.logger = new SimpleLogger('TaskQueue');
        
        // Queue state
        this.queue = [];
        this.activeTasks = new Map();
        this.completedTasks = new Map();
        this.failedTasks = new Map();
        
        // Processing state
        this.isProcessing = false;
        this.processingInterval = null;
        
        // Metrics
        this.metrics = {
            totalTasks: 0,
            completedTasks: 0,
            failedTasks: 0,
            activeTasks: 0,
            averageProcessingTime: 0,
            queueSize: 0,
            maxQueueSize: 0
        };
        
        // Task processors
        this.taskProcessors = new Map();
        this._registerDefaultProcessors();
    }

    /**
     * Start the task queue processing
     */
    async start() {
        if (this.isProcessing) {
            this.logger.warn('Task queue already processing');
            return;
        }

        this.logger.info('🎯 Starting task queue processing...');
        this.isProcessing = true;
        
        this.processingInterval = setInterval(() => {
            this._processQueue();
        }, this.config.queueProcessInterval);
        
        this.emit('started');
        this.logger.info('✅ Task queue started');
    }

    /**
     * Stop the task queue processing
     */
    async stop() {
        if (!this.isProcessing) {
            return;
        }

        this.logger.info('🛑 Stopping task queue...');
        this.isProcessing = false;
        
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }
        
        // Wait for active tasks to complete or timeout
        const activeTaskIds = Array.from(this.activeTasks.keys());
        if (activeTaskIds.length > 0) {
            this.logger.info(`⏳ Waiting for ${activeTaskIds.length} active tasks to complete...`);
            
            const timeout = 30000; // 30 seconds
            const startTime = Date.now();
            
            while (this.activeTasks.size > 0 && (Date.now() - startTime) < timeout) {
                await this._sleep(1000);
            }
            
            if (this.activeTasks.size > 0) {
                this.logger.warn(`⚠️ ${this.activeTasks.size} tasks still active after timeout`);
            }
        }
        
        this.emit('stopped');
        this.logger.info('✅ Task queue stopped');
    }

    /**
     * Add a task to the queue
     * @param {Object} task - Task to add
     * @returns {string} Task ID
     */
    addTask(task) {
        if (this.queue.length >= this.config.maxQueueSize) {
            throw new Error(`Queue is full (max: ${this.config.maxQueueSize})`);
        }

        const taskId = task.id || this._generateTaskId();
        const enrichedTask = {
            id: taskId,
            type: task.type || 'generic',
            priority: task.priority || this.config.defaultPriority,
            data: task.data || {},
            retryCount: 0,
            maxRetries: task.maxRetries || this.config.retryAttempts,
            timeout: task.timeout || this.config.taskTimeout,
            createdAt: new Date().toISOString(),
            status: 'queued',
            ...task
        };

        // Insert task in priority order (higher priority first)
        const insertIndex = this._findInsertIndex(enrichedTask.priority);
        this.queue.splice(insertIndex, 0, enrichedTask);
        
        this.metrics.totalTasks++;
        this.metrics.queueSize = this.queue.length;
        this.metrics.maxQueueSize = Math.max(this.metrics.maxQueueSize, this.queue.length);
        
        this.emit('taskAdded', { taskId, task: enrichedTask });
        this.logger.info(`📝 Task added to queue: ${taskId}`, { 
            type: enrichedTask.type, 
            priority: enrichedTask.priority,
            queueSize: this.queue.length
        });
        
        return taskId;
    }

    /**
     * Get task status
     * @param {string} taskId - Task ID
     * @returns {Object} Task status
     */
    getTaskStatus(taskId) {
        // Check active tasks
        if (this.activeTasks.has(taskId)) {
            return {
                status: 'processing',
                task: this.activeTasks.get(taskId),
                startedAt: this.activeTasks.get(taskId).startedAt
            };
        }
        
        // Check completed tasks
        if (this.completedTasks.has(taskId)) {
            return {
                status: 'completed',
                task: this.completedTasks.get(taskId),
                result: this.completedTasks.get(taskId).result
            };
        }
        
        // Check failed tasks
        if (this.failedTasks.has(taskId)) {
            return {
                status: 'failed',
                task: this.failedTasks.get(taskId),
                error: this.failedTasks.get(taskId).error
            };
        }
        
        // Check queued tasks
        const queuedTask = this.queue.find(task => task.id === taskId);
        if (queuedTask) {
            return {
                status: 'queued',
                task: queuedTask,
                position: this.queue.indexOf(queuedTask) + 1
            };
        }
        
        return { status: 'not_found' };
    }

    /**
     * Cancel a task
     * @param {string} taskId - Task ID
     * @returns {boolean} True if cancelled
     */
    cancelTask(taskId) {
        // Remove from queue
        const queueIndex = this.queue.findIndex(task => task.id === taskId);
        if (queueIndex !== -1) {
            const task = this.queue.splice(queueIndex, 1)[0];
            this.metrics.queueSize = this.queue.length;
            
            this.emit('taskCancelled', { taskId, task });
            this.logger.info(`❌ Task cancelled: ${taskId}`);
            return true;
        }
        
        // Cannot cancel active tasks (they need to complete or timeout)
        if (this.activeTasks.has(taskId)) {
            this.logger.warn(`⚠️ Cannot cancel active task: ${taskId}`);
            return false;
        }
        
        return false;
    }

    /**
     * Get queue status
     * @returns {Object} Queue status
     */
    getStatus() {
        return {
            isProcessing: this.isProcessing,
            queueSize: this.queue.length,
            activeTasks: this.activeTasks.size,
            completedTasks: this.completedTasks.size,
            failedTasks: this.failedTasks.size,
            metrics: this.getMetrics()
        };
    }

    /**
     * Get queue metrics
     * @returns {Object} Queue metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            queueSize: this.queue.length,
            activeTasks: this.activeTasks.size,
            successRate: this.metrics.totalTasks > 0 
                ? (this.metrics.completedTasks / this.metrics.totalTasks) * 100 
                : 0
        };
    }

    /**
     * Register a task processor
     * @param {string} taskType - Task type
     * @param {Function} processor - Processor function
     */
    registerProcessor(taskType, processor) {
        this.taskProcessors.set(taskType, processor);
        this.logger.info(`🔧 Registered processor for task type: ${taskType}`);
    }

    // Private methods

    async _processQueue() {
        if (!this.isProcessing || this.queue.length === 0) {
            return;
        }

        // Check if we can process more tasks
        const availableSlots = this.config.maxConcurrentTasks - this.activeTasks.size;
        if (availableSlots <= 0) {
            return;
        }

        // Process tasks up to available slots
        const tasksToProcess = this.queue.splice(0, availableSlots);
        this.metrics.queueSize = this.queue.length;
        
        for (const task of tasksToProcess) {
            this._processTask(task);
        }
    }

    async _processTask(task) {
        const taskId = task.id;
        
        try {
            // Move task to active
            task.status = 'processing';
            task.startedAt = new Date().toISOString();
            this.activeTasks.set(taskId, task);
            this.metrics.activeTasks = this.activeTasks.size;
            
            this.emit('taskStarted', { taskId, task });
            this.logger.info(`🎯 Processing task: ${taskId}`, { type: task.type });
            
            const startTime = performance.now();
            
            // Get processor for task type
            const processor = this.taskProcessors.get(task.type) || this.taskProcessors.get('default');
            if (!processor) {
                throw new Error(`No processor found for task type: ${task.type}`);
            }
            
            // Execute task with timeout
            const result = await this._executeWithTimeout(
                () => processor(task),
                task.timeout
            );
            
            const processingTime = performance.now() - startTime;
            
            // Task completed successfully
            task.status = 'completed';
            task.completedAt = new Date().toISOString();
            task.processingTime = processingTime;
            task.result = result;
            
            this.activeTasks.delete(taskId);
            this.completedTasks.set(taskId, task);
            
            this.metrics.completedTasks++;
            this.metrics.activeTasks = this.activeTasks.size;
            this._updateAverageProcessingTime(processingTime);
            
            this.emit('taskCompleted', { taskId, task, result, processingTime });
            this.logger.info(`✅ Task completed: ${taskId}`, { 
                processingTime: Math.round(processingTime),
                type: task.type
            });

        } catch (error) {
            await this._handleTaskFailure(task, error);
        }
    }

    async _handleTaskFailure(task, error) {
        const taskId = task.id;
        
        this.logger.error(`❌ Task failed: ${taskId}`, { 
            error: error.message,
            retryCount: task.retryCount,
            maxRetries: task.maxRetries
        });
        
        // Check if we should retry
        if (task.retryCount < task.maxRetries) {
            task.retryCount++;
            task.status = 'retrying';
            task.lastError = error.message;
            
            // Remove from active tasks and add back to queue with delay
            this.activeTasks.delete(taskId);
            this.metrics.activeTasks = this.activeTasks.size;
            
            this.emit('taskRetrying', { taskId, task, error, attempt: task.retryCount });
            this.logger.info(`🔄 Retrying task: ${taskId} (attempt ${task.retryCount}/${task.maxRetries})`);
            
            // Add back to queue after delay
            setTimeout(() => {
                if (this.isProcessing) {
                    task.status = 'queued';
                    const insertIndex = this._findInsertIndex(task.priority);
                    this.queue.splice(insertIndex, 0, task);
                    this.metrics.queueSize = this.queue.length;
                }
            }, this.config.retryDelay);
            
        } else {
            // Task failed permanently
            task.status = 'failed';
            task.failedAt = new Date().toISOString();
            task.error = error.message;
            
            this.activeTasks.delete(taskId);
            this.failedTasks.set(taskId, task);
            
            this.metrics.failedTasks++;
            this.metrics.activeTasks = this.activeTasks.size;
            
            this.emit('taskFailed', { taskId, task, error });
        }
    }

    async _executeWithTimeout(fn, timeout) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Task timeout after ${timeout}ms`));
            }, timeout);
            
            Promise.resolve(fn())
                .then(result => {
                    clearTimeout(timer);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timer);
                    reject(error);
                });
        });
    }

    _findInsertIndex(priority) {
        // Find the correct position to insert task based on priority
        // Higher priority tasks go first
        for (let i = 0; i < this.queue.length; i++) {
            if (this.queue[i].priority < priority) {
                return i;
            }
        }
        return this.queue.length;
    }

    _generateTaskId() {
        return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    _updateAverageProcessingTime(processingTime) {
        const totalCompleted = this.metrics.completedTasks;
        const currentAverage = this.metrics.averageProcessingTime;
        
        this.metrics.averageProcessingTime = 
            (currentAverage * (totalCompleted - 1) + processingTime) / totalCompleted;
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    _registerDefaultProcessors() {
        // Default processor for generic tasks
        this.registerProcessor('default', async (task) => {
            this.logger.info(`🔧 Processing generic task: ${task.id}`, task.data);
            
            // Simulate some work
            await this._sleep(1000);
            
            return {
                success: true,
                message: 'Generic task completed',
                data: task.data
            };
        });
        
        // Processor for analysis tasks
        this.registerProcessor('analyze', async (task) => {
            this.logger.info(`🔍 Analyzing: ${task.id}`, task.data);
            
            // Simulate analysis work
            await this._sleep(2000);
            
            return {
                success: true,
                analysisType: task.data.analysisType || 'general',
                findings: ['Analysis completed successfully'],
                confidence: 0.95
            };
        });
        
        // Processor for deployment tasks
        this.registerProcessor('deploy', async (task) => {
            this.logger.info(`🚀 Deploying: ${task.id}`, task.data);
            
            // Simulate deployment work
            await this._sleep(5000);
            
            return {
                success: true,
                deploymentId: `deploy_${Date.now()}`,
                environment: task.data.environment || 'development',
                status: 'deployed'
            };
        });
        
        // Processor for validation tasks
        this.registerProcessor('validate', async (task) => {
            this.logger.info(`✅ Validating: ${task.id}`, task.data);
            
            // Simulate validation work
            await this._sleep(3000);
            
            return {
                success: true,
                validationType: task.data.validationType || 'general',
                passed: true,
                issues: []
            };
        });
    }
}

export default TaskQueue;

