/**
 * Codex Adapter
 * 
 * Specialized adapter for integrating with Codex agent through AgentAPI.
 * Handles Codex specific message formatting, code completion, and generation tasks.
 */

import EventEmitter from 'events';
import axios from 'axios';

export class CodexAdapter extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      agentType: 'codex',
      baseUrl: config.baseUrl || 'http://localhost:3284',
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      model: config.model || 'gpt-4',
      maxTokens: config.maxTokens || 2048,
      temperature: config.temperature || 0.1,
      ...config
    };

    // Codex specific settings
    this.codexSettings = {
      completionMode: config.completionMode || 'code',
      language: config.language || 'auto',
      stopSequences: config.stopSequences || ['\n\n', '```'],
      includeContext: config.includeContext !== false,
      formatOutput: config.formatOutput !== false,
      messageFormat: 'codex'
    };

    // Session state
    this.activeSessions = new Map();
    this.sessionMetrics = new Map();
    this.completionHistory = new Map();
  }

  /**
   * Initialize the Codex adapter
   */
  async initialize() {
    try {
      console.log('🚀 Initializing Codex Adapter...');

      // Verify AgentAPI connection
      await this._verifyConnection();

      // Validate Codex availability
      await this._validateCodexAvailability();

      console.log('✅ Codex Adapter initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Codex Adapter:', error);
      throw error;
    }
  }

  /**
   * Create a new Codex session
   */
  async createSession(options = {}) {
    try {
      const sessionConfig = {
        agentType: this.config.agentType,
        model: options.model || this.config.model,
        maxTokens: options.maxTokens || this.config.maxTokens,
        temperature: options.temperature || this.config.temperature,
        completionMode: options.completionMode || this.codexSettings.completionMode,
        language: options.language || this.codexSettings.language,
        stopSequences: options.stopSequences || this.codexSettings.stopSequences,
        includeContext: options.includeContext !== undefined ? options.includeContext : this.codexSettings.includeContext,
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
        context: [],
        completions: 0
      };

      this.activeSessions.set(sessionId, sessionInfo);
      this.sessionMetrics.set(sessionId, {
        messagesProcessed: 0,
        totalResponseTime: 0,
        averageResponseTime: 0,
        errors: 0,
        completionsGenerated: 0,
        tokensGenerated: 0,
        averageTokensPerCompletion: 0,
        completionTypes: {}
      });
      this.completionHistory.set(sessionId, []);

      console.log(`✅ Created Codex session: ${sessionId}`);
      this.emit('sessionCreated', sessionInfo);

      return sessionInfo;
    } catch (error) {
      console.error('❌ Failed to create Codex session:', error);
      throw error;
    }
  }

  /**
   * Send a message to Codex
   */
  async sendMessage(sessionId, message, options = {}) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const startTime = Date.now();

      // Format message for Codex
      const formattedMessage = this._formatMessageForCodex(message, options);

      // Send message via AgentAPI
      const response = await this._makeRequest('POST', `/sessions/${sessionId}/messages`, {
        message: formattedMessage,
        options: {
          stream: options.stream || false,
          maxTokens: options.maxTokens || session.config.maxTokens,
          temperature: options.temperature || session.config.temperature,
          stopSequences: options.stopSequences || session.config.stopSequences,
          ...options
        }
      });

      const responseTime = Date.now() - startTime;

      // Update session metrics
      this._updateSessionMetrics(sessionId, responseTime, true, response.data);

      // Update session activity
      session.lastActivity = Date.now();
      session.messageCount++;

      // Parse and format response
      const formattedResponse = this._formatCodexResponse(response.data);

      // Update context if enabled
      if (session.config.includeContext) {
        this._updateSessionContext(sessionId, formattedMessage, formattedResponse);
      }

      // Track completion
      if (formattedResponse.completion) {
        this._trackCompletion(sessionId, formattedResponse.completion);
      }

      console.log(`📤 Sent message to Codex session ${sessionId} (${responseTime}ms)`);
      this.emit('messageProcessed', {
        sessionId,
        message: formattedMessage,
        response: formattedResponse,
        responseTime
      });

      return formattedResponse;
    } catch (error) {
      console.error('❌ Failed to send message to Codex:', error);
      this._updateSessionMetrics(sessionId, 0, false);
      this.emit('messageError', { sessionId, error });
      throw error;
    }
  }

  /**
   * Generate code completion
   */
  async generateCompletion(sessionId, prompt, options = {}) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const completionMessage = this._formatCompletionPrompt(prompt, options);
      
      const response = await this.sendMessage(sessionId, completionMessage, {
        ...options,
        completionMode: 'code',
        expectCompletion: true
      });

      // Track completion type
      const metrics = this.sessionMetrics.get(sessionId);
      if (metrics) {
        const completionType = options.type || 'general';
        metrics.completionTypes[completionType] = (metrics.completionTypes[completionType] || 0) + 1;
      }

      this.emit('completionGenerated', { sessionId, prompt, response });
      return response;
    } catch (error) {
      console.error('❌ Failed to generate completion:', error);
      throw error;
    }
  }

  /**
   * Generate code explanation
   */
  async explainCode(sessionId, code, options = {}) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const explanationPrompt = this._formatExplanationPrompt(code, options);
      
      const response = await this.sendMessage(sessionId, explanationPrompt, {
        ...options,
        completionMode: 'explanation',
        expectExplanation: true
      });

      this.emit('codeExplained', { sessionId, code, response });
      return response;
    } catch (error) {
      console.error('❌ Failed to explain code:', error);
      throw error;
    }
  }

  /**
   * Generate code from natural language
   */
  async generateCodeFromDescription(sessionId, description, options = {}) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const generationPrompt = this._formatGenerationPrompt(description, options);
      
      const response = await this.sendMessage(sessionId, generationPrompt, {
        ...options,
        completionMode: 'generation',
        expectCode: true
      });

      this.emit('codeGenerated', { sessionId, description, response });
      return response;
    } catch (error) {
      console.error('❌ Failed to generate code from description:', error);
      throw error;
    }
  }

  /**
   * Get completion history
   */
  async getCompletionHistory(sessionId) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      return {
        completions: this.completionHistory.get(sessionId) || [],
        totalCompletions: session.completions,
        context: session.context,
        lastCompletion: Math.max(...(this.completionHistory.get(sessionId) || []).map(c => c.timestamp), 0)
      };
    } catch (error) {
      console.error('❌ Failed to get completion history:', error);
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
      const completionHistory = await this.getCompletionHistory(sessionId);

      // Get current status from AgentAPI
      const response = await this._makeRequest('GET', `/sessions/${sessionId}/status`);

      return {
        ...session,
        agentStatus: response.data,
        metrics,
        completionHistory,
        uptime: Date.now() - session.created,
        idleTime: Date.now() - session.lastActivity
      };
    } catch (error) {
      console.error('❌ Failed to get session status:', error);
      throw error;
    }
  }

  /**
   * Close a Codex session
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
      this.completionHistory.delete(sessionId);

      console.log(`✅ Closed Codex session: ${sessionId}`);
      this.emit('sessionClosed', { sessionId, metrics: finalMetrics });

      return true;
    } catch (error) {
      console.error('❌ Failed to close Codex session:', error);
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
      totalCompletions: allMetrics.reduce((sum, m) => sum + m.completionsGenerated, 0),
      totalTokens: allMetrics.reduce((sum, m) => sum + m.tokensGenerated, 0),
      averageTokensPerCompletion: this._calculateAverageTokensPerCompletion(allMetrics),
      completionTypes: this._aggregateCompletionTypes(allMetrics),
      sessionDurations: activeSessions.map(s => Date.now() - s.created),
      lastActivity: Math.max(...activeSessions.map(s => s.lastActivity), 0)
    };
  }

  /**
   * Shutdown the adapter
   */
  async shutdown() {
    try {
      console.log('🔄 Shutting down Codex Adapter...');

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
      this.completionHistory.clear();

      console.log('✅ Codex Adapter shutdown complete');
      return true;
    } catch (error) {
      console.error('❌ Error during Codex Adapter shutdown:', error);
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

  async _validateCodexAvailability() {
    try {
      const response = await this._makeRequest('GET', '/agents/codex/status');
      if (!response.data.available) {
        throw new Error('Codex agent is not available');
      }
    } catch (error) {
      console.warn('⚠️ Could not verify Codex availability:', error.message);
    }
  }

  _formatMessageForCodex(message, options = {}) {
    // Codex expects specific message formatting
    if (typeof message === 'string') {
      return {
        type: 'completion_request',
        prompt: message,
        language: options.language || 'auto',
        timestamp: Date.now()
      };
    }

    if (message.type === 'code_completion') {
      return {
        type: 'code_completion',
        prompt: message.prompt || message.content,
        prefix: message.prefix || '',
        suffix: message.suffix || '',
        language: message.language || options.language || 'auto',
        timestamp: Date.now()
      };
    }

    return message;
  }

  _formatCodexResponse(response) {
    // Format Codex response for consistent interface
    const formatted = {
      content: response.content || response.completion || response.text,
      type: response.type || 'completion',
      metadata: {
        model: response.model,
        usage: response.usage,
        finishReason: response.finish_reason,
        language: response.language,
        timestamp: Date.now()
      },
      raw: response
    };

    // Handle code completion
    if (response.completion) {
      formatted.completion = {
        code: response.completion,
        language: response.language || 'auto',
        confidence: response.confidence || 0,
        tokens: response.usage?.completion_tokens || 0
      };
    }

    // Handle explanation
    if (response.explanation) {
      formatted.explanation = response.explanation;
    }

    // Handle generated code
    if (response.generated_code) {
      formatted.generatedCode = {
        code: response.generated_code,
        language: response.language || 'auto',
        description: response.description
      };
    }

    return formatted;
  }

  _formatCompletionPrompt(prompt, options = {}) {
    let formattedPrompt = prompt;

    if (options.language) {
      formattedPrompt = `// Language: ${options.language}\n${prompt}`;
    }

    if (options.context) {
      formattedPrompt = `${options.context}\n\n${formattedPrompt}`;
    }

    return {
      type: 'code_completion',
      prompt: formattedPrompt,
      language: options.language || 'auto',
      prefix: options.prefix || '',
      suffix: options.suffix || ''
    };
  }

  _formatExplanationPrompt(code, options = {}) {
    const language = options.language || 'auto';
    const prompt = `Explain the following ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\`\n\nProvide a clear, detailed explanation of what this code does.`;

    return {
      type: 'explanation_request',
      prompt,
      code,
      language
    };
  }

  _formatGenerationPrompt(description, options = {}) {
    const language = options.language || 'auto';
    let prompt = `Generate ${language} code for the following requirement:\n\n${description}`;

    if (options.constraints) {
      prompt += `\n\nConstraints:\n${options.constraints.join('\n')}`;
    }

    if (options.examples) {
      prompt += `\n\nExamples:\n${options.examples}`;
    }

    return {
      type: 'generation_request',
      prompt,
      description,
      language,
      constraints: options.constraints || [],
      examples: options.examples
    };
  }

  _updateSessionContext(sessionId, message, response) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    session.context.push({
      message,
      response,
      timestamp: Date.now()
    });

    // Keep only last 10 context entries
    if (session.context.length > 10) {
      session.context.shift();
    }
  }

  _trackCompletion(sessionId, completion) {
    const session = this.activeSessions.get(sessionId);
    const metrics = this.sessionMetrics.get(sessionId);
    const history = this.completionHistory.get(sessionId) || [];

    if (!session || !metrics) return;

    session.completions++;
    metrics.completionsGenerated++;
    metrics.tokensGenerated += completion.tokens || 0;
    metrics.averageTokensPerCompletion = metrics.tokensGenerated / metrics.completionsGenerated;

    history.push({
      code: completion.code,
      language: completion.language,
      confidence: completion.confidence,
      tokens: completion.tokens,
      timestamp: Date.now()
    });

    // Keep only last 100 completions
    if (history.length > 100) {
      history.shift();
    }

    this.completionHistory.set(sessionId, history);
    this.emit('completionTracked', { sessionId, completion });
  }

  _updateSessionMetrics(sessionId, responseTime, success, responseData = null) {
    const metrics = this.sessionMetrics.get(sessionId);
    if (!metrics) return;

    metrics.messagesProcessed++;
    
    if (success) {
      metrics.totalResponseTime += responseTime;
      metrics.averageResponseTime = metrics.totalResponseTime / metrics.messagesProcessed;

      // Track tokens if available
      if (responseData && responseData.usage) {
        metrics.tokensGenerated += responseData.usage.completion_tokens || 0;
      }
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

  _calculateAverageTokensPerCompletion(allMetrics) {
    if (allMetrics.length === 0) return 0;
    
    const totalTokens = allMetrics.reduce((sum, m) => sum + m.tokensGenerated, 0);
    const totalCompletions = allMetrics.reduce((sum, m) => sum + m.completionsGenerated, 0);
    
    return totalCompletions > 0 ? totalTokens / totalCompletions : 0;
  }

  _aggregateCompletionTypes(allMetrics) {
    const aggregated = {};
    
    allMetrics.forEach(metrics => {
      Object.entries(metrics.completionTypes || {}).forEach(([type, count]) => {
        aggregated[type] = (aggregated[type] || 0) + count;
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

export default CodexAdapter;

