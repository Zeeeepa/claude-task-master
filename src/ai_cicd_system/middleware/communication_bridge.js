/**
 * Communication Bridge
 * 
 * Central communication hub that orchestrates interactions between
 * the System Orchestrator, AgentAPI middleware, and Claude Code validation.
 */

import { EventEmitter } from 'events';
import { SimpleLogger } from '../utils/simple_logger.js';
import AgentAPIClient from '../integrations/agentapi/client.js';
import WebhookHandler from '../integrations/agentapi/webhook_handler.js';
import ClaudeCodeValidator from '../integrations/claude_code/validator.js';
import WSL2DeploymentManager from '../integrations/agentapi/deployment_manager.js';
import ResultCollector from '../integrations/claude_code/result_collector.js';

export class CommunicationBridge extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            agentApiUrl: options.agentApiUrl || process.env.AGENTAPI_URL || 'http://localhost:3284',
            agentApiKey: options.agentApiKey || process.env.AGENTAPI_KEY,
            webhookPort: options.webhookPort || process.env.WEBHOOK_PORT || 3002,
            enableWebhooks: options.enableWebhooks !== false,
            enableDeployments: options.enableDeployments !== false,
            enableValidation: options.enableValidation !== false,
            enableResultCollection: options.enableResultCollection !== false,
            maxConcurrentOperations: options.maxConcurrentOperations || 5,
            operationTimeout: options.operationTimeout || 30 * 60 * 1000, // 30 minutes
            retryAttempts: options.retryAttempts || 3,
            retryDelay: options.retryDelay || 5000,
            ...options
        };

        this.logger = new SimpleLogger('CommunicationBridge', options.logLevel || 'info');
        this.isInitialized = false;
        this.activeOperations = new Map();
        this.operationQueue = [];
        this.isProcessingQueue = false;

        // Initialize components
        this.agentApiClient = null;
        this.webhookHandler = null;
        this.claudeCodeValidator = null;
        this.deploymentManager = null;
        this.resultCollector = null;

        this._initializeComponents();
        this._setupEventHandlers();
    }

    /**
     * Initialize all components
     */
    _initializeComponents() {
        try {
            // Initialize AgentAPI client
            this.agentApiClient = new AgentAPIClient({
                baseURL: this.config.agentApiUrl,
                apiKey: this.config.agentApiKey,
                logLevel: this.config.logLevel
            });

            // Initialize webhook handler
            if (this.config.enableWebhooks) {
                this.webhookHandler = new WebhookHandler({
                    port: this.config.webhookPort,
                    logLevel: this.config.logLevel
                });
            }

            // Initialize Claude Code validator
            if (this.config.enableValidation) {
                this.claudeCodeValidator = new ClaudeCodeValidator({
                    agentApiUrl: this.config.agentApiUrl,
                    agentApiKey: this.config.agentApiKey,
                    logLevel: this.config.logLevel
                });
            }

            // Initialize deployment manager
            if (this.config.enableDeployments) {
                this.deploymentManager = new WSL2DeploymentManager({
                    logLevel: this.config.logLevel
                });
            }

            // Initialize result collector
            if (this.config.enableResultCollection) {
                this.resultCollector = new ResultCollector({
                    logLevel: this.config.logLevel
                });
            }

            this.logger.info('Communication bridge components initialized');
        } catch (error) {
            this.logger.error('Failed to initialize components:', error);
            throw error;
        }
    }

    /**
     * Setup event handlers
     */
    _setupEventHandlers() {
        // AgentAPI client events
        if (this.agentApiClient) {
            this.agentApiClient.on('connected', () => {
                this.logger.info('AgentAPI client connected');
                this.emit('agentapi.connected');
            });

            this.agentApiClient.on('disconnected', () => {
                this.logger.warn('AgentAPI client disconnected');
                this.emit('agentapi.disconnected');
            });

            this.agentApiClient.on('message', (message) => {
                this._handleAgentApiMessage(message);
            });
        }

        // Webhook handler events
        if (this.webhookHandler) {
            this.webhookHandler.on('webhook', (data) => {
                this._handleWebhookEvent(data);
            });

            this.webhookHandler.on('validation.started', (data) => {
                this.emit('validation.started', data);
            });

            this.webhookHandler.on('validation.completed', (data) => {
                this.emit('validation.completed', data);
            });

            this.webhookHandler.on('deployment.started', (data) => {
                this.emit('deployment.started', data);
            });

            this.webhookHandler.on('deployment.completed', (data) => {
                this.emit('deployment.completed', data);
            });
        }

        // Claude Code validator events
        if (this.claudeCodeValidator) {
            this.claudeCodeValidator.on('validation.started', (data) => {
                this._handleValidationStarted(data);
            });

            this.claudeCodeValidator.on('validation.completed', (data) => {
                this._handleValidationCompleted(data);
            });

            this.claudeCodeValidator.on('validation.failed', (data) => {
                this._handleValidationFailed(data);
            });
        }

        // Deployment manager events
        if (this.deploymentManager) {
            this.deploymentManager.on('deployment.started', (data) => {
                this._handleDeploymentStarted(data);
            });

            this.deploymentManager.on('deployment.completed', (data) => {
                this._handleDeploymentCompleted(data);
            });

            this.deploymentManager.on('deployment.failed', (data) => {
                this._handleDeploymentFailed(data);
            });
        }

        // Result collector events
        if (this.resultCollector) {
            this.resultCollector.on('result.collected', (data) => {
                this.emit('result.collected', data);
            });

            this.resultCollector.on('metrics.aggregated', (data) => {
                this.emit('metrics.aggregated', data);
            });
        }
    }

    /**
     * Initialize the communication bridge
     */
    async initialize() {
        try {
            this.logger.info('Initializing Communication Bridge...');

            // Initialize AgentAPI client
            if (this.agentApiClient) {
                const connected = await this.agentApiClient.connect();
                if (!connected) {
                    throw new Error('Failed to connect to AgentAPI');
                }
            }

            // Start webhook handler
            if (this.webhookHandler) {
                await this.webhookHandler.start();
                this._registerWebhookEndpoints();
            }

            // Initialize Claude Code validator
            if (this.claudeCodeValidator) {
                const initialized = await this.claudeCodeValidator.initialize();
                if (!initialized) {
                    throw new Error('Failed to initialize Claude Code validator');
                }
            }

            // Check WSL2 deployment manager
            if (this.deploymentManager) {
                const wsl2Status = await this.deploymentManager.checkWSL2Setup();
                if (!wsl2Status.available) {
                    this.logger.warn('WSL2 not available:', wsl2Status.reason);
                }
            }

            this.isInitialized = true;
            this.logger.info('Communication Bridge initialized successfully');

            this.emit('bridge.initialized');
            return true;

        } catch (error) {
            this.logger.error('Failed to initialize Communication Bridge:', error);
            this.emit('bridge.initialization_failed', error);
            return false;
        }
    }

    /**
     * Register webhook endpoints
     */
    _registerWebhookEndpoints() {
        if (!this.webhookHandler) return;

        // Register endpoints for different event types
        this.webhookHandler.registerEndpoint('agentapi', [
            'status_changed',
            'message_received',
            'session_started',
            'session_ended'
        ], 'AgentAPI status and message events');

        this.webhookHandler.registerEndpoint('claude-code', [
            'validation_started',
            'validation_progress',
            'validation_completed',
            'validation_failed'
        ], 'Claude Code validation events');

        this.webhookHandler.registerEndpoint('wsl2', [
            'deployment_started',
            'deployment_progress',
            'deployment_completed',
            'deployment_failed'
        ], 'WSL2 deployment events');

        this.logger.info('Webhook endpoints registered');
    }

    /**
     * Process PR validation request
     */
    async processPRValidation(prInfo, options = {}) {
        try {
            const operationId = this._generateOperationId('validation', prInfo);
            
            this.logger.info(`Processing PR validation: ${prInfo.repository}#${prInfo.number}`, {
                operationId,
                options
            });

            // Check if we can start operation immediately
            if (this.activeOperations.size >= this.config.maxConcurrentOperations) {
                this.logger.info(`Operation queued (${this.operationQueue.length + 1} in queue)`);
                return this._queueOperation(operationId, 'validation', prInfo, options);
            }

            return await this._executeValidationOperation(operationId, prInfo, options);

        } catch (error) {
            this.logger.error('PR validation processing failed:', error);
            throw error;
        }
    }

    /**
     * Process PR deployment request
     */
    async processPRDeployment(prInfo, options = {}) {
        try {
            const operationId = this._generateOperationId('deployment', prInfo);
            
            this.logger.info(`Processing PR deployment: ${prInfo.repository}#${prInfo.number}`, {
                operationId,
                options
            });

            // Check if we can start operation immediately
            if (this.activeOperations.size >= this.config.maxConcurrentOperations) {
                this.logger.info(`Operation queued (${this.operationQueue.length + 1} in queue)`);
                return this._queueOperation(operationId, 'deployment', prInfo, options);
            }

            return await this._executeDeploymentOperation(operationId, prInfo, options);

        } catch (error) {
            this.logger.error('PR deployment processing failed:', error);
            throw error;
        }
    }

    /**
     * Process combined validation and deployment
     */
    async processFullPRValidation(prInfo, options = {}) {
        try {
            const operationId = this._generateOperationId('full_validation', prInfo);
            
            this.logger.info(`Processing full PR validation: ${prInfo.repository}#${prInfo.number}`, {
                operationId,
                options
            });

            const operation = {
                id: operationId,
                type: 'full_validation',
                prInfo,
                options,
                status: 'initializing',
                startTime: new Date(),
                steps: [],
                results: {}
            };

            this.activeOperations.set(operationId, operation);

            try {
                // Step 1: Deploy to WSL2
                operation.status = 'deploying';
                operation.steps.push({ step: 'deployment', status: 'started', timestamp: new Date() });

                const deploymentResult = await this.deploymentManager.deployPR(prInfo, options.deployment);
                operation.results.deployment = deploymentResult;
                operation.steps.push({ step: 'deployment', status: 'completed', timestamp: new Date() });

                // Step 2: Run validation
                operation.status = 'validating';
                operation.steps.push({ step: 'validation', status: 'started', timestamp: new Date() });

                const validationResult = await this.claudeCodeValidator.validatePR(prInfo, {
                    ...options.validation,
                    workspacePath: deploymentResult.workspacePath
                });
                operation.results.validation = validationResult;
                operation.steps.push({ step: 'validation', status: 'completed', timestamp: new Date() });

                // Step 3: Collect results
                operation.status = 'collecting_results';
                operation.steps.push({ step: 'result_collection', status: 'started', timestamp: new Date() });

                if (this.resultCollector) {
                    await this.resultCollector.collectValidationResult(operationId, {
                        success: true,
                        prInfo,
                        validationData: validationResult,
                        deploymentData: deploymentResult,
                        duration: Date.now() - operation.startTime.getTime()
                    });
                }
                operation.steps.push({ step: 'result_collection', status: 'completed', timestamp: new Date() });

                // Mark as completed
                operation.status = 'completed';
                operation.endTime = new Date();

                this.emit('operation.completed', {
                    operationId,
                    type: 'full_validation',
                    results: operation.results,
                    duration: operation.endTime - operation.startTime
                });

                this.logger.info(`Full PR validation completed: ${operationId}`);

                // Process next in queue
                this._processOperationQueue();

                return {
                    success: true,
                    operationId,
                    results: operation.results
                };

            } catch (error) {
                operation.status = 'failed';
                operation.endTime = new Date();
                operation.error = error.message;

                this.emit('operation.failed', {
                    operationId,
                    type: 'full_validation',
                    error: error.message
                });

                throw error;
            }

        } catch (error) {
            this.logger.error('Full PR validation processing failed:', error);
            throw error;
        }
    }

    /**
     * Generate operation ID
     */
    _generateOperationId(type, prInfo) {
        const timestamp = Date.now();
        const hash = require('crypto')
            .createHash('md5')
            .update(`${type}-${prInfo.repository}-${prInfo.number}`)
            .digest('hex')
            .substring(0, 8);
        return `${type}-${hash}-${timestamp}`;
    }

    /**
     * Queue operation
     */
    async _queueOperation(operationId, type, prInfo, options) {
        return new Promise((resolve, reject) => {
            this.operationQueue.push({
                operationId,
                type,
                prInfo,
                options,
                resolve,
                reject,
                queuedAt: new Date()
            });

            this._processOperationQueue();
        });
    }

    /**
     * Process operation queue
     */
    async _processOperationQueue() {
        if (this.isProcessingQueue || this.operationQueue.length === 0) {
            return;
        }

        if (this.activeOperations.size >= this.config.maxConcurrentOperations) {
            return;
        }

        this.isProcessingQueue = true;

        try {
            while (this.operationQueue.length > 0 && 
                   this.activeOperations.size < this.config.maxConcurrentOperations) {
                
                const operation = this.operationQueue.shift();
                
                try {
                    let result;
                    switch (operation.type) {
                        case 'validation':
                            result = await this._executeValidationOperation(
                                operation.operationId,
                                operation.prInfo,
                                operation.options
                            );
                            break;
                        case 'deployment':
                            result = await this._executeDeploymentOperation(
                                operation.operationId,
                                operation.prInfo,
                                operation.options
                            );
                            break;
                        case 'full_validation':
                            result = await this.processFullPRValidation(
                                operation.prInfo,
                                operation.options
                            );
                            break;
                        default:
                            throw new Error(`Unknown operation type: ${operation.type}`);
                    }
                    
                    operation.resolve(result);
                } catch (error) {
                    operation.reject(error);
                }
            }
        } finally {
            this.isProcessingQueue = false;
        }
    }

    /**
     * Execute validation operation
     */
    async _executeValidationOperation(operationId, prInfo, options) {
        if (!this.claudeCodeValidator) {
            throw new Error('Claude Code validator not available');
        }

        const operation = {
            id: operationId,
            type: 'validation',
            prInfo,
            options,
            status: 'running',
            startTime: new Date()
        };

        this.activeOperations.set(operationId, operation);

        try {
            const result = await this.claudeCodeValidator.validatePR(prInfo, options);
            
            operation.status = 'completed';
            operation.endTime = new Date();
            operation.result = result;

            // Collect results
            if (this.resultCollector) {
                await this.resultCollector.collectValidationResult(operationId, {
                    success: result.success,
                    prInfo,
                    validationData: result,
                    duration: operation.endTime - operation.startTime
                });
            }

            this._processOperationQueue();
            return result;

        } catch (error) {
            operation.status = 'failed';
            operation.endTime = new Date();
            operation.error = error.message;

            this._processOperationQueue();
            throw error;
        }
    }

    /**
     * Execute deployment operation
     */
    async _executeDeploymentOperation(operationId, prInfo, options) {
        if (!this.deploymentManager) {
            throw new Error('Deployment manager not available');
        }

        const operation = {
            id: operationId,
            type: 'deployment',
            prInfo,
            options,
            status: 'running',
            startTime: new Date()
        };

        this.activeOperations.set(operationId, operation);

        try {
            const result = await this.deploymentManager.deployPR(prInfo, options);
            
            operation.status = 'completed';
            operation.endTime = new Date();
            operation.result = result;

            // Collect results
            if (this.resultCollector) {
                await this.resultCollector.collectDeploymentResult(operationId, {
                    success: result.success,
                    prInfo,
                    deploymentData: result,
                    duration: operation.endTime - operation.startTime
                });
            }

            this._processOperationQueue();
            return result;

        } catch (error) {
            operation.status = 'failed';
            operation.endTime = new Date();
            operation.error = error.message;

            this._processOperationQueue();
            throw error;
        }
    }

    /**
     * Handle AgentAPI messages
     */
    _handleAgentApiMessage(message) {
        this.logger.debug('Received AgentAPI message:', message);
        this.emit('agentapi.message', message);
    }

    /**
     * Handle webhook events
     */
    _handleWebhookEvent(data) {
        this.logger.debug('Received webhook event:', data);
        this.emit('webhook.event', data);
    }

    /**
     * Handle validation events
     */
    _handleValidationStarted(data) {
        this.logger.info('Validation started:', data);
        this.emit('validation.started', data);
    }

    _handleValidationCompleted(data) {
        this.logger.info('Validation completed:', data);
        this.emit('validation.completed', data);
    }

    _handleValidationFailed(data) {
        this.logger.error('Validation failed:', data);
        this.emit('validation.failed', data);
    }

    /**
     * Handle deployment events
     */
    _handleDeploymentStarted(data) {
        this.logger.info('Deployment started:', data);
        this.emit('deployment.started', data);
    }

    _handleDeploymentCompleted(data) {
        this.logger.info('Deployment completed:', data);
        this.emit('deployment.completed', data);
    }

    _handleDeploymentFailed(data) {
        this.logger.error('Deployment failed:', data);
        this.emit('deployment.failed', data);
    }

    /**
     * Get operation status
     */
    getOperationStatus(operationId) {
        const operation = this.activeOperations.get(operationId);
        if (!operation) {
            return null;
        }

        return {
            id: operation.id,
            type: operation.type,
            status: operation.status,
            prInfo: operation.prInfo,
            startTime: operation.startTime,
            endTime: operation.endTime,
            duration: operation.endTime ? 
                operation.endTime - operation.startTime : 
                Date.now() - operation.startTime.getTime(),
            steps: operation.steps || [],
            results: operation.results || operation.result
        };
    }

    /**
     * List active operations
     */
    listOperations() {
        return Array.from(this.activeOperations.values()).map(op => ({
            id: op.id,
            type: op.type,
            status: op.status,
            prNumber: op.prInfo.number,
            repository: op.prInfo.repository,
            startTime: op.startTime,
            duration: op.endTime ? 
                op.endTime - op.startTime : 
                Date.now() - op.startTime.getTime()
        }));
    }

    /**
     * Stop operation
     */
    async stopOperation(operationId, reason = 'manual') {
        const operation = this.activeOperations.get(operationId);
        if (!operation) {
            return false;
        }

        try {
            operation.status = 'stopping';
            operation.endTime = new Date();

            // Stop specific operation types
            if (operation.type === 'validation' && this.claudeCodeValidator) {
                await this.claudeCodeValidator.stopValidation(operationId, reason);
            } else if (operation.type === 'deployment' && this.deploymentManager) {
                await this.deploymentManager.stopDeployment(operationId, reason);
            }

            this.emit('operation.stopped', {
                operationId,
                reason,
                timestamp: new Date().toISOString()
            });

            this.logger.info(`Operation stopped: ${operationId} (${reason})`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to stop operation ${operationId}:`, error);
            return false;
        }
    }

    /**
     * Get bridge status
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            activeOperations: this.activeOperations.size,
            queuedOperations: this.operationQueue.length,
            components: {
                agentApiClient: this.agentApiClient ? this.agentApiClient.getConnectionStatus() : null,
                webhookHandler: this.webhookHandler ? this.webhookHandler.getStats() : null,
                claudeCodeValidator: this.claudeCodeValidator ? this.claudeCodeValidator.getStats() : null,
                deploymentManager: this.deploymentManager ? this.deploymentManager.getStats() : null,
                resultCollector: this.resultCollector ? this.resultCollector.getStats() : null
            }
        };
    }

    /**
     * Shutdown communication bridge
     */
    async shutdown() {
        try {
            this.logger.info('Shutting down Communication Bridge...');

            // Stop all active operations
            const stopPromises = Array.from(this.activeOperations.keys())
                .map(id => this.stopOperation(id, 'shutdown'));
            
            await Promise.all(stopPromises);

            // Shutdown components
            if (this.claudeCodeValidator) {
                await this.claudeCodeValidator.shutdown();
            }

            if (this.deploymentManager) {
                await this.deploymentManager.shutdown();
            }

            if (this.resultCollector) {
                await this.resultCollector.shutdown();
            }

            if (this.webhookHandler) {
                await this.webhookHandler.stop();
            }

            if (this.agentApiClient) {
                await this.agentApiClient.disconnect();
            }

            this.logger.info('Communication Bridge shutdown completed');
            this.emit('bridge.shutdown');

        } catch (error) {
            this.logger.error('Error during shutdown:', error);
        }
    }
}

export default CommunicationBridge;

