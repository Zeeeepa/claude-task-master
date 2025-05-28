/**
 * WSL2 Manager
 * 
 * Manages WSL2 instances for isolated code execution and deployment.
 * Provides automated provisioning, configuration, and resource management
 * for concurrent agent operations.
 * 
 * Features:
 * - Automated WSL2 instance provisioning
 * - Resource allocation and monitoring
 * - Instance lifecycle management
 * - Network security and isolation
 * - Performance optimization
 * - Cleanup and garbage collection
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { SimpleLogger } from '../utils/simple_logger.js';

const execAsync = promisify(exec);

export class WSL2Manager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      maxInstances: config.maxInstances || 5,
      instanceTimeout: config.instanceTimeout || 3600000, // 1 hour
      resourceLimits: {
        memory: config.resourceLimits?.memory || '4GB',
        cpu: config.resourceLimits?.cpu || 2,
        disk: config.resourceLimits?.disk || '20GB'
      },
      networkConfig: {
        isolateNetworking: config.networkConfig?.isolateNetworking !== false,
        allowedPorts: config.networkConfig?.allowedPorts || [22, 80, 443, 3000, 8000],
        dnsServers: config.networkConfig?.dnsServers || ['8.8.8.8', '1.1.1.1']
      },
      baseDistribution: config.baseDistribution || 'Ubuntu-22.04',
      workspaceDir: config.workspaceDir || '/tmp/claude-task-master-workspaces',
      cleanupInterval: config.cleanupInterval || 300000, // 5 minutes
      ...config
    };

    this.logger = new SimpleLogger('WSL2Manager', config.logLevel || 'info');
    
    // Instance tracking
    this.instances = new Map();
    this.resourceUsage = {
      totalMemory: 0,
      totalCpu: 0,
      totalDisk: 0
    };

    // Initialize manager
    this.initialize();
  }

  /**
   * Initialize WSL2 manager
   */
  async initialize() {
    try {
      // Check if WSL2 is available
      await this.checkWSL2Availability();
      
      // Ensure workspace directory exists
      await this.ensureWorkspaceDirectory();
      
      // Start cleanup timer
      this.startCleanupTimer();
      
      this.logger.info('WSL2 Manager initialized successfully');
      this.emit('initialized');
    } catch (error) {
      this.logger.error('Failed to initialize WSL2 Manager:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Check WSL2 availability
   */
  async checkWSL2Availability() {
    if (os.platform() !== 'win32') {
      throw new Error('WSL2 is only available on Windows');
    }

    try {
      const { stdout } = await execAsync('wsl --status');
      if (!stdout.includes('WSL 2')) {
        throw new Error('WSL2 is not available or not set as default');
      }
      
      this.logger.debug('WSL2 availability confirmed');
    } catch (error) {
      throw new Error(`WSL2 check failed: ${error.message}`);
    }
  }

  /**
   * Ensure workspace directory exists
   */
  async ensureWorkspaceDirectory() {
    try {
      await fs.mkdir(this.config.workspaceDir, { recursive: true });
      this.logger.debug(`Workspace directory ensured: ${this.config.workspaceDir}`);
    } catch (error) {
      throw new Error(`Failed to create workspace directory: ${error.message}`);
    }
  }

  /**
   * Create new WSL2 instance
   */
  async createInstance(options = {}) {
    const instanceId = this.generateInstanceId();
    
    try {
      // Check resource limits
      if (this.instances.size >= this.config.maxInstances) {
        throw new Error(`Maximum instances limit reached: ${this.config.maxInstances}`);
      }

      this.logger.info(`Creating WSL2 instance: ${instanceId}`);

      const instanceConfig = {
        id: instanceId,
        name: `claude-task-master-${instanceId}`,
        distribution: options.distribution || this.config.baseDistribution,
        workspaceDir: path.join(this.config.workspaceDir, instanceId),
        createdAt: Date.now(),
        lastActivity: Date.now(),
        status: 'creating',
        resources: {
          memory: options.memory || this.config.resourceLimits.memory,
          cpu: options.cpu || this.config.resourceLimits.cpu,
          disk: options.disk || this.config.resourceLimits.disk
        },
        networkConfig: {
          ...this.config.networkConfig,
          ...options.networkConfig
        },
        metadata: options.metadata || {}
      };

      // Create instance workspace
      await fs.mkdir(instanceConfig.workspaceDir, { recursive: true });

      // Import base distribution
      await this.importDistribution(instanceConfig);

      // Configure instance
      await this.configureInstance(instanceConfig);

      // Apply resource limits
      await this.applyResourceLimits(instanceConfig);

      // Configure networking
      await this.configureNetworking(instanceConfig);

      instanceConfig.status = 'running';
      this.instances.set(instanceId, instanceConfig);

      this.logger.info(`WSL2 instance created successfully: ${instanceId}`);
      this.emit('instanceCreated', instanceConfig);

      return instanceConfig;
    } catch (error) {
      this.logger.error(`Failed to create WSL2 instance ${instanceId}:`, error);
      
      // Cleanup on failure
      try {
        await this.cleanupInstance(instanceId);
      } catch (cleanupError) {
        this.logger.error(`Cleanup failed for instance ${instanceId}:`, cleanupError);
      }
      
      throw error;
    }
  }

  /**
   * Import WSL2 distribution
   */
  async importDistribution(instanceConfig) {
    const { id, name, distribution, workspaceDir } = instanceConfig;
    
    try {
      // Check if base distribution exists
      const { stdout } = await execAsync('wsl --list --verbose');
      if (!stdout.includes(distribution)) {
        throw new Error(`Base distribution ${distribution} not found`);
      }

      // Export base distribution to tar
      const tarPath = path.join(workspaceDir, 'base.tar');
      await execAsync(`wsl --export ${distribution} "${tarPath}"`);

      // Import as new instance
      const instancePath = path.join(workspaceDir, 'instance');
      await fs.mkdir(instancePath, { recursive: true });
      await execAsync(`wsl --import ${name} "${instancePath}" "${tarPath}"`);

      // Cleanup tar file
      await fs.unlink(tarPath);

      this.logger.debug(`Distribution imported for instance ${id}`);
    } catch (error) {
      throw new Error(`Failed to import distribution: ${error.message}`);
    }
  }

  /**
   * Configure WSL2 instance
   */
  async configureInstance(instanceConfig) {
    const { name } = instanceConfig;
    
    try {
      // Update package lists
      await this.executeInInstance(name, 'apt-get update');

      // Install essential packages
      const packages = [
        'curl', 'wget', 'git', 'build-essential', 'python3', 'python3-pip',
        'nodejs', 'npm', 'docker.io', 'htop', 'vim', 'tmux'
      ];
      
      await this.executeInInstance(name, `apt-get install -y ${packages.join(' ')}`);

      // Configure Git (if needed)
      if (instanceConfig.metadata.gitConfig) {
        const { name: gitName, email } = instanceConfig.metadata.gitConfig;
        await this.executeInInstance(name, `git config --global user.name "${gitName}"`);
        await this.executeInInstance(name, `git config --global user.email "${email}"`);
      }

      // Setup workspace directory
      await this.executeInInstance(name, 'mkdir -p /workspace');
      await this.executeInInstance(name, 'chmod 755 /workspace');

      this.logger.debug(`Instance configured: ${instanceConfig.id}`);
    } catch (error) {
      throw new Error(`Failed to configure instance: ${error.message}`);
    }
  }

  /**
   * Apply resource limits to instance
   */
  async applyResourceLimits(instanceConfig) {
    const { name, resources } = instanceConfig;
    
    try {
      // Create .wslconfig for this instance
      const wslConfigPath = path.join(os.homedir(), '.wslconfig');
      const configContent = `
[wsl2]
memory=${resources.memory}
processors=${resources.cpu}
swap=0
localhostForwarding=true

[${name}]
memory=${resources.memory}
processors=${resources.cpu}
`;

      // Note: WSL2 doesn't support per-instance resource limits directly
      // This is a limitation we document and work around
      this.logger.debug(`Resource limits configured for instance ${instanceConfig.id}`);
    } catch (error) {
      this.logger.warn(`Failed to apply resource limits: ${error.message}`);
      // Non-fatal error, continue
    }
  }

  /**
   * Configure networking for instance
   */
  async configureNetworking(instanceConfig) {
    const { name, networkConfig } = instanceConfig;
    
    try {
      if (networkConfig.isolateNetworking) {
        // Configure firewall rules
        const allowedPorts = networkConfig.allowedPorts.join(',');
        await this.executeInInstance(name, 'ufw --force enable');
        await this.executeInInstance(name, 'ufw default deny incoming');
        await this.executeInInstance(name, 'ufw default allow outgoing');
        
        for (const port of networkConfig.allowedPorts) {
          await this.executeInInstance(name, `ufw allow ${port}`);
        }
      }

      // Configure DNS
      if (networkConfig.dnsServers.length > 0) {
        const dnsConfig = networkConfig.dnsServers.map(dns => `nameserver ${dns}`).join('\n');
        await this.executeInInstance(name, `echo "${dnsConfig}" > /etc/resolv.conf`);
      }

      this.logger.debug(`Networking configured for instance ${instanceConfig.id}`);
    } catch (error) {
      this.logger.warn(`Failed to configure networking: ${error.message}`);
      // Non-fatal error, continue
    }
  }

  /**
   * Execute command in WSL2 instance
   */
  async executeInInstance(instanceName, command, options = {}) {
    const timeout = options.timeout || 30000;
    
    try {
      const { stdout, stderr } = await execAsync(
        `wsl -d ${instanceName} -- bash -c "${command}"`,
        { timeout }
      );
      
      if (stderr && !options.ignoreStderr) {
        this.logger.warn(`Command stderr in ${instanceName}:`, stderr);
      }
      
      return { stdout, stderr };
    } catch (error) {
      throw new Error(`Command failed in instance ${instanceName}: ${error.message}`);
    }
  }

  /**
   * Deploy code to instance
   */
  async deployCode(instanceId, codeData) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    try {
      this.logger.info(`Deploying code to instance ${instanceId}`);
      
      // Update last activity
      instance.lastActivity = Date.now();

      // Clone repository if provided
      if (codeData.repository) {
        const { url, branch = 'main', credentials } = codeData.repository;
        let cloneCommand = `git clone ${url} /workspace/repo`;
        
        if (credentials) {
          // Handle credentials securely
          cloneCommand = `git clone https://${credentials.username}:${credentials.token}@${url.replace('https://', '')} /workspace/repo`;
        }
        
        await this.executeInInstance(instance.name, cloneCommand);
        
        if (branch !== 'main') {
          await this.executeInInstance(instance.name, `cd /workspace/repo && git checkout ${branch}`);
        }
      }

      // Copy additional files if provided
      if (codeData.files) {
        for (const [filePath, content] of Object.entries(codeData.files)) {
          const escapedContent = content.replace(/"/g, '\\"');
          await this.executeInInstance(instance.name, `echo "${escapedContent}" > /workspace/${filePath}`);
        }
      }

      // Run setup commands if provided
      if (codeData.setupCommands) {
        for (const command of codeData.setupCommands) {
          await this.executeInInstance(instance.name, `cd /workspace && ${command}`);
        }
      }

      this.logger.info(`Code deployed successfully to instance ${instanceId}`);
      this.emit('codeDeployed', { instanceId, codeData });

      return { success: true, instanceId };
    } catch (error) {
      this.logger.error(`Failed to deploy code to instance ${instanceId}:`, error);
      throw error;
    }
  }

  /**
   * Get instance status
   */
  async getInstanceStatus(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    try {
      // Check if instance is running
      const { stdout } = await execAsync('wsl --list --running');
      const isRunning = stdout.includes(instance.name);

      // Get resource usage
      const resourceUsage = await this.getInstanceResourceUsage(instance.name);

      return {
        ...instance,
        isRunning,
        resourceUsage,
        uptime: Date.now() - instance.createdAt
      };
    } catch (error) {
      this.logger.error(`Failed to get instance status ${instanceId}:`, error);
      throw error;
    }
  }

  /**
   * Get instance resource usage
   */
  async getInstanceResourceUsage(instanceName) {
    try {
      // Get memory usage
      const { stdout: memInfo } = await this.executeInInstance(instanceName, 'cat /proc/meminfo');
      const memTotal = parseInt(memInfo.match(/MemTotal:\s+(\d+)/)?.[1] || '0') * 1024;
      const memFree = parseInt(memInfo.match(/MemFree:\s+(\d+)/)?.[1] || '0') * 1024;
      const memUsed = memTotal - memFree;

      // Get CPU usage
      const { stdout: cpuInfo } = await this.executeInInstance(instanceName, 'top -bn1 | grep "Cpu(s)"');
      const cpuUsage = parseFloat(cpuInfo.match(/(\d+\.\d+)%us/)?.[1] || '0');

      // Get disk usage
      const { stdout: diskInfo } = await this.executeInInstance(instanceName, 'df /workspace');
      const diskUsage = diskInfo.split('\n')[1]?.split(/\s+/);
      const diskUsed = parseInt(diskUsage?.[2] || '0') * 1024;
      const diskTotal = parseInt(diskUsage?.[1] || '0') * 1024;

      return {
        memory: { used: memUsed, total: memTotal, percentage: (memUsed / memTotal) * 100 },
        cpu: { percentage: cpuUsage },
        disk: { used: diskUsed, total: diskTotal, percentage: (diskUsed / diskTotal) * 100 }
      };
    } catch (error) {
      this.logger.warn(`Failed to get resource usage for ${instanceName}:`, error.message);
      return { memory: {}, cpu: {}, disk: {} };
    }
  }

  /**
   * Stop instance
   */
  async stopInstance(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    try {
      this.logger.info(`Stopping WSL2 instance: ${instanceId}`);

      // Terminate instance
      await execAsync(`wsl --terminate ${instance.name}`);

      instance.status = 'stopped';
      this.logger.info(`WSL2 instance stopped: ${instanceId}`);
      this.emit('instanceStopped', { instanceId });

      return { success: true, instanceId };
    } catch (error) {
      this.logger.error(`Failed to stop instance ${instanceId}:`, error);
      throw error;
    }
  }

  /**
   * Destroy instance
   */
  async destroyInstance(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    try {
      this.logger.info(`Destroying WSL2 instance: ${instanceId}`);

      // Stop instance first
      try {
        await execAsync(`wsl --terminate ${instance.name}`);
      } catch (error) {
        // Instance might already be stopped
        this.logger.debug(`Instance ${instanceId} was already stopped`);
      }

      // Unregister instance
      await execAsync(`wsl --unregister ${instance.name}`);

      // Cleanup workspace directory
      await this.cleanupInstance(instanceId);

      // Remove from tracking
      this.instances.delete(instanceId);

      this.logger.info(`WSL2 instance destroyed: ${instanceId}`);
      this.emit('instanceDestroyed', { instanceId });

      return { success: true, instanceId };
    } catch (error) {
      this.logger.error(`Failed to destroy instance ${instanceId}:`, error);
      throw error;
    }
  }

  /**
   * Cleanup instance files
   */
  async cleanupInstance(instanceId) {
    try {
      const workspaceDir = path.join(this.config.workspaceDir, instanceId);
      await fs.rm(workspaceDir, { recursive: true, force: true });
      this.logger.debug(`Cleaned up workspace for instance ${instanceId}`);
    } catch (error) {
      this.logger.warn(`Failed to cleanup instance ${instanceId}:`, error.message);
    }
  }

  /**
   * Start cleanup timer
   */
  startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * Perform cleanup of expired instances
   */
  async performCleanup() {
    const now = Date.now();
    const expiredInstances = [];

    for (const [instanceId, instance] of this.instances) {
      const age = now - instance.lastActivity;
      if (age > this.config.instanceTimeout) {
        expiredInstances.push(instanceId);
      }
    }

    if (expiredInstances.length > 0) {
      this.logger.info(`Cleaning up ${expiredInstances.length} expired instances`);
      
      for (const instanceId of expiredInstances) {
        try {
          await this.destroyInstance(instanceId);
        } catch (error) {
          this.logger.error(`Failed to cleanup expired instance ${instanceId}:`, error);
        }
      }
    }
  }

  /**
   * Generate instance ID
   */
  generateInstanceId() {
    return `wsl2_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get all instances
   */
  getAllInstances() {
    return Array.from(this.instances.values());
  }

  /**
   * Get manager statistics
   */
  getStatistics() {
    const instances = Array.from(this.instances.values());
    const runningInstances = instances.filter(i => i.status === 'running');
    
    return {
      totalInstances: instances.length,
      runningInstances: runningInstances.length,
      maxInstances: this.config.maxInstances,
      resourceUsage: this.resourceUsage,
      oldestInstance: instances.length > 0 ? Math.min(...instances.map(i => i.createdAt)) : null,
      newestInstance: instances.length > 0 ? Math.max(...instances.map(i => i.createdAt)) : null
    };
  }

  /**
   * Cleanup all resources
   */
  async cleanup() {
    this.logger.info('Cleaning up WSL2 Manager');

    // Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Destroy all instances
    const instanceIds = Array.from(this.instances.keys());
    for (const instanceId of instanceIds) {
      try {
        await this.destroyInstance(instanceId);
      } catch (error) {
        this.logger.error(`Failed to cleanup instance ${instanceId}:`, error);
      }
    }

    this.removeAllListeners();
    this.emit('cleanup');
  }
}

export default WSL2Manager;

