/**
 * WSL2 Environment Manager
 * 
 * Manages WSL2 environment setup, configuration, and lifecycle
 * for Claude Code validation processes.
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { EventEmitter } from 'events';
import { SimpleLogger } from '../../utils/simple_logger.js';

const execAsync = promisify(exec);

export class WSL2EnvironmentManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            defaultDistribution: options.defaultDistribution || 'Ubuntu-22.04',
            environmentsRoot: options.environmentsRoot || '/tmp/wsl2-environments',
            maxEnvironments: options.maxEnvironments || 5,
            environmentTimeout: options.environmentTimeout || 2 * 60 * 60 * 1000, // 2 hours
            resourceLimits: {
                memory: options.resourceLimits?.memory || '4GB',
                cpu: options.resourceLimits?.cpu || '2',
                swap: options.resourceLimits?.swap || '2GB'
            },
            networkConfig: {
                enableNetworking: options.networkConfig?.enableNetworking !== false,
                allowedPorts: options.networkConfig?.allowedPorts || [3000, 8000, 8080, 9000],
                dnsServers: options.networkConfig?.dnsServers || ['8.8.8.8', '1.1.1.1']
            },
            ...options
        };

        this.logger = new SimpleLogger('WSL2EnvironmentManager', options.logLevel || 'info');
        this.environments = new Map();
        this.environmentTemplates = new Map();
        this.resourceMonitor = null;

        this._initializeTemplates();
        this._startResourceMonitoring();
    }

    /**
     * Initialize environment templates
     */
    _initializeTemplates() {
        // Node.js environment template
        this.environmentTemplates.set('nodejs', {
            name: 'Node.js Development',
            baseImage: 'Ubuntu-22.04',
            packages: [
                'curl',
                'git',
                'build-essential',
                'python3',
                'python3-pip'
            ],
            setupCommands: [
                'curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -',
                'sudo apt-get install -y nodejs',
                'npm install -g npm@latest',
                'npm install -g @anthropic-ai/claude-code'
            ],
            environmentVars: {
                NODE_ENV: 'development',
                NPM_CONFIG_CACHE: '/tmp/.npm'
            }
        });

        // Python environment template
        this.environmentTemplates.set('python', {
            name: 'Python Development',
            baseImage: 'Ubuntu-22.04',
            packages: [
                'python3',
                'python3-pip',
                'python3-venv',
                'python3-dev',
                'git',
                'build-essential'
            ],
            setupCommands: [
                'pip3 install --upgrade pip',
                'pip3 install virtualenv',
                'pip3 install pytest flake8 black'
            ],
            environmentVars: {
                PYTHONPATH: '/workspace',
                PYTHON_ENV: 'development'
            }
        });

        // Docker environment template
        this.environmentTemplates.set('docker', {
            name: 'Docker Development',
            baseImage: 'Ubuntu-22.04',
            packages: [
                'docker.io',
                'docker-compose',
                'git',
                'curl'
            ],
            setupCommands: [
                'sudo systemctl start docker',
                'sudo systemctl enable docker',
                'sudo usermod -aG docker $USER'
            ],
            environmentVars: {
                DOCKER_HOST: 'unix:///var/run/docker.sock'
            }
        });

        // Generic development environment
        this.environmentTemplates.set('generic', {
            name: 'Generic Development',
            baseImage: 'Ubuntu-22.04',
            packages: [
                'git',
                'curl',
                'wget',
                'build-essential',
                'vim',
                'nano'
            ],
            setupCommands: [],
            environmentVars: {}
        });

        this.logger.info(`Initialized ${this.environmentTemplates.size} environment templates`);
    }

    /**
     * Start resource monitoring
     */
    _startResourceMonitoring() {
        this.resourceMonitor = setInterval(async () => {
            try {
                await this._monitorEnvironments();
                await this._cleanupExpiredEnvironments();
            } catch (error) {
                this.logger.error('Resource monitoring error:', error);
            }
        }, 30000); // Check every 30 seconds
    }

    /**
     * Check WSL2 system status
     */
    async checkWSL2Status() {
        try {
            // Check WSL version
            const { stdout: versionOutput } = await execAsync('wsl --version');
            
            // Check available distributions
            const { stdout: listOutput } = await execAsync('wsl --list --verbose');
            
            // Parse distributions
            const distributions = this._parseDistributions(listOutput);
            
            // Check system resources
            const resources = await this._checkSystemResources();

            return {
                available: true,
                version: versionOutput.trim(),
                distributions,
                resources,
                activeEnvironments: this.environments.size
            };
        } catch (error) {
            this.logger.error('WSL2 status check failed:', error);
            return {
                available: false,
                error: error.message
            };
        }
    }

    /**
     * Parse WSL distributions output
     */
    _parseDistributions(output) {
        const lines = output.split('\n').filter(line => line.trim());
        const distributions = [];

        for (const line of lines) {
            if (line.includes('NAME') || line.includes('---')) continue;
            
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 3) {
                distributions.push({
                    name: parts[0].replace('*', '').trim(),
                    state: parts[1],
                    version: parts[2],
                    isDefault: line.includes('*')
                });
            }
        }

        return distributions;
    }

    /**
     * Check system resources
     */
    async _checkSystemResources() {
        try {
            // Get memory info
            const { stdout: memInfo } = await execAsync('wsl -- cat /proc/meminfo | head -3');
            
            // Get CPU info
            const { stdout: cpuInfo } = await execAsync('wsl -- nproc');
            
            // Get disk info
            const { stdout: diskInfo } = await execAsync('wsl -- df -h / | tail -1');

            return {
                memory: this._parseMemoryInfo(memInfo),
                cpu: {
                    cores: parseInt(cpuInfo.trim())
                },
                disk: this._parseDiskInfo(diskInfo)
            };
        } catch (error) {
            this.logger.warn('Could not retrieve system resources:', error);
            return null;
        }
    }

    /**
     * Parse memory information
     */
    _parseMemoryInfo(memInfo) {
        const lines = memInfo.split('\n');
        const memory = {};

        for (const line of lines) {
            if (line.includes('MemTotal:')) {
                memory.total = line.split(/\s+/)[1] + ' kB';
            } else if (line.includes('MemFree:')) {
                memory.free = line.split(/\s+/)[1] + ' kB';
            } else if (line.includes('MemAvailable:')) {
                memory.available = line.split(/\s+/)[1] + ' kB';
            }
        }

        return memory;
    }

    /**
     * Parse disk information
     */
    _parseDiskInfo(diskInfo) {
        const parts = diskInfo.trim().split(/\s+/);
        return {
            filesystem: parts[0],
            size: parts[1],
            used: parts[2],
            available: parts[3],
            usePercent: parts[4],
            mountPoint: parts[5]
        };
    }

    /**
     * Create new environment
     */
    async createEnvironment(name, template = 'generic', options = {}) {
        try {
            if (this.environments.size >= this.config.maxEnvironments) {
                throw new Error(`Maximum number of environments (${this.config.maxEnvironments}) reached`);
            }

            const environmentId = this._generateEnvironmentId(name);
            
            this.logger.info(`Creating environment: ${name} (${template})`, {
                environmentId,
                template,
                options
            });

            const environment = {
                id: environmentId,
                name,
                template,
                status: 'creating',
                createdAt: new Date(),
                lastUsed: new Date(),
                workspacePath: join(this.config.environmentsRoot, environmentId),
                distribution: options.distribution || this.config.defaultDistribution,
                config: { ...this.environmentTemplates.get(template), ...options },
                processes: new Map(),
                logs: []
            };

            this.environments.set(environmentId, environment);

            // Emit creation started event
            this.emit('environment.creating', {
                environmentId,
                name,
                template,
                timestamp: new Date().toISOString()
            });

            // Setup environment
            await this._setupEnvironment(environment);

            // Mark as ready
            environment.status = 'ready';
            environment.readyAt = new Date();

            this.emit('environment.created', {
                environmentId,
                name,
                template,
                timestamp: new Date().toISOString()
            });

            this.logger.info(`Environment created successfully: ${environmentId}`);

            return {
                success: true,
                environmentId,
                environment: this._getEnvironmentInfo(environment)
            };

        } catch (error) {
            this.logger.error(`Failed to create environment ${name}:`, error);
            
            // Cleanup on failure
            if (this.environments.has(environmentId)) {
                await this.destroyEnvironment(environmentId);
            }

            throw error;
        }
    }

    /**
     * Generate unique environment ID
     */
    _generateEnvironmentId(name) {
        const timestamp = Date.now();
        const hash = require('crypto')
            .createHash('md5')
            .update(`${name}-${timestamp}`)
            .digest('hex')
            .substring(0, 8);
        return `env-${hash}-${timestamp}`;
    }

    /**
     * Setup environment
     */
    async _setupEnvironment(environment) {
        try {
            // Create workspace directory
            await this._createWorkspace(environment);

            // Install packages
            await this._installPackages(environment);

            // Run setup commands
            await this._runSetupCommands(environment);

            // Configure environment variables
            await this._configureEnvironmentVars(environment);

            // Setup networking
            await this._setupNetworking(environment);

            environment.logs.push({
                timestamp: new Date(),
                level: 'info',
                message: 'Environment setup completed'
            });

        } catch (error) {
            throw new Error(`Environment setup failed: ${error.message}`);
        }
    }

    /**
     * Create workspace directory
     */
    async _createWorkspace(environment) {
        try {
            const { workspacePath } = environment;

            // Create workspace in WSL
            const createCommand = `mkdir -p ${workspacePath}`;
            await this._executeInWSL(createCommand, environment.distribution);

            // Create subdirectories
            const subdirs = ['projects', 'logs', 'tmp', 'scripts'];
            for (const subdir of subdirs) {
                const createSubdirCommand = `mkdir -p ${workspacePath}/${subdir}`;
                await this._executeInWSL(createSubdirCommand, environment.distribution);
            }

            environment.logs.push({
                timestamp: new Date(),
                level: 'info',
                message: 'Workspace created'
            });

        } catch (error) {
            throw new Error(`Workspace creation failed: ${error.message}`);
        }
    }

    /**
     * Install packages
     */
    async _installPackages(environment) {
        try {
            const { packages } = environment.config;
            
            if (!packages || packages.length === 0) {
                return;
            }

            this.logger.info(`Installing packages: ${packages.join(', ')}`);

            // Update package list
            await this._executeInWSL('sudo apt-get update', environment.distribution);

            // Install packages
            const installCommand = `sudo apt-get install -y ${packages.join(' ')}`;
            await this._executeInWSL(installCommand, environment.distribution);

            environment.logs.push({
                timestamp: new Date(),
                level: 'info',
                message: `Installed packages: ${packages.join(', ')}`
            });

        } catch (error) {
            throw new Error(`Package installation failed: ${error.message}`);
        }
    }

    /**
     * Run setup commands
     */
    async _runSetupCommands(environment) {
        try {
            const { setupCommands } = environment.config;
            
            if (!setupCommands || setupCommands.length === 0) {
                return;
            }

            this.logger.info(`Running ${setupCommands.length} setup commands`);

            for (const command of setupCommands) {
                await this._executeInWSL(command, environment.distribution);
                
                environment.logs.push({
                    timestamp: new Date(),
                    level: 'info',
                    message: `Executed: ${command}`
                });
            }

        } catch (error) {
            throw new Error(`Setup commands failed: ${error.message}`);
        }
    }

    /**
     * Configure environment variables
     */
    async _configureEnvironmentVars(environment) {
        try {
            const { environmentVars } = environment.config;
            
            if (!environmentVars || Object.keys(environmentVars).length === 0) {
                return;
            }

            // Create environment file
            const envContent = Object.entries(environmentVars)
                .map(([key, value]) => `export ${key}="${value}"`)
                .join('\n');

            const envFile = `${environment.workspacePath}/.env`;
            const createEnvCommand = `echo '${envContent}' > ${envFile}`;
            await this._executeInWSL(createEnvCommand, environment.distribution);

            // Add to bashrc
            const bashrcCommand = `echo 'source ${envFile}' >> ~/.bashrc`;
            await this._executeInWSL(bashrcCommand, environment.distribution);

            environment.logs.push({
                timestamp: new Date(),
                level: 'info',
                message: 'Environment variables configured'
            });

        } catch (error) {
            throw new Error(`Environment variable configuration failed: ${error.message}`);
        }
    }

    /**
     * Setup networking
     */
    async _setupNetworking(environment) {
        try {
            const { networkConfig } = this.config;
            
            if (!networkConfig.enableNetworking) {
                return;
            }

            // Configure DNS
            if (networkConfig.dnsServers && networkConfig.dnsServers.length > 0) {
                const dnsContent = networkConfig.dnsServers
                    .map(server => `nameserver ${server}`)
                    .join('\n');
                
                const dnsCommand = `echo '${dnsContent}' | sudo tee /etc/resolv.conf`;
                await this._executeInWSL(dnsCommand, environment.distribution);
            }

            environment.logs.push({
                timestamp: new Date(),
                level: 'info',
                message: 'Networking configured'
            });

        } catch (error) {
            this.logger.warn('Networking setup failed:', error);
            // Don't fail environment creation for networking issues
        }
    }

    /**
     * Execute command in WSL
     */
    async _executeInWSL(command, distribution = null) {
        const dist = distribution || this.config.defaultDistribution;
        const wslCommand = `wsl -d ${dist} -- ${command}`;
        
        this.logger.debug(`Executing WSL command: ${wslCommand}`);

        try {
            const { stdout, stderr } = await execAsync(wslCommand, {
                timeout: 60000 // 1 minute timeout
            });

            if (stderr && !stderr.includes('Warning')) {
                this.logger.warn('WSL command stderr:', stderr);
            }

            return {
                success: true,
                stdout: stdout.trim(),
                stderr: stderr.trim()
            };
        } catch (error) {
            this.logger.error(`WSL command failed: ${wslCommand}`, error);
            throw error;
        }
    }

    /**
     * Start process in environment
     */
    async startProcess(environmentId, command, options = {}) {
        try {
            const environment = this.environments.get(environmentId);
            if (!environment) {
                throw new Error(`Environment not found: ${environmentId}`);
            }

            if (environment.status !== 'ready') {
                throw new Error(`Environment not ready: ${environment.status}`);
            }

            const processId = this._generateProcessId();
            const workingDir = options.cwd || environment.workspacePath;

            this.logger.info(`Starting process in environment ${environmentId}:`, command);

            const wslCommand = `wsl -d ${environment.distribution} --cd ${workingDir} -- ${command}`;
            
            const process = spawn('cmd', ['/c', wslCommand], {
                stdio: options.stdio || 'pipe',
                env: { ...process.env, ...options.env }
            });

            const processInfo = {
                id: processId,
                command,
                process,
                startTime: new Date(),
                status: 'running',
                options
            };

            environment.processes.set(processId, processInfo);
            environment.lastUsed = new Date();

            this.emit('process.started', {
                environmentId,
                processId,
                command,
                timestamp: new Date().toISOString()
            });

            // Handle process events
            process.on('close', (code) => {
                processInfo.status = 'completed';
                processInfo.exitCode = code;
                processInfo.endTime = new Date();

                this.emit('process.completed', {
                    environmentId,
                    processId,
                    exitCode: code,
                    timestamp: new Date().toISOString()
                });
            });

            process.on('error', (error) => {
                processInfo.status = 'failed';
                processInfo.error = error.message;
                processInfo.endTime = new Date();

                this.emit('process.failed', {
                    environmentId,
                    processId,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            });

            return {
                success: true,
                processId,
                process: processInfo
            };

        } catch (error) {
            this.logger.error(`Failed to start process in environment ${environmentId}:`, error);
            throw error;
        }
    }

    /**
     * Generate unique process ID
     */
    _generateProcessId() {
        return `proc-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    }

    /**
     * Stop process
     */
    async stopProcess(environmentId, processId) {
        try {
            const environment = this.environments.get(environmentId);
            if (!environment) {
                throw new Error(`Environment not found: ${environmentId}`);
            }

            const processInfo = environment.processes.get(processId);
            if (!processInfo) {
                throw new Error(`Process not found: ${processId}`);
            }

            if (processInfo.status === 'running') {
                processInfo.process.kill('SIGTERM');
                processInfo.status = 'stopping';

                // Force kill after 5 seconds
                setTimeout(() => {
                    if (processInfo.status === 'stopping') {
                        processInfo.process.kill('SIGKILL');
                    }
                }, 5000);
            }

            return true;
        } catch (error) {
            this.logger.error(`Failed to stop process ${processId}:`, error);
            return false;
        }
    }

    /**
     * Monitor environments
     */
    async _monitorEnvironments() {
        for (const [environmentId, environment] of this.environments.entries()) {
            try {
                // Check if environment is still responsive
                const pingResult = await this._executeInWSL('echo "ping"', environment.distribution);
                
                if (!pingResult.success) {
                    this.logger.warn(`Environment ${environmentId} is not responsive`);
                    environment.status = 'unresponsive';
                }

                // Update last check time
                environment.lastCheck = new Date();

            } catch (error) {
                this.logger.error(`Error monitoring environment ${environmentId}:`, error);
            }
        }
    }

    /**
     * Cleanup expired environments
     */
    async _cleanupExpiredEnvironments() {
        const cutoffTime = new Date();
        cutoffTime.setTime(cutoffTime.getTime() - this.config.environmentTimeout);

        for (const [environmentId, environment] of this.environments.entries()) {
            if (environment.lastUsed < cutoffTime && environment.status !== 'destroying') {
                this.logger.info(`Cleaning up expired environment: ${environmentId}`);
                await this.destroyEnvironment(environmentId);
            }
        }
    }

    /**
     * Get environment information
     */
    _getEnvironmentInfo(environment) {
        return {
            id: environment.id,
            name: environment.name,
            template: environment.template,
            status: environment.status,
            createdAt: environment.createdAt,
            lastUsed: environment.lastUsed,
            distribution: environment.distribution,
            activeProcesses: environment.processes.size,
            workspacePath: environment.workspacePath
        };
    }

    /**
     * Get environment
     */
    getEnvironment(environmentId) {
        const environment = this.environments.get(environmentId);
        return environment ? this._getEnvironmentInfo(environment) : null;
    }

    /**
     * List environments
     */
    listEnvironments() {
        return Array.from(this.environments.values()).map(env => this._getEnvironmentInfo(env));
    }

    /**
     * Destroy environment
     */
    async destroyEnvironment(environmentId) {
        try {
            const environment = this.environments.get(environmentId);
            if (!environment) {
                return false;
            }

            environment.status = 'destroying';

            this.logger.info(`Destroying environment: ${environmentId}`);

            // Stop all processes
            for (const [processId] of environment.processes) {
                await this.stopProcess(environmentId, processId);
            }

            // Cleanup workspace
            try {
                const cleanupCommand = `rm -rf ${environment.workspacePath}`;
                await this._executeInWSL(cleanupCommand, environment.distribution);
            } catch (error) {
                this.logger.warn(`Failed to cleanup workspace for ${environmentId}:`, error);
            }

            // Remove from environments map
            this.environments.delete(environmentId);

            this.emit('environment.destroyed', {
                environmentId,
                timestamp: new Date().toISOString()
            });

            this.logger.info(`Environment destroyed: ${environmentId}`);
            return true;

        } catch (error) {
            this.logger.error(`Failed to destroy environment ${environmentId}:`, error);
            return false;
        }
    }

    /**
     * Get environment statistics
     */
    getStats() {
        return {
            totalEnvironments: this.environments.size,
            maxEnvironments: this.config.maxEnvironments,
            availableTemplates: Array.from(this.environmentTemplates.keys()),
            environments: this.listEnvironments()
        };
    }

    /**
     * Shutdown environment manager
     */
    async shutdown() {
        try {
            // Stop resource monitoring
            if (this.resourceMonitor) {
                clearInterval(this.resourceMonitor);
            }

            // Destroy all environments
            const destroyPromises = Array.from(this.environments.keys())
                .map(id => this.destroyEnvironment(id));
            
            await Promise.all(destroyPromises);

            this.logger.info('WSL2 Environment Manager shutdown completed');
        } catch (error) {
            this.logger.error('Error during shutdown:', error);
        }
    }
}

export default WSL2EnvironmentManager;

