/**
 * @fileoverview Task Model Tests
 * @description Comprehensive tests for Task model CRUD operations and validation
 */

import { jest } from '@jest/globals';
import { Task } from '../../../src/database/models/task.js';

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234')
}));

describe('Task Model', () => {
  let mockConnectionManager;

  beforeEach(() => {
    mockConnectionManager = {
      executeQuery: jest.fn()
    };
  });

  describe('Constructor', () => {
    it('should create task with default values', () => {
      const task = new Task();
      
      expect(task.id).toBe('mock-uuid-1234');
      expect(task.title).toBe('');
      expect(task.description).toBeNull();
      expect(task.requirements).toEqual({});
      expect(task.status).toBe('pending');
      expect(task.priority).toBe(0);
      expect(task.created_by).toBeNull();
      expect(task.assigned_to).toBeNull();
      expect(task.parent_task_id).toBeNull();
      expect(task.created_at).toBeInstanceOf(Date);
      expect(task.updated_at).toBeInstanceOf(Date);
    });

    it('should create task with provided data', () => {
      const taskData = {
        id: 'custom-id',
        title: 'Test Task',
        description: 'Test Description',
        requirements: { feature: 'test' },
        status: 'in_progress',
        priority: 5,
        created_by: 'user1',
        assigned_to: 'user2',
        parent_task_id: 'parent-id'
      };
      
      const task = new Task(taskData);
      
      expect(task.id).toBe('custom-id');
      expect(task.title).toBe('Test Task');
      expect(task.description).toBe('Test Description');
      expect(task.requirements).toEqual({ feature: 'test' });
      expect(task.status).toBe('in_progress');
      expect(task.priority).toBe(5);
      expect(task.created_by).toBe('user1');
      expect(task.assigned_to).toBe('user2');
      expect(task.parent_task_id).toBe('parent-id');
    });
  });

  describe('validate()', () => {
    it('should validate valid task', () => {
      const task = new Task({
        title: 'Valid Task',
        status: 'pending',
        priority: 5
      });
      
      const validation = task.validate();
      
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should require title', () => {
      const task = new Task({ title: '' });
      
      const validation = task.validate();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Title is required');
    });

    it('should validate title length', () => {
      const task = new Task({ title: 'a'.repeat(256) });
      
      const validation = task.validate();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Title must be 255 characters or less');
    });

    it('should validate status', () => {
      const task = new Task({ 
        title: 'Test',
        status: 'invalid_status' 
      });
      
      const validation = task.validate();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Status must be one of: pending, in_progress, completed, failed, cancelled');
    });

    it('should validate priority range', () => {
      const task1 = new Task({ 
        title: 'Test',
        priority: -1 
      });
      const task2 = new Task({ 
        title: 'Test',
        priority: 11 
      });
      
      expect(task1.validate().valid).toBe(false);
      expect(task1.validate().errors).toContain('Priority must be between 0 and 10');
      expect(task2.validate().valid).toBe(false);
      expect(task2.validate().errors).toContain('Priority must be between 0 and 10');
    });

    it('should validate requirements format', () => {
      const task = new Task({ 
        title: 'Test',
        requirements: 'invalid' 
      });
      
      const validation = task.validate();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Requirements must be a valid JSON object');
    });

    it('should prevent self-referencing parent', () => {
      const task = new Task({ 
        id: 'task-1',
        title: 'Test',
        parent_task_id: 'task-1' 
      });
      
      const validation = task.validate();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Task cannot be its own parent');
    });
  });

  describe('toDatabase()', () => {
    it('should convert task to database format', () => {
      const task = new Task({
        id: 'task-1',
        title: 'Test Task',
        description: 'Test Description',
        requirements: { feature: 'test' },
        status: 'pending',
        priority: 5,
        created_by: 'user1',
        assigned_to: 'user2',
        parent_task_id: 'parent-1'
      });
      
      const dbFormat = task.toDatabase();
      
      expect(dbFormat.id).toBe('task-1');
      expect(dbFormat.title).toBe('Test Task');
      expect(dbFormat.description).toBe('Test Description');
      expect(dbFormat.requirements).toBe('{"feature":"test"}');
      expect(dbFormat.status).toBe('pending');
      expect(dbFormat.priority).toBe(5);
      expect(dbFormat.created_by).toBe('user1');
      expect(dbFormat.assigned_to).toBe('user2');
      expect(dbFormat.parent_task_id).toBe('parent-1');
    });
  });

  describe('fromDatabase()', () => {
    it('should create task from database row', () => {
      const row = {
        id: 'task-1',
        title: 'Test Task',
        description: 'Test Description',
        requirements: '{"feature":"test"}',
        status: 'pending',
        priority: 5,
        created_by: 'user1',
        assigned_to: 'user2',
        parent_task_id: 'parent-1',
        created_at: new Date('2023-01-01'),
        updated_at: new Date('2023-01-02')
      };
      
      const task = Task.fromDatabase(row);
      
      expect(task.id).toBe('task-1');
      expect(task.title).toBe('Test Task');
      expect(task.description).toBe('Test Description');
      expect(task.requirements).toEqual({ feature: 'test' });
      expect(task.status).toBe('pending');
      expect(task.priority).toBe(5);
      expect(task.created_by).toBe('user1');
      expect(task.assigned_to).toBe('user2');
      expect(task.parent_task_id).toBe('parent-1');
      expect(task.created_at).toEqual(new Date('2023-01-01'));
      expect(task.updated_at).toEqual(new Date('2023-01-02'));
    });

    it('should handle JSONB requirements', () => {
      const row = {
        id: 'task-1',
        title: 'Test Task',
        requirements: { feature: 'test' }, // Already parsed JSONB
        status: 'pending',
        priority: 0,
        created_at: new Date(),
        updated_at: new Date()
      };
      
      const task = Task.fromDatabase(row);
      
      expect(task.requirements).toEqual({ feature: 'test' });
    });
  });

  describe('create()', () => {
    it('should create task successfully', async () => {
      const taskData = {
        title: 'New Task',
        description: 'New Description',
        status: 'pending',
        priority: 3
      };
      
      const mockResult = {
        rows: [{
          id: 'mock-uuid-1234',
          title: 'New Task',
          description: 'New Description',
          requirements: '{}',
          status: 'pending',
          priority: 3,
          created_by: null,
          assigned_to: null,
          parent_task_id: null,
          created_at: new Date(),
          updated_at: new Date()
        }]
      };
      
      mockConnectionManager.executeQuery.mockResolvedValue(mockResult);
      
      const task = await Task.create(mockConnectionManager, taskData);
      
      expect(mockConnectionManager.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tasks'),
        expect.arrayContaining(['mock-uuid-1234', 'New Task', 'New Description'])
      );
      expect(task).toBeInstanceOf(Task);
      expect(task.title).toBe('New Task');
    });

    it('should throw error for invalid task', async () => {
      const taskData = { title: '' }; // Invalid task
      
      await expect(Task.create(mockConnectionManager, taskData))
        .rejects.toThrow('Task validation failed: Title is required');
      
      expect(mockConnectionManager.executeQuery).not.toHaveBeenCalled();
    });
  });

  describe('findById()', () => {
    it('should find task by ID', async () => {
      const mockResult = {
        rows: [{
          id: 'task-1',
          title: 'Found Task',
          description: null,
          requirements: '{}',
          status: 'pending',
          priority: 0,
          created_by: null,
          assigned_to: null,
          parent_task_id: null,
          created_at: new Date(),
          updated_at: new Date()
        }]
      };
      
      mockConnectionManager.executeQuery.mockResolvedValue(mockResult);
      
      const task = await Task.findById(mockConnectionManager, 'task-1');
      
      expect(mockConnectionManager.executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM tasks WHERE id = $1',
        ['task-1']
      );
      expect(task).toBeInstanceOf(Task);
      expect(task.id).toBe('task-1');
      expect(task.title).toBe('Found Task');
    });

    it('should return null when task not found', async () => {
      mockConnectionManager.executeQuery.mockResolvedValue({ rows: [] });
      
      const task = await Task.findById(mockConnectionManager, 'nonexistent');
      
      expect(task).toBeNull();
    });
  });

  describe('findBy()', () => {
    it('should find tasks by criteria', async () => {
      const mockResult = {
        rows: [
          {
            id: 'task-1',
            title: 'Task 1',
            status: 'pending',
            assigned_to: 'user1',
            priority: 5,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            id: 'task-2',
            title: 'Task 2',
            status: 'pending',
            assigned_to: 'user1',
            priority: 3,
            created_at: new Date(),
            updated_at: new Date()
          }
        ]
      };
      
      mockConnectionManager.executeQuery.mockResolvedValue(mockResult);
      
      const tasks = await Task.findBy(mockConnectionManager, {
        status: 'pending',
        assigned_to: 'user1'
      });
      
      expect(mockConnectionManager.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE 1=1 AND status = $1 AND assigned_to = $2'),
        ['pending', 'user1']
      );
      expect(tasks).toHaveLength(2);
      expect(tasks[0]).toBeInstanceOf(Task);
      expect(tasks[1]).toBeInstanceOf(Task);
    });

    it('should apply pagination and ordering', async () => {
      mockConnectionManager.executeQuery.mockResolvedValue({ rows: [] });
      
      await Task.findBy(mockConnectionManager, {}, {
        limit: 10,
        offset: 20,
        orderBy: 'priority DESC'
      });
      
      expect(mockConnectionManager.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY priority DESC LIMIT $1 OFFSET $2'),
        [10, 20]
      );
    });
  });

  describe('update()', () => {
    it('should update task successfully', async () => {
      const task = new Task({
        id: 'task-1',
        title: 'Updated Task',
        status: 'in_progress',
        priority: 7
      });
      
      const mockResult = {
        rows: [{
          id: 'task-1',
          title: 'Updated Task',
          description: null,
          requirements: '{}',
          status: 'in_progress',
          priority: 7,
          created_by: null,
          assigned_to: null,
          parent_task_id: null,
          created_at: new Date(),
          updated_at: new Date()
        }]
      };
      
      mockConnectionManager.executeQuery.mockResolvedValue(mockResult);
      
      const updatedTask = await task.update(mockConnectionManager);
      
      expect(mockConnectionManager.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tasks SET'),
        expect.arrayContaining(['task-1', 'Updated Task'])
      );
      expect(updatedTask).toBeInstanceOf(Task);
      expect(updatedTask.title).toBe('Updated Task');
    });

    it('should throw error for invalid task', async () => {
      const task = new Task({
        id: 'task-1',
        title: '', // Invalid
        status: 'pending'
      });
      
      await expect(task.update(mockConnectionManager))
        .rejects.toThrow('Task validation failed: Title is required');
    });

    it('should throw error when task not found', async () => {
      const task = new Task({
        id: 'nonexistent',
        title: 'Valid Task'
      });
      
      mockConnectionManager.executeQuery.mockResolvedValue({ rows: [] });
      
      await expect(task.update(mockConnectionManager))
        .rejects.toThrow('Task with ID nonexistent not found');
    });
  });

  describe('delete()', () => {
    it('should delete task successfully', async () => {
      const task = new Task({ id: 'task-1' });
      
      mockConnectionManager.executeQuery.mockResolvedValue({ rowCount: 1 });
      
      const result = await task.delete(mockConnectionManager);
      
      expect(mockConnectionManager.executeQuery).toHaveBeenCalledWith(
        'DELETE FROM tasks WHERE id = $1',
        ['task-1']
      );
      expect(result).toBe(true);
    });

    it('should return false when task not found', async () => {
      const task = new Task({ id: 'nonexistent' });
      
      mockConnectionManager.executeQuery.mockResolvedValue({ rowCount: 0 });
      
      const result = await task.delete(mockConnectionManager);
      
      expect(result).toBe(false);
    });
  });

  describe('getStatistics()', () => {
    it('should return task statistics', async () => {
      const mockResult = {
        rows: [
          { status: 'pending', count: '5', avg_priority: '3.2' },
          { status: 'in_progress', count: '3', avg_priority: '5.0' },
          { status: 'completed', count: '10', avg_priority: '4.1' }
        ]
      };
      
      mockConnectionManager.executeQuery.mockResolvedValue(mockResult);
      
      const stats = await Task.getStatistics(mockConnectionManager);
      
      expect(stats.total).toBe(18);
      expect(stats.by_status.pending).toBe(5);
      expect(stats.by_status.in_progress).toBe(3);
      expect(stats.by_status.completed).toBe(10);
      expect(stats.avg_priority_by_status.pending).toBe(3.2);
      expect(stats.avg_priority_by_status.in_progress).toBe(5.0);
      expect(stats.avg_priority_by_status.completed).toBe(4.1);
    });
  });

  describe('updateStatus()', () => {
    it('should update task status', async () => {
      const task = new Task({
        id: 'task-1',
        title: 'Test Task',
        status: 'pending'
      });
      
      const mockResult = {
        rows: [{
          id: 'task-1',
          title: 'Test Task',
          status: 'in_progress',
          updated_at: new Date(),
          // ... other fields
        }]
      };
      
      mockConnectionManager.executeQuery.mockResolvedValue(mockResult);
      
      const updatedTask = await task.updateStatus(mockConnectionManager, 'in_progress');
      
      expect(task.status).toBe('in_progress');
      expect(updatedTask).toBeInstanceOf(Task);
    });

    it('should throw error for invalid status', async () => {
      const task = new Task({
        id: 'task-1',
        title: 'Test Task'
      });
      
      await expect(task.updateStatus(mockConnectionManager, 'invalid_status'))
        .rejects.toThrow('Invalid status: invalid_status');
    });
  });
});

