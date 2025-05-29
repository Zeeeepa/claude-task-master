import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

/**
 * Session Manager
 * Manages Claude Code session lifecycle, state persistence, and coordination
 */
export class SessionManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Configuration
    this.defaultTimeout = options.defaultTimeout || 3600000; // 1 hour
    this.maxSessions = options.maxSessions || 100;
    this.cleanupInterval = options.cleanupInterval || 300000; // 5 minutes
    this.persistenceEnabled = options.persistenceEnabled || false;
    this.persistencePath = options.persistencePath || './sessions.json';
    
    // Session storage
    this.sessions = new Map();
    this.sessionTimeouts = new Map();
    
    // Statistics
    this.stats = {
      created: 0,
      ended: 0,
      expired: 0,
      active: 0
    };
    
    this.startCleanupTimer();
    this.loadPersistedSessions();
  }

  /**
   * Create a new session
   */
  async createSession(metadata = {}) {
    try {
      // Check session limit
      if (this.sessions.size >= this.maxSessions) {
        throw new Error(`Maximum number of sessions (${this.maxSessions}) reached`);
      }
      
      const sessionId = uuidv4();
      const now = new Date().toISOString();
      
      const session = {
        id: sessionId,
        createdAt: now,
        updatedAt: now,
        lastActivity: now,
        status: 'active',
        metadata: {
          source: 'session_manager',
          ...metadata
        },
        messageCount: 0,
        state: {},
        timeout: metadata.timeout || this.defaultTimeout
      };
      
      // Store session
      this.sessions.set(sessionId, session);
      
      // Set timeout
      this.setSessionTimeout(sessionId, session.timeout);
      
      // Update statistics
      this.stats.created++;
      this.stats.active++;
      
      // Persist if enabled
      if (this.persistenceEnabled) {
        await this.persistSessions();
      }
      
      // Emit event
      this.emit('session_created', {
        sessionId,
        session: { ...session },
        timestamp: now
      });
      
      console.log(`[SessionManager] Created session ${sessionId}`);
      
      return session;
    } catch (error) {
      console.error('[SessionManager] Create session error:', error);
      throw error;
    }
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return null;
    }
    
    // Update last activity
    session.lastActivity = new Date().toISOString();
    session.updatedAt = session.lastActivity;
    
    // Reset timeout
    this.setSessionTimeout(sessionId, session.timeout);
    
    return { ...session };
  }

  /**
   * Update session
   */
  async updateSession(sessionId, updates) {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    // Apply updates
    const now = new Date().toISOString();
    Object.assign(session, updates, {
      updatedAt: now,
      lastActivity: now
    });
    
    // Reset timeout if timeout value changed
    if (updates.timeout) {
      this.setSessionTimeout(sessionId, updates.timeout);
    }
    
    // Persist if enabled
    if (this.persistenceEnabled) {
      await this.persistSessions();
    }
    
    // Emit event
    this.emit('session_updated', {
      sessionId,
      updates,
      session: { ...session },
      timestamp: now
    });
    
    return { ...session };
  }

  /**
   * End session
   */
  async endSession(sessionId) {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    // Update session status
    session.status = 'ended';
    session.endedAt = new Date().toISOString();
    session.updatedAt = session.endedAt;
    
    // Clear timeout
    this.clearSessionTimeout(sessionId);
    
    // Remove from active sessions
    this.sessions.delete(sessionId);
    
    // Update statistics
    this.stats.ended++;
    this.stats.active--;
    
    // Persist if enabled
    if (this.persistenceEnabled) {
      await this.persistSessions();
    }
    
    // Emit event
    this.emit('session_ended', {
      sessionId,
      session: { ...session },
      timestamp: session.endedAt
    });
    
    console.log(`[SessionManager] Ended session ${sessionId}`);
    
    return { success: true, sessionId };
  }

  /**
   * Expire session (called by timeout)
   */
  async expireSession(sessionId) {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return; // Session already removed
    }
    
    // Update session status
    session.status = 'expired';
    session.expiredAt = new Date().toISOString();
    session.updatedAt = session.expiredAt;
    
    // Remove from active sessions
    this.sessions.delete(sessionId);
    
    // Update statistics
    this.stats.expired++;
    this.stats.active--;
    
    // Persist if enabled
    if (this.persistenceEnabled) {
      await this.persistSessions();
    }
    
    // Emit event
    this.emit('session_expired', {
      sessionId,
      session: { ...session },
      timestamp: session.expiredAt
    });
    
    console.log(`[SessionManager] Expired session ${sessionId}`);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions() {
    return Array.from(this.sessions.values()).map(session => ({ ...session }));
  }

  /**
   * Get sessions by criteria
   */
  findSessions(criteria = {}) {
    const sessions = Array.from(this.sessions.values());
    
    return sessions.filter(session => {
      // Filter by status
      if (criteria.status && session.status !== criteria.status) {
        return false;
      }
      
      // Filter by metadata
      if (criteria.metadata) {
        for (const [key, value] of Object.entries(criteria.metadata)) {
          if (session.metadata[key] !== value) {
            return false;
          }
        }
      }
      
      // Filter by age
      if (criteria.maxAge) {
        const age = Date.now() - new Date(session.createdAt).getTime();
        if (age > criteria.maxAge) {
          return false;
        }
      }
      
      // Filter by inactivity
      if (criteria.maxInactivity) {
        const inactivity = Date.now() - new Date(session.lastActivity).getTime();
        if (inactivity > criteria.maxInactivity) {
          return false;
        }
      }
      
      return true;
    }).map(session => ({ ...session }));
  }

  /**
   * Update session state
   */
  async updateSessionState(sessionId, stateUpdates) {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    // Merge state updates
    session.state = {
      ...session.state,
      ...stateUpdates
    };
    
    session.updatedAt = new Date().toISOString();
    session.lastActivity = session.updatedAt;
    
    // Reset timeout
    this.setSessionTimeout(sessionId, session.timeout);
    
    // Persist if enabled
    if (this.persistenceEnabled) {
      await this.persistSessions();
    }
    
    // Emit event
    this.emit('session_state_updated', {
      sessionId,
      stateUpdates,
      newState: { ...session.state },
      timestamp: session.updatedAt
    });
    
    return { ...session.state };
  }

  /**
   * Increment message count for session
   */
  async incrementMessageCount(sessionId) {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    session.messageCount++;
    session.lastActivity = new Date().toISOString();
    session.updatedAt = session.lastActivity;
    
    // Reset timeout
    this.setSessionTimeout(sessionId, session.timeout);
    
    return session.messageCount;
  }

  /**
   * Set session timeout
   */
  setSessionTimeout(sessionId, timeout) {
    // Clear existing timeout
    this.clearSessionTimeout(sessionId);
    
    // Set new timeout
    const timeoutId = setTimeout(() => {
      this.expireSession(sessionId);
    }, timeout);
    
    this.sessionTimeouts.set(sessionId, timeoutId);
  }

  /**
   * Clear session timeout
   */
  clearSessionTimeout(sessionId) {
    const timeoutId = this.sessionTimeouts.get(sessionId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.sessionTimeouts.delete(sessionId);
    }
  }

  /**
   * Start cleanup timer
   */
  startCleanupTimer() {
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.cleanupInterval);
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpiredSessions() {
    const now = Date.now();
    const expiredSessions = [];
    
    for (const [sessionId, session] of this.sessions.entries()) {
      const lastActivity = new Date(session.lastActivity).getTime();
      const inactivity = now - lastActivity;
      
      if (inactivity > session.timeout) {
        expiredSessions.push(sessionId);
      }
    }
    
    for (const sessionId of expiredSessions) {
      await this.expireSession(sessionId);
    }
    
    if (expiredSessions.length > 0) {
      console.log(`[SessionManager] Cleaned up ${expiredSessions.length} expired sessions`);
    }
  }

  /**
   * Get session statistics
   */
  getStats() {
    return {
      ...this.stats,
      active: this.sessions.size,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Persist sessions to storage
   */
  async persistSessions() {
    if (!this.persistenceEnabled) {
      return;
    }
    
    try {
      const fs = await import('fs/promises');
      const sessionsData = {
        sessions: Array.from(this.sessions.entries()),
        stats: this.stats,
        timestamp: new Date().toISOString()
      };
      
      await fs.writeFile(this.persistencePath, JSON.stringify(sessionsData, null, 2));
    } catch (error) {
      console.error('[SessionManager] Persist sessions error:', error);
    }
  }

  /**
   * Load persisted sessions
   */
  async loadPersistedSessions() {
    if (!this.persistenceEnabled) {
      return;
    }
    
    try {
      const fs = await import('fs/promises');
      const data = await fs.readFile(this.persistencePath, 'utf8');
      const sessionsData = JSON.parse(data);
      
      // Restore sessions
      for (const [sessionId, session] of sessionsData.sessions) {
        // Only restore active sessions
        if (session.status === 'active') {
          this.sessions.set(sessionId, session);
          
          // Set timeout for restored session
          const now = Date.now();
          const lastActivity = new Date(session.lastActivity).getTime();
          const elapsed = now - lastActivity;
          const remainingTimeout = Math.max(0, session.timeout - elapsed);
          
          if (remainingTimeout > 0) {
            this.setSessionTimeout(sessionId, remainingTimeout);
          } else {
            // Session should have expired
            await this.expireSession(sessionId);
          }
        }
      }
      
      // Restore stats
      if (sessionsData.stats) {
        this.stats = { ...this.stats, ...sessionsData.stats };
      }
      
      console.log(`[SessionManager] Loaded ${this.sessions.size} persisted sessions`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('[SessionManager] Load persisted sessions error:', error);
      }
    }
  }

  /**
   * Clear all sessions
   */
  async clearAllSessions() {
    const sessionIds = Array.from(this.sessions.keys());
    
    for (const sessionId of sessionIds) {
      await this.endSession(sessionId);
    }
    
    this.emit('all_sessions_cleared', {
      count: sessionIds.length,
      timestamp: new Date().toISOString()
    });
    
    console.log(`[SessionManager] Cleared ${sessionIds.length} sessions`);
    
    return { success: true, count: sessionIds.length };
  }

  /**
   * Extend session timeout
   */
  async extendSession(sessionId, additionalTime) {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    session.timeout += additionalTime;
    session.updatedAt = new Date().toISOString();
    
    // Reset timeout with new duration
    this.setSessionTimeout(sessionId, session.timeout);
    
    // Emit event
    this.emit('session_extended', {
      sessionId,
      additionalTime,
      newTimeout: session.timeout,
      timestamp: session.updatedAt
    });
    
    return { ...session };
  }

  /**
   * Get session health
   */
  getSessionHealth(sessionId) {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return null;
    }
    
    const now = Date.now();
    const lastActivity = new Date(session.lastActivity).getTime();
    const inactivity = now - lastActivity;
    const timeoutRemaining = Math.max(0, session.timeout - inactivity);
    
    return {
      sessionId,
      status: session.status,
      inactivity,
      timeoutRemaining,
      messageCount: session.messageCount,
      healthy: timeoutRemaining > 0 && session.status === 'active'
    };
  }

  /**
   * Cleanup resources
   */
  destroy() {
    // Clear all timeouts
    for (const timeoutId of this.sessionTimeouts.values()) {
      clearTimeout(timeoutId);
    }
    
    this.sessionTimeouts.clear();
    this.sessions.clear();
    this.removeAllListeners();
  }
}

export default SessionManager;

