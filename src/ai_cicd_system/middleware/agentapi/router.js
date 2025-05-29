/**
 * Agent Router - Consolidated Implementation
 * 
 * Intelligent routing system that selects the best agent for each task
 * based on capabilities, load, and performance metrics.
 */

import { SimpleLogger } from '../../utils/simple_logger.js';

export class AgentRouter {
  constructor(config = {}, healthMonitor = null) {
    this.config = {
      strategy: config.strategy || 'capability_priority',
      enableFailover: config.enableFailover !== false,
      loadBalancing: config.loadBalancing || 'least_loaded',
      ...config
    };

    this.healthMonitor = healthMonitor;
    this.logger = new SimpleLogger('AgentRouter');

    // Agent capabilities and priorities
    this.agentCapabilities = this._initializeAgentCapabilities();
    this.agentPriorities = this._initializeAgentPriorities();
    
    // Performance tracking
    this.performanceMetrics = new Map();
    this.routingHistory = [];
  }

  /**
   * Select the best agent for a given task
   */
  async selectAgent(task, options = {}) {
    this.logger.debug('Selecting agent for task', {
      taskType: task.type,
      strategy: this.config.strategy,
      requirements: task.requirements
    });

    try {
      let selectedAgent;

      switch (this.config.strategy) {
        case 'capability_priority':
          selectedAgent = this._selectByCapabilityPriority(task);
          break;
        case 'round_robin':
          selectedAgent = this._selectByRoundRobin(task);
          break;
        case 'least_loaded':
          selectedAgent = this._selectByLeastLoaded(task);
          break;
        case 'performance_based':
          selectedAgent = this._selectByPerformance(task);
          break;
        default:
          selectedAgent = this._selectByCapabilityPriority(task);
      }

      // Apply failover if needed
      if (this.config.enableFailover && !this._isAgentAvailable(selectedAgent)) {
        selectedAgent = this._selectFailoverAgent(task, selectedAgent);
      }

      // Record routing decision
      this._recordRoutingDecision(task, selectedAgent);

      this.logger.info('Agent selected', {
        taskType: task.type,
        selectedAgent,
        strategy: this.config.strategy
      });

      return selectedAgent;

    } catch (error) {
      this.logger.error('Failed to select agent:', error);
      throw error;
    }
  }

  /**
   * Get agent recommendations for a task
   */
  getAgentRecommendations(task, limit = 3) {
    const recommendations = [];

    // Get all capable agents
    const capableAgents = this._getCapableAgents(task);

    // Score each agent
    for (const agentType of capableAgents) {
      const score = this._calculateAgentScore(agentType, task);
      const availability = this._getAgentAvailability(agentType);
      const performance = this._getAgentPerformance(agentType);

      recommendations.push({
        agentType,
        score,
        availability,
        performance,
        capabilities: this.agentCapabilities.get(agentType) || [],
        reason: this._getRecommendationReason(agentType, task)
      });
    }

    // Sort by score and return top recommendations
    return recommendations
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Update agent performance metrics
   */
  updateAgentPerformance(agentType, metrics) {
    if (!this.performanceMetrics.has(agentType)) {
      this.performanceMetrics.set(agentType, {
        responseTime: { total: 0, count: 0, average: 0 },
        successRate: { successful: 0, total: 0, rate: 100 },
        load: { current: 0, peak: 0 },
        lastUpdate: Date.now()
      });
    }

    const agentMetrics = this.performanceMetrics.get(agentType);

    // Update response time
    if (metrics.responseTime) {
      agentMetrics.responseTime.total += metrics.responseTime;
      agentMetrics.responseTime.count++;
      agentMetrics.responseTime.average = agentMetrics.responseTime.total / agentMetrics.responseTime.count;
    }

    // Update success rate
    if (metrics.success !== undefined) {
      agentMetrics.successRate.total++;
      if (metrics.success) {
        agentMetrics.successRate.successful++;
      }
      agentMetrics.successRate.rate = (agentMetrics.successRate.successful / agentMetrics.successRate.total) * 100;
    }

    // Update load
    if (metrics.load !== undefined) {
      agentMetrics.load.current = metrics.load;
      agentMetrics.load.peak = Math.max(agentMetrics.load.peak, metrics.load);
    }

    agentMetrics.lastUpdate = Date.now();
  }

  /**
   * Get routing statistics
   */
  getRoutingStatistics() {
    const stats = {
      totalRoutings: this.routingHistory.length,
      agentUsage: new Map(),
      strategyUsage: new Map(),
      averageDecisionTime: 0,
      failoverRate: 0
    };

    let totalDecisionTime = 0;
    let failoverCount = 0;

    for (const routing of this.routingHistory) {
      // Count agent usage
      const agentCount = stats.agentUsage.get(routing.selectedAgent) || 0;
      stats.agentUsage.set(routing.selectedAgent, agentCount + 1);

      // Count strategy usage
      const strategyCount = stats.strategyUsage.get(routing.strategy) || 0;
      stats.strategyUsage.set(routing.strategy, strategyCount + 1);

      // Calculate decision time
      totalDecisionTime += routing.decisionTime || 0;

      // Count failovers
      if (routing.failover) {
        failoverCount++;
      }
    }

    if (this.routingHistory.length > 0) {
      stats.averageDecisionTime = totalDecisionTime / this.routingHistory.length;
      stats.failoverRate = (failoverCount / this.routingHistory.length) * 100;
    }

    return stats;
  }

  /**
   * Get agent performance metrics
   */
  getAgentPerformanceMetrics() {
    const metrics = {};

    for (const [agentType, agentMetrics] of this.performanceMetrics) {
      metrics[agentType] = {
        ...agentMetrics,
        availability: this._getAgentAvailability(agentType),
        score: this._calculateAgentScore(agentType, null)
      };
    }

    return metrics;
  }

  // Private methods

  /**
   * Initialize agent capabilities
   */
  _initializeAgentCapabilities() {
    const capabilities = new Map();

    capabilities.set('claude', [
      'pr_deployment',
      'code_validation',
      'error_debugging',
      'code_review',
      'git_operations',
      'wsl2_deployment',
      'comprehensive_analysis'
    ]);

    capabilities.set('goose', [
      'code_generation',
      'refactoring',
      'optimization',
      'documentation',
      'feature_development',
      'multi_file_operations',
      'context_aware_generation'
    ]);

    capabilities.set('aider', [
      'code_editing',
      'file_management',
      'git_operations',
      'refactoring',
      'targeted_changes',
      'diff_context',
      'tree_sitter_integration'
    ]);

    capabilities.set('codex', [
      'code_completion',
      'documentation',
      'testing',
      'code_analysis',
      'quick_completion',
      'test_generation',
      'fast_analysis'
    ]);

    return capabilities;
  }

  /**
   * Initialize agent priorities
   */
  _initializeAgentPriorities() {
    const priorities = new Map();

    // Priority levels: 1 (highest) to 5 (lowest)
    priorities.set('claude', {
      pr_deployment: 1,
      code_validation: 1,
      error_debugging: 2,
      code_review: 2,
      default: 3
    });

    priorities.set('goose', {
      code_generation: 1,
      feature_development: 1,
      refactoring: 2,
      documentation: 2,
      default: 3
    });

    priorities.set('aider', {
      code_editing: 1,
      file_management: 1,
      targeted_changes: 1,
      refactoring: 2,
      default: 3
    });

    priorities.set('codex', {
      code_completion: 1,
      test_generation: 1,
      quick_analysis: 2,
      documentation: 3,
      default: 4
    });

    return priorities;
  }

  /**
   * Select agent by capability and priority
   */
  _selectByCapabilityPriority(task) {
    const taskType = task.type?.toLowerCase();
    const requirements = task.requirements || [];
    
    let bestAgent = null;
    let bestScore = -1;

    for (const [agentType, capabilities] of this.agentCapabilities) {
      if (!this._isAgentAvailable(agentType)) {
        continue;
      }

      const score = this._calculateCapabilityScore(agentType, taskType, requirements);
      
      if (score > bestScore) {
        bestScore = score;
        bestAgent = agentType;
      }
    }

    return bestAgent || 'claude'; // Default fallback
  }

  /**
   * Select agent using round robin
   */
  _selectByRoundRobin(task) {
    const capableAgents = this._getCapableAgents(task);
    const availableAgents = capableAgents.filter(agent => this._isAgentAvailable(agent));
    
    if (availableAgents.length === 0) {
      return 'claude'; // Default fallback
    }

    // Simple round robin based on routing history
    const lastUsed = this.routingHistory.length > 0 ? 
      this.routingHistory[this.routingHistory.length - 1].selectedAgent : null;
    
    if (!lastUsed || !availableAgents.includes(lastUsed)) {
      return availableAgents[0];
    }

    const currentIndex = availableAgents.indexOf(lastUsed);
    const nextIndex = (currentIndex + 1) % availableAgents.length;
    
    return availableAgents[nextIndex];
  }

  /**
   * Select agent with least load
   */
  _selectByLeastLoaded(task) {
    const capableAgents = this._getCapableAgents(task);
    
    let leastLoadedAgent = null;
    let lowestLoad = Infinity;

    for (const agentType of capableAgents) {
      if (!this._isAgentAvailable(agentType)) {
        continue;
      }

      const load = this._getAgentLoad(agentType);
      
      if (load < lowestLoad) {
        lowestLoad = load;
        leastLoadedAgent = agentType;
      }
    }

    return leastLoadedAgent || 'claude'; // Default fallback
  }

  /**
   * Select agent based on performance metrics
   */
  _selectByPerformance(task) {
    const capableAgents = this._getCapableAgents(task);
    
    let bestAgent = null;
    let bestPerformanceScore = -1;

    for (const agentType of capableAgents) {
      if (!this._isAgentAvailable(agentType)) {
        continue;
      }

      const performanceScore = this._calculatePerformanceScore(agentType);
      
      if (performanceScore > bestPerformanceScore) {
        bestPerformanceScore = performanceScore;
        bestAgent = agentType;
      }
    }

    return bestAgent || 'claude'; // Default fallback
  }

  /**
   * Select failover agent
   */
  _selectFailoverAgent(task, originalAgent) {
    this.logger.warn(`Selecting failover agent for ${originalAgent}`);
    
    const capableAgents = this._getCapableAgents(task);
    const availableAgents = capableAgents.filter(agent => 
      agent !== originalAgent && this._isAgentAvailable(agent)
    );

    if (availableAgents.length === 0) {
      this.logger.error('No failover agents available');
      return originalAgent; // Return original even if unavailable
    }

    // Select best available alternative
    return this._selectByCapabilityPriority({ ...task, type: task.type });
  }

  /**
   * Get agents capable of handling a task
   */
  _getCapableAgents(task) {
    const taskType = task.type?.toLowerCase();
    const requirements = task.requirements || [];
    const capableAgents = [];

    for (const [agentType, capabilities] of this.agentCapabilities) {
      if (this._canHandleTask(agentType, taskType, requirements)) {
        capableAgents.push(agentType);
      }
    }

    return capableAgents.length > 0 ? capableAgents : ['claude', 'goose', 'aider', 'codex'];
  }

  /**
   * Check if agent can handle a task
   */
  _canHandleTask(agentType, taskType, requirements) {
    const capabilities = this.agentCapabilities.get(agentType) || [];
    
    // Check task type match
    if (taskType) {
      const hasTaskTypeCapability = capabilities.some(capability => 
        taskType.includes(capability.replace('_', '')) || 
        capability.includes(taskType.replace('_', ''))
      );
      
      if (hasTaskTypeCapability) {
        return true;
      }
    }

    // Check requirements match
    if (requirements.length > 0) {
      const matchingRequirements = requirements.filter(req => 
        capabilities.some(capability => 
          req.toLowerCase().includes(capability.replace('_', '')) ||
          capability.includes(req.toLowerCase().replace('_', ''))
        )
      );
      
      return matchingRequirements.length > 0;
    }

    // Default: all agents can handle basic tasks
    return true;
  }

  /**
   * Calculate capability score for an agent
   */
  _calculateCapabilityScore(agentType, taskType, requirements) {
    const capabilities = this.agentCapabilities.get(agentType) || [];
    const priorities = this.agentPriorities.get(agentType) || {};
    
    let score = 0;

    // Score based on task type
    if (taskType) {
      const priority = priorities[taskType] || priorities.default || 5;
      const hasCapability = capabilities.some(capability => 
        taskType.includes(capability.replace('_', '')) || 
        capability.includes(taskType.replace('_', ''))
      );
      
      if (hasCapability) {
        score += (6 - priority) * 10; // Higher priority = higher score
      }
    }

    // Score based on requirements
    for (const requirement of requirements) {
      const hasCapability = capabilities.some(capability => 
        requirement.toLowerCase().includes(capability.replace('_', '')) ||
        capability.includes(requirement.toLowerCase().replace('_', ''))
      );
      
      if (hasCapability) {
        score += 5;
      }
    }

    return score;
  }

  /**
   * Calculate overall agent score
   */
  _calculateAgentScore(agentType, task) {
    let score = 0;

    // Base capability score
    if (task) {
      score += this._calculateCapabilityScore(agentType, task.type, task.requirements || []);
    }

    // Performance score
    score += this._calculatePerformanceScore(agentType) * 0.3;

    // Availability score
    const availability = this._getAgentAvailability(agentType);
    score += availability * 0.2;

    // Load score (inverse - lower load = higher score)
    const load = this._getAgentLoad(agentType);
    score += (100 - load) * 0.1;

    return score;
  }

  /**
   * Calculate performance score for an agent
   */
  _calculatePerformanceScore(agentType) {
    const metrics = this.performanceMetrics.get(agentType);
    if (!metrics) {
      return 50; // Default score
    }

    let score = 0;

    // Success rate score (0-40 points)
    score += (metrics.successRate.rate / 100) * 40;

    // Response time score (0-30 points, inverse)
    const maxResponseTime = 10000; // 10 seconds
    const responseTimeScore = Math.max(0, (maxResponseTime - metrics.responseTime.average) / maxResponseTime) * 30;
    score += responseTimeScore;

    // Load score (0-30 points, inverse)
    const loadScore = Math.max(0, (100 - metrics.load.current) / 100) * 30;
    score += loadScore;

    return Math.min(100, score);
  }

  /**
   * Check if agent is available
   */
  _isAgentAvailable(agentType) {
    if (this.healthMonitor) {
      return this.healthMonitor.isAgentHealthy(agentType);
    }
    
    // Default to available if no health monitor
    return true;
  }

  /**
   * Get agent availability percentage
   */
  _getAgentAvailability(agentType) {
    if (this.healthMonitor) {
      try {
        const health = this.healthMonitor.getAgentHealth(agentType);
        return health.metrics.availability || 100;
      } catch (error) {
        return 100; // Default if agent not registered
      }
    }
    
    return 100;
  }

  /**
   * Get agent load percentage
   */
  _getAgentLoad(agentType) {
    const metrics = this.performanceMetrics.get(agentType);
    return metrics ? metrics.load.current : 0;
  }

  /**
   * Get agent performance metrics
   */
  _getAgentPerformance(agentType) {
    const metrics = this.performanceMetrics.get(agentType);
    if (!metrics) {
      return {
        responseTime: 0,
        successRate: 100,
        load: 0
      };
    }

    return {
      responseTime: metrics.responseTime.average,
      successRate: metrics.successRate.rate,
      load: metrics.load.current
    };
  }

  /**
   * Get recommendation reason
   */
  _getRecommendationReason(agentType, task) {
    const capabilities = this.agentCapabilities.get(agentType) || [];
    const taskType = task.type?.toLowerCase();
    
    if (taskType && capabilities.some(cap => taskType.includes(cap.replace('_', '')))) {
      return `Specialized in ${taskType} tasks`;
    }
    
    if (task.requirements) {
      const matchingReqs = task.requirements.filter(req => 
        capabilities.some(cap => req.toLowerCase().includes(cap.replace('_', '')))
      );
      
      if (matchingReqs.length > 0) {
        return `Handles requirements: ${matchingReqs.join(', ')}`;
      }
    }
    
    return 'General purpose agent';
  }

  /**
   * Record routing decision
   */
  _recordRoutingDecision(task, selectedAgent) {
    const routing = {
      taskId: task.id,
      taskType: task.type,
      selectedAgent,
      strategy: this.config.strategy,
      timestamp: Date.now(),
      decisionTime: Date.now() - (task.startTime || Date.now()),
      failover: false // Will be updated if failover was used
    };

    this.routingHistory.push(routing);

    // Keep only last 1000 routing decisions
    if (this.routingHistory.length > 1000) {
      this.routingHistory.shift();
    }
  }
}

export default AgentRouter;

