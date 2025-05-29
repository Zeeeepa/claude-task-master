/**
 * @fileoverview Retry Manager
 * @description Robust retry mechanisms for failed event processing with exponential backoff
 */

/**
 * Retry Manager class
 */
export class RetryManager {
    constructor(config = {}) {
        this.config = {
            maxRetries: config.maxRetries || 3,
            baseDelay: config.baseDelay || 1000, // 1 second
            maxDelay: config.maxDelay || 300000, // 5 minutes
            backoffMultiplier: config.backoffMultiplier || 2,
            jitterFactor: config.jitterFactor || 0.1,
            retryableErrors: config.retryableErrors || [
                'NETWORK_ERROR',
                'TIMEOUT_ERROR',
                'RATE_LIMIT_ERROR',
                'TEMPORARY_ERROR',
                'SERVICE_UNAVAILABLE'
            ],
            nonRetryableErrors: config.nonRetryableErrors || [
                'VALIDATION_ERROR',
                'AUTHENTICATION_ERROR',
                'AUTHORIZATION_ERROR',
                'NOT_FOUND_ERROR',
                'DUPLICATE_ERROR'
            ],
            enableCircuitBreaker: config.enableCircuitBreaker !== false,
            circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
            circuitBreakerTimeout: config.circuitBreakerTimeout || 60000, // 1 minute
            ...config
        };

        this.retryQueue = new Map();
        this.retryHistory = new Map();
        this.circuitBreakers = new Map();
        this.isRunning = false;
        this.retryInterval = null;
        
        this.statistics = {
            retriesAttempted: 0,
            retriesSucceeded: 0,
            retriesFailed: 0,
            circuitBreakerTrips: 0,
            averageRetryDelay: 0,
            totalRetryTime: 0
        };
    }

    /**
     * Initialize the retry manager
     * @returns {Promise<void>}
     */
    async initialize() {
        console.log('Retry manager initialized');
    }

    /**
     * Queue event for retry
     * @param {Object} event - Original event
     * @param {Error} error - Error that occurred
     * @param {Object} options - Retry options
     * @returns {Promise<string>} Retry ID
     */
    async queueForRetry(event, error, options = {}) {
        try {
            // Check if error is retryable
            if (!this.isRetryableError(error)) {
                console.log(`Error not retryable for event ${event.id}: ${error.message}`);
                return null;
            }

            // Check circuit breaker
            if (this.config.enableCircuitBreaker && this.isCircuitBreakerOpen(event.source)) {
                console.log(`Circuit breaker open for ${event.source}, skipping retry`);
                return null;
            }

            const retryId = this.generateRetryId();
            const retryCount = this.getRetryCount(event.id);

            // Check max retries
            if (retryCount >= this.config.maxRetries) {
                console.log(`Max retries exceeded for event ${event.id}`);
                await this.recordFailedRetry(event, error, retryCount);
                return null;
            }

            // Calculate retry delay
            const delay = this.calculateRetryDelay(retryCount, options.baseDelay);
            const executeAt = new Date(Date.now() + delay);

            const retryEntry = {
                id: retryId,
                eventId: event.id,
                event,
                error: {
                    message: error.message,
                    stack: error.stack,
                    name: error.name,
                    code: error.code
                },
                retryCount: retryCount + 1,
                maxRetries: options.maxRetries || this.config.maxRetries,
                delay,
                executeAt: executeAt.toISOString(),
                queuedAt: new Date().toISOString(),
                status: 'queued',
                options: {
                    baseDelay: options.baseDelay || this.config.baseDelay,
                    backoffMultiplier: options.backoffMultiplier || this.config.backoffMultiplier,
                    ...options
                }
            };

            this.retryQueue.set(retryId, retryEntry);
            this.updateRetryHistory(event.id, retryEntry);

            console.log(`Queued retry ${retryId} for event ${event.id} (attempt ${retryEntry.retryCount}/${retryEntry.maxRetries}) in ${delay}ms`);

            return retryId;

        } catch (err) {
            console.error('Failed to queue retry:', err);
            throw err;
        }
    }

    /**
     * Start retry processing loop
     */
    startRetryLoop() {
        if (this.isRunning) {
            return;
        }

        this.isRunning = true;
        this.retryInterval = setInterval(() => {
            this.processRetries();
        }, 1000); // Check every second

        console.log('Retry processing loop started');
    }

    /**
     * Stop retry processing loop
     */
    stopRetryLoop() {
        this.isRunning = false;
        
        if (this.retryInterval) {
            clearInterval(this.retryInterval);
            this.retryInterval = null;
        }

        console.log('Retry processing loop stopped');
    }

    /**
     * Process pending retries
     */
    async processRetries() {
        if (!this.isRunning) {
            return;
        }

        const now = new Date();
        const retriesToProcess = [];

        // Find retries ready for execution
        for (const [retryId, retryEntry] of this.retryQueue) {
            if (retryEntry.status === 'queued' && new Date(retryEntry.executeAt) <= now) {
                retriesToProcess.push(retryEntry);
            }
        }

        // Process retries
        for (const retryEntry of retriesToProcess) {
            await this.processRetry(retryEntry);
        }
    }

    /**
     * Process a single retry
     * @param {Object} retryEntry - Retry entry
     */
    async processRetry(retryEntry) {
        const startTime = Date.now();
        
        try {
            retryEntry.status = 'processing';
            retryEntry.processingStartedAt = new Date().toISOString();

            this.statistics.retriesAttempted++;

            console.log(`Processing retry ${retryEntry.id} for event ${retryEntry.eventId} (attempt ${retryEntry.retryCount})`);

            // Simulate retry processing - replace with actual event reprocessing
            const success = await this.executeRetry(retryEntry);

            if (success) {
                // Retry succeeded
                retryEntry.status = 'succeeded';
                retryEntry.completedAt = new Date().toISOString();
                
                this.statistics.retriesSucceeded++;
                this.updateRetryStatistics(Date.now() - startTime);

                // Reset circuit breaker on success
                if (this.config.enableCircuitBreaker) {
                    this.resetCircuitBreaker(retryEntry.event.source);
                }

                console.log(`Retry ${retryEntry.id} succeeded`);

            } else {
                // Retry failed, queue for next attempt if retries remaining
                if (retryEntry.retryCount < retryEntry.maxRetries) {
                    await this.requeueRetry(retryEntry);
                } else {
                    // Max retries exceeded
                    retryEntry.status = 'failed';
                    retryEntry.completedAt = new Date().toISOString();
                    
                    this.statistics.retriesFailed++;
                    
                    // Trip circuit breaker if enabled
                    if (this.config.enableCircuitBreaker) {
                        this.recordCircuitBreakerFailure(retryEntry.event.source);
                    }

                    console.log(`Retry ${retryEntry.id} failed permanently after ${retryEntry.retryCount} attempts`);
                }
            }

        } catch (error) {
            console.error(`Retry processing failed for ${retryEntry.id}:`, error);
            
            retryEntry.status = 'error';
            retryEntry.error = {
                ...retryEntry.error,
                retryError: error.message
            };
            
            this.statistics.retriesFailed++;

        } finally {
            // Remove from queue if completed or failed
            if (['succeeded', 'failed', 'error'].includes(retryEntry.status)) {
                this.retryQueue.delete(retryEntry.id);
            }
        }
    }

    /**
     * Execute retry
     * @param {Object} retryEntry - Retry entry
     * @returns {Promise<boolean>} Success status
     */
    async executeRetry(retryEntry) {
        // Mock retry execution - replace with actual event reprocessing logic
        // This would typically involve re-sending the event through the processing pipeline
        
        // Simulate random success/failure for demonstration
        const successRate = Math.max(0.3, 1 - (retryEntry.retryCount * 0.2));
        const success = Math.random() < successRate;
        
        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 500));
        
        return success;
    }

    /**
     * Requeue retry for next attempt
     * @param {Object} retryEntry - Retry entry
     */
    async requeueRetry(retryEntry) {
        const delay = this.calculateRetryDelay(retryEntry.retryCount, retryEntry.options.baseDelay);
        const executeAt = new Date(Date.now() + delay);

        retryEntry.retryCount++;
        retryEntry.delay = delay;
        retryEntry.executeAt = executeAt.toISOString();
        retryEntry.status = 'queued';
        retryEntry.requeuedAt = new Date().toISOString();

        console.log(`Requeued retry ${retryEntry.id} for attempt ${retryEntry.retryCount} in ${delay}ms`);
    }

    /**
     * Calculate retry delay with exponential backoff and jitter
     * @param {number} retryCount - Current retry count
     * @param {number} baseDelay - Base delay in ms
     * @returns {number} Delay in ms
     */
    calculateRetryDelay(retryCount, baseDelay = null) {
        const base = baseDelay || this.config.baseDelay;
        const multiplier = this.config.backoffMultiplier;
        
        // Exponential backoff
        let delay = base * Math.pow(multiplier, retryCount);
        
        // Apply max delay limit
        delay = Math.min(delay, this.config.maxDelay);
        
        // Add jitter to prevent thundering herd
        const jitter = delay * this.config.jitterFactor * (Math.random() - 0.5);
        delay += jitter;
        
        return Math.max(delay, base); // Ensure minimum delay
    }

    /**
     * Check if error is retryable
     * @param {Error} error - Error to check
     * @returns {boolean} True if retryable
     */
    isRetryableError(error) {
        const errorMessage = error.message.toLowerCase();
        const errorCode = error.code?.toUpperCase();
        const errorName = error.name?.toUpperCase();

        // Check non-retryable errors first
        for (const nonRetryable of this.config.nonRetryableErrors) {
            if (errorMessage.includes(nonRetryable.toLowerCase()) ||
                errorCode === nonRetryable ||
                errorName === nonRetryable) {
                return false;
            }
        }

        // Check retryable errors
        for (const retryable of this.config.retryableErrors) {
            if (errorMessage.includes(retryable.toLowerCase()) ||
                errorCode === retryable ||
                errorName === retryable) {
                return true;
            }
        }

        // Default to retryable for unknown errors
        return true;
    }

    /**
     * Get retry count for event
     * @param {string} eventId - Event ID
     * @returns {number} Current retry count
     */
    getRetryCount(eventId) {
        const history = this.retryHistory.get(eventId);
        return history ? history.length : 0;
    }

    /**
     * Update retry history
     * @param {string} eventId - Event ID
     * @param {Object} retryEntry - Retry entry
     */
    updateRetryHistory(eventId, retryEntry) {
        if (!this.retryHistory.has(eventId)) {
            this.retryHistory.set(eventId, []);
        }
        
        this.retryHistory.get(eventId).push({
            retryId: retryEntry.id,
            retryCount: retryEntry.retryCount,
            queuedAt: retryEntry.queuedAt,
            executeAt: retryEntry.executeAt,
            error: retryEntry.error.message
        });
    }

    /**
     * Record failed retry
     * @param {Object} event - Original event
     * @param {Error} error - Final error
     * @param {number} retryCount - Total retry attempts
     */
    async recordFailedRetry(event, error, retryCount) {
        console.log(`Event ${event.id} failed permanently after ${retryCount} retry attempts: ${error.message}`);
        
        // Could emit event or store in database for monitoring
        // this.emit('retry:failed:permanent', { event, error, retryCount });
    }

    /**
     * Check if circuit breaker is open
     * @param {string} source - Event source
     * @returns {boolean} True if circuit breaker is open
     */
    isCircuitBreakerOpen(source) {
        const breaker = this.circuitBreakers.get(source);
        if (!breaker) {
            return false;
        }

        if (breaker.state === 'open') {
            // Check if timeout has passed
            if (Date.now() - breaker.openedAt > this.config.circuitBreakerTimeout) {
                breaker.state = 'half-open';
                breaker.failureCount = 0;
                console.log(`Circuit breaker for ${source} moved to half-open state`);
            }
            return breaker.state === 'open';
        }

        return false;
    }

    /**
     * Record circuit breaker failure
     * @param {string} source - Event source
     */
    recordCircuitBreakerFailure(source) {
        if (!this.circuitBreakers.has(source)) {
            this.circuitBreakers.set(source, {
                state: 'closed',
                failureCount: 0,
                openedAt: null
            });
        }

        const breaker = this.circuitBreakers.get(source);
        breaker.failureCount++;

        if (breaker.failureCount >= this.config.circuitBreakerThreshold) {
            breaker.state = 'open';
            breaker.openedAt = Date.now();
            this.statistics.circuitBreakerTrips++;
            
            console.log(`Circuit breaker tripped for ${source} after ${breaker.failureCount} failures`);
        }
    }

    /**
     * Reset circuit breaker
     * @param {string} source - Event source
     */
    resetCircuitBreaker(source) {
        if (this.circuitBreakers.has(source)) {
            const breaker = this.circuitBreakers.get(source);
            breaker.state = 'closed';
            breaker.failureCount = 0;
            breaker.openedAt = null;
            
            console.log(`Circuit breaker reset for ${source}`);
        }
    }

    /**
     * Retry specific event
     * @param {string} eventId - Event ID to retry
     * @returns {Promise<string|null>} Retry ID or null if not found
     */
    async retryEvent(eventId) {
        // This would typically fetch the event from storage and retry it
        console.log(`Manual retry requested for event ${eventId}`);
        
        // Mock implementation
        return null;
    }

    /**
     * Cancel retry
     * @param {string} retryId - Retry ID
     * @returns {boolean} True if cancelled
     */
    cancelRetry(retryId) {
        const retryEntry = this.retryQueue.get(retryId);
        if (retryEntry && retryEntry.status === 'queued') {
            retryEntry.status = 'cancelled';
            retryEntry.cancelledAt = new Date().toISOString();
            this.retryQueue.delete(retryId);
            
            console.log(`Cancelled retry ${retryId}`);
            return true;
        }
        
        return false;
    }

    /**
     * Get retry status
     * @param {string} retryId - Retry ID
     * @returns {Object|null} Retry status
     */
    getRetryStatus(retryId) {
        const retryEntry = this.retryQueue.get(retryId);
        if (!retryEntry) {
            return null;
        }

        return {
            id: retryEntry.id,
            eventId: retryEntry.eventId,
            status: retryEntry.status,
            retryCount: retryEntry.retryCount,
            maxRetries: retryEntry.maxRetries,
            executeAt: retryEntry.executeAt,
            queuedAt: retryEntry.queuedAt,
            error: retryEntry.error.message
        };
    }

    /**
     * Generate retry ID
     * @returns {string} Retry ID
     */
    generateRetryId() {
        return `retry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Update retry statistics
     * @param {number} retryTime - Time taken for retry
     */
    updateRetryStatistics(retryTime) {
        this.statistics.totalRetryTime += retryTime;
        const totalRetries = this.statistics.retriesSucceeded + this.statistics.retriesFailed;
        if (totalRetries > 0) {
            this.statistics.averageRetryDelay = this.statistics.totalRetryTime / totalRetries;
        }
    }

    /**
     * Get retry manager metrics
     * @returns {Promise<Object>} Retry metrics
     */
    async getMetrics() {
        return {
            ...this.statistics,
            queueSize: this.retryQueue.size,
            isRunning: this.isRunning,
            circuitBreakers: Object.fromEntries(
                Array.from(this.circuitBreakers.entries()).map(([source, breaker]) => [
                    source,
                    {
                        state: breaker.state,
                        failureCount: breaker.failureCount,
                        openedAt: breaker.openedAt
                    }
                ])
            ),
            successRate: this.statistics.retriesAttempted > 0 
                ? (this.statistics.retriesSucceeded / this.statistics.retriesAttempted) * 100
                : 0,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get health status
     * @returns {Promise<string>} Health status
     */
    async getHealth() {
        try {
            // Check if retry loop is running
            if (!this.isRunning) {
                return 'unhealthy';
            }

            // Check retry queue size
            if (this.retryQueue.size > 1000) {
                return 'degraded';
            }

            // Check success rate
            const successRate = this.statistics.retriesAttempted > 0 
                ? (this.statistics.retriesSucceeded / this.statistics.retriesAttempted) * 100
                : 100;

            if (successRate < 50) {
                return 'degraded';
            }

            return 'healthy';
        } catch (error) {
            return 'unhealthy';
        }
    }

    /**
     * Shutdown the retry manager
     * @returns {Promise<void>}
     */
    async shutdown() {
        console.log('Shutting down retry manager...');
        
        this.stopRetryLoop();
        
        // Wait for current retries to complete
        const maxWait = 30000; // 30 seconds
        const startTime = Date.now();
        
        while (this.retryQueue.size > 0 && Date.now() - startTime < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (this.retryQueue.size > 0) {
            console.warn(`Retry manager shutdown with ${this.retryQueue.size} retries still pending`);
        }

        console.log('Retry manager shut down successfully');
    }
}

export default RetryManager;

