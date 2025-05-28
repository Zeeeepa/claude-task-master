/**
 * WSL2 Deployment Manager
 * 
 * Handles WSL2 deployment automation for PR validation and testing.
 * Manages environment setup, resource allocation, and deployment lifecycle.
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { EventEmitter } from 'events';
import { SimpleLogger } from '../../utils/simple_logger.js';

const execAsync = promisify(exec);

export class WSL2DeploymentManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            wslDistribution: options.wslDistribution || 'Ubuntu-22.04',
            maxConcurrentDeployments: options.maxConcurrentDeployments || 3,
            deploymentTimeout: options.deploymentTimeout || 30 * 60 * 1000, // 30 minutes
            workspaceRoot: options.workspaceRoot || '/tmp/claude-deployments',
            resourceLimits: {
                memory: options.resourceLimits?.memory || '4GB',
                cpu: options.resourceLimits?.cpu || '2',
                disk: options.resourceLimits?.disk || '10GB'
            },
            environmentTemplate: options.environmentTemplate || 'nodejs',
            cleanupAfterHours: options.cleanupAfterHours || 24,
            ...options
        };

        this.logger = new SimpleLogger('WSL2DeploymentManager', options.logLevel || 'info');
        this.activeDeployments = new Map();
        this.deploymentQueue = [];
        this.isProcessingQueue = false;
        this.resourceMonitor = null;

        this._initializeWorkspace();
        this._startResourceMonitoring();
    }

    /**
     * Initialize workspace directory
     */
    _initializeWorkspace() {
        try {
            if (!existsSync(this.config.workspaceRoot)) {
                mkdirSync(this.config.workspaceRoot, { recursive: true });
            }
            this.logger.info(`Workspace initialized: ${this.config.workspaceRoot}`);
        } catch (error) {
            this.logger.error('Failed to initialize workspace:', error);
            throw error;
        }
    }

    /**
     * Start resource monitoring
     */
    _startResourceMonitoring() {
        this.resourceMonitor = setInterval(async () => {
            try {
                await this._monitorResources();
                await this._cleanupExpiredDeployments();
            } catch (error) {
                this.logger.error('Resource monitoring error:', error);
            }
        }, 60000); // Check every minute
    }

    /**
     * Check WSL2 availability and setup
     */
    async checkWSL2Setup() {
        try {
            // Check if WSL2 is available
            const { stdout: wslVersion } = await execAsync('wsl --version');
            this.logger.debug('WSL version info:', wslVersion);

            // Check if distribution exists
            const { stdout: distributions } = await execAsync('wsl --list --verbose');
            const hasDistribution = distributions.includes(this.config.wslDistribution);

            if (!hasDistribution) {
                this.logger.warn(`WSL distribution ${this.config.wslDistribution} not found`);
                return {
                    available: false,
                    reason: `Distribution ${this.config.wslDistribution} not installed`
                };
            }

            // Check if distribution is running
            const isRunning = distributions.includes('Running');
            
            return {
                available: true,
                distribution: this.config.wslDistribution,
                isRunning,
                version: wslVersion.trim()
            };
        } catch (error) {
            this.logger.error('WSL2 setup check failed:', error);
            return {
                available: false,
                reason: error.message
            };
        }
    }

    /**
     * Deploy PR to WSL2 environment
     */
    async deployPR(prInfo, options = {}) {
        try {
            const deploymentId = this._generateDeploymentId(prInfo);
            
            this.logger.info(`Starting WSL2 deployment for PR #${prInfo.number}`, {
                deploymentId,
                repository: prInfo.repository,
                branch: prInfo.branch
            });

            // Check if we can start deployment immediately
            if (this.activeDeployments.size >= this.config.maxConcurrentDeployments) {
                this.logger.info(`Deployment queued (${this.deploymentQueue.length + 1} in queue)`);
                return this._queueDeployment(deploymentId, prInfo, options);
            }

            return await this._executeDeployment(deploymentId, prInfo, options);
        } catch (error) {
            this.logger.error('Deployment failed:', error);
            throw error;
        }
    }

    /**
     * Generate unique deployment ID
     */
    _generateDeploymentId(prInfo) {
        const timestamp = Date.now();
        const hash = require('crypto')
            .createHash('md5')
            .update(`${prInfo.repository}-${prInfo.number}-${prInfo.branch}`)
            .digest('hex')
            .substring(0, 8);
        return `deploy-${hash}-${timestamp}`;
    }

    /**
     * Queue deployment for later execution
     */
    async _queueDeployment(deploymentId, prInfo, options) {
        return new Promise((resolve, reject) => {
            this.deploymentQueue.push({
                deploymentId,
                prInfo,
                options,
                resolve,
                reject,
                queuedAt: new Date()
            });

            this._processDeploymentQueue();
        });
    }

    /**
     * Process deployment queue
     */
    async _processDeploymentQueue() {
        if (this.isProcessingQueue || this.deploymentQueue.length === 0) {
            return;
        }

        if (this.activeDeployments.size >= this.config.maxConcurrentDeployments) {
            return;
        }

        this.isProcessingQueue = true;

        try {
            while (this.deploymentQueue.length > 0 && 
                   this.activeDeployments.size < this.config.maxConcurrentDeployments) {
                
                const deployment = this.deploymentQueue.shift();
                
                try {
                    const result = await this._executeDeployment(
                        deployment.deploymentId,
                        deployment.prInfo,
                        deployment.options
                    );
                    deployment.resolve(result);
                } catch (error) {
                    deployment.reject(error);
                }
            }
        } finally {
            this.isProcessingQueue = false;
        }
    }

    /**
     * Execute deployment
     */
    async _executeDeployment(deploymentId, prInfo, options) {
        const deployment = {
            id: deploymentId,
            prInfo,
            options,
            status: 'initializing',
            startTime: new Date(),
            workspacePath: join(this.config.workspaceRoot, deploymentId),
            logs: [],
            environment: null
        };

        this.activeDeployments.set(deploymentId, deployment);

        try {
            // Emit deployment started event
            this.emit('deployment.started', {
                deploymentId,
                prInfo,
                timestamp: new Date().toISOString()
            });

            // Step 1: Setup workspace
            await this._setupWorkspace(deployment);

            // Step 2: Clone repository
            await this._cloneRepository(deployment);

            // Step 3: Setup environment
            await this._setupEnvironment(deployment);

            // Step 4: Install dependencies
            await this._installDependencies(deployment);

            // Step 5: Run validation
            const validationResult = await this._runValidation(deployment);

            // Mark as completed
            deployment.status = 'completed';
            deployment.endTime = new Date();
            deployment.result = validationResult;

            this.emit('deployment.completed', {
                deploymentId,
                result: validationResult,
                duration: deployment.endTime - deployment.startTime,
                timestamp: new Date().toISOString()
            });

            this.logger.info(`Deployment completed successfully: ${deploymentId}`);

            // Process next in queue
            this._processDeploymentQueue();

            return {
                success: true,
                deploymentId,
                result: validationResult,
                workspacePath: deployment.workspacePath
            };

        } catch (error) {
            deployment.status = 'failed';
            deployment.endTime = new Date();
            deployment.error = error.message;

            this.emit('deployment.failed', {
                deploymentId,
                error: error.message,
                timestamp: new Date().toISOString()
            });

            this.logger.error(`Deployment failed: ${deploymentId}`, error);

            // Process next in queue
            this._processDeploymentQueue();

            throw error;
        }
    }

    /**
     * Setup workspace directory
     */
    async _setupWorkspace(deployment) {
        try {
            deployment.status = 'setting_up_workspace';
            this.logger.info(`Setting up workspace: ${deployment.workspacePath}`);

            // Create workspace directory
            if (!existsSync(deployment.workspacePath)) {
                mkdirSync(deployment.workspacePath, { recursive: true });
            }

            // Create subdirectories
            const subdirs = ['repo', 'logs', 'artifacts', 'scripts'];
            for (const subdir of subdirs) {
                const path = join(deployment.workspacePath, subdir);
                if (!existsSync(path)) {
                    mkdirSync(path, { recursive: true });
                }
            }

            deployment.logs.push({
                timestamp: new Date(),
                level: 'info',
                message: 'Workspace setup completed'
            });

        } catch (error) {
            throw new Error(`Workspace setup failed: ${error.message}`);
        }
    }

    /**
     * Clone repository
     */
    async _cloneRepository(deployment) {
        try {
            deployment.status = 'cloning_repository';
            const { prInfo } = deployment;
            const repoPath = join(deployment.workspacePath, 'repo');

            this.logger.info(`Cloning repository: ${prInfo.repository}#${prInfo.branch}`);

            // Build git clone command
            const cloneUrl = prInfo.cloneUrl || `https://github.com/${prInfo.repository}.git`;
            const command = `git clone --branch ${prInfo.branch} --single-branch ${cloneUrl} ${repoPath}`;

            // Execute in WSL2
            const result = await this._executeInWSL(command, {
                cwd: deployment.workspacePath,
                timeout: 5 * 60 * 1000 // 5 minutes
            });

            if (result.exitCode !== 0) {
                throw new Error(`Git clone failed: ${result.stderr}`);
            }

            deployment.logs.push({
                timestamp: new Date(),
                level: 'info',
                message: 'Repository cloned successfully'
            });

        } catch (error) {
            throw new Error(`Repository cloning failed: ${error.message}`);
        }
    }

    /**
     * Setup environment
     */
    async _setupEnvironment(deployment) {
        try {
            deployment.status = 'setting_up_environment';
            const repoPath = join(deployment.workspacePath, 'repo');

            this.logger.info(`Setting up environment: ${this.config.environmentTemplate}`);

            // Detect project type and setup accordingly
            const projectType = await this._detectProjectType(repoPath);
            deployment.environment = projectType;

            switch (projectType) {
                case 'nodejs':
                    await this._setupNodeJSEnvironment(deployment);
                    break;
                case 'python':
                    await this._setupPythonEnvironment(deployment);
                    break;
                case 'docker':
                    await this._setupDockerEnvironment(deployment);
                    break;
                default:
                    await this._setupGenericEnvironment(deployment);
            }

            deployment.logs.push({
                timestamp: new Date(),
                level: 'info',
                message: `Environment setup completed: ${projectType}`
            });

        } catch (error) {
            throw new Error(`Environment setup failed: ${error.message}`);
        }
    }

    /**
     * Detect project type
     */
    async _detectProjectType(repoPath) {
        const files = [
            { file: 'package.json', type: 'nodejs' },
            { file: 'requirements.txt', type: 'python' },
            { file: 'pyproject.toml', type: 'python' },
            { file: 'Dockerfile', type: 'docker' },
            { file: 'docker-compose.yml', type: 'docker' }
        ];

        for (const { file, type } of files) {
            if (existsSync(join(repoPath, file))) {
                return type;
            }
        }

        return 'generic';
    }

    /**
     * Setup Node.js environment
     */
    async _setupNodeJSEnvironment(deployment) {
        const commands = [
            'curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -',
            'sudo apt-get install -y nodejs',
            'npm --version',
            'node --version'
        ];

        for (const command of commands) {
            const result = await this._executeInWSL(command, {
                cwd: deployment.workspacePath
            });

            if (result.exitCode !== 0) {
                throw new Error(`Node.js setup failed: ${result.stderr}`);
            }
        }
    }

    /**
     * Setup Python environment
     */
    async _setupPythonEnvironment(deployment) {
        const commands = [
            'sudo apt-get update',
            'sudo apt-get install -y python3 python3-pip python3-venv',
            'python3 --version',
            'pip3 --version'
        ];

        for (const command of commands) {
            const result = await this._executeInWSL(command, {
                cwd: deployment.workspacePath
            });

            if (result.exitCode !== 0) {
                throw new Error(`Python setup failed: ${result.stderr}`);
            }
        }
    }

    /**
     * Setup Docker environment
     */
    async _setupDockerEnvironment(deployment) {
        const commands = [
            'sudo apt-get update',
            'sudo apt-get install -y docker.io docker-compose',
            'sudo systemctl start docker',
            'sudo usermod -aG docker $USER',
            'docker --version'
        ];

        for (const command of commands) {
            const result = await this._executeInWSL(command, {
                cwd: deployment.workspacePath
            });

            if (result.exitCode !== 0) {
                throw new Error(`Docker setup failed: ${result.stderr}`);
            }
        }
    }

    /**
     * Setup generic environment
     */
    async _setupGenericEnvironment(deployment) {
        const commands = [
            'sudo apt-get update',
            'sudo apt-get install -y build-essential git curl wget'
        ];

        for (const command of commands) {
            const result = await this._executeInWSL(command, {
                cwd: deployment.workspacePath
            });

            if (result.exitCode !== 0) {
                throw new Error(`Generic setup failed: ${result.stderr}`);
            }
        }
    }

    /**
     * Install dependencies
     */
    async _installDependencies(deployment) {
        try {
            deployment.status = 'installing_dependencies';
            const repoPath = join(deployment.workspacePath, 'repo');

            this.logger.info('Installing project dependencies');

            let installCommand;
            switch (deployment.environment) {
                case 'nodejs':
                    installCommand = 'npm install';
                    break;
                case 'python':
                    installCommand = 'pip3 install -r requirements.txt';
                    break;
                case 'docker':
                    installCommand = 'docker-compose build';
                    break;
                default:
                    // Skip dependency installation for generic projects
                    return;
            }

            const result = await this._executeInWSL(installCommand, {
                cwd: repoPath,
                timeout: 10 * 60 * 1000 // 10 minutes
            });

            if (result.exitCode !== 0) {
                throw new Error(`Dependency installation failed: ${result.stderr}`);
            }

            deployment.logs.push({
                timestamp: new Date(),
                level: 'info',
                message: 'Dependencies installed successfully'
            });

        } catch (error) {
            throw new Error(`Dependency installation failed: ${error.message}`);
        }
    }

    /**
     * Run validation
     */
    async _runValidation(deployment) {
        try {
            deployment.status = 'running_validation';
            const repoPath = join(deployment.workspacePath, 'repo');

            this.logger.info('Running validation tests');

            const validationResults = {
                tests: [],
                linting: null,
                build: null,
                security: null,
                performance: null
            };

            // Run tests
            if (deployment.environment === 'nodejs') {
                validationResults.tests = await this._runNodeJSTests(repoPath);
                validationResults.linting = await this._runNodeJSLinting(repoPath);
                validationResults.build = await this._runNodeJSBuild(repoPath);
            } else if (deployment.environment === 'python') {
                validationResults.tests = await this._runPythonTests(repoPath);
                validationResults.linting = await this._runPythonLinting(repoPath);
            }

            // Run security scan
            validationResults.security = await this._runSecurityScan(repoPath);

            deployment.logs.push({
                timestamp: new Date(),
                level: 'info',
                message: 'Validation completed'
            });

            return validationResults;

        } catch (error) {
            throw new Error(`Validation failed: ${error.message}`);
        }
    }

    /**
     * Run Node.js tests
     */
    async _runNodeJSTests(repoPath) {
        try {
            const result = await this._executeInWSL('npm test', {
                cwd: repoPath,
                timeout: 5 * 60 * 1000
            });

            return {
                success: result.exitCode === 0,
                output: result.stdout,
                error: result.stderr
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Run Node.js linting
     */
    async _runNodeJSLinting(repoPath) {
        try {
            const result = await this._executeInWSL('npm run lint', {
                cwd: repoPath,
                timeout: 2 * 60 * 1000
            });

            return {
                success: result.exitCode === 0,
                output: result.stdout,
                error: result.stderr
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Run Node.js build
     */
    async _runNodeJSBuild(repoPath) {
        try {
            const result = await this._executeInWSL('npm run build', {
                cwd: repoPath,
                timeout: 5 * 60 * 1000
            });

            return {
                success: result.exitCode === 0,
                output: result.stdout,
                error: result.stderr
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Run Python tests
     */
    async _runPythonTests(repoPath) {
        try {
            const result = await this._executeInWSL('python3 -m pytest', {
                cwd: repoPath,
                timeout: 5 * 60 * 1000
            });

            return {
                success: result.exitCode === 0,
                output: result.stdout,
                error: result.stderr
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Run Python linting
     */
    async _runPythonLinting(repoPath) {
        try {
            const result = await this._executeInWSL('python3 -m flake8', {
                cwd: repoPath,
                timeout: 2 * 60 * 1000
            });

            return {
                success: result.exitCode === 0,
                output: result.stdout,
                error: result.stderr
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Run security scan
     */
    async _runSecurityScan(repoPath) {
        try {
            // Basic security scan using available tools
            const commands = [
                'find . -name "*.env*" -type f',
                'find . -name "*secret*" -type f',
                'find . -name "*key*" -type f'
            ];

            const results = [];
            for (const command of commands) {
                const result = await this._executeInWSL(command, {
                    cwd: repoPath,
                    timeout: 30000
                });
                results.push(result.stdout);
            }

            return {
                success: true,
                findings: results.filter(r => r.trim().length > 0)
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Execute command in WSL2
     */
    async _executeInWSL(command, options = {}) {
        return new Promise((resolve, reject) => {
            const {
                cwd = this.config.workspaceRoot,
                timeout = this.config.deploymentTimeout,
                env = {}
            } = options;

            const wslCommand = `wsl -d ${this.config.wslDistribution} --cd ${cwd} -- ${command}`;
            
            this.logger.debug(`Executing WSL command: ${wslCommand}`);

            const process = spawn('cmd', ['/c', wslCommand], {
                stdio: 'pipe',
                env: { ...process.env, ...env }
            });

            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            const timer = setTimeout(() => {
                process.kill('SIGKILL');
                reject(new Error(`Command timeout after ${timeout}ms`));
            }, timeout);

            process.on('close', (code) => {
                clearTimeout(timer);
                resolve({
                    exitCode: code,
                    stdout: stdout.trim(),
                    stderr: stderr.trim()
                });
            });

            process.on('error', (error) => {
                clearTimeout(timer);
                reject(error);
            });
        });
    }

    /**
     * Monitor resource usage
     */
    async _monitorResources() {
        try {
            // Monitor WSL2 resource usage
            const { stdout } = await execAsync('wsl --list --running');
            const runningDistributions = stdout.split('\n').filter(line => line.trim());

            for (const deployment of this.activeDeployments.values()) {
                // Check if deployment is taking too long
                const duration = Date.now() - deployment.startTime.getTime();
                if (duration > this.config.deploymentTimeout) {
                    this.logger.warn(`Deployment timeout: ${deployment.id}`);
                    await this.stopDeployment(deployment.id, 'timeout');
                }
            }
        } catch (error) {
            this.logger.error('Resource monitoring error:', error);
        }
    }

    /**
     * Cleanup expired deployments
     */
    async _cleanupExpiredDeployments() {
        const cutoffTime = new Date();
        cutoffTime.setHours(cutoffTime.getHours() - this.config.cleanupAfterHours);

        for (const [deploymentId, deployment] of this.activeDeployments.entries()) {
            if (deployment.endTime && deployment.endTime < cutoffTime) {
                this.logger.info(`Cleaning up expired deployment: ${deploymentId}`);
                await this.cleanupDeployment(deploymentId);
            }
        }
    }

    /**
     * Stop deployment
     */
    async stopDeployment(deploymentId, reason = 'manual') {
        const deployment = this.activeDeployments.get(deploymentId);
        if (!deployment) {
            return false;
        }

        try {
            deployment.status = 'stopping';
            deployment.endTime = new Date();

            this.emit('deployment.stopped', {
                deploymentId,
                reason,
                timestamp: new Date().toISOString()
            });

            this.logger.info(`Deployment stopped: ${deploymentId} (${reason})`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to stop deployment ${deploymentId}:`, error);
            return false;
        }
    }

    /**
     * Cleanup deployment
     */
    async cleanupDeployment(deploymentId) {
        const deployment = this.activeDeployments.get(deploymentId);
        if (!deployment) {
            return false;
        }

        try {
            // Remove workspace directory
            if (existsSync(deployment.workspacePath)) {
                await execAsync(`rmdir /s /q "${deployment.workspacePath}"`);
            }

            this.activeDeployments.delete(deploymentId);

            this.emit('deployment.cleaned', {
                deploymentId,
                timestamp: new Date().toISOString()
            });

            this.logger.info(`Deployment cleaned up: ${deploymentId}`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to cleanup deployment ${deploymentId}:`, error);
            return false;
        }
    }

    /**
     * Get deployment status
     */
    getDeploymentStatus(deploymentId) {
        const deployment = this.activeDeployments.get(deploymentId);
        if (!deployment) {
            return null;
        }

        return {
            id: deployment.id,
            status: deployment.status,
            prInfo: deployment.prInfo,
            startTime: deployment.startTime,
            endTime: deployment.endTime,
            duration: deployment.endTime ? 
                deployment.endTime - deployment.startTime : 
                Date.now() - deployment.startTime.getTime(),
            environment: deployment.environment,
            logs: deployment.logs.slice(-10), // Last 10 log entries
            result: deployment.result
        };
    }

    /**
     * List all deployments
     */
    listDeployments() {
        return Array.from(this.activeDeployments.values()).map(deployment => ({
            id: deployment.id,
            status: deployment.status,
            prNumber: deployment.prInfo.number,
            repository: deployment.prInfo.repository,
            branch: deployment.prInfo.branch,
            startTime: deployment.startTime,
            duration: deployment.endTime ? 
                deployment.endTime - deployment.startTime : 
                Date.now() - deployment.startTime.getTime()
        }));
    }

    /**
     * Get deployment statistics
     */
    getStats() {
        return {
            activeDeployments: this.activeDeployments.size,
            queuedDeployments: this.deploymentQueue.length,
            maxConcurrent: this.config.maxConcurrentDeployments,
            totalCompleted: 0, // Would track in production
            averageDuration: 0, // Would calculate in production
            successRate: 0 // Would calculate in production
        };
    }

    /**
     * Shutdown deployment manager
     */
    async shutdown() {
        try {
            // Stop resource monitoring
            if (this.resourceMonitor) {
                clearInterval(this.resourceMonitor);
            }

            // Stop all active deployments
            const stopPromises = Array.from(this.activeDeployments.keys())
                .map(id => this.stopDeployment(id, 'shutdown'));
            
            await Promise.all(stopPromises);

            this.logger.info('WSL2 Deployment Manager shutdown completed');
        } catch (error) {
            this.logger.error('Error during shutdown:', error);
        }
    }
}

export default WSL2DeploymentManager;

