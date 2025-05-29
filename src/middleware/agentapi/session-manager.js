/**
 * Session Manager - Session state management
 * Manages AI agent sessions, WebSocket connections, and session state
 */

import { EventEmitter } from 'events';
import { logger } from '../../utils/logger.js';
import { configManager } from '../../utils/config-manager.js';

class SessionManager extends EventEmitter {
    constructor() {
        super();
        this.sessions = new Map();
        this.webSockets = new Map();
        this.sessionTimeouts = new Map();
        this.defaultSessionTimeout = 3600000; // 1 hour
        this.cleanupInterval = null;
    }

    /**
     * Initialize the session manager
     */
    async initialize() {
        logger.info('Initializing session manager...');
        
        // Start cleanup interval
        this.startCleanup();
        
        logger.info('Session manager initialized successfully');
    }

    /**
     * Create a new session
     */
    async createSession(agentType = 'default', configuration = {}) {
        const sessionId = this.generateSessionId();
        const session = {
            id: sessionId,
            agentType,
            configuration,
            status: 'active',
            createdAt: Date.now(),
            lastActivity: Date.now(),
            metadata: {},
            context: {},
            webSockets: new Set(),
            eventSubscriptions: new Set()
        };

        this.sessions.set(sessionId, session);
        
        // Set session timeout
        this.setSessionTimeout(sessionId);
        
        this.emit('sessionCreated', session);
        
        logger.info(`Session created: ${sessionId}`, { agentType });
        return session;
    }

    /**
     * Get a session by ID
     */
    getSession(sessionId) {
        const session = this.sessions.get(sessionId);
        
        if (session) {
            // Update last activity
            session.lastActivity = Date.now();
            this.resetSessionTimeout(sessionId);
        }
        
        return session;
    }

    /**
     * Update session
     */
    updateSession(sessionId, updates) {
        const session = this.sessions.get(sessionId);
        
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        // Merge updates
        Object.assign(session, updates);
        session.lastActivity = Date.now();
        
        this.resetSessionTimeout(sessionId);
        this.emit('sessionUpdated', session);
        
        logger.debug(`Session updated: ${sessionId}`);
        return session;
    }

    /**
     * Delete a session
     */
    async deleteSession(sessionId) {
        const session = this.sessions.get(sessionId);
        
        if (!session) {
            logger.warn(`Attempted to delete non-existent session: ${sessionId}`);
            return false;
        }

        // Close all WebSocket connections
        for (const ws of session.webSockets) {
            if (ws.readyState === ws.OPEN) {
                ws.close(1000, 'Session deleted');
            }
        }

        // Clear timeout
        this.clearSessionTimeout(sessionId);
        
        // Remove from maps
        this.sessions.delete(sessionId);
        this.webSockets.delete(sessionId);
        
        this.emit('sessionDeleted', { sessionId, session });
        
        logger.info(`Session deleted: ${sessionId}`);
        return true;
    }

    /**
     * Add WebSocket to session
     */
    addWebSocket(sessionId, webSocket) {
        const session = this.sessions.get(sessionId);
        
        if (!session) {
            logger.warn(`Attempted to add WebSocket to non-existent session: ${sessionId}`);
            return false;
        }

        session.webSockets.add(webSocket);
        
        if (!this.webSockets.has(sessionId)) {
            this.webSockets.set(sessionId, new Set());
        }
        this.webSockets.get(sessionId).add(webSocket);
        
        // Update last activity
        session.lastActivity = Date.now();
        this.resetSessionTimeout(sessionId);
        
        logger.debug(`WebSocket added to session: ${sessionId}`);
        return true;
    }

    /**
     * Remove WebSocket from session
     */
    removeWebSocket(sessionId, webSocket) {
        const session = this.sessions.get(sessionId);
        
        if (session) {
            session.webSockets.delete(webSocket);
        }
        
        const sessionWebSockets = this.webSockets.get(sessionId);
        if (sessionWebSockets) {
            sessionWebSockets.delete(webSocket);
            
            if (sessionWebSockets.size === 0) {
                this.webSockets.delete(sessionId);
            }
        }
        
        logger.debug(`WebSocket removed from session: ${sessionId}`);
    }

    /**
     * Subscribe session to events
     */
    subscribeToEvents(sessionId, events) {
        const session = this.sessions.get(sessionId);
        
        if (!session) {
            logger.warn(`Attempted to subscribe non-existent session to events: ${sessionId}`);
            return false;
        }

        for (const event of events) {
            session.eventSubscriptions.add(event);
        }
        
        logger.debug(`Session subscribed to events: ${sessionId}`, { events });
        return true;
    }

    /**
     * Unsubscribe session from events
     */
    unsubscribeFromEvents(sessionId, events) {
        const session = this.sessions.get(sessionId);
        
        if (!session) {
            return false;
        }

        for (const event of events) {
            session.eventSubscriptions.delete(event);
        }
        
        logger.debug(`Session unsubscribed from events: ${sessionId}`, { events });
        return true;
    }

    /**
     * Broadcast message to session WebSockets
     */
    broadcastToSession(sessionId, message) {
        const sessionWebSockets = this.webSockets.get(sessionId);
        
        if (!sessionWebSockets) {
            return 0;
        }

        let sentCount = 0;
        const messageString = JSON.stringify(message);
        
        for (const ws of sessionWebSockets) {
            if (ws.readyState === ws.OPEN) {
                try {
                    ws.send(messageString);
                    sentCount++;
                } catch (error) {
                    logger.error(`Error sending message to WebSocket in session ${sessionId}:`, error);
                }
            }
        }
        
        logger.debug(`Broadcast message to session: ${sessionId}`, { sentCount });
        return sentCount;
    }

    /**
     * Broadcast event to subscribed sessions
     */
    broadcastEvent(eventType, eventData) {
        let broadcastCount = 0;
        
        for (const [sessionId, session] of this.sessions) {
            if (session.eventSubscriptions.has(eventType) || session.eventSubscriptions.has('*')) {
                const message = {
                    type: 'event',
                    eventType,
                    data: eventData,
                    timestamp: Date.now()
                };
                
                const sent = this.broadcastToSession(sessionId, message);
                broadcastCount += sent;
            }
        }
        
        logger.debug(`Event broadcast: ${eventType}`, { broadcastCount });
        return broadcastCount;
    }

    /**
     * Set session timeout
     */
    setSessionTimeout(sessionId) {
        const timeout = configManager.get('session.timeout', this.defaultSessionTimeout);
        
        const timeoutId = setTimeout(() => {
            logger.info(`Session timeout: ${sessionId}`);
            this.deleteSession(sessionId);
        }, timeout);
        
        this.sessionTimeouts.set(sessionId, timeoutId);
    }

    /**
     * Reset session timeout
     */
    resetSessionTimeout(sessionId) {
        this.clearSessionTimeout(sessionId);
        this.setSessionTimeout(sessionId);
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
     * Start cleanup interval
     */
    startCleanup() {
        const cleanupInterval = configManager.get('session.cleanupInterval', 300000); // 5 minutes
        
        this.cleanupInterval = setInterval(() => {
            this.performCleanup();
        }, cleanupInterval);
    }

    /**
     * Perform cleanup of stale sessions and connections
     */
    performCleanup() {
        const now = Date.now();
        const staleThreshold = configManager.get('session.staleThreshold', 1800000); // 30 minutes
        const staleSessions = [];
        
        // Find stale sessions
        for (const [sessionId, session] of this.sessions) {
            if (now - session.lastActivity > staleThreshold) {
                staleSessions.push(sessionId);
            }
        }
        
        // Clean up stale sessions
        for (const sessionId of staleSessions) {
            logger.info(`Cleaning up stale session: ${sessionId}`);
            this.deleteSession(sessionId);
        }
        
        // Clean up dead WebSocket connections
        for (const [sessionId, webSockets] of this.webSockets) {
            const deadConnections = [];
            
            for (const ws of webSockets) {
                if (ws.readyState === ws.CLOSED || ws.readyState === ws.CLOSING) {
                    deadConnections.push(ws);
                }
            }
            
            for (const ws of deadConnections) {
                this.removeWebSocket(sessionId, ws);
            }
        }
        
        if (staleSessions.length > 0) {
            logger.info(`Cleanup completed: ${staleSessions.length} stale sessions removed`);
        }
    }

    /**
     * Get all sessions
     */
    getAllSessions() {
        return Array.from(this.sessions.values()).map(session => ({
            id: session.id,
            agentType: session.agentType,
            status: session.status,
            createdAt: session.createdAt,
            lastActivity: session.lastActivity,
            webSocketCount: session.webSockets.size,
            eventSubscriptions: Array.from(session.eventSubscriptions)
        }));
    }

    /**
     * Get sessions by agent type
     */
    getSessionsByAgentType(agentType) {
        const sessions = [];
        
        for (const session of this.sessions.values()) {
            if (session.agentType === agentType) {
                sessions.push(session);
            }
        }
        
        return sessions;
    }

    /**
     * Get active sessions count
     */
    getActiveSessionsCount() {
        let count = 0;
        
        for (const session of this.sessions.values()) {
            if (session.status === 'active') {
                count++;
            }
        }
        
        return count;
    }

    /**
     * Update session context
     */
    updateSessionContext(sessionId, contextUpdates) {
        const session = this.sessions.get(sessionId);
        
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        session.context = { ...session.context, ...contextUpdates };
        session.lastActivity = Date.now();
        
        this.resetSessionTimeout(sessionId);
        
        logger.debug(`Session context updated: ${sessionId}`);
        return session.context;
    }

    /**
     * Get session context
     */
    getSessionContext(sessionId) {
        const session = this.sessions.get(sessionId);
        return session ? session.context : null;
    }

    /**
     * Generate unique session ID
     */
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get session manager status
     */
    getStatus() {
        return {
            sessionCount: this.sessions.size,
            activeSessionCount: this.getActiveSessionsCount(),
            webSocketCount: Array.from(this.webSockets.values()).reduce((sum, set) => sum + set.size, 0),
            timeoutCount: this.sessionTimeouts.size
        };
    }

    /**
     * Stop the session manager
     */
    async stop() {
        logger.info('Stopping session manager...');
        
        // Clear cleanup interval
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        
        // Close all sessions
        const sessionIds = Array.from(this.sessions.keys());
        for (const sessionId of sessionIds) {
            await this.deleteSession(sessionId);
        }
        
        logger.info('Session manager stopped');
    }
}

export const sessionManager = new SessionManager();
export default SessionManager;

