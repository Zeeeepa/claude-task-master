/**
 * Agent Manager - Consolidated Implementation
 * 
 * Central orchestrator for agent lifecycle, task execution, and resource management.
 * Consolidates agent management functionality from multiple PRs.
 */

import { AgentAPIClient } from './client.js';
import { SimpleLogger } from '../../utils/simple_logger.js';

export class AgentManager {
  constructor(config = {}, healthMonitor = null, agentRouter = null) {
    this.config = {
      maxConcurrentTasks: config.maxConcurrentTasks || 10,
      taskTimeout: config.taskTimeout || 30 * 60 * 1000, // 30 minutes
      enableMetrics: config.enableMetrics !== false,
      ...config
    };

    this.healthMonitor = healthMonitor;
    this.agentRouter = agentRouter;
    this.logger = new SimpleLogger('AgentManager');

    // Agent clients
    this.agents = new Map();
    this.agentConfigs = new Map();
    
    // Task management
    this.activeTasks = new Map();
    this.taskQueue = [];
    this.taskHistory = [];
    
    // Metrics
    this.metrics = {
      tasksExecuted: 0,
      tasksSuccessful: 0,
      tasksFailed: 0,
      averageExecutionTime: 0,
      totalExecutionTime: 0,
      activeAgents: 0,
      queueSize: 0
    };

    this.initialized = false;
  }

  /**
   * Initialize agent manager
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    this.logger.info('Initializing Agent Manager...');

    try {
      // Initialize default agents
      await this._initializeAgents();
      
      // Start task processor
      this._startTaskProcessor();
      
      this.initialized = true;
      this.logger.info('Agent Manager initialized successfully');
      
    } catch (error) {
      this.logger.error('Failed to initialize Agent Manager:', error);
      throw error;
    }
  }

  /**
   * Shutdown agent manager
   */
  async shutdown() {
    this.logger.info('Shutting down Agent Manager...');

    try {
      // Stop task processor
      if (this.taskProcessorInterval) {
        clearInterval(this.taskProcessorInterval);
      }

      // Disconnect all agents
      for (const [agentType, client] of this.agents) {
        try {
          await client.disconnect();
          this.logger.debug(`Disconnected agent: ${agentType}`);
        } catch (error) {
          this.logger.error(`Failed to disconnect agent ${agentType}:`, error);
        }
      }

      // Cancel active tasks
      for (const [taskId, task] of this.activeTasks) {
        try {
          await this._cancelTask(taskId);
        } catch (error) {
          this.logger.error(`Failed to cancel task ${taskId}:`, error);
        }
      }

      this.initialized = false;
      this.logger.info('Agent Manager shutdown complete');
      
    } catch (error) {
      this.logger.error('Error during Agent Manager shutdown:', error);
      throw error;
    }
  }

  /**
   * Execute a task using the appropriate agent
   */
  async executeTask(task, options = {}) {
    if (!this.initialized) {
      throw new Error('Agent Manager not initialized');
    }

    const taskId = task.id || this._generateTaskId();
    const startTime = Date.now();

    this.logger.info(`Executing task: ${taskId}`, {
      taskType: task.type,
      agentType: options.agentType,
      priority: task.priority || 'normal'
    });

    try {
      // Select agent
      const agentType = options.agentType || await this._selectAgent(task);
      const agent = await this._getAgent(agentType);

      // Check if we need to queue the task
      if (this.activeTasks.size >= this.config.maxConcurrentTasks) {
        return await this._queueTask(task, agentType, options);
      }

      // Execute task
      const result = await this._executeTaskWithAgent(taskId, task, agent, agentType);
      
      // Update metrics
      const duration = Date.now() - startTime;
      this._updateMetrics(true, duration);
      
      this.logger.info(`Task completed: ${taskId}`, {
        success: true,
        agentType,
        duration
      });

      return {
        success: true,
        taskId,
        agentType,
        result,
        duration,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this._updateMetrics(false, duration);
      
      this.logger.error(`Task failed: ${taskId}`, {
        error: error.message,
        duration
      });

      throw error;
    }
  }

  /**
   * Get agent status
   */
  getAgentStatus(agentType) {
    const agent = this.agents.get(agentType);
    if (!agent) {
      throw new Error(`Agent not found: ${agentType}`);
    }

    return {
      agentType,
      status: agent.getConnectionStatus(),
      config: this.agentConfigs.get(agentType),
      activeTasks: this._getActiveTasksForAgent(agentType)
    };
  }

  /**
   * Get all agents status
   */
  getAllAgentsStatus() {
    const statuses = {};
    
    for (const agentType of this.agents.keys()) {
      statuses[agentType] = this.getAgentStatus(agentType);
    }

    return statuses;
  }

  /**
   * Get task queue status
   */
  getQueueStatus() {
    return {
      queueSize: this.taskQueue.length,
      activeTasks: this.activeTasks.size,
      maxConcurrentTasks: this.config.maxConcurrentTasks,
      queue: this.taskQueue.map(item => ({
        taskId: item.task.id,
        taskType: item.task.type,
        agentType: item.agentType,
        queuedAt: item.queuedAt,
        priority: item.task.priority || 'normal'
      }))
    };
  }

  /**
   * Cancel a queued task
   */
  cancelQueuedTask(taskId) {
    const index = this.taskQueue.findIndex(item => item.task.id === taskId);
    
    if (index === -1) {
      throw new Error(`Task not found in queue: ${taskId}`);
    }

    const cancelledTask = this.taskQueue.splice(index, 1)[0];
    this.metrics.queueSize = this.taskQueue.length;
    
    this.logger.info(`Task cancelled from queue: ${taskId}`);
    
    return cancelledTask;
  }

  /**
   * Restart an agent
   */
  async restartAgent(agentType) {
    this.logger.info(`Restarting agent: ${agentType}`);

    try {
      const agent = this.agents.get(agentType);
      if (agent) {
        await agent.disconnect();
      }

      // Reinitialize agent
      await this._initializeAgent(agentType);
      
      this.logger.info(`Agent restarted successfully: ${agentType}`);
      
    } catch (error) {
      this.logger.error(`Failed to restart agent ${agentType}:`, error);
      throw error;
    }
  }

  /**
   * Get system metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      queueSize: this.taskQueue.length,
      activeTasks: this.activeTasks.size,
      activeAgents: Array.from(this.agents.values()).filter(agent => 
        agent.getConnectionStatus().connected
      ).length
    };
  }

  /**
   * Get manager status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      agents: this.getAllAgentsStatus(),
      queue: this.getQueueStatus(),
      metrics: this.getMetrics(),
      healthy: this._isHealthy()
    };
  }

  /**
   * Recover from errors
   */
  async recover() {
    this.logger.info('Starting Agent Manager recovery...');

    try {
      // Check and restart unhealthy agents
      for (const [agentType, agent] of this.agents) {
        const status = agent.getConnectionStatus();
        if (!status.connected) {
          this.logger.warn(`Restarting unhealthy agent: ${agentType}`);
          await this.restartAgent(agentType);
        }
      }

      // Process queued tasks
      await this._processTaskQueue();
      
      this.logger.info('Agent Manager recovery completed');
      
    } catch (error) {
      this.logger.error('Agent Manager recovery failed:', error);
      throw error;
    }
  }

  // Private methods

  /**
   * Initialize all agents
   */
  async _initializeAgents() {
    const agentTypes = ['claude', 'goose', 'aider', 'codex'];
    
    for (const agentType of agentTypes) {
      try {
        await this._initializeAgent(agentType);
      } catch (error) {
        this.logger.error(`Failed to initialize agent ${agentType}:`, error);
      }
    }
  }

  /**
   * Initialize a specific agent
   */
  async _initializeAgent(agentType) {
    const config = this._getAgentConfig(agentType);
    
    if (!config.enabled) {
      this.logger.debug(`Agent disabled: ${agentType}`);
      return;
    }

    this.logger.debug(`Initializing agent: ${agentType}`);

    const client = new AgentAPIClient({
      baseURL: config.agentApiUrl || this.config.agentApiUrl,
      apiKey: config.apiKey || this.config.apiKey,
      timeout: config.timeout || this.config.timeout
    });

    // Set up event handlers
    client.on('connected', () => {
      this.logger.info(`Agent connected: ${agentType}`);
    });

    client.on('disconnected', () => {
      this.logger.warn(`Agent disconnected: ${agentType}`);
    });

    client.on('circuitBreakerOpened', () => {
      this.logger.error(`Circuit breaker opened for agent: ${agentType}`);
    });

    // Connect to agent
    await client.connect();
    
    this.agents.set(agentType, client);
    this.agentConfigs.set(agentType, config);
    
    this.logger.info(`Agent initialized successfully: ${agentType}`);
  }

  /**
   * Get agent configuration
   */
  _getAgentConfig(agentType) {
    // Default configurations for each agent type
    const defaultConfigs = {
      claude: {
        enabled: true,
        maxSessions: 3,
        model: 'claude-3-5-sonnet-20241022',
        allowedTools: ['Bash', 'Edit', 'Replace', 'Create'],
        maxTokens: 4096,
        temperature: 0.1
      },
      goose: {
        enabled: true,
        maxSessions: 3,
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        profile: 'default',
        toolkits: ['developer', 'screen']
      },
      aider: {
        enabled: true,
        maxSessions: 3,
        model: 'claude-3-5-sonnet-20241022',
        editFormat: 'diff',
        autoCommit: true
      },
      codex: {
        enabled: true,
        maxSessions: 3,
        model: 'gpt-4',
        maxTokens: 2048,
        temperature: 0.1
      }
    };

    return {
      ...defaultConfigs[agentType],
      ...this.config.agents?.[agentType]
    };
  }

  /**
   * Select appropriate agent for task
   */
  async _selectAgent(task) {
    if (this.agentRouter) {
      return await this.agentRouter.selectAgent(task);
    }

    // Default selection logic
    const taskType = task.type?.toLowerCase();
    
    if (taskType?.includes('deploy') || taskType?.includes('validate')) {
      return 'claude';
    }
    if (taskType?.includes('generate') || taskType?.includes('create')) {
      return 'goose';
    }
    if (taskType?.includes('edit') || taskType?.includes('modify')) {
      return 'aider';
    }
    if (taskType?.includes('complete') || taskType?.includes('suggest')) {
      return 'codex';
    }

    // Default to claude
    return 'claude';
  }

  /**
   * Get agent client
   */
  async _getAgent(agentType) {
    const agent = this.agents.get(agentType);
    
    if (!agent) {
      throw new Error(`Agent not available: ${agentType}`);
    }

    const status = agent.getConnectionStatus();
    if (!status.connected) {
      await agent.connect();
    }

    return agent;
  }

  /**
   * Execute task with specific agent
   */
  async _executeTaskWithAgent(taskId, task, agent, agentType) {
    // Add to active tasks
    this.activeTasks.set(taskId, {
      task,
      agentType,
      startTime: Date.now(),
      agent
    });

    try {
      // Start agent session
      await agent.startSession(agentType, this._getAgentConfig(agentType));
      
      // Send task message
      const prompt = this._generateTaskPrompt(task);
      const response = await agent.sendMessage(prompt, 'user');
      
      // Stop session
      await agent.stopSession();
      
      // Remove from active tasks
      this.activeTasks.delete(taskId);
      
      return response;
      
    } catch (error) {
      // Remove from active tasks on error
      this.activeTasks.delete(taskId);
      throw error;
    }
  }

  /**
   * Queue a task for later execution
   */
  async _queueTask(task, agentType, options) {
    const queueItem = {
      task,
      agentType,
      options,
      queuedAt: Date.now(),
      priority: task.priority || 'normal'
    };

    // Insert based on priority
    if (task.priority === 'high') {
      this.taskQueue.unshift(queueItem);
    } else {
      this.taskQueue.push(queueItem);
    }

    this.metrics.queueSize = this.taskQueue.length;
    
    this.logger.info(`Task queued: ${task.id}`, {
      queueSize: this.taskQueue.length,
      priority: task.priority
    });

    return {
      success: true,
      taskId: task.id,
      queued: true,
      queuePosition: this.taskQueue.length,
      estimatedWaitTime: this._estimateWaitTime()
    };
  }

  /**
   * Start task processor
   */
  _startTaskProcessor() {
    this.taskProcessorInterval = setInterval(async () => {
      await this._processTaskQueue();
    }, 5000); // Process queue every 5 seconds
  }

  /**
   * Process task queue
   */
  async _processTaskQueue() {
    if (this.taskQueue.length === 0 || this.activeTasks.size >= this.config.maxConcurrentTasks) {
      return;
    }

    const queueItem = this.taskQueue.shift();
    if (!queueItem) {
      return;
    }

    this.metrics.queueSize = this.taskQueue.length;

    try {
      await this.executeTask(queueItem.task, queueItem.options);
    } catch (error) {
      this.logger.error(`Failed to execute queued task: ${queueItem.task.id}`, error);
    }
  }

  /**
   * Cancel a task
   */
  async _cancelTask(taskId) {
    const activeTask = this.activeTasks.get(taskId);
    if (activeTask) {
      try {
        await activeTask.agent.stopSession();
      } catch (error) {
        this.logger.error(`Failed to stop session for cancelled task: ${taskId}`, error);
      }
      this.activeTasks.delete(taskId);
    }
  }

  /**
   * Generate task prompt
   */
  _generateTaskPrompt(task) {
    let prompt = `Task: ${task.title || 'Untitled Task'}\n\n`;
    
    if (task.description) {
      prompt += `Description: ${task.description}\n\n`;
    }
    
    if (task.requirements && task.requirements.length > 0) {
      prompt += `Requirements:\n${task.requirements.map(req => `- ${req}`).join('\n')}\n\n`;
    }
    
    if (task.context) {
      prompt += `Context: ${JSON.stringify(task.context, null, 2)}\n\n`;
    }
    
    prompt += 'Please complete this task and provide a detailed response.';
    
    return prompt;
  }

  /**
   * Get active tasks for specific agent
   */
  _getActiveTasksForAgent(agentType) {
    const tasks = [];
    
    for (const [taskId, taskInfo] of this.activeTasks) {
      if (taskInfo.agentType === agentType) {
        tasks.push({
          taskId,
          task: taskInfo.task,
          startTime: taskInfo.startTime,
          duration: Date.now() - taskInfo.startTime
        });
      }
    }
    
    return tasks;
  }

  /**
   * Update metrics
   */
  _updateMetrics(success, duration) {
    this.metrics.tasksExecuted++;
    
    if (success) {
      this.metrics.tasksSuccessful++;
    } else {
      this.metrics.tasksFailed++;
    }
    
    this.metrics.totalExecutionTime += duration;
    this.metrics.averageExecutionTime = this.metrics.totalExecutionTime / this.metrics.tasksExecuted;
  }

  /**
   * Estimate wait time for queued tasks
   */
  _estimateWaitTime() {
    if (this.metrics.averageExecutionTime === 0) {
      return 60000; // Default 1 minute
    }
    
    const tasksAhead = this.taskQueue.length;
    const availableSlots = Math.max(0, this.config.maxConcurrentTasks - this.activeTasks.size);
    
    if (availableSlots > 0) {
      return 0;
    }
    
    return Math.ceil(tasksAhead / this.config.maxConcurrentTasks) * this.metrics.averageExecutionTime;
  }

  /**
   * Check if manager is healthy
   */
  _isHealthy() {
    const connectedAgents = Array.from(this.agents.values()).filter(agent => 
      agent.getConnectionStatus().connected
    ).length;
    
    return connectedAgents > 0 && this.activeTasks.size < this.config.maxConcurrentTasks;
  }

  /**
   * Generate unique task ID
   */
  _generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}

export default AgentManager;

