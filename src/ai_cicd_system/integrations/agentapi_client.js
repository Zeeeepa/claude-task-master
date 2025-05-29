/**
 * AgentAPI Client Implementation
 * 
 * Robust HTTP client for AgentAPI communication, providing seamless integration
 * with Claude Code operations on WSL2 instances.
 */

import axios from 'axios';
import { EventEmitter } from 'events';

export class AgentAPIClient extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            baseUrl: options.baseUrl || process.env.AGENTAPI_BASE_URL || 'http://localhost:3284',
            apiKey: options.apiKey || process.env.AGENTAPI_KEY,
            timeout: options.timeout || 300000, // 5 minutes for long operations
            retries: options.retries || 3,
            wsl2Config: {
                distribution: 'Ubuntu-22.04',
                maxInstances: 10,
                resourceLimits: {
                    memory: '4GB',
                    cpu: '2 cores',
                    disk: '20GB'
                },
                ...options.wsl2Config
            }
        };

        this.httpClient = axios.create({
            baseURL: this.config.baseUrl,
            timeout: this.config.timeout,
            headers: {
                'Content-Type': 'application/json',
                ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
            }
        });

        this.setupInterceptors();
        this.activeInstances = new Map();
        this.isConnected = false;
    }

    /**
     * Setup HTTP interceptors for request/response handling
     */
    setupInterceptors() {
        // Request interceptor
        this.httpClient.interceptors.request.use(
            (config) => {
                this.emit('request', { url: config.url, method: config.method });
                return config;
            },
            (error) => {
                this.emit('error', { type: 'request', error });
                return Promise.reject(error);
            }
        );

        // Response interceptor
        this.httpClient.interceptors.response.use(
            (response) => {
                this.emit('response', { 
                    url: response.config.url, 
                    status: response.status,
                    data: response.data 
                });
                return response;
            },
            (error) => {
                this.emit('error', { type: 'response', error });
                return Promise.reject(error);
            }
        );
    }

    /**
     * Initialize the AgentAPI client and verify connection
     * @returns {Promise<boolean>} True if initialization successful
     */
    async initialize() {
        try {
            const status = await this.getStatus();
            this.isConnected = true;
            this.emit('connected', { status });
            return true;
        } catch (error) {
            this.isConnected = false;
            this.emit('error', { type: 'initialization', error });
            throw new Error(`Failed to initialize AgentAPI client: ${error.message}`);
        }
    }

    /**
     * Get the current status of the AgentAPI server
     * @returns {Promise<Object>} Status information
     */
    async getStatus() {
        const response = await this.httpClient.get('/status');
        return response.data;
    }

    /**
     * Send a message to the agent
     * @param {string} content - Message content
     * @param {string} type - Message type (default: 'user')
     * @returns {Promise<Object>} Response from agent
     */
    async sendMessage(content, type = 'user') {
        const response = await this.httpClient.post('/message', {
            content,
            type
        });
        return response.data;
    }

    /**
     * Get conversation history
     * @returns {Promise<Array>} Array of messages
     */
    async getMessages() {
        const response = await this.httpClient.get('/messages');
        return response.data;
    }

    /**
     * Create a new WSL2 instance for PR validation
     * @param {Object} options - Instance configuration
     * @returns {Promise<Object>} Instance details
     */
    async createWSL2Instance(options = {}) {
        const instanceConfig = {
            name: options.name || `pr-validation-${Date.now()}`,
            distribution: options.distribution || this.config.wsl2Config.distribution,
            resources: {
                ...this.config.wsl2Config.resourceLimits,
                ...options.resources
            },
            environment: options.environment || {}
        };

        try {
            // For now, we'll simulate WSL2 instance creation
            // In a real implementation, this would call the AgentAPI WSL2 endpoints
            const instance = {
                id: `wsl2-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: instanceConfig.name,
                distribution: instanceConfig.distribution,
                status: 'creating',
                resources: instanceConfig.resources,
                createdAt: new Date().toISOString(),
                ipAddress: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
                sshPort: 22000 + Math.floor(Math.random() * 1000)
            };

            this.activeInstances.set(instance.id, instance);
            this.emit('instanceCreated', instance);

            // Simulate instance startup time
            setTimeout(() => {
                instance.status = 'running';
                this.emit('instanceReady', instance);
            }, 2000);

            return instance;
        } catch (error) {
            this.emit('error', { type: 'instanceCreation', error });
            throw new Error(`Failed to create WSL2 instance: ${error.message}`);
        }
    }

    /**
     * Get WSL2 instance details
     * @param {string} instanceId - Instance ID
     * @returns {Promise<Object>} Instance details
     */
    async getWSL2Instance(instanceId) {
        const instance = this.activeInstances.get(instanceId);
        if (!instance) {
            throw new Error(`WSL2 instance ${instanceId} not found`);
        }
        return instance;
    }

    /**
     * Execute a command in a WSL2 instance
     * @param {string} instanceId - Instance ID
     * @param {string} command - Command to execute
     * @param {Object} options - Execution options
     * @returns {Promise<Object>} Command result
     */
    async executeCommand(instanceId, command, options = {}) {
        const instance = await this.getWSL2Instance(instanceId);
        
        if (instance.status !== 'running') {
            throw new Error(`WSL2 instance ${instanceId} is not running`);
        }

        try {
            // In a real implementation, this would execute the command via AgentAPI
            const result = {
                instanceId,
                command,
                exitCode: 0,
                stdout: `Executed: ${command}`,
                stderr: '',
                executedAt: new Date().toISOString(),
                duration: Math.random() * 1000 + 500 // Simulate execution time
            };

            this.emit('commandExecuted', result);
            return result;
        } catch (error) {
            this.emit('error', { type: 'commandExecution', error });
            throw new Error(`Failed to execute command in WSL2 instance: ${error.message}`);
        }
    }

    /**
     * Clone a repository in a WSL2 instance
     * @param {string} instanceId - Instance ID
     * @param {string} repoUrl - Repository URL
     * @param {string} branch - Branch to clone
     * @param {Object} options - Clone options
     * @returns {Promise<Object>} Clone result
     */
    async cloneRepository(instanceId, repoUrl, branch = 'main', options = {}) {
        const cloneCommand = `git clone -b ${branch} ${repoUrl} ${options.targetDir || '/workspace'}`;
        
        try {
            const result = await this.executeCommand(instanceId, cloneCommand);
            
            const cloneResult = {
                instanceId,
                repoUrl,
                branch,
                targetDir: options.targetDir || '/workspace',
                success: result.exitCode === 0,
                clonedAt: new Date().toISOString()
            };

            this.emit('repositoryCloned', cloneResult);
            return cloneResult;
        } catch (error) {
            this.emit('error', { type: 'repositoryClone', error });
            throw new Error(`Failed to clone repository: ${error.message}`);
        }
    }

    /**
     * Start Claude Code validation in a WSL2 instance
     * @param {string} instanceId - Instance ID
     * @param {Object} validationConfig - Validation configuration
     * @returns {Promise<Object>} Validation session
     */
    async startClaudeCodeValidation(instanceId, validationConfig = {}) {
        const instance = await this.getWSL2Instance(instanceId);
        
        const sessionId = `claude-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const session = {
            id: sessionId,
            instanceId,
            status: 'starting',
            config: validationConfig,
            startedAt: new Date().toISOString(),
            messages: []
        };

        try {
            // Start Claude Code session
            const startCommand = `claude --allowedTools "${validationConfig.allowedTools || 'Bash Edit Replace'}"`;
            await this.executeCommand(instanceId, startCommand);

            session.status = 'running';
            this.emit('validationStarted', session);

            return session;
        } catch (error) {
            session.status = 'failed';
            this.emit('error', { type: 'validationStart', error, session });
            throw new Error(`Failed to start Claude Code validation: ${error.message}`);
        }
    }

    /**
     * Send a validation request to Claude Code
     * @param {string} sessionId - Validation session ID
     * @param {string} request - Validation request
     * @returns {Promise<Object>} Validation response
     */
    async sendValidationRequest(sessionId, request) {
        try {
            // In a real implementation, this would send the request to Claude Code via AgentAPI
            const response = {
                sessionId,
                request,
                response: `Claude Code analysis: ${request}`,
                timestamp: new Date().toISOString(),
                status: 'completed'
            };

            this.emit('validationResponse', response);
            return response;
        } catch (error) {
            this.emit('error', { type: 'validationRequest', error });
            throw new Error(`Failed to send validation request: ${error.message}`);
        }
    }

    /**
     * Get resource usage for a WSL2 instance
     * @param {string} instanceId - Instance ID
     * @returns {Promise<Object>} Resource usage metrics
     */
    async getResourceUsage(instanceId) {
        const instance = await this.getWSL2Instance(instanceId);
        
        // Simulate resource usage metrics
        const usage = {
            instanceId,
            timestamp: new Date().toISOString(),
            cpu: {
                usage: Math.random() * 80, // 0-80% usage
                cores: 2
            },
            memory: {
                used: Math.random() * 3.2, // 0-3.2GB used
                total: 4.0,
                percentage: Math.random() * 80
            },
            disk: {
                used: Math.random() * 16, // 0-16GB used
                total: 20.0,
                percentage: Math.random() * 80
            },
            network: {
                bytesIn: Math.floor(Math.random() * 1000000),
                bytesOut: Math.floor(Math.random() * 1000000)
            }
        };

        this.emit('resourceUsage', usage);
        return usage;
    }

    /**
     * Cleanup and destroy a WSL2 instance
     * @param {string} instanceId - Instance ID
     * @returns {Promise<boolean>} True if cleanup successful
     */
    async destroyWSL2Instance(instanceId) {
        try {
            const instance = this.activeInstances.get(instanceId);
            if (!instance) {
                throw new Error(`WSL2 instance ${instanceId} not found`);
            }

            // Mark instance as terminating
            instance.status = 'terminating';
            this.emit('instanceTerminating', instance);

            // Simulate cleanup time
            setTimeout(() => {
                this.activeInstances.delete(instanceId);
                this.emit('instanceDestroyed', { instanceId });
            }, 1000);

            return true;
        } catch (error) {
            this.emit('error', { type: 'instanceDestroy', error });
            throw new Error(`Failed to destroy WSL2 instance: ${error.message}`);
        }
    }

    /**
     * List all active WSL2 instances
     * @returns {Promise<Array>} Array of active instances
     */
    async listWSL2Instances() {
        return Array.from(this.activeInstances.values());
    }

    /**
     * Cleanup all resources and disconnect
     */
    async cleanup() {
        try {
            // Destroy all active instances
            const instances = await this.listWSL2Instances();
            await Promise.all(
                instances.map(instance => this.destroyWSL2Instance(instance.id))
            );

            this.isConnected = false;
            this.emit('disconnected');
        } catch (error) {
            this.emit('error', { type: 'cleanup', error });
            throw error;
        }
    }

    /**
     * Retry a failed operation with exponential backoff
     * @param {Function} operation - Operation to retry
     * @param {number} maxRetries - Maximum number of retries
     * @returns {Promise<any>} Operation result
     */
    async retryOperation(operation, maxRetries = this.config.retries) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                
                if (attempt === maxRetries) {
                    break;
                }

                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                this.emit('retryAttempt', { attempt, delay, error });
                
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw lastError;
    }
}

export default AgentAPIClient;

