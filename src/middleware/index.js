/**
 * AgentAPI Middleware Integration
 * 
 * Main orchestrator that integrates all middleware components for seamless
 * communication between Claude Task Master and Claude Code.
 */

import { EventEmitter } from 'events';
import { AgentAPIClient } from './agentapi-client.js';
import { ClaudeCodeManager } from './claude-code-manager.js';
import { TaskQueue } from './task-queue.js';
import { EventProcessor } from './event-processor.js';
import { AgentAPIConfig } from '../config/agentapi-config.js';
import { ClaudeCodeUtils } from '../utils/claude-code-utils.js';

export class AgentAPIMiddleware extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = config instanceof AgentAPIConfig ? config : new AgentAPIConfig(config);
    
    // Initialize components
    this.agentApiClient = null;
    this.claudeCodeManager = null;
    this.taskQueue = null;
    this.eventProcessor = null;
    
    this.isInitialized = false;
    this.isRunning = false;
    this.stats = {
      startTime: null,
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      activeInstances: 0
    };
  }

  /**
   * Initialize the middleware
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      this.emit('initializing');

      // Initialize AgentAPI client
      this.agentApiClient = new AgentAPIClient(this.config.getComponent('agentapi'));
      await this.agentApiClient.initialize();

      // Initialize Claude Code manager
      this.claudeCodeManager = new ClaudeCodeManager({
        agentApiUrl: this.config.get('agentapi.baseUrl'),
        ...this.config.getComponent('claudeCode')
      });

      // Initialize task queue
      this.taskQueue = new TaskQueue(this.config.getComponent('taskQueue'));

      // Initialize event processor
      this.eventProcessor = new EventProcessor({
        agentApiUrl: this.config.get('agentapi.baseUrl'),
        ...this.config.getComponent('eventProcessor')
      });

      // Setup event handlers
      this._setupEventHandlers();

      this.isInitialized = true;
      this.emit('initialized');

    } catch (error) {
      this.emit('initializationError', error);
      throw error;
    }
  }

  /**
   * Start the middleware
   * @returns {Promise<void>}
   */
  async start() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isRunning) {
      return;
    }

    try {
      this.emit('starting');

      // Start event processor
      await this.eventProcessor.start();

      // Start task queue processing
      this.taskQueue._startProcessing();

      this.isRunning = true;
      this.stats.startTime = Date.now();
      this.emit('started');

    } catch (error) {
      this.emit('startError', error);
      throw error;
    }
  }

  /**
   * Stop the middleware
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    try {
      this.emit('stopping');

      // Stop event processor
      this.eventProcessor.stop();

      // Stop task queue
      this.taskQueue.stopProcessing();

      // Shutdown Claude Code manager
      await this.claudeCodeManager.shutdown();

      // Disconnect AgentAPI client
      await this.agentApiClient.disconnect();

      this.isRunning = false;
      this.emit('stopped');

    } catch (error) {
      this.emit('stopError', error);
      throw error;
    }
  }

  /**
   * Setup event handlers for component integration
   */
  _setupEventHandlers() {
    // Task queue event handlers
    this.taskQueue.on('executeTask', async ({ task, resolve, reject }) => {
      try {
        const result = await this._executeTask(task);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });

    this.taskQueue.on('taskCompleted', ({ taskId, result }) => {
      this.stats.completedTasks++;
      this.emit('taskCompleted', { taskId, result });
    });

    this.taskQueue.on('taskFailed', ({ taskId, error }) => {
      this.stats.failedTasks++;
      this.emit('taskFailed', { taskId, error });
    });

    // Claude Code manager event handlers
    this.claudeCodeManager.on('instanceCreated', ({ instanceId }) => {
      this.stats.activeInstances++;
      this.emit('instanceCreated', { instanceId });
    });

    this.claudeCodeManager.on('instanceStopped', ({ instanceId }) => {
      this.stats.activeInstances--;
      this.emit('instanceStopped', { instanceId });
    });

    // Event processor handlers
    this.eventProcessor.on('messageReceived', (message) => {
      this.emit('agentMessage', message);
    });

    this.eventProcessor.on('statusChanged', (status) => {
      this.emit('agentStatusChanged', status);
    });

    // AgentAPI client handlers
    this.agentApiClient.on('connected', () => {
      this.emit('agentApiConnected');
    });

    this.agentApiClient.on('disconnected', () => {
      this.emit('agentApiDisconnected');
    });
  }

  /**
   * Execute a task
   * @param {Object} task - Task to execute
   * @returns {Promise<any>} Task result
   */
  async _executeTask(task) {
    const { type, data } = task;

    switch (type) {
      case 'analyze':
        return this._executeAnalysisTask(data);
      case 'generate':
        return this._executeGenerationTask(data);
      case 'review':
        return this._executeReviewTask(data);
      case 'validate':
        return this._executeValidationTask(data);
      default:
        return this._executeCustomTask(task);
    }
  }

  /**
   * Execute analysis task
   * @param {Object} data - Task data
   * @returns {Promise<Object>} Analysis result
   */
  async _executeAnalysisTask(data) {
    const { repository, branch, files, analysisType, options = {} } = data;

    // Create or get Claude Code instance
    const instanceId = await this.claudeCodeManager.createInstance({
      workingDirectory: options.workingDirectory,
      allowedTools: options.allowedTools
    });

    try {
      // Create analysis request
      const instruction = ClaudeCodeUtils.createAnalysisRequest({
        repository,
        branch,
        files,
        analysisType,
        ...options
      });

      // Execute analysis
      const result = await this.claudeCodeManager.executeInstruction(
        instanceId,
        instruction,
        { taskType: 'analysis', repository, branch }
      );

      // Parse and enhance result
      const parsed = ClaudeCodeUtils.parseResponse(result.result);
      const metrics = ClaudeCodeUtils.extractMetrics(parsed);

      return {
        type: 'analysis',
        result: parsed,
        metrics,
        instanceId,
        duration: result.duration
      };

    } finally {
      // Clean up instance if not reusable
      if (!options.keepInstance) {
        await this.claudeCodeManager.stopInstance(instanceId);
      }
    }
  }

  /**
   * Execute generation task
   * @param {Object} data - Task data
   * @returns {Promise<Object>} Generation result
   */
  async _executeGenerationTask(data) {
    const { description, language, framework, options = {} } = data;

    const instanceId = await this.claudeCodeManager.createInstance({
      workingDirectory: options.workingDirectory,
      allowedTools: options.allowedTools
    });

    try {
      const instruction = ClaudeCodeUtils.createGenerationRequest({
        description,
        language,
        framework,
        ...options
      });

      const result = await this.claudeCodeManager.executeInstruction(
        instanceId,
        instruction,
        { taskType: 'generation', language, framework }
      );

      const parsed = ClaudeCodeUtils.parseResponse(result.result);

      return {
        type: 'generation',
        result: parsed,
        instanceId,
        duration: result.duration
      };

    } finally {
      if (!options.keepInstance) {
        await this.claudeCodeManager.stopInstance(instanceId);
      }
    }
  }

  /**
   * Execute review task
   * @param {Object} data - Task data
   * @returns {Promise<Object>} Review result
   */
  async _executeReviewTask(data) {
    const { files, changes, focusAreas, options = {} } = data;

    const instanceId = await this.claudeCodeManager.createInstance({
      workingDirectory: options.workingDirectory,
      allowedTools: options.allowedTools
    });

    try {
      const instruction = ClaudeCodeUtils.createReviewRequest({
        files,
        changes,
        focusAreas,
        ...options
      });

      const result = await this.claudeCodeManager.executeInstruction(
        instanceId,
        instruction,
        { taskType: 'review', files, focusAreas }
      );

      const parsed = ClaudeCodeUtils.parseResponse(result.result);

      return {
        type: 'review',
        result: parsed,
        instanceId,
        duration: result.duration
      };

    } finally {
      if (!options.keepInstance) {
        await this.claudeCodeManager.stopInstance(instanceId);
      }
    }
  }

  /**
   * Execute validation task
   * @param {Object} data - Task data
   * @returns {Promise<Object>} Validation result
   */
  async _executeValidationTask(data) {
    const { code, language, validationType, options = {} } = data;

    const instanceId = await this.claudeCodeManager.createInstance({
      workingDirectory: options.workingDirectory,
      allowedTools: options.allowedTools
    });

    try {
      let instruction = `Please validate the following ${language} code for ${validationType}:\n\n${code}`;
      
      if (options.requirements) {
        instruction += `\n\nRequirements:\n${options.requirements.map(r => `- ${r}`).join('\n')}`;
      }

      const result = await this.claudeCodeManager.executeInstruction(
        instanceId,
        instruction,
        { taskType: 'validation', language, validationType }
      );

      const parsed = ClaudeCodeUtils.parseResponse(result.result);

      return {
        type: 'validation',
        result: parsed,
        instanceId,
        duration: result.duration
      };

    } finally {
      if (!options.keepInstance) {
        await this.claudeCodeManager.stopInstance(instanceId);
      }
    }
  }

  /**
   * Execute custom task
   * @param {Object} task - Custom task
   * @returns {Promise<Object>} Task result
   */
  async _executeCustomTask(task) {
    const { data, context } = task;
    const { instruction, options = {} } = data;

    const instanceId = await this.claudeCodeManager.createInstance({
      workingDirectory: options.workingDirectory,
      allowedTools: options.allowedTools
    });

    try {
      const sanitizedInstruction = ClaudeCodeUtils.sanitizeInstruction(instruction);
      
      const result = await this.claudeCodeManager.executeInstruction(
        instanceId,
        sanitizedInstruction,
        { taskType: 'custom', ...context }
      );

      const parsed = ClaudeCodeUtils.parseResponse(result.result);

      return {
        type: 'custom',
        result: parsed,
        instanceId,
        duration: result.duration
      };

    } finally {
      if (!options.keepInstance) {
        await this.claudeCodeManager.stopInstance(instanceId);
      }
    }
  }

  /**
   * Add a task to the queue
   * @param {Object} taskData - Task data
   * @returns {string} Task ID
   */
  addTask(taskData) {
    this.stats.totalTasks++;
    return this.taskQueue.addTask(taskData);
  }

  /**
   * Get task status
   * @param {string} taskId - Task ID
   * @returns {Object|null} Task status
   */
  getTaskStatus(taskId) {
    return this.taskQueue.getTask(taskId);
  }

  /**
   * Cancel a task
   * @param {string} taskId - Task ID
   * @returns {boolean} True if cancelled
   */
  cancelTask(taskId) {
    return this.taskQueue.cancelTask(taskId);
  }

  /**
   * List all Claude Code instances
   * @returns {Array} Array of instance information
   */
  listInstances() {
    return this.claudeCodeManager.listInstances();
  }

  /**
   * Get middleware statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const uptime = this.stats.startTime ? Date.now() - this.stats.startTime : 0;
    
    return {
      middleware: {
        isInitialized: this.isInitialized,
        isRunning: this.isRunning,
        uptime,
        ...this.stats
      },
      taskQueue: this.taskQueue ? this.taskQueue.getStats() : null,
      claudeCodeManager: this.claudeCodeManager ? this.claudeCodeManager.getStats() : null,
      eventProcessor: this.eventProcessor ? this.eventProcessor.getStats() : null,
      agentApiClient: this.agentApiClient ? this.agentApiClient.getStats() : null
    };
  }

  /**
   * Get health status
   * @returns {Object} Health status
   */
  getHealth() {
    const stats = this.getStats();
    
    return {
      status: this.isRunning ? 'healthy' : 'stopped',
      timestamp: Date.now(),
      uptime: stats.middleware.uptime,
      components: {
        agentApiClient: this.agentApiClient?.isConnected || false,
        eventProcessor: this.eventProcessor?.isConnected || false,
        taskQueue: this.taskQueue?.isProcessing || false,
        claudeCodeManager: stats.claudeCodeManager?.totalInstances || 0
      },
      version: '1.0.0'
    };
  }

  /**
   * Perform a comprehensive health check
   * @returns {Promise<Object>} Detailed health check result
   */
  async performHealthCheck() {
    const health = this.getHealth();
    const checks = [];

    // Check AgentAPI connectivity
    try {
      await this.agentApiClient.getStatus();
      checks.push({ name: 'agentapi', status: 'healthy', message: 'Connected' });
    } catch (error) {
      checks.push({ name: 'agentapi', status: 'unhealthy', message: error.message });
    }

    // Check Claude Code availability
    try {
      const available = await ClaudeCodeUtils.isClaudeCodeAvailable();
      checks.push({ 
        name: 'claude-code', 
        status: available ? 'healthy' : 'warning', 
        message: available ? 'Available' : 'Not found in PATH' 
      });
    } catch (error) {
      checks.push({ name: 'claude-code', status: 'unhealthy', message: error.message });
    }

    // Check task queue
    const queueStats = this.taskQueue.getStats();
    const queueHealthy = queueStats.processing.isActive && queueStats.queue.size < queueStats.queue.maxSize * 0.9;
    checks.push({
      name: 'task-queue',
      status: queueHealthy ? 'healthy' : 'warning',
      message: `${queueStats.queue.size}/${queueStats.queue.maxSize} queued, ${queueStats.active.count} active`
    });

    return {
      ...health,
      checks,
      overall: checks.every(c => c.status === 'healthy') ? 'healthy' : 'degraded'
    };
  }
}

// Export all components
export {
  AgentAPIClient,
  ClaudeCodeManager,
  TaskQueue,
  EventProcessor,
  AgentAPIConfig,
  ClaudeCodeUtils
};

export default AgentAPIMiddleware;

