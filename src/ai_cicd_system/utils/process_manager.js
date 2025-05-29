/**
 * Process Manager
 * 
 * Manages process lifecycle, monitoring, and cleanup for long-running
 * validation and orchestration processes.
 */

import { EventEmitter } from 'events';

export class ProcessManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            maxProcesses: options.maxProcesses || 50,
            processTimeout: options.processTimeout || 600000, // 10 minutes
            cleanupInterval: options.cleanupInterval || 60000, // 1 minute
            heartbeatInterval: options.heartbeatInterval || 30000, // 30 seconds
            gracefulShutdownTimeout: options.gracefulShutdownTimeout || 30000, // 30 seconds
            ...options
        };

        this.processes = new Map();
        this.processGroups = new Map();
        this.cleanupTimer = null;
        this.heartbeatTimer = null;
        this.isShuttingDown = false;

        this.setupCleanupHandlers();
    }

    /**
     * Initialize the Process Manager
     * @returns {Promise<boolean>} True if initialization successful
     */
    async initialize() {
        try {
            this.startCleanupTimer();
            this.startHeartbeatTimer();
            this.emit('initialized');
            return true;
        } catch (error) {
            this.emit('error', { type: 'initialization', error });
            throw new Error(`Failed to initialize Process Manager: ${error.message}`);
        }
    }

    /**
     * Create and register a new process
     * @param {string} processId - Unique process identifier
     * @param {Object} processConfig - Process configuration
     * @returns {Promise<Object>} Process information
     */
    async createProcess(processId, processConfig) {
        try {
            if (this.processes.has(processId)) {
                throw new Error(`Process ${processId} already exists`);
            }

            if (this.processes.size >= this.config.maxProcesses) {
                throw new Error(`Maximum process limit (${this.config.maxProcesses}) reached`);
            }

            const process = {
                id: processId,
                config: processConfig,
                status: 'created',
                createdAt: new Date().toISOString(),
                startedAt: null,
                completedAt: null,
                lastHeartbeat: new Date().toISOString(),
                timeout: processConfig.timeout || this.config.processTimeout,
                group: processConfig.group || 'default',
                metadata: processConfig.metadata || {},
                resources: {
                    cpu: 0,
                    memory: 0,
                    handles: 0
                },
                events: [],
                children: new Set(),
                parent: processConfig.parent || null
            };

            this.processes.set(processId, process);
            
            // Add to process group
            this.addToGroup(process.group, processId);

            // Set up parent-child relationship
            if (process.parent) {
                const parentProcess = this.processes.get(process.parent);
                if (parentProcess) {
                    parentProcess.children.add(processId);
                }
            }

            this.emit('processCreated', process);
            return process;

        } catch (error) {
            this.emit('error', { type: 'processCreation', error, processId });
            throw error;
        }
    }

    /**
     * Start a process
     * @param {string} processId - Process identifier
     * @param {Function} processFunction - Function to execute
     * @param {Array} args - Arguments for the process function
     * @returns {Promise<any>} Process result
     */
    async startProcess(processId, processFunction, args = []) {
        try {
            const process = this.processes.get(processId);
            if (!process) {
                throw new Error(`Process ${processId} not found`);
            }

            if (process.status !== 'created') {
                throw new Error(`Process ${processId} is not in created state`);
            }

            process.status = 'starting';
            process.startedAt = new Date().toISOString();
            this.addProcessEvent(processId, 'starting', 'Process is starting');

            this.emit('processStarting', process);

            // Set up timeout
            const timeoutHandle = setTimeout(() => {
                this.timeoutProcess(processId);
            }, process.timeout);

            try {
                process.status = 'running';
                this.addProcessEvent(processId, 'running', 'Process is running');
                this.emit('processRunning', process);

                // Execute the process function
                const result = await processFunction(...args);

                // Clear timeout
                clearTimeout(timeoutHandle);

                // Mark as completed
                process.status = 'completed';
                process.completedAt = new Date().toISOString();
                process.result = result;
                this.addProcessEvent(processId, 'completed', 'Process completed successfully');

                this.emit('processCompleted', process);
                return result;

            } catch (error) {
                clearTimeout(timeoutHandle);
                
                process.status = 'failed';
                process.completedAt = new Date().toISOString();
                process.error = error.message;
                this.addProcessEvent(processId, 'failed', `Process failed: ${error.message}`);

                this.emit('processFailed', process);
                throw error;
            }

        } catch (error) {
            this.emit('error', { type: 'processStart', error, processId });
            throw error;
        }
    }

    /**
     * Stop a running process
     * @param {string} processId - Process identifier
     * @param {boolean} graceful - Whether to stop gracefully
     * @returns {Promise<boolean>} True if stopped successfully
     */
    async stopProcess(processId, graceful = true) {
        try {
            const process = this.processes.get(processId);
            if (!process) {
                throw new Error(`Process ${processId} not found`);
            }

            if (!['running', 'starting'].includes(process.status)) {
                return true; // Already stopped
            }

            process.status = 'stopping';
            this.addProcessEvent(processId, 'stopping', graceful ? 'Graceful stop requested' : 'Force stop requested');

            this.emit('processStopping', process);

            if (graceful) {
                // Attempt graceful shutdown
                await this.gracefulStop(processId);
            } else {
                // Force stop
                await this.forceStop(processId);
            }

            process.status = 'stopped';
            process.completedAt = new Date().toISOString();
            this.addProcessEvent(processId, 'stopped', 'Process stopped');

            this.emit('processStopped', process);
            return true;

        } catch (error) {
            this.emit('error', { type: 'processStop', error, processId });
            throw error;
        }
    }

    /**
     * Gracefully stop a process
     * @param {string} processId - Process identifier
     * @returns {Promise<void>}
     */
    async gracefulStop(processId) {
        const process = this.processes.get(processId);
        
        // Emit stop signal
        this.emit('processStopSignal', { processId, signal: 'SIGTERM' });
        
        // Wait for graceful shutdown or timeout
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.forceStop(processId);
                resolve();
            }, this.config.gracefulShutdownTimeout);

            const checkStopped = () => {
                const currentProcess = this.processes.get(processId);
                if (!currentProcess || currentProcess.status === 'stopped') {
                    clearTimeout(timeout);
                    resolve();
                } else {
                    setTimeout(checkStopped, 1000);
                }
            };

            checkStopped();
        });
    }

    /**
     * Force stop a process
     * @param {string} processId - Process identifier
     * @returns {Promise<void>}
     */
    async forceStop(processId) {
        const process = this.processes.get(processId);
        
        // Emit force stop signal
        this.emit('processStopSignal', { processId, signal: 'SIGKILL' });
        
        // Stop all child processes first
        for (const childId of process.children) {
            await this.stopProcess(childId, false);
        }
        
        this.addProcessEvent(processId, 'force_stopped', 'Process force stopped');
    }

    /**
     * Handle process timeout
     * @param {string} processId - Process identifier
     */
    timeoutProcess(processId) {
        const process = this.processes.get(processId);
        if (!process || !['running', 'starting'].includes(process.status)) {
            return;
        }

        process.status = 'timeout';
        process.completedAt = new Date().toISOString();
        this.addProcessEvent(processId, 'timeout', 'Process timed out');

        this.emit('processTimeout', process);
        
        // Force stop the process
        this.forceStop(processId);
    }

    /**
     * Update process heartbeat
     * @param {string} processId - Process identifier
     * @param {Object} metadata - Optional metadata update
     */
    updateHeartbeat(processId, metadata = {}) {
        const process = this.processes.get(processId);
        if (!process) {
            return;
        }

        process.lastHeartbeat = new Date().toISOString();
        
        if (Object.keys(metadata).length > 0) {
            process.metadata = { ...process.metadata, ...metadata };
        }

        this.emit('processHeartbeat', { processId, timestamp: process.lastHeartbeat });
    }

    /**
     * Update process resource usage
     * @param {string} processId - Process identifier
     * @param {Object} resources - Resource usage data
     */
    updateResourceUsage(processId, resources) {
        const process = this.processes.get(processId);
        if (!process) {
            return;
        }

        process.resources = { ...process.resources, ...resources };
        this.emit('processResourceUpdate', { processId, resources: process.resources });
    }

    /**
     * Add event to process history
     * @param {string} processId - Process identifier
     * @param {string} type - Event type
     * @param {string} message - Event message
     * @param {Object} data - Additional event data
     */
    addProcessEvent(processId, type, message, data = {}) {
        const process = this.processes.get(processId);
        if (!process) {
            return;
        }

        const event = {
            type,
            message,
            timestamp: new Date().toISOString(),
            data
        };

        process.events.push(event);
        
        // Keep only last 100 events
        if (process.events.length > 100) {
            process.events = process.events.slice(-100);
        }

        this.emit('processEvent', { processId, event });
    }

    /**
     * Get process information
     * @param {string} processId - Process identifier
     * @returns {Object} Process information
     */
    getProcess(processId) {
        const process = this.processes.get(processId);
        if (!process) {
            throw new Error(`Process ${processId} not found`);
        }
        return { ...process };
    }

    /**
     * List processes with optional filtering
     * @param {Object} filters - Filter criteria
     * @returns {Array} Array of processes
     */
    listProcesses(filters = {}) {
        let processes = Array.from(this.processes.values());

        if (filters.status) {
            processes = processes.filter(p => p.status === filters.status);
        }

        if (filters.group) {
            processes = processes.filter(p => p.group === filters.group);
        }

        if (filters.parent) {
            processes = processes.filter(p => p.parent === filters.parent);
        }

        if (filters.createdAfter) {
            const afterDate = new Date(filters.createdAfter);
            processes = processes.filter(p => new Date(p.createdAt) > afterDate);
        }

        return processes.map(p => ({ ...p }));
    }

    /**
     * Get process group information
     * @param {string} groupName - Group name
     * @returns {Object} Group information
     */
    getProcessGroup(groupName) {
        const processIds = this.processGroups.get(groupName) || new Set();
        const processes = Array.from(processIds).map(id => this.processes.get(id)).filter(Boolean);
        
        return {
            name: groupName,
            processCount: processes.length,
            processes: processes.map(p => ({ ...p })),
            status: this.getGroupStatus(processes)
        };
    }

    /**
     * Get status summary for a group of processes
     * @param {Array} processes - Array of processes
     * @returns {Object} Status summary
     */
    getGroupStatus(processes) {
        const statusCounts = {};
        processes.forEach(p => {
            statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
        });

        return {
            total: processes.length,
            statusCounts,
            hasRunning: processes.some(p => p.status === 'running'),
            hasErrors: processes.some(p => p.status === 'failed' || p.status === 'timeout'),
            allCompleted: processes.every(p => ['completed', 'stopped', 'failed', 'timeout'].includes(p.status))
        };
    }

    /**
     * Stop all processes in a group
     * @param {string} groupName - Group name
     * @param {boolean} graceful - Whether to stop gracefully
     * @returns {Promise<boolean>} True if all stopped successfully
     */
    async stopProcessGroup(groupName, graceful = true) {
        const group = this.getProcessGroup(groupName);
        const runningProcesses = group.processes.filter(p => ['running', 'starting'].includes(p.status));

        await Promise.all(
            runningProcesses.map(p => this.stopProcess(p.id, graceful))
        );

        return true;
    }

    /**
     * Add process to group
     * @param {string} groupName - Group name
     * @param {string} processId - Process identifier
     */
    addToGroup(groupName, processId) {
        if (!this.processGroups.has(groupName)) {
            this.processGroups.set(groupName, new Set());
        }
        this.processGroups.get(groupName).add(processId);
    }

    /**
     * Remove process from group
     * @param {string} groupName - Group name
     * @param {string} processId - Process identifier
     */
    removeFromGroup(groupName, processId) {
        const group = this.processGroups.get(groupName);
        if (group) {
            group.delete(processId);
            if (group.size === 0) {
                this.processGroups.delete(groupName);
            }
        }
    }

    /**
     * Start cleanup timer for completed processes
     */
    startCleanupTimer() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }

        this.cleanupTimer = setInterval(() => {
            this.cleanupCompletedProcesses();
        }, this.config.cleanupInterval);
    }

    /**
     * Start heartbeat monitoring timer
     */
    startHeartbeatTimer() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }

        this.heartbeatTimer = setInterval(() => {
            this.checkHeartbeats();
        }, this.config.heartbeatInterval);
    }

    /**
     * Cleanup completed processes older than retention period
     */
    cleanupCompletedProcesses() {
        const retentionPeriod = 60 * 60 * 1000; // 1 hour
        const cutoffTime = new Date(Date.now() - retentionPeriod);

        for (const [processId, process] of this.processes.entries()) {
            if (['completed', 'failed', 'stopped', 'timeout'].includes(process.status)) {
                const completedTime = new Date(process.completedAt);
                if (completedTime < cutoffTime) {
                    this.removeProcess(processId);
                }
            }
        }
    }

    /**
     * Check process heartbeats and mark stale processes
     */
    checkHeartbeats() {
        const staleThreshold = 5 * 60 * 1000; // 5 minutes
        const staleTime = new Date(Date.now() - staleThreshold);

        for (const [processId, process] of this.processes.entries()) {
            if (process.status === 'running') {
                const lastHeartbeat = new Date(process.lastHeartbeat);
                if (lastHeartbeat < staleTime) {
                    this.addProcessEvent(processId, 'stale', 'Process appears to be stale (no heartbeat)');
                    this.emit('processStale', process);
                }
            }
        }
    }

    /**
     * Remove process from tracking
     * @param {string} processId - Process identifier
     */
    removeProcess(processId) {
        const process = this.processes.get(processId);
        if (!process) {
            return;
        }

        // Remove from group
        this.removeFromGroup(process.group, processId);

        // Remove from parent's children
        if (process.parent) {
            const parentProcess = this.processes.get(process.parent);
            if (parentProcess) {
                parentProcess.children.delete(processId);
            }
        }

        // Remove the process
        this.processes.delete(processId);
        this.emit('processRemoved', { processId });
    }

    /**
     * Get system statistics
     * @returns {Object} System statistics
     */
    getStatistics() {
        const processes = Array.from(this.processes.values());
        const statusCounts = {};
        
        processes.forEach(p => {
            statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
        });

        return {
            totalProcesses: processes.length,
            maxProcesses: this.config.maxProcesses,
            statusCounts,
            groupCount: this.processGroups.size,
            resourceUsage: this.calculateTotalResourceUsage(processes),
            uptime: Date.now() - (this.startTime || Date.now())
        };
    }

    /**
     * Calculate total resource usage across all processes
     * @param {Array} processes - Array of processes
     * @returns {Object} Total resource usage
     */
    calculateTotalResourceUsage(processes) {
        return processes.reduce((total, process) => {
            return {
                cpu: total.cpu + (process.resources.cpu || 0),
                memory: total.memory + (process.resources.memory || 0),
                handles: total.handles + (process.resources.handles || 0)
            };
        }, { cpu: 0, memory: 0, handles: 0 });
    }

    /**
     * Setup cleanup handlers for graceful shutdown
     */
    setupCleanupHandlers() {
        const cleanup = async () => {
            if (this.isShuttingDown) {
                return;
            }
            
            this.isShuttingDown = true;
            await this.shutdown();
            process.exit(0);
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
        process.on('uncaughtException', cleanup);
    }

    /**
     * Shutdown the process manager
     * @returns {Promise<void>}
     */
    async shutdown() {
        try {
            this.emit('shutdown');

            // Stop timers
            if (this.cleanupTimer) {
                clearInterval(this.cleanupTimer);
                this.cleanupTimer = null;
            }

            if (this.heartbeatTimer) {
                clearInterval(this.heartbeatTimer);
                this.heartbeatTimer = null;
            }

            // Stop all running processes
            const runningProcesses = this.listProcesses({ status: 'running' });
            await Promise.all(
                runningProcesses.map(p => this.stopProcess(p.id, true))
            );

            this.emit('shutdownComplete');
        } catch (error) {
            this.emit('error', { type: 'shutdown', error });
            throw error;
        }
    }
}

export default ProcessManager;

