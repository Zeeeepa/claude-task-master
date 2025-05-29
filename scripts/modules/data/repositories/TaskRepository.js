/**
 * TaskRepository.js
 * Specialized repository for task operations
 * Provides high-level task management functionality
 */

import { JsonRepository } from './JsonRepository.js';
import { log } from '../../utils.js';

/**
 * Repository for task-specific operations
 * Extends JsonRepository with task-specific functionality
 */
export class TaskRepository extends JsonRepository {
  constructor(cacheManager = null, validationManager = null, options = {}) {
    super(cacheManager, validationManager, {
      ...options,
      schema: 'tasks' // Default schema for task operations
    });
    
    this.defaultTasksStructure = {
      tasks: []
    };
  }

  /**
   * Read all tasks from tasks.json
   * @param {string} tasksPath - Path to tasks.json file
   * @param {Object} options - Read options
   * @returns {Promise<Object>} Tasks data structure
   */
  async readTasks(tasksPath, options = {}) {
    try {
      if (!this.exists(tasksPath)) {
        this._log('info', `Tasks file does not exist, creating: ${tasksPath}`);
        await this.write(tasksPath, this.defaultTasksStructure, { schema: 'tasks' });
        return this.defaultTasksStructure;
      }

      const data = await this.read(tasksPath, { schema: 'tasks', ...options });
      return data;
    } catch (error) {
      this._handleError(error, 'readTasks', tasksPath);
    }
  }

  /**
   * Write tasks to tasks.json
   * @param {string} tasksPath - Path to tasks.json file
   * @param {Object} tasksData - Tasks data structure
   * @param {Object} options - Write options
   * @returns {Promise<void>}
   */
  async writeTasks(tasksPath, tasksData, options = {}) {
    try {
      await this.write(tasksPath, tasksData, { schema: 'tasks', ...options });
    } catch (error) {
      this._handleError(error, 'writeTasks', tasksPath);
    }
  }

  /**
   * Get a specific task by ID
   * @param {string} tasksPath - Path to tasks.json file
   * @param {number} taskId - Task ID to find
   * @returns {Promise<Object|null>} Task object or null if not found
   */
  async getTaskById(tasksPath, taskId) {
    try {
      const data = await this.readTasks(tasksPath);
      const task = data.tasks.find(t => t.id === taskId);
      return task || null;
    } catch (error) {
      this._handleError(error, 'getTaskById', tasksPath);
    }
  }

  /**
   * Add a new task
   * @param {string} tasksPath - Path to tasks.json file
   * @param {Object} taskData - Task data to add
   * @returns {Promise<Object>} Added task with generated ID
   */
  async addTask(tasksPath, taskData) {
    try {
      const data = await this.readTasks(tasksPath);
      
      // Generate new ID
      const maxId = data.tasks.length > 0 
        ? Math.max(...data.tasks.map(t => t.id))
        : 0;
      const newId = maxId + 1;

      // Create new task with validation
      const newTask = {
        id: newId,
        status: 'pending',
        dependencies: [],
        priority: 'medium',
        subtasks: [],
        ...taskData
      };

      // Validate the new task
      if (this.validationManager) {
        const validation = this._validate(newTask, 'task');
        if (!validation.success) {
          throw new Error(`Task validation failed: ${validation.error}`);
        }
        newTask = validation.data;
      }

      data.tasks.push(newTask);
      await this.writeTasks(tasksPath, data);

      this._log('info', `Added new task with ID: ${newId}`);
      return newTask;
    } catch (error) {
      this._handleError(error, 'addTask', tasksPath);
    }
  }

  /**
   * Update an existing task
   * @param {string} tasksPath - Path to tasks.json file
   * @param {number} taskId - Task ID to update
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated task or null if not found
   */
  async updateTask(tasksPath, taskId, updates) {
    try {
      const data = await this.readTasks(tasksPath);
      const taskIndex = data.tasks.findIndex(t => t.id === taskId);
      
      if (taskIndex === -1) {
        return null;
      }

      // Apply updates
      const updatedTask = { ...data.tasks[taskIndex], ...updates };

      // Validate the updated task
      if (this.validationManager) {
        const validation = this._validate(updatedTask, 'task');
        if (!validation.success) {
          throw new Error(`Task validation failed: ${validation.error}`);
        }
        updatedTask = validation.data;
      }

      data.tasks[taskIndex] = updatedTask;
      await this.writeTasks(tasksPath, data);

      this._log('info', `Updated task ID: ${taskId}`);
      return updatedTask;
    } catch (error) {
      this._handleError(error, 'updateTask', tasksPath);
    }
  }

  /**
   * Delete a task
   * @param {string} tasksPath - Path to tasks.json file
   * @param {number} taskId - Task ID to delete
   * @returns {Promise<boolean>} True if task was deleted
   */
  async deleteTask(tasksPath, taskId) {
    try {
      const data = await this.readTasks(tasksPath);
      const initialLength = data.tasks.length;
      
      data.tasks = data.tasks.filter(t => t.id !== taskId);
      
      if (data.tasks.length === initialLength) {
        return false; // Task not found
      }

      await this.writeTasks(tasksPath, data);
      this._log('info', `Deleted task ID: ${taskId}`);
      return true;
    } catch (error) {
      this._handleError(error, 'deleteTask', tasksPath);
    }
  }

  /**
   * Get tasks by status
   * @param {string} tasksPath - Path to tasks.json file
   * @param {string} status - Status to filter by
   * @returns {Promise<Object[]>} Array of tasks with specified status
   */
  async getTasksByStatus(tasksPath, status) {
    try {
      const data = await this.readTasks(tasksPath);
      return data.tasks.filter(t => t.status === status);
    } catch (error) {
      this._handleError(error, 'getTasksByStatus', tasksPath);
    }
  }

  /**
   * Get tasks by priority
   * @param {string} tasksPath - Path to tasks.json file
   * @param {string} priority - Priority to filter by
   * @returns {Promise<Object[]>} Array of tasks with specified priority
   */
  async getTasksByPriority(tasksPath, priority) {
    try {
      const data = await this.readTasks(tasksPath);
      return data.tasks.filter(t => t.priority === priority);
    } catch (error) {
      this._handleError(error, 'getTasksByPriority', tasksPath);
    }
  }

  /**
   * Get tasks that depend on a specific task
   * @param {string} tasksPath - Path to tasks.json file
   * @param {number} taskId - Task ID to find dependents for
   * @returns {Promise<Object[]>} Array of dependent tasks
   */
  async getDependentTasks(tasksPath, taskId) {
    try {
      const data = await this.readTasks(tasksPath);
      return data.tasks.filter(t => t.dependencies && t.dependencies.includes(taskId));
    } catch (error) {
      this._handleError(error, 'getDependentTasks', tasksPath);
    }
  }

  /**
   * Add a dependency between tasks
   * @param {string} tasksPath - Path to tasks.json file
   * @param {number} taskId - Task that will depend on another
   * @param {number} dependencyId - Task that is depended upon
   * @returns {Promise<boolean>} True if dependency was added
   */
  async addDependency(tasksPath, taskId, dependencyId) {
    try {
      const data = await this.readTasks(tasksPath);
      const task = data.tasks.find(t => t.id === taskId);
      
      if (!task) {
        throw new Error(`Task with ID ${taskId} not found`);
      }

      if (!data.tasks.find(t => t.id === dependencyId)) {
        throw new Error(`Dependency task with ID ${dependencyId} not found`);
      }

      if (!task.dependencies) {
        task.dependencies = [];
      }

      if (!task.dependencies.includes(dependencyId)) {
        task.dependencies.push(dependencyId);
        await this.writeTasks(tasksPath, data);
        this._log('info', `Added dependency: task ${taskId} depends on ${dependencyId}`);
        return true;
      }

      return false; // Dependency already exists
    } catch (error) {
      this._handleError(error, 'addDependency', tasksPath);
    }
  }

  /**
   * Remove a dependency between tasks
   * @param {string} tasksPath - Path to tasks.json file
   * @param {number} taskId - Task to remove dependency from
   * @param {number} dependencyId - Dependency to remove
   * @returns {Promise<boolean>} True if dependency was removed
   */
  async removeDependency(tasksPath, taskId, dependencyId) {
    try {
      const data = await this.readTasks(tasksPath);
      const task = data.tasks.find(t => t.id === taskId);
      
      if (!task || !task.dependencies) {
        return false;
      }

      const initialLength = task.dependencies.length;
      task.dependencies = task.dependencies.filter(id => id !== dependencyId);
      
      if (task.dependencies.length < initialLength) {
        await this.writeTasks(tasksPath, data);
        this._log('info', `Removed dependency: task ${taskId} no longer depends on ${dependencyId}`);
        return true;
      }

      return false;
    } catch (error) {
      this._handleError(error, 'removeDependency', tasksPath);
    }
  }

  /**
   * Add a subtask to a task
   * @param {string} tasksPath - Path to tasks.json file
   * @param {number} taskId - Parent task ID
   * @param {Object} subtaskData - Subtask data
   * @returns {Promise<Object|null>} Added subtask or null if parent not found
   */
  async addSubtask(tasksPath, taskId, subtaskData) {
    try {
      const data = await this.readTasks(tasksPath);
      const task = data.tasks.find(t => t.id === taskId);
      
      if (!task) {
        return null;
      }

      if (!task.subtasks) {
        task.subtasks = [];
      }

      // Generate subtask ID
      const subtaskId = `${taskId}-${task.subtasks.length + 1}`;
      
      const newSubtask = {
        id: subtaskId,
        status: 'pending',
        priority: 'medium',
        ...subtaskData
      };

      // Validate subtask if validation manager is available
      if (this.validationManager) {
        const validation = this._validate(newSubtask, 'subtask');
        if (!validation.success) {
          throw new Error(`Subtask validation failed: ${validation.error}`);
        }
        newSubtask = validation.data;
      }

      task.subtasks.push(newSubtask);
      await this.writeTasks(tasksPath, data);

      this._log('info', `Added subtask ${subtaskId} to task ${taskId}`);
      return newSubtask;
    } catch (error) {
      this._handleError(error, 'addSubtask', tasksPath);
    }
  }

  /**
   * Update a subtask
   * @param {string} tasksPath - Path to tasks.json file
   * @param {number} taskId - Parent task ID
   * @param {string} subtaskId - Subtask ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated subtask or null if not found
   */
  async updateSubtask(tasksPath, taskId, subtaskId, updates) {
    try {
      const data = await this.readTasks(tasksPath);
      const task = data.tasks.find(t => t.id === taskId);
      
      if (!task || !task.subtasks) {
        return null;
      }

      const subtaskIndex = task.subtasks.findIndex(st => st.id === subtaskId);
      if (subtaskIndex === -1) {
        return null;
      }

      const updatedSubtask = { ...task.subtasks[subtaskIndex], ...updates };

      // Validate subtask if validation manager is available
      if (this.validationManager) {
        const validation = this._validate(updatedSubtask, 'subtask');
        if (!validation.success) {
          throw new Error(`Subtask validation failed: ${validation.error}`);
        }
        updatedSubtask = validation.data;
      }

      task.subtasks[subtaskIndex] = updatedSubtask;
      await this.writeTasks(tasksPath, data);

      this._log('info', `Updated subtask ${subtaskId} in task ${taskId}`);
      return updatedSubtask;
    } catch (error) {
      this._handleError(error, 'updateSubtask', tasksPath);
    }
  }

  /**
   * Get task statistics
   * @param {string} tasksPath - Path to tasks.json file
   * @returns {Promise<Object>} Task statistics
   */
  async getTaskStats(tasksPath) {
    try {
      const data = await this.readTasks(tasksPath);
      const tasks = data.tasks;

      const stats = {
        total: tasks.length,
        byStatus: {},
        byPriority: {},
        withDependencies: 0,
        withSubtasks: 0,
        averageSubtasks: 0
      };

      // Count by status
      const statuses = ['pending', 'in-progress', 'done', 'deferred'];
      statuses.forEach(status => {
        stats.byStatus[status] = tasks.filter(t => t.status === status).length;
      });

      // Count by priority
      const priorities = ['low', 'medium', 'high'];
      priorities.forEach(priority => {
        stats.byPriority[priority] = tasks.filter(t => t.priority === priority).length;
      });

      // Count tasks with dependencies and subtasks
      stats.withDependencies = tasks.filter(t => t.dependencies && t.dependencies.length > 0).length;
      stats.withSubtasks = tasks.filter(t => t.subtasks && t.subtasks.length > 0).length;

      // Calculate average subtasks
      const totalSubtasks = tasks.reduce((sum, t) => sum + (t.subtasks ? t.subtasks.length : 0), 0);
      stats.averageSubtasks = tasks.length > 0 ? Math.round((totalSubtasks / tasks.length) * 100) / 100 : 0;

      return stats;
    } catch (error) {
      this._handleError(error, 'getTaskStats', tasksPath);
    }
  }

  /**
   * Search tasks by text
   * @param {string} tasksPath - Path to tasks.json file
   * @param {string} searchText - Text to search for
   * @param {Object} options - Search options
   * @returns {Promise<Object[]>} Array of matching tasks
   */
  async searchTasks(tasksPath, searchText, options = {}) {
    try {
      const data = await this.readTasks(tasksPath);
      const searchLower = searchText.toLowerCase();
      
      const searchFields = options.fields || ['title', 'description', 'details'];
      
      return data.tasks.filter(task => {
        return searchFields.some(field => {
          const value = task[field];
          return value && value.toLowerCase().includes(searchLower);
        });
      });
    } catch (error) {
      this._handleError(error, 'searchTasks', tasksPath);
    }
  }
}

export default TaskRepository;

