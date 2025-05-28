/**
 * AgentAPI Middleware Usage Examples
 * 
 * Demonstrates how to use the AgentAPI middleware integration in various scenarios.
 */

import { AgentAPIMiddleware, AgentAPIConfig } from '../index.js';

/**
 * Basic usage example
 */
export async function basicUsageExample() {
  console.log('🚀 Starting basic AgentAPI middleware example...');

  // Create middleware with default configuration
  const middleware = new AgentAPIMiddleware();

  try {
    // Initialize and start the middleware
    await middleware.start();
    console.log('✅ Middleware started successfully');

    // Add a simple analysis task
    const analysisTaskId = middleware.addTask({
      type: 'analyze',
      priority: 8,
      data: {
        repository: 'https://github.com/example/sample-repo.git',
        branch: 'main',
        analysisType: 'security',
        options: {
          depth: 'medium',
          includeTests: true
        }
      }
    });

    console.log(`📝 Added analysis task: ${analysisTaskId}`);

    // Add a code generation task
    const generationTaskId = middleware.addTask({
      type: 'generate',
      priority: 7,
      data: {
        description: 'Create a REST API endpoint for user authentication with JWT tokens',
        language: 'javascript',
        framework: 'express',
        options: {
          includeTests: true,
          includeDocumentation: true,
          style: 'modern'
        }
      }
    });

    console.log(`🔧 Added generation task: ${generationTaskId}`);

    // Monitor task completion
    middleware.on('taskCompleted', ({ taskId, result }) => {
      console.log(`✅ Task ${taskId} completed:`, {
        type: result.type,
        duration: result.duration,
        success: result.result.success
      });
    });

    middleware.on('taskFailed', ({ taskId, error }) => {
      console.log(`❌ Task ${taskId} failed:`, error.message);
    });

    // Wait for tasks to complete
    await new Promise(resolve => {
      let completedTasks = 0;
      middleware.on('taskCompleted', () => {
        completedTasks++;
        if (completedTasks === 2) resolve();
      });
      middleware.on('taskFailed', () => {
        completedTasks++;
        if (completedTasks === 2) resolve();
      });
    });

    // Get final statistics
    const stats = middleware.getStats();
    console.log('📊 Final statistics:', {
      totalTasks: stats.middleware.totalTasks,
      completedTasks: stats.middleware.completedTasks,
      failedTasks: stats.middleware.failedTasks,
      uptime: stats.middleware.uptime
    });

  } catch (error) {
    console.error('❌ Error in basic example:', error);
  } finally {
    await middleware.stop();
    console.log('🛑 Middleware stopped');
  }
}

/**
 * Advanced configuration example
 */
export async function advancedConfigurationExample() {
  console.log('🚀 Starting advanced configuration example...');

  // Create custom configuration
  const config = new AgentAPIConfig({
    agentapi: {
      baseUrl: 'http://localhost:3284',
      timeout: 60000,
      retryAttempts: 5,
      enableEventStream: true
    },
    claudeCode: {
      maxInstances: 3,
      instanceTimeout: 600000, // 10 minutes
      defaultTools: ['Bash(git*)', 'Edit', 'Replace', 'Search'],
      autoStart: true
    },
    taskQueue: {
      maxConcurrentTasks: 2,
      taskTimeout: 300000, // 5 minutes
      retryAttempts: 3,
      maxQueueSize: 100
    },
    eventProcessor: {
      eventBufferSize: 500,
      heartbeatInterval: 15000,
      eventFilters: ['message', 'status', 'error']
    },
    logging: {
      level: 'debug',
      enableFileLogging: true
    },
    monitoring: {
      enabled: true,
      enablePrometheus: false
    }
  });

  const middleware = new AgentAPIMiddleware(config);

  try {
    // Set up event listeners
    middleware.on('agentApiConnected', () => {
      console.log('🔗 AgentAPI connected');
    });

    middleware.on('agentApiDisconnected', () => {
      console.log('🔌 AgentAPI disconnected');
    });

    middleware.on('instanceCreated', ({ instanceId }) => {
      console.log(`🏗️ Claude Code instance created: ${instanceId}`);
    });

    middleware.on('instanceStopped', ({ instanceId }) => {
      console.log(`🛑 Claude Code instance stopped: ${instanceId}`);
    });

    middleware.on('agentMessage', (message) => {
      console.log('💬 Agent message:', message.content?.substring(0, 100) + '...');
    });

    await middleware.start();
    console.log('✅ Advanced middleware started');

    // Add multiple tasks with different priorities
    const tasks = [
      {
        type: 'review',
        priority: 10, // High priority
        data: {
          files: ['src/auth.js', 'src/middleware/auth.js'],
          changes: 'Added JWT token validation and refresh mechanism',
          focusAreas: ['security', 'performance', 'maintainability'],
          options: {
            severity: 'high',
            includeMetrics: true
          }
        }
      },
      {
        type: 'analyze',
        priority: 8,
        data: {
          repository: 'https://github.com/example/complex-app.git',
          branch: 'develop',
          files: ['src/**/*.js', 'tests/**/*.test.js'],
          analysisType: 'architecture',
          options: {
            depth: 'deep',
            includeTests: true,
            outputFormat: 'structured'
          }
        }
      },
      {
        type: 'generate',
        priority: 6,
        data: {
          description: 'Create a comprehensive user management system with CRUD operations, authentication, and role-based access control',
          language: 'typescript',
          framework: 'nestjs',
          options: {
            includeTests: true,
            includeDocumentation: true,
            includeValidation: true,
            style: 'enterprise'
          }
        }
      },
      {
        type: 'validate',
        priority: 4,
        data: {
          code: `
            class UserService {
              async createUser(userData) {
                const user = new User(userData);
                await user.save();
                return user;
              }
            }
          `,
          language: 'javascript',
          validationType: 'comprehensive',
          options: {
            requirements: [
              'Must handle validation errors',
              'Should use proper error handling',
              'Must be testable',
              'Should follow SOLID principles'
            ]
          }
        }
      }
    ];

    const taskIds = tasks.map(task => middleware.addTask(task));
    console.log(`📝 Added ${taskIds.length} tasks to queue`);

    // Monitor progress
    let completedCount = 0;
    const progressInterval = setInterval(() => {
      const stats = middleware.getStats();
      console.log(`📈 Progress: ${stats.middleware.completedTasks + stats.middleware.failedTasks}/${stats.middleware.totalTasks} tasks processed`);
    }, 5000);

    // Wait for all tasks to complete
    await new Promise(resolve => {
      middleware.on('taskCompleted', () => {
        completedCount++;
        if (completedCount === tasks.length) {
          clearInterval(progressInterval);
          resolve();
        }
      });

      middleware.on('taskFailed', () => {
        completedCount++;
        if (completedCount === tasks.length) {
          clearInterval(progressInterval);
          resolve();
        }
      });
    });

    // Perform health check
    const healthCheck = await middleware.performHealthCheck();
    console.log('🏥 Health check:', {
      overall: healthCheck.overall,
      components: healthCheck.components,
      checks: healthCheck.checks.map(c => ({ name: c.name, status: c.status }))
    });

    // Get detailed statistics
    const finalStats = middleware.getStats();
    console.log('📊 Detailed statistics:', {
      middleware: {
        uptime: finalStats.middleware.uptime,
        totalTasks: finalStats.middleware.totalTasks,
        completedTasks: finalStats.middleware.completedTasks,
        failedTasks: finalStats.middleware.failedTasks
      },
      taskQueue: {
        queueSize: finalStats.taskQueue.queue.size,
        activeTasks: finalStats.taskQueue.active.count,
        successRate: finalStats.taskQueue.completed.successRate
      },
      claudeCode: {
        totalInstances: finalStats.claudeCodeManager.totalInstances,
        activeJobs: finalStats.claudeCodeManager.activeJobs
      }
    });

  } catch (error) {
    console.error('❌ Error in advanced example:', error);
  } finally {
    await middleware.stop();
    console.log('🛑 Advanced middleware stopped');
  }
}

/**
 * Real-time monitoring example
 */
export async function realTimeMonitoringExample() {
  console.log('🚀 Starting real-time monitoring example...');

  const middleware = new AgentAPIMiddleware();

  try {
    // Set up comprehensive event monitoring
    middleware.on('taskStarted', ({ taskId, task }) => {
      console.log(`🏁 Task started: ${taskId} (${task.type})`);
    });

    middleware.on('taskCompleted', ({ taskId, result }) => {
      console.log(`✅ Task completed: ${taskId} in ${result.duration}ms`);
    });

    middleware.on('taskFailed', ({ taskId, error }) => {
      console.log(`❌ Task failed: ${taskId} - ${error.message}`);
    });

    middleware.on('instanceCreated', ({ instanceId }) => {
      console.log(`🏗️ Instance created: ${instanceId}`);
    });

    middleware.on('instanceReady', ({ instanceId }) => {
      console.log(`✅ Instance ready: ${instanceId}`);
    });

    middleware.on('instanceTimeout', ({ instanceId, timeSinceLastActivity }) => {
      console.log(`⏰ Instance timeout: ${instanceId} (${timeSinceLastActivity}ms inactive)`);
    });

    middleware.on('agentMessage', (message) => {
      console.log(`💬 Agent: ${message.content?.substring(0, 50)}...`);
    });

    middleware.on('agentStatusChanged', (status) => {
      console.log(`📊 Agent status: ${status.status}`);
    });

    await middleware.start();
    console.log('✅ Monitoring middleware started');

    // Add tasks continuously
    const taskTypes = ['analyze', 'generate', 'review', 'validate'];
    let taskCounter = 0;

    const addTaskInterval = setInterval(() => {
      if (taskCounter >= 10) {
        clearInterval(addTaskInterval);
        return;
      }

      const taskType = taskTypes[taskCounter % taskTypes.length];
      const taskId = middleware.addTask({
        type: taskType,
        priority: Math.floor(Math.random() * 10) + 1,
        data: {
          description: `Monitoring task ${taskCounter + 1}`,
          language: 'javascript'
        }
      });

      console.log(`📝 Added task ${taskCounter + 1}: ${taskId} (${taskType})`);
      taskCounter++;
    }, 2000);

    // Monitor statistics in real-time
    const statsInterval = setInterval(() => {
      const stats = middleware.getStats();
      console.log(`📈 Stats: Queue=${stats.taskQueue.queue.size}, Active=${stats.taskQueue.active.count}, Completed=${stats.middleware.completedTasks}, Failed=${stats.middleware.failedTasks}`);
    }, 3000);

    // Wait for all tasks to complete
    await new Promise(resolve => {
      const checkCompletion = () => {
        const stats = middleware.getStats();
        if (stats.middleware.totalTasks >= 10 && 
            stats.middleware.completedTasks + stats.middleware.failedTasks >= 10) {
          clearInterval(statsInterval);
          resolve();
        } else {
          setTimeout(checkCompletion, 1000);
        }
      };
      checkCompletion();
    });

    console.log('🏁 All monitoring tasks completed');

  } catch (error) {
    console.error('❌ Error in monitoring example:', error);
  } finally {
    await middleware.stop();
    console.log('🛑 Monitoring middleware stopped');
  }
}

/**
 * Error handling and recovery example
 */
export async function errorHandlingExample() {
  console.log('🚀 Starting error handling example...');

  const middleware = new AgentAPIMiddleware();

  try {
    // Set up error event listeners
    middleware.on('initializationError', (error) => {
      console.log('❌ Initialization error:', error.message);
    });

    middleware.on('taskFailed', ({ taskId, error }) => {
      console.log(`❌ Task ${taskId} failed: ${error.message}`);
    });

    middleware.on('instanceError', ({ instanceId, error }) => {
      console.log(`❌ Instance ${instanceId} error: ${error.message}`);
    });

    middleware.on('agentApiDisconnected', () => {
      console.log('🔌 AgentAPI disconnected - attempting recovery...');
    });

    middleware.on('agentApiConnected', () => {
      console.log('🔗 AgentAPI reconnected successfully');
    });

    await middleware.start();
    console.log('✅ Error handling middleware started');

    // Add tasks that might fail
    const problematicTasks = [
      {
        type: 'analyze',
        data: {
          repository: 'https://github.com/nonexistent/repo.git', // Invalid repo
          analysisType: 'security'
        }
      },
      {
        type: 'generate',
        data: {
          description: '', // Empty description
          language: 'invalid-language'
        }
      },
      {
        type: 'validate',
        data: {
          code: 'invalid syntax code {{{',
          language: 'javascript',
          validationType: 'syntax'
        }
      },
      {
        type: 'custom',
        data: {
          instruction: 'x'.repeat(20000) // Very long instruction
        }
      }
    ];

    const taskIds = problematicTasks.map(task => middleware.addTask(task));
    console.log(`📝 Added ${taskIds.length} potentially problematic tasks`);

    // Wait for tasks to complete or fail
    await new Promise(resolve => {
      let processedCount = 0;
      const onTaskProcessed = () => {
        processedCount++;
        if (processedCount === problematicTasks.length) {
          resolve();
        }
      };

      middleware.on('taskCompleted', onTaskProcessed);
      middleware.on('taskFailed', onTaskProcessed);
    });

    // Check final statistics
    const stats = middleware.getStats();
    console.log('📊 Error handling results:', {
      totalTasks: stats.middleware.totalTasks,
      completedTasks: stats.middleware.completedTasks,
      failedTasks: stats.middleware.failedTasks,
      successRate: stats.taskQueue.completed.successRate
    });

    // Perform health check after errors
    const healthCheck = await middleware.performHealthCheck();
    console.log('🏥 Post-error health check:', {
      overall: healthCheck.overall,
      status: healthCheck.status
    });

  } catch (error) {
    console.error('❌ Error in error handling example:', error);
  } finally {
    await middleware.stop();
    console.log('🛑 Error handling middleware stopped');
  }
}

/**
 * Run all examples
 */
export async function runAllExamples() {
  console.log('🎯 Running all AgentAPI middleware examples...\n');

  try {
    await basicUsageExample();
    console.log('\n' + '='.repeat(50) + '\n');

    await advancedConfigurationExample();
    console.log('\n' + '='.repeat(50) + '\n');

    await realTimeMonitoringExample();
    console.log('\n' + '='.repeat(50) + '\n');

    await errorHandlingExample();
    console.log('\n' + '='.repeat(50) + '\n');

    console.log('🎉 All examples completed successfully!');

  } catch (error) {
    console.error('❌ Error running examples:', error);
  }
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples().catch(console.error);
}

