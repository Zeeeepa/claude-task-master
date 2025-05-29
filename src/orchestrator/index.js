/**
 * Orchestrator Main Entry Point
 * Initializes and coordinates all orchestrator components
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { configManager } from '../utils/config-manager.js';
import { errorHandler } from '../utils/error-handler.js';
import { systemWatcher } from './system-watcher.js';
import { coordinationEngine } from './coordination-engine.js';
import { eventDispatcher } from './event-dispatcher.js';
import { workflowManager } from './workflow-manager.js';
import { agentAPIServer } from '../middleware/agentapi/server.js';
import { messageHandler } from '../middleware/agentapi/message-handler.js';
import { sessionManager } from '../middleware/agentapi/session-manager.js';
import { claudeInterface } from '../middleware/agentapi/claude-interface.js';
import { codegenSDKClient } from '../middleware/codegen/sdk-client.js';
import { authManager } from '../middleware/codegen/auth-manager.js';
import { repositoryOperations } from '../middleware/codegen/repository-ops.js';

class TaskMasterOrchestrator extends EventEmitter {
    constructor() {
        super();
        this.isRunning = false;
        this.components = new Map();
        this.startupOrder = [
            'configManager',
            'errorHandler',
            'logger',
            'eventDispatcher',
            'systemWatcher',
            'coordinationEngine',
            'workflowManager',
            'authManager',
            'codegenSDKClient',
            'repositoryOperations',
            'claudeInterface',
            'sessionManager',
            'messageHandler',
            'agentAPIServer'
        ];
        this.shutdownOrder = [...this.startupOrder].reverse();
    }

    /**
     * Initialize the orchestrator
     */
    async initialize() {
        try {
            logger.info('🚀 Initializing Task Master AI Development Orchestrator...');
            
            // Register all components
            this.registerComponents();
            
            // Initialize components in order
            await this.initializeComponents();
            
            // Setup inter-component communication
            this.setupComponentCommunication();
            
            // Setup error handling
            this.setupErrorHandling();
            
            this.isRunning = true;
            this.emit('initialized');
            
            logger.info('✅ Task Master Orchestrator initialized successfully');
            
            // Log system status
            await this.logSystemStatus();
            
        } catch (error) {
            logger.error('❌ Failed to initialize Task Master Orchestrator:', error);
            await this.handleInitializationError(error);
            throw error;
        }
    }

    /**
     * Register all components
     */
    registerComponents() {
        this.components.set('configManager', {
            instance: configManager,
            initialized: false,
            required: true
        });

        this.components.set('errorHandler', {
            instance: errorHandler,
            initialized: false,
            required: true
        });

        this.components.set('logger', {
            instance: logger,
            initialized: false,
            required: true
        });

        this.components.set('eventDispatcher', {
            instance: eventDispatcher,
            initialized: false,
            required: true
        });

        this.components.set('systemWatcher', {
            instance: systemWatcher,
            initialized: false,
            required: true
        });

        this.components.set('coordinationEngine', {
            instance: coordinationEngine,
            initialized: false,
            required: true
        });

        this.components.set('workflowManager', {
            instance: workflowManager,
            initialized: false,
            required: true
        });

        this.components.set('authManager', {
            instance: authManager,
            initialized: false,
            required: true
        });

        this.components.set('codegenSDKClient', {
            instance: codegenSDKClient,
            initialized: false,
            required: true
        });

        this.components.set('repositoryOperations', {
            instance: repositoryOperations,
            initialized: false,
            required: false
        });

        this.components.set('claudeInterface', {
            instance: claudeInterface,
            initialized: false,
            required: false
        });

        this.components.set('sessionManager', {
            instance: sessionManager,
            initialized: false,
            required: true
        });

        this.components.set('messageHandler', {
            instance: messageHandler,
            initialized: false,
            required: true
        });

        this.components.set('agentAPIServer', {
            instance: agentAPIServer,
            initialized: false,
            required: true
        });
    }

    /**
     * Initialize components in order
     */
    async initializeComponents() {
        for (const componentName of this.startupOrder) {
            const component = this.components.get(componentName);
            
            if (!component) {
                logger.warn(`Component not found: ${componentName}`);
                continue;
            }

            try {
                logger.info(`Initializing component: ${componentName}`);
                
                // Initialize component if it has an initialize method
                if (typeof component.instance.initialize === 'function') {
                    await component.instance.initialize();
                } else if (typeof component.instance.start === 'function') {
                    await component.instance.start();
                }
                
                component.initialized = true;
                logger.info(`✅ Component initialized: ${componentName}`);
                
            } catch (error) {
                const errorMessage = `Failed to initialize component ${componentName}: ${error.message}`;
                
                if (component.required) {
                    logger.error(`❌ ${errorMessage}`);
                    throw new Error(errorMessage);
                } else {
                    logger.warn(`⚠️ ${errorMessage} (non-critical)`);
                }
            }
        }
    }

    /**
     * Setup inter-component communication
     */
    setupComponentCommunication() {
        logger.info('Setting up inter-component communication...');

        // Event Dispatcher → System Watcher
        eventDispatcher.on('eventProcessed', (data) => {
            systemWatcher.emit('eventProcessed', data);
        });

        // Coordination Engine → Event Dispatcher
        coordinationEngine.on('taskAssigned', async (data) => {
            await eventDispatcher.dispatch('task.assigned', data);
        });

        coordinationEngine.on('taskCompleted', async (data) => {
            await eventDispatcher.dispatch('task.completed', data);
        });

        // Workflow Manager → Event Dispatcher
        workflowManager.on('workflowStarted', async (data) => {
            await eventDispatcher.dispatch('workflow.started', data);
        });

        workflowManager.on('workflowCompleted', async (data) => {
            await eventDispatcher.dispatch('workflow.completed', data);
        });

        // System Watcher → Coordination Engine
        systemWatcher.on('processRegistered', (data) => {
            coordinationEngine.emit('processRegistered', data);
        });

        // AgentAPI → Message Handler
        agentAPIServer.on('messageReceived', async (data) => {
            try {
                const response = await messageHandler.processMessage(
                    data.sessionId,
                    data.content,
                    data.metadata
                );
                agentAPIServer.emit('messageProcessed', { ...data, response });
            } catch (error) {
                agentAPIServer.emit('messageError', { ...data, error });
            }
        });

        // Claude Interface → Event Dispatcher
        claudeInterface.on('confirmationRequired', async (data) => {
            await eventDispatcher.dispatch('claude.confirmation_required', data);
        });

        claudeInterface.on('taskCompleted', async (data) => {
            await eventDispatcher.dispatch('claude.task_completed', data);
        });

        // Codegen SDK → Event Dispatcher
        codegenSDKClient.on('taskSubmitted', async (data) => {
            await eventDispatcher.dispatch('codegen.task_submitted', data);
        });

        codegenSDKClient.on('pullRequestCreated', async (data) => {
            await eventDispatcher.dispatch('codegen.pull_request_created', data);
        });

        // Repository Operations → Event Dispatcher
        repositoryOperations.on('repositoryCloned', async (data) => {
            await eventDispatcher.dispatch('repository.cloned', data);
        });

        repositoryOperations.on('changesPushed', async (data) => {
            await eventDispatcher.dispatch('repository.changes_pushed', data);
        });

        logger.info('✅ Inter-component communication setup complete');
    }

    /**
     * Setup error handling
     */
    setupErrorHandling() {
        logger.info('Setting up error handling...');

        // Handle critical errors from components
        for (const [componentName, component] of this.components) {
            if (component.instance && typeof component.instance.on === 'function') {
                component.instance.on('error', async (error) => {
                    await errorHandler.handleError(error, {
                        component: componentName,
                        critical: component.required
                    });
                });
            }
        }

        // Handle orchestrator errors
        this.on('error', async (error) => {
            await errorHandler.handleError(error, {
                component: 'orchestrator',
                critical: true
            });
        });

        logger.info('✅ Error handling setup complete');
    }

    /**
     * Handle initialization errors
     */
    async handleInitializationError(error) {
        logger.error('Handling initialization error...');
        
        try {
            // Attempt to stop any initialized components
            await this.stop();
        } catch (stopError) {
            logger.error('Error during emergency stop:', stopError);
        }
        
        // Emit critical error
        errorHandler.handleCriticalError('InitializationError', error, {
            fatal: true,
            source: 'orchestrator'
        });
    }

    /**
     * Start the orchestrator
     */
    async start() {
        if (this.isRunning) {
            logger.warn('Orchestrator is already running');
            return;
        }

        await this.initialize();
        
        logger.info('🎯 Task Master Orchestrator is now running');
        this.emit('started');
    }

    /**
     * Stop the orchestrator
     */
    async stop() {
        if (!this.isRunning) {
            logger.warn('Orchestrator is not running');
            return;
        }

        logger.info('🛑 Stopping Task Master Orchestrator...');
        this.isRunning = false;

        // Stop components in reverse order
        for (const componentName of this.shutdownOrder) {
            const component = this.components.get(componentName);
            
            if (!component || !component.initialized) {
                continue;
            }

            try {
                logger.info(`Stopping component: ${componentName}`);
                
                if (typeof component.instance.stop === 'function') {
                    await component.instance.stop();
                } else if (typeof component.instance.close === 'function') {
                    await component.instance.close();
                } else if (typeof component.instance.disconnect === 'function') {
                    await component.instance.disconnect();
                }
                
                component.initialized = false;
                logger.info(`✅ Component stopped: ${componentName}`);
                
            } catch (error) {
                logger.error(`❌ Error stopping component ${componentName}:`, error);
            }
        }

        this.emit('stopped');
        logger.info('✅ Task Master Orchestrator stopped');
    }

    /**
     * Restart the orchestrator
     */
    async restart() {
        logger.info('🔄 Restarting Task Master Orchestrator...');
        
        await this.stop();
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        await this.start();
        
        logger.info('✅ Task Master Orchestrator restarted');
    }

    /**
     * Get orchestrator status
     */
    getStatus() {
        const componentStatus = {};
        
        for (const [name, component] of this.components) {
            componentStatus[name] = {
                initialized: component.initialized,
                required: component.required,
                status: component.instance && typeof component.instance.getStatus === 'function' 
                    ? component.instance.getStatus() 
                    : 'unknown'
            };
        }

        return {
            isRunning: this.isRunning,
            uptime: this.isRunning ? Date.now() - this.startTime : 0,
            components: componentStatus,
            memoryUsage: process.memoryUsage(),
            cpuUsage: process.cpuUsage()
        };
    }

    /**
     * Log system status
     */
    async logSystemStatus() {
        const status = this.getStatus();
        
        logger.info('📊 System Status:', {
            isRunning: status.isRunning,
            componentsInitialized: Object.values(status.components).filter(c => c.initialized).length,
            totalComponents: Object.keys(status.components).length,
            memoryUsage: `${Math.round(status.memoryUsage.rss / 1024 / 1024)}MB`,
            uptime: `${Math.round(status.uptime / 1000)}s`
        });
    }

    /**
     * Health check
     */
    async healthCheck() {
        const health = {
            status: 'healthy',
            timestamp: Date.now(),
            components: {},
            issues: []
        };

        for (const [name, component] of this.components) {
            try {
                if (component.initialized && typeof component.instance.getStatus === 'function') {
                    const componentStatus = component.instance.getStatus();
                    health.components[name] = componentStatus;
                    
                    // Check for component-specific health issues
                    if (componentStatus.isRunning === false) {
                        health.issues.push(`Component ${name} is not running`);
                    }
                } else {
                    health.components[name] = { status: 'not_initialized' };
                    
                    if (component.required) {
                        health.issues.push(`Required component ${name} is not initialized`);
                    }
                }
            } catch (error) {
                health.components[name] = { status: 'error', error: error.message };
                health.issues.push(`Component ${name} health check failed: ${error.message}`);
            }
        }

        // Determine overall health status
        if (health.issues.length > 0) {
            health.status = health.issues.some(issue => issue.includes('Required')) ? 'critical' : 'warning';
        }

        return health;
    }
}

// Create and export the orchestrator instance
export const orchestrator = new TaskMasterOrchestrator();
export default TaskMasterOrchestrator;

