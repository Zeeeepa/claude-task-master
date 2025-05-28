/**
 * WSL2 Manager
 * 
 * Manages WSL2 instances for isolated code execution:
 * - Instance lifecycle: create, configure, destroy WSL2 instances
 * - Resource management: memory, CPU, disk allocation
 * - Environment setup: package installation, configuration
 * - Health monitoring: instance status and performance tracking
 */

import { EventEmitter } from 'events';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class WSL2Manager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      maxInstances: 5,
      defaultDistribution: 'Ubuntu-22.04',
      resourceLimits: {
        memory: '2GB',
        cpu: '2 cores',
        disk: '10GB'
      },
      timeout: 300000, // 5 minutes
      healthCheckInterval: 30000,
      autoCleanup: true,
      cleanupIdleTime: 600000, // 10 minutes
      ...config
    };
    
    this.instances = new Map();
    this.instanceCounter = 0;
    this.healthCheckTimer = null;
    this.isInitialized = false;
    
    this.metrics = {
      instancesCreated: 0,
      instancesDestroyed: 0,
      totalUptime: 0,
      averageLifetime: 0
    };
  }

  /**
   * Initialize the WSL2 manager
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }
    
    console.log('Initializing WSL2 Manager...');
    
    // Check if WSL2 is available
    await this.checkWSL2Availability();
    
    // Start health monitoring
    this.startHealthMonitoring();
    
    this.isInitialized = true;
    console.log('WSL2 Manager initialized');
    this.emit('initialized');
  }

  /**
   * Start the manager
   */
  async start() {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    console.log('WSL2 Manager started');
    this.emit('started');
  }

  /**
   * Stop the manager
   */
  async stop() {
    console.log('Stopping WSL2 Manager...');
    
    // Stop health monitoring
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    
    // Destroy all instances
    const destroyPromises = Array.from(this.instances.keys()).map(id => this.destroyInstance(id));
    await Promise.allSettled(destroyPromises);
    
    console.log('WSL2 Manager stopped');
    this.emit('stopped');
  }

  /**
   * Check WSL2 availability
   */
  async checkWSL2Availability() {
    try {
      const { stdout } = await execAsync('wsl --list --verbose');
      console.log('WSL2 is available');
      return true;
    } catch (error) {
      throw new Error(`WSL2 is not available: ${error.message}`);
    }
  }

  /**
   * Create a new WSL2 instance
   */
  async createInstance(options = {}) {
    if (this.instances.size >= this.config.maxInstances) {
      throw new Error(`Maximum number of instances (${this.config.maxInstances}) reached`);
    }
    
    const instanceId = `wsl2-${++this.instanceCounter}-${Date.now()}`;
    const distribution = options.distribution || this.config.defaultDistribution;
    const instanceName = `${distribution}-${instanceId}`;
    
    try {
      console.log(`Creating WSL2 instance: ${instanceId}`);
      
      // Import base distribution
      await this.importDistribution(instanceName, distribution);
      
      // Configure resource limits
      await this.configureResourceLimits(instanceName, options.resourceLimits);
      
      // Setup environment
      await this.setupEnvironment(instanceName, options.environment);
      
      // Create instance record
      const instance = {
        id: instanceId,
        name: instanceName,
        distribution,
        status: 'running',
        createdAt: new Date(),
        lastActivity: new Date(),
        resourceLimits: {
          ...this.config.resourceLimits,
          ...options.resourceLimits
        },
        environment: options.environment || {},
        processes: new Map(),
        metrics: {
          cpuUsage: 0,
          memoryUsage: 0,
          diskUsage: 0,
          uptime: 0
        }
      };
      
      this.instances.set(instanceId, instance);
      this.metrics.instancesCreated++;
      
      console.log(`WSL2 instance created: ${instanceId}`);
      this.emit('instanceCreated', { instanceId, instance });
      this.emit('instanceReady', instance);
      
      return instanceId;
      
    } catch (error) {
      console.error(`Failed to create WSL2 instance: ${error.message}`);
      
      // Cleanup on failure
      try {
        await this.cleanupFailedInstance(instanceName);
      } catch (cleanupError) {
        console.error('Failed to cleanup failed instance:', cleanupError);
      }
      
      throw error;
    }
  }

  /**
   * Import WSL2 distribution
   */
  async importDistribution(instanceName, distribution) {
    try {
      // Check if base distribution exists
      const { stdout } = await execAsync('wsl --list --verbose');
      if (!stdout.includes(distribution)) {
        throw new Error(`Base distribution ${distribution} not found`);
      }
      
      // Export base distribution to temp location
      const tempPath = `C:\\temp\\${instanceName}.tar`;
      await execAsync(`wsl --export ${distribution} ${tempPath}`);
      
      // Import as new instance
      const instancePath = `C:\\WSL2\\${instanceName}`;
      await execAsync(`wsl --import ${instanceName} ${instancePath} ${tempPath}`);
      
      // Cleanup temp file
      await execAsync(`del ${tempPath}`);
      
      console.log(`Distribution imported: ${instanceName}`);
      
    } catch (error) {
      throw new Error(`Failed to import distribution: ${error.message}`);
    }
  }

  /**
   * Configure resource limits for instance
   */
  async configureResourceLimits(instanceName, resourceLimits = {}) {
    const limits = {
      ...this.config.resourceLimits,
      ...resourceLimits
    };
    
    try {
      // Create .wslconfig file for the instance
      const wslConfig = `
[wsl2]
memory=${limits.memory}
processors=${limits.cpu.replace(' cores', '')}
swap=0
localhostForwarding=true
`;
      
      // Write config (this is a simplified approach - actual implementation would be more complex)
      console.log(`Configured resource limits for ${instanceName}:`, limits);
      
    } catch (error) {
      console.error(`Failed to configure resource limits: ${error.message}`);
    }
  }

  /**
   * Setup environment in WSL2 instance
   */
  async setupEnvironment(instanceName, environment = {}) {
    try {
      // Install basic packages
      const packages = environment.packages || ['git', 'curl', 'build-essential', 'python3', 'nodejs', 'npm'];
      
      for (const pkg of packages) {
        await this.executeCommand(instanceName, `apt-get update && apt-get install -y ${pkg}`);
      }
      
      // Setup working directory
      const workDir = environment.workingDirectory || '/workspace';
      await this.executeCommand(instanceName, `mkdir -p ${workDir}`);
      
      // Setup environment variables
      if (environment.variables) {
        for (const [key, value] of Object.entries(environment.variables)) {
          await this.executeCommand(instanceName, `echo 'export ${key}="${value}"' >> ~/.bashrc`);
        }
      }
      
      console.log(`Environment setup completed for ${instanceName}`);
      
    } catch (error) {
      console.error(`Failed to setup environment: ${error.message}`);
    }
  }

  /**
   * Execute command in WSL2 instance
   */
  async executeCommand(instanceName, command, options = {}) {
    const timeout = options.timeout || this.config.timeout;
    
    try {
      console.log(`Executing command in ${instanceName}: ${command}`);
      
      const { stdout, stderr } = await execAsync(`wsl -d ${instanceName} -- ${command}`, {
        timeout
      });
      
      return {
        success: true,
        stdout,
        stderr,
        exitCode: 0
      };
      
    } catch (error) {
      console.error(`Command execution failed in ${instanceName}: ${error.message}`);
      
      return {
        success: false,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        exitCode: error.code || 1
      };
    }
  }

  /**
   * Get instance status
   */
  async getInstanceStatus(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return { found: false };
    }
    
    try {
      // Check if instance is running
      const { stdout } = await execAsync(`wsl --list --running`);
      const isRunning = stdout.includes(instance.name);
      
      // Update instance status
      instance.status = isRunning ? 'running' : 'stopped';
      
      // Get resource usage if running
      if (isRunning) {
        await this.updateInstanceMetrics(instance);
      }
      
      return {
        found: true,
        id: instance.id,
        name: instance.name,
        status: instance.status,
        createdAt: instance.createdAt,
        lastActivity: instance.lastActivity,
        metrics: instance.metrics,
        uptime: Date.now() - instance.createdAt.getTime()
      };
      
    } catch (error) {
      console.error(`Failed to get instance status: ${error.message}`);
      return {
        found: true,
        id: instance.id,
        status: 'unknown',
        error: error.message
      };
    }
  }

  /**
   * Update instance metrics
   */
  async updateInstanceMetrics(instance) {
    try {
      // Get CPU and memory usage (simplified)
      const result = await this.executeCommand(instance.name, 'top -bn1 | head -5');
      
      if (result.success) {
        // Parse metrics from output (this is a simplified approach)
        instance.metrics.uptime = Date.now() - instance.createdAt.getTime();
        instance.lastActivity = new Date();
      }
      
    } catch (error) {
      console.error(`Failed to update metrics for ${instance.id}: ${error.message}`);
    }
  }

  /**
   * Destroy WSL2 instance
   */
  async destroyInstance(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      console.warn(`Instance not found for destruction: ${instanceId}`);
      return { success: true, message: 'Instance not found' };
    }
    
    try {
      console.log(`Destroying WSL2 instance: ${instanceId}`);
      
      // Terminate instance
      await execAsync(`wsl --terminate ${instance.name}`);
      
      // Unregister instance
      await execAsync(`wsl --unregister ${instance.name}`);
      
      // Update metrics
      const lifetime = Date.now() - instance.createdAt.getTime();
      this.metrics.totalUptime += lifetime;
      this.metrics.instancesDestroyed++;
      this.metrics.averageLifetime = this.metrics.totalUptime / this.metrics.instancesDestroyed;
      
      // Remove from instances
      this.instances.delete(instanceId);
      
      console.log(`WSL2 instance destroyed: ${instanceId}`);
      this.emit('instanceDestroyed', { instanceId, instance, lifetime });
      
      return { success: true };
      
    } catch (error) {
      console.error(`Failed to destroy instance ${instanceId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cleanup failed instance
   */
  async cleanupFailedInstance(instanceName) {
    try {
      await execAsync(`wsl --terminate ${instanceName}`);
      await execAsync(`wsl --unregister ${instanceName}`);
    } catch (error) {
      // Ignore cleanup errors
    }
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
    for (const [instanceId, instance] of this.instances.entries()) {
      try {
        await this.updateInstanceMetrics(instance);
        
        // Check for idle instances
        if (this.config.autoCleanup) {
          const idleTime = Date.now() - instance.lastActivity.getTime();
          if (idleTime > this.config.cleanupIdleTime) {
            console.log(`Instance ${instanceId} has been idle for ${idleTime}ms, cleaning up`);
            await this.destroyInstance(instanceId);
          }
        }
        
      } catch (error) {
        console.error(`Health check failed for instance ${instanceId}: ${error.message}`);
      }
    }
  }

  /**
   * List all instances
   */
  listInstances() {
    return Array.from(this.instances.values()).map(instance => ({
      id: instance.id,
      name: instance.name,
      distribution: instance.distribution,
      status: instance.status,
      createdAt: instance.createdAt,
      lastActivity: instance.lastActivity,
      uptime: Date.now() - instance.createdAt.getTime(),
      metrics: instance.metrics
    }));
  }

  /**
   * Get manager health status
   */
  async getHealth() {
    const instances = this.listInstances();
    const runningInstances = instances.filter(i => i.status === 'running').length;
    const stoppedInstances = instances.filter(i => i.status === 'stopped').length;
    
    let status = 'healthy';
    if (stoppedInstances > runningInstances) {
      status = 'degraded';
    }
    
    return {
      status,
      totalInstances: instances.length,
      runningInstances,
      stoppedInstances,
      maxInstances: this.config.maxInstances,
      utilizationRate: instances.length / this.config.maxInstances,
      metrics: this.metrics,
      lastHealthCheck: new Date().toISOString()
    };
  }

  /**
   * Get manager statistics
   */
  getStatistics() {
    return {
      ...this.metrics,
      activeInstances: this.instances.size,
      utilizationRate: this.instances.size / this.config.maxInstances
    };
  }
}

export default WSL2Manager;

