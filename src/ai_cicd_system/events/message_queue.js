/**
 * @fileoverview Message Queue Implementation
 * @description In-memory message queue for event processing
 */

/**
 * Message Queue for handling asynchronous event processing
 */
export class MessageQueue {
    constructor(config = {}) {
        this.config = {
            maxQueueSize: config.maxQueueSize || 10000,
            processingDelay: config.processingDelay || 10,
            enablePersistence: config.enablePersistence || false,
            ...config
        };
        
        this.queue = [];
        this.isProcessing = false;
        this.isInitialized = false;
        this.stats = {
            totalEnqueued: 0,
            totalDequeued: 0,
            totalProcessed: 0,
            errors: 0
        };
    }

    /**
     * Initialize the message queue
     */
    async initialize() {
        this.isInitialized = true;
        
        if (this.config.enablePersistence) {
            await this._loadPersistedMessages();
        }
    }

    /**
     * Enqueue a message
     * @param {Object} message - Message to enqueue
     */
    async enqueue(message) {
        if (!this.isInitialized) {
            throw new Error('Message queue not initialized');
        }

        if (this.queue.length >= this.config.maxQueueSize) {
            throw new Error('Queue is full');
        }

        const queuedMessage = {
            ...message,
            queuedAt: new Date(),
            id: message.id || this._generateMessageId()
        };

        this.queue.push(queuedMessage);
        this.stats.totalEnqueued++;

        if (this.config.enablePersistence) {
            await this._persistMessage(queuedMessage);
        }
    }

    /**
     * Dequeue a message
     * @returns {Object|null} Dequeued message or null if queue is empty
     */
    async dequeue() {
        if (!this.isInitialized) {
            throw new Error('Message queue not initialized');
        }

        if (this.queue.length === 0) {
            return null;
        }

        const message = this.queue.shift();
        this.stats.totalDequeued++;

        if (this.config.enablePersistence) {
            await this._removePersistedMessage(message.id);
        }

        return message;
    }

    /**
     * Peek at the next message without removing it
     * @returns {Object|null} Next message or null if queue is empty
     */
    peek() {
        return this.queue.length > 0 ? this.queue[0] : null;
    }

    /**
     * Get queue size
     * @returns {number} Number of messages in queue
     */
    size() {
        return this.queue.length;
    }

    /**
     * Check if queue is empty
     * @returns {boolean} True if queue is empty
     */
    isEmpty() {
        return this.queue.length === 0;
    }

    /**
     * Clear all messages from queue
     */
    async clear() {
        this.queue = [];
        
        if (this.config.enablePersistence) {
            await this._clearPersistedMessages();
        }
    }

    /**
     * Get queue statistics
     * @returns {Object} Queue statistics
     */
    getStats() {
        return {
            ...this.stats,
            currentSize: this.queue.length,
            maxSize: this.config.maxQueueSize,
            utilizationPercent: (this.queue.length / this.config.maxQueueSize) * 100
        };
    }

    /**
     * Shutdown the message queue
     */
    async shutdown() {
        this.isInitialized = false;
        
        if (this.config.enablePersistence && this.queue.length > 0) {
            await this._persistAllMessages();
        }
        
        this.queue = [];
    }

    /**
     * Generate a unique message ID
     * @returns {string} Unique message ID
     * @private
     */
    _generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Load persisted messages (mock implementation)
     * @private
     */
    async _loadPersistedMessages() {
        // Mock implementation - in real scenario, load from storage
        // For now, just log that persistence is enabled
        console.debug('Message queue persistence enabled - loading persisted messages');
    }

    /**
     * Persist a message (mock implementation)
     * @param {Object} message - Message to persist
     * @private
     */
    async _persistMessage(message) {
        // Mock implementation - in real scenario, save to storage
        console.debug(`Persisting message ${message.id}`);
    }

    /**
     * Remove persisted message (mock implementation)
     * @param {string} messageId - Message ID to remove
     * @private
     */
    async _removePersistedMessage(messageId) {
        // Mock implementation - in real scenario, remove from storage
        console.debug(`Removing persisted message ${messageId}`);
    }

    /**
     * Clear all persisted messages (mock implementation)
     * @private
     */
    async _clearPersistedMessages() {
        // Mock implementation - in real scenario, clear storage
        console.debug('Clearing all persisted messages');
    }

    /**
     * Persist all current messages (mock implementation)
     * @private
     */
    async _persistAllMessages() {
        // Mock implementation - in real scenario, save all to storage
        console.debug(`Persisting ${this.queue.length} messages on shutdown`);
    }
}

export default MessageQueue;

