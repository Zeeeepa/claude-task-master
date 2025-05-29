/**
 * @fileoverview AgentAPI HTTP Client
 * @description Enhanced HTTP client for AgentAPI communication with Claude Code
 */

import EventSource from 'eventsource';
import { EventEmitter } from 'events';

/**
 * AgentAPI HTTP Client for Claude Code communication
 */
export class AgentAPIClient extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            baseURL: config.baseURL || 'http://localhost:3284',
            timeout: config.timeout || 30000,
            retryAttempts: config.retryAttempts || 3,
            retryDelay: config.retryDelay || 1000,
            apiKey: config.apiKey || null,
            enableSSE: config.enableSSE !== false,
            ...config
        };

        this.isConnected = false;
        this.eventSource = null;
        this.requestQueue = [];
        this.activeRequests = new Map();
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 5;
    }

    /**
     * Connect to AgentAPI service
     */
    async connect() {
        try {
            // Test connection with health check
            const health = await this._makeRequest('GET', '/health');
            this.isConnected = true;
            this.connectionAttempts = 0;

            // Set up Server-Sent Events if enabled
            if (this.config.enableSSE) {
                await this._setupSSE();
            }

            this.emit('connected', { health });
            return health;
        } catch (error) {
            this.isConnected = false;
            this.connectionAttempts++;
            
            if (this.connectionAttempts < this.maxConnectionAttempts) {
                const delay = Math.pow(2, this.connectionAttempts) * 1000;
                setTimeout(() => this.connect(), delay);
            }
            
            this.emit('connection_failed', { error, attempts: this.connectionAttempts });
            throw error;
        }
    }

    /**
     * Disconnect from AgentAPI service
     */
    disconnect() {
        this.isConnected = false;
        
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }

        // Cancel active requests
        for (const [requestId, request] of this.activeRequests) {
            if (request.controller) {
                request.controller.abort();
            }
        }
        this.activeRequests.clear();

        this.emit('disconnected');
    }

    /**
     * Send message to Claude Code via AgentAPI
     */
    async sendMessage(content, role = 'user', options = {}) {
        const payload = {
            content,
            role,
            timestamp: new Date().toISOString(),
            ...options
        };

        return await this._makeRequest('POST', '/messages', payload);
    }

    /**
     * Execute task via Claude Code
     */
    async executeTask(task, executionId = null) {
        const payload = {
            task,
            executionId: executionId || this._generateExecutionId(),
            timestamp: new Date().toISOString()
        };

        return await this._makeRequest('POST', '/tasks/execute', payload);
    }

    /**
     * Get task execution status
     */
    async getTaskStatus(executionId) {
        return await this._makeRequest('GET', `/tasks/${executionId}/status`);
    }

    /**
     * Get task execution results
     */
    async getTaskResults(executionId) {
        return await this._makeRequest('GET', `/tasks/${executionId}/results`);
    }

    /**
     * Cancel task execution
     */
    async cancelTask(executionId) {
        return await this._makeRequest('POST', `/tasks/${executionId}/cancel`);
    }

    /**
     * Get agent health status
     */
    async getHealth() {
        return await this._makeRequest('GET', '/health');
    }

    /**
     * Get agent capabilities
     */
    async getCapabilities() {
        return await this._makeRequest('GET', '/capabilities');
    }

    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            connected: this.isConnected,
            connectionAttempts: this.connectionAttempts,
            activeRequests: this.activeRequests.size,
            queuedRequests: this.requestQueue.length,
            sseConnected: this.eventSource?.readyState === EventSource.OPEN
        };
    }

    /**
     * Private methods
     */
    async _makeRequest(method, path, data = null, attempt = 1) {
        const requestId = this._generateRequestId();
        const url = `${this.config.baseURL}${path}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const requestOptions = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'claude-task-master-agentapi-client/1.0.0',
                ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
            },
            signal: controller.signal
        };

        if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            requestOptions.body = JSON.stringify(data);
        }

        // Track active request
        this.activeRequests.set(requestId, {
            controller,
            startTime: Date.now(),
            method,
            path,
            attempt
        });

        try {
            const response = await fetch(url, requestOptions);
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            
            this.activeRequests.delete(requestId);
            this.emit('request_completed', {
                requestId,
                method,
                path,
                duration: Date.now() - this.activeRequests.get(requestId)?.startTime,
                success: true
            });

            return result;
        } catch (error) {
            clearTimeout(timeoutId);
            this.activeRequests.delete(requestId);

            // Retry logic
            if (attempt < this.config.retryAttempts && this._shouldRetry(error)) {
                const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this._makeRequest(method, path, data, attempt + 1);
            }

            this.emit('request_failed', {
                requestId,
                method,
                path,
                error: error.message,
                attempt
            });

            throw error;
        }
    }

    async _setupSSE() {
        if (this.eventSource) {
            this.eventSource.close();
        }

        const sseUrl = `${this.config.baseURL}/events`;
        const headers = {};
        
        if (this.config.apiKey) {
            headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }

        this.eventSource = new EventSource(sseUrl, { headers });

        this.eventSource.onopen = () => {
            this.emit('sse_connected');
        };

        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.emit('sse_message', data);
                
                // Emit specific event types
                if (data.type) {
                    this.emit(`sse_${data.type}`, data);
                }
            } catch (error) {
                this.emit('sse_error', { error: 'Failed to parse SSE message', data: event.data });
            }
        };

        this.eventSource.onerror = (error) => {
            this.emit('sse_error', { error });
            
            // Attempt to reconnect after delay
            setTimeout(() => {
                if (this.isConnected) {
                    this._setupSSE();
                }
            }, 5000);
        };
    }

    _shouldRetry(error) {
        // Retry on network errors, timeouts, and 5xx server errors
        return (
            error.name === 'AbortError' ||
            error.message.includes('fetch') ||
            error.message.includes('5')
        );
    }

    _generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    _generateExecutionId() {
        return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

export default AgentAPIClient;

