/**
 * @fileoverview AgentAPI Integration Index
 * @description Main entry point for AgentAPI and Claude Code integration
 */

// Core integration components
export { AgentAPIClient } from './agentapi_client.js';
export { ClaudeCodeExecutor, TaskExecution } from './claude_code_executor.js';
export { WorkspaceManager } from './workspace_manager.js';
export { AgentMonitor } from './agent_monitor.js';
export { FileTracker } from './file_tracker.js';
export { ResultParser, parseUtils } from './result_parser.js';

// Configuration and templates
export { 
  getConfig, 
  validateConfig, 
  mergeConfig, 
  agentAPIConfig,
  developmentConfig,
  productionConfig,
  testConfig,
  configPresets
} from './config.js';

export {
  generatePrompt,
  getTemplate,
  getTemplateNames,
  createTemplate,
  templates,
  featureTemplate,
  bugfixTemplate,
  refactorTemplate,
  testingTemplate,
  documentationTemplate,
  performanceTemplate,
  securityTemplate
} from './prompt_templates.js';

// Examples and utilities
export { default as examples } from './examples/agentapi_integration_example.js';

/**
 * Create a complete AgentAPI integration instance
 * @param {Object} config - Configuration object
 * @returns {Object} Integration instance with all components
 */
export function createAgentAPIIntegration(config = {}) {
  const finalConfig = getConfig(config.environment || 'development');
  const mergedConfig = mergeConfig(finalConfig, config);
  
  // Validate configuration
  const validation = validateConfig(mergedConfig);
  if (!validation.valid) {
    console.warn('Configuration validation warnings:', validation.warnings);
    if (validation.errors.length > 0) {
      throw new Error(`Configuration errors: ${validation.errors.join(', ')}`);
    }
  }

  // Initialize components
  const agentAPI = new AgentAPIClient(mergedConfig.agentAPI);
  const executor = new ClaudeCodeExecutor(mergedConfig);
  const workspaceManager = new WorkspaceManager(mergedConfig.workspace);
  const monitor = new AgentMonitor(mergedConfig.monitoring);
  const fileTracker = new FileTracker();
  const resultParser = new ResultParser();

  return {
    // Core components
    agentAPI,
    executor,
    workspaceManager,
    monitor,
    fileTracker,
    resultParser,
    
    // Configuration
    config: mergedConfig,
    
    // Utility methods
    async executeTask(task, options = {}) {
      const taskId = task.id || `task-${Date.now()}`;
      const executionId = options.executionId || `exec-${taskId}-${Date.now()}`;
      
      try {
        // Start monitoring if not already started
        if (!monitor.isMonitoring && options.enableMonitoring !== false) {
          monitor.start();
        }
        
        // Create workspace if needed
        let workspace = null;
        if (options.createWorkspace !== false) {
          workspace = await workspaceManager.createWorkspace(taskId, {
            repository: task.repository,
            branch: task.branch || 'main',
            environment: task.environment || {}
          });
        }
        
        // Create file tracking snapshot if workspace exists
        if (workspace && options.trackFiles !== false) {
          await fileTracker.createSnapshot(taskId, workspace.path);
        }
        
        // Execute the task
        const startTime = Date.now();
        const result = await executor.executeTask(task, executionId);
        const executionTime = Date.now() - startTime;
        
        // Record metrics
        monitor.recordTaskExecution(executionTime, true);
        
        // Parse results
        const messages = await agentAPI.getMessages();
        const parsedResults = resultParser.parse(messages);
        
        // Detect file changes if tracking
        let changes = null;
        if (workspace && options.trackFiles !== false) {
          changes = await fileTracker.detectChanges(taskId);
        }
        
        // Cleanup workspace if requested
        if (workspace && options.cleanupWorkspace !== false) {
          await workspaceManager.cleanupWorkspace(taskId);
          fileTracker.cleanup(taskId);
        }
        
        return {
          task,
          result,
          parsedResults,
          changes,
          workspace,
          executionTime,
          executionId
        };
        
      } catch (error) {
        // Record failed execution
        const executionTime = Date.now() - (options.startTime || Date.now());
        monitor.recordTaskExecution(executionTime, false);
        
        // Cleanup on error
        if (options.cleanupOnError !== false) {
          try {
            await workspaceManager.cleanupWorkspace(taskId);
            fileTracker.cleanup(taskId);
          } catch (cleanupError) {
            console.error('Cleanup failed:', cleanupError);
          }
        }
        
        throw error;
      }
    },
    
    async getHealth() {
      return await monitor.performHealthCheck();
    },
    
    getMetrics() {
      return monitor.getMetrics();
    },
    
    getStatistics() {
      return {
        agent: agentAPI.getCircuitBreakerStatus(),
        workspace: workspaceManager.getStatistics(),
        monitor: monitor.getStatus(),
        fileTracker: fileTracker.getStatistics()
      };
    },
    
    async cleanup() {
      monitor.stop();
      await workspaceManager.cleanupAll();
      // Note: fileTracker cleanup is handled per task
    }
  };
}

/**
 * Quick setup for common use cases
 */
export const quickSetup = {
  /**
   * Development setup with monitoring
   */
  development() {
    return createAgentAPIIntegration({
      environment: 'development',
      enableMonitoring: true,
      trackFiles: true
    });
  },
  
  /**
   * Production setup with full monitoring and error handling
   */
  production() {
    return createAgentAPIIntegration({
      environment: 'production',
      enableMonitoring: true,
      trackFiles: true,
      cleanupWorkspace: true
    });
  },
  
  /**
   * Testing setup with minimal overhead
   */
  testing() {
    return createAgentAPIIntegration({
      environment: 'test',
      enableMonitoring: false,
      trackFiles: false,
      cleanupWorkspace: true
    });
  },
  
  /**
   * Custom setup with specific configuration
   */
  custom(config) {
    return createAgentAPIIntegration(config);
  }
};

/**
 * Utility functions for common operations
 */
export const utils = {
  /**
   * Generate a prompt for a task
   */
  generateTaskPrompt(task, options = {}) {
    return generatePrompt(task, options);
  },
  
  /**
   * Validate task object
   */
  validateTask(task) {
    const errors = [];
    const warnings = [];
    
    if (!task.title) errors.push('Task title is required');
    if (!task.description) warnings.push('Task description is recommended');
    if (!task.type) warnings.push('Task type is recommended');
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  },
  
  /**
   * Create a task object from minimal input
   */
  createTask(title, description, options = {}) {
    return {
      id: options.id || `task-${Date.now()}`,
      title,
      description,
      type: options.type || 'feature',
      requirements: options.requirements || [],
      acceptance_criteria: options.acceptance_criteria || [],
      affected_files: options.affected_files || [],
      ...options
    };
  },
  
  /**
   * Parse agent response into structured format
   */
  parseAgentResponse(messages) {
    const parser = new ResultParser();
    return parser.parse(messages);
  }
};

// Default export for convenience
export default {
  createAgentAPIIntegration,
  quickSetup,
  utils,
  // Re-export main components
  AgentAPIClient,
  ClaudeCodeExecutor,
  WorkspaceManager,
  AgentMonitor,
  FileTracker,
  ResultParser,
  getConfig,
  generatePrompt
};

