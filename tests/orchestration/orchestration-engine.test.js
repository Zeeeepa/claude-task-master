/**
 * Orchestration Engine Tests
 * Comprehensive test suite for the task orchestration engine
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { OrchestrationEngine } from '../../src/orchestration/index.js';
import { TaskNLP } from '../../src/nlp/task-nlp.js';
import { WorkflowStateMachine } from '../../src/workflow/state-machine.js';
import { DependencyResolver } from '../../src/workflow/dependency-resolver.js';
import { ErrorRecoveryManager } from '../../src/workflow/error-recovery.js';

// Mock external dependencies
jest.mock('../../src/database/database-manager.js');
jest.mock('../../src/integrations/agent-coordinator.js');

describe('OrchestrationEngine', () => {
  let engine;
  let mockOptions;

  beforeEach(() => {
    mockOptions = {
      database: {
        host: 'localhost',
        port: 5432,
        database: 'test_db'
      },
      nlp: {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022'
      },
      orchestrator: {
        maxConcurrentWorkflows: 5,
        enableNLP: true,
        enableAgentCoordination: true
      }
    };

    engine = new OrchestrationEngine(mockOptions);
  });

  afterEach(async () => {
    if (engine && engine.initialized) {
      await engine.shutdown();
    }
  });

  describe('Initialization', () => {
    test('should initialize successfully with valid configuration', async () => {
      const result = await engine.initialize();
      
      expect(result).toBe(true);
      expect(engine.initialized).toBe(true);
      expect(engine.stateManager).toBeDefined();
    });

    test('should handle initialization failure gracefully', async () => {
      // Mock initialization failure
      const invalidEngine = new OrchestrationEngine({
        database: { host: 'invalid-host' }
      });

      await expect(invalidEngine.initialize()).rejects.toThrow();
    });

    test('should validate configuration options', () => {
      expect(() => new OrchestrationEngine({})).not.toThrow();
      expect(() => new OrchestrationEngine(null)).toThrow();
    });
  });

  describe('Task Processing', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    test('should process single task successfully', async () => {
      const taskId = 'test_task_1';
      const options = { priority: 'high', enableNLP: true };

      const result = await engine.processTask(taskId, options);

      expect(result).toHaveProperty('workflowId');
      expect(result).toHaveProperty('status');
      expect(result.status).toBe('processing');
    });

    test('should handle task processing errors', async () => {
      const invalidTaskId = 'non_existent_task';

      await expect(engine.processTask(invalidTaskId)).rejects.toThrow();
    });

    test('should process batch of tasks', async () => {
      const taskIds = ['task_1', 'task_2', 'task_3'];
      const options = { priority: 'medium' };

      const result = await engine.processBatch(taskIds, options);

      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('results');
      expect(result.total).toBe(taskIds.length);
    });

    test('should handle empty batch gracefully', async () => {
      const result = await engine.processBatch([]);
      
      expect(result.total).toBe(0);
      expect(result.results).toEqual([]);
    });
  });

  describe('Workflow Management', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    test('should get workflow status', async () => {
      // First create a workflow
      const taskResult = await engine.processTask('test_task');
      const workflowId = taskResult.workflowId;

      const status = await engine.getWorkflowStatus(workflowId);

      expect(status).toBeDefined();
      expect(status).toHaveProperty('id');
      expect(status).toHaveProperty('status');
    });

    test('should handle non-existent workflow', async () => {
      const status = await engine.getWorkflowStatus('non_existent_workflow');
      
      expect(status).toBeNull();
    });

    test('should cancel workflow', async () => {
      const taskResult = await engine.processTask('test_task');
      const workflowId = taskResult.workflowId;

      const cancelled = await engine.cancelWorkflow(workflowId);

      expect(cancelled).toBe(true);
    });
  });

  describe('Metrics and Status', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    test('should return engine metrics', () => {
      const metrics = engine.getMetrics();

      expect(metrics).toHaveProperty('workflows');
      expect(metrics).toHaveProperty('tasks');
      expect(metrics).toHaveProperty('agents');
      expect(metrics).toHaveProperty('system');
    });

    test('should return engine status', () => {
      const status = engine.getStatus();

      expect(status).toHaveProperty('initialized');
      expect(status).toHaveProperty('orchestrator');
      expect(status).toHaveProperty('workflows');
      expect(status.initialized).toBe(true);
    });

    test('should perform health check', async () => {
      const health = await engine.healthCheck();

      expect(health).toHaveProperty('overall');
      expect(health).toHaveProperty('components');
      expect(health).toHaveProperty('timestamp');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.overall);
    });
  });

  describe('Configuration Export', () => {
    test('should export configuration with redacted secrets', () => {
      const config = engine.exportConfiguration();

      expect(config).toHaveProperty('database');
      expect(config).toHaveProperty('nlp');
      expect(config).toHaveProperty('orchestrator');
      
      // Ensure sensitive data is redacted
      expect(config.database.password).toBe('[REDACTED]');
      expect(config.agentapi?.apiKey).toBe('[REDACTED]');
    });
  });
});

describe('TaskNLP', () => {
  let nlp;

  beforeEach(() => {
    nlp = new TaskNLP({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      enableCaching: false // Disable caching for tests
    });
  });

  describe('Requirement Parsing', () => {
    test('should parse simple requirements', async () => {
      const description = 'Create a REST API for user management';
      
      const result = await nlp.parseRequirements(description);

      expect(result).toHaveProperty('actionableItems');
      expect(result).toHaveProperty('dependencies');
      expect(result).toHaveProperty('metadata');
      expect(Array.isArray(result.actionableItems)).toBe(true);
    });

    test('should handle complex requirements', async () => {
      const description = `
        Create a user authentication system with:
        1. User registration with email validation
        2. JWT-based login system
        3. Password reset functionality
        4. Role-based access control
      `;

      const result = await nlp.parseRequirements(description);

      expect(result.actionableItems.length).toBeGreaterThan(1);
      expect(result.metadata).toHaveProperty('complexity');
    });

    test('should extract task metadata', () => {
      const description = 'Implement a complex microservices architecture with Docker';
      
      const metadata = nlp.extractTaskMetadata(description);

      expect(metadata).toHaveProperty('type');
      expect(metadata).toHaveProperty('complexity');
      expect(metadata).toHaveProperty('technologies');
      expect(metadata.complexity).toBe('high');
      expect(metadata.technologies).toContain('docker');
    });
  });

  describe('Task Decomposition', () => {
    test('should decompose complex tasks', async () => {
      const actionableItems = [
        {
          id: 'complex_task',
          title: 'Build Full-Stack Application',
          description: 'Create a complete web application with frontend and backend',
          type: 'implementation'
        }
      ];

      const result = await nlp.decomposeTask(actionableItems, {});

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(actionableItems.length);
    });
  });

  describe('Dependency Identification', () => {
    test('should identify task dependencies', async () => {
      const tasks = [
        { id: 'database', title: 'Setup database' },
        { id: 'api', title: 'Create API that uses database' },
        { id: 'frontend', title: 'Build frontend that calls API' }
      ];

      const dependencies = await nlp.identifyDependencies(tasks);

      expect(Array.isArray(dependencies)).toBe(true);
    });
  });

  describe('Instruction Generation', () => {
    test('should generate agent instructions', async () => {
      const task = {
        id: 'test_task',
        title: 'Create REST API',
        description: 'Build a REST API for user management',
        type: 'implementation'
      };

      const instructions = await nlp.generateInstructions(task);

      expect(instructions).toHaveProperty('instructions');
      expect(instructions).toHaveProperty('setup');
      expect(instructions).toHaveProperty('implementation');
      expect(instructions).toHaveProperty('testing');
    });
  });

  describe('Completion Validation', () => {
    test('should validate task completion', async () => {
      const task = {
        id: 'test_task',
        title: 'Create API endpoint',
        acceptanceCriteria: ['Endpoint returns 200', 'Data is validated']
      };

      const result = {
        success: true,
        prUrl: 'https://github.com/test/repo/pull/123',
        testsPass: true
      };

      const validation = await nlp.validateCompletion(task, result);

      expect(validation).toHaveProperty('valid');
      expect(validation).toHaveProperty('confidence');
      expect(typeof validation.valid).toBe('boolean');
      expect(typeof validation.confidence).toBe('number');
    });
  });
});

describe('WorkflowStateMachine', () => {
  let stateMachine;
  let mockWorkflow;

  beforeEach(() => {
    stateMachine = new WorkflowStateMachine();
    mockWorkflow = {
      id: 'test_workflow_123',
      taskId: 'test_task',
      currentState: 'pending'
    };
  });

  afterEach(() => {
    stateMachine.shutdown();
  });

  describe('Workflow Initialization', () => {
    test('should initialize workflow', async () => {
      const workflow = await stateMachine.initialize(mockWorkflow);

      expect(workflow.currentState).toBe('pending');
      expect(workflow.stateHistory).toBeDefined();
      expect(workflow.stateHistory.length).toBe(1);
    });

    test('should require workflow ID', async () => {
      const invalidWorkflow = { taskId: 'test' };

      await expect(stateMachine.initialize(invalidWorkflow)).rejects.toThrow();
    });
  });

  describe('State Transitions', () => {
    beforeEach(async () => {
      await stateMachine.initialize(mockWorkflow);
    });

    test('should allow valid transitions', async () => {
      await stateMachine.transition(mockWorkflow, 'processing');

      expect(mockWorkflow.currentState).toBe('processing');
      expect(mockWorkflow.stateHistory.length).toBe(2);
    });

    test('should reject invalid transitions', async () => {
      await expect(
        stateMachine.transition(mockWorkflow, 'merged')
      ).rejects.toThrow();
    });

    test('should record transition history', async () => {
      await stateMachine.transition(mockWorkflow, 'processing');
      await stateMachine.transition(mockWorkflow, 'pr_created');

      expect(mockWorkflow.stateHistory.length).toBe(3);
      expect(mockWorkflow.stateHistory[2].state).toBe('pr_created');
      expect(mockWorkflow.stateHistory[2].previousState).toBe('processing');
    });
  });

  describe('State Validation', () => {
    test('should validate transitions', () => {
      expect(stateMachine.isValidTransition('pending', 'processing')).toBe(true);
      expect(stateMachine.isValidTransition('pending', 'merged')).toBe(false);
    });

    test('should get valid next states', () => {
      const nextStates = stateMachine.getValidNextStates('pending');
      
      expect(Array.isArray(nextStates)).toBe(true);
      expect(nextStates).toContain('processing');
    });

    test('should identify terminal states', () => {
      expect(stateMachine.isTerminalState('merged')).toBe(true);
      expect(stateMachine.isTerminalState('failed')).toBe(true);
      expect(stateMachine.isTerminalState('processing')).toBe(false);
    });
  });

  describe('Workflow Monitoring', () => {
    beforeEach(async () => {
      await stateMachine.initialize(mockWorkflow);
    });

    test('should get workflow state', () => {
      const state = stateMachine.getWorkflowState(mockWorkflow.id);
      
      expect(state).toBe('pending');
    });

    test('should get workflow history', () => {
      const history = stateMachine.getWorkflowHistory(mockWorkflow.id);
      
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
    });

    test('should calculate time in current state', () => {
      const timeInState = stateMachine.getTimeInCurrentState(mockWorkflow.id);
      
      expect(typeof timeInState).toBe('number');
      expect(timeInState).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Statistics', () => {
    test('should provide statistics', () => {
      const stats = stateMachine.getStatistics();

      expect(stats).toHaveProperty('totalWorkflows');
      expect(stats).toHaveProperty('stateDistribution');
      expect(stats).toHaveProperty('stuckWorkflows');
    });
  });
});

describe('DependencyResolver', () => {
  let resolver;

  beforeEach(() => {
    resolver = new DependencyResolver();
  });

  describe('Dependency Resolution', () => {
    test('should resolve simple dependencies', async () => {
      const tasks = [
        { id: 'task_a', dependencies: [] },
        { id: 'task_b', dependencies: ['task_a'] },
        { id: 'task_c', dependencies: ['task_b'] }
      ];

      const result = await resolver.resolveDependencies(tasks);

      expect(result.success).toBe(true);
      expect(result.executionPlan).toBeDefined();
      expect(result.executionPlan.length).toBe(3);
    });

    test('should handle parallel execution', async () => {
      const tasks = [
        { id: 'task_a', dependencies: [] },
        { id: 'task_b', dependencies: [] },
        { id: 'task_c', dependencies: ['task_a', 'task_b'] }
      ];

      const result = await resolver.resolveDependencies(tasks);

      expect(result.success).toBe(true);
      expect(result.executionPlan[0]).toContain('task_a');
      expect(result.executionPlan[0]).toContain('task_b');
      expect(result.executionPlan[1]).toContain('task_c');
    });

    test('should detect circular dependencies', async () => {
      const tasks = [
        { id: 'task_a', dependencies: ['task_b'] },
        { id: 'task_b', dependencies: ['task_a'] }
      ];

      const result = await resolver.resolveDependencies(tasks);

      expect(result.success).toBe(false);
      expect(result.error).toContain('circular');
    });

    test('should validate missing dependencies', async () => {
      const tasks = [
        { id: 'task_a', dependencies: ['non_existent_task'] }
      ];

      const result = await resolver.resolveDependencies(tasks);

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-existent');
    });
  });

  describe('Execution Order', () => {
    test('should provide topological sort', () => {
      const tasks = [
        { id: 'c', dependencies: ['a', 'b'] },
        { id: 'a', dependencies: [] },
        { id: 'b', dependencies: ['a'] }
      ];

      const order = resolver.getExecutionOrder(tasks);

      expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
      expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
    });
  });

  describe('Parallel Task Detection', () => {
    test('should find parallelizable tasks', () => {
      const tasks = [
        { id: 'task_a', dependencies: [] },
        { id: 'task_b', dependencies: [] },
        { id: 'task_c', dependencies: ['task_a'] }
      ];

      const parallel = resolver.findParallelTasks(tasks);

      expect(parallel[0].canRunInParallel).toBe(true);
      expect(parallel[0].tasks).toContain('task_a');
      expect(parallel[0].tasks).toContain('task_b');
    });
  });

  describe('Time Estimation', () => {
    test('should estimate execution time', () => {
      const tasks = [
        { id: 'task_a', dependencies: [], estimatedTime: '2 hours' },
        { id: 'task_b', dependencies: [], estimatedTime: '1 hour' },
        { id: 'task_c', dependencies: ['task_a', 'task_b'], estimatedTime: '30 minutes' }
      ];

      const estimation = resolver.estimateExecutionTime(tasks);

      expect(estimation).toHaveProperty('sequential');
      expect(estimation).toHaveProperty('parallel');
      expect(estimation).toHaveProperty('savings');
      expect(estimation.parallel.minutes).toBeLessThan(estimation.sequential.minutes);
    });
  });
});

describe('ErrorRecoveryManager', () => {
  let errorRecovery;
  let mockOrchestrator;

  beforeEach(() => {
    mockOrchestrator = {
      processTask: jest.fn().mockResolvedValue({ success: true })
    };
    errorRecovery = new ErrorRecoveryManager(mockOrchestrator);
  });

  afterEach(() => {
    errorRecovery.shutdown();
  });

  describe('Error Classification', () => {
    test('should classify network errors', () => {
      const networkError = new Error('Connection refused');
      const errorType = errorRecovery._classifyError(networkError);
      
      expect(errorType).toBe('NETWORK_ERROR');
    });

    test('should classify timeout errors', () => {
      const timeoutError = new Error('Request timed out');
      const errorType = errorRecovery._classifyError(timeoutError);
      
      expect(errorType).toBe('TIMEOUT_ERROR');
    });

    test('should classify rate limit errors', () => {
      const rateLimitError = new Error('Too many requests');
      const errorType = errorRecovery._classifyError(rateLimitError);
      
      expect(errorType).toBe('RATE_LIMIT_ERROR');
    });
  });

  describe('Recovery Strategies', () => {
    test('should register custom recovery strategy', () => {
      const customStrategy = {
        name: 'custom_test',
        maxAttempts: 2,
        recoveryAction: jest.fn()
      };

      errorRecovery.registerRecoveryStrategy('CUSTOM_ERROR', customStrategy);
      
      const strategy = errorRecovery._getRecoveryStrategy('CUSTOM_ERROR');
      expect(strategy.name).toBe('custom_test');
    });

    test('should use default strategy for unknown errors', () => {
      const strategy = errorRecovery._getRecoveryStrategy('UNKNOWN_ERROR');
      
      expect(strategy).toBeDefined();
      expect(strategy.name).toBe('default_retry');
    });
  });

  describe('Retry Logic', () => {
    test('should determine if workflow should retry', () => {
      const workflowId = 'test_workflow';
      const errorType = 'NETWORK_ERROR';

      // First attempt should allow retry
      expect(errorRecovery.shouldRetry(workflowId, errorType)).toBe(true);

      // Simulate multiple attempts
      errorRecovery.recoveryAttempts.set(workflowId, 3);
      expect(errorRecovery.shouldRetry(workflowId, errorType)).toBe(false);
    });

    test('should reset recovery attempts', () => {
      const workflowId = 'test_workflow';
      errorRecovery.recoveryAttempts.set(workflowId, 5);

      errorRecovery.resetRecoveryAttempts(workflowId);

      expect(errorRecovery.recoveryAttempts.has(workflowId)).toBe(false);
    });
  });

  describe('Failure Statistics', () => {
    test('should track failure statistics', () => {
      const workflowId = 'test_workflow';
      const error = new Error('Test error');

      errorRecovery._recordFailure(workflowId, error, {});

      const stats = errorRecovery.getFailureStats(workflowId);
      expect(stats.totalFailures).toBe(1);
      expect(stats.lastFailure).toBeDefined();
    });
  });

  describe('Recovery Recommendations', () => {
    test('should provide recovery recommendations', () => {
      const workflowId = 'test_workflow';
      
      // Simulate recurring timeout errors
      for (let i = 0; i < 3; i++) {
        const error = new Error('Request timed out');
        errorRecovery._recordFailure(workflowId, error, {});
      }

      const recommendations = errorRecovery.getRecoveryRecommendations(workflowId);
      
      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.some(r => r.type === 'timeout_optimization')).toBe(true);
    });
  });
});

describe('Integration Tests', () => {
  let engine;

  beforeEach(async () => {
    engine = new OrchestrationEngine({
      database: { host: 'localhost', port: 5432 },
      nlp: { provider: 'anthropic' },
      orchestrator: { maxConcurrentWorkflows: 2 }
    });
    
    await engine.initialize();
  });

  afterEach(async () => {
    await engine.shutdown();
  });

  test('should handle end-to-end workflow', async () => {
    // Create a task
    const taskId = 'integration_test_task';
    await engine.stateManager.database.createTask({
      id: taskId,
      title: 'Integration Test Task',
      description: 'Test task for integration testing',
      status: 'pending'
    });

    // Process the task
    const result = await engine.processTask(taskId);
    
    expect(result).toHaveProperty('workflowId');
    expect(result.status).toBe('processing');

    // Check workflow status
    const status = await engine.getWorkflowStatus(result.workflowId);
    expect(status).toBeDefined();
  });

  test('should handle concurrent workflows', async () => {
    const taskIds = ['concurrent_1', 'concurrent_2'];
    
    // Create tasks
    for (const taskId of taskIds) {
      await engine.stateManager.database.createTask({
        id: taskId,
        title: `Concurrent Task ${taskId}`,
        description: 'Test concurrent processing',
        status: 'pending'
      });
    }

    // Process concurrently
    const promises = taskIds.map(taskId => engine.processTask(taskId));
    const results = await Promise.all(promises);

    expect(results).toHaveLength(2);
    results.forEach(result => {
      expect(result).toHaveProperty('workflowId');
    });
  });

  test('should handle workflow cancellation', async () => {
    const taskId = 'cancellation_test';
    await engine.stateManager.database.createTask({
      id: taskId,
      title: 'Cancellation Test',
      description: 'Test workflow cancellation',
      status: 'pending'
    });

    const result = await engine.processTask(taskId);
    const cancelled = await engine.cancelWorkflow(result.workflowId);

    expect(cancelled).toBe(true);
  });
});

