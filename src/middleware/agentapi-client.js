/**
 * AgentAPI Client
 * 
 * Unified HTTP client for AgentAPI communication with comprehensive features:
 * - All AgentAPI endpoints support
 * - Real-time event streaming with SSE
 * - Connection management and health monitoring
 * - Error handling with retry logic and exponential backoff
 * - Authentication and request/response transformation
 */

import axios from 'axios';
import { EventEmitter } from 'events';
import EventSource from 'eventsource';

export class AgentAPIClient extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      baseUrl: 'http://localhost:3284',
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      enableEventStream: true,
      healthCheckInterval: 30000,
      reconnectDelay: 5000,
      maxReconnectAttempts: 10,
      ...config
    };
    
    this.httpClient = null;
    this.eventSource = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.healthCheckTimer = null;
    
    this.setupHttpClient();
  }

  /**
   * Setup HTTP client with interceptors
   */
  setupHttpClient() {
    this.httpClient = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AgentAPI-Middleware/1.0.0'
      }
    });

    // Request interceptor
    this.httpClient.interceptors.request.use(
      (config) => {
        console.log(`AgentAPI Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('AgentAPI Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.httpClient.interceptors.response.use(
      (response) => {
        console.log(`AgentAPI Response: ${response.status} ${response.config.url}`);
        return response;
      },
      async (error) => {
        console.error('AgentAPI Response Error:', error.response?.status, error.message);
        
        // Retry logic for specific errors
        if (this.shouldRetry(error) && error.config && !error.config._retry) {
          error.config._retry = true;
          await this.delay(this.config.retryDelay);
          return this.httpClient.request(error.config);
        }
        
        return Promise.reject(error);
      }
    );
  }

  /**
   * Initialize the client
   */
  async initialize() {
    try {
      console.log('Initializing AgentAPI Client...');
      
      // Test connection
      await this.checkHealth();
      
      // Setup event stream if enabled
      if (this.config.enableEventStream) {
        await this.setupEventStream();
      }
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      this.isConnected = true;
      console.log('AgentAPI Client initialized successfully');
      this.emit('connected');
      
    } catch (error) {
      console.error('Failed to initialize AgentAPI Client:', error);
      throw error;
    }
  }

  /**
   * Start the client
   */
  async start() {
    if (!this.isConnected) {
      await this.initialize();
    }
  }

  /**
   * Stop the client
   */
  async stop() {
    console.log('Stopping AgentAPI Client...');
    
    // Stop health monitoring
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    
    // Close event stream
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    this.isConnected = false;
    this.emit('disconnected');
    console.log('AgentAPI Client stopped');
  }

  /**
   * Send message to AgentAPI
   */
  async sendMessage(message, options = {}) {
    try {
      const messageData = {
        content: message.content || message,
        type: message.type || 'user',
        timestamp: new Date().toISOString(),
        ...options
      };

      const response = await this.httpClient.post('/message', messageData);
      
      this.emit('messageSent', { message: messageData, response: response.data });
      
      return {
        success: true,
        messageId: response.data.messageId,
        response: response.data
      };
      
    } catch (error) {
      console.error('Failed to send message:', error.message);
      throw new Error(`Message send failed: ${error.message}`);
    }
  }

  /**
   * Get conversation messages
   */
  async getMessages(options = {}) {
    try {
      const { limit = 50, offset = 0 } = options;
      
      const response = await this.httpClient.get('/messages', {
        params: { limit, offset }
      });

      return {
        success: true,
        messages: response.data.messages || response.data,
        total: response.data.total
      };
      
    } catch (error) {
      console.error('Failed to get messages:', error.message);
      throw new Error(`Get messages failed: ${error.message}`);
    }
  }

  /**
   * Get agent status
   */
  async getStatus() {
    try {
      const response = await this.httpClient.get('/status');
      
      return {
        success: true,
        status: response.data
      };
      
    } catch (error) {
      console.error('Failed to get status:', error.message);
      throw new Error(`Get status failed: ${error.message}`);
    }
  }

  /**
   * Check health of AgentAPI
   */
  async checkHealth() {
    try {
      const response = await this.httpClient.get('/health');
      return {
        available: true,
        status: response.data,
        responseTime: response.headers['x-response-time'] || 'unknown'
      };
    } catch (error) {
      console.error('AgentAPI health check failed:', error.message);
      return {
        available: false,
        error: error.message,
        status: error.response?.status || 'unknown'
      };
    }
  }

  /**
   * Setup Server-Sent Events stream
   */
  async setupEventStream() {
    try {
      const eventUrl = `${this.config.baseUrl}/events`;
      console.log(`Setting up event stream: ${eventUrl}`);
      
      this.eventSource = new EventSource(eventUrl);
      
      this.eventSource.onopen = () => {
        console.log('Event stream connected');
        this.reconnectAttempts = 0;
        this.emit('eventStreamConnected');
      };
      
      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleEventStreamMessage(data);
        } catch (error) {
          console.error('Failed to parse event stream message:', error);
        }
      };
      
      this.eventSource.onerror = (error) => {
        console.error('Event stream error:', error);
        this.emit('eventStreamError', error);
        
        // Attempt reconnection
        if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
          this.reconnectAttempts++;
          setTimeout(() => {
            this.setupEventStream();
          }, this.config.reconnectDelay);
        }
      };
      
    } catch (error) {
      console.error('Failed to setup event stream:', error);
    }
  }

  /**
   * Handle event stream messages
   */
  handleEventStreamMessage(data) {
    console.log('Event stream message:', data.type);
    
    switch (data.type) {
      case 'message':
        this.emit('message', data.data);
        break;
      case 'status':
        this.emit('statusUpdate', data.data);
        break;
      case 'tool_execution':
        this.emit('toolExecution', data.data);
        break;
      case 'error':
        this.emit('error', data.data);
        break;
      case 'completion':
        this.emit('completion', data.data);
        break;
      default:
        this.emit('unknownEvent', data);
    }
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    if (this.config.healthCheckInterval > 0) {
      this.healthCheckTimer = setInterval(async () => {
        try {
          const health = await this.checkHealth();
          if (!health.available && this.isConnected) {
            this.emit('healthCheckFailed', health);
          }
        } catch (error) {
          console.error('Health check error:', error);
        }
      }, this.config.healthCheckInterval);
    }
  }

  /**
   * Get client health status
   */
  async getHealth() {
    const agentApiHealth = await this.checkHealth();
    
    return {
      status: this.isConnected && agentApiHealth.available ? 'healthy' : 'unhealthy',
      connected: this.isConnected,
      agentApiAvailable: agentApiHealth.available,
      eventStreamConnected: !!this.eventSource && this.eventSource.readyState === EventSource.OPEN,
      reconnectAttempts: this.reconnectAttempts,
      lastHealthCheck: new Date().toISOString()
    };
  }

  /**
   * Determine if request should be retried
   */
  shouldRetry(error) {
    // Retry on network errors or 5xx status codes
    return !error.response || (error.response.status >= 500 && error.response.status < 600);
  }

  /**
   * Delay utility for retries
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute instruction with retry logic
   */
  async executeInstruction(instruction, context = {}, options = {}) {
    const maxRetries = options.retryAttempts || this.config.retryAttempts;
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const message = {
          content: instruction,
          type: 'instruction',
          context,
          ...options
        };
        
        const result = await this.sendMessage(message);
        return result;
        
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries) {
          const delay = this.config.retryDelay * Math.pow(2, attempt); // Exponential backoff
          console.log(`Instruction failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await this.delay(delay);
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Batch send multiple messages
   */
  async sendBatch(messages, options = {}) {
    const { concurrent = 3 } = options;
    const results = [];
    
    // Process messages in batches
    for (let i = 0; i < messages.length; i += concurrent) {
      const batch = messages.slice(i, i + concurrent);
      const batchPromises = batch.map(message => this.sendMessage(message, options));
      
      try {
        const batchResults = await Promise.allSettled(batchPromises);
        results.push(...batchResults);
      } catch (error) {
        console.error('Batch processing error:', error);
      }
    }
    
    return results;
  }
}

export default AgentAPIClient;

