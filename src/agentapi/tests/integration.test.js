/**
 * Integration Tests for AgentAPI Middleware
 * 
 * Tests the complete AgentAPI integration functionality
 * including client, task manager, and WSL2 instance management.
 */

import { jest } from '@jest/globals';
import {
  AgentAPIClient,
  TaskManager,
  WSL2InstanceManager,
  LoadBalancer,
  StatusTracker,
  ErrorHandler,
  createAgentAPIIntegration
} from '../index.js';

describe('AgentAPI Integration Tests', () => {
  let agentApi;
  let mockPRData;

  beforeEach(() => {
    // Mock PR data for testing
    mockPRData = {
      repository: {
        full_name: 'test/repository',
        clone_url: 'https://github.com/test/repository.git'
      },
      pull_request: {
        number: 123,
        title: 'Test PR',
        head: {
          ref: 'feature-branch',
          sha: 'abc123def456'
        },
        base: {
          ref: 'main'
        },
        user: {
          login: 'testuser'
        }
      }
    };

    // Initialize AgentAPI integration with test configuration
    agentApi = createAgentAPIIntegration({
      server: {
        baseUrl: 'http://localhost:3002',
        timeout: 5000
      },
      development: {
        enableMockMode: true,
        enableTestMode: true
      },
      wsl2: {
        maxInstances: 2
      },
      taskManager: {
        maxConcurrentTasks: 5,
        taskTimeout: 10000
      }
    });
  });

  afterEach(async () => {
    if (agentApi) {
      await agentApi.shutdown();
    }
  });

  describe('AgentAPIClient', () => {
    test('should create client with correct configuration', () => {
      expect(agentApi.client).toBeInstanceOf(AgentAPIClient);
      expect(agentApi.client.baseUrl).toBe('http://localhost:3002');
    });

    test('should get client status', () => {
      const status = agentApi.client.getStatus();
      expect(status).toHaveProperty('baseUrl');
      expect(status).toHaveProperty('hasApiKey');
    });

    test('should handle PR deployment in mock mode', async () => {
      const result = await agentApi.deployPR(mockPRData);
      
      expect(result).toHaveProperty('taskId');
      expect(typeof result.taskId).toBe('string');
    });
  });

  describe('TaskManager', () => {
    test('should submit and track tasks', async () => {
      const taskData = {
        type: 'pr_deployment',
        repository: 'test/repo',
        branch: 'feature',
        prNumber: 123
      };

      const taskId = await agentApi.taskManager.submitTask(taskData);
      expect(typeof taskId).toBe('string');

      const status = agentApi.taskManager.getTaskStatus(taskId);
      expect(status).toHaveProperty('id', taskId);
      expect(status).toHaveProperty('status');
      expect(status).toHaveProperty('submittedAt');
    });

    test('should handle task cancellation', async () => {
      const taskData = {
        type: 'test_task',
        data: 'test'
      };

      const taskId = await agentApi.taskManager.submitTask(taskData);
      const cancelled = await agentApi.taskManager.cancelTask(taskId);
      
      expect(cancelled).toBe(true);
      
      const status = agentApi.taskManager.getTaskStatus(taskId);
      expect(status.status).toBe('cancelled');
    });

    test('should get task statistics', () => {
      const stats = agentApi.taskManager.getStatistics();
      
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('pending');
      expect(stats).toHaveProperty('running');
      expect(stats).toHaveProperty('completed');
      expect(stats).toHaveProperty('failed');
    });

    test('should filter tasks by status', async () => {
      // Submit multiple tasks
      await agentApi.taskManager.submitTask({ type: 'test1' });
      await agentApi.taskManager.submitTask({ type: 'test2' });
      
      const allTasks = agentApi.taskManager.getTasks();
      const pendingTasks = agentApi.taskManager.getTasks({ status: 'pending' });
      
      expect(allTasks.length).toBeGreaterThanOrEqual(2);
      expect(pendingTasks.length).toBeGreaterThanOrEqual(2);
      expect(pendingTasks.every(task => task.status === 'pending')).toBe(true);
    });
  });

  describe('WSL2InstanceManager', () => {
    test('should create instance manager with correct configuration', () => {
      expect(agentApi.wsl2Manager).toBeInstanceOf(WSL2InstanceManager);
      
      const stats = agentApi.wsl2Manager.getStatistics();
      expect(stats).toHaveProperty('maxInstances', 2);
      expect(stats).toHaveProperty('totalInstances');
      expect(stats).toHaveProperty('availableInstances');
    });

    test('should handle instance allocation in mock mode', async () => {
      const mockTask = {
        id: 'test-task-1',
        type: 'pr_deployment',
        data: mockPRData
      };

      // In mock mode, this should simulate instance allocation
      try {
        const instance = await agentApi.wsl2Manager.allocateInstance(mockTask);
        expect(instance).toHaveProperty('id');
        expect(instance).toHaveProperty('status');
      } catch (error) {
        // Expected in test environment without actual WSL2
        expect(error.message).toContain('WSL');
      }
    });
  });

  describe('LoadBalancer', () => {
    test('should create load balancer with correct algorithm', () => {
      expect(agentApi.loadBalancer).toBeInstanceOf(LoadBalancer);
      
      const config = agentApi.loadBalancer.getConfiguration();
      expect(config).toHaveProperty('algorithm');
      expect(config).toHaveProperty('healthCheckEnabled');
    });

    test('should select instance from available list', () => {
      const availableInstances = ['instance-1', 'instance-2', 'instance-3'];
      const mockInstances = availableInstances.map(id => ({
        id,
        health: 'healthy',
        resourceUsage: { cpu: 50, memory: 60 }
      }));

      const selected = agentApi.loadBalancer.selectInstance(availableInstances, mockInstances);
      expect(availableInstances).toContain(selected);
    });

    test('should track selection statistics', () => {
      const stats = agentApi.loadBalancer.getStatistics();
      
      expect(stats).toHaveProperty('algorithm');
      expect(stats).toHaveProperty('totalSelections');
      expect(stats).toHaveProperty('instanceStats');
    });
  });

  describe('StatusTracker', () => {
    test('should track task status changes', () => {
      const taskId = 'test-task-status';
      
      // Update status
      const updated = agentApi.statusTracker.updateStatus(taskId, 'running', {
        progress: 50,
        message: 'Processing'
      });
      
      expect(updated).toBe(true);
      
      // Get status
      const status = agentApi.statusTracker.getStatus(taskId);
      expect(status).toHaveProperty('taskId', taskId);
      expect(status).toHaveProperty('status', 'running');
      expect(status).toHaveProperty('metadata');
    });

    test('should validate status transitions', () => {
      const taskId = 'test-transitions';
      
      // Valid transition: pending -> running
      agentApi.statusTracker.updateStatus(taskId, 'pending');
      const validTransition = agentApi.statusTracker.updateStatus(taskId, 'running');
      expect(validTransition).toBe(true);
      
      // Invalid transition: running -> pending
      const invalidTransition = agentApi.statusTracker.updateStatus(taskId, 'pending');
      expect(invalidTransition).toBe(false);
    });

    test('should get status summary', () => {
      // Add some test statuses
      agentApi.statusTracker.updateStatus('task1', 'completed');
      agentApi.statusTracker.updateStatus('task2', 'running');
      agentApi.statusTracker.updateStatus('task3', 'failed');
      
      const summary = agentApi.statusTracker.getStatusSummary();
      
      expect(summary).toHaveProperty('total');
      expect(summary).toHaveProperty('byStatus');
      expect(summary.byStatus).toHaveProperty('completed');
      expect(summary.byStatus).toHaveProperty('running');
      expect(summary.byStatus).toHaveProperty('failed');
    });
  });

  describe('ErrorHandler', () => {
    test('should handle different error categories', async () => {
      const networkError = new Error('Connection refused');
      networkError.code = 'ECONNREFUSED';
      
      const result = await agentApi.errorHandler.handleError(networkError, {
        taskId: 'test-task',
        operation: 'deploy'
      });
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('error');
      expect(result.error).toHaveProperty('category');
    });

    test('should track error statistics', async () => {
      const error1 = new Error('Test error 1');
      const error2 = new Error('Test error 2');
      
      await agentApi.errorHandler.handleError(error1, { taskId: 'task1' });
      await agentApi.errorHandler.handleError(error2, { taskId: 'task2' });
      
      const stats = agentApi.errorHandler.getErrorStats();
      
      expect(stats).toHaveProperty('total');
      expect(stats.total).toBeGreaterThanOrEqual(2);
      expect(stats).toHaveProperty('byCategory');
      expect(stats).toHaveProperty('byCode');
    });

    test('should register and use recovery strategies', async () => {
      const mockRecovery = jest.fn().mockResolvedValue(true);
      
      agentApi.errorHandler.registerRecoveryStrategy('network', mockRecovery);
      
      const success = await agentApi.errorHandler.recover('network', mockRecovery);
      expect(success).toBe(true);
      expect(mockRecovery).toHaveBeenCalled();
    });
  });

  describe('Integration Workflow', () => {
    test('should handle complete PR deployment workflow', async () => {
      // 1. Deploy PR
      const deployResult = await agentApi.deployPR(mockPRData);
      expect(deployResult).toHaveProperty('taskId');
      
      // 2. Check initial task status
      const initialStatus = await agentApi.getTaskStatus(deployResult.taskId);
      expect(initialStatus).toHaveProperty('status');
      
      // 3. Get all tasks
      const allTasks = await agentApi.getAllTasks();
      expect(Array.isArray(allTasks)).toBe(true);
      expect(allTasks.length).toBeGreaterThan(0);
      
      // 4. Check system health
      const health = await agentApi.getHealth();
      expect(health).toHaveProperty('client');
      expect(health).toHaveProperty('taskManager');
      expect(health).toHaveProperty('wsl2Manager');
    });

    test('should handle task failure and retry', async () => {
      // Submit a task that will fail
      const taskId = await agentApi.taskManager.submitTask({
        type: 'failing_task',
        shouldFail: true
      });
      
      // Wait a bit for processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const status = agentApi.taskManager.getTaskStatus(taskId);
      expect(['pending', 'running', 'retrying', 'failed']).toContain(status.status);
    });

    test('should handle concurrent task processing', async () => {
      const tasks = [];
      
      // Submit multiple tasks concurrently
      for (let i = 0; i < 3; i++) {
        const taskPromise = agentApi.taskManager.submitTask({
          type: 'concurrent_test',
          index: i
        });
        tasks.push(taskPromise);
      }
      
      const taskIds = await Promise.all(tasks);
      expect(taskIds).toHaveLength(3);
      expect(taskIds.every(id => typeof id === 'string')).toBe(true);
      
      // Check that all tasks are tracked
      const allTasks = agentApi.taskManager.getTasks();
      const ourTasks = allTasks.filter(task => task.data?.type === 'concurrent_test');
      expect(ourTasks.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Configuration and Environment', () => {
    test('should handle different environment configurations', () => {
      const devConfig = createAgentAPIIntegration({
        development: {
          enableMockMode: true,
          verboseLogging: true
        }
      });
      
      expect(devConfig).toHaveProperty('client');
      expect(devConfig).toHaveProperty('taskManager');
      
      // Cleanup
      devConfig.shutdown();
    });

    test('should validate configuration', async () => {
      const { validateConfig } = await import('../config.js');
      
      const validConfig = {
        server: { baseUrl: 'http://localhost:3002' },
        authentication: { token: 'test-token' },
        wsl2: { maxInstances: 5, distribution: 'Ubuntu', user: 'ubuntu' },
        loadBalancer: { algorithm: 'round_robin' },
        monitoring: { logLevel: 'info' }
      };
      
      const validation = validateConfig(validConfig);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('Error Scenarios', () => {
    test('should handle invalid PR data gracefully', async () => {
      const invalidPRData = {
        repository: null,
        pull_request: null
      };
      
      await expect(agentApi.deployPR(invalidPRData)).rejects.toThrow();
    });

    test('should handle non-existent task status requests', () => {
      const status = agentApi.getTaskStatus('non-existent-task');
      expect(status).toBeNull();
    });

    test('should handle task cancellation of non-existent task', async () => {
      const cancelled = await agentApi.taskManager.cancelTask('non-existent-task');
      expect(cancelled).toBe(false);
    });
  });

  describe('Performance and Limits', () => {
    test('should respect task concurrency limits', async () => {
      const maxConcurrent = 5;
      const tasks = [];
      
      // Submit more tasks than the concurrent limit
      for (let i = 0; i < maxConcurrent + 2; i++) {
        tasks.push(agentApi.taskManager.submitTask({
          type: 'performance_test',
          index: i
        }));
      }
      
      await Promise.all(tasks);
      
      const stats = agentApi.taskManager.getStatistics();
      expect(stats.runningTasks).toBeLessThanOrEqual(maxConcurrent);
    });

    test('should handle rapid task submissions', async () => {
      const rapidTasks = [];
      
      // Submit 10 tasks rapidly
      for (let i = 0; i < 10; i++) {
        rapidTasks.push(agentApi.taskManager.submitTask({
          type: 'rapid_test',
          timestamp: Date.now(),
          index: i
        }));
      }
      
      const taskIds = await Promise.all(rapidTasks);
      expect(taskIds).toHaveLength(10);
      expect(new Set(taskIds).size).toBe(10); // All unique
    });
  });
});

describe('Component Unit Tests', () => {
  describe('LoadBalancer Algorithms', () => {
    let loadBalancer;
    
    beforeEach(() => {
      loadBalancer = new LoadBalancer();
    });

    test('should implement round robin selection', () => {
      loadBalancer.updateConfiguration({ algorithm: 'round_robin' });
      
      const instances = ['inst1', 'inst2', 'inst3'];
      const mockInstanceData = instances.map(id => ({ id, health: 'healthy' }));
      
      const selections = [];
      for (let i = 0; i < 6; i++) {
        selections.push(loadBalancer.selectInstance(instances, mockInstanceData));
      }
      
      // Should cycle through instances
      expect(selections[0]).toBe(selections[3]);
      expect(selections[1]).toBe(selections[4]);
      expect(selections[2]).toBe(selections[5]);
    });

    test('should implement least connections selection', () => {
      loadBalancer.updateConfiguration({ algorithm: 'least_connections' });
      
      const instances = ['inst1', 'inst2', 'inst3'];
      const mockInstanceData = instances.map(id => ({ id, health: 'healthy' }));
      
      // Simulate different connection counts
      loadBalancer.connectionCounts.set('inst1', 5);
      loadBalancer.connectionCounts.set('inst2', 2);
      loadBalancer.connectionCounts.set('inst3', 8);
      
      const selected = loadBalancer.selectInstance(instances, mockInstanceData);
      expect(selected).toBe('inst2'); // Least connections
    });
  });

  describe('StatusTracker Validation', () => {
    let statusTracker;
    
    beforeEach(() => {
      statusTracker = new StatusTracker();
    });

    test('should enforce valid status transitions', () => {
      const taskId = 'transition-test';
      
      // Valid transitions
      expect(statusTracker.updateStatus(taskId, 'pending')).toBe(true);
      expect(statusTracker.updateStatus(taskId, 'running')).toBe(true);
      expect(statusTracker.updateStatus(taskId, 'completed')).toBe(true);
      
      // Invalid transition from completed
      expect(statusTracker.updateStatus(taskId, 'running')).toBe(false);
    });

    test('should track status history', () => {
      const taskId = 'history-test';
      
      statusTracker.updateStatus(taskId, 'pending');
      statusTracker.updateStatus(taskId, 'running');
      statusTracker.updateStatus(taskId, 'completed');
      
      const history = statusTracker.getHistory(taskId);
      expect(history).toHaveLength(3);
      expect(history[0].status).toBe('completed'); // Newest first
      expect(history[2].status).toBe('pending');   // Oldest last
    });
  });

  describe('ErrorHandler Circuit Breaker', () => {
    let errorHandler;
    
    beforeEach(() => {
      errorHandler = new ErrorHandler({
        circuitBreakerEnabled: true,
        circuitBreakerThreshold: 3,
        circuitBreakerTimeout: 1000
      });
    });

    test('should open circuit breaker after threshold failures', async () => {
      const networkError = new Error('Network error');
      networkError.code = 'ECONNREFUSED';
      
      // Trigger failures to reach threshold
      for (let i = 0; i < 3; i++) {
        await errorHandler.handleError(networkError, { attempts: 3 }); // Max attempts reached
      }
      
      // Next error should trigger circuit breaker
      const result = await errorHandler.handleError(networkError, { attempts: 0 });
      expect(result.action).toBe('circuit_breaker_open');
    });
  });
});

