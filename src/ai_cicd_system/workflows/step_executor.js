/**
 * Step Executor
 * Handles individual workflow step execution with error handling and retry logic
 */

import { EventEmitter } from 'events';

export class StepExecutor extends EventEmitter {
    constructor(agentManager, options = {}) {
        super();
        this.agentManager = agentManager;
        this.options = {
            defaultTimeout: options.defaultTimeout || 300000, // 5 minutes
            maxRetries: options.maxRetries || 3,
            retryDelay: options.retryDelay || 1000,
            retryBackoffMultiplier: options.retryBackoffMultiplier || 2,
            enableMetrics: options.enableMetrics || true,
            ...options
        };
        
        this.activeExecutions = new Map();
        this.executionMetrics = new Map();
    }

    /**
     * Executes a workflow step
     * @param {Object} step - Step definition
     * @param {Object} context - Execution context
     * @param {Object} workflowState - Current workflow state
     * @returns {Object} Step execution result
     */
    async executeStep(step, context, workflowState) {
        const executionId = this.generateExecutionId(step.id, workflowState.execution_id);
        const startTime = Date.now();
        
        try {
            this.activeExecutions.set(executionId, {
                stepId: step.id,
                workflowId: workflowState.workflow_id,
                startTime,
                status: 'running'
            });

            this.emit('step_started', { 
                executionId, 
                stepId: step.id, 
                workflowId: workflowState.workflow_id 
            });

            // Validate step prerequisites
            await this.validateStepPrerequisites(step, context, workflowState);

            // Prepare step context
            const stepContext = await this.prepareStepContext(step, context, workflowState);

            // Execute step with retry logic
            const result = await this.executeWithRetry(step, stepContext, workflowState);

            // Post-process result
            const processedResult = await this.postProcessResult(step, result, stepContext);

            // Update metrics
            if (this.options.enableMetrics) {
                this.updateExecutionMetrics(executionId, processedResult, Date.now() - startTime);
            }

            this.activeExecutions.delete(executionId);
            
            this.emit('step_completed', { 
                executionId, 
                stepId: step.id, 
                result: processedResult 
            });

            return processedResult;

        } catch (error) {
            this.activeExecutions.delete(executionId);
            
            this.emit('step_failed', { 
                executionId, 
                stepId: step.id, 
                error,
                duration: Date.now() - startTime
            });

            throw error;
        }
    }

    /**
     * Executes a step with retry logic
     * @param {Object} step - Step definition
     * @param {Object} stepContext - Prepared step context
     * @param {Object} workflowState - Current workflow state
     * @returns {Object} Step execution result
     */
    async executeWithRetry(step, stepContext, workflowState) {
        const maxRetries = step.retry_count || this.options.maxRetries;
        let lastError = null;
        let retryDelay = this.options.retryDelay;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    this.emit('step_retry', { 
                        stepId: step.id, 
                        attempt, 
                        maxRetries,
                        delay: retryDelay
                    });
                    
                    await this.delay(retryDelay);
                    retryDelay *= this.options.retryBackoffMultiplier;
                }

                const result = await this.executeSingleAttempt(step, stepContext, workflowState);
                
                if (attempt > 0) {
                    this.emit('step_retry_success', { 
                        stepId: step.id, 
                        attempt, 
                        result 
                    });
                }

                return result;

            } catch (error) {
                lastError = error;
                
                // Check if error is retryable
                if (!this.isRetryableError(error, step)) {
                    throw error;
                }

                if (attempt === maxRetries) {
                    this.emit('step_retry_exhausted', { 
                        stepId: step.id, 
                        attempts: attempt + 1, 
                        error 
                    });
                    break;
                }
            }
        }

        throw lastError;
    }

    /**
     * Executes a single attempt of a step
     * @param {Object} step - Step definition
     * @param {Object} stepContext - Step execution context
     * @param {Object} workflowState - Current workflow state
     * @returns {Object} Step execution result
     */
    async executeSingleAttempt(step, stepContext, workflowState) {
        const timeout = step.timeout || this.options.defaultTimeout;
        
        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Step ${step.id} timed out after ${timeout}ms`));
            }, timeout);
        });

        // Create execution promise
        const executionPromise = this.executeStepWithAgent(step, stepContext, workflowState);

        // Race between execution and timeout
        const result = await Promise.race([executionPromise, timeoutPromise]);

        // Validate result
        this.validateStepResult(step, result);

        return result;
    }

    /**
     * Executes step using the appropriate agent
     * @param {Object} step - Step definition
     * @param {Object} stepContext - Step execution context
     * @param {Object} workflowState - Current workflow state
     * @returns {Object} Step execution result
     */
    async executeStepWithAgent(step, stepContext, workflowState) {
        if (!this.agentManager) {
            throw new Error('Agent manager not configured');
        }

        const agent = await this.agentManager.getAgent(step.agent);
        if (!agent) {
            throw new Error(`Agent not found: ${step.agent}`);
        }

        // Check agent availability
        if (!await this.agentManager.isAgentAvailable(step.agent)) {
            throw new Error(`Agent not available: ${step.agent}`);
        }

        // Prepare agent request
        const agentRequest = {
            type: step.type,
            step_id: step.id,
            workflow_id: workflowState.workflow_id,
            execution_id: workflowState.execution_id,
            context: stepContext,
            config: step.config || {},
            metadata: {
                attempt: stepContext.attempt || 1,
                workflow_step: workflowState.current_step,
                total_steps: workflowState.total_steps
            }
        };

        // Execute with agent
        const startTime = Date.now();
        const result = await agent.execute(agentRequest);
        const duration = Date.now() - startTime;

        return {
            ...result,
            execution_metadata: {
                agent: step.agent,
                duration,
                timestamp: new Date(),
                step_id: step.id,
                workflow_id: workflowState.workflow_id
            }
        };
    }

    /**
     * Validates step prerequisites before execution
     * @param {Object} step - Step definition
     * @param {Object} context - Execution context
     * @param {Object} workflowState - Current workflow state
     */
    async validateStepPrerequisites(step, context, workflowState) {
        // Check dependencies are completed
        if (step.dependencies && step.dependencies.length > 0) {
            for (const depId of step.dependencies) {
                if (workflowState.step_states[depId] !== 'completed') {
                    throw new Error(`Dependency not satisfied: ${depId} for step ${step.id}`);
                }
            }
        }

        // Check required context data
        if (step.required_context) {
            for (const requiredField of step.required_context) {
                if (!(requiredField in context)) {
                    throw new Error(`Required context field missing: ${requiredField} for step ${step.id}`);
                }
            }
        }

        // Check resource availability
        if (step.resource_requirements) {
            await this.validateResourceAvailability(step.resource_requirements);
        }
    }

    /**
     * Prepares the execution context for a step
     * @param {Object} step - Step definition
     * @param {Object} context - Base execution context
     * @param {Object} workflowState - Current workflow state
     * @returns {Object} Prepared step context
     */
    async prepareStepContext(step, context, workflowState) {
        const stepContext = {
            ...context,
            step_id: step.id,
            step_name: step.name,
            step_type: step.type,
            workflow_id: workflowState.workflow_id,
            execution_id: workflowState.execution_id,
            dependency_results: {},
            previous_results: workflowState.step_results
        };

        // Add dependency results
        if (step.dependencies) {
            for (const depId of step.dependencies) {
                if (workflowState.step_results[depId]) {
                    stepContext.dependency_results[depId] = workflowState.step_results[depId];
                }
            }
        }

        // Add step-specific configuration
        if (step.config) {
            stepContext.step_config = step.config;
        }

        // Add environment variables
        stepContext.environment = {
            NODE_ENV: process.env.NODE_ENV || 'development',
            WORKFLOW_ID: workflowState.workflow_id,
            EXECUTION_ID: workflowState.execution_id,
            STEP_ID: step.id
        };

        return stepContext;
    }

    /**
     * Post-processes step execution result
     * @param {Object} step - Step definition
     * @param {Object} result - Raw step result
     * @param {Object} stepContext - Step execution context
     * @returns {Object} Processed result
     */
    async postProcessResult(step, result, stepContext) {
        const processedResult = {
            ...result,
            step_id: step.id,
            step_type: step.type,
            success: result.success !== false,
            timestamp: new Date(),
            context_snapshot: this.createContextSnapshot(stepContext)
        };

        // Apply result transformations if configured
        if (step.result_transformations) {
            for (const transformation of step.result_transformations) {
                processedResult.data = await this.applyTransformation(
                    transformation, 
                    processedResult.data
                );
            }
        }

        // Validate result schema if configured
        if (step.result_schema) {
            this.validateResultSchema(processedResult, step.result_schema);
        }

        return processedResult;
    }

    /**
     * Validates step execution result
     * @param {Object} step - Step definition
     * @param {Object} result - Step execution result
     */
    validateStepResult(step, result) {
        if (!result) {
            throw new Error(`Step ${step.id} returned null or undefined result`);
        }

        // Check for required result fields
        if (step.required_result_fields) {
            for (const field of step.required_result_fields) {
                if (!(field in result)) {
                    throw new Error(`Required result field missing: ${field} for step ${step.id}`);
                }
            }
        }

        // Check for error indicators
        if (result.error) {
            throw new Error(`Step ${step.id} reported error: ${result.error}`);
        }

        if (result.success === false) {
            throw new Error(`Step ${step.id} reported failure: ${result.message || 'Unknown error'}`);
        }
    }

    /**
     * Checks if an error is retryable
     * @param {Error} error - The error to check
     * @param {Object} step - Step definition
     * @returns {boolean} True if error is retryable
     */
    isRetryableError(error, step) {
        // Non-retryable error types
        const nonRetryableErrors = [
            'ValidationError',
            'AuthenticationError',
            'AuthorizationError',
            'ConfigurationError'
        ];

        if (nonRetryableErrors.includes(error.constructor.name)) {
            return false;
        }

        // Check step-specific retry configuration
        if (step.non_retryable_errors) {
            for (const pattern of step.non_retryable_errors) {
                if (error.message.includes(pattern)) {
                    return false;
                }
            }
        }

        // Timeout errors are generally retryable
        if (error.message.includes('timed out')) {
            return true;
        }

        // Network errors are generally retryable
        if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND') {
            return true;
        }

        // Default to retryable for unknown errors
        return true;
    }

    /**
     * Validates resource availability
     * @param {Object} requirements - Resource requirements
     */
    async validateResourceAvailability(requirements) {
        // This would check actual system resources
        // For now, just validate the format
        if (requirements.memory && typeof requirements.memory !== 'string') {
            throw new Error('Memory requirement must be a string (e.g., "1GB")');
        }
        
        if (requirements.cpu && typeof requirements.cpu !== 'string') {
            throw new Error('CPU requirement must be a string (e.g., "2 cores")');
        }
    }

    /**
     * Creates a snapshot of the execution context
     * @param {Object} stepContext - Step execution context
     * @returns {Object} Context snapshot
     */
    createContextSnapshot(stepContext) {
        return {
            step_id: stepContext.step_id,
            workflow_id: stepContext.workflow_id,
            execution_id: stepContext.execution_id,
            timestamp: new Date(),
            dependency_count: Object.keys(stepContext.dependency_results || {}).length
        };
    }

    /**
     * Applies a transformation to result data
     * @param {Object} transformation - Transformation configuration
     * @param {any} data - Data to transform
     * @returns {any} Transformed data
     */
    async applyTransformation(transformation, data) {
        switch (transformation.type) {
            case 'filter':
                return this.filterData(data, transformation.config);
            case 'map':
                return this.mapData(data, transformation.config);
            case 'reduce':
                return this.reduceData(data, transformation.config);
            default:
                throw new Error(`Unknown transformation type: ${transformation.type}`);
        }
    }

    /**
     * Validates result against schema
     * @param {Object} result - Result to validate
     * @param {Object} schema - Validation schema
     */
    validateResultSchema(result, schema) {
        // Simple schema validation - in production, use a proper schema validator
        for (const [field, type] of Object.entries(schema)) {
            if (!(field in result)) {
                throw new Error(`Schema validation failed: missing field ${field}`);
            }
            
            if (typeof result[field] !== type) {
                throw new Error(`Schema validation failed: field ${field} should be ${type}`);
            }
        }
    }

    /**
     * Updates execution metrics
     * @param {string} executionId - Execution identifier
     * @param {Object} result - Step execution result
     * @param {number} duration - Execution duration in milliseconds
     */
    updateExecutionMetrics(executionId, result, duration) {
        const metrics = {
            execution_id: executionId,
            duration,
            success: result.success !== false,
            timestamp: new Date(),
            memory_usage: result.resource_usage?.memory || 0,
            cpu_usage: result.resource_usage?.cpu || 0
        };

        this.executionMetrics.set(executionId, metrics);
        
        // Keep only recent metrics (last 1000 executions)
        if (this.executionMetrics.size > 1000) {
            const oldestKey = this.executionMetrics.keys().next().value;
            this.executionMetrics.delete(oldestKey);
        }
    }

    /**
     * Gets execution metrics for analysis
     * @returns {Array} Array of execution metrics
     */
    getExecutionMetrics() {
        return Array.from(this.executionMetrics.values());
    }

    /**
     * Generates a unique execution ID
     * @param {string} stepId - Step identifier
     * @param {string} workflowExecutionId - Workflow execution identifier
     * @returns {string} Unique execution ID
     */
    generateExecutionId(stepId, workflowExecutionId) {
        return `${workflowExecutionId}_${stepId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Utility function to create a delay
     * @param {number} ms - Delay in milliseconds
     * @returns {Promise} Promise that resolves after the delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Filters data based on configuration
     * @param {any} data - Data to filter
     * @param {Object} config - Filter configuration
     * @returns {any} Filtered data
     */
    filterData(data, config) {
        if (Array.isArray(data)) {
            return data.filter(item => this.evaluateFilterCondition(item, config.condition));
        }
        return data;
    }

    /**
     * Maps data based on configuration
     * @param {any} data - Data to map
     * @param {Object} config - Map configuration
     * @returns {any} Mapped data
     */
    mapData(data, config) {
        if (Array.isArray(data)) {
            return data.map(item => this.applyMapping(item, config.mapping));
        }
        return this.applyMapping(data, config.mapping);
    }

    /**
     * Reduces data based on configuration
     * @param {any} data - Data to reduce
     * @param {Object} config - Reduce configuration
     * @returns {any} Reduced data
     */
    reduceData(data, config) {
        if (Array.isArray(data)) {
            return data.reduce((acc, item) => {
                return this.applyReduction(acc, item, config.reducer);
            }, config.initialValue);
        }
        return data;
    }

    /**
     * Evaluates a filter condition
     * @param {any} item - Item to evaluate
     * @param {Object} condition - Filter condition
     * @returns {boolean} True if condition is met
     */
    evaluateFilterCondition(item, condition) {
        // Simple condition evaluation - extend as needed
        return true;
    }

    /**
     * Applies a mapping transformation
     * @param {any} item - Item to map
     * @param {Object} mapping - Mapping configuration
     * @returns {any} Mapped item
     */
    applyMapping(item, mapping) {
        // Simple mapping - extend as needed
        return item;
    }

    /**
     * Applies a reduction operation
     * @param {any} accumulator - Current accumulator value
     * @param {any} item - Current item
     * @param {Object} reducer - Reducer configuration
     * @returns {any} Updated accumulator
     */
    applyReduction(accumulator, item, reducer) {
        // Simple reduction - extend as needed
        return accumulator;
    }

    /**
     * Gets currently active executions
     * @returns {Array} Array of active execution info
     */
    getActiveExecutions() {
        return Array.from(this.activeExecutions.values());
    }

    /**
     * Cancels an active execution
     * @param {string} executionId - Execution to cancel
     * @returns {boolean} True if cancellation was successful
     */
    async cancelExecution(executionId) {
        const execution = this.activeExecutions.get(executionId);
        if (!execution) {
            return false;
        }

        execution.status = 'cancelled';
        this.activeExecutions.delete(executionId);
        
        this.emit('step_cancelled', { executionId, stepId: execution.stepId });
        return true;
    }

    /**
     * Cleanup resources
     */
    destroy() {
        this.activeExecutions.clear();
        this.executionMetrics.clear();
        this.removeAllListeners();
    }
}

