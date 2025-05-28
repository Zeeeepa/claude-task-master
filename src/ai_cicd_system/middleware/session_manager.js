/**
 * @fileoverview Session Manager
 * @description Manages sessions and context preservation for AgentAPI middleware
 */

import { log } from '../utils/simple_logger.js';

/**
 * Session Manager - Handles session lifecycle and context preservation
 */
export class SessionManager {
  constructor(config) {
    this.config = config;
    this.activeSessions = new Map();
    this.sessionHistory = [];
    this.maxSessionAge = config.maxSessionAge || 3600000; // 1 hour
    this.maxActiveSessions = config.maxActiveSessions || 100;
    this.cleanupInterval = null;
  }

  /**
   * Initialize the session manager
   */
  async initialize() {
    log('info', '🔄 Initializing session manager...');
    
    // Start session cleanup interval
    this.startSessionCleanup();
    
    log('info', '✅ Session manager initialized');
  }

  /**
   * Get or create session for a task
   * @param {Object} task - Task object
   * @param {Object} context - Session context
   * @returns {Promise<Object>} Session object
   */
  async getOrCreateSession(task, context) {
    // Try to find existing session for this task
    const existingSession = this.findExistingSession(task, context);
    
    if (existingSession) {
      log('info', `📋 Using existing session: ${existingSession.id}`);
      return existingSession;
    }
    
    // Create new session
    const session = await this.createSession(task, context);
    
    log('info', `🆕 Created new session: ${session.id}`);
    return session;
  }

  /**
   * Create a new session
   * @param {Object} task - Task object
   * @param {Object} context - Session context
   * @returns {Promise<Object>} New session object
   */
  async createSession(task, context) {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const session = {
      id: sessionId,
      taskId: task.id,
      createdAt: new Date(),
      lastActivity: new Date(),
      status: 'active',
      context: {
        task: task,
        repository: context.repository,
        branch: context.branch,
        user: context.user,
        projectContext: context.projectContext || {}
      },
      history: [],
      metadata: {
        requestCount: 0,
        totalDuration: 0,
        lastRequestId: null
      }
    };
    
    // Check session limit
    if (this.activeSessions.size >= this.maxActiveSessions) {
      await this.cleanupOldestSession();
    }
    
    this.activeSessions.set(sessionId, session);
    
    log('debug', `📝 Session created: ${sessionId} for task ${task.id}`);
    return session;
  }

  /**
   * Find existing session for a task
   * @param {Object} task - Task object
   * @param {Object} context - Session context
   * @returns {Object|null} Existing session or null
   */
  findExistingSession(task, context) {
    for (const [sessionId, session] of this.activeSessions) {
      if (session.taskId === task.id && 
          session.status === 'active' &&
          this.isSessionValid(session)) {
        
        // Update last activity
        session.lastActivity = new Date();
        return session;
      }
    }
    
    return null;
  }

  /**
   * Update session with new data
   * @param {string} sessionId - Session identifier
   * @param {Object} updates - Updates to apply
   */
  async updateSession(sessionId, updates) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    // Update session data
    Object.assign(session, updates);
    session.lastActivity = new Date();
    session.metadata.requestCount++;
    
    // Add to history
    session.history.push({
      timestamp: new Date(),
      updates: updates
    });
    
    // Keep history size manageable
    if (session.history.length > 50) {
      session.history = session.history.slice(-50);
    }
    
    log('debug', `📝 Session updated: ${sessionId}`);
  }

  /**
   * Get session by ID
   * @param {string} sessionId - Session identifier
   * @returns {Object|null} Session object or null
   */
  getSession(sessionId) {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * Close session
   * @param {string} sessionId - Session identifier
   * @param {string} reason - Closure reason
   */
  async closeSession(sessionId, reason = 'completed') {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      log('warn', `Attempted to close non-existent session: ${sessionId}`);
      return;
    }
    
    session.status = 'closed';
    session.closedAt = new Date();
    session.closeReason = reason;
    
    // Move to history
    this.sessionHistory.push(session);
    this.activeSessions.delete(sessionId);
    
    log('info', `🔒 Session closed: ${sessionId} (${reason})`);
  }

  /**
   * Check if session is valid (not expired)
   * @param {Object} session - Session object
   * @returns {boolean} True if session is valid
   */
  isSessionValid(session) {
    const age = Date.now() - session.createdAt.getTime();
    return age < this.maxSessionAge;
  }

  /**
   * Start session cleanup interval
   */
  startSessionCleanup() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 300000); // Every 5 minutes
    
    log('debug', '🧹 Session cleanup interval started');
  }

  /**
   * Stop session cleanup interval
   */
  stopSessionCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      log('debug', '🛑 Session cleanup interval stopped');
    }
  }

  /**
   * Cleanup expired sessions
   */
  cleanupExpiredSessions() {
    const expiredSessions = [];
    
    for (const [sessionId, session] of this.activeSessions) {
      if (!this.isSessionValid(session)) {
        expiredSessions.push(sessionId);
      }
    }
    
    expiredSessions.forEach(sessionId => {
      const session = this.activeSessions.get(sessionId);
      session.status = 'expired';
      session.expiredAt = new Date();
      
      this.sessionHistory.push(session);
      this.activeSessions.delete(sessionId);
    });
    
    if (expiredSessions.length > 0) {
      log('info', `🧹 Cleaned up ${expiredSessions.length} expired sessions`);
    }
  }

  /**
   * Cleanup oldest session to make room for new ones
   */
  async cleanupOldestSession() {
    let oldestSession = null;
    let oldestTime = Date.now();
    
    for (const [sessionId, session] of this.activeSessions) {
      if (session.createdAt.getTime() < oldestTime) {
        oldestTime = session.createdAt.getTime();
        oldestSession = sessionId;
      }
    }
    
    if (oldestSession) {
      await this.closeSession(oldestSession, 'capacity_limit');
      log('info', `🧹 Cleaned up oldest session: ${oldestSession}`);
    }
  }

  /**
   * Get sessions by task ID
   * @param {string} taskId - Task identifier
   * @returns {Array} Array of sessions for the task
   */
  getSessionsByTask(taskId) {
    const sessions = [];
    
    // Check active sessions
    for (const session of this.activeSessions.values()) {
      if (session.taskId === taskId) {
        sessions.push(session);
      }
    }
    
    // Check session history
    for (const session of this.sessionHistory) {
      if (session.taskId === taskId) {
        sessions.push(session);
      }
    }
    
    return sessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Get session statistics
   * @returns {Object} Session statistics
   */
  getStatistics() {
    const totalSessions = this.activeSessions.size + this.sessionHistory.length;
    const completedSessions = this.sessionHistory.filter(s => s.status === 'closed').length;
    const expiredSessions = this.sessionHistory.filter(s => s.status === 'expired').length;
    
    return {
      active_sessions: this.activeSessions.size,
      completed_sessions: completedSessions,
      expired_sessions: expiredSessions,
      total_sessions: totalSessions,
      average_session_duration_ms: this._calculateAverageSessionDuration(),
      average_requests_per_session: this._calculateAverageRequestsPerSession(),
      session_success_rate: totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0
    };
  }

  /**
   * Get session manager health
   * @returns {Object} Health status
   */
  getHealth() {
    const stats = this.getStatistics();
    
    return {
      status: 'healthy',
      active_sessions: stats.active_sessions,
      cleanup_running: this.cleanupInterval !== null,
      memory_usage: {
        active_sessions_count: this.activeSessions.size,
        history_sessions_count: this.sessionHistory.length,
        within_limits: this.activeSessions.size <= this.maxActiveSessions
      }
    };
  }

  /**
   * Shutdown session manager
   */
  async shutdown() {
    log('info', '🔄 Shutting down session manager...');
    
    // Stop cleanup interval
    this.stopSessionCleanup();
    
    // Close all active sessions
    const activeSessions = Array.from(this.activeSessions.keys());
    for (const sessionId of activeSessions) {
      await this.closeSession(sessionId, 'system_shutdown');
    }
    
    log('info', '✅ Session manager shutdown complete');
  }

  /**
   * Calculate average session duration
   * @returns {number} Average duration in milliseconds
   * @private
   */
  _calculateAverageSessionDuration() {
    const completedSessions = this.sessionHistory.filter(s => 
      s.status === 'closed' && s.closedAt
    );
    
    if (completedSessions.length === 0) return 0;
    
    const totalDuration = completedSessions.reduce((sum, session) => {
      return sum + (session.closedAt.getTime() - session.createdAt.getTime());
    }, 0);
    
    return totalDuration / completedSessions.length;
  }

  /**
   * Calculate average requests per session
   * @returns {number} Average requests per session
   * @private
   */
  _calculateAverageRequestsPerSession() {
    const allSessions = [
      ...Array.from(this.activeSessions.values()),
      ...this.sessionHistory
    ];
    
    if (allSessions.length === 0) return 0;
    
    const totalRequests = allSessions.reduce((sum, session) => {
      return sum + (session.metadata.requestCount || 0);
    }, 0);
    
    return totalRequests / allSessions.length;
  }
}

export default SessionManager;

