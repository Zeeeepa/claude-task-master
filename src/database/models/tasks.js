/**
 * Tasks Model
 * Database model for task hierarchies in Task Master orchestrator
 * 
 * Manages task storage, hierarchical relationships, and task lifecycle.
 */

import { logger } from '../../utils/logger.js';

/**
 * Tasks model class
 */
export class TasksModel {
    constructor(database) {
        this.db = database;
        this.tableName = 'tasks';
    }

    /**
     * Initialize the tasks table
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            await this._createTable();
            logger.debug('Tasks model initialized');
        } catch (error) {
            logger.error('Failed to initialize tasks model:', error);
            throw error;
        }
    }

    /**
     * Create a new task
     * @param {Object} taskData - Task data
     * @returns {Promise<Object>} Created task
     */
    async create(taskData) {
        try {
            const task = {
                id: this._generateId(),
                title: taskData.title,
                description: taskData.description,
                type: taskData.type || 'development',
                status: taskData.status || 'pending',
                priority: taskData.priority || 'medium',
                parentId: taskData.parentId || null,
                requirementId: taskData.requirementId || null,
                assignedTo: taskData.assignedTo || null,
                estimatedHours: taskData.estimatedHours || null,
                actualHours: taskData.actualHours || null,
                dueDate: taskData.dueDate || null,
                startDate: taskData.startDate || null,
                completedDate: taskData.completedDate || null,
                metadata: JSON.stringify(taskData.metadata || {}),
                tags: JSON.stringify(taskData.tags || []),
                dependencies: JSON.stringify(taskData.dependencies || []),
                artifacts: JSON.stringify(taskData.artifacts || []),
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: taskData.createdBy || 'system',
                updatedBy: taskData.updatedBy || 'system'
            };

            await this._validateTask(task);
            
            const result = await this.db.insert(this.tableName, task);
            logger.debug(`Created task: ${task.id}`);
            
            return this._formatTask(result);
        } catch (error) {
            logger.error('Failed to create task:', error);
            throw error;
        }
    }

    /**
     * Get task by ID
     * @param {string} id - Task ID
     * @returns {Promise<Object|null>} Task or null if not found
     */
    async getById(id) {
        try {
            const result = await this.db.findOne(this.tableName, { id });
            return result ? this._formatTask(result) : null;
        } catch (error) {
            logger.error(`Failed to get task ${id}:`, error);
            throw error;
        }
    }

    /**
     * Update task
     * @param {string} id - Task ID
     * @param {Object} updates - Updates to apply
     * @returns {Promise<Object>} Updated task
     */
    async update(id, updates) {
        try {
            const existing = await this.getById(id);
            if (!existing) {
                throw new Error(`Task not found: ${id}`);
            }

            const updatedData = {
                ...updates,
                updatedAt: new Date(),
                updatedBy: updates.updatedBy || 'system'
            };

            // Handle JSON fields
            if (updates.metadata) {
                updatedData.metadata = JSON.stringify(updates.metadata);
            }
            if (updates.tags) {
                updatedData.tags = JSON.stringify(updates.tags);
            }
            if (updates.dependencies) {
                updatedData.dependencies = JSON.stringify(updates.dependencies);
            }
            if (updates.artifacts) {
                updatedData.artifacts = JSON.stringify(updates.artifacts);
            }

            // Handle status transitions
            if (updates.status && updates.status !== existing.status) {
                await this._handleStatusTransition(existing, updates.status);
            }

            await this._validateTask({ ...existing, ...updatedData });
            
            const result = await this.db.update(this.tableName, { id }, updatedData);
            logger.debug(`Updated task: ${id}`);
            
            return this._formatTask(result);
        } catch (error) {
            logger.error(`Failed to update task ${id}:`, error);
            throw error;
        }
    }

    /**
     * Delete task
     * @param {string} id - Task ID
     * @returns {Promise<boolean>} True if deleted
     */
    async delete(id) {
        try {
            // Check for child tasks
            const children = await this.getChildren(id);
            if (children.length > 0) {
                throw new Error(`Cannot delete task with child tasks: ${id}`);
            }

            const result = await this.db.delete(this.tableName, { id });
            logger.debug(`Deleted task: ${id}`);
            return result > 0;
        } catch (error) {
            logger.error(`Failed to delete task ${id}:`, error);
            throw error;
        }
    }

    /**
     * Find tasks by criteria
     * @param {Object} criteria - Search criteria
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Array of tasks
     */
    async find(criteria = {}, options = {}) {
        try {
            const results = await this.db.find(this.tableName, criteria, options);
            return results.map(result => this._formatTask(result));
        } catch (error) {
            logger.error('Failed to find tasks:', error);
            throw error;
        }
    }

    /**
     * Get task hierarchy (parent and all children)
     * @param {string} rootId - Root task ID
     * @returns {Promise<Object>} Task hierarchy
     */
    async getHierarchy(rootId) {
        try {
            const root = await this.getById(rootId);
            if (!root) {
                throw new Error(`Root task not found: ${rootId}`);
            }

            const hierarchy = {
                ...root,
                children: await this._buildChildrenHierarchy(rootId)
            };

            return hierarchy;
        } catch (error) {
            logger.error(`Failed to get task hierarchy for ${rootId}:`, error);
            throw error;
        }
    }

    /**
     * Get child tasks
     * @param {string} parentId - Parent task ID
     * @returns {Promise<Array>} Array of child tasks
     */
    async getChildren(parentId) {
        return this.find({ parentId });
    }

    /**
     * Get parent task
     * @param {string} taskId - Task ID
     * @returns {Promise<Object|null>} Parent task or null
     */
    async getParent(taskId) {
        try {
            const task = await this.getById(taskId);
            if (!task || !task.parentId) {
                return null;
            }
            return this.getById(task.parentId);
        } catch (error) {
            logger.error(`Failed to get parent for task ${taskId}:`, error);
            throw error;
        }
    }

    /**
     * Get tasks by status
     * @param {string} status - Task status
     * @returns {Promise<Array>} Array of tasks
     */
    async getByStatus(status) {
        return this.find({ status });
    }

    /**
     * Get tasks by assignee
     * @param {string} assignedTo - Assignee identifier
     * @returns {Promise<Array>} Array of tasks
     */
    async getByAssignee(assignedTo) {
        return this.find({ assignedTo });
    }

    /**
     * Get tasks by requirement
     * @param {string} requirementId - Requirement ID
     * @returns {Promise<Array>} Array of tasks
     */
    async getByRequirement(requirementId) {
        return this.find({ requirementId });
    }

    /**
     * Get overdue tasks
     * @returns {Promise<Array>} Array of overdue tasks
     */
    async getOverdue() {
        try {
            const now = new Date();
            const criteria = {
                dueDate: { $lt: now },
                status: { $nin: ['completed', 'cancelled'] }
            };
            return this.find(criteria);
        } catch (error) {
            logger.error('Failed to get overdue tasks:', error);
            throw error;
        }
    }

    /**
     * Get task statistics
     * @returns {Promise<Object>} Statistics object
     */
    async getStatistics() {
        try {
            const stats = {
                total: await this.db.count(this.tableName),
                byStatus: {},
                byType: {},
                byPriority: {},
                overdue: 0,
                completed: 0
            };

            // Get counts by status
            const statusCounts = await this.db.aggregate(this.tableName, [
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]);
            statusCounts.forEach(item => {
                stats.byStatus[item._id] = item.count;
                if (item._id === 'completed') {
                    stats.completed = item.count;
                }
            });

            // Get counts by type
            const typeCounts = await this.db.aggregate(this.tableName, [
                { $group: { _id: '$type', count: { $sum: 1 } } }
            ]);
            typeCounts.forEach(item => {
                stats.byType[item._id] = item.count;
            });

            // Get counts by priority
            const priorityCounts = await this.db.aggregate(this.tableName, [
                { $group: { _id: '$priority', count: { $sum: 1 } } }
            ]);
            priorityCounts.forEach(item => {
                stats.byPriority[item._id] = item.count;
            });

            // Get overdue count
            const overdueCount = await this.db.count(this.tableName, {
                dueDate: { $lt: new Date() },
                status: { $nin: ['completed', 'cancelled'] }
            });
            stats.overdue = overdueCount;

            return stats;
        } catch (error) {
            logger.error('Failed to get task statistics:', error);
            throw error;
        }
    }

    /**
     * Create table schema
     * @private
     */
    async _createTable() {
        const schema = `
            CREATE TABLE IF NOT EXISTS ${this.tableName} (
                id VARCHAR(255) PRIMARY KEY,
                title VARCHAR(500) NOT NULL,
                description TEXT,
                type VARCHAR(50) NOT NULL DEFAULT 'development',
                status VARCHAR(50) NOT NULL DEFAULT 'pending',
                priority VARCHAR(20) NOT NULL DEFAULT 'medium',
                parent_id VARCHAR(255),
                requirement_id VARCHAR(255),
                assigned_to VARCHAR(255),
                estimated_hours DECIMAL(8,2),
                actual_hours DECIMAL(8,2),
                due_date TIMESTAMP,
                start_date TIMESTAMP,
                completed_date TIMESTAMP,
                metadata TEXT,
                tags TEXT,
                dependencies TEXT,
                artifacts TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_by VARCHAR(255) DEFAULT 'system',
                updated_by VARCHAR(255) DEFAULT 'system',
                INDEX idx_status (status),
                INDEX idx_type (type),
                INDEX idx_priority (priority),
                INDEX idx_parent (parent_id),
                INDEX idx_requirement (requirement_id),
                INDEX idx_assignee (assigned_to),
                INDEX idx_due_date (due_date),
                INDEX idx_created_at (created_at),
                FOREIGN KEY (parent_id) REFERENCES ${this.tableName}(id) ON DELETE CASCADE
            )
        `;
        
        await this.db.execute(schema);
    }

    /**
     * Validate task data
     * @param {Object} task - Task to validate
     * @private
     */
    async _validateTask(task) {
        const errors = [];

        if (!task.title || task.title.trim().length === 0) {
            errors.push('Title is required');
        }

        if (task.title && task.title.length > 500) {
            errors.push('Title must be 500 characters or less');
        }

        const validTypes = ['development', 'testing', 'documentation', 'deployment', 'analysis', 'review'];
        if (!validTypes.includes(task.type)) {
            errors.push(`Invalid type. Must be one of: ${validTypes.join(', ')}`);
        }

        const validStatuses = ['pending', 'in-progress', 'blocked', 'review', 'completed', 'cancelled'];
        if (!validStatuses.includes(task.status)) {
            errors.push(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
        }

        const validPriorities = ['low', 'medium', 'high', 'critical'];
        if (!validPriorities.includes(task.priority)) {
            errors.push(`Invalid priority. Must be one of: ${validPriorities.join(', ')}`);
        }

        // Validate parent relationship (prevent circular dependencies)
        if (task.parentId && task.parentId === task.id) {
            errors.push('Task cannot be its own parent');
        }

        if (errors.length > 0) {
            throw new Error(`Task validation failed: ${errors.join(', ')}`);
        }
    }

    /**
     * Handle status transitions
     * @param {Object} task - Current task
     * @param {string} newStatus - New status
     * @private
     */
    async _handleStatusTransition(task, newStatus) {
        const now = new Date();

        switch (newStatus) {
            case 'in-progress':
                if (!task.startDate) {
                    task.startDate = now;
                }
                break;
            case 'completed':
                task.completedDate = now;
                break;
            case 'cancelled':
                // No specific handling needed
                break;
        }
    }

    /**
     * Build children hierarchy recursively
     * @param {string} parentId - Parent task ID
     * @returns {Promise<Array>} Array of child tasks with their children
     * @private
     */
    async _buildChildrenHierarchy(parentId) {
        const children = await this.getChildren(parentId);
        
        for (const child of children) {
            child.children = await this._buildChildrenHierarchy(child.id);
        }
        
        return children;
    }

    /**
     * Format task for output
     * @param {Object} raw - Raw database result
     * @returns {Object} Formatted task
     * @private
     */
    _formatTask(raw) {
        return {
            id: raw.id,
            title: raw.title,
            description: raw.description,
            type: raw.type,
            status: raw.status,
            priority: raw.priority,
            parentId: raw.parent_id,
            requirementId: raw.requirement_id,
            assignedTo: raw.assigned_to,
            estimatedHours: raw.estimated_hours,
            actualHours: raw.actual_hours,
            dueDate: raw.due_date,
            startDate: raw.start_date,
            completedDate: raw.completed_date,
            metadata: raw.metadata ? JSON.parse(raw.metadata) : {},
            tags: raw.tags ? JSON.parse(raw.tags) : [],
            dependencies: raw.dependencies ? JSON.parse(raw.dependencies) : [],
            artifacts: raw.artifacts ? JSON.parse(raw.artifacts) : [],
            createdAt: raw.created_at,
            updatedAt: raw.updated_at,
            createdBy: raw.created_by,
            updatedBy: raw.updated_by
        };
    }

    /**
     * Generate unique ID
     * @returns {string} Unique ID
     * @private
     */
    _generateId() {
        return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

export default TasksModel;

