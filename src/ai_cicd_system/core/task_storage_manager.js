/**
 * @fileoverview Task Storage Manager
 * @description Unified task storage with comprehensive context preservation and PostgreSQL backend
 */

import { log } from '../../scripts/modules/utils.js';
import { DatabaseManager } from './database_manager.js';
import { TaskModel } from '../database/models/task_model.js';
import { ContextModel } from '../database/models/context_model.js';
import { WorkflowModel } from '../database/models/workflow_model.js';

/**
 * Task storage manager with PostgreSQL backend and mock support
 * Implements comprehensive task and context management
 */
export class TaskStorageManager {
    constructor(config = {}) {
        this.config = {
            host: config.host || 'localhost',
            port: config.port || 5432,
            database: config.database || 'codegen_taskmaster',
            user: config.user || 'software_developer',
            password: config.password,
            ssl: config.ssl || false,
            enable_mock: config.enable_mock || false,
            enable_logging: config.enable_logging !== false,
            auto_migrate: config.auto_migrate || false,
            max_connections: config.max_connections || 20,
            min_connections: config.min_connections || 5,
            idle_timeout: config.idle_timeout || 30000,
            connection_timeout: config.connection_timeout || 2000,
            ...config
        };
        
        this.isInitialized = false;
        
        // Mock storage for fallback
        this.mockStorage = new Map();
        this.mockContext = new Map();
        
        // Database components
        this.dbManager = null;
        this.taskModel = null;
        this.contextModel = null;
        this.workflowModel = null;
    }

    /**
     * Initialize the task storage manager
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            if (this.config.enable_mock) {
                log('info', '📝 TaskStorageManager running in mock mode');
                this.isInitialized = true;
                return;
            }

            log('info', '🚀 Initializing TaskStorageManager with PostgreSQL...');
            
            // Initialize database manager
            this.dbManager = new DatabaseManager(this.config);
            await this.dbManager.initialize();
            
            // Initialize data models
            this.taskModel = new TaskModel(this.dbManager);
            this.contextModel = new ContextModel(this.dbManager);
            this.workflowModel = new WorkflowModel(this.dbManager);
            
            this.isInitialized = true;
            
            log('info', '✅ TaskStorageManager initialized with PostgreSQL', {
                host: this.config.host,
                database: this.config.database
            });
            
        } catch (error) {
            log('error', '❌ Failed to initialize TaskStorageManager', {
                error: error.message
            });
            
            // Fallback to mock mode on initialization failure
            if (!this.config.enable_mock) {
                log('warn', '⚠️ Falling back to mock mode due to database initialization failure');
                this.config.enable_mock = true;
                this.isInitialized = true;
            } else {
                throw error;
            }
        }
    }

    /**
     * Store atomic task with context
     * @param {Object} task - Task to store
     * @param {Object} requirement - Source requirement
     * @returns {Promise<string>} Task ID
     */
    async storeAtomicTask(task, requirement) {
        if (!this.isInitialized) {
            throw new Error('Task storage not initialized');
        }

        const taskId = task.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const taskData = {
            id: taskId,
            title: task.title,
            description: task.description,
            requirements: task.requirements || [],
            acceptanceCriteria: task.acceptanceCriteria || [],
            affectedFiles: task.affectedFiles || [],
            complexityScore: task.complexityScore || 5,
            priority: task.priority || 0,
            assignedTo: task.assignedTo || null,
            tags: task.tags || [],
            estimatedHours: task.estimatedHours || null,
            metadata: {
                source_requirement_id: requirement?.id,
                validation: task.validation,
                ...task.metadata
            }
        };

        if (this.config.enable_mock) {
            return await this._mockStoreTask(taskData, requirement);
        }

        try {
            // Store task in database
            const storedTask = await this.taskModel.create(taskData);
            
            // Store initial context
            await this.storeTaskContext(storedTask.id, 'requirement', {
                original_requirement: requirement,
                decomposition_metadata: {
                    created_at: new Date(),
                    decomposition_method: 'nlp_analysis'
                }
            });
            
            log('debug', `✅ Task stored: ${storedTask.id}`, {
                title: storedTask.title,
                complexity: storedTask.complexityScore
            });
            
            return storedTask.id;
            
        } catch (error) {
            log('error', '❌ Failed to store task', {
                error: error.message,
                taskId
            });
            throw new Error(`Task storage failed: ${error.message}`);
        }
    }

    /**
     * Retrieve task by ID
     * @param {string} taskId - Task identifier
     * @returns {Promise<Object|null>} Task object or null
     */
    async retrieveTaskById(taskId) {
        if (!this.isInitialized) {
            throw new Error('Task storage not initialized');
        }

        if (this.config.enable_mock) {
            return this.mockStorage.get(taskId) || null;
        }

        try {
            const task = await this.taskModel.findById(taskId);
            if (!task) {
                return null;
            }

            // Load associated contexts
            const contexts = await this.contextModel.findByTaskId(taskId);
            task.contexts = contexts;

            return task;
            
        } catch (error) {
            log('error', '❌ Failed to retrieve task', {
                error: error.message,
                taskId
            });
            throw error;
        }
    }

    /**
     * Update task status
     * @param {string} taskId - Task identifier
     * @param {string} status - New status
     * @param {Object} context - Update context
     */
    async updateTaskStatus(taskId, status, context = {}) {
        if (!this.isInitialized) {
            throw new Error('Task storage not initialized');
        }

        if (this.config.enable_mock) {
            return await this._mockUpdateTaskStatus(taskId, status, context);
        }

        try {
            const completedAt = status === 'completed' ? new Date() : null;
            const updatedTask = await this.taskModel.updateStatus(taskId, status, completedAt);
            
            if (!updatedTask) {
                throw new Error(`Task not found: ${taskId}`);
            }
            
            // Store status change context
            await this.storeTaskContext(taskId, 'status_change', {
                from_status: context.from_status || 'unknown',
                to_status: status,
                changed_at: new Date(),
                context
            });

            log('debug', `✅ Task status updated: ${taskId}`, {
                status,
                completedAt
            });
            
            return updatedTask;
            
        } catch (error) {
            log('error', '❌ Failed to update task status', {
                error: error.message,
                taskId,
                status
            });
            throw error;
        }
    }

    /**
     * Get pending tasks
     * @returns {Promise<Array>} Array of pending tasks
     */
    async getPendingTasks() {
        if (!this.isInitialized) {
            throw new Error('Task storage not initialized');
        }

        if (this.config.enable_mock) {
            return Array.from(this.mockStorage.values())
                .filter(task => task.status === 'pending');
        }

        try {
            return await this.taskModel.findByStatus('pending');
        } catch (error) {
            log('error', '❌ Failed to get pending tasks', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Mark task as completed
     * @param {string} taskId - Task identifier
     * @param {Object} results - Completion results
     */
    async markTaskCompleted(taskId, results = {}) {
        await this.updateTaskStatus(taskId, 'completed', results);
        
        if (this.config.enable_mock) {
            const task = this.mockStorage.get(taskId);
            if (task) {
                task.completedAt = new Date();
                task.actualHours = results.actual_hours || task.estimatedHours;
            }
        } else {
            // Update actual hours if provided
            if (results.actual_hours) {
                await this.taskModel.update(taskId, {
                    actualHours: results.actual_hours
                });
            }
        }

        await this.storeTaskContext(taskId, 'completion', {
            completed_at: new Date(),
            results,
            completion_method: 'automated'
        });

        log('info', `✅ Task ${taskId} marked as completed`);
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

        const contextEntry = {
            task_id: taskId,
            context_type: contextType,
            context_data: contextData,
            created_at: new Date(),
            metadata: {
                version: '1.0.0',
                source: 'task_storage_manager'
            }
        };

        if (this.config.enable_mock) {
            if (!this.mockContext.has(taskId)) {
                this.mockContext.set(taskId, []);
            }
            this.mockContext.get(taskId).push(contextEntry);
        } else {
            try {
                await this.contextModel.create(taskId, contextType, contextData, contextEntry.metadata);
            } catch (error) {
                log('error', '❌ Failed to store task context', {
                    error: error.message,
                    taskId,
                    contextType
                });
                throw error;
            }
        }

        log('debug', `✅ Stored ${contextType} context for task ${taskId}`);
    }

    /**
     * Get task full context
     * @param {string} taskId - Task identifier
     * @returns {Promise<Object>} Full task context
     */
    async getTaskFullContext(taskId) {
        if (!this.isInitialized) {
            throw new Error('Task storage not initialized');
        }

        const task = await this.retrieveTaskById(taskId);
        if (!task) {
            throw new Error(`Task ${taskId} not found`);
        }

        let contextEntries = [];
        
        if (this.config.enable_mock) {
            contextEntries = this.mockContext.get(taskId) || [];
        } else {
            try {
                contextEntries = await this.contextModel.findByTaskId(taskId);
            } catch (error) {
                log('error', '❌ Failed to get task context', {
                    error: error.message,
                    taskId
                });
                throw error;
            }
        }

        // Organize context by type
        const organizedContext = {
            task,
            requirements_context: null,
            codebase_context: null,
            ai_interactions: [],
            validation_results: [],
            workflow_state: null,
            metadata: {}
        };

        contextEntries.forEach(entry => {
            const contextType = entry.context_type || entry.contextType;
            const contextData = entry.context_data || entry.contextData;
            
            switch (contextType) {
                case 'requirement':
                    organizedContext.requirements_context = contextData;
                    break;
                case 'codebase':
                    organizedContext.codebase_context = contextData;
                    break;
                case 'ai_interaction':
                    organizedContext.ai_interactions.push(contextData);
                    break;
                case 'validation':
                    organizedContext.validation_results.push(contextData);
                    break;
                case 'workflow':
                    organizedContext.workflow_state = contextData;
                    break;
                default:
                    organizedContext.metadata[contextType] = contextData;
            }
        });

        return organizedContext;
    }

    /**
     * Store AI interaction
     * @param {string} taskId - Task identifier
     * @param {string} agentName - AI agent name
     * @param {Object} interactionData - Interaction data
     */
    async storeAIInteraction(taskId, agentName, interactionData) {
        const interaction = {
            agent_name: agentName,
            interaction_type: interactionData.type || 'unknown',
            request_data: interactionData.request,
            response_data: interactionData.response,
            execution_time_ms: interactionData.execution_time_ms,
            success: interactionData.success !== false,
            session_id: interactionData.session_id,
            timestamp: new Date()
        };

        await this.storeTaskContext(taskId, 'ai_interaction', interaction);
        log('debug', `✅ Stored AI interaction for task ${taskId} with agent ${agentName}`);
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

        const dependency = {
            parent_task_id: parentTaskId,
            child_task_id: childTaskId,
            dependency_type: dependencyType,
            created_at: new Date()
        };

        if (this.config.enable_mock) {
            // Store dependency in context for both tasks
            await this.storeTaskContext(parentTaskId, 'dependency_parent', {
                child_task_id: childTaskId,
                dependency_type: dependencyType
            });
            
            await this.storeTaskContext(childTaskId, 'dependency_child', {
                parent_task_id: parentTaskId,
                dependency_type: dependencyType
            });
        } else {
            try {
                // Store dependency in context for both tasks
                await this.storeTaskContext(parentTaskId, 'dependency_parent', {
                    child_task_id: childTaskId,
                    dependency_type: dependencyType
                });
                
                await this.storeTaskContext(childTaskId, 'dependency_child', {
                    parent_task_id: parentTaskId,
                    dependency_type: dependencyType
                });
            } catch (error) {
                log('error', '❌ Failed to add task dependency', {
                    error: error.message,
                    parentTaskId,
                    childTaskId
                });
                throw error;
            }
        }

        log('debug', `✅ Added dependency: ${parentTaskId} ${dependencyType} ${childTaskId}`);
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

        if (this.config.enable_mock) {
            const contextEntries = this.mockContext.get(taskId) || [];
            return contextEntries
                .filter(entry => entry.context_type === 'dependency_child')
                .map(entry => entry.context_data.parent_task_id);
        }

        try {
            const contextEntries = await this.contextModel.findByTaskId(taskId, 'dependency_child');
            return contextEntries.map(entry => entry.contextData.parent_task_id);
        } catch (error) {
            log('error', '❌ Failed to get task dependencies', {
                error: error.message,
                taskId
            });
            throw error;
        }
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
        const validationResult = {
            validation_type: validationType,
            validator_name: validatorName,
            status,
            score,
            details,
            suggestions,
            validated_at: new Date()
        };

        await this.storeTaskContext(taskId, 'validation', validationResult);
        log('debug', `✅ Stored validation result for task ${taskId}: ${status} (${score})`);
    }

    /**
     * Get task metrics
     * @returns {Promise<Object>} Task metrics
     */
    async getTaskMetrics() {
        if (!this.isInitialized) {
            throw new Error('Task storage not initialized');
        }

        if (this.config.enable_mock) {
            const tasks = Array.from(this.mockStorage.values());
            const totalTasks = tasks.length;
            const pendingTasks = tasks.filter(t => t.status === 'pending').length;
            const completedTasks = tasks.filter(t => t.status === 'completed').length;
            const avgComplexity = tasks.reduce((sum, t) => sum + t.complexityScore, 0) / totalTasks || 0;

            return {
                total_tasks: totalTasks,
                pending_tasks: pendingTasks,
                completed_tasks: completedTasks,
                in_progress_tasks: tasks.filter(t => t.status === 'in_progress').length,
                failed_tasks: tasks.filter(t => t.status === 'failed').length,
                avg_complexity: avgComplexity,
                total_estimated_hours: tasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0),
                total_actual_hours: tasks.reduce((sum, t) => sum + (t.actualHours || 0), 0)
            };
        }

        try {
            return await this.taskModel.getStatistics();
        } catch (error) {
            log('error', '❌ Failed to get task metrics', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        if (!this.isInitialized) {
            return { status: 'not_initialized' };
        }

        if (this.config.enable_mock) {
            return {
                status: 'healthy',
                mode: 'mock',
                tasks_stored: this.mockStorage.size,
                context_entries: Array.from(this.mockContext.values()).reduce((sum, entries) => sum + entries.length, 0)
            };
        }

        try {
            const dbHealth = await this.dbManager.getHealth();
            const taskMetrics = await this.getTaskMetrics();
            
            return {
                status: dbHealth.isHealthy ? 'healthy' : 'degraded',
                mode: 'database',
                database: dbHealth,
                tasks: taskMetrics
            };
        } catch (error) {
            log('error', '❌ Health check failed', {
                error: error.message
            });
            return {
                status: 'unhealthy',
                mode: 'database',
                error: error.message
            };
        }
    }

    /**
     * Shutdown the storage manager
     */
    async shutdown() {
        log('info', '🔄 Shutting down task storage manager...');
        
        if (this.dbManager) {
            await this.dbManager.shutdown();
        }
        
        this.isInitialized = false;
        log('info', '✅ Task storage manager shutdown complete');
    }

    // Mock methods for fallback functionality
    async _mockStoreTask(taskData, requirement) {
        const taskId = taskData.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const storedTask = {
            id: taskId,
            title: taskData.title,
            description: taskData.description,
            requirements: taskData.requirements || [],
            acceptanceCriteria: taskData.acceptanceCriteria || [],
            affectedFiles: taskData.affectedFiles || [],
            complexityScore: taskData.complexityScore || 5,
            status: 'pending',
            priority: taskData.priority || 0,
            assignedTo: taskData.assignedTo || null,
            tags: taskData.tags || [],
            estimatedHours: taskData.estimatedHours || null,
            actualHours: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            completedAt: null,
            metadata: {
                source_requirement_id: requirement?.id,
                validation: taskData.validation,
                ...taskData.metadata
            }
        };

        this.mockStorage.set(taskId, storedTask);
        
        // Store initial context
        await this.storeTaskContext(taskId, 'requirement', {
            original_requirement: requirement,
            decomposition_metadata: {
                created_at: new Date(),
                decomposition_method: 'nlp_analysis'
            }
        });
        
        log('debug', `✅ Task stored (mock): ${storedTask.id}`, {
            title: storedTask.title,
            complexity: storedTask.complexityScore
        });
        
        return storedTask.id;
    }

    async _mockUpdateTaskStatus(taskId, status, context) {
        const task = this.mockStorage.get(taskId);
        if (task) {
            const oldStatus = task.status;
            task.status = status;
            task.updatedAt = new Date();
            
            if (status === 'completed') {
                task.completedAt = new Date();
            }
            
            // Store status change context
            await this.storeTaskContext(taskId, 'status_change', {
                from_status: oldStatus,
                to_status: status,
                changed_at: new Date(),
                context
            });
            
            log('debug', `✅ Task status updated (mock): ${taskId}`, {
                from: oldStatus,
                to: status
            });
            
            return task;
        }
        
        return null;
    }
}

export default TaskStorageManager;
