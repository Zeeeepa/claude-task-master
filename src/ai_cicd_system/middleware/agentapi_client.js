/**
 * AgentAPI Client
 * 
 * Robust client for communicating with AgentAPI middleware to orchestrate
 * Claude Code, Goose, Aider, and Codex on WSL2 instances.
 * 
 * Features:
 * - Circuit breaker pattern for fault tolerance
 * - Exponential backoff retry mechanism
 * - Connection pooling and keep-alive
 * - Request/response validation
 * - Comprehensive error handling
 * - Performance metrics collection
 * - Health monitoring
 */

import axios from 'axios';
import { EventEmitter } from 'events';
import { SimpleLogger } from '../utils/simple_logger.js';

export class AgentAPIClient extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      baseURL: config.baseURL || process.env.AGENTAPI_URL || 'http://localhost:8000',
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
      circuitBreakerTimeout: config.circuitBreakerTimeout || 60000,
      healthCheckInterval: config.healthCheckInterval || 30000,
      maxConcurrentRequests: config.maxConcurrentRequests || 10,
      ...config
    };

    this.logger = new SimpleLogger('AgentAPIClient', config.logLevel || 'info');
    
    // Circuit breaker state
    this.circuitBreaker = {
      state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
      failureCount: 0,
      lastFailureTime: null,
      nextAttemptTime: null
    };

    // Connection pool and metrics
    this.activeRequests = new Set();
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastHealthCheck: null
    };

    // Initialize HTTP client with optimizations
    this.httpClient = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'claude-task-master-agentapi-client/1.0.0'
      },
      // Connection pooling and keep-alive
      httpAgent: new (await import('http')).Agent({
        keepAlive: true,
        maxSockets: this.config.maxConcurrentRequests,
        maxFreeSockets: 5,
        timeout: this.config.timeout
      }),
      httpsAgent: new (await import('https')).Agent({
        keepAlive: true,
        maxSockets: this.config.maxConcurrentRequests,
        maxFreeSockets: 5,
        timeout: this.config.timeout
      })
    });

    // Setup request/response interceptors
    this.setupInterceptors();
    
    // Start health monitoring
    this.startHealthMonitoring();
  }

  /**
   * Setup HTTP interceptors for logging and metrics
   */
  setupInterceptors() {
    // Request interceptor
    this.httpClient.interceptors.request.use(
      (config) => {
        const requestId = this.generateRequestId();
        config.metadata = { startTime: Date.now(), requestId };
        this.activeRequests.add(requestId);
        this.metrics.totalRequests++;
        
        this.logger.debug(`Request ${requestId}: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        this.logger.error('Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.httpClient.interceptors.response.use(
      (response) => {
        const { startTime, requestId } = response.config.metadata;
        const responseTime = Date.now() - startTime;
        
        this.activeRequests.delete(requestId);
        this.metrics.successfulRequests++;
        this.updateAverageResponseTime(responseTime);
        
        this.logger.debug(`Response ${requestId}: ${response.status} (${responseTime}ms)`);
        this.onRequestSuccess();
        
        return response;
      },
      (error) => {
        const requestId = error.config?.metadata?.requestId;
        if (requestId) {
          this.activeRequests.delete(requestId);
        }
        
        this.metrics.failedRequests++;
        this.onRequestFailure(error);
        
        this.logger.error(`Request ${requestId} failed:`, error.message);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Generate unique request ID
   */
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update average response time metric
   */
  updateAverageResponseTime(responseTime) {
    const totalSuccessful = this.metrics.successfulRequests;
    this.metrics.averageResponseTime = 
      ((this.metrics.averageResponseTime * (totalSuccessful - 1)) + responseTime) / totalSuccessful;
  }

  /**
   * Handle successful request for circuit breaker
   */
  onRequestSuccess() {
    if (this.circuitBreaker.state === 'HALF_OPEN') {
      this.logger.info('Circuit breaker: Request succeeded, closing circuit');
      this.circuitBreaker.state = 'CLOSED';
      this.circuitBreaker.failureCount = 0;
      this.emit('circuitBreakerClosed');
    }
  }

  /**
   * Handle failed request for circuit breaker
   */
  onRequestFailure(error) {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();

    if (this.circuitBreaker.state === 'CLOSED' && 
        this.circuitBreaker.failureCount >= this.config.circuitBreakerThreshold) {
      this.openCircuitBreaker();
    }
  }

  /**
   * Open circuit breaker
   */
  openCircuitBreaker() {
    this.circuitBreaker.state = 'OPEN';
    this.circuitBreaker.nextAttemptTime = Date.now() + this.config.circuitBreakerTimeout;
    
    this.logger.warn(`Circuit breaker opened after ${this.circuitBreaker.failureCount} failures`);
    this.emit('circuitBreakerOpened', {
      failureCount: this.circuitBreaker.failureCount,
      nextAttemptTime: this.circuitBreaker.nextAttemptTime
    });
  }

  /**
   * Check if circuit breaker allows requests
   */
  isCircuitBreakerOpen() {
    if (this.circuitBreaker.state === 'OPEN') {
      if (Date.now() >= this.circuitBreaker.nextAttemptTime) {
        this.circuitBreaker.state = 'HALF_OPEN';
        this.logger.info('Circuit breaker: Attempting half-open state');
        this.emit('circuitBreakerHalfOpen');
        return false;
      }
      return true;
    }
    return false;
  }

  /**
   * Execute request with retry logic and circuit breaker
   */
  async executeRequest(requestFn, options = {}) {
    if (this.isCircuitBreakerOpen()) {
      const error = new Error('Circuit breaker is open');
      error.code = 'CIRCUIT_BREAKER_OPEN';
      throw error;
    }

    const maxAttempts = options.retryAttempts || this.config.retryAttempts;
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await requestFn();
        return result;
      } catch (error) {
        lastError = error;
        
        // Don't retry on certain error types
        if (this.isNonRetryableError(error) || attempt === maxAttempts) {
          throw error;
        }

        const delay = this.calculateRetryDelay(attempt);
        this.logger.warn(`Request attempt ${attempt} failed, retrying in ${delay}ms:`, error.message);
        
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Check if error should not be retried
   */
  isNonRetryableError(error) {
    const nonRetryableCodes = [400, 401, 403, 404, 422];
    return error.response && nonRetryableCodes.includes(error.response.status);
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  calculateRetryDelay(attempt) {
    const baseDelay = this.config.retryDelay;
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.1 * exponentialDelay;
    return Math.min(exponentialDelay + jitter, 30000); // Max 30 seconds
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Start agent session
   */
  async startAgentSession(agentType, config = {}) {
    this.logger.info(`Starting ${agentType} agent session`);
    
    return this.executeRequest(async () => {
      const response = await this.httpClient.post('/api/v1/sessions', {
        agentType,
        config: {
          ...config,
          sessionId: this.generateSessionId(),
          timestamp: new Date().toISOString()
        }
      });
      
      this.logger.info(`Agent session started: ${response.data.sessionId}`);
      this.emit('sessionStarted', { agentType, sessionId: response.data.sessionId });
      
      return response.data;
    });
  }

  /**
   * Send message to agent
   */
  async sendMessage(sessionId, message, options = {}) {
    this.logger.debug(`Sending message to session ${sessionId}`);
    
    return this.executeRequest(async () => {
      const response = await this.httpClient.post(`/api/v1/sessions/${sessionId}/messages`, {
        message,
        options: {
          ...options,
          timestamp: new Date().toISOString()
        }
      });
      
      this.emit('messageSent', { sessionId, message, response: response.data });
      return response.data;
    });
  }

  /**
   * Get session status
   */
  async getSessionStatus(sessionId) {
    return this.executeRequest(async () => {
      const response = await this.httpClient.get(`/api/v1/sessions/${sessionId}/status`);
      return response.data;
    });
  }

  /**
   * Stop agent session
   */
  async stopAgentSession(sessionId) {
    this.logger.info(`Stopping agent session: ${sessionId}`);
    
    return this.executeRequest(async () => {
      const response = await this.httpClient.delete(`/api/v1/sessions/${sessionId}`);
      
      this.logger.info(`Agent session stopped: ${sessionId}`);
      this.emit('sessionStopped', { sessionId });
      
      return response.data;
    });
  }

  /**
   * Deploy PR branch to WSL2 instance
   */
  async deployPRBranch(prData, wsl2Config = {}) {
    this.logger.info(`Deploying PR branch: ${prData.branch} to WSL2`);
    
    return this.executeRequest(async () => {
      const response = await this.httpClient.post('/api/v1/deploy/pr', {
        pr: prData,
        wsl2: {
          ...wsl2Config,
          timestamp: new Date().toISOString()
        }
      });
      
      this.logger.info(`PR branch deployed: ${response.data.deploymentId}`);
      this.emit('prDeployed', { prData, deploymentId: response.data.deploymentId });
      
      return response.data;
    });
  }

  /**
   * Validate deployment
   */
  async validateDeployment(deploymentId, validationConfig = {}) {
    this.logger.info(`Validating deployment: ${deploymentId}`);
    
    return this.executeRequest(async () => {
      const response = await this.httpClient.post(`/api/v1/deploy/${deploymentId}/validate`, {
        config: validationConfig
      });
      
      this.emit('deploymentValidated', { deploymentId, result: response.data });
      return response.data;
    });
  }

  /**
   * Get deployment logs
   */
  async getDeploymentLogs(deploymentId, options = {}) {
    return this.executeRequest(async () => {
      const response = await this.httpClient.get(`/api/v1/deploy/${deploymentId}/logs`, {
        params: options
      });
      return response.data;
    });
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const response = await this.httpClient.get('/api/v1/health', {
        timeout: 5000 // Shorter timeout for health checks
      });
      
      this.metrics.lastHealthCheck = Date.now();
      this.emit('healthCheckSuccess', response.data);
      
      return response.data;
    } catch (error) {
      this.logger.warn('Health check failed:', error.message);
      this.emit('healthCheckFailure', error);
      throw error;
    }
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    if (this.config.healthCheckInterval > 0) {
      this.healthCheckTimer = setInterval(async () => {
        try {
          await this.healthCheck();
        } catch (error) {
          // Health check failures are logged but don't stop monitoring
        }
      }, this.config.healthCheckInterval);
    }
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Generate session ID
   */
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get client metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      circuitBreaker: { ...this.circuitBreaker },
      activeRequests: this.activeRequests.size,
      config: {
        baseURL: this.config.baseURL,
        timeout: this.config.timeout,
        retryAttempts: this.config.retryAttempts
      }
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    this.logger.info('Cleaning up AgentAPI client');
    
    this.stopHealthMonitoring();
    
    // Wait for active requests to complete (with timeout)
    const timeout = 10000; // 10 seconds
    const startTime = Date.now();
    
    while (this.activeRequests.size > 0 && (Date.now() - startTime) < timeout) {
      await this.sleep(100);
    }
    
    if (this.activeRequests.size > 0) {
      this.logger.warn(`${this.activeRequests.size} requests still active during cleanup`);
    }
    
    this.removeAllListeners();
    this.emit('cleanup');
  }
}

export default AgentAPIClient;

