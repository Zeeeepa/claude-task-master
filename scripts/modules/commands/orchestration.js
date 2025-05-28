/**
 * Orchestration CLI Commands
 * Command-line interface for the orchestration engine
 */

import { createOrchestrationManager } from '../orchestration-manager.js';
import chalk from 'chalk';
import Table from 'cli-table3';

/**
 * Initialize orchestration engine
 * @param {Object} options - Command options
 */
export async function initOrchestration(options = {}) {
  try {
    console.log(chalk.blue('🚀 Initializing Orchestration Engine...'));
    
    const manager = createOrchestrationManager({
      enableOrchestration: true,
      tasksPath: options.file || './tasks/tasks.json'
    });
    
    const success = await manager.initialize();
    
    if (success) {
      console.log(chalk.green('✅ Orchestration Engine initialized successfully'));
      
      // Display configuration
      const status = manager.getStatus();
      console.log('\n📊 Configuration:');
      console.log(`   • Orchestration: ${status.orchestrationEnabled ? 'Enabled' : 'Disabled'}`);
      console.log(`   • Initialized: ${status.initialized}`);
      
      if (status.engine) {
        const engineStatus = status.engine;
        console.log(`   • Active Workflows: ${engineStatus.orchestrator?.activeWorkflows || 0}`);
        console.log(`   • Total Processed: ${engineStatus.orchestrator?.totalProcessed || 0}`);
      }
      
    } else {
      console.log(chalk.yellow('⚠️ Orchestration Engine initialization failed, using basic mode'));
    }
    
    await manager.shutdown();
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to initialize orchestration:'), error.message);
    process.exit(1);
  }
}

/**
 * Process task with orchestration
 * @param {string|number} taskId - Task ID
 * @param {Object} options - Command options
 */
export async function processTask(taskId, options = {}) {
  const manager = createOrchestrationManager({
    enableOrchestration: !options.basic,
    tasksPath: options.file || './tasks/tasks.json'
  });
  
  try {
    console.log(chalk.blue(`🎯 Processing task ${taskId}...`));
    
    await manager.initialize();
    
    const result = await manager.processTask(taskId, {
      priority: options.priority,
      timeout: options.timeout,
      enableNLP: !options.noNlp,
      enableAgentCoordination: !options.noAgents
    });
    
    console.log(chalk.green('✅ Task processing initiated'));
    console.log('\n📋 Result:');
    console.log(`   • Workflow ID: ${result.workflowId}`);
    console.log(`   • Status: ${result.status}`);
    console.log(`   • Mode: ${result.mode || 'orchestration'}`);
    
    if (result.message) {
      console.log(`   • Message: ${result.message}`);
    }
    
    // If orchestration mode, show workflow status
    if (result.workflowId && !options.basic) {
      console.log('\n🔄 Monitoring workflow...');
      await monitorWorkflow(result.workflowId, { manager, timeout: 30000 });
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Task processing failed:'), error.message);
    process.exit(1);
  } finally {
    await manager.shutdown();
  }
}

/**
 * Process multiple tasks in batch
 * @param {Array} taskIds - Array of task IDs
 * @param {Object} options - Command options
 */
export async function processBatch(taskIds, options = {}) {
  const manager = createOrchestrationManager({
    enableOrchestration: !options.basic,
    tasksPath: options.file || './tasks/tasks.json'
  });
  
  try {
    console.log(chalk.blue(`🎯 Processing ${taskIds.length} tasks in batch...`));
    
    await manager.initialize();
    
    const result = await manager.processBatch(taskIds, {
      priority: options.priority,
      timeout: options.timeout,
      enableNLP: !options.noNlp,
      enableAgentCoordination: !options.noAgents
    });
    
    console.log(chalk.green('✅ Batch processing initiated'));
    console.log('\n📊 Results:');
    console.log(`   • Total Tasks: ${result.total || taskIds.length}`);
    console.log(`   • Successful: ${result.successful || 0}`);
    console.log(`   • Failed: ${result.failed || 0}`);
    
    if (result.results) {
      console.log('\n📋 Individual Results:');
      result.results.forEach((res, index) => {
        const taskId = taskIds[index];
        const status = res.status === 'fulfilled' ? '✅' : '❌';
        console.log(`   ${status} Task ${taskId}: ${res.status}`);
      });
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Batch processing failed:'), error.message);
    process.exit(1);
  } finally {
    await manager.shutdown();
  }
}

/**
 * Monitor workflow status
 * @param {string} workflowId - Workflow ID
 * @param {Object} options - Command options
 */
export async function monitorWorkflow(workflowId, options = {}) {
  const manager = options.manager || createOrchestrationManager({
    enableOrchestration: true,
    tasksPath: options.file || './tasks/tasks.json'
  });
  
  const shouldShutdown = !options.manager;
  
  try {
    if (shouldShutdown) {
      await manager.initialize();
    }
    
    console.log(chalk.blue(`👁️ Monitoring workflow ${workflowId}...`));
    
    const startTime = Date.now();
    const timeout = options.timeout || 300000; // 5 minutes default
    
    while (Date.now() - startTime < timeout) {
      try {
        const status = await manager.getWorkflowStatus(workflowId);
        
        if (!status) {
          console.log(chalk.yellow('⚠️ Workflow not found'));
          break;
        }
        
        console.log(`\n🔄 Status: ${status.status}`);
        if (status.progress !== undefined) {
          console.log(`📊 Progress: ${status.progress}%`);
        }
        if (status.currentStep) {
          console.log(`📋 Current Step: ${status.currentStep}`);
        }
        
        // Check if workflow is complete
        if (['merged', 'failed', 'cancelled'].includes(status.status)) {
          const emoji = status.status === 'merged' ? '✅' : '❌';
          console.log(chalk.green(`\n${emoji} Workflow ${status.status}`));
          
          if (status.result) {
            console.log('\n📋 Final Result:');
            if (status.result.prUrl) {
              console.log(`   • PR URL: ${status.result.prUrl}`);
            }
            if (status.result.error) {
              console.log(`   • Error: ${status.result.error}`);
            }
          }
          break;
        }
        
        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, 5000));
        
      } catch (error) {
        console.error(chalk.red('❌ Error monitoring workflow:'), error.message);
        break;
      }
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to monitor workflow:'), error.message);
    process.exit(1);
  } finally {
    if (shouldShutdown) {
      await manager.shutdown();
    }
  }
}

/**
 * Show orchestration status
 * @param {Object} options - Command options
 */
export async function showStatus(options = {}) {
  const manager = createOrchestrationManager({
    enableOrchestration: true,
    tasksPath: options.file || './tasks/tasks.json'
  });
  
  try {
    console.log(chalk.blue('📊 Orchestration Status'));
    
    await manager.initialize();
    
    const status = manager.getStatus();
    const metrics = manager.getMetrics();
    
    // Basic status
    console.log('\n🎛️ Engine Status:');
    console.log(`   • Orchestration: ${status.orchestrationEnabled ? chalk.green('Enabled') : chalk.red('Disabled')}`);
    console.log(`   • Initialized: ${status.initialized ? chalk.green('Yes') : chalk.red('No')}`);
    
    if (status.engine && status.engine.orchestrator) {
      const orch = status.engine.orchestrator;
      console.log(`   • Active Workflows: ${orch.activeWorkflows || 0}`);
      console.log(`   • Queued Workflows: ${orch.queuedWorkflows || 0}`);
      console.log(`   • Total Processed: ${orch.totalProcessed || 0}`);
      console.log(`   • Success Rate: ${orch.successful && orch.totalProcessed ? 
        Math.round((orch.successful / orch.totalProcessed) * 100) : 0}%`);
    }
    
    // Metrics
    if (metrics && metrics.orchestrator) {
      console.log('\n📈 Performance Metrics:');
      console.log(`   • Average Execution Time: ${Math.round(metrics.orchestrator.averageExecutionTime / 1000)}s`);
      console.log(`   • Uptime: ${Math.round(metrics.orchestrator.uptime / 1000)}s`);
    }
    
    // Active workflows
    if (status.workflows && Object.keys(status.workflows).length > 0) {
      console.log('\n🔄 Active Workflows:');
      
      const table = new Table({
        head: ['Workflow ID', 'Status', 'Progress', 'Start Time'],
        colWidths: [20, 15, 10, 20]
      });
      
      Object.entries(status.workflows).forEach(([id, workflow]) => {
        table.push([
          id.substring(0, 18) + '...',
          workflow.status,
          workflow.progress ? `${workflow.progress}%` : 'N/A',
          workflow.startTime ? new Date(workflow.startTime).toLocaleTimeString() : 'N/A'
        ]);
      });
      
      console.log(table.toString());
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to get status:'), error.message);
    process.exit(1);
  } finally {
    await manager.shutdown();
  }
}

/**
 * Health check for orchestration engine
 * @param {Object} options - Command options
 */
export async function healthCheck(options = {}) {
  const manager = createOrchestrationManager({
    enableOrchestration: true,
    tasksPath: options.file || './tasks/tasks.json'
  });
  
  try {
    console.log(chalk.blue('🏥 Orchestration Health Check'));
    
    await manager.initialize();
    
    const health = await manager.healthCheck();
    
    // Overall status
    const statusColor = health.overall === 'healthy' ? chalk.green : 
                       health.overall === 'degraded' ? chalk.yellow : chalk.red;
    console.log(`\n🎯 Overall Status: ${statusColor(health.overall.toUpperCase())}`);
    
    // Component status
    if (health.components) {
      console.log('\n🔧 Components:');
      
      Object.entries(health.components).forEach(([component, status]) => {
        const statusColor = status.status === 'healthy' ? chalk.green : 
                           status.status === 'not_available' ? chalk.yellow : chalk.red;
        console.log(`   • ${component}: ${statusColor(status.status)}`);
        
        if (status.activeWorkflows !== undefined) {
          console.log(`     - Active Workflows: ${status.activeWorkflows}`);
        }
        if (status.activeSessions !== undefined) {
          console.log(`     - Active Sessions: ${status.activeSessions}`);
        }
      });
    }
    
    if (health.error) {
      console.log(chalk.red(`\n❌ Error: ${health.error}`));
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Health check failed:'), error.message);
    process.exit(1);
  } finally {
    await manager.shutdown();
  }
}

/**
 * Parse natural language requirements
 * @param {string} description - Natural language description
 * @param {Object} options - Command options
 */
export async function parseRequirements(description, options = {}) {
  const manager = createOrchestrationManager({
    enableOrchestration: true,
    tasksPath: options.file || './tasks/tasks.json'
  });
  
  try {
    console.log(chalk.blue('🧠 Parsing Natural Language Requirements...'));
    
    await manager.initialize();
    
    const result = await manager.parseRequirements(description, {
      context: options.context,
      priority: options.priority
    });
    
    console.log(chalk.green('✅ Requirements parsed successfully'));
    
    // Display actionable items
    if (result.actionableItems && result.actionableItems.length > 0) {
      console.log('\n📋 Actionable Items:');
      
      result.actionableItems.forEach((item, index) => {
        console.log(`\n${index + 1}. ${chalk.bold(item.title)}`);
        console.log(`   • Type: ${item.type}`);
        console.log(`   • Priority: ${item.priority}`);
        console.log(`   • Estimated Time: ${item.estimatedTime}`);
        console.log(`   • Description: ${item.description}`);
        
        if (item.dependencies && item.dependencies.length > 0) {
          console.log(`   • Dependencies: ${item.dependencies.join(', ')}`);
        }
        
        if (item.acceptanceCriteria && item.acceptanceCriteria.length > 0) {
          console.log(`   • Acceptance Criteria:`);
          item.acceptanceCriteria.forEach(criteria => {
            console.log(`     - ${criteria}`);
          });
        }
      });
    }
    
    // Display dependencies
    if (result.dependencies && result.dependencies.length > 0) {
      console.log('\n🔗 Dependencies:');
      result.dependencies.forEach(dep => {
        console.log(`   • ${dep.from} → ${dep.to} (${dep.type}): ${dep.reason}`);
      });
    }
    
    // Display metadata
    if (result.metadata) {
      console.log('\n📊 Metadata:');
      console.log(`   • Complexity: ${result.metadata.complexity}`);
      if (result.metadata.technologies && result.metadata.technologies.length > 0) {
        console.log(`   • Technologies: ${result.metadata.technologies.join(', ')}`);
      }
      if (result.metadata.riskFactors && result.metadata.riskFactors.length > 0) {
        console.log(`   • Risk Factors: ${result.metadata.riskFactors.join(', ')}`);
      }
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Requirements parsing failed:'), error.message);
    process.exit(1);
  } finally {
    await manager.shutdown();
  }
}

export default {
  initOrchestration,
  processTask,
  processBatch,
  monitorWorkflow,
  showStatus,
  healthCheck,
  parseRequirements
};

