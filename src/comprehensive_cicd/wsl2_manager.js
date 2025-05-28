/**
 * @fileoverview WSL2 Instance Manager
 * @description Manages dedicated WSL2 instances for Claude Code validation per project
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

/**
 * WSL2 Instance Manager
 * Handles creation, management, and cleanup of WSL2 instances for project isolation
 */
export class WSL2Manager {
    constructor(options = {}) {
        this.config = {
            baseDistro: options.baseDistro || 'Ubuntu-22.04',
            basePath: options.basePath || '/mnt/c/projects',
            maxInstances: options.maxInstances || 5,
            instanceTimeout: options.instanceTimeout || 1800000, // 30 minutes
            claudeCodePath: options.claudeCodePath || '/usr/local/bin/claude',
            ...options
        };
        
        this.activeInstances = new Map();
        this.instancePool = new Set();
        this.cleanupInterval = null;
        
        this._initializeManager();
    }

    /**
     * Create a dedicated WSL2 instance for a project
     * @param {string} projectId - Project identifier
     * @param {Object} projectConfig - Project configuration
     * @returns {Promise<Object>} Instance information
     */
    async createProjectInstance(projectId, projectConfig = {}) {
        try {
            console.log(`🔧 Creating WSL2 instance for project: ${projectId}`);
            
            // Check if instance already exists
            if (this.activeInstances.has(projectId)) {
                const existingInstance = this.activeInstances.get(projectId);
                if (await this._isInstanceHealthy(existingInstance.name)) {
                    console.log(`✅ Using existing healthy instance for project: ${projectId}`);
                    return existingInstance;
                }
                
                // Clean up unhealthy instance
                await this._cleanupInstance(existingInstance.name);
                this.activeInstances.delete(projectId);
            }
            
            // Check instance limits
            if (this.activeInstances.size >= this.config.maxInstances) {
                throw new Error(`Maximum WSL2 instances (${this.config.maxInstances}) reached`);
            }
            
            // Generate unique instance name
            const instanceName = `codegen-${projectId}-${Date.now()}`;
            const instancePath = path.join(this.config.basePath, instanceName);
            
            // Create WSL2 instance
            const instance = await this._createWSL2Instance(instanceName, projectConfig);
            
            // Setup project environment
            await this._setupProjectEnvironment(instance, projectConfig);
            
            // Install Claude Code
            await this._installClaudeCode(instance);
            
            // Configure networking and access
            await this._configureInstanceNetworking(instance);
            
            // Register instance
            const instanceInfo = {
                name: instanceName,
                projectId: projectId,
                path: instancePath,
                config: projectConfig,
                createdAt: new Date(),
                lastUsed: new Date(),
                status: 'ready',
                ports: instance.ports,
                agentApiPort: instance.agentApiPort
            };
            
            this.activeInstances.set(projectId, instanceInfo);
            
            console.log(`✅ WSL2 instance created for project ${projectId}: ${instanceName}`);
            return instanceInfo;
            
        } catch (error) {
            console.error(`❌ Failed to create WSL2 instance for project ${projectId}:`, error);
            throw error;
        }
    }

    /**
     * Get or create WSL2 instance for a project
     * @param {string} projectId - Project identifier
     * @param {Object} projectConfig - Project configuration
     * @returns {Promise<Object>} Instance information
     */
    async getProjectInstance(projectId, projectConfig = {}) {
        const existingInstance = this.activeInstances.get(projectId);
        
        if (existingInstance && await this._isInstanceHealthy(existingInstance.name)) {
            // Update last used timestamp
            existingInstance.lastUsed = new Date();
            return existingInstance;
        }
        
        // Create new instance
        return await this.createProjectInstance(projectId, projectConfig);
    }

    /**
     * Deploy PR branch to WSL2 instance
     * @param {string} projectId - Project identifier
     * @param {string} prUrl - PR URL
     * @param {string} branchName - Branch name
     * @param {Object} options - Deployment options
     * @returns {Promise<Object>} Deployment result
     */
    async deployPRBranch(projectId, prUrl, branchName, options = {}) {
        try {
            console.log(`🚀 Deploying PR branch ${branchName} to project ${projectId}`);
            
            // Get project instance
            const instance = await this.getProjectInstance(projectId, options.projectConfig);
            
            // Extract repository info from PR URL
            const repoInfo = this._parseRepositoryUrl(prUrl);
            
            // Clone repository and checkout branch
            const deploymentPath = await this._cloneAndCheckoutBranch(
                instance, 
                repoInfo, 
                branchName, 
                options
            );
            
            // Install dependencies
            await this._installDependencies(instance, deploymentPath, options);
            
            // Setup environment
            await this._setupDeploymentEnvironment(instance, deploymentPath, options);
            
            // Start services if needed
            const services = await this._startRequiredServices(instance, deploymentPath, options);
            
            const deploymentResult = {
                instanceName: instance.name,
                projectId: projectId,
                deploymentPath: deploymentPath,
                branchName: branchName,
                prUrl: prUrl,
                services: services,
                deployedAt: new Date(),
                status: 'deployed'
            };
            
            console.log(`✅ PR branch deployed successfully to ${instance.name}`);
            return deploymentResult;
            
        } catch (error) {
            console.error(`❌ Failed to deploy PR branch:`, error);
            throw error;
        }
    }

    /**
     * Execute Claude Code validation in WSL2 instance
     * @param {string} projectId - Project identifier
     * @param {string} deploymentPath - Path to deployed code
     * @param {Object} validationOptions - Validation options
     * @returns {Promise<Object>} Validation result
     */
    async executeClaudeCodeValidation(projectId, deploymentPath, validationOptions = {}) {
        try {
            console.log(`🔍 Executing Claude Code validation for project ${projectId}`);
            
            const instance = this.activeInstances.get(projectId);
            if (!instance) {
                throw new Error(`No WSL2 instance found for project ${projectId}`);
            }
            
            // Prepare validation command
            const validationCommand = this._buildClaudeCodeCommand(deploymentPath, validationOptions);
            
            // Execute validation
            const validationResult = await this._executeInInstance(
                instance.name, 
                validationCommand,
                {
                    timeout: validationOptions.timeout || 300000,
                    cwd: deploymentPath
                }
            );
            
            // Parse validation output
            const parsedResult = this._parseClaudeCodeOutput(validationResult);
            
            console.log(`✅ Claude Code validation completed for project ${projectId}`);
            return parsedResult;
            
        } catch (error) {
            console.error(`❌ Claude Code validation failed:`, error);
            throw error;
        }
    }

    /**
     * Cleanup WSL2 instance for a project
     * @param {string} projectId - Project identifier
     * @returns {Promise<boolean>} Success status
     */
    async cleanupProjectInstance(projectId) {
        try {
            const instance = this.activeInstances.get(projectId);
            if (!instance) {
                console.log(`ℹ️ No instance to cleanup for project ${projectId}`);
                return true;
            }
            
            console.log(`🧹 Cleaning up WSL2 instance for project ${projectId}`);
            
            // Stop services
            await this._stopInstanceServices(instance.name);
            
            // Cleanup files
            await this._cleanupInstanceFiles(instance.name);
            
            // Terminate instance
            await this._terminateInstance(instance.name);
            
            // Remove from tracking
            this.activeInstances.delete(projectId);
            
            console.log(`✅ WSL2 instance cleaned up for project ${projectId}`);
            return true;
            
        } catch (error) {
            console.error(`❌ Failed to cleanup WSL2 instance for project ${projectId}:`, error);
            return false;
        }
    }

    /**
     * Get status of all WSL2 instances
     * @returns {Promise<Object>} Instance status information
     */
    async getInstancesStatus() {
        const instances = [];
        
        for (const [projectId, instance] of this.activeInstances) {
            const isHealthy = await this._isInstanceHealthy(instance.name);
            const usage = await this._getInstanceUsage(instance.name);
            
            instances.push({
                projectId: projectId,
                name: instance.name,
                status: isHealthy ? 'healthy' : 'unhealthy',
                createdAt: instance.createdAt,
                lastUsed: instance.lastUsed,
                usage: usage
            });
        }
        
        return {
            total: this.activeInstances.size,
            maxInstances: this.config.maxInstances,
            available: this.config.maxInstances - this.activeInstances.size,
            instances: instances
        };
    }

    /**
     * Cleanup old and unused instances
     * @param {number} maxAge - Maximum age in milliseconds
     * @returns {Promise<number>} Number of cleaned up instances
     */
    async cleanupOldInstances(maxAge = 1800000) { // 30 minutes default
        let cleanedCount = 0;
        const now = new Date();
        
        for (const [projectId, instance] of this.activeInstances) {
            const age = now.getTime() - instance.lastUsed.getTime();
            
            if (age > maxAge) {
                console.log(`🧹 Cleaning up old instance for project ${projectId} (age: ${Math.round(age / 60000)}min)`);
                
                const success = await this.cleanupProjectInstance(projectId);
                if (success) {
                    cleanedCount++;
                }
            }
        }
        
        return cleanedCount;
    }

    // Private methods

    /**
     * Initialize the WSL2 manager
     * @private
     */
    async _initializeManager() {
        try {
            console.log('🔧 Initializing WSL2 Manager...');
            
            // Check WSL2 availability
            await this._checkWSL2Availability();
            
            // Setup cleanup interval
            this.cleanupInterval = setInterval(async () => {
                await this.cleanupOldInstances();
            }, 300000); // Check every 5 minutes
            
            console.log('✅ WSL2 Manager initialized');
            
        } catch (error) {
            console.error('❌ Failed to initialize WSL2 Manager:', error);
            throw error;
        }
    }

    /**
     * Check WSL2 availability
     * @private
     */
    async _checkWSL2Availability() {
        try {
            const { stdout } = await execAsync('wsl --list --verbose');
            console.log('✅ WSL2 is available');
            return true;
        } catch (error) {
            throw new Error('WSL2 is not available or not properly configured');
        }
    }

    /**
     * Create a new WSL2 instance
     * @param {string} instanceName - Instance name
     * @param {Object} config - Instance configuration
     * @returns {Promise<Object>} Instance information
     * @private
     */
    async _createWSL2Instance(instanceName, config) {
        try {
            // Import base distribution
            const importCommand = `wsl --import ${instanceName} C:\\WSL\\${instanceName} C:\\WSL\\${this.config.baseDistro}.tar`;
            await execAsync(importCommand);
            
            // Configure instance
            await this._configureInstance(instanceName, config);
            
            // Allocate ports
            const ports = await this._allocatePorts();
            
            return {
                name: instanceName,
                ports: ports,
                agentApiPort: ports.agentapi
            };
            
        } catch (error) {
            console.error(`Failed to create WSL2 instance ${instanceName}:`, error);
            throw error;
        }
    }

    /**
     * Setup project environment in WSL2 instance
     * @param {Object} instance - Instance information
     * @param {Object} config - Project configuration
     * @private
     */
    async _setupProjectEnvironment(instance, config) {
        const commands = [
            'apt-get update',
            'apt-get install -y git curl wget build-essential'
        ];
        
        // Install language-specific tools
        if (config.node_version) {
            commands.push(
                `curl -fsSL https://deb.nodesource.com/setup_${config.node_version}.x | bash -`,
                'apt-get install -y nodejs'
            );
        }
        
        if (config.python_version) {
            commands.push(
                `apt-get install -y python${config.python_version} python${config.python_version}-pip`
            );
        }
        
        // Execute setup commands
        for (const command of commands) {
            await this._executeInInstance(instance.name, command);
        }
    }

    /**
     * Install Claude Code in WSL2 instance
     * @param {Object} instance - Instance information
     * @private
     */
    async _installClaudeCode(instance) {
        const installCommands = [
            'curl -fsSL https://claude.ai/install.sh | bash',
            'claude --version' // Verify installation
        ];
        
        for (const command of installCommands) {
            await this._executeInInstance(instance.name, command);
        }
    }

    /**
     * Configure instance networking
     * @param {Object} instance - Instance information
     * @private
     */
    async _configureInstanceNetworking(instance) {
        // Setup port forwarding for AgentAPI
        const portForwardCommand = `netsh interface portproxy add v4tov4 listenport=${instance.agentApiPort} listenaddress=0.0.0.0 connectport=8000 connectaddress=localhost`;
        
        try {
            await execAsync(portForwardCommand);
        } catch (error) {
            console.warn('Port forwarding setup failed (may require admin privileges):', error.message);
        }
    }

    /**
     * Parse repository URL to extract owner and repo
     * @param {string} prUrl - PR URL
     * @returns {Object} Repository information
     * @private
     */
    _parseRepositoryUrl(prUrl) {
        const match = prUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (!match) {
            throw new Error(`Invalid GitHub PR URL: ${prUrl}`);
        }
        
        return {
            owner: match[1],
            repo: match[2],
            url: `https://github.com/${match[1]}/${match[2]}.git`
        };
    }

    /**
     * Clone repository and checkout branch
     * @param {Object} instance - Instance information
     * @param {Object} repoInfo - Repository information
     * @param {string} branchName - Branch name
     * @param {Object} options - Clone options
     * @returns {Promise<string>} Deployment path
     * @private
     */
    async _cloneAndCheckoutBranch(instance, repoInfo, branchName, options) {
        const deploymentPath = `/tmp/${repoInfo.repo}-${Date.now()}`;
        
        const commands = [
            `git clone ${repoInfo.url} ${deploymentPath}`,
            `cd ${deploymentPath} && git checkout ${branchName}`,
            `cd ${deploymentPath} && git pull origin ${branchName}`
        ];
        
        for (const command of commands) {
            await this._executeInInstance(instance.name, command);
        }
        
        return deploymentPath;
    }

    /**
     * Install dependencies in deployment
     * @param {Object} instance - Instance information
     * @param {string} deploymentPath - Deployment path
     * @param {Object} options - Installation options
     * @private
     */
    async _installDependencies(instance, deploymentPath, options) {
        // Check for package.json (Node.js)
        try {
            await this._executeInInstance(instance.name, `test -f ${deploymentPath}/package.json`);
            await this._executeInInstance(instance.name, `cd ${deploymentPath} && npm install`);
        } catch (error) {
            // No package.json found
        }
        
        // Check for requirements.txt (Python)
        try {
            await this._executeInInstance(instance.name, `test -f ${deploymentPath}/requirements.txt`);
            await this._executeInInstance(instance.name, `cd ${deploymentPath} && pip install -r requirements.txt`);
        } catch (error) {
            // No requirements.txt found
        }
        
        // Check for other dependency files as needed
    }

    /**
     * Setup deployment environment
     * @param {Object} instance - Instance information
     * @param {string} deploymentPath - Deployment path
     * @param {Object} options - Setup options
     * @private
     */
    async _setupDeploymentEnvironment(instance, deploymentPath, options) {
        // Create environment file if needed
        if (options.environment_variables) {
            const envContent = Object.entries(options.environment_variables)
                .map(([key, value]) => `${key}=${value}`)
                .join('\n');
            
            await this._executeInInstance(
                instance.name, 
                `echo "${envContent}" > ${deploymentPath}/.env`
            );
        }
        
        // Setup database if needed
        if (options.setup_database) {
            await this._setupDatabase(instance, deploymentPath, options);
        }
    }

    /**
     * Start required services
     * @param {Object} instance - Instance information
     * @param {string} deploymentPath - Deployment path
     * @param {Object} options - Service options
     * @returns {Promise<Array>} Started services
     * @private
     */
    async _startRequiredServices(instance, deploymentPath, options) {
        const services = [];
        
        // Start AgentAPI server
        const agentApiCommand = `cd ${deploymentPath} && nohup agentapi --port 8000 > agentapi.log 2>&1 &`;
        await this._executeInInstance(instance.name, agentApiCommand);
        services.push('agentapi');
        
        // Start application server if needed
        if (options.start_app_server) {
            const appCommand = options.app_start_command || 'npm start';
            await this._executeInInstance(instance.name, `cd ${deploymentPath} && nohup ${appCommand} > app.log 2>&1 &`);
            services.push('application');
        }
        
        return services;
    }

    /**
     * Build Claude Code validation command
     * @param {string} deploymentPath - Deployment path
     * @param {Object} options - Validation options
     * @returns {string} Claude Code command
     * @private
     */
    _buildClaudeCodeCommand(deploymentPath, options) {
        let command = `cd ${deploymentPath} && claude`;
        
        if (options.analysis_type) {
            command += ` --analysis ${options.analysis_type}`;
        }
        
        if (options.output_format) {
            command += ` --format ${options.output_format}`;
        }
        
        if (options.include_tests) {
            command += ' --include-tests';
        }
        
        command += ' --output validation_result.json';
        
        return command;
    }

    /**
     * Execute command in WSL2 instance
     * @param {string} instanceName - Instance name
     * @param {string} command - Command to execute
     * @param {Object} options - Execution options
     * @returns {Promise<Object>} Execution result
     * @private
     */
    async _executeInInstance(instanceName, command, options = {}) {
        const wslCommand = `wsl -d ${instanceName} -- ${command}`;
        
        try {
            const { stdout, stderr } = await execAsync(wslCommand, {
                timeout: options.timeout || 60000,
                cwd: options.cwd
            });
            
            return {
                success: true,
                stdout: stdout,
                stderr: stderr
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message,
                stdout: error.stdout || '',
                stderr: error.stderr || ''
            };
        }
    }

    /**
     * Parse Claude Code output
     * @param {Object} executionResult - Execution result
     * @returns {Object} Parsed validation result
     * @private
     */
    _parseClaudeCodeOutput(executionResult) {
        try {
            if (!executionResult.success) {
                throw new Error(`Claude Code execution failed: ${executionResult.error}`);
            }
            
            // Parse JSON output
            const output = JSON.parse(executionResult.stdout);
            
            return {
                status: output.status || 'completed',
                score: output.score || { overall_score: 0 },
                feedback: output.feedback || [],
                suggestions: output.suggestions || [],
                analysis: output.analysis || {},
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('Failed to parse Claude Code output:', error);
            
            return {
                status: 'error',
                error: error.message,
                raw_output: executionResult,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Check if instance is healthy
     * @param {string} instanceName - Instance name
     * @returns {Promise<boolean>} Health status
     * @private
     */
    async _isInstanceHealthy(instanceName) {
        try {
            const result = await this._executeInInstance(instanceName, 'echo "health_check"');
            return result.success && result.stdout.includes('health_check');
        } catch (error) {
            return false;
        }
    }

    /**
     * Get instance resource usage
     * @param {string} instanceName - Instance name
     * @returns {Promise<Object>} Usage information
     * @private
     */
    async _getInstanceUsage(instanceName) {
        try {
            const memResult = await this._executeInInstance(instanceName, 'free -m');
            const cpuResult = await this._executeInInstance(instanceName, 'top -bn1 | grep "Cpu(s)"');
            
            return {
                memory: memResult.stdout,
                cpu: cpuResult.stdout,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Allocate ports for instance
     * @returns {Promise<Object>} Allocated ports
     * @private
     */
    async _allocatePorts() {
        // Simple port allocation - in production, this would be more sophisticated
        const basePort = 8000 + this.activeInstances.size;
        
        return {
            agentapi: basePort,
            application: basePort + 1000,
            database: basePort + 2000
        };
    }

    /**
     * Configure WSL2 instance
     * @param {string} instanceName - Instance name
     * @param {Object} config - Configuration
     * @private
     */
    async _configureInstance(instanceName, config) {
        // Configure memory and CPU limits
        const wslConfig = `
[wsl2]
memory=${config.memory || '4GB'}
processors=${config.processors || 2}
swap=${config.swap || '1GB'}
localhostForwarding=true
`;
        
        // Write configuration (simplified - actual implementation would be more complex)
        console.log(`Configuring instance ${instanceName} with:`, config);
    }

    /**
     * Cleanup instance files and resources
     * @param {string} instanceName - Instance name
     * @private
     */
    async _cleanupInstanceFiles(instanceName) {
        await this._executeInInstance(instanceName, 'rm -rf /tmp/*');
        await this._executeInInstance(instanceName, 'pkill -f agentapi');
    }

    /**
     * Stop instance services
     * @param {string} instanceName - Instance name
     * @private
     */
    async _stopInstanceServices(instanceName) {
        await this._executeInInstance(instanceName, 'pkill -f agentapi');
        await this._executeInInstance(instanceName, 'pkill -f node');
    }

    /**
     * Terminate WSL2 instance
     * @param {string} instanceName - Instance name
     * @private
     */
    async _terminateInstance(instanceName) {
        try {
            await execAsync(`wsl --terminate ${instanceName}`);
            await execAsync(`wsl --unregister ${instanceName}`);
        } catch (error) {
            console.error(`Failed to terminate instance ${instanceName}:`, error);
        }
    }

    /**
     * Setup database for deployment
     * @param {Object} instance - Instance information
     * @param {string} deploymentPath - Deployment path
     * @param {Object} options - Database options
     * @private
     */
    async _setupDatabase(instance, deploymentPath, options) {
        // Install and configure database based on project needs
        if (options.database_type === 'postgresql') {
            const commands = [
                'apt-get install -y postgresql postgresql-contrib',
                'service postgresql start',
                `sudo -u postgres createdb ${options.database_name || 'testdb'}`
            ];
            
            for (const command of commands) {
                await this._executeInInstance(instance.name, command);
            }
        }
    }

    /**
     * Cleanup instance
     * @param {string} instanceName - Instance name
     * @private
     */
    async _cleanupInstance(instanceName) {
        await this._stopInstanceServices(instanceName);
        await this._cleanupInstanceFiles(instanceName);
        await this._terminateInstance(instanceName);
    }
}

/**
 * Create WSL2 manager instance
 * @param {Object} options - Configuration options
 * @returns {WSL2Manager} WSL2 manager instance
 */
export function createWSL2Manager(options = {}) {
    return new WSL2Manager(options);
}

/**
 * Get WSL2 system status
 * @returns {Promise<Object>} System status
 */
export async function getWSL2SystemStatus() {
    try {
        const { stdout } = await execAsync('wsl --list --verbose');
        const lines = stdout.split('\n').filter(line => line.trim());
        
        const distributions = lines.slice(1).map(line => {
            const parts = line.trim().split(/\s+/);
            return {
                name: parts[0],
                state: parts[1],
                version: parts[2]
            };
        });
        
        return {
            available: true,
            distributions: distributions,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        return {
            available: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

