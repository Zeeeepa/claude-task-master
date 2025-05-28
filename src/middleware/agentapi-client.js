/**
 * AgentAPI HTTP Client
 * 
 * Comprehensive HTTP client for AgentAPI communication with support for all endpoints,
 * real-time event streaming, connection management, and automatic error recovery.
 */

import axios from 'axios';
import EventSource from 'eventsource';
import { EventEmitter } from 'events';
import { setTimeout, clearTimeout } from 'timers';

export class AgentAPIClient extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      baseUrl: config.baseUrl || 'http://localhost:3284',
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      healthCheckInterval: config.healthCheckInterval || 30000,
      reconnectDelay: config.reconnectDelay || 5000,
      maxReconnectAttempts: config.maxReconnectAttempts || 10,
      enableEventStream: config.enableEventStream !== false,
      ...config
    };

    this.httpClient = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Claude-Task-Master-AgentAPI-Client/1.0.0'
      }
    });

    this.isConnected = false;
    this.eventSource = null;
    this.reconnectAttempts = 0;
    this.healthCheckTimer = null;
    this.reconnectTimer = null;
    this.lastActivity = Date.now();

    this._setupInterceptors();
    this._startHealthCheck();
  }

  /**
   * Setup HTTP client interceptors for logging and error handling
   */
  _setupInterceptors() {
    // Request interceptor
    this.httpClient.interceptors.request.use(
      (config) => {
        this.lastActivity = Date.now();
        this.emit('request', { method: config.method, url: config.url });
        return config;
      },
      (error) => {
        this.emit('error', { type: 'request', error });
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.httpClient.interceptors.response.use(
      (response) => {
        this.lastActivity = Date.now();
        this.emit('response', { 
          status: response.status, 
          url: response.config.url,
          duration: Date.now() - this.lastActivity
        });
        return response;
      },
      (error) => {
        this.emit('error', { type: 'response', error });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Start periodic health checks
   */
  _startHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      try {
        await this.getStatus();
        if (!this.isConnected) {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.emit('connected');
        }
      } catch (error) {
        if (this.isConnected) {
          this.isConnected = false;
          this.emit('disconnected', error);
          this._attemptReconnect();
        }
      }
    }, this.config.healthCheckInterval);
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  _attemptReconnect() {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.emit('reconnectFailed', { 
        attempts: this.reconnectAttempts,
        maxAttempts: this.config.maxReconnectAttempts
      });
      return;
    }

    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    this.emit('reconnecting', { 
      attempt: this.reconnectAttempts,
      delay,
      maxAttempts: this.config.maxReconnectAttempts
    });

    this.reconnectTimer = setTimeout(() => {
      this._startHealthCheck();
    }, delay);
  }

  /**
   * Initialize the client and establish connections
   */
  async initialize() {
    try {
      // Test initial connection
      await this.getStatus();
      this.isConnected = true;
      
      // Start event stream if enabled
      if (this.config.enableEventStream) {
        await this.startEventStream();
      }

      this.emit('initialized');
      return true;
    } catch (error) {
      this.emit('error', { type: 'initialization', error });
      throw error;
    }
  }

  /**
   * Send a message to the agent
   * @param {Object} message - Message object with content and type
   * @returns {Promise<Object>} Response from the agent
   */
  async sendMessage(message) {
    const payload = {
      content: message.content,
      type: message.type || 'user',
      timestamp: new Date().toISOString(),
      ...message
    };

    return this._retryRequest(async () => {
      const response = await this.httpClient.post('/message', payload);
      this.emit('messageSent', { message: payload, response: response.data });
      return response.data;
    });
  }

  /**
   * Get all messages in the conversation
   * @returns {Promise<Array>} Array of messages
   */
  async getMessages() {
    return this._retryRequest(async () => {
      const response = await this.httpClient.get('/messages');
      this.emit('messagesRetrieved', { count: response.data.length });
      return response.data;
    });
  }

  /**
   * Get the current status of the agent
   * @returns {Promise<Object>} Status object
   */
  async getStatus() {
    return this._retryRequest(async () => {
      const response = await this.httpClient.get('/status');
      this.emit('statusRetrieved', response.data);
      return response.data;
    });
  }

  /**
   * Start the event stream for real-time updates
   * @returns {Promise<void>}
   */
  async startEventStream() {
    if (this.eventSource) {
      this.stopEventStream();
    }

    return new Promise((resolve, reject) => {
      try {
        this.eventSource = new EventSource(`${this.config.baseUrl}/events`);

        this.eventSource.onopen = () => {
          this.emit('eventStreamConnected');
          resolve();
        };

        this.eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.emit('event', data);
            
            // Handle specific event types
            if (data.type === 'message') {
              this.emit('messageReceived', data);
            } else if (data.type === 'status') {
              this.emit('statusChanged', data);
            }
          } catch (error) {
            this.emit('error', { type: 'eventParsing', error, rawData: event.data });
          }
        };

        this.eventSource.onerror = (error) => {
          this.emit('eventStreamError', error);
          
          // Attempt to reconnect after a delay
          setTimeout(() => {
            if (this.eventSource && this.eventSource.readyState === EventSource.CLOSED) {
              this.startEventStream().catch(err => {
                this.emit('error', { type: 'eventStreamReconnect', error: err });
              });
            }
          }, this.config.reconnectDelay);
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the event stream
   */
  stopEventStream() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.emit('eventStreamDisconnected');
    }
  }

  /**
   * Execute a request with retry logic
   * @param {Function} requestFn - Function that returns a promise
   * @returns {Promise} Result of the request
   */
  async _retryRequest(requestFn) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;
        
        // Don't retry on client errors (4xx)
        if (error.response && error.response.status >= 400 && error.response.status < 500) {
          throw error;
        }

        if (attempt < this.config.retryAttempts) {
          const delay = this.config.retryDelay * attempt;
          this.emit('retrying', { attempt, delay, error });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Send a command to start a Claude Code instance
   * @param {Object} options - Configuration options for Claude Code
   * @returns {Promise<Object>} Response from starting the instance
   */
  async startClaudeCode(options = {}) {
    const command = {
      action: 'start',
      agent: 'claude',
      options: {
        allowedTools: options.allowedTools || ['Bash(git*)', 'Edit', 'Replace'],
        workingDirectory: options.workingDirectory || process.cwd(),
        ...options
      }
    };

    return this.sendMessage({
      content: JSON.stringify(command),
      type: 'system'
    });
  }

  /**
   * Send a command to stop a Claude Code instance
   * @returns {Promise<Object>} Response from stopping the instance
   */
  async stopClaudeCode() {
    const command = {
      action: 'stop',
      agent: 'claude'
    };

    return this.sendMessage({
      content: JSON.stringify(command),
      type: 'system'
    });
  }

  /**
   * Send natural language instructions to Claude Code
   * @param {string} instruction - Natural language instruction
   * @param {Object} context - Additional context for the instruction
   * @returns {Promise<Object>} Response from Claude Code
   */
  async sendInstruction(instruction, context = {}) {
    const message = {
      content: instruction,
      type: 'user',
      context: {
        timestamp: new Date().toISOString(),
        source: 'claude-task-master',
        ...context
      }
    };

    return this.sendMessage(message);
  }

  /**
   * Get connection health information
   * @returns {Object} Health information
   */
  getHealthInfo() {
    return {
      isConnected: this.isConnected,
      lastActivity: this.lastActivity,
      reconnectAttempts: this.reconnectAttempts,
      eventStreamActive: this.eventSource && this.eventSource.readyState === EventSource.OPEN,
      uptime: Date.now() - this.lastActivity
    };
  }

  /**
   * Cleanup and disconnect
   */
  async disconnect() {
    // Clear timers
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Stop event stream
    this.stopEventStream();

    // Mark as disconnected
    this.isConnected = false;
    this.emit('disconnected');
  }

  /**
   * Get client statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      lastActivity: this.lastActivity,
      eventStreamActive: this.eventSource && this.eventSource.readyState === EventSource.OPEN,
      config: {
        baseUrl: this.config.baseUrl,
        timeout: this.config.timeout,
        retryAttempts: this.config.retryAttempts,
        healthCheckInterval: this.config.healthCheckInterval
      }
    };
  }
}

export default AgentAPIClient;

