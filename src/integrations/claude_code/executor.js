/**
 * @fileoverview Claude Code Executor
 * @description Task execution logic for Claude Code via AgentAPI
 */

import { EventEmitter } from 'events';
import AgentAPIClient from '../agentapi/client.js';

/**
 * Claude Code Executor for task execution
 */
export class ClaudeCodeExecutor extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            agentAPI: {
                baseURL: config.agentAPI?.baseURL || 'http://localhost:3284',
                timeout: config.agentAPI?.timeout || 30000,
                retryAttempts: config.agentAPI?.retryAttempts || 3,
                ...config.agentAPI
            },
            claude: {
                maxTokens: config.claude?.maxTokens || 4000,
                temperature: config.claude?.temperature || 0.1,
                allowedTools: config.claude?.allowedTools || ['Bash(git*)', 'Edit', 'Replace'],
                ...config.claude
            },
            execution: {
                timeout: config.execution?.timeout || 30 * 60 * 1000, // 30 minutes
                maxConcurrent: config.execution?.maxConcurrent || 5,
                ...config.execution
            },
            ...config
        };

        this.agentAPIClient = new AgentAPIClient(this.config.agentAPI);
        this.activeExecutions = new Map();
        this.executionQueue = [];
        this.isInitialized = false;
    }

    /**
     * Initialize the executor
     */
    async initialize() {
        if (this.isInitialized) return;

        try {
            await this.agentAPIClient.connect();
            this.isInitialized = true;

            // Set up event listeners
            this._setupEventListeners();

            this.emit('initialized');
        } catch (error) {
            this.emit('initialization_failed', { error });
            throw error;
        }
    }

    /**
     * Execute a task via Claude Code
     */
    async executeTask(task, executionId = null) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const execId = executionId || this._generateExecutionId();
        
        // Check if we're at capacity
        if (this.activeExecutions.size >= this.config.execution.maxConcurrent) {
            return this._queueExecution(task, execId);
        }

        return this._startExecution(task, execId);
    }

    /**
     * Get execution status
     */
    async getExecutionStatus(executionId) {
        const execution = this.activeExecutions.get(executionId);
        if (!execution) {
            throw new Error(`Execution ${executionId} not found`);
        }

        try {
            const status = await this.agentAPIClient.getTaskStatus(executionId);
            execution.lastStatusCheck = new Date().toISOString();
            return status;
        } catch (error) {
            this.emit('status_check_failed', { executionId, error });
            throw error;
        }
    }

    /**
     * Get execution results
     */
    async getExecutionResults(executionId) {
        try {
            const results = await this.agentAPIClient.getTaskResults(executionId);
            return this._parseResults(results);
        } catch (error) {
            this.emit('results_fetch_failed', { executionId, error });
            throw error;
        }
    }

    /**
     * Cancel execution
     */
    async cancelExecution(executionId) {
        const execution = this.activeExecutions.get(executionId);
        if (!execution) {
            throw new Error(`Execution ${executionId} not found`);
        }

        try {
            await this.agentAPIClient.cancelTask(executionId);
            execution.status = 'cancelled';
            execution.endTime = new Date().toISOString();
            
            this.activeExecutions.delete(executionId);
            this._processQueue();

            this.emit('execution_cancelled', { executionId });
            return true;
        } catch (error) {
            this.emit('cancellation_failed', { executionId, error });
            throw error;
        }
    }

    /**
     * Get all active executions
     */
    getActiveExecutions() {
        return Array.from(this.activeExecutions.values()).map(execution => ({
            executionId: execution.executionId,
            taskTitle: execution.task.title,
            status: execution.status,
            startTime: execution.startTime,
            duration: execution.endTime ? 
                new Date(execution.endTime) - new Date(execution.startTime) :
                Date.now() - new Date(execution.startTime)
        }));
    }

    /**
     * Get execution statistics
     */
    getExecutionStats() {
        const active = this.activeExecutions.size;
        const queued = this.executionQueue.length;
        
        return {
            activeExecutions: active,
            queuedExecutions: queued,
            totalCapacity: this.config.execution.maxConcurrent,
            utilizationRate: active / this.config.execution.maxConcurrent
        };
    }

    /**
     * Private methods
     */
    async _startExecution(task, executionId) {
        const execution = {
            executionId,
            task,
            status: 'starting',
            startTime: new Date().toISOString(),
            endTime: null,
            lastStatusCheck: null,
            attempts: 1
        };

        this.activeExecutions.set(executionId, execution);

        try {
            // Generate prompt for the task
            const prompt = this._generateTaskPrompt(task);
            
            // Start execution via AgentAPI
            const result = await this.agentAPIClient.executeTask({
                prompt,
                executionId,
                config: {
                    maxTokens: this.config.claude.maxTokens,
                    temperature: this.config.claude.temperature,
                    allowedTools: this.config.claude.allowedTools
                }
            }, executionId);

            execution.status = 'running';
            execution.agentAPIResult = result;

            this.emit('execution_started', {
                executionId,
                taskTitle: task.title,
                startTime: execution.startTime
            });

            // Set up timeout
            setTimeout(() => {
                if (this.activeExecutions.has(executionId)) {
                    this._handleExecutionTimeout(executionId);
                }
            }, this.config.execution.timeout);

            return {
                executionId,
                status: execution.status,
                startTime: execution.startTime,
                agentAPIResult: result
            };
        } catch (error) {
            execution.status = 'failed';
            execution.endTime = new Date().toISOString();
            execution.error = error.message;

            this.activeExecutions.delete(executionId);
            this._processQueue();

            this.emit('execution_failed', {
                executionId,
                taskTitle: task.title,
                error: error.message
            });

            throw error;
        }
    }

    async _queueExecution(task, executionId) {
        const queuedExecution = {
            task,
            executionId,
            queuedAt: new Date().toISOString()
        };

        this.executionQueue.push(queuedExecution);

        this.emit('execution_queued', {
            executionId,
            taskTitle: task.title,
            queuePosition: this.executionQueue.length
        });

        return {
            executionId,
            status: 'queued',
            queuePosition: this.executionQueue.length,
            queuedAt: queuedExecution.queuedAt
        };
    }

    _processQueue() {
        if (this.executionQueue.length === 0) return;
        if (this.activeExecutions.size >= this.config.execution.maxConcurrent) return;

        const queuedExecution = this.executionQueue.shift();
        this._startExecution(queuedExecution.task, queuedExecution.executionId);
    }

    _generateTaskPrompt(task) {
        const prompt = `# Task: ${task.title}

## Description
${task.description}

## Type
${task.type || 'general'}

## Requirements
${Array.isArray(task.requirements) ? 
    task.requirements.map(req => `- ${req}`).join('\n') : 
    task.requirements || 'No specific requirements provided'}

## Additional Context
${task.context || 'No additional context provided'}

## Instructions
Please complete this task following these guidelines:
1. Analyze the requirements carefully
2. Plan your approach step by step
3. Implement the solution with proper error handling
4. Test your implementation
5. Provide a summary of what was accomplished

## Allowed Tools
You have access to the following tools: ${this.config.claude.allowedTools.join(', ')}

Please proceed with the task execution.`;

        return prompt;
    }

    _parseResults(results) {
        if (!results) return null;

        return {
            executionId: results.executionId,
            status: results.status,
            output: results.output,
            summary: this._extractSummary(results.output),
            filesModified: this._extractFilesModified(results.output),
            commandsExecuted: this._extractCommandsExecuted(results.output),
            errors: this._extractErrors(results.output),
            duration: results.duration,
            timestamp: results.timestamp
        };
    }

    _extractSummary(output) {
        // Extract summary from Claude's output
        const summaryMatch = output.match(/## Summary\n(.*?)(?=\n##|\n$)/s);
        return summaryMatch ? summaryMatch[1].trim() : 'No summary available';
    }

    _extractFilesModified(output) {
        // Extract list of modified files
        const fileMatches = output.match(/(?:modified|created|updated):\s*([^\n]+)/gi);
        return fileMatches ? fileMatches.map(match => match.split(':')[1].trim()) : [];
    }

    _extractCommandsExecuted(output) {
        // Extract executed commands
        const commandMatches = output.match(/```bash\n(.*?)\n```/gs);
        return commandMatches ? commandMatches.map(match => 
            match.replace(/```bash\n/, '').replace(/\n```/, '').trim()
        ) : [];
    }

    _extractErrors(output) {
        // Extract any errors mentioned in the output
        const errorMatches = output.match(/(?:error|failed|exception):\s*([^\n]+)/gi);
        return errorMatches ? errorMatches.map(match => match.split(':')[1].trim()) : [];
    }

    _handleExecutionTimeout(executionId) {
        const execution = this.activeExecutions.get(executionId);
        if (!execution) return;

        execution.status = 'timeout';
        execution.endTime = new Date().toISOString();

        this.activeExecutions.delete(executionId);
        this._processQueue();

        this.emit('execution_timeout', {
            executionId,
            taskTitle: execution.task.title,
            duration: this.config.execution.timeout
        });
    }

    _setupEventListeners() {
        this.agentAPIClient.on('sse_task_completed', (data) => {
            const execution = this.activeExecutions.get(data.executionId);
            if (execution) {
                execution.status = 'completed';
                execution.endTime = new Date().toISOString();
                
                this.activeExecutions.delete(data.executionId);
                this._processQueue();

                this.emit('execution_completed', {
                    executionId: data.executionId,
                    taskTitle: execution.task.title,
                    duration: new Date(execution.endTime) - new Date(execution.startTime)
                });
            }
        });

        this.agentAPIClient.on('sse_task_failed', (data) => {
            const execution = this.activeExecutions.get(data.executionId);
            if (execution) {
                execution.status = 'failed';
                execution.endTime = new Date().toISOString();
                execution.error = data.error;

                this.activeExecutions.delete(data.executionId);
                this._processQueue();

                this.emit('execution_failed', {
                    executionId: data.executionId,
                    taskTitle: execution.task.title,
                    error: data.error
                });
            }
        });

        this.agentAPIClient.on('connection_failed', () => {
            this.emit('agentapi_disconnected');
        });

        this.agentAPIClient.on('connected', () => {
            this.emit('agentapi_connected');
        });
    }

    _generateExecutionId() {
        return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

export default ClaudeCodeExecutor;

