/**
 * @fileoverview PR Validation Database Models
 * @description Database models for tracking PR validation status and results
 */

import { log } from '../../../scripts/modules/utils.js';

/**
 * PR Validation Model
 * Tracks validation status and results for GitHub PRs
 */
export class PRValidation {
  constructor(data = {}) {
    this.id = data.id || this._generateId();
    this.pr_number = data.pr_number;
    this.repository = data.repository;
    this.branch_name = data.branch_name;
    this.status = data.status || 'pending';
    this.webhook_payload = data.webhook_payload || {};
    this.validation_results = data.validation_results || {};
    this.issues_detected = data.issues_detected || [];
    this.codegen_analysis_id = data.codegen_analysis_id || null;
    this.created_at = data.created_at || new Date().toISOString();
    this.updated_at = data.updated_at || new Date().toISOString();
    this.completed_at = data.completed_at || null;
    this.error_message = data.error_message || null;
    this.retry_count = data.retry_count || 0;
    this.metadata = data.metadata || {};
  }

  /**
   * Create a new PR validation record
   * @param {Object} data - Validation data
   * @returns {Promise<PRValidation>} Created validation instance
   */
  static async create(data) {
    const validation = new PRValidation(data);
    
    log('info', `Creating PR validation for PR #${validation.pr_number}`, {
      repository: validation.repository,
      branch: validation.branch_name,
      status: validation.status
    });

    // In a real implementation, this would save to database
    // For now, we'll store in memory or use the existing storage system
    await validation._save();
    
    return validation;
  }

  /**
   * Find validation by PR number and repository
   * @param {number} prNumber - PR number
   * @param {string} repository - Repository full name
   * @returns {Promise<PRValidation|null>} Found validation or null
   */
  static async findByPR(prNumber, repository) {
    // In a real implementation, this would query the database
    // For now, we'll use a simple in-memory lookup
    const key = `${repository}#${prNumber}`;
    const stored = PRValidation._storage.get(key);
    
    if (stored) {
      return new PRValidation(stored);
    }
    
    return null;
  }

  /**
   * Find all validations with a specific status
   * @param {string} status - Validation status
   * @returns {Promise<PRValidation[]>} Array of validations
   */
  static async findByStatus(status) {
    const validations = [];
    
    for (const [key, data] of PRValidation._storage.entries()) {
      if (data.status === status) {
        validations.push(new PRValidation(data));
      }
    }
    
    return validations;
  }

  /**
   * Update validation status
   * @param {string} status - New status
   * @param {Object} additionalData - Additional data to update
   * @returns {Promise<void>}
   */
  async updateStatus(status, additionalData = {}) {
    this.status = status;
    this.updated_at = new Date().toISOString();
    
    if (status === 'completed' || status === 'failed' || status === 'passed') {
      this.completed_at = new Date().toISOString();
    }
    
    // Merge additional data
    Object.assign(this, additionalData);
    
    log('info', `Updated PR validation status to ${status}`, {
      id: this.id,
      pr_number: this.pr_number,
      repository: this.repository
    });
    
    await this._save();
  }

  /**
   * Add detected issues
   * @param {Array} issues - Array of detected issues
   * @returns {Promise<void>}
   */
  async addIssues(issues) {
    this.issues_detected = [...this.issues_detected, ...issues];
    this.updated_at = new Date().toISOString();
    
    log('info', `Added ${issues.length} issues to PR validation`, {
      id: this.id,
      pr_number: this.pr_number,
      total_issues: this.issues_detected.length
    });
    
    await this._save();
  }

  /**
   * Set validation results
   * @param {Object} results - Validation results
   * @returns {Promise<void>}
   */
  async setResults(results) {
    this.validation_results = results;
    this.updated_at = new Date().toISOString();
    
    await this._save();
  }

  /**
   * Increment retry count
   * @returns {Promise<void>}
   */
  async incrementRetry() {
    this.retry_count += 1;
    this.updated_at = new Date().toISOString();
    
    await this._save();
  }

  /**
   * Check if validation can be retried
   * @returns {boolean} True if can retry
   */
  canRetry() {
    const maxRetries = 3;
    return this.retry_count < maxRetries && 
           ['failed', 'error'].includes(this.status);
  }

  /**
   * Get validation summary
   * @returns {Object} Validation summary
   */
  getSummary() {
    return {
      id: this.id,
      pr_number: this.pr_number,
      repository: this.repository,
      branch_name: this.branch_name,
      status: this.status,
      issues_count: this.issues_detected.length,
      created_at: this.created_at,
      updated_at: this.updated_at,
      completed_at: this.completed_at,
      retry_count: this.retry_count
    };
  }

  /**
   * Convert to JSON
   * @returns {Object} JSON representation
   */
  toJSON() {
    return {
      id: this.id,
      pr_number: this.pr_number,
      repository: this.repository,
      branch_name: this.branch_name,
      status: this.status,
      webhook_payload: this.webhook_payload,
      validation_results: this.validation_results,
      issues_detected: this.issues_detected,
      codegen_analysis_id: this.codegen_analysis_id,
      created_at: this.created_at,
      updated_at: this.updated_at,
      completed_at: this.completed_at,
      error_message: this.error_message,
      retry_count: this.retry_count,
      metadata: this.metadata
    };
  }

  /**
   * Generate unique ID
   * @returns {string} Unique ID
   * @private
   */
  _generateId() {
    return `pr_val_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Save validation to storage
   * @returns {Promise<void>}
   * @private
   */
  async _save() {
    const key = `${this.repository}#${this.pr_number}`;
    PRValidation._storage.set(key, this.toJSON());
    
    // Also store by ID for direct lookups
    PRValidation._storage.set(this.id, this.toJSON());
  }
}

// Simple in-memory storage for development
// In production, this would be replaced with actual database operations
PRValidation._storage = new Map();

/**
 * Validation Status enum
 */
export const ValidationStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  PASSED: 'passed',
  FAILED: 'failed',
  ERROR: 'error',
  CODEGEN_ANALYSIS_REQUESTED: 'codegen_analysis_requested',
  CODEGEN_ANALYSIS_COMPLETED: 'codegen_analysis_completed',
  COMPLETED: 'completed'
};

/**
 * Issue Severity enum
 */
export const IssueSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Issue Type enum
 */
export const IssueType = {
  LARGE_PR: 'large_pr',
  MISSING_TESTS: 'missing_tests',
  POTENTIAL_SECRET: 'potential_secret',
  BREAKING_CHANGE: 'breaking_change',
  SECURITY_VULNERABILITY: 'security_vulnerability',
  PERFORMANCE_ISSUE: 'performance_issue',
  CODE_QUALITY: 'code_quality',
  DOCUMENTATION: 'documentation'
};

export default PRValidation;

