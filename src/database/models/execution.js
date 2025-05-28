/**
 * @fileoverview Task Execution Model
 * @description Task execution data model with CRUD operations and validation
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Task Execution model class with comprehensive CRUD operations
 */
export class TaskExecution {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.task_id = data.task_id;
    this.agent_type = data.agent_type;
    this.agent_config = data.agent_config || {};
    this.status = data.status || 'pending';
    this.logs = data.logs || [];
    this.error_details = data.error_details || null;
    this.started_at = data.started_at || null;
    this.completed_at = data.completed_at || null;
    this.created_at = data.created_at || new Date();
  }

  /**
   * Validate task execution data
   * @returns {Object} Validation result
   */
  validate() {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!this.task_id) {
      errors.push('Task ID is required');
    }

    if (!this.agent_type) {
      errors.push('Agent type is required');
    }

    // Agent type validation
    const validAgentTypes = ['claude-code', 'codegen', 'webhook-handler', 'validation-engine'];
    if (this.agent_type && !validAgentTypes.includes(this.agent_type)) {
      errors.push(`Agent type must be one of: ${validAgentTypes.join(', ')}`);
    }

    // Status validation
    const validStatuses = ['pending', 'running', 'completed', 'failed', 'cancelled'];
    if (!validStatuses.includes(this.status)) {
      errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
    }

    // Agent config validation
    if (this.agent_config && typeof this.agent_config !== 'object') {
      errors.push('Agent config must be a valid JSON object');
    }

    // Logs validation
    if (this.logs && !Array.isArray(this.logs)) {
      errors.push('Logs must be an array');
    }

    // Date validation
    if (this.started_at && this.completed_at && this.started_at > this.completed_at) {
      errors.push('Started at cannot be after completed at');
    }

    // Status-specific validations
    if (this.status === 'running' && !this.started_at) {
      warnings.push('Running execution should have a started_at timestamp');
    }

    if (['completed', 'failed'].includes(this.status) && !this.completed_at) {
      warnings.push('Completed/failed execution should have a completed_at timestamp');
    }

    if (this.status === 'failed' && !this.error_details) {
      warnings.push('Failed execution should have error details');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Convert task execution to database format
   * @returns {Object} Database-ready object
   */
  toDatabase() {
    return {
      id: this.id,
      task_id: this.task_id,
      agent_type: this.agent_type,
      agent_config: JSON.stringify(this.agent_config),
      status: this.status,
      logs: JSON.stringify(this.logs),
      error_details: this.error_details ? JSON.stringify(this.error_details) : null,
      started_at: this.started_at,
      completed_at: this.completed_at,
      created_at: this.created_at
    };
  }

  /**
   * Create task execution from database row
   * @param {Object} row - Database row
   * @returns {TaskExecution} TaskExecution instance
   */
  static fromDatabase(row) {
    return new TaskExecution({
      id: row.id,
      task_id: row.task_id,
      agent_type: row.agent_type,
      agent_config: typeof row.agent_config === 'string' 
        ? JSON.parse(row.agent_config) 
        : row.agent_config,
      status: row.status,
      logs: typeof row.logs === 'string' 
        ? JSON.parse(row.logs) 
        : row.logs,
      error_details: row.error_details 
        ? (typeof row.error_details === 'string' ? JSON.parse(row.error_details) : row.error_details)
        : null,
      started_at: row.started_at,
      completed_at: row.completed_at,
      created_at: row.created_at
    });
  }

  /**
   * Create a new task execution in the database
   * @param {Object} connectionManager - Database connection manager
   * @param {Object} executionData - Task execution data
   * @returns {Promise<TaskExecution>} Created task execution
   */
  static async create(connectionManager, executionData) {
    const execution = new TaskExecution(executionData);
    const validation = execution.validate();
    
    if (!validation.valid) {
      throw new Error(`Task execution validation failed: ${validation.errors.join(', ')}`);
    }

    const query = `
      INSERT INTO task_executions (id, task_id, agent_type, agent_config, status, logs, error_details, started_at, completed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const params = [
      execution.id,
      execution.task_id,
      execution.agent_type,
      execution.agent_config,
      execution.status,
      execution.logs,
      execution.error_details,
      execution.started_at,
      execution.completed_at
    ];

    const result = await connectionManager.executeQuery(query, params);
    return TaskExecution.fromDatabase(result.rows[0]);
  }

  /**
   * Find task execution by ID
   * @param {Object} connectionManager - Database connection manager
   * @param {string} id - Task execution ID
   * @returns {Promise<TaskExecution|null>} Task execution or null if not found
   */
  static async findById(connectionManager, id) {
    const query = 'SELECT * FROM task_executions WHERE id = $1';
    const result = await connectionManager.executeQuery(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return TaskExecution.fromDatabase(result.rows[0]);
  }

  /**
   * Find task executions by criteria
   * @param {Object} connectionManager - Database connection manager
   * @param {Object} criteria - Search criteria
   * @param {Object} options - Query options (limit, offset, orderBy)
   * @returns {Promise<Array<TaskExecution>>} Array of task executions
   */
  static async findBy(connectionManager, criteria = {}, options = {}) {
    let query = 'SELECT * FROM task_executions WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    // Build WHERE clause
    if (criteria.task_id) {
      query += ` AND task_id = $${paramIndex++}`;
      params.push(criteria.task_id);
    }

    if (criteria.agent_type) {
      query += ` AND agent_type = $${paramIndex++}`;
      params.push(criteria.agent_type);
    }

    if (criteria.status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(criteria.status);
    }

    if (criteria.started_after) {
      query += ` AND started_at > $${paramIndex++}`;
      params.push(criteria.started_after);
    }

    if (criteria.started_before) {
      query += ` AND started_at < $${paramIndex++}`;
      params.push(criteria.started_before);
    }

    // Add ordering
    const orderBy = options.orderBy || 'created_at DESC';
    query += ` ORDER BY ${orderBy}`;

    // Add pagination
    if (options.limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(options.limit);
    }

    if (options.offset) {
      query += ` OFFSET $${paramIndex++}`;
      params.push(options.offset);
    }

    const result = await connectionManager.executeQuery(query, params);
    return result.rows.map(row => TaskExecution.fromDatabase(row));
  }

  /**
   * Update task execution in database
   * @param {Object} connectionManager - Database connection manager
   * @returns {Promise<TaskExecution>} Updated task execution
   */
  async update(connectionManager) {
    const validation = this.validate();
    
    if (!validation.valid) {
      throw new Error(`Task execution validation failed: ${validation.errors.join(', ')}`);
    }

    const query = `
      UPDATE task_executions 
      SET agent_config = $2, status = $3, logs = $4, error_details = $5, 
          started_at = $6, completed_at = $7
      WHERE id = $1
      RETURNING *
    `;

    const params = [
      this.id,
      this.agent_config,
      this.status,
      this.logs,
      this.error_details,
      this.started_at,
      this.completed_at
    ];

    const result = await connectionManager.executeQuery(query, params);
    
    if (result.rows.length === 0) {
      throw new Error(`Task execution with ID ${this.id} not found`);
    }
    
    return TaskExecution.fromDatabase(result.rows[0]);
  }

  /**
   * Delete task execution from database
   * @param {Object} connectionManager - Database connection manager
   * @returns {Promise<boolean>} True if deleted successfully
   */
  async delete(connectionManager) {
    const query = 'DELETE FROM task_executions WHERE id = $1';
    const result = await connectionManager.executeQuery(query, [this.id]);
    return result.rowCount > 0;
  }

  /**
   * Start execution
   * @param {Object} connectionManager - Database connection manager
   * @returns {Promise<TaskExecution>} Updated task execution
   */
  async start(connectionManager) {
    this.status = 'running';
    this.started_at = new Date();
    return this.update(connectionManager);
  }

  /**
   * Complete execution successfully
   * @param {Object} connectionManager - Database connection manager
   * @param {Array} finalLogs - Final execution logs
   * @returns {Promise<TaskExecution>} Updated task execution
   */
  async complete(connectionManager, finalLogs = []) {
    this.status = 'completed';
    this.completed_at = new Date();
    if (finalLogs.length > 0) {
      this.logs = [...this.logs, ...finalLogs];
    }
    return this.update(connectionManager);
  }

  /**
   * Fail execution with error details
   * @param {Object} connectionManager - Database connection manager
   * @param {Object} errorDetails - Error details
   * @param {Array} errorLogs - Error logs
   * @returns {Promise<TaskExecution>} Updated task execution
   */
  async fail(connectionManager, errorDetails, errorLogs = []) {
    this.status = 'failed';
    this.completed_at = new Date();
    this.error_details = errorDetails;
    if (errorLogs.length > 0) {
      this.logs = [...this.logs, ...errorLogs];
    }
    return this.update(connectionManager);
  }

  /**
   * Add log entry
   * @param {Object} connectionManager - Database connection manager
   * @param {Object} logEntry - Log entry to add
   * @returns {Promise<TaskExecution>} Updated task execution
   */
  async addLog(connectionManager, logEntry) {
    const logWithTimestamp = {
      timestamp: new Date().toISOString(),
      ...logEntry
    };
    
    this.logs = [...this.logs, logWithTimestamp];
    return this.update(connectionManager);
  }

  /**
   * Get execution duration in milliseconds
   * @returns {number|null} Duration in milliseconds or null if not completed
   */
  getDuration() {
    if (!this.started_at || !this.completed_at) {
      return null;
    }
    return new Date(this.completed_at) - new Date(this.started_at);
  }

  /**
   * Get execution statistics
   * @param {Object} connectionManager - Database connection manager
   * @param {Object} criteria - Filter criteria
   * @returns {Promise<Object>} Execution statistics
   */
  static async getStatistics(connectionManager, criteria = {}) {
    let query = `
      SELECT 
        agent_type,
        status,
        COUNT(*) as count,
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_duration_seconds
      FROM task_executions 
      WHERE started_at IS NOT NULL
    `;

    const params = [];
    let paramIndex = 1;

    if (criteria.agent_type) {
      query += ` AND agent_type = $${paramIndex++}`;
      params.push(criteria.agent_type);
    }

    if (criteria.date_from) {
      query += ` AND created_at >= $${paramIndex++}`;
      params.push(criteria.date_from);
    }

    if (criteria.date_to) {
      query += ` AND created_at <= $${paramIndex++}`;
      params.push(criteria.date_to);
    }

    query += ' GROUP BY agent_type, status';

    const result = await connectionManager.executeQuery(query, params);
    
    const stats = {
      total: 0,
      by_agent_type: {},
      by_status: {},
      avg_duration_by_agent: {}
    };

    result.rows.forEach(row => {
      const count = parseInt(row.count);
      stats.total += count;
      
      if (!stats.by_agent_type[row.agent_type]) {
        stats.by_agent_type[row.agent_type] = 0;
      }
      stats.by_agent_type[row.agent_type] += count;
      
      if (!stats.by_status[row.status]) {
        stats.by_status[row.status] = 0;
      }
      stats.by_status[row.status] += count;
      
      if (row.avg_duration_seconds) {
        stats.avg_duration_by_agent[row.agent_type] = parseFloat(row.avg_duration_seconds);
      }
    });

    return stats;
  }
}

export default TaskExecution;

