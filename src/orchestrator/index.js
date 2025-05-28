/**
 * @fileoverview System Orchestrator Module
 * @description Main entry point for the System Orchestrator components
 */

export { SystemOrchestrator as default } from './orchestrator.js';
export { SystemOrchestrator } from './orchestrator.js';
export { WorkflowManager, WorkflowState, StepState } from './workflow-manager.js';
export { ComponentCoordinator, MessageType, ComponentState } from './component-coordinator.js';
export { TaskScheduler, TaskState, TaskPriority } from './task-scheduler.js';
export { StateManager, StateType, StateOperation } from './state-manager.js';

/**
 * Create a new System Orchestrator instance with default configuration
 * @param {Object} config - Configuration options
 * @returns {SystemOrchestrator} Orchestrator instance
 */
export function createOrchestrator(config = {}) {
    const { SystemOrchestrator } = require('./orchestrator.js');
    return new SystemOrchestrator(config);
}

/**
 * Default configuration for the System Orchestrator
 */
export const defaultConfig = {
    maxConcurrentWorkflows: 10,
    maxConcurrentTasks: 50,
    healthCheckInterval: 30000,
    componentTimeout: 60000,
    enableMonitoring: true,
    enableErrorRecovery: true,
    retryAttempts: 3,
    retryDelay: 1000,
    
    // Workflow Manager config
    workflow: {
        stepTimeout: 300000,
        workflowTimeout: 3600000,
        enableParallelExecution: true,
        enableRetry: true,
        maxRetryAttempts: 3,
        retryDelay: 5000
    },
    
    // Component Coordinator config
    components: {
        messageTimeout: 30000,
        heartbeatInterval: 15000,
        maxRetryAttempts: 3,
        retryDelay: 1000,
        enableHeartbeat: true,
        enableMessageQueue: true,
        maxQueueSize: 1000
    },
    
    // Task Scheduler config
    tasks: {
        taskTimeout: 300000,
        schedulingInterval: 1000,
        enablePriorityScheduling: true,
        enableDependencyResolution: true,
        maxRetryAttempts: 3,
        retryDelay: 5000,
        deadlockDetectionInterval: 30000
    },
    
    // State Manager config
    state: {
        enablePersistence: true,
        enableVersioning: true,
        enableBackup: true,
        persistenceInterval: 30000,
        maxVersions: 10,
        backupInterval: 300000,
        compressionEnabled: true,
        encryptionEnabled: false,
        storageType: 'memory',
        storagePath: './data/state'
    }
};

/**
 * Orchestrator factory with predefined configurations
 */
export const OrchestratorFactory = {
    /**
     * Create a development orchestrator with relaxed settings
     * @param {Object} config - Additional configuration
     * @returns {SystemOrchestrator} Orchestrator instance
     */
    development(config = {}) {
        return new SystemOrchestrator({
            ...defaultConfig,
            healthCheckInterval: 60000,
            enableErrorRecovery: false,
            state: {
                ...defaultConfig.state,
                enablePersistence: false,
                enableBackup: false
            },
            ...config
        });
    },

    /**
     * Create a production orchestrator with robust settings
     * @param {Object} config - Additional configuration
     * @returns {SystemOrchestrator} Orchestrator instance
     */
    production(config = {}) {
        return new SystemOrchestrator({
            ...defaultConfig,
            maxConcurrentWorkflows: 50,
            maxConcurrentTasks: 200,
            healthCheckInterval: 15000,
            enableMonitoring: true,
            enableErrorRecovery: true,
            state: {
                ...defaultConfig.state,
                enablePersistence: true,
                enableBackup: true,
                storageType: 'database'
            },
            ...config
        });
    },

    /**
     * Create a testing orchestrator with minimal settings
     * @param {Object} config - Additional configuration
     * @returns {SystemOrchestrator} Orchestrator instance
     */
    testing(config = {}) {
        return new SystemOrchestrator({
            ...defaultConfig,
            maxConcurrentWorkflows: 5,
            maxConcurrentTasks: 10,
            healthCheckInterval: 5000,
            enableMonitoring: false,
            enableErrorRecovery: false,
            state: {
                ...defaultConfig.state,
                enablePersistence: false,
                enableVersioning: false,
                enableBackup: false
            },
            ...config
        });
    }
};

/**
 * Utility functions for orchestrator management
 */
export const OrchestratorUtils = {
    /**
     * Validate orchestrator configuration
     * @param {Object} config - Configuration to validate
     * @returns {Object} Validation result
     */
    validateConfig(config) {
        const errors = [];
        const warnings = [];

        // Validate required fields
        if (config.maxConcurrentWorkflows && config.maxConcurrentWorkflows < 1) {
            errors.push('maxConcurrentWorkflows must be at least 1');
        }

        if (config.maxConcurrentTasks && config.maxConcurrentTasks < 1) {
            errors.push('maxConcurrentTasks must be at least 1');
        }

        // Validate intervals
        if (config.healthCheckInterval && config.healthCheckInterval < 1000) {
            warnings.push('healthCheckInterval less than 1 second may impact performance');
        }

        // Validate state configuration
        if (config.state) {
            if (config.state.storageType && !['memory', 'file', 'database'].includes(config.state.storageType)) {
                errors.push('Invalid storageType. Must be memory, file, or database');
            }

            if (config.state.maxVersions && config.state.maxVersions < 1) {
                errors.push('maxVersions must be at least 1');
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    },

    /**
     * Merge configurations with defaults
     * @param {Object} userConfig - User configuration
     * @param {Object} baseConfig - Base configuration
     * @returns {Object} Merged configuration
     */
    mergeConfig(userConfig, baseConfig = defaultConfig) {
        return {
            ...baseConfig,
            ...userConfig,
            workflow: {
                ...baseConfig.workflow,
                ...(userConfig.workflow || {})
            },
            components: {
                ...baseConfig.components,
                ...(userConfig.components || {})
            },
            tasks: {
                ...baseConfig.tasks,
                ...(userConfig.tasks || {})
            },
            state: {
                ...baseConfig.state,
                ...(userConfig.state || {})
            }
        };
    },

    /**
     * Create orchestrator health check
     * @param {SystemOrchestrator} orchestrator - Orchestrator instance
     * @returns {Function} Health check function
     */
    createHealthCheck(orchestrator) {
        return async () => {
            try {
                const status = orchestrator.getStatus();
                
                return {
                    healthy: status.healthy,
                    uptime: status.uptime,
                    components: status.components,
                    metrics: status.metrics,
                    timestamp: new Date().toISOString()
                };
            } catch (error) {
                return {
                    healthy: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                };
            }
        };
    }
};

/**
 * Event constants for orchestrator events
 */
export const OrchestratorEvents = {
    // System events
    INITIALIZED: 'initialized',
    SHUTDOWN: 'shutdown',
    ERROR: 'error',
    HEALTH_CHECK_PASSED: 'healthCheckPassed',
    HEALTH_CHECK_FAILED: 'healthCheckFailed',
    ERROR_RECOVERED: 'errorRecovered',
    
    // Workflow events
    WORKFLOW_CREATED: 'workflowCreated',
    WORKFLOW_STARTED: 'workflowStarted',
    WORKFLOW_COMPLETED: 'workflowCompleted',
    WORKFLOW_FAILED: 'workflowFailed',
    WORKFLOW_PAUSED: 'workflowPaused',
    WORKFLOW_RESUMED: 'workflowResumed',
    WORKFLOW_CANCELLED: 'workflowCancelled',
    
    // Task events
    TASK_SCHEDULED: 'taskScheduled',
    TASK_QUEUED: 'taskQueued',
    TASK_STARTED: 'taskStarted',
    TASK_COMPLETED: 'taskCompleted',
    TASK_FAILED: 'taskFailed',
    TASK_CANCELLED: 'taskCancelled',
    
    // Component events
    COMPONENT_CONNECTED: 'componentConnected',
    COMPONENT_DISCONNECTED: 'componentDisconnected',
    COMPONENT_ERROR: 'componentError',
    
    // State events
    STATE_CHANGED: 'stateChanged',
    STATE_DELETED: 'stateDeleted',
    SNAPSHOT_CREATED: 'snapshotCreated',
    SNAPSHOT_RESTORED: 'snapshotRestored'
};

