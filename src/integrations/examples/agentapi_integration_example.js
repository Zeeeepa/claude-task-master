/**
 * @fileoverview AgentAPI Integration Example
 * @description Example usage of the AgentAPI integration components
 */

import { AgentAPIClient } from '../agentapi_client.js';
import { ClaudeCodeExecutor } from '../claude_code_executor.js';
import { WorkspaceManager } from '../workspace_manager.js';
import { AgentMonitor } from '../agent_monitor.js';
import { FileTracker } from '../file_tracker.js';
import { ResultParser } from '../result_parser.js';
import { generatePrompt } from '../prompt_templates.js';
import { getConfig } from '../config.js';

/**
 * Example task execution workflow
 */
export async function runTaskExecutionExample() {
  console.log('🚀 Starting AgentAPI Integration Example');
  
  try {
    // Get configuration
    const config = getConfig('development');
    console.log('📋 Configuration loaded');

    // Initialize components
    const agentAPI = new AgentAPIClient(config.agentAPI);
    const executor = new ClaudeCodeExecutor(config);
    const workspaceManager = new WorkspaceManager(config);
    const monitor = new AgentMonitor(config);
    const fileTracker = new FileTracker();
    const resultParser = new ResultParser();

    // Start monitoring
    monitor.start();
    console.log('📊 Monitoring started');

    // Example task
    const task = {
      id: 'example-task-001',
      title: 'Add input validation to user registration',
      description: 'Implement comprehensive input validation for the user registration form',
      type: 'feature',
      requirements: [
        'Validate email format',
        'Check password strength',
        'Sanitize user inputs',
        'Add error handling'
      ],
      acceptance_criteria: [
        'Email validation prevents invalid formats',
        'Password must meet complexity requirements',
        'All inputs are properly sanitized',
        'Clear error messages for validation failures'
      ],
      affected_files: [
        'src/auth/registration.js',
        'src/utils/validation.js',
        'tests/auth/registration.test.js'
      ]
    };

    console.log(`📝 Task: ${task.title}`);

    // Create workspace
    const workspace = await workspaceManager.createWorkspace(task.id, {
      repository: 'https://github.com/example/demo-app.git',
      branch: 'main',
      environment: {
        variables: {
          NODE_ENV: 'development'
        },
        dependencies: {
          nodePackages: ['validator', 'joi']
        }
      }
    });

    console.log(`🏗️ Workspace created: ${workspace.path}`);

    // Create file tracking snapshot
    await fileTracker.createSnapshot(task.id, workspace.path);
    console.log('📸 File snapshot created');

    // Generate prompt
    const prompt = generatePrompt(task);
    console.log('💭 Prompt generated');

    // Execute task
    console.log('⚡ Starting task execution...');
    const startTime = Date.now();
    
    const executionId = `exec-${task.id}-${Date.now()}`;
    const result = await executor.executeTask(task, executionId);
    
    const executionTime = Date.now() - startTime;
    console.log(`✅ Task completed in ${executionTime}ms`);

    // Record execution metrics
    monitor.recordTaskExecution(executionTime, true);

    // Parse results
    const messages = await agentAPI.getMessages();
    const parsedResults = resultParser.parse(messages);
    console.log('📊 Results parsed');

    // Detect file changes
    const changes = await fileTracker.detectChanges(task.id);
    console.log('🔍 File changes detected');

    // Generate reports
    const performanceReport = monitor.generatePerformanceReport();
    const changeReport = fileTracker.generateSummaryReport(task.id);
    const workspaceStats = await workspaceManager.getStatistics();

    // Display results
    console.log('\n📈 EXECUTION RESULTS:');
    console.log('='.repeat(50));
    
    console.log('\n🎯 Task Results:');
    console.log(`Summary: ${parsedResults.summary}`);
    console.log(`Files Modified: ${parsedResults.filesModified.length}`);
    console.log(`Files Created: ${parsedResults.filesCreated.length}`);
    console.log(`Commands Executed: ${parsedResults.commands.length}`);
    console.log(`Errors: ${parsedResults.errors.length}`);

    console.log('\n📁 File Changes:');
    console.log(`Total Changes: ${changes.summary.totalChanges}`);
    console.log(`Files Modified: ${changes.summary.filesModified}`);
    console.log(`Files Created: ${changes.summary.filesCreated}`);
    console.log(`Files Deleted: ${changes.summary.filesDeleted}`);
    console.log(`Lines Added: ${changes.summary.linesAdded}`);
    console.log(`Lines Removed: ${changes.summary.linesRemoved}`);

    console.log('\n⚡ Performance:');
    console.log(`Execution Time: ${executionTime}ms`);
    console.log(`Success Rate: ${performanceReport.summary.successRate}`);
    console.log(`Average Response Time: ${performanceReport.summary.averageResponseTime}`);

    console.log('\n🏗️ Workspace:');
    console.log(`Active Workspaces: ${workspaceStats.activeWorkspaces}`);
    console.log(`Disk Usage: ${workspaceStats.diskUsage?.total || 'unknown'}`);

    // Cleanup
    await workspaceManager.cleanupWorkspace(task.id);
    fileTracker.cleanup(task.id);
    monitor.stop();

    console.log('\n🧹 Cleanup completed');
    console.log('✨ Example execution finished successfully!');

    return {
      task,
      result,
      parsedResults,
      changes,
      performanceReport,
      executionTime
    };

  } catch (error) {
    console.error('❌ Example execution failed:', error);
    throw error;
  }
}

/**
 * Example health monitoring
 */
export async function runHealthMonitoringExample() {
  console.log('🏥 Starting Health Monitoring Example');

  const config = getConfig('development');
  const monitor = new AgentMonitor(config);

  // Set up event listeners
  monitor.on('health:check', (status) => {
    console.log(`🔍 Health Check: ${status.healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
    if (status.agentAPI.available) {
      console.log(`   AgentAPI: ${status.agentAPI.responseTime}ms response time`);
    } else {
      console.log(`   AgentAPI: ❌ Unavailable - ${status.agentAPI.error}`);
    }
  });

  monitor.on('health:alerts', (alerts) => {
    console.log(`🚨 Alerts: ${alerts.length} active`);
    alerts.forEach(alert => {
      console.log(`   ${alert.severity.toUpperCase()}: ${alert.message}`);
    });
  });

  monitor.on('performance:report', (report) => {
    console.log('📊 Performance Report:');
    console.log(`   Uptime: ${Math.round(report.summary.uptime / 1000)}s`);
    console.log(`   Success Rate: ${report.summary.successRate}`);
    console.log(`   Error Rate: ${report.summary.errorRate}`);
    console.log(`   Avg Response Time: ${report.summary.averageResponseTime}`);
  });

  // Start monitoring
  monitor.start();

  // Run for 2 minutes
  console.log('⏱️ Monitoring for 2 minutes...');
  await new Promise(resolve => setTimeout(resolve, 120000));

  // Stop monitoring
  monitor.stop();
  console.log('🏁 Health monitoring example completed');

  return monitor.getMetrics();
}

/**
 * Example error handling and recovery
 */
export async function runErrorHandlingExample() {
  console.log('🛡️ Starting Error Handling Example');

  const config = getConfig('development');
  const agentAPI = new AgentAPIClient(config.agentAPI);

  try {
    // Test normal operation
    console.log('✅ Testing normal operation...');
    const health = await agentAPI.getHealth();
    console.log(`Health status: ${health.status}`);

    // Test with invalid endpoint (should trigger error handling)
    console.log('❌ Testing error handling...');
    const invalidClient = new AgentAPIClient({
      ...config.agentAPI,
      baseURL: 'http://invalid-endpoint:9999'
    });

    try {
      await invalidClient.getStatus();
    } catch (error) {
      console.log(`Expected error caught: ${error.message}`);
    }

    // Test circuit breaker
    console.log('🔌 Testing circuit breaker...');
    const cbStatus = agentAPI.getCircuitBreakerStatus();
    console.log(`Circuit breaker state: ${cbStatus.state}`);
    console.log(`Failures: ${cbStatus.failures}`);

    console.log('✨ Error handling example completed');

  } catch (error) {
    console.error('❌ Error handling example failed:', error);
    throw error;
  }
}

/**
 * Example workspace management
 */
export async function runWorkspaceManagementExample() {
  console.log('🏗️ Starting Workspace Management Example');

  const config = getConfig('development');
  const workspaceManager = new WorkspaceManager(config);

  try {
    // Create multiple workspaces
    const workspaces = [];
    
    for (let i = 1; i <= 3; i++) {
      const workspace = await workspaceManager.createWorkspace(`task-${i}`, {
        environment: {
          variables: {
            TASK_ID: `task-${i}`,
            NODE_ENV: 'development'
          }
        }
      });
      workspaces.push(workspace);
      console.log(`📁 Created workspace ${i}: ${workspace.path}`);
    }

    // Get statistics
    const stats = await workspaceManager.getStatistics();
    console.log('\n📊 Workspace Statistics:');
    console.log(`Active workspaces: ${stats.activeWorkspaces}`);
    console.log(`Max concurrent: ${stats.maxConcurrent}`);
    console.log(`Base path: ${stats.basePath}`);

    // List workspaces
    console.log('\n📋 Active Workspaces:');
    stats.workspaces.forEach(ws => {
      console.log(`   ${ws.id}: ${ws.status} (created ${ws.createdAt})`);
    });

    // Cleanup all workspaces
    console.log('\n🧹 Cleaning up workspaces...');
    await workspaceManager.cleanupAll();

    console.log('✨ Workspace management example completed');

  } catch (error) {
    console.error('❌ Workspace management example failed:', error);
    throw error;
  }
}

/**
 * Run all examples
 */
export async function runAllExamples() {
  console.log('🎬 Running All AgentAPI Integration Examples');
  console.log('='.repeat(60));

  try {
    // Run examples in sequence
    await runHealthMonitoringExample();
    console.log('\n' + '-'.repeat(60) + '\n');
    
    await runErrorHandlingExample();
    console.log('\n' + '-'.repeat(60) + '\n');
    
    await runWorkspaceManagementExample();
    console.log('\n' + '-'.repeat(60) + '\n');
    
    // Note: Task execution example requires actual AgentAPI server
    console.log('ℹ️ Task execution example requires AgentAPI server to be running');
    console.log('   To run: npm run agentapi:example');

    console.log('\n🎉 All examples completed successfully!');

  } catch (error) {
    console.error('❌ Examples failed:', error);
    process.exit(1);
  }
}

// Export individual functions for selective testing
export default {
  runTaskExecutionExample,
  runHealthMonitoringExample,
  runErrorHandlingExample,
  runWorkspaceManagementExample,
  runAllExamples
};

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples().catch(console.error);
}

