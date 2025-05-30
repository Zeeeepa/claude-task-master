/**
 * Task Repository for Claude Task Master
 * Provides data access layer for task operations
 */

import db from '../connection.js';
import Task from '../models/Task.js';

/**
 * Task Repository Class
 */
export class TaskRepository {
  /**
   * Create a new task
   */
  async create(taskData) {
    const task = new Task(taskData);
    return await task.save();
  }

  /**
   * Find task by ID
   */
  async findById(id) {
    return await Task.findById(id);
  }

  /**
   * Find task by legacy ID
   */
  async findByLegacyId(legacyId) {
    return await Task.findByLegacyId(legacyId);
  }

  /**
   * Update task
   */
  async update(id, updateData) {
    const task = await this.findById(id);
    if (!task) {
      throw new Error(`Task with id ${id} not found`);
    }

    Object.assign(task, updateData);
    return await task.save();
  }

  /**
   * Delete task
   */
  async delete(id) {
    const task = await this.findById(id);
    if (!task) {
      throw new Error(`Task with id ${id} not found`);
    }

    return await task.delete();
  }

  /**
   * Find all tasks with filters and pagination
   */
  async findAll(filters = {}, pagination = {}) {
    const { page = 1, limit = 50 } = pagination;
    const offset = (page - 1) * limit;

    return await Task.findAll({
      ...filters,
      limit,
      offset
    });
  }

  /**
   * Search tasks by text
   */
  async search(searchText, filters = {}, pagination = {}) {
    const { page = 1, limit = 50 } = pagination;
    const offset = (page - 1) * limit;

    return await Task.search(searchText, {
      ...filters,
      limit,
      offset
    });
  }

  /**
   * Get tasks by status
   */
  async findByStatus(status, pagination = {}) {
    return await this.findAll({ status }, pagination);
  }

  /**
   * Get tasks by priority
   */
  async findByPriority(priority, pagination = {}) {
    return await this.findAll({ priority }, pagination);
  }

  /**
   * Get tasks by project
   */
  async findByProject(projectId, filters = {}, pagination = {}) {
    return await this.findAll({ ...filters, project_id: projectId }, pagination);
  }

  /**
   * Get tasks assigned to user
   */
  async findByAssignee(assignee, filters = {}, pagination = {}) {
    return await this.findAll({ ...filters, assigned_to: assignee }, pagination);
  }

  /**
   * Get root tasks (tasks without parent)
   */
  async findRootTasks(filters = {}, pagination = {}) {
    return await this.findAll({ ...filters, parent_task_id: null }, pagination);
  }

  /**
   * Get subtasks of a parent task
   */
  async findSubtasks(parentTaskId) {
    const parentTask = await this.findById(parentTaskId);
    if (!parentTask) {
      throw new Error(`Parent task with id ${parentTaskId} not found`);
    }

    return await parentTask.getSubtasks();
  }

  /**
   * Add subtask relationship
   */
  async addSubtask(parentTaskId, childTaskId, orderIndex = 0) {
    const parentTask = await this.findById(parentTaskId);
    if (!parentTask) {
      throw new Error(`Parent task with id ${parentTaskId} not found`);
    }

    const childTask = await this.findById(childTaskId);
    if (!childTask) {
      throw new Error(`Child task with id ${childTaskId} not found`);
    }

    return await parentTask.addSubtask(childTaskId, orderIndex);
  }

  /**
   * Remove subtask relationship
   */
  async removeSubtask(parentTaskId, childTaskId) {
    const parentTask = await this.findById(parentTaskId);
    if (!parentTask) {
      throw new Error(`Parent task with id ${parentTaskId} not found`);
    }

    return await parentTask.removeSubtask(childTaskId);
  }

  /**
   * Get task dependencies
   */
  async getDependencies(taskId) {
    const task = await this.findById(taskId);
    if (!task) {
      throw new Error(`Task with id ${taskId} not found`);
    }

    return await task.getDependencies();
  }

  /**
   * Add task dependency
   */
  async addDependency(taskId, dependsOnTaskId, dependencyType = 'blocks') {
    const task = await this.findById(taskId);
    if (!task) {
      throw new Error(`Task with id ${taskId} not found`);
    }

    const dependsOnTask = await this.findById(dependsOnTaskId);
    if (!dependsOnTask) {
      throw new Error(`Dependency task with id ${dependsOnTaskId} not found`);
    }

    return await task.addDependency(dependsOnTaskId, dependencyType);
  }

  /**
   * Remove task dependency
   */
  async removeDependency(taskId, dependsOnTaskId) {
    const task = await this.findById(taskId);
    if (!task) {
      throw new Error(`Task with id ${taskId} not found`);
    }

    return await task.removeDependency(dependsOnTaskId);
  }

  /**
   * Update task status
   */
  async updateStatus(taskId, newStatus) {
    const task = await this.findById(taskId);
    if (!task) {
      throw new Error(`Task with id ${taskId} not found`);
    }

    task.status = newStatus;
    return await task.save();
  }

  /**
   * Bulk update task status
   */
  async bulkUpdateStatus(taskIds, newStatus) {
    const query = `
      UPDATE tasks 
      SET status = $1, updated_at = NOW() 
      WHERE id = ANY($2)
      RETURNING id, title, status;
    `;

    const result = await db.query(query, [newStatus, taskIds]);
    return result.rows;
  }

  /**
   * Get task execution history
   */
  async getExecutionHistory(taskId) {
    const task = await this.findById(taskId);
    if (!task) {
      throw new Error(`Task with id ${taskId} not found`);
    }

    return await task.getExecutionHistory();
  }

  /**
   * Get task statistics
   */
  async getStatistics() {
    return await Task.getStatistics();
  }

  /**
   * Get task count by filters
   */
  async count(filters = {}) {
    let query = 'SELECT COUNT(*) as count FROM tasks WHERE 1=1';
    const values = [];
    let paramCount = 0;

    if (filters.status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      values.push(filters.status);
    }

    if (filters.priority) {
      paramCount++;
      query += ` AND priority = $${paramCount}`;
      values.push(filters.priority);
    }

    if (filters.project_id) {
      paramCount++;
      query += ` AND project_id = $${paramCount}`;
      values.push(filters.project_id);
    }

    if (filters.assigned_to) {
      paramCount++;
      query += ` AND assigned_to = $${paramCount}`;
      values.push(filters.assigned_to);
    }

    const result = await db.query(query, values);
    return parseInt(result.rows[0].count);
  }

  /**
   * Get tasks that are ready to be worked on (no blocking dependencies)
   */
  async findReadyTasks(filters = {}, pagination = {}) {
    const query = `
      SELECT t.* FROM tasks t
      WHERE t.status IN ('backlog', 'todo')
      AND NOT EXISTS (
        SELECT 1 FROM task_dependencies td
        JOIN tasks dt ON td.depends_on_task_id = dt.id
        WHERE td.task_id = t.id 
        AND dt.status NOT IN ('done', 'cancelled')
        AND td.dependency_type = 'blocks'
      )
      ORDER BY t.priority DESC, t.complexity_score ASC, t.created_at ASC
    `;

    const result = await db.query(query);
    return result.rows.map(row => new Task(row));
  }

  /**
   * Get blocked tasks (tasks with unresolved dependencies)
   */
  async findBlockedTasks(filters = {}, pagination = {}) {
    const query = `
      SELECT DISTINCT t.* FROM tasks t
      JOIN task_dependencies td ON t.id = td.task_id
      JOIN tasks dt ON td.depends_on_task_id = dt.id
      WHERE dt.status NOT IN ('done', 'cancelled')
      AND td.dependency_type = 'blocks'
      ORDER BY t.created_at ASC
    `;

    const result = await db.query(query);
    return result.rows.map(row => new Task(row));
  }

  /**
   * Get task hierarchy (task with all its subtasks)
   */
  async getTaskHierarchy(taskId) {
    const query = `
      WITH RECURSIVE task_hierarchy AS (
        SELECT t.*, 0 as level, ARRAY[t.id] as path
        FROM tasks t
        WHERE t.id = $1
        
        UNION ALL
        
        SELECT t.*, th.level + 1, th.path || t.id
        FROM tasks t
        JOIN subtasks s ON t.id = s.child_task_id
        JOIN task_hierarchy th ON s.parent_task_id = th.id
        WHERE NOT t.id = ANY(th.path) -- Prevent infinite loops
      )
      SELECT * FROM task_hierarchy ORDER BY level, created_at;
    `;

    const result = await db.query(query, [taskId]);
    return result.rows.map(row => new Task(row));
  }

  /**
   * Move task to different project
   */
  async moveToProject(taskId, projectId) {
    const query = `
      UPDATE tasks 
      SET project_id = $1, updated_at = NOW() 
      WHERE id = $2
      RETURNING *;
    `;

    const result = await db.query(query, [projectId, taskId]);
    
    if (result.rows.length === 0) {
      throw new Error(`Task with id ${taskId} not found`);
    }

    return new Task(result.rows[0]);
  }

  /**
   * Clone task (create a copy)
   */
  async clone(taskId, overrides = {}) {
    const originalTask = await this.findById(taskId);
    if (!originalTask) {
      throw new Error(`Task with id ${taskId} not found`);
    }

    const clonedData = {
      ...originalTask.toJSON(),
      id: null, // Remove ID to create new task
      title: `${originalTask.title} (Copy)`,
      status: 'backlog',
      created_at: null,
      updated_at: null,
      legacy_id: null,
      ...overrides
    };

    return await this.create(clonedData);
  }
}

export default TaskRepository;

