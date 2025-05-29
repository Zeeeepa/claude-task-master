/**
 * Agent Manager
 * 
 * Manages the lifecycle, health monitoring, and coordination of all AI agents.
 * Provides centralized control for agent operations and resource management.
 */

import { EventEmitter } from 'events';
import { SimpleLogger } from '../utils/simple_logger.js';
import { AGENTAPI_CONFIG } from '../config/agentapi_config.js';
import AgentAPIClient from './agentapi_client.js';
import AgentRouter from './agent_router.js';

export class AgentManager extends EventEmitter {
    constructor(config = {}, healthMonitor = null) {
        super();
        
        this.config = {
            ...AGENTAPI_CONFIG,
            ...config
        };
        
        this.logger = new SimpleLogger('AgentManager');
        this.healthMonitor = healthMonitor;
        this.agentClient = new AgentAPIClient(this.config);
        this.agentRouter = new AgentRouter(this.config.routing_config, this.healthMonitor);
        
        // Agent state management
        this.agentStates = new Map();
        this.taskQueue = [];
        this.activeTasks = new Map();
        this.wsl2Manager = new WSL2Manager(this.config.wsl2_config);
        
        // Performance tracking
        this.metrics = {
            totalTasks: 0,
            successfulTasks: 0,
            failedTasks: 0,
            averageProcessingTime: 0,
            agentUtilization: new Map()
        };
        
        // Initialize agent states
        this._initializeAgentStates();
        
        // Start background processes
        this._startBackgroundProcesses();
    }

    /**
     * Initialize agent states
     */
    _initializeAgentStates() {
        for (const [agentType, agentConfig] of Object.entries(this.config.agents)) {
            this.agentStates.set(agentType, {
                type: agentType,
                status: 'unknown',
                healthy: false,
                activeTasks: 0,
                maxConcurrentTasks: agentConfig.max_concurrent_tasks,
                lastHealthCheck: 0,
                lastActivity: 0,
                totalProcessed: 0,
                errors: [],
                config: agentConfig
            });
            
            this.metrics.agentUtilization.set(agentType, {
                totalRequests: 0,
                successfulRequests: 0,
                failedRequests: 0,
                averageResponseTime: 0,
                peakLoad: 0,
                currentLoad: 0
            });
        }
    }

    /**
     * Start background processes
     */
    _startBackgroundProcesses() {
        // Health monitoring
        setInterval(() => {
            this._performHealthChecks();
        }, 30000); // Every 30 seconds

        // Metrics collection
        setInterval(() => {
            this._collectMetrics();
        }, 60000); // Every minute

        // Task queue processing
        setInterval(() => {
            this._processTaskQueue();
        }, 5000); // Every 5 seconds

        // WSL2 cleanup
        setInterval(() => {
            this.wsl2Manager.cleanup();
        }, this.config.wsl2_config.cleanup_interval);
    }

    /**
     * Execute a task using the best available agent
     */
    async executeTask(task) {
        const taskId = task.task_id || `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        task.task_id = taskId;
        
        this.logger.info(`Executing task: ${taskId}`, {
            taskType: task.task_type,
            requirements: task.requirements
        });

        const startTime = Date.now();
        
        try {
            // Update metrics
            this.metrics.totalTasks++;
            
            // Select best agent
            const selectedAgent = await this.agentRouter.selectAgent(task);
            
            // Check agent availability
            const agentState = this.agentStates.get(selectedAgent.type);
            if (agentState.activeTasks >= agentState.maxConcurrentTasks) {
                // Queue the task if agent is at capacity
                return await this._queueTask(task, selectedAgent.type);
            }

            // Execute task
            const result = await this._executeTaskWithAgent(task, selectedAgent.type);
            
            // Update metrics and state
            const processingTime = Date.now() - startTime;
            this._updateTaskMetrics('success', processingTime, selectedAgent.type);
            this.agentRouter.recordSuccess(selectedAgent.type, processingTime);
            
            this.emit('taskCompleted', {
                taskId,
                agentType: selectedAgent.type,
                result,
                processingTime
            });

            return result;

        } catch (error) {
            const processingTime = Date.now() - startTime;
            this._updateTaskMetrics('failure', processingTime);
            
            this.logger.error(`Task execution failed: ${taskId}`, error);
            
            this.emit('taskFailed', {
                taskId,
                error: error.message,
                processingTime
            });

            throw error;
        }
    }

    /**
     * Execute task with specific agent
     */
    async _executeTaskWithAgent(task, agentType) {
        const agentState = this.agentStates.get(agentType);
        
        // Update agent state
        agentState.activeTasks++;
        agentState.lastActivity = Date.now();
        this.activeTasks.set(task.task_id, {
            taskId: task.task_id,
            agentType,
            startTime: Date.now(),
            task
        });

        try {
            // Handle WSL2 instance creation for Claude Code
            if (agentType === 'claude-code' && agentState.config.wsl2_instance) {
                const wsl2Instance = await this.wsl2Manager.getOrCreateInstance(task.task_id);
                task.context = {
                    ...task.context,
                    wsl2_instance: wsl2Instance
                };
            }

            // Execute task through agent client
            const result = await this.agentClient.routeTask(task, agentType);
            
            // Update agent state
            agentState.totalProcessed++;
            
            return result;

        } finally {
            // Cleanup
            agentState.activeTasks = Math.max(0, agentState.activeTasks - 1);
            this.activeTasks.delete(task.task_id);
            
            // Update utilization metrics
            const utilization = this.metrics.agentUtilization.get(agentType);
            utilization.currentLoad = agentState.activeTasks;
            utilization.peakLoad = Math.max(utilization.peakLoad, agentState.activeTasks);
        }
    }

    /**
     * Queue task for later execution
     */
    async _queueTask(task, preferredAgentType = null) {
        if (this.taskQueue.length >= this.config.queue_config.max_queue_size) {
            throw new Error('Task queue is full');
        }

        const queuedTask = {
            ...task,
            queuedAt: Date.now(),
            preferredAgentType,
            priority: task.priority || 'normal'
        };

        // Insert task based on priority
        const insertIndex = this._findQueueInsertIndex(queuedTask);
        this.taskQueue.splice(insertIndex, 0, queuedTask);

        this.logger.info(`Task queued: ${task.task_id}`, {
            queuePosition: insertIndex,
            queueSize: this.taskQueue.length,
            preferredAgent: preferredAgentType
        });

        this.emit('taskQueued', {
            taskId: task.task_id,
            queuePosition: insertIndex,
            queueSize: this.taskQueue.length
        });

        return {
            success: true,
            queued: true,
            taskId: task.task_id,
            queuePosition: insertIndex,
            estimatedWaitTime: this._estimateWaitTime(insertIndex)
        };
    }

    /**
     * Find appropriate queue insert index based on priority
     */
    _findQueueInsertIndex(task) {
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        const taskPriority = priorityOrder[task.priority] || 1;

        for (let i = 0; i < this.taskQueue.length; i++) {
            const queuedTaskPriority = priorityOrder[this.taskQueue[i].priority] || 1;
            if (taskPriority < queuedTaskPriority) {
                return i;
            }
        }

        return this.taskQueue.length;
    }

    /**
     * Process queued tasks
     */
    async _processTaskQueue() {
        if (this.taskQueue.length === 0) return;

        const availableAgents = this._getAvailableAgents();
        if (availableAgents.length === 0) return;

        const tasksToProcess = Math.min(this.taskQueue.length, availableAgents.length);
        
        for (let i = 0; i < tasksToProcess; i++) {
            const task = this.taskQueue.shift();
            
            // Check if task has expired
            if (Date.now() - task.queuedAt > this.config.queue_config.queue_timeout) {
                this.logger.warn(`Task expired in queue: ${task.task_id}`);
                this.emit('taskExpired', { taskId: task.task_id });
                continue;
            }

            // Execute task asynchronously
            this.executeTask(task).catch(error => {
                this.logger.error(`Queued task execution failed: ${task.task_id}`, error);
            });
        }
    }

    /**
     * Get available agents
     */
    _getAvailableAgents() {
        const availableAgents = [];
        
        for (const [agentType, agentState] of this.agentStates.entries()) {
            if (agentState.healthy && 
                agentState.activeTasks < agentState.maxConcurrentTasks) {
                availableAgents.push(agentType);
            }
        }

        return availableAgents;
    }

    /**
     * Estimate wait time for queued task
     */
    _estimateWaitTime(queuePosition) {
        if (queuePosition === 0) return 0;

        // Simple estimation based on average processing time and queue position
        const avgProcessingTime = this.metrics.averageProcessingTime || 30000; // 30 seconds default
        const availableAgents = this._getAvailableAgents().length || 1;
        
        return Math.ceil((queuePosition * avgProcessingTime) / availableAgents);
    }

    /**
     * Perform health checks on all agents
     */
    async _performHealthChecks() {
        this.logger.debug('Performing health checks on all agents');

        for (const [agentType, agentState] of this.agentStates.entries()) {
            try {
                const healthResult = await this.agentClient.healthCheck(agentType);
                
                agentState.healthy = healthResult.healthy;
                agentState.status = healthResult.healthy ? 'healthy' : 'unhealthy';
                agentState.lastHealthCheck = Date.now();
                
                if (!healthResult.healthy) {
                    agentState.errors.push({
                        timestamp: Date.now(),
                        error: healthResult.error || 'Health check failed'
                    });
                    
                    // Keep only last 10 errors
                    if (agentState.errors.length > 10) {
                        agentState.errors = agentState.errors.slice(-10);
                    }
                }

                this.emit('agentHealthUpdate', {
                    agentType,
                    healthy: healthResult.healthy,
                    status: agentState.status
                });

            } catch (error) {
                this.logger.error(`Health check failed for agent ${agentType}:`, error);
                
                agentState.healthy = false;
                agentState.status = 'error';
                agentState.lastHealthCheck = Date.now();
                agentState.errors.push({
                    timestamp: Date.now(),
                    error: error.message
                });
            }
        }
    }

    /**
     * Collect performance metrics
     */
    _collectMetrics() {
        this.logger.debug('Collecting performance metrics');

        // Update agent utilization metrics
        for (const [agentType, agentState] of this.agentStates.entries()) {
            const utilization = this.metrics.agentUtilization.get(agentType);
            utilization.currentLoad = agentState.activeTasks;
        }

        // Emit metrics event
        this.emit('metricsCollected', {
            timestamp: Date.now(),
            metrics: this.getMetrics()
        });
    }

    /**
     * Update task metrics
     */
    _updateTaskMetrics(result, processingTime, agentType = null) {
        if (result === 'success') {
            this.metrics.successfulTasks++;
        } else {
            this.metrics.failedTasks++;
        }

        // Update average processing time using exponential moving average
        const alpha = 0.1;
        if (this.metrics.averageProcessingTime === 0) {
            this.metrics.averageProcessingTime = processingTime;
        } else {
            this.metrics.averageProcessingTime = 
                alpha * processingTime + (1 - alpha) * this.metrics.averageProcessingTime;
        }

        // Update agent-specific metrics
        if (agentType) {
            const utilization = this.metrics.agentUtilization.get(agentType);
            if (utilization) {
                utilization.totalRequests++;
                
                if (result === 'success') {
                    utilization.successfulRequests++;
                } else {
                    utilization.failedRequests++;
                }

                // Update average response time
                if (utilization.averageResponseTime === 0) {
                    utilization.averageResponseTime = processingTime;
                } else {
                    utilization.averageResponseTime = 
                        alpha * processingTime + (1 - alpha) * utilization.averageResponseTime;
                }
            }
        }
    }

    /**
     * Get agent status
     */
    getAgentStatus(agentType) {
        const agentState = this.agentStates.get(agentType);
        if (!agentState) {
            throw new Error(`Unknown agent type: ${agentType}`);
        }

        const utilization = this.metrics.agentUtilization.get(agentType);
        
        return {
            ...agentState,
            utilization: {
                ...utilization,
                utilizationRate: agentState.maxConcurrentTasks > 0 ? 
                    agentState.activeTasks / agentState.maxConcurrentTasks : 0
            }
        };
    }

    /**
     * Get all agents status
     */
    getAllAgentsStatus() {
        const statuses = {};
        
        for (const agentType of this.agentStates.keys()) {
            statuses[agentType] = this.getAgentStatus(agentType);
        }

        return statuses;
    }

    /**
     * Get system metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            queueSize: this.taskQueue.length,
            activeTasks: this.activeTasks.size,
            agentStates: Object.fromEntries(this.agentStates),
            agentUtilization: Object.fromEntries(this.metrics.agentUtilization),
            successRate: this.metrics.totalTasks > 0 ? 
                this.metrics.successfulTasks / this.metrics.totalTasks : 0,
            failureRate: this.metrics.totalTasks > 0 ? 
                this.metrics.failedTasks / this.metrics.totalTasks : 0
        };
    }

    /**
     * Get queue status
     */
    getQueueStatus() {
        return {
            size: this.taskQueue.length,
            maxSize: this.config.queue_config.max_queue_size,
            tasks: this.taskQueue.map(task => ({
                taskId: task.task_id,
                taskType: task.task_type,
                priority: task.priority,
                queuedAt: task.queuedAt,
                waitTime: Date.now() - task.queuedAt,
                preferredAgent: task.preferredAgentType
            }))
        };
    }

    /**
     * Cancel queued task
     */
    cancelQueuedTask(taskId) {
        const index = this.taskQueue.findIndex(task => task.task_id === taskId);
        
        if (index === -1) {
            throw new Error(`Task ${taskId} not found in queue`);
        }

        const cancelledTask = this.taskQueue.splice(index, 1)[0];
        
        this.emit('taskCancelled', {
            taskId,
            queuePosition: index
        });

        return cancelledTask;
    }

    /**
     * Force restart agent
     */
    async restartAgent(agentType) {
        const agentState = this.agentStates.get(agentType);
        if (!agentState) {
            throw new Error(`Unknown agent type: ${agentType}`);
        }

        this.logger.info(`Restarting agent: ${agentType}`);
        
        // Mark agent as unhealthy temporarily
        agentState.healthy = false;
        agentState.status = 'restarting';
        
        try {
            // Wait for active tasks to complete or timeout
            const timeout = 30000; // 30 seconds
            const start = Date.now();
            
            while (agentState.activeTasks > 0 && Date.now() - start < timeout) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Perform health check to verify restart
            await this.agentClient.healthCheck(agentType);
            
            agentState.healthy = true;
            agentState.status = 'healthy';
            agentState.errors = [];
            
            this.emit('agentRestarted', { agentType });
            
            return true;

        } catch (error) {
            this.logger.error(`Agent restart failed: ${agentType}`, error);
            agentState.status = 'error';
            throw error;
        }
    }

    /**
     * Shutdown agent manager
     */
    async shutdown() {
        this.logger.info('Shutting down Agent Manager');
        
        // Stop accepting new tasks
        this.taskQueue = [];
        
        // Wait for active tasks to complete
        const timeout = 60000; // 1 minute
        const start = Date.now();
        
        while (this.activeTasks.size > 0 && Date.now() - start < timeout) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Shutdown components
        await this.agentClient.shutdown();
        await this.wsl2Manager.shutdown();
        
        this.emit('shutdown');
    }
}

/**
 * WSL2 Manager for Claude Code instances
 */
class WSL2Manager {
    constructor(config) {
        this.config = config;
        this.instances = new Map();
        this.logger = new SimpleLogger('WSL2Manager');
    }

    /**
     * Get or create WSL2 instance for task
     */
    async getOrCreateInstance(taskId) {
        if (this.instances.has(taskId)) {
            const instance = this.instances.get(taskId);
            instance.lastUsed = Date.now();
            return instance;
        }

        if (this.instances.size >= this.config.max_instances) {
            await this.cleanupOldestInstance();
        }

        const instance = await this.createWSL2Instance(taskId);
        this.instances.set(taskId, instance);
        
        return instance;
    }

    /**
     * Create new WSL2 instance
     */
    async createWSL2Instance(taskId) {
        this.logger.info(`Creating WSL2 instance for task: ${taskId}`);
        
        const instance = {
            id: taskId,
            workspace: `/tmp/claude-code-${taskId}`,
            created_at: new Date(),
            last_used: Date.now(),
            status: 'ready',
            resources: {
                memory: this.config.resource_limits.memory,
                cpu: this.config.resource_limits.cpu,
                disk: this.config.resource_limits.disk
            },
            networking: this.config.networking
        };

        // Simulate instance creation (in real implementation, this would
        // interact with WSL2 API or container orchestration system)
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        this.logger.info(`WSL2 instance created: ${instance.id}`);
        
        return instance;
    }

    /**
     * Cleanup oldest instance
     */
    async cleanupOldestInstance() {
        if (this.instances.size === 0) return;

        let oldestInstance = null;
        let oldestTime = Date.now();

        for (const [taskId, instance] of this.instances.entries()) {
            if (instance.last_used < oldestTime) {
                oldestTime = instance.last_used;
                oldestInstance = { taskId, instance };
            }
        }

        if (oldestInstance) {
            await this.destroyInstance(oldestInstance.taskId);
        }
    }

    /**
     * Destroy WSL2 instance
     */
    async destroyInstance(taskId) {
        const instance = this.instances.get(taskId);
        if (!instance) return;

        this.logger.info(`Destroying WSL2 instance: ${taskId}`);
        
        // Simulate instance destruction
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        this.instances.delete(taskId);
        
        this.logger.info(`WSL2 instance destroyed: ${taskId}`);
    }

    /**
     * Cleanup expired instances
     */
    async cleanup() {
        const now = Date.now();
        const expiredInstances = [];

        for (const [taskId, instance] of this.instances.entries()) {
            if (now - instance.last_used > this.config.instance_timeout) {
                expiredInstances.push(taskId);
            }
        }

        for (const taskId of expiredInstances) {
            await this.destroyInstance(taskId);
        }

        if (expiredInstances.length > 0) {
            this.logger.info(`Cleaned up ${expiredInstances.length} expired WSL2 instances`);
        }
    }

    /**
     * Get instance status
     */
    getInstanceStatus() {
        return {
            total: this.instances.size,
            max: this.config.max_instances,
            instances: Array.from(this.instances.entries()).map(([taskId, instance]) => ({
                taskId,
                workspace: instance.workspace,
                created_at: instance.created_at,
                last_used: instance.last_used,
                age: Date.now() - instance.created_at.getTime(),
                status: instance.status
            }))
        };
    }

    /**
     * Shutdown WSL2 manager
     */
    async shutdown() {
        this.logger.info('Shutting down WSL2 Manager');
        
        const instanceIds = Array.from(this.instances.keys());
        
        for (const taskId of instanceIds) {
            await this.destroyInstance(taskId);
        }
    }
}

export default AgentManager;

