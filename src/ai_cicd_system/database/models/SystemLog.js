/**
 * @fileoverview SystemLog Model
 * @description Data model for comprehensive system logging and monitoring
 */

import { getConnection } from '../connection.js';

/**
 * SystemLog model for managing system logs and monitoring
 */
export class SystemLog {
    constructor(data = {}) {
        this.id = data.id;
        this.component = data.component;
        this.level = data.level;
        this.message = data.message;
        this.metadata = data.metadata || {};
        this.created_at = data.created_at;
    }

    /**
     * Create a new system log entry
     * @param {Object} logData - Log data
     * @returns {Promise<SystemLog>} Created system log
     */
    static async create(logData) {
        const db = getConnection();
        
        // Use the stored procedure for consistent logging
        const query = `
            SELECT log_system_event($1, $2, $3, $4) as log_id
        `;
        
        const values = [
            logData.component,
            logData.level,
            logData.message,
            JSON.stringify(logData.metadata || {})
        ];
        
        const result = await db.query(query, values);
        const logId = result.rows[0].log_id;
        
        return await SystemLog.findById(logId);
    }

    /**
     * Find system log by ID
     * @param {string} id - Log ID
     * @returns {Promise<SystemLog|null>} System log or null
     */
    static async findById(id) {
        const db = getConnection();
        
        const query = 'SELECT * FROM system_logs WHERE id = $1';
        const result = await db.query(query, [id]);
        
        return result.rows.length > 0 ? new SystemLog(result.rows[0]) : null;
    }

    /**
     * Find logs by component
     * @param {string} component - Component name
     * @param {Object} options - Query options
     * @returns {Promise<SystemLog[]>} Array of system logs
     */
    static async findByComponent(component, options = {}) {
        const db = getConnection();
        
        const {
            level = null,
            limit = 100,
            offset = 0,
            startDate = null,
            endDate = null
        } = options;
        
        let query = 'SELECT * FROM system_logs WHERE component = $1';
        const values = [component];
        let paramIndex = 2;
        
        if (level) {
            query += ` AND level = $${paramIndex}`;
            values.push(level);
            paramIndex++;
        }
        
        if (startDate) {
            query += ` AND created_at >= $${paramIndex}`;
            values.push(startDate);
            paramIndex++;
        }
        
        if (endDate) {
            query += ` AND created_at <= $${paramIndex}`;
            values.push(endDate);
            paramIndex++;
        }
        
        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);
        
        const result = await db.query(query, values);
        return result.rows.map(row => new SystemLog(row));
    }

    /**
     * Find logs by level
     * @param {string} level - Log level
     * @param {Object} options - Query options
     * @returns {Promise<SystemLog[]>} Array of system logs
     */
    static async findByLevel(level, options = {}) {
        const db = getConnection();
        
        const {
            component = null,
            limit = 100,
            offset = 0,
            startDate = null,
            endDate = null
        } = options;
        
        let query = 'SELECT * FROM system_logs WHERE level = $1';
        const values = [level];
        let paramIndex = 2;
        
        if (component) {
            query += ` AND component = $${paramIndex}`;
            values.push(component);
            paramIndex++;
        }
        
        if (startDate) {
            query += ` AND created_at >= $${paramIndex}`;
            values.push(startDate);
            paramIndex++;
        }
        
        if (endDate) {
            query += ` AND created_at <= $${paramIndex}`;
            values.push(endDate);
            paramIndex++;
        }
        
        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);
        
        const result = await db.query(query, values);
        return result.rows.map(row => new SystemLog(row));
    }

    /**
     * Get recent logs
     * @param {Object} options - Query options
     * @returns {Promise<SystemLog[]>} Array of recent system logs
     */
    static async getRecent(options = {}) {
        const db = getConnection();
        
        const {
            limit = 100,
            offset = 0,
            level = null,
            component = null,
            hours = 24
        } = options;
        
        let query = `
            SELECT * FROM system_logs 
            WHERE created_at >= NOW() - INTERVAL '${hours} hours'
        `;
        const values = [];
        let paramIndex = 1;
        
        if (level) {
            query += ` AND level = $${paramIndex}`;
            values.push(level);
            paramIndex++;
        }
        
        if (component) {
            query += ` AND component = $${paramIndex}`;
            values.push(component);
            paramIndex++;
        }
        
        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);
        
        const result = await db.query(query, values);
        return result.rows.map(row => new SystemLog(row));
    }

    /**
     * Get error logs
     * @param {Object} options - Query options
     * @returns {Promise<SystemLog[]>} Array of error logs
     */
    static async getErrors(options = {}) {
        const db = getConnection();
        
        const {
            limit = 100,
            offset = 0,
            component = null,
            hours = 24
        } = options;
        
        let query = `
            SELECT * FROM system_logs 
            WHERE level IN ('error', 'fatal') 
            AND created_at >= NOW() - INTERVAL '${hours} hours'
        `;
        const values = [];
        let paramIndex = 1;
        
        if (component) {
            query += ` AND component = $${paramIndex}`;
            values.push(component);
            paramIndex++;
        }
        
        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);
        
        const result = await db.query(query, values);
        return result.rows.map(row => new SystemLog(row));
    }

    /**
     * Get system health summary
     * @returns {Promise<Object>} System health summary
     */
    static async getHealthSummary() {
        const db = getConnection();
        
        const query = 'SELECT * FROM system_health ORDER BY component, level';
        const result = await db.query(query);
        
        const summary = {
            components: {},
            overall: {
                total_logs: 0,
                error_count: 0,
                warning_count: 0,
                info_count: 0,
                debug_count: 0
            }
        };
        
        result.rows.forEach(row => {
            const component = row.component;
            const level = row.level;
            const count = parseInt(row.log_count);
            
            if (!summary.components[component]) {
                summary.components[component] = {
                    total_logs: 0,
                    recent_logs: 0,
                    last_log_time: null,
                    levels: {}
                };
            }
            
            summary.components[component].levels[level] = count;
            summary.components[component].total_logs += count;
            summary.components[component].recent_logs = parseInt(row.recent_logs);
            summary.components[component].last_log_time = row.last_log_time;
            
            summary.overall.total_logs += count;
            
            switch (level) {
                case 'error':
                case 'fatal':
                    summary.overall.error_count += count;
                    break;
                case 'warn':
                    summary.overall.warning_count += count;
                    break;
                case 'info':
                    summary.overall.info_count += count;
                    break;
                case 'debug':
                    summary.overall.debug_count += count;
                    break;
            }
        });
        
        return summary;
    }

    /**
     * Get log statistics
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Log statistics
     */
    static async getStatistics(options = {}) {
        const db = getConnection();
        
        const { hours = 24 } = options;
        
        const query = `
            SELECT 
                component,
                level,
                COUNT(*) as count,
                MIN(created_at) as first_log,
                MAX(created_at) as last_log
            FROM system_logs 
            WHERE created_at >= NOW() - INTERVAL '${hours} hours'
            GROUP BY component, level
            ORDER BY component, level
        `;
        
        const result = await db.query(query);
        
        const statistics = {
            period_hours: hours,
            components: {},
            totals: {
                debug: 0,
                info: 0,
                warn: 0,
                error: 0,
                fatal: 0
            }
        };
        
        result.rows.forEach(row => {
            const component = row.component;
            const level = row.level;
            const count = parseInt(row.count);
            
            if (!statistics.components[component]) {
                statistics.components[component] = {};
            }
            
            statistics.components[component][level] = {
                count,
                first_log: row.first_log,
                last_log: row.last_log
            };
            
            if (statistics.totals.hasOwnProperty(level)) {
                statistics.totals[level] += count;
            }
        });
        
        return statistics;
    }

    /**
     * Search logs by message content
     * @param {string} searchTerm - Search term
     * @param {Object} options - Query options
     * @returns {Promise<SystemLog[]>} Array of matching logs
     */
    static async search(searchTerm, options = {}) {
        const db = getConnection();
        
        const {
            limit = 100,
            offset = 0,
            level = null,
            component = null,
            hours = 24
        } = options;
        
        let query = `
            SELECT * FROM system_logs 
            WHERE message ILIKE $1 
            AND created_at >= NOW() - INTERVAL '${hours} hours'
        `;
        const values = [`%${searchTerm}%`];
        let paramIndex = 2;
        
        if (level) {
            query += ` AND level = $${paramIndex}`;
            values.push(level);
            paramIndex++;
        }
        
        if (component) {
            query += ` AND component = $${paramIndex}`;
            values.push(component);
            paramIndex++;
        }
        
        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);
        
        const result = await db.query(query, values);
        return result.rows.map(row => new SystemLog(row));
    }

    /**
     * Clean up old logs
     * @param {number} retentionDays - Number of days to retain logs
     * @returns {Promise<number>} Number of deleted logs
     */
    static async cleanup(retentionDays = 90) {
        const db = getConnection();
        
        const query = `
            DELETE FROM system_logs 
            WHERE created_at < NOW() - INTERVAL '${retentionDays} days'
        `;
        
        const result = await db.query(query);
        return result.rowCount;
    }

    /**
     * Convert to JSON representation
     * @returns {Object} JSON representation
     */
    toJSON() {
        return {
            id: this.id,
            component: this.component,
            level: this.level,
            message: this.message,
            metadata: this.metadata,
            created_at: this.created_at
        };
    }

    /**
     * Validate system log data
     * @param {Object} data - Data to validate
     * @returns {Object} Validation result
     */
    static validate(data) {
        const errors = [];
        
        if (!data.component) {
            errors.push('component is required');
        }
        
        if (!data.level) {
            errors.push('level is required');
        }
        
        if (!data.message) {
            errors.push('message is required');
        }
        
        if (data.level && !['debug', 'info', 'warn', 'error', 'fatal'].includes(data.level)) {
            errors.push('Invalid level value');
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Get available log levels
     * @returns {Array} Array of log levels
     */
    static getLogLevels() {
        return ['debug', 'info', 'warn', 'error', 'fatal'];
    }

    /**
     * Get common component names
     * @returns {Array} Array of common component names
     */
    static getCommonComponents() {
        return [
            'database',
            'api_server',
            'webhook_handler',
            'deployment_manager',
            'validation_engine',
            'task_processor',
            'codegen_client',
            'claude_code_client',
            'error_handler',
            'monitoring',
            'authentication',
            'rate_limiter'
        ];
    }
}

export default SystemLog;

