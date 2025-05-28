/**
 * DataManager.test.js
 * Comprehensive tests for the DataManager class
 */

import { jest } from '@jest/globals';
import { DataManager, getDataManager, resetDataManager } from '../../../scripts/modules/data/DataManager.js';

describe('DataManager', () => {
  let dataManager;

  beforeEach(() => {
    resetDataManager();
    dataManager = new DataManager({
      enableCache: true,
      enableValidation: true
    });
  });

  afterEach(() => {
    if (dataManager) {
      dataManager.destroy();
    }
    resetDataManager();
  });

  describe('Initialization', () => {
    test('should initialize with default options', () => {
      const dm = new DataManager();
      expect(dm.cache()).toBeTruthy();
      expect(dm.validation()).toBeTruthy();
      expect(dm.getRepository('json')).toBeTruthy();
      expect(dm.getRepository('tasks')).toBeTruthy();
      dm.destroy();
    });

    test('should initialize with cache disabled', () => {
      const dm = new DataManager({ enableCache: false });
      expect(dm.cache()).toBeNull();
      dm.destroy();
    });

    test('should initialize with validation disabled', () => {
      const dm = new DataManager({ enableValidation: false });
      expect(dm.validation()).toBeNull();
      dm.destroy();
    });
  });

  describe('Repository Management', () => {
    test('should get existing repositories', () => {
      const jsonRepo = dataManager.getRepository('json');
      const tasksRepo = dataManager.getRepository('tasks');
      
      expect(jsonRepo).toBeTruthy();
      expect(tasksRepo).toBeTruthy();
      expect(jsonRepo.constructor.name).toBe('JsonRepository');
      expect(tasksRepo.constructor.name).toBe('TaskRepository');
    });

    test('should return null for non-existent repository', () => {
      const repo = dataManager.getRepository('nonexistent');
      expect(repo).toBeNull();
    });

    test('should register custom repository', () => {
      const mockRepo = { name: 'custom' };
      dataManager.registerRepository('custom', mockRepo);
      
      const retrieved = dataManager.getRepository('custom');
      expect(retrieved).toBe(mockRepo);
    });

    test('should remove repository', () => {
      const mockRepo = { name: 'custom' };
      dataManager.registerRepository('custom', mockRepo);
      
      const removed = dataManager.removeRepository('custom');
      expect(removed).toBe(true);
      expect(dataManager.getRepository('custom')).toBeNull();
    });

    test('should return false when removing non-existent repository', () => {
      const removed = dataManager.removeRepository('nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('Convenience Methods', () => {
    test('should provide json() shortcut', () => {
      const jsonRepo = dataManager.json();
      expect(jsonRepo).toBe(dataManager.getRepository('json'));
    });

    test('should provide tasks() shortcut', () => {
      const tasksRepo = dataManager.tasks();
      expect(tasksRepo).toBe(dataManager.getRepository('tasks'));
    });
  });

  describe('Data Operations', () => {
    const testFilePath = '/tmp/test.json';
    const testData = { test: 'data' };

    beforeEach(() => {
      // Mock the repository methods
      jest.spyOn(dataManager.json(), 'read').mockResolvedValue(testData);
      jest.spyOn(dataManager.json(), 'write').mockResolvedValue();
    });

    test('should read JSON file', async () => {
      const result = await dataManager.readJson(testFilePath);
      expect(result).toEqual(testData);
      expect(dataManager.json().read).toHaveBeenCalledWith(testFilePath, {});
    });

    test('should write JSON file', async () => {
      await dataManager.writeJson(testFilePath, testData);
      expect(dataManager.json().write).toHaveBeenCalledWith(testFilePath, testData, {});
    });
  });

  describe('Task Operations', () => {
    const testTasksPath = '/tmp/tasks.json';
    const testTaskData = { id: 1, title: 'Test Task' };

    beforeEach(() => {
      // Mock the task repository methods
      jest.spyOn(dataManager.tasks(), 'readTasks').mockResolvedValue({ tasks: [testTaskData] });
      jest.spyOn(dataManager.tasks(), 'writeTasks').mockResolvedValue();
      jest.spyOn(dataManager.tasks(), 'getTaskById').mockResolvedValue(testTaskData);
      jest.spyOn(dataManager.tasks(), 'addTask').mockResolvedValue(testTaskData);
      jest.spyOn(dataManager.tasks(), 'updateTask').mockResolvedValue(testTaskData);
      jest.spyOn(dataManager.tasks(), 'deleteTask').mockResolvedValue(true);
    });

    test('should read tasks', async () => {
      const result = await dataManager.readTasks(testTasksPath);
      expect(result).toEqual({ tasks: [testTaskData] });
      expect(dataManager.tasks().readTasks).toHaveBeenCalledWith(testTasksPath, {});
    });

    test('should write tasks', async () => {
      const tasksData = { tasks: [testTaskData] };
      await dataManager.writeTasks(testTasksPath, tasksData);
      expect(dataManager.tasks().writeTasks).toHaveBeenCalledWith(testTasksPath, tasksData, {});
    });

    test('should get task by ID', async () => {
      const result = await dataManager.getTask(testTasksPath, 1);
      expect(result).toEqual(testTaskData);
      expect(dataManager.tasks().getTaskById).toHaveBeenCalledWith(testTasksPath, 1);
    });

    test('should add task', async () => {
      const result = await dataManager.addTask(testTasksPath, testTaskData);
      expect(result).toEqual(testTaskData);
      expect(dataManager.tasks().addTask).toHaveBeenCalledWith(testTasksPath, testTaskData);
    });

    test('should update task', async () => {
      const updates = { title: 'Updated Task' };
      const result = await dataManager.updateTask(testTasksPath, 1, updates);
      expect(result).toEqual(testTaskData);
      expect(dataManager.tasks().updateTask).toHaveBeenCalledWith(testTasksPath, 1, updates);
    });

    test('should delete task', async () => {
      const result = await dataManager.deleteTask(testTasksPath, 1);
      expect(result).toBe(true);
      expect(dataManager.tasks().deleteTask).toHaveBeenCalledWith(testTasksPath, 1);
    });
  });

  describe('Validation', () => {
    test('should validate data when validation manager is available', () => {
      const testData = { test: 'data' };
      const mockValidation = { success: true, data: testData };
      
      jest.spyOn(dataManager.validation(), 'validate').mockReturnValue(mockValidation);
      
      const result = dataManager.validate(testData, 'test-schema');
      expect(result).toEqual(mockValidation);
      expect(dataManager.validation().validate).toHaveBeenCalledWith(testData, 'test-schema');
    });

    test('should return success when validation manager is not available', () => {
      const dm = new DataManager({ enableValidation: false });
      const testData = { test: 'data' };
      
      const result = dm.validate(testData, 'test-schema');
      expect(result).toEqual({ success: true, data: testData });
      
      dm.destroy();
    });
  });

  describe('Cache Management', () => {
    test('should clear cache when cache manager is available', () => {
      jest.spyOn(dataManager.cache(), 'clear').mockImplementation();
      
      dataManager.clearCache();
      expect(dataManager.cache().clear).toHaveBeenCalled();
    });

    test('should handle clear cache when cache manager is not available', () => {
      const dm = new DataManager({ enableCache: false });
      
      // Should not throw error
      expect(() => dm.clearCache()).not.toThrow();
      
      dm.destroy();
    });
  });

  describe('Statistics', () => {
    test('should return comprehensive stats', () => {
      const mockCacheStats = { hits: 10, misses: 5 };
      const mockValidationStats = { registeredSchemas: 5 };
      
      jest.spyOn(dataManager.cache(), 'getStats').mockReturnValue(mockCacheStats);
      jest.spyOn(dataManager.validation(), 'getStats').mockReturnValue(mockValidationStats);
      
      const stats = dataManager.getStats();
      
      expect(stats.repositories).toContain('json');
      expect(stats.repositories).toContain('tasks');
      expect(stats.cacheEnabled).toBe(true);
      expect(stats.validationEnabled).toBe(true);
      expect(stats.cache).toEqual(mockCacheStats);
      expect(stats.validation).toEqual(mockValidationStats);
    });

    test('should return stats without cache and validation when disabled', () => {
      const dm = new DataManager({ enableCache: false, enableValidation: false });
      
      const stats = dm.getStats();
      
      expect(stats.cacheEnabled).toBe(false);
      expect(stats.validationEnabled).toBe(false);
      expect(stats.cache).toBeUndefined();
      expect(stats.validation).toBeUndefined();
      
      dm.destroy();
    });
  });

  describe('Health Check', () => {
    test('should return healthy status', async () => {
      const mockCacheStats = { hits: 10, misses: 5 };
      const mockValidationStats = { registeredSchemas: 5 };
      
      jest.spyOn(dataManager.cache(), 'getStats').mockReturnValue(mockCacheStats);
      jest.spyOn(dataManager.validation(), 'getStats').mockReturnValue(mockValidationStats);
      
      const health = await dataManager.healthCheck();
      
      expect(health.status).toBe('healthy');
      expect(health.components.cache.status).toBe('healthy');
      expect(health.components.validation.status).toBe('healthy');
      expect(health.components.repositories.json.status).toBe('healthy');
      expect(health.components.repositories.tasks.status).toBe('healthy');
      expect(health.timestamp).toBeTruthy();
    });

    test('should handle health check errors', async () => {
      jest.spyOn(dataManager.cache(), 'getStats').mockImplementation(() => {
        throw new Error('Cache error');
      });
      
      const health = await dataManager.healthCheck();
      
      expect(health.status).toBe('unhealthy');
      expect(health.error).toBe('Cache error');
    });
  });

  describe('Transactions', () => {
    test('should create transaction object', () => {
      const transaction = dataManager.createTransaction();
      
      expect(transaction).toHaveProperty('addOperation');
      expect(transaction).toHaveProperty('execute');
      expect(typeof transaction.addOperation).toBe('function');
      expect(typeof transaction.execute).toBe('function');
    });

    test('should execute transaction operations', async () => {
      const transaction = dataManager.createTransaction();
      const mockOperation1 = jest.fn().mockResolvedValue('result1');
      const mockOperation2 = jest.fn().mockResolvedValue('result2');
      
      transaction.addOperation(mockOperation1);
      transaction.addOperation(mockOperation2);
      
      const results = await transaction.execute();
      
      expect(results).toEqual(['result1', 'result2']);
      expect(mockOperation1).toHaveBeenCalled();
      expect(mockOperation2).toHaveBeenCalled();
    });

    test('should rollback on transaction failure', async () => {
      const transaction = dataManager.createTransaction();
      const mockOperation1 = jest.fn().mockResolvedValue('result1');
      const mockOperation2 = jest.fn().mockRejectedValue(new Error('Operation failed'));
      const mockRollback1 = jest.fn().mockResolvedValue();
      
      transaction.addOperation(mockOperation1, mockRollback1);
      transaction.addOperation(mockOperation2);
      
      await expect(transaction.execute()).rejects.toThrow('Operation failed');
      expect(mockRollback1).toHaveBeenCalled();
    });
  });

  describe('Singleton Pattern', () => {
    test('should return same instance from getDataManager', () => {
      const instance1 = getDataManager();
      const instance2 = getDataManager();
      
      expect(instance1).toBe(instance2);
    });

    test('should reset singleton instance', () => {
      const instance1 = getDataManager();
      resetDataManager();
      const instance2 = getDataManager();
      
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Cleanup', () => {
    test('should destroy and cleanup resources', () => {
      const mockCacheDestroy = jest.fn();
      jest.spyOn(dataManager.cache(), 'destroy').mockImplementation(mockCacheDestroy);
      
      dataManager.destroy();
      
      expect(mockCacheDestroy).toHaveBeenCalled();
      expect(dataManager.getRepository('json')).toBeNull();
      expect(dataManager.getRepository('tasks')).toBeNull();
    });
  });
});

