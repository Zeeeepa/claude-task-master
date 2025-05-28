/**
 * State Manager
 * 
 * Manages state tracking for agents, deployments, and task progress
 * Provides centralized state management and persistence
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';

export class StateManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.stateFile = options.stateFile || process.env.STATE_FILE || '/tmp/agentapi-state.json';
    this.persistInterval = options.persistInterval || 30000; // 30 seconds
    this.maxHistoryEntries = options.maxHistoryEntries || 1000;
    
    this.state = {
      agents: new Map(),
      deployments: new Map(),
      workspaces: new Map(),
      tasks: new Map(),
      metrics: {
        totalDeployments: 0,
        successfulDeployments: 0,
        failedDeployments: 0,
        totalValidations: 0,
        successfulValidations: 0,
        failedValidations: 0,
        agentStartCount: 0,
        agentStopCount: 0,
      },
      history: [],
    };
    
    this.initialize();
  }

  async initialize() {
    try {
      await this.loadState();
      this.startPeriodicPersistence();
      this.emit('initialized');
    } catch (error) {
      console.error('Failed to initialize state manager:', error);
      this.emit('error', error);
    }
  }

  async loadState() {
    try {
      const data = await fs.readFile(this.stateFile, 'utf8');
      const savedState = JSON.parse(data);
      
      // Convert Maps back from JSON
      if (savedState.agents) {
        this.state.agents = new Map(Object.entries(savedState.agents));
      }
      if (savedState.deployments) {
        this.state.deployments = new Map(Object.entries(savedState.deployments));
      }
      if (savedState.workspaces) {
        this.state.workspaces = new Map(Object.entries(savedState.workspaces));
      }
      if (savedState.tasks) {
        this.state.tasks = new Map(Object.entries(savedState.tasks));
      }
      if (savedState.metrics) {
        this.state.metrics = { ...this.state.metrics, ...savedState.metrics };
      }
      if (savedState.history) {
        this.state.history = savedState.history;
      }
      
      console.log('State loaded successfully');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Error loading state:', error);
      }
      // If file doesn't exist, start with empty state
    }
  }

  async saveState() {
    try {
      const stateToSave = {
        agents: Object.fromEntries(this.state.agents),
        deployments: Object.fromEntries(this.state.deployments),
        workspaces: Object.fromEntries(this.state.workspaces),
        tasks: Object.fromEntries(this.state.tasks),
        metrics: this.state.metrics,
        history: this.state.history.slice(-this.maxHistoryEntries), // Keep only recent history
        lastSaved: new Date().toISOString(),
      };
      
      await fs.writeFile(this.stateFile, JSON.stringify(stateToSave, null, 2));
    } catch (error) {
      console.error('Error saving state:', error);
      this.emit('error', error);
    }
  }

  startPeriodicPersistence() {
    this.persistTimer = setInterval(() => {
      this.saveState();
    }, this.persistInterval);
  }

  stopPeriodicPersistence() {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = null;
    }
  }

  // Agent State Management
  trackAgent(agentId, agentData) {
    this.state.agents.set(agentId, {
      ...agentData,
      lastUpdated: new Date().toISOString(),
    });
    
    this.addHistoryEntry('agent_tracked', { agentId, agentData });
    this.state.metrics.agentStartCount++;
    this.emit('agentTracked', { agentId, agentData });
  }

  updateAgentStatus(agentId, status, metadata = {}) {
    const agent = this.state.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const updatedAgent = {
      ...agent,
      status,
      ...metadata,
      lastUpdated: new Date().toISOString(),
    };

    this.state.agents.set(agentId, updatedAgent);
    this.addHistoryEntry('agent_status_updated', { agentId, status, metadata });
    this.emit('agentStatusUpdated', { agentId, status, metadata });
  }

  removeAgent(agentId) {
    const agent = this.state.agents.get(agentId);
    if (agent) {
      this.state.agents.delete(agentId);
      this.addHistoryEntry('agent_removed', { agentId, agent });
      this.state.metrics.agentStopCount++;
      this.emit('agentRemoved', { agentId });
    }
  }

  getAgent(agentId) {
    return this.state.agents.get(agentId);
  }

  getAllAgentStatuses() {
    const statuses = {};
    for (const [agentId, agent] of this.state.agents) {
      statuses[agentId] = {
        id: agentId,
        type: agent.type,
        status: agent.status,
        workspaceId: agent.workspaceId,
        lastUpdated: agent.lastUpdated,
      };
    }
    return statuses;
  }

  // Deployment State Management
  trackDeployment(deployment) {
    this.state.deployments.set(deployment.id, {
      ...deployment,
      trackedAt: new Date().toISOString(),
    });
    
    this.addHistoryEntry('deployment_tracked', { deploymentId: deployment.id, deployment });
    this.state.metrics.totalDeployments++;
    this.emit('deploymentTracked', deployment);
  }

  updateDeploymentStatus(deploymentId, status, metadata = {}) {
    const deployment = this.state.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    const updatedDeployment = {
      ...deployment,
      status,
      ...metadata,
      lastUpdated: new Date().toISOString(),
    };

    this.state.deployments.set(deploymentId, updatedDeployment);
    this.addHistoryEntry('deployment_status_updated', { deploymentId, status, metadata });
    
    // Update metrics
    if (status === 'deployed') {
      this.state.metrics.successfulDeployments++;
    } else if (status === 'failed') {
      this.state.metrics.failedDeployments++;
    }
    
    this.emit('deploymentStatusUpdated', { deploymentId, status, metadata });
  }

  getDeployment(deploymentId) {
    return this.state.deployments.get(deploymentId);
  }

  getDeploymentsByWorkspace(workspaceId) {
    const deployments = [];
    for (const [id, deployment] of this.state.deployments) {
      if (deployment.workspaceId === workspaceId) {
        deployments.push(deployment);
      }
    }
    return deployments;
  }

  // Workspace State Management
  trackWorkspace(workspace) {
    this.state.workspaces.set(workspace.id, {
      ...workspace,
      trackedAt: new Date().toISOString(),
    });
    
    this.addHistoryEntry('workspace_tracked', { workspaceId: workspace.id, workspace });
    this.emit('workspaceTracked', workspace);
  }

  updateWorkspaceStatus(workspaceId, status, metadata = {}) {
    const workspace = this.state.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const updatedWorkspace = {
      ...workspace,
      status,
      ...metadata,
      lastUpdated: new Date().toISOString(),
    };

    this.state.workspaces.set(workspaceId, updatedWorkspace);
    this.addHistoryEntry('workspace_status_updated', { workspaceId, status, metadata });
    this.emit('workspaceStatusUpdated', { workspaceId, status, metadata });
  }

  removeWorkspace(workspaceId) {
    const workspace = this.state.workspaces.get(workspaceId);
    if (workspace) {
      this.state.workspaces.delete(workspaceId);
      this.addHistoryEntry('workspace_removed', { workspaceId, workspace });
      this.emit('workspaceRemoved', { workspaceId });
    }
  }

  getWorkspace(workspaceId) {
    return this.state.workspaces.get(workspaceId);
  }

  getActiveWorkspaces() {
    const activeWorkspaces = [];
    for (const [id, workspace] of this.state.workspaces) {
      if (workspace.status === 'active') {
        activeWorkspaces.push(workspace);
      }
    }
    return activeWorkspaces;
  }

  // Task Progress Management
  trackTask(taskId, taskData) {
    this.state.tasks.set(taskId, {
      ...taskData,
      trackedAt: new Date().toISOString(),
      progress: 0,
      status: 'pending',
    });
    
    this.addHistoryEntry('task_tracked', { taskId, taskData });
    this.emit('taskTracked', { taskId, taskData });
  }

  updateTaskProgress(taskId, progress, metadata = {}) {
    const task = this.state.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const updatedTask = {
      ...task,
      progress: Math.max(0, Math.min(100, progress)), // Clamp between 0-100
      ...metadata,
      lastUpdated: new Date().toISOString(),
    };

    this.state.tasks.set(taskId, updatedTask);
    this.addHistoryEntry('task_progress_updated', { taskId, progress, metadata });
    this.emit('taskProgressUpdated', { taskId, progress, metadata });
  }

  completeTask(taskId, result = {}) {
    const task = this.state.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const completedTask = {
      ...task,
      status: 'completed',
      progress: 100,
      result,
      completedAt: new Date().toISOString(),
    };

    this.state.tasks.set(taskId, completedTask);
    this.addHistoryEntry('task_completed', { taskId, result });
    this.emit('taskCompleted', { taskId, result });
  }

  failTask(taskId, error) {
    const task = this.state.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const failedTask = {
      ...task,
      status: 'failed',
      error: error.message || error,
      failedAt: new Date().toISOString(),
    };

    this.state.tasks.set(taskId, failedTask);
    this.addHistoryEntry('task_failed', { taskId, error });
    this.emit('taskFailed', { taskId, error });
  }

  getTask(taskId) {
    return this.state.tasks.get(taskId);
  }

  getTaskProgress(workspaceId) {
    const tasks = [];
    for (const [id, task] of this.state.tasks) {
      if (!workspaceId || task.workspaceId === workspaceId) {
        tasks.push({
          id,
          ...task,
        });
      }
    }
    return tasks;
  }

  // Validation State Management
  trackValidation(validationId, validationData) {
    this.addHistoryEntry('validation_tracked', { validationId, validationData });
    this.state.metrics.totalValidations++;
    this.emit('validationTracked', { validationId, validationData });
  }

  updateValidationStatus(validationId, status, result = {}) {
    this.addHistoryEntry('validation_status_updated', { validationId, status, result });
    
    // Update metrics
    if (status === 'passed') {
      this.state.metrics.successfulValidations++;
    } else if (status === 'failed') {
      this.state.metrics.failedValidations++;
    }
    
    this.emit('validationStatusUpdated', { validationId, status, result });
  }

  // History and Metrics
  addHistoryEntry(event, data) {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      event,
      data,
    };
    
    this.state.history.push(entry);
    
    // Keep history size manageable
    if (this.state.history.length > this.maxHistoryEntries) {
      this.state.history = this.state.history.slice(-this.maxHistoryEntries);
    }
    
    this.emit('historyEntryAdded', entry);
  }

  getHistory(limit = 100, filter = null) {
    let history = [...this.state.history];
    
    if (filter) {
      history = history.filter(entry => {
        if (filter.event && entry.event !== filter.event) return false;
        if (filter.workspaceId && entry.data.workspaceId !== filter.workspaceId) return false;
        if (filter.agentId && entry.data.agentId !== filter.agentId) return false;
        if (filter.since && new Date(entry.timestamp) < new Date(filter.since)) return false;
        return true;
      });
    }
    
    return history.slice(-limit).reverse(); // Most recent first
  }

  getMetrics() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Calculate recent activity
    const recentHistory = this.state.history.filter(entry => 
      new Date(entry.timestamp) > oneHourAgo
    );
    
    const dailyHistory = this.state.history.filter(entry => 
      new Date(entry.timestamp) > oneDayAgo
    );

    return {
      ...this.state.metrics,
      activeAgents: this.state.agents.size,
      activeWorkspaces: this.getActiveWorkspaces().length,
      activeTasks: Array.from(this.state.tasks.values()).filter(task => 
        task.status === 'running' || task.status === 'pending'
      ).length,
      recentActivity: {
        lastHour: recentHistory.length,
        lastDay: dailyHistory.length,
      },
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    };
  }

  // Cleanup and maintenance
  async cleanup(options = {}) {
    const {
      removeOldHistory = true,
      removeCompletedTasks = true,
      removeInactiveWorkspaces = true,
      maxAge = 24 * 60 * 60 * 1000, // 24 hours
    } = options;

    const cutoffTime = new Date(Date.now() - maxAge);
    let cleanedCount = 0;

    if (removeOldHistory) {
      const originalLength = this.state.history.length;
      this.state.history = this.state.history.filter(entry => 
        new Date(entry.timestamp) > cutoffTime
      );
      cleanedCount += originalLength - this.state.history.length;
    }

    if (removeCompletedTasks) {
      for (const [taskId, task] of this.state.tasks) {
        if ((task.status === 'completed' || task.status === 'failed') &&
            new Date(task.lastUpdated || task.trackedAt) < cutoffTime) {
          this.state.tasks.delete(taskId);
          cleanedCount++;
        }
      }
    }

    if (removeInactiveWorkspaces) {
      for (const [workspaceId, workspace] of this.state.workspaces) {
        if (workspace.status !== 'active' &&
            new Date(workspace.lastUpdated || workspace.trackedAt) < cutoffTime) {
          this.state.workspaces.delete(workspaceId);
          cleanedCount++;
        }
      }
    }

    if (cleanedCount > 0) {
      await this.saveState();
      this.emit('cleanupCompleted', { cleanedCount });
    }

    return { cleanedCount };
  }

  // Shutdown
  async shutdown() {
    this.stopPeriodicPersistence();
    await this.saveState();
    this.emit('shutdown');
  }
}

