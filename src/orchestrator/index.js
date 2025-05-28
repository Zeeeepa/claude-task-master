/**
 * @fileoverview Orchestrator Module Entry Point
 * @description Main entry point for the task orchestration engine
 */

export { TaskOrchestrator } from './task_orchestrator.js';
export { WorkflowStateMachine } from './workflow_state_machine.js';
export { TaskParser } from './task_parser.js';
export { TaskExecution } from './models/task_execution.js';
export { 
  orchestratorConfig,
  environmentConfigs,
  workflowConfigs,
  stageConfigs,
  getConfig,
  getWorkflowConfig,
  getStageConfig,
  validateConfig,
  getConfigValue,
  setConfigValue
} from './config.js';

// Re-export Claude Code integration
export { ClaudeCodeExecutor } from '../integrations/claude-code/claude_code_executor.js';

/**
 * Create and configure a task orchestrator instance
 * @param {Object} config - Configuration options
 * @returns {TaskOrchestrator} Configured orchestrator instance
 */
export function createOrchestrator(config = {}) {
  const { TaskOrchestrator } = await import('./task_orchestrator.js');
  const { getConfig } = await import('./config.js');
  
  const finalConfig = {
    ...getConfig(),
    ...config
  };
  
  return new TaskOrchestrator(finalConfig);
}

/**
 * Create and configure a workflow state machine
 * @param {Object} customWorkflows - Custom workflow definitions
 * @returns {WorkflowStateMachine} Configured state machine
 */
export function createWorkflowStateMachine(customWorkflows = {}) {
  const { WorkflowStateMachine } = await import('./workflow_state_machine.js');
  
  const stateMachine = new WorkflowStateMachine();
  
  // Register custom workflows
  Object.entries(customWorkflows).forEach(([type, definition]) => {
    stateMachine.registerWorkflow(type, definition);
  });
  
  return stateMachine;
}

/**
 * Create and configure a task parser
 * @param {Object} config - Parser configuration
 * @returns {TaskParser} Configured parser instance
 */
export function createTaskParser(config = {}) {
  const { TaskParser } = await import('./task_parser.js');
  const { getConfig } = await import('./config.js');
  
  const finalConfig = {
    ...getConfig().ai,
    ...config
  };
  
  return new TaskParser(finalConfig);
}

/**
 * Initialize the orchestration system
 * @param {Object} options - Initialization options
 * @returns {Promise<Object>} Initialized system components
 */
export async function initializeOrchestrator(options = {}) {
  const {
    config = {},
    customWorkflows = {},
    enableHealthChecks = true,
    enableMetrics = true
  } = options;
  
  // Create main components
  const orchestrator = await createOrchestrator(config);
  const stateMachine = createWorkflowStateMachine(customWorkflows);
  const parser = createTaskParser(config.ai);
  
  // Initialize health monitoring if enabled
  if (enableHealthChecks) {
    await initializeHealthChecks(orchestrator);
  }
  
  // Initialize metrics collection if enabled
  if (enableMetrics) {
    await initializeMetrics(orchestrator);
  }
  
  return {
    orchestrator,
    stateMachine,
    parser,
    config: orchestrator.config
  };
}

/**
 * Initialize health check monitoring
 * @param {TaskOrchestrator} orchestrator - Orchestrator instance
 */
async function initializeHealthChecks(orchestrator) {
  const healthCheckInterval = orchestrator.config.monitoring.healthCheckInterval;
  
  setInterval(async () => {
    try {
      const metrics = orchestrator.getMetrics();
      const activeExecutions = orchestrator.getActiveExecutions();
      
      // Check for unhealthy conditions
      const failureRate = metrics.failureRate;
      const avgExecutionTime = metrics.avgExecutionTime;
      const queueDepth = activeExecutions.length;
      
      const thresholds = orchestrator.config.monitoring.alertThresholds;
      
      if (failureRate > thresholds.failureRate) {
        console.warn(`⚠️ High failure rate detected: ${(failureRate * 100).toFixed(1)}%`);
      }
      
      if (avgExecutionTime > thresholds.avgExecutionTime) {
        console.warn(`⚠️ High average execution time: ${avgExecutionTime}ms`);
      }
      
      if (queueDepth > thresholds.queueDepth) {
        console.warn(`⚠️ High queue depth: ${queueDepth} active executions`);
      }
      
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
    }
  }, healthCheckInterval);
}

/**
 * Initialize metrics collection
 * @param {TaskOrchestrator} orchestrator - Orchestrator instance
 */
async function initializeMetrics(orchestrator) {
  const metricsInterval = orchestrator.config.monitoring.metricsInterval;
  
  setInterval(() => {
    try {
      const metrics = orchestrator.getMetrics();
      const activeExecutions = orchestrator.getActiveExecutions();
      
      // Log current metrics
      console.log('📊 Orchestrator Metrics:', {
        tasksProcessed: metrics.tasksProcessed,
        tasksSucceeded: metrics.tasksSucceeded,
        tasksFailed: metrics.tasksFailed,
        successRate: `${((metrics.tasksSucceeded / metrics.tasksProcessed) * 100 || 0).toFixed(1)}%`,
        failureRate: `${((metrics.tasksFailed / metrics.tasksProcessed) * 100 || 0).toFixed(1)}%`,
        avgExecutionTime: `${metrics.avgExecutionTime}ms`,
        activeExecutions: activeExecutions.length,
        lastProcessedAt: metrics.lastProcessedAt
      });
      
    } catch (error) {
      console.error('❌ Metrics collection failed:', error.message);
    }
  }, metricsInterval);
}

/**
 * Gracefully shutdown the orchestration system
 * @param {Object} system - System components from initializeOrchestrator
 * @returns {Promise<void>}
 */
export async function shutdownOrchestrator(system) {
  const { orchestrator } = system;
  
  console.log('🛑 Shutting down orchestration system...');
  
  try {
    // Cancel all active executions
    const activeExecutions = orchestrator.getActiveExecutions();
    if (activeExecutions.length > 0) {
      console.log(`📋 Cancelling ${activeExecutions.length} active executions...`);
      
      await Promise.all(
        activeExecutions.map(execution => 
          orchestrator.cancelExecution(execution.task_id).catch(error =>
            console.error(`Failed to cancel execution ${execution.id}:`, error.message)
          )
        )
      );
    }
    
    // Final metrics report
    const finalMetrics = orchestrator.getMetrics();
    console.log('📊 Final metrics:', finalMetrics);
    
    console.log('✅ Orchestration system shutdown complete');
    
  } catch (error) {
    console.error('❌ Error during shutdown:', error.message);
    throw error;
  }
}

// Default export
export default {
  TaskOrchestrator,
  WorkflowStateMachine,
  TaskParser,
  TaskExecution,
  ClaudeCodeExecutor,
  createOrchestrator,
  createWorkflowStateMachine,
  createTaskParser,
  initializeOrchestrator,
  shutdownOrchestrator,
  config: orchestratorConfig
};

