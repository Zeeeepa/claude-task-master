/**
 * Parallel Processor
 * Handles concurrent execution of workflow steps with resource management
 */

import { EventEmitter } from 'events';

export class ParallelProcessor extends EventEmitter {
    constructor(stepExecutor, options = {}) {
        super();
        this.stepExecutor = stepExecutor;
        this.options = {
            maxConcurrentSteps: options.maxConcurrentSteps || 5,
            resourceLimits: {
                memory: options.memoryLimit || '4GB',
                cpu: options.cpuLimit || '4 cores',
                disk: options.diskLimit || '20GB'
            },
            queueTimeout: options.queueTimeout || 30000,
            enableLoadBalancing: options.enableLoadBalancing || true,
            enableResourceMonitoring: options.enableResourceMonitoring || true,
            ...options
        };
        
        this.activeExecutions = new Map();
        this.executionQueue = [];
        this.resourceUsage = {
            memory: 0,
            cpu: 0,
            disk: 0,
            activeSteps: 0
        };
        
        this.setupResourceMonitoring();
    }

    /**
     * Executes a batch of steps in parallel
     * @param {Array} stepBatch - Array of steps to execute in parallel
     * @param {Object} context - Execution context
     * @param {Object} workflowState - Current workflow state
     * @returns {Array} Array of step execution results
     */
    async executeBatch(stepBatch, context, workflowState) {
        if (!stepBatch || stepBatch.length === 0) {
            return [];
        }

        const batchId = this.generateBatchId(workflowState.execution_id);
        const startTime = Date.now();

        try {
            this.emit('batch_started', { 
                batchId, 
                stepCount: stepBatch.length,
                workflowId: workflowState.workflow_id 
            });

            // Validate batch can be executed
            await this.validateBatchExecution(stepBatch, workflowState);

            // Optimize execution order
            const optimizedBatch = this.optimizeBatchExecution(stepBatch);

            // Execute steps with concurrency control
            const results = await this.executeWithConcurrencyControl(
                optimizedBatch, 
                context, 
                workflowState,
                batchId
            );

            const duration = Date.now() - startTime;
            
            this.emit('batch_completed', { 
                batchId, 
                results, 
                duration,
                successCount: results.filter(r => r.success !== false).length,
                failureCount: results.filter(r => r.success === false).length
            });

            return results;

        } catch (error) {
            this.emit('batch_failed', { 
                batchId, 
                error,
                duration: Date.now() - startTime
            });
            throw error;
        }
    }

    /**
     * Executes steps with concurrency control and resource management
     * @param {Array} steps - Steps to execute
     * @param {Object} context - Execution context
     * @param {Object} workflowState - Workflow state
     * @param {string} batchId - Batch identifier
     * @returns {Array} Execution results
     */
    async executeWithConcurrencyControl(steps, context, workflowState, batchId) {
        const results = [];
        const executing = new Map();
        const pending = [...steps];
        const completed = new Set();
        const failed = new Set();

        while (pending.length > 0 || executing.size > 0) {
            // Start new executions if we have capacity
            while (pending.length > 0 && 
                   executing.size < this.options.maxConcurrentSteps &&
                   this.hasAvailableResources()) {
                
                const step = pending.shift();
                const executionPromise = this.executeStepWithResourceTracking(
                    step, 
                    context, 
                    workflowState,
                    batchId
                );
                
                executing.set(step.id, {
                    step,
                    promise: executionPromise,
                    startTime: Date.now()
                });

                this.emit('step_queued', { 
                    stepId: step.id, 
                    batchId,
                    queuePosition: executing.size 
                });
            }

            // Wait for at least one execution to complete
            if (executing.size > 0) {
                const completedExecution = await this.waitForAnyCompletion(executing);
                const { stepId, result, error } = completedExecution;
                
                executing.delete(stepId);
                
                if (error) {
                    failed.add(stepId);
                    results.push({
                        stepId,
                        success: false,
                        error: error.message,
                        timestamp: new Date()
                    });
                    
                    // Handle failure strategy
                    await this.handleStepFailure(stepId, error, pending, executing, batchId);
                } else {
                    completed.add(stepId);
                    results.push(result);
                }
            }

            // Check for deadlock or timeout
            if (pending.length > 0 && executing.size === 0) {
                throw new Error(`Deadlock detected in batch ${batchId}: no steps can be executed`);
            }
        }

        return results;
    }

    /**
     * Executes a single step with resource tracking
     * @param {Object} step - Step to execute
     * @param {Object} context - Execution context
     * @param {Object} workflowState - Workflow state
     * @param {string} batchId - Batch identifier
     * @returns {Object} Step execution result
     */
    async executeStepWithResourceTracking(step, context, workflowState, batchId) {
        const resourceReservation = await this.reserveResources(step);
        
        try {
            this.resourceUsage.activeSteps++;
            
            const result = await this.stepExecutor.executeStep(step, context, workflowState);
            
            // Add batch metadata to result
            result.batch_id = batchId;
            result.parallel_execution = true;
            result.resource_reservation = resourceReservation;
            
            return result;
            
        } finally {
            this.resourceUsage.activeSteps--;
            await this.releaseResources(resourceReservation);
        }
    }

    /**
     * Waits for any execution to complete
     * @param {Map} executing - Map of executing steps
     * @returns {Object} Completion result
     */
    async waitForAnyCompletion(executing) {
        const promises = Array.from(executing.entries()).map(([stepId, execution]) => 
            execution.promise
                .then(result => ({ stepId, result, error: null }))
                .catch(error => ({ stepId, result: null, error }))
        );

        return await Promise.race(promises);
    }

    /**
     * Validates that a batch can be executed
     * @param {Array} stepBatch - Steps to validate
     * @param {Object} workflowState - Current workflow state
     */
    async validateBatchExecution(stepBatch, workflowState) {
        // Check for conflicting resource requirements
        const totalResourceRequirements = this.calculateTotalResourceRequirements(stepBatch);
        
        if (!this.canSatisfyResourceRequirements(totalResourceRequirements)) {
            throw new Error('Insufficient resources to execute batch');
        }

        // Validate all steps can run in parallel
        for (const step of stepBatch) {
            if (step.parallel === false) {
                throw new Error(`Step ${step.id} cannot be executed in parallel`);
            }
        }

        // Check for mutual exclusions
        this.validateMutualExclusions(stepBatch);
    }

    /**
     * Optimizes the execution order of steps in a batch
     * @param {Array} stepBatch - Steps to optimize
     * @returns {Array} Optimized step order
     */
    optimizeBatchExecution(stepBatch) {
        if (!this.options.enableLoadBalancing) {
            return stepBatch;
        }

        // Sort by priority and resource requirements
        return stepBatch.sort((a, b) => {
            // Higher priority first
            const priorityA = a.priority || 0;
            const priorityB = b.priority || 0;
            if (priorityA !== priorityB) {
                return priorityB - priorityA;
            }

            // Shorter timeout first (faster steps)
            const timeoutA = a.timeout || 300000;
            const timeoutB = b.timeout || 300000;
            return timeoutA - timeoutB;
        });
    }

    /**
     * Reserves resources for step execution
     * @param {Object} step - Step requiring resources
     * @returns {Object} Resource reservation
     */
    async reserveResources(step) {
        const requirements = step.resource_requirements || {};
        const reservation = {
            stepId: step.id,
            memory: this.parseMemoryRequirement(requirements.memory || '512MB'),
            cpu: this.parseCpuRequirement(requirements.cpu || '0.5 cores'),
            disk: this.parseDiskRequirement(requirements.disk || '1GB'),
            timestamp: new Date()
        };

        // Wait for resources to become available
        await this.waitForResourceAvailability(reservation);

        // Reserve the resources
        this.resourceUsage.memory += reservation.memory;
        this.resourceUsage.cpu += reservation.cpu;
        this.resourceUsage.disk += reservation.disk;

        this.emit('resources_reserved', { 
            stepId: step.id, 
            reservation,
            totalUsage: { ...this.resourceUsage }
        });

        return reservation;
    }

    /**
     * Releases reserved resources
     * @param {Object} reservation - Resource reservation to release
     */
    async releaseResources(reservation) {
        this.resourceUsage.memory -= reservation.memory;
        this.resourceUsage.cpu -= reservation.cpu;
        this.resourceUsage.disk -= reservation.disk;

        // Ensure we don't go negative
        this.resourceUsage.memory = Math.max(0, this.resourceUsage.memory);
        this.resourceUsage.cpu = Math.max(0, this.resourceUsage.cpu);
        this.resourceUsage.disk = Math.max(0, this.resourceUsage.disk);

        this.emit('resources_released', { 
            stepId: reservation.stepId, 
            reservation,
            totalUsage: { ...this.resourceUsage }
        });
    }

    /**
     * Waits for resource availability
     * @param {Object} reservation - Required resource reservation
     */
    async waitForResourceAvailability(reservation) {
        const maxWaitTime = this.options.queueTimeout;
        const startTime = Date.now();

        while (!this.canReserveResources(reservation)) {
            if (Date.now() - startTime > maxWaitTime) {
                throw new Error(`Timeout waiting for resources for step ${reservation.stepId}`);
            }

            await this.delay(100); // Check every 100ms
        }
    }

    /**
     * Checks if resources can be reserved
     * @param {Object} reservation - Resource reservation to check
     * @returns {boolean} True if resources can be reserved
     */
    canReserveResources(reservation) {
        const limits = this.parseResourceLimits();
        
        return (
            this.resourceUsage.memory + reservation.memory <= limits.memory &&
            this.resourceUsage.cpu + reservation.cpu <= limits.cpu &&
            this.resourceUsage.disk + reservation.disk <= limits.disk
        );
    }

    /**
     * Checks if there are available resources for new executions
     * @returns {boolean} True if resources are available
     */
    hasAvailableResources() {
        const limits = this.parseResourceLimits();
        const utilizationThreshold = 0.8; // 80% utilization threshold

        return (
            this.resourceUsage.memory / limits.memory < utilizationThreshold &&
            this.resourceUsage.cpu / limits.cpu < utilizationThreshold &&
            this.resourceUsage.disk / limits.disk < utilizationThreshold
        );
    }

    /**
     * Calculates total resource requirements for a batch
     * @param {Array} stepBatch - Steps in the batch
     * @returns {Object} Total resource requirements
     */
    calculateTotalResourceRequirements(stepBatch) {
        return stepBatch.reduce((total, step) => {
            const requirements = step.resource_requirements || {};
            return {
                memory: total.memory + this.parseMemoryRequirement(requirements.memory || '512MB'),
                cpu: total.cpu + this.parseCpuRequirement(requirements.cpu || '0.5 cores'),
                disk: total.disk + this.parseDiskRequirement(requirements.disk || '1GB')
            };
        }, { memory: 0, cpu: 0, disk: 0 });
    }

    /**
     * Checks if resource requirements can be satisfied
     * @param {Object} requirements - Resource requirements
     * @returns {boolean} True if requirements can be satisfied
     */
    canSatisfyResourceRequirements(requirements) {
        const limits = this.parseResourceLimits();
        
        return (
            requirements.memory <= limits.memory &&
            requirements.cpu <= limits.cpu &&
            requirements.disk <= limits.disk
        );
    }

    /**
     * Validates mutual exclusions between steps
     * @param {Array} stepBatch - Steps to validate
     */
    validateMutualExclusions(stepBatch) {
        const exclusionGroups = new Map();

        for (const step of stepBatch) {
            if (step.exclusion_group) {
                if (exclusionGroups.has(step.exclusion_group)) {
                    throw new Error(
                        `Steps ${exclusionGroups.get(step.exclusion_group)} and ${step.id} ` +
                        `cannot run in parallel (exclusion group: ${step.exclusion_group})`
                    );
                }
                exclusionGroups.set(step.exclusion_group, step.id);
            }
        }
    }

    /**
     * Handles step failure in parallel execution
     * @param {string} stepId - Failed step ID
     * @param {Error} error - Error that occurred
     * @param {Array} pending - Pending steps
     * @param {Map} executing - Currently executing steps
     * @param {string} batchId - Batch identifier
     */
    async handleStepFailure(stepId, error, pending, executing, batchId) {
        this.emit('parallel_step_failed', { stepId, error, batchId });

        // Check if failure should cancel other steps
        const failureStrategy = this.options.failureStrategy || 'continue';
        
        switch (failureStrategy) {
            case 'fail_fast':
                // Cancel all pending and executing steps
                pending.length = 0;
                for (const [execStepId, execution] of executing) {
                    await this.cancelStepExecution(execStepId, execution);
                }
                executing.clear();
                break;
                
            case 'fail_dependent':
                // Cancel steps that depend on the failed step
                this.cancelDependentSteps(stepId, pending, executing);
                break;
                
            case 'continue':
            default:
                // Continue with other steps
                break;
        }
    }

    /**
     * Cancels dependent steps when a step fails
     * @param {string} failedStepId - ID of the failed step
     * @param {Array} pending - Pending steps
     * @param {Map} executing - Currently executing steps
     */
    cancelDependentSteps(failedStepId, pending, executing) {
        // Remove dependent steps from pending
        for (let i = pending.length - 1; i >= 0; i--) {
            const step = pending[i];
            if (step.dependencies && step.dependencies.includes(failedStepId)) {
                pending.splice(i, 1);
                this.emit('step_cancelled_due_to_dependency', { 
                    stepId: step.id, 
                    failedDependency: failedStepId 
                });
            }
        }

        // Cancel executing dependent steps
        for (const [stepId, execution] of executing) {
            if (execution.step.dependencies && 
                execution.step.dependencies.includes(failedStepId)) {
                this.cancelStepExecution(stepId, execution);
                executing.delete(stepId);
            }
        }
    }

    /**
     * Cancels a step execution
     * @param {string} stepId - Step to cancel
     * @param {Object} execution - Execution info
     */
    async cancelStepExecution(stepId, execution) {
        // This would need to be implemented based on how step cancellation works
        this.emit('step_execution_cancelled', { stepId });
    }

    /**
     * Parses memory requirement string to bytes
     * @param {string} memoryStr - Memory requirement (e.g., "1GB", "512MB")
     * @returns {number} Memory in bytes
     */
    parseMemoryRequirement(memoryStr) {
        const units = { 'B': 1, 'KB': 1024, 'MB': 1024**2, 'GB': 1024**3 };
        const match = memoryStr.match(/^(\d+(?:\.\d+)?)\s*([KMGT]?B)$/i);
        
        if (!match) {
            throw new Error(`Invalid memory format: ${memoryStr}`);
        }
        
        const value = parseFloat(match[1]);
        const unit = match[2].toUpperCase();
        
        return value * (units[unit] || 1);
    }

    /**
     * Parses CPU requirement string to cores
     * @param {string} cpuStr - CPU requirement (e.g., "2 cores", "0.5 core")
     * @returns {number} CPU cores
     */
    parseCpuRequirement(cpuStr) {
        const match = cpuStr.match(/^(\d+(?:\.\d+)?)\s*cores?$/i);
        
        if (!match) {
            throw new Error(`Invalid CPU format: ${cpuStr}`);
        }
        
        return parseFloat(match[1]);
    }

    /**
     * Parses disk requirement string to bytes
     * @param {string} diskStr - Disk requirement (e.g., "10GB", "500MB")
     * @returns {number} Disk space in bytes
     */
    parseDiskRequirement(diskStr) {
        return this.parseMemoryRequirement(diskStr); // Same format
    }

    /**
     * Parses resource limits from configuration
     * @returns {Object} Parsed resource limits
     */
    parseResourceLimits() {
        return {
            memory: this.parseMemoryRequirement(this.options.resourceLimits.memory),
            cpu: this.parseCpuRequirement(this.options.resourceLimits.cpu),
            disk: this.parseDiskRequirement(this.options.resourceLimits.disk)
        };
    }

    /**
     * Sets up resource monitoring
     */
    setupResourceMonitoring() {
        if (!this.options.enableResourceMonitoring) {
            return;
        }

        setInterval(() => {
            this.emit('resource_usage_update', {
                usage: { ...this.resourceUsage },
                limits: this.parseResourceLimits(),
                utilization: this.calculateResourceUtilization()
            });
        }, 5000); // Every 5 seconds
    }

    /**
     * Calculates current resource utilization
     * @returns {Object} Resource utilization percentages
     */
    calculateResourceUtilization() {
        const limits = this.parseResourceLimits();
        
        return {
            memory: (this.resourceUsage.memory / limits.memory) * 100,
            cpu: (this.resourceUsage.cpu / limits.cpu) * 100,
            disk: (this.resourceUsage.disk / limits.disk) * 100,
            activeSteps: this.resourceUsage.activeSteps
        };
    }

    /**
     * Generates a unique batch ID
     * @param {string} workflowExecutionId - Workflow execution ID
     * @returns {string} Unique batch ID
     */
    generateBatchId(workflowExecutionId) {
        return `batch_${workflowExecutionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
     * Gets current resource usage statistics
     * @returns {Object} Resource usage statistics
     */
    getResourceUsage() {
        return {
            current: { ...this.resourceUsage },
            limits: this.parseResourceLimits(),
            utilization: this.calculateResourceUtilization(),
            activeExecutions: this.activeExecutions.size
        };
    }

    /**
     * Gets performance metrics for parallel execution
     * @returns {Object} Performance metrics
     */
    getPerformanceMetrics() {
        // This would collect and return performance metrics
        return {
            averageConcurrency: 0,
            resourceEfficiency: 0,
            throughput: 0,
            queueWaitTime: 0
        };
    }

    /**
     * Cleanup resources
     */
    destroy() {
        this.activeExecutions.clear();
        this.executionQueue.length = 0;
        this.removeAllListeners();
    }
}

