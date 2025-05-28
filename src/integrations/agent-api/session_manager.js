/**
 * Session Manager
 * 
 * Manages agent session lifecycle and state tracking for the AgentAPI middleware.
 * Handles session creation, monitoring, timeout management, and cleanup.
 */

import EventEmitter from 'events';

export class SessionManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      sessionTimeout: config.sessionTimeout || 30 * 60 * 1000, // 30 minutes
      maxSessions: config.maxSessions || 100,
      cleanupInterval: config.cleanupInterval || 5 * 60 * 1000, // 5 minutes
      sessionIdleTimeout: config.sessionIdleTimeout || 10 * 60 * 1000, // 10 minutes
      enablePersistence: config.enablePersistence !== false,
      ...config
    };

    // Session storage
    this.sessions = new Map(); // sessionId -> session data
    this.sessionsByAgent = new Map(); // agentId -> Set of sessionIds
    this.sessionsByType = new Map(); // agentType -> Set of sessionIds

    // Cleanup interval
    this.cleanupInterval = null;

    // Session statistics
    this.stats = {
      totalSessions: 0,
      activeSessions: 0,
      completedSessions: 0,
      timeoutSessions: 0,
      errorSessions: 0
    };
  }

  /**
   * Initialize the session manager
   */
  async initialize() {
    try {
      console.log('🚀 Initializing Session Manager...');

      // Start cleanup process
      this._startCleanupProcess();

      // Load persisted sessions if enabled
      if (this.config.enablePersistence) {
        await this._loadPersistedSessions();
      }

      console.log('✅ Session Manager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Session Manager:', error);
      throw error;
    }
  }

  /**
   * Create a new session
   */
  async createSession(agentType, options = {}) {
    try {
      // Check session limits
      if (this.sessions.size >= this.config.maxSessions) {
        throw new Error(`Maximum sessions limit reached (${this.config.maxSessions})`);
      }

      const sessionId = this._generateSessionId();
      const now = Date.now();

      const session = {
        id: sessionId,
        agentType,
        agentId: options.agentId,
        agentSessionId: options.agentSessionId,
        status: 'created',
        created: now,
        lastActivity: now,
        timeout: now + this.config.sessionTimeout,
        options: { ...options },
        metadata: {
          messageCount: 0,
          totalProcessingTime: 0,
          averageResponseTime: 0,
          errors: []
        }
      };

      // Store session
      this.sessions.set(sessionId, session);

      // Update indexes
      if (session.agentId) {
        if (!this.sessionsByAgent.has(session.agentId)) {
          this.sessionsByAgent.set(session.agentId, new Set());
        }
        this.sessionsByAgent.get(session.agentId).add(sessionId);
      }

      if (!this.sessionsByType.has(agentType)) {
        this.sessionsByType.set(agentType, new Set());
      }
      this.sessionsByType.get(agentType).add(sessionId);

      // Update statistics
      this.stats.totalSessions++;
      this.stats.activeSessions++;

      // Persist session if enabled
      if (this.config.enablePersistence) {
        await this._persistSession(session);
      }

      console.log(`✅ Created session ${sessionId} for agent type ${agentType}`);
      this.emit('sessionCreated', session);

      return session;
    } catch (error) {
      console.error('❌ Failed to create session:', error);
      this.stats.errorSessions++;
      throw error;
    }
  }

  /**
   * Get a session by ID
   */
  async getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get all sessions for a specific agent
   */
  async getSessionsByAgent(agentId) {
    const sessionIds = this.sessionsByAgent.get(agentId) || new Set();
    return Array.from(sessionIds).map(id => this.sessions.get(id)).filter(Boolean);
  }

  /**
   * Get all sessions for a specific agent type
   */
  async getSessionsByType(agentType) {
    const sessionIds = this.sessionsByType.get(agentType) || new Set();
    return Array.from(sessionIds).map(id => this.sessions.get(id)).filter(Boolean);
  }

  /**
   * Update session activity timestamp
   */
  async updateSessionActivity(sessionId, metadata = {}) {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const now = Date.now();
      session.lastActivity = now;
      session.timeout = now + this.config.sessionTimeout;

      // Update metadata
      if (metadata.messageCount !== undefined) {
        session.metadata.messageCount += metadata.messageCount;
      }
      if (metadata.processingTime !== undefined) {
        session.metadata.totalProcessingTime += metadata.processingTime;
        session.metadata.averageResponseTime = 
          session.metadata.totalProcessingTime / session.metadata.messageCount;
      }
      if (metadata.error) {
        session.metadata.errors.push({
          timestamp: now,
          error: metadata.error
        });
      }

      // Persist updated session
      if (this.config.enablePersistence) {
        await this._persistSession(session);
      }

      return session;
    } catch (error) {
      console.error('❌ Failed to update session activity:', error);
      throw error;
    }
  }

  /**
   * Close a session
   */
  async closeSession(sessionId, reason = 'manual') {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      // Update session status
      session.status = 'closed';
      session.closed = Date.now();
      session.closeReason = reason;
      session.duration = session.closed - session.created;

      // Remove from indexes
      if (session.agentId) {
        const agentSessions = this.sessionsByAgent.get(session.agentId);
        if (agentSessions) {
          agentSessions.delete(sessionId);
          if (agentSessions.size === 0) {
            this.sessionsByAgent.delete(session.agentId);
          }
        }
      }

      const typeSessions = this.sessionsByType.get(session.agentType);
      if (typeSessions) {
        typeSessions.delete(sessionId);
        if (typeSessions.size === 0) {
          this.sessionsByType.delete(session.agentType);
        }
      }

      // Update statistics
      this.stats.activeSessions--;
      if (reason === 'timeout') {
        this.stats.timeoutSessions++;
      } else {
        this.stats.completedSessions++;
      }

      // Persist final session state
      if (this.config.enablePersistence) {
        await this._persistSession(session);
      }

      console.log(`✅ Closed session ${sessionId} (reason: ${reason})`);
      this.emit('sessionClosed', session);

      return session;
    } catch (error) {
      console.error('❌ Failed to close session:', error);
      throw error;
    }
  }

  /**
   * Close all active sessions
   */
  async closeAllSessions(reason = 'shutdown') {
    try {
      const activeSessions = Array.from(this.sessions.values())
        .filter(session => session.status === 'created' || session.status === 'active');

      const closePromises = activeSessions.map(session => 
        this.closeSession(session.id, reason)
      );

      await Promise.allSettled(closePromises);

      console.log(`✅ Closed ${activeSessions.length} active sessions`);
      return activeSessions.length;
    } catch (error) {
      console.error('❌ Failed to close all sessions:', error);
      throw error;
    }
  }

  /**
   * Get session statistics and metrics
   */
  async getMetrics() {
    const activeSessions = Array.from(this.sessions.values())
      .filter(session => session.status === 'created' || session.status === 'active');

    const sessionsByType = {};
    for (const [agentType, sessionIds] of this.sessionsByType.entries()) {
      const sessions = Array.from(sessionIds).map(id => this.sessions.get(id)).filter(Boolean);
      sessionsByType[agentType] = {
        total: sessions.length,
        active: sessions.filter(s => s.status === 'created' || s.status === 'active').length,
        averageMessages: sessions.length > 0 ? 
          sessions.reduce((sum, s) => sum + s.metadata.messageCount, 0) / sessions.length : 0,
        averageResponseTime: sessions.length > 0 ? 
          sessions.reduce((sum, s) => sum + s.metadata.averageResponseTime, 0) / sessions.length : 0
      };
    }

    return {
      ...this.stats,
      activeSessions: activeSessions.length,
      sessionsByType,
      averageSessionDuration: this._calculateAverageSessionDuration(),
      oldestActiveSession: this._getOldestActiveSession(),
      sessionTimeouts: this._getSessionTimeouts()
    };
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions() {
    try {
      const now = Date.now();
      const expiredSessions = Array.from(this.sessions.values())
        .filter(session => {
          if (session.status === 'closed') return false;
          
          // Check for timeout
          if (now > session.timeout) return true;
          
          // Check for idle timeout
          if (now - session.lastActivity > this.config.sessionIdleTimeout) return true;
          
          return false;
        });

      const cleanupPromises = expiredSessions.map(session => 
        this.closeSession(session.id, 'timeout')
      );

      await Promise.allSettled(cleanupPromises);

      if (expiredSessions.length > 0) {
        console.log(`🧹 Cleaned up ${expiredSessions.length} expired sessions`);
      }

      return expiredSessions.length;
    } catch (error) {
      console.error('❌ Failed to cleanup expired sessions:', error);
      throw error;
    }
  }

  /**
   * Shutdown the session manager
   */
  async shutdown() {
    try {
      console.log('🔄 Shutting down Session Manager...');

      // Stop cleanup process
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }

      // Close all active sessions
      await this.closeAllSessions('shutdown');

      // Clear session storage
      this.sessions.clear();
      this.sessionsByAgent.clear();
      this.sessionsByType.clear();

      console.log('✅ Session Manager shutdown complete');
      return true;
    } catch (error) {
      console.error('❌ Error during Session Manager shutdown:', error);
      throw error;
    }
  }

  // Private methods

  _generateSessionId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 12);
    return `session-${timestamp}-${random}`;
  }

  _startCleanupProcess() {
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupExpiredSessions();
      } catch (error) {
        console.error('❌ Error during session cleanup:', error);
      }
    }, this.config.cleanupInterval);
  }

  async _loadPersistedSessions() {
    // In a real implementation, this would load sessions from a database or file
    // For now, this is a placeholder
    console.log('📂 Loading persisted sessions...');
    return true;
  }

  async _persistSession(session) {
    // In a real implementation, this would save the session to a database or file
    // For now, this is a placeholder
    return true;
  }

  _calculateAverageSessionDuration() {
    const closedSessions = Array.from(this.sessions.values())
      .filter(session => session.status === 'closed' && session.duration);

    if (closedSessions.length === 0) return 0;

    const totalDuration = closedSessions.reduce((sum, session) => sum + session.duration, 0);
    return totalDuration / closedSessions.length;
  }

  _getOldestActiveSession() {
    const activeSessions = Array.from(this.sessions.values())
      .filter(session => session.status === 'created' || session.status === 'active');

    if (activeSessions.length === 0) return null;

    return activeSessions.reduce((oldest, session) => 
      session.created < oldest.created ? session : oldest
    );
  }

  _getSessionTimeouts() {
    const now = Date.now();
    return Array.from(this.sessions.values())
      .filter(session => session.status === 'created' || session.status === 'active')
      .map(session => ({
        sessionId: session.id,
        agentType: session.agentType,
        timeUntilTimeout: Math.max(0, session.timeout - now),
        timeUntilIdleTimeout: Math.max(0, (session.lastActivity + this.config.sessionIdleTimeout) - now)
      }))
      .sort((a, b) => a.timeUntilTimeout - b.timeUntilTimeout);
  }
}

export default SessionManager;

