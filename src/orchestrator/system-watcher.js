/**
 * System Watcher - Main system monitoring component
 * Monitors system health, tracks active processes and workflows
 */

import EventEmitter from 'events';
import { logger } from '../utils/logger.js';
import { configManager } from '../utils/config-manager.js';

class SystemWatcher extends EventEmitter {
    constructor() {
        super();
        this.processes = new Map();
        this.workflows = new Map();
        this.metrics = {
            startTime: Date.now(),
            processCount: 0,
            workflowCount: 0,
            healthStatus: 'healthy'
        };
        this.healthCheckInterval = null;
        this.isRunning = false;
    }

    /**
     * Start the system watcher
     */
    async start() {
        if (this.isRunning) {
            logger.warn('System watcher is already running');
            return;
        }

        logger.info('Starting system watcher...');
        this.isRunning = true;
        
        // Start health check interval
        const healthCheckInterval = configManager.get('system.healthCheckInterval', 30000);
        this.healthCheckInterval = setInterval(() => {
            this.performHealthCheck();
        }, healthCheckInterval);

        this.emit('started');
        logger.info('System watcher started successfully');
    }

    /**
     * Stop the system watcher
     */
    async stop() {
        if (!this.isRunning) {
            logger.warn('System watcher is not running');
            return;
        }

        logger.info('Stopping system watcher...');
        this.isRunning = false;

        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

        this.emit('stopped');
        logger.info('System watcher stopped successfully');
    }

    /**
     * Register a new process
     */
    registerProcess(processId, processInfo) {
        this.processes.set(processId, {
            ...processInfo,
            registeredAt: Date.now(),
            status: 'active'
        });
        
        this.metrics.processCount = this.processes.size;
        this.emit('processRegistered', { processId, processInfo });
        
        logger.debug(`Process registered: ${processId}`, processInfo);
    }

    /**
     * Unregister a process
     */
    unregisterProcess(processId) {
        if (this.processes.has(processId)) {
            const processInfo = this.processes.get(processId);
            this.processes.delete(processId);
            
            this.metrics.processCount = this.processes.size;
            this.emit('processUnregistered', { processId, processInfo });
            
            logger.debug(`Process unregistered: ${processId}`);
        }
    }

    /**
     * Register a new workflow
     */
    registerWorkflow(workflowId, workflowInfo) {
        this.workflows.set(workflowId, {
            ...workflowInfo,
            registeredAt: Date.now(),
            status: 'active'
        });
        
        this.metrics.workflowCount = this.workflows.size;
        this.emit('workflowRegistered', { workflowId, workflowInfo });
        
        logger.debug(`Workflow registered: ${workflowId}`, workflowInfo);
    }

    /**
     * Update workflow status
     */
    updateWorkflowStatus(workflowId, status, metadata = {}) {
        if (this.workflows.has(workflowId)) {
            const workflow = this.workflows.get(workflowId);
            workflow.status = status;
            workflow.lastUpdated = Date.now();
            workflow.metadata = { ...workflow.metadata, ...metadata };
            
            this.emit('workflowStatusChanged', { workflowId, status, metadata });
            logger.debug(`Workflow status updated: ${workflowId} -> ${status}`);
        }
    }

    /**
     * Perform health check
     */
    performHealthCheck() {
        const healthData = {
            timestamp: Date.now(),
            uptime: Date.now() - this.metrics.startTime,
            processCount: this.processes.size,
            workflowCount: this.workflows.size,
            memoryUsage: process.memoryUsage(),
            cpuUsage: process.cpuUsage()
        };

        // Check for stale processes/workflows
        const staleThreshold = configManager.get('system.staleThreshold', 300000); // 5 minutes
        const now = Date.now();

        let staleProcesses = 0;
        let staleWorkflows = 0;

        for (const [id, process] of this.processes) {
            if (now - process.registeredAt > staleThreshold && process.status === 'active') {
                staleProcesses++;
            }
        }

        for (const [id, workflow] of this.workflows) {
            if (now - workflow.registeredAt > staleThreshold && workflow.status === 'active') {
                staleWorkflows++;
            }
        }

        // Determine health status
        let healthStatus = 'healthy';
        if (staleProcesses > 0 || staleWorkflows > 0) {
            healthStatus = 'warning';
        }
        if (staleProcesses > 5 || staleWorkflows > 10) {
            healthStatus = 'critical';
        }

        this.metrics.healthStatus = healthStatus;
        
        const healthCheckResult = {
            ...healthData,
            healthStatus,
            staleProcesses,
            staleWorkflows
        };

        this.emit('healthCheck', healthCheckResult);
        
        if (healthStatus !== 'healthy') {
            logger.warn('Health check warning', healthCheckResult);
        }
    }

    /**
     * Get current system metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            uptime: Date.now() - this.metrics.startTime,
            processes: Array.from(this.processes.entries()),
            workflows: Array.from(this.workflows.entries())
        };
    }

    /**
     * Get health check endpoint data
     */
    getHealthStatus() {
        return {
            status: this.metrics.healthStatus,
            uptime: Date.now() - this.metrics.startTime,
            processCount: this.processes.size,
            workflowCount: this.workflows.size,
            isRunning: this.isRunning,
            timestamp: Date.now()
        };
    }
}

export const systemWatcher = new SystemWatcher();
export default SystemWatcher;

