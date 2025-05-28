/**
 * @fileoverview Database Usage Examples
 * @description Demonstrates how to use the database system for the AI CI/CD system
 */

import { DatabaseConnectionManager } from '../connection_manager.js';
import { createConnectionConfig } from '../config.js';
import { Task } from '../models/task.js';
import { TaskExecution } from '../models/execution.js';
import { PRValidation } from '../models/validation.js';
import { Migration001InitialSchema } from '../migrations/001_initial_schema.js';

/**
 * Basic database usage example
 */
export async function basicDatabaseUsage() {
  console.log('🗄️ Basic Database Usage Example');
  console.log('================================');
  
  // Initialize connection manager
  const config = createConnectionConfig('development');
  const connectionManager = new DatabaseConnectionManager(config);
  
  try {
    // Initialize connection
    console.log('📡 Initializing database connection...');
    await connectionManager.initialize();
    
    // Check health
    const health = await connectionManager.healthCheck();
    console.log('💚 Database health:', health.healthy ? 'Healthy' : 'Unhealthy');
    
    // Create a simple task
    console.log('📝 Creating a new task...');
    const task = await Task.create(connectionManager, {
      title: 'Implement user authentication',
      description: 'Add OAuth2 authentication with GitHub provider',
      requirements: {
        auth_provider: 'github',
        scopes: ['user:email', 'read:user'],
        redirect_uri: 'http://localhost:3000/auth/callback'
      },
      priority: 7,
      assigned_to: 'developer@example.com'
    });
    
    console.log('✅ Task created:', {
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority
    });
    
    // Find tasks
    console.log('🔍 Finding pending tasks...');
    const pendingTasks = await Task.findBy(connectionManager, {
      status: 'pending'
    }, {
      limit: 5,
      orderBy: 'priority DESC'
    });
    
    console.log(`📋 Found ${pendingTasks.length} pending tasks`);
    
    // Get statistics
    const stats = await Task.getStatistics(connectionManager);
    console.log('📊 Task statistics:', stats);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await connectionManager.close();
    console.log('🔌 Database connection closed');
  }
}

/**
 * Advanced database usage with task execution
 */
export async function advancedDatabaseUsage() {
  console.log('🚀 Advanced Database Usage Example');
  console.log('==================================');
  
  const config = createConnectionConfig('development');
  const connectionManager = new DatabaseConnectionManager(config);
  
  try {
    await connectionManager.initialize();
    
    // Create a task
    console.log('📝 Creating task with execution workflow...');
    const task = await Task.create(connectionManager, {
      title: 'Generate API documentation',
      description: 'Auto-generate OpenAPI documentation from code',
      requirements: {
        format: 'openapi-3.0',
        output_path: './docs/api.yaml',
        include_examples: true
      },
      priority: 5,
      created_by: 'system@example.com'
    });
    
    // Create task execution
    console.log('⚙️ Creating task execution...');
    const execution = await TaskExecution.create(connectionManager, {
      task_id: task.id,
      agent_type: 'claude-code',
      agent_config: {
        model: 'claude-3-sonnet-20241022',
        temperature: 0.1,
        max_tokens: 4000
      }
    });
    
    // Start execution
    console.log('▶️ Starting execution...');
    await execution.start(connectionManager);
    
    // Add some logs
    await execution.addLog(connectionManager, {
      level: 'info',
      message: 'Analyzing codebase structure',
      details: { files_scanned: 45, endpoints_found: 12 }
    });
    
    await execution.addLog(connectionManager, {
      level: 'info',
      message: 'Generating OpenAPI specification',
      details: { schemas_created: 8, paths_documented: 12 }
    });
    
    // Complete execution
    console.log('✅ Completing execution...');
    await execution.complete(connectionManager, [
      {
        level: 'success',
        message: 'API documentation generated successfully',
        details: { output_file: './docs/api.yaml', size_kb: 45 }
      }
    ]);
    
    // Update task status
    await task.updateStatus(connectionManager, 'completed');
    
    console.log('🎉 Task execution completed successfully!');
    
    // Get execution statistics
    const execStats = await TaskExecution.getStatistics(connectionManager);
    console.log('📊 Execution statistics:', execStats);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await connectionManager.close();
  }
}

/**
 * PR validation workflow example
 */
export async function prValidationWorkflow() {
  console.log('🔍 PR Validation Workflow Example');
  console.log('=================================');
  
  const config = createConnectionConfig('development');
  const connectionManager = new DatabaseConnectionManager(config);
  
  try {
    await connectionManager.initialize();
    
    // Create a task for PR validation
    const task = await Task.create(connectionManager, {
      title: 'Validate PR #123: Add user profile feature',
      description: 'Automated validation of pull request changes',
      requirements: {
        pr_number: 123,
        repository: 'company/web-app',
        branch: 'feature/user-profile',
        checks: ['tests', 'linting', 'security', 'performance']
      },
      priority: 8,
      created_by: 'github-webhook'
    });
    
    // Create execution for validation
    const execution = await TaskExecution.create(connectionManager, {
      task_id: task.id,
      agent_type: 'validation-engine',
      agent_config: {
        timeout: 300000,
        parallel_checks: true,
        fail_fast: false
      }
    });
    
    // Create PR validation record
    console.log('📋 Creating PR validation record...');
    const validation = await PRValidation.create(connectionManager, {
      task_id: task.id,
      execution_id: execution.id,
      pr_number: 123,
      repository: 'company/web-app',
      branch_name: 'feature/user-profile',
      webhook_payload: {
        action: 'opened',
        pull_request: {
          id: 123,
          title: 'Add user profile feature',
          user: { login: 'developer' },
          head: { sha: 'abc123def456' }
        }
      }
    });
    
    // Start validation
    await execution.start(connectionManager);
    await validation.updateStatus(connectionManager, 'running');
    
    // Simulate validation checks
    console.log('🧪 Running validation checks...');
    
    // Test results
    await validation.addValidationResult(connectionManager, 'tests', {
      status: 'passed',
      duration: 45000,
      details: {
        total: 156,
        passed: 154,
        failed: 0,
        skipped: 2,
        coverage: 94.2
      }
    });
    
    // Linting results
    await validation.addValidationResult(connectionManager, 'linting', {
      status: 'passed',
      duration: 8000,
      details: {
        files_checked: 23,
        issues_found: 0,
        warnings: 2
      }
    });
    
    // Security scan results
    await validation.addValidationResult(connectionManager, 'security', {
      status: 'passed',
      duration: 120000,
      details: {
        vulnerabilities: 0,
        dependencies_scanned: 145,
        license_issues: 0
      }
    });
    
    // Performance check results
    await validation.addValidationResult(connectionManager, 'performance', {
      status: 'passed',
      duration: 30000,
      details: {
        bundle_size_increase: '2.3%',
        load_time_impact: '+15ms',
        memory_usage: 'within limits'
      }
    });
    
    // Complete validation
    console.log('✅ All checks passed!');
    await validation.updateStatus(connectionManager, 'passed', {
      overall_score: 98,
      recommendation: 'approve',
      summary: 'All validation checks passed successfully'
    });
    
    await execution.complete(connectionManager);
    await task.updateStatus(connectionManager, 'completed');
    
    // Get validation summary
    const summary = validation.getValidationSummary();
    console.log('📊 Validation summary:', summary);
    
    // Get PR validation statistics
    const prStats = await PRValidation.getStatistics(connectionManager);
    console.log('📈 PR validation statistics:', prStats);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await connectionManager.close();
  }
}

/**
 * Database migration example
 */
export async function migrationExample() {
  console.log('🔄 Database Migration Example');
  console.log('=============================');
  
  const config = createConnectionConfig('development');
  const connectionManager = new DatabaseConnectionManager(config);
  
  try {
    await connectionManager.initialize();
    
    // Initialize migration
    const migration = new Migration001InitialSchema();
    
    // Check if migration is applied
    console.log('🔍 Checking migration status...');
    const isApplied = await migration.isApplied(connectionManager);
    console.log('Migration applied:', isApplied);
    
    if (!isApplied) {
      console.log('📦 Applying initial schema migration...');
      await migration.up(connectionManager);
      console.log('✅ Migration applied successfully');
    }
    
    // Validate migration
    console.log('🔍 Validating migration...');
    const validation = await migration.validate(connectionManager);
    
    if (validation.valid) {
      console.log('✅ Migration validation passed');
      if (validation.warnings.length > 0) {
        console.log('⚠️ Warnings:', validation.warnings);
      }
    } else {
      console.log('❌ Migration validation failed:', validation.errors);
    }
    
  } catch (error) {
    console.error('❌ Migration error:', error.message);
  } finally {
    await connectionManager.close();
  }
}

/**
 * Performance monitoring example
 */
export async function performanceMonitoring() {
  console.log('📊 Performance Monitoring Example');
  console.log('=================================');
  
  const config = createConnectionConfig('development');
  const connectionManager = new DatabaseConnectionManager(config);
  
  try {
    await connectionManager.initialize();
    
    console.log('🏃 Running performance test...');
    
    // Execute multiple concurrent queries
    const startTime = Date.now();
    const promises = Array.from({ length: 50 }, (_, i) => 
      connectionManager.executeQuery('SELECT $1 as test_value, NOW() as timestamp', [i])
    );
    
    const results = await Promise.all(promises);
    const endTime = Date.now();
    
    console.log(`⚡ Executed ${results.length} concurrent queries in ${endTime - startTime}ms`);
    
    // Get detailed statistics
    const stats = connectionManager.getStats();
    console.log('📈 Performance metrics:', {
      totalQueries: stats.totalQueries,
      successRate: `${stats.successRate.toFixed(2)}%`,
      avgExecutionTime: `${stats.avgExecutionTime.toFixed(2)}ms`,
      slowQueries: stats.slowQueries,
      poolUtilization: {
        total: stats.pool.totalCount,
        idle: stats.pool.idleCount,
        waiting: stats.pool.waitingCount
      }
    });
    
    // Health check
    const health = await connectionManager.healthCheck();
    console.log('💚 Health check:', {
      healthy: health.healthy,
      responseTime: `${health.responseTime}ms`,
      lastCheck: health.timestamp
    });
    
  } catch (error) {
    console.error('❌ Performance test error:', error.message);
  } finally {
    await connectionManager.close();
  }
}

/**
 * Run all examples
 */
export async function runAllExamples() {
  console.log('🎯 Running All Database Examples');
  console.log('================================\n');
  
  try {
    await basicDatabaseUsage();
    console.log('\n');
    
    await advancedDatabaseUsage();
    console.log('\n');
    
    await prValidationWorkflow();
    console.log('\n');
    
    await migrationExample();
    console.log('\n');
    
    await performanceMonitoring();
    console.log('\n');
    
    console.log('🎉 All examples completed successfully!');
    
  } catch (error) {
    console.error('❌ Example execution failed:', error.message);
    process.exit(1);
  }
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples();
}

