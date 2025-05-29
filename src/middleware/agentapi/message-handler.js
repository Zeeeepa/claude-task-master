import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

/**
 * Message Handler
 * Manages message routing, dispatching, and coordination between components
 */
export class MessageHandler extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.claudeInterface = options.claudeInterface;
    this.sessionManager = options.sessionManager;
    this.messageQueue = options.messageQueue;
    this.messageProcessor = options.messageProcessor;
    
    // Configuration
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.messageTimeout = options.messageTimeout || 30000;
    
    // Message tracking
    this.pendingMessages = new Map();
    this.messageHistory = new Map();
    
    // Priority levels
    this.priorityLevels = {
      'critical': 1,
      'high': 2,
      'normal': 3,
      'low': 4
    };
    
    this.setupEventHandlers();
  }

  /**
   * Setup event handlers for component communication
   */
  setupEventHandlers() {
    // Listen to Claude interface events
    if (this.claudeInterface) {
      this.claudeInterface.on('message_sent', (data) => {
        this.handleClaudeResponse(data);
      });
      
      this.claudeInterface.on('message_failed', (data) => {
        this.handleClaudeError(data);
      });
      
      this.claudeInterface.on('health_check', (data) => {
        this.emit('claude_health', data);
      });
    }
    
    // Listen to message processor events
    if (this.messageProcessor) {
      this.messageProcessor.on('message_processed', (data) => {
        this.handleProcessedMessage(data);
      });
      
      this.messageProcessor.on('processing_error', (data) => {
        this.handleProcessingError(data);
      });
    }
    
    // Listen to session manager events
    if (this.sessionManager) {
      this.sessionManager.on('session_expired', (data) => {
        this.handleSessionExpired(data);
      });
    }
  }

  /**
   * Send message through the system
   */
  async sendMessage(options) {
    const {
      content,
      sessionId,
      priority = 'normal',
      requestId,
      metadata = {}
    } = options;
    
    try {
      // Validate input
      if (!content || typeof content !== 'string') {
        throw new Error('Message content is required and must be a string');
      }
      
      // Generate message ID
      const messageId = uuidv4();
      
      // Ensure session exists
      let session;
      if (sessionId) {
        session = await this.sessionManager.getSession(sessionId);
        if (!session) {
          throw new Error(`Session ${sessionId} not found`);
        }
      } else {
        session = await this.sessionManager.createSession({
          source: 'message_handler',
          createdBy: 'auto'
        });
      }
      
      // Create message object
      const message = {
        id: messageId,
        content,
        sessionId: session.id,
        priority,
        requestId,
        metadata: {
          ...metadata,
          createdAt: new Date().toISOString(),
          source: 'message_handler'
        },
        status: 'pending',
        retryCount: 0
      };
      
      // Track pending message
      this.pendingMessages.set(messageId, message);
      
      // Add to message queue
      await this.messageQueue.enqueue(message, this.priorityLevels[priority] || 3);
      
      // Process message
      await this.processMessage(message);
      
      // Emit event
      this.emit('message', {
        type: 'message_queued',
        messageId,
        sessionId: session.id,
        timestamp: new Date().toISOString()
      });
      
      return {
        messageId,
        sessionId: session.id,
        status: 'queued'
      };
    } catch (error) {
      console.error('[MessageHandler] Send message error:', error);
      
      this.emit('error', {
        type: 'send_message_error',
        error: error.message,
        options,
        timestamp: new Date().toISOString()
      });
      
      throw error;
    }
  }

  /**
   * Process a message
   */
  async processMessage(message) {
    try {
      // Update message status
      message.status = 'processing';
      message.processingStartedAt = new Date().toISOString();
      
      // Emit processing event
      this.emit('message', {
        type: 'message_processing',
        messageId: message.id,
        sessionId: message.sessionId,
        timestamp: new Date().toISOString()
      });
      
      // Send to Claude Code
      const response = await this.claudeInterface.sendMessage(
        message.content,
        message.sessionId,
        {
          messageId: message.id,
          priority: message.priority,
          requestId: message.requestId,
          metadata: message.metadata
        }
      );
      
      // Update message with response
      message.status = 'completed';
      message.response = response;
      message.completedAt = new Date().toISOString();
      
      // Store in history
      this.messageHistory.set(message.id, message);
      
      // Remove from pending
      this.pendingMessages.delete(message.id);
      
      // Emit completion event
      this.emit('response', {
        type: 'message_completed',
        messageId: message.id,
        sessionId: message.sessionId,
        response,
        timestamp: new Date().toISOString()
      });
      
      return response;
    } catch (error) {
      console.error('[MessageHandler] Process message error:', error);
      await this.handleMessageError(message, error);
      throw error;
    }
  }

  /**
   * Handle message processing error
   */
  async handleMessageError(message, error) {
    message.retryCount = (message.retryCount || 0) + 1;
    message.lastError = error.message;
    message.lastErrorAt = new Date().toISOString();
    
    if (message.retryCount < this.maxRetries) {
      // Retry message
      console.log(`[MessageHandler] Retrying message ${message.id} (attempt ${message.retryCount + 1})`);
      
      // Wait before retry
      await this.sleep(this.retryDelay * Math.pow(2, message.retryCount - 1));
      
      // Re-queue message
      await this.messageQueue.enqueue(message, this.priorityLevels[message.priority] || 3);
      
      this.emit('message', {
        type: 'message_retry',
        messageId: message.id,
        sessionId: message.sessionId,
        retryCount: message.retryCount,
        timestamp: new Date().toISOString()
      });
    } else {
      // Max retries reached
      message.status = 'failed';
      message.failedAt = new Date().toISOString();
      
      // Store in history
      this.messageHistory.set(message.id, message);
      
      // Remove from pending
      this.pendingMessages.delete(message.id);
      
      this.emit('error', {
        type: 'message_failed',
        messageId: message.id,
        sessionId: message.sessionId,
        error: error.message,
        retryCount: message.retryCount,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get messages for a session
   */
  async getMessages(sessionId, options = {}) {
    try {
      const { limit = 50, offset = 0, includeMetadata = false } = options;
      
      // Get messages from history
      const sessionMessages = Array.from(this.messageHistory.values())
        .filter(msg => msg.sessionId === sessionId)
        .sort((a, b) => new Date(b.metadata.createdAt) - new Date(a.metadata.createdAt))
        .slice(offset, offset + limit);
      
      // Format messages
      const formattedMessages = sessionMessages.map(msg => ({
        id: msg.id,
        content: msg.content,
        response: msg.response,
        status: msg.status,
        priority: msg.priority,
        createdAt: msg.metadata.createdAt,
        completedAt: msg.completedAt,
        ...(includeMetadata && { metadata: msg.metadata })
      }));
      
      // Also try to get from Claude Code if available
      if (this.claudeInterface) {
        try {
          const claudeHistory = await this.claudeInterface.getConversationHistory(sessionId, options);
          
          // Merge with local history (avoiding duplicates)
          const existingIds = new Set(formattedMessages.map(msg => msg.id));
          const claudeMessages = claudeHistory.messages
            .filter(msg => !existingIds.has(msg.messageId))
            .map(msg => ({
              id: msg.messageId,
              content: msg.content,
              status: 'completed',
              createdAt: msg.timestamp,
              source: 'claude_code',
              ...(includeMetadata && { metadata: msg.metadata })
            }));
          
          formattedMessages.push(...claudeMessages);
        } catch (error) {
          console.warn('[MessageHandler] Failed to get Claude history:', error.message);
        }
      }
      
      return formattedMessages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
      console.error('[MessageHandler] Get messages error:', error);
      throw error;
    }
  }

  /**
   * Get message by ID
   */
  getMessage(messageId) {
    return this.messageHistory.get(messageId) || this.pendingMessages.get(messageId);
  }

  /**
   * Get pending messages
   */
  getPendingMessages() {
    return Array.from(this.pendingMessages.values());
  }

  /**
   * Get message statistics
   */
  getStats() {
    const pending = this.pendingMessages.size;
    const completed = Array.from(this.messageHistory.values()).filter(msg => msg.status === 'completed').length;
    const failed = Array.from(this.messageHistory.values()).filter(msg => msg.status === 'failed').length;
    
    return {
      pending,
      completed,
      failed,
      total: pending + completed + failed,
      queueSize: this.messageQueue ? this.messageQueue.size() : 0,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Handle Claude response
   */
  handleClaudeResponse(data) {
    const message = this.pendingMessages.get(data.messageId);
    if (message) {
      message.status = 'completed';
      message.response = data.response;
      message.completedAt = new Date().toISOString();
      
      this.messageHistory.set(message.id, message);
      this.pendingMessages.delete(message.id);
      
      this.emit('response', {
        type: 'claude_response',
        messageId: message.id,
        sessionId: message.sessionId,
        response: data.response,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle Claude error
   */
  handleClaudeError(data) {
    const message = this.pendingMessages.get(data.messageId);
    if (message) {
      this.handleMessageError(message, new Error(data.error));
    }
  }

  /**
   * Handle processed message
   */
  handleProcessedMessage(data) {
    this.emit('message', {
      type: 'message_processed',
      ...data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle processing error
   */
  handleProcessingError(data) {
    this.emit('error', {
      type: 'processing_error',
      ...data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle session expired
   */
  handleSessionExpired(data) {
    // Clean up messages for expired session
    const expiredMessages = Array.from(this.pendingMessages.values())
      .filter(msg => msg.sessionId === data.sessionId);
    
    for (const message of expiredMessages) {
      message.status = 'failed';
      message.failedAt = new Date().toISOString();
      message.lastError = 'Session expired';
      
      this.messageHistory.set(message.id, message);
      this.pendingMessages.delete(message.id);
    }
    
    this.emit('error', {
      type: 'session_expired',
      sessionId: data.sessionId,
      affectedMessages: expiredMessages.length,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Cancel message
   */
  async cancelMessage(messageId) {
    const message = this.pendingMessages.get(messageId);
    if (!message) {
      throw new Error(`Message ${messageId} not found or already processed`);
    }
    
    message.status = 'cancelled';
    message.cancelledAt = new Date().toISOString();
    
    this.messageHistory.set(messageId, message);
    this.pendingMessages.delete(messageId);
    
    // Remove from queue if possible
    if (this.messageQueue) {
      await this.messageQueue.remove(messageId);
    }
    
    this.emit('message', {
      type: 'message_cancelled',
      messageId,
      sessionId: message.sessionId,
      timestamp: new Date().toISOString()
    });
    
    return { success: true, messageId };
  }

  /**
   * Clear message history
   */
  clearHistory(sessionId = null) {
    if (sessionId) {
      // Clear history for specific session
      for (const [messageId, message] of this.messageHistory.entries()) {
        if (message.sessionId === sessionId) {
          this.messageHistory.delete(messageId);
        }
      }
    } else {
      // Clear all history
      this.messageHistory.clear();
    }
    
    this.emit('message', {
      type: 'history_cleared',
      sessionId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.removeAllListeners();
    this.pendingMessages.clear();
    this.messageHistory.clear();
  }
}

export default MessageHandler;

