/**
 * @fileoverview Basic Orchestrator Usage Examples
 * @description Examples demonstrating how to use the task orchestration engine
 */

import { 
  TaskOrchestrator, 
  TaskParser, 
  WorkflowStateMachine,
  createOrchestrator,
  initializeOrchestrator 
} from '../index.js';

/**
 * Example 1: Basic task orchestration
 */
async function basicTaskOrchestration() {
  console.log('🚀 Example 1: Basic Task Orchestration');
  
  // Create orchestrator with custom configuration
  const orchestrator = new TaskOrchestrator({
    concurrency: {
      maxParallelTasks: 5
    },
    workflows: {
      defaultTimeout: 300000 // 5 minutes
    }
  });

  // Example task
  const task = {
    id: 'task-001',
    title: 'Add user authentication feature',
    description: 'Implement JWT-based authentication system with login and registration endpoints',
    type: 'feature',
    requirements: {
      type: 'feature',
      priority: 'high',
      workflow: 'feature',
      files: ['src/auth/auth.js', 'src/routes/auth.js'],
      testing_required: true
    },
    acceptance_criteria: [
      'Users can register with email and password',
      'Users can login with valid credentials',
      'JWT tokens are generated and validated',
      'Protected routes require authentication'
    ],
    estimated_complexity: 'medium'
  };

  try {
    // Process the task
    const result = await orchestrator.processTask(task.id);
    
    console.log('✅ Task completed successfully:', {
      completed: result.completed,
      progress: result.progress,
      executionTime: result.executionTime
    });
    
    // Get orchestrator metrics
    const metrics = orchestrator.getMetrics();
    console.log('📊 Orchestrator metrics:', metrics);
    
  } catch (error) {
    console.error('❌ Task failed:', error.message);
  }
}

/**
 * Example 2: Natural language task parsing
 */
async function naturalLanguageTaskParsing() {
  console.log('🚀 Example 2: Natural Language Task Parsing');
  
  const parser = new TaskParser({
    enableEnhancement: true,
    enableValidation: true
  });

  const naturalLanguageInput = `
    I need to fix a critical bug in the payment processing system. 
    The checkout process is failing for users with special characters in their names.
    This is affecting production and needs to be fixed ASAP.
    
    Files involved:
    - src/payment/checkout.js
    - src/utils/validation.js
    
    The fix should:
    1. Properly sanitize user input
    2. Handle special characters in names
    3. Add validation tests
    4. Ensure backward compatibility
  `;

  try {
    const parsedTask = await parser.parseNaturalLanguage(naturalLanguageInput, {
      repository: 'ecommerce-platform',
      assignee: 'dev-team'
    });
    
    console.log('✅ Parsed task:', {
      title: parsedTask.title,
      type: parsedTask.requirements.type,
      priority: parsedTask.requirements.priority,
      complexity: parsedTask.estimated_complexity,
      workflow: parsedTask.requirements.workflow,
      acceptanceCriteria: parsedTask.acceptance_criteria.length
    });
    
  } catch (error) {
    console.error('❌ Parsing failed:', error.message);
  }
}

/**
 * Example 3: Custom workflow creation
 */
async function customWorkflowCreation() {
  console.log('🚀 Example 3: Custom Workflow Creation');
  
  const stateMachine = new WorkflowStateMachine();
  
  // Register a custom workflow for data migration tasks
  const dataMigrationWorkflow = {
    name: 'Data Migration Workflow',
    description: 'Specialized workflow for database migration tasks',
    stages: [
      { name: 'backup', type: 'backup', required: true, timeout: 300000 },
      { name: 'validation', type: 'validation', required: true, timeout: 180000 },
      { name: 'migration', type: 'migration', required: true, timeout: 900000 },
      { name: 'verification', type: 'verification', required: true, timeout: 300000 },
      { name: 'cleanup', type: 'cleanup', required: false, timeout: 120000 }
    ]
  };
  
  stateMachine.registerWorkflow('data_migration', dataMigrationWorkflow);
  
  // Create workflow instance
  const workflow = stateMachine.createWorkflow('data_migration');
  
  console.log('✅ Custom workflow created:', {
    name: workflow.name,
    stages: workflow.stages.length,
    type: workflow.type
  });
  
  // Simulate workflow execution
  try {
    workflow.completeStage('backup', { 
      backupFile: 'backup_20241128.sql',
      size: '2.5GB' 
    });
    
    workflow.completeStage('validation', { 
      checksRun: 15,
      checksPassed: 15 
    });
    
    workflow.completeStage('migration', { 
      recordsMigrated: 1000000,
      duration: '45 minutes' 
    });
    
    workflow.completeStage('verification', { 
      dataIntegrityCheck: 'passed',
      performanceCheck: 'passed' 
    });
    
    workflow.skipStage('cleanup', 'Manual cleanup preferred');
    
    const result = workflow.getResult();
    console.log('✅ Workflow completed:', {
      status: result.status,
      completed: result.completed.length,
      skipped: result.skipped.length,
      progress: result.progress
    });
    
  } catch (error) {
    console.error('❌ Workflow execution failed:', error.message);
  }
}

/**
 * Example 4: Full system initialization
 */
async function fullSystemInitialization() {
  console.log('🚀 Example 4: Full System Initialization');
  
  try {
    // Initialize the complete orchestration system
    const system = await initializeOrchestrator({
      config: {
        concurrency: {
          maxParallelTasks: 10
        },
        monitoring: {
          enableDetailedLogging: true,
          metricsInterval: 10000 // 10 seconds
        }
      },
      customWorkflows: {
        'ml_training': {
          name: 'ML Model Training',
          description: 'Workflow for machine learning model training',
          stages: [
            { name: 'data_preparation', type: 'analysis', required: true },
            { name: 'model_training', type: 'code_generation', required: true },
            { name: 'model_validation', type: 'testing', required: true },
            { name: 'model_deployment', type: 'deployment', required: false }
          ]
        }
      },
      enableHealthChecks: true,
      enableMetrics: true
    });
    
    console.log('✅ System initialized successfully:', {
      orchestrator: !!system.orchestrator,
      stateMachine: !!system.stateMachine,
      parser: !!system.parser,
      config: !!system.config
    });
    
    // Example task processing with the initialized system
    const naturalLanguageTask = `
      Train a new recommendation model using the latest user interaction data.
      The model should improve click-through rates by at least 15%.
      Use the updated feature engineering pipeline and validate against the test dataset.
    `;
    
    const parsedTask = await system.parser.parseNaturalLanguage(naturalLanguageTask);
    console.log('✅ Task parsed:', parsedTask.title);
    
    // Get available workflows
    const workflows = system.stateMachine.getAvailableWorkflows();
    console.log('📋 Available workflows:', workflows.map(w => w.type));
    
  } catch (error) {
    console.error('❌ System initialization failed:', error.message);
  }
}

/**
 * Example 5: Error handling and recovery
 */
async function errorHandlingExample() {
  console.log('🚀 Example 5: Error Handling and Recovery');
  
  const orchestrator = new TaskOrchestrator({
    workflows: {
      maxRetries: 2,
      retryDelay: 5000
    }
  });
  
  // Simulate a task that might fail
  const problematicTask = {
    id: 'task-error-test',
    title: 'Task that might fail',
    description: 'This task is designed to test error handling',
    requirements: {
      type: 'experimental',
      priority: 'low'
    },
    acceptance_criteria: ['Should handle errors gracefully'],
    estimated_complexity: 'simple'
  };
  
  try {
    // This would normally fail in a real scenario
    await orchestrator.processTask(problematicTask.id);
    
  } catch (error) {
    console.log('⚠️ Task failed as expected:', error.message);
    
    // Check if task can be retried
    const activeExecutions = orchestrator.getActiveExecutions();
    console.log('📊 Active executions after failure:', activeExecutions.length);
    
    // Get failure metrics
    const metrics = orchestrator.getMetrics();
    console.log('📊 Failure metrics:', {
      totalTasks: metrics.tasksProcessed,
      failedTasks: metrics.tasksFailed,
      failureRate: metrics.failureRate
    });
  }
}

/**
 * Example 6: Monitoring and metrics
 */
async function monitoringExample() {
  console.log('🚀 Example 6: Monitoring and Metrics');
  
  const orchestrator = new TaskOrchestrator();
  
  // Simulate processing multiple tasks
  const tasks = [
    { id: 'task-1', title: 'Feature A', type: 'feature' },
    { id: 'task-2', title: 'Bug Fix B', type: 'bugfix' },
    { id: 'task-3', title: 'Hotfix C', type: 'hotfix' }
  ];
  
  console.log('📊 Processing multiple tasks...');
  
  for (const task of tasks) {
    try {
      // In a real scenario, these would be actual task executions
      console.log(`Processing ${task.title}...`);
      
      // Simulate task completion
      orchestrator.metrics.tasksProcessed++;
      orchestrator.metrics.tasksSucceeded++;
      orchestrator.metrics.lastProcessedAt = new Date();
      
    } catch (error) {
      orchestrator.metrics.tasksFailed++;
      console.error(`Task ${task.title} failed:`, error.message);
    }
  }
  
  // Get final metrics
  const finalMetrics = orchestrator.getMetrics();
  console.log('✅ Final metrics:', {
    processed: finalMetrics.tasksProcessed,
    succeeded: finalMetrics.tasksSucceeded,
    failed: finalMetrics.tasksFailed,
    successRate: `${((finalMetrics.tasksSucceeded / finalMetrics.tasksProcessed) * 100).toFixed(1)}%`,
    lastProcessed: finalMetrics.lastProcessedAt
  });
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log('🎯 Running Task Orchestration Engine Examples\n');
  
  try {
    await basicTaskOrchestration();
    console.log('\n' + '='.repeat(50) + '\n');
    
    await naturalLanguageTaskParsing();
    console.log('\n' + '='.repeat(50) + '\n');
    
    await customWorkflowCreation();
    console.log('\n' + '='.repeat(50) + '\n');
    
    await fullSystemInitialization();
    console.log('\n' + '='.repeat(50) + '\n');
    
    await errorHandlingExample();
    console.log('\n' + '='.repeat(50) + '\n');
    
    await monitoringExample();
    
    console.log('\n🎉 All examples completed successfully!');
    
  } catch (error) {
    console.error('❌ Example execution failed:', error.message);
  }
}

// Export examples for individual use
export {
  basicTaskOrchestration,
  naturalLanguageTaskParsing,
  customWorkflowCreation,
  fullSystemInitialization,
  errorHandlingExample,
  monitoringExample,
  runAllExamples
};

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples();
}

