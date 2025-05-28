/**
 * Test Utilities and Helper Functions
 * 
 * Comprehensive utility functions for testing framework
 * including test data generation, mocking, and common test operations.
 */

import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { performance } from 'perf_hooks';
import axios from 'axios';

// Test environment configuration
export const TEST_ENV = {
  isTest: process.env.NODE_ENV === 'test',
  testTimeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
  mockDataPath: path.join(process.cwd(), 'tests', 'fixtures'),
  reportsPath: path.join(process.cwd(), 'tests', 'reports'),
  tempPath: path.join(process.cwd(), 'tests', 'temp')
};

// Test data generators
export class TestDataGenerator {
  static generateRandomString(length = 10) {
    return crypto.randomBytes(length).toString('hex').substring(0, length);
  }

  static generateRandomEmail() {
    const username = this.generateRandomString(8);
    const domain = this.generateRandomString(6);
    return `${username}@${domain}.test`;
  }

  static generateRandomTask() {
    const priorities = ['low', 'medium', 'high', 'critical'];
    const statuses = ['pending', 'in_progress', 'completed', 'blocked'];
    
    return {
      id: this.generateRandomString(8),
      title: `Test Task ${this.generateRandomString(6)}`,
      description: `Generated test task description ${this.generateRandomString(20)}`,
      priority: priorities[Math.floor(Math.random() * priorities.length)],
      status: statuses[Math.floor(Math.random() * statuses.length)],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignee: this.generateRandomEmail(),
      tags: this.generateRandomTags(),
      metadata: {
        complexity: Math.floor(Math.random() * 10) + 1,
        estimatedHours: Math.floor(Math.random() * 40) + 1
      }
    };
  }

  static generateRandomTags(count = 3) {
    const availableTags = ['frontend', 'backend', 'api', 'database', 'testing', 'security', 'performance', 'ui', 'ux', 'documentation'];
    const tags = [];
    
    for (let i = 0; i < count; i++) {
      const tag = availableTags[Math.floor(Math.random() * availableTags.length)];
      if (!tags.includes(tag)) {
        tags.push(tag);
      }
    }
    
    return tags;
  }

  static generateRandomUser() {
    const roles = ['admin', 'user', 'moderator', 'guest'];
    
    return {
      id: this.generateRandomString(8),
      username: `user_${this.generateRandomString(6)}`,
      email: this.generateRandomEmail(),
      role: roles[Math.floor(Math.random() * roles.length)],
      firstName: `FirstName${this.generateRandomString(4)}`,
      lastName: `LastName${this.generateRandomString(4)}`,
      isActive: Math.random() > 0.2, // 80% active users
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString() // Within last 30 days
    };
  }

  static generateRandomCodeSnippet(language = 'javascript') {
    const snippets = {
      javascript: [
        `function testFunction() {\n  console.log('Test function');\n  return true;\n}`,
        `const testVariable = '${this.generateRandomString(8)}';\nconsole.log(testVariable);`,
        `class TestClass {\n  constructor() {\n    this.value = ${Math.floor(Math.random() * 100)};\n  }\n}`
      ],
      python: [
        `def test_function():\n    print('Test function')\n    return True`,
        `test_variable = '${this.generateRandomString(8)}'\nprint(test_variable)`,
        `class TestClass:\n    def __init__(self):\n        self.value = ${Math.floor(Math.random() * 100)}`
      ],
      sql: [
        `SELECT * FROM tasks WHERE status = 'pending';`,
        `INSERT INTO users (username, email) VALUES ('${this.generateRandomString(6)}', '${this.generateRandomEmail()}');`,
        `UPDATE tasks SET status = 'completed' WHERE id = '${this.generateRandomString(8)}';`
      ]
    };

    const languageSnippets = snippets[language] || snippets.javascript;
    return languageSnippets[Math.floor(Math.random() * languageSnippets.length)];
  }

  static generateTestDataSet(type, count = 10) {
    const generators = {
      tasks: () => this.generateRandomTask(),
      users: () => this.generateRandomUser(),
      code: () => ({ language: 'javascript', code: this.generateRandomCodeSnippet() })
    };

    const generator = generators[type];
    if (!generator) {
      throw new Error(`Unknown test data type: ${type}`);
    }

    return Array.from({ length: count }, generator);
  }
}

// Mock service utilities
export class MockService {
  constructor(name, baseUrl = 'http://localhost:3000') {
    this.name = name;
    this.baseUrl = baseUrl;
    this.responses = new Map();
    this.requestLog = [];
  }

  mockResponse(endpoint, method = 'GET', response = {}) {
    const key = `${method.toUpperCase()}:${endpoint}`;
    this.responses.set(key, response);
  }

  async request(endpoint, method = 'GET', data = null) {
    const key = `${method.toUpperCase()}:${endpoint}`;
    
    // Log the request
    this.requestLog.push({
      timestamp: new Date().toISOString(),
      method,
      endpoint,
      data
    });

    // Return mocked response if available
    if (this.responses.has(key)) {
      const response = this.responses.get(key);
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      return response;
    }

    // Default response
    return {
      status: 200,
      data: { message: `Mock response for ${key}` }
    };
  }

  getRequestLog() {
    return [...this.requestLog];
  }

  clearRequestLog() {
    this.requestLog = [];
  }

  reset() {
    this.responses.clear();
    this.requestLog = [];
  }
}

// Performance measurement utilities
export class PerformanceTracker {
  constructor() {
    this.measurements = new Map();
    this.startTimes = new Map();
  }

  start(label) {
    this.startTimes.set(label, performance.now());
  }

  end(label) {
    const startTime = this.startTimes.get(label);
    if (!startTime) {
      throw new Error(`No start time found for label: ${label}`);
    }

    const duration = performance.now() - startTime;
    
    if (!this.measurements.has(label)) {
      this.measurements.set(label, []);
    }
    
    this.measurements.get(label).push(duration);
    this.startTimes.delete(label);
    
    return duration;
  }

  getStats(label) {
    const measurements = this.measurements.get(label);
    if (!measurements || measurements.length === 0) {
      return null;
    }

    const sorted = [...measurements].sort((a, b) => a - b);
    const sum = measurements.reduce((a, b) => a + b, 0);
    
    return {
      count: measurements.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / measurements.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  getAllStats() {
    const stats = {};
    for (const [label] of this.measurements) {
      stats[label] = this.getStats(label);
    }
    return stats;
  }

  reset() {
    this.measurements.clear();
    this.startTimes.clear();
  }
}

// Test environment utilities
export class TestEnvironment {
  static async setup() {
    // Ensure test directories exist
    await fs.ensureDir(TEST_ENV.mockDataPath);
    await fs.ensureDir(TEST_ENV.reportsPath);
    await fs.ensureDir(TEST_ENV.tempPath);

    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.SILENCE_CONSOLE = 'true';
    
    console.log('Test environment setup completed');
  }

  static async cleanup() {
    // Clean up temporary files
    try {
      await fs.remove(TEST_ENV.tempPath);
      await fs.ensureDir(TEST_ENV.tempPath);
    } catch (error) {
      console.warn('Failed to clean up temp directory:', error.message);
    }
    
    console.log('Test environment cleanup completed');
  }

  static async loadFixture(filename) {
    const fixturePath = path.join(TEST_ENV.mockDataPath, filename);
    
    try {
      const data = await fs.readJSON(fixturePath);
      return data;
    } catch (error) {
      throw new Error(`Failed to load fixture ${filename}: ${error.message}`);
    }
  }

  static async saveFixture(filename, data) {
    const fixturePath = path.join(TEST_ENV.mockDataPath, filename);
    
    try {
      await fs.writeJSON(fixturePath, data, { spaces: 2 });
    } catch (error) {
      throw new Error(`Failed to save fixture ${filename}: ${error.message}`);
    }
  }

  static async createTempFile(content, extension = '.tmp') {
    const filename = `temp_${TestDataGenerator.generateRandomString(8)}${extension}`;
    const filepath = path.join(TEST_ENV.tempPath, filename);
    
    await fs.writeFile(filepath, content);
    return filepath;
  }
}

// Retry utilities
export class RetryHelper {
  static async withRetry(fn, options = {}) {
    const {
      attempts = TEST_ENV.retryAttempts,
      delay = TEST_ENV.retryDelay,
      backoff = 1.5
    } = options;

    let lastError;
    
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt === attempts) {
          break;
        }
        
        const waitTime = delay * Math.pow(backoff, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    throw lastError;
  }

  static async waitFor(condition, options = {}) {
    const {
      timeout = TEST_ENV.testTimeout,
      interval = 1000,
      timeoutMessage = 'Condition not met within timeout'
    } = options;

    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return true;
      }
      
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error(timeoutMessage);
  }
}

// Assertion helpers
export class AssertionHelpers {
  static assertResponseTime(actualTime, maxTime, message = '') {
    if (actualTime > maxTime) {
      throw new Error(`Response time ${actualTime}ms exceeds maximum ${maxTime}ms. ${message}`);
    }
  }

  static assertMemoryUsage(actualUsage, maxUsage, message = '') {
    if (actualUsage > maxUsage) {
      throw new Error(`Memory usage ${actualUsage} bytes exceeds maximum ${maxUsage} bytes. ${message}`);
    }
  }

  static assertErrorRate(errorCount, totalCount, maxRate, message = '') {
    const actualRate = errorCount / totalCount;
    if (actualRate > maxRate) {
      throw new Error(`Error rate ${(actualRate * 100).toFixed(2)}% exceeds maximum ${(maxRate * 100).toFixed(2)}%. ${message}`);
    }
  }

  static assertCoverage(actualCoverage, minCoverage, message = '') {
    if (actualCoverage < minCoverage) {
      throw new Error(`Coverage ${(actualCoverage * 100).toFixed(2)}% is below minimum ${(minCoverage * 100).toFixed(2)}%. ${message}`);
    }
  }
}

// Database test utilities
export class DatabaseTestHelper {
  constructor(connectionString) {
    this.connectionString = connectionString;
    this.testData = [];
  }

  async createTestData(tableName, data) {
    // Implementation would depend on the actual database library
    // This is a placeholder for the interface
    this.testData.push({ table: tableName, data });
    return { id: TestDataGenerator.generateRandomString(8), ...data };
  }

  async cleanupTestData() {
    // Implementation would clean up all test data
    this.testData = [];
  }

  async executeQuery(query, params = []) {
    // Implementation would execute the actual query
    // This is a placeholder
    return { rows: [], rowCount: 0 };
  }

  async beginTransaction() {
    // Implementation would begin a database transaction
    return { commit: async () => {}, rollback: async () => {} };
  }
}

// API test utilities
export class APITestHelper {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.defaultHeaders = {
      'Content-Type': 'application/json'
    };
  }

  async get(endpoint, headers = {}) {
    return this.request('GET', endpoint, null, headers);
  }

  async post(endpoint, data, headers = {}) {
    return this.request('POST', endpoint, data, headers);
  }

  async put(endpoint, data, headers = {}) {
    return this.request('PUT', endpoint, data, headers);
  }

  async delete(endpoint, headers = {}) {
    return this.request('DELETE', endpoint, null, headers);
  }

  async request(method, endpoint, data = null, headers = {}) {
    const config = {
      method,
      url: `${this.baseUrl}${endpoint}`,
      headers: { ...this.defaultHeaders, ...headers },
      timeout: TEST_ENV.testTimeout
    };

    if (data) {
      config.data = data;
    }

    try {
      const response = await axios(config);
      return {
        status: response.status,
        data: response.data,
        headers: response.headers
      };
    } catch (error) {
      if (error.response) {
        return {
          status: error.response.status,
          data: error.response.data,
          headers: error.response.headers,
          error: true
        };
      }
      throw error;
    }
  }

  setAuthToken(token) {
    this.defaultHeaders.Authorization = `Bearer ${token}`;
  }

  clearAuthToken() {
    delete this.defaultHeaders.Authorization;
  }
}

// Test report utilities
export class TestReporter {
  constructor() {
    this.results = [];
    this.startTime = performance.now();
  }

  addResult(testName, result) {
    this.results.push({
      testName,
      result,
      timestamp: new Date().toISOString()
    });
  }

  async generateReport(filename = 'test_report.json') {
    const report = {
      timestamp: new Date().toISOString(),
      duration: performance.now() - this.startTime,
      totalTests: this.results.length,
      passedTests: this.results.filter(r => r.result.success).length,
      failedTests: this.results.filter(r => !r.result.success).length,
      results: this.results
    };

    const reportPath = path.join(TEST_ENV.reportsPath, filename);
    await fs.writeJSON(reportPath, report, { spaces: 2 });
    
    return report;
  }
}

// Export all utilities
export default {
  TEST_ENV,
  TestDataGenerator,
  MockService,
  PerformanceTracker,
  TestEnvironment,
  RetryHelper,
  AssertionHelpers,
  DatabaseTestHelper,
  APITestHelper,
  TestReporter
};

