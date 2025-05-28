/**
 * @fileoverview AgentAPI Client
 * @description HTTP client for communicating with AgentAPI server to control Claude Code
 */

import axios from 'axios';
import { EventEmitter } from 'events';
import { log } from '../../scripts/modules/utils.js';
import { DEFAULT_AGENTAPI_CONFIG, validateAgentAPIConfig, mergeAgentAPIConfig } from '../config/agentapi_config.js';

/**
 * AgentAPI Client for Claude Code communication
 */
export class AgentAPIClient extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = mergeAgentAPIConfig(config);
        
        // Validate configuration
        const validation = validateAgentAPIConfig(this.config);
        if (!validation.isValid) {
            throw new Error(`Invalid AgentAPI configuration: ${validation.errors.join(', ')}`);
        }
        
        // Initialize HTTP client
        this.httpClient = axios.create({
            baseURL: this.config.baseURL,
            timeout: this.config.timeout,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'claude-task-master/1.0.0'
            }
        });
        
        // Add request/response interceptors for logging and error handling
        this.setupInterceptors();
        
        // Circuit breaker state
        this.circuitBreaker = {
            failures: 0,
            lastFailureTime: null,
            state: 'closed' // closed, open, half-open
        };
        
        // Active sessions tracking
        this.activeSessions = new Map();
        
        // Health check state
        this.isHealthy = false;
        this.lastHealthCheck = null;
        
        // Start health monitoring
        this.startHealthMonitoring();
        
        log('debug', 'AgentAPI client initialized', { baseURL: this.config.baseURL });
    }
    
    /**
     * Setup HTTP client interceptors
     */
    setupInterceptors() {
        // Request interceptor
        this.httpClient.interceptors.request.use(
            (config) => {
                if (this.config.logging.enableRequestLogging) {
                    log('debug', 'AgentAPI request', {
                        method: config.method,
                        url: config.url,
                        data: config.data
                    });
                }
                return config;
            },
            (error) => {
                log('error', 'AgentAPI request error', { error: error.message });
                return Promise.reject(error);
            }
        );
        
        // Response interceptor
        this.httpClient.interceptors.response.use(
            (response) => {
                if (this.config.logging.enableResponseLogging) {
                    log('debug', 'AgentAPI response', {
                        status: response.status,
                        data: response.data
                    });
                }
                
                // Reset circuit breaker on successful response
                this.resetCircuitBreaker();
                
                return response;
            },
            (error) => {
                log('error', 'AgentAPI response error', {
                    status: error.response?.status,
                    message: error.message,
                    data: error.response?.data
                });
                
                // Update circuit breaker on error
                this.recordFailure();
                
                return Promise.reject(error);
            }
        );
    }
    
    /**
     * Check if circuit breaker allows requests
     */
    isCircuitBreakerOpen() {
        if (this.circuitBreaker.state === 'closed') {
            return false;
        }
        
        if (this.circuitBreaker.state === 'open') {
            const timeSinceLastFailure = Date.now() - this.circuitBreaker.lastFailureTime;
            if (timeSinceLastFailure > this.config.errorHandling.circuitBreakerTimeout) {
                this.circuitBreaker.state = 'half-open';
                log('info', 'Circuit breaker moved to half-open state');
                return false;
            }
            return true;
        }
        
        return false; // half-open state allows requests
    }
    
    /**
     * Record a failure for circuit breaker
     */
    recordFailure() {
        this.circuitBreaker.failures++;
        this.circuitBreaker.lastFailureTime = Date.now();
        
        if (this.circuitBreaker.failures >= this.config.errorHandling.circuitBreakerThreshold) {
            this.circuitBreaker.state = 'open';
            log('warn', 'Circuit breaker opened due to failures', {
                failures: this.circuitBreaker.failures
            });
            this.emit('circuitBreakerOpen');
        }
    }
    
    /**
     * Reset circuit breaker on successful request
     */
    resetCircuitBreaker() {
        if (this.circuitBreaker.state !== 'closed') {
            this.circuitBreaker.state = 'closed';
            this.circuitBreaker.failures = 0;
            this.circuitBreaker.lastFailureTime = null;
            log('info', 'Circuit breaker reset to closed state');
            this.emit('circuitBreakerClosed');
        }
    }
    
    /**
     * Make HTTP request with retry logic
     */
    async makeRequest(method, endpoint, data = null, options = {}) {
        if (this.isCircuitBreakerOpen()) {
            throw new Error('Circuit breaker is open - AgentAPI is currently unavailable');
        }
        
        const maxRetries = options.retries || this.config.retries;
        let lastError;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const response = await this.httpClient.request({
                    method,
                    url: endpoint,
                    data,
                    ...options
                });
                
                return response.data;
            } catch (error) {
                lastError = error;
                
                if (attempt < maxRetries) {
                    const delay = this.config.retryDelay * Math.pow(this.config.errorHandling.retryBackoffMultiplier, attempt);
                    log('warn', `AgentAPI request failed, retrying in ${delay}ms`, {
                        attempt: attempt + 1,
                        maxRetries,
                        error: error.message
                    });
                    
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    log('error', 'AgentAPI request failed after all retries', {
                        attempts: attempt + 1,
                        error: error.message
                    });
                }
            }
        }
        
        throw lastError;
    }
    
    /**
     * Start a new Claude Code session
     */
    async startClaudeCodeSession(options = {}) {
        log('debug', 'Starting Claude Code session', options);
        
        const sessionConfig = {
            agent: 'claude',
            args: options.args || this.config.claudeCodeArgs,
            workingDirectory: options.workingDirectory || this.config.wsl2.workingDirectory,
            environment: {
                ...this.config.wsl2.environmentVariables,
                ...options.environment
            }
        };
        
        try {
            const response = await this.makeRequest('POST', '/session/start', sessionConfig);
            const sessionId = response.sessionId;
            
            if (!sessionId) {
                throw new Error('No session ID returned from AgentAPI');
            }
            
            // Track active session
            this.activeSessions.set(sessionId, {
                id: sessionId,
                startTime: new Date(),
                lastActivity: new Date(),
                config: sessionConfig,
                status: 'active'
            });
            
            log('info', 'Claude Code session started', { sessionId });
            this.emit('sessionStarted', { sessionId, config: sessionConfig });
            
            return sessionId;
        } catch (error) {
            log('error', 'Failed to start Claude Code session', { error: error.message });
            throw new Error(`Failed to start Claude Code session: ${error.message}`);
        }
    }
    
    /**
     * Send message to Claude Code session
     */
    async sendMessage(sessionId, message, options = {}) {
        if (!this.activeSessions.has(sessionId)) {
            throw new Error(`Session ${sessionId} not found or inactive`);
        }
        
        log('debug', 'Sending message to Claude Code', { sessionId, messageLength: message.length });
        
        const messageData = {
            content: message,
            type: options.type || 'user'
        };
        
        try {
            const response = await this.makeRequest('POST', `/session/${sessionId}/message`, messageData);
            
            // Update session activity
            const session = this.activeSessions.get(sessionId);
            session.lastActivity = new Date();
            
            log('debug', 'Message sent successfully', { sessionId });
            this.emit('messageSent', { sessionId, message: messageData, response });
            
            return response;
        } catch (error) {
            log('error', 'Failed to send message to Claude Code', {
                sessionId,
                error: error.message
            });
            throw new Error(`Failed to send message: ${error.message}`);
        }
    }
    
    /**
     * Get messages from Claude Code session
     */
    async getMessages(sessionId, options = {}) {
        if (!this.activeSessions.has(sessionId)) {
            throw new Error(`Session ${sessionId} not found or inactive`);
        }
        
        try {
            const response = await this.makeRequest('GET', `/session/${sessionId}/messages`, null, options);
            
            log('debug', 'Retrieved messages from Claude Code', {
                sessionId,
                messageCount: response.length || 0
            });
            
            return response;
        } catch (error) {
            log('error', 'Failed to get messages from Claude Code', {
                sessionId,
                error: error.message
            });
            throw new Error(`Failed to get messages: ${error.message}`);
        }
    }
    
    /**
     * Get session status
     */
    async getSessionStatus(sessionId) {
        if (!this.activeSessions.has(sessionId)) {
            throw new Error(`Session ${sessionId} not found or inactive`);
        }
        
        try {
            const response = await this.makeRequest('GET', `/session/${sessionId}/status`);
            
            // Update local session status
            const session = this.activeSessions.get(sessionId);
            session.status = response.status;
            session.lastActivity = new Date();
            
            return response;
        } catch (error) {
            log('error', 'Failed to get session status', {
                sessionId,
                error: error.message
            });
            throw new Error(`Failed to get session status: ${error.message}`);
        }
    }
    
    /**
     * Stop a Claude Code session
     */
    async stopSession(sessionId) {
        if (!this.activeSessions.has(sessionId)) {
            log('warn', 'Attempted to stop non-existent session', { sessionId });
            return;
        }
        
        try {
            await this.makeRequest('POST', `/session/${sessionId}/stop`);
            
            // Remove from active sessions
            this.activeSessions.delete(sessionId);
            
            log('info', 'Claude Code session stopped', { sessionId });
            this.emit('sessionStopped', { sessionId });
        } catch (error) {
            log('error', 'Failed to stop Claude Code session', {
                sessionId,
                error: error.message
            });
            
            // Remove from tracking even if stop failed
            this.activeSessions.delete(sessionId);
            throw new Error(`Failed to stop session: ${error.message}`);
        }
    }
    
    /**
     * Check AgentAPI server health
     */
    async checkHealth() {
        try {
            const response = await this.makeRequest('GET', '/health', null, {
                timeout: this.config.healthCheckTimeout
            });
            
            this.isHealthy = true;
            this.lastHealthCheck = new Date();
            
            log('debug', 'AgentAPI health check passed', response);
            this.emit('healthCheckPassed', response);
            
            return response;
        } catch (error) {
            this.isHealthy = false;
            this.lastHealthCheck = new Date();
            
            log('warn', 'AgentAPI health check failed', { error: error.message });
            this.emit('healthCheckFailed', { error: error.message });
            
            throw error;
        }
    }
    
    /**
     * Start health monitoring
     */
    startHealthMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        
        this.healthCheckInterval = setInterval(async () => {
            try {
                await this.checkHealth();
            } catch (error) {
                // Health check failure is already logged in checkHealth
            }
        }, this.config.healthCheckInterval);
        
        // Perform initial health check
        setTimeout(() => this.checkHealth().catch(() => {}), 1000);
    }
    
    /**
     * Stop health monitoring
     */
    stopHealthMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }
    
    /**
     * Clean up expired sessions
     */
    cleanupExpiredSessions() {
        const now = Date.now();
        const expiredSessions = [];
        
        for (const [sessionId, session] of this.activeSessions.entries()) {
            const timeSinceActivity = now - session.lastActivity.getTime();
            if (timeSinceActivity > this.config.sessionTimeout) {
                expiredSessions.push(sessionId);
            }
        }
        
        if (expiredSessions.length > 0) {
            log('info', 'Cleaning up expired sessions', {
                expiredCount: expiredSessions.length,
                sessionIds: expiredSessions
            });
            
            expiredSessions.forEach(sessionId => {
                this.stopSession(sessionId).catch(error => {
                    log('warn', 'Failed to stop expired session', {
                        sessionId,
                        error: error.message
                    });
                });
            });
        }
    }
    
    /**
     * Get client status and metrics
     */
    getStatus() {
        return {
            isHealthy: this.isHealthy,
            lastHealthCheck: this.lastHealthCheck,
            activeSessions: this.activeSessions.size,
            circuitBreaker: {
                state: this.circuitBreaker.state,
                failures: this.circuitBreaker.failures,
                lastFailureTime: this.circuitBreaker.lastFailureTime
            },
            config: {
                baseURL: this.config.baseURL,
                timeout: this.config.timeout,
                retries: this.config.retries
            }
        };
    }
    
    /**
     * Shutdown the client and cleanup resources
     */
    async shutdown() {
        log('info', 'Shutting down AgentAPI client');
        
        // Stop health monitoring
        this.stopHealthMonitoring();
        
        // Stop all active sessions
        const sessionIds = Array.from(this.activeSessions.keys());
        await Promise.allSettled(
            sessionIds.map(sessionId => this.stopSession(sessionId))
        );
        
        // Remove all listeners
        this.removeAllListeners();
        
        log('info', 'AgentAPI client shutdown complete');
    }
}

/**
 * Create and configure AgentAPI client
 */
export function createAgentAPIClient(config = {}) {
    return new AgentAPIClient(config);
}

