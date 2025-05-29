/**
 * WebSocket Client for AgentAPI Communication
 * 
 * Provides real-time communication capabilities with the AgentAPI
 * middleware for status updates and event notifications.
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { SimpleLogger } from '../ai_cicd_system/utils/simple_logger.js';

export class WebSocketClient extends EventEmitter {
  constructor(url, options = {}) {
    super();
    
    this.url = url;
    this.options = {
      apiKey: options.apiKey,
      reconnectInterval: options.reconnectInterval || 5000,
      maxReconnectAttempts: options.maxReconnectAttempts || 10,
      pingInterval: options.pingInterval || 30000,
      pongTimeout: options.pongTimeout || 5000,
      ...options
    };

    this.logger = options.logger || new SimpleLogger('WebSocketClient');
    
    this.ws = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.subscriptions = new Map();
    this.messageQueue = [];
    this.pingInterval = null;
    this.pongTimeout = null;
    this.lastPong = null;
  }

  /**
   * Connect to the WebSocket server
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.isConnected || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    
    return new Promise((resolve, reject) => {
      try {
        this.logger.info(`Connecting to WebSocket: ${this.url}`);
        
        this.ws = new WebSocket(this.url);
        
        this.ws.on('open', () => {
          this.isConnected = true;
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          
          this.logger.info('WebSocket connected successfully');
          
          // Authenticate if API key is provided
          if (this.options.apiKey) {
            this._authenticate();
          }
          
          // Start ping/pong mechanism
          this._startHeartbeat();
          
          // Process queued messages
          this._processMessageQueue();
          
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data) => {
          this._handleMessage(data);
        });

        this.ws.on('close', (code, reason) => {
          this._handleClose(code, reason);
        });

        this.ws.on('error', (error) => {
          this.logger.error('WebSocket error:', error);
          this.emit('error', error);
          
          if (this.isConnecting) {
            this.isConnecting = false;
            reject(error);
          }
        });

        this.ws.on('pong', () => {
          this.lastPong = Date.now();
          if (this.pongTimeout) {
            clearTimeout(this.pongTimeout);
            this.pongTimeout = null;
          }
        });

      } catch (error) {
        this.isConnecting = false;
        this.logger.error('Failed to create WebSocket connection:', error);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the WebSocket server
   * @returns {Promise<void>}
   */
  async close() {
    if (!this.ws || !this.isConnected) {
      return;
    }

    return new Promise((resolve) => {
      this._stopHeartbeat();
      
      this.ws.once('close', () => {
        this.isConnected = false;
        this.ws = null;
        this.logger.info('WebSocket disconnected');
        resolve();
      });

      this.ws.close(1000, 'Client disconnect');
    });
  }

  /**
   * Send a message to the server
   * @param {Object} message - Message to send
   * @returns {Promise<void>}
   */
  async send(message) {
    if (!this.isConnected) {
      // Queue message for later sending
      this.messageQueue.push(message);
      this.logger.debug('Message queued (not connected)', { messageType: message.type });
      return;
    }

    try {
      const messageStr = JSON.stringify(message);
      this.ws.send(messageStr);
      
      this.logger.debug('Message sent', { 
        messageType: message.type,
        messageId: message.id 
      });
    } catch (error) {
      this.logger.error('Failed to send message:', error);
      throw error;
    }
  }

  /**
   * Subscribe to a channel for real-time updates
   * @param {string} channel - Channel name
   * @param {Function} callback - Callback for messages
   * @returns {Promise<void>}
   */
  async subscribe(channel, callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }

    // Store subscription
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    this.subscriptions.get(channel).add(callback);

    // Send subscription message
    await this.send({
      type: 'subscribe',
      channel,
      timestamp: new Date().toISOString()
    });

    this.logger.info(`Subscribed to channel: ${channel}`);
  }

  /**
   * Unsubscribe from a channel
   * @param {string} channel - Channel name
   * @param {Function} callback - Specific callback to remove (optional)
   * @returns {Promise<void>}
   */
  async unsubscribe(channel, callback = null) {
    const channelSubscriptions = this.subscriptions.get(channel);
    if (!channelSubscriptions) {
      return;
    }

    if (callback) {
      // Remove specific callback
      channelSubscriptions.delete(callback);
      if (channelSubscriptions.size === 0) {
        this.subscriptions.delete(channel);
      }
    } else {
      // Remove all callbacks for channel
      this.subscriptions.delete(channel);
    }

    // Send unsubscription message if no more callbacks
    if (!this.subscriptions.has(channel)) {
      await this.send({
        type: 'unsubscribe',
        channel,
        timestamp: new Date().toISOString()
      });

      this.logger.info(`Unsubscribed from channel: ${channel}`);
    }
  }

  /**
   * Check if connected
   * @returns {boolean} Connection status
   */
  isConnected() {
    return this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection statistics
   * @returns {Object} Connection stats
   */
  getStats() {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      subscriptions: Array.from(this.subscriptions.keys()),
      queuedMessages: this.messageQueue.length,
      lastPong: this.lastPong,
      uptime: this.isConnected ? Date.now() - (this.lastPong || Date.now()) : 0
    };
  }

  /**
   * Authenticate with the server
   */
  async _authenticate() {
    try {
      await this.send({
        type: 'auth',
        token: this.options.apiKey,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Authentication failed:', error);
    }
  }

  /**
   * Handle incoming messages
   * @param {Buffer|string} data - Raw message data
   */
  _handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      
      this.logger.debug('Message received', { 
        messageType: message.type,
        channel: message.channel 
      });

      switch (message.type) {
        case 'auth_success':
          this.logger.info('WebSocket authentication successful');
          this.emit('authenticated');
          break;

        case 'auth_error':
          this.logger.error('WebSocket authentication failed:', message.message);
          this.emit('authError', message.message);
          break;

        case 'subscribed':
          this.logger.debug(`Subscription confirmed: ${message.channel}`);
          this.emit('subscribed', message.channel);
          break;

        case 'unsubscribed':
          this.logger.debug(`Unsubscription confirmed: ${message.channel}`);
          this.emit('unsubscribed', message.channel);
          break;

        case 'pong':
          // Handled by pong event listener
          break;

        case 'error':
          this.logger.error('Server error:', message.message);
          this.emit('serverError', message);
          break;

        default:
          // Handle channel messages
          if (message.channel) {
            this._handleChannelMessage(message);
          } else {
            this.logger.warn('Unknown message type:', message.type);
            this.emit('unknownMessage', message);
          }
      }
    } catch (error) {
      this.logger.error('Failed to parse message:', error);
      this.emit('parseError', error);
    }
  }

  /**
   * Handle channel-specific messages
   * @param {Object} message - Channel message
   */
  _handleChannelMessage(message) {
    const channelSubscriptions = this.subscriptions.get(message.channel);
    if (!channelSubscriptions) {
      this.logger.debug(`No subscriptions for channel: ${message.channel}`);
      return;
    }

    // Call all callbacks for this channel
    for (const callback of channelSubscriptions) {
      try {
        callback(message);
      } catch (error) {
        this.logger.error(`Callback error for channel ${message.channel}:`, error);
      }
    }

    // Emit generic channel event
    this.emit('channelMessage', message);
  }

  /**
   * Handle connection close
   * @param {number} code - Close code
   * @param {string} reason - Close reason
   */
  _handleClose(code, reason) {
    this.isConnected = false;
    this.isConnecting = false;
    this._stopHeartbeat();

    this.logger.info(`WebSocket closed: ${code} - ${reason}`);
    this.emit('disconnected', { code, reason });

    // Attempt reconnection if not a normal close
    if (code !== 1000 && this.reconnectAttempts < this.options.maxReconnectAttempts) {
      this._scheduleReconnect();
    }
  }

  /**
   * Schedule reconnection attempt
   */
  _scheduleReconnect() {
    this.reconnectAttempts++;
    const delay = this.options.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1);
    
    this.logger.info(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);
    
    setTimeout(async () => {
      try {
        await this.connect();
        
        // Resubscribe to all channels
        for (const channel of this.subscriptions.keys()) {
          await this.send({
            type: 'subscribe',
            channel,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        this.logger.error('Reconnection failed:', error);
      }
    }, delay);
  }

  /**
   * Process queued messages
   */
  _processMessageQueue() {
    while (this.messageQueue.length > 0 && this.isConnected) {
      const message = this.messageQueue.shift();
      this.send(message).catch(error => {
        this.logger.error('Failed to send queued message:', error);
      });
    }
  }

  /**
   * Start heartbeat mechanism
   */
  _startHeartbeat() {
    this._stopHeartbeat();
    
    this.pingInterval = setInterval(() => {
      if (this.isConnected && this.ws) {
        // Set pong timeout
        this.pongTimeout = setTimeout(() => {
          this.logger.warn('Pong timeout, closing connection');
          this.ws.close(1002, 'Pong timeout');
        }, this.options.pongTimeout);

        // Send ping
        this.ws.ping();
        this.logger.debug('Ping sent');
      }
    }, this.options.pingInterval);
  }

  /**
   * Stop heartbeat mechanism
   */
  _stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }
}

export default WebSocketClient;

