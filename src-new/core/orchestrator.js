/**
 * Task Master Orchestrator
 * Main orchestration engine for AI-driven development
 */

import EventEmitter from 'events';
import { TaskManager } from './task-manager.js';
import { EventStore } from './event-store.js';
import { CodegenAgent } from '../agents/codegen-agent.js';
import { ClaudeAgent } from '../agents/claude-agent.js';
import { LinearConnector } from '../integrations/linear-connector.js';
import { WSL2Deployer } from '../integrations/wsl2-deployer.js';

export class TaskMasterOrchestrator extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = config;
        this.taskManager = new TaskManager(config.tasks);
        this.eventStore = new EventStore(config.database);
        this.codegenAgent = new CodegenAgent(config.codegen);
        this.claudeAgent = new ClaudeAgent(config.claude);
        this.linearConnector = new LinearConnector(config.linear);
        this.wsl2Deployer = new WSL2Deployer(config.wsl2);
        
        this.isRunning = false;
        this.setupEventHandlers();
    }

    /**
     * Start the orchestrator
     */
    async start() {
        if (this.isRunning) {
            throw new Error('Orchestrator is already running');
        }

        try {
            // Initialize components
            await this.eventStore.initialize();
            await this.linearConnector.initialize();
            await this.wsl2Deployer.initialize();

            // Start agents
            await this.codegenAgent.start();
            await this.claudeAgent.start();

            this.isRunning = true;
            this.emit('started');
            
            await this.eventStore.logEvent({
                type: 'orchestrator.started',
                timestamp: new Date(),
                data: { config: this.config }
            });

        } catch (error) {
            await this.eventStore.logEvent({
                type: 'orchestrator.start_failed',
                timestamp: new Date(),
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Stop the orchestrator
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }

        try {
            // Stop agents
            await this.codegenAgent.stop();
            await this.claudeAgent.stop();

            // Close connections
            await this.linearConnector.close();
            await this.wsl2Deployer.close();
            await this.eventStore.close();

            this.isRunning = false;
            this.emit('stopped');

        } catch (error) {
            console.error('Error stopping orchestrator:', error);
            throw error;
        }
    }

    /**
     * Orchestrate a development task
     */
    async orchestrateTask(taskId, options = {}) {
        if (!this.isRunning) {
            throw new Error('Orchestrator is not running');
        }

        const task = await this.taskManager.getTask(taskId);
        if (!task) {
            throw new Error(`Task ${taskId} not found`);
        }

        await this.eventStore.logEvent({
            type: 'task.orchestration_started',
            timestamp: new Date(),
            data: { taskId, task, options }
        });

        try {
            // Coordinate between Codegen SDK and Claude Code
            const result = await this.coordinateAgents(task, options);
            
            // Update Linear if configured
            if (this.config.linear?.enabled) {
                await this.linearConnector.updateTask(taskId, result);
            }

            // Deploy if configured
            if (this.config.wsl2?.enabled && result.deployable) {
                await this.wsl2Deployer.deploy(result);
            }

            await this.eventStore.logEvent({
                type: 'task.orchestration_completed',
                timestamp: new Date(),
                data: { taskId, result }
            });

            return result;

        } catch (error) {
            await this.eventStore.logEvent({
                type: 'task.orchestration_failed',
                timestamp: new Date(),
                data: { taskId, error: error.message }
            });
            throw error;
        }
    }

    /**
     * Coordinate between Codegen SDK and Claude Code agents
     */
    async coordinateAgents(task, options) {
        // This is the core dual AI coordination logic
        // Will be implemented in Phase 2
        
        const coordination = {
            task,
            codegenResult: null,
            claudeResult: null,
            finalResult: null
        };

        // Step 1: Analyze task with Claude Code
        coordination.claudeResult = await this.claudeAgent.analyzeTask(task);

        // Step 2: Execute with Codegen SDK
        coordination.codegenResult = await this.codegenAgent.executeTask(
            task, 
            coordination.claudeResult
        );

        // Step 3: Validate and refine with Claude Code
        coordination.finalResult = await this.claudeAgent.validateResult(
            coordination.codegenResult
        );

        return coordination.finalResult;
    }

    /**
     * Setup event handlers for component communication
     */
    setupEventHandlers() {
        // Task Manager events
        this.taskManager.on('task.created', (task) => {
            this.eventStore.logEvent({
                type: 'task.created',
                timestamp: new Date(),
                data: { task }
            });
        });

        this.taskManager.on('task.updated', (task) => {
            this.eventStore.logEvent({
                type: 'task.updated',
                timestamp: new Date(),
                data: { task }
            });
        });

        // Agent events
        this.codegenAgent.on('task.completed', (result) => {
            this.emit('agent.codegen.completed', result);
        });

        this.claudeAgent.on('task.completed', (result) => {
            this.emit('agent.claude.completed', result);
        });

        // Linear events
        this.linearConnector.on('issue.created', (issue) => {
            this.eventStore.logEvent({
                type: 'linear.issue.created',
                timestamp: new Date(),
                data: { issue }
            });
        });

        // WSL2 events
        this.wsl2Deployer.on('deployment.completed', (deployment) => {
            this.eventStore.logEvent({
                type: 'wsl2.deployment.completed',
                timestamp: new Date(),
                data: { deployment }
            });
        });
    }

    /**
     * Get orchestrator status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            components: {
                taskManager: this.taskManager.isReady(),
                eventStore: this.eventStore.isConnected(),
                codegenAgent: this.codegenAgent.isRunning(),
                claudeAgent: this.claudeAgent.isRunning(),
                linearConnector: this.linearConnector.isConnected(),
                wsl2Deployer: this.wsl2Deployer.isReady()
            }
        };
    }
}

export default TaskMasterOrchestrator;

