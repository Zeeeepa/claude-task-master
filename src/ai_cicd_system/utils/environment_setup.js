/**
 * Environment Setup - Utility for setting up development environments
 * Handles environment configuration, tool installation, and setup validation
 */

import { log } from './simple_logger.js';

export class EnvironmentSetup {
  constructor(config = {}) {
    this.config = {
      defaultNodeVersion: config.defaultNodeVersion || '18',
      defaultPythonVersion: config.defaultPythonVersion || '3.9',
      requiredTools: config.requiredTools || ['git', 'node', 'npm'],
      setupTimeout: config.setupTimeout || 300000, // 5 minutes
      ...config
    };
    
    this.supportedEnvironments = ['local', 'wsl2', 'docker', 'vm'];
  }

  async setupEnvironment(environmentType, options = {}) {
    log('info', `🔧 Setting up ${environmentType} environment...`);
    
    if (!this.supportedEnvironments.includes(environmentType)) {
      throw new Error(`Unsupported environment type: ${environmentType}`);
    }

    const setupConfig = {
      type: environmentType,
      workingDirectory: options.workingDirectory,
      tools: options.tools || this.config.requiredTools,
      nodeVersion: options.nodeVersion || this.config.defaultNodeVersion,
      pythonVersion: options.pythonVersion || this.config.defaultPythonVersion,
      ...options
    };

    try {
      switch (environmentType) {
        case 'local':
          return await this.setupLocalEnvironment(setupConfig);
        case 'wsl2':
          return await this.setupWSL2Environment(setupConfig);
        case 'docker':
          return await this.setupDockerEnvironment(setupConfig);
        case 'vm':
          return await this.setupVMEnvironment(setupConfig);
        default:
          throw new Error(`Environment setup not implemented for: ${environmentType}`);
      }
    } catch (error) {
      log('error', `❌ Failed to setup ${environmentType} environment: ${error.message}`);
      throw error;
    }
  }

  async setupLocalEnvironment(config) {
    log('info', '🏠 Setting up local environment...');
    
    const environment = {
      type: 'local',
      workingDirectory: config.workingDirectory || process.cwd(),
      tools: {},
      status: 'initializing'
    };

    try {
      // Verify working directory
      await this.ensureDirectory(environment.workingDirectory);
      
      // Check and install required tools
      for (const tool of config.tools) {
        environment.tools[tool] = await this.setupTool(tool, config, 'local');
      }
      
      // Setup Node.js environment if required
      if (config.tools.includes('node')) {
        await this.setupNodeEnvironment(environment.workingDirectory, config);
      }
      
      // Setup Python environment if required
      if (config.tools.includes('python')) {
        await this.setupPythonEnvironment(environment.workingDirectory, config);
      }
      
      // Validate environment
      await this.validateEnvironment(environment);
      
      environment.status = 'ready';
      log('info', '✅ Local environment setup completed');
      
      return environment;
      
    } catch (error) {
      environment.status = 'failed';
      environment.error = error.message;
      throw error;
    }
  }

  async setupWSL2Environment(config) {
    log('info', '🐧 Setting up WSL2 environment...');
    
    const environment = {
      type: 'wsl2',
      distribution: config.distribution || 'Ubuntu',
      workingDirectory: config.workingDirectory || '/tmp/validation-env',
      tools: {},
      status: 'initializing'
    };

    try {
      // Check WSL2 availability
      await this.checkWSL2Availability();
      
      // Create working directory in WSL2
      await this.executeWSLCommand([
        '--distribution', environment.distribution,
        '--exec', 'mkdir', '-p', environment.workingDirectory
      ]);
      
      // Update package manager
      await this.executeWSLCommand([
        '--distribution', environment.distribution,
        '--exec', 'sudo', 'apt-get', 'update', '-qq'
      ]);
      
      // Install required tools
      for (const tool of config.tools) {
        environment.tools[tool] = await this.setupTool(tool, config, 'wsl2', environment.distribution);
      }
      
      // Setup development environment
      if (config.tools.includes('node')) {
        await this.setupNodeEnvironmentWSL2(environment, config);
      }
      
      if (config.tools.includes('python')) {
        await this.setupPythonEnvironmentWSL2(environment, config);
      }
      
      // Validate environment
      await this.validateEnvironmentWSL2(environment);
      
      environment.status = 'ready';
      log('info', '✅ WSL2 environment setup completed');
      
      return environment;
      
    } catch (error) {
      environment.status = 'failed';
      environment.error = error.message;
      throw error;
    }
  }

  async setupDockerEnvironment(config) {
    log('info', '🐳 Setting up Docker environment...');
    
    const environment = {
      type: 'docker',
      image: config.image || 'node:18-alpine',
      containerName: config.containerName || `validation-env-${Date.now()}`,
      workingDirectory: config.workingDirectory || '/workspace',
      tools: {},
      status: 'initializing'
    };

    try {
      // Check Docker availability
      await this.checkDockerAvailability();
      
      // Create and start container
      await this.createDockerContainer(environment, config);
      
      // Setup tools in container
      for (const tool of config.tools) {
        environment.tools[tool] = await this.setupTool(tool, config, 'docker', environment.containerName);
      }
      
      // Validate environment
      await this.validateDockerEnvironment(environment);
      
      environment.status = 'ready';
      log('info', '✅ Docker environment setup completed');
      
      return environment;
      
    } catch (error) {
      environment.status = 'failed';
      environment.error = error.message;
      throw error;
    }
  }

  async setupVMEnvironment(config) {
    log('info', '💻 Setting up VM environment...');
    
    // VM setup would require specific VM management tools
    // This is a placeholder implementation
    throw new Error('VM environment setup not yet implemented');
  }

  async setupTool(toolName, config, environmentType, context = null) {
    log('info', `🔧 Setting up tool: ${toolName} in ${environmentType} environment`);
    
    const toolConfig = {
      name: toolName,
      version: 'latest',
      status: 'installing'
    };

    try {
      switch (toolName) {
        case 'git':
          toolConfig.version = await this.setupGit(environmentType, context);
          break;
        case 'node':
          toolConfig.version = await this.setupNode(environmentType, context, config.nodeVersion);
          break;
        case 'npm':
          toolConfig.version = await this.setupNpm(environmentType, context);
          break;
        case 'python':
          toolConfig.version = await this.setupPython(environmentType, context, config.pythonVersion);
          break;
        case 'pip':
          toolConfig.version = await this.setupPip(environmentType, context);
          break;
        case 'claude-code':
          toolConfig.version = await this.setupClaudeCode(environmentType, context);
          break;
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
      
      toolConfig.status = 'installed';
      log('info', `✅ Tool ${toolName} installed successfully (version: ${toolConfig.version})`);
      
      return toolConfig;
      
    } catch (error) {
      toolConfig.status = 'failed';
      toolConfig.error = error.message;
      log('error', `❌ Failed to setup tool ${toolName}: ${error.message}`);
      throw error;
    }
  }

  // Tool-specific setup methods
  async setupGit(environmentType, context) {
    switch (environmentType) {
      case 'local':
        return await this.getToolVersion('git', ['--version']);
      case 'wsl2':
        await this.executeWSLCommand([
          '--distribution', context,
          '--exec', 'sudo', 'apt-get', 'install', '-y', 'git'
        ]);
        return await this.getToolVersionWSL2('git', ['--version'], context);
      case 'docker':
        await this.executeDockerCommand(context, ['apk', 'add', 'git']);
        return await this.getToolVersionDocker('git', ['--version'], context);
      default:
        throw new Error(`Git setup not supported for ${environmentType}`);
    }
  }

  async setupNode(environmentType, context, version) {
    switch (environmentType) {
      case 'local':
        return await this.getToolVersion('node', ['--version']);
      case 'wsl2':
        await this.installNodeWSL2(context, version);
        return await this.getToolVersionWSL2('node', ['--version'], context);
      case 'docker':
        // Node is usually pre-installed in node images
        return await this.getToolVersionDocker('node', ['--version'], context);
      default:
        throw new Error(`Node setup not supported for ${environmentType}`);
    }
  }

  async setupNpm(environmentType, context) {
    switch (environmentType) {
      case 'local':
        return await this.getToolVersion('npm', ['--version']);
      case 'wsl2':
        // npm comes with node
        return await this.getToolVersionWSL2('npm', ['--version'], context);
      case 'docker':
        return await this.getToolVersionDocker('npm', ['--version'], context);
      default:
        throw new Error(`npm setup not supported for ${environmentType}`);
    }
  }

  async setupPython(environmentType, context, version) {
    switch (environmentType) {
      case 'local':
        return await this.getToolVersion('python3', ['--version']);
      case 'wsl2':
        await this.executeWSLCommand([
          '--distribution', context,
          '--exec', 'sudo', 'apt-get', 'install', '-y', `python${version}`, 'python3-pip'
        ]);
        return await this.getToolVersionWSL2('python3', ['--version'], context);
      case 'docker':
        await this.executeDockerCommand(context, ['apk', 'add', 'python3', 'py3-pip']);
        return await this.getToolVersionDocker('python3', ['--version'], context);
      default:
        throw new Error(`Python setup not supported for ${environmentType}`);
    }
  }

  async setupPip(environmentType, context) {
    switch (environmentType) {
      case 'local':
        return await this.getToolVersion('pip3', ['--version']);
      case 'wsl2':
        return await this.getToolVersionWSL2('pip3', ['--version'], context);
      case 'docker':
        return await this.getToolVersionDocker('pip3', ['--version'], context);
      default:
        throw new Error(`pip setup not supported for ${environmentType}`);
    }
  }

  async setupClaudeCode(environmentType, context) {
    switch (environmentType) {
      case 'local':
        await this.executeCommand(['npm', 'install', '-g', '@anthropic-ai/claude-code']);
        return await this.getToolVersion('claude-code', ['--version']);
      case 'wsl2':
        await this.executeWSLCommand([
          '--distribution', context,
          '--exec', 'npm', 'install', '-g', '@anthropic-ai/claude-code'
        ]);
        return await this.getToolVersionWSL2('claude-code', ['--version'], context);
      case 'docker':
        await this.executeDockerCommand(context, ['npm', 'install', '-g', '@anthropic-ai/claude-code']);
        return await this.getToolVersionDocker('claude-code', ['--version'], context);
      default:
        throw new Error(`Claude Code setup not supported for ${environmentType}`);
    }
  }

  // Environment-specific setup methods
  async setupNodeEnvironment(workingDirectory, config) {
    log('info', '📦 Setting up Node.js environment...');
    
    try {
      // Create package.json if it doesn't exist
      const packageJsonPath = `${workingDirectory}/package.json`;
      
      try {
        const { access } = await import('fs/promises');
        await access(packageJsonPath);
      } catch {
        // Create basic package.json
        const { writeFile } = await import('fs/promises');
        const packageJson = {
          name: 'validation-environment',
          version: '1.0.0',
          description: 'Temporary validation environment',
          private: true
        };
        await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
      }
      
      // Install common development dependencies
      if (config.installDevDependencies) {
        await this.executeCommand(['npm', 'install', '--save-dev', 'eslint', 'prettier'], {
          cwd: workingDirectory
        });
      }
      
    } catch (error) {
      log('error', `Failed to setup Node.js environment: ${error.message}`);
      throw error;
    }
  }

  async setupPythonEnvironment(workingDirectory, config) {
    log('info', '🐍 Setting up Python environment...');
    
    try {
      // Create virtual environment
      await this.executeCommand(['python3', '-m', 'venv', 'venv'], {
        cwd: workingDirectory
      });
      
      // Install common packages
      if (config.installCommonPackages) {
        await this.executeCommand(['./venv/bin/pip', 'install', 'pylint', 'black', 'pytest'], {
          cwd: workingDirectory
        });
      }
      
    } catch (error) {
      log('error', `Failed to setup Python environment: ${error.message}`);
      throw error;
    }
  }

  async setupNodeEnvironmentWSL2(environment, config) {
    log('info', '📦 Setting up Node.js environment in WSL2...');
    
    try {
      await this.executeWSLCommand([
        '--distribution', environment.distribution,
        '--exec', 'bash', '-c',
        `cd ${environment.workingDirectory} && npm init -y`
      ]);
      
    } catch (error) {
      log('error', `Failed to setup Node.js environment in WSL2: ${error.message}`);
      throw error;
    }
  }

  async setupPythonEnvironmentWSL2(environment, config) {
    log('info', '🐍 Setting up Python environment in WSL2...');
    
    try {
      await this.executeWSLCommand([
        '--distribution', environment.distribution,
        '--exec', 'bash', '-c',
        `cd ${environment.workingDirectory} && python3 -m venv venv`
      ]);
      
    } catch (error) {
      log('error', `Failed to setup Python environment in WSL2: ${error.message}`);
      throw error;
    }
  }

  // Validation methods
  async validateEnvironment(environment) {
    log('info', '✅ Validating environment setup...');
    
    const validationResults = {
      workingDirectory: false,
      tools: {},
      overall: false
    };

    try {
      // Check working directory
      const { access } = await import('fs/promises');
      await access(environment.workingDirectory);
      validationResults.workingDirectory = true;
      
      // Validate each tool
      for (const [toolName, toolConfig] of Object.entries(environment.tools)) {
        validationResults.tools[toolName] = toolConfig.status === 'installed';
      }
      
      // Overall validation
      validationResults.overall = validationResults.workingDirectory && 
        Object.values(validationResults.tools).every(status => status);
      
      if (!validationResults.overall) {
        throw new Error('Environment validation failed');
      }
      
      log('info', '✅ Environment validation successful');
      return validationResults;
      
    } catch (error) {
      log('error', `❌ Environment validation failed: ${error.message}`);
      throw error;
    }
  }

  async validateEnvironmentWSL2(environment) {
    log('info', '✅ Validating WSL2 environment setup...');
    
    try {
      // Check working directory
      await this.executeWSLCommand([
        '--distribution', environment.distribution,
        '--exec', 'test', '-d', environment.workingDirectory
      ]);
      
      // Validate tools
      for (const toolName of Object.keys(environment.tools)) {
        await this.executeWSLCommand([
          '--distribution', environment.distribution,
          '--exec', 'which', toolName
        ]);
      }
      
      log('info', '✅ WSL2 environment validation successful');
      
    } catch (error) {
      log('error', `❌ WSL2 environment validation failed: ${error.message}`);
      throw error;
    }
  }

  async validateDockerEnvironment(environment) {
    log('info', '✅ Validating Docker environment setup...');
    
    try {
      // Check container is running
      await this.executeCommand(['docker', 'ps', '--filter', `name=${environment.containerName}`]);
      
      // Validate tools in container
      for (const toolName of Object.keys(environment.tools)) {
        await this.executeDockerCommand(environment.containerName, ['which', toolName]);
      }
      
      log('info', '✅ Docker environment validation successful');
      
    } catch (error) {
      log('error', `❌ Docker environment validation failed: ${error.message}`);
      throw error;
    }
  }

  // Utility methods
  async ensureDirectory(path) {
    try {
      const { mkdir } = await import('fs/promises');
      await mkdir(path, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  async checkWSL2Availability() {
    try {
      await this.executeCommand(['wsl', '--list', '--quiet']);
      return true;
    } catch (error) {
      throw new Error('WSL2 is not available or not installed');
    }
  }

  async checkDockerAvailability() {
    try {
      await this.executeCommand(['docker', '--version']);
      return true;
    } catch (error) {
      throw new Error('Docker is not available or not installed');
    }
  }

  async createDockerContainer(environment, config) {
    const args = [
      'run', '-d',
      '--name', environment.containerName,
      '--workdir', environment.workingDirectory,
      environment.image,
      'tail', '-f', '/dev/null' // Keep container running
    ];
    
    await this.executeCommand(['docker', ...args]);
  }

  async installNodeWSL2(distribution, version) {
    const commands = [
      'curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -',
      'sudo apt-get install -y nodejs'
    ];
    
    for (const command of commands) {
      await this.executeWSLCommand([
        '--distribution', distribution,
        '--exec', 'bash', '-c', command
      ]);
    }
  }

  async getToolVersion(toolName, args) {
    try {
      const result = await this.executeCommand([toolName, ...args]);
      return result.stdout.trim();
    } catch (error) {
      throw new Error(`Tool ${toolName} not found or not working`);
    }
  }

  async getToolVersionWSL2(toolName, args, distribution) {
    try {
      const result = await this.executeWSLCommand([
        '--distribution', distribution,
        '--exec', toolName, ...args
      ]);
      return result.stdout.trim();
    } catch (error) {
      throw new Error(`Tool ${toolName} not found in WSL2`);
    }
  }

  async getToolVersionDocker(toolName, args, containerName) {
    try {
      const result = await this.executeDockerCommand(containerName, [toolName, ...args]);
      return result.stdout.trim();
    } catch (error) {
      throw new Error(`Tool ${toolName} not found in Docker container`);
    }
  }

  async executeCommand(args, options = {}) {
    const { spawn } = await import('child_process');
    
    return new Promise((resolve, reject) => {
      const child = spawn(args[0], args.slice(1), {
        cwd: options.cwd || process.cwd(),
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
          reject(new Error(`Command failed (exit code ${code}): ${stderr || stdout}`));
        }
      });
      
      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  async executeWSLCommand(args, options = {}) {
    return await this.executeCommand(['wsl', ...args], options);
  }

  async executeDockerCommand(containerName, args, options = {}) {
    return await this.executeCommand(['docker', 'exec', containerName, ...args], options);
  }

  // Cleanup methods
  async cleanupEnvironment(environment) {
    log('info', `🧹 Cleaning up ${environment.type} environment...`);
    
    try {
      switch (environment.type) {
        case 'local':
          await this.cleanupLocalEnvironment(environment);
          break;
        case 'wsl2':
          await this.cleanupWSL2Environment(environment);
          break;
        case 'docker':
          await this.cleanupDockerEnvironment(environment);
          break;
      }
      
      log('info', `✅ Environment cleanup completed: ${environment.type}`);
      
    } catch (error) {
      log('error', `❌ Environment cleanup failed: ${error.message}`);
    }
  }

  async cleanupLocalEnvironment(environment) {
    if (environment.workingDirectory && environment.workingDirectory !== process.cwd()) {
      const { rm } = await import('fs/promises');
      await rm(environment.workingDirectory, { recursive: true, force: true });
    }
  }

  async cleanupWSL2Environment(environment) {
    await this.executeWSLCommand([
      '--distribution', environment.distribution,
      '--exec', 'rm', '-rf', environment.workingDirectory
    ]);
  }

  async cleanupDockerEnvironment(environment) {
    await this.executeCommand(['docker', 'stop', environment.containerName]);
    await this.executeCommand(['docker', 'rm', environment.containerName]);
  }
}

