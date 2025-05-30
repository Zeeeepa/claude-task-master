/**
 * @fileoverview Dependency Service - Database operations for task dependency management
 * @description Provides database persistence layer for task dependency operations
 * @version 1.0.0
 */

import { DatabaseConnectionManager } from '../connection/connection_manager.js';

/**
 * Dependency Service class for database operations
 */
export class DependencyService {
    constructor(connectionManager = null) {
        this.db = connectionManager || new DatabaseConnectionManager();
    }

    /**
     * Add a dependency between tasks
     * @param {string} taskId - Task ID that depends on another task
     * @param {string} dependsOnTaskId - Task ID that this task depends on
     * @param {string} [type='blocks'] - Dependency type (blocks, relates_to, etc.)
     * @returns {Promise<Object>} Created dependency
     */
    async addDependency(taskId, dependsOnTaskId, type = 'blocks') {
        const client = await this.db.getConnection();
        
        try {
            await client.query('BEGIN');

            // Validate both tasks exist
            const [task, dependsOnTask] = await Promise.all([
                this._getTask(client, taskId),
                this._getTask(client, dependsOnTaskId)
            ]);

            if (!task) {
                throw new Error(`Task with ID ${taskId} not found`);
            }

            if (!dependsOnTask) {
                throw new Error(`Dependency task with ID ${dependsOnTaskId} not found`);
            }

            // Prevent self-dependency
            if (taskId === dependsOnTaskId) {
                throw new Error('Task cannot depend on itself');
            }

            // Check for circular dependencies
            const isCircular = await this._checkCircularDependency(client, taskId, dependsOnTaskId);
            if (isCircular) {
                throw new Error('Cannot add dependency: would create circular dependency');
            }

            // Check if dependency already exists
            const existingDep = await this._getDependency(client, taskId, dependsOnTaskId, type);
            if (existingDep) {
                throw new Error(`Dependency already exists between tasks ${taskId} and ${dependsOnTaskId}`);
            }

            // Add dependency to task's dependencies array
            const currentDependencies = task.dependencies || [];
            const newDependency = {
                task_id: dependsOnTaskId,
                type: type,
                created_at: new Date().toISOString()
            };

            const updatedDependencies = [...currentDependencies, newDependency];

            // Update task with new dependency
            const updateQuery = `
                UPDATE tasks 
                SET dependencies = $1, updated_at = NOW()
                WHERE id = $2
                RETURNING *
            `;

            const result = await client.query(updateQuery, [
                JSON.stringify(updatedDependencies),
                taskId
            ]);

            await client.query('COMMIT');
            return newDependency;
        } catch (error) {
            await client.query('ROLLBACK');
            throw new Error(`Failed to add dependency: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Remove a dependency between tasks
     * @param {string} taskId - Task ID
     * @param {string} dependsOnTaskId - Task ID that this task depends on
     * @param {string} [type] - Dependency type (optional, removes all types if not specified)
     * @returns {Promise<boolean>} Success status
     */
    async removeDependency(taskId, dependsOnTaskId, type = null) {
        const client = await this.db.getConnection();
        
        try {
            await client.query('BEGIN');

            const task = await this._getTask(client, taskId);
            if (!task) {
                throw new Error(`Task with ID ${taskId} not found`);
            }

            const currentDependencies = task.dependencies || [];
            
            // Filter out the dependency to remove
            const updatedDependencies = currentDependencies.filter(dep => {
                if (dep.task_id !== dependsOnTaskId) return true;
                if (type && dep.type !== type) return true;
                return false;
            });

            // Check if any dependency was actually removed
            if (updatedDependencies.length === currentDependencies.length) {
                throw new Error(`Dependency not found between tasks ${taskId} and ${dependsOnTaskId}`);
            }

            // Update task with filtered dependencies
            const updateQuery = `
                UPDATE tasks 
                SET dependencies = $1, updated_at = NOW()
                WHERE id = $2
            `;

            await client.query(updateQuery, [
                JSON.stringify(updatedDependencies),
                taskId
            ]);

            await client.query('COMMIT');
            return true;
        } catch (error) {
            await client.query('ROLLBACK');
            throw new Error(`Failed to remove dependency: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Get all dependencies for a task
     * @param {string} taskId - Task ID
     * @param {string} [type] - Filter by dependency type
     * @returns {Promise<Array>} List of dependencies with task details
     */
    async getDependencies(taskId, type = null) {
        const client = await this.db.getConnection();
        
        try {
            const task = await this._getTask(client, taskId);
            if (!task) {
                throw new Error(`Task with ID ${taskId} not found`);
            }

            let dependencies = task.dependencies || [];
            
            // Filter by type if specified
            if (type) {
                dependencies = dependencies.filter(dep => dep.type === type);
            }

            // Get full task details for each dependency
            const dependencyDetails = [];
            for (const dep of dependencies) {
                const dependencyTask = await this._getTask(client, dep.task_id);
                if (dependencyTask) {
                    dependencyDetails.push({
                        ...dep,
                        task: dependencyTask
                    });
                }
            }

            return dependencyDetails;
        } catch (error) {
            throw new Error(`Failed to get dependencies: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Check if a task has any blocking dependencies
     * @param {string} taskId - Task ID
     * @returns {Promise<Object>} Dependency check result
     */
    async checkDependencies(taskId) {
        const client = await this.db.getConnection();
        
        try {
            const dependencies = await this.getDependencies(taskId, 'blocks');
            
            const blockingDependencies = dependencies.filter(dep => 
                dep.task && dep.task.status !== 'completed'
            );

            const completedDependencies = dependencies.filter(dep => 
                dep.task && dep.task.status === 'completed'
            );

            return {
                hasBlockingDependencies: blockingDependencies.length > 0,
                totalDependencies: dependencies.length,
                blockingDependencies: blockingDependencies,
                completedDependencies: completedDependencies,
                canStart: blockingDependencies.length === 0
            };
        } catch (error) {
            throw new Error(`Failed to check dependencies: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Validate dependency chain for circular dependencies
     * @param {string} taskId - Task ID to validate
     * @returns {Promise<Object>} Validation result
     */
    async validateDependencyChain(taskId) {
        const client = await this.db.getConnection();
        
        try {
            const visited = new Set();
            const recursionStack = new Set();
            const path = [];

            const hasCircularDependency = await this._validateDependencyChainRecursive(
                client, taskId, visited, recursionStack, path
            );

            return {
                isValid: !hasCircularDependency,
                hasCircularDependency: hasCircularDependency,
                path: hasCircularDependency ? path : []
            };
        } catch (error) {
            throw new Error(`Failed to validate dependency chain: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Get tasks that depend on a specific task
     * @param {string} taskId - Task ID
     * @returns {Promise<Array>} List of dependent tasks
     */
    async getDependentTasks(taskId) {
        const client = await this.db.getConnection();
        
        try {
            const query = `
                SELECT t.*, dep_info.dependency_type
                FROM tasks t,
                LATERAL (
                    SELECT jsonb_array_elements(dependencies) as dep
                ) deps,
                LATERAL (
                    SELECT 
                        dep->>'task_id' as dep_task_id,
                        dep->>'type' as dependency_type
                ) dep_info
                WHERE dep_info.dep_task_id = $1
            `;

            const result = await client.query(query, [taskId]);
            return result.rows;
        } catch (error) {
            throw new Error(`Failed to get dependent tasks: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Get dependency graph for a project
     * @param {string} projectId - Project ID
     * @returns {Promise<Object>} Dependency graph
     */
    async getDependencyGraph(projectId) {
        const client = await this.db.getConnection();
        
        try {
            const query = `
                SELECT 
                    id,
                    title,
                    status,
                    dependencies,
                    parent_task_id
                FROM tasks 
                WHERE project_id = $1
                ORDER BY created_at
            `;

            const result = await client.query(query, [projectId]);
            const tasks = result.rows;

            // Build graph structure
            const nodes = tasks.map(task => ({
                id: task.id,
                title: task.title,
                status: task.status,
                parent_task_id: task.parent_task_id
            }));

            const edges = [];
            tasks.forEach(task => {
                const dependencies = task.dependencies || [];
                dependencies.forEach(dep => {
                    edges.push({
                        from: dep.task_id,
                        to: task.id,
                        type: dep.type
                    });
                });
            });

            return {
                nodes,
                edges,
                taskCount: tasks.length,
                dependencyCount: edges.length
            };
        } catch (error) {
            throw new Error(`Failed to get dependency graph: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Get task by ID (private helper)
     * @private
     * @param {Object} client - Database client
     * @param {string} taskId - Task ID
     * @returns {Promise<Object|null>} Task or null
     */
    async _getTask(client, taskId) {
        const query = 'SELECT * FROM tasks WHERE id = $1';
        const result = await client.query(query, [taskId]);
        return result.rows.length > 0 ? result.rows[0] : null;
    }

    /**
     * Get specific dependency (private helper)
     * @private
     * @param {Object} client - Database client
     * @param {string} taskId - Task ID
     * @param {string} dependsOnTaskId - Dependency task ID
     * @param {string} type - Dependency type
     * @returns {Promise<Object|null>} Dependency or null
     */
    async _getDependency(client, taskId, dependsOnTaskId, type) {
        const task = await this._getTask(client, taskId);
        if (!task) return null;

        const dependencies = task.dependencies || [];
        return dependencies.find(dep => 
            dep.task_id === dependsOnTaskId && dep.type === type
        ) || null;
    }

    /**
     * Check for circular dependencies (private helper)
     * @private
     * @param {Object} client - Database client
     * @param {string} taskId - Task ID
     * @param {string} dependsOnTaskId - Potential dependency task ID
     * @returns {Promise<boolean>} True if circular dependency exists
     */
    async _checkCircularDependency(client, taskId, dependsOnTaskId) {
        const visited = new Set();
        const recursionStack = new Set();

        return await this._checkCircularDependencyRecursive(
            client, dependsOnTaskId, taskId, visited, recursionStack
        );
    }

    /**
     * Recursive circular dependency check (private helper)
     * @private
     * @param {Object} client - Database client
     * @param {string} currentTaskId - Current task ID in traversal
     * @param {string} targetTaskId - Target task ID to find
     * @param {Set} visited - Visited tasks
     * @param {Set} recursionStack - Current recursion stack
     * @returns {Promise<boolean>} True if circular dependency found
     */
    async _checkCircularDependencyRecursive(client, currentTaskId, targetTaskId, visited, recursionStack) {
        if (currentTaskId === targetTaskId) {
            return true;
        }

        if (visited.has(currentTaskId)) {
            return recursionStack.has(currentTaskId);
        }

        visited.add(currentTaskId);
        recursionStack.add(currentTaskId);

        const task = await this._getTask(client, currentTaskId);
        if (task && task.dependencies) {
            for (const dep of task.dependencies) {
                if (await this._checkCircularDependencyRecursive(
                    client, dep.task_id, targetTaskId, visited, recursionStack
                )) {
                    return true;
                }
            }
        }

        recursionStack.delete(currentTaskId);
        return false;
    }

    /**
     * Recursive dependency chain validation (private helper)
     * @private
     * @param {Object} client - Database client
     * @param {string} taskId - Task ID
     * @param {Set} visited - Visited tasks
     * @param {Set} recursionStack - Current recursion stack
     * @param {Array} path - Current path
     * @returns {Promise<boolean>} True if circular dependency found
     */
    async _validateDependencyChainRecursive(client, taskId, visited, recursionStack, path) {
        if (recursionStack.has(taskId)) {
            // Found circular dependency
            const circularStart = path.indexOf(taskId);
            path.splice(0, circularStart); // Keep only the circular part
            return true;
        }

        if (visited.has(taskId)) {
            return false;
        }

        visited.add(taskId);
        recursionStack.add(taskId);
        path.push(taskId);

        const task = await this._getTask(client, taskId);
        if (task && task.dependencies) {
            for (const dep of task.dependencies) {
                if (await this._validateDependencyChainRecursive(
                    client, dep.task_id, visited, recursionStack, path
                )) {
                    return true;
                }
            }
        }

        recursionStack.delete(taskId);
        path.pop();
        return false;
    }
}

export default DependencyService;

