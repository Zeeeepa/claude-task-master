/**
 * @fileoverview PR Validation Model
 * @description PR validation data model with CRUD operations and validation
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * PR Validation model class with comprehensive CRUD operations
 */
export class PRValidation {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.task_id = data.task_id;
    this.execution_id = data.execution_id || null;
    this.pr_number = data.pr_number;
    this.repository = data.repository;
    this.branch_name = data.branch_name || null;
    this.status = data.status || 'pending';
    this.validation_results = data.validation_results || {};
    this.webhook_payload = data.webhook_payload || null;
    this.created_at = data.created_at || new Date();
    this.updated_at = data.updated_at || new Date();
  }

  /**
   * Validate PR validation data
   * @returns {Object} Validation result
   */
  validate() {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!this.task_id) {
      errors.push('Task ID is required');
    }

    if (!this.pr_number) {
      errors.push('PR number is required');
    }

    if (!this.repository) {
      errors.push('Repository is required');
    }

    // PR number validation
    if (this.pr_number && (this.pr_number <= 0 || !Number.isInteger(this.pr_number))) {
      errors.push('PR number must be a positive integer');
    }

    // Status validation
    const validStatuses = ['pending', 'running', 'passed', 'failed', 'cancelled'];
    if (!validStatuses.includes(this.status)) {
      errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
    }

    // Repository format validation
    if (this.repository && !this.repository.includes('/')) {
      warnings.push('Repository should be in format "owner/repo"');
    }

    // Validation results validation
    if (this.validation_results && typeof this.validation_results !== 'object') {
      errors.push('Validation results must be a valid JSON object');
    }

    // Webhook payload validation
    if (this.webhook_payload && typeof this.webhook_payload !== 'object') {
      errors.push('Webhook payload must be a valid JSON object');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Convert PR validation to database format
   * @returns {Object} Database-ready object
   */
  toDatabase() {
    return {
      id: this.id,
      task_id: this.task_id,
      execution_id: this.execution_id,
      pr_number: this.pr_number,
      repository: this.repository,
      branch_name: this.branch_name,
      status: this.status,
      validation_results: JSON.stringify(this.validation_results),
      webhook_payload: this.webhook_payload ? JSON.stringify(this.webhook_payload) : null,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }

  /**
   * Create PR validation from database row
   * @param {Object} row - Database row
   * @returns {PRValidation} PRValidation instance
   */
  static fromDatabase(row) {
    return new PRValidation({
      id: row.id,
      task_id: row.task_id,
      execution_id: row.execution_id,
      pr_number: row.pr_number,
      repository: row.repository,
      branch_name: row.branch_name,
      status: row.status,
      validation_results: typeof row.validation_results === 'string' 
        ? JSON.parse(row.validation_results) 
        : row.validation_results,
      webhook_payload: row.webhook_payload 
        ? (typeof row.webhook_payload === 'string' ? JSON.parse(row.webhook_payload) : row.webhook_payload)
        : null,
      created_at: row.created_at,
      updated_at: row.updated_at
    });
  }

  /**
   * Create a new PR validation in the database
   * @param {Object} connectionManager - Database connection manager
   * @param {Object} validationData - PR validation data
   * @returns {Promise<PRValidation>} Created PR validation
   */
  static async create(connectionManager, validationData) {
    const validation = new PRValidation(validationData);
    const validationResult = validation.validate();
    
    if (!validationResult.valid) {
      throw new Error(`PR validation validation failed: ${validationResult.errors.join(', ')}`);
    }

    const query = `
      INSERT INTO pr_validations (id, task_id, execution_id, pr_number, repository, branch_name, status, validation_results, webhook_payload)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const params = [
      validation.id,
      validation.task_id,
      validation.execution_id,
      validation.pr_number,
      validation.repository,
      validation.branch_name,
      validation.status,
      validation.validation_results,
      validation.webhook_payload
    ];

    const result = await connectionManager.executeQuery(query, params);
    return PRValidation.fromDatabase(result.rows[0]);
  }

  /**
   * Find PR validation by ID
   * @param {Object} connectionManager - Database connection manager
   * @param {string} id - PR validation ID
   * @returns {Promise<PRValidation|null>} PR validation or null if not found
   */
  static async findById(connectionManager, id) {
    const query = 'SELECT * FROM pr_validations WHERE id = $1';
    const result = await connectionManager.executeQuery(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return PRValidation.fromDatabase(result.rows[0]);
  }

  /**
   * Find PR validation by PR number and repository
   * @param {Object} connectionManager - Database connection manager
   * @param {number} prNumber - PR number
   * @param {string} repository - Repository name
   * @returns {Promise<PRValidation|null>} PR validation or null if not found
   */
  static async findByPR(connectionManager, prNumber, repository) {
    const query = 'SELECT * FROM pr_validations WHERE pr_number = $1 AND repository = $2 ORDER BY created_at DESC LIMIT 1';
    const result = await connectionManager.executeQuery(query, [prNumber, repository]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return PRValidation.fromDatabase(result.rows[0]);
  }

  /**
   * Find PR validations by criteria
   * @param {Object} connectionManager - Database connection manager
   * @param {Object} criteria - Search criteria
   * @param {Object} options - Query options (limit, offset, orderBy)
   * @returns {Promise<Array<PRValidation>>} Array of PR validations
   */
  static async findBy(connectionManager, criteria = {}, options = {}) {
    let query = 'SELECT * FROM pr_validations WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    // Build WHERE clause
    if (criteria.task_id) {
      query += ` AND task_id = $${paramIndex++}`;
      params.push(criteria.task_id);
    }

    if (criteria.execution_id) {
      query += ` AND execution_id = $${paramIndex++}`;
      params.push(criteria.execution_id);
    }

    if (criteria.repository) {
      query += ` AND repository = $${paramIndex++}`;
      params.push(criteria.repository);
    }

    if (criteria.status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(criteria.status);
    }

    if (criteria.pr_number) {
      query += ` AND pr_number = $${paramIndex++}`;
      params.push(criteria.pr_number);
    }

    if (criteria.branch_name) {
      query += ` AND branch_name = $${paramIndex++}`;
      params.push(criteria.branch_name);
    }

    if (criteria.created_after) {
      query += ` AND created_at > $${paramIndex++}`;
      params.push(criteria.created_after);
    }

    if (criteria.created_before) {
      query += ` AND created_at < $${paramIndex++}`;
      params.push(criteria.created_before);
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
    return result.rows.map(row => PRValidation.fromDatabase(row));
  }

  /**
   * Update PR validation in database
   * @param {Object} connectionManager - Database connection manager
   * @returns {Promise<PRValidation>} Updated PR validation
   */
  async update(connectionManager) {
    const validation = this.validate();
    
    if (!validation.valid) {
      throw new Error(`PR validation validation failed: ${validation.errors.join(', ')}`);
    }

    this.updated_at = new Date();

    const query = `
      UPDATE pr_validations 
      SET execution_id = $2, branch_name = $3, status = $4, validation_results = $5, 
          webhook_payload = $6, updated_at = $7
      WHERE id = $1
      RETURNING *
    `;

    const params = [
      this.id,
      this.execution_id,
      this.branch_name,
      this.status,
      this.validation_results,
      this.webhook_payload,
      this.updated_at
    ];

    const result = await connectionManager.executeQuery(query, params);
    
    if (result.rows.length === 0) {
      throw new Error(`PR validation with ID ${this.id} not found`);
    }
    
    return PRValidation.fromDatabase(result.rows[0]);
  }

  /**
   * Delete PR validation from database
   * @param {Object} connectionManager - Database connection manager
   * @returns {Promise<boolean>} True if deleted successfully
   */
  async delete(connectionManager) {
    const query = 'DELETE FROM pr_validations WHERE id = $1';
    const result = await connectionManager.executeQuery(query, [this.id]);
    return result.rowCount > 0;
  }

  /**
   * Update validation status
   * @param {Object} connectionManager - Database connection manager
   * @param {string} newStatus - New status
   * @param {Object} results - Validation results
   * @returns {Promise<PRValidation>} Updated PR validation
   */
  async updateStatus(connectionManager, newStatus, results = {}) {
    const validStatuses = ['pending', 'running', 'passed', 'failed', 'cancelled'];
    
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}. Must be one of: ${validStatuses.join(', ')}`);
    }

    this.status = newStatus;
    this.validation_results = { ...this.validation_results, ...results };
    this.updated_at = new Date();

    return this.update(connectionManager);
  }

  /**
   * Add validation result
   * @param {Object} connectionManager - Database connection manager
   * @param {string} checkName - Name of the validation check
   * @param {Object} result - Validation result
   * @returns {Promise<PRValidation>} Updated PR validation
   */
  async addValidationResult(connectionManager, checkName, result) {
    if (!this.validation_results.checks) {
      this.validation_results.checks = {};
    }
    
    this.validation_results.checks[checkName] = {
      ...result,
      timestamp: new Date().toISOString()
    };

    return this.update(connectionManager);
  }

  /**
   * Get validation summary
   * @returns {Object} Validation summary
   */
  getValidationSummary() {
    const checks = this.validation_results.checks || {};
    const checkNames = Object.keys(checks);
    
    const summary = {
      total_checks: checkNames.length,
      passed_checks: 0,
      failed_checks: 0,
      pending_checks: 0,
      overall_status: this.status
    };

    checkNames.forEach(checkName => {
      const check = checks[checkName];
      if (check.status === 'passed') {
        summary.passed_checks++;
      } else if (check.status === 'failed') {
        summary.failed_checks++;
      } else {
        summary.pending_checks++;
      }
    });

    return summary;
  }

  /**
   * Get PR validation statistics
   * @param {Object} connectionManager - Database connection manager
   * @param {Object} criteria - Filter criteria
   * @returns {Promise<Object>} PR validation statistics
   */
  static async getStatistics(connectionManager, criteria = {}) {
    let query = `
      SELECT 
        repository,
        status,
        COUNT(*) as count,
        COUNT(DISTINCT pr_number) as unique_prs
      FROM pr_validations 
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (criteria.repository) {
      query += ` AND repository = $${paramIndex++}`;
      params.push(criteria.repository);
    }

    if (criteria.date_from) {
      query += ` AND created_at >= $${paramIndex++}`;
      params.push(criteria.date_from);
    }

    if (criteria.date_to) {
      query += ` AND created_at <= $${paramIndex++}`;
      params.push(criteria.date_to);
    }

    query += ' GROUP BY repository, status';

    const result = await connectionManager.executeQuery(query, params);
    
    const stats = {
      total_validations: 0,
      total_unique_prs: 0,
      by_repository: {},
      by_status: {}
    };

    result.rows.forEach(row => {
      const count = parseInt(row.count);
      const uniquePrs = parseInt(row.unique_prs);
      
      stats.total_validations += count;
      stats.total_unique_prs += uniquePrs;
      
      if (!stats.by_repository[row.repository]) {
        stats.by_repository[row.repository] = { total: 0, by_status: {} };
      }
      stats.by_repository[row.repository].total += count;
      stats.by_repository[row.repository].by_status[row.status] = count;
      
      if (!stats.by_status[row.status]) {
        stats.by_status[row.status] = 0;
      }
      stats.by_status[row.status] += count;
    });

    return stats;
  }
}

export default PRValidation;

