/**
 * Enhanced AgentAPI Middleware Client
 * 
 * Comprehensive integration layer between claude-task-master and agentapi middleware,
 * enabling seamless AI agent communication, session management, and real-time status monitoring.
 */

import EventEmitter from 'events';
import WebSocket from 'ws';
import axios from 'axios';
import { AgentPoolManager } from './agent_pool_manager.js';
import { SessionManager } from './session_manager.js';
import { HealthMonitor } from './health_monitor.js';
import { MessageQueue } from './message_queue.js';
import { MetricsCollector } from './metrics_collector.js';

export class EnhancedMiddlewareClient extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      baseUrl: config.baseUrl || 'http://localhost:3284',
      wsUrl: config.wsUrl || 'ws://localhost:3284/ws',
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      heartbeatInterval: config.heartbeatInterval || 30000,
      maxConcurrentSessions: config.maxConcurrentSessions || 10,
      enableMetrics: config.enableMetrics !== false,
      enableHealthChecks: config.enableHealthChecks !== false,
      ...config
    };

    // Initialize core components
    this.agentPool = new AgentPoolManager(this.config);
    this.sessionManager = new SessionManager(this.config);
    this.healthMonitor = new HealthMonitor(this.config);
    this.messageQueue = new MessageQueue(this.config);
    this.metrics = new MetricsCollector(this.config);

    // Connection state
    this.isConnected = false;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;

    // Bind event handlers
    this._setupEventHandlers();
  }

  /**
   * Initialize the middleware client and establish connections
   */
  async initialize() {
    try {
      console.log('🚀 Initializing Enhanced AgentAPI Middleware Client...');

      // Initialize core components
      await this.agentPool.initialize();
      await this.sessionManager.initialize();
      await this.messageQueue.initialize();

      if (this.config.enableMetrics) {
        await this.metrics.initialize();
      }

      if (this.config.enableHealthChecks) {
        await this.healthMonitor.initialize();
        this.healthMonitor.startMonitoring();
      }

      // Establish WebSocket connection
      await this._connectWebSocket();

      // Start heartbeat
      this._startHeartbeat();

      console.log('✅ Enhanced AgentAPI Middleware Client initialized successfully');
      this.emit('initialized');

      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Enhanced AgentAPI Middleware Client:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Create a new agent session
   */
  async createSession(agentType, options = {}) {
    try {
      const startTime = Date.now();
      
      // Validate agent type
      if (!this.agentPool.isAgentTypeSupported(agentType)) {
        throw new Error(`Unsupported agent type: ${agentType}`);
      }

      // Check agent availability
      const agent = await this.agentPool.getAvailableAgent(agentType);
      if (!agent) {
        throw new Error(`No available agents of type: ${agentType}`);
      }

      // Create session
      const session = await this.sessionManager.createSession(agentType, {
        agentId: agent.id,
        ...options
      });

      // Start agent session via HTTP API
      const response = await this._makeRequest('POST', '/sessions', {
        agentType,
        sessionId: session.id,
        options
      });

      session.agentSessionId = response.data.sessionId;
      session.status = 'active';

      // Update metrics
      if (this.config.enableMetrics) {
        this.metrics.recordSessionCreated(agentType, Date.now() - startTime);
      }

      console.log(`✅ Created session ${session.id} for agent ${agentType}`);
      this.emit('sessionCreated', session);

      return session;
    } catch (error) {
      console.error('❌ Failed to create session:', error);
      this.emit('sessionError', error);
      throw error;
    }
  }

  /**
   * Send a message to an agent session
   */
  async sendMessage(sessionId, message, options = {}) {
    try {
      const startTime = Date.now();
      
      const session = await this.sessionManager.getSession(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      if (session.status !== 'active') {
        throw new Error(`Session ${sessionId} is not active`);
      }

      // Queue message for processing
      const messageId = await this.messageQueue.enqueue({
        sessionId,
        agentSessionId: session.agentSessionId,
        message,
        options,
        timestamp: Date.now()
      });

      // Send via WebSocket if connected, otherwise use HTTP
      let response;
      if (this.isConnected && this.ws) {
        response = await this._sendWebSocketMessage({
          type: 'message',
          sessionId: session.agentSessionId,
          message,
          messageId,
          ...options
        });
      } else {
        response = await this._makeRequest('POST', `/sessions/${session.agentSessionId}/messages`, {
          message,
          messageId,
          ...options
        });
      }

      // Update session activity
      await this.sessionManager.updateSessionActivity(sessionId);

      // Update metrics
      if (this.config.enableMetrics) {
        this.metrics.recordMessageSent(session.agentType, Date.now() - startTime);
      }

      console.log(`📤 Sent message to session ${sessionId}`);
      this.emit('messageSent', { sessionId, messageId, response });

      return { messageId, response };
    } catch (error) {
      console.error('❌ Failed to send message:', error);
      this.emit('messageError', error);
      throw error;
    }
  }

  /**
   * Get agent status and availability
   */
  async getAgentStatus(agentType = null) {
    try {
      if (agentType) {
        return await this.agentPool.getAgentStatus(agentType);
      } else {
        return await this.agentPool.getAllAgentStatus();
      }
    } catch (error) {
      console.error('❌ Failed to get agent status:', error);
      throw error;
    }
  }

  /**
   * Close a session
   */
  async closeSession(sessionId) {
    try {
      const session = await this.sessionManager.getSession(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      // Close agent session
      if (session.agentSessionId) {
        await this._makeRequest('DELETE', `/sessions/${session.agentSessionId}`);
      }

      // Update session status
      await this.sessionManager.closeSession(sessionId);

      // Release agent
      await this.agentPool.releaseAgent(session.agentId);

      console.log(`✅ Closed session ${sessionId}`);
      this.emit('sessionClosed', sessionId);

      return true;
    } catch (error) {
      console.error('❌ Failed to close session:', error);
      this.emit('sessionError', error);
      throw error;
    }
  }

  /**
   * Get comprehensive system metrics
   */
  async getMetrics() {
    if (!this.config.enableMetrics) {
      throw new Error('Metrics collection is disabled');
    }

    return {
      agents: await this.agentPool.getMetrics(),
      sessions: await this.sessionManager.getMetrics(),
      messages: await this.messageQueue.getMetrics(),
      health: await this.healthMonitor.getMetrics(),
      performance: await this.metrics.getMetrics()
    };
  }

  /**
   * Shutdown the client gracefully
   */
  async shutdown() {
    try {
      console.log('🔄 Shutting down Enhanced AgentAPI Middleware Client...');

      // Stop heartbeat
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
      }

      // Close WebSocket connection
      if (this.ws) {
        this.ws.close();
      }

      // Stop health monitoring
      if (this.healthMonitor) {
        await this.healthMonitor.stopMonitoring();
      }

      // Close all active sessions
      await this.sessionManager.closeAllSessions();

      // Shutdown components
      await this.agentPool.shutdown();
      await this.messageQueue.shutdown();
      
      if (this.config.enableMetrics) {
        await this.metrics.shutdown();
      }

      console.log('✅ Enhanced AgentAPI Middleware Client shutdown complete');
      this.emit('shutdown');

      return true;
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      throw error;
    }
  }

  // Private methods

  _setupEventHandlers() {
    // Agent pool events
    this.agentPool.on('agentAvailable', (agent) => {
      this.emit('agentAvailable', agent);
    });

    this.agentPool.on('agentUnavailable', (agent) => {
      this.emit('agentUnavailable', agent);
    });

    // Session manager events
    this.sessionManager.on('sessionTimeout', (sessionId) => {
      this.emit('sessionTimeout', sessionId);
    });

    // Health monitor events
    this.healthMonitor.on('healthCheck', (status) => {
      this.emit('healthCheck', status);
    });

    this.healthMonitor.on('agentDown', (agentType) => {
      this.emit('agentDown', agentType);
    });

    // Message queue events
    this.messageQueue.on('messageProcessed', (message) => {
      this.emit('messageProcessed', message);
    });

    this.messageQueue.on('messageError', (error) => {
      this.emit('messageError', error);
    });
  }

  async _connectWebSocket() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.wsUrl);

        this.ws.on('open', () => {
          console.log('🔗 WebSocket connected to AgentAPI');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            this._handleWebSocketMessage(message);
          } catch (error) {
            console.error('❌ Failed to parse WebSocket message:', error);
          }
        });

        this.ws.on('close', () => {
          console.log('🔌 WebSocket disconnected from AgentAPI');
          this.isConnected = false;
          this.emit('disconnected');
          this._handleReconnection();
        });

        this.ws.on('error', (error) => {
          console.error('❌ WebSocket error:', error);
          this.emit('error', error);
          reject(error);
        });

        // Connection timeout
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('WebSocket connection timeout'));
          }
        }, this.config.timeout);

      } catch (error) {
        reject(error);
      }
    });
  }

  _handleWebSocketMessage(message) {
    switch (message.type) {
      case 'response':
        this.emit('messageResponse', message);
        break;
      case 'status':
        this.emit('agentStatus', message);
        break;
      case 'error':
        this.emit('agentError', message);
        break;
      case 'heartbeat':
        this.emit('heartbeat', message);
        break;
      default:
        console.warn('Unknown WebSocket message type:', message.type);
    }
  }

  async _sendWebSocketMessage(message) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || !this.ws) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const messageId = message.messageId || Date.now().toString();
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket message timeout'));
      }, this.config.timeout);

      const responseHandler = (response) => {
        if (response.messageId === messageId) {
          clearTimeout(timeout);
          this.off('messageResponse', responseHandler);
          resolve(response);
        }
      };

      this.on('messageResponse', responseHandler);
      this.ws.send(JSON.stringify({ ...message, messageId }));
    });
  }

  async _handleReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      this.emit('reconnectionFailed');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.retryDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms...`);
    
    setTimeout(async () => {
      try {
        await this._connectWebSocket();
      } catch (error) {
        console.error('❌ Reconnection failed:', error);
        this._handleReconnection();
      }
    }, delay);
  }

  _startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected && this.ws) {
        this.ws.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
      }
    }, this.config.heartbeatInterval);
  }

  async _makeRequest(method, endpoint, data = null) {
    const config = {
      method,
      url: `${this.config.baseUrl}${endpoint}`,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (data) {
      config.data = data;
    }

    let lastError;
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const response = await axios(config);
        return response;
      } catch (error) {
        lastError = error;
        if (attempt < this.config.retryAttempts) {
          const delay = this.config.retryDelay * attempt;
          console.warn(`⚠️ Request failed (attempt ${attempt}), retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }
}

export default EnhancedMiddlewareClient;

