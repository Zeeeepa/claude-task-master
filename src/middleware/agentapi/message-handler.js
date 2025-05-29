/**
 * Message Handler
 * Manages message queuing, transformation, and event streaming
 * Part of Task Master Architecture Restructuring
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

/**
 * Message Queue Implementation
 * Handles message prioritization and retry logic
 */
class MessageQueue extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.maxSize = options.maxSize || 1000;
        this.retryAttempts = options.retryAttempts || 3;
        this.retryDelay = options.retryDelay || 1000;
        
        this.queue = [];
        this.processing = false;
        this.stats = {
            processed: 0,
            failed: 0,
            retried: 0
        };
    }

    /**
     * Add message to queue
     */
    enqueue(message) {
        if (this.queue.length >= this.maxSize) {
            throw new Error('Message queue is full');
        }

        const queuedMessage = {
            id: message.id || uuidv4(),
            ...message,
            queuedAt: new Date().toISOString(),
            attempts: 0,
            status: 'queued'
        };

        // Insert based on priority
        const insertIndex = this.findInsertIndex(queuedMessage);
        this.queue.splice(insertIndex, 0, queuedMessage);

        this.emit('messageQueued', queuedMessage);
        
        // Start processing if not already running
        if (!this.processing) {
            this.processQueue();
        }

        return queuedMessage.id;
    }

    /**
     * Find insertion index based on priority
     */
    findInsertIndex(message) {
        const priority = message.priority || 0;
        
        for (let i = 0; i < this.queue.length; i++) {
            const queuedPriority = this.queue[i].priority || 0;
            if (priority > queuedPriority) {
                return i;
            }
        }
        
        return this.queue.length;
    }

    /**
     * Process messages in queue
     */
    async processQueue() {
        if (this.processing || this.queue.length === 0) {
            return;
        }

        this.processing = true;

        while (this.queue.length > 0) {
            const message = this.queue.shift();
            
            try {
                message.status = 'processing';
                message.attempts++;
                message.processedAt = new Date().toISOString();

                this.emit('messageProcessing', message);

                // Process the message
                await this.processMessage(message);

                message.status = 'completed';
                message.completedAt = new Date().toISOString();
                
                this.stats.processed++;
                this.emit('messageCompleted', message);

            } catch (error) {
                console.error('Error processing message:', error);
                
                message.status = 'failed';
                message.error = error.message;
                message.failedAt = new Date().toISOString();

                // Retry logic
                if (message.attempts < this.retryAttempts) {
                    message.status = 'retrying';
                    message.retryAt = new Date(Date.now() + this.retryDelay).toISOString();
                    
                    // Re-queue with delay
                    setTimeout(() => {
                        this.queue.unshift(message);
                        this.stats.retried++;
                        this.emit('messageRetried', message);
                    }, this.retryDelay);
                } else {
                    this.stats.failed++;
                    this.emit('messageFailed', message);
                }
            }
        }

        this.processing = false;
    }

    /**
     * Process individual message (to be overridden)
     */
    async processMessage(message) {
        // This should be overridden by the implementing class
        throw new Error('processMessage method must be implemented');
    }

    /**
     * Get queue statistics
     */
    getStats() {
        return {
            queueLength: this.queue.length,
            processing: this.processing,
            ...this.stats
        };
    }

    /**
     * Clear the queue
     */
    clear() {
        this.queue = [];
        this.processing = false;
    }
}

/**
 * Message Transformer
 * Handles message format conversion between API and terminal
 */
class MessageTransformer {
    constructor() {
        this.commandPatterns = {
            bash: /^bash:\s*(.+)$/i,
            edit: /^edit:\s*(.+)$/i,
            replace: /^replace:\s*(.+)$/i,
            file: /^file:\s*(.+)$/i
        };
    }

    /**
     * Transform API request to terminal command
     */
    apiToTerminal(message, options = {}) {
        const { content, type = 'message', context } = message;
        
        let transformed = content;

        // Add context if provided
        if (context) {
            transformed = `Context: ${context}\n\n${transformed}`;
        }

        // Handle special command types
        if (type === 'command') {
            transformed = this.formatCommand(content, options);
        }

        // Add any special instructions
        if (options.instructions) {
            transformed += `\n\nInstructions: ${options.instructions}`;
        }

        return {
            content: transformed,
            originalType: type,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Parse terminal response to API format
     */
    terminalToApi(terminalOutput) {
        const { clean, messages, raw } = terminalOutput;
        
        const apiMessages = messages.map(msg => ({
            id: uuidv4(),
            type: msg.type,
            content: msg.content,
            timestamp: msg.timestamp,
            metadata: {
                source: 'claude-code',
                raw: msg.type === 'agent' ? raw : undefined
            }
        }));

        return {
            messages: apiMessages,
            summary: this.extractSummary(clean),
            actions: this.extractActions(clean),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Format command for terminal
     */
    formatCommand(command, options = {}) {
        // Detect command type
        for (const [type, pattern] of Object.entries(this.commandPatterns)) {
            const match = command.match(pattern);
            if (match) {
                return this.formatSpecificCommand(type, match[1], options);
            }
        }

        // Default formatting
        return command;
    }

    /**
     * Format specific command types
     */
    formatSpecificCommand(type, command, options = {}) {
        switch (type) {
            case 'bash':
                return `Execute bash command: ${command}`;
            
            case 'edit':
                return `Edit file: ${command}${options.lineNumber ? ` at line ${options.lineNumber}` : ''}`;
            
            case 'replace':
                return `Replace content: ${command}`;
            
            case 'file':
                return `Work with file: ${command}`;
            
            default:
                return command;
        }
    }

    /**
     * Extract summary from terminal output
     */
    extractSummary(output) {
        const lines = output.split('\n');
        
        // Look for summary indicators
        const summaryPatterns = [
            /^Summary:/i,
            /^Result:/i,
            /^Completed:/i,
            /^Done:/i
        ];

        for (const line of lines) {
            for (const pattern of summaryPatterns) {
                if (pattern.test(line)) {
                    return line.replace(pattern, '').trim();
                }
            }
        }

        // Fallback: use first meaningful line
        const meaningfulLines = lines.filter(line => 
            line.trim().length > 10 && 
            !line.startsWith('>') && 
            !line.startsWith('$')
        );

        return meaningfulLines[0] || 'No summary available';
    }

    /**
     * Extract actions from terminal output
     */
    extractActions(output) {
        const actions = [];
        const lines = output.split('\n');

        const actionPatterns = [
            { pattern: /created file:\s*(.+)/i, type: 'file_created' },
            { pattern: /modified file:\s*(.+)/i, type: 'file_modified' },
            { pattern: /deleted file:\s*(.+)/i, type: 'file_deleted' },
            { pattern: /executed command:\s*(.+)/i, type: 'command_executed' },
            { pattern: /installed package:\s*(.+)/i, type: 'package_installed' }
        ];

        for (const line of lines) {
            for (const { pattern, type } of actionPatterns) {
                const match = line.match(pattern);
                if (match) {
                    actions.push({
                        type,
                        target: match[1].trim(),
                        timestamp: new Date().toISOString()
                    });
                }
            }
        }

        return actions;
    }

    /**
     * Validate message format
     */
    validateMessage(message) {
        const errors = [];

        if (!message.content || typeof message.content !== 'string') {
            errors.push('Message content is required and must be a string');
        }

        if (message.content && message.content.length > 10000) {
            errors.push('Message content exceeds maximum length (10000 characters)');
        }

        if (message.type && !['message', 'command', 'query'].includes(message.type)) {
            errors.push('Invalid message type');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

/**
 * Message Handler
 * Main class for handling message processing and routing
 */
export class MessageHandler extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            maxQueueSize: config.maxQueueSize || 1000,
            retryAttempts: config.retryAttempts || 3,
            retryDelay: config.retryDelay || 1000,
            messageTimeout: config.messageTimeout || 30000,
            ...config
        };

        this.transformer = new MessageTransformer();
        this.sessionQueues = new Map();
        this.messageStore = new Map();
        this.activeStreams = new Map();
        
        this.setupEventHandlers();
    }

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        // Handle queue events
        this.on('queueEvent', (event) => {
            this.emit('message', {
                type: 'queue_event',
                ...event,
                timestamp: new Date().toISOString()
            });
        });
    }

    /**
     * Get or create message queue for session
     */
    getSessionQueue(sessionId) {
        if (!this.sessionQueues.has(sessionId)) {
            const queue = new MessageQueue({
                maxSize: this.config.maxQueueSize,
                retryAttempts: this.config.retryAttempts,
                retryDelay: this.config.retryDelay
            });

            // Override processMessage method
            queue.processMessage = async (message) => {
                return this.processSessionMessage(sessionId, message);
            };

            // Forward queue events
            queue.on('messageQueued', (msg) => this.emit('queueEvent', { sessionId, event: 'queued', message: msg }));
            queue.on('messageProcessing', (msg) => this.emit('queueEvent', { sessionId, event: 'processing', message: msg }));
            queue.on('messageCompleted', (msg) => this.emit('queueEvent', { sessionId, event: 'completed', message: msg }));
            queue.on('messageFailed', (msg) => this.emit('queueEvent', { sessionId, event: 'failed', message: msg }));
            queue.on('messageRetried', (msg) => this.emit('queueEvent', { sessionId, event: 'retried', message: msg }));

            this.sessionQueues.set(sessionId, queue);
        }

        return this.sessionQueues.get(sessionId);
    }

    /**
     * Send message to Claude Code
     */
    async sendMessage(sessionId, content, options = {}) {
        // Validate message
        const message = { content, type: options.type || 'message', ...options };
        const validation = this.transformer.validateMessage(message);
        
        if (!validation.valid) {
            throw new Error(`Invalid message: ${validation.errors.join(', ')}`);
        }

        // Transform message for terminal
        const transformedMessage = this.transformer.apiToTerminal(message, options);
        
        // Create message object
        const messageObj = {
            id: uuidv4(),
            sessionId,
            content: transformedMessage.content,
            originalContent: content,
            type: message.type,
            options,
            priority: options.priority || 0,
            timeout: options.timeout || this.config.messageTimeout,
            createdAt: new Date().toISOString()
        };

        // Store message
        this.messageStore.set(messageObj.id, messageObj);

        // Add to session queue
        const queue = this.getSessionQueue(sessionId);
        queue.enqueue(messageObj);

        this.emit('message', {
            type: 'message_queued',
            sessionId,
            messageId: messageObj.id,
            content: content,
            timestamp: new Date().toISOString()
        });

        return {
            messageId: messageObj.id,
            sessionId,
            status: 'queued',
            timestamp: messageObj.createdAt
        };
    }

    /**
     * Process message for specific session
     */
    async processSessionMessage(sessionId, message) {
        try {
            // Get Claude interface (this would be injected or imported)
            const claudeInterface = this.getClaudeInterface();
            
            // Send to Claude Code
            const result = await claudeInterface.sendMessage(sessionId, message.content, message.options);
            
            // Store result
            message.result = result;
            message.processedAt = new Date().toISOString();

            this.emit('message', {
                type: 'message_sent',
                sessionId,
                messageId: message.id,
                result,
                timestamp: new Date().toISOString()
            });

            return result;

        } catch (error) {
            console.error(`Error processing message ${message.id}:`, error);
            throw error;
        }
    }

    /**
     * Get Claude interface (placeholder - would be injected)
     */
    getClaudeInterface() {
        // This would be injected or imported from the main server
        throw new Error('Claude interface not available');
    }

    /**
     * Get messages for a session
     */
    async getMessages(sessionId, options = {}) {
        const { limit = 50, offset = 0, type = null } = options;
        
        // Get messages from store
        const sessionMessages = Array.from(this.messageStore.values())
            .filter(msg => {
                if (msg.sessionId !== sessionId) return false;
                if (type && msg.type !== type) return false;
                return true;
            })
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
            .slice(offset, offset + limit);

        return sessionMessages.map(msg => ({
            id: msg.id,
            content: msg.originalContent || msg.content,
            type: msg.type,
            status: msg.status,
            createdAt: msg.createdAt,
            processedAt: msg.processedAt,
            result: msg.result,
            error: msg.error
        }));
    }

    /**
     * Handle terminal output from Claude Code
     */
    handleTerminalOutput(sessionId, terminalOutput) {
        try {
            // Transform terminal output to API format
            const apiResponse = this.transformer.terminalToApi(terminalOutput);
            
            // Emit message event
            this.emit('message', {
                type: 'claude_response',
                sessionId,
                ...apiResponse,
                timestamp: new Date().toISOString()
            });

            // Update any pending messages
            this.updatePendingMessages(sessionId, apiResponse);

            return apiResponse;

        } catch (error) {
            console.error('Error handling terminal output:', error);
            this.emit('message', {
                type: 'error',
                sessionId,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Update pending messages with response
     */
    updatePendingMessages(sessionId, response) {
        // Find pending messages for this session
        const pendingMessages = Array.from(this.messageStore.values())
            .filter(msg => 
                msg.sessionId === sessionId && 
                msg.status === 'processing'
            );

        // Update the most recent pending message
        if (pendingMessages.length > 0) {
            const latestMessage = pendingMessages[pendingMessages.length - 1];
            latestMessage.response = response;
            latestMessage.status = 'completed';
            latestMessage.completedAt = new Date().toISOString();
        }
    }

    /**
     * Create Server-Sent Events stream for session
     */
    createEventStream(sessionId, response) {
        const streamId = uuidv4();
        
        // Store stream reference
        this.activeStreams.set(streamId, {
            sessionId,
            response,
            createdAt: new Date().toISOString()
        });

        // Setup event listener for this session
        const eventHandler = (event) => {
            if (event.sessionId === sessionId) {
                try {
                    response.write(`data: ${JSON.stringify(event)}\n\n`);
                } catch (error) {
                    console.error('Error writing to SSE stream:', error);
                    this.closeEventStream(streamId);
                }
            }
        };

        this.on('message', eventHandler);

        // Cleanup on client disconnect
        response.on('close', () => {
            this.removeListener('message', eventHandler);
            this.activeStreams.delete(streamId);
        });

        return streamId;
    }

    /**
     * Close event stream
     */
    closeEventStream(streamId) {
        const stream = this.activeStreams.get(streamId);
        if (stream) {
            try {
                stream.response.end();
            } catch (error) {
                console.error('Error closing SSE stream:', error);
            }
            this.activeStreams.delete(streamId);
        }
    }

    /**
     * Get session statistics
     */
    getSessionStats(sessionId) {
        const queue = this.sessionQueues.get(sessionId);
        const messages = Array.from(this.messageStore.values())
            .filter(msg => msg.sessionId === sessionId);

        return {
            sessionId,
            queue: queue ? queue.getStats() : null,
            totalMessages: messages.length,
            completedMessages: messages.filter(m => m.status === 'completed').length,
            failedMessages: messages.filter(m => m.status === 'failed').length,
            pendingMessages: messages.filter(m => m.status === 'processing').length
        };
    }

    /**
     * Cleanup session data
     */
    cleanupSession(sessionId) {
        // Clear queue
        const queue = this.sessionQueues.get(sessionId);
        if (queue) {
            queue.clear();
            this.sessionQueues.delete(sessionId);
        }

        // Remove messages
        for (const [messageId, message] of this.messageStore) {
            if (message.sessionId === sessionId) {
                this.messageStore.delete(messageId);
            }
        }

        // Close active streams
        for (const [streamId, stream] of this.activeStreams) {
            if (stream.sessionId === sessionId) {
                this.closeEventStream(streamId);
            }
        }
    }

    /**
     * Get overall statistics
     */
    getStats() {
        const totalMessages = this.messageStore.size;
        const activeSessions = this.sessionQueues.size;
        const activeStreams = this.activeStreams.size;

        return {
            totalMessages,
            activeSessions,
            activeStreams,
            memoryUsage: process.memoryUsage()
        };
    }
}

