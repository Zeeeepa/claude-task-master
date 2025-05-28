#!/usr/bin/env node

/**
 * Orchestration Engine Demo
 * Demonstrates the capabilities of the task orchestration engine
 */

import { OrchestrationEngine } from '../src/orchestration/index.js';
import chalk from 'chalk';

/**
 * Demo: Basic orchestration workflow
 */
async function basicOrchestrationDemo() {
  console.log(chalk.blue.bold('\n🎯 Task Orchestration Engine Demo\n'));
  
  try {
    // Initialize orchestration engine
    console.log(chalk.yellow('1. Initializing Orchestration Engine...'));
    
    const engine = new OrchestrationEngine({
      database: {
        // Mock database configuration for demo
        host: 'localhost',
        port: 5432,
        database: 'demo_db'
      },
      nlp: {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        enableCaching: true
      },
      orchestrator: {
        maxConcurrentWorkflows: 5,
        enableNLP: true,
        enableAgentCoordination: true
      }
    });

    await engine.initialize();
    console.log(chalk.green('✅ Engine initialized successfully\n'));

    // Demo 1: Parse natural language requirements
    console.log(chalk.yellow('2. Parsing Natural Language Requirements...'));
    
    const requirements = `
    Create a user authentication system with the following features:
    1. User registration with email validation
    2. JWT-based login system  
    3. Password reset functionality
    4. Role-based access control
    5. API rate limiting
    `;

    console.log(chalk.gray('Requirements:'), requirements.trim());
    
    // Note: In demo mode, this will use fallback parsing
    const parsed = await engine.stateManager.orchestrator.nlp.parseRequirements(requirements);
    
    console.log(chalk.green('✅ Requirements parsed into actionable tasks:'));
    parsed.actionableItems.forEach((item, index) => {
      console.log(chalk.cyan(`   ${index + 1}. ${item.title} (${item.type}, ${item.priority})`));
    });
    console.log();

    // Demo 2: Process a single task
    console.log(chalk.yellow('3. Processing Single Task...'));
    
    // Create a demo task
    await engine.stateManager.database.createTask({
      id: 'demo_task_1',
      title: 'Implement User Registration API',
      description: 'Create REST API endpoint for user registration with email validation',
      status: 'pending',
      priority: 'high',
      dependencies: [],
      metadata: {
        estimatedTime: '4 hours',
        complexity: 'medium'
      }
    });

    const taskResult = await engine.processTask('demo_task_1', {
      priority: 'high',
      enableNLP: true,
      enableAgentCoordination: true
    });

    console.log(chalk.green('✅ Task processing initiated:'));
    console.log(chalk.cyan(`   • Workflow ID: ${taskResult.workflowId}`));
    console.log(chalk.cyan(`   • Status: ${taskResult.status}`));
    console.log();

    // Demo 3: Monitor workflow progress
    console.log(chalk.yellow('4. Monitoring Workflow Progress...'));
    
    let attempts = 0;
    const maxAttempts = 6;
    
    while (attempts < maxAttempts) {
      const status = await engine.getWorkflowStatus(taskResult.workflowId);
      
      if (status) {
        console.log(chalk.cyan(`   📊 Status: ${status.status}`));
        if (status.progress !== undefined) {
          console.log(chalk.cyan(`   📈 Progress: ${status.progress}%`));
        }
        if (status.currentStep) {
          console.log(chalk.cyan(`   🔄 Current Step: ${status.currentStep}`));
        }
        
        // Check if workflow is complete
        if (['merged', 'failed', 'cancelled'].includes(status.status)) {
          console.log(chalk.green(`✅ Workflow completed with status: ${status.status}`));
          break;
        }
      }
      
      attempts++;
      if (attempts < maxAttempts) {
        console.log(chalk.gray('   ⏳ Waiting 2 seconds...'));
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    console.log();

    // Demo 4: Batch processing
    console.log(chalk.yellow('5. Batch Processing Demo...'));
    
    // Create multiple demo tasks
    const batchTasks = [
      {
        id: 'demo_task_2',
        title: 'Implement JWT Authentication',
        description: 'Create JWT token generation and validation middleware',
        priority: 'high'
      },
      {
        id: 'demo_task_3', 
        title: 'Create Password Reset Flow',
        description: 'Implement password reset with email verification',
        priority: 'medium'
      },
      {
        id: 'demo_task_4',
        title: 'Add Role-Based Access Control',
        description: 'Implement RBAC system with user roles and permissions',
        priority: 'medium'
      }
    ];

    for (const task of batchTasks) {
      await engine.stateManager.database.createTask({
        ...task,
        status: 'pending',
        dependencies: [],
        metadata: { estimatedTime: '3 hours' }
      });
    }

    const batchResult = await engine.processBatch(
      batchTasks.map(t => t.id),
      { priority: 'medium' }
    );

    console.log(chalk.green('✅ Batch processing initiated:'));
    console.log(chalk.cyan(`   • Total Tasks: ${batchResult.total}`));
    console.log(chalk.cyan(`   • Successful: ${batchResult.successful || 'Processing...'}`));
    console.log();

    // Demo 5: Engine metrics and status
    console.log(chalk.yellow('6. Engine Metrics and Status...'));
    
    const metrics = engine.getMetrics();
    const status = engine.getStatus();

    console.log(chalk.green('📊 Engine Metrics:'));
    console.log(chalk.cyan(`   • Active Workflows: ${metrics.workflows?.active || 0}`));
    console.log(chalk.cyan(`   • Total Processed: ${metrics.workflows?.processed || 0}`));
    console.log(chalk.cyan(`   • Orchestration Enabled: ${status.orchestrationEnabled}`));
    console.log(chalk.cyan(`   • Engine Initialized: ${status.initialized}`));
    console.log();

    // Demo 6: Health check
    console.log(chalk.yellow('7. Health Check...'));
    
    const health = await engine.healthCheck();
    
    console.log(chalk.green('🏥 Health Status:'));
    console.log(chalk.cyan(`   • Overall: ${health.overall}`));
    
    if (health.components) {
      Object.entries(health.components).forEach(([component, componentHealth]) => {
        const statusColor = componentHealth.status === 'healthy' ? chalk.green : 
                           componentHealth.status === 'not_available' ? chalk.yellow : chalk.red;
        console.log(chalk.cyan(`   • ${component}: ${statusColor(componentHealth.status)}`));
      });
    }
    console.log();

    // Demo 7: Agent capabilities
    console.log(chalk.yellow('8. Agent Capabilities...'));
    
    const agentCoordinator = engine.stateManager.orchestrator.agentCoordinator;
    const agentTypes = ['claude-code', 'goose', 'aider', 'codex'];
    
    console.log(chalk.green('🤖 Available Agents:'));
    agentTypes.forEach(agentType => {
      const capabilities = agentCoordinator.getAgentCapabilities(agentType);
      if (capabilities) {
        console.log(chalk.cyan(`   • ${capabilities.name}:`));
        console.log(chalk.gray(`     - Capabilities: ${capabilities.capabilities.join(', ')}`));
        console.log(chalk.gray(`     - Languages: ${capabilities.languages.join(', ')}`));
        console.log(chalk.gray(`     - Specialties: ${capabilities.specialties.join(', ')}`));
      }
    });
    console.log();

    // Demo 8: Dependency resolution
    console.log(chalk.yellow('9. Dependency Resolution Demo...'));
    
    const dependencyResolver = engine.stateManager.orchestrator.dependencyResolver;
    const complexTasks = [
      { id: 'database_setup', dependencies: [] },
      { id: 'user_model', dependencies: ['database_setup'] },
      { id: 'auth_middleware', dependencies: ['user_model'] },
      { id: 'registration_api', dependencies: ['user_model', 'auth_middleware'] },
      { id: 'login_api', dependencies: ['auth_middleware'] },
      { id: 'frontend_auth', dependencies: ['registration_api', 'login_api'] },
      { id: 'tests', dependencies: ['frontend_auth'] }
    ];

    const executionPlan = await dependencyResolver.resolveDependencies(complexTasks);
    
    if (executionPlan.success) {
      console.log(chalk.green('✅ Dependency Resolution:'));
      executionPlan.executionPlan.forEach((level, index) => {
        const parallel = level.length > 1 ? ' (parallel)' : '';
        console.log(chalk.cyan(`   Level ${index}: [${level.join(', ')}]${parallel}`));
      });
      console.log(chalk.gray(`   • Total Levels: ${executionPlan.executionPlan.length}`));
      console.log(chalk.gray(`   • Parallelizable Tasks: ${executionPlan.metadata.parallelizable}`));
    }
    console.log();

    // Cleanup
    console.log(chalk.yellow('10. Shutting Down...'));
    await engine.shutdown();
    console.log(chalk.green('✅ Engine shutdown complete\n'));

    console.log(chalk.blue.bold('🎉 Demo completed successfully!'));
    console.log(chalk.gray('The orchestration engine demonstrated:'));
    console.log(chalk.gray('• Natural language requirement parsing'));
    console.log(chalk.gray('• Task processing and workflow management'));
    console.log(chalk.gray('• Batch processing capabilities'));
    console.log(chalk.gray('• Real-time monitoring and metrics'));
    console.log(chalk.gray('• Health checking and status reporting'));
    console.log(chalk.gray('• Agent coordination and capabilities'));
    console.log(chalk.gray('• Intelligent dependency resolution'));

  } catch (error) {
    console.error(chalk.red('❌ Demo failed:'), error.message);
    if (process.env.DEBUG) {
      console.error(chalk.red('Stack trace:'), error.stack);
    }
    process.exit(1);
  }
}

/**
 * Demo: NLP parsing examples
 */
async function nlpParsingDemo() {
  console.log(chalk.blue.bold('\n🧠 NLP Parsing Demo\n'));
  
  const examples = [
    "Create a REST API for user management with authentication",
    "Build a real-time chat application with WebSocket support",
    "Implement a microservices architecture with Docker containers",
    "Add unit tests and integration tests for the payment system",
    "Refactor the database layer to use TypeORM with PostgreSQL"
  ];

  // Note: In demo mode, this will show the structure of what would be parsed
  console.log(chalk.yellow('Example Natural Language Requirements:'));
  
  examples.forEach((example, index) => {
    console.log(chalk.cyan(`\n${index + 1}. "${example}"`));
    
    // Show what the parsing would extract
    console.log(chalk.gray('   Would extract:'));
    console.log(chalk.gray('   • Task type: implementation/testing/refactor'));
    console.log(chalk.gray('   • Technologies: API, WebSocket, Docker, etc.'));
    console.log(chalk.gray('   • Complexity: low/medium/high'));
    console.log(chalk.gray('   • Dependencies: related task relationships'));
    console.log(chalk.gray('   • Acceptance criteria: specific requirements'));
  });
  
  console.log(chalk.green('\n✅ NLP parsing would convert these into structured, actionable tasks'));
}

/**
 * Main demo runner
 */
async function runDemo() {
  const args = process.argv.slice(2);
  const demoType = args[0] || 'basic';

  switch (demoType) {
    case 'basic':
      await basicOrchestrationDemo();
      break;
    case 'nlp':
      await nlpParsingDemo();
      break;
    case 'all':
      await basicOrchestrationDemo();
      await nlpParsingDemo();
      break;
    default:
      console.log(chalk.yellow('Available demos:'));
      console.log(chalk.cyan('  node examples/orchestration-demo.js basic   # Basic orchestration demo'));
      console.log(chalk.cyan('  node examples/orchestration-demo.js nlp     # NLP parsing demo'));
      console.log(chalk.cyan('  node examples/orchestration-demo.js all     # All demos'));
      break;
  }
}

// Run demo if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDemo().catch(error => {
    console.error(chalk.red('Demo failed:'), error.message);
    process.exit(1);
  });
}

export { basicOrchestrationDemo, nlpParsingDemo, runDemo };

