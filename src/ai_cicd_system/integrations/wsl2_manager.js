/**
 * WSL2 Manager - Manages isolated WSL2 environments for PR validation
 * Provides environment creation, setup, and cleanup capabilities
 */

import { log } from '../utils/simple_logger.js';

export class WSL2Manager {
  constructor(config) {
    this.config = config;
    this.activeEnvironments = new Map();
    this.environmentCounter = 0;
    this.isInitialized = false;
  }

  async initialize() {
    log('info', '🔧 Initializing WSL2 manager...');
    
    try {
      // Check WSL2 availability
      await this.checkWSL2Availability();
      
      // Setup base environment
      await this.setupBaseEnvironment();
      
      this.isInitialized = true;
      log('info', '✅ WSL2 manager initialized');
    } catch (error) {
      log('error', `❌ Failed to initialize WSL2 manager: ${error.message}`);
      throw error;
    }
  }

  async checkWSL2Availability() {
    try {
      const result = await this.executeWSLCommand(['--list', '--verbose']);
      log('info', 'WSL2 available and configured');
      log('debug', `WSL distributions: ${result.stdout.trim()}`);
      return true;
    } catch (error) {
      throw new Error(`WSL2 not available: ${error.message}`);
    }
  }

  async setupBaseEnvironment() {
    try {
      // Ensure we have a default WSL distribution
      const distributions = await this.getWSLDistributions();
      
      if (distributions.length === 0) {
        throw new Error('No WSL distributions found. Please install a WSL distribution first.');
      }
      
      // Use the first available distribution as default
      this.defaultDistribution = distributions[0];
      log('info', `Using WSL distribution: ${this.defaultDistribution}`);
      
      // Install required tools in the base environment
      await this.installBaseTools();
      
    } catch (error) {
      throw new Error(`Failed to setup base environment: ${error.message}`);
    }
  }

  async getWSLDistributions() {
    const result = await this.executeWSLCommand(['--list', '--quiet']);
    return result.stdout
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.includes('docker-desktop'));
  }

  async installBaseTools() {
    log('info', '📦 Installing base tools in WSL2 environment...');
    
    const commands = [
      'apt-get update -qq',
      'apt-get install -y git curl nodejs npm python3 python3-pip',
      'npm install -g @anthropic-ai/claude-code'
    ];
    
    for (const command of commands) {
      try {
        await this.executeWSLCommand([
          '--distribution', this.defaultDistribution,
          '--exec', 'bash', '-c', command
        ]);
      } catch (error) {
        log('warn', `Failed to execute command: ${command} - ${error.message}`);
      }
    }
    
    log('info', '✅ Base tools installation completed');
  }

  async createEnvironment(config) {
    if (!this.isInitialized) {
      throw new Error('WSL2 manager not initialized. Call initialize() first.');
    }

    const environmentId = `env_${++this.environmentCounter}_${Date.now()}`;
    const environmentName = config.name || environmentId;
    
    log('info', `🏗️ Creating WSL2 environment: ${environmentName}`);
    
    try {
      // Create isolated WSL2 instance
      const environment = {
        id: environmentId,
        name: environmentName,
        type: 'wsl2',
        distribution: this.defaultDistribution,
        workingDirectory: `/tmp/${environmentName}`,
        repository: config.repository,
        branch: config.branch,
        createdAt: new Date()
      };
      
      // Setup environment
      await this.setupEnvironment(environment);
      
      // Clone repository if specified
      if (config.repository) {
        await this.cloneRepository(environment, config);
      }
      
      this.activeEnvironments.set(environmentId, environment);
      
      log('info', `✅ WSL2 environment created: ${environmentName}`);
      return environment;
      
    } catch (error) {
      log('error', `❌ Failed to create WSL2 environment: ${environmentName} - ${error.message}`);
      throw error;
    }
  }

  async setupEnvironment(environment) {
    log('info', `⚙️ Setting up WSL2 environment: ${environment.name}`);
    
    // Create working directory
    await this.executeWSLCommand([
      '--distribution', environment.distribution,
      '--exec', 'bash', '-c',
      `mkdir -p ${environment.workingDirectory}`
    ]);
    
    // Install required tools for this specific environment
    await this.installRequiredTools(environment);
    
    log('info', `✅ Environment setup completed: ${environment.name}`);
  }

  async installRequiredTools(environment) {
    log('info', `📦 Installing required tools in environment: ${environment.name}`);
    
    const commands = [
      // Ensure git is configured
      'git config --global user.email "ci@example.com"',
      'git config --global user.name "CI Bot"',
      // Install additional tools as needed
      'which claude-code || npm install -g @anthropic-ai/claude-code'
    ];
    
    for (const command of commands) {
      try {
        await this.executeWSLCommand([
          '--distribution', environment.distribution,
          '--exec', 'bash', '-c',
          `cd ${environment.workingDirectory} && ${command}`
        ]);
      } catch (error) {
        log('warn', `Failed to execute tool installation command: ${command} - ${error.message}`);
      }
    }
  }

  async cloneRepository(environment, config) {
    log('info', `📥 Cloning repository in WSL2: ${config.repository}#${config.branch}`);
    
    const cloneCommand = [
      '--distribution', environment.distribution,
      '--exec', 'bash', '-c',
      `cd ${environment.workingDirectory} && git clone --branch ${config.branch} --single-branch ${config.repository} .`
    ];
    
    try {
      await this.executeWSLCommand(cloneCommand);
      log('info', `✅ Repository cloned successfully: ${config.repository}#${config.branch}`);
    } catch (error) {
      // Try cloning without specific branch if branch doesn't exist
      log('warn', `Failed to clone specific branch, trying default branch: ${error.message}`);
      
      const fallbackCloneCommand = [
        '--distribution', environment.distribution,
        '--exec', 'bash', '-c',
        `cd ${environment.workingDirectory} && git clone ${config.repository} . && git checkout ${config.branch}`
      ];
      
      await this.executeWSLCommand(fallbackCloneCommand);
      log('info', `✅ Repository cloned with fallback method: ${config.repository}#${config.branch}`);
    }
  }

  async executeInEnvironment(environment, command) {
    if (!this.activeEnvironments.has(environment.id)) {
      throw new Error(`Environment ${environment.name} not found or not active`);
    }
    
    const fullCommand = [
      '--distribution', environment.distribution,
      '--exec', 'bash', '-c',
      `cd ${environment.workingDirectory} && ${command}`
    ];
    
    return await this.executeWSLCommand(fullCommand);
  }

  async cleanupEnvironment(environment) {
    log('info', `🧹 Cleaning up WSL2 environment: ${environment.name}`);
    
    try {
      // Remove working directory
      await this.executeWSLCommand([
        '--distribution', environment.distribution,
        '--exec', 'bash', '-c',
        `rm -rf ${environment.workingDirectory}`
      ]);
      
      this.activeEnvironments.delete(environment.id);
      
      log('info', `✅ WSL2 environment cleaned up: ${environment.name}`);
      
    } catch (error) {
      log('error', `❌ Failed to cleanup WSL2 environment: ${environment.name} - ${error.message}`);
      // Don't throw error for cleanup failures, just log them
    }
  }

  async executeWSLCommand(args, options = {}) {
    const { spawn } = await import('child_process');
    
    log('debug', `Executing WSL command: wsl ${args.join(' ')}`);
    
    return new Promise((resolve, reject) => {
      const child = spawn('wsl', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...options.env }
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr, code });
        } else {
          reject(new Error(`WSL command failed (exit code ${code}): ${stderr || stdout}`));
        }
      });
      
      child.on('error', (error) => {
        reject(new Error(`Failed to execute WSL command: ${error.message}`));
      });
      
      // Handle timeout
      if (options.timeout) {
        const timeoutId = setTimeout(() => {
          child.kill('SIGTERM');
          reject(new Error('WSL command timed out'));
        }, options.timeout);
        
        child.on('close', () => {
          clearTimeout(timeoutId);
        });
      }
    });
  }

  // Environment management methods
  getActiveEnvironments() {
    return Array.from(this.activeEnvironments.values());
  }

  getEnvironmentById(id) {
    return this.activeEnvironments.get(id);
  }

  async getEnvironmentStatus(environment) {
    try {
      const result = await this.executeInEnvironment(environment, 'pwd && ls -la');
      return {
        status: 'active',
        workingDirectory: environment.workingDirectory,
        files: result.stdout.split('\n').filter(line => line.trim()),
        lastChecked: new Date()
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        lastChecked: new Date()
      };
    }
  }

  async cleanupAllEnvironments() {
    log('info', '🧹 Cleaning up all WSL2 environments...');
    
    const cleanupPromises = Array.from(this.activeEnvironments.values()).map(
      environment => this.cleanupEnvironment(environment)
    );
    
    await Promise.allSettled(cleanupPromises);
    
    log('info', '✅ All WSL2 environments cleaned up');
  }

  async shutdown() {
    log('info', '🛑 Shutting down WSL2 manager...');
    
    await this.cleanupAllEnvironments();
    this.isInitialized = false;
    
    log('info', '✅ WSL2 manager shutdown complete');
  }

  // Health check method
  async healthCheck() {
    try {
      await this.checkWSL2Availability();
      return {
        status: 'healthy',
        distribution: this.defaultDistribution,
        activeEnvironments: this.activeEnvironments.size,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date()
      };
    }
  }
}

