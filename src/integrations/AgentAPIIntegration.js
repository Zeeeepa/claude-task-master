/**
 * @fileoverview Agent API Integration
 * @description Comprehensive Agent API integration for agent deployment and management
 */

import EventEmitter from 'events';
import { integrationConfig } from '../config/integrations.js';

/**
 * Agent API Integration Service
 * Handles all Agent API operations for agent lifecycle management
 */
export class AgentAPIIntegration extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            ...integrationConfig.agentapi,
            ...config
        };
        
        this.apiKey = this.config.apiKey;
        this.baseUrl = this.config.baseUrl;
        this.webhookSecret = this.config.webhookSecret;
        
        // Rate limiting
        this.rateLimiter = {
            requests: 0,
            windowStart: Date.now(),
            maxRequests: this.config.rateLimits.requests,
            windowMs: this.config.rateLimits.window * 1000
        };
        
        // Circuit breaker state
        this.circuitBreaker = {
            failures: 0,
            lastFailure: null,
            state: 'CLOSED' // CLOSED, OPEN, HALF_OPEN
        };
        
        this.isInitialized = false;
        this.activeAgents = new Map();
        this.agentHistory = [];
        this.metrics = {
            requestCount: 0,
            errorCount: 0,
            successCount: 0,
            agentDeployments: 0,
            agentStops: 0,
            lastRequest: null,
            averageResponseTime: 0
        };
    }
    
    /**
     * Initialize the Agent API integration
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }
        
        try {
            // Validate connection
            await this.validateConnection();
            this.isInitialized = true;
            this.emit('initialized');
            console.log('Agent API integration initialized successfully');
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to initialize Agent API integration: ${error.message}`);
        }
    }
    
    /**
     * Validate connection to Agent API
     */
    async validateConnection() {
        try {
            const response = await this.makeRequest('GET', '/health');
            if (!response.status || response.status !== 'ok') {
                throw new Error('Invalid API response');
            }
            return true;
        } catch (error) {
            throw new Error(`Agent API connection validation failed: ${error.message}`);
        }
    }
    
    /**
     * Deploy an agent
     */
    async deployAgent(agentConfig) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }
            
            const agentId = this.generateAgentId();
            
            const deploymentConfig = {
                id: agentId,
                name: agentConfig.name || `agent-${agentId}`,
                type: agentConfig.type || 'general',
                image: agentConfig.image || 'claude-code:latest',
                environment: {
                    ...agentConfig.environment,
                    AGENT_ID: agentId,
                    DEPLOYMENT_TIME: new Date().toISOString()
                },
                resources: {
                    cpu: agentConfig.cpu || '1',
                    memory: agentConfig.memory || '1Gi',
                    storage: agentConfig.storage || '10Gi',
                    ...agentConfig.resources
                },
                networking: {
                    ports: agentConfig.ports || [],
                    ingress: agentConfig.ingress || false,
                    ...agentConfig.networking
                },
                configuration: {
                    command: agentConfig.command,
                    args: agentConfig.args || [],
                    workingDir: agentConfig.workingDir || '/app',
                    ...agentConfig.configuration
                },
                scaling: {
                    replicas: agentConfig.replicas || 1,
                    autoScale: agentConfig.autoScale || false,
                    minReplicas: agentConfig.minReplicas || 1,
                    maxReplicas: agentConfig.maxReplicas || 5,
                    ...agentConfig.scaling
                },
                monitoring: {
                    healthCheck: agentConfig.healthCheck || '/health',
                    metrics: agentConfig.metrics !== false,
                    logs: agentConfig.logs !== false,
                    ...agentConfig.monitoring
                },
                metadata: {
                    source: 'claude-task-master',
                    version: '1.0.0',
                    timestamp: new Date().toISOString(),
                    ...agentConfig.metadata
                }
            };
            
            // Track deployment
            this.activeAgents.set(agentId, {
                ...deploymentConfig,
                status: 'deploying',
                startTime: Date.now(),
                deploymentAttempts: 1
            });
            
            this.emit('agent.deploying', { agentId, config: deploymentConfig });
            
            const response = await this.makeRequest('POST', '/agents', deploymentConfig);
            
            if (!response.success) {
                throw new Error(response.error || 'Failed to deploy agent');
            }
            
            // Update agent status
            this.activeAgents.set(agentId, {
                ...this.activeAgents.get(agentId),
                status: 'deployed',
                deploymentId: response.deploymentId,
                endpoints: response.endpoints || [],
                deployedAt: new Date().toISOString()
            });
            
            this.metrics.agentDeployments++;
            
            this.emit('agent.deployed', { 
                agentId, 
                deploymentId: response.deploymentId,
                endpoints: response.endpoints,
                status: 'deployed'
            });
            
            return {
                agentId,
                deploymentId: response.deploymentId,
                status: 'deployed',
                endpoints: response.endpoints,
                configuration: deploymentConfig
            };
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to deploy agent: ${error.message}`);
        }
    }
    
    /**
     * Get agent status
     */
    async getAgentStatus(agentId) {
        try {
            if (!this.activeAgents.has(agentId)) {
                throw new Error(`Agent ${agentId} not found`);
            }
            
            const agent = this.activeAgents.get(agentId);
            
            const response = await this.makeRequest('GET', `/agents/${agentId}/status`);
            
            const status = {
                agentId,
                status: response.status,
                health: response.health || 'unknown',
                uptime: response.uptime || 0,
                resources: {
                    cpu: response.resources?.cpu || 0,
                    memory: response.resources?.memory || 0,
                    storage: response.resources?.storage || 0,
                    network: response.resources?.network || 0
                },
                metrics: {
                    requests: response.metrics?.requests || 0,
                    errors: response.metrics?.errors || 0,
                    responseTime: response.metrics?.responseTime || 0,
                    throughput: response.metrics?.throughput || 0
                },
                replicas: {
                    desired: response.replicas?.desired || 1,
                    current: response.replicas?.current || 0,
                    ready: response.replicas?.ready || 0,
                    available: response.replicas?.available || 0
                },
                lastUpdate: response.lastUpdate || new Date().toISOString(),
                elapsedTime: Date.now() - agent.startTime
            };
            
            // Update local agent status
            this.activeAgents.set(agentId, {
                ...agent,
                ...status,
                lastChecked: status.lastUpdate
            });
            
            this.emit('agent.status.updated', status);
            
            return status;
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to get agent status: ${error.message}`);
        }
    }
    
    /**
     * Send command to agent
     */
    async sendAgentCommand(agentId, command) {
        try {
            if (!this.activeAgents.has(agentId)) {
                throw new Error(`Agent ${agentId} not found`);
            }
            
            const commandData = {
                agentId,
                command: {
                    type: command.type || 'execute',
                    action: command.action,
                    parameters: command.parameters || {},
                    timeout: command.timeout || 30000,
                    async: command.async !== false
                },
                metadata: {
                    source: 'claude-task-master',
                    timestamp: new Date().toISOString(),
                    ...command.metadata
                }
            };
            
            this.emit('agent.command.sent', { agentId, command: commandData });
            
            const response = await this.makeRequest('POST', `/agents/${agentId}/commands`, commandData);
            
            if (!response.success) {
                throw new Error(response.error || 'Command execution failed');
            }
            
            const result = {
                commandId: response.commandId,
                agentId,
                status: response.status,
                result: response.result,
                output: response.output || '',
                error: response.error,
                executionTime: response.executionTime || 0,
                timestamp: response.timestamp || new Date().toISOString()
            };
            
            this.emit('agent.command.completed', result);
            
            return result;
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to send agent command: ${error.message}`);
        }
    }
    
    /**
     * Get agent logs
     */
    async getAgentLogs(agentId, options = {}) {
        try {
            if (!this.activeAgents.has(agentId)) {
                throw new Error(`Agent ${agentId} not found`);
            }
            
            const queryParams = new URLSearchParams({
                lines: options.lines || 100,
                since: options.since || '',
                until: options.until || '',
                follow: options.follow || false,
                level: options.level || 'info'
            });
            
            const response = await this.makeRequest('GET', `/agents/${agentId}/logs?${queryParams}`);
            
            const logs = {
                agentId,
                logs: response.logs || [],
                metadata: {
                    totalLines: response.totalLines || 0,
                    truncated: response.truncated || false,
                    timeRange: {
                        start: response.timeRange?.start,
                        end: response.timeRange?.end
                    },
                    retrievedAt: new Date().toISOString()
                }
            };
            
            this.emit('agent.logs.retrieved', logs);
            
            return logs;
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to get agent logs: ${error.message}`);
        }
    }
    
    /**
     * Stop agent
     */
    async stopAgent(agentId, options = {}) {
        try {
            if (!this.activeAgents.has(agentId)) {
                throw new Error(`Agent ${agentId} not found`);
            }
            
            const stopOptions = {
                graceful: options.graceful !== false,
                timeout: options.timeout || 30000,
                force: options.force || false,
                cleanup: options.cleanup !== false
            };
            
            this.emit('agent.stopping', { agentId, options: stopOptions });
            
            const response = await this.makeRequest('DELETE', `/agents/${agentId}`, stopOptions);
            
            if (!response.success) {
                throw new Error(response.error || 'Failed to stop agent');
            }
            
            // Update agent status
            const agent = this.activeAgents.get(agentId);
            this.activeAgents.set(agentId, {
                ...agent,
                status: 'stopped',
                stoppedAt: new Date().toISOString(),
                stopReason: options.reason || 'manual'
            });
            
            // Move to history after a delay
            setTimeout(() => {
                if (this.activeAgents.has(agentId)) {
                    const stoppedAgent = this.activeAgents.get(agentId);
                    this.agentHistory.push(stoppedAgent);
                    this.activeAgents.delete(agentId);
                    
                    // Keep only last 100 entries in history
                    if (this.agentHistory.length > 100) {
                        this.agentHistory = this.agentHistory.slice(-100);
                    }
                }
            }, 60000); // 1 minute delay
            
            this.metrics.agentStops++;
            
            this.emit('agent.stopped', { 
                agentId, 
                status: 'stopped',
                reason: options.reason || 'manual',
                graceful: stopOptions.graceful
            });
            
            return {
                agentId,
                status: 'stopped',
                stoppedAt: new Date().toISOString(),
                graceful: stopOptions.graceful
            };
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to stop agent: ${error.message}`);
        }
    }
    
    /**
     * Handle agent events
     */
    async handleAgentEvents(event) {
        try {
            const { type, agentId, data } = event;
            
            switch (type) {
                case 'agent_started':
                    await this.handleAgentStartedEvent(agentId, data);
                    break;
                case 'agent_stopped':
                    await this.handleAgentStoppedEvent(agentId, data);
                    break;
                case 'agent_error':
                    await this.handleAgentErrorEvent(agentId, data);
                    break;
                case 'agent_health_check':
                    await this.handleAgentHealthCheckEvent(agentId, data);
                    break;
                case 'agent_scaled':
                    await this.handleAgentScaledEvent(agentId, data);
                    break;
                case 'agent_command_completed':
                    await this.handleAgentCommandCompletedEvent(agentId, data);
                    break;
                default:
                    console.log(`Unhandled agent event type: ${type}`);
            }
            
            this.emit('agent.event.processed', { type, agentId, data });
        } catch (error) {
            this.emit('error', error);
            throw new Error(`Failed to handle agent event: ${error.message}`);
        }
    }
    
    /**
     * Handle agent started event
     */
    async handleAgentStartedEvent(agentId, data) {
        if (this.activeAgents.has(agentId)) {
            const agent = this.activeAgents.get(agentId);
            this.activeAgents.set(agentId, {
                ...agent,
                status: 'running',
                startedAt: data.timestamp || new Date().toISOString(),
                endpoints: data.endpoints || agent.endpoints
            });
        }
        
        this.emit('agent.event.started', { agentId, data });
    }
    
    /**
     * Handle agent stopped event
     */
    async handleAgentStoppedEvent(agentId, data) {
        if (this.activeAgents.has(agentId)) {
            const agent = this.activeAgents.get(agentId);
            this.activeAgents.set(agentId, {
                ...agent,
                status: 'stopped',
                stoppedAt: data.timestamp || new Date().toISOString(),
                stopReason: data.reason || 'unknown'
            });
        }
        
        this.emit('agent.event.stopped', { agentId, data });
    }
    
    /**
     * Handle agent error event
     */
    async handleAgentErrorEvent(agentId, data) {
        if (this.activeAgents.has(agentId)) {
            const agent = this.activeAgents.get(agentId);
            this.activeAgents.set(agentId, {
                ...agent,
                status: 'error',
                lastError: {
                    message: data.error,
                    timestamp: data.timestamp || new Date().toISOString(),
                    code: data.code
                }
            });
        }
        
        this.emit('agent.event.error', { agentId, data });
    }
    
    /**
     * Handle agent health check event
     */
    async handleAgentHealthCheckEvent(agentId, data) {
        if (this.activeAgents.has(agentId)) {
            const agent = this.activeAgents.get(agentId);
            this.activeAgents.set(agentId, {
                ...agent,
                health: data.health,
                lastHealthCheck: data.timestamp || new Date().toISOString(),
                healthDetails: data.details
            });
        }
        
        this.emit('agent.event.health_check', { agentId, data });
    }
    
    /**
     * Handle agent scaled event
     */
    async handleAgentScaledEvent(agentId, data) {
        if (this.activeAgents.has(agentId)) {
            const agent = this.activeAgents.get(agentId);
            this.activeAgents.set(agentId, {
                ...agent,
                replicas: data.replicas,
                scaledAt: data.timestamp || new Date().toISOString(),
                scaleReason: data.reason
            });
        }
        
        this.emit('agent.event.scaled', { agentId, data });
    }
    
    /**
     * Handle agent command completed event
     */
    async handleAgentCommandCompletedEvent(agentId, data) {
        this.emit('agent.event.command_completed', { agentId, data });
    }
    
    /**
     * Generate unique agent ID
     */
    generateAgentId() {
        return `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Make HTTP request to Agent API
     */
    async makeRequest(method, endpoint, data = null) {
        // Check circuit breaker
        if (this.circuitBreaker.state === 'OPEN') {
            const timeSinceLastFailure = Date.now() - this.circuitBreaker.lastFailure;
            if (timeSinceLastFailure < 60000) { // 1 minute
                throw new Error('Circuit breaker is OPEN');
            } else {
                this.circuitBreaker.state = 'HALF_OPEN';
            }
        }
        
        // Check rate limits
        await this.checkRateLimit();
        
        const startTime = Date.now();
        
        try {
            const url = `${this.baseUrl}${endpoint}`;
            const options = {
                method,
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'claude-task-master/1.0.0'
                },
                timeout: this.config.timeout
            };
            
            if (data) {
                options.body = JSON.stringify(data);
            }
            
            const response = await fetch(url, options);
            
            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorBody}`);
            }
            
            const result = await response.json();
            
            // Update metrics
            const responseTime = Date.now() - startTime;
            this.updateMetrics(responseTime, false);
            
            // Reset circuit breaker on success
            if (this.circuitBreaker.state === 'HALF_OPEN') {
                this.circuitBreaker.state = 'CLOSED';
                this.circuitBreaker.failures = 0;
            }
            
            return result;
        } catch (error) {
            // Update metrics
            this.updateMetrics(Date.now() - startTime, true);
            
            // Update circuit breaker
            this.circuitBreaker.failures++;
            this.circuitBreaker.lastFailure = Date.now();
            
            if (this.circuitBreaker.failures >= 5) {
                this.circuitBreaker.state = 'OPEN';
            }
            
            throw error;
        }
    }
    
    /**
     * Check rate limits
     */
    async checkRateLimit() {
        const now = Date.now();
        const windowElapsed = now - this.rateLimiter.windowStart;
        
        if (windowElapsed >= this.rateLimiter.windowMs) {
            // Reset window
            this.rateLimiter.requests = 0;
            this.rateLimiter.windowStart = now;
        }
        
        if (this.rateLimiter.requests >= this.rateLimiter.maxRequests) {
            const waitTime = this.rateLimiter.windowMs - windowElapsed;
            throw new Error(`Rate limit exceeded. Wait ${waitTime}ms`);
        }
        
        this.rateLimiter.requests++;
    }
    
    /**
     * Update metrics
     */
    updateMetrics(responseTime, isError) {
        this.metrics.requestCount++;
        this.metrics.lastRequest = Date.now();
        
        if (isError) {
            this.metrics.errorCount++;
        } else {
            this.metrics.successCount++;
        }
        
        // Calculate rolling average response time
        this.metrics.averageResponseTime = 
            (this.metrics.averageResponseTime * (this.metrics.requestCount - 1) + responseTime) / 
            this.metrics.requestCount;
    }
    
    /**
     * Get health status
     */
    getHealthStatus() {
        const errorRate = this.metrics.requestCount > 0 ? 
            (this.metrics.errorCount / this.metrics.requestCount) * 100 : 0;
        
        return {
            service: 'agentapi',
            status: this.circuitBreaker.state === 'OPEN' ? 'unhealthy' : 'healthy',
            initialized: this.isInitialized,
            circuitBreaker: this.circuitBreaker.state,
            activeAgents: this.activeAgents.size,
            metrics: {
                ...this.metrics,
                errorRate: Math.round(errorRate * 100) / 100
            },
            rateLimiter: {
                requests: this.rateLimiter.requests,
                maxRequests: this.rateLimiter.maxRequests,
                windowStart: this.rateLimiter.windowStart
            }
        };
    }
    
    /**
     * Get all active agents
     */
    getActiveAgents() {
        return Array.from(this.activeAgents.values());
    }
    
    /**
     * Get agent history
     */
    getAgentHistory() {
        return this.agentHistory;
    }
}

export default AgentAPIIntegration;

