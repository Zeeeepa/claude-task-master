/**
 * Session Manager
 * Manages agent sessions, authentication, and state persistence
 * Part of Task Master Architecture Restructuring
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

/**
 * Session Class
 * Represents an individual agent session
 */
class Session {
    constructor(options = {}) {
        this.id = options.id || uuidv4();
        this.clientId = options.clientId;
        this.status = 'initializing';
        this.createdAt = new Date().toISOString();
        this.lastActivity = new Date().toISOString();
        this.expiresAt = new Date(Date.now() + (options.timeout || 3600000)).toISOString();
        
        this.config = {
            claudeCodePath: options.claudeCodePath,
            allowedTools: options.allowedTools || [],
            workingDirectory: options.workingDirectory || process.cwd(),
            environment: options.environment || {},
            model: options.model,
            temperature: options.temperature,
            ...options.config
        };

        this.state = {
            processId: null,
            terminalState: null,
            messageCount: 0,
            lastMessage: null,
            errors: [],
            metadata: {}
        };

        this.clients = new Set();
        this.permissions = new Set(['read', 'write']);
        this.securityToken = this.generateSecurityToken();
    }

    /**
     * Generate security token for session
     */
    generateSecurityToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Update last activity timestamp
     */
    updateActivity() {
        this.lastActivity = new Date().toISOString();
    }

    /**
     * Check if session is expired
     */
    isExpired() {
        return new Date() > new Date(this.expiresAt);
    }

    /**
     * Extend session expiration
     */
    extend(additionalTime = 3600000) {
        this.expiresAt = new Date(Date.now() + additionalTime).toISOString();
        this.updateActivity();
    }

    /**
     * Add client to session
     */
    addClient(clientId) {
        this.clients.add(clientId);
        this.updateActivity();
    }

    /**
     * Remove client from session
     */
    removeClient(clientId) {
        this.clients.delete(clientId);
        this.updateActivity();
    }

    /**
     * Check if client has access to session
     */
    hasClient(clientId) {
        return this.clients.has(clientId);
    }

    /**
     * Update session state
     */
    updateState(updates) {
        this.state = { ...this.state, ...updates };
        this.updateActivity();
    }

    /**
     * Add error to session
     */
    addError(error) {
        this.state.errors.push({
            message: error.message || error,
            timestamp: new Date().toISOString(),
            stack: error.stack
        });
        this.updateActivity();
    }

    /**
     * Get session summary
     */
    getSummary() {
        return {
            id: this.id,
            clientId: this.clientId,
            status: this.status,
            createdAt: this.createdAt,
            lastActivity: this.lastActivity,
            expiresAt: this.expiresAt,
            isExpired: this.isExpired(),
            clientCount: this.clients.size,
            messageCount: this.state.messageCount,
            errorCount: this.state.errors.length,
            permissions: Array.from(this.permissions)
        };
    }

    /**
     * Get full session data
     */
    getFullData() {
        return {
            ...this.getSummary(),
            config: this.config,
            state: this.state,
            clients: Array.from(this.clients)
        };
    }
}

/**
 * Session Store
 * Handles session persistence and recovery
 */
class SessionStore {
    constructor(options = {}) {
        this.storageType = options.storageType || 'memory';
        this.persistenceInterval = options.persistenceInterval || 60000; // 1 minute
        this.backupInterval = options.backupInterval || 300000; // 5 minutes
        
        this.sessions = new Map();
        this.backups = new Map();
        
        if (this.storageType === 'file') {
            this.setupFilePersistence(options);
        }
        
        this.startPeriodicTasks();
    }

    /**
     * Setup file-based persistence
     */
    setupFilePersistence(options) {
        this.storageFile = options.storageFile || './sessions.json';
        this.backupFile = options.backupFile || './sessions.backup.json';
        
        // Load existing sessions
        this.loadFromFile();
    }

    /**
     * Start periodic tasks
     */
    startPeriodicTasks() {
        // Periodic persistence
        this.persistenceTimer = setInterval(() => {
            this.persist();
        }, this.persistenceInterval);

        // Periodic backup
        this.backupTimer = setInterval(() => {
            this.createBackup();
        }, this.backupInterval);

        // Cleanup expired sessions
        this.cleanupTimer = setInterval(() => {
            this.cleanupExpiredSessions();
        }, 60000); // Every minute
    }

    /**
     * Store session
     */
    set(sessionId, session) {
        this.sessions.set(sessionId, session);
    }

    /**
     * Get session
     */
    get(sessionId) {
        return this.sessions.get(sessionId);
    }

    /**
     * Check if session exists
     */
    has(sessionId) {
        return this.sessions.has(sessionId);
    }

    /**
     * Delete session
     */
    delete(sessionId) {
        return this.sessions.delete(sessionId);
    }

    /**
     * Get all sessions
     */
    getAll() {
        return Array.from(this.sessions.values());
    }

    /**
     * Get active sessions (non-expired)
     */
    getActive() {
        return this.getAll().filter(session => !session.isExpired());
    }

    /**
     * Cleanup expired sessions
     */
    cleanupExpiredSessions() {
        const expiredSessions = [];
        
        for (const [sessionId, session] of this.sessions) {
            if (session.isExpired()) {
                expiredSessions.push(sessionId);
            }
        }

        for (const sessionId of expiredSessions) {
            this.sessions.delete(sessionId);
        }

        if (expiredSessions.length > 0) {
            console.log(`Cleaned up ${expiredSessions.length} expired sessions`);
        }

        return expiredSessions;
    }

    /**
     * Persist sessions to storage
     */
    persist() {
        if (this.storageType === 'file') {
            this.saveToFile();
        }
    }

    /**
     * Create backup of sessions
     */
    createBackup() {
        const backup = {
            timestamp: new Date().toISOString(),
            sessions: Array.from(this.sessions.entries()).map(([id, session]) => [
                id,
                session.getFullData()
            ])
        };

        this.backups.set(backup.timestamp, backup);

        // Keep only last 10 backups
        const backupKeys = Array.from(this.backups.keys()).sort();
        while (backupKeys.length > 10) {
            const oldestKey = backupKeys.shift();
            this.backups.delete(oldestKey);
        }

        if (this.storageType === 'file') {
            this.saveBackupToFile(backup);
        }
    }

    /**
     * Save sessions to file
     */
    saveToFile() {
        try {
            const fs = require('fs');
            const data = {
                timestamp: new Date().toISOString(),
                sessions: Array.from(this.sessions.entries()).map(([id, session]) => [
                    id,
                    session.getFullData()
                ])
            };

            fs.writeFileSync(this.storageFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Error saving sessions to file:', error);
        }
    }

    /**
     * Load sessions from file
     */
    loadFromFile() {
        try {
            const fs = require('fs');
            
            if (!fs.existsSync(this.storageFile)) {
                return;
            }

            const data = JSON.parse(fs.readFileSync(this.storageFile, 'utf8'));
            
            for (const [sessionId, sessionData] of data.sessions) {
                const session = new Session(sessionData);
                // Restore session state
                Object.assign(session, sessionData);
                this.sessions.set(sessionId, session);
            }

            console.log(`Loaded ${this.sessions.size} sessions from file`);
        } catch (error) {
            console.error('Error loading sessions from file:', error);
        }
    }

    /**
     * Save backup to file
     */
    saveBackupToFile(backup) {
        try {
            const fs = require('fs');
            fs.writeFileSync(this.backupFile, JSON.stringify(backup, null, 2));
        } catch (error) {
            console.error('Error saving backup to file:', error);
        }
    }

    /**
     * Cleanup and stop periodic tasks
     */
    cleanup() {
        if (this.persistenceTimer) {
            clearInterval(this.persistenceTimer);
        }
        if (this.backupTimer) {
            clearInterval(this.backupTimer);
        }
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }

        // Final persistence
        this.persist();
    }
}

/**
 * Session Manager
 * Main class for managing agent sessions
 */
export class SessionManager extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            maxSessions: config.maxSessions || 10,
            sessionTimeout: config.sessionTimeout || 3600000, // 1 hour
            cleanupInterval: config.cleanupInterval || 60000, // 1 minute
            persistenceEnabled: config.persistenceEnabled !== false,
            storageType: config.storageType || 'memory',
            ...config
        };

        this.store = new SessionStore({
            storageType: this.config.storageType,
            persistenceInterval: this.config.persistenceInterval,
            backupInterval: this.config.backupInterval,
            storageFile: this.config.storageFile,
            backupFile: this.config.backupFile
        });

        this.claudeInterface = null; // Will be injected
        this.stats = {
            created: 0,
            destroyed: 0,
            expired: 0,
            errors: 0
        };

        this.setupEventHandlers();
    }

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        // Periodic cleanup
        this.cleanupTimer = setInterval(() => {
            this.performCleanup();
        }, this.config.cleanupInterval);
    }

    /**
     * Set Claude interface reference
     */
    setClaudeInterface(claudeInterface) {
        this.claudeInterface = claudeInterface;
    }

    /**
     * Create new session
     */
    async createSession(options = {}) {
        // Check session limit
        const activeSessions = this.getActiveSessions();
        if (activeSessions.length >= this.config.maxSessions) {
            throw new Error(`Maximum number of sessions (${this.config.maxSessions}) reached`);
        }

        // Create session
        const session = new Session({
            ...options,
            timeout: this.config.sessionTimeout
        });

        try {
            // Start Claude Code process if interface is available
            if (this.claudeInterface) {
                const processResult = await this.claudeInterface.startProcess(session.id, {
                    workingDirectory: session.config.workingDirectory,
                    env: session.config.environment,
                    model: session.config.model,
                    temperature: session.config.temperature
                });

                session.updateState({
                    processId: processResult.pid
                });
            }

            session.status = 'active';
            this.store.set(session.id, session);
            this.stats.created++;

            this.emit('sessionCreated', {
                sessionId: session.id,
                clientId: session.clientId,
                timestamp: new Date().toISOString()
            });

            this.emit('sessionUpdate', {
                type: 'session_created',
                sessionId: session.id,
                session: session.getSummary(),
                timestamp: new Date().toISOString()
            });

            console.log(`Created session ${session.id} for client ${session.clientId}`);
            return session;

        } catch (error) {
            console.error('Error creating session:', error);
            session.addError(error);
            session.status = 'failed';
            this.stats.errors++;
            throw error;
        }
    }

    /**
     * Get session by ID
     */
    async getSession(sessionId) {
        const session = this.store.get(sessionId);
        
        if (!session) {
            return null;
        }

        if (session.isExpired()) {
            await this.destroySession(sessionId);
            return null;
        }

        return session;
    }

    /**
     * Attach client to session
     */
    async attachClient(sessionId, clientId) {
        const session = await this.getSession(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }

        session.addClient(clientId);

        this.emit('clientAttached', {
            sessionId,
            clientId,
            timestamp: new Date().toISOString()
        });

        this.emit('sessionUpdate', {
            type: 'client_attached',
            sessionId,
            clientId,
            session: session.getSummary(),
            timestamp: new Date().toISOString()
        });

        console.log(`Client ${clientId} attached to session ${sessionId}`);
        return session;
    }

    /**
     * Detach client from session
     */
    async detachClient(sessionId, clientId) {
        const session = await this.getSession(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }

        session.removeClient(clientId);

        this.emit('clientDetached', {
            sessionId,
            clientId,
            timestamp: new Date().toISOString()
        });

        this.emit('sessionUpdate', {
            type: 'client_detached',
            sessionId,
            clientId,
            session: session.getSummary(),
            timestamp: new Date().toISOString()
        });

        // Destroy session if no clients remain
        if (session.clients.size === 0) {
            console.log(`No clients remaining for session ${sessionId}, destroying session`);
            await this.destroySession(sessionId);
        }

        console.log(`Client ${clientId} detached from session ${sessionId}`);
        return session;
    }

    /**
     * Destroy session
     */
    async destroySession(sessionId) {
        const session = this.store.get(sessionId);
        if (!session) {
            return false;
        }

        try {
            // Stop Claude Code process if running
            if (this.claudeInterface && session.state.processId) {
                await this.claudeInterface.stopProcess(sessionId);
            }

            // Remove from store
            this.store.delete(sessionId);
            this.stats.destroyed++;

            this.emit('sessionDestroyed', {
                sessionId,
                timestamp: new Date().toISOString()
            });

            this.emit('sessionUpdate', {
                type: 'session_destroyed',
                sessionId,
                timestamp: new Date().toISOString()
            });

            console.log(`Destroyed session ${sessionId}`);
            return true;

        } catch (error) {
            console.error(`Error destroying session ${sessionId}:`, error);
            this.stats.errors++;
            throw error;
        }
    }

    /**
     * Update session state
     */
    async updateSession(sessionId, updates) {
        const session = await this.getSession(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }

        // Update session properties
        if (updates.status) session.status = updates.status;
        if (updates.config) session.config = { ...session.config, ...updates.config };
        if (updates.state) session.updateState(updates.state);
        if (updates.permissions) session.permissions = new Set(updates.permissions);

        // Extend expiration if requested
        if (updates.extend) {
            session.extend(updates.extend);
        }

        this.emit('sessionUpdate', {
            type: 'session_updated',
            sessionId,
            updates,
            session: session.getSummary(),
            timestamp: new Date().toISOString()
        });

        return session;
    }

    /**
     * Get all active sessions
     */
    getActiveSessions() {
        return this.store.getActive();
    }

    /**
     * Get session by client ID
     */
    getSessionByClient(clientId) {
        const sessions = this.store.getAll();
        return sessions.find(session => session.hasClient(clientId));
    }

    /**
     * Authenticate session access
     */
    authenticateSession(sessionId, token) {
        const session = this.store.get(sessionId);
        if (!session) {
            return false;
        }

        return session.securityToken === token;
    }

    /**
     * Check session permissions
     */
    checkPermission(sessionId, clientId, permission) {
        const session = this.store.get(sessionId);
        if (!session) {
            return false;
        }

        return session.hasClient(clientId) && session.permissions.has(permission);
    }

    /**
     * Perform periodic cleanup
     */
    performCleanup() {
        try {
            // Cleanup expired sessions
            const expiredSessions = this.store.cleanupExpiredSessions();
            this.stats.expired += expiredSessions.length;

            // Cleanup orphaned processes
            if (this.claudeInterface) {
                this.cleanupOrphanedProcesses();
            }

        } catch (error) {
            console.error('Error during cleanup:', error);
            this.stats.errors++;
        }
    }

    /**
     * Cleanup orphaned Claude Code processes
     */
    cleanupOrphanedProcesses() {
        const activeProcesses = this.claudeInterface.getActiveProcesses();
        const activeSessions = this.getActiveSessions();
        const activeSessionIds = new Set(activeSessions.map(s => s.id));

        for (const process of activeProcesses) {
            if (!activeSessionIds.has(process.sessionId)) {
                console.log(`Cleaning up orphaned process for session ${process.sessionId}`);
                this.claudeInterface.stopProcess(process.sessionId, true);
            }
        }
    }

    /**
     * Get session statistics
     */
    getSessionStats(sessionId) {
        const session = this.store.get(sessionId);
        if (!session) {
            return null;
        }

        return {
            ...session.getSummary(),
            uptime: Date.now() - new Date(session.createdAt).getTime(),
            timeToExpiry: new Date(session.expiresAt).getTime() - Date.now()
        };
    }

    /**
     * Get overall statistics
     */
    getStats() {
        const activeSessions = this.getActiveSessions();
        
        return {
            ...this.stats,
            activeSessions: activeSessions.length,
            totalSessions: this.store.sessions.size,
            maxSessions: this.config.maxSessions,
            memoryUsage: process.memoryUsage(),
            uptime: process.uptime()
        };
    }

    /**
     * Export session data
     */
    exportSessions() {
        const sessions = this.store.getAll();
        return {
            timestamp: new Date().toISOString(),
            count: sessions.length,
            sessions: sessions.map(session => session.getFullData())
        };
    }

    /**
     * Import session data
     */
    async importSessions(data) {
        let imported = 0;
        
        for (const sessionData of data.sessions) {
            try {
                const session = new Session(sessionData);
                Object.assign(session, sessionData);
                
                // Only import non-expired sessions
                if (!session.isExpired()) {
                    this.store.set(session.id, session);
                    imported++;
                }
            } catch (error) {
                console.error('Error importing session:', error);
            }
        }

        console.log(`Imported ${imported} sessions`);
        return imported;
    }

    /**
     * Cleanup and shutdown
     */
    async cleanup() {
        console.log('Cleaning up Session Manager...');
        
        // Stop cleanup timer
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }

        // Destroy all active sessions
        const activeSessions = this.getActiveSessions();
        const destroyPromises = activeSessions.map(session => 
            this.destroySession(session.id).catch(error => 
                console.error(`Error destroying session ${session.id}:`, error)
            )
        );

        await Promise.allSettled(destroyPromises);

        // Cleanup store
        this.store.cleanup();

        console.log('Session Manager cleanup complete');
    }
}

