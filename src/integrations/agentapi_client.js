/**
 * @fileoverview AgentAPI Client
 * @description HTTP client for controlling Claude Code via AgentAPI interface
 */

import axios from 'axios';
import { CodegenErrorHandler } from '../ai_cicd_system/core/error_handler.js';

/**
 * Circuit breaker implementation for AgentAPI
 */
class CircuitBreaker {
  constructor(config = {}) {
    this.failureThreshold = config.failureThreshold || 5;
    this.recoveryTimeout = config.recoveryTimeout || 60000;
    this.name = config.name || 'circuit-breaker';
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
  }

  isOpen() {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.recoveryTimeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess() {
    this.failures = 0;
    this.lastFailureTime = null;
    
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 2) {
        this.state = 'CLOSED';
      }
    }
  }

  recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  getStatus() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      successCount: this.successCount
    };
  }
}

/**
 * Error handler wrapper for AgentAPI operations
 */
class ErrorHandler {
  constructor(config = {}) {
    this.codegenErrorHandler = new CodegenErrorHandler({
      enableRetry: config.enableRetry !== false,
      enableCircuitBreaker: config.enableCircuitBreaker !== false,
      defaultPolicy: config.defaultPolicy || 'API_CALLS',
      maxRetries: config.maxRetries || 3,
      baseDelay: config.baseDelay || 1000
    });
  }

  async executeWithProtection(operation, context = {}) {
    try {
      const result = await operation();
      return result;
    } catch (error) {
      // Use the existing Codegen error handler
      const handlingResult = await this.codegenErrorHandler.handleError(error, context);
      
      // If there's a fallback, use it
      if (context.fallback && typeof context.fallback === 'function') {
        return context.fallback();
      }
      
      // Re-throw if no fallback
      throw error;
    }
  }
}

/**
 * AgentAPI Client for controlling Claude Code instances
 */
export class AgentAPIClient {
  constructor(config = {}) {
    this.baseURL = config.baseURL || 'http://localhost:3284';
    this.timeout = config.timeout || 30000;
    this.maxRetries = config.maxRetries || 3;
    
    this.errorHandler = new ErrorHandler({
      enableRetry: true,
      enableCircuitBreaker: true,
      defaultPolicy: 'API_CALLS',
      maxRetries: this.maxRetries
    });
    
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      recoveryTimeout: 60000,
      name: 'agentapi-client'
    });
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Add request interceptor for circuit breaker
    this.client.interceptors.request.use(
      (config) => {
        if (this.circuitBreaker.isOpen()) {
          throw new Error('Circuit breaker is open - AgentAPI unavailable');
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor for circuit breaker
    this.client.interceptors.response.use(
      (response) => {
        this.circuitBreaker.recordSuccess();
        return response;
      },
      (error) => {
        this.circuitBreaker.recordFailure();
        return Promise.reject(error);
      }
    );
  }

  /**
   * Send a message to the Claude Code agent
   * @param {string} content - Message content
   * @param {string} type - Message type (default: 'user')
   * @returns {Promise<Object>} Response data
   */
  async sendMessage(content, type = 'user') {
    return this.errorHandler.executeWithProtection(
      async () => {
        const response = await this.client.post('/message', {
          content,
          type
        });
        return response.data;
      },
      { 
        component: 'agentapi',
        operation: 'send_message',
        fallback: () => ({ error: 'AgentAPI unavailable' })
      }
    );
  }

  /**
   * Get all messages from the agent conversation
   * @returns {Promise<Array>} Array of messages
   */
  async getMessages() {
    return this.errorHandler.executeWithProtection(
      async () => {
        const response = await this.client.get('/messages');
        return response.data;
      },
      { component: 'agentapi', operation: 'get_messages' }
    );
  }

  /**
   * Get the current status of the agent
   * @returns {Promise<Object>} Agent status
   */
  async getStatus() {
    return this.errorHandler.executeWithProtection(
      async () => {
        const response = await this.client.get('/status');
        return response.data;
      },
      { component: 'agentapi', operation: 'get_status' }
    );
  }

  /**
   * Wait for the agent to complete its current operation
   * @param {number} timeoutMs - Timeout in milliseconds (default: 300000)
   * @returns {Promise<boolean>} True if completed, throws on timeout
   */
  async waitForCompletion(timeoutMs = 300000) {
    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const status = await this.getStatus();
        
        if (status.status === 'stable' || status.status === 'idle') {
          return true;
        }
        
        // If status indicates error, throw immediately
        if (status.status === 'error') {
          throw new Error(`Agent error: ${status.error || 'Unknown error'}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } catch (error) {
        // If it's a timeout or circuit breaker error, continue polling
        if (error.message.includes('Circuit breaker') || error.code === 'ECONNREFUSED') {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          continue;
        }
        throw error;
      }
    }
    
    throw new Error('Agent operation timeout');
  }

  /**
   * Clear the agent's conversation history
   * @returns {Promise<Object>} Response data
   */
  async clearMessages() {
    return this.errorHandler.executeWithProtection(
      async () => {
        const response = await this.client.delete('/messages');
        return response.data;
      },
      { component: 'agentapi', operation: 'clear_messages' }
    );
  }

  /**
   * Get agent health information
   * @returns {Promise<Object>} Health status
   */
  async getHealth() {
    return this.errorHandler.executeWithProtection(
      async () => {
        const response = await this.client.get('/health');
        return response.data;
      },
      { 
        component: 'agentapi', 
        operation: 'get_health',
        fallback: () => ({ status: 'unknown', healthy: false })
      }
    );
  }

  /**
   * Get circuit breaker status
   * @returns {Object} Circuit breaker status
   */
  getCircuitBreakerStatus() {
    return this.circuitBreaker.getStatus();
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker() {
    this.circuitBreaker.state = 'CLOSED';
    this.circuitBreaker.failures = 0;
    this.circuitBreaker.lastFailureTime = null;
    this.circuitBreaker.successCount = 0;
  }
}

export default AgentAPIClient;

