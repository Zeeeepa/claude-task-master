/**
 * WSL2 Manager
 * 
 * Manages WSL2 instances for isolated PR validation and deployment.
 * Handles instance lifecycle, resource allocation, and security.
 */

const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const execAsync = promisify(exec);

class WSL2Manager {
  constructor(config = {}) {
    this.config = {
      maxInstances: 5,
      resourceLimits: {
        memory: '2GB',
        cpu: '2 cores',
        disk: '10GB'
      },
      timeout: 300000, // 5 minutes
      baseDistribution: 'Ubuntu-22.04',
      workspaceRoot: '/tmp/agentapi-workspaces',
      ...config
    };

    this.instances = new Map();
    this.resourceUsage = {
      memory: 0,
      cpu: 0,
      disk: 0,
      activeInstances: 0
    };

    this.isInitialized = false;
  }

  /**
   * Initialize WSL2 manager
   */
  async initialize() {
    try {
      console.log('Initializing WSL2 Manager...');

      // Check if WSL2 is available
      await this.checkWSL2Availability();

      // Ensure base distribution is installed
      await this.ensureBaseDistribution();

      // Create workspace root directory
      await this.createWorkspaceRoot();

      // Initialize resource monitoring
      this.startResourceMonitoring();

      this.isInitialized = true;
      console.log('WSL2 Manager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize WSL2 Manager:', error);
      throw error;
    }
  }

  /**
   * Check if WSL2 is available on the system
   */
  async checkWSL2Availability() {
    try {
      const { stdout } = await execAsync('wsl --version');
      console.log('WSL2 version:', stdout.trim());
      
      // Check if WSL2 is the default version
      const { stdout: status } = await execAsync('wsl --status');
      if (!status.includes('Version: 2')) {
        throw new Error('WSL2 is not the default version');
      }
    } catch (error) {
      throw new Error(`WSL2 not available: ${error.message}`);
    }
  }

  /**
   * Ensure base distribution is installed
   */
  async ensureBaseDistribution() {
    try {
      const { stdout } = await execAsync('wsl --list --verbose');
      const distributions = stdout.split('\n').filter(line => line.trim());
      
      const hasBaseDistro = distributions.some(line => 
        line.includes(this.config.baseDistribution) && line.includes('Running')
      );

      if (!hasBaseDistro) {
        console.log(`Installing base distribution: ${this.config.baseDistribution}`);
        await execAsync(`wsl --install -d ${this.config.baseDistribution}`);
        
        // Wait for installation to complete
        await this.waitForDistribution(this.config.baseDistribution);
      }
    } catch (error) {
      throw new Error(`Failed to ensure base distribution: ${error.message}`);
    }
  }

  /**
   * Wait for distribution to be ready
   */
  async waitForDistribution(distroName, timeout = 120000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const { stdout } = await execAsync(`wsl -d ${distroName} echo "ready"`);
        if (stdout.trim() === 'ready') {
          return;
        }
      } catch (error) {
        // Distribution not ready yet
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    throw new Error(`Distribution ${distroName} not ready after ${timeout}ms`);
  }

  /**
   * Create workspace root directory
   */
  async createWorkspaceRoot() {
    try {
      await execAsync(`wsl -d ${this.config.baseDistribution} mkdir -p ${this.config.workspaceRoot}`);
      console.log(`Workspace root created: ${this.config.workspaceRoot}`);
    } catch (error) {
      throw new Error(`Failed to create workspace root: ${error.message}`);
    }
  }

  /**
   * Create a new WSL2 instance for deployment
   */
  async createInstance(deploymentId, options = {}) {
    if (!this.isInitialized) {
      throw new Error('WSL2 Manager not initialized');
    }

    if (this.instances.size >= this.config.maxInstances) {
      throw new Error(`Maximum instances limit reached: ${this.config.maxInstances}`);
    }

    const instanceId = `agentapi-${deploymentId}-${crypto.randomBytes(4).toString('hex')}`;
    const workspacePath = `${this.config.workspaceRoot}/${instanceId}`;

    try {
      console.log(`Creating WSL2 instance: ${instanceId}`);

      // Export base distribution to create a new instance
      const exportPath = `/tmp/${instanceId}.tar`;
      await execAsync(`wsl --export ${this.config.baseDistribution} ${exportPath}`);

      // Import as new distribution
      const instancePath = `/tmp/wsl-instances/${instanceId}`;
      await execAsync(`mkdir -p ${instancePath}`);
      await execAsync(`wsl --import ${instanceId} ${instancePath} ${exportPath}`);

      // Clean up export file
      await execAsync(`rm ${exportPath}`);

      // Configure the instance
      await this.configureInstance(instanceId, workspacePath, options);

      // Create instance metadata
      const instance = {
        id: instanceId,
        deploymentId,
        workspacePath,
        createdAt: new Date(),
        status: 'running',
        resourceUsage: {
          memory: 0,
          cpu: 0,
          disk: 0
        },
        processes: new Map(),
        ...options
      };

      this.instances.set(instanceId, instance);
      this.updateResourceUsage();

      console.log(`WSL2 instance created successfully: ${instanceId}`);
      return instance;
    } catch (error) {
      console.error(`Failed to create WSL2 instance: ${error.message}`);
      // Cleanup on failure
      await this.cleanupInstance(instanceId).catch(() => {});
      throw error;
    }
  }

  /**
   * Configure a WSL2 instance
   */
  async configureInstance(instanceId, workspacePath, options) {
    try {
      // Create workspace directory
      await execAsync(`wsl -d ${instanceId} mkdir -p ${workspacePath}`);

      // Install required packages
      const packages = [
        'git',
        'curl',
        'wget',
        'build-essential',
        'python3',
        'python3-pip',
        'nodejs',
        'npm',
        ...(options.additionalPackages || [])
      ];

      console.log(`Installing packages in ${instanceId}: ${packages.join(', ')}`);
      await execAsync(`wsl -d ${instanceId} apt-get update`);
      await execAsync(`wsl -d ${instanceId} apt-get install -y ${packages.join(' ')}`);

      // Configure Git if credentials provided
      if (options.gitConfig) {
        await execAsync(`wsl -d ${instanceId} git config --global user.name "${options.gitConfig.name}"`);
        await execAsync(`wsl -d ${instanceId} git config --global user.email "${options.gitConfig.email}"`);
      }

      // Set resource limits
      await this.setResourceLimits(instanceId);

      console.log(`Instance ${instanceId} configured successfully`);
    } catch (error) {
      throw new Error(`Failed to configure instance ${instanceId}: ${error.message}`);
    }
  }

  /**
   * Set resource limits for an instance
   */
  async setResourceLimits(instanceId) {
    try {
      const limits = this.config.resourceLimits;
      
      // Create WSL configuration file
      const wslConfig = `
[wsl2]
memory=${limits.memory}
processors=${limits.cpu.split(' ')[0]}
swap=0
localhostForwarding=true
`;

      // Write configuration to instance
      const configPath = `/tmp/wsl-instances/${instanceId}/.wslconfig`;
      await fs.writeFile(configPath, wslConfig);

      console.log(`Resource limits set for ${instanceId}: ${JSON.stringify(limits)}`);
    } catch (error) {
      console.error(`Failed to set resource limits for ${instanceId}: ${error.message}`);
    }
  }

  /**
   * Execute command in WSL2 instance
   */
  async executeCommand(instanceId, command, options = {}) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    const {
      workingDirectory = instance.workspacePath,
      timeout = 30000,
      env = {},
      shell = '/bin/bash'
    } = options;

    try {
      const envVars = Object.entries(env)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');

      const fullCommand = `wsl -d ${instanceId} ${shell} -c "cd ${workingDirectory} && ${envVars} ${command}"`;
      
      console.log(`Executing in ${instanceId}: ${command}`);
      
      const { stdout, stderr } = await execAsync(fullCommand, { timeout });
      
      return {
        success: true,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0
      };
    } catch (error) {
      console.error(`Command failed in ${instanceId}: ${error.message}`);
      return {
        success: false,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        exitCode: error.code || 1
      };
    }
  }

  /**
   * Start a long-running process in WSL2 instance
   */
  async startProcess(instanceId, command, options = {}) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    const processId = crypto.randomBytes(8).toString('hex');
    const {
      workingDirectory = instance.workspacePath,
      env = {},
      onOutput,
      onError,
      onExit
    } = options;

    try {
      const envVars = Object.entries(env)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');

      const fullCommand = `wsl -d ${instanceId} bash -c "cd ${workingDirectory} && ${envVars} ${command}"`;
      
      const process = spawn('cmd', ['/c', fullCommand], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Handle process output
      process.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`[${instanceId}:${processId}] ${output}`);
        if (onOutput) onOutput(output);
      });

      process.stderr.on('data', (data) => {
        const error = data.toString();
        console.error(`[${instanceId}:${processId}] ERROR: ${error}`);
        if (onError) onError(error);
      });

      process.on('exit', (code) => {
        console.log(`[${instanceId}:${processId}] Process exited with code: ${code}`);
        instance.processes.delete(processId);
        if (onExit) onExit(code);
      });

      // Store process reference
      instance.processes.set(processId, {
        process,
        command,
        startTime: new Date(),
        workingDirectory
      });

      return {
        processId,
        pid: process.pid
      };
    } catch (error) {
      throw new Error(`Failed to start process in ${instanceId}: ${error.message}`);
    }
  }

  /**
   * Stop a process in WSL2 instance
   */
  async stopProcess(instanceId, processId) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    const processInfo = instance.processes.get(processId);
    if (!processInfo) {
      throw new Error(`Process not found: ${processId}`);
    }

    try {
      processInfo.process.kill('SIGTERM');
      
      // Wait for graceful shutdown
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          processInfo.process.kill('SIGKILL');
          resolve();
        }, 5000);

        processInfo.process.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      instance.processes.delete(processId);
      console.log(`Process ${processId} stopped in instance ${instanceId}`);
    } catch (error) {
      throw new Error(`Failed to stop process ${processId}: ${error.message}`);
    }
  }

  /**
   * Get instance status and resource usage
   */
  async getInstanceStatus(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    try {
      // Get resource usage
      const resourceUsage = await this.getInstanceResourceUsage(instanceId);
      
      // Update instance data
      instance.resourceUsage = resourceUsage;
      instance.lastChecked = new Date();

      return {
        ...instance,
        uptime: Date.now() - instance.createdAt.getTime(),
        processCount: instance.processes.size
      };
    } catch (error) {
      console.error(`Failed to get status for ${instanceId}: ${error.message}`);
      return {
        ...instance,
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Get resource usage for an instance
   */
  async getInstanceResourceUsage(instanceId) {
    try {
      // Get memory usage
      const { stdout: memInfo } = await execAsync(`wsl -d ${instanceId} cat /proc/meminfo`);
      const memTotal = parseInt(memInfo.match(/MemTotal:\s+(\d+)/)[1]) * 1024; // Convert to bytes
      const memFree = parseInt(memInfo.match(/MemFree:\s+(\d+)/)[1]) * 1024;
      const memUsed = memTotal - memFree;

      // Get CPU usage
      const { stdout: cpuInfo } = await execAsync(`wsl -d ${instanceId} cat /proc/loadavg`);
      const cpuLoad = parseFloat(cpuInfo.split(' ')[0]);

      // Get disk usage
      const { stdout: diskInfo } = await execAsync(`wsl -d ${instanceId} df -B1 ${this.config.workspaceRoot}`);
      const diskLine = diskInfo.split('\n')[1];
      const diskUsed = parseInt(diskLine.split(/\s+/)[2]);

      return {
        memory: {
          used: memUsed,
          total: memTotal,
          percentage: (memUsed / memTotal) * 100
        },
        cpu: {
          load: cpuLoad,
          percentage: Math.min(cpuLoad * 100, 100)
        },
        disk: {
          used: diskUsed,
          percentage: (diskUsed / (10 * 1024 * 1024 * 1024)) * 100 // Assuming 10GB limit
        }
      };
    } catch (error) {
      console.error(`Failed to get resource usage for ${instanceId}: ${error.message}`);
      return {
        memory: { used: 0, total: 0, percentage: 0 },
        cpu: { load: 0, percentage: 0 },
        disk: { used: 0, percentage: 0 }
      };
    }
  }

  /**
   * Cleanup idle instances
   */
  async cleanupIdleInstances() {
    const now = Date.now();
    const idleThreshold = 30 * 60 * 1000; // 30 minutes

    for (const [instanceId, instance] of this.instances.entries()) {
      const idleTime = now - (instance.lastChecked?.getTime() || instance.createdAt.getTime());
      
      if (idleTime > idleThreshold && instance.processes.size === 0) {
        console.log(`Cleaning up idle instance: ${instanceId}`);
        await this.destroyInstance(instanceId);
      }
    }
  }

  /**
   * Destroy a WSL2 instance
   */
  async destroyInstance(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      console.warn(`Instance not found for destruction: ${instanceId}`);
      return;
    }

    try {
      console.log(`Destroying WSL2 instance: ${instanceId}`);

      // Stop all running processes
      for (const [processId] of instance.processes) {
        await this.stopProcess(instanceId, processId).catch(console.error);
      }

      // Terminate the WSL2 instance
      await execAsync(`wsl --terminate ${instanceId}`);

      // Unregister the distribution
      await execAsync(`wsl --unregister ${instanceId}`);

      // Clean up instance directory
      await execAsync(`rmdir /s /q "C:\\temp\\wsl-instances\\${instanceId}"`).catch(() => {});

      this.instances.delete(instanceId);
      this.updateResourceUsage();

      console.log(`WSL2 instance destroyed: ${instanceId}`);
    } catch (error) {
      console.error(`Failed to destroy instance ${instanceId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cleanup instance (internal method)
   */
  async cleanupInstance(instanceId) {
    try {
      await execAsync(`wsl --terminate ${instanceId}`).catch(() => {});
      await execAsync(`wsl --unregister ${instanceId}`).catch(() => {});
      await execAsync(`rmdir /s /q "C:\\temp\\wsl-instances\\${instanceId}"`).catch(() => {});
    } catch (error) {
      console.error(`Cleanup failed for ${instanceId}: ${error.message}`);
    }
  }

  /**
   * Start resource monitoring
   */
  startResourceMonitoring() {
    setInterval(async () => {
      await this.updateResourceUsage();
    }, 30000); // Update every 30 seconds
  }

  /**
   * Update overall resource usage
   */
  async updateResourceUsage() {
    let totalMemory = 0;
    let totalCpu = 0;
    let totalDisk = 0;

    for (const [instanceId, instance] of this.instances.entries()) {
      try {
        const usage = await this.getInstanceResourceUsage(instanceId);
        totalMemory += usage.memory.used;
        totalCpu += usage.cpu.percentage;
        totalDisk += usage.disk.used;
      } catch (error) {
        console.error(`Failed to get usage for ${instanceId}: ${error.message}`);
      }
    }

    this.resourceUsage = {
      memory: totalMemory,
      cpu: totalCpu,
      disk: totalDisk,
      activeInstances: this.instances.size
    };
  }

  /**
   * Get all instances
   */
  getAllInstances() {
    return Array.from(this.instances.values());
  }

  /**
   * Get resource usage summary
   */
  getResourceUsage() {
    return {
      ...this.resourceUsage,
      limits: this.config.resourceLimits,
      maxInstances: this.config.maxInstances
    };
  }

  /**
   * Cleanup all instances
   */
  async cleanup() {
    console.log('Cleaning up all WSL2 instances...');
    
    const instanceIds = Array.from(this.instances.keys());
    await Promise.all(
      instanceIds.map(id => this.destroyInstance(id).catch(console.error))
    );

    console.log('WSL2 cleanup completed');
  }
}

module.exports = WSL2Manager;

