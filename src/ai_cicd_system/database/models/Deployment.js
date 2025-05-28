/**
 * @fileoverview Deployment Model
 * @description Data model for tracking PR deployments and their execution status
 */

import { getConnection } from '../connection.js';

/**
 * Deployment model for managing CI/CD deployments
 */
export class Deployment {
    constructor(data = {}) {
        this.id = data.id;
        this.task_id = data.task_id;
        this.pr_url = data.pr_url;
        this.branch_name = data.branch_name;
        this.status = data.status || 'pending';
        this.logs = data.logs || {};
        this.error_count = data.error_count || 0;
        this.retry_count = data.retry_count || 0;
        this.last_error = data.last_error;
        this.created_at = data.created_at;
        this.updated_at = data.updated_at;
    }

    /**
     * Create a new deployment
     * @param {Object} deploymentData - Deployment data
     * @returns {Promise<Deployment>} Created deployment
     */
    static async create(deploymentData) {
        const db = getConnection();
        
        const query = `
            INSERT INTO deployments (task_id, pr_url, branch_name, status, logs)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        
        const values = [
            deploymentData.task_id,
            deploymentData.pr_url,
            deploymentData.branch_name,
            deploymentData.status || 'pending',
            JSON.stringify(deploymentData.logs || {})
        ];
        
        const result = await db.query(query, values);
        return new Deployment(result.rows[0]);
    }

    /**
     * Find deployment by ID
     * @param {string} id - Deployment ID
     * @returns {Promise<Deployment|null>} Deployment or null
     */
    static async findById(id) {
        const db = getConnection();
        
        const query = 'SELECT * FROM deployments WHERE id = $1';
        const result = await db.query(query, [id]);
        
        return result.rows.length > 0 ? new Deployment(result.rows[0]) : null;
    }

    /**
     * Find deployments by task ID
     * @param {string} taskId - Task ID
     * @returns {Promise<Deployment[]>} Array of deployments
     */
    static async findByTaskId(taskId) {
        const db = getConnection();
        
        const query = `
            SELECT * FROM deployments 
            WHERE task_id = $1 
            ORDER BY created_at DESC
        `;
        
        const result = await db.query(query, [taskId]);
        return result.rows.map(row => new Deployment(row));
    }

    /**
     * Find deployments by status
     * @param {string} status - Deployment status
     * @returns {Promise<Deployment[]>} Array of deployments
     */
    static async findByStatus(status) {
        const db = getConnection();
        
        const query = `
            SELECT * FROM deployments 
            WHERE status = $1 
            ORDER BY created_at DESC
        `;
        
        const result = await db.query(query, [status]);
        return result.rows.map(row => new Deployment(row));
    }

    /**
     * Find active deployments
     * @returns {Promise<Deployment[]>} Array of active deployments
     */
    static async findActive() {
        const db = getConnection();
        
        const query = `
            SELECT * FROM active_deployments 
            ORDER BY created_at DESC
        `;
        
        const result = await db.query(query);
        return result.rows.map(row => new Deployment(row));
    }

    /**
     * Update deployment status
     * @param {string} status - New status
     * @param {string} errorMessage - Optional error message
     * @returns {Promise<Deployment>} Updated deployment
     */
    async updateStatus(status, errorMessage = null) {
        const db = getConnection();
        
        // Use the stored procedure for consistent status updates
        await db.query(
            'SELECT update_deployment_status($1, $2, $3)',
            [this.id, status, errorMessage]
        );
        
        // Reload the deployment data
        const updated = await Deployment.findById(this.id);
        Object.assign(this, updated);
        return this;
    }

    /**
     * Add log entry to deployment
     * @param {string} level - Log level (info, warn, error)
     * @param {string} message - Log message
     * @param {Object} metadata - Additional metadata
     * @returns {Promise<Deployment>} Updated deployment
     */
    async addLog(level, message, metadata = {}) {
        const db = getConnection();
        
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            metadata
        };
        
        // Add to deployment logs
        const currentLogs = this.logs || {};
        if (!currentLogs.entries) {
            currentLogs.entries = [];
        }
        currentLogs.entries.push(logEntry);
        
        const query = `
            UPDATE deployments 
            SET logs = $1, updated_at = NOW()
            WHERE id = $2
            RETURNING *
        `;
        
        const result = await db.query(query, [JSON.stringify(currentLogs), this.id]);
        Object.assign(this, result.rows[0]);
        
        return this;
    }

    /**
     * Increment retry count
     * @returns {Promise<Deployment>} Updated deployment
     */
    async incrementRetry() {
        const db = getConnection();
        
        const query = `
            UPDATE deployments 
            SET retry_count = retry_count + 1, updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `;
        
        const result = await db.query(query, [this.id]);
        Object.assign(this, result.rows[0]);
        
        return this;
    }

    /**
     * Get deployment validation results
     * @returns {Promise<Array>} Validation results
     */
    async getValidationResults() {
        const db = getConnection();
        
        const query = `
            SELECT * FROM validation_results 
            WHERE deployment_id = $1 
            ORDER BY created_at DESC
        `;
        
        const result = await db.query(query, [this.id]);
        return result.rows;
    }

    /**
     * Get deployment summary statistics
     * @returns {Promise<Object>} Deployment statistics
     */
    static async getStatistics() {
        const db = getConnection();
        
        const query = 'SELECT * FROM deployment_summary';
        const result = await db.query(query);
        
        return result.rows.reduce((acc, row) => {
            acc[row.status] = {
                count: parseInt(row.deployment_count),
                avgErrorCount: parseFloat(row.avg_error_count),
                avgRetryCount: parseFloat(row.avg_retry_count),
                deploymentsWithErrors: parseInt(row.deployments_with_errors)
            };
            return acc;
        }, {});
    }

    /**
     * Delete deployment and related data
     * @returns {Promise<boolean>} Success status
     */
    async delete() {
        const db = getConnection();
        
        const query = 'DELETE FROM deployments WHERE id = $1';
        const result = await db.query(query, [this.id]);
        
        return result.rowCount > 0;
    }

    /**
     * Convert to JSON representation
     * @returns {Object} JSON representation
     */
    toJSON() {
        return {
            id: this.id,
            task_id: this.task_id,
            pr_url: this.pr_url,
            branch_name: this.branch_name,
            status: this.status,
            logs: this.logs,
            error_count: this.error_count,
            retry_count: this.retry_count,
            last_error: this.last_error,
            created_at: this.created_at,
            updated_at: this.updated_at
        };
    }

    /**
     * Validate deployment data
     * @param {Object} data - Data to validate
     * @returns {Object} Validation result
     */
    static validate(data) {
        const errors = [];
        
        if (!data.task_id) {
            errors.push('task_id is required');
        }
        
        if (!data.pr_url) {
            errors.push('pr_url is required');
        }
        
        if (!data.branch_name) {
            errors.push('branch_name is required');
        }
        
        if (data.status && !['pending', 'running', 'completed', 'failed', 'cancelled'].includes(data.status)) {
            errors.push('Invalid status value');
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
}

export default Deployment;

