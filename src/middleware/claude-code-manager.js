/**
 * Claude Code Instance Manager
 * 
 * Manages Claude Code instances via AgentAPI, including lifecycle management,
 * execution monitoring, and error handling.
 */

import { EventEmitter } from 'events';
import { AgentAPIClient } from './agentapi-client.js';

export class ClaudeCodeManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      agentApiUrl: config.agentApiUrl || 'http://localhost:3284',
      maxInstances: config.maxInstances || 5,
      instanceTimeout: config.instanceTimeout || 300000, // 5 minutes
      healthCheckInterval: config.healthCheckInterval || 30000,
      retryAttempts: config.retryAttempts || 3,
      defaultTools: config.defaultTools || ['Bash(git*)', 'Edit', 'Replace'],
      workingDirectory: config.workingDirectory || process.cwd(),
      ...config
    };

    this.instances = new Map();
    this.activeJobs = new Map();
    this.healthCheckTimer = null;
    this.instanceCounter = 0;

    this._startHealthMonitoring();
  }

  /**
   * Start health monitoring for all instances
   */
  _startHealthMonitoring() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      await this._checkInstanceHealth();
    }, this.config.healthCheckInterval);
  }

  /**
   * Check health of all instances
   */
  async _checkInstanceHealth() {
    const healthPromises = Array.from(this.instances.entries()).map(async ([instanceId, instance]) => {
      try {
        const status = await instance.client.getStatus();
        instance.lastHealthCheck = Date.now();
        instance.status = status.status || 'unknown';
        
        // Check for timeout
        const timeSinceLastActivity = Date.now() - instance.lastActivity;
        if (timeSinceLastActivity > this.config.instanceTimeout) {
          this.emit('instanceTimeout', { instanceId, timeSinceLastActivity });
          await this.stopInstance(instanceId);
        }
        
        return { instanceId, status: 'healthy', details: status };
      } catch (error) {
        this.emit('instanceHealthError', { instanceId, error });
        instance.status = 'unhealthy';
        return { instanceId, status: 'unhealthy', error };
      }
    });

    const healthResults = await Promise.allSettled(healthPromises);
    this.emit('healthCheckCompleted', { 
      results: healthResults.map(r => r.value || r.reason),
      timestamp: Date.now()
    });
  }

  /**
   * Create a new Claude Code instance
   * @param {Object} options - Configuration options for the instance
   * @returns {Promise<string>} Instance ID
   */
  async createInstance(options = {}) {
    if (this.instances.size >= this.config.maxInstances) {
      throw new Error(`Maximum number of instances (${this.config.maxInstances}) reached`);
    }

    const instanceId = `claude-code-${++this.instanceCounter}-${Date.now()}`;
    
    try {
      const client = new AgentAPIClient({
        baseUrl: this.config.agentApiUrl,
        timeout: options.timeout || this.config.timeout,
        retryAttempts: this.config.retryAttempts
      });

      // Initialize the client
      await client.initialize();

      // Start Claude Code instance
      const startResponse = await client.startClaudeCode({
        allowedTools: options.allowedTools || this.config.defaultTools,
        workingDirectory: options.workingDirectory || this.config.workingDirectory,
        ...options
      });

      const instance = {
        id: instanceId,
        client,
        status: 'starting',
        createdAt: Date.now(),
        lastActivity: Date.now(),
        lastHealthCheck: Date.now(),
        options,
        startResponse
      };

      // Set up event listeners
      this._setupInstanceEventListeners(instance);

      this.instances.set(instanceId, instance);
      this.emit('instanceCreated', { instanceId, options });

      // Wait for instance to be ready
      await this._waitForInstanceReady(instanceId);

      return instanceId;
    } catch (error) {
      this.emit('instanceCreationError', { instanceId, error });
      throw error;
    }
  }

  /**
   * Set up event listeners for an instance
   * @param {Object} instance - Instance object
   */
  _setupInstanceEventListeners(instance) {
    const { client, id: instanceId } = instance;

    client.on('connected', () => {
      instance.status = 'connected';
      instance.lastActivity = Date.now();
      this.emit('instanceConnected', { instanceId });
    });

    client.on('disconnected', () => {
      instance.status = 'disconnected';
      this.emit('instanceDisconnected', { instanceId });
    });

    client.on('messageReceived', (data) => {
      instance.lastActivity = Date.now();
      this.emit('instanceMessage', { instanceId, message: data });
    });

    client.on('statusChanged', (data) => {
      instance.status = data.status;
      instance.lastActivity = Date.now();
      this.emit('instanceStatusChanged', { instanceId, status: data.status });
    });

    client.on('error', (error) => {
      this.emit('instanceError', { instanceId, error });
    });
  }

  /**
   * Wait for an instance to be ready
   * @param {string} instanceId - Instance ID
   * @returns {Promise<void>}
   */
  async _waitForInstanceReady(instanceId, timeout = 30000) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const status = await instance.client.getStatus();
        if (status.status === 'stable') {
          instance.status = 'ready';
          this.emit('instanceReady', { instanceId });
          return;
        }
      } catch (error) {
        // Continue waiting
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error(`Instance ${instanceId} did not become ready within ${timeout}ms`);
  }

  /**
   * Stop a Claude Code instance
   * @param {string} instanceId - Instance ID
   * @returns {Promise<void>}
   */
  async stopInstance(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    try {
      // Stop any active jobs
      const activeJob = this.activeJobs.get(instanceId);
      if (activeJob) {
        activeJob.cancelled = true;
        this.activeJobs.delete(instanceId);
      }

      // Stop the Claude Code instance
      await instance.client.stopClaudeCode();
      
      // Disconnect the client
      await instance.client.disconnect();

      this.instances.delete(instanceId);
      this.emit('instanceStopped', { instanceId });
    } catch (error) {
      this.emit('instanceStopError', { instanceId, error });
      throw error;
    }
  }

  /**
   * Execute an instruction on a Claude Code instance
   * @param {string} instanceId - Instance ID
   * @param {string} instruction - Natural language instruction
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Execution result
   */
  async executeInstruction(instanceId, instruction, context = {}) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    if (instance.status !== 'ready' && instance.status !== 'stable') {
      throw new Error(`Instance ${instanceId} is not ready (status: ${instance.status})`);
    }

    const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Track the active job
      const job = {
        id: jobId,
        instanceId,
        instruction,
        context,
        startTime: Date.now(),
        cancelled: false
      };
      
      this.activeJobs.set(instanceId, job);
      this.emit('jobStarted', { jobId, instanceId, instruction });

      // Send the instruction
      const response = await instance.client.sendInstruction(instruction, {
        jobId,
        ...context
      });

      // Wait for completion or timeout
      const result = await this._waitForJobCompletion(instanceId, jobId);

      this.activeJobs.delete(instanceId);
      this.emit('jobCompleted', { jobId, instanceId, result });

      return {
        jobId,
        instanceId,
        instruction,
        response,
        result,
        duration: Date.now() - job.startTime
      };
    } catch (error) {
      this.activeJobs.delete(instanceId);
      this.emit('jobError', { jobId, instanceId, error });
      throw error;
    }
  }

  /**
   * Wait for job completion
   * @param {string} instanceId - Instance ID
   * @param {string} jobId - Job ID
   * @returns {Promise<Object>} Job result
   */
  async _waitForJobCompletion(instanceId, jobId, timeout = 120000) {
    const instance = this.instances.get(instanceId);
    const job = this.activeJobs.get(instanceId);
    
    if (!instance || !job) {
      throw new Error(`Instance or job not found`);
    }

    const startTime = Date.now();
    let lastStatus = null;

    return new Promise((resolve, reject) => {
      const checkCompletion = async () => {
        try {
          if (job.cancelled) {
            reject(new Error('Job was cancelled'));
            return;
          }

          if (Date.now() - startTime > timeout) {
            reject(new Error(`Job ${jobId} timed out after ${timeout}ms`));
            return;
          }

          const status = await instance.client.getStatus();
          
          if (status.status === 'stable' && lastStatus === 'running') {
            // Job completed
            const messages = await instance.client.getMessages();
            const jobMessages = messages.filter(msg => 
              msg.timestamp >= job.startTime && 
              msg.type === 'agent'
            );
            
            resolve({
              status: 'completed',
              messages: jobMessages,
              finalStatus: status
            });
            return;
          }

          lastStatus = status.status;
          setTimeout(checkCompletion, 2000); // Check every 2 seconds
        } catch (error) {
          reject(error);
        }
      };

      checkCompletion();
    });
  }

  /**
   * Get instance information
   * @param {string} instanceId - Instance ID
   * @returns {Object} Instance information
   */
  getInstanceInfo(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return null;
    }

    const activeJob = this.activeJobs.get(instanceId);
    
    return {
      id: instance.id,
      status: instance.status,
      createdAt: instance.createdAt,
      lastActivity: instance.lastActivity,
      lastHealthCheck: instance.lastHealthCheck,
      options: instance.options,
      activeJob: activeJob ? {
        id: activeJob.id,
        instruction: activeJob.instruction,
        startTime: activeJob.startTime,
        duration: Date.now() - activeJob.startTime
      } : null,
      health: instance.client.getHealthInfo()
    };
  }

  /**
   * List all instances
   * @returns {Array} Array of instance information
   */
  listInstances() {
    return Array.from(this.instances.keys()).map(instanceId => 
      this.getInstanceInfo(instanceId)
    );
  }

  /**
   * Get manager statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const instances = this.listInstances();
    const activeJobs = Array.from(this.activeJobs.values());

    return {
      totalInstances: instances.length,
      maxInstances: this.config.maxInstances,
      activeJobs: activeJobs.length,
      instancesByStatus: instances.reduce((acc, instance) => {
        acc[instance.status] = (acc[instance.status] || 0) + 1;
        return acc;
      }, {}),
      averageInstanceAge: instances.length > 0 
        ? instances.reduce((sum, instance) => sum + (Date.now() - instance.createdAt), 0) / instances.length
        : 0,
      config: {
        maxInstances: this.config.maxInstances,
        instanceTimeout: this.config.instanceTimeout,
        healthCheckInterval: this.config.healthCheckInterval
      }
    };
  }

  /**
   * Cleanup and shutdown all instances
   */
  async shutdown() {
    // Clear health check timer
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Stop all instances
    const stopPromises = Array.from(this.instances.keys()).map(instanceId =>
      this.stopInstance(instanceId).catch(error => 
        this.emit('shutdownError', { instanceId, error })
      )
    );

    await Promise.allSettled(stopPromises);
    
    this.instances.clear();
    this.activeJobs.clear();
    this.emit('shutdown');
  }
}

export default ClaudeCodeManager;

