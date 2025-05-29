/**
 * AgentAPI Middleware
 * Main entry point for the AgentAPI middleware layer
 * Part of Task Master Architecture Restructuring
 */

import { AgentAPIServer } from './server.js';
import { ClaudeInterface } from './claude-interface.js';
import { MessageHandler } from './message-handler.js';
import { SessionManager } from './session-manager.js';

/**
 * AgentAPI Middleware Class
 * Orchestrates all AgentAPI components
 */
export class AgentAPIMiddleware {
    constructor(config = {}) {
        this.config = {
            // Server configuration
            port: config.port || process.env.AGENTAPI_PORT || 3284,
            host: config.host || process.env.AGENTAPI_HOST || 'localhost',
            ssl: config.ssl || false,
            
            // Session configuration
            maxSessions: config.maxSessions || 10,
            sessionTimeout: config.sessionTimeout || 3600000, // 1 hour
            
            // Claude Code configuration
            claudeCodePath: config.claudeCodePath || process.env.CLAUDE_CODE_PATH || '/usr/local/bin/claude',
            allowedTools: config.allowedTools || ['Bash(git*)', 'Edit', 'Replace'],
            
            // Message handling configuration
            maxQueueSize: config.maxQueueSize || 1000,
            retryAttempts: config.retryAttempts || 3,
            retryDelay: config.retryDelay || 1000,
            messageTimeout: config.messageTimeout || 30000,
            
            // Storage configuration
            persistenceEnabled: config.persistenceEnabled !== false,
            storageType: config.storageType || 'memory',
            storageFile: config.storageFile || './agentapi-sessions.json',
            backupFile: config.backupFile || './agentapi-sessions.backup.json',
            
            ...config
        };

        this.server = null;
        this.claudeInterface = null;
        this.messageHandler = null;
        this.sessionManager = null;
        
        this.isRunning = false;
        this.startedAt = null;
    }

    /**
     * Initialize all components
     */
    async initialize() {
        console.log('Initializing AgentAPI Middleware...');
        
        try {
            // Initialize Claude interface
            this.claudeInterface = new ClaudeInterface(this.config);
            
            // Initialize session manager
            this.sessionManager = new SessionManager(this.config);
            this.sessionManager.setClaudeInterface(this.claudeInterface);
            
            // Initialize message handler
            this.messageHandler = new MessageHandler(this.config);
            
            // Initialize server
            this.server = new AgentAPIServer(this.config);
            
            // Wire up components
            this.wireComponents();
            
            // Perform health checks
            await this.performHealthChecks();
            
            console.log('AgentAPI Middleware initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize AgentAPI Middleware:', error);
            throw error;
        }
    }

    /**
     * Wire up component interactions
     */
    wireComponents() {
        // Inject dependencies into message handler
        this.messageHandler.getClaudeInterface = () => this.claudeInterface;
        
        // Forward events between components
        this.claudeInterface.on('output', (event) => {
            this.messageHandler.handleTerminalOutput(event.sessionId, event);
        });
        
        this.claudeInterface.on('processExit', (event) => {
            this.sessionManager.updateSession(event.sessionId, {
                status: 'process_exited',
                state: { processExited: true, exitCode: event.exitCode }
            }).catch(error => {
                console.error('Error updating session after process exit:', error);
            });
        });
        
        this.claudeInterface.on('processError', (event) => {
            this.sessionManager.updateSession(event.sessionId, {
                status: 'process_error',
                state: { processError: event.error }
            }).catch(error => {
                console.error('Error updating session after process error:', error);
            });
        });
        
        // Forward session events to server
        this.sessionManager.on('sessionUpdate', (event) => {
            this.server.emit('sessionUpdate', event);
        });
        
        this.messageHandler.on('message', (event) => {
            this.server.emit('message', event);
        });
    }

    /**
     * Perform health checks on all components
     */
    async performHealthChecks() {
        console.log('Performing health checks...');
        
        // Check Claude Code availability
        try {
            const claudeHealth = await this.claudeInterface.healthCheck();
            if (!claudeHealth.available) {
                console.warn('Claude Code health check failed:', claudeHealth.error);
                console.warn('AgentAPI will start but Claude Code functionality may be limited');
            } else {
                console.log(`Claude Code available: ${claudeHealth.version}`);
            }
        } catch (error) {
            console.warn('Claude Code health check error:', error.message);
            console.warn('AgentAPI will start but Claude Code functionality may be limited');
        }
        
        // Check port availability
        await this.checkPortAvailability();
        
        console.log('Health checks completed');
    }

    /**
     * Check if the configured port is available
     */
    async checkPortAvailability() {
        return new Promise((resolve, reject) => {
            const net = require('net');
            const server = net.createServer();
            
            server.listen(this.config.port, this.config.host, () => {
                server.once('close', () => resolve());
                server.close();
            });
            
            server.on('error', (error) => {
                if (error.code === 'EADDRINUSE') {
                    reject(new Error(`Port ${this.config.port} is already in use`));
                } else {
                    reject(error);
                }
            });
        });
    }

    /**
     * Start the AgentAPI middleware
     */
    async start() {
        if (this.isRunning) {
            throw new Error('AgentAPI Middleware is already running');
        }

        console.log('Starting AgentAPI Middleware...');
        
        try {
            // Initialize if not already done
            if (!this.server) {
                await this.initialize();
            }
            
            // Start the server
            await this.server.start();
            
            this.isRunning = true;
            this.startedAt = new Date().toISOString();
            
            console.log('AgentAPI Middleware started successfully');
            console.log(`Server running on ${this.config.host}:${this.config.port}`);
            console.log(`Max sessions: ${this.config.maxSessions}`);
            console.log(`Claude Code path: ${this.config.claudeCodePath}`);
            console.log(`Allowed tools: ${this.config.allowedTools.join(', ')}`);
            
            return {
                status: 'started',
                host: this.config.host,
                port: this.config.port,
                timestamp: this.startedAt
            };
            
        } catch (error) {
            console.error('Failed to start AgentAPI Middleware:', error);
            this.isRunning = false;
            throw error;
        }
    }

    /**
     * Stop the AgentAPI middleware
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }

        console.log('Stopping AgentAPI Middleware...');
        
        try {
            // Stop server
            if (this.server) {
                await this.server.shutdown();
            }
            
            // Cleanup components
            if (this.sessionManager) {
                await this.sessionManager.cleanup();
            }
            
            if (this.claudeInterface) {
                await this.claudeInterface.cleanup();
            }
            
            this.isRunning = false;
            
            console.log('AgentAPI Middleware stopped successfully');
            
        } catch (error) {
            console.error('Error stopping AgentAPI Middleware:', error);
            throw error;
        }
    }

    /**
     * Restart the AgentAPI middleware
     */
    async restart() {
        console.log('Restarting AgentAPI Middleware...');
        
        await this.stop();
        await this.start();
        
        console.log('AgentAPI Middleware restarted successfully');
    }

    /**
     * Get middleware status
     */
    getStatus() {
        return {
            running: this.isRunning,
            startedAt: this.startedAt,
            uptime: this.startedAt ? Date.now() - new Date(this.startedAt).getTime() : 0,
            config: {
                host: this.config.host,
                port: this.config.port,
                maxSessions: this.config.maxSessions,
                claudeCodePath: this.config.claudeCodePath,
                allowedTools: this.config.allowedTools
            },
            components: {
                server: this.server ? this.server.getStats() : null,
                sessions: this.sessionManager ? this.sessionManager.getStats() : null,
                messages: this.messageHandler ? this.messageHandler.getStats() : null,
                claude: this.claudeInterface ? this.claudeInterface.getActiveProcesses().length : 0
            }
        };
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        
        // Update component configurations
        if (this.server) {
            this.server.config = { ...this.server.config, ...newConfig };
        }
        
        if (this.sessionManager) {
            this.sessionManager.config = { ...this.sessionManager.config, ...newConfig };
        }
        
        if (this.messageHandler) {
            this.messageHandler.config = { ...this.messageHandler.config, ...newConfig };
        }
        
        if (this.claudeInterface) {
            this.claudeInterface.config = { ...this.claudeInterface.config, ...newConfig };
        }
        
        console.log('Configuration updated');
    }

    /**
     * Get comprehensive statistics
     */
    getStats() {
        return {
            middleware: this.getStatus(),
            server: this.server ? this.server.getStats() : null,
            sessions: this.sessionManager ? this.sessionManager.getStats() : null,
            messages: this.messageHandler ? this.messageHandler.getStats() : null,
            claude: this.claudeInterface ? {
                activeProcesses: this.claudeInterface.getActiveProcesses().length,
                processes: this.claudeInterface.getActiveProcesses()
            } : null,
            system: {
                memory: process.memoryUsage(),
                uptime: process.uptime(),
                platform: process.platform,
                nodeVersion: process.version
            }
        };
    }
}

// Export individual components for direct use
export {
    AgentAPIServer,
    ClaudeInterface,
    MessageHandler,
    SessionManager
};

// Default export
export default AgentAPIMiddleware;

