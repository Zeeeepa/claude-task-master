/**
 * AgentAPI HTTP Client - Consolidated Implementation
 * 
 * Unified HTTP client for AgentAPI communication with circuit breaker protection,
 * retry logic, and comprehensive error handling. Consolidates functionality from
 * multiple PRs into a single, robust implementation.
 */

import EventSource from 'eventsource';
import { SimpleLogger } from '../../utils/simple_logger.js';

export class AgentAPIClient {
  constructor(config = {}) {
    this.config = {
      baseURL: config.baseURL || process.env.AGENTAPI_URL || 'http://localhost:3284',
      apiKey: config.apiKey || process.env.AGENTAPI_KEY,
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
      circuitBreakerTimeout: config.circuitBreakerTimeout || 60000,
      enableSSE: config.enableSSE !== false,
      ...config
    };

    this.logger = new SimpleLogger('AgentAPIClient');
    
    // Circuit breaker state
    this.circuitBreaker = {
      state: 'closed', // closed, open, half-open
      failures: 0,
      lastFailureTime: null,
      successCount: 0
    };

    // Connection state
    this.connected = false;
    this.connecting = false;
    this.eventSource = null;
    this.sessionId = null;
    
    // Metrics
    this.metrics = {
      requests: { total: 0, successful: 0, failed: 0 },
      responseTime: { total: 0, average: 0 },
      circuitBreakerTrips: 0,
      lastRequestTime: null
    };

    // Event handlers
    this.eventHandlers = new Map();
  }

  /**
   * Connect to AgentAPI service
   */
  async connect() {
    if (this.connected || this.connecting) {
      return;
    }

    this.connecting = true;
    this.logger.info('Connecting to AgentAPI...', { baseURL: this.config.baseURL });

    try {
      // Test connection with health check
      await this.healthCheck();
      
      // Initialize SSE connection if enabled
      if (this.config.enableSSE) {
        await this._initializeSSE();
      }

      this.connected = true;
      this.connecting = false;
      this.logger.info('Connected to AgentAPI successfully');
      
      this._emit('connected');
      
    } catch (error) {
      this.connecting = false;
      this.logger.error('Failed to connect to AgentAPI:', error);
      throw error;
    }
  }

  /**
   * Disconnect from AgentAPI service
   */
  async disconnect() {
    if (!this.connected) {
      return;
    }

    this.logger.info('Disconnecting from AgentAPI...');

    try {
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }

      if (this.sessionId) {
        await this._request('DELETE', `/sessions/${this.sessionId}`);
        this.sessionId = null;
      }

      this.connected = false;
      this.logger.info('Disconnected from AgentAPI');
      
      this._emit('disconnected');
      
    } catch (error) {
      this.logger.error('Error during disconnect:', error);
    }
  }

  /**
   * Send message to agent
   */
  async sendMessage(message, role = 'user', options = {}) {
    if (!this.connected) {
      await this.connect();
    }

    const payload = {
      message,
      role,
      sessionId: this.sessionId,
      ...options
    };

    this.logger.debug('Sending message to agent', { 
      messageLength: message.length,
      role,
      sessionId: this.sessionId 
    });

    try {
      const response = await this._request('POST', '/messages', payload);
      
      this.logger.debug('Received response from agent', {
        responseId: response.id,
        hasContent: !!response.content
      });

      return response;
      
    } catch (error) {
      this.logger.error('Failed to send message:', error);
      throw error;
    }
  }

  /**
   * Start new agent session
   */
  async startSession(agentType = 'claude', config = {}) {
    this.logger.info('Starting agent session', { agentType });

    try {
      const response = await this._request('POST', '/sessions', {
        agentType,
        config: {
          model: config.model || 'claude-3-5-sonnet-20241022',
          maxTokens: config.maxTokens || 4096,
          temperature: config.temperature || 0.1,
          allowedTools: config.allowedTools || ['Bash', 'Edit', 'Replace', 'Create'],
          ...config
        }
      });

      this.sessionId = response.sessionId;
      this.logger.info('Agent session started', { sessionId: this.sessionId });
      
      this._emit('sessionStarted', { sessionId: this.sessionId, agentType });
      
      return response;
      
    } catch (error) {
      this.logger.error('Failed to start session:', error);
      throw error;
    }
  }

  /**
   * Stop current agent session
   */
  async stopSession() {
    if (!this.sessionId) {
      return;
    }

    this.logger.info('Stopping agent session', { sessionId: this.sessionId });

    try {
      await this._request('DELETE', `/sessions/${this.sessionId}`);
      
      const sessionId = this.sessionId;
      this.sessionId = null;
      
      this.logger.info('Agent session stopped', { sessionId });
      this._emit('sessionStopped', { sessionId });
      
    } catch (error) {
      this.logger.error('Failed to stop session:', error);
      throw error;
    }
  }

  /**
   * Get session status
   */
  async getSessionStatus(sessionId = null) {
    const id = sessionId || this.sessionId;
    if (!id) {
      throw new Error('No session ID provided');
    }

    try {
      const response = await this._request('GET', `/sessions/${id}/status`);
      return response;
      
    } catch (error) {
      this.logger.error('Failed to get session status:', error);
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const response = await this._request('GET', '/health');
      return response;
      
    } catch (error) {
      this.logger.error('Health check failed:', error);
      throw error;
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus() {
    return {
      connected: this.connected,
      connecting: this.connecting,
      sessionId: this.sessionId,
      circuitBreaker: { ...this.circuitBreaker },
      metrics: { ...this.metrics }
    };
  }

  /**
   * Add event listener
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  /**
   * Remove event listener
   */
  off(event, handler) {
    if (this.eventHandlers.has(event)) {
      const handlers = this.eventHandlers.get(event);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  // Private methods

  /**
   * Make HTTP request with circuit breaker and retry logic
   */
  async _request(method, path, data = null, attempt = 1) {
    // Check circuit breaker
    if (this._isCircuitBreakerOpen()) {
      throw new Error('Circuit breaker is open - AgentAPI unavailable');
    }

    const startTime = Date.now();
    const url = `${this.config.baseURL}${path}`;
    
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'claude-task-master/1.0.0'
      }
    };

    if (this.config.apiKey) {
      options.headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }

    // Add timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
    options.signal = controller.signal;

    try {
      this.metrics.requests.total++;
      this.metrics.lastRequestTime = Date.now();

      const response = await fetch(url, options);
      clearTimeout(timeoutId);

      const responseTime = Date.now() - startTime;
      this.metrics.responseTime.total += responseTime;
      this.metrics.responseTime.average = this.metrics.responseTime.total / this.metrics.requests.total;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Success - reset circuit breaker
      this._recordSuccess();
      this.metrics.requests.successful++;

      return result;

    } catch (error) {
      clearTimeout(timeoutId);
      
      // Record failure
      this._recordFailure();
      this.metrics.requests.failed++;

      // Retry logic
      if (attempt < this.config.retryAttempts && this._shouldRetry(error)) {
        this.logger.warn(`Request failed, retrying (${attempt}/${this.config.retryAttempts})`, {
          error: error.message,
          url,
          method
        });

        await this._delay(this.config.retryDelay * Math.pow(2, attempt - 1));
        return this._request(method, path, data, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Initialize Server-Sent Events connection
   */
  async _initializeSSE() {
    if (!this.config.enableSSE) {
      return;
    }

    const sseUrl = `${this.config.baseURL}/events`;
    this.logger.debug('Initializing SSE connection', { url: sseUrl });

    this.eventSource = new EventSource(sseUrl, {
      headers: this.config.apiKey ? {
        'Authorization': `Bearer ${this.config.apiKey}`
      } : {}
    });

    this.eventSource.onopen = () => {
      this.logger.debug('SSE connection opened');
      this._emit('sseConnected');
    };

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.logger.debug('SSE message received', { type: data.type });
        this._emit('sseMessage', data);
      } catch (error) {
        this.logger.error('Failed to parse SSE message:', error);
      }
    };

    this.eventSource.onerror = (error) => {
      this.logger.error('SSE connection error:', error);
      this._emit('sseError', error);
    };
  }

  /**
   * Check if circuit breaker is open
   */
  _isCircuitBreakerOpen() {
    if (this.circuitBreaker.state === 'closed') {
      return false;
    }

    if (this.circuitBreaker.state === 'open') {
      const timeSinceLastFailure = Date.now() - this.circuitBreaker.lastFailureTime;
      if (timeSinceLastFailure >= this.config.circuitBreakerTimeout) {
        this.circuitBreaker.state = 'half-open';
        this.circuitBreaker.successCount = 0;
        this.logger.info('Circuit breaker moved to half-open state');
        return false;
      }
      return true;
    }

    // half-open state
    return false;
  }

  /**
   * Record successful request
   */
  _recordSuccess() {
    if (this.circuitBreaker.state === 'half-open') {
      this.circuitBreaker.successCount++;
      if (this.circuitBreaker.successCount >= 3) {
        this.circuitBreaker.state = 'closed';
        this.circuitBreaker.failures = 0;
        this.logger.info('Circuit breaker closed - service recovered');
      }
    } else if (this.circuitBreaker.state === 'closed') {
      this.circuitBreaker.failures = 0;
    }
  }

  /**
   * Record failed request
   */
  _recordFailure() {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailureTime = Date.now();

    if (this.circuitBreaker.state === 'closed' && 
        this.circuitBreaker.failures >= this.config.circuitBreakerThreshold) {
      this.circuitBreaker.state = 'open';
      this.metrics.circuitBreakerTrips++;
      this.logger.warn('Circuit breaker opened - too many failures');
      this._emit('circuitBreakerOpened');
    } else if (this.circuitBreaker.state === 'half-open') {
      this.circuitBreaker.state = 'open';
      this.metrics.circuitBreakerTrips++;
      this.logger.warn('Circuit breaker reopened - failure during recovery');
      this._emit('circuitBreakerOpened');
    }
  }

  /**
   * Check if error should trigger retry
   */
  _shouldRetry(error) {
    // Don't retry on client errors (4xx)
    if (error.message.includes('HTTP 4')) {
      return false;
    }

    // Retry on network errors, timeouts, and server errors
    return true;
  }

  /**
   * Delay helper for retry logic
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Emit event to handlers
   */
  _emit(event, data = null) {
    if (this.eventHandlers.has(event)) {
      this.eventHandlers.get(event).forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          this.logger.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }
}

export default AgentAPIClient;

