/**
 * Unified AgentAPI Middleware Integration
 * 
 * Consolidates functionality from PRs #74, #81, #82, #85 into a single
 * comprehensive middleware system for Claude Code communication.
 * 
 * Features:
 * - Real-time communication with Claude Code instances
 * - Task queue management with priority scheduling
 * - Instance lifecycle management
 * - Event stream processing with SSE
 * - WSL2 integration and deployment orchestration
 * - Error recovery and retry mechanisms
 * - Performance monitoring and health checking
 */

import { EventEmitter } from 'events';
import { AgentAPIClient } from './agentapi-client.js';
import { ClaudeCodeManager } from './claude-code-manager.js';
import { TaskQueue } from './task-queue.js';
import { EventProcessor } from './event-processor.js';
import { WSL2Manager } from './wsl2-manager.js';
import { DeploymentOrchestrator } from './deployment-orchestrator.js';
import { AgentAPIConfig } from '../config/agentapi-config.js';

export class AgentAPIMiddleware extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = config instanceof AgentAPIConfig ? config : new AgentAPIConfig(config);
    this.isInitialized = false;
    this.isRunning = false;
    
    // Core components
    this.agentApiClient = null;
    this.claudeCodeManager = null;
    this.taskQueue = null;
    this.eventProcessor = null;
    this.wsl2Manager = null;
    this.deploymentOrchestrator = null;
    
    // State management
    this.activeTasks = new Map();
    this.activeInstances = new Map();
    this.metrics = {
      tasksProcessed: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      instancesCreated: 0,
      instancesDestroyed: 0,
      averageProcessingTime: 0,
      uptime: 0,
      startTime: null
    };
    
    this.setupEventHandlers();
  }

  /**
   * Initialize the middleware system
   */
  async initialize() {
    if (this.isInitialized) {
      throw new Error('AgentAPI Middleware is already initialized');
    }

    try {
      console.log('Initializing AgentAPI Middleware...');
      
      // Initialize core components
      await this.initializeComponents();
      
      // Setup component interconnections
      this.setupComponentConnections();
      
      // Validate system health
      await this.validateSystemHealth();
      
      this.isInitialized = true;
      this.metrics.startTime = new Date();
      
      console.log('AgentAPI Middleware initialized successfully');
      this.emit('initialized');
      
    } catch (error) {
      console.error('Failed to initialize AgentAPI Middleware:', error);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Initialize all core components
   */
  async initializeComponents() {
    // Initialize AgentAPI Client
    this.agentApiClient = new AgentAPIClient(this.config.getComponent('agentapi'));
    await this.agentApiClient.initialize();
    
    // Initialize Claude Code Manager
    this.claudeCodeManager = new ClaudeCodeManager({
      agentApiClient: this.agentApiClient,
      ...this.config.getComponent('claudeCode')
    });
    await this.claudeCodeManager.initialize();
    
    // Initialize Task Queue
    this.taskQueue = new TaskQueue(this.config.getComponent('taskQueue'));
    await this.taskQueue.initialize();
    
    // Initialize Event Processor
    this.eventProcessor = new EventProcessor({
      agentApiClient: this.agentApiClient,
      ...this.config.getComponent('eventProcessor')
    });
    await this.eventProcessor.initialize();
    
    // Initialize WSL2 Manager (if enabled)
    if (this.config.get('wsl2.enabled', false)) {
      this.wsl2Manager = new WSL2Manager(this.config.getComponent('wsl2'));
      await this.wsl2Manager.initialize();
    }
    
    // Initialize Deployment Orchestrator
    this.deploymentOrchestrator = new DeploymentOrchestrator({
      claudeCodeManager: this.claudeCodeManager,
      wsl2Manager: this.wsl2Manager,
      ...this.config.getComponent('deployment')
    });
    await this.deploymentOrchestrator.initialize();
  }

  /**
   * Setup connections between components
   */
  setupComponentConnections() {
    // Task Queue -> Claude Code Manager
    this.taskQueue.on('executeTask', async ({ task, resolve, reject }) => {
      try {
        const result = await this.executeTask(task);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
    
    // Event Processor -> Task Queue
    this.eventProcessor.on('taskEvent', (event) => {
      if (event.type === 'task_request') {
        this.addTask(event.data);
      }
    });
    
    // Claude Code Manager -> Event Processor
    this.claudeCodeManager.on('instanceEvent', (event) => {
      this.eventProcessor.processEvent(event);
    });
    
    // WSL2 Manager -> Deployment Orchestrator
    if (this.wsl2Manager) {
      this.wsl2Manager.on('instanceReady', (instance) => {
        this.deploymentOrchestrator.onInstanceReady(instance);
      });
    }
  }

  /**
   * Setup event handlers for the middleware
   */
  setupEventHandlers() {
    // Handle task completion
    this.on('taskCompleted', ({ taskId, result }) => {
      this.metrics.tasksCompleted++;
      this.updateAverageProcessingTime(result.processingTime);
      console.log(`Task ${taskId} completed successfully`);
    });
    
    // Handle task failure
    this.on('taskFailed', ({ taskId, error }) => {
      this.metrics.tasksFailed++;
      console.error(`Task ${taskId} failed:`, error.message);
    });
    
    // Handle instance lifecycle
    this.on('instanceCreated', ({ instanceId }) => {
      this.metrics.instancesCreated++;
      console.log(`Claude Code instance ${instanceId} created`);
    });
    
    this.on('instanceDestroyed', ({ instanceId }) => {
      this.metrics.instancesDestroyed++;
      console.log(`Claude Code instance ${instanceId} destroyed`);
    });
  }

  /**
   * Start the middleware system
   */
  async start() {
    if (!this.isInitialized) {
      throw new Error('Middleware must be initialized before starting');
    }
    
    if (this.isRunning) {
      throw new Error('Middleware is already running');
    }

    try {
      console.log('Starting AgentAPI Middleware...');
      
      // Start all components
      await this.agentApiClient.start();
      await this.claudeCodeManager.start();
      await this.taskQueue.start();
      await this.eventProcessor.start();
      
      if (this.wsl2Manager) {
        await this.wsl2Manager.start();
      }
      
      await this.deploymentOrchestrator.start();
      
      this.isRunning = true;
      console.log('AgentAPI Middleware started successfully');
      this.emit('started');
      
    } catch (error) {
      console.error('Failed to start AgentAPI Middleware:', error);
      throw error;
    }
  }

  /**
   * Stop the middleware system
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    try {
      console.log('Stopping AgentAPI Middleware...');
      
      // Stop all components in reverse order
      await this.deploymentOrchestrator.stop();
      
      if (this.wsl2Manager) {
        await this.wsl2Manager.stop();
      }
      
      await this.eventProcessor.stop();
      await this.taskQueue.stop();
      await this.claudeCodeManager.stop();
      await this.agentApiClient.stop();
      
      this.isRunning = false;
      console.log('AgentAPI Middleware stopped successfully');
      this.emit('stopped');
      
    } catch (error) {
      console.error('Error stopping AgentAPI Middleware:', error);
      throw error;
    }
  }

  /**
   * Add a task to the processing queue
   */
  addTask(taskData, options = {}) {
    const task = {
      id: taskData.id || this.generateTaskId(),
      type: taskData.type || 'general',
      priority: taskData.priority || 5,
      data: taskData.data || taskData,
      options: {
        timeout: options.timeout || this.config.get('taskQueue.taskTimeout'),
        retryAttempts: options.retryAttempts || this.config.get('taskQueue.retryAttempts'),
        ...options
      },
      createdAt: new Date(),
      status: 'pending'
    };

    this.activeTasks.set(task.id, task);
    this.taskQueue.addTask(task);
    this.metrics.tasksProcessed++;
    
    this.emit('taskAdded', { taskId: task.id, task });
    
    return task.id;
  }

  /**
   * Execute a task using the appropriate handler
   */
  async executeTask(task) {
    const startTime = Date.now();
    
    try {
      console.log(`Executing task ${task.id} of type ${task.type}`);
      
      let result;
      
      switch (task.type) {
        case 'analyze':
          result = await this.executeAnalysisTask(task);
          break;
        case 'validate':
          result = await this.executeValidationTask(task);
          break;
        case 'deploy':
          result = await this.executeDeploymentTask(task);
          break;
        case 'code_generation':
          result = await this.executeCodeGenerationTask(task);
          break;
        default:
          result = await this.executeGenericTask(task);
      }
      
      const processingTime = Date.now() - startTime;
      result.processingTime = processingTime;
      
      // Update task status
      task.status = 'completed';
      task.completedAt = new Date();
      task.result = result;
      
      this.emit('taskCompleted', { taskId: task.id, result, task });
      
      return result;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      // Update task status
      task.status = 'failed';
      task.failedAt = new Date();
      task.error = error.message;
      
      this.emit('taskFailed', { taskId: task.id, error, task });
      
      throw error;
    } finally {
      // Clean up task from active tasks
      setTimeout(() => {
        this.activeTasks.delete(task.id);
      }, 60000); // Keep for 1 minute for status queries
    }
  }

  /**
   * Execute code analysis task
   */
  async executeAnalysisTask(task) {
    const { repository, branch, analysisType, options } = task.data;
    
    // Create or get Claude Code instance
    const instanceId = await this.claudeCodeManager.createInstance({
      workingDirectory: options.workingDirectory || '/workspace',
      allowedTools: ['Bash(git*)', 'Edit', 'Replace', 'Search'],
      ...options.instanceConfig
    });
    
    try {
      // Clone repository if needed
      if (repository) {
        await this.claudeCodeManager.executeInstruction(
          instanceId,
          `Clone repository ${repository} and checkout branch ${branch || 'main'}`,
          { repository, branch }
        );
      }
      
      // Execute analysis
      const analysisResult = await this.claudeCodeManager.executeInstruction(
        instanceId,
        this.generateAnalysisPrompt(analysisType, options),
        { analysisType, ...options }
      );
      
      return {
        success: true,
        analysisType,
        result: analysisResult,
        instanceId
      };
      
    } finally {
      // Clean up instance if not persistent
      if (!options.persistInstance) {
        await this.claudeCodeManager.stopInstance(instanceId);
      }
    }
  }

  /**
   * Execute validation task
   */
  async executeValidationTask(task) {
    const { repository, branch, validationTasks, options } = task.data;
    
    // Use deployment orchestrator for complex validation workflows
    if (this.deploymentOrchestrator && validationTasks.length > 1) {
      return await this.deploymentOrchestrator.executeValidationWorkflow({
        repository,
        branch,
        validationTasks,
        options
      });
    }
    
    // Simple validation using Claude Code Manager
    const instanceId = await this.claudeCodeManager.createInstance(options.instanceConfig);
    
    try {
      const results = [];
      
      for (const validationTask of validationTasks) {
        const result = await this.claudeCodeManager.executeValidation(
          instanceId,
          validationTask,
          options
        );
        results.push(result);
      }
      
      return {
        success: true,
        validationResults: results,
        instanceId
      };
      
    } finally {
      if (!options.persistInstance) {
        await this.claudeCodeManager.stopInstance(instanceId);
      }
    }
  }

  /**
   * Execute deployment task
   */
  async executeDeploymentTask(task) {
    if (!this.deploymentOrchestrator) {
      throw new Error('Deployment orchestrator not available');
    }
    
    return await this.deploymentOrchestrator.executeDeployment(task.data);
  }

  /**
   * Execute code generation task
   */
  async executeCodeGenerationTask(task) {
    const { prompt, context, options } = task.data;
    
    const instanceId = await this.claudeCodeManager.createInstance({
      allowedTools: ['Edit', 'Create', 'Replace', 'Search'],
      ...options.instanceConfig
    });
    
    try {
      const result = await this.claudeCodeManager.executeInstruction(
        instanceId,
        prompt,
        { context, ...options }
      );
      
      return {
        success: true,
        generatedCode: result,
        instanceId
      };
      
    } finally {
      if (!options.persistInstance) {
        await this.claudeCodeManager.stopInstance(instanceId);
      }
    }
  }

  /**
   * Execute generic task
   */
  async executeGenericTask(task) {
    const { instruction, context, options } = task.data;
    
    const instanceId = await this.claudeCodeManager.createInstance(options.instanceConfig);
    
    try {
      const result = await this.claudeCodeManager.executeInstruction(
        instanceId,
        instruction,
        { context, ...options }
      );
      
      return {
        success: true,
        result,
        instanceId
      };
      
    } finally {
      if (!options.persistInstance) {
        await this.claudeCodeManager.stopInstance(instanceId);
      }
    }
  }

  /**
   * Generate analysis prompt based on type
   */
  generateAnalysisPrompt(analysisType, options) {
    const prompts = {
      security: `Analyze this codebase for security vulnerabilities. Focus on:
        - Input validation issues
        - Authentication and authorization flaws
        - SQL injection and XSS vulnerabilities
        - Insecure dependencies
        - Configuration issues`,
      
      performance: `Analyze this codebase for performance issues. Focus on:
        - Inefficient algorithms and data structures
        - Memory leaks and resource management
        - Database query optimization
        - Caching opportunities
        - Bundle size and loading performance`,
      
      quality: `Analyze this codebase for code quality issues. Focus on:
        - Code complexity and maintainability
        - Design patterns and architecture
        - Test coverage and quality
        - Documentation completeness
        - Coding standards compliance`,
      
      dependencies: `Analyze this codebase for dependency issues. Focus on:
        - Outdated dependencies
        - Security vulnerabilities in dependencies
        - Unused dependencies
        - License compatibility
        - Dependency conflicts`
    };
    
    return prompts[analysisType] || prompts.quality;
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId) {
    const task = this.activeTasks.get(taskId);
    if (!task) {
      return { found: false };
    }
    
    return {
      found: true,
      id: task.id,
      type: task.type,
      status: task.status,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
      failedAt: task.failedAt,
      processingTime: task.result?.processingTime,
      error: task.error
    };
  }

  /**
   * Get system health status
   */
  async getHealth() {
    const health = {
      status: 'healthy',
      components: {},
      metrics: this.getMetrics(),
      uptime: this.getUptime()
    };
    
    try {
      // Check AgentAPI Client
      health.components.agentApiClient = await this.agentApiClient.getHealth();
      
      // Check Claude Code Manager
      health.components.claudeCodeManager = await this.claudeCodeManager.getHealth();
      
      // Check Task Queue
      health.components.taskQueue = this.taskQueue.getHealth();
      
      // Check Event Processor
      health.components.eventProcessor = this.eventProcessor.getHealth();
      
      // Check WSL2 Manager (if available)
      if (this.wsl2Manager) {
        health.components.wsl2Manager = await this.wsl2Manager.getHealth();
      }
      
      // Check Deployment Orchestrator
      health.components.deploymentOrchestrator = this.deploymentOrchestrator.getHealth();
      
      // Determine overall health
      const unhealthyComponents = Object.values(health.components)
        .filter(component => component.status !== 'healthy');
      
      if (unhealthyComponents.length > 0) {
        health.status = 'degraded';
        if (unhealthyComponents.length > Object.keys(health.components).length / 2) {
          health.status = 'unhealthy';
        }
      }
      
    } catch (error) {
      health.status = 'unhealthy';
      health.error = error.message;
    }
    
    return health;
  }

  /**
   * Get system metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      uptime: this.getUptime(),
      activeTasks: this.activeTasks.size,
      activeInstances: this.activeInstances.size,
      successRate: this.metrics.tasksProcessed > 0 
        ? this.metrics.tasksCompleted / this.metrics.tasksProcessed 
        : 0
    };
  }

  /**
   * Get system uptime in milliseconds
   */
  getUptime() {
    return this.metrics.startTime ? Date.now() - this.metrics.startTime.getTime() : 0;
  }

  /**
   * Update average processing time
   */
  updateAverageProcessingTime(newTime) {
    if (this.metrics.tasksCompleted === 1) {
      this.metrics.averageProcessingTime = newTime;
    } else {
      this.metrics.averageProcessingTime = 
        (this.metrics.averageProcessingTime * (this.metrics.tasksCompleted - 1) + newTime) / 
        this.metrics.tasksCompleted;
    }
  }

  /**
   * Generate unique task ID
   */
  generateTaskId() {
    return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate system health during initialization
   */
  async validateSystemHealth() {
    const health = await this.getHealth();
    
    if (health.status === 'unhealthy') {
      throw new Error(`System health check failed: ${health.error || 'Multiple components unhealthy'}`);
    }
    
    console.log(`System health: ${health.status}`);
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    try {
      if (this.isRunning) {
        await this.stop();
      }
      
      // Clear active tasks
      this.activeTasks.clear();
      this.activeInstances.clear();
      
      // Reset metrics
      this.metrics = {
        tasksProcessed: 0,
        tasksCompleted: 0,
        tasksFailed: 0,
        instancesCreated: 0,
        instancesDestroyed: 0,
        averageProcessingTime: 0,
        uptime: 0,
        startTime: null
      };
      
      this.isInitialized = false;
      
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}

export default AgentAPIMiddleware;

