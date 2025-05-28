/**
 * @fileoverview Event Queue Manager - Redis-based message queue for webhook events
 * @description Manages event queuing, processing, retry logic, and dead letter queues
 */

import { createClient } from 'redis';
import { EventEmitter } from 'events';
import { log } from '../../utils/simple_logger.js';

/**
 * Event Queue Manager
 * Handles event queuing with Redis, retry logic, and dead letter queues
 */
export class EventQueueManager extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            redis: {
                host: config.redis?.host || process.env.REDIS_HOST || 'localhost',
                port: config.redis?.port || process.env.REDIS_PORT || 6379,
                password: config.redis?.password || process.env.REDIS_PASSWORD,
                db: config.redis?.db || 0,
                retryDelayOnFailover: 100,
                maxRetriesPerRequest: 3,
                lazyConnect: true
            },
            queues: {
                default: 'webhook:events:default',
                deployment: 'webhook:events:deployment',
                validation: 'webhook:events:validation',
                workflow: 'webhook:events:workflow',
                recovery: 'webhook:events:recovery',
                deadLetter: 'webhook:events:dead_letter'
            },
            processing: {
                maxRetries: config.maxRetries || 3,
                retryDelay: config.retryDelay || 1000, // ms
                retryBackoffMultiplier: config.retryBackoffMultiplier || 2,
                maxRetryDelay: config.maxRetryDelay || 30000, // 30 seconds
                processingTimeout: config.processingTimeout || 300000, // 5 minutes
                batchSize: config.batchSize || 10,
                concurrency: config.concurrency || 5
            },
            monitoring: {
                enableMetrics: config.enableMetrics !== false,
                metricsInterval: config.metricsInterval || 60000, // 1 minute
                healthCheckInterval: config.healthCheckInterval || 30000 // 30 seconds
            },
            ...config
        };

        this.redis = null;
        this.isConnected = false;
        this.isProcessing = false;
        this.processors = new Map();
        this.activeJobs = new Map();
        
        // Metrics
        this.metrics = {
            totalEnqueued: 0,
            totalProcessed: 0,
            totalFailed: 0,
            totalRetried: 0,
            totalDeadLettered: 0,
            currentQueueSizes: {},
            processingTimes: [],
            lastProcessedTime: null,
            startTime: Date.now()
        };

        // Health monitoring
        this.healthStatus = {
            redis: 'disconnected',
            processing: 'stopped',
            lastHealthCheck: null
        };
    }

    /**
     * Initialize the queue manager
     */
    async initialize() {
        try {
            await this.connectRedis();
            await this.setupQueues();
            this.startHealthMonitoring();
            
            log('info', 'Event Queue Manager initialized successfully');
        } catch (error) {
            log('error', `Failed to initialize queue manager: ${error.message}`);
            throw error;
        }
    }

    /**
     * Connect to Redis
     * @private
     */
    async connectRedis() {
        try {
            this.redis = createClient(this.config.redis);
            
            this.redis.on('error', (error) => {
                log('error', `Redis error: ${error.message}`);
                this.healthStatus.redis = 'error';
                this.emit('redis:error', error);
            });

            this.redis.on('connect', () => {
                log('info', 'Connected to Redis');
                this.healthStatus.redis = 'connected';
                this.emit('redis:connected');
            });

            this.redis.on('disconnect', () => {
                log('warning', 'Disconnected from Redis');
                this.healthStatus.redis = 'disconnected';
                this.emit('redis:disconnected');
            });

            await this.redis.connect();
            this.isConnected = true;
            
        } catch (error) {
            log('error', `Failed to connect to Redis: ${error.message}`);
            throw error;
        }
    }

    /**
     * Setup queue structures
     * @private
     */
    async setupQueues() {
        try {
            // Initialize queue metrics
            for (const queueName of Object.values(this.config.queues)) {
                this.metrics.currentQueueSizes[queueName] = 0;
            }

            // Setup queue monitoring
            if (this.config.monitoring.enableMetrics) {
                this.startMetricsCollection();
            }

        } catch (error) {
            log('error', `Failed to setup queues: ${error.message}`);
            throw error;
        }
    }

    /**
     * Enqueue an event for processing
     * @param {Object} event - Event to enqueue
     * @param {string} queueType - Queue type (default, deployment, validation, etc.)
     * @param {Object} options - Enqueue options
     * @returns {Promise<string>} Job ID
     */
    async enqueue(event, queueType = 'default', options = {}) {
        if (!this.isConnected) {
            throw new Error('Queue manager not connected to Redis');
        }

        const queueName = this.config.queues[queueType] || this.config.queues.default;
        const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const job = {
            id: jobId,
            event: event,
            queueType: queueType,
            priority: options.priority || 'medium',
            maxRetries: options.maxRetries || this.config.processing.maxRetries,
            retryCount: 0,
            createdAt: new Date(),
            scheduledAt: options.delay ? new Date(Date.now() + options.delay) : new Date(),
            metadata: {
                source: 'webhook',
                version: '1.0',
                ...options.metadata
            }
        };

        try {
            // Add to queue with priority scoring
            const score = this.calculatePriorityScore(job);
            await this.redis.zAdd(queueName, { score, value: JSON.stringify(job) });
            
            this.metrics.totalEnqueued++;
            this.metrics.currentQueueSizes[queueName]++;
            
            log('debug', `Event enqueued: ${jobId} to ${queueType} queue`);
            this.emit('job:enqueued', { jobId, queueType, event });
            
            return jobId;
            
        } catch (error) {
            log('error', `Failed to enqueue event: ${error.message}`);
            throw error;
        }
    }

    /**
     * Start processing events from queues
     * @param {Object} processors - Map of queue types to processor functions
     */
    async startProcessing(processors = {}) {
        if (this.isProcessing) {
            log('warning', 'Event processing already started');
            return;
        }

        this.processors = new Map(Object.entries(processors));
        this.isProcessing = true;
        this.healthStatus.processing = 'running';

        log('info', 'Starting event processing');

        // Start processing for each queue type
        for (const queueType of Object.keys(this.config.queues)) {
            if (queueType !== 'deadLetter') {
                this.processQueue(queueType);
            }
        }

        this.emit('processing:started');
    }

    /**
     * Stop processing events
     */
    async stopProcessing() {
        if (!this.isProcessing) {
            return;
        }

        this.isProcessing = false;
        this.healthStatus.processing = 'stopping';

        log('info', 'Stopping event processing');

        // Wait for active jobs to complete
        const activeJobIds = Array.from(this.activeJobs.keys());
        if (activeJobIds.length > 0) {
            log('info', `Waiting for ${activeJobIds.length} active jobs to complete`);
            
            const timeout = setTimeout(() => {
                log('warning', 'Timeout waiting for jobs to complete, forcing shutdown');
                this.activeJobs.clear();
            }, 30000); // 30 second timeout

            while (this.activeJobs.size > 0) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            clearTimeout(timeout);
        }

        this.healthStatus.processing = 'stopped';
        this.emit('processing:stopped');
        
        log('info', 'Event processing stopped');
    }

    /**
     * Process a specific queue
     * @param {string} queueType - Queue type to process
     * @private
     */
    async processQueue(queueType) {
        const queueName = this.config.queues[queueType];
        const processor = this.processors.get(queueType) || this.processors.get('default');

        if (!processor) {
            log('warning', `No processor found for queue type: ${queueType}`);
            return;
        }

        const processJobs = async () => {
            while (this.isProcessing) {
                try {
                    // Get jobs from queue (batch processing)
                    const jobs = await this.getJobsFromQueue(queueName, this.config.processing.batchSize);
                    
                    if (jobs.length === 0) {
                        // No jobs available, wait before checking again
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        continue;
                    }

                    // Process jobs concurrently
                    const processingPromises = jobs.map(job => 
                        this.processJob(job, processor, queueType)
                    );

                    await Promise.allSettled(processingPromises);

                } catch (error) {
                    log('error', `Error processing queue ${queueType}: ${error.message}`);
                    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait before retrying
                }
            }
        };

        // Start multiple concurrent processors for this queue
        for (let i = 0; i < this.config.processing.concurrency; i++) {
            processJobs().catch(error => {
                log('error', `Queue processor ${i} for ${queueType} failed: ${error.message}`);
            });
        }
    }

    /**
     * Get jobs from a queue
     * @param {string} queueName - Queue name
     * @param {number} count - Number of jobs to retrieve
     * @returns {Promise<Array>} Array of jobs
     * @private
     */
    async getJobsFromQueue(queueName, count) {
        try {
            // Get jobs with highest priority (lowest score)
            const results = await this.redis.zPopMin(queueName, count);
            
            const jobs = results.map(result => {
                try {
                    const job = JSON.parse(result.value);
                    job.score = result.score;
                    return job;
                } catch (error) {
                    log('error', `Failed to parse job from queue: ${error.message}`);
                    return null;
                }
            }).filter(job => job !== null);

            // Update queue size metrics
            this.metrics.currentQueueSizes[queueName] -= jobs.length;
            
            return jobs;
            
        } catch (error) {
            log('error', `Failed to get jobs from queue ${queueName}: ${error.message}`);
            return [];
        }
    }

    /**
     * Process a single job
     * @param {Object} job - Job to process
     * @param {Function} processor - Processor function
     * @param {string} queueType - Queue type
     * @private
     */
    async processJob(job, processor, queueType) {
        const startTime = Date.now();
        this.activeJobs.set(job.id, { job, startTime, queueType });

        try {
            log('debug', `Processing job ${job.id} from ${queueType} queue`);

            // Check if job is scheduled for future processing
            if (job.scheduledAt && new Date(job.scheduledAt) > new Date()) {
                // Re-queue for later processing
                await this.requeueJob(job, queueType);
                return;
            }

            // Set processing timeout
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Job processing timeout')), 
                    this.config.processing.processingTimeout);
            });

            // Process the job
            const processingPromise = processor(job.event, job);
            const result = await Promise.race([processingPromise, timeoutPromise]);

            // Job completed successfully
            const processingTime = Date.now() - startTime;
            this.metrics.totalProcessed++;
            this.metrics.processingTimes.push(processingTime);
            this.metrics.lastProcessedTime = new Date();

            // Keep only last 1000 processing times for metrics
            if (this.metrics.processingTimes.length > 1000) {
                this.metrics.processingTimes = this.metrics.processingTimes.slice(-1000);
            }

            log('debug', `Job ${job.id} completed successfully (${processingTime}ms)`);
            this.emit('job:completed', { job, result, processingTime });

        } catch (error) {
            await this.handleJobFailure(job, error, queueType);
        } finally {
            this.activeJobs.delete(job.id);
        }
    }

    /**
     * Handle job processing failure
     * @param {Object} job - Failed job
     * @param {Error} error - Error that occurred
     * @param {string} queueType - Queue type
     * @private
     */
    async handleJobFailure(job, error, queueType) {
        log('error', `Job ${job.id} failed: ${error.message}`);
        
        job.retryCount++;
        job.lastError = {
            message: error.message,
            stack: error.stack,
            timestamp: new Date()
        };

        if (job.retryCount <= job.maxRetries) {
            // Retry the job with exponential backoff
            const retryDelay = this.calculateRetryDelay(job.retryCount);
            job.scheduledAt = new Date(Date.now() + retryDelay);
            
            await this.requeueJob(job, queueType);
            
            this.metrics.totalRetried++;
            log('info', `Job ${job.id} scheduled for retry ${job.retryCount}/${job.maxRetries} in ${retryDelay}ms`);
            this.emit('job:retried', { job, retryDelay });
            
        } else {
            // Move to dead letter queue
            await this.moveToDeadLetterQueue(job, error);
            
            this.metrics.totalFailed++;
            this.metrics.totalDeadLettered++;
            log('error', `Job ${job.id} moved to dead letter queue after ${job.retryCount} retries`);
            this.emit('job:dead_lettered', { job, error });
        }
    }

    /**
     * Re-queue a job for later processing
     * @param {Object} job - Job to re-queue
     * @param {string} queueType - Queue type
     * @private
     */
    async requeueJob(job, queueType) {
        const queueName = this.config.queues[queueType];
        const score = this.calculatePriorityScore(job);
        
        await this.redis.zAdd(queueName, { score, value: JSON.stringify(job) });
        this.metrics.currentQueueSizes[queueName]++;
    }

    /**
     * Move job to dead letter queue
     * @param {Object} job - Failed job
     * @param {Error} error - Final error
     * @private
     */
    async moveToDeadLetterQueue(job, error) {
        const deadLetterJob = {
            ...job,
            deadLetteredAt: new Date(),
            finalError: {
                message: error.message,
                stack: error.stack,
                timestamp: new Date()
            }
        };

        const deadLetterQueue = this.config.queues.deadLetter;
        await this.redis.lPush(deadLetterQueue, JSON.stringify(deadLetterJob));
    }

    /**
     * Calculate priority score for job ordering
     * @param {Object} job - Job object
     * @returns {number} Priority score (lower = higher priority)
     * @private
     */
    calculatePriorityScore(job) {
        const priorityWeights = {
            critical: 1,
            high: 10,
            medium: 50,
            low: 100
        };

        const baseScore = priorityWeights[job.priority] || priorityWeights.medium;
        const timeScore = job.scheduledAt ? new Date(job.scheduledAt).getTime() : Date.now();
        
        return baseScore + (timeScore / 1000); // Convert to seconds for reasonable scoring
    }

    /**
     * Calculate retry delay with exponential backoff
     * @param {number} retryCount - Current retry count
     * @returns {number} Delay in milliseconds
     * @private
     */
    calculateRetryDelay(retryCount) {
        const delay = this.config.processing.retryDelay * 
            Math.pow(this.config.processing.retryBackoffMultiplier, retryCount - 1);
        
        return Math.min(delay, this.config.processing.maxRetryDelay);
    }

    /**
     * Start metrics collection
     * @private
     */
    startMetricsCollection() {
        setInterval(async () => {
            try {
                // Update queue sizes
                for (const [queueType, queueName] of Object.entries(this.config.queues)) {
                    const size = await this.redis.zCard(queueName);
                    this.metrics.currentQueueSizes[queueName] = size;
                }
            } catch (error) {
                log('error', `Failed to collect metrics: ${error.message}`);
            }
        }, this.config.monitoring.metricsInterval);
    }

    /**
     * Start health monitoring
     * @private
     */
    startHealthMonitoring() {
        setInterval(async () => {
            try {
                await this.redis.ping();
                this.healthStatus.redis = 'connected';
                this.healthStatus.lastHealthCheck = new Date();
            } catch (error) {
                this.healthStatus.redis = 'error';
                log('error', `Redis health check failed: ${error.message}`);
            }
        }, this.config.monitoring.healthCheckInterval);
    }

    /**
     * Get queue metrics
     * @returns {Object} Queue metrics
     */
    getMetrics() {
        const avgProcessingTime = this.metrics.processingTimes.length > 0 ?
            this.metrics.processingTimes.reduce((a, b) => a + b, 0) / this.metrics.processingTimes.length : 0;

        return {
            ...this.metrics,
            averageProcessingTime: avgProcessingTime,
            uptime: Date.now() - this.metrics.startTime,
            activeJobs: this.activeJobs.size,
            isProcessing: this.isProcessing
        };
    }

    /**
     * Get health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        return {
            status: this.isConnected && this.healthStatus.redis === 'connected' ? 'healthy' : 'unhealthy',
            redis: this.healthStatus.redis,
            processing: this.healthStatus.processing,
            lastHealthCheck: this.healthStatus.lastHealthCheck,
            metrics: this.getMetrics()
        };
    }

    /**
     * Get dead letter queue items
     * @param {number} limit - Maximum number of items to retrieve
     * @returns {Promise<Array>} Dead letter queue items
     */
    async getDeadLetterItems(limit = 100) {
        try {
            const items = await this.redis.lRange(this.config.queues.deadLetter, 0, limit - 1);
            return items.map(item => JSON.parse(item));
        } catch (error) {
            log('error', `Failed to get dead letter items: ${error.message}`);
            return [];
        }
    }

    /**
     * Reprocess dead letter queue item
     * @param {string} jobId - Job ID to reprocess
     * @param {string} queueType - Target queue type
     * @returns {Promise<boolean>} Success status
     */
    async reprocessDeadLetterItem(jobId, queueType = 'default') {
        try {
            const deadLetterQueue = this.config.queues.deadLetter;
            const items = await this.redis.lRange(deadLetterQueue, 0, -1);
            
            for (let i = 0; i < items.length; i++) {
                const job = JSON.parse(items[i]);
                if (job.id === jobId) {
                    // Remove from dead letter queue
                    await this.redis.lRem(deadLetterQueue, 1, items[i]);
                    
                    // Reset retry count and re-queue
                    job.retryCount = 0;
                    delete job.deadLetteredAt;
                    delete job.finalError;
                    
                    await this.enqueue(job.event, queueType, { metadata: job.metadata });
                    
                    log('info', `Dead letter item ${jobId} reprocessed to ${queueType} queue`);
                    return true;
                }
            }
            
            return false;
            
        } catch (error) {
            log('error', `Failed to reprocess dead letter item: ${error.message}`);
            return false;
        }
    }

    /**
     * Clear a queue
     * @param {string} queueType - Queue type to clear
     * @returns {Promise<number>} Number of items removed
     */
    async clearQueue(queueType) {
        try {
            const queueName = this.config.queues[queueType];
            if (!queueName) {
                throw new Error(`Unknown queue type: ${queueType}`);
            }

            const count = await this.redis.del(queueName);
            this.metrics.currentQueueSizes[queueName] = 0;
            
            log('info', `Cleared ${count} items from ${queueType} queue`);
            return count;
            
        } catch (error) {
            log('error', `Failed to clear queue ${queueType}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Shutdown the queue manager
     */
    async shutdown() {
        try {
            await this.stopProcessing();
            
            if (this.redis && this.isConnected) {
                await this.redis.disconnect();
                this.isConnected = false;
            }
            
            log('info', 'Event Queue Manager shutdown completed');
        } catch (error) {
            log('error', `Error during queue manager shutdown: ${error.message}`);
            throw error;
        }
    }
}

export default EventQueueManager;

