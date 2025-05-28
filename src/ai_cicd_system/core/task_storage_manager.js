/**
 * @fileoverview Task Storage Manager
 * @description Unified task storage with comprehensive context preservation
 */

import { log } from '../../scripts/modules/utils.js';

/**
 * Interface that defines the required operations for any task storage implementation.
 * Any concrete implementation (PostgreSQL, MongoDB, etc.) should implement this interface.
 * 
 * @interface TaskStorageInterface
 */
// interface TaskStorageInterface {
//   initialize(): Promise<void>;
//   storeAtomicTask(task: Object, requirement: Object): Promise<string>;
//   retrieveTaskById(taskId: string): Promise<Object|null>;
//   updateTaskStatus(taskId: string, status: string, context?: Object): Promise<void>;
//   getPendingTasks(): Promise<Array<Object>>;
//   markTaskCompleted(taskId: string, results?: Object): Promise<void>;
//   storeTaskContext(taskId: string, contextType: string, contextData: Object): Promise<void>;
//   getTaskFullContext(taskId: string): Promise<Object>;
//   storeAIInteraction(taskId: string, agentName: string, interactionData: Object): Promise<void>;
//   addTaskDependency(parentTaskId: string, childTaskId: string, dependencyType?: string): Promise<void>;
//   getTaskDependencies(taskId: string): Promise<Array<string>>;
//   storeValidationResult(taskId: string, validationType: string, validatorName: string, 
//                         status: string, score: number, details: Object, suggestions: Object): Promise<void>;
//   getTaskMetrics(): Promise<Object>;
//   getHealth(): Promise<Object>;
//   shutdown(): Promise<void>;
// }

/**
 * Task storage manager with PostgreSQL backend and mock support
 * Implements the TaskStorageInterface
 */
export class TaskStorageManager {
    constructor(config = {}) {
        this.config = {
            host: config.host || 'localhost',
            port: config.port || 5432,
            database: config.database || 'codegen-taskmaster-db',
            username: config.username || 'software_developer',
            password: config.password || 'password',
            ssl_mode: config.ssl_mode || 'require',
            enable_mock: config.enable_mock || false,
            pool_min_size: config.pool_min_size || 5,
            pool_max_size: config.pool_max_size || 20,
            command_timeout: config.command_timeout || 60000,
            ...config
        };
        
        this.isInitialized = false;
        this.mockStorage = new Map();
        this.mockContext = new Map();
        this.pool = null;
    }

    /**
     * Initialize the task storage
     */
    async initialize() {
        try {
            log('info', 'Initializing task storage...');
            
            if (this.config.enable_mock) {
                log('warn', 'Running in mock mode - data will not persist');
                this.isInitialized = true;
                return;
            }

            // Real PostgreSQL implementation would go here
            // For now, fall back to mock mode
            log('warn', 'PostgreSQL not implemented yet, falling back to mock mode');
            this.config.enable_mock = true;
            this.isInitialized = true;
            
        } catch (error) {
            log('error', `Failed to initialize task storage: ${error.message}`);
            throw error;
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
        
        const storedTask = {
            id: taskId,
            title: task.title,
            description: task.description,
            requirements: task.requirements || [],
            acceptance_criteria: task.acceptanceCriteria || [],
            affected_files: task.affectedFiles || [],
            complexity_score: task.complexityScore || 5,
            status: 'pending',
            priority: task.priority || 'medium',
            created_at: new Date(),
            updated_at: new Date(),
            assigned_to: task.assignedTo || null,
            tags: task.tags || [],
            estimated_hours: task.estimatedHours || null,
            actual_hours: null,
            metadata: {
                source_requirement_id: requirement?.id,
                validation: task.validation,
                ...task.metadata
            }
        };

        if (this.config.enable_mock) {
            this.mockStorage.set(taskId, storedTask);
            
            // Store initial context
            await this.storeTaskContext(taskId, 'requirement', {
                original_requirement: requirement,
                decomposition_metadata: {
                    created_at: new Date(),
                    decomposition_method: 'nlp_analysis'
                }
            });
            
        } else {
            // Real PostgreSQL implementation would go here
            await this._storeTaskInDatabase(storedTask);
        }

        log('debug', `Stored task ${taskId}: ${task.title}`);
        return taskId;
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
        } else {
            return await this._retrieveTaskFromDatabase(taskId);
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
            const task = this.mockStorage.get(taskId);
            if (task) {
                task.status = status;
                task.updated_at = new Date();
                
                // Store status change context
                await this.storeTaskContext(taskId, 'status_change', {
                    from_status: task.status,
                    to_status: status,
                    changed_at: new Date(),
                    context
                });
            }
        } else {
            await this._updateTaskStatusInDatabase(taskId, status, context);
        }

        log('debug', `Updated task ${taskId} status to ${status}`);
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
        } else {
            return await this._getPendingTasksFromDatabase();
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
                task.completed_at = new Date();
                task.actual_hours = results.actual_hours || task.estimated_hours;
            }
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
            await this._storeContextInDatabase(contextEntry);
        }

        log('debug', `Stored ${contextType} context for task ${taskId}`);
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
            contextEntries = await this._getContextFromDatabase(taskId);
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
                default:
                    organizedContext.metadata[entry.context_type] = entry.context_data;
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
            await this._storeDependencyInDatabase(dependency);
        }

        log('debug', `Added dependency: ${parentTaskId} ${dependencyType} ${childTaskId}`);
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
        } else {
            return await this._getDependenciesFromDatabase(taskId);
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
        log('debug', `Stored validation result for task ${taskId}: ${status} (${score})`);
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
            const avgComplexity = tasks.reduce((sum, t) => sum + t.complexity_score, 0) / totalTasks || 0;

            return {
                total_tasks: totalTasks,
                pending_tasks: pendingTasks,
                completed_tasks: completedTasks,
                in_progress_tasks: tasks.filter(t => t.status === 'in_progress').length,
                failed_tasks: tasks.filter(t => t.status === 'failed').length,
                avg_complexity: avgComplexity,
                total_estimated_hours: tasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0),
                total_actual_hours: tasks.reduce((sum, t) => sum + (t.actual_hours || 0), 0)
            };
        } else {
            return await this._getMetricsFromDatabase();
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
        } else {
            // Real database health check would go here
            return { status: 'healthy', mode: 'database' };
        }
    }

    /**
     * Shutdown the storage manager
     */
    async shutdown() {
        log('debug', 'Shutting down task storage manager...');
        
        if (this.pool) {
            await this.pool.end();
        }
        
        this.isInitialized = false;
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
}

export default TaskStorageManager;
