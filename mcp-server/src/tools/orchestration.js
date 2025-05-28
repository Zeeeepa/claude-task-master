/**
 * MCP Tools for Orchestration Engine
 * Exposes orchestration functionality through Model Context Protocol
 */

import { z } from 'zod';
import { createOrchestrationManager } from '../../../scripts/modules/orchestration-manager.js';
import { getProjectRoot } from '../core/utils.js';
import path from 'path';

/**
 * Initialize orchestration engine
 */
export const initOrchestrationTool = {
  name: 'init_orchestration',
  description: 'Initialize the task orchestration engine with natural language processing and agent coordination',
  inputSchema: z.object({
    enableNLP: z.boolean().optional().describe('Enable natural language processing (default: true)'),
    enableAgentCoordination: z.boolean().optional().describe('Enable agent coordination (default: true)'),
    maxConcurrentWorkflows: z.number().optional().describe('Maximum concurrent workflows (default: 10)'),
    tasksFile: z.string().optional().describe('Path to tasks.json file (default: ./tasks/tasks.json)')
  })
};

export async function handleInitOrchestration(args) {
  try {
    const projectRoot = getProjectRoot();
    const tasksPath = args.tasksFile ? 
      path.resolve(projectRoot, args.tasksFile) : 
      path.join(projectRoot, 'tasks', 'tasks.json');

    const manager = createOrchestrationManager({
      enableOrchestration: true,
      tasksPath,
      enableNLP: args.enableNLP !== false,
      enableAgentCoordination: args.enableAgentCoordination !== false,
      maxConcurrentWorkflows: args.maxConcurrentWorkflows || 10
    });

    const success = await manager.initialize();
    const status = manager.getStatus();
    
    await manager.shutdown();

    return {
      success,
      status: status.orchestrationEnabled ? 'initialized' : 'fallback_mode',
      configuration: {
        orchestrationEnabled: status.orchestrationEnabled,
        initialized: status.initialized,
        tasksPath,
        enableNLP: args.enableNLP !== false,
        enableAgentCoordination: args.enableAgentCoordination !== false,
        maxConcurrentWorkflows: args.maxConcurrentWorkflows || 10
      },
      message: success ? 
        'Orchestration engine initialized successfully' : 
        'Orchestration engine initialization failed, using basic mode'
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      message: 'Failed to initialize orchestration engine'
    };
  }
}

/**
 * Process task with orchestration
 */
export const processTaskOrchestrationTool = {
  name: 'process_task_orchestration',
  description: 'Process a task using the orchestration engine with NLP and agent coordination',
  inputSchema: z.object({
    taskId: z.union([z.string(), z.number()]).describe('Task ID to process'),
    priority: z.enum(['low', 'medium', 'high']).optional().describe('Task priority'),
    enableNLP: z.boolean().optional().describe('Enable natural language processing'),
    enableAgentCoordination: z.boolean().optional().describe('Enable agent coordination'),
    timeout: z.number().optional().describe('Timeout in milliseconds'),
    tasksFile: z.string().optional().describe('Path to tasks.json file')
  })
};

export async function handleProcessTaskOrchestration(args) {
  try {
    const projectRoot = getProjectRoot();
    const tasksPath = args.tasksFile ? 
      path.resolve(projectRoot, args.tasksFile) : 
      path.join(projectRoot, 'tasks', 'tasks.json');

    const manager = createOrchestrationManager({
      enableOrchestration: true,
      tasksPath
    });

    await manager.initialize();

    const result = await manager.processTask(args.taskId, {
      priority: args.priority,
      enableNLP: args.enableNLP,
      enableAgentCoordination: args.enableAgentCoordination,
      timeout: args.timeout
    });

    await manager.shutdown();

    return {
      success: true,
      taskId: args.taskId,
      workflowId: result.workflowId,
      status: result.status,
      mode: result.mode || 'orchestration',
      message: result.message || 'Task processing initiated successfully'
    };

  } catch (error) {
    return {
      success: false,
      taskId: args.taskId,
      error: error.message,
      message: 'Failed to process task with orchestration'
    };
  }
}

/**
 * Process multiple tasks in batch
 */
export const processBatchOrchestrationTool = {
  name: 'process_batch_orchestration',
  description: 'Process multiple tasks in batch using the orchestration engine',
  inputSchema: z.object({
    taskIds: z.array(z.union([z.string(), z.number()])).describe('Array of task IDs to process'),
    priority: z.enum(['low', 'medium', 'high']).optional().describe('Batch priority'),
    enableNLP: z.boolean().optional().describe('Enable natural language processing'),
    enableAgentCoordination: z.boolean().optional().describe('Enable agent coordination'),
    timeout: z.number().optional().describe('Timeout in milliseconds'),
    tasksFile: z.string().optional().describe('Path to tasks.json file')
  })
};

export async function handleProcessBatchOrchestration(args) {
  try {
    const projectRoot = getProjectRoot();
    const tasksPath = args.tasksFile ? 
      path.resolve(projectRoot, args.tasksFile) : 
      path.join(projectRoot, 'tasks', 'tasks.json');

    const manager = createOrchestrationManager({
      enableOrchestration: true,
      tasksPath
    });

    await manager.initialize();

    const result = await manager.processBatch(args.taskIds, {
      priority: args.priority,
      enableNLP: args.enableNLP,
      enableAgentCoordination: args.enableAgentCoordination,
      timeout: args.timeout
    });

    await manager.shutdown();

    return {
      success: true,
      taskIds: args.taskIds,
      total: result.total || args.taskIds.length,
      successful: result.successful || 0,
      failed: result.failed || 0,
      results: result.results || [],
      message: 'Batch processing completed'
    };

  } catch (error) {
    return {
      success: false,
      taskIds: args.taskIds,
      error: error.message,
      message: 'Failed to process batch with orchestration'
    };
  }
}

/**
 * Get workflow status
 */
export const getWorkflowStatusTool = {
  name: 'get_workflow_status',
  description: 'Get the status of a workflow in the orchestration engine',
  inputSchema: z.object({
    workflowId: z.string().describe('Workflow ID to check'),
    tasksFile: z.string().optional().describe('Path to tasks.json file')
  })
};

export async function handleGetWorkflowStatus(args) {
  try {
    const projectRoot = getProjectRoot();
    const tasksPath = args.tasksFile ? 
      path.resolve(projectRoot, args.tasksFile) : 
      path.join(projectRoot, 'tasks', 'tasks.json');

    const manager = createOrchestrationManager({
      enableOrchestration: true,
      tasksPath
    });

    await manager.initialize();

    const status = await manager.getWorkflowStatus(args.workflowId);

    await manager.shutdown();

    if (!status) {
      return {
        success: false,
        workflowId: args.workflowId,
        message: 'Workflow not found'
      };
    }

    return {
      success: true,
      workflowId: args.workflowId,
      status: status.status,
      progress: status.progress,
      startTime: status.startTime,
      endTime: status.endTime,
      currentStep: status.currentStep,
      result: status.result,
      message: 'Workflow status retrieved successfully'
    };

  } catch (error) {
    return {
      success: false,
      workflowId: args.workflowId,
      error: error.message,
      message: 'Failed to get workflow status'
    };
  }
}

/**
 * Cancel workflow
 */
export const cancelWorkflowTool = {
  name: 'cancel_workflow',
  description: 'Cancel a running workflow in the orchestration engine',
  inputSchema: z.object({
    workflowId: z.string().describe('Workflow ID to cancel'),
    tasksFile: z.string().optional().describe('Path to tasks.json file')
  })
};

export async function handleCancelWorkflow(args) {
  try {
    const projectRoot = getProjectRoot();
    const tasksPath = args.tasksFile ? 
      path.resolve(projectRoot, args.tasksFile) : 
      path.join(projectRoot, 'tasks', 'tasks.json');

    const manager = createOrchestrationManager({
      enableOrchestration: true,
      tasksPath
    });

    await manager.initialize();

    const cancelled = await manager.cancelWorkflow(args.workflowId);

    await manager.shutdown();

    return {
      success: cancelled,
      workflowId: args.workflowId,
      message: cancelled ? 'Workflow cancelled successfully' : 'Workflow not found or already completed'
    };

  } catch (error) {
    return {
      success: false,
      workflowId: args.workflowId,
      error: error.message,
      message: 'Failed to cancel workflow'
    };
  }
}

/**
 * Get orchestration status
 */
export const getOrchestrationStatusTool = {
  name: 'get_orchestration_status',
  description: 'Get the current status and metrics of the orchestration engine',
  inputSchema: z.object({
    tasksFile: z.string().optional().describe('Path to tasks.json file')
  })
};

export async function handleGetOrchestrationStatus(args) {
  try {
    const projectRoot = getProjectRoot();
    const tasksPath = args.tasksFile ? 
      path.resolve(projectRoot, args.tasksFile) : 
      path.join(projectRoot, 'tasks', 'tasks.json');

    const manager = createOrchestrationManager({
      enableOrchestration: true,
      tasksPath
    });

    await manager.initialize();

    const status = manager.getStatus();
    const metrics = manager.getMetrics();

    await manager.shutdown();

    return {
      success: true,
      orchestrationEnabled: status.orchestrationEnabled,
      initialized: status.initialized,
      engine: status.engine,
      metrics,
      message: 'Orchestration status retrieved successfully'
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      message: 'Failed to get orchestration status'
    };
  }
}

/**
 * Parse natural language requirements
 */
export const parseRequirementsTool = {
  name: 'parse_requirements',
  description: 'Parse natural language requirements into actionable tasks using NLP',
  inputSchema: z.object({
    description: z.string().describe('Natural language description of requirements'),
    context: z.string().optional().describe('Additional context for parsing'),
    priority: z.enum(['low', 'medium', 'high']).optional().describe('Default priority for parsed tasks'),
    tasksFile: z.string().optional().describe('Path to tasks.json file')
  })
};

export async function handleParseRequirements(args) {
  try {
    const projectRoot = getProjectRoot();
    const tasksPath = args.tasksFile ? 
      path.resolve(projectRoot, args.tasksFile) : 
      path.join(projectRoot, 'tasks', 'tasks.json');

    const manager = createOrchestrationManager({
      enableOrchestration: true,
      tasksPath
    });

    await manager.initialize();

    const result = await manager.parseRequirements(args.description, {
      context: args.context,
      priority: args.priority
    });

    await manager.shutdown();

    return {
      success: true,
      description: args.description,
      actionableItems: result.actionableItems || [],
      dependencies: result.dependencies || [],
      metadata: result.metadata || {},
      message: 'Requirements parsed successfully'
    };

  } catch (error) {
    return {
      success: false,
      description: args.description,
      error: error.message,
      message: 'Failed to parse requirements'
    };
  }
}

/**
 * Health check for orchestration engine
 */
export const orchestrationHealthCheckTool = {
  name: 'orchestration_health_check',
  description: 'Perform a health check on the orchestration engine and all its components',
  inputSchema: z.object({
    tasksFile: z.string().optional().describe('Path to tasks.json file')
  })
};

export async function handleOrchestrationHealthCheck(args) {
  try {
    const projectRoot = getProjectRoot();
    const tasksPath = args.tasksFile ? 
      path.resolve(projectRoot, args.tasksFile) : 
      path.join(projectRoot, 'tasks', 'tasks.json');

    const manager = createOrchestrationManager({
      enableOrchestration: true,
      tasksPath
    });

    await manager.initialize();

    const health = await manager.healthCheck();

    await manager.shutdown();

    return {
      success: true,
      overall: health.overall,
      components: health.components || {},
      timestamp: health.timestamp,
      error: health.error,
      message: `Health check completed - overall status: ${health.overall}`
    };

  } catch (error) {
    return {
      success: false,
      overall: 'unhealthy',
      error: error.message,
      message: 'Health check failed'
    };
  }
}

// Export all tools
export const orchestrationTools = {
  init_orchestration: {
    tool: initOrchestrationTool,
    handler: handleInitOrchestration
  },
  process_task_orchestration: {
    tool: processTaskOrchestrationTool,
    handler: handleProcessTaskOrchestration
  },
  process_batch_orchestration: {
    tool: processBatchOrchestrationTool,
    handler: handleProcessBatchOrchestration
  },
  get_workflow_status: {
    tool: getWorkflowStatusTool,
    handler: handleGetWorkflowStatus
  },
  cancel_workflow: {
    tool: cancelWorkflowTool,
    handler: handleCancelWorkflow
  },
  get_orchestration_status: {
    tool: getOrchestrationStatusTool,
    handler: handleGetOrchestrationStatus
  },
  parse_requirements: {
    tool: parseRequirementsTool,
    handler: handleParseRequirements
  },
  orchestration_health_check: {
    tool: orchestrationHealthCheckTool,
    handler: handleOrchestrationHealthCheck
  }
};

export default orchestrationTools;

