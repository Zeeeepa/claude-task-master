/**
 * @fileoverview HTTP Client
 * @description HTTP/REST communication client for AgentAPI
 */

import { log } from '../utils/simple_logger.js';

/**
 * HTTP Client - Handles HTTP/REST communication
 */
export class HTTPClient {
  constructor(config) {
    this.config = config;
    this.baseUrl = config.agentApiUrl || 'http://localhost:8000';
    this.timeout = config.timeout || 120000;
    this.retryAttempts = config.retryAttempts || 3;
    this.retryDelay = config.retryDelay || 1000;
    this.headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'claude-task-master-agentapi-middleware/1.0.0',
      ...(config.apiKey && { 'Authorization': `Bearer ${config.apiKey}` }),
      ...config.headers
    };
    
    this.requestHistory = [];
    this.isInitialized = false;
  }

  /**
   * Initialize the HTTP client
   */
  async initialize() {
    log('info', '🔄 Initializing HTTP client...');
    
    try {
      // Test connection
      await this.testConnection();
      
      this.isInitialized = true;
      log('info', '✅ HTTP client initialized');
      
    } catch (error) {
      log('error', `❌ Failed to initialize HTTP client: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send HTTP request
   * @param {Object} data - Request data
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response data
   */
  async send(data, options = {}) {
    const requestId = `http_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    log('debug', `📤 Sending HTTP request: ${requestId}`);
    
    const requestOptions = {
      method: options.method || 'POST',
      endpoint: options.endpoint || '/api/v1/process',
      headers: { ...this.headers, ...options.headers },
      timeout: options.timeout || this.timeout,
      retries: options.retries || this.retryAttempts,
      ...options
    };
    
    const startTime = Date.now();
    
    try {
      const response = await this._sendWithRetry(data, requestOptions, requestId);
      
      const duration = Date.now() - startTime;
      
      // Record request history
      this.requestHistory.push({
        id: requestId,
        timestamp: new Date(),
        duration,
        status: 'success',
        method: requestOptions.method,
        endpoint: requestOptions.endpoint
      });
      
      log('debug', `📥 HTTP response received: ${requestId} (${duration}ms)`);
      return response;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Record failed request
      this.requestHistory.push({
        id: requestId,
        timestamp: new Date(),
        duration,
        status: 'failed',
        method: requestOptions.method,
        endpoint: requestOptions.endpoint,
        error: error.message
      });
      
      log('error', `❌ HTTP request failed: ${requestId} - ${error.message}`);
      throw error;
    }
  }

  /**
   * Send GET request
   * @param {string} endpoint - Request endpoint
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response data
   */
  async get(endpoint, options = {}) {
    return this.send(null, {
      ...options,
      method: 'GET',
      endpoint
    });
  }

  /**
   * Send POST request
   * @param {string} endpoint - Request endpoint
   * @param {Object} data - Request data
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response data
   */
  async post(endpoint, data, options = {}) {
    return this.send(data, {
      ...options,
      method: 'POST',
      endpoint
    });
  }

  /**
   * Send PUT request
   * @param {string} endpoint - Request endpoint
   * @param {Object} data - Request data
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response data
   */
  async put(endpoint, data, options = {}) {
    return this.send(data, {
      ...options,
      method: 'PUT',
      endpoint
    });
  }

  /**
   * Send DELETE request
   * @param {string} endpoint - Request endpoint
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response data
   */
  async delete(endpoint, options = {}) {
    return this.send(null, {
      ...options,
      method: 'DELETE',
      endpoint
    });
  }

  /**
   * Test connection to AgentAPI
   * @returns {Promise<boolean>} Connection test result
   */
  async testConnection() {
    try {
      const response = await this.get('/health', { timeout: 5000 });
      
      if (response && (response.status === 'ok' || response.status === 'healthy')) {
        log('debug', '✅ HTTP connection test successful');
        return true;
      } else {
        throw new Error(`Unexpected health check response: ${JSON.stringify(response)}`);
      }
      
    } catch (error) {
      log('error', `❌ HTTP connection test failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get client statistics
   * @returns {Object} Client statistics
   */
  getStatistics() {
    const totalRequests = this.requestHistory.length;
    const successfulRequests = this.requestHistory.filter(r => r.status === 'success').length;
    const failedRequests = this.requestHistory.filter(r => r.status === 'failed').length;
    
    const averageDuration = totalRequests > 0 
      ? this.requestHistory.reduce((sum, r) => sum + r.duration, 0) / totalRequests 
      : 0;
    
    return {
      total_requests: totalRequests,
      successful_requests: successfulRequests,
      failed_requests: failedRequests,
      success_rate: totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0,
      average_duration_ms: averageDuration,
      base_url: this.baseUrl,
      timeout_ms: this.timeout
    };
  }

  /**
   * Get client health
   * @returns {Object} Health status
   */
  getHealth() {
    const stats = this.getStatistics();
    
    return {
      status: this.isInitialized ? 'healthy' : 'not_initialized',
      base_url: this.baseUrl,
      success_rate: stats.success_rate,
      average_response_time_ms: stats.average_duration_ms,
      last_request: this.requestHistory.length > 0 
        ? this.requestHistory[this.requestHistory.length - 1].timestamp 
        : null
    };
  }

  /**
   * Shutdown the HTTP client
   */
  async shutdown() {
    log('info', '🔄 Shutting down HTTP client...');
    
    // Clear request history
    this.requestHistory = [];
    this.isInitialized = false;
    
    log('info', '✅ HTTP client shutdown complete');
  }

  /**
   * Send request with retry logic
   * @param {Object} data - Request data
   * @param {Object} options - Request options
   * @param {string} requestId - Request identifier
   * @returns {Promise<Object>} Response data
   * @private
   */
  async _sendWithRetry(data, options, requestId) {
    let lastError;
    
    for (let attempt = 1; attempt <= options.retries; attempt++) {
      try {
        return await this._makeRequest(data, options);
        
      } catch (error) {
        lastError = error;
        
        if (attempt < options.retries && this._isRetryableError(error)) {
          const delay = this._calculateRetryDelay(attempt);
          log('debug', `🔄 Retrying HTTP request ${requestId} (attempt ${attempt + 1}/${options.retries}) after ${delay}ms`);
          
          await this._sleep(delay);
          continue;
        }
        
        break;
      }
    }
    
    throw lastError;
  }

  /**
   * Make actual HTTP request
   * @param {Object} data - Request data
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response data
   * @private
   */
  async _makeRequest(data, options) {
    const url = `${this.baseUrl}${options.endpoint}`;
    
    const requestConfig = {
      method: options.method,
      headers: options.headers,
      signal: AbortSignal.timeout(options.timeout)
    };
    
    if (data && (options.method === 'POST' || options.method === 'PUT')) {
      requestConfig.body = JSON.stringify(data);
    }
    
    const response = await fetch(url, requestConfig);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    } else {
      return await response.text();
    }
  }

  /**
   * Check if error is retryable
   * @param {Error} error - Error to check
   * @returns {boolean} True if error is retryable
   * @private
   */
  _isRetryableError(error) {
    // Retry on network errors, timeouts, and 5xx server errors
    return (
      error.name === 'AbortError' ||
      error.name === 'TimeoutError' ||
      error.message.includes('ECONNRESET') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('ECONNREFUSED') ||
      (error.message.includes('HTTP 5') && !error.message.includes('HTTP 501'))
    );
  }

  /**
   * Calculate retry delay with exponential backoff
   * @param {number} attempt - Attempt number
   * @returns {number} Delay in milliseconds
   * @private
   */
  _calculateRetryDelay(attempt) {
    return Math.min(this.retryDelay * Math.pow(2, attempt - 1), 30000); // Max 30 seconds
  }

  /**
   * Sleep for specified duration
   * @param {number} ms - Duration in milliseconds
   * @returns {Promise<void>}
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default HTTPClient;

