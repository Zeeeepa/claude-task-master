/**
 * Claude Code Handler
 * 
 * Handler for integrating with Claude Code for PR deployment
 * and validation workflows on WSL2 instances.
 */

import axios from 'axios';
import { logger } from '../../utils/logger.js';

export class ClaudeCodeHandler {
  constructor(config = {}) {
    this.config = {
      apiUrl: config.apiUrl || process.env.CLAUDE_CODE_API_URL || 'http://localhost:3001',
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 2,
      apiKey: config.apiKey || process.env.CLAUDE_CODE_API_KEY,
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
      deploymentsTriggered: 0,
      deploymentsSucceeded: 0,
      deploymentsFailed: 0,
      cleanupOperations: 0
    };
  }

  /**
   * Deploy PR to Claude Code instance
   */
  async deployPR(event) {
    try {
      logger.info('Triggering Claude Code PR deployment', {
        eventId: event.id,
        repository: event.repository.fullName,
        prNumber: event.pullRequest.number,
        branch: event.pullRequest.head.ref
      });

      const deploymentRequest = {
        repository: {
          fullName: event.repository.fullName,
          cloneUrl: event.repository.cloneUrl,
          defaultBranch: event.repository.defaultBranch
        },
        pullRequest: {
          number: event.pullRequest.number,
          title: event.pullRequest.title,
          body: event.pullRequest.body,
          head: {
            ref: event.pullRequest.head.ref,
            sha: event.pullRequest.head.sha,
            repo: event.pullRequest.head.repo
          },
          base: {
            ref: event.pullRequest.base.ref,
            sha: event.pullRequest.base.sha,
            repo: event.pullRequest.base.repo
          },
          url: event.pullRequest.url
        },
        metadata: {
          eventId: event.id,
          timestamp: event.timestamp,
          triggeredBy: 'webhook'
        }
      };

      const response = await this.client.post('/deployments', deploymentRequest);
      
      this.stats.deploymentsTriggered++;
      this.stats.deploymentsSucceeded++;

      logger.info('Claude Code deployment triggered successfully', {
        eventId: event.id,
        deploymentId: response.data.deploymentId,
        status: response.data.status
      });

      return {
        success: true,
        deploymentId: response.data.deploymentId,
        status: response.data.status,
        message: 'PR deployment triggered successfully'
      };

    } catch (error) {
      this.stats.deploymentsFailed++;
      
      logger.error('Claude Code deployment failed', {
        eventId: event.id,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });

      throw new Error(`Claude Code deployment failed: ${error.message}`);
    }
  }

  /**
   * Update existing deployment
   */
  async updateDeployment(event) {
    try {
      logger.info('Updating Claude Code deployment', {
        eventId: event.id,
        repository: event.repository.fullName,
        prNumber: event.pullRequest.number,
        newSha: event.pullRequest.head.sha
      });

      const updateRequest = {
        pullRequest: {
          number: event.pullRequest.number,
          head: {
            ref: event.pullRequest.head.ref,
            sha: event.pullRequest.head.sha
          }
        },
        repository: {
          fullName: event.repository.fullName
        },
        metadata: {
          eventId: event.id,
          timestamp: event.timestamp,
          action: 'update'
        }
      };

      const response = await this.client.put(
        `/deployments/pr/${event.pullRequest.number}`,
        updateRequest
      );

      logger.info('Claude Code deployment updated successfully', {
        eventId: event.id,
        deploymentId: response.data.deploymentId,
        status: response.data.status
      });

      return {
        success: true,
        deploymentId: response.data.deploymentId,
        status: response.data.status,
        message: 'Deployment updated successfully'
      };

    } catch (error) {
      logger.error('Claude Code deployment update failed', {
        eventId: event.id,
        error: error.message,
        status: error.response?.status
      });

      throw new Error(`Claude Code deployment update failed: ${error.message}`);
    }
  }

  /**
   * Clean up deployment when PR is closed
   */
  async cleanupDeployment(event) {
    try {
      logger.info('Cleaning up Claude Code deployment', {
        eventId: event.id,
        repository: event.repository.fullName,
        prNumber: event.pullRequest.number,
        merged: event.pullRequest.merged
      });

      const cleanupRequest = {
        pullRequest: {
          number: event.pullRequest.number,
          merged: event.pullRequest.merged
        },
        repository: {
          fullName: event.repository.fullName
        },
        metadata: {
          eventId: event.id,
          timestamp: event.timestamp,
          action: 'cleanup'
        }
      };

      const response = await this.client.delete(
        `/deployments/pr/${event.pullRequest.number}`,
        { data: cleanupRequest }
      );

      this.stats.cleanupOperations++;

      logger.info('Claude Code deployment cleaned up successfully', {
        eventId: event.id,
        deploymentId: response.data.deploymentId,
        resourcesFreed: response.data.resourcesFreed
      });

      return {
        success: true,
        deploymentId: response.data.deploymentId,
        resourcesFreed: response.data.resourcesFreed,
        message: 'Deployment cleaned up successfully'
      };

    } catch (error) {
      logger.error('Claude Code deployment cleanup failed', {
        eventId: event.id,
        error: error.message,
        status: error.response?.status
      });

      // Don't throw error for cleanup failures - log and continue
      return {
        success: false,
        error: error.message,
        message: 'Deployment cleanup failed but continuing'
      };
    }
  }

  /**
   * Redeploy PR when reopened
   */
  async redeployPR(event) {
    try {
      logger.info('Redeploying Claude Code PR', {
        eventId: event.id,
        repository: event.repository.fullName,
        prNumber: event.pullRequest.number
      });

      // Redeployment is similar to initial deployment
      return await this.deployPR(event);

    } catch (error) {
      logger.error('Claude Code redeployment failed', {
        eventId: event.id,
        error: error.message
      });

      throw new Error(`Claude Code redeployment failed: ${error.message}`);
    }
  }

  /**
   * Handle workflow run results
   */
  async handleWorkflowResult(event) {
    try {
      logger.info('Processing workflow result in Claude Code', {
        eventId: event.id,
        workflowId: event.workflowRun.id,
        status: event.workflowRun.status,
        conclusion: event.workflowRun.conclusion
      });

      const workflowRequest = {
        workflowRun: {
          id: event.workflowRun.id,
          name: event.workflowRun.name,
          status: event.workflowRun.status,
          conclusion: event.workflowRun.conclusion,
          headBranch: event.workflowRun.headBranch,
          headSha: event.workflowRun.headSha,
          url: event.workflowRun.url
        },
        repository: {
          fullName: event.repository.fullName
        },
        metadata: {
          eventId: event.id,
          timestamp: event.timestamp
        }
      };

      const response = await this.client.post('/workflows/results', workflowRequest);

      logger.info('Workflow result processed successfully', {
        eventId: event.id,
        workflowId: event.workflowRun.id,
        action: response.data.action
      });

      return {
        success: true,
        action: response.data.action,
        message: 'Workflow result processed successfully'
      };

    } catch (error) {
      logger.error('Workflow result processing failed', {
        eventId: event.id,
        error: error.message,
        status: error.response?.status
      });

      throw new Error(`Workflow result processing failed: ${error.message}`);
    }
  }

  /**
   * Get deployment status
   */
  async getDeploymentStatus(prNumber, repository) {
    try {
      const response = await this.client.get(
        `/deployments/pr/${prNumber}/status`,
        {
          params: { repository }
        }
      );

      return response.data;

    } catch (error) {
      logger.error('Failed to get deployment status', {
        prNumber,
        repository,
        error: error.message
      });

      throw new Error(`Failed to get deployment status: ${error.message}`);
    }
  }

  /**
   * List all active deployments
   */
  async listActiveDeployments() {
    try {
      const response = await this.client.get('/deployments/active');
      return response.data;

    } catch (error) {
      logger.error('Failed to list active deployments', {
        error: error.message
      });

      throw new Error(`Failed to list active deployments: ${error.message}`);
    }
  }

  /**
   * Health check for Claude Code service
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
      logger.warn('Claude Code health check failed', {
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
      successRate: this.stats.deploymentsTriggered > 0
        ? ((this.stats.deploymentsSucceeded / this.stats.deploymentsTriggered) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      deploymentsTriggered: 0,
      deploymentsSucceeded: 0,
      deploymentsFailed: 0,
      cleanupOperations: 0
    };
  }
}

export default ClaudeCodeHandler;

