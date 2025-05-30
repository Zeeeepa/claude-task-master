/**
 * @fileoverview Dependency Service for database operations
 * @description Service layer for task dependency management with circular dependency detection
 * @version 1.0.0
 */

import { getConnection } from '../connection/connection_manager.js';

/**
 * DependencyService class for dependency database operations
 */
export class DependencyService {
    constructor() {
        this.db = getConnection();
    }

    /**
     * Add a dependency between tasks
     * @param {string} taskId - Task ID that depends on another
     * @param {string} dependsOnTaskId - Task ID that is depended upon
     * @param {string} type - Dependency type ('blocks', 'requires', 'suggests')
     * @returns {Promise<Object>} Created dependency
     */
    async addDependency(taskId, dependsOnTaskId, type = 'blocks') {
        const client = await this.db.getClient();
        
        try {
            await client.query('BEGIN');

            // Check if dependency already exists
            const existingDep = await this._getDependency(client, taskId, dependsOnTaskId, type);
            if (existingDep) {
                throw new Error('Dependency already exists');
            }

            // Check for circular dependency
            const wouldCreateCircle = await this._checkCircularDependency(client, taskId, dependsOnTaskId);
            if (wouldCreateCircle) {
                throw new Error('Adding this dependency would create a circular dependency');
            }

            // Verify both tasks exist
            const task = await this._getTask(client, taskId);
            const dependsOnTask = await this._getTask(client, dependsOnTaskId);
            
            if (!task) {
                throw new Error(`Task ${taskId} not found`);
            }
            if (!dependsOnTask) {
                throw new Error(`Task ${dependsOnTaskId} not found`);
            }

            // Create the dependency
            const query = `
                INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, status)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            `;

            // Set initial status based on the depended-upon task's status
            const initialStatus = dependsOnTask.status === 'completed' ? 'satisfied' : 'pending';

            const result = await client.query(query, [taskId, dependsOnTaskId, type, initialStatus]);
            
            await client.query('COMMIT');
            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Remove a dependency between tasks
     * @param {string} taskId - Task ID
     * @param {string} dependsOnTaskId - Depended upon task ID
     * @param {string} type - Dependency type
     * @returns {Promise<boolean>} Success status
     */
    async removeDependency(taskId, dependsOnTaskId, type = 'blocks') {
        const query = `
            DELETE FROM task_dependencies 
            WHERE task_id = $1 AND depends_on_task_id = $2 AND dependency_type = $3
        `;

        const result = await this.db.query(query, [taskId, dependsOnTaskId, type]);
        return result.rowCount > 0;
    }

    /**
     * Get dependencies for a task
     * @param {string} taskId - Task ID
     * @param {string} type - Dependency type filter (optional)
     * @returns {Promise<Array>} Array of dependencies
     */
    async getDependencies(taskId, type = null) {
        let query = `
            SELECT 
                td.*,
                t.title as depends_on_task_title,
                t.status as depends_on_task_status,
                t.priority as depends_on_task_priority
            FROM task_dependencies td
            JOIN tasks t ON td.depends_on_task_id = t.id
            WHERE td.task_id = $1
        `;

        const values = [taskId];

        if (type) {
            query += ` AND td.dependency_type = $2`;
            values.push(type);
        }

        query += ` ORDER BY td.created_at ASC`;

        const result = await this.db.query(query, values);
        return result.rows;
    }

    /**
     * Check dependencies for a task
     * @param {string} taskId - Task ID
     * @returns {Promise<Object>} Dependency status summary
     */
    async checkDependencies(taskId) {
        const query = `
            SELECT 
                COUNT(*) as total_dependencies,
                COUNT(CASE WHEN status = 'satisfied' THEN 1 END) as satisfied_dependencies,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_dependencies,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_dependencies,
                CASE 
                    WHEN COUNT(*) = 0 THEN 'no_dependencies'
                    WHEN COUNT(*) = COUNT(CASE WHEN status = 'satisfied' THEN 1 END) THEN 'all_satisfied'
                    WHEN COUNT(CASE WHEN status = 'failed' THEN 1 END) > 0 THEN 'has_failed'
                    ELSE 'has_pending'
                END as dependency_status,
                CASE 
                    WHEN COUNT(*) = 0 THEN true
                    WHEN COUNT(*) = COUNT(CASE WHEN status = 'satisfied' THEN 1 END) THEN true
                    ELSE false
                END as is_ready
            FROM task_dependencies
            WHERE task_id = $1
        `;

        const result = await this.db.query(query, [taskId]);
        return result.rows[0];
    }

    /**
     * Validate dependency chain for circular dependencies
     * @param {string} taskId - Task ID to validate
     * @returns {Promise<Object>} Validation result
     */
    async validateDependencyChain(taskId) {
        const client = await this.db.getClient();
        
        try {
            const visited = new Set();
            const recursionStack = new Set();
            const path = [];

            const hasCircularDependency = await this._validateDependencyChainRecursive(
                client, taskId, visited, recursionStack, path
            );

            return {
                taskId,
                hasCircularDependency,
                validationPath: path,
                isValid: !hasCircularDependency
            };
        } finally {
            client.release();
        }
    }

    /**
     * Get tasks that depend on a specific task
     * @param {string} taskId - Task ID
     * @returns {Promise<Array>} Array of dependent tasks
     */
    async getDependentTasks(taskId) {
        const query = `
            SELECT 
                td.*,
                t.title as task_title,
                t.status as task_status,
                t.priority as task_priority
            FROM task_dependencies td
            JOIN tasks t ON td.task_id = t.id
            WHERE td.depends_on_task_id = $1
            ORDER BY t.priority DESC, td.created_at ASC
        `;

        const result = await this.db.query(query, [taskId]);
        return result.rows;
    }

    /**
     * Get dependency graph for a project
     * @param {string} projectId - Project ID (optional)
     * @returns {Promise<Object>} Dependency graph
     */
    async getDependencyGraph(projectId = null) {
        let query = `
            SELECT 
                td.task_id,
                td.depends_on_task_id,
                td.dependency_type,
                td.status,
                t1.title as task_title,
                t2.title as depends_on_task_title,
                t1.status as task_status,
                t2.status as depends_on_task_status
            FROM task_dependencies td
            JOIN tasks t1 ON td.task_id = t1.id
            JOIN tasks t2 ON td.depends_on_task_id = t2.id
        `;

        const values = [];
        if (projectId) {
            query += ` JOIN workflows w1 ON t1.workflow_id = w1.id 
                      WHERE w1.metadata->>'projectId' = $1`;
            values.push(projectId);
        }

        query += ` ORDER BY td.created_at ASC`;

        const result = await this.db.query(query, values);
        
        // Build graph structure
        const nodes = new Map();
        const edges = [];

        result.rows.forEach(row => {
            // Add nodes
            if (!nodes.has(row.task_id)) {
                nodes.set(row.task_id, {
                    id: row.task_id,
                    title: row.task_title,
                    status: row.task_status
                });
            }
            if (!nodes.has(row.depends_on_task_id)) {
                nodes.set(row.depends_on_task_id, {
                    id: row.depends_on_task_id,
                    title: row.depends_on_task_title,
                    status: row.depends_on_task_status
                });
            }

            // Add edge
            edges.push({
                from: row.depends_on_task_id,
                to: row.task_id,
                type: row.dependency_type,
                status: row.status
            });
        });

        return {
            nodes: Array.from(nodes.values()),
            edges: edges,
            stats: {
                totalNodes: nodes.size,
                totalEdges: edges.length,
                satisfiedDependencies: edges.filter(e => e.status === 'satisfied').length,
                pendingDependencies: edges.filter(e => e.status === 'pending').length,
                failedDependencies: edges.filter(e => e.status === 'failed').length
            }
        };
    }

    /**
     * Get a task by ID
     * @private
     * @param {Object} client - Database client
     * @param {string} taskId - Task ID
     * @returns {Promise<Object|null>} Task or null
     */
    async _getTask(client, taskId) {
        const query = 'SELECT * FROM tasks WHERE id = $1';
        const result = await client.query(query, [taskId]);
        return result.rows[0] || null;
    }

    /**
     * Get a dependency
     * @private
     * @param {Object} client - Database client
     * @param {string} taskId - Task ID
     * @param {string} dependsOnTaskId - Depended upon task ID
     * @param {string} type - Dependency type
     * @returns {Promise<Object|null>} Dependency or null
     */
    async _getDependency(client, taskId, dependsOnTaskId, type) {
        const query = `
            SELECT * FROM task_dependencies 
            WHERE task_id = $1 AND depends_on_task_id = $2 AND dependency_type = $3
        `;
        const result = await client.query(query, [taskId, dependsOnTaskId, type]);
        return result.rows[0] || null;
    }

    /**
     * Check for circular dependency
     * @private
     * @param {Object} client - Database client
     * @param {string} taskId - Task ID
     * @param {string} dependsOnTaskId - Potential dependency task ID
     * @returns {Promise<boolean>} Whether it would create a circular dependency
     */
    async _checkCircularDependency(client, taskId, dependsOnTaskId) {
        const query = `
            WITH RECURSIVE dependency_chain AS (
                -- Start with the potential dependency
                SELECT depends_on_task_id as task_id, task_id as depends_on_task_id, 1 as depth
                FROM task_dependencies
                WHERE task_id = $1
                
                UNION ALL
                
                -- Follow the chain of dependencies
                SELECT td.depends_on_task_id, dc.depends_on_task_id, dc.depth + 1
                FROM task_dependencies td
                JOIN dependency_chain dc ON td.task_id = dc.task_id
                WHERE dc.depth < 50 -- Prevent infinite recursion
            )
            SELECT 1 FROM dependency_chain 
            WHERE task_id = $2
        `;

        const result = await client.query(query, [dependsOnTaskId, taskId]);
        return result.rows.length > 0;
    }

    /**
     * Recursive dependency chain validation
     * @private
     * @param {Object} client - Database client
     * @param {string} taskId - Current task ID
     * @param {Set} visited - Visited tasks
     * @param {Set} recursionStack - Current recursion stack
     * @param {Array} path - Current path
     * @returns {Promise<boolean>} Whether circular dependency exists
     */
    async _validateDependencyChainRecursive(client, taskId, visited, recursionStack, path) {
        visited.add(taskId);
        recursionStack.add(taskId);
        path.push(taskId);

        // Get all dependencies for this task
        const query = `
            SELECT depends_on_task_id 
            FROM task_dependencies 
            WHERE task_id = $1
        `;
        
        const result = await client.query(query, [taskId]);
        
        for (const row of result.rows) {
            const dependsOnTaskId = row.depends_on_task_id;
            
            if (!visited.has(dependsOnTaskId)) {
                const hasCircular = await this._validateDependencyChainRecursive(
                    client, dependsOnTaskId, visited, recursionStack, path
                );
                if (hasCircular) return true;
            } else if (recursionStack.has(dependsOnTaskId)) {
                // Found a back edge - circular dependency
                return true;
            }
        }

        recursionStack.delete(taskId);
        path.pop();
        return false;
    }

    /**
     * Update dependency status based on task completion
     * @param {string} taskId - Task ID that was completed/failed
     * @param {string} newStatus - New task status
     * @returns {Promise<Array>} Updated dependencies
     */
    async updateDependencyStatus(taskId, newStatus) {
        let dependencyStatus;
        
        if (newStatus === 'completed') {
            dependencyStatus = 'satisfied';
        } else if (newStatus === 'failed') {
            dependencyStatus = 'failed';
        } else {
            // For other statuses, don't update dependencies
            return [];
        }

        const query = `
            UPDATE task_dependencies 
            SET status = $1, updated_at = NOW()
            WHERE depends_on_task_id = $2 AND status = 'pending'
            RETURNING *
        `;

        const result = await this.db.query(query, [dependencyStatus, taskId]);
        return result.rows;
    }

    /**
     * Get critical path analysis
     * @param {string} projectId - Project ID (optional)
     * @returns {Promise<Object>} Critical path information
     */
    async getCriticalPath(projectId = null) {
        let query = `
            WITH RECURSIVE task_paths AS (
                -- Start with tasks that have no dependencies (root tasks)
                SELECT 
                    t.id,
                    t.title,
                    t.estimated_hours,
                    ARRAY[t.id] as path,
                    COALESCE(t.estimated_hours, 0) as total_hours,
                    0 as depth
                FROM tasks t
                LEFT JOIN task_dependencies td ON t.id = td.task_id
                WHERE td.id IS NULL
        `;

        const values = [];
        if (projectId) {
            query += ` AND t.workflow_id IN (
                SELECT id FROM workflows WHERE metadata->>'projectId' = $1
            )`;
            values.push(projectId);
        }

        query += `
                UNION ALL
                
                -- Follow dependency chains
                SELECT 
                    t.id,
                    t.title,
                    t.estimated_hours,
                    tp.path || t.id,
                    tp.total_hours + COALESCE(t.estimated_hours, 0),
                    tp.depth + 1
                FROM tasks t
                JOIN task_dependencies td ON t.id = td.task_id
                JOIN task_paths tp ON td.depends_on_task_id = tp.id
                WHERE NOT (t.id = ANY(tp.path)) -- Prevent cycles
                AND tp.depth < 50 -- Limit recursion depth
            )
            SELECT 
                path,
                total_hours,
                depth,
                array_length(path, 1) as task_count
            FROM task_paths
            WHERE depth > 0
            ORDER BY total_hours DESC, depth DESC
            LIMIT 10
        `;

        const result = await this.db.query(query, values);
        return {
            criticalPaths: result.rows,
            longestPath: result.rows[0] || null
        };
    }
}

