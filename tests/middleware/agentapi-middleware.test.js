/**
 * AgentAPI Middleware Integration Tests
 * 
 * Comprehensive test suite for the AgentAPI middleware integration.
 */

import { jest } from '@jest/globals';
import { AgentAPIMiddleware, AgentAPIConfig } from '../../src/middleware/index.js';

// Mock dependencies
jest.mock('eventsource');
jest.mock('axios');

describe('AgentAPIMiddleware', () => {
  let middleware;
  let config;

  beforeEach(() => {
    config = AgentAPIConfig.testing();
    middleware = new AgentAPIMiddleware(config);
  });

  afterEach(async () => {
    if (middleware.isRunning) {
      await middleware.stop();
    }
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      await expect(middleware.initialize()).resolves.not.toThrow();
      expect(middleware.isInitialized).toBe(true);
    });

    test('should not initialize twice', async () => {
      await middleware.initialize();
      await middleware.initialize(); // Should not throw
      expect(middleware.isInitialized).toBe(true);
    });

    test('should emit initialization events', async () => {
      const initializingSpy = jest.fn();
      const initializedSpy = jest.fn();
      
      middleware.on('initializing', initializingSpy);
      middleware.on('initialized', initializedSpy);
      
      await middleware.initialize();
      
      expect(initializingSpy).toHaveBeenCalled();
      expect(initializedSpy).toHaveBeenCalled();
    });
  });

  describe('Start/Stop', () => {
    test('should start successfully after initialization', async () => {
      await middleware.initialize();
      await expect(middleware.start()).resolves.not.toThrow();
      expect(middleware.isRunning).toBe(true);
    });

    test('should initialize automatically when starting', async () => {
      await expect(middleware.start()).resolves.not.toThrow();
      expect(middleware.isInitialized).toBe(true);
      expect(middleware.isRunning).toBe(true);
    });

    test('should stop successfully', async () => {
      await middleware.start();
      await expect(middleware.stop()).resolves.not.toThrow();
      expect(middleware.isRunning).toBe(false);
    });

    test('should emit start/stop events', async () => {
      const startingSpy = jest.fn();
      const startedSpy = jest.fn();
      const stoppingSpy = jest.fn();
      const stoppedSpy = jest.fn();
      
      middleware.on('starting', startingSpy);
      middleware.on('started', startedSpy);
      middleware.on('stopping', stoppingSpy);
      middleware.on('stopped', stoppedSpy);
      
      await middleware.start();
      await middleware.stop();
      
      expect(startingSpy).toHaveBeenCalled();
      expect(startedSpy).toHaveBeenCalled();
      expect(stoppingSpy).toHaveBeenCalled();
      expect(stoppedSpy).toHaveBeenCalled();
    });
  });

  describe('Task Management', () => {
    beforeEach(async () => {
      await middleware.start();
    });

    test('should add tasks to queue', () => {
      const taskData = {
        type: 'analyze',
        data: {
          repository: 'https://github.com/test/repo.git',
          analysisType: 'security'
        }
      };

      const taskId = middleware.addTask(taskData);
      expect(taskId).toBeDefined();
      expect(typeof taskId).toBe('string');
    });

    test('should get task status', () => {
      const taskData = {
        type: 'generate',
        data: {
          description: 'Create a simple function',
          language: 'javascript'
        }
      };

      const taskId = middleware.addTask(taskData);
      const status = middleware.getTaskStatus(taskId);
      
      expect(status).toBeDefined();
      expect(status.id).toBe(taskId);
      expect(status.type).toBe('generate');
    });

    test('should cancel tasks', () => {
      const taskData = {
        type: 'review',
        data: {
          files: ['src/test.js'],
          changes: 'Added new function'
        }
      };

      const taskId = middleware.addTask(taskData);
      const cancelled = middleware.cancelTask(taskId);
      
      expect(cancelled).toBe(true);
      
      const status = middleware.getTaskStatus(taskId);
      expect(status.status).toBe('cancelled');
    });
  });

  describe('Statistics and Health', () => {
    beforeEach(async () => {
      await middleware.start();
    });

    test('should provide statistics', () => {
      const stats = middleware.getStats();
      
      expect(stats).toHaveProperty('middleware');
      expect(stats).toHaveProperty('taskQueue');
      expect(stats).toHaveProperty('claudeCodeManager');
      expect(stats).toHaveProperty('eventProcessor');
      expect(stats).toHaveProperty('agentApiClient');
      
      expect(stats.middleware.isInitialized).toBe(true);
      expect(stats.middleware.isRunning).toBe(true);
    });

    test('should provide health status', () => {
      const health = middleware.getHealth();
      
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('timestamp');
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('components');
      expect(health).toHaveProperty('version');
      
      expect(health.status).toBe('healthy');
    });

    test('should perform comprehensive health check', async () => {
      const healthCheck = await middleware.performHealthCheck();
      
      expect(healthCheck).toHaveProperty('status');
      expect(healthCheck).toHaveProperty('checks');
      expect(healthCheck).toHaveProperty('overall');
      
      expect(Array.isArray(healthCheck.checks)).toBe(true);
      expect(healthCheck.checks.length).toBeGreaterThan(0);
    });
  });

  describe('Task Execution', () => {
    beforeEach(async () => {
      await middleware.start();
    });

    test('should execute analysis tasks', async () => {
      const taskData = {
        type: 'analyze',
        priority: 8,
        data: {
          repository: 'https://github.com/test/repo.git',
          branch: 'main',
          analysisType: 'security',
          options: {
            depth: 'medium',
            includeTests: true
          }
        }
      };

      const taskId = middleware.addTask(taskData);
      expect(taskId).toBeDefined();
      
      // Wait for task to be processed
      await new Promise(resolve => {
        middleware.once('taskCompleted', ({ taskId: completedTaskId, result }) => {
          expect(completedTaskId).toBe(taskId);
          expect(result).toHaveProperty('type', 'analysis');
          resolve();
        });
      });
    });

    test('should execute generation tasks', async () => {
      const taskData = {
        type: 'generate',
        priority: 7,
        data: {
          description: 'Create a REST API endpoint for user authentication',
          language: 'javascript',
          framework: 'express',
          options: {
            includeTests: true,
            includeDocumentation: true
          }
        }
      };

      const taskId = middleware.addTask(taskData);
      expect(taskId).toBeDefined();
      
      await new Promise(resolve => {
        middleware.once('taskCompleted', ({ taskId: completedTaskId, result }) => {
          expect(completedTaskId).toBe(taskId);
          expect(result).toHaveProperty('type', 'generation');
          resolve();
        });
      });
    });

    test('should execute review tasks', async () => {
      const taskData = {
        type: 'review',
        priority: 6,
        data: {
          files: ['src/auth.js', 'src/middleware/auth.js'],
          changes: 'Added JWT token validation',
          focusAreas: ['security', 'performance'],
          options: {
            severity: 'high'
          }
        }
      };

      const taskId = middleware.addTask(taskData);
      expect(taskId).toBeDefined();
      
      await new Promise(resolve => {
        middleware.once('taskCompleted', ({ taskId: completedTaskId, result }) => {
          expect(completedTaskId).toBe(taskId);
          expect(result).toHaveProperty('type', 'review');
          resolve();
        });
      });
    });

    test('should execute validation tasks', async () => {
      const taskData = {
        type: 'validate',
        priority: 5,
        data: {
          code: 'function validateEmail(email) { return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email); }',
          language: 'javascript',
          validationType: 'syntax',
          options: {
            requirements: ['Must handle edge cases', 'Should be performant']
          }
        }
      };

      const taskId = middleware.addTask(taskData);
      expect(taskId).toBeDefined();
      
      await new Promise(resolve => {
        middleware.once('taskCompleted', ({ taskId: completedTaskId, result }) => {
          expect(completedTaskId).toBe(taskId);
          expect(result).toHaveProperty('type', 'validation');
          resolve();
        });
      });
    });

    test('should execute custom tasks', async () => {
      const taskData = {
        type: 'custom',
        priority: 4,
        data: {
          instruction: 'Explain the benefits of using TypeScript over JavaScript',
          options: {
            outputFormat: 'structured'
          }
        },
        context: {
          source: 'test',
          requestId: 'test-123'
        }
      };

      const taskId = middleware.addTask(taskData);
      expect(taskId).toBeDefined();
      
      await new Promise(resolve => {
        middleware.once('taskCompleted', ({ taskId: completedTaskId, result }) => {
          expect(completedTaskId).toBe(taskId);
          expect(result).toHaveProperty('type', 'custom');
          resolve();
        });
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle initialization errors', async () => {
      const errorSpy = jest.fn();
      middleware.on('initializationError', errorSpy);
      
      // Mock a component to fail initialization
      jest.spyOn(middleware, '_setupEventHandlers').mockImplementation(() => {
        throw new Error('Setup failed');
      });
      
      await expect(middleware.initialize()).rejects.toThrow('Setup failed');
      expect(errorSpy).toHaveBeenCalled();
    });

    test('should handle task execution errors', async () => {
      await middleware.start();
      
      const taskData = {
        type: 'invalid-type',
        data: {}
      };

      const taskId = middleware.addTask(taskData);
      
      await new Promise(resolve => {
        middleware.once('taskFailed', ({ taskId: failedTaskId, error }) => {
          expect(failedTaskId).toBe(taskId);
          expect(error).toBeDefined();
          resolve();
        });
      });
    });

    test('should handle component disconnections', async () => {
      await middleware.start();
      
      const disconnectedSpy = jest.fn();
      middleware.on('agentApiDisconnected', disconnectedSpy);
      
      // Simulate disconnection
      middleware.agentApiClient.emit('disconnected');
      
      expect(disconnectedSpy).toHaveBeenCalled();
    });
  });

  describe('Configuration', () => {
    test('should accept custom configuration', () => {
      const customConfig = new AgentAPIConfig({
        agentapi: {
          baseUrl: 'http://custom:3284',
          timeout: 60000
        },
        taskQueue: {
          maxConcurrentTasks: 5
        }
      });

      const customMiddleware = new AgentAPIMiddleware(customConfig);
      
      expect(customMiddleware.config.get('agentapi.baseUrl')).toBe('http://custom:3284');
      expect(customMiddleware.config.get('agentapi.timeout')).toBe(60000);
      expect(customMiddleware.config.get('taskQueue.maxConcurrentTasks')).toBe(5);
    });

    test('should use default configuration when none provided', () => {
      const defaultMiddleware = new AgentAPIMiddleware();
      
      expect(defaultMiddleware.config).toBeInstanceOf(AgentAPIConfig);
      expect(defaultMiddleware.config.get('agentapi.baseUrl')).toBeDefined();
    });
  });

  describe('Instance Management', () => {
    beforeEach(async () => {
      await middleware.start();
    });

    test('should list Claude Code instances', () => {
      const instances = middleware.listInstances();
      expect(Array.isArray(instances)).toBe(true);
    });

    test('should track instance creation and destruction', async () => {
      const createdSpy = jest.fn();
      const stoppedSpy = jest.fn();
      
      middleware.on('instanceCreated', createdSpy);
      middleware.on('instanceStopped', stoppedSpy);
      
      // Add a task that will create an instance
      const taskData = {
        type: 'analyze',
        data: {
          repository: 'https://github.com/test/repo.git',
          analysisType: 'general'
        }
      };

      middleware.addTask(taskData);
      
      // Wait for instance events
      await new Promise(resolve => {
        middleware.once('instanceCreated', () => {
          expect(createdSpy).toHaveBeenCalled();
          resolve();
        });
      });
    });
  });

  describe('Performance', () => {
    beforeEach(async () => {
      await middleware.start();
    });

    test('should handle multiple concurrent tasks', async () => {
      const taskPromises = [];
      const taskCount = 5;
      
      for (let i = 0; i < taskCount; i++) {
        const taskData = {
          type: 'generate',
          priority: Math.floor(Math.random() * 10),
          data: {
            description: `Generate function ${i}`,
            language: 'javascript'
          }
        };
        
        const taskId = middleware.addTask(taskData);
        
        taskPromises.push(new Promise(resolve => {
          const onComplete = ({ taskId: completedTaskId }) => {
            if (completedTaskId === taskId) {
              middleware.off('taskCompleted', onComplete);
              middleware.off('taskFailed', onComplete);
              resolve();
            }
          };
          
          middleware.on('taskCompleted', onComplete);
          middleware.on('taskFailed', onComplete);
        }));
      }
      
      // Wait for all tasks to complete
      await Promise.all(taskPromises);
      
      const stats = middleware.getStats();
      expect(stats.middleware.totalTasks).toBe(taskCount);
    });

    test('should maintain performance under load', async () => {
      const startTime = Date.now();
      const taskCount = 10;
      
      // Add multiple tasks quickly
      for (let i = 0; i < taskCount; i++) {
        middleware.addTask({
          type: 'custom',
          data: {
            instruction: `Task ${i}: Simple operation`
          }
        });
      }
      
      const addTime = Date.now() - startTime;
      
      // Should be able to add tasks quickly
      expect(addTime).toBeLessThan(1000);
      
      const stats = middleware.getStats();
      expect(stats.taskQueue.queue.size).toBe(taskCount);
    });
  });
});

describe('AgentAPIMiddleware Integration', () => {
  test('should integrate with existing Linear integration', async () => {
    const config = new AgentAPIConfig({
      integrations: {
        linear: {
          enabled: true,
          apiKey: 'test-key',
          teamId: 'test-team'
        }
      }
    });

    const middleware = new AgentAPIMiddleware(config);
    await middleware.initialize();
    
    expect(middleware.config.get('integrations.linear.enabled')).toBe(true);
    
    await middleware.stop();
  });

  test('should integrate with PostgreSQL database', async () => {
    const config = new AgentAPIConfig({
      database: {
        enabled: true,
        url: 'postgresql://test:test@localhost:5432/test'
      }
    });

    const middleware = new AgentAPIMiddleware(config);
    await middleware.initialize();
    
    expect(middleware.config.get('database.enabled')).toBe(true);
    
    await middleware.stop();
  });

  test('should support webhook integration', async () => {
    const config = new AgentAPIConfig({
      integrations: {
        github: {
          enabled: true,
          token: 'test-token',
          webhookSecret: 'test-secret'
        }
      }
    });

    const middleware = new AgentAPIMiddleware(config);
    await middleware.initialize();
    
    expect(middleware.config.get('integrations.github.enabled')).toBe(true);
    
    await middleware.stop();
  });
});

