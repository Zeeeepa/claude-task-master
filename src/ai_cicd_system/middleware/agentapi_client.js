/**
 * @fileoverview AgentAPI HTTP Client
 * @description Unified HTTP client for AgentAPI communication with circuit breaker,
 * retry logic, and event stream support. Consolidates client implementations from
 * PRs #43, #46, #47, #60, #85.
 */

import EventEmitter from 'events';
import EventSource from 'eventsource';
import { SimpleLogger } from '../utils/simple_logger.js';

export class AgentAPIClient extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            baseUrl: config.baseUrl || 'http://localhost:3284',
            timeout: config.timeout || 30000,
            retryAttempts: config.retryAttempts || 3,
            retryDelay: config.retryDelay || 1000,
            enableEventStream: config.enableEventStream !== false,
            healthCheckInterval: config.healthCheckInterval || 30000,
            reconnectDelay: config.reconnectDelay || 5000,
            maxReconnectAttempts: config.maxReconnectAttempts || 10,
            circuitBreaker: {
                failureThreshold: config.circuitBreaker?.failureThreshold || 5,
                recoveryTimeout: config.circuitBreaker?.recoveryTimeout || 60000,
                ...config.circuitBreaker
            },
            ...config
        };

        this.logger = new SimpleLogger('AgentAPIClient');
        
        // Connection state
        this.isConnected = false;
        this.connectionAttempts = 0;
        this.lastConnectionTime = null;
        
        // Circuit breaker state
        this.circuitBreakerState = 'closed'; // closed, open, half-open
        this.failureCount = 0;
        this.lastFailureTime = null;
        
        // Event stream
        this.eventSource = null;
        this.eventStreamConnected = false;
        
        // Metrics
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTime: 0,
            circuitBreakerTrips: 0,
            reconnectAttempts: 0
        };
        
        // Intervals
        this.healthCheckInterval = null;
        this.circuitBreakerInterval = null;
    }

    /**
     * Connect to AgentAPI
     */
    async connect() {
        if (this.isConnected) {
            this.logger.warn('Already connected to AgentAPI');
            return;
        }

        try {
            this.logger.info(`🔗 Connecting to AgentAPI at ${this.config.baseUrl}...`);
            
            // Test connection with health check
            await this._performHealthCheck();
            
            this.isConnected = true;
            this.connectionAttempts = 0;
            this.lastConnectionTime = Date.now();
            
            // Start health monitoring
            this._startHealthMonitoring();
            
            // Connect event stream if enabled
            if (this.config.enableEventStream) {
                await this._connectEventStream();
            }
            
            this.emit('connected');
            this.logger.info('✅ Connected to AgentAPI successfully');

        } catch (error) {
            this.connectionAttempts++;
            this.logger.error(`❌ Failed to connect to AgentAPI (attempt ${this.connectionAttempts}):`, error);
            
            if (this.connectionAttempts < this.config.maxReconnectAttempts) {
                this.logger.info(`🔄 Retrying connection in ${this.config.reconnectDelay}ms...`);
                setTimeout(() => this.connect(), this.config.reconnectDelay);
            } else {
                this.emit('connectionFailed', error);
                throw error;
            }
        }
    }

    /**
     * Disconnect from AgentAPI
     */
    async disconnect() {
        if (!this.isConnected) {
            return;
        }

        try {
            this.logger.info('🔌 Disconnecting from AgentAPI...');
            
            // Stop health monitoring
            this._stopHealthMonitoring();
            
            // Disconnect event stream
            this._disconnectEventStream();
            
            this.isConnected = false;
            this.emit('disconnected');
            
            this.logger.info('✅ Disconnected from AgentAPI');

        } catch (error) {
            this.logger.error('❌ Error during disconnect:', error);
            throw error;
        }
    }

    /**
     * Send message to AgentAPI
     * @param {string} message - Message to send
     * @param {string} role - Message role (user, assistant, system)
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Response from AgentAPI
     */
    async sendMessage(message, role = 'user', options = {}) {
        return this._makeRequest('POST', '/api/v1/messages', {
            message,
            role,
            ...options
        });
    }

    /**
     * Start a new session
     * @param {Object} sessionConfig - Session configuration
     * @returns {Promise<Object>} Session details
     */
    async startSession(sessionConfig = {}) {
        return this._makeRequest('POST', '/api/v1/sessions', sessionConfig);
    }

    /**
     * Stop a session
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object>} Stop result
     */
    async stopSession(sessionId) {
        return this._makeRequest('DELETE', `/api/v1/sessions/${sessionId}`);
    }

    /**
     * Get session status
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object>} Session status
     */
    async getSessionStatus(sessionId) {
        return this._makeRequest('GET', `/api/v1/sessions/${sessionId}`);
    }

    /**
     * Get health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        return this._makeRequest('GET', '/health');
    }

    /**
     * Get connection status
     * @returns {Object} Connection status
     */
    getConnectionStatus() {
        return {
            connected: this.isConnected,
            eventStreamConnected: this.eventStreamConnected,
            circuitBreakerState: this.circuitBreakerState,
            lastConnectionTime: this.lastConnectionTime,
            connectionAttempts: this.connectionAttempts,
            failureCount: this.failureCount
        };
    }

    /**
     * Get client metrics
     * @returns {Object} Client metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            successRate: this.metrics.totalRequests > 0 
                ? (this.metrics.successfulRequests / this.metrics.totalRequests) * 100 
                : 0,
            connectionStatus: this.getConnectionStatus()
        };
    }

    // Private methods

    async _makeRequest(method, path, data = null, attempt = 1) {
        // Check circuit breaker
        if (this._isCircuitBreakerOpen()) {
            throw new Error('Circuit breaker is open - AgentAPI unavailable');
        }

        const startTime = Date.now();
        this.metrics.totalRequests++;

        try {
            const url = `${this.config.baseUrl}${path}`;
            const options = {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'AgentAPI-Middleware/1.0.0'
                },
                timeout: this.config.timeout
            };

            if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
                options.body = JSON.stringify(data);
            }

            this.logger.debug(`📤 ${method} ${path}`, { attempt, data });

            const response = await this._fetchWithTimeout(url, options);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            const responseTime = Date.now() - startTime;
            
            // Update metrics
            this.metrics.successfulRequests++;
            this._updateAverageResponseTime(responseTime);
            
            // Reset circuit breaker on success
            this._recordSuccess();
            
            this.logger.debug(`📥 ${method} ${path} - Success`, { 
                responseTime, 
                status: response.status 
            });

            return result;

        } catch (error) {
            const responseTime = Date.now() - startTime;
            this.metrics.failedRequests++;
            
            this.logger.error(`❌ ${method} ${path} - Failed`, { 
                attempt, 
                responseTime, 
                error: error.message 
            });

            // Record failure for circuit breaker
            this._recordFailure();

            // Retry logic
            if (attempt < this.config.retryAttempts && this._shouldRetry(error)) {
                const delay = this._calculateRetryDelay(attempt);
                this.logger.info(`🔄 Retrying ${method} ${path} in ${delay}ms (attempt ${attempt + 1}/${this.config.retryAttempts})`);
                
                await this._sleep(delay);
                return this._makeRequest(method, path, data, attempt + 1);
            }

            throw error;
        }
    }

    async _fetchWithTimeout(url, options) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeout);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error(`Request timeout after ${options.timeout}ms`);
            }
            throw error;
        }
    }

    async _performHealthCheck() {
        try {
            const health = await this._makeRequest('GET', '/health');
            this.logger.debug('🏥 Health check passed', health);
            return health;
        } catch (error) {
            this.logger.error('🏥 Health check failed:', error);
            throw error;
        }
    }

    _startHealthMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        this.healthCheckInterval = setInterval(async () => {
            try {
                await this._performHealthCheck();
            } catch (error) {
                this.logger.warn('🏥 Health check failed during monitoring:', error);
                this.emit('healthCheckFailed', error);
                
                // Attempt reconnection if health check fails
                if (this.isConnected) {
                    this.isConnected = false;
                    this.emit('disconnected');
                    
                    // Try to reconnect
                    setTimeout(() => {
                        if (!this.isConnected) {
                            this.connect().catch(err => {
                                this.logger.error('🔄 Reconnection failed:', err);
                            });
                        }
                    }, this.config.reconnectDelay);
                }
            }
        }, this.config.healthCheckInterval);
    }

    _stopHealthMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    async _connectEventStream() {
        if (this.eventSource) {
            this._disconnectEventStream();
        }

        try {
            const eventStreamUrl = `${this.config.baseUrl}/api/v1/events`;
            this.logger.info(`📡 Connecting to event stream: ${eventStreamUrl}`);
            
            this.eventSource = new EventSource(eventStreamUrl);
            
            this.eventSource.onopen = () => {
                this.eventStreamConnected = true;
                this.logger.info('📡 Event stream connected');
                this.emit('eventStreamConnected');
            };
            
            this.eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.logger.debug('📨 Event received:', data);
                    this.emit('event', data);
                } catch (error) {
                    this.logger.error('❌ Failed to parse event data:', error);
                }
            };
            
            this.eventSource.onerror = (error) => {
                this.eventStreamConnected = false;
                this.logger.error('📡 Event stream error:', error);
                this.emit('eventStreamError', error);
                
                // Attempt to reconnect
                setTimeout(() => {
                    if (this.isConnected && !this.eventStreamConnected) {
                        this._connectEventStream();
                    }
                }, this.config.reconnectDelay);
            };

        } catch (error) {
            this.logger.error('❌ Failed to connect event stream:', error);
            throw error;
        }
    }

    _disconnectEventStream() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
            this.eventStreamConnected = false;
            this.logger.info('📡 Event stream disconnected');
            this.emit('eventStreamDisconnected');
        }
    }

    // Circuit breaker methods

    _isCircuitBreakerOpen() {
        if (this.circuitBreakerState === 'open') {
            const timeSinceLastFailure = Date.now() - this.lastFailureTime;
            if (timeSinceLastFailure >= this.config.circuitBreaker.recoveryTimeout) {
                this.circuitBreakerState = 'half-open';
                this.logger.info('🔄 Circuit breaker moved to half-open state');
            } else {
                return true;
            }
        }
        return false;
    }

    _recordSuccess() {
        if (this.circuitBreakerState === 'half-open') {
            this.circuitBreakerState = 'closed';
            this.failureCount = 0;
            this.logger.info('✅ Circuit breaker closed - service recovered');
        }
    }

    _recordFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        
        if (this.failureCount >= this.config.circuitBreaker.failureThreshold) {
            this.circuitBreakerState = 'open';
            this.metrics.circuitBreakerTrips++;
            this.logger.warn(`🚨 Circuit breaker opened after ${this.failureCount} failures`);
            this.emit('circuitBreakerOpened');
        }
    }

    // Utility methods

    _shouldRetry(error) {
        // Don't retry on client errors (4xx)
        if (error.message.includes('HTTP 4')) {
            return false;
        }
        
        // Retry on network errors, timeouts, and server errors (5xx)
        return true;
    }

    _calculateRetryDelay(attempt) {
        // Exponential backoff with jitter
        const baseDelay = this.config.retryDelay;
        const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 1000; // Add up to 1 second of jitter
        
        return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
    }

    _updateAverageResponseTime(responseTime) {
        const totalRequests = this.metrics.totalRequests;
        const currentAverage = this.metrics.averageResponseTime;
        
        this.metrics.averageResponseTime = 
            (currentAverage * (totalRequests - 1) + responseTime) / totalRequests;
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default AgentAPIClient;

