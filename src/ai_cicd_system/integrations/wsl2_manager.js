/**
 * WSL2 Environment Manager
 * 
 * Manages WSL2 environment lifecycle including creation, configuration,
 * resource monitoring, and cleanup for PR validation workflows.
 */

import { EventEmitter } from 'events';
import AgentAPIClient from './agentapi_client.js';

export class WSL2EnvironmentManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.agentAPI = new AgentAPIClient(options.agentAPI);
        this.config = {
            maxConcurrentInstances: options.maxConcurrentInstances || 10,
            defaultDistribution: options.defaultDistribution || 'Ubuntu-22.04',
            resourceLimits: {
                memory: '4GB',
                cpu: '2 cores',
                disk: '20GB',
                ...options.resourceLimits
            },
            timeouts: {
                creation: 120000, // 2 minutes
                setup: 300000,    // 5 minutes
                cleanup: 60000,   // 1 minute
                ...options.timeouts
            }
        };

        this.environments = new Map();
        this.resourceMonitor = null;
        this.setupCleanupHandlers();
    }

    /**
     * Initialize the WSL2 Environment Manager
     * @returns {Promise<boolean>} True if initialization successful
     */
    async initialize() {
        try {
            await this.agentAPI.initialize();
            this.startResourceMonitoring();
            this.emit('initialized');
            return true;
        } catch (error) {
            this.emit('error', { type: 'initialization', error });
            throw new Error(`Failed to initialize WSL2 Environment Manager: ${error.message}`);
        }
    }

    /**
     * Create a new WSL2 environment for PR validation
     * @param {Object} prDetails - PR details and requirements
     * @returns {Promise<Object>} Environment details
     */
    async createEnvironment(prDetails) {
        const environmentId = `pr-${prDetails.prNumber}-${Date.now()}`;
        
        try {
            // Check concurrent instance limit
            if (this.environments.size >= this.config.maxConcurrentInstances) {
                throw new Error(`Maximum concurrent instances (${this.config.maxConcurrentInstances}) reached`);
            }

            const environment = {
                id: environmentId,
                prDetails,
                status: 'creating',
                createdAt: new Date().toISOString(),
                resources: this.getResourceRequirements(prDetails),
                instance: null,
                setupSteps: [],
                validationSessions: new Map()
            };

            this.environments.set(environmentId, environment);
            this.emit('environmentCreating', environment);

            // Create WSL2 instance
            const instance = await this.createWSL2Instance(environment);
            environment.instance = instance;
            environment.status = 'provisioning';

            // Setup environment
            await this.setupEnvironment(environment, prDetails);
            environment.status = 'ready';
            environment.readyAt = new Date().toISOString();

            this.emit('environmentReady', environment);
            return environment;

        } catch (error) {
            if (this.environments.has(environmentId)) {
                const environment = this.environments.get(environmentId);
                environment.status = 'failed';
                environment.error = error.message;
                this.emit('environmentFailed', environment);
            }
            
            this.emit('error', { type: 'environmentCreation', error, environmentId });
            throw error;
        }
    }

    /**
     * Create WSL2 instance with timeout handling
     * @param {Object} environment - Environment configuration
     * @returns {Promise<Object>} WSL2 instance
     */
    async createWSL2Instance(environment) {
        const instanceConfig = {
            name: `pr-validation-${environment.prDetails.prNumber}`,
            distribution: this.config.defaultDistribution,
            resources: environment.resources
        };

        return new Promise(async (resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`WSL2 instance creation timeout after ${this.config.timeouts.creation}ms`));
            }, this.config.timeouts.creation);

            try {
                const instance = await this.agentAPI.createWSL2Instance(instanceConfig);
                clearTimeout(timeout);
                
                // Wait for instance to be ready
                await this.waitForInstanceReady(instance.id);
                resolve(instance);
            } catch (error) {
                clearTimeout(timeout);
                reject(error);
            }
        });
    }

    /**
     * Wait for WSL2 instance to be ready
     * @param {string} instanceId - Instance ID
     * @returns {Promise<void>}
     */
    async waitForInstanceReady(instanceId) {
        const maxAttempts = 30;
        const interval = 2000; // 2 seconds

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const instance = await this.agentAPI.getWSL2Instance(instanceId);
                if (instance.status === 'running') {
                    return;
                }
                
                if (instance.status === 'failed') {
                    throw new Error(`WSL2 instance ${instanceId} failed to start`);
                }

                await new Promise(resolve => setTimeout(resolve, interval));
            } catch (error) {
                if (attempt === maxAttempts) {
                    throw new Error(`WSL2 instance ${instanceId} not ready after ${maxAttempts} attempts`);
                }
            }
        }
    }

    /**
     * Setup WSL2 environment with dependencies and configuration
     * @param {Object} environment - Environment object
     * @param {Object} prDetails - PR details
     * @returns {Promise<void>}
     */
    async setupEnvironment(environment, prDetails) {
        const setupSteps = [
            { name: 'updateSystem', description: 'Update system packages' },
            { name: 'installDependencies', description: 'Install required dependencies' },
            { name: 'cloneRepository', description: 'Clone PR repository' },
            { name: 'configureClaudeCode', description: 'Configure Claude Code' },
            { name: 'setupValidationTools', description: 'Setup validation tools' }
        ];

        for (const step of setupSteps) {
            try {
                environment.setupSteps.push({ ...step, status: 'running', startedAt: new Date().toISOString() });
                this.emit('setupStepStarted', { environment: environment.id, step });

                await this.executeSetupStep(environment, step, prDetails);

                const completedStep = environment.setupSteps.find(s => s.name === step.name);
                completedStep.status = 'completed';
                completedStep.completedAt = new Date().toISOString();
                
                this.emit('setupStepCompleted', { environment: environment.id, step });
            } catch (error) {
                const failedStep = environment.setupSteps.find(s => s.name === step.name);
                failedStep.status = 'failed';
                failedStep.error = error.message;
                failedStep.failedAt = new Date().toISOString();
                
                this.emit('setupStepFailed', { environment: environment.id, step, error });
                throw new Error(`Setup step '${step.name}' failed: ${error.message}`);
            }
        }
    }

    /**
     * Execute a specific setup step
     * @param {Object} environment - Environment object
     * @param {Object} step - Setup step
     * @param {Object} prDetails - PR details
     * @returns {Promise<void>}
     */
    async executeSetupStep(environment, step, prDetails) {
        const instanceId = environment.instance.id;

        switch (step.name) {
            case 'updateSystem':
                await this.agentAPI.executeCommand(instanceId, 'sudo apt-get update && sudo apt-get upgrade -y');
                break;

            case 'installDependencies':
                const dependencies = this.getDependencies(prDetails);
                for (const dep of dependencies) {
                    await this.agentAPI.executeCommand(instanceId, dep.command);
                }
                break;

            case 'cloneRepository':
                await this.cloneRepository(environment, prDetails);
                break;

            case 'configureClaudeCode':
                await this.configureClaudeCode(environment);
                break;

            case 'setupValidationTools':
                await this.setupValidationTools(environment);
                break;

            default:
                throw new Error(`Unknown setup step: ${step.name}`);
        }
    }

    /**
     * Get dependencies based on PR details
     * @param {Object} prDetails - PR details
     * @returns {Array} Array of dependency installation commands
     */
    getDependencies(prDetails) {
        const baseDependencies = [
            { name: 'git', command: 'sudo apt-get install -y git' },
            { name: 'curl', command: 'sudo apt-get install -y curl' },
            { name: 'build-essential', command: 'sudo apt-get install -y build-essential' }
        ];

        // Add language-specific dependencies based on repository
        const languageDependencies = this.detectLanguageDependencies(prDetails);
        
        return [...baseDependencies, ...languageDependencies];
    }

    /**
     * Detect language-specific dependencies
     * @param {Object} prDetails - PR details
     * @returns {Array} Language-specific dependencies
     */
    detectLanguageDependencies(prDetails) {
        const dependencies = [];
        
        // Detect based on file extensions or repository structure
        if (prDetails.files?.some(file => file.endsWith('.js') || file.endsWith('.ts'))) {
            dependencies.push(
                { name: 'nodejs', command: 'curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs' },
                { name: 'npm', command: 'sudo npm install -g npm@latest' }
            );
        }

        if (prDetails.files?.some(file => file.endsWith('.py'))) {
            dependencies.push(
                { name: 'python3', command: 'sudo apt-get install -y python3 python3-pip' },
                { name: 'python-dev', command: 'sudo apt-get install -y python3-dev' }
            );
        }

        if (prDetails.files?.some(file => file.endsWith('.go'))) {
            dependencies.push(
                { name: 'golang', command: 'sudo apt-get install -y golang-go' }
            );
        }

        return dependencies;
    }

    /**
     * Clone repository in the WSL2 environment
     * @param {Object} environment - Environment object
     * @param {Object} prDetails - PR details
     * @returns {Promise<void>}
     */
    async cloneRepository(environment, prDetails) {
        const instanceId = environment.instance.id;
        const repoUrl = prDetails.repositoryUrl;
        const branch = prDetails.branch || 'main';

        try {
            const cloneResult = await this.agentAPI.cloneRepository(
                instanceId, 
                repoUrl, 
                branch, 
                { targetDir: '/workspace' }
            );

            environment.repository = {
                url: repoUrl,
                branch,
                clonedAt: cloneResult.clonedAt,
                path: '/workspace'
            };

            this.emit('repositoryCloned', { environment: environment.id, repository: environment.repository });
        } catch (error) {
            throw new Error(`Failed to clone repository: ${error.message}`);
        }
    }

    /**
     * Configure Claude Code in the environment
     * @param {Object} environment - Environment object
     * @returns {Promise<void>}
     */
    async configureClaudeCode(environment) {
        const instanceId = environment.instance.id;

        try {
            // Install Claude Code CLI
            await this.agentAPI.executeCommand(instanceId, 'curl -fsSL https://claude.ai/install.sh | bash');
            
            // Configure Claude Code settings
            const configCommands = [
                'claude config set workspace /workspace',
                'claude config set auto-save true',
                'claude config set validation-mode strict'
            ];

            for (const command of configCommands) {
                await this.agentAPI.executeCommand(instanceId, command);
            }

            environment.claudeCode = {
                configured: true,
                configuredAt: new Date().toISOString(),
                workspace: '/workspace'
            };

            this.emit('claudeCodeConfigured', { environment: environment.id });
        } catch (error) {
            throw new Error(`Failed to configure Claude Code: ${error.message}`);
        }
    }

    /**
     * Setup validation tools in the environment
     * @param {Object} environment - Environment object
     * @returns {Promise<void>}
     */
    async setupValidationTools(environment) {
        const instanceId = environment.instance.id;

        try {
            const validationTools = [
                'sudo apt-get install -y shellcheck',
                'sudo apt-get install -y jq',
                'sudo apt-get install -y yamllint'
            ];

            for (const tool of validationTools) {
                await this.agentAPI.executeCommand(instanceId, tool);
            }

            environment.validationTools = {
                installed: true,
                installedAt: new Date().toISOString(),
                tools: ['shellcheck', 'jq', 'yamllint']
            };

            this.emit('validationToolsSetup', { environment: environment.id });
        } catch (error) {
            throw new Error(`Failed to setup validation tools: ${error.message}`);
        }
    }

    /**
     * Get resource requirements based on PR complexity
     * @param {Object} prDetails - PR details
     * @returns {Object} Resource requirements
     */
    getResourceRequirements(prDetails) {
        const baseResources = { ...this.config.resourceLimits };
        
        // Adjust resources based on PR size and complexity
        const fileCount = prDetails.files?.length || 0;
        const linesChanged = prDetails.additions + prDetails.deletions || 0;

        if (fileCount > 50 || linesChanged > 1000) {
            baseResources.memory = '8GB';
            baseResources.cpu = '4 cores';
        } else if (fileCount > 20 || linesChanged > 500) {
            baseResources.memory = '6GB';
            baseResources.cpu = '3 cores';
        }

        return baseResources;
    }

    /**
     * Get environment details
     * @param {string} environmentId - Environment ID
     * @returns {Promise<Object>} Environment details
     */
    async getEnvironment(environmentId) {
        const environment = this.environments.get(environmentId);
        if (!environment) {
            throw new Error(`Environment ${environmentId} not found`);
        }

        // Get current resource usage
        if (environment.instance) {
            try {
                environment.currentResourceUsage = await this.agentAPI.getResourceUsage(environment.instance.id);
            } catch (error) {
                // Resource usage is optional, don't fail if unavailable
                environment.currentResourceUsage = null;
            }
        }

        return environment;
    }

    /**
     * List all environments
     * @returns {Promise<Array>} Array of environments
     */
    async listEnvironments() {
        return Array.from(this.environments.values());
    }

    /**
     * Cleanup and destroy an environment
     * @param {string} environmentId - Environment ID
     * @returns {Promise<boolean>} True if cleanup successful
     */
    async cleanupEnvironment(environmentId) {
        try {
            const environment = this.environments.get(environmentId);
            if (!environment) {
                throw new Error(`Environment ${environmentId} not found`);
            }

            environment.status = 'cleaning';
            this.emit('environmentCleaning', environment);

            // Stop any active validation sessions
            for (const [sessionId, session] of environment.validationSessions) {
                try {
                    await this.stopValidationSession(environmentId, sessionId);
                } catch (error) {
                    // Continue cleanup even if session stop fails
                    console.warn(`Failed to stop validation session ${sessionId}:`, error.message);
                }
            }

            // Destroy WSL2 instance
            if (environment.instance) {
                await this.agentAPI.destroyWSL2Instance(environment.instance.id);
            }

            // Remove from tracking
            this.environments.delete(environmentId);
            environment.status = 'destroyed';
            environment.destroyedAt = new Date().toISOString();

            this.emit('environmentDestroyed', environment);
            return true;

        } catch (error) {
            this.emit('error', { type: 'environmentCleanup', error, environmentId });
            throw error;
        }
    }

    /**
     * Start resource monitoring for all environments
     */
    startResourceMonitoring() {
        if (this.resourceMonitor) {
            clearInterval(this.resourceMonitor);
        }

        this.resourceMonitor = setInterval(async () => {
            try {
                for (const [environmentId, environment] of this.environments) {
                    if (environment.instance && environment.status === 'ready') {
                        const usage = await this.agentAPI.getResourceUsage(environment.instance.id);
                        this.emit('resourceUpdate', { environmentId, usage });

                        // Check for resource alerts
                        this.checkResourceAlerts(environmentId, usage);
                    }
                }
            } catch (error) {
                this.emit('error', { type: 'resourceMonitoring', error });
            }
        }, 30000); // Monitor every 30 seconds
    }

    /**
     * Check for resource usage alerts
     * @param {string} environmentId - Environment ID
     * @param {Object} usage - Resource usage data
     */
    checkResourceAlerts(environmentId, usage) {
        const alerts = [];

        if (usage.cpu.usage > 90) {
            alerts.push({ type: 'cpu', level: 'critical', value: usage.cpu.usage });
        } else if (usage.cpu.usage > 80) {
            alerts.push({ type: 'cpu', level: 'warning', value: usage.cpu.usage });
        }

        if (usage.memory.percentage > 90) {
            alerts.push({ type: 'memory', level: 'critical', value: usage.memory.percentage });
        } else if (usage.memory.percentage > 80) {
            alerts.push({ type: 'memory', level: 'warning', value: usage.memory.percentage });
        }

        if (usage.disk.percentage > 90) {
            alerts.push({ type: 'disk', level: 'critical', value: usage.disk.percentage });
        } else if (usage.disk.percentage > 80) {
            alerts.push({ type: 'disk', level: 'warning', value: usage.disk.percentage });
        }

        if (alerts.length > 0) {
            this.emit('resourceAlert', { environmentId, alerts, usage });
        }
    }

    /**
     * Setup cleanup handlers for graceful shutdown
     */
    setupCleanupHandlers() {
        const cleanup = async () => {
            try {
                await this.cleanup();
            } catch (error) {
                console.error('Error during cleanup:', error);
            }
            process.exit(0);
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
        process.on('uncaughtException', cleanup);
    }

    /**
     * Cleanup all resources
     */
    async cleanup() {
        try {
            // Stop resource monitoring
            if (this.resourceMonitor) {
                clearInterval(this.resourceMonitor);
                this.resourceMonitor = null;
            }

            // Cleanup all environments
            const environments = await this.listEnvironments();
            await Promise.all(
                environments.map(env => this.cleanupEnvironment(env.id))
            );

            // Cleanup AgentAPI client
            await this.agentAPI.cleanup();

            this.emit('cleanup');
        } catch (error) {
            this.emit('error', { type: 'cleanup', error });
            throw error;
        }
    }
}

export default WSL2EnvironmentManager;

