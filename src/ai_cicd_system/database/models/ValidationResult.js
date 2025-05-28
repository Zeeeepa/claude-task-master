/**
 * @fileoverview ValidationResult Model
 * @description Data model for tracking validation and testing results
 */

import { getConnection } from '../connection.js';

/**
 * ValidationResult model for managing test and validation results
 */
export class ValidationResult {
    constructor(data = {}) {
        this.id = data.id;
        this.deployment_id = data.deployment_id;
        this.test_type = data.test_type;
        this.status = data.status;
        this.output = data.output;
        this.duration_ms = data.duration_ms;
        this.created_at = data.created_at;
    }

    /**
     * Create a new validation result
     * @param {Object} resultData - Validation result data
     * @returns {Promise<ValidationResult>} Created validation result
     */
    static async create(resultData) {
        const db = getConnection();
        
        const query = `
            INSERT INTO validation_results (deployment_id, test_type, status, output, duration_ms)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        
        const values = [
            resultData.deployment_id,
            resultData.test_type,
            resultData.status,
            resultData.output,
            resultData.duration_ms
        ];
        
        const result = await db.query(query, values);
        return new ValidationResult(result.rows[0]);
    }

    /**
     * Find validation result by ID
     * @param {string} id - Validation result ID
     * @returns {Promise<ValidationResult|null>} Validation result or null
     */
    static async findById(id) {
        const db = getConnection();
        
        const query = 'SELECT * FROM validation_results WHERE id = $1';
        const result = await db.query(query, [id]);
        
        return result.rows.length > 0 ? new ValidationResult(result.rows[0]) : null;
    }

    /**
     * Find validation results by deployment ID
     * @param {string} deploymentId - Deployment ID
     * @returns {Promise<ValidationResult[]>} Array of validation results
     */
    static async findByDeploymentId(deploymentId) {
        const db = getConnection();
        
        const query = `
            SELECT * FROM validation_results 
            WHERE deployment_id = $1 
            ORDER BY created_at DESC
        `;
        
        const result = await db.query(query, [deploymentId]);
        return result.rows.map(row => new ValidationResult(row));
    }

    /**
     * Find validation results by test type
     * @param {string} testType - Test type
     * @returns {Promise<ValidationResult[]>} Array of validation results
     */
    static async findByTestType(testType) {
        const db = getConnection();
        
        const query = `
            SELECT * FROM validation_results 
            WHERE test_type = $1 
            ORDER BY created_at DESC
        `;
        
        const result = await db.query(query, [testType]);
        return result.rows.map(row => new ValidationResult(row));
    }

    /**
     * Find validation results by status
     * @param {string} status - Validation status
     * @returns {Promise<ValidationResult[]>} Array of validation results
     */
    static async findByStatus(status) {
        const db = getConnection();
        
        const query = `
            SELECT * FROM validation_results 
            WHERE status = $1 
            ORDER BY created_at DESC
        `;
        
        const result = await db.query(query, [status]);
        return result.rows.map(row => new ValidationResult(row));
    }

    /**
     * Get validation statistics for a deployment
     * @param {string} deploymentId - Deployment ID
     * @returns {Promise<Object>} Validation statistics
     */
    static async getDeploymentStatistics(deploymentId) {
        const db = getConnection();
        
        const query = `
            SELECT 
                test_type,
                status,
                COUNT(*) as count,
                AVG(duration_ms) as avg_duration,
                MIN(duration_ms) as min_duration,
                MAX(duration_ms) as max_duration
            FROM validation_results 
            WHERE deployment_id = $1 
            GROUP BY test_type, status
            ORDER BY test_type, status
        `;
        
        const result = await db.query(query, [deploymentId]);
        
        const statistics = {
            total: 0,
            by_type: {},
            by_status: {},
            overall: {
                passed: 0,
                failed: 0,
                pending: 0,
                running: 0,
                skipped: 0
            }
        };
        
        result.rows.forEach(row => {
            const count = parseInt(row.count);
            statistics.total += count;
            
            // By test type
            if (!statistics.by_type[row.test_type]) {
                statistics.by_type[row.test_type] = {};
            }
            statistics.by_type[row.test_type][row.status] = {
                count,
                avg_duration: parseFloat(row.avg_duration),
                min_duration: parseInt(row.min_duration),
                max_duration: parseInt(row.max_duration)
            };
            
            // By status
            if (!statistics.by_status[row.status]) {
                statistics.by_status[row.status] = 0;
            }
            statistics.by_status[row.status] += count;
            
            // Overall counts
            if (statistics.overall.hasOwnProperty(row.status)) {
                statistics.overall[row.status] += count;
            }
        });
        
        return statistics;
    }

    /**
     * Get validation trends over time
     * @param {number} days - Number of days to analyze
     * @returns {Promise<Array>} Validation trends
     */
    static async getValidationTrends(days = 7) {
        const db = getConnection();
        
        const query = `
            SELECT 
                DATE(created_at) as date,
                test_type,
                status,
                COUNT(*) as count,
                AVG(duration_ms) as avg_duration
            FROM validation_results 
            WHERE created_at >= NOW() - INTERVAL '${days} days'
            GROUP BY DATE(created_at), test_type, status
            ORDER BY date DESC, test_type, status
        `;
        
        const result = await db.query(query);
        return result.rows.map(row => ({
            date: row.date,
            test_type: row.test_type,
            status: row.status,
            count: parseInt(row.count),
            avg_duration: parseFloat(row.avg_duration)
        }));
    }

    /**
     * Get slow validation results
     * @param {number} thresholdMs - Duration threshold in milliseconds
     * @returns {Promise<ValidationResult[]>} Slow validation results
     */
    static async getSlowValidations(thresholdMs = 30000) {
        const db = getConnection();
        
        const query = `
            SELECT vr.*, d.pr_url, d.branch_name, t.title as task_title
            FROM validation_results vr
            JOIN deployments d ON vr.deployment_id = d.id
            JOIN tasks t ON d.task_id = t.id
            WHERE vr.duration_ms > $1
            ORDER BY vr.duration_ms DESC
        `;
        
        const result = await db.query(query, [thresholdMs]);
        return result.rows.map(row => ({
            ...new ValidationResult(row),
            pr_url: row.pr_url,
            branch_name: row.branch_name,
            task_title: row.task_title
        }));
    }

    /**
     * Update validation result status
     * @param {string} status - New status
     * @param {string} output - Optional output
     * @param {number} durationMs - Optional duration
     * @returns {Promise<ValidationResult>} Updated validation result
     */
    async updateStatus(status, output = null, durationMs = null) {
        const db = getConnection();
        
        const query = `
            UPDATE validation_results 
            SET status = $1, 
                output = COALESCE($2, output),
                duration_ms = COALESCE($3, duration_ms)
            WHERE id = $4
            RETURNING *
        `;
        
        const result = await db.query(query, [status, output, durationMs, this.id]);
        Object.assign(this, result.rows[0]);
        
        return this;
    }

    /**
     * Delete validation result
     * @returns {Promise<boolean>} Success status
     */
    async delete() {
        const db = getConnection();
        
        const query = 'DELETE FROM validation_results WHERE id = $1';
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
            deployment_id: this.deployment_id,
            test_type: this.test_type,
            status: this.status,
            output: this.output,
            duration_ms: this.duration_ms,
            created_at: this.created_at
        };
    }

    /**
     * Validate validation result data
     * @param {Object} data - Data to validate
     * @returns {Object} Validation result
     */
    static validate(data) {
        const errors = [];
        
        if (!data.deployment_id) {
            errors.push('deployment_id is required');
        }
        
        if (!data.test_type) {
            errors.push('test_type is required');
        }
        
        if (!data.status) {
            errors.push('status is required');
        }
        
        if (data.status && !['pending', 'running', 'passed', 'failed', 'skipped'].includes(data.status)) {
            errors.push('Invalid status value');
        }
        
        if (data.duration_ms && (isNaN(data.duration_ms) || data.duration_ms < 0)) {
            errors.push('duration_ms must be a non-negative number');
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Get common test types
     * @returns {Array} Array of common test types
     */
    static getCommonTestTypes() {
        return [
            'unit_test',
            'integration_test',
            'e2e_test',
            'security_scan',
            'performance_test',
            'code_quality',
            'dependency_check',
            'build_verification',
            'deployment_verification',
            'health_check'
        ];
    }
}

export default ValidationResult;

