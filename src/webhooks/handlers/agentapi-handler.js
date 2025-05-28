/**
 * AgentAPI Handler
 * 
 * Handler for communicating with AgentAPI middleware
 * for PR context and metadata processing.
 */

import axios from 'axios';
import { logger } from '../../utils/logger.js';

export class AgentAPIHandler {
  constructor(config = {}) {
    this.config = {
      apiUrl: config.apiUrl || process.env.AGENTAPI_URL || 'http://localhost:3002',
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 2,
      apiKey: config.apiKey || process.env.AGENTAPI_API_KEY,
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
      notificationsSent: 0,
      notificationsSucceeded: 0,
      notificationsFailed: 0,
      contextProcessed: 0
    };
  }

  /**
   * Notify AgentAPI of PR creation
   */
  async notifyPRCreated(event) {
    try {
      logger.info('Notifying AgentAPI of PR creation', {
        eventId: event.id,
        repository: event.repository.fullName,
        prNumber: event.pullRequest.number
      });

      const notification = {
        type: 'pr_created',
        repository: {
          fullName: event.repository.fullName,
          cloneUrl: event.repository.cloneUrl,
          defaultBranch: event.repository.defaultBranch,
          private: event.repository.private
        },
        pullRequest: {
          number: event.pullRequest.number,
          title: event.pullRequest.title,
          body: event.pullRequest.body,
          state: event.pullRequest.state,
          head: event.pullRequest.head,
          base: event.pullRequest.base,
          user: event.pullRequest.user,
          url: event.pullRequest.url,
          createdAt: event.pullRequest.createdAt
        },
        context: {
          eventId: event.id,
          timestamp: event.timestamp,
          delivery: event.delivery
        }
      };

      const response = await this.client.post('/notifications/pr-created', notification);
      
      this.stats.notificationsSent++;
      this.stats.notificationsSucceeded++;
      this.stats.contextProcessed++;

      logger.info('AgentAPI PR creation notification sent successfully', {
        eventId: event.id,
        notificationId: response.data.notificationId,
        status: response.data.status
      });

      return {
        success: true,
        notificationId: response.data.notificationId,
        status: response.data.status,
        message: 'PR creation notification sent successfully'
      };

    } catch (error) {
      this.stats.notificationsFailed++;
      
      logger.error('AgentAPI PR creation notification failed', {
        eventId: event.id,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });

      throw new Error(`AgentAPI PR creation notification failed: ${error.message}`);
    }
  }

  /**
   * Notify AgentAPI of PR updates
   */
  async notifyPRUpdated(event) {
    try {
      logger.info('Notifying AgentAPI of PR update', {
        eventId: event.id,
        repository: event.repository.fullName,
        prNumber: event.pullRequest.number,
        newSha: event.pullRequest.head.sha
      });

      const notification = {
        type: 'pr_updated',
        repository: {
          fullName: event.repository.fullName
        },
        pullRequest: {
          number: event.pullRequest.number,
          title: event.pullRequest.title,
          head: event.pullRequest.head,
          base: event.pullRequest.base,
          updatedAt: event.pullRequest.updatedAt
        },
        changes: {
          commits: event.payload.pull_request?.commits || 0,
          additions: event.payload.pull_request?.additions || 0,
          deletions: event.payload.pull_request?.deletions || 0,
          changedFiles: event.payload.pull_request?.changed_files || 0
        },
        context: {
          eventId: event.id,
          timestamp: event.timestamp,
          delivery: event.delivery
        }
      };

      const response = await this.client.post('/notifications/pr-updated', notification);
      
      this.stats.notificationsSent++;
      this.stats.notificationsSucceeded++;

      logger.info('AgentAPI PR update notification sent successfully', {
        eventId: event.id,
        notificationId: response.data.notificationId
      });

      return {
        success: true,
        notificationId: response.data.notificationId,
        message: 'PR update notification sent successfully'
      };

    } catch (error) {
      this.stats.notificationsFailed++;
      
      logger.error('AgentAPI PR update notification failed', {
        eventId: event.id,
        error: error.message
      });

      throw new Error(`AgentAPI PR update notification failed: ${error.message}`);
    }
  }

  /**
   * Notify AgentAPI of PR reopening
   */
  async notifyPRReopened(event) {
    try {
      logger.info('Notifying AgentAPI of PR reopening', {
        eventId: event.id,
        repository: event.repository.fullName,
        prNumber: event.pullRequest.number
      });

      const notification = {
        type: 'pr_reopened',
        repository: {
          fullName: event.repository.fullName
        },
        pullRequest: {
          number: event.pullRequest.number,
          title: event.pullRequest.title,
          head: event.pullRequest.head,
          base: event.pullRequest.base,
          user: event.pullRequest.user
        },
        context: {
          eventId: event.id,
          timestamp: event.timestamp,
          delivery: event.delivery
        }
      };

      const response = await this.client.post('/notifications/pr-reopened', notification);
      
      this.stats.notificationsSent++;
      this.stats.notificationsSucceeded++;

      logger.info('AgentAPI PR reopening notification sent successfully', {
        eventId: event.id,
        notificationId: response.data.notificationId
      });

      return {
        success: true,
        notificationId: response.data.notificationId,
        message: 'PR reopening notification sent successfully'
      };

    } catch (error) {
      this.stats.notificationsFailed++;
      
      logger.error('AgentAPI PR reopening notification failed', {
        eventId: event.id,
        error: error.message
      });

      throw new Error(`AgentAPI PR reopening notification failed: ${error.message}`);
    }
  }

  /**
   * Notify AgentAPI of push events
   */
  async notifyPush(event) {
    try {
      logger.info('Notifying AgentAPI of push event', {
        eventId: event.id,
        repository: event.repository.fullName,
        ref: event.push.ref,
        commits: event.push.commits.length
      });

      const notification = {
        type: 'push',
        repository: {
          fullName: event.repository.fullName,
          cloneUrl: event.repository.cloneUrl
        },
        push: {
          ref: event.push.ref,
          before: event.push.before,
          after: event.push.after,
          created: event.push.created,
          deleted: event.push.deleted,
          forced: event.push.forced,
          commits: event.push.commits,
          headCommit: event.push.headCommit,
          pusher: event.push.pusher
        },
        context: {
          eventId: event.id,
          timestamp: event.timestamp,
          delivery: event.delivery
        }
      };

      const response = await this.client.post('/notifications/push', notification);
      
      this.stats.notificationsSent++;
      this.stats.notificationsSucceeded++;

      logger.info('AgentAPI push notification sent successfully', {
        eventId: event.id,
        notificationId: response.data.notificationId
      });

      return {
        success: true,
        notificationId: response.data.notificationId,
        message: 'Push notification sent successfully'
      };

    } catch (error) {
      this.stats.notificationsFailed++;
      
      logger.error('AgentAPI push notification failed', {
        eventId: event.id,
        error: error.message
      });

      throw new Error(`AgentAPI push notification failed: ${error.message}`);
    }
  }

  /**
   * Notify AgentAPI of workflow completion
   */
  async notifyWorkflowCompleted(event) {
    try {
      logger.info('Notifying AgentAPI of workflow completion', {
        eventId: event.id,
        workflowId: event.workflowRun.id,
        conclusion: event.workflowRun.conclusion
      });

      const notification = {
        type: 'workflow_completed',
        repository: {
          fullName: event.repository.fullName
        },
        workflowRun: {
          id: event.workflowRun.id,
          name: event.workflowRun.name,
          status: event.workflowRun.status,
          conclusion: event.workflowRun.conclusion,
          workflowId: event.workflowRun.workflowId,
          headBranch: event.workflowRun.headBranch,
          headSha: event.workflowRun.headSha,
          runNumber: event.workflowRun.runNumber,
          event: event.workflowRun.event,
          url: event.workflowRun.url,
          pullRequests: event.workflowRun.pullRequests
        },
        context: {
          eventId: event.id,
          timestamp: event.timestamp,
          delivery: event.delivery
        }
      };

      const response = await this.client.post('/notifications/workflow-completed', notification);
      
      this.stats.notificationsSent++;
      this.stats.notificationsSucceeded++;

      logger.info('AgentAPI workflow completion notification sent successfully', {
        eventId: event.id,
        notificationId: response.data.notificationId
      });

      return {
        success: true,
        notificationId: response.data.notificationId,
        message: 'Workflow completion notification sent successfully'
      };

    } catch (error) {
      this.stats.notificationsFailed++;
      
      logger.error('AgentAPI workflow completion notification failed', {
        eventId: event.id,
        error: error.message
      });

      throw new Error(`AgentAPI workflow completion notification failed: ${error.message}`);
    }
  }

  /**
   * Process comment events
   */
  async processComment(event) {
    try {
      logger.info('Processing comment in AgentAPI', {
        eventId: event.id,
        repository: event.repository.fullName,
        issueNumber: event.issue?.number,
        commentId: event.payload.comment?.id
      });

      const commentData = {
        type: 'comment_created',
        repository: {
          fullName: event.repository.fullName
        },
        issue: event.issue,
        comment: {
          id: event.payload.comment.id,
          body: event.payload.comment.body,
          user: event.payload.comment.user,
          createdAt: event.payload.comment.created_at,
          updatedAt: event.payload.comment.updated_at,
          url: event.payload.comment.html_url
        },
        context: {
          eventId: event.id,
          timestamp: event.timestamp,
          delivery: event.delivery
        }
      };

      const response = await this.client.post('/comments/process', commentData);
      
      this.stats.notificationsSent++;
      this.stats.notificationsSucceeded++;
      this.stats.contextProcessed++;

      logger.info('AgentAPI comment processing completed successfully', {
        eventId: event.id,
        processingId: response.data.processingId,
        action: response.data.action
      });

      return {
        success: true,
        processingId: response.data.processingId,
        action: response.data.action,
        message: 'Comment processed successfully'
      };

    } catch (error) {
      this.stats.notificationsFailed++;
      
      logger.error('AgentAPI comment processing failed', {
        eventId: event.id,
        error: error.message
      });

      throw new Error(`AgentAPI comment processing failed: ${error.message}`);
    }
  }

  /**
   * Process review events
   */
  async processReview(event) {
    try {
      logger.info('Processing review in AgentAPI', {
        eventId: event.id,
        repository: event.repository.fullName,
        prNumber: event.payload.pull_request?.number,
        reviewId: event.payload.review?.id
      });

      const reviewData = {
        type: 'review_submitted',
        repository: {
          fullName: event.repository.fullName
        },
        pullRequest: {
          number: event.payload.pull_request.number,
          title: event.payload.pull_request.title,
          head: {
            ref: event.payload.pull_request.head.ref,
            sha: event.payload.pull_request.head.sha
          }
        },
        review: {
          id: event.payload.review.id,
          state: event.payload.review.state,
          body: event.payload.review.body,
          user: event.payload.review.user,
          submittedAt: event.payload.review.submitted_at,
          url: event.payload.review.html_url
        },
        context: {
          eventId: event.id,
          timestamp: event.timestamp,
          delivery: event.delivery
        }
      };

      const response = await this.client.post('/reviews/process', reviewData);
      
      this.stats.notificationsSent++;
      this.stats.notificationsSucceeded++;
      this.stats.contextProcessed++;

      logger.info('AgentAPI review processing completed successfully', {
        eventId: event.id,
        processingId: response.data.processingId,
        action: response.data.action
      });

      return {
        success: true,
        processingId: response.data.processingId,
        action: response.data.action,
        message: 'Review processed successfully'
      };

    } catch (error) {
      this.stats.notificationsFailed++;
      
      logger.error('AgentAPI review processing failed', {
        eventId: event.id,
        error: error.message
      });

      throw new Error(`AgentAPI review processing failed: ${error.message}`);
    }
  }

  /**
   * Health check for AgentAPI service
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
      logger.warn('AgentAPI health check failed', {
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
      successRate: this.stats.notificationsSent > 0
        ? ((this.stats.notificationsSucceeded / this.stats.notificationsSent) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      notificationsSent: 0,
      notificationsSucceeded: 0,
      notificationsFailed: 0,
      contextProcessed: 0
    };
  }
}

export default AgentAPIHandler;

