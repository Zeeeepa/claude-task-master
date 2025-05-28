/**
 * Base Model Class
 * Provides common functionality for all database models
 */

import { getDatabase } from '../connection.js';

export class BaseModel {
    constructor(tableName) {
        this.tableName = tableName;
        this.db = getDatabase();
    }

    /**
     * Find a record by ID
     */
    async findById(id) {
        const result = await this.db.query(
            `SELECT * FROM ${this.tableName} WHERE id = $1`,
            [id]
        );
        return result.rows[0] || null;
    }

    /**
     * Find records by criteria
     */
    async findBy(criteria = {}, options = {}) {
        const { limit = 100, offset = 0, orderBy = 'created_at', orderDirection = 'DESC' } = options;
        
        let query = `SELECT * FROM ${this.tableName}`;
        const params = [];
        const conditions = [];

        // Build WHERE clause
        Object.entries(criteria).forEach(([key, value], index) => {
            conditions.push(`${key} = $${index + 1}`);
            params.push(value);
        });

        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(' AND ')}`;
        }

        // Add ordering and pagination
        query += ` ORDER BY ${orderBy} ${orderDirection}`;
        query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await this.db.query(query, params);
        return result.rows;
    }

    /**
     * Find all records
     */
    async findAll(options = {}) {
        return this.findBy({}, options);
    }

    /**
     * Create a new record
     */
    async create(data) {
        const keys = Object.keys(data);
        const values = Object.values(data);
        const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
        
        const query = `
            INSERT INTO ${this.tableName} (${keys.join(', ')})
            VALUES (${placeholders})
            RETURNING *
        `;

        const result = await this.db.query(query, values);
        return result.rows[0];
    }

    /**
     * Update a record by ID
     */
    async updateById(id, data) {
        const keys = Object.keys(data);
        const values = Object.values(data);
        const setClause = keys.map((key, index) => `${key} = $${index + 2}`).join(', ');
        
        const query = `
            UPDATE ${this.tableName}
            SET ${setClause}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *
        `;

        const result = await this.db.query(query, [id, ...values]);
        return result.rows[0] || null;
    }

    /**
     * Delete a record by ID
     */
    async deleteById(id) {
        const result = await this.db.query(
            `DELETE FROM ${this.tableName} WHERE id = $1 RETURNING *`,
            [id]
        );
        return result.rows[0] || null;
    }

    /**
     * Count records by criteria
     */
    async count(criteria = {}) {
        let query = `SELECT COUNT(*) as count FROM ${this.tableName}`;
        const params = [];
        const conditions = [];

        Object.entries(criteria).forEach(([key, value], index) => {
            conditions.push(`${key} = $${index + 1}`);
            params.push(value);
        });

        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(' AND ')}`;
        }

        const result = await this.db.query(query, params);
        return parseInt(result.rows[0].count);
    }

    /**
     * Check if a record exists
     */
    async exists(criteria) {
        const count = await this.count(criteria);
        return count > 0;
    }

    /**
     * Execute a custom query
     */
    async query(sql, params = []) {
        return this.db.query(sql, params);
    }

    /**
     * Execute a transaction
     */
    async transaction(callback) {
        return this.db.transaction(callback);
    }
}

