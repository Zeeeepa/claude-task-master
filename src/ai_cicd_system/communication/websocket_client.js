/**
 * @fileoverview WebSocket Client
 * @description WebSocket communication client for real-time AgentAPI communication
 */

import { log } from '../utils/simple_logger.js';

/**
 * WebSocket Client - Handles real-time WebSocket communication
 */
export class WebSocketClient {
  constructor(config) {
    this.config = config;
    this.url = this._buildWebSocketUrl(config.agentApiUrl || 'ws://localhost:8000');
    this.reconnectAttempts = config.reconnectAttempts || 5;
    this.reconnectDelay = config.reconnectDelay || 1000;
    this.heartbeatInterval = config.heartbeatInterval || 30000;
    this.messageTimeout = config.messageTimeout || 30000;
    
    this.ws = null;
    this.isConnected = false;
    this.isReconnecting = false;
    this.reconnectCount = 0;
    this.heartbeatTimer = null;
    this.messageHandlers = new Map();
    this.pendingMessages = new Map();
    this.messageHistory = [];
    this.eventListeners = new Map();
    
    this.isInitialized = false;
  }

  /**
   * Initialize the WebSocket client
   */
  async initialize() {
    log('info', '🔄 Initializing WebSocket client...');
    
    try {
      await this.connect();
      this.setupEventHandlers();
      this.startHeartbeat();
      
      this.isInitialized = true;
      log('info', '✅ WebSocket client initialized');
      
    } catch (error) {
      log('error', `❌ Failed to initialize WebSocket client: ${error.message}`);
      throw error;
    }
  }

  /**
   * Connect to WebSocket server
   * @returns {Promise<void>}
   */
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        log('debug', `🔗 Connecting to WebSocket: ${this.url}`);
        
        this.ws = new WebSocket(this.url);
        
        this.ws.onopen = () => {
          this.isConnected = true;
          this.isReconnecting = false;
          this.reconnectCount = 0;
          
          log('info', '✅ WebSocket connected');
          this.emit('connected');
          resolve();
        };
        
        this.ws.onclose = (event) => {
          this.isConnected = false;
          log('warn', `🔌 WebSocket disconnected: ${event.code} - ${event.reason}`);
          
          this.emit('disconnected', { code: event.code, reason: event.reason });
          
          if (!this.isReconnecting && this.reconnectCount < this.reconnectAttempts) {
            this.attemptReconnect();
          }
        };
        
        this.ws.onerror = (error) => {
          log('error', `❌ WebSocket error: ${error.message || 'Unknown error'}`);
          this.emit('error', error);
          
          if (!this.isConnected) {
            reject(new Error(`WebSocket connection failed: ${error.message || 'Unknown error'}`));
          }
        };
        
        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
        
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    if (this.ws) {
      this.isReconnecting = false;
      this.ws.close(1000, 'Client disconnect');
    }
    
    this.stopHeartbeat();
    this.clearPendingMessages();
  }

  /**
   * Send message through WebSocket
   * @param {Object} data - Message data
   * @param {Object} options - Send options
   * @returns {Promise<Object>} Response data
   */
  async send(data, options = {}) {
    if (!this.isConnected) {
      throw new Error('WebSocket not connected');
    }
    
    const messageId = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const message = {
      id: messageId,
      type: options.type || 'request',
      payload: data,
      timestamp: new Date().toISOString(),
      ...options.metadata
    };
    
    log('debug', `📤 Sending WebSocket message: ${messageId}`);
    
    return new Promise((resolve, reject) => {
      // Set up response handler
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(messageId);
        reject(new Error(`WebSocket message timeout: ${messageId}`));
      }, options.timeout || this.messageTimeout);
      
      this.pendingMessages.set(messageId, {
        resolve,
        reject,
        timeout,
        sentAt: new Date()
      });
      
      try {
        this.ws.send(JSON.stringify(message));
        
        // Record message history
        this.messageHistory.push({
          id: messageId,
          type: 'sent',
          timestamp: new Date(),
          data: message
        });
        
      } catch (error) {
        clearTimeout(timeout);
        this.pendingMessages.delete(messageId);
        reject(error);
      }
    });
  }

  /**
   * Handle incoming WebSocket message
   * @param {string} rawData - Raw message data
   */
  handleMessage(rawData) {
    try {
      const message = JSON.parse(rawData);
      
      log('debug', `📥 Received WebSocket message: ${message.id || 'unknown'}`);
      
      // Record message history
      this.messageHistory.push({
        id: message.id || `recv_${Date.now()}`,
        type: 'received',
        timestamp: new Date(),
        data: message
      });
      
      // Handle response to pending message
      if (message.response_to && this.pendingMessages.has(message.response_to)) {
        const pending = this.pendingMessages.get(message.response_to);
        clearTimeout(pending.timeout);
        this.pendingMessages.delete(message.response_to);
        
        if (message.error) {
          pending.reject(new Error(message.error));
        } else {
          pending.resolve(message);
        }
        return;
      }
      
      // Handle different message types
      switch (message.type) {
        case 'heartbeat':
          this.handleHeartbeat(message);
          break;
        
        case 'notification':
          this.emit('notification', message);
          break;
        
        case 'request':
          this.handleRequest(message);
          break;
        
        default:
          this.emit('message', message);
          break;
      }
      
    } catch (error) {
      log('error', `❌ Failed to parse WebSocket message: ${error.message}`);
      this.emit('parse_error', { error, rawData });
    }
  }

  /**
   * Handle heartbeat message
   * @param {Object} message - Heartbeat message
   */
  handleHeartbeat(message) {
    // Respond to heartbeat
    if (this.isConnected) {
      this.ws.send(JSON.stringify({
        id: `heartbeat_response_${Date.now()}`,
        type: 'heartbeat_response',
        response_to: message.id,
        timestamp: new Date().toISOString()
      }));
    }
  }

  /**
   * Handle incoming request
   * @param {Object} message - Request message
   */
  async handleRequest(message) {
    const handler = this.messageHandlers.get(message.payload?.type);
    
    if (handler) {
      try {
        const response = await handler(message.payload, message);
        
        // Send response
        this.ws.send(JSON.stringify({
          id: `response_${Date.now()}`,
          type: 'response',
          response_to: message.id,
          payload: response,
          timestamp: new Date().toISOString()
        }));
        
      } catch (error) {
        // Send error response
        this.ws.send(JSON.stringify({
          id: `error_response_${Date.now()}`,
          type: 'response',
          response_to: message.id,
          error: error.message,
          timestamp: new Date().toISOString()
        }));
      }
    } else {
      log('warn', `🤷 No handler for message type: ${message.payload?.type}`);
    }
  }

  /**
   * Register message handler
   * @param {string} messageType - Message type to handle
   * @param {Function} handler - Handler function
   */
  onMessage(messageType, handler) {
    this.messageHandlers.set(messageType, handler);
    log('debug', `📝 Registered message handler: ${messageType}`);
  }

  /**
   * Remove message handler
   * @param {string} messageType - Message type
   */
  offMessage(messageType) {
    const removed = this.messageHandlers.delete(messageType);
    if (removed) {
      log('debug', `🗑️ Removed message handler: ${messageType}`);
    }
    return removed;
  }

  /**
   * Add event listener
   * @param {string} event - Event name
   * @param {Function} listener - Event listener
   */
  on(event, listener) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(listener);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} listener - Event listener
   */
  off(event, listener) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit event
   * @param {string} event - Event name
   * @param {any} data - Event data
   */
  emit(event, data) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          log('error', `❌ Event listener error: ${error.message}`);
        }
      });
    }
  }

  /**
   * Start heartbeat mechanism
   */
  startHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected) {
        this.ws.send(JSON.stringify({
          id: `heartbeat_${Date.now()}`,
          type: 'heartbeat',
          timestamp: new Date().toISOString()
        }));
      }
    }, this.heartbeatInterval);
    
    log('debug', '💓 Heartbeat started');
  }

  /**
   * Stop heartbeat mechanism
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      log('debug', '💔 Heartbeat stopped');
    }
  }

  /**
   * Attempt to reconnect
   */
  async attemptReconnect() {
    if (this.isReconnecting || this.reconnectCount >= this.reconnectAttempts) {
      return;
    }
    
    this.isReconnecting = true;
    this.reconnectCount++;
    
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectCount - 1);
    
    log('info', `🔄 Attempting WebSocket reconnect ${this.reconnectCount}/${this.reconnectAttempts} in ${delay}ms`);
    
    setTimeout(async () => {
      try {
        await this.connect();
        log('info', '✅ WebSocket reconnected successfully');
      } catch (error) {
        log('error', `❌ WebSocket reconnect failed: ${error.message}`);
        this.isReconnecting = false;
        
        if (this.reconnectCount < this.reconnectAttempts) {
          this.attemptReconnect();
        } else {
          log('error', '💀 WebSocket reconnect attempts exhausted');
          this.emit('reconnect_failed');
        }
      }
    }, delay);
  }

  /**
   * Clear pending messages
   */
  clearPendingMessages() {
    for (const [messageId, pending] of this.pendingMessages) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('WebSocket disconnected'));
    }
    this.pendingMessages.clear();
  }

  /**
   * Setup default event handlers
   */
  setupEventHandlers() {
    this.on('connected', () => {
      log('debug', '🎉 WebSocket connection established');
    });
    
    this.on('disconnected', (data) => {
      log('debug', `👋 WebSocket connection closed: ${data.code}`);
    });
    
    this.on('error', (error) => {
      log('error', `💥 WebSocket error: ${error.message}`);
    });
  }

  /**
   * Get client statistics
   * @returns {Object} Client statistics
   */
  getStatistics() {
    const totalMessages = this.messageHistory.length;
    const sentMessages = this.messageHistory.filter(m => m.type === 'sent').length;
    const receivedMessages = this.messageHistory.filter(m => m.type === 'received').length;
    
    return {
      is_connected: this.isConnected,
      reconnect_count: this.reconnectCount,
      total_messages: totalMessages,
      sent_messages: sentMessages,
      received_messages: receivedMessages,
      pending_messages: this.pendingMessages.size,
      registered_handlers: this.messageHandlers.size,
      url: this.url
    };
  }

  /**
   * Get client health
   * @returns {Object} Health status
   */
  getHealth() {
    return {
      status: this.isInitialized && this.isConnected ? 'healthy' : 'unhealthy',
      is_connected: this.isConnected,
      is_reconnecting: this.isReconnecting,
      reconnect_attempts: `${this.reconnectCount}/${this.reconnectAttempts}`,
      pending_messages: this.pendingMessages.size,
      heartbeat_active: this.heartbeatTimer !== null
    };
  }

  /**
   * Shutdown the WebSocket client
   */
  async shutdown() {
    log('info', '🔄 Shutting down WebSocket client...');
    
    this.stopHeartbeat();
    this.disconnect();
    this.clearPendingMessages();
    
    // Clear handlers and listeners
    this.messageHandlers.clear();
    this.eventListeners.clear();
    this.messageHistory = [];
    
    this.isInitialized = false;
    
    log('info', '✅ WebSocket client shutdown complete');
  }

  /**
   * Build WebSocket URL from HTTP URL
   * @param {string} httpUrl - HTTP URL
   * @returns {string} WebSocket URL
   * @private
   */
  _buildWebSocketUrl(httpUrl) {
    if (httpUrl.startsWith('ws://') || httpUrl.startsWith('wss://')) {
      return httpUrl;
    }
    
    const url = new URL(httpUrl);
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    
    return `${protocol}//${url.host}/ws`;
  }
}

export default WebSocketClient;

