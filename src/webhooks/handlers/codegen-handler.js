/**
 * Codegen Handler
 * 
 * Handler for triggering Codegen AI-powered error resolution
 * and automated PR fixes when workflows fail.
 */

import axios from 'axios';
import { logger } from '../../utils/logger.js';

export class CodegenHandler {
  constructor(config = {}) {
    this.config = {
      apiUrl: config.apiUrl || process.env.CODEGEN_API_URL || 'https://api.codegen.sh',
      timeout: config.timeout || 60000,
      retryAttempts: config.retryAttempts || 1,
      apiKey: config.apiKey || process.env.CODEGEN_API_KEY,
      ...config
    };

    this.client = axios.create({
      baseURL: this.config.apiUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'claude-task-master-webhook/1.0.0',
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
      }
    });

    this.stats = {
      triggersInitiated: 0,
      triggersSucceeded: 0,
      triggersFailed: 0,
      workflowFailuresHandled: 0,
      prFixesGenerated: 0
    };
  }

  /**
   * Handle workflow failures by triggering Codegen
   */
  async handleWorkflowFailure(event) {
    try {
      logger.info('Triggering Codegen for workflow failure', {
        eventId: event.id,
        repository: event.repository.fullName,
        workflowId: event.workflowRun.id,
        conclusion: event.workflowRun.conclusion
      });

      const triggerRequest = {
        type: 'workflow_failure',
        repository: {
          fullName: event.repository.fullName,
          cloneUrl: event.repository.cloneUrl,
          defaultBranch: event.repository.defaultBranch
        },
        workflowRun: {
          id: event.workflowRun.id,
          name: event.workflowRun.name,
          status: event.workflowRun.status,
          conclusion: event.workflowRun.conclusion,
          headBranch: event.workflowRun.headBranch,
          headSha: event.workflowRun.headSha,
          runNumber: event.workflowRun.runNumber,
          url: event.workflowRun.url,
          pullRequests: event.workflowRun.pullRequests
        },
        context: {
          eventId: event.id,
          timestamp: event.timestamp,
          delivery: event.delivery,
          priority: 'high' // Workflow failures are high priority
        },
        instructions: {
          task: 'analyze_and_fix_workflow_failure',
          description: `Workflow "${event.workflowRun.name}" failed in repository ${event.repository.fullName}. Please analyze the failure and create a PR with fixes.`,
          requirements: [
            'Analyze workflow logs and identify root cause',
            'Fix any code issues that caused the failure',
            'Update tests if necessary',
            'Ensure the fix doesn\'t break other functionality',
            'Create a descriptive PR with the fix'
          ]
        }
      };

      const response = await this.client.post('/triggers/workflow-failure', triggerRequest);
      
      this.stats.triggersInitiated++;
      this.stats.triggersSucceeded++;
      this.stats.workflowFailuresHandled++;

      logger.info('Codegen workflow failure trigger sent successfully', {
        eventId: event.id,
        triggerId: response.data.triggerId,
        status: response.data.status,
        estimatedTime: response.data.estimatedTime
      });

      return {
        success: true,
        triggerId: response.data.triggerId,
        status: response.data.status,
        estimatedTime: response.data.estimatedTime,
        message: 'Codegen triggered for workflow failure analysis'
      };

    } catch (error) {
      this.stats.triggersFailed++;
      
      logger.error('Codegen workflow failure trigger failed', {
        eventId: event.id,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });

      throw new Error(`Codegen workflow failure trigger failed: ${error.message}`);
    }
  }

  /**
   * Handle general PR failures and errors
   */
  async handlePRFailure(event, errorContext = {}) {
    try {
      logger.info('Triggering Codegen for PR failure', {
        eventId: event.id,
        repository: event.repository.fullName,
        prNumber: event.pullRequest?.number,
        errorType: errorContext.type
      });

      const triggerRequest = {
        type: 'pr_failure',
        repository: {
          fullName: event.repository.fullName,
          cloneUrl: event.repository.cloneUrl,
          defaultBranch: event.repository.defaultBranch
        },
        pullRequest: event.pullRequest ? {
          number: event.pullRequest.number,
          title: event.pullRequest.title,
          body: event.pullRequest.body,
          head: event.pullRequest.head,
          base: event.pullRequest.base,
          url: event.pullRequest.url
        } : null,
        errorContext: {
          type: errorContext.type || 'unknown',
          message: errorContext.message || 'PR processing failed',
          details: errorContext.details || {},
          timestamp: errorContext.timestamp || new Date().toISOString()
        },
        context: {
          eventId: event.id,
          timestamp: event.timestamp,
          delivery: event.delivery,
          priority: 'medium'
        },
        instructions: {
          task: 'analyze_and_fix_pr_issues',
          description: `PR processing failed in repository ${event.repository.fullName}. Please analyze and fix the issues.`,
          requirements: [
            'Analyze the error context and identify root cause',
            'Fix any code issues in the PR',
            'Update or add tests as needed',
            'Ensure CI/CD pipeline passes',
            'Update PR with fixes and explanations'
          ]
        }
      };

      const response = await this.client.post('/triggers/pr-failure', triggerRequest);
      
      this.stats.triggersInitiated++;
      this.stats.triggersSucceeded++;
      this.stats.prFixesGenerated++;

      logger.info('Codegen PR failure trigger sent successfully', {
        eventId: event.id,
        triggerId: response.data.triggerId,
        status: response.data.status
      });

      return {
        success: true,
        triggerId: response.data.triggerId,
        status: response.data.status,
        message: 'Codegen triggered for PR failure analysis'
      };

    } catch (error) {
      this.stats.triggersFailed++;
      
      logger.error('Codegen PR failure trigger failed', {
        eventId: event.id,
        error: error.message
      });

      throw new Error(`Codegen PR failure trigger failed: ${error.message}`);
    }
  }

  /**
   * Handle deployment failures
   */
  async handleDeploymentFailure(event, deploymentContext = {}) {
    try {
      logger.info('Triggering Codegen for deployment failure', {
        eventId: event.id,
        repository: event.repository.fullName,
        deploymentId: deploymentContext.deploymentId
      });

      const triggerRequest = {
        type: 'deployment_failure',
        repository: {
          fullName: event.repository.fullName,
          cloneUrl: event.repository.cloneUrl,
          defaultBranch: event.repository.defaultBranch
        },
        deployment: {
          id: deploymentContext.deploymentId,
          environment: deploymentContext.environment || 'unknown',
          status: deploymentContext.status || 'failed',
          errorMessage: deploymentContext.errorMessage,
          logs: deploymentContext.logs || [],
          timestamp: deploymentContext.timestamp
        },
        pullRequest: event.pullRequest,
        context: {
          eventId: event.id,
          timestamp: event.timestamp,
          delivery: event.delivery,
          priority: 'high'
        },
        instructions: {
          task: 'analyze_and_fix_deployment_failure',
          description: `Deployment failed for repository ${event.repository.fullName}. Please analyze and fix the deployment issues.`,
          requirements: [
            'Analyze deployment logs and error messages',
            'Identify configuration or code issues',
            'Fix deployment scripts or configuration',
            'Test deployment process',
            'Create PR with deployment fixes'
          ]
        }
      };

      const response = await this.client.post('/triggers/deployment-failure', triggerRequest);
      
      this.stats.triggersInitiated++;
      this.stats.triggersSucceeded++;

      logger.info('Codegen deployment failure trigger sent successfully', {
        eventId: event.id,
        triggerId: response.data.triggerId,
        status: response.data.status
      });

      return {
        success: true,
        triggerId: response.data.triggerId,
        status: response.data.status,
        message: 'Codegen triggered for deployment failure analysis'
      };

    } catch (error) {
      this.stats.triggersFailed++;
      
      logger.error('Codegen deployment failure trigger failed', {
        eventId: event.id,
        error: error.message
      });

      throw new Error(`Codegen deployment failure trigger failed: ${error.message}`);
    }
  }

  /**
   * Trigger general code analysis and improvements
   */
  async triggerCodeAnalysis(event, analysisType = 'general') {
    try {
      logger.info('Triggering Codegen for code analysis', {
        eventId: event.id,
        repository: event.repository.fullName,
        analysisType
      });

      const triggerRequest = {
        type: 'code_analysis',
        repository: {
          fullName: event.repository.fullName,
          cloneUrl: event.repository.cloneUrl,
          defaultBranch: event.repository.defaultBranch
        },
        analysis: {
          type: analysisType,
          scope: event.pullRequest ? 'pr' : 'repository',
          target: event.pullRequest ? {
            number: event.pullRequest.number,
            head: event.pullRequest.head,
            base: event.pullRequest.base
          } : {
            branch: event.repository.defaultBranch
          }
        },
        context: {
          eventId: event.id,
          timestamp: event.timestamp,
          delivery: event.delivery,
          priority: 'low'
        },
        instructions: {
          task: 'analyze_and_improve_code',
          description: `Perform ${analysisType} code analysis for repository ${event.repository.fullName}.`,
          requirements: [
            'Analyze code quality and patterns',
            'Identify potential improvements',
            'Check for security vulnerabilities',
            'Suggest performance optimizations',
            'Create PR with improvements if significant issues found'
          ]
        }
      };

      const response = await this.client.post('/triggers/code-analysis', triggerRequest);
      
      this.stats.triggersInitiated++;
      this.stats.triggersSucceeded++;

      logger.info('Codegen code analysis trigger sent successfully', {
        eventId: event.id,
        triggerId: response.data.triggerId,
        analysisType
      });

      return {
        success: true,
        triggerId: response.data.triggerId,
        status: response.data.status,
        message: 'Codegen triggered for code analysis'
      };

    } catch (error) {
      this.stats.triggersFailed++;
      
      logger.error('Codegen code analysis trigger failed', {
        eventId: event.id,
        error: error.message
      });

      throw new Error(`Codegen code analysis trigger failed: ${error.message}`);
    }
  }

  /**
   * Get trigger status
   */
  async getTriggerStatus(triggerId) {
    try {
      const response = await this.client.get(`/triggers/${triggerId}/status`);
      return response.data;

    } catch (error) {
      logger.error('Failed to get trigger status', {
        triggerId,
        error: error.message
      });

      throw new Error(`Failed to get trigger status: ${error.message}`);
    }
  }

  /**
   * Cancel a trigger
   */
  async cancelTrigger(triggerId, reason = 'Manual cancellation') {
    try {
      const response = await this.client.post(`/triggers/${triggerId}/cancel`, {
        reason
      });

      logger.info('Codegen trigger cancelled', {
        triggerId,
        reason
      });

      return response.data;

    } catch (error) {
      logger.error('Failed to cancel trigger', {
        triggerId,
        error: error.message
      });

      throw new Error(`Failed to cancel trigger: ${error.message}`);
    }
  }

  /**
   * Health check for Codegen service
   */
  async healthCheck() {
    try {
      const response = await this.client.get('/health');
      
      return {
        healthy: true,
        status: response.data.status,
        version: response.data.version,
        uptime: response.data.uptime
      };

    } catch (error) {
      logger.warn('Codegen health check failed', {
        error: error.message
      });

      return {
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Get handler statistics
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.triggersInitiated > 0
        ? ((this.stats.triggersSucceeded / this.stats.triggersInitiated) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      triggersInitiated: 0,
      triggersSucceeded: 0,
      triggersFailed: 0,
      workflowFailuresHandled: 0,
      prFixesGenerated: 0
    };
  }
}

export default CodegenHandler;

