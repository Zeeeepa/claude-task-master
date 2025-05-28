/**
 * WSL2 Instance Manager for AgentAPI
 * 
 * Manages WSL2 instances for Claude Code execution, including
 * instance allocation, lifecycle management, and resource monitoring.
 */

import { EventEmitter } from 'events';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { SimpleLogger } from '../ai_cicd_system/utils/simple_logger.js';
import { LoadBalancer } from './load-balancer.js';

const execAsync = promisify(exec);

export class WSL2InstanceManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      maxInstances: config.maxInstances || 5,
      instanceTimeout: config.instanceTimeout || 300000, // 5 minutes
      resourceLimits: {
        memory: config.resourceLimits?.memory || '4GB',
        cpu: config.resourceLimits?.cpu || '2 cores',
        ...config.resourceLimits
      },
      claudeCode: {
        version: config.claudeCode?.version || 'latest',
        timeout: config.claudeCode?.timeout || 600000, // 10 minutes
        retryAttempts: config.claudeCode?.retryAttempts || 3,
        ...config.claudeCode
      },
      wsl: {
        distribution: config.wsl?.distribution || 'Ubuntu',
        user: config.wsl?.user || 'ubuntu',
        workingDir: config.wsl?.workingDir || '/home/ubuntu/workspace',
        ...config.wsl
      },
      ...config
    };

    this.logger = new SimpleLogger('WSL2InstanceManager');
    this.loadBalancer = new LoadBalancer();
    
    this.instances = new Map();
    this.availableInstances = new Set();
    this.busyInstances = new Set();
    this.instanceCounter = 0;
    
    // Start monitoring interval
    this._startMonitoring();
  }

  /**
   * Allocate a WSL2 instance for a task
   * @param {Object} task - Task requiring instance
   * @returns {Promise<Object>} Instance details
   */
  async allocateInstance(task) {
    try {
      this.logger.info(`Allocating instance for task: ${task.id}`, {
        taskId: task.id,
        taskType: task.type,
        availableInstances: this.availableInstances.size,
        busyInstances: this.busyInstances.size
      });

      // Try to find an available instance
      let instance = await this._findAvailableInstance();
      
      if (!instance) {
        // Create new instance if under limit
        if (this.instances.size < this.config.maxInstances) {
          instance = await this._createNewInstance();
        } else {
          // Wait for an instance to become available
          instance = await this._waitForAvailableInstance();
        }
      }

      // Allocate instance to task
      await this._allocateInstanceToTask(instance, task);
      
      this.logger.info(`Instance allocated: ${instance.id}`, {
        instanceId: instance.id,
        taskId: task.id,
        totalInstances: this.instances.size
      });

      this.emit('instanceAllocated', { instance, task });
      
      return instance;
    } catch (error) {
      this.logger.error('Failed to allocate instance:', error);
      throw new Error(`Instance allocation failed: ${error.message}`);
    }
  }

  /**
   * Execute Claude Code on a WSL2 instance
   * @param {Object} instance - WSL2 instance
   * @param {Object} task - Task to execute
   * @returns {Promise<Object>} Execution result
   */
  async executeClaudeCode(instance, task) {
    try {
      this.logger.info(`Executing Claude Code on instance: ${instance.id}`, {
        instanceId: instance.id,
        taskId: task.id,
        repository: task.data.repository,
        branch: task.data.branch
      });

      // Prepare workspace
      await this._prepareWorkspace(instance, task);
      
      // Clone repository
      await this._cloneRepository(instance, task);
      
      // Execute Claude Code
      const result = await this._runClaudeCode(instance, task);
      
      // Cleanup workspace
      await this._cleanupWorkspace(instance, task);
      
      this.logger.info(`Claude Code execution completed: ${instance.id}`, {
        instanceId: instance.id,
        taskId: task.id,
        success: result.success
      });

      this.emit('executionCompleted', { instance, task, result });
      
      return result;
    } catch (error) {
      this.logger.error(`Claude Code execution failed on instance ${instance.id}:`, error);
      
      // Cleanup on error
      try {
        await this._cleanupWorkspace(instance, task);
      } catch (cleanupError) {
        this.logger.error('Cleanup failed:', cleanupError);
      }
      
      this.emit('executionFailed', { instance, task, error });
      throw error;
    }
  }

  /**
   * Release an instance back to the available pool
   * @param {string} instanceId - Instance ID
   */
  async releaseInstance(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      this.logger.warn(`Attempted to release unknown instance: ${instanceId}`);
      return;
    }

    try {
      // Reset instance state
      instance.currentTask = null;
      instance.lastUsed = new Date().toISOString();
      instance.status = 'available';
      
      // Move from busy to available
      this.busyInstances.delete(instanceId);
      this.availableInstances.add(instanceId);
      
      this.logger.info(`Instance released: ${instanceId}`, {
        instanceId,
        availableInstances: this.availableInstances.size,
        busyInstances: this.busyInstances.size
      });

      this.emit('instanceReleased', instance);
    } catch (error) {
      this.logger.error(`Failed to release instance ${instanceId}:`, error);
    }
  }

  /**
   * Get instance status
   * @param {string} instanceId - Instance ID
   * @returns {Object|null} Instance status
   */
  getInstanceStatus(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return null;
    }

    return {
      id: instance.id,
      status: instance.status,
      createdAt: instance.createdAt,
      lastUsed: instance.lastUsed,
      currentTask: instance.currentTask,
      resourceUsage: instance.resourceUsage,
      health: instance.health
    };
  }

  /**
   * Get all instances status
   * @returns {Array} All instances status
   */
  getAllInstancesStatus() {
    return Array.from(this.instances.values()).map(instance => 
      this.getInstanceStatus(instance.id)
    );
  }

  /**
   * Find an available instance
   * @returns {Promise<Object|null>} Available instance or null
   */
  async _findAvailableInstance() {
    if (this.availableInstances.size === 0) {
      return null;
    }

    // Use load balancer to select best instance
    const instanceId = this.loadBalancer.selectInstance(
      Array.from(this.availableInstances),
      Array.from(this.instances.values()).filter(i => this.availableInstances.has(i.id))
    );

    return this.instances.get(instanceId);
  }

  /**
   * Create a new WSL2 instance
   * @returns {Promise<Object>} New instance
   */
  async _createNewInstance() {
    const instanceId = `wsl2_${++this.instanceCounter}_${Date.now()}`;
    
    this.logger.info(`Creating new WSL2 instance: ${instanceId}`);

    try {
      // Check if WSL is available
      await this._checkWSLAvailability();
      
      // Create instance configuration
      const instance = {
        id: instanceId,
        status: 'creating',
        createdAt: new Date().toISOString(),
        lastUsed: null,
        currentTask: null,
        resourceUsage: {
          memory: 0,
          cpu: 0
        },
        health: 'unknown',
        config: {
          distribution: this.config.wsl.distribution,
          user: this.config.wsl.user,
          workingDir: this.config.wsl.workingDir
        }
      };

      this.instances.set(instanceId, instance);

      // Initialize the instance
      await this._initializeInstance(instance);
      
      // Mark as available
      instance.status = 'available';
      instance.health = 'healthy';
      this.availableInstances.add(instanceId);

      this.logger.info(`WSL2 instance created successfully: ${instanceId}`);
      this.emit('instanceCreated', instance);

      return instance;
    } catch (error) {
      this.logger.error(`Failed to create WSL2 instance ${instanceId}:`, error);
      
      // Cleanup failed instance
      this.instances.delete(instanceId);
      this.availableInstances.delete(instanceId);
      
      throw error;
    }
  }

  /**
   * Wait for an available instance
   * @returns {Promise<Object>} Available instance
   */
  async _waitForAvailableInstance() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for available instance'));
      }, this.config.instanceTimeout);

      const checkAvailable = () => {
        const instance = this._findAvailableInstance();
        if (instance) {
          clearTimeout(timeout);
          resolve(instance);
        } else {
          setTimeout(checkAvailable, 1000);
        }
      };

      checkAvailable();
    });
  }

  /**
   * Allocate instance to task
   * @param {Object} instance - Instance to allocate
   * @param {Object} task - Task to assign
   */
  async _allocateInstanceToTask(instance, task) {
    instance.currentTask = task.id;
    instance.status = 'busy';
    instance.lastUsed = new Date().toISOString();
    
    this.availableInstances.delete(instance.id);
    this.busyInstances.add(instance.id);
  }

  /**
   * Check WSL availability
   */
  async _checkWSLAvailability() {
    try {
      const { stdout } = await execAsync('wsl --list --quiet');
      if (!stdout.includes(this.config.wsl.distribution)) {
        throw new Error(`WSL distribution '${this.config.wsl.distribution}' not found`);
      }
    } catch (error) {
      throw new Error(`WSL not available: ${error.message}`);
    }
  }

  /**
   * Initialize a WSL2 instance
   * @param {Object} instance - Instance to initialize
   */
  async _initializeInstance(instance) {
    try {
      // Test WSL connection
      await this._executeWSLCommand(instance, 'echo "WSL instance ready"');
      
      // Create working directory
      await this._executeWSLCommand(instance, `mkdir -p ${instance.config.workingDir}`);
      
      // Install/update Claude Code if needed
      await this._ensureClaudeCodeInstalled(instance);
      
      this.logger.info(`Instance initialized: ${instance.id}`);
    } catch (error) {
      throw new Error(`Instance initialization failed: ${error.message}`);
    }
  }

  /**
   * Ensure Claude Code is installed on instance
   * @param {Object} instance - Instance to check
   */
  async _ensureClaudeCodeInstalled(instance) {
    try {
      // Check if Claude Code is installed
      await this._executeWSLCommand(instance, 'which claude-code');
      this.logger.debug(`Claude Code already installed on instance: ${instance.id}`);
    } catch (error) {
      // Install Claude Code
      this.logger.info(`Installing Claude Code on instance: ${instance.id}`);
      
      // This would be the actual installation command
      // For now, simulate installation
      await this._executeWSLCommand(instance, 'echo "Installing Claude Code..."');
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate installation time
    }
  }

  /**
   * Prepare workspace for task execution
   * @param {Object} instance - Instance to prepare
   * @param {Object} task - Task data
   */
  async _prepareWorkspace(instance, task) {
    const workspaceDir = `${instance.config.workingDir}/${task.id}`;
    
    try {
      // Create task-specific workspace
      await this._executeWSLCommand(instance, `mkdir -p ${workspaceDir}`);
      
      // Set workspace permissions
      await this._executeWSLCommand(instance, `chmod 755 ${workspaceDir}`);
      
      this.logger.debug(`Workspace prepared: ${workspaceDir}`);
    } catch (error) {
      throw new Error(`Workspace preparation failed: ${error.message}`);
    }
  }

  /**
   * Clone repository in WSL2 instance
   * @param {Object} instance - Instance to use
   * @param {Object} task - Task with repository data
   */
  async _cloneRepository(instance, task) {
    const workspaceDir = `${instance.config.workingDir}/${task.id}`;
    const repoDir = `${workspaceDir}/repo`;
    
    try {
      // Clone repository
      const cloneCommand = `cd ${workspaceDir} && git clone ${task.data.cloneUrl} repo`;
      await this._executeWSLCommand(instance, cloneCommand);
      
      // Checkout specific branch/commit
      if (task.data.branch) {
        await this._executeWSLCommand(instance, `cd ${repoDir} && git checkout ${task.data.branch}`);
      }
      
      if (task.data.sha) {
        await this._executeWSLCommand(instance, `cd ${repoDir} && git checkout ${task.data.sha}`);
      }
      
      this.logger.debug(`Repository cloned: ${task.data.repository}`);
    } catch (error) {
      throw new Error(`Repository cloning failed: ${error.message}`);
    }
  }

  /**
   * Run Claude Code on the instance
   * @param {Object} instance - Instance to use
   * @param {Object} task - Task to execute
   * @returns {Promise<Object>} Execution result
   */
  async _runClaudeCode(instance, task) {
    const workspaceDir = `${instance.config.workingDir}/${task.id}`;
    const repoDir = `${workspaceDir}/repo`;
    
    try {
      // Prepare Claude Code command
      const command = `cd ${repoDir} && claude-code --repo ${task.data.cloneUrl} --branch ${task.data.branch}`;
      
      // Execute Claude Code with timeout
      const result = await this._executeWSLCommandWithTimeout(
        instance, 
        command, 
        this.config.claudeCode.timeout
      );
      
      return {
        success: true,
        output: result.stdout,
        error: result.stderr,
        exitCode: 0,
        executedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error.message,
        exitCode: error.code || 1,
        executedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Cleanup workspace after task completion
   * @param {Object} instance - Instance to cleanup
   * @param {Object} task - Completed task
   */
  async _cleanupWorkspace(instance, task) {
    const workspaceDir = `${instance.config.workingDir}/${task.id}`;
    
    try {
      // Remove task workspace
      await this._executeWSLCommand(instance, `rm -rf ${workspaceDir}`);
      
      this.logger.debug(`Workspace cleaned up: ${workspaceDir}`);
    } catch (error) {
      this.logger.warn(`Workspace cleanup failed: ${error.message}`);
    }
  }

  /**
   * Execute command in WSL2 instance
   * @param {Object} instance - Instance to use
   * @param {string} command - Command to execute
   * @returns {Promise<Object>} Command result
   */
  async _executeWSLCommand(instance, command) {
    const wslCommand = `wsl -d ${instance.config.distribution} -u ${instance.config.user} -- ${command}`;
    
    try {
      const result = await execAsync(wslCommand);
      return result;
    } catch (error) {
      this.logger.error(`WSL command failed on instance ${instance.id}:`, {
        command: wslCommand,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Execute command with timeout
   * @param {Object} instance - Instance to use
   * @param {string} command - Command to execute
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<Object>} Command result
   */
  async _executeWSLCommandWithTimeout(instance, command, timeout) {
    return new Promise((resolve, reject) => {
      const wslCommand = `wsl -d ${instance.config.distribution} -u ${instance.config.user} -- ${command}`;
      
      const child = spawn('wsl', [
        '-d', instance.config.distribution,
        '-u', instance.config.user,
        '--', command
      ]);

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      const timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Command timeout after ${timeout}ms`));
      }, timeout);

      child.on('close', (code) => {
        clearTimeout(timeoutId);
        
        if (code === 0) {
          resolve({ stdout, stderr, exitCode: code });
        } else {
          const error = new Error(`Command failed with exit code ${code}`);
          error.code = code;
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  /**
   * Start monitoring instances
   */
  _startMonitoring() {
    setInterval(async () => {
      await this._monitorInstances();
    }, 30000); // Monitor every 30 seconds
  }

  /**
   * Monitor instance health and resource usage
   */
  async _monitorInstances() {
    for (const [instanceId, instance] of this.instances.entries()) {
      try {
        // Check instance health
        await this._executeWSLCommand(instance, 'echo "health check"');
        instance.health = 'healthy';
        
        // Get resource usage (simplified)
        instance.resourceUsage = {
          memory: Math.random() * 100, // Mock data
          cpu: Math.random() * 100,
          lastChecked: new Date().toISOString()
        };
        
      } catch (error) {
        this.logger.warn(`Instance health check failed: ${instanceId}`, error);
        instance.health = 'unhealthy';
        
        // Remove unhealthy instances from available pool
        this.availableInstances.delete(instanceId);
      }
    }
  }

  /**
   * Shutdown all instances
   */
  async shutdown() {
    this.logger.info('Shutting down WSL2 instance manager');
    
    // Release all instances
    for (const instanceId of this.instances.keys()) {
      await this.releaseInstance(instanceId);
    }
    
    this.instances.clear();
    this.availableInstances.clear();
    this.busyInstances.clear();
    
    this.logger.info('WSL2 instance manager shutdown complete');
  }

  /**
   * Get manager statistics
   * @returns {Object} Statistics
   */
  getStatistics() {
    return {
      totalInstances: this.instances.size,
      availableInstances: this.availableInstances.size,
      busyInstances: this.busyInstances.size,
      maxInstances: this.config.maxInstances,
      healthyInstances: Array.from(this.instances.values()).filter(i => i.health === 'healthy').length,
      unhealthyInstances: Array.from(this.instances.values()).filter(i => i.health === 'unhealthy').length
    };
  }
}

export default WSL2InstanceManager;

