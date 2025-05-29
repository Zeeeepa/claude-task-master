/**
 * Coordination Engine - AI agent coordination and task routing
 * Manages AI agent coordination, task routing, load balancing, and agent status tracking
 */

import EventEmitter from 'events';
import { logger } from '../utils/logger.js';
import { configManager } from '../utils/config-manager.js';

class CoordinationEngine extends EventEmitter {
    constructor() {
        super();
        this.agents = new Map();
        this.taskQueue = [];
        this.activeAssignments = new Map();
        this.loadBalancer = new LoadBalancer();
        this.isRunning = false;
    }

    /**
     * Start the coordination engine
     */
    async start() {
        if (this.isRunning) {
            logger.warn('Coordination engine is already running');
            return;
        }

        logger.info('Starting coordination engine...');
        this.isRunning = true;
        
        // Start task processing loop
        this.startTaskProcessing();
        
        this.emit('started');
        logger.info('Coordination engine started successfully');
    }

    /**
     * Stop the coordination engine
     */
    async stop() {
        if (!this.isRunning) {
            logger.warn('Coordination engine is not running');
            return;
        }

        logger.info('Stopping coordination engine...');
        this.isRunning = false;
        
        this.emit('stopped');
        logger.info('Coordination engine stopped successfully');
    }

    /**
     * Register a new AI agent
     */
    registerAgent(agentId, agentConfig) {
        const agent = {
            id: agentId,
            type: agentConfig.type, // 'codegen', 'claude', 'custom'
            capabilities: agentConfig.capabilities || [],
            status: 'idle',
            load: 0,
            maxConcurrentTasks: agentConfig.maxConcurrentTasks || 1,
            currentTasks: [],
            registeredAt: Date.now(),
            lastHeartbeat: Date.now(),
            metadata: agentConfig.metadata || {}
        };

        this.agents.set(agentId, agent);
        this.emit('agentRegistered', { agentId, agent });
        
        logger.info(`Agent registered: ${agentId} (${agent.type})`);
        return agent;
    }

    /**
     * Unregister an agent
     */
    unregisterAgent(agentId) {
        if (this.agents.has(agentId)) {
            const agent = this.agents.get(agentId);
            
            // Reassign any active tasks
            for (const taskId of agent.currentTasks) {
                this.reassignTask(taskId, agentId);
            }
            
            this.agents.delete(agentId);
            this.emit('agentUnregistered', { agentId, agent });
            
            logger.info(`Agent unregistered: ${agentId}`);
        }
    }

    /**
     * Update agent status
     */
    updateAgentStatus(agentId, status, metadata = {}) {
        if (this.agents.has(agentId)) {
            const agent = this.agents.get(agentId);
            agent.status = status;
            agent.lastHeartbeat = Date.now();
            agent.metadata = { ...agent.metadata, ...metadata };
            
            this.emit('agentStatusChanged', { agentId, status, metadata });
            logger.debug(`Agent status updated: ${agentId} -> ${status}`);
        }
    }

    /**
     * Submit a task for processing
     */
    async submitTask(task) {
        const taskId = task.id || this.generateTaskId();
        const enrichedTask = {
            ...task,
            id: taskId,
            submittedAt: Date.now(),
            status: 'queued',
            priority: task.priority || 'normal',
            requiredCapabilities: task.requiredCapabilities || [],
            estimatedDuration: task.estimatedDuration || null
        };

        this.taskQueue.push(enrichedTask);
        this.emit('taskSubmitted', { taskId, task: enrichedTask });
        
        logger.info(`Task submitted: ${taskId}`, { 
            type: task.type, 
            priority: task.priority 
        });

        // Try to assign immediately if agents are available
        this.processTaskQueue();
        
        return taskId;
    }

    /**
     * Process the task queue
     */
    async processTaskQueue() {
        if (!this.isRunning || this.taskQueue.length === 0) {
            return;
        }

        // Sort tasks by priority
        this.taskQueue.sort((a, b) => {
            const priorityOrder = { 'high': 3, 'normal': 2, 'low': 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });

        const tasksToProcess = [...this.taskQueue];
        this.taskQueue = [];

        for (const task of tasksToProcess) {
            const assignedAgent = await this.assignTask(task);
            
            if (!assignedAgent) {
                // No suitable agent available, put back in queue
                this.taskQueue.push(task);
                logger.debug(`Task ${task.id} returned to queue - no suitable agent available`);
            }
        }
    }

    /**
     * Assign a task to the best available agent
     */
    async assignTask(task) {
        const suitableAgents = this.findSuitableAgents(task);
        
        if (suitableAgents.length === 0) {
            logger.warn(`No suitable agents found for task ${task.id}`);
            return null;
        }

        const selectedAgent = this.loadBalancer.selectAgent(suitableAgents, task);
        
        if (!selectedAgent) {
            return null;
        }

        // Assign the task
        selectedAgent.currentTasks.push(task.id);
        selectedAgent.load = selectedAgent.currentTasks.length / selectedAgent.maxConcurrentTasks;
        selectedAgent.status = selectedAgent.currentTasks.length >= selectedAgent.maxConcurrentTasks ? 'busy' : 'active';

        this.activeAssignments.set(task.id, {
            taskId: task.id,
            agentId: selectedAgent.id,
            assignedAt: Date.now(),
            task: task
        });

        task.status = 'assigned';
        task.assignedAgent = selectedAgent.id;
        task.assignedAt = Date.now();

        this.emit('taskAssigned', { 
            taskId: task.id, 
            agentId: selectedAgent.id, 
            task 
        });

        logger.info(`Task ${task.id} assigned to agent ${selectedAgent.id}`);
        return selectedAgent;
    }

    /**
     * Find suitable agents for a task
     */
    findSuitableAgents(task) {
        const suitableAgents = [];

        for (const [agentId, agent] of this.agents) {
            // Check if agent is available
            if (agent.status === 'offline' || agent.status === 'error') {
                continue;
            }

            // Check if agent has capacity
            if (agent.currentTasks.length >= agent.maxConcurrentTasks) {
                continue;
            }

            // Check if agent has required capabilities
            if (task.requiredCapabilities.length > 0) {
                const hasAllCapabilities = task.requiredCapabilities.every(
                    capability => agent.capabilities.includes(capability)
                );
                if (!hasAllCapabilities) {
                    continue;
                }
            }

            // Check agent type compatibility
            if (task.preferredAgentType && agent.type !== task.preferredAgentType) {
                continue;
            }

            suitableAgents.push(agent);
        }

        return suitableAgents;
    }

    /**
     * Complete a task
     */
    completeTask(taskId, result = {}) {
        const assignment = this.activeAssignments.get(taskId);
        
        if (!assignment) {
            logger.warn(`Attempted to complete unknown task: ${taskId}`);
            return;
        }

        const agent = this.agents.get(assignment.agentId);
        
        if (agent) {
            // Remove task from agent
            agent.currentTasks = agent.currentTasks.filter(id => id !== taskId);
            agent.load = agent.currentTasks.length / agent.maxConcurrentTasks;
            agent.status = agent.currentTasks.length === 0 ? 'idle' : 'active';
        }

        this.activeAssignments.delete(taskId);
        
        this.emit('taskCompleted', { 
            taskId, 
            agentId: assignment.agentId, 
            result,
            duration: Date.now() - assignment.assignedAt
        });

        logger.info(`Task ${taskId} completed by agent ${assignment.agentId}`);
        
        // Process queue in case there are waiting tasks
        this.processTaskQueue();
    }

    /**
     * Reassign a task from one agent to another
     */
    async reassignTask(taskId, fromAgentId) {
        const assignment = this.activeAssignments.get(taskId);
        
        if (!assignment) {
            logger.warn(`Attempted to reassign unknown task: ${taskId}`);
            return;
        }

        // Remove from current agent
        const currentAgent = this.agents.get(fromAgentId);
        if (currentAgent) {
            currentAgent.currentTasks = currentAgent.currentTasks.filter(id => id !== taskId);
            currentAgent.load = currentAgent.currentTasks.length / currentAgent.maxConcurrentTasks;
        }

        // Put task back in queue for reassignment
        assignment.task.status = 'queued';
        assignment.task.assignedAgent = null;
        this.taskQueue.push(assignment.task);
        
        this.activeAssignments.delete(taskId);
        
        this.emit('taskReassigned', { taskId, fromAgentId });
        logger.info(`Task ${taskId} reassigned from agent ${fromAgentId}`);
        
        // Try to assign to another agent
        this.processTaskQueue();
    }

    /**
     * Start task processing loop
     */
    startTaskProcessing() {
        const processInterval = configManager.get('coordination.processInterval', 5000);
        
        const processLoop = () => {
            if (this.isRunning) {
                this.processTaskQueue();
                setTimeout(processLoop, processInterval);
            }
        };
        
        setTimeout(processLoop, processInterval);
    }

    /**
     * Generate a unique task ID
     */
    generateTaskId() {
        return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get coordination engine status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            agentCount: this.agents.size,
            queuedTasks: this.taskQueue.length,
            activeTasks: this.activeAssignments.size,
            agents: Array.from(this.agents.values()),
            taskQueue: this.taskQueue,
            activeAssignments: Array.from(this.activeAssignments.values())
        };
    }
}

/**
 * Load Balancer for agent selection
 */
class LoadBalancer {
    constructor() {
        this.strategy = 'least_loaded'; // 'round_robin', 'least_loaded', 'capability_based'
        this.roundRobinIndex = 0;
    }

    /**
     * Select the best agent for a task
     */
    selectAgent(agents, task) {
        if (agents.length === 0) {
            return null;
        }

        switch (this.strategy) {
            case 'round_robin':
                return this.roundRobinSelection(agents);
            case 'least_loaded':
                return this.leastLoadedSelection(agents);
            case 'capability_based':
                return this.capabilityBasedSelection(agents, task);
            default:
                return this.leastLoadedSelection(agents);
        }
    }

    /**
     * Round robin agent selection
     */
    roundRobinSelection(agents) {
        const agent = agents[this.roundRobinIndex % agents.length];
        this.roundRobinIndex++;
        return agent;
    }

    /**
     * Least loaded agent selection
     */
    leastLoadedSelection(agents) {
        return agents.reduce((least, current) => {
            return current.load < least.load ? current : least;
        });
    }

    /**
     * Capability-based agent selection
     */
    capabilityBasedSelection(agents, task) {
        // Score agents based on capability match and load
        const scoredAgents = agents.map(agent => {
            let score = 0;
            
            // Capability match score
            if (task.requiredCapabilities) {
                const matchedCapabilities = task.requiredCapabilities.filter(
                    cap => agent.capabilities.includes(cap)
                ).length;
                score += matchedCapabilities * 10;
            }
            
            // Load penalty
            score -= agent.load * 5;
            
            // Type preference bonus
            if (task.preferredAgentType === agent.type) {
                score += 5;
            }
            
            return { agent, score };
        });

        // Sort by score and return the best
        scoredAgents.sort((a, b) => b.score - a.score);
        return scoredAgents[0]?.agent || null;
    }
}

export const coordinationEngine = new CoordinationEngine();
export default CoordinationEngine;

