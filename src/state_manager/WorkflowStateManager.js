/**
 * @fileoverview Workflow State Manager
 * @description Manages comprehensive workflow state across all components
 */

import { WORKFLOW_STATES } from '../workflow_orchestrator/types.js';

/**
 * Workflow state management interface
 * Maintains comprehensive workflow state across all components
 */
export class WorkflowStateManager {
    constructor(options = {}) {
        this.states = new Map(); // In-memory state storage
        this.stateHistory = new Map(); // State transition history
        this.config = {
            maxHistoryEntries: options.maxHistoryEntries || 1000,
            enableStateValidation: options.enableStateValidation !== false,
            enableStateSnapshots: options.enableStateSnapshots || true,
            ...options
        };
    }

    /**
     * Initialize workflow state
     * @param {string} workflow_id - Workflow identifier
     * @param {import('../workflow_orchestrator/types.js').WorkflowInstance} workflow - Workflow instance
     */
    async initialize_workflow_state(workflow_id, workflow) {
        const now = new Date();
        
        const initialState = {
            workflow_id,
            current_state: workflow.current_state,
            context: {
                ...workflow.context,
                initialized_at: now
            },
            history: [],
            last_updated: now,
            metadata: {
                version: '1.0.0',
                created_by: 'WorkflowStateManager',
                ...workflow.metadata
            }
        };

        this.states.set(workflow_id, initialState);
        this.stateHistory.set(workflow_id, []);

        // Record initial state transition
        await this._recordStateTransition(workflow_id, null, workflow.current_state, 'initialization');
    }

    /**
     * Get current workflow state
     * @param {string} workflow_id - Workflow identifier
     * @returns {Promise<import('../workflow_orchestrator/types.js').WorkflowState>}
     */
    async get_current_state(workflow_id) {
        const state = this.states.get(workflow_id);
        if (!state) {
            throw new Error(`Workflow state ${workflow_id} not found`);
        }
        return { ...state }; // Return copy to prevent mutations
    }

    /**
     * Transition workflow state
     * @param {string} workflow_id - Workflow identifier
     * @param {string} from_state - Current state
     * @param {string} to_state - Target state
     * @returns {Promise<boolean>} Success status
     */
    async transition_state(workflow_id, from_state, to_state) {
        try {
            // Validate transition if enabled
            if (this.config.enableStateValidation) {
                const isValid = await this.can_transition(workflow_id, to_state);
                if (!isValid) {
                    console.error(`Invalid state transition: ${from_state} -> ${to_state} for workflow ${workflow_id}`);
                    return false;
                }
            }

            const state = this.states.get(workflow_id);
            if (!state) {
                throw new Error(`Workflow state ${workflow_id} not found`);
            }

            // Update state
            const previousState = state.current_state;
            state.current_state = to_state;
            state.last_updated = new Date();

            // Update context with transition info
            state.context.last_transition = {
                from: previousState,
                to: to_state,
                timestamp: state.last_updated
            };

            // Record state transition
            await this._recordStateTransition(workflow_id, previousState, to_state, 'manual_transition');

            // Create state snapshot if enabled
            if (this.config.enableStateSnapshots) {
                await this._createStateSnapshot(workflow_id, state);
            }

            return true;
        } catch (error) {
            console.error(`Failed to transition state for workflow ${workflow_id}:`, error);
            return false;
        }
    }

    /**
     * Check if state transition is allowed
     * @param {string} workflow_id - Workflow identifier
     * @param {string} to_state - Target state
     * @returns {Promise<boolean>} Whether transition is allowed
     */
    async can_transition(workflow_id, to_state) {
        const state = this.states.get(workflow_id);
        if (!state) {
            return false;
        }

        const currentState = state.current_state;
        const allowedTransitions = WORKFLOW_STATES[currentState] || [];
        
        return allowedTransitions.includes(to_state);
    }

    /**
     * Get workflow state history
     * @param {string} workflow_id - Workflow identifier
     * @returns {Promise<import('../workflow_orchestrator/types.js').StateTransition[]>}
     */
    async get_workflow_history(workflow_id) {
        const history = this.stateHistory.get(workflow_id) || [];
        return [...history]; // Return copy
    }

    /**
     * Update workflow context
     * @param {string} workflow_id - Workflow identifier
     * @param {Object<string, any>} contextUpdate - Context updates
     */
    async update_workflow_context(workflow_id, contextUpdate) {
        const state = this.states.get(workflow_id);
        if (!state) {
            throw new Error(`Workflow state ${workflow_id} not found`);
        }

        // Merge context updates
        state.context = {
            ...state.context,
            ...contextUpdate,
            last_context_update: new Date()
        };
        
        state.last_updated = new Date();
    }

    /**
     * Get workflow state snapshot
     * @param {string} workflow_id - Workflow identifier
     * @param {Date} [timestamp] - Specific timestamp (defaults to latest)
     * @returns {Promise<import('../workflow_orchestrator/types.js').WorkflowState|null>}
     */
    async get_state_snapshot(workflow_id, timestamp = null) {
        // For now, return current state (in production, this would query historical snapshots)
        if (!timestamp) {
            return await this.get_current_state(workflow_id);
        }
        
        // Mock implementation - in production, this would query time-based snapshots
        const history = await this.get_workflow_history(workflow_id);
        const relevantTransition = history.find(t => t.timestamp <= timestamp);
        
        if (relevantTransition) {
            const state = this.states.get(workflow_id);
            return {
                ...state,
                current_state: relevantTransition.to_state,
                last_updated: relevantTransition.timestamp
            };
        }
        
        return null;
    }

    /**
     * Pause workflow state management
     * @param {string} workflow_id - Workflow identifier
     * @param {string} reason - Pause reason
     */
    async pause_workflow_state(workflow_id, reason) {
        const state = this.states.get(workflow_id);
        if (!state) {
            throw new Error(`Workflow state ${workflow_id} not found`);
        }

        state.context.paused = true;
        state.context.pause_reason = reason;
        state.context.paused_at = new Date();
        state.last_updated = new Date();

        await this._recordStateTransition(workflow_id, state.current_state, state.current_state, 'pause', { reason });
    }

    /**
     * Resume workflow state management
     * @param {string} workflow_id - Workflow identifier
     */
    async resume_workflow_state(workflow_id) {
        const state = this.states.get(workflow_id);
        if (!state) {
            throw new Error(`Workflow state ${workflow_id} not found`);
        }

        const pauseDuration = state.context.paused_at 
            ? new Date().getTime() - state.context.paused_at.getTime()
            : 0;

        state.context.paused = false;
        state.context.pause_duration_ms = (state.context.pause_duration_ms || 0) + pauseDuration;
        state.context.resumed_at = new Date();
        delete state.context.pause_reason;
        delete state.context.paused_at;
        state.last_updated = new Date();

        await this._recordStateTransition(workflow_id, state.current_state, state.current_state, 'resume');
    }

    /**
     * Rollback workflow state to previous state
     * @param {string} workflow_id - Workflow identifier
     * @param {number} steps - Number of steps to rollback (default: 1)
     * @returns {Promise<boolean>} Success status
     */
    async rollback_workflow_state(workflow_id, steps = 1) {
        try {
            const history = this.stateHistory.get(workflow_id) || [];
            if (history.length < steps) {
                console.error(`Cannot rollback ${steps} steps, only ${history.length} transitions available`);
                return false;
            }

            // Get target state (steps back from current)
            const targetTransition = history[history.length - steps - 1];
            if (!targetTransition) {
                console.error(`Cannot find target state for rollback`);
                return false;
            }

            const state = this.states.get(workflow_id);
            if (!state) {
                throw new Error(`Workflow state ${workflow_id} not found`);
            }

            // Perform rollback
            const previousState = state.current_state;
            state.current_state = targetTransition.to_state;
            state.last_updated = new Date();
            
            // Update context
            state.context.rollback_info = {
                from_state: previousState,
                to_state: targetTransition.to_state,
                steps_rolled_back: steps,
                rollback_timestamp: state.last_updated
            };

            // Record rollback transition
            await this._recordStateTransition(
                workflow_id, 
                previousState, 
                targetTransition.to_state, 
                'rollback',
                { steps_rolled_back: steps }
            );

            return true;
        } catch (error) {
            console.error(`Failed to rollback workflow state ${workflow_id}:`, error);
            return false;
        }
    }

    /**
     * Get workflow state statistics
     * @param {string} workflow_id - Workflow identifier
     * @returns {Promise<Object>} State statistics
     */
    async get_state_statistics(workflow_id) {
        const state = this.states.get(workflow_id);
        const history = this.stateHistory.get(workflow_id) || [];
        
        if (!state) {
            throw new Error(`Workflow state ${workflow_id} not found`);
        }

        const stateTransitionCounts = {};
        const stateDurations = {};
        let totalDuration = 0;

        // Calculate state transition statistics
        for (let i = 0; i < history.length; i++) {
            const transition = history[i];
            const stateName = transition.to_state;
            
            stateTransitionCounts[stateName] = (stateTransitionCounts[stateName] || 0) + 1;
            
            // Calculate duration in this state
            if (i < history.length - 1) {
                const nextTransition = history[i + 1];
                const duration = nextTransition.timestamp.getTime() - transition.timestamp.getTime();
                stateDurations[stateName] = (stateDurations[stateName] || 0) + duration;
                totalDuration += duration;
            }
        }

        return {
            workflow_id,
            current_state: state.current_state,
            total_transitions: history.length,
            total_duration_ms: totalDuration,
            state_transition_counts: stateTransitionCounts,
            state_durations_ms: stateDurations,
            average_state_duration_ms: history.length > 0 ? totalDuration / history.length : 0,
            is_paused: state.context.paused || false,
            last_updated: state.last_updated
        };
    }

    /**
     * Clean up old workflow states
     * @param {number} maxAge - Maximum age in milliseconds
     * @returns {Promise<number>} Number of cleaned up workflows
     */
    async cleanup_old_states(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 days default
        const now = new Date();
        let cleanedCount = 0;

        for (const [workflow_id, state] of this.states) {
            const age = now.getTime() - state.last_updated.getTime();
            if (age > maxAge) {
                this.states.delete(workflow_id);
                this.stateHistory.delete(workflow_id);
                cleanedCount++;
            }
        }

        return cleanedCount;
    }

    // Private methods

    /**
     * Record state transition in history
     * @param {string} workflow_id - Workflow identifier
     * @param {string|null} from_state - Previous state
     * @param {string} to_state - New state
     * @param {string} trigger - What triggered the transition
     * @param {Object} metadata - Additional metadata
     * @private
     */
    async _recordStateTransition(workflow_id, from_state, to_state, trigger, metadata = {}) {
        const history = this.stateHistory.get(workflow_id) || [];
        
        const transition = {
            workflow_id,
            from_state,
            to_state,
            timestamp: new Date(),
            trigger,
            metadata
        };

        history.push(transition);

        // Limit history size
        if (history.length > this.config.maxHistoryEntries) {
            history.shift(); // Remove oldest entry
        }

        this.stateHistory.set(workflow_id, history);
    }

    /**
     * Create state snapshot
     * @param {string} workflow_id - Workflow identifier
     * @param {import('../workflow_orchestrator/types.js').WorkflowState} state - Current state
     * @private
     */
    async _createStateSnapshot(workflow_id, state) {
        // In production, this would persist snapshots to storage
        // For now, we'll just log the snapshot creation
        console.log(`State snapshot created for workflow ${workflow_id} at state ${state.current_state}`);
    }
}

