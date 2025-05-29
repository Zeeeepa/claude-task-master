/**
 * @fileoverview Query Builder
 * @description Advanced query builder for complex database operations with CI/CD optimizations
 */

import { getConnection } from './connection.js';

/**
 * Query Builder class for constructing complex SQL queries
 */
export class QueryBuilder {
    constructor(tableName) {
        this.tableName = tableName;
        this.selectFields = ['*'];
        this.joinClauses = [];
        this.whereClauses = [];
        this.groupByClauses = [];
        this.havingClauses = [];
        this.orderByClauses = [];
        this.limitValue = null;
        this.offsetValue = null;
        this.parameters = [];
        this.parameterIndex = 1;
    }

    /**
     * Add SELECT fields
     * @param {string|Array} fields - Fields to select
     * @returns {QueryBuilder} This instance for chaining
     */
    select(fields) {
        if (Array.isArray(fields)) {
            this.selectFields = fields;
        } else if (typeof fields === 'string') {
            this.selectFields = fields.split(',').map(f => f.trim());
        }
        return this;
    }

    /**
     * Add JOIN clause
     * @param {string} table - Table to join
     * @param {string} condition - Join condition
     * @param {string} type - Join type (INNER, LEFT, RIGHT, FULL)
     * @returns {QueryBuilder} This instance for chaining
     */
    join(table, condition, type = 'INNER') {
        this.joinClauses.push(`${type} JOIN ${table} ON ${condition}`);
        return this;
    }

    /**
     * Add LEFT JOIN clause
     * @param {string} table - Table to join
     * @param {string} condition - Join condition
     * @returns {QueryBuilder} This instance for chaining
     */
    leftJoin(table, condition) {
        return this.join(table, condition, 'LEFT');
    }

    /**
     * Add WHERE clause
     * @param {string} field - Field name
     * @param {string} operator - Comparison operator
     * @param {any} value - Value to compare
     * @returns {QueryBuilder} This instance for chaining
     */
    where(field, operator, value) {
        const placeholder = `$${this.parameterIndex++}`;
        this.whereClauses.push(`${field} ${operator} ${placeholder}`);
        this.parameters.push(value);
        return this;
    }

    /**
     * Add WHERE IN clause
     * @param {string} field - Field name
     * @param {Array} values - Array of values
     * @returns {QueryBuilder} This instance for chaining
     */
    whereIn(field, values) {
        if (!Array.isArray(values) || values.length === 0) {
            return this;
        }
        
        const placeholders = values.map(() => `$${this.parameterIndex++}`).join(', ');
        this.whereClauses.push(`${field} IN (${placeholders})`);
        this.parameters.push(...values);
        return this;
    }

    /**
     * Add WHERE BETWEEN clause
     * @param {string} field - Field name
     * @param {any} start - Start value
     * @param {any} end - End value
     * @returns {QueryBuilder} This instance for chaining
     */
    whereBetween(field, start, end) {
        const startPlaceholder = `$${this.parameterIndex++}`;
        const endPlaceholder = `$${this.parameterIndex++}`;
        this.whereClauses.push(`${field} BETWEEN ${startPlaceholder} AND ${endPlaceholder}`);
        this.parameters.push(start, end);
        return this;
    }

    /**
     * Add WHERE LIKE clause
     * @param {string} field - Field name
     * @param {string} pattern - LIKE pattern
     * @returns {QueryBuilder} This instance for chaining
     */
    whereLike(field, pattern) {
        const placeholder = `$${this.parameterIndex++}`;
        this.whereClauses.push(`${field} LIKE ${placeholder}`);
        this.parameters.push(pattern);
        return this;
    }

    /**
     * Add WHERE IS NULL clause
     * @param {string} field - Field name
     * @returns {QueryBuilder} This instance for chaining
     */
    whereNull(field) {
        this.whereClauses.push(`${field} IS NULL`);
        return this;
    }

    /**
     * Add WHERE IS NOT NULL clause
     * @param {string} field - Field name
     * @returns {QueryBuilder} This instance for chaining
     */
    whereNotNull(field) {
        this.whereClauses.push(`${field} IS NOT NULL`);
        return this;
    }

    /**
     * Add raw WHERE clause
     * @param {string} clause - Raw SQL clause
     * @param {Array} params - Parameters for the clause
     * @returns {QueryBuilder} This instance for chaining
     */
    whereRaw(clause, params = []) {
        // Replace ? placeholders with $n placeholders
        let processedClause = clause;
        params.forEach(() => {
            processedClause = processedClause.replace('?', `$${this.parameterIndex++}`);
        });
        
        this.whereClauses.push(processedClause);
        this.parameters.push(...params);
        return this;
    }

    /**
     * Add OR WHERE clause
     * @param {Function} callback - Callback to build OR conditions
     * @returns {QueryBuilder} This instance for chaining
     */
    orWhere(callback) {
        const subQuery = new QueryBuilder(this.tableName);
        callback(subQuery);
        
        if (subQuery.whereClauses.length > 0) {
            const orClause = `(${subQuery.whereClauses.join(' AND ')})`;
            this.whereClauses.push(`OR ${orClause}`);
            this.parameters.push(...subQuery.parameters);
        }
        
        return this;
    }

    /**
     * Add GROUP BY clause
     * @param {string|Array} fields - Fields to group by
     * @returns {QueryBuilder} This instance for chaining
     */
    groupBy(fields) {
        if (Array.isArray(fields)) {
            this.groupByClauses.push(...fields);
        } else {
            this.groupByClauses.push(fields);
        }
        return this;
    }

    /**
     * Add HAVING clause
     * @param {string} field - Field name
     * @param {string} operator - Comparison operator
     * @param {any} value - Value to compare
     * @returns {QueryBuilder} This instance for chaining
     */
    having(field, operator, value) {
        const placeholder = `$${this.parameterIndex++}`;
        this.havingClauses.push(`${field} ${operator} ${placeholder}`);
        this.parameters.push(value);
        return this;
    }

    /**
     * Add ORDER BY clause
     * @param {string} field - Field to order by
     * @param {string} direction - Order direction (ASC, DESC)
     * @returns {QueryBuilder} This instance for chaining
     */
    orderBy(field, direction = 'ASC') {
        this.orderByClauses.push(`${field} ${direction.toUpperCase()}`);
        return this;
    }

    /**
     * Add LIMIT clause
     * @param {number} limit - Number of records to limit
     * @returns {QueryBuilder} This instance for chaining
     */
    limit(limit) {
        this.limitValue = limit;
        return this;
    }

    /**
     * Add OFFSET clause
     * @param {number} offset - Number of records to skip
     * @returns {QueryBuilder} This instance for chaining
     */
    offset(offset) {
        this.offsetValue = offset;
        return this;
    }

    /**
     * Add pagination
     * @param {number} page - Page number (1-based)
     * @param {number} perPage - Records per page
     * @returns {QueryBuilder} This instance for chaining
     */
    paginate(page, perPage) {
        this.limitValue = perPage;
        this.offsetValue = (page - 1) * perPage;
        return this;
    }

    /**
     * Build the SQL query
     * @returns {Object} Query object with text and parameters
     */
    build() {
        let query = `SELECT ${this.selectFields.join(', ')} FROM ${this.tableName}`;
        
        // Add JOINs
        if (this.joinClauses.length > 0) {
            query += ` ${this.joinClauses.join(' ')}`;
        }
        
        // Add WHERE clauses
        if (this.whereClauses.length > 0) {
            query += ` WHERE ${this.whereClauses.join(' AND ')}`;
        }
        
        // Add GROUP BY
        if (this.groupByClauses.length > 0) {
            query += ` GROUP BY ${this.groupByClauses.join(', ')}`;
        }
        
        // Add HAVING
        if (this.havingClauses.length > 0) {
            query += ` HAVING ${this.havingClauses.join(' AND ')}`;
        }
        
        // Add ORDER BY
        if (this.orderByClauses.length > 0) {
            query += ` ORDER BY ${this.orderByClauses.join(', ')}`;
        }
        
        // Add LIMIT
        if (this.limitValue !== null) {
            query += ` LIMIT ${this.limitValue}`;
        }
        
        // Add OFFSET
        if (this.offsetValue !== null) {
            query += ` OFFSET ${this.offsetValue}`;
        }
        
        return {
            text: query,
            values: this.parameters
        };
    }

    /**
     * Execute the query
     * @returns {Promise<Object>} Query result
     */
    async execute() {
        const connection = getConnection();
        const query = this.build();
        return await connection.query(query.text, query.values);
    }

    /**
     * Get first result
     * @returns {Promise<Object|null>} First result or null
     */
    async first() {
        this.limit(1);
        const result = await this.execute();
        return result.rows.length > 0 ? result.rows[0] : null;
    }

    /**
     * Get all results
     * @returns {Promise<Array>} All results
     */
    async get() {
        const result = await this.execute();
        return result.rows;
    }

    /**
     * Get count of results
     * @returns {Promise<number>} Count of results
     */
    async count() {
        const originalSelect = this.selectFields;
        this.selectFields = ['COUNT(*) as count'];
        
        const result = await this.execute();
        const count = parseInt(result.rows[0].count);
        
        // Restore original select
        this.selectFields = originalSelect;
        
        return count;
    }

    /**
     * Check if any results exist
     * @returns {Promise<boolean>} True if results exist
     */
    async exists() {
        const count = await this.count();
        return count > 0;
    }
}

/**
 * CI/CD specific query builders
 */
export class CICDQueryBuilder {
    /**
     * Get tasks with their CI/CD status
     * @param {Object} filters - Filter options
     * @returns {QueryBuilder} Query builder instance
     */
    static getTasksWithCICDStatus(filters = {}) {
        const qb = new QueryBuilder('tasks t')
            .select([
                't.*',
                'COUNT(DISTINCT ca.id) as artifact_count',
                'COUNT(DISTINCT vr.id) as validation_count',
                'COUNT(DISTINCT eh.id) as execution_count',
                'AVG(vr.score) as avg_validation_score',
                'MAX(eh.completed_at) as last_execution',
                'SUM(eh.duration_ms) as total_execution_time_ms'
            ])
            .leftJoin('code_artifacts ca', 't.id = ca.task_id')
            .leftJoin('validation_results vr', 't.id = vr.task_id')
            .leftJoin('execution_history eh', 't.id = eh.task_id')
            .groupBy(['t.id']);

        // Apply filters
        if (filters.status) {
            qb.whereIn('t.status', Array.isArray(filters.status) ? filters.status : [filters.status]);
        }

        if (filters.priority !== undefined) {
            qb.where('t.priority', '>=', filters.priority);
        }

        if (filters.assigned_to) {
            qb.where('t.assigned_to', '=', filters.assigned_to);
        }

        if (filters.created_after) {
            qb.where('t.created_at', '>=', filters.created_after);
        }

        if (filters.created_before) {
            qb.where('t.created_at', '<=', filters.created_before);
        }

        return qb.orderBy('t.updated_at', 'DESC');
    }

    /**
     * Get validation results with details
     * @param {Object} filters - Filter options
     * @returns {QueryBuilder} Query builder instance
     */
    static getValidationResults(filters = {}) {
        const qb = new QueryBuilder('validation_results vr')
            .select([
                'vr.*',
                't.title as task_title',
                'ca.file_path as artifact_path',
                'ca.artifact_type'
            ])
            .leftJoin('tasks t', 'vr.task_id = t.id')
            .leftJoin('code_artifacts ca', 'vr.artifact_id = ca.id');

        // Apply filters
        if (filters.task_id) {
            qb.where('vr.task_id', '=', filters.task_id);
        }

        if (filters.validation_type) {
            qb.whereIn('vr.validation_type', 
                Array.isArray(filters.validation_type) ? filters.validation_type : [filters.validation_type]);
        }

        if (filters.status) {
            qb.whereIn('vr.validation_status', 
                Array.isArray(filters.status) ? filters.status : [filters.status]);
        }

        if (filters.min_score !== undefined) {
            qb.where('vr.score', '>=', filters.min_score);
        }

        if (filters.has_critical_issues) {
            qb.where('vr.issues_critical', '>', 0);
        }

        if (filters.completed_after) {
            qb.where('vr.completed_at', '>=', filters.completed_after);
        }

        return qb.orderBy('vr.completed_at', 'DESC');
    }

    /**
     * Get execution history with performance metrics
     * @param {Object} filters - Filter options
     * @returns {QueryBuilder} Query builder instance
     */
    static getExecutionHistory(filters = {}) {
        const qb = new QueryBuilder('execution_history eh')
            .select([
                'eh.*',
                't.title as task_title',
                't.status as task_status'
            ])
            .leftJoin('tasks t', 'eh.task_id = t.id');

        // Apply filters
        if (filters.task_id) {
            qb.where('eh.task_id', '=', filters.task_id);
        }

        if (filters.execution_type) {
            qb.whereIn('eh.execution_type', 
                Array.isArray(filters.execution_type) ? filters.execution_type : [filters.execution_type]);
        }

        if (filters.status) {
            qb.whereIn('eh.status', 
                Array.isArray(filters.status) ? filters.status : [filters.status]);
        }

        if (filters.min_duration_ms) {
            qb.where('eh.duration_ms', '>=', filters.min_duration_ms);
        }

        if (filters.max_duration_ms) {
            qb.where('eh.duration_ms', '<=', filters.max_duration_ms);
        }

        if (filters.started_after) {
            qb.where('eh.started_at', '>=', filters.started_after);
        }

        if (filters.exclude_retries) {
            qb.whereNull('eh.retry_of');
        }

        return qb.orderBy('eh.started_at', 'DESC');
    }

    /**
     * Get performance metrics aggregated by time
     * @param {Object} options - Query options
     * @returns {QueryBuilder} Query builder instance
     */
    static getPerformanceMetrics(options = {}) {
        const timeInterval = options.interval || 'hour';
        const timeField = `DATE_TRUNC('${timeInterval}', timestamp)`;
        
        const qb = new QueryBuilder('system_metrics')
            .select([
                `${timeField} as time_bucket`,
                'metric_category',
                'metric_name',
                'AVG(metric_value) as avg_value',
                'MIN(metric_value) as min_value',
                'MAX(metric_value) as max_value',
                'COUNT(*) as sample_count',
                'STDDEV(metric_value) as std_deviation'
            ])
            .groupBy([timeField, 'metric_category', 'metric_name']);

        // Apply time range filter
        if (options.start_time) {
            qb.where('timestamp', '>=', options.start_time);
        }

        if (options.end_time) {
            qb.where('timestamp', '<=', options.end_time);
        }

        // Apply category filter
        if (options.categories) {
            qb.whereIn('metric_category', 
                Array.isArray(options.categories) ? options.categories : [options.categories]);
        }

        // Apply metric name filter
        if (options.metrics) {
            qb.whereIn('metric_name', 
                Array.isArray(options.metrics) ? options.metrics : [options.metrics]);
        }

        return qb.orderBy(timeField, 'DESC');
    }

    /**
     * Get task dependency graph
     * @param {string} taskId - Root task ID
     * @param {number} depth - Maximum depth to traverse
     * @returns {QueryBuilder} Query builder instance
     */
    static getTaskDependencyGraph(taskId, depth = 3) {
        // This would typically use a recursive CTE for complex dependency traversal
        const qb = new QueryBuilder('task_relationships tr')
            .select([
                'tr.*',
                't1.title as source_task_title',
                't1.status as source_task_status',
                't2.title as target_task_title',
                't2.status as target_task_status'
            ])
            .join('tasks t1', 'tr.source_task_id = t1.id')
            .join('tasks t2', 'tr.target_task_id = t2.id');

        // Start from the specified task
        qb.orWhere(subQuery => {
            subQuery.where('tr.source_task_id', '=', taskId);
        }).orWhere(subQuery => {
            subQuery.where('tr.target_task_id', '=', taskId);
        });

        return qb.orderBy('tr.created_at', 'ASC');
    }
}

/**
 * Create a new query builder for a table
 * @param {string} tableName - Table name
 * @returns {QueryBuilder} Query builder instance
 */
export function query(tableName) {
    return new QueryBuilder(tableName);
}

/**
 * Create a new CI/CD query builder
 * @returns {CICDQueryBuilder} CI/CD query builder class
 */
export function cicdQuery() {
    return CICDQueryBuilder;
}

export default QueryBuilder;

