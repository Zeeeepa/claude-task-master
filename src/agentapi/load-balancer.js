/**
 * Load Balancer for WSL2 Instance Management
 * 
 * Implements intelligent load balancing algorithms to distribute
 * tasks across available WSL2 instances efficiently.
 */

import { SimpleLogger } from '../ai_cicd_system/utils/simple_logger.js';

export class LoadBalancer {
  constructor(config = {}) {
    this.config = {
      algorithm: config.algorithm || 'weighted_round_robin', // round_robin, least_connections, weighted_round_robin, resource_based
      weights: config.weights || {},
      healthCheckEnabled: config.healthCheckEnabled !== false,
      resourceThresholds: {
        maxCpuUsage: config.resourceThresholds?.maxCpuUsage || 80,
        maxMemoryUsage: config.resourceThresholds?.maxMemoryUsage || 85,
        ...config.resourceThresholds
      },
      ...config
    };

    this.logger = new SimpleLogger('LoadBalancer');
    this.roundRobinIndex = 0;
    this.connectionCounts = new Map();
    this.instanceMetrics = new Map();
    this.lastSelected = new Map();
  }

  /**
   * Select the best instance for a task
   * @param {Array} availableInstanceIds - List of available instance IDs
   * @param {Array} instances - Full instance objects
   * @param {Object} taskRequirements - Task resource requirements
   * @returns {string} Selected instance ID
   */
  selectInstance(availableInstanceIds, instances, taskRequirements = {}) {
    if (!availableInstanceIds || availableInstanceIds.length === 0) {
      throw new Error('No available instances for load balancing');
    }

    // Filter healthy instances if health check is enabled
    let candidateIds = availableInstanceIds;
    if (this.config.healthCheckEnabled) {
      candidateIds = this._filterHealthyInstances(availableInstanceIds, instances);
      
      if (candidateIds.length === 0) {
        this.logger.warn('No healthy instances available, falling back to all available instances');
        candidateIds = availableInstanceIds;
      }
    }

    // Filter instances that meet resource requirements
    candidateIds = this._filterByResourceRequirements(candidateIds, instances, taskRequirements);
    
    if (candidateIds.length === 0) {
      this.logger.warn('No instances meet resource requirements, using least loaded instance');
      candidateIds = availableInstanceIds;
    }

    // Select instance based on configured algorithm
    let selectedId;
    switch (this.config.algorithm) {
      case 'round_robin':
        selectedId = this._roundRobinSelection(candidateIds);
        break;
      case 'least_connections':
        selectedId = this._leastConnectionsSelection(candidateIds, instances);
        break;
      case 'weighted_round_robin':
        selectedId = this._weightedRoundRobinSelection(candidateIds, instances);
        break;
      case 'resource_based':
        selectedId = this._resourceBasedSelection(candidateIds, instances);
        break;
      default:
        this.logger.warn(`Unknown algorithm: ${this.config.algorithm}, falling back to round robin`);
        selectedId = this._roundRobinSelection(candidateIds);
    }

    // Update selection tracking
    this._updateSelectionMetrics(selectedId);

    this.logger.debug(`Instance selected: ${selectedId}`, {
      algorithm: this.config.algorithm,
      candidateCount: candidateIds.length,
      selectedId
    });

    return selectedId;
  }

  /**
   * Round robin selection
   * @param {Array} instanceIds - Available instance IDs
   * @returns {string} Selected instance ID
   */
  _roundRobinSelection(instanceIds) {
    if (this.roundRobinIndex >= instanceIds.length) {
      this.roundRobinIndex = 0;
    }
    
    const selected = instanceIds[this.roundRobinIndex];
    this.roundRobinIndex++;
    
    return selected;
  }

  /**
   * Least connections selection
   * @param {Array} instanceIds - Available instance IDs
   * @param {Array} instances - Instance objects
   * @returns {string} Selected instance ID
   */
  _leastConnectionsSelection(instanceIds, instances) {
    let minConnections = Infinity;
    let selectedId = instanceIds[0];

    for (const instanceId of instanceIds) {
      const connections = this.connectionCounts.get(instanceId) || 0;
      
      if (connections < minConnections) {
        minConnections = connections;
        selectedId = instanceId;
      }
    }

    return selectedId;
  }

  /**
   * Weighted round robin selection
   * @param {Array} instanceIds - Available instance IDs
   * @param {Array} instances - Instance objects
   * @returns {string} Selected instance ID
   */
  _weightedRoundRobinSelection(instanceIds, instances) {
    // Calculate weights based on instance capabilities
    const weightedInstances = instanceIds.map(instanceId => {
      const instance = instances.find(i => i.id === instanceId);
      const configWeight = this.config.weights[instanceId] || 1;
      const resourceWeight = this._calculateResourceWeight(instance);
      const healthWeight = this._calculateHealthWeight(instance);
      
      return {
        id: instanceId,
        weight: configWeight * resourceWeight * healthWeight
      };
    });

    // Sort by weight (highest first)
    weightedInstances.sort((a, b) => b.weight - a.weight);

    // Select based on weighted probability
    const totalWeight = weightedInstances.reduce((sum, item) => sum + item.weight, 0);
    const random = Math.random() * totalWeight;
    
    let currentWeight = 0;
    for (const item of weightedInstances) {
      currentWeight += item.weight;
      if (random <= currentWeight) {
        return item.id;
      }
    }

    // Fallback to first instance
    return weightedInstances[0].id;
  }

  /**
   * Resource-based selection
   * @param {Array} instanceIds - Available instance IDs
   * @param {Array} instances - Instance objects
   * @returns {string} Selected instance ID
   */
  _resourceBasedSelection(instanceIds, instances) {
    let bestScore = -1;
    let selectedId = instanceIds[0];

    for (const instanceId of instanceIds) {
      const instance = instances.find(i => i.id === instanceId);
      const score = this._calculateResourceScore(instance);
      
      if (score > bestScore) {
        bestScore = score;
        selectedId = instanceId;
      }
    }

    return selectedId;
  }

  /**
   * Filter healthy instances
   * @param {Array} instanceIds - Instance IDs to filter
   * @param {Array} instances - Instance objects
   * @returns {Array} Healthy instance IDs
   */
  _filterHealthyInstances(instanceIds, instances) {
    return instanceIds.filter(instanceId => {
      const instance = instances.find(i => i.id === instanceId);
      return instance && instance.health === 'healthy';
    });
  }

  /**
   * Filter instances by resource requirements
   * @param {Array} instanceIds - Instance IDs to filter
   * @param {Array} instances - Instance objects
   * @param {Object} requirements - Resource requirements
   * @returns {Array} Filtered instance IDs
   */
  _filterByResourceRequirements(instanceIds, instances, requirements) {
    if (!requirements || Object.keys(requirements).length === 0) {
      return instanceIds;
    }

    return instanceIds.filter(instanceId => {
      const instance = instances.find(i => i.id === instanceId);
      if (!instance || !instance.resourceUsage) {
        return true; // Include if no resource data available
      }

      // Check CPU requirement
      if (requirements.minCpuAvailable) {
        const cpuAvailable = 100 - (instance.resourceUsage.cpu || 0);
        if (cpuAvailable < requirements.minCpuAvailable) {
          return false;
        }
      }

      // Check memory requirement
      if (requirements.minMemoryAvailable) {
        const memoryAvailable = 100 - (instance.resourceUsage.memory || 0);
        if (memoryAvailable < requirements.minMemoryAvailable) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Calculate resource weight for weighted selection
   * @param {Object} instance - Instance object
   * @returns {number} Resource weight (0-1)
   */
  _calculateResourceWeight(instance) {
    if (!instance || !instance.resourceUsage) {
      return 1; // Default weight if no resource data
    }

    const cpuAvailable = 100 - (instance.resourceUsage.cpu || 0);
    const memoryAvailable = 100 - (instance.resourceUsage.memory || 0);
    
    // Weight based on available resources (higher available = higher weight)
    const cpuWeight = Math.max(0, cpuAvailable / 100);
    const memoryWeight = Math.max(0, memoryAvailable / 100);
    
    return (cpuWeight + memoryWeight) / 2;
  }

  /**
   * Calculate health weight for weighted selection
   * @param {Object} instance - Instance object
   * @returns {number} Health weight (0-1)
   */
  _calculateHealthWeight(instance) {
    if (!instance) {
      return 0.5; // Default weight if no instance data
    }

    switch (instance.health) {
      case 'healthy':
        return 1.0;
      case 'warning':
        return 0.7;
      case 'unhealthy':
        return 0.1;
      default:
        return 0.5;
    }
  }

  /**
   * Calculate overall resource score for resource-based selection
   * @param {Object} instance - Instance object
   * @returns {number} Resource score (0-100)
   */
  _calculateResourceScore(instance) {
    if (!instance || !instance.resourceUsage) {
      return 50; // Default score if no resource data
    }

    const cpuAvailable = 100 - (instance.resourceUsage.cpu || 0);
    const memoryAvailable = 100 - (instance.resourceUsage.memory || 0);
    
    // Calculate base score from available resources
    let score = (cpuAvailable + memoryAvailable) / 2;
    
    // Apply health modifier
    const healthMultiplier = this._calculateHealthWeight(instance);
    score *= healthMultiplier;
    
    // Apply connection count penalty
    const connections = this.connectionCounts.get(instance.id) || 0;
    const connectionPenalty = Math.min(connections * 5, 30); // Max 30% penalty
    score -= connectionPenalty;
    
    // Apply recent usage penalty to encourage distribution
    const lastUsed = this.lastSelected.get(instance.id);
    if (lastUsed && (Date.now() - lastUsed) < 10000) { // Within last 10 seconds
      score *= 0.8; // 20% penalty for recent usage
    }
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Update selection metrics
   * @param {string} instanceId - Selected instance ID
   */
  _updateSelectionMetrics(instanceId) {
    // Update connection count
    const currentConnections = this.connectionCounts.get(instanceId) || 0;
    this.connectionCounts.set(instanceId, currentConnections + 1);
    
    // Update last selected time
    this.lastSelected.set(instanceId, Date.now());
    
    // Update instance metrics
    const metrics = this.instanceMetrics.get(instanceId) || {
      totalSelections: 0,
      lastSelected: null
    };
    
    metrics.totalSelections++;
    metrics.lastSelected = new Date().toISOString();
    
    this.instanceMetrics.set(instanceId, metrics);
  }

  /**
   * Notify that a task has completed on an instance
   * @param {string} instanceId - Instance ID
   */
  taskCompleted(instanceId) {
    const currentConnections = this.connectionCounts.get(instanceId) || 0;
    this.connectionCounts.set(instanceId, Math.max(0, currentConnections - 1));
    
    this.logger.debug(`Task completed on instance: ${instanceId}`, {
      instanceId,
      remainingConnections: this.connectionCounts.get(instanceId)
    });
  }

  /**
   * Update instance resource usage
   * @param {string} instanceId - Instance ID
   * @param {Object} resourceUsage - Current resource usage
   */
  updateResourceUsage(instanceId, resourceUsage) {
    const metrics = this.instanceMetrics.get(instanceId) || {};
    metrics.resourceUsage = {
      ...resourceUsage,
      lastUpdated: new Date().toISOString()
    };
    
    this.instanceMetrics.set(instanceId, metrics);
  }

  /**
   * Get load balancer statistics
   * @returns {Object} Statistics
   */
  getStatistics() {
    const totalSelections = Array.from(this.instanceMetrics.values())
      .reduce((sum, metrics) => sum + (metrics.totalSelections || 0), 0);
    
    const instanceStats = {};
    for (const [instanceId, metrics] of this.instanceMetrics.entries()) {
      instanceStats[instanceId] = {
        totalSelections: metrics.totalSelections || 0,
        currentConnections: this.connectionCounts.get(instanceId) || 0,
        lastSelected: metrics.lastSelected,
        selectionPercentage: totalSelections > 0 
          ? ((metrics.totalSelections || 0) / totalSelections * 100).toFixed(2)
          : '0.00'
      };
    }

    return {
      algorithm: this.config.algorithm,
      totalSelections,
      roundRobinIndex: this.roundRobinIndex,
      instanceStats,
      activeConnections: Array.from(this.connectionCounts.values())
        .reduce((sum, count) => sum + count, 0)
    };
  }

  /**
   * Reset load balancer state
   */
  reset() {
    this.roundRobinIndex = 0;
    this.connectionCounts.clear();
    this.instanceMetrics.clear();
    this.lastSelected.clear();
    
    this.logger.info('Load balancer state reset');
  }

  /**
   * Set instance weight for weighted algorithms
   * @param {string} instanceId - Instance ID
   * @param {number} weight - Weight value (default: 1)
   */
  setInstanceWeight(instanceId, weight) {
    this.config.weights[instanceId] = Math.max(0, weight);
    
    this.logger.info(`Instance weight updated: ${instanceId}`, {
      instanceId,
      weight: this.config.weights[instanceId]
    });
  }

  /**
   * Remove instance from load balancer tracking
   * @param {string} instanceId - Instance ID to remove
   */
  removeInstance(instanceId) {
    this.connectionCounts.delete(instanceId);
    this.instanceMetrics.delete(instanceId);
    this.lastSelected.delete(instanceId);
    delete this.config.weights[instanceId];
    
    this.logger.info(`Instance removed from load balancer: ${instanceId}`);
  }

  /**
   * Get current algorithm configuration
   * @returns {Object} Algorithm configuration
   */
  getConfiguration() {
    return {
      algorithm: this.config.algorithm,
      weights: { ...this.config.weights },
      healthCheckEnabled: this.config.healthCheckEnabled,
      resourceThresholds: { ...this.config.resourceThresholds }
    };
  }

  /**
   * Update algorithm configuration
   * @param {Object} newConfig - New configuration
   */
  updateConfiguration(newConfig) {
    this.config = {
      ...this.config,
      ...newConfig
    };
    
    this.logger.info('Load balancer configuration updated', {
      algorithm: this.config.algorithm,
      healthCheckEnabled: this.config.healthCheckEnabled
    });
  }
}

export default LoadBalancer;

