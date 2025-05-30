/**
 * Test Helper Utilities
 * 
 * Comprehensive test utilities for the CICD orchestration system
 */

import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';

export class TestHelpers {
  /**
   * Create a test workflow with optional overrides
   * @param {Object} overrides - Properties to override in the default workflow
   * @returns {Object} Test workflow object
   */
  static async createTestWorkflow(overrides = {}) {
    const defaultWorkflow = {
      id: this.generateId(),
      githubRepoUrl: 'https://github.com/test/repo',
      requirements: 'Sample test requirements for workflow',
      status: 'active',
      priority: 'medium',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {
        branch: 'main',
        lastCommit: 'abc123',
        author: 'test-user'
      }
    };

    return { ...defaultWorkflow, ...overrides };
  }

  /**
   * Create a test task with optional overrides
   * @param {Object} overrides - Properties to override in the default task
   * @returns {Object} Test task object
   */
  static async createTestTask(overrides = {}) {
    const defaultTask = {
      id: this.generateId(),
      workflowId: this.generateId(),
      title: 'Test Task',
      description: 'Test task description',
      status: 'pending',
      priority: 'medium',
      type: 'feature',
      assignee: 'test-user',
      estimatedHours: 2,
      actualHours: 0,
      dependencies: [],
      tags: ['test'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return { ...defaultTask, ...overrides };
  }

  /**
   * Generate a unique test ID
   * @returns {string} Unique test identifier
   */
  static generateId() {
    return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Mock external service responses
   * @param {string} service - Service name (linear, github, codegen, etc.)
   * @param {Array} responses - Array of mock responses
   */
  static mockExternalService(service, responses) {
    const mockResponses = Array.isArray(responses) ? responses : [responses];
    
    global.fetch = jest.fn()
      .mockImplementation((url) => {
        if (url.includes(service)) {
          const response = mockResponses.shift() || mockResponses[mockResponses.length - 1];
          return Promise.resolve({
            ok: response.status >= 200 && response.status < 300,
            status: response.status || 200,
            json: () => Promise.resolve(response.data),
            text: () => Promise.resolve(JSON.stringify(response.data)),
            headers: new Map(Object.entries(response.headers || {}))
          });
        }
        return Promise.reject(new Error(`Unmocked URL: ${url}`));
      });
  }

  /**
   * Mock Linear API responses
   * @param {Object} responses - Linear API mock responses
   */
  static mockLinearAPI(responses = {}) {
    const defaultResponses = {
      createIssue: { id: 'linear-123', title: 'Test Issue', status: 'created' },
      updateIssue: { id: 'linear-123', title: 'Updated Issue', status: 'updated' },
      getIssue: { id: 'linear-123', title: 'Test Issue', status: 'active' },
      webhook: { success: true, processed: true }
    };

    this.mockExternalService('linear', {
      status: 200,
      data: { ...defaultResponses, ...responses }
    });
  }

  /**
   * Mock GitHub API responses
   * @param {Object} responses - GitHub API mock responses
   */
  static mockGitHubAPI(responses = {}) {
    const defaultResponses = {
      createPR: { id: 123, number: 456, title: 'Test PR', state: 'open' },
      updatePR: { id: 123, number: 456, title: 'Updated PR', state: 'open' },
      getPR: { id: 123, number: 456, title: 'Test PR', state: 'open' },
      webhook: { success: true, processed: true }
    };

    this.mockExternalService('github', {
      status: 200,
      data: { ...defaultResponses, ...responses }
    });
  }

  /**
   * Mock Codegen SDK responses
   * @param {Object} responses - Codegen SDK mock responses
   */
  static mockCodegenSDK(responses = {}) {
    const defaultResponses = {
      processTask: { success: true, result: 'Task processed successfully' },
      generateCode: { success: true, code: 'console.log("Generated code");' },
      validateCode: { success: true, valid: true, issues: [] }
    };

    this.mockExternalService('codegen', {
      status: 200,
      data: { ...defaultResponses, ...responses }
    });
  }

  /**
   * Mock Claude Code responses
   * @param {Object} responses - Claude Code mock responses
   */
  static mockClaudeCode(responses = {}) {
    const defaultResponses = {
      validate: { success: true, valid: true, suggestions: [] },
      debug: { success: true, fixes: [], issues: [] },
      review: { success: true, score: 85, comments: [] }
    };

    this.mockExternalService('claude-code', {
      status: 200,
      data: { ...defaultResponses, ...responses }
    });
  }

  /**
   * Clean up test data and reset mocks
   */
  static async cleanupTestData() {
    // Clear all Jest mocks
    jest.clearAllMocks();
    jest.restoreAllMocks();

    // Reset global fetch mock
    if (global.fetch && global.fetch.mockReset) {
      global.fetch.mockReset();
    }

    // Clean up any temporary test files
    try {
      const tempDir = path.join(process.cwd(), 'tests', 'temp');
      await fs.rmdir(tempDir, { recursive: true });
    } catch (error) {
      // Ignore if directory doesn't exist
    }
  }

  /**
   * Create a mock database connection
   * @returns {Object} Mock database connection
   */
  static createMockDatabase() {
    return {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      connect: jest.fn().mockResolvedValue(true),
      disconnect: jest.fn().mockResolvedValue(true),
      transaction: jest.fn().mockImplementation(async (callback) => {
        const client = {
          query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
          release: jest.fn()
        };
        try {
          const result = await callback(client);
          return result;
        } finally {
          client.release();
        }
      })
    };
  }

  /**
   * Create mock webhook payload
   * @param {string} service - Service name (linear, github, etc.)
   * @param {string} event - Event type
   * @param {Object} data - Event data
   * @returns {Object} Mock webhook payload
   */
  static createWebhookPayload(service, event, data = {}) {
    const timestamp = new Date().toISOString();
    
    const payloads = {
      linear: {
        id: this.generateId(),
        type: event,
        action: event,
        data: data,
        createdAt: timestamp,
        organizationId: 'org-123',
        webhookId: 'webhook-123'
      },
      github: {
        action: event,
        repository: {
          id: 123,
          name: 'test-repo',
          full_name: 'test-org/test-repo'
        },
        sender: {
          login: 'test-user',
          id: 456
        },
        ...data
      }
    };

    return payloads[service] || { service, event, data, timestamp };
  }

  /**
   * Wait for a condition to be true
   * @param {Function} condition - Function that returns true when condition is met
   * @param {number} timeout - Timeout in milliseconds
   * @param {number} interval - Check interval in milliseconds
   * @returns {Promise} Resolves when condition is met or rejects on timeout
   */
  static async waitForCondition(condition, timeout = 5000, interval = 100) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return true;
      }
      await this.sleep(interval);
    }
    
    throw new Error(`Condition not met within ${timeout}ms`);
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after the specified time
   */
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a mock Express app for testing
   * @returns {Object} Mock Express app
   */
  static createMockApp() {
    const app = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      patch: jest.fn(),
      use: jest.fn(),
      listen: jest.fn(),
      close: jest.fn()
    };

    // Mock middleware functions
    app.use.mockImplementation(() => app);
    app.get.mockImplementation(() => app);
    app.post.mockImplementation(() => app);
    app.put.mockImplementation(() => app);
    app.delete.mockImplementation(() => app);
    app.patch.mockImplementation(() => app);

    return app;
  }

  /**
   * Generate test performance data
   * @param {string} operation - Operation name
   * @param {number} duration - Duration in milliseconds
   * @returns {Object} Performance test data
   */
  static generatePerformanceData(operation, duration) {
    return {
      operation,
      duration,
      timestamp: new Date().toISOString(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    };
  }

  /**
   * Create test fixtures for different scenarios
   * @param {string} type - Fixture type (workflow, task, user, etc.)
   * @param {Object} options - Fixture options
   * @returns {Object} Test fixture data
   */
  static createFixture(type, options = {}) {
    const fixtures = {
      workflow: () => this.createTestWorkflow(options),
      task: () => this.createTestTask(options),
      user: () => ({
        id: this.generateId(),
        username: 'test-user',
        email: 'test@example.com',
        role: 'developer',
        ...options
      }),
      project: () => ({
        id: this.generateId(),
        name: 'Test Project',
        description: 'Test project description',
        repository: 'https://github.com/test/repo',
        ...options
      })
    };

    const fixtureGenerator = fixtures[type];
    if (!fixtureGenerator) {
      throw new Error(`Unknown fixture type: ${type}`);
    }

    return fixtureGenerator();
  }
}

