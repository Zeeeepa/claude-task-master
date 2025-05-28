/**
 * AgentAPI Client
 * 
 * HTTP client for communicating with the AgentAPI service.
 * Handles request routing, retry logic, and error handling.
 */

import axios from 'axios';
import { SimpleLogger } from '../utils/simple_logger.js';
import { getAgentConfig, AGENTAPI_CONFIG } from '../config/agentapi_config.js';

export class AgentAPIClient {
    constructor(config = {}) {
        this.config = {
            ...AGENTAPI_CONFIG,
            ...config
        };
        
        this.logger = new SimpleLogger('AgentAPIClient');
        this.httpClient = this._createHttpClient();
        this.agents = this._initializeAgents();
        this.circuitBreakers = new Map();
    }

    /**
     * Create HTTP client with default configuration
     */
    _createHttpClient() {
        const client = axios.create({
            baseURL: this.config.base_url,
            timeout: this.config.timeout,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'AgentAPI-Client/1.0.0',
                ...(this.config.api_key && { 'Authorization': `Bearer ${this.config.api_key}` })
            }
        });

        // Request interceptor for logging
        client.interceptors.request.use(
            (config) => {
                this.logger.debug(`HTTP Request: ${config.method?.toUpperCase()} ${config.url}`, {
                    headers: config.headers,
                    data: config.data
                });
                return config;
            },
            (error) => {
                this.logger.error('HTTP Request Error:', error);
                return Promise.reject(error);
            }
        );

        // Response interceptor for logging and error handling
        client.interceptors.response.use(
            (response) => {
                this.logger.debug(`HTTP Response: ${response.status} ${response.config.url}`, {
                    status: response.status,
                    data: response.data
                });
                return response;
            },
            (error) => {
                this.logger.error('HTTP Response Error:', {
                    status: error.response?.status,
                    message: error.message,
                    url: error.config?.url
                });
                return Promise.reject(error);
            }
        );

        return client;
    }

    /**
     * Initialize agent instances
     */
    _initializeAgents() {
        const agents = {};
        
        for (const [agentType, agentConfig] of Object.entries(this.config.agents)) {
            agents[agentType] = new AgentInstance(agentType, agentConfig, this);
        }

        return agents;
    }

    /**
     * Route task to appropriate agent
     */
    async routeTask(task, agentType = null) {
        try {
            // Auto-select agent if not specified
            if (!agentType) {
                agentType = this._selectBestAgent(task);
            }

            const agent = this.agents[agentType];
            if (!agent) {
                throw new Error(`Unknown agent type: ${agentType}`);
            }

            // Check circuit breaker
            if (this._isCircuitBreakerOpen(agentType)) {
                throw new Error(`Agent ${agentType} is currently unavailable (circuit breaker open)`);
            }

            this.logger.info(`Routing task to agent: ${agentType}`, {
                taskId: task.task_id,
                taskType: task.task_type,
                agentType
            });

            const result = await agent.processTask(task);
            this._recordSuccess(agentType);
            
            return {
                success: true,
                agentType,
                result,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            this._recordFailure(agentType);
            this.logger.error(`Task routing failed for agent ${agentType}:`, error);
            
            // Attempt failover if enabled
            if (this.config.routing_config.enable_failover && agentType) {
                return await this._attemptFailover(task, agentType);
            }

            throw error;
        }
    }

    /**
     * Select best agent for task based on capabilities and availability
     */
    _selectBestAgent(task) {
        const requiredCapabilities = this._extractCapabilities(task);
        const availableAgents = this._getHealthyAgents();

        // Filter agents by capabilities
        const capableAgents = availableAgents.filter(agent => 
            requiredCapabilities.every(cap => agent.capabilities.includes(cap))
        );

        if (capableAgents.length === 0) {
            throw new Error(`No agents available with required capabilities: ${requiredCapabilities.join(', ')}`);
        }

        // Sort by priority and load
        capableAgents.sort((a, b) => {
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }
            return a.currentLoad - b.currentLoad;
        });

        return capableAgents[0].type;
    }

    /**
     * Extract required capabilities from task
     */
    _extractCapabilities(task) {
        const capabilities = [];
        
        switch (task.task_type) {
            case 'pr_deployment':
                capabilities.push('pr_deployment', 'code_validation');
                break;
            case 'code_generation':
                capabilities.push('code_generation');
                break;
            case 'code_editing':
                capabilities.push('code_editing', 'file_management');
                break;
            case 'debugging':
            case 'error_debugging':
                capabilities.push('error_debugging', 'code_validation');
                break;
            case 'code_review':
                capabilities.push('code_review', 'code_validation');
                break;
            case 'refactoring':
                capabilities.push('refactoring', 'code_editing');
                break;
            case 'documentation':
                capabilities.push('documentation');
                break;
            case 'testing':
                capabilities.push('testing', 'code_analysis');
                break;
            case 'optimization':
                capabilities.push('optimization', 'code_analysis');
                break;
            default:
                // Default to code analysis for unknown task types
                capabilities.push('code_analysis');
        }

        // Add additional capabilities based on task context
        if (task.context?.git_operations) {
            capabilities.push('git_operations');
        }

        if (task.context?.file_operations) {
            capabilities.push('file_management');
        }

        return [...new Set(capabilities)]; // Remove duplicates
    }

    /**
     * Get healthy agents
     */
    _getHealthyAgents() {
        return Object.entries(this.agents)
            .filter(([type, agent]) => agent.isHealthy())
            .map(([type, agent]) => ({
                type,
                ...agent.config,
                currentLoad: agent.getCurrentLoad()
            }));
    }

    /**
     * Attempt failover to alternative agent
     */
    async _attemptFailover(task, failedAgentType) {
        this.logger.warn(`Attempting failover from agent: ${failedAgentType}`);

        const requiredCapabilities = this._extractCapabilities(task);
        const alternativeAgents = this._getHealthyAgents()
            .filter(agent => 
                agent.type !== failedAgentType &&
                requiredCapabilities.every(cap => agent.capabilities.includes(cap))
            );

        if (alternativeAgents.length === 0) {
            throw new Error(`No alternative agents available for failover`);
        }

        // Try the highest priority alternative
        const fallbackAgent = alternativeAgents[0];
        
        try {
            this.logger.info(`Failing over to agent: ${fallbackAgent.type}`);
            return await this.routeTask(task, fallbackAgent.type);
        } catch (error) {
            this.logger.error(`Failover to ${fallbackAgent.type} also failed:`, error);
            throw new Error(`All agents failed for task ${task.task_id}`);
        }
    }

    /**
     * Check if circuit breaker is open for agent
     */
    _isCircuitBreakerOpen(agentType) {
        const breaker = this.circuitBreakers.get(agentType);
        if (!breaker) return false;

        const now = Date.now();
        const config = this.config.routing_config.circuit_breaker;

        // Check if recovery timeout has passed
        if (breaker.state === 'open' && 
            now - breaker.lastFailure > config.recovery_timeout) {
            breaker.state = 'half-open';
            breaker.halfOpenCalls = 0;
        }

        return breaker.state === 'open';
    }

    /**
     * Record successful operation
     */
    _recordSuccess(agentType) {
        const breaker = this.circuitBreakers.get(agentType);
        if (breaker) {
            if (breaker.state === 'half-open') {
                breaker.halfOpenCalls++;
                const config = this.config.routing_config.circuit_breaker;
                
                if (breaker.halfOpenCalls >= config.half_open_max_calls) {
                    breaker.state = 'closed';
                    breaker.failures = 0;
                }
            } else if (breaker.state === 'closed') {
                breaker.failures = Math.max(0, breaker.failures - 1);
            }
        }
    }

    /**
     * Record failed operation
     */
    _recordFailure(agentType) {
        if (!agentType) return;

        let breaker = this.circuitBreakers.get(agentType);
        if (!breaker) {
            breaker = {
                state: 'closed',
                failures: 0,
                lastFailure: 0,
                halfOpenCalls: 0
            };
            this.circuitBreakers.set(agentType, breaker);
        }

        breaker.failures++;
        breaker.lastFailure = Date.now();

        const config = this.config.routing_config.circuit_breaker;
        
        if (breaker.failures >= config.failure_threshold) {
            breaker.state = 'open';
            this.logger.warn(`Circuit breaker opened for agent: ${agentType}`);
        }
    }

    /**
     * Get agent status
     */
    async getAgentStatus(agentType) {
        const agent = this.agents[agentType];
        if (!agent) {
            throw new Error(`Unknown agent type: ${agentType}`);
        }

        return await agent.getStatus();
    }

    /**
     * Get all agents status
     */
    async getAllAgentsStatus() {
        const statuses = {};
        
        for (const [agentType, agent] of Object.entries(this.agents)) {
            try {
                statuses[agentType] = await agent.getStatus();
            } catch (error) {
                statuses[agentType] = {
                    healthy: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                };
            }
        }

        return statuses;
    }

    /**
     * Health check for specific agent
     */
    async healthCheck(agentType) {
        const agent = this.agents[agentType];
        if (!agent) {
            throw new Error(`Unknown agent type: ${agentType}`);
        }

        return await agent.healthCheck();
    }

    /**
     * Shutdown client and cleanup resources
     */
    async shutdown() {
        this.logger.info('Shutting down AgentAPI client');
        
        for (const agent of Object.values(this.agents)) {
            await agent.shutdown();
        }
    }
}

/**
 * Individual Agent Instance
 */
class AgentInstance {
    constructor(type, config, client) {
        this.type = type;
        this.config = config;
        this.client = client;
        this.logger = new SimpleLogger(`Agent-${type}`);
        this.activeTasks = new Set();
        this.lastHealthCheck = 0;
        this.healthStatus = { healthy: true };
    }

    /**
     * Process task with this agent
     */
    async processTask(task) {
        if (this.activeTasks.size >= this.config.max_concurrent_tasks) {
            throw new Error(`Agent ${this.type} is at maximum capacity`);
        }

        const taskId = task.task_id || `task-${Date.now()}`;
        this.activeTasks.add(taskId);

        try {
            this.logger.info(`Processing task: ${taskId}`, {
                taskType: task.task_type,
                agentType: this.type
            });

            const response = await this.client.httpClient.post(
                this.config.endpoint,
                this._transformTaskForAgent(task),
                {
                    timeout: this.config.timeout
                }
            );

            return this._transformResponseFromAgent(response.data);

        } finally {
            this.activeTasks.delete(taskId);
        }
    }

    /**
     * Transform task data for agent-specific format
     */
    _transformTaskForAgent(task) {
        const baseRequest = {
            task_id: task.task_id,
            task_type: task.task_type,
            repository: task.repository,
            requirements: task.requirements,
            context: task.context,
            timeout: this.config.timeout
        };

        // Agent-specific transformations
        switch (this.type) {
            case 'claude-code':
                return {
                    ...baseRequest,
                    wsl2_config: this.config.config,
                    enable_git: this.config.config.enable_git_operations,
                    workspace_config: {
                        base_path: this.config.config.workspace_base,
                        max_size: this.config.config.max_workspace_size
                    }
                };

            case 'goose':
                return {
                    ...baseRequest,
                    model_config: this.config.config.model_config,
                    context_awareness: this.config.config.enable_context_awareness
                };

            case 'aider':
                return {
                    ...baseRequest,
                    git_config: {
                        auto_commit: this.config.config.auto_commit,
                        diff_context: this.config.config.diff_context_lines
                    },
                    tree_sitter_enabled: this.config.config.enable_tree_sitter
                };

            case 'codex':
                return {
                    ...baseRequest,
                    completion_config: {
                        engine: this.config.config.completion_engine,
                        max_length: this.config.config.max_completion_length
                    },
                    features: {
                        context_injection: this.config.config.enable_context_injection,
                        test_generation: this.config.config.enable_test_generation
                    }
                };

            default:
                return baseRequest;
        }
    }

    /**
     * Transform response from agent-specific format
     */
    _transformResponseFromAgent(response) {
        // Standardize response format
        return {
            success: response.success !== false,
            data: response.data || response.result || response,
            metadata: {
                agent_type: this.type,
                processing_time: response.processing_time,
                agent_version: response.version,
                timestamp: response.timestamp || new Date().toISOString()
            },
            errors: response.errors || [],
            warnings: response.warnings || []
        };
    }

    /**
     * Get current load (number of active tasks)
     */
    getCurrentLoad() {
        return this.activeTasks.size;
    }

    /**
     * Check if agent is healthy
     */
    isHealthy() {
        const now = Date.now();
        const checkInterval = this.config.health_check_interval;
        
        // Use cached health status if recent
        if (now - this.lastHealthCheck < checkInterval) {
            return this.healthStatus.healthy;
        }

        return true; // Assume healthy if no recent check
    }

    /**
     * Perform health check
     */
    async healthCheck() {
        try {
            const response = await this.client.httpClient.get(
                `${this.config.endpoint}/health`,
                { timeout: 5000 }
            );

            this.healthStatus = {
                healthy: true,
                status: response.data,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            this.healthStatus = {
                healthy: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }

        this.lastHealthCheck = Date.now();
        return this.healthStatus;
    }

    /**
     * Get agent status
     */
    async getStatus() {
        await this.healthCheck();
        
        return {
            type: this.type,
            healthy: this.healthStatus.healthy,
            active_tasks: this.activeTasks.size,
            max_concurrent_tasks: this.config.max_concurrent_tasks,
            capabilities: this.config.capabilities,
            priority: this.config.priority,
            last_health_check: this.lastHealthCheck,
            health_status: this.healthStatus,
            config: this.config
        };
    }

    /**
     * Shutdown agent instance
     */
    async shutdown() {
        this.logger.info(`Shutting down agent: ${this.type}`);
        // Wait for active tasks to complete or timeout
        const timeout = 30000; // 30 seconds
        const start = Date.now();
        
        while (this.activeTasks.size > 0 && Date.now() - start < timeout) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (this.activeTasks.size > 0) {
            this.logger.warn(`Agent ${this.type} shutdown with ${this.activeTasks.size} active tasks`);
        }
    }
}

export default AgentAPIClient;

