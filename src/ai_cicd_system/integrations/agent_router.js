/**
 * Agent Router
 * 
 * Intelligent routing system that selects the best agent for each task
 * based on capabilities, availability, and performance metrics.
 */

import { SimpleLogger } from '../utils/simple_logger.js';
import { getAgentsByCapability, AGENTAPI_CONFIG } from '../config/agentapi_config.js';

export class AgentRouter {
    constructor(config = {}, healthMonitor = null) {
        this.config = {
            ...AGENTAPI_CONFIG.routing_config,
            ...config
        };
        
        this.logger = new SimpleLogger('AgentRouter');
        this.healthMonitor = healthMonitor;
        this.routingMetrics = new Map();
        this.loadBalancer = new LoadBalancer(this.config);
        
        // Initialize routing metrics for each agent
        for (const agentType of Object.keys(AGENTAPI_CONFIG.agents)) {
            this.routingMetrics.set(agentType, {
                totalRequests: 0,
                successfulRequests: 0,
                failedRequests: 0,
                averageResponseTime: 0,
                lastUsed: 0,
                currentLoad: 0
            });
        }
    }

    /**
     * Select the best agent for a given task
     */
    async selectAgent(task) {
        try {
            this.logger.debug(`Selecting agent for task: ${task.task_id}`, {
                taskType: task.task_type,
                requirements: task.requirements
            });

            // Extract required capabilities from task
            const requiredCapabilities = this.extractCapabilities(task);
            
            // Get agents that have the required capabilities
            const capableAgents = this._getCapableAgents(requiredCapabilities);
            
            if (capableAgents.length === 0) {
                throw new Error(`No agents available with required capabilities: ${requiredCapabilities.join(', ')}`);
            }

            // Filter by health status
            const healthyAgents = await this._filterHealthyAgents(capableAgents);
            
            if (healthyAgents.length === 0) {
                throw new Error(`No healthy agents available with required capabilities: ${requiredCapabilities.join(', ')}`);
            }

            // Apply routing strategy
            const selectedAgent = await this._applyRoutingStrategy(healthyAgents, task);
            
            this.logger.info(`Selected agent: ${selectedAgent.type}`, {
                taskId: task.task_id,
                agentType: selectedAgent.type,
                capabilities: requiredCapabilities,
                strategy: this.config.strategy
            });

            // Update metrics
            this._updateRoutingMetrics(selectedAgent.type, 'selected');
            
            return selectedAgent;

        } catch (error) {
            this.logger.error('Agent selection failed:', error);
            throw error;
        }
    }

    /**
     * Extract required capabilities from task
     */
    extractCapabilities(task) {
        const capabilities = [];
        
        // Primary capability based on task type
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
                capabilities.push('refactoring');
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
            case 'file_management':
                capabilities.push('file_management');
                break;
            case 'git_operations':
                capabilities.push('git_operations');
                break;
            default:
                // Default to code analysis for unknown task types
                capabilities.push('code_analysis');
        }

        // Additional capabilities based on task requirements
        if (task.requirements) {
            for (const requirement of task.requirements) {
                switch (requirement) {
                    case 'deploy':
                        capabilities.push('pr_deployment');
                        break;
                    case 'validate':
                        capabilities.push('code_validation');
                        break;
                    case 'test':
                        capabilities.push('testing');
                        break;
                    case 'analyze':
                        capabilities.push('code_analysis');
                        break;
                    case 'edit':
                        capabilities.push('code_editing');
                        break;
                    case 'generate':
                        capabilities.push('code_generation');
                        break;
                    case 'document':
                        capabilities.push('documentation');
                        break;
                    case 'optimize':
                        capabilities.push('optimization');
                        break;
                    case 'refactor':
                        capabilities.push('refactoring');
                        break;
                    case 'debug':
                        capabilities.push('error_debugging');
                        break;
                }
            }
        }

        // Context-based capabilities
        if (task.context) {
            if (task.context.git_operations || task.context.repository) {
                capabilities.push('git_operations');
            }
            
            if (task.context.file_operations || task.context.files) {
                capabilities.push('file_management');
            }
            
            if (task.context.wsl2_required) {
                // Only Claude Code supports WSL2
                return ['pr_deployment', 'code_validation'];
            }
        }

        // Remove duplicates and return
        return [...new Set(capabilities)];
    }

    /**
     * Get agents that have the required capabilities
     */
    _getCapableAgents(requiredCapabilities) {
        const capableAgents = [];
        
        for (const [agentType, agentConfig] of Object.entries(AGENTAPI_CONFIG.agents)) {
            const hasAllCapabilities = requiredCapabilities.every(capability =>
                agentConfig.capabilities.includes(capability)
            );
            
            if (hasAllCapabilities) {
                capableAgents.push({
                    type: agentType,
                    ...agentConfig,
                    metrics: this.routingMetrics.get(agentType)
                });
            }
        }

        return capableAgents;
    }

    /**
     * Filter agents by health status
     */
    async _filterHealthyAgents(agents) {
        if (!this.healthMonitor) {
            // If no health monitor, assume all agents are healthy
            return agents;
        }

        const healthyAgents = [];
        
        for (const agent of agents) {
            try {
                const isHealthy = await this.healthMonitor.isAgentHealthy(agent.type);
                if (isHealthy) {
                    healthyAgents.push(agent);
                }
            } catch (error) {
                this.logger.warn(`Health check failed for agent ${agent.type}:`, error);
                // Continue without this agent
            }
        }

        return healthyAgents;
    }

    /**
     * Apply routing strategy to select the best agent
     */
    async _applyRoutingStrategy(agents, task) {
        switch (this.config.strategy) {
            case 'round_robin':
                return this._roundRobinSelection(agents);
            
            case 'least_loaded':
                return this._leastLoadedSelection(agents);
            
            case 'capability_priority':
                return this._capabilityPrioritySelection(agents, task);
            
            case 'performance_based':
                return this._performanceBasedSelection(agents);
            
            case 'weighted_round_robin':
                return this._weightedRoundRobinSelection(agents);
            
            default:
                return this._capabilityPrioritySelection(agents, task);
        }
    }

    /**
     * Round robin selection
     */
    _roundRobinSelection(agents) {
        // Sort by last used time
        agents.sort((a, b) => a.metrics.lastUsed - b.metrics.lastUsed);
        return agents[0];
    }

    /**
     * Least loaded selection
     */
    _leastLoadedSelection(agents) {
        // Sort by current load, then by priority
        agents.sort((a, b) => {
            if (a.metrics.currentLoad !== b.metrics.currentLoad) {
                return a.metrics.currentLoad - b.metrics.currentLoad;
            }
            return a.priority - b.priority;
        });
        return agents[0];
    }

    /**
     * Capability priority selection (default)
     */
    _capabilityPrioritySelection(agents, task) {
        // Calculate capability match score for each agent
        const requiredCapabilities = this.extractCapabilities(task);
        
        agents.forEach(agent => {
            // Base score from priority (lower priority = higher score)
            agent.score = 100 - agent.priority;
            
            // Bonus for exact capability matches
            const exactMatches = agent.capabilities.filter(cap => 
                requiredCapabilities.includes(cap)
            ).length;
            agent.score += exactMatches * 10;
            
            // Penalty for high load
            agent.score -= agent.metrics.currentLoad * 5;
            
            // Bonus for good performance
            if (agent.metrics.totalRequests > 0) {
                const successRate = agent.metrics.successfulRequests / agent.metrics.totalRequests;
                agent.score += successRate * 20;
                
                // Bonus for fast response times (inverse relationship)
                if (agent.metrics.averageResponseTime > 0) {
                    agent.score += Math.max(0, 10 - (agent.metrics.averageResponseTime / 1000));
                }
            }
            
            // Special bonuses for specific task types
            if (task.task_type === 'pr_deployment' && agent.wsl2_instance) {
                agent.score += 50; // Strong preference for WSL2 capable agents
            }
        });

        // Sort by score (highest first)
        agents.sort((a, b) => b.score - a.score);
        
        this.logger.debug('Agent scoring results:', {
            agents: agents.map(a => ({
                type: a.type,
                score: a.score,
                priority: a.priority,
                load: a.metrics.currentLoad
            }))
        });

        return agents[0];
    }

    /**
     * Performance-based selection
     */
    _performanceBasedSelection(agents) {
        // Sort by success rate and response time
        agents.sort((a, b) => {
            const aSuccessRate = a.metrics.totalRequests > 0 ? 
                a.metrics.successfulRequests / a.metrics.totalRequests : 0;
            const bSuccessRate = b.metrics.totalRequests > 0 ? 
                b.metrics.successfulRequests / b.metrics.totalRequests : 0;
            
            if (aSuccessRate !== bSuccessRate) {
                return bSuccessRate - aSuccessRate; // Higher success rate first
            }
            
            return a.metrics.averageResponseTime - b.metrics.averageResponseTime; // Faster first
        });
        
        return agents[0];
    }

    /**
     * Weighted round robin selection
     */
    _weightedRoundRobinSelection(agents) {
        // Calculate weights based on priority and performance
        agents.forEach(agent => {
            const baseWeight = 10 - agent.priority; // Higher priority = higher weight
            const performanceWeight = agent.metrics.totalRequests > 0 ?
                (agent.metrics.successfulRequests / agent.metrics.totalRequests) * 5 : 2.5;
            const loadPenalty = agent.metrics.currentLoad * 0.5;
            
            agent.weight = Math.max(1, baseWeight + performanceWeight - loadPenalty);
        });

        // Weighted random selection
        const totalWeight = agents.reduce((sum, agent) => sum + agent.weight, 0);
        let random = Math.random() * totalWeight;
        
        for (const agent of agents) {
            random -= agent.weight;
            if (random <= 0) {
                return agent;
            }
        }
        
        return agents[0]; // Fallback
    }

    /**
     * Update routing metrics
     */
    _updateRoutingMetrics(agentType, event, responseTime = null) {
        const metrics = this.routingMetrics.get(agentType);
        if (!metrics) return;

        switch (event) {
            case 'selected':
                metrics.totalRequests++;
                metrics.lastUsed = Date.now();
                metrics.currentLoad++;
                break;
            
            case 'success':
                metrics.successfulRequests++;
                metrics.currentLoad = Math.max(0, metrics.currentLoad - 1);
                if (responseTime) {
                    this._updateAverageResponseTime(metrics, responseTime);
                }
                break;
            
            case 'failure':
                metrics.failedRequests++;
                metrics.currentLoad = Math.max(0, metrics.currentLoad - 1);
                break;
        }
    }

    /**
     * Update average response time using exponential moving average
     */
    _updateAverageResponseTime(metrics, responseTime) {
        const alpha = 0.1; // Smoothing factor
        if (metrics.averageResponseTime === 0) {
            metrics.averageResponseTime = responseTime;
        } else {
            metrics.averageResponseTime = 
                alpha * responseTime + (1 - alpha) * metrics.averageResponseTime;
        }
    }

    /**
     * Record successful task completion
     */
    recordSuccess(agentType, responseTime) {
        this._updateRoutingMetrics(agentType, 'success', responseTime);
    }

    /**
     * Record failed task
     */
    recordFailure(agentType) {
        this._updateRoutingMetrics(agentType, 'failure');
    }

    /**
     * Get routing statistics
     */
    getRoutingStats() {
        const stats = {};
        
        for (const [agentType, metrics] of this.routingMetrics.entries()) {
            stats[agentType] = {
                ...metrics,
                successRate: metrics.totalRequests > 0 ? 
                    metrics.successfulRequests / metrics.totalRequests : 0,
                failureRate: metrics.totalRequests > 0 ? 
                    metrics.failedRequests / metrics.totalRequests : 0
            };
        }

        return stats;
    }

    /**
     * Reset routing metrics
     */
    resetMetrics() {
        for (const metrics of this.routingMetrics.values()) {
            metrics.totalRequests = 0;
            metrics.successfulRequests = 0;
            metrics.failedRequests = 0;
            metrics.averageResponseTime = 0;
            metrics.lastUsed = 0;
            metrics.currentLoad = 0;
        }
    }

    /**
     * Get agent recommendations for a task
     */
    getAgentRecommendations(task, limit = 3) {
        const requiredCapabilities = this.extractCapabilities(task);
        const capableAgents = this._getCapableAgents(requiredCapabilities);
        
        // Score all capable agents
        capableAgents.forEach(agent => {
            agent.score = this._calculateAgentScore(agent, task);
        });

        // Sort by score and return top recommendations
        capableAgents.sort((a, b) => b.score - a.score);
        
        return capableAgents.slice(0, limit).map(agent => ({
            type: agent.type,
            score: agent.score,
            capabilities: agent.capabilities,
            priority: agent.priority,
            currentLoad: agent.metrics.currentLoad,
            recommendation: this._getRecommendationReason(agent, task)
        }));
    }

    /**
     * Calculate agent score for recommendations
     */
    _calculateAgentScore(agent, task) {
        let score = 100 - agent.priority; // Base score from priority
        
        // Capability matching bonus
        const requiredCapabilities = this.extractCapabilities(task);
        const matchingCapabilities = agent.capabilities.filter(cap => 
            requiredCapabilities.includes(cap)
        ).length;
        score += matchingCapabilities * 15;
        
        // Performance bonus
        if (agent.metrics.totalRequests > 0) {
            const successRate = agent.metrics.successfulRequests / agent.metrics.totalRequests;
            score += successRate * 25;
        }
        
        // Load penalty
        score -= agent.metrics.currentLoad * 10;
        
        // Special task type bonuses
        if (task.task_type === 'pr_deployment' && agent.wsl2_instance) {
            score += 30;
        }
        
        return Math.max(0, score);
    }

    /**
     * Get recommendation reason
     */
    _getRecommendationReason(agent, task) {
        const reasons = [];
        
        if (agent.priority === 1) {
            reasons.push('Highest priority agent');
        }
        
        if (agent.wsl2_instance && task.task_type === 'pr_deployment') {
            reasons.push('WSL2 support for PR deployment');
        }
        
        if (agent.metrics.currentLoad === 0) {
            reasons.push('Currently available');
        }
        
        if (agent.metrics.totalRequests > 0) {
            const successRate = agent.metrics.successfulRequests / agent.metrics.totalRequests;
            if (successRate > 0.9) {
                reasons.push('High success rate');
            }
        }
        
        return reasons.join(', ') || 'Good capability match';
    }
}

/**
 * Load Balancer utility class
 */
class LoadBalancer {
    constructor(config) {
        this.config = config;
        this.roundRobinCounters = new Map();
    }

    /**
     * Get next agent in round robin
     */
    getNextRoundRobin(agents) {
        if (agents.length === 0) return null;
        
        const key = agents.map(a => a.type).sort().join(',');
        let counter = this.roundRobinCounters.get(key) || 0;
        
        const selectedAgent = agents[counter % agents.length];
        this.roundRobinCounters.set(key, counter + 1);
        
        return selectedAgent;
    }
}

export default AgentRouter;

