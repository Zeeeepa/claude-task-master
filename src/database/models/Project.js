/**
 * Project Model for Claude Task Master
 * Provides data access and business logic for projects
 */

import db from '../connection.js';

/**
 * Project Model Class
 */
export class Project {
  constructor(data = {}) {
    this.id = data.id || null;
    this.name = data.name || '';
    this.description = data.description || '';
    this.repository_url = data.repository_url || '';
    this.context = data.context || {};
    this.architecture = data.architecture || {};
    this.status = data.status || 'active';
    this.created_at = data.created_at || null;
    this.updated_at = data.updated_at || null;
  }

  /**
   * Validate project data
   */
  validate() {
    const errors = [];

    if (!this.name || this.name.trim().length === 0) {
      errors.push('Name is required');
    }

    if (this.name && this.name.length > 255) {
      errors.push('Name must be 255 characters or less');
    }

    const validStatuses = ['active', 'inactive', 'archived', 'completed'];
    if (!validStatuses.includes(this.status)) {
      errors.push('Invalid status');
    }

    if (this.repository_url && this.repository_url.length > 500) {
      errors.push('Repository URL must be 500 characters or less');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Save project to database
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
   * Create new project
   */
  async create() {
    const query = `
      INSERT INTO projects (
        name, description, repository_url, context, architecture, status
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;

    const values = [
      this.name,
      this.description,
      this.repository_url,
      JSON.stringify(this.context),
      JSON.stringify(this.architecture),
      this.status
    ];

    const result = await db.query(query, values);
    const projectData = result.rows[0];
    
    // Update this instance with the created data
    Object.assign(this, projectData);
    
    return this;
  }

  /**
   * Update existing project
   */
  async update() {
    const query = `
      UPDATE projects SET
        name = $1, description = $2, repository_url = $3, context = $4,
        architecture = $5, status = $6, updated_at = NOW()
      WHERE id = $7
      RETURNING *;
    `;

    const values = [
      this.name,
      this.description,
      this.repository_url,
      JSON.stringify(this.context),
      JSON.stringify(this.architecture),
      this.status,
      this.id
    ];

    const result = await db.query(query, values);
    
    if (result.rows.length === 0) {
      throw new Error(`Project with id ${this.id} not found`);
    }

    const projectData = result.rows[0];
    Object.assign(this, projectData);
    
    return this;
  }

  /**
   * Delete project
   */
  async delete() {
    if (!this.id) {
      throw new Error('Cannot delete project without id');
    }

    // Check if project has tasks
    const taskCount = await this.getTaskCount();
    if (taskCount > 0) {
      throw new Error(`Cannot delete project with ${taskCount} associated tasks`);
    }

    const query = 'DELETE FROM projects WHERE id = $1 RETURNING id;';
    const result = await db.query(query, [this.id]);
    
    if (result.rows.length === 0) {
      throw new Error(`Project with id ${this.id} not found`);
    }

    return true;
  }

  /**
   * Get project tasks
   */
  async getTasks(filters = {}) {
    let query = 'SELECT * FROM tasks WHERE project_id = $1';
    const values = [this.id];
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

    query += ' ORDER BY created_at DESC';

    if (filters.limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      values.push(filters.limit);
    }

    const result = await db.query(query, values);
    return result.rows;
  }

  /**
   * Get task count for project
   */
  async getTaskCount() {
    const query = 'SELECT COUNT(*) as count FROM tasks WHERE project_id = $1;';
    const result = await db.query(query, [this.id]);
    return parseInt(result.rows[0].count);
  }

  /**
   * Get project statistics
   */
  async getStatistics() {
    const query = `
      SELECT 
        status,
        COUNT(*) as task_count,
        AVG(complexity_score) as avg_complexity
      FROM tasks 
      WHERE project_id = $1
      GROUP BY status
      ORDER BY status;
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
      name: this.name,
      description: this.description,
      repository_url: this.repository_url,
      context: this.context,
      architecture: this.architecture,
      status: this.status,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }

  // Static methods

  /**
   * Find project by ID
   */
  static async findById(id) {
    const query = 'SELECT * FROM projects WHERE id = $1;';
    const result = await db.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return new Project(result.rows[0]);
  }

  /**
   * Find project by name
   */
  static async findByName(name) {
    const query = 'SELECT * FROM projects WHERE name = $1;';
    const result = await db.query(query, [name]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return new Project(result.rows[0]);
  }

  /**
   * Find all projects with filters
   */
  static async findAll(filters = {}) {
    let query = 'SELECT * FROM projects WHERE 1=1';
    const values = [];
    let paramCount = 0;

    if (filters.status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      values.push(filters.status);
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
    return result.rows.map(row => new Project(row));
  }

  /**
   * Search projects by text
   */
  static async search(searchText, filters = {}) {
    let query = `
      SELECT *, 
        ts_rank(to_tsvector('english', name || ' ' || COALESCE(description, '')), plainto_tsquery('english', $1)) as rank
      FROM projects 
      WHERE to_tsvector('english', name || ' ' || COALESCE(description, '')) @@ plainto_tsquery('english', $1)
    `;
    
    const values = [searchText];
    let paramCount = 1;

    if (filters.status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      values.push(filters.status);
    }

    query += ' ORDER BY rank DESC, created_at DESC';

    if (filters.limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      values.push(filters.limit);
    }

    const result = await db.query(query, values);
    return result.rows.map(row => new Project(row));
  }

  /**
   * Get default project
   */
  static async getDefault() {
    const query = 'SELECT * FROM projects WHERE name = $1;';
    const result = await db.query(query, ['Default Project']);
    
    if (result.rows.length === 0) {
      // Create default project if it doesn't exist
      const defaultProject = new Project({
        name: 'Default Project',
        description: 'Default project for tasks without specific project assignment',
        status: 'active'
      });
      return await defaultProject.save();
    }

    return new Project(result.rows[0]);
  }

  /**
   * Get project statistics across all projects
   */
  static async getGlobalStatistics() {
    const query = `
      SELECT 
        p.status as project_status,
        COUNT(DISTINCT p.id) as project_count,
        COUNT(t.id) as total_tasks,
        COUNT(CASE WHEN t.status = 'done' THEN 1 END) as completed_tasks,
        AVG(t.complexity_score) as avg_complexity
      FROM projects p
      LEFT JOIN tasks t ON p.id = t.project_id
      GROUP BY p.status
      ORDER BY p.status;
    `;

    const result = await db.query(query);
    return result.rows;
  }
}

export default Project;

