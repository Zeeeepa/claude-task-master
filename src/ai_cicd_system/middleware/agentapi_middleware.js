/**
 * @fileoverview Unified AgentAPI Middleware System
 * @description Consolidates 10 overlapping PRs into a single comprehensive AgentAPI communication layer
 * 
 * Consolidates:
 * - PR #43: AgentAPI Middleware Integration & Request Routing System
 * - PR #46: AgentAPI Middleware Integration & WSL2 Deployment
 * - PR #47: AgentAPI Integration & Claude Code Control
 * - PR #60: AgentAPI Middleware Integration Layer
 * - PR #61: AgentAPI Middleware Integration & Communication Layer
 * - PR #76: Real-time Status Synchronization System
 * - PR #83: Enhanced Codegen Integration
 * - PR #84: Authentication & Security Framework Implementation
 * - PR #85: AgentAPI Middleware Integration for Claude Code Communication
 * - PR #92: API & Integration Layer Workstream
 */

import EventEmitter from 'events';
import { performance } from 'perf_hooks';
import { SimpleLogger } from '../utils/simple_logger.js';

export class AgentAPIMiddleware extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            // AgentAPI Configuration (from PRs #43, #46, #60, #85)
            agentapi: {
                baseUrl: config.agentapi?.baseUrl || process.env.AGENTAPI_URL || 'http://localhost:3284',
                timeout: config.agentapi?.timeout || parseInt(process.env.AGENTAPI_TIMEOUT) || 30000,
                retryAttempts: config.agentapi?.retryAttempts || parseInt(process.env.AGENTAPI_RETRY_ATTEMPTS) || 3,
                enableEventStream: config.agentapi?.enableEventStream !== false,
                healthCheckInterval: config.agentapi?.healthCheckInterval || 30000,
                ...config.agentapi
            },
            
            // Claude Code Configuration (from PRs #47, #85)
            claudeCode: {
                maxInstances: config.claudeCode?.maxInstances || parseInt(process.env.CLAUDE_CODE_MAX_INSTANCES) || 5,
                instanceTimeout: config.claudeCode?.instanceTimeout || 300000,
                defaultTools: config.claudeCode?.defaultTools || ['Bash(git*)', 'Edit', 'Replace'],
                autoStart: config.claudeCode?.autoStart || false,
                ...config.claudeCode
            },
            
            // Task Queue Configuration (from PRs #43, #92)
            taskQueue: {
                maxConcurrentTasks: config.taskQueue?.maxConcurrentTasks || 3,
                taskTimeout: config.taskQueue?.taskTimeout || 300000,
                retryAttempts: config.taskQueue?.retryAttempts || 3,
                enablePersistence: config.taskQueue?.enablePersistence || false,
                ...config.taskQueue
            },
            
            // WSL2 Configuration (from PRs #46, #85)
            wsl2: {
                enabled: config.wsl2?.enabled !== false,
                maxInstances: config.wsl2?.maxInstances || 5,
                defaultDistribution: config.wsl2?.defaultDistribution || 'Ubuntu-22.04',
                resourceLimits: {
                    memory: '2GB',
                    cpu: '2 cores',
                    disk: '10GB',
                    ...config.wsl2?.resourceLimits
                },
                ...config.wsl2
            },
            
            // Security Configuration (from PRs #61, #84)
            security: {
                enableAuth: config.security?.enableAuth || false,
                apiKey: config.security?.apiKey || process.env.API_KEY,
                jwtSecret: config.security?.jwtSecret || process.env.JWT_SECRET,
                enableRateLimit: config.security?.enableRateLimit || false,
                ...config.security
            },
            
            // Synchronization Configuration (from PRs #76, #83)
            sync: {
                enableRealTimeSync: config.sync?.enableRealTimeSync !== false,
                conflictResolution: config.sync?.conflictResolution || 'latest_wins',
                syncInterval: config.sync?.syncInterval || 5000,
                enableWebSocket: config.sync?.enableWebSocket !== false,
                ...config.sync
            },
            
            // Monitoring Configuration (from PRs #60, #76)
            monitoring: {
                enabled: config.monitoring?.enabled !== false,
                metricsPort: config.monitoring?.metricsPort || 9090,
                healthCheckPort: config.monitoring?.healthCheckPort || 8080,
                enableDashboard: config.monitoring?.enableDashboard !== false,
                ...config.monitoring
            },
            
            ...config
        };

        this.logger = new SimpleLogger('AgentAPIMiddleware');
        
        // Component instances
        this.agentApiClient = null;
        this.claudeCodeManager = null;
        this.taskQueue = null;
        this.eventProcessor = null;
        this.wsl2Manager = null;
        this.deploymentOrchestrator = null;
        this.securityManager = null;
        this.syncMonitor = null;
        this.healthMonitor = null;
        
        // State management
        this.isInitialized = false;
        this.isRunning = false;
        this.startTime = null;
        
        // Metrics
        this.metrics = {
            tasksProcessed: 0,
            tasksSuccessful: 0,
            tasksFailed: 0,
            averageProcessingTime: 0,
            activeConnections: 0,
            totalConnections: 0,
            uptime: 0
        };
        
        // Performance tracking
        this.performanceTracker = new Map();
    }

    /**
     * Initialize the middleware system
     */
    async initialize() {
        if (this.isInitialized) {
            this.logger.warn('Middleware already initialized');
            return;
        }

        try {
            this.logger.info('🚀 Initializing AgentAPI Middleware...');
            this.startTime = Date.now();

            // Initialize core components in dependency order
            await this._initializeAgentAPIClient();
            await this._initializeSecurityManager();
            await this._initializeTaskQueue();
            await this._initializeClaudeCodeManager();
            await this._initializeEventProcessor();
            
            if (this.config.wsl2.enabled) {
                await this._initializeWSL2Manager();
                await this._initializeDeploymentOrchestrator();
            }
            
            if (this.config.sync.enableRealTimeSync) {
                await this._initializeSyncMonitor();
            }
            
            if (this.config.monitoring.enabled) {
                await this._initializeHealthMonitor();
            }

            this.isInitialized = true;
            this.emit('initialized');
            
            this.logger.info('✅ AgentAPI Middleware initialized successfully');

        } catch (error) {
            this.logger.error('❌ Failed to initialize AgentAPI Middleware:', error);
            throw error;
        }
    }

    /**
     * Start the middleware system
     */
    async start() {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (this.isRunning) {
            this.logger.warn('Middleware already running');
            return;
        }

        try {
            this.logger.info('🎯 Starting AgentAPI Middleware...');

            // Start components
            if (this.agentApiClient) {
                await this.agentApiClient.connect();
            }
            
            if (this.taskQueue) {
                await this.taskQueue.start();
            }
            
            if (this.eventProcessor) {
                await this.eventProcessor.start();
            }
            
            if (this.claudeCodeManager) {
                await this.claudeCodeManager.start();
            }
            
            if (this.wsl2Manager) {
                await this.wsl2Manager.start();
            }
            
            if (this.syncMonitor) {
                await this.syncMonitor.start();
            }
            
            if (this.healthMonitor) {
                await this.healthMonitor.start();
            }

            this.isRunning = true;
            this.emit('started');
            
            this.logger.info('✅ AgentAPI Middleware started successfully');

        } catch (error) {
            this.logger.error('❌ Failed to start AgentAPI Middleware:', error);
            throw error;
        }
    }

    /**
     * Stop the middleware system
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }

        try {
            this.logger.info('🛑 Stopping AgentAPI Middleware...');

            // Stop components in reverse order
            if (this.healthMonitor) {
                await this.healthMonitor.stop();
            }
            
            if (this.syncMonitor) {
                await this.syncMonitor.stop();
            }
            
            if (this.wsl2Manager) {
                await this.wsl2Manager.stop();
            }
            
            if (this.claudeCodeManager) {
                await this.claudeCodeManager.stop();
            }
            
            if (this.eventProcessor) {
                await this.eventProcessor.stop();
            }
            
            if (this.taskQueue) {
                await this.taskQueue.stop();
            }
            
            if (this.agentApiClient) {
                await this.agentApiClient.disconnect();
            }

            this.isRunning = false;
            this.emit('stopped');
            
            this.logger.info('✅ AgentAPI Middleware stopped successfully');

        } catch (error) {
            this.logger.error('❌ Error stopping AgentAPI Middleware:', error);
            throw error;
        }
    }

    /**
     * Add a task to the processing queue
     * @param {Object} task - Task to process
     * @returns {string} Task ID
     */
    addTask(task) {
        if (!this.isRunning) {
            throw new Error('Middleware not running');
        }

        const taskId = this._generateTaskId();
        const enrichedTask = {
            id: taskId,
            ...task,
            createdAt: new Date().toISOString(),
            status: 'queued'
        };

        this.taskQueue.addTask(enrichedTask);
        this.emit('taskAdded', { taskId, task: enrichedTask });
        
        this.logger.info(`📝 Task added: ${taskId}`, { type: task.type, priority: task.priority });
        
        return taskId;
    }

    /**
     * Get task status
     * @param {string} taskId - Task ID
     * @returns {Object} Task status
     */
    getTaskStatus(taskId) {
        return this.taskQueue?.getTaskStatus(taskId) || { status: 'not_found' };
    }

    /**
     * Get middleware health status
     * @returns {Object} Health status
     */
    getHealth() {
        const uptime = this.startTime ? Date.now() - this.startTime : 0;
        
        return {
            status: this.isRunning ? 'healthy' : 'stopped',
            uptime,
            components: {
                agentApiClient: this.agentApiClient?.getConnectionStatus() || 'not_initialized',
                taskQueue: this.taskQueue?.getStatus() || 'not_initialized',
                claudeCodeManager: this.claudeCodeManager?.getStatus() || 'not_initialized',
                wsl2Manager: this.wsl2Manager?.getStatus() || 'not_initialized',
                syncMonitor: this.syncMonitor?.getStatus() || 'not_initialized'
            },
            metrics: this.getMetrics(),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get middleware metrics
     * @returns {Object} Metrics
     */
    getMetrics() {
        const uptime = this.startTime ? Date.now() - this.startTime : 0;
        
        return {
            ...this.metrics,
            uptime,
            successRate: this.metrics.tasksProcessed > 0 
                ? (this.metrics.tasksSuccessful / this.metrics.tasksProcessed) * 100 
                : 0,
            taskQueue: this.taskQueue?.getMetrics() || {},
            agentApi: this.agentApiClient?.getMetrics() || {},
            claudeCode: this.claudeCodeManager?.getMetrics() || {},
            wsl2: this.wsl2Manager?.getMetrics() || {}
        };
    }

    // Private initialization methods

    async _initializeAgentAPIClient() {
        const { AgentAPIClient } = await import('./agentapi_client.js');
        this.agentApiClient = new AgentAPIClient(this.config.agentapi);
        
        // Set up event handlers
        this.agentApiClient.on('connected', () => {
            this.logger.info('🔗 AgentAPI client connected');
            this.emit('agentApiConnected');
        });
        
        this.agentApiClient.on('disconnected', () => {
            this.logger.warn('🔌 AgentAPI client disconnected');
            this.emit('agentApiDisconnected');
        });
        
        this.agentApiClient.on('error', (error) => {
            this.logger.error('❌ AgentAPI client error:', error);
            this.emit('agentApiError', error);
        });
    }

    async _initializeSecurityManager() {
        if (!this.config.security.enableAuth) {
            return;
        }
        
        const { SecurityManager } = await import('./security_manager.js');
        this.securityManager = new SecurityManager(this.config.security);
        await this.securityManager.initialize();
    }

    async _initializeTaskQueue() {
        const { TaskQueue } = await import('./task_queue.js');
        this.taskQueue = new TaskQueue(this.config.taskQueue);
        
        // Set up event handlers
        this.taskQueue.on('taskStarted', (data) => {
            this.logger.info(`🎯 Task started: ${data.taskId}`);
            this.emit('taskStarted', data);
        });
        
        this.taskQueue.on('taskCompleted', (data) => {
            this.metrics.tasksProcessed++;
            this.metrics.tasksSuccessful++;
            this._updateAverageProcessingTime(data.processingTime);
            
            this.logger.info(`✅ Task completed: ${data.taskId}`, { 
                processingTime: data.processingTime 
            });
            this.emit('taskCompleted', data);
        });
        
        this.taskQueue.on('taskFailed', (data) => {
            this.metrics.tasksProcessed++;
            this.metrics.tasksFailed++;
            
            this.logger.error(`❌ Task failed: ${data.taskId}`, { 
                error: data.error 
            });
            this.emit('taskFailed', data);
        });
    }

    async _initializeClaudeCodeManager() {
        const { ClaudeCodeManager } = await import('./claude_code_manager.js');
        this.claudeCodeManager = new ClaudeCodeManager({
            ...this.config.claudeCode,
            agentApiClient: this.agentApiClient
        });
    }

    async _initializeEventProcessor() {
        if (!this.config.agentapi.enableEventStream) {
            return;
        }
        
        const { EventProcessor } = await import('./event_processor.js');
        this.eventProcessor = new EventProcessor({
            agentApiClient: this.agentApiClient,
            ...this.config.eventProcessor
        });
        
        // Set up event handlers
        this.eventProcessor.on('event', (event) => {
            this.emit('agentApiEvent', event);
        });
    }

    async _initializeWSL2Manager() {
        const { WSL2Manager } = await import('./wsl2_manager.js');
        this.wsl2Manager = new WSL2Manager(this.config.wsl2);
    }

    async _initializeDeploymentOrchestrator() {
        const { DeploymentOrchestrator } = await import('./deployment_orchestrator.js');
        this.deploymentOrchestrator = new DeploymentOrchestrator({
            wsl2Manager: this.wsl2Manager,
            claudeCodeManager: this.claudeCodeManager,
            ...this.config.deployment
        });
    }

    async _initializeSyncMonitor() {
        const { SyncMonitor } = await import('../monitoring/sync_monitor.js');
        this.syncMonitor = new SyncMonitor(this.config.sync);
    }

    async _initializeHealthMonitor() {
        const { HealthMonitor } = await import('./health_monitor.js');
        this.healthMonitor = new HealthMonitor({
            middleware: this,
            ...this.config.monitoring
        });
    }

    // Utility methods

    _generateTaskId() {
        return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    _updateAverageProcessingTime(processingTime) {
        const totalTasks = this.metrics.tasksProcessed;
        const currentAverage = this.metrics.averageProcessingTime;
        
        this.metrics.averageProcessingTime = 
            (currentAverage * (totalTasks - 1) + processingTime) / totalTasks;
    }
}

export default AgentAPIMiddleware;

