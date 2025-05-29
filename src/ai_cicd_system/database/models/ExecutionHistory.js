/**
 * @fileoverview Execution History Model
 * @description Model for tracking detailed execution history of CI/CD operations
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Execution History model class
 */
export class ExecutionHistory {
    constructor(data = {}) {
        this.id = data.id || uuidv4();
        this.task_id = data.task_id || null;
        this.execution_type = data.execution_type || 'task_processing';
        this.execution_phase = data.execution_phase || 'initialization';
        this.status = data.status || 'pending';
        this.started_at = data.started_at || new Date();
        this.completed_at = data.completed_at || null;
        this.duration_ms = data.duration_ms || null;
        this.cpu_usage_percent = data.cpu_usage_percent || null;
        this.memory_usage_mb = data.memory_usage_mb || null;
        this.exit_code = data.exit_code || null;
        this.stdout_preview = data.stdout_preview || null;
        this.stderr_preview = data.stderr_preview || null;
        this.error_message = data.error_message || null;
        this.error_stack = data.error_stack || null;
        this.retry_count = data.retry_count || 0;
        this.retry_of = data.retry_of || null;
        this.environment_info = data.environment_info || {};
        this.performance_metrics = data.performance_metrics || {};
        this.metadata = data.metadata || {};
    }

    /**
     * Validate execution history data
     * @returns {Object} Validation result
     */
    validate() {
        const errors = [];
        const warnings = [];

        // Required fields
        if (!this.task_id) {
            errors.push('Task ID is required');
        }

        // Execution type validation
        const validTypes = [
            'task_processing', 'code_generation', 'validation', 'testing',
            'deployment', 'rollback', 'cleanup', 'monitoring'
        ];
        if (!validTypes.includes(this.execution_type)) {
            errors.push(`Invalid execution type. Must be one of: ${validTypes.join(', ')}`);
        }

        // Execution phase validation
        const validPhases = [
            'initialization', 'preparation', 'execution', 'validation',
            'finalization', 'cleanup', 'error_handling'
        ];
        if (!validPhases.includes(this.execution_phase)) {
            errors.push(`Invalid execution phase. Must be one of: ${validPhases.join(', ')}`);
        }

        // Status validation
        const validStatuses = [
            'pending', 'running', 'completed', 'failed', 'cancelled',
            'timeout', 'retry', 'skipped'
        ];
        if (!validStatuses.includes(this.status)) {
            errors.push(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
        }

        // Duration validation
        if (this.duration_ms !== null && this.duration_ms < 0) {
            errors.push('Duration cannot be negative');
        }

        // Resource usage validation
        if (this.cpu_usage_percent !== null) {
            if (this.cpu_usage_percent < 0 || this.cpu_usage_percent > 100) {
                errors.push('CPU usage must be between 0 and 100 percent');
            }
        }

        if (this.memory_usage_mb !== null && this.memory_usage_mb < 0) {
            errors.push('Memory usage cannot be negative');
        }

        // Retry validation
        if (this.retry_count < 0) {
            errors.push('Retry count cannot be negative');
        }

        // Status consistency checks
        if (this.status === 'completed' && !this.completed_at) {
            warnings.push('Completed status should have completion timestamp');
        }

        if (this.status === 'running' && this.completed_at) {
            warnings.push('Running status should not have completion timestamp');
        }

        if (this.status === 'failed' && !this.error_message) {
            warnings.push('Failed status should have error message');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Start execution tracking
     * @param {Object} environment - Environment information
     */
    start(environment = {}) {
        this.status = 'running';
        this.started_at = new Date();
        this.completed_at = null;
        this.duration_ms = null;
        this.environment_info = {
            ...this.environment_info,
            ...environment,
            start_timestamp: this.started_at.toISOString()
        };
    }

    /**
     * Complete execution tracking
     * @param {string} status - Final status
     * @param {Object} results - Execution results
     */
    complete(status, results = {}) {
        this.status = status;
        this.completed_at = new Date();
        
        if (this.started_at) {
            this.duration_ms = this.completed_at.getTime() - this.started_at.getTime();
        }

        // Update results if provided
        if (results.exit_code !== undefined) this.exit_code = results.exit_code;
        if (results.stdout_preview) this.stdout_preview = this.truncateOutput(results.stdout_preview);
        if (results.stderr_preview) this.stderr_preview = this.truncateOutput(results.stderr_preview);
        if (results.error_message) this.error_message = results.error_message;
        if (results.error_stack) this.error_stack = results.error_stack;
        if (results.cpu_usage_percent !== undefined) this.cpu_usage_percent = results.cpu_usage_percent;
        if (results.memory_usage_mb !== undefined) this.memory_usage_mb = results.memory_usage_mb;
        if (results.performance_metrics) {
            this.performance_metrics = { ...this.performance_metrics, ...results.performance_metrics };
        }
    }

    /**
     * Mark execution as failed
     * @param {Error|string} error - Error information
     * @param {Object} context - Additional context
     */
    fail(error, context = {}) {
        this.status = 'failed';
        this.completed_at = new Date();
        
        if (this.started_at) {
            this.duration_ms = this.completed_at.getTime() - this.started_at.getTime();
        }

        if (error instanceof Error) {
            this.error_message = error.message;
            this.error_stack = error.stack;
        } else if (typeof error === 'string') {
            this.error_message = error;
        }

        // Add failure context
        this.metadata = {
            ...this.metadata,
            failure_context: {
                ...context,
                failure_timestamp: this.completed_at.toISOString()
            }
        };
    }

    /**
     * Create retry execution
     * @param {Object} options - Retry options
     * @returns {ExecutionHistory} New retry execution
     */
    createRetry(options = {}) {
        const retry = new ExecutionHistory({
            task_id: this.task_id,
            execution_type: this.execution_type,
            execution_phase: this.execution_phase,
            retry_count: this.retry_count + 1,
            retry_of: this.id,
            environment_info: { ...this.environment_info },
            metadata: {
                ...this.metadata,
                retry_reason: options.reason || 'automatic_retry',
                original_execution_id: this.id
            }
        });

        return retry;
    }

    /**
     * Update resource usage
     * @param {Object} usage - Resource usage data
     */
    updateResourceUsage(usage) {
        if (usage.cpu_usage_percent !== undefined) {
            this.cpu_usage_percent = usage.cpu_usage_percent;
        }
        if (usage.memory_usage_mb !== undefined) {
            this.memory_usage_mb = usage.memory_usage_mb;
        }
        
        // Store in performance metrics for historical tracking
        const timestamp = new Date().toISOString();
        if (!this.performance_metrics.resource_usage) {
            this.performance_metrics.resource_usage = [];
        }
        
        this.performance_metrics.resource_usage.push({
            timestamp,
            ...usage
        });
    }

    /**
     * Add performance metric
     * @param {string} name - Metric name
     * @param {number} value - Metric value
     * @param {string} unit - Metric unit
     */
    addPerformanceMetric(name, value, unit = null) {
        if (!this.performance_metrics.custom_metrics) {
            this.performance_metrics.custom_metrics = {};
        }
        
        this.performance_metrics.custom_metrics[name] = {
            value,
            unit,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Truncate output for storage
     * @param {string} output - Output text
     * @param {number} maxLength - Maximum length
     * @returns {string} Truncated output
     */
    truncateOutput(output, maxLength = 5000) {
        if (!output || output.length <= maxLength) {
            return output;
        }
        
        return output.substring(0, maxLength) + '\n... [truncated]';
    }

    /**
     * Get execution duration in human readable format
     * @returns {string} Formatted duration
     */
    getFormattedDuration() {
        if (!this.duration_ms) {
            return 'N/A';
        }

        const seconds = Math.floor(this.duration_ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else if (seconds > 0) {
            return `${seconds}s`;
        } else {
            return `${this.duration_ms}ms`;
        }
    }

    /**
     * Check if execution was successful
     * @returns {boolean} True if successful
     */
    isSuccessful() {
        return this.status === 'completed' && (this.exit_code === null || this.exit_code === 0);
    }

    /**
     * Check if execution failed
     * @returns {boolean} True if failed
     */
    isFailed() {
        return ['failed', 'timeout', 'cancelled'].includes(this.status) || 
               (this.exit_code !== null && this.exit_code !== 0);
    }

    /**
     * Check if execution is complete
     * @returns {boolean} True if complete
     */
    isComplete() {
        return ['completed', 'failed', 'timeout', 'cancelled', 'skipped'].includes(this.status);
    }

    /**
     * Get execution summary
     * @returns {Object} Summary information
     */
    getSummary() {
        return {
            id: this.id,
            task_id: this.task_id,
            execution_type: this.execution_type,
            execution_phase: this.execution_phase,
            status: this.status,
            duration: this.getFormattedDuration(),
            duration_ms: this.duration_ms,
            cpu_usage_percent: this.cpu_usage_percent,
            memory_usage_mb: this.memory_usage_mb,
            exit_code: this.exit_code,
            retry_count: this.retry_count,
            is_retry: !!this.retry_of,
            is_successful: this.isSuccessful(),
            is_failed: this.isFailed(),
            is_complete: this.isComplete(),
            has_error: !!this.error_message,
            started_at: this.started_at,
            completed_at: this.completed_at
        };
    }

    /**
     * Convert to database record format
     * @returns {Object} Database record
     */
    toRecord() {
        return {
            id: this.id,
            task_id: this.task_id,
            execution_type: this.execution_type,
            execution_phase: this.execution_phase,
            status: this.status,
            started_at: this.started_at,
            completed_at: this.completed_at,
            duration_ms: this.duration_ms,
            cpu_usage_percent: this.cpu_usage_percent,
            memory_usage_mb: this.memory_usage_mb,
            exit_code: this.exit_code,
            stdout_preview: this.stdout_preview,
            stderr_preview: this.stderr_preview,
            error_message: this.error_message,
            error_stack: this.error_stack,
            retry_count: this.retry_count,
            retry_of: this.retry_of,
            environment_info: JSON.stringify(this.environment_info),
            performance_metrics: JSON.stringify(this.performance_metrics),
            metadata: JSON.stringify(this.metadata)
        };
    }

    /**
     * Create from database record
     * @param {Object} record - Database record
     * @returns {ExecutionHistory} ExecutionHistory instance
     */
    static fromRecord(record) {
        const data = { ...record };
        
        // Parse JSON fields
        if (typeof data.environment_info === 'string') {
            try {
                data.environment_info = JSON.parse(data.environment_info);
            } catch (e) {
                data.environment_info = {};
            }
        }

        if (typeof data.performance_metrics === 'string') {
            try {
                data.performance_metrics = JSON.parse(data.performance_metrics);
            } catch (e) {
                data.performance_metrics = {};
            }
        }

        if (typeof data.metadata === 'string') {
            try {
                data.metadata = JSON.parse(data.metadata);
            } catch (e) {
                data.metadata = {};
            }
        }

        return new ExecutionHistory(data);
    }

    /**
     * Create execution for task processing
     * @param {string} taskId - Task ID
     * @param {string} executionType - Execution type
     * @param {Object} options - Additional options
     * @returns {ExecutionHistory} ExecutionHistory instance
     */
    static forTask(taskId, executionType = 'task_processing', options = {}) {
        return new ExecutionHistory({
            task_id: taskId,
            execution_type: executionType,
            execution_phase: options.phase || 'initialization',
            environment_info: options.environment || {},
            metadata: options.metadata || {}
        });
    }
}

export default ExecutionHistory;

