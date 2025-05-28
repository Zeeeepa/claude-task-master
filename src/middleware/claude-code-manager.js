/**
 * Claude Code Manager
 * 
 * Manages Claude Code instance lifecycle and execution:
 * - Instance management: create, monitor, destroy instances
 * - Execution monitoring: track job progress and handle timeouts
 * - Resource allocation: limit concurrent instances and manage resources
 * - Health checking: monitor instance health and performance
 */

import { EventEmitter } from 'events';

export class ClaudeCodeManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      agentApiUrl: 'http://localhost:3284',
      maxInstances: 5,
      instanceTimeout: 300000, // 5 minutes
      healthCheckInterval: 30000,
      defaultTools: ['Bash(git*)', 'Edit', 'Replace'],
      workingDirectory: '/workspace',
      autoStart: false,
      autoRestart: false,
      ...config
    };
    
    this.agentApiClient = config.agentApiClient;
    this.instances = new Map();
    this.instanceCounter = 0;
    this.healthCheckTimer = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the manager
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }
    
    console.log('Initializing Claude Code Manager...');
    
    if (!this.agentApiClient) {
      throw new Error('AgentAPI client is required');
    }
    
    // Start health monitoring
    this.startHealthMonitoring();
    
    this.isInitialized = true;
    console.log('Claude Code Manager initialized');
    this.emit('initialized');
  }

  /**
   * Start the manager
   */
  async start() {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    console.log('Claude Code Manager started');
    this.emit('started');
  }

  /**
   * Stop the manager
   */
  async stop() {
    console.log('Stopping Claude Code Manager...');
    
    // Stop health monitoring
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    
    // Stop all instances
    const stopPromises = Array.from(this.instances.keys()).map(id => this.stopInstance(id));
    await Promise.allSettled(stopPromises);
    
    console.log('Claude Code Manager stopped');
    this.emit('stopped');
  }

  /**
   * Create a new Claude Code instance
   */
  async createInstance(options = {}) {
    if (this.instances.size >= this.config.maxInstances) {
      throw new Error(`Maximum number of instances (${this.config.maxInstances}) reached`);
    }
    
    const instanceId = `claude-code-${++this.instanceCounter}-${Date.now()}`;
    
    try {
      console.log(`Creating Claude Code instance: ${instanceId}`);
      
      const instanceConfig = {
        workspace: options.workingDirectory || this.config.workingDirectory,
        instanceId,
        settings: {
          allowedTools: options.allowedTools || this.config.defaultTools,
          model: options.model || 'claude-3-sonnet',
          maxTokens: options.maxTokens || 4096,
          temperature: options.temperature || 0.1,
          ...options.settings
        },
        environment: {
          shell: '/bin/bash',
          workingDirectory: options.workingDirectory || this.config.workingDirectory,
          ...options.environment
        }
      };
      
      // Create instance via AgentAPI
      const result = await this.agentApiClient.sendMessage({
        type: 'create_session',
        content: 'Create new Claude Code session',
        config: instanceConfig
      });
      
      if (!result.success) {
        throw new Error(`Failed to create instance: ${result.error}`);
      }
      
      // Store instance information
      const instance = {
        id: instanceId,
        sessionId: result.response.sessionId,
        config: instanceConfig,
        status: 'active',
        createdAt: new Date(),
        lastActivity: new Date(),
        executionHistory: [],
        metrics: {
          executionsCount: 0,
          totalExecutionTime: 0,
          averageExecutionTime: 0,
          successCount: 0,
          errorCount: 0
        }
      };
      
      this.instances.set(instanceId, instance);
      
      console.log(`Claude Code instance created: ${instanceId}`);
      this.emit('instanceCreated', { instanceId, instance });
      
      return instanceId;
      
    } catch (error) {
      console.error(`Failed to create Claude Code instance: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute instruction on instance
   */
  async executeInstruction(instanceId, instruction, context = {}, options = {}) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }
    
    if (instance.status !== 'active') {
      throw new Error(`Instance ${instanceId} is not active (status: ${instance.status})`);
    }
    
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    try {
      console.log(`Executing instruction on instance ${instanceId}: ${instruction.substring(0, 100)}...`);
      
      // Update instance status
      instance.status = 'executing';
      instance.lastActivity = new Date();
      
      // Send instruction via AgentAPI
      const result = await this.agentApiClient.sendMessage({
        type: 'instruction',
        content: instruction,
        sessionId: instance.sessionId,
        context,
        executionId,
        ...options
      });
      
      const executionTime = Date.now() - startTime;
      
      // Record execution
      const execution = {
        id: executionId,
        instruction: instruction.substring(0, 200),
        startTime: new Date(startTime),
        endTime: new Date(),
        executionTime,
        success: result.success,
        result: result.response,
        context,
        error: result.success ? null : result.error
      };
      
      instance.executionHistory.push(execution);
      
      // Update metrics
      instance.metrics.executionsCount++;
      instance.metrics.totalExecutionTime += executionTime;
      instance.metrics.averageExecutionTime = 
        instance.metrics.totalExecutionTime / instance.metrics.executionsCount;
      
      if (result.success) {
        instance.metrics.successCount++;
      } else {
        instance.metrics.errorCount++;
      }
      
      // Update instance status
      instance.status = 'active';
      instance.lastActivity = new Date();
      
      this.emit('instructionExecuted', { 
        instanceId, 
        executionId, 
        execution, 
        result: result.response 
      });
      
      if (!result.success) {
        throw new Error(`Instruction execution failed: ${result.error}`);
      }
      
      return result.response;
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      // Record failed execution
      const execution = {
        id: executionId,
        instruction: instruction.substring(0, 200),
        startTime: new Date(startTime),
        endTime: new Date(),
        executionTime,
        success: false,
        error: error.message,
        context
      };
      
      instance.executionHistory.push(execution);
      instance.metrics.executionsCount++;
      instance.metrics.errorCount++;
      instance.status = 'active'; // Reset to active for retry
      
      this.emit('instructionFailed', { instanceId, executionId, execution, error });
      
      console.error(`Instruction execution failed on instance ${instanceId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute validation task
   */
  async executeValidation(instanceId, validationTask, options = {}) {
    const {
      type = 'full_validation',
      files = [],
      testCommand,
      lintCommand,
      buildCommand,
      timeout = this.config.instanceTimeout
    } = validationTask;

    const validationInstructions = [];
    
    // Build validation instructions based on task type
    switch (type) {
      case 'test_execution':
        if (testCommand) {
          validationInstructions.push(`Run tests: ${testCommand}`);
        }
        break;
        
      case 'lint_check':
        if (lintCommand) {
          validationInstructions.push(`Run linting: ${lintCommand}`);
        }
        break;
        
      case 'build_verification':
        if (buildCommand) {
          validationInstructions.push(`Build project: ${buildCommand}`);
        }
        break;
        
      case 'full_validation':
        if (testCommand) validationInstructions.push(`Run tests: ${testCommand}`);
        if (lintCommand) validationInstructions.push(`Run linting: ${lintCommand}`);
        if (buildCommand) validationInstructions.push(`Build project: ${buildCommand}`);
        break;
        
      default:
        validationInstructions.push(`Perform ${type} validation on files: ${files.join(', ')}`);
    }
    
    const results = [];
    
    for (const instruction of validationInstructions) {
      try {
        const result = await this.executeInstruction(instanceId, instruction, {
          validationType: type,
          files,
          timeout
        }, options);
        
        results.push({
          instruction,
          success: true,
          result
        });
        
      } catch (error) {
        results.push({
          instruction,
          success: false,
          error: error.message
        });
        
        if (options.stopOnError !== false) {
          break;
        }
      }
    }
    
    return {
      type,
      results,
      success: results.every(r => r.success),
      summary: {
        total: results.length,
        passed: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      }
    };
  }

  /**
   * Stop an instance
   */
  async stopInstance(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      console.warn(`Instance not found for stopping: ${instanceId}`);
      return { success: true, message: 'Instance not found' };
    }
    
    try {
      console.log(`Stopping Claude Code instance: ${instanceId}`);
      
      // Update instance status
      instance.status = 'stopping';
      
      // Stop session via AgentAPI
      await this.agentApiClient.sendMessage({
        type: 'stop_session',
        content: 'Stop Claude Code session',
        sessionId: instance.sessionId
      });
      
      // Remove from instances
      this.instances.delete(instanceId);
      
      console.log(`Claude Code instance stopped: ${instanceId}`);
      this.emit('instanceStopped', { instanceId, instance });
      
      return { success: true };
      
    } catch (error) {
      console.error(`Failed to stop instance ${instanceId}: ${error.message}`);
      
      // Force remove from instances even if stop failed
      this.instances.delete(instanceId);
      
      throw error;
    }
  }

  /**
   * Get instance status
   */
  getInstanceStatus(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return { found: false };
    }
    
    return {
      found: true,
      id: instance.id,
      sessionId: instance.sessionId,
      status: instance.status,
      createdAt: instance.createdAt,
      lastActivity: instance.lastActivity,
      metrics: instance.metrics,
      executionHistory: instance.executionHistory.slice(-10) // Last 10 executions
    };
  }

  /**
   * List all instances
   */
  listInstances() {
    return Array.from(this.instances.values()).map(instance => ({
      id: instance.id,
      sessionId: instance.sessionId,
      status: instance.status,
      createdAt: instance.createdAt,
      lastActivity: instance.lastActivity,
      metrics: instance.metrics
    }));
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    if (this.config.healthCheckInterval > 0) {
      this.healthCheckTimer = setInterval(() => {
        this.performHealthCheck();
      }, this.config.healthCheckInterval);
    }
  }

  /**
   * Perform health check on all instances
   */
  async performHealthCheck() {
    const now = new Date();
    const timeoutThreshold = now.getTime() - this.config.instanceTimeout;
    
    for (const [instanceId, instance] of this.instances.entries()) {
      // Check for timeout
      if (instance.lastActivity.getTime() < timeoutThreshold && instance.status === 'executing') {
        console.warn(`Instance ${instanceId} appears to be stuck, marking as timeout`);
        instance.status = 'timeout';
        this.emit('instanceTimeout', { instanceId, instance });
      }
      
      // Check for idle instances (optional cleanup)
      const idleThreshold = now.getTime() - (this.config.instanceTimeout * 2);
      if (instance.lastActivity.getTime() < idleThreshold && instance.status === 'active') {
        console.log(`Instance ${instanceId} has been idle, considering cleanup`);
        this.emit('instanceIdle', { instanceId, instance });
      }
    }
  }

  /**
   * Get manager health status
   */
  async getHealth() {
    const instances = this.listInstances();
    const activeInstances = instances.filter(i => i.status === 'active').length;
    const executingInstances = instances.filter(i => i.status === 'executing').length;
    const timeoutInstances = instances.filter(i => i.status === 'timeout').length;
    
    return {
      status: timeoutInstances > 0 ? 'degraded' : 'healthy',
      totalInstances: instances.length,
      activeInstances,
      executingInstances,
      timeoutInstances,
      maxInstances: this.config.maxInstances,
      utilizationRate: instances.length / this.config.maxInstances,
      lastHealthCheck: new Date().toISOString()
    };
  }

  /**
   * Get manager statistics
   */
  getStatistics() {
    const instances = Array.from(this.instances.values());
    
    const totalExecutions = instances.reduce((sum, i) => sum + i.metrics.executionsCount, 0);
    const totalSuccesses = instances.reduce((sum, i) => sum + i.metrics.successCount, 0);
    const totalErrors = instances.reduce((sum, i) => sum + i.metrics.errorCount, 0);
    const totalExecutionTime = instances.reduce((sum, i) => sum + i.metrics.totalExecutionTime, 0);
    
    return {
      instancesCreated: this.instanceCounter,
      activeInstances: instances.length,
      totalExecutions,
      totalSuccesses,
      totalErrors,
      successRate: totalExecutions > 0 ? totalSuccesses / totalExecutions : 0,
      averageExecutionTime: totalExecutions > 0 ? totalExecutionTime / totalExecutions : 0,
      utilizationRate: instances.length / this.config.maxInstances
    };
  }
}

export default ClaudeCodeManager;

