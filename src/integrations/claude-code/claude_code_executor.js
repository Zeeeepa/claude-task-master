/**
 * @fileoverview Claude Code Executor
 * @description Integration with Claude Code for task execution via AgentAPI
 */

import { log } from '../../utils/logger.js';
import { CodegenErrorHandler } from '../../ai_cicd_system/core/error_handler.js';

/**
 * Claude Code Executor - Executes tasks using Claude Code via AgentAPI
 */
export class ClaudeCodeExecutor {
  constructor(config = {}) {
    this.config = {
      agentApiUrl: config.agentApiUrl || process.env.AGENT_API_URL || 'http://localhost:3000',
      timeout: config.timeout || 300000, // 5 minutes
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 5000,
      ...config
    };

    this.errorHandler = new CodegenErrorHandler({
      enableRetry: true,
      maxRetries: this.config.maxRetries,
      baseDelay: this.config.retryDelay
    });

    this.activeExecutions = new Map();
  }

  /**
   * Execute a task using Claude Code
   * @param {Object} task - Task to execute
   * @param {string} executionId - Execution ID for tracking
   * @returns {Promise<Object>} Execution result
   */
  async executeTask(task, executionId) {
    return this.errorHandler.executeWithProtection(
      async () => {
        log('info', '🤖 Starting Claude Code execution', {
          taskId: task.id,
          executionId,
          title: task.title,
          type: task.requirements?.type
        });

        // Prepare task for Claude Code
        const claudeTask = this.prepareTaskForClaude(task);
        
        // Start execution
        const execution = await this.startExecution(claudeTask, executionId);
        this.activeExecutions.set(executionId, execution);

        try {
          // Monitor execution progress
          const result = await this.monitorExecution(execution, executionId);
          
          log('info', '✅ Claude Code execution completed', {
            taskId: task.id,
            executionId,
            filesModified: result.filesModified?.length || 0,
            duration: result.duration
          });

          return result;

        } finally {
          this.activeExecutions.delete(executionId);
        }
      },
      {
        component: 'claude_code_executor',
        operation: 'execute_task',
        context: { taskId: task.id, executionId }
      }
    );
  }

  /**
   * Prepare task for Claude Code execution
   * @param {Object} task - Original task
   * @returns {Object} Claude-formatted task
   */
  prepareTaskForClaude(task) {
    const claudeTask = {
      id: task.id,
      title: task.title,
      description: task.description,
      type: task.requirements?.type || 'feature',
      priority: task.requirements?.priority || 'medium',
      
      // Code generation specific instructions
      instructions: this.buildInstructions(task),
      
      // File context
      files: task.requirements?.files || [],
      repository: task.requirements?.repository,
      
      // Constraints and requirements
      constraints: {
        maxFiles: 50,
        maxChangesPerFile: 1000,
        preserveExistingTests: true,
        followCodingStandards: true,
        ...task.requirements?.constraints
      },
      
      // Acceptance criteria
      acceptanceCriteria: task.acceptance_criteria || [],
      
      // Workflow context
      workflow: {
        type: task.requirements?.workflow || 'default',
        stage: 'code_generation',
        previousStages: []
      },

      // Metadata
      metadata: {
        complexity: task.estimated_complexity,
        estimatedHours: task.metadata?.estimated_hours,
        riskFactors: task.risk_factors || [],
        dependencies: task.requirements?.dependencies || []
      }
    };

    return claudeTask;
  }

  /**
   * Build detailed instructions for Claude Code
   * @param {Object} task - Task object
   * @returns {string} Formatted instructions
   */
  buildInstructions(task) {
    let instructions = `# Task: ${task.title}\n\n`;
    
    instructions += `## Description\n${task.description}\n\n`;
    
    if (task.requirements?.type) {
      instructions += `## Task Type\n${task.requirements.type}\n\n`;
    }

    if (task.acceptance_criteria && task.acceptance_criteria.length > 0) {
      instructions += `## Acceptance Criteria\n`;
      task.acceptance_criteria.forEach((criteria, index) => {
        instructions += `${index + 1}. ${criteria}\n`;
      });
      instructions += '\n';
    }

    if (task.requirements?.files && task.requirements.files.length > 0) {
      instructions += `## Files to Consider\n`;
      task.requirements.files.forEach(file => {
        instructions += `- ${file}\n`;
      });
      instructions += '\n';
    }

    if (task.requirements?.dependencies && task.requirements.dependencies.length > 0) {
      instructions += `## Dependencies\n`;
      task.requirements.dependencies.forEach(dep => {
        instructions += `- ${dep}\n`;
      });
      instructions += '\n';
    }

    // Add type-specific instructions
    switch (task.requirements?.type) {
      case 'hotfix':
        instructions += `## Hotfix Guidelines\n`;
        instructions += `- Focus on minimal, targeted changes\n`;
        instructions += `- Prioritize stability over feature completeness\n`;
        instructions += `- Ensure backward compatibility\n`;
        instructions += `- Add appropriate error handling\n\n`;
        break;

      case 'feature':
        instructions += `## Feature Development Guidelines\n`;
        instructions += `- Follow established patterns and conventions\n`;
        instructions += `- Include comprehensive error handling\n`;
        instructions += `- Add appropriate tests\n`;
        instructions += `- Update documentation as needed\n\n`;
        break;

      case 'bugfix':
        instructions += `## Bug Fix Guidelines\n`;
        instructions += `- Identify and fix the root cause\n`;
        instructions += `- Add tests to prevent regression\n`;
        instructions += `- Ensure fix doesn't break existing functionality\n`;
        instructions += `- Document the fix in commit messages\n\n`;
        break;

      case 'refactor':
        instructions += `## Refactoring Guidelines\n`;
        instructions += `- Maintain existing functionality\n`;
        instructions += `- Improve code structure and readability\n`;
        instructions += `- Update tests to match new structure\n`;
        instructions += `- Ensure performance is maintained or improved\n\n`;
        break;
    }

    instructions += `## Quality Requirements\n`;
    instructions += `- Follow project coding standards\n`;
    instructions += `- Include appropriate error handling\n`;
    instructions += `- Maintain or improve test coverage\n`;
    instructions += `- Use clear, descriptive variable and function names\n`;
    instructions += `- Add comments for complex logic\n\n`;

    return instructions;
  }

  /**
   * Start execution via AgentAPI
   * @param {Object} claudeTask - Prepared task
   * @param {string} executionId - Execution ID
   * @returns {Promise<Object>} Execution handle
   */
  async startExecution(claudeTask, executionId) {
    const payload = {
      agent: 'claude-code',
      task: claudeTask,
      execution_id: executionId,
      options: {
        timeout: this.config.timeout,
        stream: true,
        workspace: claudeTask.repository || 'default'
      }
    };

    log('info', '🚀 Starting AgentAPI execution', {
      executionId,
      agent: payload.agent,
      workspace: payload.options.workspace
    });

    // TODO: Implement actual AgentAPI call
    // This would make an HTTP request to the AgentAPI service
    const response = await this.callAgentAPI('/execute', 'POST', payload);
    
    return {
      id: response.execution_id || executionId,
      status: 'running',
      startTime: new Date(),
      agentApiResponse: response
    };
  }

  /**
   * Monitor execution progress
   * @param {Object} execution - Execution handle
   * @param {string} executionId - Execution ID
   * @returns {Promise<Object>} Final result
   */
  async monitorExecution(execution, executionId) {
    const startTime = Date.now();
    let lastStatus = 'running';
    
    log('info', '👀 Monitoring execution progress', {
      executionId,
      timeout: this.config.timeout
    });

    while (true) {
      try {
        // Check execution status
        const status = await this.getExecutionStatus(execution.id);
        
        if (status.status !== lastStatus) {
          log('info', `📊 Execution status changed: ${lastStatus} → ${status.status}`, {
            executionId,
            progress: status.progress
          });
          lastStatus = status.status;
        }

        // Check if completed
        if (status.status === 'completed') {
          const result = await this.getExecutionResult(execution.id);
          return this.processExecutionResult(result, startTime);
        }

        // Check if failed
        if (status.status === 'failed') {
          const error = await this.getExecutionError(execution.id);
          throw new Error(`Claude Code execution failed: ${error.message}`);
        }

        // Check timeout
        if (Date.now() - startTime > this.config.timeout) {
          await this.cancelExecution(execution.id);
          throw new Error('Claude Code execution timed out');
        }

        // Wait before next check
        await this.sleep(2000);

      } catch (error) {
        if (error.message.includes('timed out') || error.message.includes('failed')) {
          throw error;
        }
        
        log('warn', '⚠️ Error checking execution status, retrying...', {
          executionId,
          error: error.message
        });
        
        await this.sleep(5000);
      }
    }
  }

  /**
   * Get execution status from AgentAPI
   * @param {string} executionId - Execution ID
   * @returns {Promise<Object>} Status information
   */
  async getExecutionStatus(executionId) {
    // TODO: Implement actual AgentAPI status check
    const response = await this.callAgentAPI(`/execution/${executionId}/status`, 'GET');
    
    return {
      status: response.status || 'running',
      progress: response.progress || 0,
      currentStep: response.current_step,
      message: response.message
    };
  }

  /**
   * Get execution result from AgentAPI
   * @param {string} executionId - Execution ID
   * @returns {Promise<Object>} Execution result
   */
  async getExecutionResult(executionId) {
    // TODO: Implement actual AgentAPI result retrieval
    const response = await this.callAgentAPI(`/execution/${executionId}/result`, 'GET');
    
    return response;
  }

  /**
   * Get execution error from AgentAPI
   * @param {string} executionId - Execution ID
   * @returns {Promise<Object>} Error information
   */
  async getExecutionError(executionId) {
    // TODO: Implement actual AgentAPI error retrieval
    const response = await this.callAgentAPI(`/execution/${executionId}/error`, 'GET');
    
    return {
      message: response.error || 'Unknown error',
      details: response.details,
      stack: response.stack
    };
  }

  /**
   * Cancel execution via AgentAPI
   * @param {string} executionId - Execution ID
   * @returns {Promise<void>}
   */
  async cancelExecution(executionId) {
    log('info', '🛑 Cancelling execution', { executionId });
    
    // TODO: Implement actual AgentAPI cancellation
    await this.callAgentAPI(`/execution/${executionId}/cancel`, 'POST');
  }

  /**
   * Process execution result
   * @param {Object} result - Raw result from AgentAPI
   * @param {number} startTime - Execution start time
   * @returns {Object} Processed result
   */
  processExecutionResult(result, startTime) {
    const duration = Date.now() - startTime;
    
    return {
      success: true,
      duration,
      filesModified: result.files_modified || [],
      filesCreated: result.files_created || [],
      filesDeleted: result.files_deleted || [],
      commitHash: result.commit_hash,
      branchName: result.branch_name,
      summary: result.summary || 'Code generation completed',
      details: result.details || {},
      metrics: {
        linesAdded: result.metrics?.lines_added || 0,
        linesRemoved: result.metrics?.lines_removed || 0,
        filesChanged: result.metrics?.files_changed || 0,
        executionTime: duration
      },
      artifacts: result.artifacts || [],
      logs: result.logs || []
    };
  }

  /**
   * Make HTTP call to AgentAPI
   * @param {string} endpoint - API endpoint
   * @param {string} method - HTTP method
   * @param {Object} data - Request data
   * @returns {Promise<Object>} Response data
   */
  async callAgentAPI(endpoint, method = 'GET', data = null) {
    const url = `${this.config.agentApiUrl}${endpoint}`;
    
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'claude-task-master/1.0.0'
      }
    };

    if (data && method !== 'GET') {
      options.body = JSON.stringify(data);
    }

    log('debug', `🌐 AgentAPI ${method} ${endpoint}`, {
      url,
      hasData: !!data
    });

    // TODO: Implement actual HTTP request
    // For now, return mock response
    return this.getMockResponse(endpoint, method, data);
  }

  /**
   * Get mock response for development
   * @param {string} endpoint - API endpoint
   * @param {string} method - HTTP method
   * @param {Object} data - Request data
   * @returns {Object} Mock response
   */
  getMockResponse(endpoint, method, data) {
    if (endpoint === '/execute' && method === 'POST') {
      return {
        execution_id: data.execution_id,
        status: 'started',
        message: 'Execution started successfully'
      };
    }

    if (endpoint.includes('/status')) {
      return {
        status: 'completed',
        progress: 100,
        current_step: 'finished',
        message: 'Execution completed'
      };
    }

    if (endpoint.includes('/result')) {
      return {
        files_modified: ['src/example.js', 'src/utils/helper.js'],
        files_created: ['src/new-feature.js'],
        commit_hash: 'abc123def456',
        branch_name: 'feature/claude-generated',
        summary: 'Successfully implemented the requested feature',
        details: {
          changes_summary: 'Added new functionality and updated existing code',
          test_results: 'All tests passing'
        },
        metrics: {
          lines_added: 150,
          lines_removed: 25,
          files_changed: 3
        }
      };
    }

    return {};
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get active executions
   * @returns {Array} Active executions
   */
  getActiveExecutions() {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Cancel all active executions
   * @returns {Promise<void>}
   */
  async cancelAllExecutions() {
    const executions = Array.from(this.activeExecutions.keys());
    
    log('info', '🛑 Cancelling all active executions', {
      count: executions.length
    });

    await Promise.all(
      executions.map(executionId => 
        this.cancelExecution(executionId).catch(error => 
          log('error', `Failed to cancel execution ${executionId}`, { error: error.message })
        )
      )
    );

    this.activeExecutions.clear();
  }

  /**
   * Get executor health status
   * @returns {Object} Health status
   */
  async getHealthStatus() {
    try {
      // TODO: Implement actual health check
      const response = await this.callAgentAPI('/health', 'GET');
      
      return {
        status: 'healthy',
        agentApiStatus: response.status || 'unknown',
        activeExecutions: this.activeExecutions.size,
        lastCheck: new Date()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        activeExecutions: this.activeExecutions.size,
        lastCheck: new Date()
      };
    }
  }
}

