/**
 * @fileoverview Codegen Integration Example
 * @description Example usage of the Codegen Natural Language Processing & PR Generation system
 */

import { CodegenIntegrationSystem } from '../codegen/index.js';
import { log } from '../utils/logger.js';

/**
 * Example: Basic PR Generation
 */
async function basicPRGenerationExample() {
  console.log('\n=== Basic PR Generation Example ===\n');

  try {
    // Create system with default configuration
    const system = CodegenIntegrationSystem.createWithDefaults({
      // Override specific settings
      quality: {
        qualityThreshold: 0.7, // Lower threshold for demo
        enableLinting: false   // Disable linting for demo
      },
      codegen: {
        enableMock: true // Use mock mode for demo
      }
    });

    // Initialize the system
    await system.initialize();

    // Example task data (as would come from PostgreSQL database)
    const taskData = {
      id: 'task-001',
      title: 'Implement user authentication system',
      description: `
        Create a comprehensive user authentication system with the following requirements:
        
        1. User registration with email validation
        2. Secure password hashing using bcrypt
        3. JWT token-based authentication
        4. Password reset functionality
        5. Rate limiting for login attempts
        6. Session management
        
        The system should be built using Node.js and Express.js, with proper error handling
        and comprehensive testing. Include middleware for protecting routes and validating tokens.
      `,
      type: 'feature_implementation',
      priority: 'high',
      complexity_score: 7,
      estimated_hours: 16,
      acceptance_criteria: [
        'Users can register with email and password',
        'Passwords are securely hashed',
        'JWT tokens are generated on login',
        'Protected routes require valid tokens',
        'Password reset works via email',
        'Rate limiting prevents brute force attacks'
      ],
      requirements: [
        {
          type: 'functional',
          description: 'User registration and login functionality',
          priority: 'high'
        },
        {
          type: 'technical',
          description: 'Use JWT for token-based authentication',
          priority: 'high'
        },
        {
          type: 'security',
          description: 'Implement rate limiting and secure password hashing',
          priority: 'high'
        }
      ],
      affected_files: [
        'src/auth/auth.js',
        'src/auth/middleware.js',
        'src/routes/auth.js',
        'tests/auth.test.js'
      ],
      metadata: {
        created_by: 'product_manager',
        created_at: new Date().toISOString()
      }
    };

    // Process the task and generate PR
    const result = await system.processTask(taskData);

    console.log('✅ PR Generation Result:');
    console.log(`   Task ID: ${result.taskId}`);
    console.log(`   Workflow ID: ${result.workflowId}`);
    console.log(`   Success: ${result.success}`);
    console.log(`   Processing Time: ${result.processingTime}ms`);
    
    if (result.result.pr) {
      console.log(`   PR URL: ${result.result.pr.url}`);
      console.log(`   Branch: ${result.result.branch.name}`);
    }

    // Get system metrics
    const metrics = system.getMetrics();
    console.log('\n📊 System Metrics:');
    console.log(`   Tasks Processed: ${metrics.tasksProcessed}`);
    console.log(`   PRs Generated: ${metrics.prsGenerated}`);
    console.log(`   Success Rate: ${(metrics.successRate * 100).toFixed(1)}%`);
    console.log(`   Quality Score: ${(metrics.qualityScore * 100).toFixed(1)}%`);

    return result;
  } catch (error) {
    console.error('❌ Basic PR Generation failed:', error.message);
    throw error;
  }
}

/**
 * Example: Batch Processing
 */
async function batchProcessingExample() {
  console.log('\n=== Batch Processing Example ===\n');

  try {
    const system = CodegenIntegrationSystem.createWithDefaults({
      codegen: { enableMock: true }
    });

    await system.initialize();

    // Multiple tasks for batch processing
    const tasks = [
      {
        id: 'task-002',
        title: 'Fix memory leak in data processor',
        description: 'Identify and fix memory leak causing performance degradation',
        type: 'bug_fix',
        priority: 'high'
      },
      {
        id: 'task-003',
        title: 'Add unit tests for payment module',
        description: 'Create comprehensive unit tests for payment processing',
        type: 'testing',
        priority: 'medium'
      },
      {
        id: 'task-004',
        title: 'Optimize database queries',
        description: 'Improve performance of slow database queries',
        type: 'optimization',
        priority: 'medium'
      }
    ];

    // Process tasks in batch
    const batchResult = await system.batchProcessTasks(tasks, {
      maxConcurrency: 2
    });

    console.log('✅ Batch Processing Result:');
    console.log(`   Total Tasks: ${batchResult.totalTasks}`);
    console.log(`   Successful: ${batchResult.successful}`);
    console.log(`   Failed: ${batchResult.failed}`);
    console.log(`   Processing Time: ${batchResult.processingTime}ms`);

    // Show individual results
    batchResult.results.forEach((result, index) => {
      console.log(`   Task ${index + 1}: ${result.success ? '✅' : '❌'} ${result.taskId}`);
    });

    return batchResult;
  } catch (error) {
    console.error('❌ Batch Processing failed:', error.message);
    throw error;
  }
}

/**
 * Example: Component Usage
 */
async function componentUsageExample() {
  console.log('\n=== Component Usage Example ===\n');

  try {
    const system = CodegenIntegrationSystem.createWithDefaults();
    await system.initialize();

    // Example: Using Natural Language Processor directly
    const nlpProcessor = system.getComponent('nlpProcessor');
    
    const taskData = {
      id: 'task-005',
      title: 'Refactor legacy code',
      description: 'Modernize old JavaScript code to use ES6+ features',
      type: 'code_refactor'
    };

    const processedTask = await nlpProcessor.processTask(taskData);
    
    console.log('🧠 NLP Processing Result:');
    console.log(`   Classification: ${processedTask.classification.type}`);
    console.log(`   Confidence: ${(processedTask.classification.confidence * 100).toFixed(1)}%`);
    console.log(`   Functional Requirements: ${processedTask.requirements.functional.length}`);
    console.log(`   Technical Requirements: ${processedTask.requirements.technical.length}`);

    // Example: Using Template Manager directly
    const templateManager = system.getComponent('templateManager');
    
    const template = await templateManager.getTemplate('code_generation', {
      task_description: taskData.description,
      requirements: 'Modernize JavaScript code',
      repository_name: 'example-repo',
      branch_name: 'refactor-legacy-code'
    });

    console.log('\n📝 Template Processing:');
    console.log(`   Template Length: ${template.length} characters`);
    console.log(`   Contains Variables: ${template.includes('{{') ? 'No' : 'Yes'}`);

    // Example: Using Code Quality Validator directly
    const qualityValidator = system.getComponent('qualityValidator');
    
    // Mock file for validation
    const mockFiles = ['src/example.js'];
    
    // This would normally validate real files
    console.log('\n🔍 Quality Validation:');
    console.log(`   Files to validate: ${mockFiles.length}`);
    console.log(`   Quality threshold: ${qualityValidator.qualityThreshold}`);
    console.log(`   Linting enabled: ${qualityValidator.enableLinting}`);

    return { processedTask, template };
  } catch (error) {
    console.error('❌ Component Usage failed:', error.message);
    throw error;
  }
}

/**
 * Example: Health Monitoring
 */
async function healthMonitoringExample() {
  console.log('\n=== Health Monitoring Example ===\n');

  try {
    const system = CodegenIntegrationSystem.createWithDefaults();
    await system.initialize();

    // Get health status
    const health = await system.getHealthStatus();
    
    console.log('🏥 System Health:');
    console.log(`   Status: ${health.status}`);
    console.log(`   Initialized: ${health.initialized}`);
    console.log(`   Uptime: ${Math.round(health.uptime / 1000)}s`);

    // Show component health
    console.log('\n🔧 Component Health:');
    Object.entries(health.components).forEach(([name, status]) => {
      const icon = status.status === 'healthy' ? '✅' : 
                   status.status === 'degraded' ? '⚠️' : '❌';
      console.log(`   ${icon} ${name}: ${status.status || 'unknown'}`);
    });

    // Get detailed metrics
    const metrics = system.getMetrics();
    console.log('\n📈 Detailed Metrics:');
    console.log(`   Tasks Processed: ${metrics.tasksProcessed}`);
    console.log(`   PRs Generated: ${metrics.prsGenerated}`);
    console.log(`   Success Rate: ${(metrics.successRate * 100).toFixed(1)}%`);
    console.log(`   Average Processing Time: ${metrics.averageProcessingTime?.toFixed(0) || 0}ms`);
    console.log(`   Uptime: ${Math.round(metrics.uptime / 1000)}s`);

    return health;
  } catch (error) {
    console.error('❌ Health Monitoring failed:', error.message);
    throw error;
  }
}

/**
 * Example: Error Handling and Recovery
 */
async function errorHandlingExample() {
  console.log('\n=== Error Handling Example ===\n');

  try {
    const system = CodegenIntegrationSystem.createWithDefaults({
      codegen: { enableMock: true }
    });

    await system.initialize();

    // Task with potential issues
    const problematicTask = {
      id: 'task-006',
      title: '', // Empty title to trigger validation error
      description: 'This task has issues',
      type: 'unknown_type' // Invalid type
    };

    try {
      const result = await system.processTask(problematicTask);
      console.log('⚠️ Unexpected success:', result);
    } catch (error) {
      console.log('✅ Error handled correctly:');
      console.log(`   Error Type: ${error.name}`);
      console.log(`   Error Code: ${error.code || 'N/A'}`);
      console.log(`   Error Message: ${error.message}`);
    }

    // Example: Retry mechanism
    console.log('\n🔄 Retry Mechanism:');
    const retryableTask = {
      id: 'task-007',
      title: 'Task that might fail',
      description: 'This task demonstrates retry functionality',
      type: 'feature_implementation'
    };

    try {
      const result = await system.processTask(retryableTask, {
        maxRetries: 2,
        retryDelay: 1000
      });
      console.log(`   ✅ Task succeeded: ${result.taskId}`);
    } catch (error) {
      console.log(`   ❌ Task failed after retries: ${error.message}`);
    }

    return true;
  } catch (error) {
    console.error('❌ Error Handling Example failed:', error.message);
    throw error;
  }
}

/**
 * Example: Configuration Validation
 */
function configurationValidationExample() {
  console.log('\n=== Configuration Validation Example ===\n');

  // Valid configuration
  const validConfig = {
    nlp: {
      maxTokens: 4000,
      confidenceThreshold: 0.8
    },
    branch: {
      baseBranch: 'main',
      branchPrefix: 'feature'
    },
    quality: {
      qualityThreshold: 0.8
    },
    templates: {
      templatesDir: './templates'
    },
    codegen: {
      baseURL: 'https://api.codegen.sh'
    }
  };

  const validValidation = CodegenIntegrationSystem.validateConfig(validConfig);
  console.log('✅ Valid Configuration:');
  console.log(`   Valid: ${validValidation.valid}`);
  console.log(`   Errors: ${validValidation.errors.length}`);
  console.log(`   Warnings: ${validValidation.warnings.length}`);

  // Invalid configuration
  const invalidConfig = {
    nlp: {
      maxTokens: 100, // Too low
      confidenceThreshold: 0.3 // Too low
    },
    // Missing required sections
  };

  const invalidValidation = CodegenIntegrationSystem.validateConfig(invalidConfig);
  console.log('\n❌ Invalid Configuration:');
  console.log(`   Valid: ${invalidValidation.valid}`);
  console.log(`   Errors: ${invalidValidation.errors.length}`);
  console.log(`   Warnings: ${invalidValidation.warnings.length}`);
  
  if (invalidValidation.errors.length > 0) {
    console.log('   Error Details:');
    invalidValidation.errors.forEach(error => {
      console.log(`     - ${error}`);
    });
  }

  return { validValidation, invalidValidation };
}

/**
 * Main example runner
 */
async function runExamples() {
  console.log('🚀 Codegen Integration System Examples\n');
  console.log('=====================================');

  try {
    // Run configuration validation first
    configurationValidationExample();

    // Run basic examples
    await basicPRGenerationExample();
    await batchProcessingExample();
    await componentUsageExample();
    await healthMonitoringExample();
    await errorHandlingExample();

    console.log('\n🎉 All examples completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Review the generated code and PRs');
    console.log('2. Customize configuration for your environment');
    console.log('3. Integrate with your existing CI/CD pipeline');
    console.log('4. Set up monitoring and alerting');
    console.log('5. Train your team on the new workflow');

  } catch (error) {
    console.error('\n💥 Example execution failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Export examples for individual use
export {
  basicPRGenerationExample,
  batchProcessingExample,
  componentUsageExample,
  healthMonitoringExample,
  errorHandlingExample,
  configurationValidationExample
};

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples();
}

