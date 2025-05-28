/**
 * Goose Adapter
 * 
 * Specialized adapter for integrating with Goose agent through AgentAPI.
 * Handles Goose specific message formatting, session management, and tool interactions.
 */

import EventEmitter from 'events';
import axios from 'axios';

export class GooseAdapter extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      agentType: 'goose',
      baseUrl: config.baseUrl || 'http://localhost:3284',
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      provider: config.provider || 'anthropic',
      model: config.model || 'claude-3-5-sonnet-20241022',
      ...config
    };

    // Goose specific settings
    this.gooseSettings = {
      profile: config.profile || 'default',
      toolkits: config.toolkits || ['developer', 'screen'],
      planMode: config.planMode || 'auto',
      sessionType: 'interactive',
      messageFormat: 'goose'
    };

    // Session state
    this.activeSessions = new Map();
    this.sessionMetrics = new Map();
    this.planHistory = new Map();
  }

  /**
   * Initialize the Goose adapter
   */
  async initialize() {
    try {
      console.log('🚀 Initializing Goose Adapter...');

      // Verify AgentAPI connection
      await this._verifyConnection();

      // Validate Goose availability
      await this._validateGooseAvailability();

      console.log('✅ Goose Adapter initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Goose Adapter:', error);
      throw error;
    }
  }

  /**
   * Create a new Goose session
   */
  async createSession(options = {}) {
    try {
      const sessionConfig = {
        agentType: this.config.agentType,
        provider: options.provider || this.config.provider,
        model: options.model || this.config.model,
        profile: options.profile || this.gooseSettings.profile,
        toolkits: options.toolkits || this.gooseSettings.toolkits,
        planMode: options.planMode || this.gooseSettings.planMode,
        workingDirectory: options.workingDirectory || process.cwd(),
        ...options
      };

      // Create session via AgentAPI
      const response = await this._makeRequest('POST', '/sessions', sessionConfig);
      const sessionId = response.data.sessionId;

      // Store session info
      const sessionInfo = {
        id: sessionId,
        config: sessionConfig,
        created: Date.now(),
        lastActivity: Date.now(),
        messageCount: 0,
        status: 'active',
        currentPlan: null,
        planSteps: []
      };

      this.activeSessions.set(sessionId, sessionInfo);
      this.sessionMetrics.set(sessionId, {
        messagesProcessed: 0,
        totalResponseTime: 0,
        averageResponseTime: 0,
        errors: 0,
        plansCreated: 0,
        stepsCompleted: 0,
        toolkitUsage: {}
      });
      this.planHistory.set(sessionId, []);

      console.log(`✅ Created Goose session: ${sessionId}`);
      this.emit('sessionCreated', sessionInfo);

      return sessionInfo;
    } catch (error) {
      console.error('❌ Failed to create Goose session:', error);
      throw error;
    }
  }

  /**
   * Send a message to Goose
   */
  async sendMessage(sessionId, message, options = {}) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const startTime = Date.now();

      // Format message for Goose
      const formattedMessage = this._formatMessageForGoose(message, options);

      // Send message via AgentAPI
      const response = await this._makeRequest('POST', `/sessions/${sessionId}/messages`, {
        message: formattedMessage,
        options: {
          stream: options.stream || false,
          planMode: options.planMode || session.config.planMode,
          toolkits: options.toolkits || session.config.toolkits,
          ...options
        }
      });

      const responseTime = Date.now() - startTime;

      // Update session metrics
      this._updateSessionMetrics(sessionId, responseTime, true);

      // Update session activity
      session.lastActivity = Date.now();
      session.messageCount++;

      // Parse and format response
      const formattedResponse = this._formatGooseResponse(response.data);

      // Handle plan updates
      if (formattedResponse.plan) {
        this._updateSessionPlan(sessionId, formattedResponse.plan);
      }

      console.log(`📤 Sent message to Goose session ${sessionId} (${responseTime}ms)`);
      this.emit('messageProcessed', {
        sessionId,
        message: formattedMessage,
        response: formattedResponse,
        responseTime
      });

      return formattedResponse;
    } catch (error) {
      console.error('❌ Failed to send message to Goose:', error);
      this._updateSessionMetrics(sessionId, 0, false);
      this.emit('messageError', { sessionId, error });
      throw error;
    }
  }

  /**
   * Execute a plan with Goose
   */
  async executePlan(sessionId, planDescription, options = {}) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const planMessage = this._formatPlanMessage(planDescription, options);
      const response = await this.sendMessage(sessionId, planMessage, {
        ...options,
        planMode: 'execute',
        expectPlan: true
      });

      // Track plan execution
      const metrics = this.sessionMetrics.get(sessionId);
      if (metrics) {
        metrics.plansCreated++;
      }

      this.emit('planExecuted', { sessionId, plan: response.plan });
      return response;
    } catch (error) {
      console.error('❌ Failed to execute plan:', error);
      throw error;
    }
  }

  /**
   * Get current plan status
   */
  async getPlanStatus(sessionId) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const planHistory = this.planHistory.get(sessionId) || [];
      
      return {
        currentPlan: session.currentPlan,
        planSteps: session.planSteps,
        planHistory,
        completedSteps: session.planSteps.filter(step => step.status === 'completed').length,
        totalSteps: session.planSteps.length,
        planProgress: session.planSteps.length > 0 ? 
          session.planSteps.filter(step => step.status === 'completed').length / session.planSteps.length : 0
      };
    } catch (error) {
      console.error('❌ Failed to get plan status:', error);
      throw error;
    }
  }

  /**
   * Use a specific toolkit
   */
  async useToolkit(sessionId, toolkitName, action, parameters = {}) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      // Validate toolkit is available
      if (!session.config.toolkits.includes(toolkitName)) {
        throw new Error(`Toolkit not available: ${toolkitName}`);
      }

      const toolkitMessage = this._formatToolkitMessage(toolkitName, action, parameters);
      const response = await this.sendMessage(sessionId, toolkitMessage, {
        toolkit: toolkitName,
        action,
        parameters
      });

      // Track toolkit usage
      const metrics = this.sessionMetrics.get(sessionId);
      if (metrics) {
        metrics.toolkitUsage[toolkitName] = (metrics.toolkitUsage[toolkitName] || 0) + 1;
      }

      return response;
    } catch (error) {
      console.error('❌ Failed to use toolkit:', error);
      throw error;
    }
  }

  /**
   * Get session status and metrics
   */
  async getSessionStatus(sessionId) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const metrics = this.sessionMetrics.get(sessionId);
      const planStatus = await this.getPlanStatus(sessionId);

      // Get current status from AgentAPI
      const response = await this._makeRequest('GET', `/sessions/${sessionId}/status`);

      return {
        ...session,
        agentStatus: response.data,
        metrics,
        planStatus,
        uptime: Date.now() - session.created,
        idleTime: Date.now() - session.lastActivity
      };
    } catch (error) {
      console.error('❌ Failed to get session status:', error);
      throw error;
    }
  }

  /**
   * Close a Goose session
   */
  async closeSession(sessionId) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      // Close session via AgentAPI
      await this._makeRequest('DELETE', `/sessions/${sessionId}`);

      // Update session status
      session.status = 'closed';
      session.closed = Date.now();

      // Clean up
      this.activeSessions.delete(sessionId);
      const finalMetrics = this.sessionMetrics.get(sessionId);
      this.sessionMetrics.delete(sessionId);
      this.planHistory.delete(sessionId);

      console.log(`✅ Closed Goose session: ${sessionId}`);
      this.emit('sessionClosed', { sessionId, metrics: finalMetrics });

      return true;
    } catch (error) {
      console.error('❌ Failed to close Goose session:', error);
      throw error;
    }
  }

  /**
   * Get adapter metrics
   */
  async getMetrics() {
    const activeSessions = Array.from(this.activeSessions.values());
    const allMetrics = Array.from(this.sessionMetrics.values());

    return {
      agentType: this.config.agentType,
      activeSessions: activeSessions.length,
      totalSessions: activeSessions.length,
      averageResponseTime: this._calculateAverageResponseTime(allMetrics),
      totalMessages: allMetrics.reduce((sum, m) => sum + m.messagesProcessed, 0),
      totalErrors: allMetrics.reduce((sum, m) => sum + m.errors, 0),
      totalPlans: allMetrics.reduce((sum, m) => sum + m.plansCreated, 0),
      totalSteps: allMetrics.reduce((sum, m) => sum + m.stepsCompleted, 0),
      toolkitUsage: this._aggregateToolkitUsage(allMetrics),
      sessionDurations: activeSessions.map(s => Date.now() - s.created),
      lastActivity: Math.max(...activeSessions.map(s => s.lastActivity), 0)
    };
  }

  /**
   * Shutdown the adapter
   */
  async shutdown() {
    try {
      console.log('🔄 Shutting down Goose Adapter...');

      // Close all active sessions
      const closePromises = Array.from(this.activeSessions.keys()).map(sessionId =>
        this.closeSession(sessionId).catch(error => 
          console.error(`Error closing session ${sessionId}:`, error)
        )
      );

      await Promise.allSettled(closePromises);

      // Clear all data
      this.activeSessions.clear();
      this.sessionMetrics.clear();
      this.planHistory.clear();

      console.log('✅ Goose Adapter shutdown complete');
      return true;
    } catch (error) {
      console.error('❌ Error during Goose Adapter shutdown:', error);
      throw error;
    }
  }

  // Private methods

  async _verifyConnection() {
    try {
      const response = await this._makeRequest('GET', '/health');
      if (response.status !== 200) {
        throw new Error(`AgentAPI health check failed: ${response.status}`);
      }
    } catch (error) {
      throw new Error(`Cannot connect to AgentAPI: ${error.message}`);
    }
  }

  async _validateGooseAvailability() {
    try {
      const response = await this._makeRequest('GET', '/agents/goose/status');
      if (!response.data.available) {
        throw new Error('Goose agent is not available');
      }
    } catch (error) {
      console.warn('⚠️ Could not verify Goose availability:', error.message);
    }
  }

  _formatMessageForGoose(message, options = {}) {
    // Goose expects specific message formatting
    if (typeof message === 'string') {
      return {
        type: 'user_message',
        content: message,
        timestamp: Date.now()
      };
    }

    if (message.type === 'plan') {
      return {
        type: 'plan_request',
        description: message.description || message.content,
        requirements: message.requirements || [],
        constraints: message.constraints || [],
        timestamp: Date.now()
      };
    }

    return message;
  }

  _formatGooseResponse(response) {
    // Format Goose response for consistent interface
    const formatted = {
      content: response.content || response.message || response.text,
      type: response.type || 'response',
      metadata: {
        model: response.model,
        provider: response.provider,
        usage: response.usage,
        timestamp: Date.now()
      },
      raw: response
    };

    // Handle plan responses
    if (response.plan) {
      formatted.plan = {
        id: response.plan.id || Date.now().toString(),
        description: response.plan.description,
        steps: response.plan.steps || [],
        status: response.plan.status || 'created',
        created: Date.now()
      };
    }

    // Handle toolkit responses
    if (response.toolkit_result) {
      formatted.toolkitResult = response.toolkit_result;
    }

    return formatted;
  }

  _formatPlanMessage(planDescription, options = {}) {
    return {
      type: 'plan',
      description: planDescription,
      requirements: options.requirements || [],
      constraints: options.constraints || [],
      priority: options.priority || 'normal',
      deadline: options.deadline,
      context: options.context
    };
  }

  _formatToolkitMessage(toolkitName, action, parameters) {
    const toolkitMessages = {
      'developer': `Use developer toolkit to ${action}: ${JSON.stringify(parameters)}`,
      'screen': `Use screen toolkit to ${action}: ${JSON.stringify(parameters)}`,
      'browser': `Use browser toolkit to ${action}: ${JSON.stringify(parameters)}`,
      'file': `Use file toolkit to ${action}: ${JSON.stringify(parameters)}`
    };

    return toolkitMessages[toolkitName] || 
           `Use ${toolkitName} toolkit for ${action} with parameters: ${JSON.stringify(parameters)}`;
  }

  _updateSessionPlan(sessionId, plan) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    // Update current plan
    session.currentPlan = plan;
    session.planSteps = plan.steps || [];

    // Add to plan history
    const history = this.planHistory.get(sessionId) || [];
    history.push({
      ...plan,
      timestamp: Date.now()
    });
    this.planHistory.set(sessionId, history);

    // Update metrics
    const metrics = this.sessionMetrics.get(sessionId);
    if (metrics && plan.steps) {
      metrics.stepsCompleted += plan.steps.filter(step => step.status === 'completed').length;
    }

    this.emit('planUpdated', { sessionId, plan });
  }

  _updateSessionMetrics(sessionId, responseTime, success) {
    const metrics = this.sessionMetrics.get(sessionId);
    if (!metrics) return;

    metrics.messagesProcessed++;
    
    if (success) {
      metrics.totalResponseTime += responseTime;
      metrics.averageResponseTime = metrics.totalResponseTime / metrics.messagesProcessed;
    } else {
      metrics.errors++;
    }
  }

  _calculateAverageResponseTime(allMetrics) {
    if (allMetrics.length === 0) return 0;
    
    const totalTime = allMetrics.reduce((sum, m) => sum + m.totalResponseTime, 0);
    const totalMessages = allMetrics.reduce((sum, m) => sum + m.messagesProcessed, 0);
    
    return totalMessages > 0 ? totalTime / totalMessages : 0;
  }

  _aggregateToolkitUsage(allMetrics) {
    const aggregated = {};
    
    allMetrics.forEach(metrics => {
      Object.entries(metrics.toolkitUsage || {}).forEach(([toolkit, count]) => {
        aggregated[toolkit] = (aggregated[toolkit] || 0) + count;
      });
    });

    return aggregated;
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
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }
}

export default GooseAdapter;

