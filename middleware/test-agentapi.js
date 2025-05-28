#!/usr/bin/env node

/**
 * AgentAPI Middleware Test Suite
 * 
 * Comprehensive testing for the AgentAPI middleware implementation
 * Tests all major components and functionality
 */

import { AgentAPIServer } from './agentapi/server.js';
import { AgentManager } from './agentapi/agent-manager.js';
import { PRDeploymentService } from './agentapi/pr-deployment.js';
import { StateManager } from './agentapi/state-manager.js';
import { ErrorHandler } from './agentapi/error-handler.js';
import { HealthMonitor } from './agentapi/health-monitor.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AgentAPITester {
  constructor() {
    this.testResults = [];
    this.testWorkspace = '/tmp/agentapi-test';
  }

  async runAllTests() {
    console.log('🧪 Starting AgentAPI Middleware Test Suite\n');

    try {
      await this.setupTestEnvironment();
      
      await this.testAgentManager();
      await this.testPRDeploymentService();
      await this.testStateManager();
      await this.testErrorHandler();
      await this.testHealthMonitor();
      await this.testServerIntegration();
      
      await this.cleanupTestEnvironment();
      
      this.printResults();
    } catch (error) {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    }
  }

  async setupTestEnvironment() {
    console.log('🔧 Setting up test environment...');
    
    // Create test workspace
    await fs.mkdir(this.testWorkspace, { recursive: true });
    
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.WORKSPACE_ROOT = this.testWorkspace;
    process.env.STATE_FILE = path.join(this.testWorkspace, 'test-state.json');
    process.env.LOG_LEVEL = 'error';
    
    console.log('✅ Test environment ready\n');
  }

  async cleanupTestEnvironment() {
    console.log('🧹 Cleaning up test environment...');
    
    try {
      await fs.rm(this.testWorkspace, { recursive: true, force: true });
      console.log('✅ Cleanup completed\n');
    } catch (error) {
      console.warn('⚠️ Cleanup warning:', error.message);
    }
  }

  async testAgentManager() {
    console.log('🤖 Testing Agent Manager...');
    
    try {
      const agentManager = new AgentManager();
      
      // Test 1: Check supported agent types
      this.assert(
        agentManager.getSupportedTypes().includes('claude'),
        'Agent Manager should support Claude'
      );
      
      // Test 2: Validate agent configuration
      const claudeConfig = agentManager.getAgentConfig('claude');
      this.assert(
        claudeConfig && claudeConfig.command === 'claude',
        'Claude configuration should be valid'
      );
      
      // Test 3: Invalid agent type
      this.assert(
        !agentManager.isValidAgentType('invalid-agent'),
        'Should reject invalid agent types'
      );
      
      // Test 4: Agent status tracking
      const statuses = agentManager.getAgentStatuses();
      this.assert(
        typeof statuses === 'object',
        'Should return agent statuses object'
      );
      
      console.log('✅ Agent Manager tests passed');
    } catch (error) {
      this.recordFailure('Agent Manager', error);
    }
  }

  async testPRDeploymentService() {
    console.log('🚀 Testing PR Deployment Service...');
    
    try {
      const prService = new PRDeploymentService(this.testWorkspace);
      
      // Test 1: Workspace creation
      const testWorkspaceId = 'test-workspace-123';
      const workspace = {
        id: testWorkspaceId,
        path: path.join(this.testWorkspace, testWorkspaceId),
        status: 'active',
        createdAt: new Date().toISOString(),
      };
      
      // Test 2: Validation rules
      const validationResult = await prService.runValidationRule(
        workspace,
        'syntax-check',
        'claude'
      );
      
      this.assert(
        validationResult && typeof validationResult.rule === 'string',
        'Validation should return structured result'
      );
      
      // Test 3: Error fix generation
      const testError = {
        type: 'syntax',
        message: 'Test syntax error',
      };
      
      const fix = await prService.generateErrorFix(workspace, testError, 'claude');
      this.assert(
        fix && fix.suggestedFix,
        'Should generate error fix suggestions'
      );
      
      console.log('✅ PR Deployment Service tests passed');
    } catch (error) {
      this.recordFailure('PR Deployment Service', error);
    }
  }

  async testStateManager() {
    console.log('💾 Testing State Manager...');
    
    try {
      const stateManager = new StateManager({
        stateFile: path.join(this.testWorkspace, 'test-state.json'),
        persistInterval: 1000,
      });
      
      await stateManager.initialize();
      
      // Test 1: Agent tracking
      const testAgentId = 'test-agent-123';
      const agentData = {
        type: 'claude',
        workspaceId: 'test-workspace',
        status: 'running',
      };
      
      stateManager.trackAgent(testAgentId, agentData);
      const retrievedAgent = stateManager.getAgent(testAgentId);
      
      this.assert(
        retrievedAgent && retrievedAgent.type === 'claude',
        'Should track and retrieve agent data'
      );
      
      // Test 2: Deployment tracking
      const testDeployment = {
        id: 'test-deployment-123',
        workspaceId: 'test-workspace',
        status: 'deploying',
      };
      
      stateManager.trackDeployment(testDeployment);
      const retrievedDeployment = stateManager.getDeployment(testDeployment.id);
      
      this.assert(
        retrievedDeployment && retrievedDeployment.status === 'deploying',
        'Should track and retrieve deployment data'
      );
      
      // Test 3: Metrics
      const metrics = stateManager.getMetrics();
      this.assert(
        metrics && typeof metrics.activeAgents === 'number',
        'Should provide metrics data'
      );
      
      // Test 4: History
      const history = stateManager.getHistory(10);
      this.assert(
        Array.isArray(history),
        'Should provide history array'
      );
      
      await stateManager.shutdown();
      console.log('✅ State Manager tests passed');
    } catch (error) {
      this.recordFailure('State Manager', error);
    }
  }

  async testErrorHandler() {
    console.log('🚨 Testing Error Handler...');
    
    try {
      const errorHandler = new ErrorHandler();
      
      // Test 1: Error classification
      const testError = new Error('git clone failed: repository not found');
      const errorResponse = errorHandler.handleError(testError);
      
      this.assert(
        errorResponse.category === 'git',
        'Should classify git errors correctly'
      );
      
      // Test 2: Recovery strategy
      const recovery = errorHandler.getRecoveryStrategy('agent_timeout');
      this.assert(
        recovery && recovery.strategy === 'restart_agent',
        'Should provide recovery strategies'
      );
      
      // Test 3: Error statistics
      const stats = errorHandler.getErrorStatistics();
      this.assert(
        typeof stats.totalErrors === 'number',
        'Should provide error statistics'
      );
      
      // Test 4: Health status
      const health = errorHandler.getHealthStatus();
      this.assert(
        health && typeof health.status === 'string',
        'Should provide health status'
      );
      
      console.log('✅ Error Handler tests passed');
    } catch (error) {
      this.recordFailure('Error Handler', error);
    }
  }

  async testHealthMonitor() {
    console.log('🏥 Testing Health Monitor...');
    
    try {
      const healthMonitor = new HealthMonitor({
        checkInterval: 1000,
        metricsRetention: 60000,
      });
      
      // Test 1: System metrics collection
      const metrics = await healthMonitor.collectSystemMetrics();
      this.assert(
        metrics && metrics.cpu && metrics.memory,
        'Should collect system metrics'
      );
      
      // Test 2: Threshold checking
      await healthMonitor.checkThresholds(metrics, new Date().toISOString());
      
      // Test 3: Performance report
      const report = healthMonitor.getPerformanceReport();
      this.assert(
        report && (report.error || report.cpu),
        'Should generate performance report'
      );
      
      // Test 4: Current status
      const status = healthMonitor.getCurrentSystemStatus();
      this.assert(
        status && typeof status.status === 'string',
        'Should provide current system status'
      );
      
      console.log('✅ Health Monitor tests passed');
    } catch (error) {
      this.recordFailure('Health Monitor', error);
    }
  }

  async testServerIntegration() {
    console.log('🌐 Testing Server Integration...');
    
    try {
      // Test 1: Server instantiation
      const server = new AgentAPIServer({
        port: 0, // Use random available port
        workspaceRoot: this.testWorkspace,
      });
      
      this.assert(
        server && typeof server.start === 'function',
        'Should create server instance'
      );
      
      // Test 2: Configuration validation
      const config = server.agentManager.getSupportedTypes();
      this.assert(
        Array.isArray(config) && config.length > 0,
        'Should have valid agent configuration'
      );
      
      console.log('✅ Server Integration tests passed');
    } catch (error) {
      this.recordFailure('Server Integration', error);
    }
  }

  assert(condition, message) {
    if (condition) {
      this.testResults.push({ status: 'pass', message });
    } else {
      this.testResults.push({ status: 'fail', message });
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  recordFailure(testName, error) {
    this.testResults.push({
      status: 'fail',
      message: `${testName}: ${error.message}`,
    });
    console.log(`❌ ${testName} tests failed:`, error.message);
  }

  printResults() {
    console.log('📊 Test Results Summary\n');
    
    const passed = this.testResults.filter(r => r.status === 'pass').length;
    const failed = this.testResults.filter(r => r.status === 'fail').length;
    const total = this.testResults.length;
    
    console.log(`Total Tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Success Rate: ${((passed / total) * 100).toFixed(1)}%\n`);
    
    if (failed > 0) {
      console.log('Failed Tests:');
      this.testResults
        .filter(r => r.status === 'fail')
        .forEach(r => console.log(`  ❌ ${r.message}`));
      console.log();
    }
    
    if (failed === 0) {
      console.log('🎉 All tests passed! AgentAPI middleware is ready for deployment.');
    } else {
      console.log('⚠️ Some tests failed. Please review and fix issues before deployment.');
      process.exit(1);
    }
  }
}

// Performance test
async function performanceTest() {
  console.log('⚡ Running Performance Tests...\n');
  
  const iterations = 100;
  const startTime = Date.now();
  
  // Test agent manager performance
  const agentManager = new AgentManager();
  for (let i = 0; i < iterations; i++) {
    agentManager.getSupportedTypes();
    agentManager.getAgentConfig('claude');
  }
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  console.log(`Performance Results:`);
  console.log(`  Iterations: ${iterations}`);
  console.log(`  Duration: ${duration}ms`);
  console.log(`  Average: ${(duration / iterations).toFixed(2)}ms per operation`);
  console.log(`  Throughput: ${(iterations / (duration / 1000)).toFixed(0)} ops/sec\n`);
}

// Memory test
async function memoryTest() {
  console.log('🧠 Running Memory Tests...\n');
  
  const initialMemory = process.memoryUsage();
  
  // Create multiple instances to test memory usage
  const instances = [];
  for (let i = 0; i < 10; i++) {
    instances.push(new AgentManager());
    instances.push(new ErrorHandler());
  }
  
  const afterCreation = process.memoryUsage();
  
  // Clean up
  instances.length = 0;
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
  
  const afterCleanup = process.memoryUsage();
  
  console.log('Memory Usage:');
  console.log(`  Initial RSS: ${(initialMemory.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  After Creation: ${(afterCreation.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  After Cleanup: ${(afterCleanup.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Memory Increase: ${((afterCreation.rss - initialMemory.rss) / 1024 / 1024).toFixed(2)} MB\n`);
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--performance')) {
    await performanceTest();
    return;
  }
  
  if (args.includes('--memory')) {
    await memoryTest();
    return;
  }
  
  if (args.includes('--help')) {
    console.log('AgentAPI Middleware Test Suite\n');
    console.log('Usage: node test-agentapi.js [options]\n');
    console.log('Options:');
    console.log('  --performance  Run performance tests');
    console.log('  --memory       Run memory tests');
    console.log('  --help         Show this help message');
    console.log('\nDefault: Run full test suite');
    return;
  }
  
  // Run full test suite
  const tester = new AgentAPITester();
  await tester.runAllTests();
  
  // Run additional tests if requested
  if (args.includes('--all')) {
    await performanceTest();
    await memoryTest();
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run tests
main().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});

