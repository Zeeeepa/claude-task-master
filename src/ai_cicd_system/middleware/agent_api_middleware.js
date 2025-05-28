/**
 * @fileoverview AgentAPI Middleware
 * @description Communication bridge between System Orchestrator and Claude Code
 */

import { log } from '../utils/simple_logger.js';
import { RequestTransformer } from './request_transformer.js';
import { SessionManager } from './session_manager.js';
import { ProtocolAdapter } from './protocol_adapter.js';
import { MessageQueue } from './message_queue.js';
import { WebSocketClient } from '../communication/websocket_client.js';
import { HTTPClient } from '../communication/http_client.js';

/**
 * AgentAPI Middleware - Main communication bridge
 */
export class AgentAPIMiddleware {
  constructor(config = {}) {
    this.config = {
      agentApiUrl: config.agentApiUrl || 'http://localhost:8000',
      apiKey: config.apiKey || process.env.AGENT_API_KEY,
      timeout: config.timeout || 120000, // 2 minutes
      retryAttempts: config.retryAttempts || 3,
      enableWebSocket: config.enableWebSocket !== false,
      enableStreaming: config.enableStreaming !== false,
      maxConcurrentRequests: config.maxConcurrentRequests || 10,
      ...config
    };
    
    this.requestTransformer = new RequestTransformer(this.config);
    this.sessionManager = new SessionManager(this.config);
    this.protocolAdapter = new ProtocolAdapter(this.config);
    this.messageQueue = new MessageQueue(this.config);
    this.communicationClient = null;
    
    this.activeRequests = new Map();
    this.requestHistory = [];
    this.isInitialized = false;
  }

  /**
   * Initialize the AgentAPI middleware
   */
  async initialize() {
    log('info', '🔗 Initializing AgentAPI middleware...');
    
    try {
      // Initialize communication client
      await this.initializeCommunicationClient();
      
      // Initialize session manager
      await this.sessionManager.initialize();
      
      // Initialize message queue
      await this.messageQueue.initialize();
      
      // Test connection to AgentAPI
      await this.testConnection();
      
      this.isInitialized = true;
      log('info', '✅ AgentAPI middleware initialized');
      
    } catch (error) {
      log('error', `❌ Failed to initialize AgentAPI middleware: ${error.message}`);
      throw error;
    }
  }

  /**
   * Initialize communication client based on configuration
   */
  async initializeCommunicationClient() {
    if (this.config.enableWebSocket) {
      this.communicationClient = new WebSocketClient(this.config);
    } else {
      this.communicationClient = new HTTPClient(this.config);
    }
    
    await this.communicationClient.initialize();
  }

  /**
   * Process task request through AgentAPI
   * @param {Object} task - Task to process
   * @param {Object} context - Processing context
   * @returns {Promise<Object>} Claude Code request
   */
  async processTaskRequest(task, context = {}) {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    log('info', `🔄 Processing task request: ${task.id} (${requestId})`);
    
    try {
      // Check concurrent request limit
      if (this.activeRequests.size >= this.config.maxConcurrentRequests) {
        throw new Error('Maximum concurrent requests reached');
      }
      
      // Track active request
      this.activeRequests.set(requestId, {
        taskId: task.id,
        startTime: Date.now(),
        status: 'processing'
      });
      
      // Step 1: Create or get session
      const session = await this.sessionManager.getOrCreateSession(task, context);
      
      // Step 2: Transform task to AgentAPI request
      const agentRequest = await this.requestTransformer.transformTaskToAgentRequest(task, {
        session,
        context,
        requestId
      });
      
      // Step 3: Send request to AgentAPI
      const agentResponse = await this.sendToAgentAPI(agentRequest);
      
      // Step 4: Transform response for Claude Code
      const claudeCodeRequest = await this.requestTransformer.transformAgentResponseToClaudeCode(
        agentResponse,
        { task, context, session }
      );
      
      // Step 5: Update session with results
      await this.sessionManager.updateSession(session.id, {
        lastRequest: agentRequest,
        lastResponse: agentResponse,
        claudeCodeRequest
      });
      
      // Update request tracking
      this.activeRequests.get(requestId).status = 'completed';
      this.activeRequests.get(requestId).result = claudeCodeRequest;
      
      // Move to history
      this.requestHistory.push(this.activeRequests.get(requestId));
      this.activeRequests.delete(requestId);
      
      log('info', `✅ Task request processed: ${task.id}`);
      return claudeCodeRequest;
      
    } catch (error) {
      // Update request tracking
      if (this.activeRequests.has(requestId)) {
        this.activeRequests.get(requestId).status = 'failed';
        this.activeRequests.get(requestId).error = error.message;
        
        // Move to history
        this.requestHistory.push(this.activeRequests.get(requestId));
        this.activeRequests.delete(requestId);
      }
      
      log('error', `❌ Task request failed: ${task.id}`, error);
      throw error;
    }
  }

  /**
   * Send request to AgentAPI
   * @param {Object} request - Request to send
   * @returns {Promise<Object>} AgentAPI response
   */
  async sendToAgentAPI(request) {
    log('info', `📤 Sending request to AgentAPI: ${request.type}`);
    
    try {
      const response = await this.communicationClient.send(request);
      
      log('info', `📥 Received response from AgentAPI: ${response.status}`);
      return response;
      
    } catch (error) {
      log('error', `❌ AgentAPI request failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process Claude Code response
   * @param {Object} response - Claude Code response
   * @param {Object} context - Processing context
   * @returns {Promise<Object>} AgentAPI update response
   */
  async processClaudeCodeResponse(response, context = {}) {
    log('info', `🔄 Processing Claude Code response: ${response.validationId}`);
    
    try {
      // Transform Claude Code response to AgentAPI format
      const agentUpdate = await this.requestTransformer.transformClaudeCodeResponseToAgent(
        response,
        context
      );
      
      // Send update to AgentAPI
      const updateResponse = await this.sendToAgentAPI(agentUpdate);
      
      // Update session
      if (context.sessionId) {
        await this.sessionManager.updateSession(context.sessionId, {
          claudeCodeResponse: response,
          agentUpdate: agentUpdate,
          updateResponse: updateResponse
        });
      }
      
      return updateResponse;
      
    } catch (error) {
      log('error', `❌ Claude Code response processing failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Test connection to AgentAPI
   * @returns {Promise<boolean>} Connection test result
   */
  async testConnection() {
    try {
      const testRequest = {
        type: 'health_check',
        timestamp: new Date().toISOString()
      };
      
      const response = await this.sendToAgentAPI(testRequest);
      
      if (response.status === 'ok') {
        log('info', '✅ AgentAPI connection test successful');
        return true;
      } else {
        throw new Error(`Unexpected response: ${response.status}`);
      }
      
    } catch (error) {
      log('error', `❌ AgentAPI connection test failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get middleware statistics
   * @returns {Object} Middleware statistics
   */
  getStatistics() {
    const totalRequests = this.requestHistory.length + this.activeRequests.size;
    const completedRequests = this.requestHistory.filter(r => r.status === 'completed').length;
    const failedRequests = this.requestHistory.filter(r => r.status === 'failed').length;
    
    return {
      active_requests: this.activeRequests.size,
      completed_requests: completedRequests,
      failed_requests: failedRequests,
      total_requests: totalRequests,
      success_rate: totalRequests > 0 ? (completedRequests / totalRequests) * 100 : 0,
      average_processing_time_ms: this._calculateAverageProcessingTime(),
      session_manager_stats: this.sessionManager.getStatistics(),
      communication_client_stats: this.communicationClient.getStatistics()
    };
  }

  /**
   * Get middleware health status
   * @returns {Object} Health status
   */
  getHealth() {
    return {
      status: this.isInitialized ? 'healthy' : 'not_initialized',
      active_requests: this.activeRequests.size,
      session_manager: this.sessionManager.getHealth(),
      communication_client: this.communicationClient.getHealth(),
      last_connection_test: this._getLastConnectionTest()
    };
  }

  /**
   * Shutdown the middleware
   */
  async shutdown() {
    log('info', '🔄 Shutting down AgentAPI middleware...');
    
    try {
      // Cancel all active requests
      for (const [requestId, request] of this.activeRequests) {
        request.status = 'cancelled';
        request.cancelledAt = new Date();
        this.requestHistory.push(request);
      }
      this.activeRequests.clear();
      
      // Shutdown components
      await this.sessionManager.shutdown();
      await this.messageQueue.shutdown();
      await this.communicationClient.shutdown();
      
      this.isInitialized = false;
      log('info', '✅ AgentAPI middleware shutdown complete');
      
    } catch (error) {
      log('error', `❌ Error during middleware shutdown: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate average processing time
   * @returns {number} Average processing time in milliseconds
   * @private
   */
  _calculateAverageProcessingTime() {
    const completedRequests = this.requestHistory.filter(r => 
      r.status === 'completed' && r.result?.processing_time_ms
    );
    
    if (completedRequests.length === 0) return 0;
    
    const totalTime = completedRequests.reduce((sum, r) => 
      sum + (Date.now() - r.startTime), 0
    );
    
    return totalTime / completedRequests.length;
  }

  /**
   * Get last connection test result
   * @returns {Object|null} Last connection test result
   * @private
   */
  _getLastConnectionTest() {
    // This would be implemented to track connection test history
    return {
      timestamp: new Date(),
      status: 'ok'
    };
  }
}

export default AgentAPIMiddleware;

