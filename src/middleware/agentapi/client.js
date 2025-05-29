import axios from 'axios';
import { EventEmitter } from 'events';

/**
 * AgentAPI Client
 * HTTP client for AgentAPI communication with connection pooling and error recovery
 */
export class AgentAPIClient extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.baseURL = options.baseURL || process.env.AGENTAPI_URL || 'http://localhost:3284';
    this.apiKey = options.apiKey || process.env.AGENTAPI_KEY;
    this.timeout = options.timeout || 30000;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    
    // Connection pooling configuration
    this.maxConnections = options.maxConnections || 10;
    this.keepAlive = options.keepAlive !== false;
    
    // Create axios instance with connection pooling
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TaskMaster-AgentAPI-Client/1.0.0',
        ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
      },
      // Connection pooling settings
      maxRedirects: 5,
      maxContentLength: 50 * 1024 * 1024, // 50MB
      maxBodyLength: 50 * 1024 * 1024, // 50MB
    });
    
    // Setup interceptors
    this.setupInterceptors();
    
    // Connection state
    this.isConnected = false;
    this.lastHealthCheck = null;
    this.connectionAttempts = 0;
    
    // Request tracking
    this.activeRequests = new Map();
    this.requestStats = {
      total: 0,
      successful: 0,
      failed: 0,
      retried: 0
    };
    
    // Start health monitoring
    this.startHealthMonitoring();
  }

  /**
   * Setup axios interceptors
   */
  setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        config.metadata = { requestId, startTime: Date.now() };
        
        this.activeRequests.set(requestId, config);
        this.requestStats.total++;
        
        console.log(`[AgentAPI Client] ${config.method?.toUpperCase()} ${config.url}`, {
          requestId,
          timestamp: new Date().toISOString()
        });
        
        return config;
      },
      (error) => {
        console.error('[AgentAPI Client] Request error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        const { requestId, startTime } = response.config.metadata || {};
        const duration = Date.now() - startTime;
        
        if (requestId) {
          this.activeRequests.delete(requestId);
        }
        
        this.requestStats.successful++;
        
        console.log(`[AgentAPI Client] Response ${response.status}`, {
          requestId,
          duration: `${duration}ms`,
          timestamp: new Date().toISOString()
        });
        
        return response;
      },
      (error) => {
        const { requestId, startTime } = error.config?.metadata || {};
        const duration = startTime ? Date.now() - startTime : 0;
        
        if (requestId) {
          this.activeRequests.delete(requestId);
        }
        
        this.requestStats.failed++;
        
        console.error('[AgentAPI Client] Response error:', {
          requestId,
          duration: `${duration}ms`,
          status: error.response?.status,
          message: error.message,
          timestamp: new Date().toISOString()
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
        console.warn('[AgentAPI Client] Health check failed:', error.message);
      }
    }, 30000);
    
    // Initial health check
    this.checkHealth().catch(() => {
      console.warn('[AgentAPI Client] Initial health check failed');
    });
  }

  /**
   * Check AgentAPI server health
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
   * Send message to Claude Code via AgentAPI
   */
  async sendMessage(content, sessionId, options = {}) {
    return this.makeRequest('POST', '/api/agents/claude/message', {
      message: content,
      sessionId,
      priority: options.priority || 'normal',
      ...options
    });
  }

  /**
   * Get conversation history
   */
  async getMessages(sessionId, options = {}) {
    const params = {
      sessionId,
      limit: options.limit || 50,
      offset: options.offset || 0
    };
    
    return this.makeRequest('GET', '/api/agents/claude/messages', null, { params });
  }

  /**
   * Get agent status
   */
  async getStatus() {
    return this.makeRequest('GET', '/api/agents/claude/status');
  }

  /**
   * Create new session
   */
  async createSession(metadata = {}) {
    return this.makeRequest('POST', '/api/agents/claude/session', { metadata });
  }

  /**
   * End session
   */
  async endSession(sessionId) {
    return this.makeRequest('DELETE', `/api/agents/claude/session/${sessionId}`);
  }

  /**
   * Create task
   */
  async createTask(title, description, options = {}) {
    return this.makeRequest('POST', '/api/tasks/create', {
      title,
      description,
      priority: options.priority || 'normal',
      metadata: options.metadata || {}
    });
  }

  /**
   * Assign task to agent
   */
  async assignTask(taskId, agentId, sessionId) {
    return this.makeRequest('PUT', `/api/tasks/${taskId}/assign`, {
      agentId,
      sessionId
    });
  }

  /**
   * Get task status
   */
  async getTaskStatus(taskId) {
    return this.makeRequest('GET', `/api/tasks/${taskId}/status`);
  }

  /**
   * Complete task
   */
  async completeTask(taskId, result, metadata = {}) {
    return this.makeRequest('POST', `/api/tasks/${taskId}/complete`, {
      result,
      metadata
    });
  }

  /**
   * Subscribe to Server-Sent Events
   */
  subscribeToEvents(sessionId, onEvent, onError) {
    const url = `${this.baseURL}/api/agents/claude/events${sessionId ? `?sessionId=${sessionId}` : ''}`;
    
    // Use EventSource for SSE
    const eventSource = new EventSource(url);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onEvent(data);
      } catch (error) {
        console.error('[AgentAPI Client] SSE parsing error:', error);
        onError?.(error);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('[AgentAPI Client] SSE error:', error);
      onError?.(error);
    };
    
    return eventSource;
  }

  /**
   * Create WebSocket connection
   */
  createWebSocket(sessionId) {
    const wsUrl = this.baseURL.replace(/^http/, 'ws') + 
                  (sessionId ? `?sessionId=${sessionId}` : '');
    
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('[AgentAPI Client] WebSocket connected');
      this.emit('websocket_connected', { sessionId });
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.emit('websocket_message', data);
      } catch (error) {
        console.error('[AgentAPI Client] WebSocket message parsing error:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error('[AgentAPI Client] WebSocket error:', error);
      this.emit('websocket_error', error);
    };
    
    ws.onclose = () => {
      console.log('[AgentAPI Client] WebSocket disconnected');
      this.emit('websocket_disconnected', { sessionId });
    };
    
    return ws;
  }

  /**
   * Make HTTP request with retry logic
   */
  async makeRequest(method, url, data = null, config = {}) {
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const requestConfig = {
          method,
          url,
          ...(data && { data }),
          ...config
        };
        
        const response = await this.client.request(requestConfig);
        
        // Emit success event
        this.emit('request_success', {
          method,
          url,
          attempt,
          timestamp: new Date().toISOString()
        });
        
        return response.data;
      } catch (error) {
        console.error(`[AgentAPI Client] Request attempt ${attempt} failed:`, error.message);
        
        if (attempt === this.retryAttempts) {
          this.emit('request_failed', {
            method,
            url,
            error: error.message,
            attempts: attempt,
            timestamp: new Date().toISOString()
          });
          throw error;
        }
        
        // Check if error is retryable
        if (!this.isRetryableError(error)) {
          throw error;
        }
        
        this.requestStats.retried++;
        
        // Wait before retry with exponential backoff
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        await this.sleep(delay);
      }
    }
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error) {
    // Network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      return true;
    }
    
    // HTTP status codes that are retryable
    if (error.response) {
      const status = error.response.status;
      return status >= 500 || status === 429; // Server errors or rate limiting
    }
    
    return false;
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      connection: {
        isConnected: this.isConnected,
        lastHealthCheck: this.lastHealthCheck,
        connectionAttempts: this.connectionAttempts,
        baseURL: this.baseURL
      },
      requests: {
        ...this.requestStats,
        active: this.activeRequests.size
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get active requests
   */
  getActiveRequests() {
    return Array.from(this.activeRequests.values()).map(config => ({
      requestId: config.metadata?.requestId,
      method: config.method,
      url: config.url,
      startTime: config.metadata?.startTime,
      duration: config.metadata?.startTime ? Date.now() - config.metadata.startTime : 0
    }));
  }

  /**
   * Cancel all active requests
   */
  cancelAllRequests() {
    const cancelledCount = this.activeRequests.size;
    
    // Note: axios doesn't provide a direct way to cancel all requests
    // In a production environment, you might want to implement request tracking with AbortController
    
    this.activeRequests.clear();
    
    this.emit('requests_cancelled', {
      count: cancelledCount,
      timestamp: new Date().toISOString()
    });
    
    return { cancelled: cancelledCount };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    if (newConfig.baseURL) {
      this.baseURL = newConfig.baseURL;
      this.client.defaults.baseURL = this.baseURL;
    }
    
    if (newConfig.apiKey) {
      this.apiKey = newConfig.apiKey;
      this.client.defaults.headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    
    if (newConfig.timeout) {
      this.timeout = newConfig.timeout;
      this.client.defaults.timeout = this.timeout;
    }
    
    if (newConfig.retryAttempts) this.retryAttempts = newConfig.retryAttempts;
    if (newConfig.retryDelay) this.retryDelay = newConfig.retryDelay;
    
    this.emit('config_updated', {
      config: newConfig,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Test connection
   */
  async testConnection() {
    try {
      await this.checkHealth();
      return {
        success: true,
        message: 'Connection to AgentAPI successful',
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
    this.activeRequests.clear();
  }
}

export default AgentAPIClient;

