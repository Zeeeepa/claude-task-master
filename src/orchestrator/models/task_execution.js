/**
 * @fileoverview Task Execution Model
 * @description Model for tracking task execution state and progress
 */

import { v4 as uuidv4 } from 'uuid';
import { log } from '../../utils/logger.js';

/**
 * Task Execution Model - Tracks execution state and progress
 */
export class TaskExecution {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.task_id = data.task_id;
    this.agent_type = data.agent_type || 'claude-code';
    this.status = data.status || 'pending';
    this.workflow_type = data.workflow_type || 'default';
    
    // Timestamps
    this.created_at = data.created_at || new Date();
    this.started_at = data.started_at || null;
    this.completed_at = data.completed_at || null;
    this.failed_at = data.failed_at || null;
    this.cancelled_at = data.cancelled_at || null;
    this.updated_at = data.updated_at || new Date();
    
    // Execution details
    this.current_stage = data.current_stage || null;
    this.stage_progress = data.stage_progress || 0;
    this.logs = data.logs || [];
    this.error = data.error || null;
    this.stack_trace = data.stack_trace || null;
    this.workflow_result = data.workflow_result || null;
    
    // Performance metrics
    this.execution_time_ms = data.execution_time_ms || null;
    this.stage_timings = data.stage_timings || {};
    this.resource_usage = data.resource_usage || {};
    
    // Retry information
    this.retry_count = data.retry_count || 0;
    this.max_retries = data.max_retries || 3;
    this.last_retry_at = data.last_retry_at || null;
    
    // Additional metadata
    this.metadata = data.metadata || {};
    this.tags = data.tags || [];
  }

  /**
   * Create a new task execution
   * @param {Object} data - Execution data
   * @returns {Promise<TaskExecution>} Created execution
   */
  static async create(data) {
    const execution = new TaskExecution(data);
    
    log('info', '📝 Creating task execution', {
      id: execution.id,
      taskId: execution.task_id,
      agentType: execution.agent_type,
      workflowType: execution.workflow_type
    });

    // TODO: Save to database
    await execution.save();
    
    return execution;
  }

  /**
   * Find execution by ID
   * @param {string} id - Execution ID
   * @returns {Promise<TaskExecution|null>} Found execution
   */
  static async findById(id) {
    // TODO: Implement database lookup
    log('info', '🔍 Finding task execution by ID', { id });
    return null;
  }

  /**
   * Find executions by task ID
   * @param {string} taskId - Task ID
   * @returns {Promise<Array>} Found executions
   */
  static async findByTaskId(taskId) {
    // TODO: Implement database lookup
    log('info', '🔍 Finding task executions by task ID', { taskId });
    return [];
  }

  /**
   * Find executions by status
   * @param {string} status - Execution status
   * @returns {Promise<Array>} Found executions
   */
  static async findByStatus(status) {
    // TODO: Implement database lookup
    log('info', '🔍 Finding task executions by status', { status });
    return [];
  }

  /**
   * Update execution status
   * @param {string} status - New status
   * @param {Object} additionalData - Additional data to update
   * @returns {Promise<void>}
   */
  async updateStatus(status, additionalData = {}) {
    const oldStatus = this.status;
    this.status = status;
    this.updated_at = new Date();
    
    // Set appropriate timestamps
    switch (status) {
      case 'running':
        if (!this.started_at) {
          this.started_at = new Date();
        }
        break;
      case 'completed':
        this.completed_at = new Date();
        this.execution_time_ms = this.getExecutionTime();
        break;
      case 'failed':
        this.failed_at = new Date();
        this.execution_time_ms = this.getExecutionTime();
        break;
      case 'cancelled':
        this.cancelled_at = new Date();
        this.execution_time_ms = this.getExecutionTime();
        break;
    }
    
    // Apply additional data
    Object.assign(this, additionalData);
    
    log('info', `📊 Execution status updated: ${oldStatus} → ${status}`, {
      id: this.id,
      taskId: this.task_id,
      currentStage: this.current_stage,
      progress: this.stage_progress
    });

    await this.save();
  }

  /**
   * Add log entry
   * @param {Object} logEntry - Log entry data
   * @returns {Promise<void>}
   */
  async updateLogs(logEntry) {
    const entry = {
      id: uuidv4(),
      timestamp: new Date(),
      ...logEntry
    };
    
    this.logs.push(entry);
    this.updated_at = new Date();
    
    log('info', '📝 Added execution log entry', {
      executionId: this.id,
      stage: entry.stage,
      type: entry.type || 'info'
    });

    await this.save();
  }

  /**
   * Get execution logs
   * @param {Object} filters - Log filters
   * @returns {Array} Filtered logs
   */
  async getLogs(filters = {}) {
    let logs = [...this.logs];
    
    if (filters.stage) {
      logs = logs.filter(log => log.stage === filters.stage);
    }
    
    if (filters.type) {
      logs = logs.filter(log => log.type === filters.type);
    }
    
    if (filters.since) {
      const sinceDate = new Date(filters.since);
      logs = logs.filter(log => new Date(log.timestamp) >= sinceDate);
    }
    
    if (filters.limit) {
      logs = logs.slice(-filters.limit);
    }
    
    return logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  /**
   * Get execution time in milliseconds
   * @returns {number} Execution time
   */
  getExecutionTime() {
    if (!this.started_at) return 0;
    
    const endTime = this.completed_at || this.failed_at || this.cancelled_at || new Date();
    return endTime.getTime() - this.started_at.getTime();
  }

  /**
   * Get execution duration in human readable format
   * @returns {string} Duration string
   */
  getDurationString() {
    const ms = this.getExecutionTime();
    
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.round((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  }

  /**
   * Check if execution is active
   * @returns {boolean} True if active
   */
  isActive() {
    return ['pending', 'running'].includes(this.status);
  }

  /**
   * Check if execution is complete
   * @returns {boolean} True if complete
   */
  isComplete() {
    return ['completed', 'failed', 'cancelled'].includes(this.status);
  }

  /**
   * Check if execution can be retried
   * @returns {boolean} True if can retry
   */
  canRetry() {
    return this.status === 'failed' && this.retry_count < this.max_retries;
  }

  /**
   * Increment retry count
   * @returns {Promise<void>}
   */
  async incrementRetry() {
    this.retry_count++;
    this.last_retry_at = new Date();
    this.updated_at = new Date();
    
    log('info', '🔄 Execution retry incremented', {
      id: this.id,
      retryCount: this.retry_count,
      maxRetries: this.max_retries
    });

    await this.save();
  }

  /**
   * Record stage timing
   * @param {string} stage - Stage name
   * @param {number} duration - Duration in milliseconds
   * @returns {Promise<void>}
   */
  async recordStageTiming(stage, duration) {
    this.stage_timings[stage] = duration;
    this.updated_at = new Date();
    
    log('info', '⏱️ Stage timing recorded', {
      executionId: this.id,
      stage,
      duration: `${duration}ms`
    });

    await this.save();
  }

  /**
   * Record resource usage
   * @param {Object} usage - Resource usage data
   * @returns {Promise<void>}
   */
  async recordResourceUsage(usage) {
    this.resource_usage = {
      ...this.resource_usage,
      ...usage,
      recorded_at: new Date()
    };
    this.updated_at = new Date();
    
    await this.save();
  }

  /**
   * Add metadata
   * @param {string} key - Metadata key
   * @param {*} value - Metadata value
   * @returns {Promise<void>}
   */
  async addMetadata(key, value) {
    this.metadata[key] = value;
    this.updated_at = new Date();
    
    await this.save();
  }

  /**
   * Add tag
   * @param {string} tag - Tag to add
   * @returns {Promise<void>}
   */
  async addTag(tag) {
    if (!this.tags.includes(tag)) {
      this.tags.push(tag);
      this.updated_at = new Date();
      await this.save();
    }
  }

  /**
   * Remove tag
   * @param {string} tag - Tag to remove
   * @returns {Promise<void>}
   */
  async removeTag(tag) {
    const index = this.tags.indexOf(tag);
    if (index > -1) {
      this.tags.splice(index, 1);
      this.updated_at = new Date();
      await this.save();
    }
  }

  /**
   * Get execution summary
   * @returns {Object} Execution summary
   */
  getSummary() {
    return {
      id: this.id,
      task_id: this.task_id,
      status: this.status,
      workflow_type: this.workflow_type,
      current_stage: this.current_stage,
      progress: this.stage_progress,
      duration: this.getDurationString(),
      execution_time_ms: this.getExecutionTime(),
      retry_count: this.retry_count,
      created_at: this.created_at,
      started_at: this.started_at,
      completed_at: this.completed_at,
      failed_at: this.failed_at,
      cancelled_at: this.cancelled_at,
      logs_count: this.logs.length,
      tags: this.tags,
      has_error: !!this.error
    };
  }

  /**
   * Get detailed execution report
   * @returns {Object} Detailed report
   */
  getDetailedReport() {
    return {
      ...this.getSummary(),
      logs: this.logs,
      stage_timings: this.stage_timings,
      resource_usage: this.resource_usage,
      metadata: this.metadata,
      workflow_result: this.workflow_result,
      error: this.error,
      stack_trace: this.stack_trace
    };
  }

  /**
   * Export execution data
   * @returns {Object} Exportable data
   */
  toJSON() {
    return {
      id: this.id,
      task_id: this.task_id,
      agent_type: this.agent_type,
      status: this.status,
      workflow_type: this.workflow_type,
      created_at: this.created_at,
      started_at: this.started_at,
      completed_at: this.completed_at,
      failed_at: this.failed_at,
      cancelled_at: this.cancelled_at,
      updated_at: this.updated_at,
      current_stage: this.current_stage,
      stage_progress: this.stage_progress,
      logs: this.logs,
      error: this.error,
      stack_trace: this.stack_trace,
      workflow_result: this.workflow_result,
      execution_time_ms: this.execution_time_ms,
      stage_timings: this.stage_timings,
      resource_usage: this.resource_usage,
      retry_count: this.retry_count,
      max_retries: this.max_retries,
      last_retry_at: this.last_retry_at,
      metadata: this.metadata,
      tags: this.tags
    };
  }

  /**
   * Save execution to database
   * @returns {Promise<void>}
   */
  async save() {
    // TODO: Implement database save
    // This would save the execution to PostgreSQL
    log('debug', '💾 Saving task execution', {
      id: this.id,
      status: this.status
    });
  }

  /**
   * Delete execution from database
   * @returns {Promise<void>}
   */
  async delete() {
    // TODO: Implement database delete
    log('info', '🗑️ Deleting task execution', {
      id: this.id,
      taskId: this.task_id
    });
  }

  /**
   * Clone execution for retry
   * @returns {TaskExecution} Cloned execution
   */
  clone() {
    const clonedData = {
      ...this.toJSON(),
      id: uuidv4(),
      status: 'pending',
      created_at: new Date(),
      started_at: null,
      completed_at: null,
      failed_at: null,
      cancelled_at: null,
      updated_at: new Date(),
      current_stage: null,
      stage_progress: 0,
      logs: [],
      error: null,
      stack_trace: null,
      workflow_result: null,
      execution_time_ms: null,
      stage_timings: {},
      resource_usage: {},
      retry_count: this.retry_count + 1,
      last_retry_at: new Date()
    };

    return new TaskExecution(clonedData);
  }

  /**
   * Get execution statistics
   * @param {Array} executions - Array of executions
   * @returns {Object} Statistics
   */
  static getStatistics(executions) {
    const total = executions.length;
    const completed = executions.filter(e => e.status === 'completed').length;
    const failed = executions.filter(e => e.status === 'failed').length;
    const cancelled = executions.filter(e => e.status === 'cancelled').length;
    const running = executions.filter(e => e.status === 'running').length;
    const pending = executions.filter(e => e.status === 'pending').length;

    const completedExecutions = executions.filter(e => e.execution_time_ms);
    const avgExecutionTime = completedExecutions.length > 0
      ? completedExecutions.reduce((sum, e) => sum + e.execution_time_ms, 0) / completedExecutions.length
      : 0;

    return {
      total,
      completed,
      failed,
      cancelled,
      running,
      pending,
      success_rate: total > 0 ? completed / total : 0,
      failure_rate: total > 0 ? failed / total : 0,
      avg_execution_time_ms: avgExecutionTime,
      avg_execution_time_string: avgExecutionTime > 0 
        ? new TaskExecution({ started_at: new Date(0), completed_at: new Date(avgExecutionTime) }).getDurationString()
        : '0ms'
    };
  }
}

