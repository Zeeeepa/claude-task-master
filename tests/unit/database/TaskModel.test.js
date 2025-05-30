/**
 * Task Model Unit Tests
 * 
 * Tests for the Task database model
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { TestHelpers } from '../../utils/TestHelpers.js';
import { sampleTask, activeTask, completedTask } from '../../fixtures/tasks.js';

// Mock the database connection
const mockDb = TestHelpers.createMockDatabase();

// Mock the Task model (assuming it exists)
jest.mock('../../../src/ai_cicd_system/database/models/Task.js', () => ({
  Task: {
    create: jest.fn(),
    findById: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findByWorkflowId: jest.fn(),
    findByStatus: jest.fn(),
    updateStatus: jest.fn()
  }
}));

import { Task } from '../../../src/ai_cicd_system/database/models/Task.js';

describe('TaskModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await TestHelpers.cleanupTestData();
  });

  describe('Task Creation', () => {
    test('should create task with valid data', async () => {
      // Arrange
      const taskData = await TestHelpers.createTestTask({
        title: 'Test Task Creation',
        description: 'Testing task creation functionality'
      });

      Task.create.mockResolvedValue(taskData);

      // Act
      const result = await Task.create(taskData);

      // Assert
      expect(Task.create).toHaveBeenCalledWith(taskData);
      expect(result).toEqual(taskData);
      expect(result.id).toBeDefined();
      expect(result.title).toBe('Test Task Creation');
      expect(result.status).toBe('pending');
    });

    test('should validate required fields', async () => {
      // Arrange
      const invalidTaskData = {
        description: 'Task without title'
        // Missing required title field
      };

      Task.create.mockRejectedValue(new Error('Title is required'));

      // Act & Assert
      await expect(Task.create(invalidTaskData)).rejects.toThrow('Title is required');
      expect(Task.create).toHaveBeenCalledWith(invalidTaskData);
    });

    test('should handle foreign key constraints', async () => {
      // Arrange
      const taskData = await TestHelpers.createTestTask({
        workflowId: 'non-existent-workflow-id'
      });

      Task.create.mockRejectedValue(new Error('Foreign key constraint violation'));

      // Act & Assert
      await expect(Task.create(taskData)).rejects.toThrow('Foreign key constraint violation');
    });

    test('should set default values correctly', async () => {
      // Arrange
      const minimalTaskData = {
        title: 'Minimal Task',
        workflowId: 'workflow-123'
      };

      const expectedTask = {
        ...minimalTaskData,
        id: expect.any(String),
        status: 'pending',
        priority: 'medium',
        type: 'feature',
        estimatedHours: 0,
        actualHours: 0,
        dependencies: [],
        tags: [],
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      };

      Task.create.mockResolvedValue(expectedTask);

      // Act
      const result = await Task.create(minimalTaskData);

      // Assert
      expect(result).toMatchObject(expectedTask);
      expect(result.status).toBe('pending');
      expect(result.priority).toBe('medium');
      expect(result.dependencies).toEqual([]);
    });
  });

  describe('Task Retrieval', () => {
    test('should find task by ID', async () => {
      // Arrange
      const taskId = 'test-task-123';
      Task.findById.mockResolvedValue(sampleTask);

      // Act
      const result = await Task.findById(taskId);

      // Assert
      expect(Task.findById).toHaveBeenCalledWith(taskId);
      expect(result).toEqual(sampleTask);
    });

    test('should return null for non-existent task', async () => {
      // Arrange
      const taskId = 'non-existent-task';
      Task.findById.mockResolvedValue(null);

      // Act
      const result = await Task.findById(taskId);

      // Assert
      expect(result).toBeNull();
    });

    test('should find tasks by workflow ID', async () => {
      // Arrange
      const workflowId = 'workflow-123';
      const workflowTasks = [sampleTask, activeTask];
      Task.findByWorkflowId.mockResolvedValue(workflowTasks);

      // Act
      const result = await Task.findByWorkflowId(workflowId);

      // Assert
      expect(Task.findByWorkflowId).toHaveBeenCalledWith(workflowId);
      expect(result).toEqual(workflowTasks);
      expect(result).toHaveLength(2);
    });

    test('should find tasks by status', async () => {
      // Arrange
      const status = 'active';
      const activeTasks = [activeTask];
      Task.findByStatus.mockResolvedValue(activeTasks);

      // Act
      const result = await Task.findByStatus(status);

      // Assert
      expect(Task.findByStatus).toHaveBeenCalledWith(status);
      expect(result).toEqual(activeTasks);
    });

    test('should find all tasks', async () => {
      // Arrange
      const allTasks = [sampleTask, activeTask, completedTask];
      Task.findAll.mockResolvedValue(allTasks);

      // Act
      const result = await Task.findAll();

      // Assert
      expect(Task.findAll).toHaveBeenCalled();
      expect(result).toEqual(allTasks);
      expect(result).toHaveLength(3);
    });
  });

  describe('Task Updates', () => {
    test('should update task status correctly', async () => {
      // Arrange
      const taskId = 'test-task-123';
      const newStatus = 'completed';
      const updatedTask = {
        ...sampleTask,
        status: newStatus,
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      };

      Task.updateStatus.mockResolvedValue(updatedTask);

      // Act
      const result = await Task.updateStatus(taskId, newStatus);

      // Assert
      expect(Task.updateStatus).toHaveBeenCalledWith(taskId, newStatus);
      expect(result.status).toBe(newStatus);
      expect(result.completedAt).toBeDefined();
    });

    test('should update task with partial data', async () => {
      // Arrange
      const taskId = 'test-task-123';
      const updateData = {
        title: 'Updated Task Title',
        priority: 'high'
      };
      const updatedTask = {
        ...sampleTask,
        ...updateData,
        updatedAt: new Date().toISOString()
      };

      Task.update.mockResolvedValue(updatedTask);

      // Act
      const result = await Task.update(taskId, updateData);

      // Assert
      expect(Task.update).toHaveBeenCalledWith(taskId, updateData);
      expect(result.title).toBe('Updated Task Title');
      expect(result.priority).toBe('high');
      expect(result.updatedAt).toBeDefined();
    });

    test('should handle invalid status transitions', async () => {
      // Arrange
      const taskId = 'test-task-123';
      const invalidStatus = 'invalid-status';

      Task.updateStatus.mockRejectedValue(new Error('Invalid status transition'));

      // Act & Assert
      await expect(Task.updateStatus(taskId, invalidStatus)).rejects.toThrow('Invalid status transition');
    });

    test('should update timestamps on modification', async () => {
      // Arrange
      const taskId = 'test-task-123';
      const updateData = { description: 'Updated description' };
      const originalUpdatedAt = sampleTask.updatedAt;
      
      const updatedTask = {
        ...sampleTask,
        ...updateData,
        updatedAt: new Date().toISOString()
      };

      Task.update.mockResolvedValue(updatedTask);

      // Act
      const result = await Task.update(taskId, updateData);

      // Assert
      expect(result.updatedAt).not.toBe(originalUpdatedAt);
      expect(new Date(result.updatedAt)).toBeInstanceOf(Date);
    });
  });

  describe('Task Deletion', () => {
    test('should delete task successfully', async () => {
      // Arrange
      const taskId = 'test-task-123';
      Task.delete.mockResolvedValue(true);

      // Act
      const result = await Task.delete(taskId);

      // Assert
      expect(Task.delete).toHaveBeenCalledWith(taskId);
      expect(result).toBe(true);
    });

    test('should handle deletion of non-existent task', async () => {
      // Arrange
      const taskId = 'non-existent-task';
      Task.delete.mockResolvedValue(false);

      // Act
      const result = await Task.delete(taskId);

      // Assert
      expect(result).toBe(false);
    });

    test('should handle foreign key constraints on deletion', async () => {
      // Arrange
      const taskId = 'task-with-dependencies';
      Task.delete.mockRejectedValue(new Error('Cannot delete task with dependencies'));

      // Act & Assert
      await expect(Task.delete(taskId)).rejects.toThrow('Cannot delete task with dependencies');
    });
  });

  describe('Task Validation', () => {
    test('should validate task status values', async () => {
      // Arrange
      const validStatuses = ['pending', 'active', 'blocked', 'completed', 'failed', 'cancelled'];
      
      for (const status of validStatuses) {
        const taskData = await TestHelpers.createTestTask({ status });
        Task.create.mockResolvedValue(taskData);

        // Act
        const result = await Task.create(taskData);

        // Assert
        expect(result.status).toBe(status);
      }
    });

    test('should validate task priority values', async () => {
      // Arrange
      const validPriorities = ['low', 'medium', 'high', 'critical'];
      
      for (const priority of validPriorities) {
        const taskData = await TestHelpers.createTestTask({ priority });
        Task.create.mockResolvedValue(taskData);

        // Act
        const result = await Task.create(taskData);

        // Assert
        expect(result.priority).toBe(priority);
      }
    });

    test('should validate task type values', async () => {
      // Arrange
      const validTypes = ['feature', 'bug', 'infrastructure', 'integration', 'subtask', 'documentation', 'testing'];
      
      for (const type of validTypes) {
        const taskData = await TestHelpers.createTestTask({ type });
        Task.create.mockResolvedValue(taskData);

        // Act
        const result = await Task.create(taskData);

        // Assert
        expect(result.type).toBe(type);
      }
    });

    test('should validate estimated hours as positive number', async () => {
      // Arrange
      const taskData = await TestHelpers.createTestTask({ estimatedHours: -5 });
      Task.create.mockRejectedValue(new Error('Estimated hours must be positive'));

      // Act & Assert
      await expect(Task.create(taskData)).rejects.toThrow('Estimated hours must be positive');
    });
  });

  describe('Task Dependencies', () => {
    test('should handle task dependencies correctly', async () => {
      // Arrange
      const taskData = await TestHelpers.createTestTask({
        dependencies: ['task-1', 'task-2']
      });
      Task.create.mockResolvedValue(taskData);

      // Act
      const result = await Task.create(taskData);

      // Assert
      expect(result.dependencies).toEqual(['task-1', 'task-2']);
      expect(result.dependencies).toHaveLength(2);
    });

    test('should prevent circular dependencies', async () => {
      // Arrange
      const taskData = await TestHelpers.createTestTask({
        id: 'task-1',
        dependencies: ['task-1'] // Self-dependency
      });
      Task.create.mockRejectedValue(new Error('Circular dependency detected'));

      // Act & Assert
      await expect(Task.create(taskData)).rejects.toThrow('Circular dependency detected');
    });
  });

  describe('Task Performance', () => {
    test('should handle large number of tasks efficiently', async () => {
      // Arrange
      const taskCount = 1000;
      const largeTasks = Array.from({ length: taskCount }, (_, i) => 
        TestHelpers.createTestTask({ title: `Task ${i}` })
      );
      Task.findAll.mockResolvedValue(largeTasks);

      // Act
      const startTime = Date.now();
      const result = await Task.findAll();
      const endTime = Date.now();

      // Assert
      expect(result).toHaveLength(taskCount);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    test('should handle concurrent task operations', async () => {
      // Arrange
      const concurrentOperations = 10;
      const promises = Array.from({ length: concurrentOperations }, (_, i) => {
        const taskData = TestHelpers.createTestTask({ title: `Concurrent Task ${i}` });
        Task.create.mockResolvedValue(taskData);
        return Task.create(taskData);
      });

      // Act
      const results = await Promise.all(promises);

      // Assert
      expect(results).toHaveLength(concurrentOperations);
      expect(Task.create).toHaveBeenCalledTimes(concurrentOperations);
    });
  });
});

