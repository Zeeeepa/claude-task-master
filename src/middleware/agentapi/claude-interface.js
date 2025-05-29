import axios from 'axios';
import { EventEmitter } from 'events';

/**
 * Claude Code Interface
 * HTTP client for Claude Code API calls with error handling and retry logic
 */
export class ClaudeInterface extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.baseURL = options.baseURL || process.env.CLAUDE_CODE_API_URL || 'http://localhost:8080';
    this.apiKey = options.apiKey || process.env.CLAUDE_CODE_API_KEY;
    this.timeout = options.timeout || 30000;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    
    // Create axios instance with default configuration
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TaskMaster-AgentAPI/1.0.0',
        ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
      }
    });
    
    // Setup request/response interceptors
    this.setupInterceptors();
    
    // Connection state
    this.isConnected = false;
    this.lastHealthCheck = null;
    this.connectionAttempts = 0;
    
    // Start health monitoring
    this.startHealthMonitoring();
  }

  /**
   * Setup axios interceptors for logging and error handling
   */
  setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        console.log(`[Claude API] ${config.method?.toUpperCase()} ${config.url}`, {
          timestamp: new Date().toISOString(),
          headers: { ...config.headers, Authorization: '[REDACTED]' }
        });
        return config;
      },
      (error) => {
        console.error('[Claude API] Request error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        console.log(`[Claude API] Response ${response.status}`, {
          timestamp: new Date().toISOString(),
          url: response.config.url,
          status: response.status,
          statusText: response.statusText
        });
        return response;
      },
      (error) => {
        console.error('[Claude API] Response error:', {
          timestamp: new Date().toISOString(),
          url: error.config?.url,
          status: error.response?.status,
          statusText: error.response?.statusText,
          message: error.message
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    // Check health every 30 seconds
    setInterval(async () => {
      try {
        await this.checkHealth();
      } catch (error) {
        console.warn('[Claude API] Health check failed:', error.message);
      }
    }, 30000);
    
    // Initial health check
    this.checkHealth().catch(() => {
      console.warn('[Claude API] Initial health check failed');
    });
  }

  /**
   * Check Claude Code API health
   */
  async checkHealth() {
    try {
      const response = await this.client.get('/health', { timeout: 5000 });
      this.isConnected = true;
      this.lastHealthCheck = new Date().toISOString();
      this.connectionAttempts = 0;
      
      this.emit('health_check', {
        status: 'healthy',
        timestamp: this.lastHealthCheck,
        response: response.data
      });
      
      return response.data;
    } catch (error) {
      this.isConnected = false;
      this.connectionAttempts++;
      
      this.emit('health_check', {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
        attempts: this.connectionAttempts
      });
      
      throw error;
    }
  }

  /**
   * Get current status of Claude Code
   */
  async getStatus() {
    try {
      const response = await this.client.get('/api/status');
      return {
        connected: this.isConnected,
        lastHealthCheck: this.lastHealthCheck,
        connectionAttempts: this.connectionAttempts,
        claudeStatus: response.data
      };
    } catch (error) {
      return {
        connected: false,
        lastHealthCheck: this.lastHealthCheck,
        connectionAttempts: this.connectionAttempts,
        error: error.message
      };
    }
  }

  /**
   * Send message to Claude Code with retry logic
   */
  async sendMessage(message, sessionId, options = {}) {
    const payload = this.formatMessage(message, sessionId, options);
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await this.client.post('/api/chat', payload, {
          timeout: options.timeout || this.timeout
        });
        
        const formattedResponse = this.parseResponse(response.data);
        
        this.emit('message_sent', {
          sessionId,
          messageId: payload.messageId,
          response: formattedResponse,
          attempt,
          timestamp: new Date().toISOString()
        });
        
        return formattedResponse;
      } catch (error) {
        console.error(`[Claude API] Send message attempt ${attempt} failed:`, error.message);
        
        if (attempt === this.retryAttempts) {
          this.emit('message_failed', {
            sessionId,
            messageId: payload.messageId,
            error: error.message,
            attempts: attempt,
            timestamp: new Date().toISOString()
          });
          throw error;
        }
        
        // Wait before retry with exponential backoff
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        await this.sleep(delay);
      }
    }
  }

  /**
   * Get conversation history from Claude Code
   */
  async getConversationHistory(sessionId, options = {}) {
    try {
      const params = {
        sessionId,
        limit: options.limit || 50,
        offset: options.offset || 0,
        ...options.filters
      };
      
      const response = await this.client.get('/api/conversations', { params });
      return this.parseConversationHistory(response.data);
    } catch (error) {
      console.error('[Claude API] Get conversation history failed:', error.message);
      throw error;
    }
  }

  /**
   * Create new session in Claude Code
   */
  async createSession(metadata = {}) {
    try {
      const payload = {
        metadata: {
          source: 'TaskMaster-AgentAPI',
          createdAt: new Date().toISOString(),
          ...metadata
        }
      };
      
      const response = await this.client.post('/api/sessions', payload);
      
      this.emit('session_created', {
        sessionId: response.data.sessionId,
        metadata: payload.metadata,
        timestamp: new Date().toISOString()
      });
      
      return response.data;
    } catch (error) {
      console.error('[Claude API] Create session failed:', error.message);
      throw error;
    }
  }

  /**
   * End session in Claude Code
   */
  async endSession(sessionId) {
    try {
      const response = await this.client.delete(`/api/sessions/${sessionId}`);
      
      this.emit('session_ended', {
        sessionId,
        timestamp: new Date().toISOString()
      });
      
      return response.data;
    } catch (error) {
      console.error('[Claude API] End session failed:', error.message);
      throw error;
    }
  }

  /**
   * Get session information
   */
  async getSession(sessionId) {
    try {
      const response = await this.client.get(`/api/sessions/${sessionId}`);
      return response.data;
    } catch (error) {
      console.error('[Claude API] Get session failed:', error.message);
      throw error;
    }
  }

  /**
   * Stream messages from Claude Code (Server-Sent Events)
   */
  async streamMessages(sessionId, onMessage, onError) {
    try {
      const response = await this.client.get(`/api/stream/${sessionId}`, {
        responseType: 'stream',
        timeout: 0 // No timeout for streaming
      });
      
      response.data.on('data', (chunk) => {
        try {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.slice(6));
              onMessage(data);
            }
          }
        } catch (error) {
          console.error('[Claude API] Stream parsing error:', error);
          onError?.(error);
        }
      });
      
      response.data.on('error', (error) => {
        console.error('[Claude API] Stream error:', error);
        onError?.(error);
      });
      
      response.data.on('end', () => {
        console.log('[Claude API] Stream ended');
      });
      
      return response.data;
    } catch (error) {
      console.error('[Claude API] Stream setup failed:', error.message);
      throw error;
    }
  }

  /**
   * Format message for Claude Code API
   */
  formatMessage(message, sessionId, options = {}) {
    return {
      messageId: options.messageId || this.generateMessageId(),
      sessionId,
      content: message,
      timestamp: new Date().toISOString(),
      metadata: {
        source: 'TaskMaster-AgentAPI',
        priority: options.priority || 'normal',
        requestId: options.requestId,
        ...options.metadata
      }
    };
  }

  /**
   * Parse response from Claude Code
   */
  parseResponse(response) {
    return {
      messageId: response.messageId || this.generateMessageId(),
      content: response.content || response.message || response.text,
      timestamp: response.timestamp || new Date().toISOString(),
      metadata: response.metadata || {},
      status: response.status || 'completed',
      usage: response.usage || null
    };
  }

  /**
   * Parse conversation history response
   */
  parseConversationHistory(response) {
    if (!response.messages || !Array.isArray(response.messages)) {
      return {
        messages: [],
        total: 0,
        hasMore: false
      };
    }
    
    return {
      messages: response.messages.map(msg => this.parseResponse(msg)),
      total: response.total || response.messages.length,
      hasMore: response.hasMore || false,
      nextOffset: response.nextOffset || null
    };
  }

  /**
   * Generate unique message ID
   */
  generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sleep utility for retry delays
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Test connection to Claude Code
   */
  async testConnection() {
    try {
      await this.checkHealth();
      return {
        success: true,
        message: 'Connection to Claude Code successful',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get connection statistics
   */
  getConnectionStats() {
    return {
      isConnected: this.isConnected,
      lastHealthCheck: this.lastHealthCheck,
      connectionAttempts: this.connectionAttempts,
      baseURL: this.baseURL,
      timeout: this.timeout,
      retryAttempts: this.retryAttempts,
      retryDelay: this.retryDelay
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    if (newConfig.baseURL) this.baseURL = newConfig.baseURL;
    if (newConfig.apiKey) this.apiKey = newConfig.apiKey;
    if (newConfig.timeout) this.timeout = newConfig.timeout;
    if (newConfig.retryAttempts) this.retryAttempts = newConfig.retryAttempts;
    if (newConfig.retryDelay) this.retryDelay = newConfig.retryDelay;
    
    // Update axios instance
    this.client.defaults.baseURL = this.baseURL;
    this.client.defaults.timeout = this.timeout;
    if (this.apiKey) {
      this.client.defaults.headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    
    this.emit('config_updated', {
      config: newConfig,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.removeAllListeners();
    // Cancel any pending requests
    // Note: axios doesn't provide a direct way to cancel all requests
    // In a production environment, you might want to implement request tracking
  }
}

export default ClaudeInterface;

