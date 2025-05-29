/**
 * WSL2 Manager
 * 
 * Automated WSL2 instance provisioning and management for Claude Code integration.
 * Handles containerized environment creation, resource allocation, and cleanup.
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const execAsync = promisify(exec);

export class WSL2Manager {
    constructor(options = {}) {
        this.config = {
            maxInstances: options.maxInstances || 10,
            defaultCpuCores: options.defaultCpuCores || 4,
            defaultMemoryGB: options.defaultMemoryGB || 8,
            defaultStorageGB: options.defaultStorageGB || 20,
            baseImage: options.baseImage || 'ubuntu:22.04',
            networkSubnet: options.networkSubnet || '172.20.0.0/16',
            instanceTimeout: options.instanceTimeout || 30 * 60 * 1000, // 30 minutes
            cleanupInterval: options.cleanupInterval || 5 * 60 * 1000, // 5 minutes
            ...options
        };

        this.activeInstances = new Map();
        this.instanceQueue = [];
        this.resourcePool = {
            availableCpuCores: options.totalCpuCores || 32,
            availableMemoryGB: options.totalMemoryGB || 64,
            availableStorageGB: options.totalStorageGB || 500
        };

        this.metrics = {
            instancesCreated: 0,
            instancesDestroyed: 0,
            averageProvisionTime: 0,
            resourceUtilization: 0,
            failureRate: 0
        };

        this.isInitialized = false;
        this.cleanupTimer = null;
    }

    /**
     * Initialize the WSL2 Manager
     * @returns {Promise<boolean>} True if initialization successful
     */
    async initialize() {
        try {
            console.log('Initializing WSL2 Manager...');

            // Check WSL2 availability
            await this.checkWSL2Availability();

            // Setup Docker environment
            await this.setupDockerEnvironment();

            // Create network for isolated environments
            await this.createIsolatedNetwork();

            // Start cleanup timer
            this.startCleanupTimer();

            this.isInitialized = true;
            console.log('WSL2 Manager initialized successfully');

            return true;
        } catch (error) {
            console.error('Failed to initialize WSL2 Manager:', error.message);
            return false;
        }
    }

    /**
     * Provision a new WSL2 instance
     * @param {Object} options - Instance configuration options
     * @returns {Promise<Object>} Instance information
     */
    async provisionInstance(options = {}) {
        if (!this.isInitialized) {
            throw new Error('WSL2 Manager not initialized');
        }

        const startTime = Date.now();
        const instanceId = this.generateInstanceId();

        try {
            console.log(`Provisioning WSL2 instance: ${instanceId}`);

            // Check resource availability
            await this.checkResourceAvailability(options);

            // Create instance configuration
            const instanceConfig = this.createInstanceConfig(instanceId, options);

            // Provision the instance
            const instance = await this.createInstance(instanceConfig);

            // Register instance
            this.registerInstance(instanceId, instance);

            // Update metrics
            const provisionTime = Date.now() - startTime;
            this.updateMetrics('provision', provisionTime, true);

            console.log(`WSL2 instance ${instanceId} provisioned successfully in ${provisionTime}ms`);

            return {
                success: true,
                instanceId,
                instance,
                provisionTime,
                config: instanceConfig
            };

        } catch (error) {
            this.updateMetrics('provision', Date.now() - startTime, false);
            
            return {
                success: false,
                error: error.message,
                instanceId,
                provisionTime: Date.now() - startTime
            };
        }
    }

    /**
     * Destroy a WSL2 instance
     * @param {string} instanceId - Instance ID to destroy
     * @returns {Promise<Object>} Destruction result
     */
    async destroyInstance(instanceId) {
        if (!this.activeInstances.has(instanceId)) {
            throw new Error(`Instance ${instanceId} not found`);
        }

        const startTime = Date.now();

        try {
            console.log(`Destroying WSL2 instance: ${instanceId}`);

            const instance = this.activeInstances.get(instanceId);

            // Stop and remove container
            await this.stopContainer(instance.containerId);
            await this.removeContainer(instance.containerId);

            // Cleanup volumes and networks
            await this.cleanupInstanceResources(instance);

            // Release resources
            this.releaseResources(instance.config);

            // Unregister instance
            this.activeInstances.delete(instanceId);

            // Update metrics
            this.metrics.instancesDestroyed++;

            console.log(`WSL2 instance ${instanceId} destroyed successfully`);

            return {
                success: true,
                instanceId,
                destructionTime: Date.now() - startTime
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                instanceId,
                destructionTime: Date.now() - startTime
            };
        }
    }

    /**
     * Get instance status
     * @param {string} instanceId - Instance ID
     * @returns {Object} Instance status
     */
    getInstanceStatus(instanceId) {
        if (!this.activeInstances.has(instanceId)) {
            return { status: 'not_found' };
        }

        const instance = this.activeInstances.get(instanceId);
        return {
            status: 'active',
            instanceId,
            containerId: instance.containerId,
            config: instance.config,
            createdAt: instance.createdAt,
            lastActivity: instance.lastActivity,
            resourceUsage: instance.resourceUsage
        };
    }

    /**
     * List all active instances
     * @returns {Array} List of active instances
     */
    listActiveInstances() {
        return Array.from(this.activeInstances.entries()).map(([id, instance]) => ({
            instanceId: id,
            containerId: instance.containerId,
            status: instance.status,
            createdAt: instance.createdAt,
            config: instance.config
        }));
    }

    /**
     * Scale instances based on demand
     * @param {number} targetCount - Target number of instances
     * @returns {Promise<Object>} Scaling result
     */
    async scaleInstances(targetCount) {
        const currentCount = this.activeInstances.size;
        
        if (targetCount === currentCount) {
            return { success: true, action: 'no_change', currentCount };
        }

        try {
            if (targetCount > currentCount) {
                // Scale up
                const instancesToCreate = targetCount - currentCount;
                const results = [];

                for (let i = 0; i < instancesToCreate; i++) {
                    const result = await this.provisionInstance();
                    results.push(result);
                }

                return {
                    success: true,
                    action: 'scale_up',
                    instancesCreated: instancesToCreate,
                    results
                };
            } else {
                // Scale down
                const instancesToDestroy = currentCount - targetCount;
                const instanceIds = Array.from(this.activeInstances.keys()).slice(0, instancesToDestroy);
                const results = [];

                for (const instanceId of instanceIds) {
                    const result = await this.destroyInstance(instanceId);
                    results.push(result);
                }

                return {
                    success: true,
                    action: 'scale_down',
                    instancesDestroyed: instancesToDestroy,
                    results
                };
            }
        } catch (error) {
            return {
                success: false,
                error: error.message,
                action: targetCount > currentCount ? 'scale_up' : 'scale_down'
            };
        }
    }

    /**
     * Get manager status and metrics
     * @returns {Object} Status and metrics
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            activeInstances: this.activeInstances.size,
            maxInstances: this.config.maxInstances,
            resourcePool: this.resourcePool,
            metrics: this.metrics,
            config: this.config
        };
    }

    /**
     * Check WSL2 availability
     * @private
     */
    async checkWSL2Availability() {
        try {
            const { stdout } = await execAsync('wsl --status');
            if (!stdout.includes('Default Version: 2')) {
                throw new Error('WSL2 is not available or not set as default');
            }
        } catch (error) {
            throw new Error(`WSL2 check failed: ${error.message}`);
        }
    }

    /**
     * Setup Docker environment
     * @private
     */
    async setupDockerEnvironment() {
        try {
            // Check Docker availability
            await execAsync('docker --version');
            
            // Pull base image
            console.log(`Pulling base image: ${this.config.baseImage}`);
            await execAsync(`docker pull ${this.config.baseImage}`);
            
        } catch (error) {
            throw new Error(`Docker setup failed: ${error.message}`);
        }
    }

    /**
     * Create isolated network
     * @private
     */
    async createIsolatedNetwork() {
        try {
            const networkName = 'claude-code-wsl2-network';
            
            // Check if network exists
            try {
                await execAsync(`docker network inspect ${networkName}`);
                console.log(`Network ${networkName} already exists`);
            } catch {
                // Create network
                await execAsync(`docker network create --subnet=${this.config.networkSubnet} ${networkName}`);
                console.log(`Created isolated network: ${networkName}`);
            }
        } catch (error) {
            throw new Error(`Network creation failed: ${error.message}`);
        }
    }

    /**
     * Generate unique instance ID
     * @private
     */
    generateInstanceId() {
        const timestamp = Date.now();
        const random = crypto.randomBytes(4).toString('hex');
        return `wsl2-${timestamp}-${random}`;
    }

    /**
     * Check resource availability
     * @private
     */
    async checkResourceAvailability(options) {
        const requiredCpu = options.cpuCores || this.config.defaultCpuCores;
        const requiredMemory = options.memoryGB || this.config.defaultMemoryGB;
        const requiredStorage = options.storageGB || this.config.defaultStorageGB;

        if (this.resourcePool.availableCpuCores < requiredCpu) {
            throw new Error(`Insufficient CPU cores: required ${requiredCpu}, available ${this.resourcePool.availableCpuCores}`);
        }

        if (this.resourcePool.availableMemoryGB < requiredMemory) {
            throw new Error(`Insufficient memory: required ${requiredMemory}GB, available ${this.resourcePool.availableMemoryGB}GB`);
        }

        if (this.resourcePool.availableStorageGB < requiredStorage) {
            throw new Error(`Insufficient storage: required ${requiredStorage}GB, available ${this.resourcePool.availableStorageGB}GB`);
        }

        if (this.activeInstances.size >= this.config.maxInstances) {
            throw new Error(`Maximum instances reached: ${this.config.maxInstances}`);
        }
    }

    /**
     * Create instance configuration
     * @private
     */
    createInstanceConfig(instanceId, options) {
        return {
            instanceId,
            cpuCores: options.cpuCores || this.config.defaultCpuCores,
            memoryGB: options.memoryGB || this.config.defaultMemoryGB,
            storageGB: options.storageGB || this.config.defaultStorageGB,
            baseImage: options.baseImage || this.config.baseImage,
            environment: options.environment || {},
            volumes: options.volumes || [],
            ports: options.ports || [],
            networkMode: 'claude-code-wsl2-network',
            timeout: options.timeout || this.config.instanceTimeout
        };
    }

    /**
     * Create Docker instance
     * @private
     */
    async createInstance(config) {
        const containerName = `claude-code-${config.instanceId}`;
        
        // Build Docker run command
        let dockerCmd = `docker run -d --name ${containerName}`;
        dockerCmd += ` --network ${config.networkMode}`;
        dockerCmd += ` --cpus ${config.cpuCores}`;
        dockerCmd += ` --memory ${config.memoryGB}g`;
        dockerCmd += ` --storage-opt size=${config.storageGB}g`;

        // Add environment variables
        for (const [key, value] of Object.entries(config.environment)) {
            dockerCmd += ` -e ${key}="${value}"`;
        }

        // Add volumes
        for (const volume of config.volumes) {
            dockerCmd += ` -v ${volume}`;
        }

        // Add ports
        for (const port of config.ports) {
            dockerCmd += ` -p ${port}`;
        }

        dockerCmd += ` ${config.baseImage} tail -f /dev/null`;

        // Execute Docker command
        const { stdout } = await execAsync(dockerCmd);
        const containerId = stdout.trim();

        // Setup instance environment
        await this.setupInstanceEnvironment(containerId);

        return {
            containerId,
            containerName,
            config,
            createdAt: new Date().toISOString(),
            status: 'running'
        };
    }

    /**
     * Setup instance environment
     * @private
     */
    async setupInstanceEnvironment(containerId) {
        const setupCommands = [
            'apt-get update',
            'apt-get install -y curl git build-essential python3 python3-pip',
            'curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -',
            'apt-get install -y nodejs',
            'npm install -g npm@latest',
            'pip3 install --upgrade pip'
        ];

        for (const cmd of setupCommands) {
            await execAsync(`docker exec ${containerId} bash -c "${cmd}"`);
        }
    }

    /**
     * Register instance
     * @private
     */
    registerInstance(instanceId, instance) {
        this.activeInstances.set(instanceId, {
            ...instance,
            lastActivity: Date.now(),
            resourceUsage: {
                cpu: 0,
                memory: 0,
                storage: 0
            }
        });

        // Reserve resources
        this.resourcePool.availableCpuCores -= instance.config.cpuCores;
        this.resourcePool.availableMemoryGB -= instance.config.memoryGB;
        this.resourcePool.availableStorageGB -= instance.config.storageGB;

        this.metrics.instancesCreated++;
    }

    /**
     * Stop container
     * @private
     */
    async stopContainer(containerId) {
        try {
            await execAsync(`docker stop ${containerId}`);
        } catch (error) {
            console.warn(`Failed to stop container ${containerId}:`, error.message);
        }
    }

    /**
     * Remove container
     * @private
     */
    async removeContainer(containerId) {
        try {
            await execAsync(`docker rm ${containerId}`);
        } catch (error) {
            console.warn(`Failed to remove container ${containerId}:`, error.message);
        }
    }

    /**
     * Cleanup instance resources
     * @private
     */
    async cleanupInstanceResources(instance) {
        // Remove any volumes created for this instance
        try {
            const { stdout } = await execAsync(`docker volume ls -q -f name=${instance.config.instanceId}`);
            const volumes = stdout.trim().split('\n').filter(v => v);
            
            for (const volume of volumes) {
                await execAsync(`docker volume rm ${volume}`);
            }
        } catch (error) {
            console.warn(`Failed to cleanup volumes for instance ${instance.config.instanceId}:`, error.message);
        }
    }

    /**
     * Release resources
     * @private
     */
    releaseResources(config) {
        this.resourcePool.availableCpuCores += config.cpuCores;
        this.resourcePool.availableMemoryGB += config.memoryGB;
        this.resourcePool.availableStorageGB += config.storageGB;
    }

    /**
     * Start cleanup timer
     * @private
     */
    startCleanupTimer() {
        this.cleanupTimer = setInterval(() => {
            this.performCleanup();
        }, this.config.cleanupInterval);
    }

    /**
     * Perform periodic cleanup
     * @private
     */
    async performCleanup() {
        const now = Date.now();
        const expiredInstances = [];

        for (const [instanceId, instance] of this.activeInstances.entries()) {
            const age = now - new Date(instance.createdAt).getTime();
            const lastActivity = now - instance.lastActivity;

            if (age > instance.config.timeout || lastActivity > instance.config.timeout) {
                expiredInstances.push(instanceId);
            }
        }

        for (const instanceId of expiredInstances) {
            console.log(`Cleaning up expired instance: ${instanceId}`);
            await this.destroyInstance(instanceId);
        }
    }

    /**
     * Update metrics
     * @private
     */
    updateMetrics(operation, duration, success) {
        if (operation === 'provision') {
            if (success) {
                this.metrics.averageProvisionTime = 
                    (this.metrics.averageProvisionTime + duration) / 2;
            } else {
                this.metrics.failureRate = 
                    (this.metrics.failureRate * this.metrics.instancesCreated + 1) / 
                    (this.metrics.instancesCreated + 1);
            }
        }

        // Update resource utilization
        const totalCpu = this.config.totalCpuCores || 32;
        const totalMemory = this.config.totalMemoryGB || 64;
        
        this.metrics.resourceUtilization = 
            ((totalCpu - this.resourcePool.availableCpuCores) / totalCpu + 
             (totalMemory - this.resourcePool.availableMemoryGB) / totalMemory) / 2;
    }

    /**
     * Shutdown the WSL2 Manager
     */
    async shutdown() {
        console.log('Shutting down WSL2 Manager...');

        // Clear cleanup timer
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }

        // Destroy all active instances
        const instanceIds = Array.from(this.activeInstances.keys());
        for (const instanceId of instanceIds) {
            await this.destroyInstance(instanceId);
        }

        this.isInitialized = false;
        console.log('WSL2 Manager shutdown complete');
    }
}

export default WSL2Manager;

