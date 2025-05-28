/**
 * Agent Session Manager
 * 
 * Manages long-running agent sessions with comprehensive lifecycle management,
 * resource monitoring, and cleanup automation. Handles multiple coding agents
 * (Claude Code, Goose, Aider, Codex) with proper isolation and coordination.
 * 
 * Features:
 * - Session lifecycle management
 * - Resource monitoring and limits
 * - Automatic cleanup and garbage collection
 * - Session persistence and recovery
 * - Performance metrics and health monitoring
 * - Concurrent session coordination
 * - Error handling and recovery
 */

import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import { SimpleLogger } from '../utils/simple_logger.js';
import AgentAPIClient from './agentapi_client.js';

export class AgentSessionManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      maxSessions: config.maxSessions || 10,
      sessionTimeout: config.sessionTimeout || 3600000, // 1 hour
      heartbeatInterval: config.heartbeatInterval || 30000, // 30 seconds
      cleanupInterval: config.cleanupInterval || 300000, // 5 minutes
      persistenceDir: config.persistenceDir || './data/sessions',
      resourceLimits: {
        maxMemoryPerSession: config.resourceLimits?.maxMemoryPerSession || '2GB',
        maxCpuPerSession: config.resourceLimits?.maxCpuPerSession || 50, // percentage
        maxDiskPerSession: config.resourceLimits?.maxDiskPerSession || '10GB'
      },
      agentTypes: {
        claude: {
          maxSessions: config.agentTypes?.claude?.maxSessions || 5,
          defaultModel: config.agentTypes?.claude?.defaultModel || 'claude-3-sonnet-20240229',
          timeout: config.agentTypes?.claude?.timeout || 60000
        },
        goose: {
          maxSessions: config.agentTypes?.goose?.maxSessions || 3,
          timeout: config.agentTypes?.goose?.timeout || 45000
        },
        aider: {
          maxSessions: config.agentTypes?.aider?.maxSessions || 3,
          timeout: config.agentTypes?.aider?.timeout || 45000
        },
        codex: {
          maxSessions: config.agentTypes?.codex?.maxSessions || 2,
          timeout: config.agentTypes?.codex?.timeout || 30000
        }
      },
      ...config
    };

    this.logger = new SimpleLogger('AgentSessionManager', config.logLevel || 'info');
    
    // Session tracking
    this.sessions = new Map();
    this.sessionsByType = new Map();
    this.sessionMetrics = new Map();
    
    // Resource monitoring
    this.resourceUsage = {
      totalMemory: 0,
      totalCpu: 0,
      totalDisk: 0,
      sessionCount: 0
    };

    // Initialize agent type tracking
    for (const agentType of Object.keys(this.config.agentTypes)) {
      this.sessionsByType.set(agentType, new Set());
    }

    // AgentAPI client
    this.agentAPI = new AgentAPIClient(config.agentapi);
    
    // Timers
    this.heartbeatTimer = null;
    this.cleanupTimer = null;
    
    // Initialize manager
    this.initialize();
  }

  /**
   * Initialize session manager
   */
  async initialize() {
    try {
      // Ensure persistence directory exists
      await fs.mkdir(this.config.persistenceDir, { recursive: true });
      
      // Load persisted sessions
      await this.loadPersistedSessions();
      
      // Start monitoring
      this.startHeartbeat();
      this.startCleanupTimer();
      
      this.logger.info('Agent Session Manager initialized successfully');
      this.emit('initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Agent Session Manager:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Create new agent session
   */
  async createSession(agentType, config = {}) {
    try {
      // Validate agent type
      if (!this.config.agentTypes[agentType]) {
        throw new Error(`Unsupported agent type: ${agentType}`);
      }

      // Check session limits
      this.checkSessionLimits(agentType);

      const sessionId = this.generateSessionId(agentType);
      
      this.logger.info(`Creating ${agentType} session: ${sessionId}`);

      const sessionConfig = {
        id: sessionId,
        type: agentType,
        status: 'creating',
        createdAt: Date.now(),
        lastActivity: Date.now(),
        lastHeartbeat: Date.now(),
        config: {
          ...this.config.agentTypes[agentType],
          ...config
        },
        metadata: config.metadata || {},
        resourceUsage: {
          memory: 0,
          cpu: 0,
          disk: 0
        },
        messageCount: 0,
        errorCount: 0,
        warnings: []
      };

      // Start session via AgentAPI
      const agentSession = await this.agentAPI.startAgentSession(agentType, {
        sessionId,
        ...sessionConfig.config
      });

      sessionConfig.agentSessionId = agentSession.sessionId;
      sessionConfig.status = 'active';

      // Track session
      this.sessions.set(sessionId, sessionConfig);
      this.sessionsByType.get(agentType).add(sessionId);
      this.sessionMetrics.set(sessionId, {
        messagesPerMinute: 0,
        averageResponseTime: 0,
        errorRate: 0,
        lastMetricsUpdate: Date.now()
      });

      // Persist session
      await this.persistSession(sessionConfig);

      // Update resource usage
      this.updateResourceUsage();

      this.logger.info(`${agentType} session created successfully: ${sessionId}`);
      this.emit('sessionCreated', sessionConfig);

      return sessionConfig;
    } catch (error) {
      this.logger.error(`Failed to create ${agentType} session:`, error);
      throw error;
    }
  }

  /**
   * Check session limits
   */
  checkSessionLimits(agentType) {
    // Check global limit
    if (this.sessions.size >= this.config.maxSessions) {
      throw new Error(`Maximum sessions limit reached: ${this.config.maxSessions}`);
    }

    // Check agent type limit
    const typeLimit = this.config.agentTypes[agentType].maxSessions;
    const typeSessions = this.sessionsByType.get(agentType).size;
    
    if (typeSessions >= typeLimit) {
      throw new Error(`Maximum ${agentType} sessions limit reached: ${typeLimit}`);
    }
  }

  /**
   * Send message to session
   */
  async sendMessage(sessionId, message, options = {}) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status !== 'active') {
      throw new Error(`Session ${sessionId} is not active (status: ${session.status})`);
    }

    try {
      this.logger.debug(`Sending message to session ${sessionId}`);
      
      const startTime = Date.now();
      
      // Send message via AgentAPI
      const response = await this.agentAPI.sendMessage(session.agentSessionId, message, options);
      
      const responseTime = Date.now() - startTime;
      
      // Update session metrics
      session.lastActivity = Date.now();
      session.messageCount++;
      
      this.updateSessionMetrics(sessionId, responseTime, true);
      
      this.emit('messageSent', { sessionId, message, response, responseTime });
      
      return response;
    } catch (error) {
      session.errorCount++;
      this.updateSessionMetrics(sessionId, 0, false);
      
      this.logger.error(`Failed to send message to session ${sessionId}:`, error);
      this.emit('messageError', { sessionId, error });
      
      throw error;
    }
  }

  /**
   * Update session metrics
   */
  updateSessionMetrics(sessionId, responseTime, success) {
    const metrics = this.sessionMetrics.get(sessionId);
    if (!metrics) return;

    const now = Date.now();
    const timeSinceLastUpdate = now - metrics.lastMetricsUpdate;
    
    // Update messages per minute
    if (timeSinceLastUpdate > 0) {
      const messagesInWindow = 1;
      const windowMinutes = timeSinceLastUpdate / 60000;
      metrics.messagesPerMinute = messagesInWindow / windowMinutes;
    }

    // Update average response time
    if (success && responseTime > 0) {
      const session = this.sessions.get(sessionId);
      const totalMessages = session.messageCount;
      metrics.averageResponseTime = 
        ((metrics.averageResponseTime * (totalMessages - 1)) + responseTime) / totalMessages;
    }

    // Update error rate
    const session = this.sessions.get(sessionId);
    metrics.errorRate = session.errorCount / session.messageCount;
    
    metrics.lastMetricsUpdate = now;
  }

  /**
   * Get session status
   */
  async getSessionStatus(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    try {
      // Get status from AgentAPI
      const agentStatus = await this.agentAPI.getSessionStatus(session.agentSessionId);
      
      // Get resource usage
      const resourceUsage = await this.getSessionResourceUsage(sessionId);
      
      return {
        ...session,
        agentStatus,
        resourceUsage,
        metrics: this.sessionMetrics.get(sessionId),
        uptime: Date.now() - session.createdAt,
        isHealthy: this.isSessionHealthy(sessionId)
      };
    } catch (error) {
      this.logger.error(`Failed to get session status ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Check if session is healthy
   */
  isSessionHealthy(sessionId) {
    const session = this.sessions.get(sessionId);
    const metrics = this.sessionMetrics.get(sessionId);
    
    if (!session || !metrics) return false;
    
    const now = Date.now();
    const timeSinceHeartbeat = now - session.lastHeartbeat;
    const timeSinceActivity = now - session.lastActivity;
    
    // Check heartbeat
    if (timeSinceHeartbeat > this.config.heartbeatInterval * 2) {
      return false;
    }
    
    // Check activity timeout
    if (timeSinceActivity > this.config.sessionTimeout) {
      return false;
    }
    
    // Check error rate
    if (metrics.errorRate > 0.5) { // More than 50% errors
      return false;
    }
    
    return session.status === 'active';
  }

  /**
   * Get session resource usage
   */
  async getSessionResourceUsage(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    try {
      // This would typically integrate with system monitoring tools
      // For now, return mock data
      return {
        memory: Math.random() * 1024 * 1024 * 1024, // Random memory usage
        cpu: Math.random() * 100, // Random CPU percentage
        disk: Math.random() * 1024 * 1024 * 1024 * 5, // Random disk usage
        networkIn: Math.random() * 1024 * 1024,
        networkOut: Math.random() * 1024 * 1024
      };
    } catch (error) {
      this.logger.warn(`Failed to get resource usage for session ${sessionId}:`, error.message);
      return null;
    }
  }

  /**
   * Stop session
   */
  async stopSession(sessionId, reason = 'manual') {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    try {
      this.logger.info(`Stopping session ${sessionId} (reason: ${reason})`);
      
      session.status = 'stopping';
      
      // Stop session via AgentAPI
      await this.agentAPI.stopAgentSession(session.agentSessionId);
      
      session.status = 'stopped';
      session.stoppedAt = Date.now();
      session.stopReason = reason;
      
      // Remove from tracking
      this.sessionsByType.get(session.type).delete(sessionId);
      this.sessions.delete(sessionId);
      this.sessionMetrics.delete(sessionId);
      
      // Remove persistence
      await this.removePersistedSession(sessionId);
      
      // Update resource usage
      this.updateResourceUsage();
      
      this.logger.info(`Session stopped successfully: ${sessionId}`);
      this.emit('sessionStopped', { sessionId, reason });
      
      return { success: true, sessionId };
    } catch (error) {
      this.logger.error(`Failed to stop session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Perform heartbeat check
   */
  async performHeartbeat() {
    const now = Date.now();
    const unhealthySessions = [];
    
    for (const [sessionId, session] of this.sessions) {
      try {
        // Update heartbeat
        session.lastHeartbeat = now;
        
        // Check session health
        if (!this.isSessionHealthy(sessionId)) {
          unhealthySessions.push(sessionId);
          continue;
        }
        
        // Ping session via AgentAPI
        await this.agentAPI.getSessionStatus(session.agentSessionId);
        
      } catch (error) {
        this.logger.warn(`Heartbeat failed for session ${sessionId}:`, error.message);
        unhealthySessions.push(sessionId);
      }
    }
    
    // Handle unhealthy sessions
    for (const sessionId of unhealthySessions) {
      try {
        await this.stopSession(sessionId, 'unhealthy');
      } catch (error) {
        this.logger.error(`Failed to stop unhealthy session ${sessionId}:`, error);
      }
    }
    
    if (unhealthySessions.length > 0) {
      this.logger.info(`Cleaned up ${unhealthySessions.length} unhealthy sessions`);
    }
  }

  /**
   * Start heartbeat monitoring
   */
  startHeartbeat() {
    if (this.config.heartbeatInterval > 0) {
      this.heartbeatTimer = setInterval(() => {
        this.performHeartbeat().catch(error => {
          this.logger.error('Heartbeat check failed:', error);
        });
      }, this.config.heartbeatInterval);
    }
  }

  /**
   * Start cleanup timer
   */
  startCleanupTimer() {
    if (this.config.cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => {
        this.performCleanup().catch(error => {
          this.logger.error('Cleanup failed:', error);
        });
      }, this.config.cleanupInterval);
    }
  }

  /**
   * Perform cleanup of expired sessions
   */
  async performCleanup() {
    const now = Date.now();
    const expiredSessions = [];
    
    for (const [sessionId, session] of this.sessions) {
      const age = now - session.lastActivity;
      if (age > this.config.sessionTimeout) {
        expiredSessions.push(sessionId);
      }
    }
    
    if (expiredSessions.length > 0) {
      this.logger.info(`Cleaning up ${expiredSessions.length} expired sessions`);
      
      for (const sessionId of expiredSessions) {
        try {
          await this.stopSession(sessionId, 'expired');
        } catch (error) {
          this.logger.error(`Failed to cleanup expired session ${sessionId}:`, error);
        }
      }
    }
  }

  /**
   * Persist session to disk
   */
  async persistSession(session) {
    try {
      const sessionFile = path.join(this.config.persistenceDir, `${session.id}.json`);
      await fs.writeFile(sessionFile, JSON.stringify(session, null, 2));
    } catch (error) {
      this.logger.warn(`Failed to persist session ${session.id}:`, error.message);
    }
  }

  /**
   * Remove persisted session
   */
  async removePersistedSession(sessionId) {
    try {
      const sessionFile = path.join(this.config.persistenceDir, `${sessionId}.json`);
      await fs.unlink(sessionFile);
    } catch (error) {
      // File might not exist, which is fine
      this.logger.debug(`Could not remove persisted session ${sessionId}:`, error.message);
    }
  }

  /**
   * Load persisted sessions
   */
  async loadPersistedSessions() {
    try {
      const files = await fs.readdir(this.config.persistenceDir);
      const sessionFiles = files.filter(f => f.endsWith('.json'));
      
      for (const file of sessionFiles) {
        try {
          const sessionFile = path.join(this.config.persistenceDir, file);
          const sessionData = JSON.parse(await fs.readFile(sessionFile, 'utf8'));
          
          // Validate session data
          if (this.isValidSessionData(sessionData)) {
            // Mark as recovered
            sessionData.status = 'recovered';
            sessionData.lastHeartbeat = Date.now();
            
            this.sessions.set(sessionData.id, sessionData);
            this.sessionsByType.get(sessionData.type).add(sessionData.id);
            this.sessionMetrics.set(sessionData.id, {
              messagesPerMinute: 0,
              averageResponseTime: 0,
              errorRate: 0,
              lastMetricsUpdate: Date.now()
            });
            
            this.logger.info(`Recovered session: ${sessionData.id}`);
          } else {
            // Remove invalid session file
            await fs.unlink(sessionFile);
          }
        } catch (error) {
          this.logger.warn(`Failed to load session from ${file}:`, error.message);
        }
      }
      
      this.logger.info(`Loaded ${this.sessions.size} persisted sessions`);
    } catch (error) {
      this.logger.warn('Failed to load persisted sessions:', error.message);
    }
  }

  /**
   * Validate session data
   */
  isValidSessionData(sessionData) {
    return sessionData &&
           typeof sessionData.id === 'string' &&
           typeof sessionData.type === 'string' &&
           this.config.agentTypes[sessionData.type] &&
           typeof sessionData.createdAt === 'number';
  }

  /**
   * Update resource usage tracking
   */
  updateResourceUsage() {
    this.resourceUsage.sessionCount = this.sessions.size;
    
    // Calculate total resource usage
    let totalMemory = 0;
    let totalCpu = 0;
    let totalDisk = 0;
    
    for (const session of this.sessions.values()) {
      totalMemory += session.resourceUsage.memory || 0;
      totalCpu += session.resourceUsage.cpu || 0;
      totalDisk += session.resourceUsage.disk || 0;
    }
    
    this.resourceUsage.totalMemory = totalMemory;
    this.resourceUsage.totalCpu = totalCpu;
    this.resourceUsage.totalDisk = totalDisk;
  }

  /**
   * Generate session ID
   */
  generateSessionId(agentType) {
    return `${agentType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get all sessions
   */
  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  /**
   * Get sessions by type
   */
  getSessionsByType(agentType) {
    const sessionIds = this.sessionsByType.get(agentType);
    if (!sessionIds) return [];
    
    return Array.from(sessionIds).map(id => this.sessions.get(id)).filter(Boolean);
  }

  /**
   * Get manager statistics
   */
  getStatistics() {
    const sessions = Array.from(this.sessions.values());
    const activeSessions = sessions.filter(s => s.status === 'active');
    
    const typeStats = {};
    for (const [type, sessionIds] of this.sessionsByType) {
      typeStats[type] = sessionIds.size;
    }
    
    return {
      totalSessions: sessions.length,
      activeSessions: activeSessions.length,
      sessionsByType: typeStats,
      resourceUsage: this.resourceUsage,
      averageSessionAge: sessions.length > 0 
        ? sessions.reduce((sum, s) => sum + (Date.now() - s.createdAt), 0) / sessions.length
        : 0,
      totalMessages: sessions.reduce((sum, s) => sum + s.messageCount, 0),
      totalErrors: sessions.reduce((sum, s) => sum + s.errorCount, 0)
    };
  }

  /**
   * Cleanup all resources
   */
  async cleanup() {
    this.logger.info('Cleaning up Agent Session Manager');
    
    // Stop timers
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    // Stop all sessions
    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      try {
        await this.stopSession(sessionId, 'cleanup');
      } catch (error) {
        this.logger.error(`Failed to cleanup session ${sessionId}:`, error);
      }
    }
    
    // Cleanup AgentAPI client
    await this.agentAPI.cleanup();
    
    this.removeAllListeners();
    this.emit('cleanup');
  }
}

export default AgentSessionManager;

