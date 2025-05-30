/**
 * @fileoverview Dependency Model - Database operations for task dependencies
 * @description Enhanced dependency model for managing task relationships and blocking conditions
 * @version 1.0.0
 */

import { DatabaseConnectionManager } from '../connection/connection_manager.js';

export class DependencyModel {
    static db = null;

    /**
     * Initialize the database connection
     */
    static async initialize() {
        if (!this.db) {
            this.db = new DatabaseConnectionManager();
            await this.db.connect();
        }
        return this.db;
    }

    /**
     * Create a task dependency
     * @param {Object} client - Database client (for transactions)
     * @param {string} taskId - Task that depends on another
     * @param {string} dependsOnTaskId - Task that must be completed first
     * @param {string} dependencyType - Type of dependency ('blocks', 'relates_to', 'duplicates')
     * @returns {Promise<Object>} Created dependency
     */
    static async create(client, taskId, dependsOnTaskId, dependencyType = 'blocks') {
        const db = client || await this.initialize();
        
        // Check for circular dependencies
        const hasCircular = await this.wouldCreateCircularDependency(taskId, dependsOnTaskId);
        if (hasCircular) {
            throw new Error('Creating this dependency would result in a circular dependency');
        }
        
        const query = `
            INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type)
            VALUES ($1, $2, $3)
            ON CONFLICT (task_id, depends_on_task_id) 
            DO UPDATE SET dependency_type = $3, updated_at = NOW()
            RETURNING *
        `;

        const values = [taskId, dependsOnTaskId, dependencyType];
        const result = await db.query(query, values);
        return result.rows[0];
    }

    /**
     * Get all dependencies for a task
     * @param {string} taskId - Task ID
     * @returns {Promise<Array>} Array of dependencies
     */
    static async getDependencies(taskId) {
        const db = await this.initialize();
        
        const query = `
            SELECT 
                td.*,
                t.title as depends_on_title,
                t.description as depends_on_description,
                t.status as depends_on_status,
                t.priority as depends_on_priority
            FROM task_dependencies td
            JOIN tasks t ON td.depends_on_task_id = t.id
            WHERE td.task_id = $1
            ORDER BY td.created_at
        `;

        const result = await db.query(query, [taskId]);
        return result.rows;
    }

    /**
     * Get all tasks that depend on this task
     * @param {string} taskId - Task ID
     * @returns {Promise<Array>} Array of dependent tasks
     */
    static async getDependents(taskId) {
        const db = await this.initialize();
        
        const query = `
            SELECT 
                td.*,
                t.title as dependent_title,
                t.description as dependent_description,
                t.status as dependent_status,
                t.priority as dependent_priority
            FROM task_dependencies td
            JOIN tasks t ON td.task_id = t.id
            WHERE td.depends_on_task_id = $1
            ORDER BY td.created_at
        `;

        const result = await db.query(query, [taskId]);
        return result.rows;
    }

    /**
     * Remove a dependency
     * @param {string} taskId - Task ID
     * @param {string} dependsOnTaskId - Dependency task ID
     * @returns {Promise<boolean>} Success status
     */
    static async remove(taskId, dependsOnTaskId) {
        const db = await this.initialize();
        
        const query = `
            DELETE FROM task_dependencies 
            WHERE task_id = $1 AND depends_on_task_id = $2
        `;

        const result = await db.query(query, [taskId, dependsOnTaskId]);
        return result.rowCount > 0;
    }

    /**
     * Remove all dependencies for a task
     * @param {string} taskId - Task ID
     * @returns {Promise<number>} Number of removed dependencies
     */
    static async removeAllForTask(taskId) {
        const db = await this.initialize();
        
        const query = `DELETE FROM task_dependencies WHERE task_id = $1`;
        const result = await db.query(query, [taskId]);
        
        return result.rowCount;
    }

    /**
     * Check if task is blocked by incomplete dependencies
     * @param {string} taskId - Task ID
     * @returns {Promise<Object>} Blocking status and details
     */
    static async getBlockingStatus(taskId) {
        const db = await this.initialize();
        
        const query = `
            SELECT 
                COUNT(*) as total_dependencies,
                COUNT(CASE WHEN t.status NOT IN ('completed', 'cancelled') THEN 1 END) as blocking_dependencies,
                ARRAY_AGG(
                    CASE WHEN t.status NOT IN ('completed', 'cancelled') 
                    THEN jsonb_build_object(
                        'id', t.id,
                        'title', t.title,
                        'status', t.status,
                        'dependency_type', td.dependency_type
                    ) END
                ) FILTER (WHERE t.status NOT IN ('completed', 'cancelled')) as blocking_tasks
            FROM task_dependencies td
            JOIN tasks t ON td.depends_on_task_id = t.id
            WHERE td.task_id = $1 AND td.dependency_type = 'blocks'
        `;

        const result = await db.query(query, [taskId]);
        const row = result.rows[0];
        
        return {
            isBlocked: parseInt(row.blocking_dependencies) > 0,
            totalDependencies: parseInt(row.total_dependencies),
            blockingDependencies: parseInt(row.blocking_dependencies),
            blockingTasks: row.blocking_tasks || []
        };
    }

    /**
     * Check if creating a dependency would create a circular dependency
     * @param {string} taskId - Task that would depend
     * @param {string} dependsOnTaskId - Task to depend on
     * @returns {Promise<boolean>} True if circular dependency would be created
     */
    static async wouldCreateCircularDependency(taskId, dependsOnTaskId) {
        const db = await this.initialize();
        
        // Use recursive CTE to check for circular dependencies
        const query = `
            WITH RECURSIVE dependency_path AS (
                -- Base case: direct dependency
                SELECT 
                    task_id, 
                    depends_on_task_id,
                    1 as depth,
                    ARRAY[task_id, depends_on_task_id] as path
                FROM task_dependencies
                WHERE depends_on_task_id = $1
                
                UNION ALL
                
                -- Recursive case: follow dependency chain
                SELECT 
                    td.task_id,
                    td.depends_on_task_id,
                    dp.depth + 1,
                    dp.path || td.depends_on_task_id
                FROM task_dependencies td
                JOIN dependency_path dp ON td.depends_on_task_id = dp.task_id
                WHERE dp.depth < 50 -- Prevent infinite recursion
                  AND NOT td.depends_on_task_id = ANY(dp.path) -- Prevent cycles in traversal
            )
            SELECT 1 FROM dependency_path 
            WHERE task_id = $2
            LIMIT 1
        `;

        const result = await db.query(query, [taskId, dependsOnTaskId]);
        return result.rows.length > 0;
    }

    /**
     * Get dependency graph for visualization
     * @param {string} rootTaskId - Root task ID
     * @param {number} maxDepth - Maximum depth to traverse
     * @returns {Promise<Object>} Dependency graph
     */
    static async getDependencyGraph(rootTaskId, maxDepth = 10) {
        const db = await this.initialize();
        
        const query = `
            WITH RECURSIVE dependency_graph AS (
                -- Base case: root task
                SELECT 
                    t.id, t.title, t.status, t.priority,
                    NULL::UUID as depends_on_task_id,
                    NULL as dependency_type,
                    0 as depth,
                    ARRAY[t.id] as path
                FROM tasks t
                WHERE t.id = $1
                
                UNION ALL
                
                -- Recursive case: dependencies
                SELECT 
                    t.id, t.title, t.status, t.priority,
                    td.depends_on_task_id,
                    td.dependency_type,
                    dg.depth + 1,
                    dg.path || t.id
                FROM tasks t
                JOIN task_dependencies td ON t.id = td.task_id
                JOIN dependency_graph dg ON td.depends_on_task_id = dg.id
                WHERE dg.depth < $2
                  AND NOT t.id = ANY(dg.path) -- Prevent cycles
            )
            SELECT * FROM dependency_graph
            ORDER BY depth, title
        `;

        const result = await db.query(query, [rootTaskId, maxDepth]);
        return this._buildDependencyGraph(result.rows);
    }

    /**
     * Build dependency graph structure from flat results
     * @private
     */
    static _buildDependencyGraph(flatResults) {
        const nodes = new Map();
        const edges = [];

        for (const row of flatResults) {
            // Add node if not exists
            if (!nodes.has(row.id)) {
                nodes.set(row.id, {
                    id: row.id,
                    title: row.title,
                    status: row.status,
                    priority: row.priority,
                    depth: row.depth
                });
            }

            // Add edge if dependency exists
            if (row.depends_on_task_id) {
                edges.push({
                    from: row.depends_on_task_id,
                    to: row.id,
                    type: row.dependency_type
                });
            }
        }

        return {
            nodes: Array.from(nodes.values()),
            edges: edges
        };
    }

    /**
     * Get tasks ready to start (no blocking dependencies)
     * @param {Object} filters - Optional filters
     * @returns {Promise<Array>} Array of ready tasks
     */
    static async getReadyTasks(filters = {}) {
        const db = await this.initialize();
        
        let query = `
            SELECT DISTINCT t.*
            FROM tasks t
            WHERE t.status IN ('pending', 'ready')
              AND NOT EXISTS (
                  SELECT 1 FROM task_dependencies td
                  JOIN tasks dt ON td.depends_on_task_id = dt.id
                  WHERE td.task_id = t.id 
                    AND td.dependency_type = 'blocks'
                    AND dt.status NOT IN ('completed', 'cancelled')
              )
        `;

        const values = [];
        let paramIndex = 1;

        if (filters.project_id) {
            query += ` AND t.project_id = $${paramIndex}`;
            values.push(filters.project_id);
            paramIndex++;
        }

        if (filters.assigned_agent) {
            query += ` AND t.assigned_agent = $${paramIndex}`;
            values.push(filters.assigned_agent);
            paramIndex++;
        }

        if (filters.priority_min !== undefined) {
            query += ` AND t.priority >= $${paramIndex}`;
            values.push(filters.priority_min);
            paramIndex++;
        }

        query += ` ORDER BY t.priority DESC, t.created_at ASC`;

        if (filters.limit) {
            query += ` LIMIT $${paramIndex}`;
            values.push(filters.limit);
            paramIndex++;
        }

        const result = await db.query(query, values);
        return result.rows;
    }

    /**
     * Update dependency type
     * @param {string} taskId - Task ID
     * @param {string} dependsOnTaskId - Dependency task ID
     * @param {string} newType - New dependency type
     * @returns {Promise<Object>} Updated dependency
     */
    static async updateType(taskId, dependsOnTaskId, newType) {
        const db = await this.initialize();
        
        const query = `
            UPDATE task_dependencies 
            SET dependency_type = $1, updated_at = NOW()
            WHERE task_id = $2 AND depends_on_task_id = $3
            RETURNING *
        `;

        const result = await db.query(query, [newType, taskId, dependsOnTaskId]);
        return result.rows[0];
    }
}

