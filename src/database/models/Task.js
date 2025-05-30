/**
 * Task Model for Claude Task Master
 * Provides data access and business logic for tasks
 */

import db from '../connection.js';

/**
 * Task Model Class
 */
export class Task {
  constructor(data = {}) {
    this.id = data.id || null;
    this.title = data.title || '';
    this.description = data.description || '';
    this.requirements = data.requirements || {};
    this.dependencies = data.dependencies || {};
    this.acceptance_criteria = data.acceptance_criteria || {};
    this.complexity_score = data.complexity_score || 0;
    this.status = data.status || 'backlog';
    this.priority = data.priority || 'medium';
    this.parent_task_id = data.parent_task_id || null;
    this.project_id = data.project_id || null;
    this.created_at = data.created_at || null;
    this.updated_at = data.updated_at || null;
    this.created_by = data.created_by || null;
    this.assigned_to = data.assigned_to || null;
    this.details = data.details || '';
    this.test_strategy = data.test_strategy || '';
    this.previous_status = data.previous_status || null;
    this.legacy_id = data.legacy_id || null;
  }

  /**
   * Validate task data
   */
  validate() {
    const errors = [];

    if (!this.title || this.title.trim().length === 0) {
      errors.push('Title is required');
    }

    if (this.title && this.title.length > 255) {
      errors.push('Title must be 255 characters or less');
    }

    if (this.complexity_score < 0 || this.complexity_score > 100) {
      errors.push('Complexity score must be between 0 and 100');
    }

    const validStatuses = ['backlog', 'todo', 'in-progress', 'done', 'deferred', 'cancelled'];
    if (!validStatuses.includes(this.status)) {
      errors.push('Invalid status');
    }

    const validPriorities = ['low', 'medium', 'high', 'critical'];
    if (!validPriorities.includes(this.priority)) {
      errors.push('Invalid priority');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Save task to database
   */
  async save() {
    const validation = this.validate();
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    if (this.id) {
      return await this.update();
    } else {
      return await this.create();
    }
  }

  /**
   * Create new task
   */
  async create() {
    const query = `
      INSERT INTO tasks (
        title, description, requirements, dependencies, acceptance_criteria,
        complexity_score, status, priority, parent_task_id, project_id,
        created_by, assigned_to, details, test_strategy, legacy_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *;
    `;

    const values = [
      this.title,
      this.description,
      JSON.stringify(this.requirements),
      JSON.stringify(this.dependencies),
      JSON.stringify(this.acceptance_criteria),
      this.complexity_score,
      this.status,
      this.priority,
      this.parent_task_id,
      this.project_id,
      this.created_by,
      this.assigned_to,
      this.details,
      this.test_strategy,
      this.legacy_id
    ];

    const result = await db.query(query, values);
    const taskData = result.rows[0];
    
    // Update this instance with the created data
    Object.assign(this, taskData);
    
    return this;
  }

  /**
   * Update existing task
   */
  async update() {
    const query = `
      UPDATE tasks SET
        title = $1, description = $2, requirements = $3, dependencies = $4,
        acceptance_criteria = $5, complexity_score = $6, status = $7, priority = $8,
        parent_task_id = $9, project_id = $10, assigned_to = $11, details = $12,
        test_strategy = $13, updated_at = NOW()
      WHERE id = $14
      RETURNING *;
    `;

    const values = [
      this.title,
      this.description,
      JSON.stringify(this.requirements),
      JSON.stringify(this.dependencies),
      JSON.stringify(this.acceptance_criteria),
      this.complexity_score,
      this.status,
      this.priority,
      this.parent_task_id,
      this.project_id,
      this.assigned_to,
      this.details,
      this.test_strategy,
      this.id
    ];

    const result = await db.query(query, values);
    
    if (result.rows.length === 0) {
      throw new Error(`Task with id ${this.id} not found`);
    }

    const taskData = result.rows[0];
    Object.assign(this, taskData);
    
    return this;
  }

  /**
   * Delete task
   */
  async delete() {
    if (!this.id) {
      throw new Error('Cannot delete task without id');
    }

    const query = 'DELETE FROM tasks WHERE id = $1 RETURNING id;';
    const result = await db.query(query, [this.id]);
    
    if (result.rows.length === 0) {
      throw new Error(`Task with id ${this.id} not found`);
    }

    return true;
  }

  /**
   * Get subtasks
   */
  async getSubtasks() {
    const query = `
      SELECT t.* FROM tasks t
      JOIN subtasks s ON t.id = s.child_task_id
      WHERE s.parent_task_id = $1
      ORDER BY s.order_index;
    `;

    const result = await db.query(query, [this.id]);
    return result.rows.map(row => new Task(row));
  }

  /**
   * Add subtask
   */
  async addSubtask(subtaskId, orderIndex = 0) {
    const query = `
      INSERT INTO subtasks (parent_task_id, child_task_id, order_index)
      VALUES ($1, $2, $3)
      ON CONFLICT (parent_task_id, child_task_id) 
      DO UPDATE SET order_index = EXCLUDED.order_index;
    `;

    await db.query(query, [this.id, subtaskId, orderIndex]);
    return true;
  }

  /**
   * Remove subtask
   */
  async removeSubtask(subtaskId) {
    const query = 'DELETE FROM subtasks WHERE parent_task_id = $1 AND child_task_id = $2;';
    const result = await db.query(query, [this.id, subtaskId]);
    return result.rowCount > 0;
  }

  /**
   * Get task dependencies
   */
  async getDependencies() {
    const query = `
      SELECT t.*, td.dependency_type FROM tasks t
      JOIN task_dependencies td ON t.id = td.depends_on_task_id
      WHERE td.task_id = $1;
    `;

    const result = await db.query(query, [this.id]);
    return result.rows.map(row => ({
      task: new Task(row),
      dependency_type: row.dependency_type
    }));
  }

  /**
   * Add dependency
   */
  async addDependency(dependsOnTaskId, dependencyType = 'blocks') {
    const query = `
      INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type)
      VALUES ($1, $2, $3)
      ON CONFLICT (task_id, depends_on_task_id) 
      DO UPDATE SET dependency_type = EXCLUDED.dependency_type;
    `;

    await db.query(query, [this.id, dependsOnTaskId, dependencyType]);
    return true;
  }

  /**
   * Remove dependency
   */
  async removeDependency(dependsOnTaskId) {
    const query = 'DELETE FROM task_dependencies WHERE task_id = $1 AND depends_on_task_id = $2;';
    const result = await db.query(query, [this.id, dependsOnTaskId]);
    return result.rowCount > 0;
  }

  /**
   * Get execution history
   */
  async getExecutionHistory() {
    const query = `
      SELECT * FROM execution_history 
      WHERE task_id = $1 
      ORDER BY attempt_number DESC;
    `;

    const result = await db.query(query, [this.id]);
    return result.rows;
  }

  /**
   * Convert to JSON representation
   */
  toJSON() {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      requirements: this.requirements,
      dependencies: this.dependencies,
      acceptance_criteria: this.acceptance_criteria,
      complexity_score: this.complexity_score,
      status: this.status,
      priority: this.priority,
      parent_task_id: this.parent_task_id,
      project_id: this.project_id,
      created_at: this.created_at,
      updated_at: this.updated_at,
      created_by: this.created_by,
      assigned_to: this.assigned_to,
      details: this.details,
      test_strategy: this.test_strategy,
      previous_status: this.previous_status,
      legacy_id: this.legacy_id
    };
  }

  // Static methods

  /**
   * Find task by ID
   */
  static async findById(id) {
    const query = 'SELECT * FROM tasks WHERE id = $1;';
    const result = await db.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return new Task(result.rows[0]);
  }

  /**
   * Find task by legacy ID
   */
  static async findByLegacyId(legacyId) {
    const query = 'SELECT * FROM tasks WHERE legacy_id = $1;';
    const result = await db.query(query, [legacyId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return new Task(result.rows[0]);
  }

  /**
   * Find all tasks with filters
   */
  static async findAll(filters = {}) {
    let query = 'SELECT * FROM tasks WHERE 1=1';
    const values = [];
    let paramCount = 0;

    if (filters.status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      values.push(filters.status);
    }

    if (filters.priority) {
      paramCount++;
      query += ` AND priority = $${paramCount}`;
      values.push(filters.priority);
    }

    if (filters.project_id) {
      paramCount++;
      query += ` AND project_id = $${paramCount}`;
      values.push(filters.project_id);
    }

    if (filters.assigned_to) {
      paramCount++;
      query += ` AND assigned_to = $${paramCount}`;
      values.push(filters.assigned_to);
    }

    if (filters.parent_task_id !== undefined) {
      if (filters.parent_task_id === null) {
        query += ' AND parent_task_id IS NULL';
      } else {
        paramCount++;
        query += ` AND parent_task_id = $${paramCount}`;
        values.push(filters.parent_task_id);
      }
    }

    // Add ordering
    query += ' ORDER BY created_at DESC';

    // Add pagination
    if (filters.limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      values.push(filters.limit);
    }

    if (filters.offset) {
      paramCount++;
      query += ` OFFSET $${paramCount}`;
      values.push(filters.offset);
    }

    const result = await db.query(query, values);
    return result.rows.map(row => new Task(row));
  }

  /**
   * Search tasks by text
   */
  static async search(searchText, filters = {}) {
    let query = `
      SELECT *, 
        ts_rank(to_tsvector('english', title || ' ' || COALESCE(description, '')), plainto_tsquery('english', $1)) as rank
      FROM tasks 
      WHERE to_tsvector('english', title || ' ' || COALESCE(description, '')) @@ plainto_tsquery('english', $1)
    `;
    
    const values = [searchText];
    let paramCount = 1;

    if (filters.status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      values.push(filters.status);
    }

    if (filters.priority) {
      paramCount++;
      query += ` AND priority = $${paramCount}`;
      values.push(filters.priority);
    }

    query += ' ORDER BY rank DESC, created_at DESC';

    if (filters.limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      values.push(filters.limit);
    }

    const result = await db.query(query, values);
    return result.rows.map(row => new Task(row));
  }

  /**
   * Get task statistics
   */
  static async getStatistics() {
    const query = `
      SELECT 
        status,
        priority,
        COUNT(*) as count,
        AVG(complexity_score) as avg_complexity
      FROM tasks 
      GROUP BY status, priority
      ORDER BY status, priority;
    `;

    const result = await db.query(query);
    return result.rows;
  }
}

export default Task;

