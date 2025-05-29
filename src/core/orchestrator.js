/**
 * @fileoverview Core Orchestrator - Main orchestration engine for Task Master
 * @description Central coordination hub that manages component lifecycle, 
 *              event-driven architecture, and system orchestration
 */

import { EventEmitter } from 'events';
import { configManager, getConfig } from '../../config/orchestrator.js';
import { createAICICDSystem } from '../ai_cicd_system/index.js';
import { TaskManager } from './task-manager.js';
import { HealthMonitor } from './health-monitor.js';
import { EventBus } from './event-bus.js';

/**
 * Component states
 */
export const ComponentState = {
    STOPPED: 'stopped',
    STARTING: 'starting',
    RUNNING: 'running',
    STOPPING: 'stopping',
    ERROR: 'error',
    MAINTENANCE: 'maintenance'
};

/**
 * Core Orchestrator Class
 * Manages the entire Task Master system lifecycle and coordination
 */
export class Orchestrator extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = config;
        this.state = ComponentState.STOPPED;
        this.components = new Map();
        this.startTime = null;
        this.shutdownInProgress = false;
        
        // Core components
        this.aiCicdSystem = null;
        this.taskManager = null;
        this.healthMonitor = null;
        this.eventBus = null;
        
        // Component registry
        this.componentRegistry = new Map();
        
        // Error handling
        this.errorCount = 0;
        this.lastError = null;
        
        // Metrics
        this.metrics = {
            tasksProcessed: 0,
            eventsEmitted: 0,
            errorsHandled: 0,
            uptime: 0,
            componentRestarts: 0
        };
        
        this.setupErrorHandling();
    }

    /**
     * Initialize the orchestrator
     * @param {Object} options - Initialization options
     * @returns {Promise<void>}
     */
    async initialize(options = {}) {
        try {
            this.setState(ComponentState.STARTING);
            this.emit('orchestrator:initializing');

            // Load configuration if not already loaded
            if (!configManager.isLoaded()) {
                await configManager.load(options.configPath);
            }

            // Initialize event bus first (other components depend on it)
            await this.initializeEventBus();

            // Initialize core components
            await this.initializeTaskManager();
            await this.initializeAICICDSystem();
            await this.initializeHealthMonitor();

            // Register component lifecycle handlers
            this.setupComponentLifecycle();

            // Start health monitoring
            if (getConfig('healthChecks.enabled', true)) {
                await this.healthMonitor.start();
            }

            this.startTime = Date.now();
            this.setState(ComponentState.RUNNING);
            this.emit('orchestrator:initialized');

            console.log('🚀 Task Master Orchestrator initialized successfully');
            
        } catch (error) {
            this.setState(ComponentState.ERROR);
            this.handleError('Failed to initialize orchestrator', error);
            throw error;
        }
    }

    /**
     * Initialize Event Bus
     */
    async initializeEventBus() {
        try {
            this.eventBus = new EventBus({
                maxListeners: getConfig('events.maxListeners', 100),
                timeout: getConfig('events.eventTimeout', 10000),
                retryAttempts: getConfig('events.eventRetryAttempts', 3),
                retryDelay: getConfig('events.eventRetryDelay', 1000)
            });

            await this.eventBus.initialize();
            this.registerComponent('eventBus', this.eventBus);

            // Bridge orchestrator events to event bus
            this.setupEventBridge();

            console.log('✅ Event Bus initialized');
        } catch (error) {
            throw new Error(`Failed to initialize Event Bus: ${error.message}`);
        }
    }

    /**
     * Initialize Task Manager
     */
    async initializeTaskManager() {
        try {
            this.taskManager = new TaskManager({
                preserveLegacyFunctionality: getConfig('taskManager.preserveLegacyFunctionality', true),
                enableEventLogging: getConfig('taskManager.enableEventLogging', true),
                backwardCompatibility: getConfig('taskManager.backwardCompatibility', true),
                eventBus: this.eventBus
            });

            await this.taskManager.initialize();
            this.registerComponent('taskManager', this.taskManager);

            console.log('✅ Task Manager initialized');
        } catch (error) {
            throw new Error(`Failed to initialize Task Manager: ${error.message}`);
        }
    }

    /**
     * Initialize AI CI/CD System
     */
    async initializeAICICDSystem() {
        try {
            if (getConfig('integrations.aiCicdSystem.enabled', true)) {
                const aiCicdConfig = {
                    database: getConfig('database'),
                    integrations: getConfig('integrations'),
                    monitoring: getConfig('monitoring')
                };

                this.aiCicdSystem = await createAICICDSystem(aiCicdConfig);
                this.registerComponent('aiCicdSystem', this.aiCicdSystem);

                // Bridge AI CI/CD events to orchestrator
                this.setupAICICDEventBridge();

                console.log('✅ AI CI/CD System initialized');
            }
        } catch (error) {
            throw new Error(`Failed to initialize AI CI/CD System: ${error.message}`);
        }
    }

    /**
     * Initialize Health Monitor
     */
    async initializeHealthMonitor() {
        try {
            this.healthMonitor = new HealthMonitor({
                interval: getConfig('orchestrator.healthCheckInterval', 30000),
                timeout: getConfig('healthChecks.timeout', 5000),
                retryAttempts: getConfig('healthChecks.retryAttempts', 2),
                alertThreshold: getConfig('healthChecks.alertThreshold', 3),
                components: this.componentRegistry
            });

            await this.healthMonitor.initialize();
            this.registerComponent('healthMonitor', this.healthMonitor);

            console.log('✅ Health Monitor initialized');
        } catch (error) {
            throw new Error(`Failed to initialize Health Monitor: ${error.message}`);
        }
    }

    /**
     * Register a component with the orchestrator
     * @param {string} name - Component name
     * @param {Object} component - Component instance
     */
    registerComponent(name, component) {
        this.componentRegistry.set(name, {
            instance: component,
            state: ComponentState.RUNNING,
            startTime: Date.now(),
            restartCount: 0,
            lastError: null
        });

        this.emit('component:registered', { name, component });
    }

    /**
     * Setup component lifecycle handlers
     */
    setupComponentLifecycle() {
        // Handle component errors
        this.componentRegistry.forEach((componentInfo, name) => {
            const component = componentInfo.instance;
            
            if (component && typeof component.on === 'function') {
                component.on('error', (error) => {
                    this.handleComponentError(name, error);
                });

                component.on('state:changed', (state) => {
                    this.updateComponentState(name, state);
                });
            }
        });
    }

    /**
     * Setup event bridge between orchestrator and event bus
     */
    setupEventBridge() {
        // Forward orchestrator events to event bus
        const eventsToForward = [
            'orchestrator:initialized',
            'orchestrator:shutdown',
            'component:registered',
            'component:error',
            'component:restarted',
            'task:created',
            'task:updated',
            'task:completed',
            'task:failed'
        ];

        eventsToForward.forEach(eventName => {
            this.on(eventName, (data) => {
                this.eventBus.emit(eventName, data);
                this.metrics.eventsEmitted++;
            });
        });
    }

    /**
     * Setup AI CI/CD System event bridge
     */
    setupAICICDEventBridge() {
        if (this.aiCicdSystem && typeof this.aiCicdSystem.on === 'function') {
            this.aiCicdSystem.on('requirement:processed', (data) => {
                this.emit('requirement:processed', data);
            });

            this.aiCicdSystem.on('task:generated', (data) => {
                this.emit('task:generated', data);
                this.metrics.tasksProcessed++;
            });

            this.aiCicdSystem.on('validation:completed', (data) => {
                this.emit('validation:completed', data);
            });
        }
    }

    /**
     * Process a requirement through the orchestrator
     * @param {string} requirement - Natural language requirement
     * @param {Object} options - Processing options
     * @returns {Promise<Object>} Processing result
     */
    async processRequirement(requirement, options = {}) {
        try {
            this.emit('requirement:received', { requirement, options });

            // Validate orchestrator state
            if (this.state !== ComponentState.RUNNING) {
                throw new Error(`Orchestrator not running. Current state: ${this.state}`);
            }

            // Process through AI CI/CD System if available
            let result = null;
            if (this.aiCicdSystem) {
                result = await this.aiCicdSystem.processRequirement(requirement, options);
            } else {
                // Fallback to task manager
                result = await this.taskManager.processRequirement(requirement, options);
            }

            this.emit('requirement:processed', { requirement, result });
            this.metrics.tasksProcessed++;

            return result;

        } catch (error) {
            this.handleError('Failed to process requirement', error);
            throw error;
        }
    }

    /**
     * Handle component error
     * @param {string} componentName - Name of the component
     * @param {Error} error - Error that occurred
     */
    async handleComponentError(componentName, error) {
        console.error(`❌ Component error in ${componentName}:`, error);

        const componentInfo = this.componentRegistry.get(componentName);
        if (componentInfo) {
            componentInfo.lastError = error;
            componentInfo.state = ComponentState.ERROR;
        }

        this.emit('component:error', { componentName, error });

        // Attempt to restart component if configured
        const shouldRestart = getConfig(`components.${componentName}.autoRestart`, true);
        if (shouldRestart && componentInfo && componentInfo.restartCount < 3) {
            await this.restartComponent(componentName);
        }
    }

    /**
     * Restart a component
     * @param {string} componentName - Name of the component to restart
     */
    async restartComponent(componentName) {
        try {
            console.log(`🔄 Restarting component: ${componentName}`);

            const componentInfo = this.componentRegistry.get(componentName);
            if (!componentInfo) {
                throw new Error(`Component ${componentName} not found`);
            }

            const component = componentInfo.instance;

            // Stop component if it has a stop method
            if (typeof component.stop === 'function') {
                await component.stop();
            }

            // Start component if it has a start method
            if (typeof component.start === 'function') {
                await component.start();
            }

            // Update component info
            componentInfo.state = ComponentState.RUNNING;
            componentInfo.restartCount++;
            componentInfo.lastError = null;

            this.emit('component:restarted', { componentName });
            this.metrics.componentRestarts++;

            console.log(`✅ Component ${componentName} restarted successfully`);

        } catch (error) {
            console.error(`❌ Failed to restart component ${componentName}:`, error);
            this.handleError(`Failed to restart component ${componentName}`, error);
        }
    }

    /**
     * Update component state
     * @param {string} componentName - Name of the component
     * @param {string} state - New state
     */
    updateComponentState(componentName, state) {
        const componentInfo = this.componentRegistry.get(componentName);
        if (componentInfo) {
            componentInfo.state = state;
            this.emit('component:state:changed', { componentName, state });
        }
    }

    /**
     * Get orchestrator status
     * @returns {Object} Status information
     */
    getStatus() {
        const uptime = this.startTime ? Date.now() - this.startTime : 0;
        
        return {
            state: this.state,
            uptime,
            startTime: this.startTime,
            components: Array.from(this.componentRegistry.entries()).map(([name, info]) => ({
                name,
                state: info.state,
                uptime: Date.now() - info.startTime,
                restartCount: info.restartCount,
                hasError: !!info.lastError
            })),
            metrics: {
                ...this.metrics,
                uptime
            },
            config: {
                maxConcurrentTasks: getConfig('orchestrator.maxConcurrentTasks'),
                taskTimeout: getConfig('orchestrator.taskTimeout'),
                healthCheckInterval: getConfig('orchestrator.healthCheckInterval'),
                eventBusEnabled: getConfig('orchestrator.eventBusEnabled')
            }
        };
    }

    /**
     * Get component status
     * @param {string} componentName - Name of the component
     * @returns {Object|null} Component status
     */
    getComponentStatus(componentName) {
        const componentInfo = this.componentRegistry.get(componentName);
        if (!componentInfo) {
            return null;
        }

        return {
            name: componentName,
            state: componentInfo.state,
            uptime: Date.now() - componentInfo.startTime,
            restartCount: componentInfo.restartCount,
            lastError: componentInfo.lastError?.message,
            hasHealthCheck: typeof componentInfo.instance.healthCheck === 'function'
        };
    }

    /**
     * Set orchestrator state
     * @param {string} newState - New state
     */
    setState(newState) {
        const oldState = this.state;
        this.state = newState;
        this.emit('state:changed', { oldState, newState });
    }

    /**
     * Setup error handling
     */
    setupErrorHandling() {
        this.on('error', (error) => {
            this.handleError('Orchestrator error', error);
        });

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            this.handleError('Uncaught exception', error);
        });

        process.on('unhandledRejection', (reason, promise) => {
            this.handleError('Unhandled rejection', new Error(reason));
        });
    }

    /**
     * Handle errors
     * @param {string} context - Error context
     * @param {Error} error - Error object
     */
    handleError(context, error) {
        this.errorCount++;
        this.lastError = error;
        this.metrics.errorsHandled++;

        console.error(`❌ ${context}:`, error);
        this.emit('error:handled', { context, error });

        // Implement error recovery strategies here
        if (this.errorCount > 10) {
            console.error('🚨 Too many errors, initiating graceful shutdown');
            this.shutdown();
        }
    }

    /**
     * Graceful shutdown
     * @returns {Promise<void>}
     */
    async shutdown() {
        if (this.shutdownInProgress) {
            return;
        }

        this.shutdownInProgress = true;
        this.setState(ComponentState.STOPPING);
        this.emit('orchestrator:shutdown:starting');

        console.log('🛑 Initiating graceful shutdown...');

        try {
            // Stop components in reverse order
            const componentNames = Array.from(this.componentRegistry.keys()).reverse();
            
            for (const componentName of componentNames) {
                await this.stopComponent(componentName);
            }

            this.setState(ComponentState.STOPPED);
            this.emit('orchestrator:shutdown:completed');
            
            console.log('✅ Graceful shutdown completed');

        } catch (error) {
            console.error('❌ Error during shutdown:', error);
            this.setState(ComponentState.ERROR);
        }
    }

    /**
     * Stop a component
     * @param {string} componentName - Name of the component to stop
     */
    async stopComponent(componentName) {
        try {
            const componentInfo = this.componentRegistry.get(componentName);
            if (!componentInfo) {
                return;
            }

            const component = componentInfo.instance;
            
            if (typeof component.stop === 'function') {
                await component.stop();
            }

            componentInfo.state = ComponentState.STOPPED;
            console.log(`✅ Component ${componentName} stopped`);

        } catch (error) {
            console.error(`❌ Error stopping component ${componentName}:`, error);
        }
    }
}

/**
 * Create and initialize orchestrator
 * @param {Object} config - Configuration options
 * @returns {Promise<Orchestrator>} Initialized orchestrator instance
 */
export async function createOrchestrator(config = {}) {
    const orchestrator = new Orchestrator(config);
    await orchestrator.initialize(config);
    return orchestrator;
}

export default Orchestrator;

