/**
 * @fileoverview WSL2 Manager
 * @description Manages isolated WSL2 instances for testing and validation
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

/**
 * WSL2 Manager for creating and managing isolated testing environments
 */
export class WSL2Manager {
    constructor(config = {}) {
        this.config = {
            wsl_distribution: config.wsl_distribution || 'Ubuntu-22.04',
            base_image: config.base_image || 'ubuntu:22.04',
            max_instances: config.max_instances || 5,
            instance_timeout: config.instance_timeout || 3600000, // 1 hour
            resource_limits: {
                cpu: config.cpu_limit || 4,
                memory: config.memory_limit || '8GB',
                disk: config.disk_limit || '20GB'
            },
            network_isolation: config.network_isolation !== false,
            ...config
        };

        this.activeInstances = new Map();
        this.instancePool = [];
        this.resourceUsage = {
            totalCpu: 0,
            totalMemory: 0,
            totalDisk: 0
        };
    }

    /**
     * Initialize WSL2 Manager
     */
    async initialize() {
        console.log('🔧 Initializing WSL2 Manager...');
        
        try {
            // Check if WSL2 is available
            await this.checkWSL2Availability();
            
            // Setup base distribution if needed
            await this.setupBaseDistribution();
            
            // Initialize instance pool
            await this.initializeInstancePool();
            
            console.log('✅ WSL2 Manager initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize WSL2 Manager:', error);
            throw error;
        }
    }

    /**
     * Check if WSL2 is available and properly configured
     */
    async checkWSL2Availability() {
        try {
            const { stdout } = await execAsync('wsl --version');
            console.log('✅ WSL2 is available:', stdout.trim());
            
            // Check if the target distribution exists
            const { stdout: distList } = await execAsync('wsl --list --verbose');
            if (!distList.includes(this.config.wsl_distribution)) {
                console.log(`📦 Installing WSL2 distribution: ${this.config.wsl_distribution}`);
                await this.installDistribution();
            }
        } catch (error) {
            throw new Error(`WSL2 not available or not properly configured: ${error.message}`);
        }
    }

    /**
     * Install WSL2 distribution
     */
    async installDistribution() {
        try {
            await execAsync(`wsl --install ${this.config.wsl_distribution}`);
            await execAsync(`wsl --set-version ${this.config.wsl_distribution} 2`);
            console.log(`✅ WSL2 distribution installed: ${this.config.wsl_distribution}`);
        } catch (error) {
            throw new Error(`Failed to install WSL2 distribution: ${error.message}`);
        }
    }

    /**
     * Setup base distribution with required tools
     */
    async setupBaseDistribution() {
        console.log('🔧 Setting up base distribution...');
        
        const setupCommands = [
            'sudo apt update && sudo apt upgrade -y',
            'sudo apt install -y curl wget git build-essential',
            'sudo apt install -y nodejs npm python3 python3-pip',
            'sudo apt install -y docker.io docker-compose',
            'sudo systemctl enable docker',
            'sudo usermod -aG docker $USER',
            'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash',
            'pip3 install pytest pylint black flake8 mypy'
        ];

        try {
            for (const command of setupCommands) {
                await this.executeInDistribution(this.config.wsl_distribution, command);
            }
            console.log('✅ Base distribution setup complete');
        } catch (error) {
            console.error('❌ Failed to setup base distribution:', error);
            throw error;
        }
    }

    /**
     * Create isolated WSL2 instance
     */
    async createIsolatedInstance(config) {
        console.log(`🏗️ Creating isolated WSL2 instance: ${config.name}`);
        
        try {
            // Check resource availability
            await this.checkResourceAvailability(config.resources);
            
            // Create instance from base distribution
            const instanceId = `${config.name}_${Date.now()}`;
            const instancePath = path.join('/tmp', 'wsl-instances', instanceId);
            
            // Export base distribution
            await execAsync(`wsl --export ${this.config.wsl_distribution} ${instancePath}.tar`);
            
            // Import as new instance
            await execAsync(`wsl --import ${instanceId} ${instancePath} ${instancePath}.tar --version 2`);
            
            // Configure instance
            const instance = {
                id: instanceId,
                name: config.name,
                path: instancePath,
                resources: config.resources,
                status: 'created',
                createdAt: Date.now(),
                lastUsed: Date.now()
            };

            // Apply resource limits
            await this.applyResourceLimits(instance);
            
            // Configure network isolation if enabled
            if (this.config.network_isolation) {
                await this.configureNetworkIsolation(instance);
            }

            this.activeInstances.set(instanceId, instance);
            this.updateResourceUsage(instance.resources, 'add');

            console.log(`✅ WSL2 instance created: ${instanceId}`);
            return instance;
        } catch (error) {
            console.error('❌ Failed to create WSL2 instance:', error);
            throw error;
        }
    }

    /**
     * Configure environment for testing
     */
    async configureEnvironment(instance, requirements) {
        console.log(`⚙️ Configuring environment for instance: ${instance.id}`);
        
        try {
            const configCommands = [];

            // Install Node.js if required
            if (requirements.nodejs) {
                configCommands.push(
                    'source ~/.bashrc',
                    'nvm install --lts',
                    'nvm use --lts',
                    'npm install -g yarn pnpm'
                );
            }

            // Install Python tools if required
            if (requirements.python) {
                configCommands.push(
                    'pip3 install --upgrade pip',
                    'pip3 install pytest pytest-cov pytest-xdist',
                    'pip3 install black flake8 mypy bandit safety'
                );
            }

            // Setup Docker if required
            if (requirements.docker) {
                configCommands.push(
                    'sudo service docker start',
                    'docker --version'
                );
            }

            // Install testing tools if required
            if (requirements.testing_tools) {
                configCommands.push(
                    'npm install -g jest mocha chai cypress playwright',
                    'pip3 install selenium pytest-selenium'
                );
            }

            // Execute configuration commands
            for (const command of configCommands) {
                await this.executeInInstance(instance.id, command);
            }

            instance.status = 'configured';
            instance.lastUsed = Date.now();

            console.log(`✅ Environment configured for instance: ${instance.id}`);
            return instance;
        } catch (error) {
            console.error('❌ Failed to configure environment:', error);
            throw error;
        }
    }

    /**
     * Install dependencies in instance
     */
    async installDependencies(instance, packageList) {
        console.log(`📦 Installing dependencies in instance: ${instance.id}`);
        
        try {
            const installCommands = [];

            // Group packages by type
            const npmPackages = packageList.filter(pkg => pkg.type === 'npm');
            const pipPackages = packageList.filter(pkg => pkg.type === 'pip');
            const aptPackages = packageList.filter(pkg => pkg.type === 'apt');

            // Install npm packages
            if (npmPackages.length > 0) {
                const packages = npmPackages.map(pkg => pkg.name).join(' ');
                installCommands.push(`npm install ${packages}`);
            }

            // Install pip packages
            if (pipPackages.length > 0) {
                const packages = pipPackages.map(pkg => pkg.name).join(' ');
                installCommands.push(`pip3 install ${packages}`);
            }

            // Install apt packages
            if (aptPackages.length > 0) {
                const packages = aptPackages.map(pkg => pkg.name).join(' ');
                installCommands.push(`sudo apt install -y ${packages}`);
            }

            // Execute installation commands
            for (const command of installCommands) {
                await this.executeInInstance(instance.id, command);
            }

            console.log(`✅ Dependencies installed in instance: ${instance.id}`);
            return { success: true, installedPackages: packageList.length };
        } catch (error) {
            console.error('❌ Failed to install dependencies:', error);
            throw error;
        }
    }

    /**
     * Execute commands in WSL2 instance
     */
    async executeCommands(instance, commands) {
        console.log(`⚡ Executing ${commands.length} commands in instance: ${instance.id}`);
        
        const results = [];
        
        try {
            for (const command of commands) {
                const result = await this.executeInInstance(instance.id, command);
                results.push({
                    command,
                    success: result.success,
                    output: result.output,
                    error: result.error
                });
            }

            instance.lastUsed = Date.now();
            return { success: true, results };
        } catch (error) {
            console.error('❌ Failed to execute commands:', error);
            return { success: false, error: error.message, results };
        }
    }

    /**
     * Monitor resource usage of instance
     */
    async monitorResourceUsage(instance) {
        try {
            // Get CPU usage
            const cpuResult = await this.executeInInstance(
                instance.id, 
                "top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1"
            );

            // Get memory usage
            const memResult = await this.executeInInstance(
                instance.id,
                "free -m | awk 'NR==2{printf \"%.2f\", $3*100/$2}'"
            );

            // Get disk usage
            const diskResult = await this.executeInInstance(
                instance.id,
                "df -h / | awk 'NR==2{print $5}' | cut -d'%' -f1"
            );

            const usage = {
                cpu: parseFloat(cpuResult.output) || 0,
                memory: parseFloat(memResult.output) || 0,
                disk: parseFloat(diskResult.output) || 0,
                timestamp: Date.now()
            };

            instance.resourceUsage = usage;
            return usage;
        } catch (error) {
            console.error('❌ Failed to monitor resource usage:', error);
            return { cpu: 0, memory: 0, disk: 0, timestamp: Date.now() };
        }
    }

    /**
     * Capture environment state for debugging
     */
    async captureEnvironmentState(instance) {
        console.log(`📸 Capturing environment state for instance: ${instance.id}`);
        
        try {
            const stateCommands = [
                'uname -a',
                'cat /etc/os-release',
                'node --version',
                'npm --version',
                'python3 --version',
                'docker --version',
                'ps aux',
                'df -h',
                'free -m',
                'env'
            ];

            const state = {};
            for (const command of stateCommands) {
                try {
                    const result = await this.executeInInstance(instance.id, command);
                    state[command] = result.output;
                } catch (error) {
                    state[command] = `Error: ${error.message}`;
                }
            }

            const stateFile = path.join(instance.path, 'environment-state.json');
            await fs.writeFile(stateFile, JSON.stringify(state, null, 2));

            console.log(`✅ Environment state captured: ${stateFile}`);
            return state;
        } catch (error) {
            console.error('❌ Failed to capture environment state:', error);
            throw error;
        }
    }

    /**
     * Destroy WSL2 instance
     */
    async destroyInstance(instanceId) {
        console.log(`🗑️ Destroying WSL2 instance: ${instanceId}`);
        
        try {
            const instance = this.activeInstances.get(instanceId);
            if (!instance) {
                console.warn(`⚠️ Instance not found: ${instanceId}`);
                return;
            }

            // Stop the instance
            await execAsync(`wsl --terminate ${instanceId}`);
            
            // Unregister the instance
            await execAsync(`wsl --unregister ${instanceId}`);
            
            // Clean up files
            try {
                await fs.rm(instance.path, { recursive: true, force: true });
                await fs.unlink(`${instance.path}.tar`);
            } catch (error) {
                console.warn('⚠️ Failed to clean up instance files:', error.message);
            }

            // Update resource usage
            this.updateResourceUsage(instance.resources, 'remove');
            
            // Remove from active instances
            this.activeInstances.delete(instanceId);

            console.log(`✅ WSL2 instance destroyed: ${instanceId}`);
        } catch (error) {
            console.error('❌ Failed to destroy WSL2 instance:', error);
            throw error;
        }
    }

    /**
     * Manage instance pool for reuse
     */
    async manageInstancePool(poolSize) {
        console.log(`🏊 Managing instance pool (target size: ${poolSize})`);
        
        try {
            // Clean up expired instances
            await this.cleanupExpiredInstances();
            
            // Create new instances if pool is below target
            while (this.instancePool.length < poolSize) {
                const instance = await this.createIsolatedInstance({
                    name: `pool-instance-${Date.now()}`,
                    resources: this.config.resource_limits
                });
                
                this.instancePool.push(instance.id);
            }

            console.log(`✅ Instance pool managed (current size: ${this.instancePool.length})`);
        } catch (error) {
            console.error('❌ Failed to manage instance pool:', error);
            throw error;
        }
    }

    /**
     * Execute command in specific WSL2 distribution
     */
    async executeInDistribution(distribution, command) {
        try {
            const { stdout, stderr } = await execAsync(`wsl -d ${distribution} -- ${command}`);
            return { success: true, output: stdout, error: stderr };
        } catch (error) {
            return { success: false, output: '', error: error.message };
        }
    }

    /**
     * Execute command in specific WSL2 instance
     */
    async executeInInstance(instanceId, command) {
        try {
            const { stdout, stderr } = await execAsync(`wsl -d ${instanceId} -- ${command}`);
            return { success: true, output: stdout, error: stderr };
        } catch (error) {
            return { success: false, output: '', error: error.message };
        }
    }

    /**
     * Check resource availability
     */
    async checkResourceAvailability(requiredResources) {
        const available = {
            cpu: this.config.resource_limits.cpu - this.resourceUsage.totalCpu,
            memory: this.parseMemorySize(this.config.resource_limits.memory) - this.resourceUsage.totalMemory,
            disk: this.parseMemorySize(this.config.resource_limits.disk) - this.resourceUsage.totalDisk
        };

        const required = {
            cpu: requiredResources.cpu || 1,
            memory: this.parseMemorySize(requiredResources.memory || '2GB'),
            disk: this.parseMemorySize(requiredResources.disk || '10GB')
        };

        if (required.cpu > available.cpu || 
            required.memory > available.memory || 
            required.disk > available.disk) {
            throw new Error('Insufficient resources available');
        }
    }

    /**
     * Apply resource limits to instance
     */
    async applyResourceLimits(instance) {
        // In a real implementation, this would configure WSL2 resource limits
        // For now, we'll just log the configuration
        console.log(`⚙️ Applying resource limits to ${instance.id}:`, instance.resources);
    }

    /**
     * Configure network isolation
     */
    async configureNetworkIsolation(instance) {
        // In a real implementation, this would configure network isolation
        console.log(`🔒 Configuring network isolation for ${instance.id}`);
    }

    /**
     * Update resource usage tracking
     */
    updateResourceUsage(resources, operation) {
        const multiplier = operation === 'add' ? 1 : -1;
        
        this.resourceUsage.totalCpu += (resources.cpu || 1) * multiplier;
        this.resourceUsage.totalMemory += this.parseMemorySize(resources.memory || '2GB') * multiplier;
        this.resourceUsage.totalDisk += this.parseMemorySize(resources.disk || '10GB') * multiplier;
    }

    /**
     * Parse memory size string to bytes
     */
    parseMemorySize(sizeStr) {
        const units = { 'B': 1, 'KB': 1024, 'MB': 1024**2, 'GB': 1024**3, 'TB': 1024**4 };
        const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([KMGT]?B)$/i);
        
        if (!match) return 0;
        
        const value = parseFloat(match[1]);
        const unit = match[2].toUpperCase();
        
        return value * (units[unit] || 1);
    }

    /**
     * Initialize instance pool
     */
    async initializeInstancePool() {
        console.log('🏊 Initializing instance pool...');
        // Pool initialization would happen here in a real implementation
    }

    /**
     * Clean up expired instances
     */
    async cleanupExpiredInstances() {
        const now = Date.now();
        const expiredInstances = [];

        for (const [instanceId, instance] of this.activeInstances) {
            if (now - instance.lastUsed > this.config.instance_timeout) {
                expiredInstances.push(instanceId);
            }
        }

        for (const instanceId of expiredInstances) {
            await this.destroyInstance(instanceId);
        }

        if (expiredInstances.length > 0) {
            console.log(`🧹 Cleaned up ${expiredInstances.length} expired instances`);
        }
    }

    /**
     * Get instance status
     */
    getInstanceStatus(instanceId) {
        return this.activeInstances.get(instanceId);
    }

    /**
     * List all active instances
     */
    listActiveInstances() {
        return Array.from(this.activeInstances.values());
    }

    /**
     * Get resource usage summary
     */
    getResourceUsage() {
        return { ...this.resourceUsage };
    }

    /**
     * Shutdown WSL2 Manager
     */
    async shutdown() {
        console.log('🛑 Shutting down WSL2 Manager...');
        
        // Destroy all active instances
        const instanceIds = Array.from(this.activeInstances.keys());
        for (const instanceId of instanceIds) {
            await this.destroyInstance(instanceId);
        }

        console.log('✅ WSL2 Manager shutdown complete');
    }
}

export default WSL2Manager;

