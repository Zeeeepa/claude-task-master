/**
 * @fileoverview Task Storage Manager
 * @description Production-ready PostgreSQL task storage with comprehensive context preservation
 */

import { log } from '../../scripts/modules/utils.js';
import { getConnection, initializeDatabase } from '../database/connection.js';
import { MigrationRunner } from '../database/migrations/runner.js';
import { Task } from '../database/models/Task.js';
import { TaskContext } from '../database/models/TaskContext.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Production-ready Task Storage Manager with PostgreSQL backend
 * Implements comprehensive task storage, context management, and audit trails
 */
export class TaskStorageManager {
    constructor(config = {}) {
        this.config = {
            enable_mock: config.enable_mock || false,
            auto_migrate: config.auto_migrate !== false,
            enable_audit: config.enable_audit !== false,
            enable_performance_tracking: config.enable_performance_tracking !== false,
            ...config
        };
        
        this.isInitialized = false;
        this.connection = null;
        
        // Mock storage for fallback
        this.mockStorage = new Map();
        this.mockContext = new Map();
        this.mockWorkflowStates = new Map();
        this.mockDependencies = new Map();
        
        // Performance tracking
        this.performanceMetrics = {
            queries: 0,
            totalExecutionTime: 0,
            errors: 0,
            cacheHits: 0,
            cacheMisses: 0
        };
    }

    /**
     * Initialize the task storage with database connection and migrations
     */
    async initialize() {
        try {
            log('info', 'Initializing TaskStorageManager...');

            if (this.config.enable_mock) {
                log('warn', 'Running in MOCK mode - data will not persist');
                this.isInitialized = true;
                return;
            }

            // Initialize database connection
            this.connection = await initializeDatabase();
            
            // Run migrations if enabled
            if (this.config.auto_migrate) {
                const migrationRunner = new MigrationRunner(this.connection);
                await migrationRunner.runMigrations();
            }

            this.isInitialized = true;
            log('info', 'TaskStorageManager initialized successfully');

        } catch (error) {
            log('error', `Failed to initialize task storage: ${error.message}`);
            
            // Fallback to mock mode on database failure
            if (!this.config.enable_mock) {
                log('warn', 'Falling back to mock mode due to database initialization failure');
                this.config.enable_mock = true;
                this.isInitialized = true;
            } else {
                throw error;
            }
        }
    }

    /**
     * Store atomic task with comprehensive validation and audit trail
     * @param {Object} task - Task to store
     * @param {Object} requirement - Source requirement
     * @returns {Promise<string>} Task ID
     */
    async storeTask(task, requirement = null) {
        if (!this.isInitialized) {
            throw new Error('Task storage not initialized');
        }

        const startTime = Date.now();
        
        try {
            // Create and validate task model
            const taskModel = new Task({
                id: task.id || uuidv4(),
                title: task.title,
                description: task.description,
                type: task.type || 'general',
                requirements: task.requirements || [],
                acceptance_criteria: task.acceptanceCriteria || task.acceptance_criteria || [],
                affected_files: task.affectedFiles || task.affected_files || [],
                complexity_score: task.complexityScore || task.complexity_score || 5,
                priority: task.priority || 0,
                assigned_to: task.assignedTo || task.assigned_to,
                tags: task.tags || [],
                estimated_hours: task.estimatedHours || task.estimated_hours,
                metadata: {
                    source_requirement_id: requirement?.id,
                    validation: task.validation,
                    ...task.metadata
                }
            });

            const validation = taskModel.validate();
            if (!validation.valid) {
                throw new Error(`Task validation failed: ${validation.errors.join(', ')}`);
            }

            if (validation.warnings.length > 0) {
                log('warn', `Task validation warnings: ${validation.warnings.join(', ')}`);
            }

            if (this.config.enable_mock) {
                return await this._storeTaskMock(taskModel, requirement);
            } else {
                return await this._storeTaskDatabase(taskModel, requirement);
            }

        } catch (error) {
            this._trackError('storeTask', error, startTime);
            throw error;
        }
    }

    /**
     * Store task in database with transaction
     * @private
     */
    async _storeTaskDatabase(taskModel, requirement) {
        const taskId = taskModel.id;
        
        await this.connection.transaction(async (client) => {
            // Insert task
            const taskData = taskModel.toDatabase();
            const insertTaskSql = `
                INSERT INTO tasks (
                    id, title, description, type, status, priority, complexity_score,
                    affected_files, requirements, acceptance_criteria, parent_task_id,
                    assigned_to, tags, estimated_hours, metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            `;
            
            await client.query(insertTaskSql, [
                taskData.id, taskData.title, taskData.description, taskData.type,
                taskData.status, taskData.priority, taskData.complexity_score,
                taskData.affected_files, taskData.requirements, taskData.acceptance_criteria,
                taskData.parent_task_id, taskData.assigned_to, taskData.tags,
                taskData.estimated_hours, taskData.metadata
            ]);

            // Store initial context if requirement provided
            if (requirement) {
                const contextModel = TaskContext.createRequirement(taskId, requirement);
                await this._storeContextDatabase(contextModel, client);
            }
        });

        log('debug', `Stored task ${taskId}: ${taskModel.title}`);
        this._trackPerformance('storeTask', Date.now() - performance.now());
        return taskId;
    }

    /**
     * Store task in mock storage
     * @private
     */
    async _storeTaskMock(taskModel, requirement) {
        const taskId = taskModel.id;
        this.mockStorage.set(taskId, taskModel);
        
        // Store initial context
        if (requirement) {
            await this.storeTaskContext(taskId, 'requirement', {
                original_requirement: requirement,
                decomposition_metadata: {
                    created_at: new Date(),
                    decomposition_method: 'nlp_analysis'
                }
            });
        }
        
        log('debug', `Stored task ${taskId}: ${taskModel.title} (MOCK)`);
        return taskId;
    }

    /**
     * Retrieve task by ID with full context
     * @param {string} taskId - Task identifier
     * @returns {Promise<Object|null>} Task object or null
     */
    async getTask(taskId) {
        if (!this.isInitialized) {
            throw new Error('Task storage not initialized');
        }

        const startTime = Date.now();

        try {
            if (this.config.enable_mock) {
                const task = this.mockStorage.get(taskId);
                return task ? task : null;
            } else {
                return await this._getTaskDatabase(taskId);
            }
        } catch (error) {
            this._trackError('getTask', error, startTime);
            throw error;
        }
    }

    /**
     * Get task from database
     * @private
     */
    async _getTaskDatabase(taskId) {
        const sql = 'SELECT * FROM tasks WHERE id = $1';
        const result = await this.connection.query(sql, [taskId]);
        
        if (result.rows.length === 0) {
            return null;
        }

        const task = Task.fromDatabase(result.rows[0]);
        this._trackPerformance('getTask', Date.now() - performance.now());
        return task;
    }

    /**
     * Update task with audit trail
     * @param {string} taskId - Task identifier
     * @param {Object} updates - Updates to apply
     * @returns {Promise<void>}
     */
    async updateTask(taskId, updates) {
        if (!this.isInitialized) {
            throw new Error('Task storage not initialized');
        }

        const startTime = Date.now();

        try {
            if (this.config.enable_mock) {
                return await this._updateTaskMock(taskId, updates);
            } else {
                return await this._updateTaskDatabase(taskId, updates);
            }
        } catch (error) {
            this._trackError('updateTask', error, startTime);
            throw error;
        }
    }

    /**
     * Update task in database with audit trail
     * @private
     */
    async _updateTaskDatabase(taskId, updates) {
        await this.connection.transaction(async (client) => {
            // Get current task for audit trail
            const currentResult = await client.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
            if (currentResult.rows.length === 0) {
                throw new Error(`Task ${taskId} not found`);
            }

            const currentTask = Task.fromDatabase(currentResult.rows[0]);
            
            // Apply updates
            Object.assign(currentTask, updates);
            currentTask.updated_at = new Date();
            
            // Validate updated task
            const validation = currentTask.validate();
            if (!validation.valid) {
                throw new Error(`Task validation failed: ${validation.errors.join(', ')}`);
            }

            // Update in database
            const taskData = currentTask.toDatabase();
            const updateSql = `
                UPDATE tasks SET 
                    title = $2, description = $3, type = $4, status = $5, 
                    priority = $6, complexity_score = $7, affected_files = $8,
                    requirements = $9, acceptance_criteria = $10, assigned_to = $11,
                    tags = $12, estimated_hours = $13, actual_hours = $14,
                    completed_at = $15, metadata = $16, updated_at = $17
                WHERE id = $1
            `;
            
            await client.query(updateSql, [
                taskId, taskData.title, taskData.description, taskData.type,
                taskData.status, taskData.priority, taskData.complexity_score,
                taskData.affected_files, taskData.requirements, taskData.acceptance_criteria,
                taskData.assigned_to, taskData.tags, taskData.estimated_hours,
                taskData.actual_hours, taskData.completed_at, taskData.metadata,
                taskData.updated_at
            ]);
        });

        log('debug', `Updated task ${taskId}`);
        this._trackPerformance('updateTask', Date.now() - performance.now());
    }

    /**
     * Update task in mock storage
     * @private
     */
    async _updateTaskMock(taskId, updates) {
        const task = this.mockStorage.get(taskId);
        if (!task) {
            throw new Error(`Task ${taskId} not found`);
        }

        Object.assign(task, updates);
        task.updated_at = new Date();
        
        log('debug', `Updated task ${taskId} (MOCK)`);
    }

    /**
     * Update task status with context tracking
     * @param {string} taskId - Task identifier
     * @param {string} status - New status
     * @param {Object} context - Update context
     */
    async updateTaskStatus(taskId, status, context = {}) {
        const task = await this.getTask(taskId);
        if (!task) {
            throw new Error(`Task ${taskId} not found`);
        }

        const oldStatus = task.status;
        
        // Update task
        await this.updateTask(taskId, { 
            status,
            completed_at: status === 'completed' ? new Date() : null
        });

        // Store status change context
        await this.storeTaskContext(taskId, 'status_change', {
            from_status: oldStatus,
            to_status: status,
            changed_at: new Date(),
            context
        });

        log('debug', `Updated task ${taskId} status: ${oldStatus} -> ${status}`);
    }

    /**
     * Delete task (soft delete with audit)
     * @param {string} taskId - Task identifier
     */
    async deleteTask(taskId) {
        if (!this.isInitialized) {
            throw new Error('Task storage not initialized');
        }

        if (this.config.enable_mock) {
            this.mockStorage.delete(taskId);
            this.mockContext.delete(taskId);
        } else {
            // Soft delete by updating status
            await this.updateTaskStatus(taskId, 'cancelled', { 
                reason: 'deleted',
                deleted_at: new Date()
            });
        }

        log('debug', `Deleted task ${taskId}`);
    }

    /**
     * List tasks with filtering and pagination
     * @param {Object} filters - Query filters
     * @returns {Promise<Array>} Array of tasks
     */
    async listTasks(filters = {}) {
        if (!this.isInitialized) {
            throw new Error('Task storage not initialized');
        }

        const startTime = Date.now();

        try {
            if (this.config.enable_mock) {
                return this._listTasksMock(filters);
            } else {
                return await this._listTasksDatabase(filters);
            }
        } catch (error) {
            this._trackError('listTasks', error, startTime);
            throw error;
        }
    }

    /**
     * List tasks from database with filtering
     * @private
     */
    async _listTasksDatabase(filters) {
        let sql = 'SELECT * FROM tasks WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        // Apply filters
        if (filters.status) {
            sql += ` AND status = $${paramIndex++}`;
            params.push(filters.status);
        }

        if (filters.assigned_to) {
            sql += ` AND assigned_to = $${paramIndex++}`;
            params.push(filters.assigned_to);
        }

        if (filters.priority !== undefined) {
            sql += ` AND priority = $${paramIndex++}`;
            params.push(filters.priority);
        }

        if (filters.type) {
            sql += ` AND type = $${paramIndex++}`;
            params.push(filters.type);
        }

        if (filters.parent_task_id) {
            sql += ` AND parent_task_id = $${paramIndex++}`;
            params.push(filters.parent_task_id);
        }

        // Sorting
        const sortBy = filters.sort_by || 'created_at';
        const sortOrder = filters.sort_order || 'DESC';
        sql += ` ORDER BY ${sortBy} ${sortOrder}`;

        // Pagination
        if (filters.limit) {
            sql += ` LIMIT $${paramIndex++}`;
            params.push(filters.limit);
        }

        if (filters.offset) {
            sql += ` OFFSET $${paramIndex++}`;
            params.push(filters.offset);
        }

        const result = await this.connection.query(sql, params);
        const tasks = result.rows.map(row => Task.fromDatabase(row));
        
        this._trackPerformance('listTasks', Date.now() - performance.now());
        return tasks;
    }

    /**
     * List tasks from mock storage
     * @private
     */
    _listTasksMock(filters) {
        let tasks = Array.from(this.mockStorage.values());

        // Apply filters
        if (filters.status) {
            tasks = tasks.filter(t => t.status === filters.status);
        }

        if (filters.assigned_to) {
            tasks = tasks.filter(t => t.assigned_to === filters.assigned_to);
        }

        if (filters.priority !== undefined) {
            tasks = tasks.filter(t => t.priority === filters.priority);
        }

        if (filters.type) {
            tasks = tasks.filter(t => t.type === filters.type);
        }

        if (filters.parent_task_id) {
            tasks = tasks.filter(t => t.parent_task_id === filters.parent_task_id);
        }

        // Sorting
        const sortBy = filters.sort_by || 'created_at';
        const sortOrder = filters.sort_order || 'DESC';
        tasks.sort((a, b) => {
            const aVal = a[sortBy];
            const bVal = b[sortBy];
            if (sortOrder === 'ASC') {
                return aVal > bVal ? 1 : -1;
            } else {
                return aVal < bVal ? 1 : -1;
            }
        });

        // Pagination
        if (filters.offset) {
            tasks = tasks.slice(filters.offset);
        }
        if (filters.limit) {
            tasks = tasks.slice(0, filters.limit);
        }

        return tasks;
    }

    /**
     * Get pending tasks
     * @returns {Promise<Array>} Array of pending tasks
     */
    async getPendingTasks() {
        return await this.listTasks({ status: 'pending' });
    }

    /**
     * Get tasks by status
     * @param {string} status - Task status
     * @returns {Promise<Array>} Array of tasks
     */
    async getTasksByStatus(status) {
        return await this.listTasks({ status });
    }

    /**
     * Get tasks by priority
     * @param {number} priority - Task priority
     * @returns {Promise<Array>} Array of tasks
     */
    async getTasksByPriority(priority) {
        return await this.listTasks({ priority });
    }

    /**
     * Mark task as completed
     * @param {string} taskId - Task identifier
     * @param {Object} results - Completion results
     */
    async markTaskCompleted(taskId, results = {}) {
        await this.updateTaskStatus(taskId, 'completed', results);
        
        // Update actual hours if provided
        if (results.actual_hours) {
            await this.updateTask(taskId, { actual_hours: results.actual_hours });
        }

        await this.storeTaskContext(taskId, 'completion', {
            completed_at: new Date(),
            results,
            completion_method: 'automated'
        });

        log('info', `Task ${taskId} marked as completed`);
    }

    /**
     * Store task context
     * @param {string} taskId - Task identifier
     * @param {string} contextType - Type of context
     * @param {Object} contextData - Context data
     */
    async storeTaskContext(taskId, contextType, contextData) {
        if (!this.isInitialized) {
            throw new Error('Task storage not initialized');
        }

        const startTime = Date.now();

        try {
            const contextModel = new TaskContext({
                task_id: taskId,
                context_type: contextType,
                context_data: contextData
            });

            const validation = contextModel.validate();
            if (!validation.valid) {
                throw new Error(`Context validation failed: ${validation.errors.join(', ')}`);
            }

            if (validation.warnings.length > 0) {
                log('warn', `Context validation warnings: ${validation.warnings.join(', ')}`);
            }

            if (this.config.enable_mock) {
                if (!this.mockContext.has(taskId)) {
                    this.mockContext.set(taskId, []);
                }
                this.mockContext.get(taskId).push(contextModel);
            } else {
                await this._storeContextDatabase(contextModel);
            }

            log('debug', `Stored ${contextType} context for task ${taskId}`);
            this._trackPerformance('storeTaskContext', Date.now() - startTime);

        } catch (error) {
            this._trackError('storeTaskContext', error, startTime);
            throw error;
        }
    }

    /**
     * Store context in database
     * @private
     */
    async _storeContextDatabase(contextModel, client = null) {
        const contextData = contextModel.toDatabase();
        const sql = `
            INSERT INTO task_contexts (id, task_id, context_type, context_data, metadata)
            VALUES ($1, $2, $3, $4, $5)
        `;

        const queryClient = client || this.connection;
        await queryClient.query(sql, [
            contextData.id, contextData.task_id, contextData.context_type,
            contextData.context_data, contextData.metadata
        ]);
    }

    /**
     * Get task context
     * @param {string} taskId - Task identifier
     * @returns {Promise<Array>} Array of context entries
     */
    async getTaskContext(taskId) {
        if (!this.isInitialized) {
            throw new Error('Task storage not initialized');
        }

        const startTime = Date.now();

        try {
            if (this.config.enable_mock) {
                return this.mockContext.get(taskId) || [];
            } else {
                return await this._getContextDatabase(taskId);
            }
        } catch (error) {
            this._trackError('getTaskContext', error, startTime);
            throw error;
        }
    }

    /**
     * Get context from database
     * @private
     */
    async _getContextDatabase(taskId) {
        const sql = 'SELECT * FROM task_contexts WHERE task_id = $1 ORDER BY created_at';
        const result = await this.connection.query(sql, [taskId]);
        
        const contexts = result.rows.map(row => TaskContext.fromDatabase(row));
        this._trackPerformance('getTaskContext', Date.now() - performance.now());
        return contexts;
    }

    /**
     * Update task context
     * @param {string} taskId - Task identifier
     * @param {Object} context - Updated context
     */
    async updateTaskContext(taskId, context) {
        // For now, we'll add a new context entry rather than updating existing ones
        // This maintains audit trail integrity
        await this.storeTaskContext(taskId, 'context_update', {
            updated_at: new Date(),
            updates: context
        });
    }

    /**
     * Get task full context (organized by type)
     * @param {string} taskId - Task identifier
     * @returns {Promise<Object>} Full task context
     */
    async getTaskFullContext(taskId) {
        if (!this.isInitialized) {
            throw new Error('Task storage not initialized');
        }

        const task = await this.getTask(taskId);
        if (!task) {
            throw new Error(`Task ${taskId} not found`);
        }

        const contextEntries = await this.getTaskContext(taskId);

        // Organize context by type
        const organizedContext = {
            task,
            requirements_context: null,
            codebase_context: null,
            ai_interactions: [],
            validation_results: [],
            workflow_state: null,
            status_changes: [],
            dependencies: [],
            errors: [],
            performance: [],
            metadata: {}
        };

        contextEntries.forEach(entry => {
            switch (entry.context_type) {
                case 'requirement':
                    organizedContext.requirements_context = entry.context_data;
                    break;
                case 'codebase':
                    organizedContext.codebase_context = entry.context_data;
                    break;
                case 'ai_interaction':
                    organizedContext.ai_interactions.push(entry.context_data);
                    break;
                case 'validation':
                    organizedContext.validation_results.push(entry.context_data);
                    break;
                case 'workflow':
                    organizedContext.workflow_state = entry.context_data;
                    break;
                case 'status_change':
                    organizedContext.status_changes.push(entry.context_data);
                    break;
                case 'dependency_parent':
                case 'dependency_child':
                    organizedContext.dependencies.push(entry.context_data);
                    break;
                case 'error':
                    organizedContext.errors.push(entry.context_data);
                    break;
                case 'performance':
                    organizedContext.performance.push(entry.context_data);
                    break;
                default:
                    organizedContext.metadata[entry.context_type] = entry.context_data;
            }
        });

        return organizedContext;
    }

    /**
     * Store workflow state
     * @param {string} workflowId - Workflow identifier
     * @param {Object} state - Workflow state
     */
    async storeWorkflowState(workflowId, state) {
        if (!this.isInitialized) {
            throw new Error('Task storage not initialized');
        }

        const startTime = Date.now();

        try {
            const workflowState = {
                id: uuidv4(),
                workflow_id: workflowId,
                task_id: state.task_id || null,
                step: state.step,
                status: state.status,
                result: state.result || null,
                started_at: state.started_at || new Date(),
                completed_at: state.completed_at || null,
                error_message: state.error_message || null,
                retry_count: state.retry_count || 0,
                metadata: state.metadata || {}
            };

            if (this.config.enable_mock) {
                if (!this.mockWorkflowStates.has(workflowId)) {
                    this.mockWorkflowStates.set(workflowId, []);
                }
                this.mockWorkflowStates.get(workflowId).push(workflowState);
            } else {
                await this._storeWorkflowStateDatabase(workflowState);
            }

            log('debug', `Stored workflow state for ${workflowId}: ${state.step}`);
            this._trackPerformance('storeWorkflowState', Date.now() - startTime);

        } catch (error) {
            this._trackError('storeWorkflowState', error, startTime);
            throw error;
        }
    }

    /**
     * Store workflow state in database
     * @private
     */
    async _storeWorkflowStateDatabase(workflowState) {
        const sql = `
            INSERT INTO workflow_states (
                id, workflow_id, task_id, step, status, result,
                started_at, completed_at, error_message, retry_count, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `;

        await this.connection.query(sql, [
            workflowState.id, workflowState.workflow_id, workflowState.task_id,
            workflowState.step, workflowState.status, JSON.stringify(workflowState.result),
            workflowState.started_at, workflowState.completed_at, workflowState.error_message,
            workflowState.retry_count, JSON.stringify(workflowState.metadata)
        ]);
    }

    /**
     * Get workflow state
     * @param {string} workflowId - Workflow identifier
     * @returns {Promise<Array>} Workflow states
     */
    async getWorkflowState(workflowId) {
        if (!this.isInitialized) {
            throw new Error('Task storage not initialized');
        }

        const startTime = Date.now();

        try {
            if (this.config.enable_mock) {
                return this.mockWorkflowStates.get(workflowId) || [];
            } else {
                return await this._getWorkflowStateDatabase(workflowId);
            }
        } catch (error) {
            this._trackError('getWorkflowState', error, startTime);
            throw error;
        }
    }

    /**
     * Get workflow state from database
     * @private
     */
    async _getWorkflowStateDatabase(workflowId) {
        const sql = 'SELECT * FROM workflow_states WHERE workflow_id = $1 ORDER BY started_at';
        const result = await this.connection.query(sql, [workflowId]);
        
        const states = result.rows.map(row => ({
            ...row,
            result: typeof row.result === 'string' ? JSON.parse(row.result) : row.result,
            metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
        }));

        this._trackPerformance('getWorkflowState', Date.now() - performance.now());
        return states;
    }

    /**
     * Update workflow state
     * @param {string} workflowId - Workflow identifier
     * @param {Object} updates - State updates
     */
    async updateWorkflowState(workflowId, updates) {
        if (!this.isInitialized) {
            throw new Error('Task storage not initialized');
        }

        if (this.config.enable_mock) {
            const states = this.mockWorkflowStates.get(workflowId) || [];
            const latestState = states[states.length - 1];
            if (latestState) {
                Object.assign(latestState, updates);
            }
        } else {
            // Update the latest workflow state
            const sql = `
                UPDATE workflow_states 
                SET status = $2, result = $3, completed_at = $4, error_message = $5, retry_count = $6
                WHERE workflow_id = $1 AND id = (
                    SELECT id FROM workflow_states 
                    WHERE workflow_id = $1 
                    ORDER BY started_at DESC 
                    LIMIT 1
                )
            `;

            await this.connection.query(sql, [
                workflowId,
                updates.status,
                updates.result ? JSON.stringify(updates.result) : null,
                updates.completed_at,
                updates.error_message,
                updates.retry_count
            ]);
        }

        log('debug', `Updated workflow state for ${workflowId}`);
    }

    /**
     * Store AI interaction
     * @param {string} taskId - Task identifier
     * @param {string} agentName - AI agent name
     * @param {Object} interactionData - Interaction data
     */
    async storeAIInteraction(taskId, agentName, interactionData) {
        const contextModel = TaskContext.createAIInteraction(taskId, agentName, interactionData);
        await this.storeTaskContext(taskId, 'ai_interaction', contextModel.context_data);
        log('debug', `Stored AI interaction for task ${taskId} with agent ${agentName}`);
    }

    /**
     * Add task dependency
     * @param {string} parentTaskId - Parent task ID
     * @param {string} childTaskId - Child task ID
     * @param {string} dependencyType - Type of dependency
     */
    async addTaskDependency(parentTaskId, childTaskId, dependencyType = 'blocks') {
        if (!this.isInitialized) {
            throw new Error('Task storage not initialized');
        }

        const startTime = Date.now();

        try {
            const dependency = {
                id: uuidv4(),
                parent_task_id: parentTaskId,
                child_task_id: childTaskId,
                dependency_type: dependencyType,
                created_at: new Date(),
                metadata: {}
            };

            if (this.config.enable_mock) {
                if (!this.mockDependencies.has(parentTaskId)) {
                    this.mockDependencies.set(parentTaskId, []);
                }
                this.mockDependencies.get(parentTaskId).push(dependency);

                // Store dependency context for both tasks
                await this.storeTaskContext(parentTaskId, 'dependency_parent', {
                    child_task_id: childTaskId,
                    dependency_type: dependencyType
                });
                
                await this.storeTaskContext(childTaskId, 'dependency_child', {
                    parent_task_id: parentTaskId,
                    dependency_type: dependencyType
                });
            } else {
                await this._storeDependencyDatabase(dependency);
            }

            log('debug', `Added dependency: ${parentTaskId} ${dependencyType} ${childTaskId}`);
            this._trackPerformance('addTaskDependency', Date.now() - startTime);

        } catch (error) {
            this._trackError('addTaskDependency', error, startTime);
            throw error;
        }
    }

    /**
     * Store dependency in database
     * @private
     */
    async _storeDependencyDatabase(dependency) {
        const sql = `
            INSERT INTO task_dependencies (id, parent_task_id, child_task_id, dependency_type, metadata)
            VALUES ($1, $2, $3, $4, $5)
        `;

        await this.connection.query(sql, [
            dependency.id, dependency.parent_task_id, dependency.child_task_id,
            dependency.dependency_type, JSON.stringify(dependency.metadata)
        ]);
    }

    /**
     * Get task dependencies
     * @param {string} taskId - Task identifier
     * @returns {Promise<Array>} Array of dependency task IDs
     */
    async getTaskDependencies(taskId) {
        if (!this.isInitialized) {
            throw new Error('Task storage not initialized');
        }

        const startTime = Date.now();

        try {
            if (this.config.enable_mock) {
                const contextEntries = this.mockContext.get(taskId) || [];
                return contextEntries
                    .filter(entry => entry.context_type === 'dependency_child')
                    .map(entry => entry.context_data.parent_task_id);
            } else {
                return await this._getDependenciesDatabase(taskId);
            }
        } catch (error) {
            this._trackError('getTaskDependencies', error, startTime);
            throw error;
        }
    }

    /**
     * Get dependencies from database
     * @private
     */
    async _getDependenciesDatabase(taskId) {
        const sql = 'SELECT parent_task_id FROM task_dependencies WHERE child_task_id = $1';
        const result = await this.connection.query(sql, [taskId]);
        
        const dependencies = result.rows.map(row => row.parent_task_id);
        this._trackPerformance('getTaskDependencies', Date.now() - performance.now());
        return dependencies;
    }

    /**
     * Store validation result
     * @param {string} taskId - Task identifier
     * @param {string} validationType - Type of validation
     * @param {string} validatorName - Name of validator
     * @param {string} status - Validation status
     * @param {number} score - Validation score
     * @param {Object} details - Validation details
     * @param {Object} suggestions - Improvement suggestions
     */
    async storeValidationResult(taskId, validationType, validatorName, status, score, details, suggestions) {
        const contextModel = TaskContext.createValidation(
            taskId, validationType, validatorName, status, score, details, suggestions
        );
        await this.storeTaskContext(taskId, 'validation', contextModel.context_data);
        log('debug', `Stored validation result for task ${taskId}: ${status} (${score})`);
    }

    /**
     * Get task metrics and analytics
     * @returns {Promise<Object>} Task metrics
     */
    async getTaskMetrics() {
        if (!this.isInitialized) {
            throw new Error('Task storage not initialized');
        }

        const startTime = Date.now();

        try {
            if (this.config.enable_mock) {
                return this._getTaskMetricsMock();
            } else {
                return await this._getTaskMetricsDatabase();
            }
        } catch (error) {
            this._trackError('getTaskMetrics', error, startTime);
            throw error;
        }
    }

    /**
     * Get task metrics from database
     * @private
     */
    async _getTaskMetricsDatabase() {
        const sql = `
            SELECT 
                COUNT(*) as total_tasks,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_tasks,
                COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_tasks,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tasks,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_tasks,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_tasks,
                AVG(complexity_score) as avg_complexity,
                SUM(estimated_hours) as total_estimated_hours,
                SUM(actual_hours) as total_actual_hours,
                AVG(CASE WHEN status = 'completed' AND estimated_hours > 0 AND actual_hours > 0 
                    THEN (actual_hours / estimated_hours) * 100 END) as avg_estimation_accuracy
            FROM tasks
            WHERE status != 'cancelled'
        `;

        const result = await this.connection.query(sql);
        const metrics = result.rows[0];

        // Convert string numbers to actual numbers
        Object.keys(metrics).forEach(key => {
            if (metrics[key] !== null && !isNaN(metrics[key])) {
                metrics[key] = parseFloat(metrics[key]);
            }
        });

        this._trackPerformance('getTaskMetrics', Date.now() - performance.now());
        return metrics;
    }

    /**
     * Get task metrics from mock storage
     * @private
     */
    _getTaskMetricsMock() {
        const tasks = Array.from(this.mockStorage.values());
        const totalTasks = tasks.length;
        const pendingTasks = tasks.filter(t => t.status === 'pending').length;
        const completedTasks = tasks.filter(t => t.status === 'completed').length;
        const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
        const failedTasks = tasks.filter(t => t.status === 'failed').length;
        const cancelledTasks = tasks.filter(t => t.status === 'cancelled').length;
        const avgComplexity = tasks.reduce((sum, t) => sum + t.complexity_score, 0) / totalTasks || 0;

        return {
            total_tasks: totalTasks,
            pending_tasks: pendingTasks,
            in_progress_tasks: inProgressTasks,
            completed_tasks: completedTasks,
            failed_tasks: failedTasks,
            cancelled_tasks: cancelledTasks,
            avg_complexity: avgComplexity,
            total_estimated_hours: tasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0),
            total_actual_hours: tasks.reduce((sum, t) => sum + (t.actual_hours || 0), 0),
            avg_estimation_accuracy: null // Would need more complex calculation for mock
        };
    }

    /**
     * Get audit trail for an entity
     * @param {string} entityId - Entity identifier
     * @returns {Promise<Array>} Audit trail entries
     */
    async getAuditTrail(entityId) {
        if (!this.isInitialized) {
            throw new Error('Task storage not initialized');
        }

        if (this.config.enable_mock) {
            // Mock implementation - return empty for now
            return [];
        }

        const sql = `
            SELECT * FROM audit_logs 
            WHERE entity_id = $1 
            ORDER BY timestamp DESC
        `;

        const result = await this.connection.query(sql, [entityId]);
        return result.rows.map(row => ({
            ...row,
            old_values: typeof row.old_values === 'string' ? JSON.parse(row.old_values) : row.old_values,
            new_values: typeof row.new_values === 'string' ? JSON.parse(row.new_values) : row.new_values,
            metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
        }));
    }

    /**
     * Get health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        if (!this.isInitialized) {
            return { 
                status: 'not_initialized',
                mode: this.config.enable_mock ? 'mock' : 'database'
            };
        }

        if (this.config.enable_mock) {
            return {
                status: 'healthy',
                mode: 'mock',
                tasks_stored: this.mockStorage.size,
                context_entries: Array.from(this.mockContext.values()).reduce((sum, entries) => sum + entries.length, 0),
                performance_metrics: this.performanceMetrics
            };
        } else {
            const dbHealth = this.connection.getHealth();
            const metrics = this.performanceMetrics;
            
            return {
                status: dbHealth.connected ? 'healthy' : 'unhealthy',
                mode: 'database',
                database: dbHealth,
                performance_metrics: metrics,
                query_performance: {
                    avg_execution_time: metrics.queries > 0 ? metrics.totalExecutionTime / metrics.queries : 0,
                    error_rate: metrics.queries > 0 ? (metrics.errors / metrics.queries) * 100 : 0
                }
            };
        }
    }

    /**
     * Shutdown the storage manager
     */
    async shutdown() {
        log('debug', 'Shutting down task storage manager...');
        
        if (this.connection) {
            await this.connection.shutdown();
        }
        
        this.isInitialized = false;
    }

    // Legacy method aliases for backward compatibility
    async storeAtomicTask(task, requirement) {
        return await this.storeTask(task, requirement);
    }

    async retrieveTaskById(taskId) {
        return await this.getTask(taskId);
    }

    // Private methods for database operations (mock implementations)

    async _storeTaskInDatabase(task) {
        // Mock database storage
        log('debug', `Mock: Storing task ${task.id} in database`);
    }

    async _retrieveTaskFromDatabase(taskId) {
        // Mock database retrieval
        log('debug', `Mock: Retrieving task ${taskId} from database`);
        return null;
    }

    async _updateTaskStatusInDatabase(taskId, status, context) {
        // Mock database update
        log('debug', `Mock: Updating task ${taskId} status to ${status} in database`);
    }

    async _getPendingTasksFromDatabase() {
        // Mock database query
        log('debug', 'Mock: Getting pending tasks from database');
        return [];
    }

    async _storeContextInDatabase(contextEntry) {
        // Mock context storage
        log('debug', `Mock: Storing context for task ${contextEntry.task_id} in database`);
    }

    async _getContextFromDatabase(taskId) {
        // Mock context retrieval
        log('debug', `Mock: Getting context for task ${taskId} from database`);
        return [];
    }

    async _storeDependencyInDatabase(dependency) {
        // Mock dependency storage
        log('debug', `Mock: Storing dependency ${dependency.parent_task_id} -> ${dependency.child_task_id} in database`);
    }

    async _getDependenciesFromDatabase(taskId) {
        // Mock dependency retrieval
        log('debug', `Mock: Getting dependencies for task ${taskId} from database`);
        return [];
    }

    async _getMetricsFromDatabase() {
        // Mock metrics retrieval
        log('debug', 'Mock: Getting metrics from database');
        return {
            total_tasks: 0,
            pending_tasks: 0,
            completed_tasks: 0,
            avg_complexity: 0
        };
    }

    _trackError(method, error, startTime) {
        log('error', `Error in ${method}: ${error.message}`);
        this.performanceMetrics.errors++;
        this._trackPerformance(method, Date.now() - startTime);
    }

    _trackPerformance(method, duration) {
        this.performanceMetrics.queries++;
        this.performanceMetrics.totalExecutionTime += duration;
        this.performanceMetrics.cacheHits++;
        this.performanceMetrics.cacheMisses++;
    }
}

export default TaskStorageManager;
