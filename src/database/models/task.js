/**
 * @fileoverview Task Model
 * @description Task data model with CRUD operations and validation
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Task model class with comprehensive CRUD operations
 */
export class Task {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.title = data.title || '';
    this.description = data.description || null;
    this.requirements = data.requirements || {};
    this.status = data.status || 'pending';
    this.priority = data.priority || 0;
    this.created_by = data.created_by || null;
    this.assigned_to = data.assigned_to || null;
    this.parent_task_id = data.parent_task_id || null;
    this.created_at = data.created_at || new Date();
    this.updated_at = data.updated_at || new Date();
  }

  /**
   * Validate task data
   * @returns {Object} Validation result
   */
  validate() {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!this.title || this.title.trim().length === 0) {
      errors.push('Title is required');
    }

    if (this.title && this.title.length > 255) {
      errors.push('Title must be 255 characters or less');
    }

    // Status validation
    const validStatuses = ['pending', 'in_progress', 'completed', 'failed', 'cancelled'];
    if (!validStatuses.includes(this.status)) {
      errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
    }

    // Priority validation
    if (this.priority < 0 || this.priority > 10) {
      errors.push('Priority must be between 0 and 10');
    }

    // Requirements validation
    if (this.requirements && typeof this.requirements !== 'object') {
      errors.push('Requirements must be a valid JSON object');
    }

    // Parent task validation
    if (this.parent_task_id && this.parent_task_id === this.id) {
      errors.push('Task cannot be its own parent');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Convert task to database format
   * @returns {Object} Database-ready object
   */
  toDatabase() {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      requirements: JSON.stringify(this.requirements),
      status: this.status,
      priority: this.priority,
      created_by: this.created_by,
      assigned_to: this.assigned_to,
      parent_task_id: this.parent_task_id,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }

  /**
   * Create task from database row
   * @param {Object} row - Database row
   * @returns {Task} Task instance
   */
  static fromDatabase(row) {
    return new Task({
      id: row.id,
      title: row.title,
      description: row.description,
      requirements: typeof row.requirements === 'string' 
        ? JSON.parse(row.requirements) 
        : row.requirements,
      status: row.status,
      priority: row.priority,
      created_by: row.created_by,
      assigned_to: row.assigned_to,
      parent_task_id: row.parent_task_id,
      created_at: row.created_at,
      updated_at: row.updated_at
    });
  }

  /**
   * Create a new task in the database
   * @param {Object} connectionManager - Database connection manager
   * @param {Object} taskData - Task data
   * @returns {Promise<Task>} Created task
   */
  static async create(connectionManager, taskData) {
    const task = new Task(taskData);
    const validation = task.validate();
    
    if (!validation.valid) {
      throw new Error(`Task validation failed: ${validation.errors.join(', ')}`);
    }

    const query = `
      INSERT INTO tasks (id, title, description, requirements, status, priority, created_by, assigned_to, parent_task_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const params = [
      task.id,
      task.title,
      task.description,
      task.requirements,
      task.status,
      task.priority,
      task.created_by,
      task.assigned_to,
      task.parent_task_id
    ];

    const result = await connectionManager.executeQuery(query, params);
    return Task.fromDatabase(result.rows[0]);
  }

  /**
   * Find task by ID
   * @param {Object} connectionManager - Database connection manager
   * @param {string} id - Task ID
   * @returns {Promise<Task|null>} Task or null if not found
   */
  static async findById(connectionManager, id) {
    const query = 'SELECT * FROM tasks WHERE id = $1';
    const result = await connectionManager.executeQuery(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return Task.fromDatabase(result.rows[0]);
  }

  /**
   * Find tasks by criteria
   * @param {Object} connectionManager - Database connection manager
   * @param {Object} criteria - Search criteria
   * @param {Object} options - Query options (limit, offset, orderBy)
   * @returns {Promise<Array<Task>>} Array of tasks
   */
  static async findBy(connectionManager, criteria = {}, options = {}) {
    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    // Build WHERE clause
    if (criteria.status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(criteria.status);
    }

    if (criteria.assigned_to) {
      query += ` AND assigned_to = $${paramIndex++}`;
      params.push(criteria.assigned_to);
    }

    if (criteria.created_by) {
      query += ` AND created_by = $${paramIndex++}`;
      params.push(criteria.created_by);
    }

    if (criteria.parent_task_id) {
      query += ` AND parent_task_id = $${paramIndex++}`;
      params.push(criteria.parent_task_id);
    }

    if (criteria.priority_min !== undefined) {
      query += ` AND priority >= $${paramIndex++}`;
      params.push(criteria.priority_min);
    }

    if (criteria.priority_max !== undefined) {
      query += ` AND priority <= $${paramIndex++}`;
      params.push(criteria.priority_max);
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
    return result.rows.map(row => Task.fromDatabase(row));
  }

  /**
   * Update task in database
   * @param {Object} connectionManager - Database connection manager
   * @returns {Promise<Task>} Updated task
   */
  async update(connectionManager) {
    const validation = this.validate();
    
    if (!validation.valid) {
      throw new Error(`Task validation failed: ${validation.errors.join(', ')}`);
    }

    this.updated_at = new Date();

    const query = `
      UPDATE tasks 
      SET title = $2, description = $3, requirements = $4, status = $5, 
          priority = $6, assigned_to = $7, updated_at = $8
      WHERE id = $1
      RETURNING *
    `;

    const params = [
      this.id,
      this.title,
      this.description,
      this.requirements,
      this.status,
      this.priority,
      this.assigned_to,
      this.updated_at
    ];

    const result = await connectionManager.executeQuery(query, params);
    
    if (result.rows.length === 0) {
      throw new Error(`Task with ID ${this.id} not found`);
    }
    
    return Task.fromDatabase(result.rows[0]);
  }

  /**
   * Delete task from database
   * @param {Object} connectionManager - Database connection manager
   * @returns {Promise<boolean>} True if deleted successfully
   */
  async delete(connectionManager) {
    const query = 'DELETE FROM tasks WHERE id = $1';
    const result = await connectionManager.executeQuery(query, [this.id]);
    return result.rowCount > 0;
  }

  /**
   * Get task statistics
   * @param {Object} connectionManager - Database connection manager
   * @returns {Promise<Object>} Task statistics
   */
  static async getStatistics(connectionManager) {
    const query = `
      SELECT 
        status,
        COUNT(*) as count,
        AVG(priority) as avg_priority
      FROM tasks 
      GROUP BY status
    `;

    const result = await connectionManager.executeQuery(query);
    
    const stats = {
      total: 0,
      by_status: {},
      avg_priority_by_status: {}
    };

    result.rows.forEach(row => {
      stats.total += parseInt(row.count);
      stats.by_status[row.status] = parseInt(row.count);
      stats.avg_priority_by_status[row.status] = parseFloat(row.avg_priority);
    });

    return stats;
  }

  /**
   * Get child tasks
   * @param {Object} connectionManager - Database connection manager
   * @returns {Promise<Array<Task>>} Array of child tasks
   */
  async getChildTasks(connectionManager) {
    return Task.findBy(connectionManager, { parent_task_id: this.id });
  }

  /**
   * Get parent task
   * @param {Object} connectionManager - Database connection manager
   * @returns {Promise<Task|null>} Parent task or null
   */
  async getParentTask(connectionManager) {
    if (!this.parent_task_id) {
      return null;
    }
    return Task.findById(connectionManager, this.parent_task_id);
  }

  /**
   * Update task status
   * @param {Object} connectionManager - Database connection manager
   * @param {string} newStatus - New status
   * @returns {Promise<Task>} Updated task
   */
  async updateStatus(connectionManager, newStatus) {
    const validStatuses = ['pending', 'in_progress', 'completed', 'failed', 'cancelled'];
    
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}. Must be one of: ${validStatuses.join(', ')}`);
    }

    this.status = newStatus;
    this.updated_at = new Date();

    return this.update(connectionManager);
  }
}

export default Task;

