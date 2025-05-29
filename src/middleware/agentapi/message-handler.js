/**
 * Message Handler - Message processing and routing
 * Processes messages between different AI agents and manages communication flow
 */

import { EventEmitter } from 'events';
import { logger } from '../../utils/logger.js';
import { configManager } from '../../utils/config-manager.js';
import { sessionManager } from './session-manager.js';
import { claudeInterface } from './claude-interface.js';

class MessageHandler extends EventEmitter {
    constructor() {
        super();
        this.messageQueue = [];
        this.messageHistory = new Map();
        this.processors = new Map();
        this.isProcessing = false;
        this.maxHistorySize = 1000;
        this.maxQueueSize = 10000;
    }

    /**
     * Initialize the message handler
     */
    async initialize() {
        logger.info('Initializing message handler...');
        
        // Register default message processors
        this.registerDefaultProcessors();
        
        // Start message processing loop
        this.startProcessing();
        
        logger.info('Message handler initialized successfully');
    }

    /**
     * Register default message processors
     */
    registerDefaultProcessors() {
        // Claude Code processor
        this.registerProcessor('claude', async (message, sessionId, metadata) => {
            return await this.processClaudeMessage(message, sessionId, metadata);
        });

        // Codegen SDK processor
        this.registerProcessor('codegen', async (message, sessionId, metadata) => {
            return await this.processCodegenMessage(message, sessionId, metadata);
        });

        // System processor
        this.registerProcessor('system', async (message, sessionId, metadata) => {
            return await this.processSystemMessage(message, sessionId, metadata);
        });

        // Default processor
        this.registerProcessor('default', async (message, sessionId, metadata) => {
            return await this.processDefaultMessage(message, sessionId, metadata);
        });
    }

    /**
     * Register a message processor
     */
    registerProcessor(type, processor) {
        this.processors.set(type, processor);
        logger.debug(`Message processor registered: ${type}`);
    }

    /**
     * Process a message
     */
    async processMessage(sessionId, content, metadata = {}) {
        try {
            const messageId = this.generateMessageId();
            const message = {
                id: messageId,
                sessionId,
                content,
                metadata,
                timestamp: Date.now(),
                status: 'processing'
            };

            // Add to queue
            this.messageQueue.push(message);
            
            // Add to history
            this.addToHistory(sessionId, message);

            // Emit event
            this.emit('messageReceived', message);

            logger.debug(`Message queued: ${messageId}`, { sessionId });

            // Process immediately if not busy
            if (!this.isProcessing) {
                this.processQueue();
            }

            // Return a promise that resolves when the message is processed
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Message processing timeout'));
                }, 30000);

                const handleProcessed = (processedMessage) => {
                    if (processedMessage.id === messageId) {
                        clearTimeout(timeout);
                        this.removeListener('messageProcessed', handleProcessed);
                        this.removeListener('messageError', handleError);
                        resolve(processedMessage.response);
                    }
                };

                const handleError = (errorMessage) => {
                    if (errorMessage.id === messageId) {
                        clearTimeout(timeout);
                        this.removeListener('messageProcessed', handleProcessed);
                        this.removeListener('messageError', handleError);
                        reject(new Error(errorMessage.error));
                    }
                };

                this.on('messageProcessed', handleProcessed);
                this.on('messageError', handleError);
            });

        } catch (error) {
            logger.error('Error processing message:', error);
            throw error;
        }
    }

    /**
     * Process the message queue
     */
    async processQueue() {
        if (this.isProcessing || this.messageQueue.length === 0) {
            return;
        }

        this.isProcessing = true;

        try {
            while (this.messageQueue.length > 0) {
                const message = this.messageQueue.shift();
                await this.processQueuedMessage(message);
            }
        } catch (error) {
            logger.error('Error processing message queue:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Process a queued message
     */
    async processQueuedMessage(message) {
        try {
            message.status = 'processing';
            
            // Determine processor type
            const processorType = this.determineProcessorType(message);
            const processor = this.processors.get(processorType) || this.processors.get('default');

            if (!processor) {
                throw new Error(`No processor found for type: ${processorType}`);
            }

            // Process the message
            const response = await processor(message.content, message.sessionId, message.metadata);

            message.status = 'completed';
            message.response = response;
            message.completedAt = Date.now();

            // Update history
            this.updateHistory(message.sessionId, message);

            // Emit completion event
            this.emit('messageProcessed', message);

            logger.debug(`Message processed: ${message.id}`, { 
                sessionId: message.sessionId,
                processorType,
                duration: message.completedAt - message.timestamp
            });

        } catch (error) {
            message.status = 'error';
            message.error = error.message;
            message.errorAt = Date.now();

            // Update history
            this.updateHistory(message.sessionId, message);

            // Emit error event
            this.emit('messageError', message);

            logger.error(`Message processing error: ${message.id}`, error);
        }
    }

    /**
     * Determine processor type based on message content and metadata
     */
    determineProcessorType(message) {
        // Check metadata for explicit processor type
        if (message.metadata.processorType) {
            return message.metadata.processorType;
        }

        // Check session configuration
        const session = sessionManager.getSession(message.sessionId);
        if (session && session.agentType) {
            return session.agentType;
        }

        // Analyze message content for hints
        const content = message.content.toLowerCase();
        
        if (content.includes('claude') || content.includes('code')) {
            return 'claude';
        }
        
        if (content.includes('codegen') || content.includes('sdk')) {
            return 'codegen';
        }
        
        if (content.includes('system') || content.includes('status')) {
            return 'system';
        }

        return 'default';
    }

    /**
     * Process Claude Code messages
     */
    async processClaudeMessage(content, sessionId, metadata) {
        try {
            logger.debug('Processing Claude message', { sessionId });

            // Check if Claude interface is connected
            if (!claudeInterface.isConnected) {
                await claudeInterface.initialize();
            }

            // Send message to Claude Code
            const response = await claudeInterface.sendMessage(content, sessionId);

            return {
                type: 'claude_response',
                content: response,
                timestamp: Date.now(),
                metadata: {
                    processorType: 'claude',
                    sessionId
                }
            };

        } catch (error) {
            logger.error('Error processing Claude message:', error);
            throw error;
        }
    }

    /**
     * Process Codegen SDK messages
     */
    async processCodegenMessage(content, sessionId, metadata) {
        try {
            logger.debug('Processing Codegen message', { sessionId });

            // This would integrate with the Codegen SDK client
            // For now, return a placeholder response
            const response = {
                type: 'codegen_response',
                content: `Codegen SDK response to: ${content}`,
                timestamp: Date.now(),
                metadata: {
                    processorType: 'codegen',
                    sessionId
                }
            };

            return response;

        } catch (error) {
            logger.error('Error processing Codegen message:', error);
            throw error;
        }
    }

    /**
     * Process system messages
     */
    async processSystemMessage(content, sessionId, metadata) {
        try {
            logger.debug('Processing system message', { sessionId });

            const command = content.toLowerCase().trim();
            let response;

            switch (command) {
                case 'status':
                    response = await this.getSystemStatus();
                    break;
                case 'health':
                    response = await this.getHealthStatus();
                    break;
                case 'sessions':
                    response = await this.getSessionsStatus();
                    break;
                default:
                    response = {
                        error: `Unknown system command: ${command}`,
                        availableCommands: ['status', 'health', 'sessions']
                    };
            }

            return {
                type: 'system_response',
                content: response,
                timestamp: Date.now(),
                metadata: {
                    processorType: 'system',
                    sessionId
                }
            };

        } catch (error) {
            logger.error('Error processing system message:', error);
            throw error;
        }
    }

    /**
     * Process default messages
     */
    async processDefaultMessage(content, sessionId, metadata) {
        try {
            logger.debug('Processing default message', { sessionId });

            // Simple echo response for default processor
            const response = {
                type: 'default_response',
                content: `Received: ${content}`,
                timestamp: Date.now(),
                metadata: {
                    processorType: 'default',
                    sessionId,
                    originalContent: content
                }
            };

            return response;

        } catch (error) {
            logger.error('Error processing default message:', error);
            throw error;
        }
    }

    /**
     * Get system status
     */
    async getSystemStatus() {
        return {
            messageHandler: {
                queueSize: this.messageQueue.length,
                isProcessing: this.isProcessing,
                processorCount: this.processors.size,
                historySize: this.messageHistory.size
            },
            claudeInterface: await claudeInterface.getStatus(),
            sessionManager: sessionManager.getStatus()
        };
    }

    /**
     * Get health status
     */
    async getHealthStatus() {
        return {
            status: 'healthy',
            timestamp: Date.now(),
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage()
        };
    }

    /**
     * Get sessions status
     */
    async getSessionsStatus() {
        return sessionManager.getAllSessions();
    }

    /**
     * Get messages for a session
     */
    async getMessages(sessionId, options = {}) {
        const { limit = 50, offset = 0 } = options;
        const sessionHistory = this.messageHistory.get(sessionId) || [];
        
        return sessionHistory
            .slice(offset, offset + limit)
            .map(message => ({
                id: message.id,
                content: message.content,
                response: message.response,
                status: message.status,
                timestamp: message.timestamp,
                metadata: message.metadata
            }));
    }

    /**
     * Add message to history
     */
    addToHistory(sessionId, message) {
        if (!this.messageHistory.has(sessionId)) {
            this.messageHistory.set(sessionId, []);
        }

        const sessionHistory = this.messageHistory.get(sessionId);
        sessionHistory.push({ ...message });

        // Trim history if too large
        if (sessionHistory.length > this.maxHistorySize) {
            sessionHistory.splice(0, sessionHistory.length - this.maxHistorySize);
        }
    }

    /**
     * Update message in history
     */
    updateHistory(sessionId, message) {
        const sessionHistory = this.messageHistory.get(sessionId);
        if (sessionHistory) {
            const index = sessionHistory.findIndex(m => m.id === message.id);
            if (index !== -1) {
                sessionHistory[index] = { ...message };
            }
        }
    }

    /**
     * Start message processing
     */
    startProcessing() {
        const processInterval = configManager.get('messageHandler.processInterval', 1000);
        
        setInterval(() => {
            if (!this.isProcessing && this.messageQueue.length > 0) {
                this.processQueue();
            }
        }, processInterval);
    }

    /**
     * Generate unique message ID
     */
    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Clear message history for a session
     */
    clearHistory(sessionId) {
        this.messageHistory.delete(sessionId);
        logger.info(`Message history cleared for session: ${sessionId}`);
    }

    /**
     * Get handler status
     */
    getStatus() {
        return {
            queueSize: this.messageQueue.length,
            isProcessing: this.isProcessing,
            processorCount: this.processors.size,
            historySize: this.messageHistory.size,
            processors: Array.from(this.processors.keys())
        };
    }
}

export const messageHandler = new MessageHandler();
export default MessageHandler;

