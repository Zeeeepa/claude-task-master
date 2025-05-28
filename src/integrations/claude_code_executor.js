/**
 * @fileoverview Claude Code Task Executor
 * @description Task execution logic for Claude Code operations via AgentAPI
 */

import { AgentAPIClient } from './agentapi_client.js';
import { Task } from '../ai_cicd_system/database/models/Task.js';

/**
 * Task execution model for tracking execution state
 */
class TaskExecution {
  constructor(data = {}) {
    this.id = data.id;
    this.taskId = data.taskId;
    this.status = data.status || 'pending';
    this.result = data.result || null;
    this.error = data.error || null;
    this.startedAt = data.startedAt || null;
    this.completedAt = data.completedAt || null;
    this.logs = data.logs || [];
    this.metadata = data.metadata || {};
  }

  async updateStatus(status, data = {}) {
    this.status = status;
    
    if (status === 'running' && !this.startedAt) {
      this.startedAt = new Date();
    }
    
    if (status === 'completed' || status === 'failed') {
      this.completedAt = new Date();
    }
    
    if (data.result) {
      this.result = data.result;
    }
    
    if (data.error) {
      this.error = data.error;
    }
    
    if (data.logs) {
      this.logs.push(...data.logs);
    }
    
    // In a real implementation, this would save to database
    console.log(`Task execution ${this.id} status updated to: ${status}`);
    
    return this;
  }

  static async findById(id) {
    // In a real implementation, this would query the database
    return new TaskExecution({ id });
  }
}

/**
 * Claude Code Task Executor
 */
export class ClaudeCodeExecutor {
  constructor(config = {}) {
    this.agentAPI = new AgentAPIClient(config.agentAPI || {});
    this.workspaceConfig = config.workspace || {
      basePath: '/tmp/workspace',
      cleanupAfter: 3600000, // 1 hour
      maxConcurrent: 10
    };
    this.claudeConfig = config.claude || {
      allowedTools: ['Bash(git*)', 'Edit', 'Replace'],
      maxTokens: 4000,
      temperature: 0.1
    };
  }

  /**
   * Execute a task using Claude Code
   * @param {Object} task - Task object
   * @param {string} executionId - Execution ID
   * @returns {Promise<Object>} Execution result
   */
  async executeTask(task, executionId) {
    const execution = await TaskExecution.findById(executionId);
    
    try {
      await execution.updateStatus('running');
      
      // Prepare workspace
      await this.prepareWorkspace(task);
      
      // Generate code modification prompt
      const prompt = this.generatePrompt(task);
      
      // Send to Claude Code
      const messageResponse = await this.agentAPI.sendMessage(prompt);
      console.log('Sent prompt to Claude Code:', messageResponse);
      
      // Wait for completion
      await this.agentAPI.waitForCompletion();
      
      // Get results
      const messages = await this.agentAPI.getMessages();
      const result = this.parseResults(messages);
      
      await execution.updateStatus('completed', { result });
      
      return result;
      
    } catch (error) {
      console.error('Task execution failed:', error);
      await execution.updateStatus('failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate a prompt for Claude Code based on the task
   * @param {Object} task - Task object
   * @returns {string} Generated prompt
   */
  generatePrompt(task) {
    const basePrompt = `
# Task: ${task.title}

## Description
${task.description}

## Requirements
${JSON.stringify(task.requirements, null, 2)}

## Instructions
1. Analyze the current codebase
2. Implement the required changes
3. Ensure code quality and testing
4. Create appropriate documentation
5. Prepare for PR creation

Please implement these changes following best practices and provide a summary of what was modified.
    `.trim();

    // Add specific instructions based on task type
    if (task.type === 'feature') {
      return basePrompt + `

## Additional Feature Requirements
- Implement comprehensive error handling
- Add unit tests for new functionality
- Update documentation
- Follow existing code patterns and conventions`;
    }

    if (task.type === 'bugfix') {
      return basePrompt + `

## Bug Fix Requirements
- Identify the root cause of the issue
- Implement a minimal, targeted fix
- Add regression tests
- Verify the fix doesn't break existing functionality`;
    }

    if (task.type === 'refactor') {
      return basePrompt + `

## Refactoring Requirements
- Maintain existing functionality
- Improve code structure and readability
- Update tests if necessary
- Document any breaking changes`;
    }

    return basePrompt;
  }

  /**
   * Prepare the workspace for task execution
   * @param {Object} task - Task object
   * @returns {Promise<void>}
   */
  async prepareWorkspace(task) {
    try {
      // Clone repository if needed
      if (task.requirements && task.requirements.repository) {
        const workspacePath = `${this.workspaceConfig.basePath}/${task.id}`;
        const cloneCommand = `git clone ${task.requirements.repository} ${workspacePath}`;
        
        await this.agentAPI.sendMessage(`Please execute: ${cloneCommand}`);
        await this.agentAPI.waitForCompletion();
        
        // Change to the workspace directory
        await this.agentAPI.sendMessage(`cd ${workspacePath}`);
      }

      // Set up environment variables if specified
      if (task.requirements && task.requirements.environment) {
        for (const [key, value] of Object.entries(task.requirements.environment)) {
          await this.agentAPI.sendMessage(`export ${key}="${value}"`);
        }
      }

      // Install dependencies if specified
      if (task.requirements && task.requirements.dependencies) {
        const installCommands = task.requirements.dependencies.map(dep => 
          `npm install ${dep}`
        );
        
        for (const command of installCommands) {
          await this.agentAPI.sendMessage(`Please execute: ${command}`);
          await this.agentAPI.waitForCompletion();
        }
      }

    } catch (error) {
      console.error('Workspace preparation failed:', error);
      throw new Error(`Failed to prepare workspace: ${error.message}`);
    }
  }

  /**
   * Parse results from agent messages
   * @param {Array} messages - Array of messages from the agent
   * @returns {Object} Parsed results
   */
  parseResults(messages) {
    // Extract relevant information from agent messages
    const agentMessages = messages.filter(m => m.type === 'agent' || m.type === 'assistant');
    const lastMessage = agentMessages[agentMessages.length - 1];
    
    return {
      summary: lastMessage?.content || 'Task completed',
      filesModified: this.extractModifiedFiles(messages),
      errors: this.extractErrors(messages),
      commands: this.extractCommands(messages),
      totalMessages: messages.length,
      agentMessages: agentMessages.length
    };
  }

  /**
   * Extract modified files from messages
   * @param {Array} messages - Array of messages
   * @returns {Array} List of modified files
   */
  extractModifiedFiles(messages) {
    const modifiedFiles = [];
    const filePatterns = [
      /(?:created|modified|updated|edited)\s+(?:file\s+)?[`'""]?([^\s`'""\n]+\.[a-zA-Z0-9]+)[`'""]?/gi,
      /(?:writing|saving)\s+(?:to\s+)?[`'""]?([^\s`'""\n]+\.[a-zA-Z0-9]+)[`'""]?/gi,
      /[`'""]([^\s`'""\n]*\.[a-zA-Z0-9]+)[`'""]?\s+(?:has been|was)\s+(?:created|modified|updated)/gi
    ];

    messages.forEach(message => {
      if (message.content) {
        filePatterns.forEach(pattern => {
          let match;
          while ((match = pattern.exec(message.content)) !== null) {
            const file = match[1];
            if (file && !modifiedFiles.includes(file)) {
              modifiedFiles.push(file);
            }
          }
        });
      }
    });

    return modifiedFiles;
  }

  /**
   * Extract errors from messages
   * @param {Array} messages - Array of messages
   * @returns {Array} List of errors
   */
  extractErrors(messages) {
    const errors = [];
    const errorPatterns = [
      /error[:\s]+(.+)/gi,
      /failed[:\s]+(.+)/gi,
      /exception[:\s]+(.+)/gi
    ];

    messages.forEach(message => {
      if (message.content) {
        errorPatterns.forEach(pattern => {
          let match;
          while ((match = pattern.exec(message.content)) !== null) {
            errors.push(match[1].trim());
          }
        });
      }
    });

    return errors;
  }

  /**
   * Extract executed commands from messages
   * @param {Array} messages - Array of messages
   * @returns {Array} List of commands
   */
  extractCommands(messages) {
    const commands = [];
    const commandPatterns = [
      /(?:executing|running|ran)\s+[`'""]?([^`'""\n]+)[`'""]?/gi,
      /\$\s+([^\n]+)/gi,
      />\s+([^\n]+)/gi
    ];

    messages.forEach(message => {
      if (message.content) {
        commandPatterns.forEach(pattern => {
          let match;
          while ((match = pattern.exec(message.content)) !== null) {
            const command = match[1].trim();
            if (command && !commands.includes(command)) {
              commands.push(command);
            }
          }
        });
      }
    });

    return commands;
  }

  /**
   * Get execution statistics
   * @returns {Object} Statistics
   */
  getStatistics() {
    return {
      circuitBreaker: this.agentAPI.getCircuitBreakerStatus(),
      workspace: {
        basePath: this.workspaceConfig.basePath,
        maxConcurrent: this.workspaceConfig.maxConcurrent
      },
      claude: this.claudeConfig
    };
  }

  /**
   * Clean up workspace
   * @param {string} taskId - Task ID
   * @returns {Promise<void>}
   */
  async cleanupWorkspace(taskId) {
    try {
      const workspacePath = `${this.workspaceConfig.basePath}/${taskId}`;
      await this.agentAPI.sendMessage(`rm -rf ${workspacePath}`);
      console.log(`Cleaned up workspace for task ${taskId}`);
    } catch (error) {
      console.error(`Failed to cleanup workspace for task ${taskId}:`, error);
    }
  }
}

export { TaskExecution };
export default ClaudeCodeExecutor;

