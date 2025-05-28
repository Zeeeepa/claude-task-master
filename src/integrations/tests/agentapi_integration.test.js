/**
 * @fileoverview AgentAPI Integration Tests
 * @description Comprehensive test suite for AgentAPI integration components
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentAPIClient } from '../agentapi_client.js';
import { ClaudeCodeExecutor } from '../claude_code_executor.js';
import { WorkspaceManager } from '../workspace_manager.js';
import { AgentMonitor } from '../agent_monitor.js';
import { FileTracker } from '../file_tracker.js';
import { ResultParser } from '../result_parser.js';
import { generatePrompt, getTemplate } from '../prompt_templates.js';
import { getConfig, validateConfig } from '../config.js';

// Mock axios for testing
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      post: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      }
    }))
  }
}));

describe('AgentAPI Integration', () => {
  describe('AgentAPIClient', () => {
    let client;
    let mockAxios;

    beforeEach(() => {
      const config = {
        baseURL: 'http://localhost:3284',
        timeout: 30000,
        maxRetries: 3
      };
      client = new AgentAPIClient(config);
      mockAxios = client.client;
    });

    it('should initialize with correct configuration', () => {
      expect(client.baseURL).toBe('http://localhost:3284');
      expect(client.timeout).toBe(30000);
      expect(client.maxRetries).toBe(3);
    });

    it('should send messages successfully', async () => {
      const mockResponse = { data: { id: 'msg-123', status: 'sent' } };
      mockAxios.post.mockResolvedValue(mockResponse);

      const result = await client.sendMessage('Hello, Claude!');
      
      expect(mockAxios.post).toHaveBeenCalledWith('/message', {
        content: 'Hello, Claude!',
        type: 'user'
      });
      expect(result).toEqual(mockResponse.data);
    });

    it('should get messages successfully', async () => {
      const mockMessages = { data: [
        { id: 'msg-1', content: 'Hello!', type: 'user' },
        { id: 'msg-2', content: 'Hi there!', type: 'agent' }
      ]};
      mockAxios.get.mockResolvedValue(mockMessages);

      const result = await client.getMessages();
      
      expect(mockAxios.get).toHaveBeenCalledWith('/messages');
      expect(result).toEqual(mockMessages.data);
    });

    it('should get status successfully', async () => {
      const mockStatus = { data: { status: 'stable', agent: 'claude-code' } };
      mockAxios.get.mockResolvedValue(mockStatus);

      const result = await client.getStatus();
      
      expect(mockAxios.get).toHaveBeenCalledWith('/status');
      expect(result).toEqual(mockStatus.data);
    });

    it('should handle errors with fallback', async () => {
      mockAxios.post.mockRejectedValue(new Error('Network error'));

      const result = await client.sendMessage('Test message');
      
      expect(result).toEqual({ error: 'AgentAPI unavailable' });
    });

    it('should wait for completion', async () => {
      mockAxios.get
        .mockResolvedValueOnce({ data: { status: 'working' } })
        .mockResolvedValueOnce({ data: { status: 'stable' } });

      const result = await client.waitForCompletion(10000);
      
      expect(result).toBe(true);
      expect(mockAxios.get).toHaveBeenCalledTimes(2);
    });

    it('should timeout when waiting for completion', async () => {
      mockAxios.get.mockResolvedValue({ data: { status: 'working' } });

      await expect(client.waitForCompletion(100)).rejects.toThrow('Agent operation timeout');
    });

    it('should track circuit breaker status', () => {
      const status = client.getCircuitBreakerStatus();
      
      expect(status).toHaveProperty('state');
      expect(status).toHaveProperty('failures');
      expect(status).toHaveProperty('lastFailureTime');
    });
  });

  describe('ClaudeCodeExecutor', () => {
    let executor;
    let mockAgentAPI;

    beforeEach(() => {
      const config = {
        agentAPI: { baseURL: 'http://localhost:3284' },
        workspace: { basePath: '/tmp/test-workspace' },
        claude: { allowedTools: ['Edit', 'Replace'] }
      };
      executor = new ClaudeCodeExecutor(config);
      mockAgentAPI = executor.agentAPI;
      
      // Mock AgentAPI methods
      mockAgentAPI.sendMessage = vi.fn().mockResolvedValue({ id: 'msg-123' });
      mockAgentAPI.waitForCompletion = vi.fn().mockResolvedValue(true);
      mockAgentAPI.getMessages = vi.fn().mockResolvedValue([
        { type: 'user', content: 'Task prompt' },
        { type: 'agent', content: 'Task completed successfully. Modified file.js' }
      ]);
    });

    it('should generate appropriate prompts for different task types', () => {
      const featureTask = {
        title: 'Add validation',
        description: 'Add input validation',
        type: 'feature',
        requirements: ['Validate email', 'Check password']
      };

      const prompt = executor.generatePrompt(featureTask);
      
      expect(prompt).toContain('Add validation');
      expect(prompt).toContain('Add input validation');
      expect(prompt).toContain('Feature Requirements');
    });

    it('should execute tasks successfully', async () => {
      const task = {
        id: 'test-task',
        title: 'Test Task',
        description: 'A test task',
        type: 'feature',
        requirements: ['Test requirement']
      };

      const result = await executor.executeTask(task, 'exec-123');
      
      expect(mockAgentAPI.sendMessage).toHaveBeenCalled();
      expect(mockAgentAPI.waitForCompletion).toHaveBeenCalled();
      expect(mockAgentAPI.getMessages).toHaveBeenCalled();
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('filesModified');
    });

    it('should parse results correctly', () => {
      const messages = [
        { type: 'user', content: 'Please modify file.js' },
        { type: 'agent', content: 'I have modified file.js and created test.js. The changes include validation logic.' }
      ];

      const result = executor.parseResults(messages);
      
      expect(result.summary).toContain('validation logic');
      expect(result.filesModified).toContain('file.js');
      expect(result.totalMessages).toBe(2);
    });

    it('should extract modified files from messages', () => {
      const messages = [
        { content: 'Modified src/auth.js and updated package.json' },
        { content: 'Created tests/auth.test.js' }
      ];

      const files = executor.extractModifiedFiles(messages);
      
      expect(files).toContain('src/auth.js');
      expect(files).toContain('package.json');
      expect(files).toContain('tests/auth.test.js');
    });
  });

  describe('WorkspaceManager', () => {
    let workspaceManager;
    let mockAgentAPI;

    beforeEach(() => {
      const config = {
        basePath: '/tmp/test-workspace',
        maxConcurrent: 5,
        cleanupAfter: 3600000
      };
      workspaceManager = new WorkspaceManager(config);
      mockAgentAPI = workspaceManager.agentAPI;
      
      // Mock AgentAPI methods
      mockAgentAPI.sendMessage = vi.fn().mockResolvedValue({ success: true });
      mockAgentAPI.waitForCompletion = vi.fn().mockResolvedValue(true);
    });

    afterEach(() => {
      workspaceManager.stop();
    });

    it('should create workspace successfully', async () => {
      const workspace = await workspaceManager.createWorkspace('test-task', {
        repository: 'https://github.com/test/repo.git',
        branch: 'main'
      });

      expect(workspace.id).toBe('test-task');
      expect(workspace.status).toBe('ready');
      expect(workspace.repository).toBe('https://github.com/test/repo.git');
      expect(workspace.branch).toBe('main');
    });

    it('should reject creation when at capacity', async () => {
      // Fill up to capacity
      for (let i = 0; i < 5; i++) {
        await workspaceManager.createWorkspace(`task-${i}`);
      }

      await expect(workspaceManager.createWorkspace('task-overflow'))
        .rejects.toThrow('Maximum concurrent workspaces');
    });

    it('should get workspace information', async () => {
      await workspaceManager.createWorkspace('test-task');
      
      const workspace = workspaceManager.getWorkspace('test-task');
      
      expect(workspace).toBeTruthy();
      expect(workspace.id).toBe('test-task');
    });

    it('should update workspace access time', async () => {
      await workspaceManager.createWorkspace('test-task');
      const originalTime = workspaceManager.getWorkspace('test-task').lastAccessed;
      
      // Wait a bit and touch
      await new Promise(resolve => setTimeout(resolve, 10));
      workspaceManager.touchWorkspace('test-task');
      
      const newTime = workspaceManager.getWorkspace('test-task').lastAccessed;
      expect(newTime.getTime()).toBeGreaterThan(originalTime.getTime());
    });

    it('should cleanup workspace', async () => {
      await workspaceManager.createWorkspace('test-task');
      expect(workspaceManager.getWorkspace('test-task')).toBeTruthy();
      
      await workspaceManager.cleanupWorkspace('test-task');
      expect(workspaceManager.getWorkspace('test-task')).toBeFalsy();
    });

    it('should provide statistics', async () => {
      await workspaceManager.createWorkspace('task-1');
      await workspaceManager.createWorkspace('task-2');
      
      const stats = await workspaceManager.getStatistics();
      
      expect(stats.activeWorkspaces).toBe(2);
      expect(stats.maxConcurrent).toBe(5);
      expect(stats.workspaces).toHaveLength(2);
    });
  });

  describe('AgentMonitor', () => {
    let monitor;
    let mockAgentAPI;

    beforeEach(() => {
      const config = {
        healthCheckInterval: 100,
        performanceReportInterval: 200,
        alertThresholds: {
          errorRate: 10,
          responseTime: 5000
        }
      };
      monitor = new AgentMonitor(config);
      mockAgentAPI = monitor.agentAPI;
      
      // Mock AgentAPI methods
      mockAgentAPI.getHealth = vi.fn().mockResolvedValue({ 
        status: 'healthy', 
        healthy: true 
      });
      mockAgentAPI.getCircuitBreakerStatus = vi.fn().mockReturnValue({
        state: 'CLOSED',
        failures: 0
      });
    });

    afterEach(() => {
      monitor.stop();
    });

    it('should start and stop monitoring', () => {
      expect(monitor.isMonitoring).toBe(false);
      
      monitor.start();
      expect(monitor.isMonitoring).toBe(true);
      
      monitor.stop();
      expect(monitor.isMonitoring).toBe(false);
    });

    it('should perform health checks', async () => {
      const healthStatus = await monitor.performHealthCheck();
      
      expect(mockAgentAPI.getHealth).toHaveBeenCalled();
      expect(healthStatus.healthy).toBe(true);
      expect(healthStatus.agentAPI.available).toBe(true);
    });

    it('should record task execution metrics', () => {
      monitor.recordTaskExecution(5000, true);
      monitor.recordTaskExecution(3000, false);
      
      const metrics = monitor.getMetrics();
      expect(metrics.agent.totalTasks).toBe(2);
      expect(metrics.agent.completedTasks).toBe(1);
      expect(metrics.agent.failedTasks).toBe(1);
    });

    it('should generate performance reports', () => {
      monitor.recordTaskExecution(5000, true);
      
      const report = monitor.generatePerformanceReport();
      
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('agent');
      expect(report).toHaveProperty('system');
      expect(report.agent.totalTasks).toBe(1);
    });

    it('should emit events', (done) => {
      monitor.on('health:check', (status) => {
        expect(status).toHaveProperty('healthy');
        done();
      });
      
      monitor.performHealthCheck();
    });
  });

  describe('ResultParser', () => {
    let parser;

    beforeEach(() => {
      parser = new ResultParser();
    });

    it('should parse messages correctly', () => {
      const messages = [
        { type: 'user', content: 'Please modify file.js' },
        { type: 'agent', content: 'I have modified file.js and created test.js' }
      ];

      const result = parser.parse(messages);
      
      expect(result.filesModified).toContain('file.js');
      expect(result.filesCreated).toContain('test.js');
      expect(result.metadata.totalMessages).toBe(2);
      expect(result.metadata.agentMessages).toBe(1);
    });

    it('should extract code blocks', () => {
      const messages = [
        { content: '```javascript\nconst x = 1;\n```' },
        { content: 'Here is some `inline code`' }
      ];

      const result = parser.parse(messages);
      
      expect(result.codeBlocks).toHaveLength(1);
      expect(result.codeBlocks[0].language).toBe('javascript');
      expect(result.codeBlocks[0].code).toBe('const x = 1;');
    });

    it('should extract commands', () => {
      const messages = [
        { content: 'Running npm install' },
        { content: '$ git commit -m "Update"' },
        { content: '> node app.js' }
      ];

      const result = parser.parse(messages);
      
      expect(result.commands).toContain('npm install');
      expect(result.commands).toContain('git commit -m "Update"');
      expect(result.commands).toContain('node app.js');
    });

    it('should extract errors and warnings', () => {
      const messages = [
        { content: 'Error: File not found' },
        { content: 'Warning: Deprecated function used' },
        { content: 'Failed to compile' }
      ];

      const result = parser.parse(messages);
      
      expect(result.errors).toContain('File not found');
      expect(result.errors).toContain('to compile');
      expect(result.warnings).toContain('Deprecated function used');
    });

    it('should parse completion status', () => {
      const messages = [
        { content: 'Task completed successfully. All tests pass.' }
      ];

      const status = parser.parseCompletionStatus(messages);
      
      expect(status.completed).toBe(true);
      expect(status.success).toBe(true);
    });
  });

  describe('Prompt Templates', () => {
    it('should generate feature prompts', () => {
      const task = {
        title: 'Add validation',
        description: 'Add input validation to forms',
        type: 'feature',
        requirements: ['Email validation', 'Password strength'],
        acceptance_criteria: ['Valid emails accepted', 'Strong passwords required']
      };

      const prompt = generatePrompt(task);
      
      expect(prompt).toContain('Add validation');
      expect(prompt).toContain('Add input validation to forms');
      expect(prompt).toContain('Email validation');
      expect(prompt).toContain('Feature Requirements');
    });

    it('should generate bugfix prompts', () => {
      const task = {
        title: 'Fix login issue',
        description: 'Users cannot log in',
        type: 'bugfix'
      };

      const prompt = generatePrompt(task);
      
      expect(prompt).toContain('Fix login issue');
      expect(prompt).toContain('Bug Fix Requirements');
      expect(prompt).toContain('root cause');
    });

    it('should get templates by name', () => {
      const featureTemplate = getTemplate('feature');
      const bugfixTemplate = getTemplate('bugfix');
      
      expect(featureTemplate).toBeTruthy();
      expect(bugfixTemplate).toBeTruthy();
      expect(featureTemplate.name).toBe('feature');
      expect(bugfixTemplate.name).toBe('bugfix');
    });
  });

  describe('Configuration', () => {
    it('should load development config', () => {
      const config = getConfig('development');
      
      expect(config).toHaveProperty('agentAPI');
      expect(config).toHaveProperty('workspace');
      expect(config).toHaveProperty('claude');
      expect(config.agentAPI.baseURL).toBe('http://localhost:3284');
    });

    it('should load production config', () => {
      const config = getConfig('production');
      
      expect(config.agentAPI.timeout).toBe(60000);
      expect(config.workspace.maxConcurrent).toBe(20);
    });

    it('should validate configuration', () => {
      const validConfig = {
        agentAPI: { baseURL: 'http://localhost:3284' },
        workspace: { basePath: '/tmp', maxConcurrent: 5 },
        claude: { allowedTools: ['Edit'] }
      };

      const result = validateConfig(validConfig);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid configuration', () => {
      const invalidConfig = {
        agentAPI: {}, // Missing baseURL
        workspace: { maxConcurrent: 0 }, // Invalid value
        claude: { allowedTools: 'not-array' } // Wrong type
      };

      const result = validateConfig(invalidConfig);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete task workflow', async () => {
      const config = getConfig('test');
      const executor = new ClaudeCodeExecutor(config);
      const parser = new ResultParser();
      
      // Mock successful execution
      executor.agentAPI.sendMessage = vi.fn().mockResolvedValue({ id: 'msg-123' });
      executor.agentAPI.waitForCompletion = vi.fn().mockResolvedValue(true);
      executor.agentAPI.getMessages = vi.fn().mockResolvedValue([
        { type: 'user', content: 'Task: Add validation' },
        { type: 'agent', content: 'Completed task. Modified src/validation.js and created tests/validation.test.js' }
      ]);

      const task = {
        id: 'integration-test',
        title: 'Add validation',
        description: 'Add input validation',
        type: 'feature'
      };

      const result = await executor.executeTask(task, 'exec-123');
      const parsed = parser.parse(await executor.agentAPI.getMessages());
      
      expect(result.summary).toContain('Completed task');
      expect(parsed.filesModified).toContain('src/validation.js');
      expect(parsed.filesCreated).toContain('tests/validation.test.js');
    });

    it('should handle error scenarios gracefully', async () => {
      const config = getConfig('test');
      const executor = new ClaudeCodeExecutor(config);
      
      // Mock failure
      executor.agentAPI.sendMessage = vi.fn().mockRejectedValue(new Error('Network error'));

      const task = {
        id: 'error-test',
        title: 'Test error handling',
        description: 'This should fail',
        type: 'feature'
      };

      await expect(executor.executeTask(task, 'exec-error')).rejects.toThrow();
    });
  });
});

export default {
  // Export test utilities for external use
  createMockAgentAPI: () => ({
    sendMessage: vi.fn().mockResolvedValue({ id: 'msg-123' }),
    getMessages: vi.fn().mockResolvedValue([]),
    getStatus: vi.fn().mockResolvedValue({ status: 'stable' }),
    getHealth: vi.fn().mockResolvedValue({ healthy: true }),
    waitForCompletion: vi.fn().mockResolvedValue(true),
    getCircuitBreakerStatus: vi.fn().mockReturnValue({ state: 'CLOSED', failures: 0 })
  }),
  
  createMockTask: (overrides = {}) => ({
    id: 'test-task',
    title: 'Test Task',
    description: 'A test task for unit testing',
    type: 'feature',
    requirements: ['Test requirement'],
    acceptance_criteria: ['Test criteria'],
    ...overrides
  })
};

