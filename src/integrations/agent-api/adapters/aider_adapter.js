/**
 * Aider Adapter
 * 
 * Specialized adapter for integrating with Aider agent through AgentAPI.
 * Handles Aider specific message formatting, file operations, and coding assistance.
 */

import EventEmitter from 'events';
import axios from 'axios';

export class AiderAdapter extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      agentType: 'aider',
      baseUrl: config.baseUrl || 'http://localhost:3284',
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      model: config.model || 'claude-3-5-sonnet-20241022',
      editFormat: config.editFormat || 'diff',
      ...config
    };

    // Aider specific settings
    this.aiderSettings = {
      autoCommit: config.autoCommit !== false,
      gitRepo: config.gitRepo !== false,
      showDiffs: config.showDiffs !== false,
      mapTokens: config.mapTokens || 1024,
      cachePrompts: config.cachePrompts !== false,
      messageFormat: 'aider'
    };

    // Session state
    this.activeSessions = new Map();
    this.sessionMetrics = new Map();
    this.fileHistory = new Map();
  }

  /**
   * Initialize the Aider adapter
   */
  async initialize() {
    try {
      console.log('🚀 Initializing Aider Adapter...');

      // Verify AgentAPI connection
      await this._verifyConnection();

      // Validate Aider availability
      await this._validateAiderAvailability();

      console.log('✅ Aider Adapter initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Aider Adapter:', error);
      throw error;
    }
  }

  /**
   * Create a new Aider session
   */
  async createSession(options = {}) {
    try {
      const sessionConfig = {
        agentType: this.config.agentType,
        model: options.model || this.config.model,
        editFormat: options.editFormat || this.config.editFormat,
        autoCommit: options.autoCommit !== undefined ? options.autoCommit : this.aiderSettings.autoCommit,
        gitRepo: options.gitRepo !== undefined ? options.gitRepo : this.aiderSettings.gitRepo,
        showDiffs: options.showDiffs !== undefined ? options.showDiffs : this.aiderSettings.showDiffs,
        mapTokens: options.mapTokens || this.aiderSettings.mapTokens,
        workingDirectory: options.workingDirectory || process.cwd(),
        files: options.files || [],
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
        trackedFiles: new Set(sessionConfig.files),
        commits: []
      };

      this.activeSessions.set(sessionId, sessionInfo);
      this.sessionMetrics.set(sessionId, {
        messagesProcessed: 0,
        totalResponseTime: 0,
        averageResponseTime: 0,
        errors: 0,
        filesModified: 0,
        linesAdded: 0,
        linesRemoved: 0,
        commits: 0,
        operationTypes: {}
      });
      this.fileHistory.set(sessionId, []);

      console.log(`✅ Created Aider session: ${sessionId}`);
      this.emit('sessionCreated', sessionInfo);

      return sessionInfo;
    } catch (error) {
      console.error('❌ Failed to create Aider session:', error);
      throw error;
    }
  }

  /**
   * Send a message to Aider
   */
  async sendMessage(sessionId, message, options = {}) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const startTime = Date.now();

      // Format message for Aider
      const formattedMessage = this._formatMessageForAider(message, options);

      // Send message via AgentAPI
      const response = await this._makeRequest('POST', `/sessions/${sessionId}/messages`, {
        message: formattedMessage,
        options: {
          stream: options.stream || false,
          showDiffs: options.showDiffs !== undefined ? options.showDiffs : session.config.showDiffs,
          autoCommit: options.autoCommit !== undefined ? options.autoCommit : session.config.autoCommit,
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
      const formattedResponse = this._formatAiderResponse(response.data);

      // Handle file changes
      if (formattedResponse.fileChanges) {
        this._trackFileChanges(sessionId, formattedResponse.fileChanges);
      }

      // Handle commits
      if (formattedResponse.commit) {
        this._trackCommit(sessionId, formattedResponse.commit);
      }

      console.log(`📤 Sent message to Aider session ${sessionId} (${responseTime}ms)`);
      this.emit('messageProcessed', {
        sessionId,
        message: formattedMessage,
        response: formattedResponse,
        responseTime
      });

      return formattedResponse;
    } catch (error) {
      console.error('❌ Failed to send message to Aider:', error);
      this._updateSessionMetrics(sessionId, 0, false);
      this.emit('messageError', { sessionId, error });
      throw error;
    }
  }

  /**
   * Add files to Aider session
   */
  async addFiles(sessionId, files) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const fileList = Array.isArray(files) ? files : [files];
      const addMessage = this._formatAddFilesMessage(fileList);
      
      const response = await this.sendMessage(sessionId, addMessage, {
        operation: 'add_files',
        files: fileList
      });

      // Update tracked files
      fileList.forEach(file => session.trackedFiles.add(file));

      this.emit('filesAdded', { sessionId, files: fileList });
      return response;
    } catch (error) {
      console.error('❌ Failed to add files:', error);
      throw error;
    }
  }

  /**
   * Request code changes from Aider
   */
  async requestCodeChanges(sessionId, description, options = {}) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const changeMessage = this._formatCodeChangeMessage(description, options);
      
      const response = await this.sendMessage(sessionId, changeMessage, {
        operation: 'code_change',
        expectDiff: true,
        ...options
      });

      // Track operation type
      const metrics = this.sessionMetrics.get(sessionId);
      if (metrics) {
        const opType = options.type || 'modification';
        metrics.operationTypes[opType] = (metrics.operationTypes[opType] || 0) + 1;
      }

      this.emit('codeChangeRequested', { sessionId, description, response });
      return response;
    } catch (error) {
      console.error('❌ Failed to request code changes:', error);
      throw error;
    }
  }

  /**
   * Get file history for session
   */
  async getFileHistory(sessionId) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      return {
        trackedFiles: Array.from(session.trackedFiles),
        fileHistory: this.fileHistory.get(sessionId) || [],
        commits: session.commits,
        lastModified: Math.max(...(this.fileHistory.get(sessionId) || []).map(f => f.timestamp), 0)
      };
    } catch (error) {
      console.error('❌ Failed to get file history:', error);
      throw error;
    }
  }

  /**
   * Commit changes with Aider
   */
  async commitChanges(sessionId, commitMessage, options = {}) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const commitCommand = this._formatCommitMessage(commitMessage, options);
      
      const response = await this.sendMessage(sessionId, commitCommand, {
        operation: 'commit',
        message: commitMessage,
        ...options
      });

      this.emit('changesCommitted', { sessionId, commitMessage, response });
      return response;
    } catch (error) {
      console.error('❌ Failed to commit changes:', error);
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
      const fileHistory = await this.getFileHistory(sessionId);

      // Get current status from AgentAPI
      const response = await this._makeRequest('GET', `/sessions/${sessionId}/status`);

      return {
        ...session,
        agentStatus: response.data,
        metrics,
        fileHistory,
        uptime: Date.now() - session.created,
        idleTime: Date.now() - session.lastActivity
      };
    } catch (error) {
      console.error('❌ Failed to get session status:', error);
      throw error;
    }
  }

  /**
   * Close an Aider session
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
      this.fileHistory.delete(sessionId);

      console.log(`✅ Closed Aider session: ${sessionId}`);
      this.emit('sessionClosed', { sessionId, metrics: finalMetrics });

      return true;
    } catch (error) {
      console.error('❌ Failed to close Aider session:', error);
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
      totalFilesModified: allMetrics.reduce((sum, m) => sum + m.filesModified, 0),
      totalLinesAdded: allMetrics.reduce((sum, m) => sum + m.linesAdded, 0),
      totalLinesRemoved: allMetrics.reduce((sum, m) => sum + m.linesRemoved, 0),
      totalCommits: allMetrics.reduce((sum, m) => sum + m.commits, 0),
      operationTypes: this._aggregateOperationTypes(allMetrics),
      sessionDurations: activeSessions.map(s => Date.now() - s.created),
      lastActivity: Math.max(...activeSessions.map(s => s.lastActivity), 0)
    };
  }

  /**
   * Shutdown the adapter
   */
  async shutdown() {
    try {
      console.log('🔄 Shutting down Aider Adapter...');

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
      this.fileHistory.clear();

      console.log('✅ Aider Adapter shutdown complete');
      return true;
    } catch (error) {
      console.error('❌ Error during Aider Adapter shutdown:', error);
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

  async _validateAiderAvailability() {
    try {
      const response = await this._makeRequest('GET', '/agents/aider/status');
      if (!response.data.available) {
        throw new Error('Aider agent is not available');
      }
    } catch (error) {
      console.warn('⚠️ Could not verify Aider availability:', error.message);
    }
  }

  _formatMessageForAider(message, options = {}) {
    // Aider expects specific message formatting
    if (typeof message === 'string') {
      return {
        type: 'user_message',
        content: message,
        timestamp: Date.now()
      };
    }

    if (message.type === 'file_operation') {
      return {
        type: 'file_operation',
        operation: message.operation,
        files: message.files || [],
        content: message.content,
        timestamp: Date.now()
      };
    }

    return message;
  }

  _formatAiderResponse(response) {
    // Format Aider response for consistent interface
    const formatted = {
      content: response.content || response.message || response.text,
      type: response.type || 'response',
      metadata: {
        model: response.model,
        usage: response.usage,
        editFormat: response.edit_format,
        timestamp: Date.now()
      },
      raw: response
    };

    // Handle file changes
    if (response.file_changes) {
      formatted.fileChanges = response.file_changes.map(change => ({
        file: change.file,
        operation: change.operation,
        linesAdded: change.lines_added || 0,
        linesRemoved: change.lines_removed || 0,
        diff: change.diff,
        timestamp: Date.now()
      }));
    }

    // Handle diffs
    if (response.diff) {
      formatted.diff = response.diff;
    }

    // Handle commits
    if (response.commit) {
      formatted.commit = {
        hash: response.commit.hash,
        message: response.commit.message,
        files: response.commit.files || [],
        timestamp: Date.now()
      };
    }

    return formatted;
  }

  _formatAddFilesMessage(files) {
    const fileList = files.join(', ');
    return `/add ${fileList}`;
  }

  _formatCodeChangeMessage(description, options = {}) {
    let message = description;
    
    if (options.files && options.files.length > 0) {
      message = `For files ${options.files.join(', ')}: ${description}`;
    }

    if (options.type) {
      const typePrefix = {
        'fix': 'Fix: ',
        'feature': 'Add feature: ',
        'refactor': 'Refactor: ',
        'test': 'Add tests: ',
        'docs': 'Update docs: '
      };
      message = (typePrefix[options.type] || '') + message;
    }

    return message;
  }

  _formatCommitMessage(commitMessage, options = {}) {
    if (options.autoCommit === false) {
      return `/commit ${commitMessage}`;
    }
    return commitMessage; // Aider will auto-commit if enabled
  }

  _trackFileChanges(sessionId, fileChanges) {
    const session = this.activeSessions.get(sessionId);
    const metrics = this.sessionMetrics.get(sessionId);
    const history = this.fileHistory.get(sessionId) || [];

    if (!session || !metrics) return;

    fileChanges.forEach(change => {
      // Update metrics
      metrics.filesModified++;
      metrics.linesAdded += change.linesAdded || 0;
      metrics.linesRemoved += change.linesRemoved || 0;

      // Add to history
      history.push({
        file: change.file,
        operation: change.operation,
        linesAdded: change.linesAdded || 0,
        linesRemoved: change.linesRemoved || 0,
        diff: change.diff,
        timestamp: Date.now()
      });

      // Update tracked files
      session.trackedFiles.add(change.file);
    });

    this.fileHistory.set(sessionId, history);
    this.emit('fileChangesTracked', { sessionId, changes: fileChanges });
  }

  _trackCommit(sessionId, commit) {
    const session = this.activeSessions.get(sessionId);
    const metrics = this.sessionMetrics.get(sessionId);

    if (!session || !metrics) return;

    session.commits.push(commit);
    metrics.commits++;

    this.emit('commitTracked', { sessionId, commit });
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

  _aggregateOperationTypes(allMetrics) {
    const aggregated = {};
    
    allMetrics.forEach(metrics => {
      Object.entries(metrics.operationTypes || {}).forEach(([type, count]) => {
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

export default AiderAdapter;

