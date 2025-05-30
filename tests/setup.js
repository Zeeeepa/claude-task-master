/**
 * Jest setup file
 *
 * This file is run before each test suite to set up the test environment.
 */

// Mock environment variables
process.env.MODEL = 'sonar-pro';
process.env.MAX_TOKENS = '64000';
process.env.TEMPERATURE = '0.2';
process.env.DEBUG = 'false';
process.env.TASKMASTER_LOG_LEVEL = 'error'; // Set to error to reduce noise in tests
process.env.DEFAULT_SUBTASKS = '5';
process.env.DEFAULT_PRIORITY = 'medium';
process.env.PROJECT_NAME = 'Test Project';
process.env.PROJECT_VERSION = '1.0.0';
// Ensure tests don't make real API calls by setting mock API keys
process.env.ANTHROPIC_API_KEY = 'test-mock-api-key-for-tests';
process.env.PERPLEXITY_API_KEY = 'test-mock-perplexity-key-for-tests';

// Database test environment variables
process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'claude_task_master_test';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';
process.env.DB_SSL = 'false';

// External service mock URLs
process.env.LINEAR_API_URL = 'http://localhost:3001/mock/linear';
process.env.GITHUB_API_URL = 'http://localhost:3001/mock/github';
process.env.CODEGEN_SDK_URL = 'http://localhost:3001/mock/codegen';
process.env.CLAUDE_CODE_URL = 'http://localhost:3001/mock/claude-code';
process.env.AGENT_API_URL = 'http://localhost:3001/mock/agent-api';

// JWT secret for testing
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';

// Add global test helpers if needed
global.wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Global test utilities
global.testUtils = {
  // Generate random test data
  generateId: () => `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  
  // Create test workflow data
  createTestWorkflow: (overrides = {}) => ({
    id: global.testUtils.generateId(),
    githubRepoUrl: 'https://github.com/test/repo',
    requirements: 'Sample test requirements',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  }),
  
  // Create test task data
  createTestTask: (overrides = {}) => ({
    id: global.testUtils.generateId(),
    title: 'Test Task',
    description: 'Test task description',
    status: 'pending',
    priority: 'medium',
    type: 'feature',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  }),
  
  // Mock API response helper
  mockApiResponse: (data, status = 200) => ({
    status,
    data,
    headers: { 'content-type': 'application/json' }
  })
};

// If needed, silence console during tests
if (process.env.SILENCE_CONSOLE === 'true') {
	global.console = {
		...console,
		log: () => {},
		info: () => {},
		warn: () => {},
		error: () => {}
	};
}

// Setup global mocks for external services
import { jest } from '@jest/globals';

// Mock fetch for API calls
global.fetch = jest.fn();

// Mock database connection for tests
jest.mock('../src/database/connection.js', () => ({
  query: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  transaction: jest.fn()
}));

// Setup and teardown hooks
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
  
  // Reset fetch mock
  if (global.fetch.mockClear) {
    global.fetch.mockClear();
  }
});

afterEach(() => {
  // Clean up any test data or state
  jest.restoreAllMocks();
});

// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process in tests
});

// Global error handler for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit the process in tests
});

