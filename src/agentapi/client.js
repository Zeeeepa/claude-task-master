/**
 * AgentAPI Client for claude-task-master
 * 
 * Provides a client interface for communicating with the AgentAPI middleware
 * to deploy PRs and manage Claude Code instances on WSL2.
 */

import fetch from 'node-fetch';
import { WebSocketClient } from './websocket-client.js';
import { SimpleLogger } from '../ai_cicd_system/utils/simple_logger.js';
import { TaskQueue } from './message-queue.js';

export class AgentAPIClient {
  constructor(config = {}) {
    this.baseUrl = config.agentApiUrl || process.env.AGENTAPI_URL || 'http://localhost:3002';
    this.wsUrl = config.wsUrl || process.env.AGENTAPI_WS_URL || 'ws://localhost:3002/ws';
    this.apiKey = config.apiKey || process.env.AGENTAPI_TOKEN;
    this.timeout = config.timeout || 30000;
    
    this.logger = new SimpleLogger('AgentAPIClient');
    this.wsConnection = null;
    this.taskQueue = new TaskQueue();
    this.isConnected = false;
    
    // Initialize WebSocket connection if enabled
    if (config.enableWebSocket !== false) {
      this._initializeWebSocket();
    }
  }

  /**
   * Initialize WebSocket connection for real-time communication
   */
  async _initializeWebSocket() {
    try {
      this.wsConnection = new WebSocketClient(this.wsUrl, {
        apiKey: this.apiKey,
        logger: this.logger
      });

      await this.wsConnection.connect();
      this.isConnected = true;
      
      this.logger.info('WebSocket connection established with AgentAPI');
    } catch (error) {
      this.logger.error('Failed to establish WebSocket connection:', error);
      this.isConnected = false;
    }
  }

  /**
   * Deploy a PR to Claude Code via AgentAPI
   * @param {Object} prData - PR data from webhook
   * @returns {Promise<Object>} Deployment result
   */
  async deployPR(prData) {
    try {
      const deploymentRequest = {
        type: 'pr_deployment',
        repository: prData.repository.full_name,
        branch: prData.pull_request.head.ref,
        sha: prData.pull_request.head.sha,
        cloneUrl: prData.repository.clone_url,
        prNumber: prData.pull_request.number,
        timestamp: new Date().toISOString(),
        metadata: {
          title: prData.pull_request.title,
          author: prData.pull_request.user.login,
          baseBranch: prData.pull_request.base.ref
        }
      };

      this.logger.info(`Deploying PR #${prData.pull_request.number} to AgentAPI`, {
        repository: deploymentRequest.repository,
        branch: deploymentRequest.branch,
        sha: deploymentRequest.sha
      });

      const result = await this.submitTask(deploymentRequest);
      
      // Add to task queue for tracking
      await this.taskQueue.enqueue({
        taskId: result.taskId,
        type: 'pr_deployment',
        prNumber: prData.pull_request.number,
        repository: deploymentRequest.repository,
        status: 'submitted',
        submittedAt: new Date().toISOString()
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to deploy PR:', error);
      throw new Error(`PR deployment failed: ${error.message}`);
    }
  }

  /**
   * Submit a task to AgentAPI for Claude Code processing
   * @param {Object} task - Task data
   * @returns {Promise<Object>} Task submission result
   */
  async submitTask(task) {
    try {
      const response = await this._makeRequest('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(task)
      });

      if (!response.ok) {
        throw new Error(`AgentAPI request failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      this.logger.info(`Task submitted successfully`, {
        taskId: result.taskId,
        type: task.type,
        status: result.status
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to submit task to AgentAPI:', error);
      throw error;
    }
  }

  /**
   * Get task status from AgentAPI
   * @param {string} taskId - Task ID
   * @returns {Promise<Object>} Task status
   */
  async getTaskStatus(taskId) {
    try {
      const response = await this._makeRequest(`/api/tasks/${taskId}/status`);
      
      if (!response.ok) {
        throw new Error(`Failed to get task status: ${response.status} ${response.statusText}`);
      }

      const status = await response.json();
      
      this.logger.debug(`Retrieved task status`, {
        taskId,
        status: status.status,
        progress: status.progress
      });

      return status;
    } catch (error) {
      this.logger.error(`Failed to get task status for ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Get all tasks with optional filtering
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} List of tasks
   */
  async getTasks(filters = {}) {
    try {
      const queryParams = new URLSearchParams(filters).toString();
      const url = `/api/tasks${queryParams ? `?${queryParams}` : ''}`;
      
      const response = await this._makeRequest(url);
      
      if (!response.ok) {
        throw new Error(`Failed to get tasks: ${response.status} ${response.statusText}`);
      }

      const tasks = await response.json();
      return tasks;
    } catch (error) {
      this.logger.error('Failed to get tasks:', error);
      throw error;
    }
  }

  /**
   * Cancel a running task
   * @param {string} taskId - Task ID to cancel
   * @returns {Promise<Object>} Cancellation result
   */
  async cancelTask(taskId) {
    try {
      const response = await this._makeRequest(`/api/tasks/${taskId}/cancel`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error(`Failed to cancel task: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      this.logger.info(`Task cancelled successfully`, {
        taskId,
        status: result.status
      });

      return result;
    } catch (error) {
      this.logger.error(`Failed to cancel task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Get AgentAPI health status
   * @returns {Promise<Object>} Health status
   */
  async getHealth() {
    try {
      const response = await this._makeRequest('/health');
      
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
      }

      const health = await response.json();
      return health;
    } catch (error) {
      this.logger.error('Health check failed:', error);
      throw error;
    }
  }

  /**
   * Get WSL2 instance status
   * @returns {Promise<Object>} Instance status
   */
  async getInstanceStatus() {
    try {
      const response = await this._makeRequest('/api/instances/status');
      
      if (!response.ok) {
        throw new Error(`Failed to get instance status: ${response.status} ${response.statusText}`);
      }

      const status = await response.json();
      return status;
    } catch (error) {
      this.logger.error('Failed to get instance status:', error);
      throw error;
    }
  }

  /**
   * Subscribe to real-time task updates via WebSocket
   * @param {string} taskId - Task ID to subscribe to
   * @param {Function} callback - Callback for updates
   */
  async subscribeToTask(taskId, callback) {
    if (!this.wsConnection || !this.isConnected) {
      throw new Error('WebSocket connection not available');
    }

    try {
      await this.wsConnection.subscribe(`task:${taskId}`, callback);
      this.logger.info(`Subscribed to task updates: ${taskId}`);
    } catch (error) {
      this.logger.error(`Failed to subscribe to task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Unsubscribe from task updates
   * @param {string} taskId - Task ID to unsubscribe from
   */
  async unsubscribeFromTask(taskId) {
    if (!this.wsConnection || !this.isConnected) {
      return;
    }

    try {
      await this.wsConnection.unsubscribe(`task:${taskId}`);
      this.logger.info(`Unsubscribed from task updates: ${taskId}`);
    } catch (error) {
      this.logger.error(`Failed to unsubscribe from task ${taskId}:`, error);
    }
  }

  /**
   * Make HTTP request to AgentAPI
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Request options
   * @returns {Promise<Response>} Fetch response
   */
  async _makeRequest(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'claude-task-master/1.0.0',
      ...options.headers
    };

    // Add API key if available
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const requestOptions = {
      timeout: this.timeout,
      headers,
      ...options
    };

    this.logger.debug(`Making request to AgentAPI`, {
      method: requestOptions.method || 'GET',
      url,
      hasAuth: !!this.apiKey
    });

    return fetch(url, requestOptions);
  }

  /**
   * Close connections and cleanup
   */
  async close() {
    try {
      if (this.wsConnection) {
        await this.wsConnection.close();
        this.wsConnection = null;
      }
      
      this.isConnected = false;
      this.logger.info('AgentAPI client closed');
    } catch (error) {
      this.logger.error('Error closing AgentAPI client:', error);
    }
  }

  /**
   * Get connection status
   * @returns {Object} Connection status
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      baseUrl: this.baseUrl,
      wsUrl: this.wsUrl,
      hasApiKey: !!this.apiKey,
      wsConnected: this.wsConnection ? this.wsConnection.isConnected() : false
    };
  }
}

export default AgentAPIClient;

