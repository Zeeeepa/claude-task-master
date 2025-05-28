/**
 * @fileoverview Codegen API Client with Authentication
 * @description Enhanced Codegen SDK integration for natural language to PR creation
 */

import { CodegenAgent, CodegenError } from '../../core/codegen_client.js';
import { createCodegenConfig } from '../../config/codegen_config.js';
import { log } from '../../utils/logger.js';

/**
 * Enhanced Codegen Client for Natural Language to PR Creation
 */
export class CodegenClient {
  constructor(config = {}) {
    this.config = createCodegenConfig(config);
    this.agent = null;
    this.isInitialized = false;
    this.requestCount = 0;
    this.lastRequestTime = null;
    
    log('debug', 'CodegenClient initialized', {
      mode: this.config.get('mode'),
      baseURL: this.config.get('api.baseURL')
    });
  }

  /**
   * Initialize the Codegen client with authentication
   */
  async initialize() {
    try {
      log('info', 'Initializing Codegen client...');
      
      // Validate configuration
      await this._validateConfig();
      
      // Initialize Codegen agent
      this.agent = new CodegenAgent({
        orgId: this.config.get('auth.orgId'),
        token: this.config.get('auth.token'),
        baseURL: this.config.get('api.baseURL'),
        timeout: this.config.get('api.timeout')
      });
      
      // Test connection if validation is enabled
      if (this.config.get('auth.validateOnInit')) {
        await this._testConnection();
      }
      
      this.isInitialized = true;
      log('info', 'Codegen client initialized successfully');
      
    } catch (error) {
      log('error', `Failed to initialize Codegen client: ${error.message}`);
      throw new CodegenError('CLIENT_INITIALIZATION_FAILED', error.message, error);
    }
  }

  /**
   * Create a PR from natural language description
   * @param {Object} request - PR creation request
   * @param {string} request.description - Natural language task description
   * @param {string} request.repository - Target repository
   * @param {Object} request.context - Additional context
   * @returns {Promise<Object>} PR creation result
   */
  async createPR(request) {
    this._ensureInitialized();
    
    try {
      log('info', `Creating PR for task: ${request.description.substring(0, 100)}...`);
      
      // Track request
      this._trackRequest();
      
      // Create task with Codegen
      const task = await this.agent.run(request.description, {
        repository: request.repository,
        context: request.context,
        timeout: this.config.get('polling.maxWaitTime')
      });
      
      // Wait for completion
      const result = await task.wait();
      
      log('info', `PR creation completed for task ${task.id}`);
      
      return {
        success: true,
        taskId: task.id,
        status: result.status,
        prUrl: result.pr_url,
        prNumber: result.pr_number,
        repository: request.repository,
        description: request.description,
        metadata: {
          createdAt: new Date().toISOString(),
          responseTime: result.response_time_ms,
          tokensUsed: result.tokens_used
        }
      };
      
    } catch (error) {
      log('error', `Failed to create PR: ${error.message}`);
      
      return {
        success: false,
        error: {
          type: error.code || 'UNKNOWN_ERROR',
          message: error.message,
          details: error.details
        },
        repository: request.repository,
        description: request.description
      };
    }
  }

  /**
   * Get task status
   * @param {string} taskId - Task ID
   * @returns {Promise<Object>} Task status
   */
  async getTaskStatus(taskId) {
    this._ensureInitialized();
    
    try {
      const task = await this.agent.getTask(taskId);
      return {
        id: task.id,
        status: task.status,
        progress: task.progress,
        error: task.error,
        result: task.result
      };
    } catch (error) {
      throw new CodegenError('TASK_STATUS_FETCH_FAILED', error.message, error);
    }
  }

  /**
   * Cancel a running task
   * @param {string} taskId - Task ID
   * @returns {Promise<boolean>} Success status
   */
  async cancelTask(taskId) {
    this._ensureInitialized();
    
    try {
      await this.agent.cancelTask(taskId);
      log('info', `Task ${taskId} cancelled successfully`);
      return true;
    } catch (error) {
      log('error', `Failed to cancel task ${taskId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Get client statistics
   * @returns {Object} Client statistics
   */
  getStatistics() {
    return {
      isInitialized: this.isInitialized,
      requestCount: this.requestCount,
      lastRequestTime: this.lastRequestTime,
      config: {
        mode: this.config.get('mode'),
        baseURL: this.config.get('api.baseURL'),
        rateLimitingEnabled: this.config.get('rateLimiting.enabled')
      }
    };
  }

  /**
   * Get client health status
   * @returns {Promise<Object>} Health status
   */
  async getHealth() {
    try {
      if (!this.isInitialized) {
        return { status: 'not_initialized', healthy: false };
      }
      
      // Test connection
      await this._testConnection();
      
      return {
        status: 'healthy',
        healthy: true,
        lastCheck: new Date().toISOString(),
        statistics: this.getStatistics()
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        healthy: false,
        error: error.message,
        lastCheck: new Date().toISOString()
      };
    }
  }

  /**
   * Shutdown the client
   */
  async shutdown() {
    log('info', 'Shutting down Codegen client...');
    
    this.isInitialized = false;
    this.agent = null;
    
    log('info', 'Codegen client shutdown complete');
  }

  // Private methods

  /**
   * Validate configuration
   * @private
   */
  async _validateConfig() {
    const errors = this.config.validate();
    if (errors.length > 0) {
      throw new CodegenError('INVALID_CONFIGURATION', 
        `Configuration validation failed: ${errors.join(', ')}`);
    }
  }

  /**
   * Test connection to Codegen API
   * @private
   */
  async _testConnection() {
    try {
      // Create a simple test task
      const testTask = await this.agent.run('Test connection', {
        timeout: 5000,
        test: true
      });
      
      log('debug', `Connection test successful: ${testTask.id}`);
      
    } catch (error) {
      throw new CodegenError('CONNECTION_TEST_FAILED', 
        `Failed to connect to Codegen API: ${error.message}`, error);
    }
  }

  /**
   * Ensure client is initialized
   * @private
   */
  _ensureInitialized() {
    if (!this.isInitialized) {
      throw new CodegenError('CLIENT_NOT_INITIALIZED', 
        'Codegen client must be initialized before use');
    }
  }

  /**
   * Track request for statistics
   * @private
   */
  _trackRequest() {
    this.requestCount++;
    this.lastRequestTime = new Date().toISOString();
  }
}

export default CodegenClient;

