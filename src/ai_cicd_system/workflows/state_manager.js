/**
 * State Manager
 * Handles workflow state persistence, recovery, and management
 */

import { EventEmitter } from 'events';

export class StateManager extends EventEmitter {
    constructor(database, options = {}) {
        super();
        this.db = database;
        this.stateCache = new Map();
        this.options = {
            cacheSize: options.cacheSize || 1000,
            persistInterval: options.persistInterval || 5000,
            retentionDays: options.retentionDays || 30,
            enableCompression: options.enableCompression || true,
            ...options
        };
        
        this.persistTimer = null;
        this.dirtyStates = new Set();
        this.setupPeriodicPersistence();
    }

    /**
     * Initializes a new workflow execution state
     * @param {string} executionId - Unique execution identifier
     * @param {Object} workflow - Workflow definition
     * @param {Object} context - Execution context
     * @returns {Object} Initial workflow state
     */
    async initializeWorkflow(executionId, workflow, context) {
        const state = {
            execution_id: executionId,
            workflow_id: workflow.id,
            workflow_version: workflow.version || '1.0.0',
            status: 'initialized',
            current_step: 0,
            total_steps: workflow.steps.length,
            started_at: new Date(),
            updated_at: new Date(),
            context: this.sanitizeContext(context),
            step_results: {},
            step_states: {},
            error_log: [],
            retry_count: 0,
            resource_usage: {
                memory: 0,
                cpu: 0,
                disk: 0
            },
            metrics: {
                steps_completed: 0,
                steps_failed: 0,
                total_duration: 0,
                average_step_duration: 0
            },
            checkpoints: [],
            metadata: {
                created_by: context.user_id || 'system',
                priority: workflow.priority || 'medium',
                tags: workflow.tags || []
            }
        };

        await this.persistState(state);
        this.stateCache.set(executionId, state);
        
        this.emit('workflow_initialized', { executionId, workflowId: workflow.id });
        return state;
    }

    /**
     * Updates the result of a completed step
     * @param {string} executionId - Execution identifier
     * @param {string} stepId - Step identifier
     * @param {Object} result - Step execution result
     * @returns {Object} Updated workflow state
     */
    async updateStepResult(executionId, stepId, result) {
        const state = await this.getState(executionId);
        if (!state) {
            throw new Error(`Workflow state not found: ${executionId}`);
        }

        state.step_results[stepId] = {
            ...result,
            completed_at: new Date(),
            duration: result.duration || 0
        };

        state.step_states[stepId] = 'completed';
        state.current_step++;
        state.updated_at = new Date();
        state.metrics.steps_completed++;
        
        // Update metrics
        this.updateMetrics(state, result);
        
        // Create checkpoint for recovery
        await this.createCheckpoint(state, `step_${stepId}_completed`);
        
        await this.persistState(state);
        this.emit('step_completed', { executionId, stepId, result });
        
        return state;
    }

    /**
     * Updates the state when a step fails
     * @param {string} executionId - Execution identifier
     * @param {string} stepId - Step identifier
     * @param {Error} error - Error that occurred
     * @returns {Object} Updated workflow state
     */
    async updateStepFailure(executionId, stepId, error) {
        const state = await this.getState(executionId);
        if (!state) {
            throw new Error(`Workflow state not found: ${executionId}`);
        }

        const errorEntry = {
            step_id: stepId,
            error_message: error.message,
            error_stack: error.stack,
            timestamp: new Date(),
            retry_count: state.retry_count
        };

        state.error_log.push(errorEntry);
        state.step_states[stepId] = 'failed';
        state.updated_at = new Date();
        state.metrics.steps_failed++;

        await this.persistState(state);
        this.emit('step_failed', { executionId, stepId, error });
        
        return state;
    }

    /**
     * Updates workflow progress
     * @param {Object} state - Current workflow state
     * @returns {Object} Updated state
     */
    async updateWorkflowProgress(state) {
        const completedSteps = Object.values(state.step_states)
            .filter(status => status === 'completed').length;
        
        state.progress = {
            percentage: (completedSteps / state.total_steps) * 100,
            completed_steps: completedSteps,
            remaining_steps: state.total_steps - completedSteps,
            estimated_completion: this.estimateCompletion(state)
        };

        state.updated_at = new Date();
        await this.persistState(state);
        
        this.emit('progress_updated', { 
            executionId: state.execution_id, 
            progress: state.progress 
        });
        
        return state;
    }

    /**
     * Marks a workflow as completed
     * @param {string} executionId - Execution identifier
     * @param {Object} result - Final workflow result
     * @returns {Object} Final workflow state
     */
    async completeWorkflow(executionId, result) {
        const state = await this.getState(executionId);
        if (!state) {
            throw new Error(`Workflow state not found: ${executionId}`);
        }

        state.status = 'completed';
        state.completed_at = new Date();
        state.final_result = result;
        state.metrics.total_duration = state.completed_at - state.started_at;
        state.updated_at = new Date();

        await this.createCheckpoint(state, 'workflow_completed');
        await this.persistState(state);
        
        this.emit('workflow_completed', { executionId, result });
        return state;
    }

    /**
     * Marks a workflow as failed
     * @param {string} executionId - Execution identifier
     * @param {Error} error - Error that caused the failure
     * @returns {Object} Final workflow state
     */
    async failWorkflow(executionId, error) {
        const state = await this.getState(executionId);
        if (!state) {
            throw new Error(`Workflow state not found: ${executionId}`);
        }

        state.status = 'failed';
        state.failed_at = new Date();
        state.failure_reason = {
            message: error.message,
            stack: error.stack,
            timestamp: new Date()
        };
        state.updated_at = new Date();

        await this.createCheckpoint(state, 'workflow_failed');
        await this.persistState(state);
        
        this.emit('workflow_failed', { executionId, error });
        return state;
    }

    /**
     * Pauses a workflow execution
     * @param {string} executionId - Execution identifier
     * @param {string} reason - Reason for pausing
     * @returns {Object} Updated workflow state
     */
    async pauseWorkflow(executionId, reason = 'manual_pause') {
        const state = await this.getState(executionId);
        if (!state) {
            throw new Error(`Workflow state not found: ${executionId}`);
        }

        state.status = 'paused';
        state.paused_at = new Date();
        state.pause_reason = reason;
        state.updated_at = new Date();

        await this.createCheckpoint(state, 'workflow_paused');
        await this.persistState(state);
        
        this.emit('workflow_paused', { executionId, reason });
        return state;
    }

    /**
     * Resumes a paused workflow execution
     * @param {string} executionId - Execution identifier
     * @returns {Object} Updated workflow state
     */
    async resumeWorkflow(executionId) {
        const state = await this.getState(executionId);
        if (!state) {
            throw new Error(`Workflow state not found: ${executionId}`);
        }

        if (state.status !== 'paused') {
            throw new Error(`Cannot resume workflow in status: ${state.status}`);
        }

        state.status = 'running';
        state.resumed_at = new Date();
        state.updated_at = new Date();
        
        // Calculate pause duration
        if (state.paused_at) {
            const pauseDuration = state.resumed_at - state.paused_at;
            state.total_pause_duration = (state.total_pause_duration || 0) + pauseDuration;
        }

        await this.persistState(state);
        this.emit('workflow_resumed', { executionId });
        
        return state;
    }

    /**
     * Retrieves workflow state
     * @param {string} executionId - Execution identifier
     * @returns {Object|null} Workflow state or null if not found
     */
    async getState(executionId) {
        // Check cache first
        if (this.stateCache.has(executionId)) {
            return this.stateCache.get(executionId);
        }

        // Load from database
        try {
            const state = await this.loadStateFromDatabase(executionId);
            if (state) {
                this.stateCache.set(executionId, state);
                return state;
            }
        } catch (error) {
            this.emit('error', { type: 'state_load_error', executionId, error });
        }

        return null;
    }

    /**
     * Creates a checkpoint for workflow recovery
     * @param {Object} state - Current workflow state
     * @param {string} checkpointName - Name of the checkpoint
     */
    async createCheckpoint(state, checkpointName) {
        const checkpoint = {
            name: checkpointName,
            timestamp: new Date(),
            state_snapshot: this.compressState(state),
            step_states: { ...state.step_states },
            current_step: state.current_step
        };

        state.checkpoints.push(checkpoint);
        
        // Keep only last 10 checkpoints
        if (state.checkpoints.length > 10) {
            state.checkpoints = state.checkpoints.slice(-10);
        }
    }

    /**
     * Recovers workflow from the latest checkpoint
     * @param {string} executionId - Execution identifier
     * @returns {Object} Recovered workflow state
     */
    async recoverFromCheckpoint(executionId) {
        const state = await this.getState(executionId);
        if (!state || !state.checkpoints || state.checkpoints.length === 0) {
            throw new Error(`No checkpoints available for recovery: ${executionId}`);
        }

        const latestCheckpoint = state.checkpoints[state.checkpoints.length - 1];
        const recoveredState = this.decompressState(latestCheckpoint.state_snapshot);
        
        recoveredState.status = 'recovered';
        recoveredState.recovered_at = new Date();
        recoveredState.recovery_checkpoint = latestCheckpoint.name;
        
        await this.persistState(recoveredState);
        this.stateCache.set(executionId, recoveredState);
        
        this.emit('workflow_recovered', { executionId, checkpoint: latestCheckpoint.name });
        return recoveredState;
    }

    /**
     * Persists workflow state to database
     * @param {Object} state - Workflow state to persist
     */
    async persistState(state) {
        this.dirtyStates.add(state.execution_id);
        this.stateCache.set(state.execution_id, state);
        
        // Immediate persistence for critical states
        if (['completed', 'failed', 'paused'].includes(state.status)) {
            await this.flushState(state.execution_id);
        }
    }

    /**
     * Flushes a specific state to database immediately
     * @param {string} executionId - Execution identifier
     */
    async flushState(executionId) {
        const state = this.stateCache.get(executionId);
        if (!state) return;

        try {
            await this.saveStateToDatabase(state);
            this.dirtyStates.delete(executionId);
        } catch (error) {
            this.emit('error', { type: 'state_persist_error', executionId, error });
        }
    }

    /**
     * Sets up periodic persistence of dirty states
     */
    setupPeriodicPersistence() {
        this.persistTimer = setInterval(async () => {
            const dirtyIds = Array.from(this.dirtyStates);
            for (const executionId of dirtyIds) {
                await this.flushState(executionId);
            }
        }, this.options.persistInterval);
    }

    /**
     * Updates workflow metrics
     * @param {Object} state - Workflow state
     * @param {Object} result - Step result
     */
    updateMetrics(state, result) {
        if (result.duration) {
            const totalDuration = Object.values(state.step_results)
                .reduce((sum, r) => sum + (r.duration || 0), 0);
            state.metrics.average_step_duration = totalDuration / state.metrics.steps_completed;
        }

        if (result.resource_usage) {
            state.resource_usage.memory = Math.max(
                state.resource_usage.memory, 
                result.resource_usage.memory || 0
            );
            state.resource_usage.cpu = Math.max(
                state.resource_usage.cpu, 
                result.resource_usage.cpu || 0
            );
        }
    }

    /**
     * Estimates workflow completion time
     * @param {Object} state - Current workflow state
     * @returns {Date} Estimated completion time
     */
    estimateCompletion(state) {
        if (state.metrics.average_step_duration === 0) {
            return null;
        }

        const remainingSteps = state.total_steps - state.metrics.steps_completed;
        const estimatedRemainingTime = remainingSteps * state.metrics.average_step_duration;
        
        return new Date(Date.now() + estimatedRemainingTime);
    }

    /**
     * Sanitizes context data for storage
     * @param {Object} context - Raw context data
     * @returns {Object} Sanitized context
     */
    sanitizeContext(context) {
        const sanitized = { ...context };
        
        // Remove sensitive data
        delete sanitized.password;
        delete sanitized.token;
        delete sanitized.secret;
        delete sanitized.api_key;
        
        return sanitized;
    }

    /**
     * Compresses state for checkpoint storage
     * @param {Object} state - State to compress
     * @returns {string} Compressed state
     */
    compressState(state) {
        if (!this.options.enableCompression) {
            return JSON.stringify(state);
        }
        
        // Simple compression - in production, use proper compression library
        return JSON.stringify(state);
    }

    /**
     * Decompresses state from checkpoint
     * @param {string} compressedState - Compressed state data
     * @returns {Object} Decompressed state
     */
    decompressState(compressedState) {
        return JSON.parse(compressedState);
    }

    /**
     * Loads state from database
     * @param {string} executionId - Execution identifier
     * @returns {Object|null} Loaded state
     */
    async loadStateFromDatabase(executionId) {
        if (!this.db) return null;
        
        // Implementation depends on database type
        // This is a placeholder for the actual database query
        return null;
    }

    /**
     * Saves state to database
     * @param {Object} state - State to save
     */
    async saveStateToDatabase(state) {
        if (!this.db) return;
        
        // Implementation depends on database type
        // This is a placeholder for the actual database save
    }

    /**
     * Cleans up old workflow states
     * @param {number} retentionDays - Number of days to retain states
     */
    async cleanupOldStates(retentionDays = this.options.retentionDays) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        
        // Remove from cache
        for (const [executionId, state] of this.stateCache.entries()) {
            if (state.started_at < cutoffDate) {
                this.stateCache.delete(executionId);
            }
        }
        
        // Remove from database
        if (this.db) {
            // Implementation depends on database type
        }
    }

    /**
     * Gets workflow statistics
     * @param {string} workflowId - Workflow identifier
     * @returns {Object} Workflow statistics
     */
    async getWorkflowStatistics(workflowId) {
        // This would query the database for historical data
        return {
            total_executions: 0,
            success_rate: 0,
            average_duration: 0,
            common_failures: [],
            performance_trends: []
        };
    }

    /**
     * Cleanup resources
     */
    destroy() {
        if (this.persistTimer) {
            clearInterval(this.persistTimer);
        }
        
        // Flush all dirty states before shutdown
        const dirtyIds = Array.from(this.dirtyStates);
        return Promise.all(dirtyIds.map(id => this.flushState(id)));
    }
}

