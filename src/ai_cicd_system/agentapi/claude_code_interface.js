/**
 * Claude Code Interface
 * 
 * Provides HTTP API integration with Claude Code for PR validation
 * and automated code analysis within WSL2 instances.
 */

const axios = require('axios');
const { EventEmitter } = require('events');
const WebSocket = require('ws');

class ClaudeCodeInterface extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      apiUrl: 'http://localhost:3002',
      timeout: 180000, // 3 minutes
      retryAttempts: 3,
      retryDelay: 5000,
      websocketUrl: 'ws://localhost:3002/ws',
      ...config
    };

    this.activeSessions = new Map();
    this.requestQueue = [];
    this.isProcessingQueue = false;
    
    this.setupAxiosDefaults();
  }

  /**
   * Setup Axios default configuration
   */
  setupAxiosDefaults() {
    this.httpClient = axios.create({
      baseURL: this.config.apiUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AgentAPI-Middleware/1.0.0'
      }
    });

    // Request interceptor
    this.httpClient.interceptors.request.use(
      (config) => {
        console.log(`Claude Code API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('Claude Code API Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.httpClient.interceptors.response.use(
      (response) => {
        console.log(`Claude Code API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        console.error('Claude Code API Response Error:', error.response?.status, error.message);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Check if Claude Code API is available
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
      console.error('Claude Code health check failed:', error.message);
      return {
        available: false,
        error: error.message,
        status: error.response?.status || 'unknown'
      };
    }
  }

  /**
   * Start a new Claude Code session
   */
  async startSession(instanceId, workspacePath, options = {}) {
    try {
      console.log(`Starting Claude Code session for instance: ${instanceId}`);

      const sessionConfig = {
        workspace: workspacePath,
        instanceId,
        settings: {
          allowedTools: options.allowedTools || ['Bash', 'Edit', 'Replace', 'Create'],
          model: options.model || 'claude-3-sonnet',
          maxTokens: options.maxTokens || 4096,
          temperature: options.temperature || 0.1,
          ...options.settings
        },
        environment: {
          shell: '/bin/bash',
          workingDirectory: workspacePath,
          ...options.environment
        }
      };

      const response = await this.httpClient.post('/sessions', sessionConfig);
      const sessionId = response.data.sessionId;

      // Store session information
      const session = {
        id: sessionId,
        instanceId,
        workspacePath,
        startTime: new Date(),
        status: 'active',
        config: sessionConfig,
        messageHistory: [],
        websocket: null
      };

      this.activeSessions.set(sessionId, session);

      // Setup WebSocket connection for real-time updates
      await this.setupWebSocketConnection(sessionId);

      console.log(`Claude Code session started: ${sessionId}`);
      
      this.emit('sessionStarted', { sessionId, instanceId });
      
      return {
        success: true,
        sessionId,
        config: sessionConfig
      };
    } catch (error) {
      console.error(`Failed to start Claude Code session: ${error.message}`);
      throw new Error(`Session start failed: ${error.message}`);
    }
  }

  /**
   * Setup WebSocket connection for real-time session updates
   */
  async setupWebSocketConnection(sessionId) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const wsUrl = `${this.config.websocketUrl}/sessions/${sessionId}`;
      const ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        console.log(`WebSocket connected for session: ${sessionId}`);
        session.websocket = ws;
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWebSocketMessage(sessionId, message);
        } catch (error) {
          console.error(`Failed to parse WebSocket message: ${error.message}`);
        }
      });

      ws.on('error', (error) => {
        console.error(`WebSocket error for session ${sessionId}:`, error);
        this.emit('sessionError', { sessionId, error: error.message });
      });

      ws.on('close', () => {
        console.log(`WebSocket closed for session: ${sessionId}`);
        if (session.websocket === ws) {
          session.websocket = null;
        }
      });

      session.websocket = ws;
    } catch (error) {
      console.error(`Failed to setup WebSocket for session ${sessionId}: ${error.message}`);
    }
  }

  /**
   * Handle WebSocket messages
   */
  handleWebSocketMessage(sessionId, message) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    console.log(`WebSocket message for session ${sessionId}:`, message.type);

    switch (message.type) {
      case 'message':
        session.messageHistory.push(message.data);
        this.emit('sessionMessage', { sessionId, message: message.data });
        break;
      
      case 'status':
        session.status = message.data.status;
        this.emit('sessionStatusChange', { sessionId, status: message.data.status });
        break;
      
      case 'tool_execution':
        this.emit('toolExecution', { sessionId, tool: message.data });
        break;
      
      case 'error':
        this.emit('sessionError', { sessionId, error: message.data });
        break;
      
      case 'completion':
        this.emit('sessionCompletion', { sessionId, result: message.data });
        break;
      
      default:
        console.log(`Unknown WebSocket message type: ${message.type}`);
    }
  }

  /**
   * Send message to Claude Code session
   */
  async sendMessage(sessionId, message, options = {}) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      console.log(`Sending message to Claude Code session ${sessionId}: ${message.substring(0, 100)}...`);

      const messageData = {
        content: message,
        type: 'user',
        timestamp: new Date().toISOString(),
        ...options
      };

      const response = await this.httpClient.post(`/sessions/${sessionId}/messages`, messageData);
      
      // Add to message history
      session.messageHistory.push(messageData);
      
      this.emit('messageSent', { sessionId, message: messageData });
      
      return {
        success: true,
        messageId: response.data.messageId,
        response: response.data
      };
    } catch (error) {
      console.error(`Failed to send message to session ${sessionId}: ${error.message}`);
      throw new Error(`Message send failed: ${error.message}`);
    }
  }

  /**
   * Get session messages
   */
  async getSessionMessages(sessionId, options = {}) {
    try {
      const { limit = 50, offset = 0 } = options;
      
      const response = await this.httpClient.get(`/sessions/${sessionId}/messages`, {
        params: { limit, offset }
      });

      return {
        success: true,
        messages: response.data.messages,
        total: response.data.total
      };
    } catch (error) {
      console.error(`Failed to get messages for session ${sessionId}: ${error.message}`);
      throw new Error(`Get messages failed: ${error.message}`);
    }
  }

  /**
   * Get session status
   */
  async getSessionStatus(sessionId) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const response = await this.httpClient.get(`/sessions/${sessionId}/status`);
      
      // Update local session status
      session.status = response.data.status;
      session.lastChecked = new Date();

      return {
        success: true,
        status: response.data,
        localSession: {
          id: session.id,
          instanceId: session.instanceId,
          startTime: session.startTime,
          messageCount: session.messageHistory.length,
          websocketConnected: !!session.websocket
        }
      };
    } catch (error) {
      console.error(`Failed to get status for session ${sessionId}: ${error.message}`);
      throw new Error(`Get status failed: ${error.message}`);
    }
  }

  /**
   * Execute code validation task
   */
  async executeValidation(sessionId, validationTask, options = {}) {
    try {
      console.log(`Executing validation task for session ${sessionId}`);

      const {
        type = 'full_validation',
        files = [],
        testCommand,
        lintCommand,
        buildCommand,
        timeout = this.config.timeout
      } = validationTask;

      const taskData = {
        type,
        files,
        commands: {
          test: testCommand,
          lint: lintCommand,
          build: buildCommand
        },
        timeout,
        options: {
          stopOnError: options.stopOnError !== false,
          generateReport: options.generateReport !== false,
          ...options
        }
      };

      const response = await this.httpClient.post(`/sessions/${sessionId}/validate`, taskData);
      
      return {
        success: true,
        taskId: response.data.taskId,
        status: response.data.status
      };
    } catch (error) {
      console.error(`Validation execution failed for session ${sessionId}: ${error.message}`);
      throw new Error(`Validation failed: ${error.message}`);
    }
  }

  /**
   * Get validation results
   */
  async getValidationResults(sessionId, taskId) {
    try {
      const response = await this.httpClient.get(`/sessions/${sessionId}/validate/${taskId}`);
      
      return {
        success: true,
        results: response.data
      };
    } catch (error) {
      console.error(`Failed to get validation results: ${error.message}`);
      throw new Error(`Get validation results failed: ${error.message}`);
    }
  }

  /**
   * Execute code analysis
   */
  async executeAnalysis(sessionId, analysisTask, options = {}) {
    try {
      console.log(`Executing analysis task for session ${sessionId}`);

      const {
        type = 'code_review',
        scope = 'changed_files',
        focus = ['bugs', 'performance', 'security'],
        files = []
      } = analysisTask;

      const taskData = {
        type,
        scope,
        focus,
        files,
        options: {
          includeMetrics: options.includeMetrics !== false,
          generateSuggestions: options.generateSuggestions !== false,
          ...options
        }
      };

      const response = await this.httpClient.post(`/sessions/${sessionId}/analyze`, taskData);
      
      return {
        success: true,
        taskId: response.data.taskId,
        status: response.data.status
      };
    } catch (error) {
      console.error(`Analysis execution failed for session ${sessionId}: ${error.message}`);
      throw new Error(`Analysis failed: ${error.message}`);
    }
  }

  /**
   * Get analysis results
   */
  async getAnalysisResults(sessionId, taskId) {
    try {
      const response = await this.httpClient.get(`/sessions/${sessionId}/analyze/${taskId}`);
      
      return {
        success: true,
        results: response.data
      };
    } catch (error) {
      console.error(`Failed to get analysis results: ${error.message}`);
      throw new Error(`Get analysis results failed: ${error.message}`);
    }
  }

  /**
   * Stop a Claude Code session
   */
  async stopSession(sessionId) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        console.warn(`Session not found for stopping: ${sessionId}`);
        return { success: true, message: 'Session not found' };
      }

      console.log(`Stopping Claude Code session: ${sessionId}`);

      // Close WebSocket connection
      if (session.websocket) {
        session.websocket.close();
        session.websocket = null;
      }

      // Stop the session via API
      await this.httpClient.post(`/sessions/${sessionId}/stop`);

      // Remove from active sessions
      this.activeSessions.delete(sessionId);

      console.log(`Claude Code session stopped: ${sessionId}`);
      
      this.emit('sessionStopped', { sessionId });
      
      return { success: true };
    } catch (error) {
      console.error(`Failed to stop session ${sessionId}: ${error.message}`);
      throw new Error(`Session stop failed: ${error.message}`);
    }
  }

  /**
   * Execute command with retry logic
   */
  async executeWithRetry(operation, maxRetries = this.config.retryAttempts) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        console.warn(`Attempt ${attempt}/${maxRetries} failed: ${error.message}`);
        
        if (attempt < maxRetries) {
          const delay = this.config.retryDelay * attempt;
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions() {
    return Array.from(this.activeSessions.values()).map(session => ({
      id: session.id,
      instanceId: session.instanceId,
      workspacePath: session.workspacePath,
      startTime: session.startTime,
      status: session.status,
      messageCount: session.messageHistory.length,
      websocketConnected: !!session.websocket
    }));
  }

  /**
   * Get session by instance ID
   */
  getSessionByInstanceId(instanceId) {
    for (const session of this.activeSessions.values()) {
      if (session.instanceId === instanceId) {
        return session;
      }
    }
    return null;
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpiredSessions() {
    const now = Date.now();
    const expiredSessions = [];

    for (const [sessionId, session] of this.activeSessions.entries()) {
      const age = now - session.startTime.getTime();
      if (age > this.config.timeout) {
        expiredSessions.push(sessionId);
      }
    }

    for (const sessionId of expiredSessions) {
      console.log(`Cleaning up expired session: ${sessionId}`);
      await this.stopSession(sessionId).catch(console.error);
    }

    return expiredSessions.length;
  }

  /**
   * Cleanup all sessions
   */
  async cleanup() {
    console.log('Cleaning up all Claude Code sessions...');
    
    const sessionIds = Array.from(this.activeSessions.keys());
    await Promise.all(
      sessionIds.map(id => this.stopSession(id).catch(console.error))
    );

    console.log('Claude Code interface cleanup completed');
  }

  /**
   * Get interface statistics
   */
  getStatistics() {
    const sessions = Array.from(this.activeSessions.values());
    
    return {
      activeSessions: sessions.length,
      totalMessages: sessions.reduce((sum, s) => sum + s.messageHistory.length, 0),
      averageSessionAge: sessions.length > 0 ? 
        sessions.reduce((sum, s) => sum + (Date.now() - s.startTime.getTime()), 0) / sessions.length : 0,
      websocketConnections: sessions.filter(s => s.websocket).length,
      config: {
        apiUrl: this.config.apiUrl,
        timeout: this.config.timeout,
        retryAttempts: this.config.retryAttempts
      }
    };
  }
}

module.exports = ClaudeCodeInterface;

