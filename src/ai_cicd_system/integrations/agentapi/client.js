/**
 * AgentAPI HTTP Client
 * 
 * Enhanced HTTP client for agentapi communication with proper authentication,
 * error handling, and support for asynchronous operations.
 */

import axios from 'axios';
import { EventEmitter } from 'events';
import { SimpleLogger } from '../../utils/simple_logger.js';

export class AgentAPIClient extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            baseURL: options.baseURL || process.env.AGENTAPI_URL || 'http://localhost:3284',
            timeout: options.timeout || 30000,
            retryAttempts: options.retryAttempts || 3,
            retryDelay: options.retryDelay || 1000,
            apiKey: options.apiKey || process.env.AGENTAPI_KEY,
            enableSSE: options.enableSSE !== false,
            ...options
        };

        this.logger = new SimpleLogger('AgentAPIClient', options.logLevel || 'info');
        this.httpClient = null;
        this.eventSource = null;
        this.isConnected = false;
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 5;

        this._setupHttpClient();
    }

    /**
     * Setup HTTP client with interceptors
     */
    _setupHttpClient() {
        this.httpClient = axios.create({
            baseURL: this.config.baseURL,
            timeout: this.config.timeout,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'claude-task-master/1.0.0',
                ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
            }
        });

        // Request interceptor
        this.httpClient.interceptors.request.use(
            (config) => {
                const requestId = Math.random().toString(36).substring(7);
                config.metadata = { requestId, startTime: Date.now() };
                
                this.logger.debug(`[${requestId}] HTTP Request: ${config.method?.toUpperCase()} ${config.url}`, {
                    method: config.method,
                    url: config.url,
                    headers: config.headers
                });

                return config;
            },
            (error) => {
                this.logger.error('Request interceptor error:', error);
                return Promise.reject(error);
            }
        );

        // Response interceptor
        this.httpClient.interceptors.response.use(
            (response) => {
                const { requestId, startTime } = response.config.metadata || {};
                const duration = Date.now() - startTime;

                this.logger.debug(`[${requestId}] HTTP Response: ${response.status} - ${duration}ms`, {
                    status: response.status,
                    duration,
                    dataSize: JSON.stringify(response.data).length
                });

                return response;
            },
            async (error) => {
                const { requestId } = error.config?.metadata || {};
                
                this.logger.error(`[${requestId}] HTTP Error: ${error.message}`, {
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    data: error.response?.data
                });

                // Retry logic for specific errors
                if (this._shouldRetry(error)) {
                    return this._retryRequest(error);
                }

                return Promise.reject(error);
            }
        );
    }

    /**
     * Check if request should be retried
     */
    _shouldRetry(error) {
        const retryableStatuses = [408, 429, 500, 502, 503, 504];
        const status = error.response?.status;
        const retryCount = error.config?._retryCount || 0;

        return (
            retryCount < this.config.retryAttempts &&
            (retryableStatuses.includes(status) || error.code === 'ECONNRESET')
        );
    }

    /**
     * Retry failed request
     */
    async _retryRequest(error) {
        const retryCount = (error.config._retryCount || 0) + 1;
        const delay = this.config.retryDelay * Math.pow(2, retryCount - 1); // Exponential backoff

        this.logger.warn(`Retrying request (attempt ${retryCount}/${this.config.retryAttempts}) after ${delay}ms`);

        await new Promise(resolve => setTimeout(resolve, delay));

        error.config._retryCount = retryCount;
        return this.httpClient.request(error.config);
    }

    /**
     * Initialize connection to AgentAPI
     */
    async connect() {
        try {
            this.logger.info('Connecting to AgentAPI...');

            // Test connection with health check
            const health = await this.getHealth();
            if (!health.success) {
                throw new Error('AgentAPI health check failed');
            }

            this.isConnected = true;
            this.connectionAttempts = 0;

            // Setup SSE connection if enabled
            if (this.config.enableSSE) {
                await this._setupSSEConnection();
            }

            this.logger.info('Successfully connected to AgentAPI');
            this.emit('connected');

            return true;
        } catch (error) {
            this.connectionAttempts++;
            this.logger.error(`Failed to connect to AgentAPI (attempt ${this.connectionAttempts}):`, error);
            
            if (this.connectionAttempts < this.maxConnectionAttempts) {
                const delay = 2000 * this.connectionAttempts;
                this.logger.info(`Retrying connection in ${delay}ms...`);
                setTimeout(() => this.connect(), delay);
            } else {
                this.emit('connection_failed', error);
            }

            return false;
        }
    }

    /**
     * Setup Server-Sent Events connection
     */
    async _setupSSEConnection() {
        try {
            const EventSource = (await import('eventsource')).default;
            const sseUrl = `${this.config.baseURL}/events`;

            this.eventSource = new EventSource(sseUrl, {
                headers: this.config.apiKey ? { 'Authorization': `Bearer ${this.config.apiKey}` } : {}
            });

            this.eventSource.onopen = () => {
                this.logger.info('SSE connection established');
                this.emit('sse_connected');
            };

            this.eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.logger.debug('SSE message received:', data);
                    this.emit('message', data);
                } catch (error) {
                    this.logger.error('Failed to parse SSE message:', error);
                }
            };

            this.eventSource.onerror = (error) => {
                this.logger.error('SSE connection error:', error);
                this.emit('sse_error', error);
            };

        } catch (error) {
            this.logger.error('Failed to setup SSE connection:', error);
        }
    }

    /**
     * Get AgentAPI health status
     */
    async getHealth() {
        try {
            const response = await this.httpClient.get('/health');
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                status: error.response?.status
            };
        }
    }

    /**
     * Get agent status
     */
    async getStatus() {
        try {
            const response = await this.httpClient.get('/status');
            return {
                success: true,
                status: response.data.status,
                data: response.data
            };
        } catch (error) {
            this.logger.error('Failed to get agent status:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Send message to agent
     */
    async sendMessage(content, type = 'user') {
        try {
            const payload = {
                content,
                type,
                timestamp: new Date().toISOString()
            };

            this.logger.info('Sending message to agent:', { type, contentLength: content.length });

            const response = await this.httpClient.post('/message', payload);
            
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            this.logger.error('Failed to send message:', error);
            return {
                success: false,
                error: error.message,
                status: error.response?.status
            };
        }
    }

    /**
     * Get conversation messages
     */
    async getMessages(limit = 50, offset = 0) {
        try {
            const response = await this.httpClient.get('/messages', {
                params: { limit, offset }
            });

            return {
                success: true,
                messages: response.data.messages || response.data,
                total: response.data.total
            };
        } catch (error) {
            this.logger.error('Failed to get messages:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Start agent session with specific configuration
     */
    async startSession(config = {}) {
        try {
            const payload = {
                agent: config.agent || 'claude',
                arguments: config.arguments || [],
                environment: config.environment || {},
                timeout: config.timeout || this.config.timeout
            };

            this.logger.info('Starting agent session:', payload);

            const response = await this.httpClient.post('/session/start', payload);
            
            return {
                success: true,
                sessionId: response.data.sessionId,
                data: response.data
            };
        } catch (error) {
            this.logger.error('Failed to start session:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Stop agent session
     */
    async stopSession(sessionId) {
        try {
            const response = await this.httpClient.post(`/session/${sessionId}/stop`);
            
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            this.logger.error('Failed to stop session:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Execute command in agent session
     */
    async executeCommand(sessionId, command, options = {}) {
        try {
            const payload = {
                command,
                options,
                timestamp: new Date().toISOString()
            };

            const response = await this.httpClient.post(`/session/${sessionId}/execute`, payload);
            
            return {
                success: true,
                result: response.data.result,
                data: response.data
            };
        } catch (error) {
            this.logger.error('Failed to execute command:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Disconnect from AgentAPI
     */
    async disconnect() {
        try {
            if (this.eventSource) {
                this.eventSource.close();
                this.eventSource = null;
            }

            this.isConnected = false;
            this.logger.info('Disconnected from AgentAPI');
            this.emit('disconnected');
        } catch (error) {
            this.logger.error('Error during disconnect:', error);
        }
    }

    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            connectionAttempts: this.connectionAttempts,
            hasSSE: !!this.eventSource,
            baseURL: this.config.baseURL
        };
    }
}

export default AgentAPIClient;

