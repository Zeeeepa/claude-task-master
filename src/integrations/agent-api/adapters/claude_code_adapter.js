/**
 * Claude Code Adapter
 * 
 * Specialized adapter for integrating with Claude Code agent through AgentAPI.
 * Handles Claude Code specific message formatting, tool management, and session handling.
 */

import EventEmitter from 'events';
import axios from 'axios';

export class ClaudeCodeAdapter extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      agentType: 'claude',
      baseUrl: config.baseUrl || 'http://localhost:3284',
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      allowedTools: config.allowedTools || ['Bash', 'Edit', 'Replace', 'Create'],
      maxTokens: config.maxTokens || 4096,
      temperature: config.temperature || 0.1,
      ...config
    };

    // Claude Code specific settings
    this.claudeSettings = {
      model: config.model || 'claude-3-5-sonnet-20241022',
      systemPrompt: config.systemPrompt || this._getDefaultSystemPrompt(),
      toolConfig: this._getToolConfiguration(),
      messageFormat: 'claude-code'
    };

    // Session state
    this.activeSessions = new Map();
    this.sessionMetrics = new Map();
  }

  /**
   * Initialize the Claude Code adapter
   */
  async initialize() {
    try {
      console.log('🚀 Initializing Claude Code Adapter...');

      // Verify AgentAPI connection
      await this._verifyConnection();

      // Validate Claude Code availability
      await this._validateClaudeCodeAvailability();

      console.log('✅ Claude Code Adapter initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Claude Code Adapter:', error);
      throw error;
    }
  }

  /**
   * Create a new Claude Code session
   */
  async createSession(options = {}) {
    try {
      const sessionConfig = {
        agentType: this.config.agentType,
        model: options.model || this.claudeSettings.model,
        systemPrompt: options.systemPrompt || this.claudeSettings.systemPrompt,
        allowedTools: options.allowedTools || this.config.allowedTools,
        maxTokens: options.maxTokens || this.config.maxTokens,
        temperature: options.temperature || this.config.temperature,
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
        status: 'active'
      };

      this.activeSessions.set(sessionId, sessionInfo);
      this.sessionMetrics.set(sessionId, {
        messagesProcessed: 0,
        totalResponseTime: 0,
        averageResponseTime: 0,
        errors: 0,
        toolUsage: {}
      });

      console.log(`✅ Created Claude Code session: ${sessionId}`);
      this.emit('sessionCreated', sessionInfo);

      return sessionInfo;
    } catch (error) {
      console.error('❌ Failed to create Claude Code session:', error);
      throw error;
    }
  }

  /**
   * Send a message to Claude Code
   */
  async sendMessage(sessionId, message, options = {}) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const startTime = Date.now();

      // Format message for Claude Code
      const formattedMessage = this._formatMessageForClaude(message, options);

      // Send message via AgentAPI
      const response = await this._makeRequest('POST', `/sessions/${sessionId}/messages`, {
        message: formattedMessage,
        options: {
          stream: options.stream || false,
          tools: options.tools || this.config.allowedTools,
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
      const formattedResponse = this._formatClaudeResponse(response.data);

      console.log(`📤 Sent message to Claude Code session ${sessionId} (${responseTime}ms)`);
      this.emit('messageProcessed', {
        sessionId,
        message: formattedMessage,
        response: formattedResponse,
        responseTime
      });

      return formattedResponse;
    } catch (error) {
      console.error('❌ Failed to send message to Claude Code:', error);
      this._updateSessionMetrics(sessionId, 0, false);
      this.emit('messageError', { sessionId, error });
      throw error;
    }
  }

  /**
   * Execute a specific tool with Claude Code
   */
  async executeTool(sessionId, toolName, toolArgs, options = {}) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      // Validate tool is allowed
      if (!this.config.allowedTools.includes(toolName)) {
        throw new Error(`Tool not allowed: ${toolName}`);
      }

      const toolMessage = this._formatToolMessage(toolName, toolArgs, options);
      return await this.sendMessage(sessionId, toolMessage, { ...options, tool: toolName });
    } catch (error) {
      console.error('❌ Failed to execute tool:', error);
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

      // Get current status from AgentAPI
      const response = await this._makeRequest('GET', `/sessions/${sessionId}/status`);

      return {
        ...session,
        agentStatus: response.data,
        metrics,
        uptime: Date.now() - session.created,
        idleTime: Date.now() - session.lastActivity
      };
    } catch (error) {
      console.error('❌ Failed to get session status:', error);
      throw error;
    }
  }

  /**
   * Close a Claude Code session
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

      console.log(`✅ Closed Claude Code session: ${sessionId}`);
      this.emit('sessionClosed', { sessionId, metrics: finalMetrics });

      return true;
    } catch (error) {
      console.error('❌ Failed to close Claude Code session:', error);
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
      toolUsage: this._aggregateToolUsage(allMetrics),
      sessionDurations: activeSessions.map(s => Date.now() - s.created),
      lastActivity: Math.max(...activeSessions.map(s => s.lastActivity), 0)
    };
  }

  /**
   * Shutdown the adapter
   */
  async shutdown() {
    try {
      console.log('🔄 Shutting down Claude Code Adapter...');

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

      console.log('✅ Claude Code Adapter shutdown complete');
      return true;
    } catch (error) {
      console.error('❌ Error during Claude Code Adapter shutdown:', error);
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

  async _validateClaudeCodeAvailability() {
    try {
      const response = await this._makeRequest('GET', '/agents/claude/status');
      if (!response.data.available) {
        throw new Error('Claude Code agent is not available');
      }
    } catch (error) {
      console.warn('⚠️ Could not verify Claude Code availability:', error.message);
    }
  }

  _formatMessageForClaude(message, options = {}) {
    // Claude Code expects specific message formatting
    if (typeof message === 'string') {
      return {
        type: 'text',
        content: message,
        role: options.role || 'user'
      };
    }

    if (Array.isArray(message)) {
      return message.map(part => ({
        type: part.type || 'text',
        content: part.content || part.text || part,
        role: part.role || 'user'
      }));
    }

    return message;
  }

  _formatClaudeResponse(response) {
    // Format Claude Code response for consistent interface
    return {
      content: response.content || response.message || response.text,
      role: response.role || 'assistant',
      toolCalls: response.tool_calls || response.toolCalls || [],
      metadata: {
        model: response.model,
        usage: response.usage,
        stopReason: response.stop_reason,
        timestamp: Date.now()
      },
      raw: response
    };
  }

  _formatToolMessage(toolName, toolArgs, options = {}) {
    const toolMessages = {
      'Bash': `Execute bash command: ${toolArgs.command || toolArgs}`,
      'Edit': `Edit file ${toolArgs.file || toolArgs.path}: ${toolArgs.content || toolArgs.changes}`,
      'Replace': `Replace in ${toolArgs.file}: "${toolArgs.old}" with "${toolArgs.new}"`,
      'Create': `Create file ${toolArgs.file || toolArgs.path}: ${toolArgs.content}`
    };

    const baseMessage = toolMessages[toolName] || `Use ${toolName} tool with: ${JSON.stringify(toolArgs)}`;
    
    if (options.context) {
      return `${options.context}\n\n${baseMessage}`;
    }

    return baseMessage;
  }

  _getDefaultSystemPrompt() {
    return `You are Claude Code, an AI assistant specialized in software development and coding tasks.

You have access to the following tools:
- Bash: Execute shell commands
- Edit: Edit existing files
- Replace: Replace text in files
- Create: Create new files

Guidelines:
1. Always explain what you're doing before executing commands
2. Use appropriate tools for each task
3. Be careful with destructive operations
4. Provide clear, concise responses
5. Ask for clarification when needed

Focus on being helpful, accurate, and safe in all coding assistance.`;
  }

  _getToolConfiguration() {
    return {
      'Bash': {
        description: 'Execute bash commands',
        parameters: {
          command: { type: 'string', required: true }
        },
        safety: ['no-rm-rf', 'no-sudo', 'no-destructive']
      },
      'Edit': {
        description: 'Edit existing files',
        parameters: {
          file: { type: 'string', required: true },
          content: { type: 'string', required: true }
        }
      },
      'Replace': {
        description: 'Replace text in files',
        parameters: {
          file: { type: 'string', required: true },
          old: { type: 'string', required: true },
          new: { type: 'string', required: true }
        }
      },
      'Create': {
        description: 'Create new files',
        parameters: {
          file: { type: 'string', required: true },
          content: { type: 'string', required: true }
        }
      }
    };
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

  _aggregateToolUsage(allMetrics) {
    const aggregated = {};
    
    allMetrics.forEach(metrics => {
      Object.entries(metrics.toolUsage || {}).forEach(([tool, count]) => {
        aggregated[tool] = (aggregated[tool] || 0) + count;
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

export default ClaudeCodeAdapter;

