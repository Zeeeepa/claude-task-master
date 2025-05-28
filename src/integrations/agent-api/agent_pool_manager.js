/**
 * Agent Pool Manager
 * 
 * Manages multiple AI agents (Claude Code, Goose, Aider, Codex) with load balancing,
 * agent selection, and concurrent processing capabilities.
 */

import EventEmitter from 'events';

export class AgentPoolManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      maxAgentsPerType: config.maxAgentsPerType || 3,
      agentStartupTimeout: config.agentStartupTimeout || 30000,
      loadBalancingStrategy: config.loadBalancingStrategy || 'round-robin', // round-robin, least-loaded, random
      healthCheckInterval: config.healthCheckInterval || 60000,
      ...config
    };

    // Agent pool state
    this.agents = new Map(); // agentId -> agent instance
    this.agentsByType = new Map(); // agentType -> Set of agentIds
    this.agentStatus = new Map(); // agentId -> status info
    this.loadBalancers = new Map(); // agentType -> load balancer state

    // Supported agent types
    this.supportedAgentTypes = ['claude', 'goose', 'aider', 'codex'];

    // Initialize agent type pools
    this._initializeAgentPools();
  }

  /**
   * Initialize the agent pool manager
   */
  async initialize() {
    try {
      console.log('🚀 Initializing Agent Pool Manager...');

      // Start health check monitoring
      this._startHealthChecking();

      console.log('✅ Agent Pool Manager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Agent Pool Manager:', error);
      throw error;
    }
  }

  /**
   * Get an available agent of the specified type
   */
  async getAvailableAgent(agentType) {
    try {
      if (!this.isAgentTypeSupported(agentType)) {
        throw new Error(`Unsupported agent type: ${agentType}`);
      }

      const agentIds = this.agentsByType.get(agentType) || new Set();
      
      // Find available agent using load balancing strategy
      const availableAgentId = this._selectAgent(agentType, agentIds);
      
      if (!availableAgentId) {
        // Try to start a new agent if under limit
        const newAgent = await this._startNewAgent(agentType);
        if (newAgent) {
          return newAgent;
        }
        return null;
      }

      const agent = this.agents.get(availableAgentId);
      if (agent && this._isAgentAvailable(availableAgentId)) {
        // Mark agent as busy
        this._updateAgentStatus(availableAgentId, { status: 'busy', lastUsed: Date.now() });
        return agent;
      }

      return null;
    } catch (error) {
      console.error('❌ Failed to get available agent:', error);
      throw error;
    }
  }

  /**
   * Release an agent back to the pool
   */
  async releaseAgent(agentId) {
    try {
      if (!this.agents.has(agentId)) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      // Mark agent as available
      this._updateAgentStatus(agentId, { 
        status: 'available', 
        lastReleased: Date.now(),
        sessionCount: (this.agentStatus.get(agentId)?.sessionCount || 1) - 1
      });

      console.log(`✅ Released agent ${agentId} back to pool`);
      this.emit('agentAvailable', this.agents.get(agentId));

      return true;
    } catch (error) {
      console.error('❌ Failed to release agent:', error);
      throw error;
    }
  }

  /**
   * Get status of a specific agent type or all agents
   */
  async getAgentStatus(agentType = null) {
    try {
      if (agentType) {
        if (!this.isAgentTypeSupported(agentType)) {
          throw new Error(`Unsupported agent type: ${agentType}`);
        }

        const agentIds = this.agentsByType.get(agentType) || new Set();
        const agents = Array.from(agentIds).map(id => ({
          id,
          type: agentType,
          ...this.agentStatus.get(id)
        }));

        return {
          type: agentType,
          total: agents.length,
          available: agents.filter(a => a.status === 'available').length,
          busy: agents.filter(a => a.status === 'busy').length,
          unhealthy: agents.filter(a => a.status === 'unhealthy').length,
          agents
        };
      } else {
        return await this.getAllAgentStatus();
      }
    } catch (error) {
      console.error('❌ Failed to get agent status:', error);
      throw error;
    }
  }

  /**
   * Get status of all agent types
   */
  async getAllAgentStatus() {
    const status = {};
    
    for (const agentType of this.supportedAgentTypes) {
      status[agentType] = await this.getAgentStatus(agentType);
    }

    return {
      summary: {
        totalAgents: Array.from(this.agents.keys()).length,
        availableAgents: Array.from(this.agentStatus.values()).filter(s => s.status === 'available').length,
        busyAgents: Array.from(this.agentStatus.values()).filter(s => s.status === 'busy').length,
        unhealthyAgents: Array.from(this.agentStatus.values()).filter(s => s.status === 'unhealthy').length
      },
      byType: status
    };
  }

  /**
   * Check if an agent type is supported
   */
  isAgentTypeSupported(agentType) {
    return this.supportedAgentTypes.includes(agentType);
  }

  /**
   * Add a new agent to the pool
   */
  async addAgent(agentType, agentConfig = {}) {
    try {
      if (!this.isAgentTypeSupported(agentType)) {
        throw new Error(`Unsupported agent type: ${agentType}`);
      }

      const agentId = this._generateAgentId(agentType);
      const agent = await this._createAgent(agentType, agentId, agentConfig);

      // Add to pool
      this.agents.set(agentId, agent);
      
      if (!this.agentsByType.has(agentType)) {
        this.agentsByType.set(agentType, new Set());
      }
      this.agentsByType.get(agentType).add(agentId);

      // Initialize status
      this._updateAgentStatus(agentId, {
        type: agentType,
        status: 'available',
        created: Date.now(),
        sessionCount: 0,
        totalSessions: 0,
        lastHealthCheck: Date.now(),
        config: agentConfig
      });

      console.log(`✅ Added agent ${agentId} of type ${agentType} to pool`);
      this.emit('agentAdded', agent);

      return agent;
    } catch (error) {
      console.error('❌ Failed to add agent to pool:', error);
      throw error;
    }
  }

  /**
   * Remove an agent from the pool
   */
  async removeAgent(agentId) {
    try {
      if (!this.agents.has(agentId)) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      const agent = this.agents.get(agentId);
      const status = this.agentStatus.get(agentId);

      // Stop agent if running
      if (agent.stop && typeof agent.stop === 'function') {
        await agent.stop();
      }

      // Remove from pools
      this.agents.delete(agentId);
      this.agentStatus.delete(agentId);

      if (status && status.type) {
        const typeSet = this.agentsByType.get(status.type);
        if (typeSet) {
          typeSet.delete(agentId);
        }
      }

      console.log(`✅ Removed agent ${agentId} from pool`);
      this.emit('agentRemoved', agentId);

      return true;
    } catch (error) {
      console.error('❌ Failed to remove agent from pool:', error);
      throw error;
    }
  }

  /**
   * Get metrics for the agent pool
   */
  async getMetrics() {
    const metrics = {
      totalAgents: this.agents.size,
      agentsByType: {},
      loadBalancing: {},
      performance: {
        averageSessionsPerAgent: 0,
        totalSessions: 0,
        agentUtilization: 0
      }
    };

    // Calculate metrics by type
    for (const agentType of this.supportedAgentTypes) {
      const agentIds = this.agentsByType.get(agentType) || new Set();
      const agents = Array.from(agentIds).map(id => this.agentStatus.get(id)).filter(Boolean);

      metrics.agentsByType[agentType] = {
        total: agents.length,
        available: agents.filter(a => a.status === 'available').length,
        busy: agents.filter(a => a.status === 'busy').length,
        unhealthy: agents.filter(a => a.status === 'unhealthy').length,
        totalSessions: agents.reduce((sum, a) => sum + (a.totalSessions || 0), 0),
        averageSessionsPerAgent: agents.length > 0 ? 
          agents.reduce((sum, a) => sum + (a.totalSessions || 0), 0) / agents.length : 0
      };

      // Load balancing metrics
      const loadBalancer = this.loadBalancers.get(agentType);
      if (loadBalancer) {
        metrics.loadBalancing[agentType] = {
          strategy: this.config.loadBalancingStrategy,
          lastSelection: loadBalancer.lastSelection,
          selectionCount: loadBalancer.selectionCount || 0
        };
      }
    }

    // Overall performance metrics
    const allAgents = Array.from(this.agentStatus.values());
    metrics.performance.totalSessions = allAgents.reduce((sum, a) => sum + (a.totalSessions || 0), 0);
    metrics.performance.averageSessionsPerAgent = allAgents.length > 0 ? 
      metrics.performance.totalSessions / allAgents.length : 0;
    metrics.performance.agentUtilization = allAgents.length > 0 ? 
      allAgents.filter(a => a.status === 'busy').length / allAgents.length : 0;

    return metrics;
  }

  /**
   * Shutdown the agent pool manager
   */
  async shutdown() {
    try {
      console.log('🔄 Shutting down Agent Pool Manager...');

      // Stop health checking
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }

      // Stop all agents
      const shutdownPromises = Array.from(this.agents.entries()).map(async ([agentId, agent]) => {
        try {
          if (agent.stop && typeof agent.stop === 'function') {
            await agent.stop();
          }
        } catch (error) {
          console.error(`❌ Error stopping agent ${agentId}:`, error);
        }
      });

      await Promise.allSettled(shutdownPromises);

      // Clear all pools
      this.agents.clear();
      this.agentsByType.clear();
      this.agentStatus.clear();
      this.loadBalancers.clear();

      console.log('✅ Agent Pool Manager shutdown complete');
      return true;
    } catch (error) {
      console.error('❌ Error during Agent Pool Manager shutdown:', error);
      throw error;
    }
  }

  // Private methods

  _initializeAgentPools() {
    for (const agentType of this.supportedAgentTypes) {
      this.agentsByType.set(agentType, new Set());
      this.loadBalancers.set(agentType, {
        strategy: this.config.loadBalancingStrategy,
        lastSelection: 0,
        selectionCount: 0
      });
    }
  }

  _selectAgent(agentType, agentIds) {
    const availableAgents = Array.from(agentIds).filter(id => this._isAgentAvailable(id));
    
    if (availableAgents.length === 0) {
      return null;
    }

    const loadBalancer = this.loadBalancers.get(agentType);
    let selectedAgent;

    switch (this.config.loadBalancingStrategy) {
      case 'round-robin':
        selectedAgent = availableAgents[loadBalancer.lastSelection % availableAgents.length];
        loadBalancer.lastSelection = (loadBalancer.lastSelection + 1) % availableAgents.length;
        break;

      case 'least-loaded':
        selectedAgent = availableAgents.reduce((least, current) => {
          const leastSessions = this.agentStatus.get(least)?.sessionCount || 0;
          const currentSessions = this.agentStatus.get(current)?.sessionCount || 0;
          return currentSessions < leastSessions ? current : least;
        });
        break;

      case 'random':
        selectedAgent = availableAgents[Math.floor(Math.random() * availableAgents.length)];
        break;

      default:
        selectedAgent = availableAgents[0];
    }

    loadBalancer.selectionCount++;
    return selectedAgent;
  }

  _isAgentAvailable(agentId) {
    const status = this.agentStatus.get(agentId);
    return status && status.status === 'available';
  }

  async _startNewAgent(agentType) {
    const currentCount = (this.agentsByType.get(agentType) || new Set()).size;
    
    if (currentCount >= this.config.maxAgentsPerType) {
      console.warn(`⚠️ Maximum agents reached for type ${agentType} (${currentCount}/${this.config.maxAgentsPerType})`);
      return null;
    }

    try {
      return await this.addAgent(agentType);
    } catch (error) {
      console.error(`❌ Failed to start new agent of type ${agentType}:`, error);
      return null;
    }
  }

  async _createAgent(agentType, agentId, config) {
    // This is a mock implementation - in a real scenario, this would
    // interface with the actual agent processes or containers
    return {
      id: agentId,
      type: agentType,
      config,
      start: async () => {
        console.log(`🚀 Starting agent ${agentId} of type ${agentType}`);
        // Agent startup logic would go here
        return true;
      },
      stop: async () => {
        console.log(`🛑 Stopping agent ${agentId} of type ${agentType}`);
        // Agent shutdown logic would go here
        return true;
      },
      isHealthy: async () => {
        // Health check logic would go here
        return true;
      }
    };
  }

  _generateAgentId(agentType) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${agentType}-${timestamp}-${random}`;
  }

  _updateAgentStatus(agentId, updates) {
    const currentStatus = this.agentStatus.get(agentId) || {};
    this.agentStatus.set(agentId, { ...currentStatus, ...updates });
  }

  _startHealthChecking() {
    this.healthCheckInterval = setInterval(async () => {
      await this._performHealthChecks();
    }, this.config.healthCheckInterval);
  }

  async _performHealthChecks() {
    const healthCheckPromises = Array.from(this.agents.entries()).map(async ([agentId, agent]) => {
      try {
        const isHealthy = await agent.isHealthy();
        const currentStatus = this.agentStatus.get(agentId);
        
        if (!isHealthy && currentStatus?.status !== 'unhealthy') {
          this._updateAgentStatus(agentId, { 
            status: 'unhealthy', 
            lastHealthCheck: Date.now(),
            healthCheckFailures: (currentStatus?.healthCheckFailures || 0) + 1
          });
          this.emit('agentUnhealthy', agent);
        } else if (isHealthy && currentStatus?.status === 'unhealthy') {
          this._updateAgentStatus(agentId, { 
            status: 'available', 
            lastHealthCheck: Date.now(),
            healthCheckFailures: 0
          });
          this.emit('agentHealthy', agent);
        } else {
          this._updateAgentStatus(agentId, { lastHealthCheck: Date.now() });
        }
      } catch (error) {
        console.error(`❌ Health check failed for agent ${agentId}:`, error);
        this._updateAgentStatus(agentId, { 
          status: 'unhealthy', 
          lastHealthCheck: Date.now(),
          lastError: error.message
        });
      }
    });

    await Promise.allSettled(healthCheckPromises);
  }
}

export default AgentPoolManager;

