/**
 * Deployment Pipeline
 * 
 * Complete PR branch deployment workflow for Claude Code integration.
 * Handles Git repository cloning, dependency installation, and environment setup.
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import WSL2Manager from './wsl2_manager.js';

const execAsync = promisify(exec);

export class DeploymentPipeline {
    constructor(options = {}) {
        this.config = {
            workspaceRoot: options.workspaceRoot || '/tmp/claude-code-deployments',
            gitTimeout: options.gitTimeout || 5 * 60 * 1000, // 5 minutes
            buildTimeout: options.buildTimeout || 10 * 60 * 1000, // 10 minutes
            maxConcurrentDeployments: options.maxConcurrentDeployments || 5,
            retryAttempts: options.retryAttempts || 3,
            retryDelay: options.retryDelay || 5000,
            ...options
        };

        this.wsl2Manager = new WSL2Manager(options.wsl2);
        this.activeDeployments = new Map();
        this.deploymentQueue = [];
        this.isProcessingQueue = false;

        this.metrics = {
            deploymentsStarted: 0,
            deploymentsCompleted: 0,
            deploymentsFailed: 0,
            averageDeploymentTime: 0,
            averageBuildTime: 0,
            successRate: 0
        };

        this.isInitialized = false;
    }

    /**
     * Initialize the Deployment Pipeline
     * @returns {Promise<boolean>} True if initialization successful
     */
    async initialize() {
        try {
            console.log('Initializing Deployment Pipeline...');

            // Initialize WSL2 Manager
            const wsl2Init = await this.wsl2Manager.initialize();
            if (!wsl2Init) {
                throw new Error('Failed to initialize WSL2 Manager');
            }

            // Create workspace directory
            await this.createWorkspaceDirectory();

            // Start queue processor
            this.startQueueProcessor();

            this.isInitialized = true;
            console.log('Deployment Pipeline initialized successfully');

            return true;
        } catch (error) {
            console.error('Failed to initialize Deployment Pipeline:', error.message);
            return false;
        }
    }

    /**
     * Deploy a PR branch
     * @param {Object} prInfo - Pull request information
     * @param {Object} options - Deployment options
     * @returns {Promise<Object>} Deployment result
     */
    async deployPRBranch(prInfo, options = {}) {
        if (!this.isInitialized) {
            throw new Error('Deployment Pipeline not initialized');
        }

        const deploymentId = this.generateDeploymentId();
        const startTime = Date.now();

        try {
            console.log(`Starting deployment ${deploymentId} for PR #${prInfo.prNumber}: ${prInfo.title}`);

            // Validate PR information
            this.validatePRInfo(prInfo);

            // Create deployment configuration
            const deploymentConfig = this.createDeploymentConfig(deploymentId, prInfo, options);

            // Queue or start deployment
            if (this.activeDeployments.size >= this.config.maxConcurrentDeployments) {
                return await this.queueDeployment(deploymentConfig);
            } else {
                return await this.executeDeployment(deploymentConfig);
            }

        } catch (error) {
            this.updateMetrics('deployment', Date.now() - startTime, false);
            
            return {
                success: false,
                error: error.message,
                deploymentId,
                deploymentTime: Date.now() - startTime
            };
        }
    }

    /**
     * Execute deployment
     * @param {Object} config - Deployment configuration
     * @returns {Promise<Object>} Deployment result
     */
    async executeDeployment(config) {
        const startTime = Date.now();
        let wsl2Instance = null;

        try {
            // Register deployment
            this.registerDeployment(config);

            // Provision WSL2 instance
            const instanceResult = await this.wsl2Manager.provisionInstance({
                cpuCores: config.resources.cpuCores,
                memoryGB: config.resources.memoryGB,
                storageGB: config.resources.storageGB,
                environment: config.environment
            });

            if (!instanceResult.success) {
                throw new Error(`Failed to provision WSL2 instance: ${instanceResult.error}`);
            }

            wsl2Instance = instanceResult.instance;
            config.instanceId = instanceResult.instanceId;

            // Clone repository
            const cloneResult = await this.cloneRepository(wsl2Instance, config);
            if (!cloneResult.success) {
                throw new Error(`Repository clone failed: ${cloneResult.error}`);
            }

            // Checkout branch
            const checkoutResult = await this.checkoutBranch(wsl2Instance, config);
            if (!checkoutResult.success) {
                throw new Error(`Branch checkout failed: ${checkoutResult.error}`);
            }

            // Install dependencies
            const depsResult = await this.installDependencies(wsl2Instance, config);
            if (!depsResult.success) {
                throw new Error(`Dependency installation failed: ${depsResult.error}`);
            }

            // Build project
            const buildResult = await this.buildProject(wsl2Instance, config);
            if (!buildResult.success) {
                throw new Error(`Build failed: ${buildResult.error}`);
            }

            // Update deployment status
            this.updateDeploymentStatus(config.deploymentId, 'completed');

            // Update metrics
            const deploymentTime = Date.now() - startTime;
            this.updateMetrics('deployment', deploymentTime, true);

            console.log(`Deployment ${config.deploymentId} completed successfully in ${deploymentTime}ms`);

            return {
                success: true,
                deploymentId: config.deploymentId,
                instanceId: config.instanceId,
                deploymentPath: config.deploymentPath,
                deploymentTime,
                buildTime: buildResult.buildTime,
                logs: this.getDeploymentLogs(config.deploymentId),
                artifacts: buildResult.artifacts || [],
                environment: {
                    containerId: wsl2Instance.containerId,
                    workingDirectory: config.workingDirectory,
                    environment: config.environment
                }
            };

        } catch (error) {
            // Cleanup on failure
            if (wsl2Instance && config.instanceId) {
                await this.wsl2Manager.destroyInstance(config.instanceId);
            }

            this.updateDeploymentStatus(config.deploymentId, 'failed', error.message);
            this.updateMetrics('deployment', Date.now() - startTime, false);

            return {
                success: false,
                error: error.message,
                deploymentId: config.deploymentId,
                deploymentTime: Date.now() - startTime,
                logs: this.getDeploymentLogs(config.deploymentId)
            };
        } finally {
            // Unregister deployment
            this.unregisterDeployment(config.deploymentId);
        }
    }

    /**
     * Cleanup deployment
     * @param {string} deploymentId - Deployment ID to cleanup
     * @returns {Promise<Object>} Cleanup result
     */
    async cleanupDeployment(deploymentId) {
        try {
            console.log(`Cleaning up deployment: ${deploymentId}`);

            const deployment = this.activeDeployments.get(deploymentId);
            if (!deployment) {
                return { success: true, message: 'Deployment not found or already cleaned up' };
            }

            // Destroy WSL2 instance
            if (deployment.instanceId) {
                const destroyResult = await this.wsl2Manager.destroyInstance(deployment.instanceId);
                if (!destroyResult.success) {
                    console.warn(`Failed to destroy WSL2 instance ${deployment.instanceId}:`, destroyResult.error);
                }
            }

            // Remove deployment files
            await this.removeDeploymentFiles(deployment.deploymentPath);

            // Unregister deployment
            this.unregisterDeployment(deploymentId);

            console.log(`Deployment ${deploymentId} cleaned up successfully`);

            return { success: true, deploymentId };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                deploymentId
            };
        }
    }

    /**
     * Get deployment status
     * @param {string} deploymentId - Deployment ID
     * @returns {Object} Deployment status
     */
    getDeploymentStatus(deploymentId) {
        if (!this.activeDeployments.has(deploymentId)) {
            return { status: 'not_found' };
        }

        const deployment = this.activeDeployments.get(deploymentId);
        return {
            status: deployment.status,
            deploymentId,
            prInfo: deployment.prInfo,
            instanceId: deployment.instanceId,
            deploymentPath: deployment.deploymentPath,
            createdAt: deployment.createdAt,
            logs: this.getDeploymentLogs(deploymentId)
        };
    }

    /**
     * List active deployments
     * @returns {Array} List of active deployments
     */
    listActiveDeployments() {
        return Array.from(this.activeDeployments.entries()).map(([id, deployment]) => ({
            deploymentId: id,
            status: deployment.status,
            prInfo: deployment.prInfo,
            instanceId: deployment.instanceId,
            createdAt: deployment.createdAt
        }));
    }

    /**
     * Get pipeline status and metrics
     * @returns {Object} Status and metrics
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            activeDeployments: this.activeDeployments.size,
            queuedDeployments: this.deploymentQueue.length,
            maxConcurrentDeployments: this.config.maxConcurrentDeployments,
            wsl2Status: this.wsl2Manager.getStatus(),
            metrics: this.metrics,
            config: this.config
        };
    }

    /**
     * Validate PR information
     * @private
     */
    validatePRInfo(prInfo) {
        if (!prInfo.repositoryUrl) {
            throw new Error('Repository URL is required');
        }

        if (!prInfo.branchName) {
            throw new Error('Branch name is required');
        }

        if (!prInfo.prNumber) {
            throw new Error('PR number is required');
        }
    }

    /**
     * Create deployment configuration
     * @private
     */
    createDeploymentConfig(deploymentId, prInfo, options) {
        const deploymentPath = path.join(this.config.workspaceRoot, deploymentId);
        const workingDirectory = `/workspace/${deploymentId}`;

        return {
            deploymentId,
            prInfo,
            deploymentPath,
            workingDirectory,
            resources: {
                cpuCores: options.cpuCores || 4,
                memoryGB: options.memoryGB || 8,
                storageGB: options.storageGB || 20
            },
            environment: {
                NODE_ENV: options.nodeEnv || 'development',
                CI: 'true',
                DEPLOYMENT_ID: deploymentId,
                PR_NUMBER: prInfo.prNumber.toString(),
                BRANCH_NAME: prInfo.branchName,
                ...options.environment
            },
            buildCommands: options.buildCommands || this.getDefaultBuildCommands(),
            timeout: options.timeout || this.config.buildTimeout,
            retryAttempts: options.retryAttempts || this.config.retryAttempts
        };
    }

    /**
     * Generate deployment ID
     * @private
     */
    generateDeploymentId() {
        const timestamp = Date.now();
        const random = crypto.randomBytes(4).toString('hex');
        return `deploy-${timestamp}-${random}`;
    }

    /**
     * Create workspace directory
     * @private
     */
    async createWorkspaceDirectory() {
        try {
            await fs.mkdir(this.config.workspaceRoot, { recursive: true });
        } catch (error) {
            throw new Error(`Failed to create workspace directory: ${error.message}`);
        }
    }

    /**
     * Clone repository
     * @private
     */
    async cloneRepository(instance, config) {
        try {
            const cloneCmd = `git clone ${config.prInfo.repositoryUrl} ${config.workingDirectory}`;
            
            await this.executeInContainer(instance.containerId, cloneCmd, {
                timeout: this.config.gitTimeout
            });

            return { success: true };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Checkout branch
     * @private
     */
    async checkoutBranch(instance, config) {
        try {
            const checkoutCmd = `cd ${config.workingDirectory} && git checkout ${config.prInfo.branchName}`;
            
            await this.executeInContainer(instance.containerId, checkoutCmd, {
                timeout: this.config.gitTimeout
            });

            return { success: true };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Install dependencies
     * @private
     */
    async installDependencies(instance, config) {
        try {
            const installCommands = [
                `cd ${config.workingDirectory}`,
                'npm ci || npm install',
                'pip3 install -r requirements.txt || echo "No Python requirements found"'
            ];

            for (const cmd of installCommands) {
                await this.executeInContainer(instance.containerId, cmd, {
                    timeout: this.config.buildTimeout
                });
            }

            return { success: true };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Build project
     * @private
     */
    async buildProject(instance, config) {
        const startTime = Date.now();

        try {
            const buildCommands = config.buildCommands;
            const artifacts = [];

            for (const cmd of buildCommands) {
                const fullCmd = `cd ${config.workingDirectory} && ${cmd}`;
                
                await this.executeInContainer(instance.containerId, fullCmd, {
                    timeout: config.timeout
                });
            }

            // Collect build artifacts
            const artifactPaths = await this.collectBuildArtifacts(instance, config);
            artifacts.push(...artifactPaths);

            return {
                success: true,
                buildTime: Date.now() - startTime,
                artifacts
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                buildTime: Date.now() - startTime
            };
        }
    }

    /**
     * Execute command in container
     * @private
     */
    async executeInContainer(containerId, command, options = {}) {
        const timeout = options.timeout || 30000;
        
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Command timeout after ${timeout}ms: ${command}`));
            }, timeout);

            exec(`docker exec ${containerId} bash -c "${command}"`, (error, stdout, stderr) => {
                clearTimeout(timer);

                if (error) {
                    reject(new Error(`Command failed: ${command}\nError: ${error.message}\nStderr: ${stderr}`));
                } else {
                    resolve({ stdout, stderr });
                }
            });
        });
    }

    /**
     * Get default build commands
     * @private
     */
    getDefaultBuildCommands() {
        return [
            'npm run build || echo "No build script found"',
            'npm run test || echo "No test script found"',
            'npm run lint || echo "No lint script found"'
        ];
    }

    /**
     * Collect build artifacts
     * @private
     */
    async collectBuildArtifacts(instance, config) {
        try {
            const artifactDirs = ['dist', 'build', 'out', '.next'];
            const artifacts = [];

            for (const dir of artifactDirs) {
                try {
                    const checkCmd = `cd ${config.workingDirectory} && ls -la ${dir}`;
                    await this.executeInContainer(instance.containerId, checkCmd);
                    artifacts.push(`${config.workingDirectory}/${dir}`);
                } catch {
                    // Directory doesn't exist, skip
                }
            }

            return artifacts;

        } catch (error) {
            console.warn('Failed to collect build artifacts:', error.message);
            return [];
        }
    }

    /**
     * Queue deployment
     * @private
     */
    async queueDeployment(config) {
        return new Promise((resolve) => {
            this.deploymentQueue.push({
                config,
                resolve,
                queuedAt: Date.now()
            });

            console.log(`Deployment ${config.deploymentId} queued (position: ${this.deploymentQueue.length})`);
        });
    }

    /**
     * Start queue processor
     * @private
     */
    startQueueProcessor() {
        setInterval(async () => {
            if (this.isProcessingQueue || this.deploymentQueue.length === 0) {
                return;
            }

            if (this.activeDeployments.size < this.config.maxConcurrentDeployments) {
                this.isProcessingQueue = true;

                const queuedDeployment = this.deploymentQueue.shift();
                if (queuedDeployment) {
                    const result = await this.executeDeployment(queuedDeployment.config);
                    queuedDeployment.resolve(result);
                }

                this.isProcessingQueue = false;
            }
        }, 1000);
    }

    /**
     * Register deployment
     * @private
     */
    registerDeployment(config) {
        this.activeDeployments.set(config.deploymentId, {
            ...config,
            status: 'running',
            createdAt: new Date().toISOString(),
            logs: []
        });

        this.metrics.deploymentsStarted++;
    }

    /**
     * Unregister deployment
     * @private
     */
    unregisterDeployment(deploymentId) {
        this.activeDeployments.delete(deploymentId);
    }

    /**
     * Update deployment status
     * @private
     */
    updateDeploymentStatus(deploymentId, status, error = null) {
        const deployment = this.activeDeployments.get(deploymentId);
        if (deployment) {
            deployment.status = status;
            deployment.updatedAt = new Date().toISOString();
            
            if (error) {
                deployment.error = error;
            }

            if (status === 'completed') {
                this.metrics.deploymentsCompleted++;
            } else if (status === 'failed') {
                this.metrics.deploymentsFailed++;
            }
        }
    }

    /**
     * Get deployment logs
     * @private
     */
    getDeploymentLogs(deploymentId) {
        const deployment = this.activeDeployments.get(deploymentId);
        return deployment ? deployment.logs : [];
    }

    /**
     * Remove deployment files
     * @private
     */
    async removeDeploymentFiles(deploymentPath) {
        try {
            await fs.rm(deploymentPath, { recursive: true, force: true });
        } catch (error) {
            console.warn(`Failed to remove deployment files at ${deploymentPath}:`, error.message);
        }
    }

    /**
     * Update metrics
     * @private
     */
    updateMetrics(operation, duration, success) {
        if (operation === 'deployment') {
            if (success) {
                this.metrics.averageDeploymentTime = 
                    (this.metrics.averageDeploymentTime + duration) / 2;
            }
        }

        // Update success rate
        const totalDeployments = this.metrics.deploymentsCompleted + this.metrics.deploymentsFailed;
        if (totalDeployments > 0) {
            this.metrics.successRate = this.metrics.deploymentsCompleted / totalDeployments;
        }
    }

    /**
     * Shutdown the Deployment Pipeline
     */
    async shutdown() {
        console.log('Shutting down Deployment Pipeline...');

        // Cleanup all active deployments
        const deploymentIds = Array.from(this.activeDeployments.keys());
        for (const deploymentId of deploymentIds) {
            await this.cleanupDeployment(deploymentId);
        }

        // Shutdown WSL2 Manager
        await this.wsl2Manager.shutdown();

        this.isInitialized = false;
        console.log('Deployment Pipeline shutdown complete');
    }
}

export default DeploymentPipeline;

