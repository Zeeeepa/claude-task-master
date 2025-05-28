/**
 * Webhook Processor
 * 
 * Main event processing logic for GitHub webhooks with routing,
 * validation, and error handling capabilities.
 */

import crypto from 'crypto';
import { EventRouter } from './event-router.js';
import { SignatureVerifier } from './signature-verifier.js';
import { EventQueue } from './queue.js';
import { logger } from '../utils/logger.js';

export class WebhookProcessor {
  constructor(config = {}) {
    this.config = {
      secret: config.secret || process.env.GITHUB_WEBHOOK_SECRET,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      enableQueue: config.enableQueue !== false,
      ...config
    };

    this.signatureVerifier = new SignatureVerifier(this.config.secret);
    this.eventRouter = new EventRouter(this.config);
    this.eventQueue = this.config.enableQueue ? new EventQueue(this.config) : null;
    
    this.stats = {
      processed: 0,
      failed: 0,
      retries: 0,
      startTime: new Date()
    };

    // Supported GitHub webhook events
    this.supportedEvents = new Set([
      'pull_request',
      'push',
      'workflow_run',
      'issues',
      'issue_comment',
      'pull_request_review',
      'pull_request_review_comment'
    ]);
  }

  /**
   * Process incoming webhook payload
   */
  async processWebhook(payload, signature, metadata = {}) {
    const startTime = Date.now();
    const eventId = this.generateEventId(metadata);

    try {
      logger.info('Processing webhook', {
        eventId,
        event: metadata.event,
        delivery: metadata.delivery,
        repository: payload?.repository?.full_name
      });

      // 1. Verify webhook signature
      if (this.config.secret) {
        await this.signatureVerifier.verify(payload, signature);
        logger.debug('Webhook signature verified', { eventId });
      }

      // 2. Parse and validate event
      const event = this.parseEvent(payload, metadata);
      
      // 3. Store event for audit trail
      await this.storeEvent(event);

      // 4. Process event (queue or direct)
      if (this.eventQueue) {
        await this.eventQueue.enqueue(event);
        logger.info('Event queued for processing', { eventId });
      } else {
        await this.processEvent(event);
      }

      // 5. Update statistics
      this.stats.processed++;
      
      const duration = Date.now() - startTime;
      logger.info('Webhook processed successfully', {
        eventId,
        duration: `${duration}ms`
      });

      return {
        success: true,
        eventId,
        duration
      };

    } catch (error) {
      this.stats.failed++;
      
      const duration = Date.now() - startTime;
      logger.error('Webhook processing failed', {
        eventId,
        error: error.message,
        duration: `${duration}ms`,
        stack: error.stack
      });

      throw error;
    }
  }

  /**
   * Parse GitHub webhook event
   */
  parseEvent(payload, metadata) {
    const event = {
      id: this.generateEventId(metadata),
      type: metadata.event,
      action: payload.action,
      delivery: metadata.delivery,
      timestamp: metadata.timestamp || new Date().toISOString(),
      repository: payload.repository ? {
        id: payload.repository.id,
        name: payload.repository.name,
        fullName: payload.repository.full_name,
        cloneUrl: payload.repository.clone_url,
        defaultBranch: payload.repository.default_branch,
        private: payload.repository.private
      } : null,
      payload: payload
    };

    // Add event-specific data
    switch (metadata.event) {
      case 'pull_request':
        event.pullRequest = this.parsePullRequest(payload.pull_request);
        event.eventType = `pull_request.${payload.action}`;
        break;
        
      case 'push':
        event.push = this.parsePushEvent(payload);
        event.eventType = 'push';
        break;
        
      case 'workflow_run':
        event.workflowRun = this.parseWorkflowRun(payload.workflow_run);
        event.eventType = `workflow_run.${payload.action}`;
        break;
        
      case 'issues':
        event.issue = this.parseIssue(payload.issue);
        event.eventType = `issues.${payload.action}`;
        break;
        
      default:
        event.eventType = metadata.event;
    }

    // Validate required fields
    this.validateEvent(event);

    return event;
  }

  /**
   * Parse pull request data
   */
  parsePullRequest(pr) {
    if (!pr) return null;

    return {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      merged: pr.merged,
      mergeable: pr.mergeable,
      head: {
        ref: pr.head.ref,
        sha: pr.head.sha,
        repo: pr.head.repo ? {
          fullName: pr.head.repo.full_name,
          cloneUrl: pr.head.repo.clone_url
        } : null
      },
      base: {
        ref: pr.base.ref,
        sha: pr.base.sha,
        repo: pr.base.repo ? {
          fullName: pr.base.repo.full_name,
          cloneUrl: pr.base.repo.clone_url
        } : null
      },
      user: pr.user ? {
        login: pr.user.login,
        id: pr.user.id
      } : null,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      mergedAt: pr.merged_at,
      url: pr.html_url
    };
  }

  /**
   * Parse push event data
   */
  parsePushEvent(payload) {
    return {
      ref: payload.ref,
      before: payload.before,
      after: payload.after,
      created: payload.created,
      deleted: payload.deleted,
      forced: payload.forced,
      commits: payload.commits?.map(commit => ({
        id: commit.id,
        message: commit.message,
        author: commit.author,
        url: commit.url,
        timestamp: commit.timestamp
      })) || [],
      headCommit: payload.head_commit ? {
        id: payload.head_commit.id,
        message: payload.head_commit.message,
        author: payload.head_commit.author,
        url: payload.head_commit.url,
        timestamp: payload.head_commit.timestamp
      } : null,
      pusher: payload.pusher
    };
  }

  /**
   * Parse workflow run data
   */
  parseWorkflowRun(workflowRun) {
    if (!workflowRun) return null;

    return {
      id: workflowRun.id,
      name: workflowRun.name,
      status: workflowRun.status,
      conclusion: workflowRun.conclusion,
      workflowId: workflowRun.workflow_id,
      headBranch: workflowRun.head_branch,
      headSha: workflowRun.head_sha,
      runNumber: workflowRun.run_number,
      event: workflowRun.event,
      createdAt: workflowRun.created_at,
      updatedAt: workflowRun.updated_at,
      url: workflowRun.html_url,
      pullRequests: workflowRun.pull_requests || []
    };
  }

  /**
   * Parse issue data
   */
  parseIssue(issue) {
    if (!issue) return null;

    return {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      user: issue.user ? {
        login: issue.user.login,
        id: issue.user.id
      } : null,
      labels: issue.labels?.map(label => ({
        name: label.name,
        color: label.color
      })) || [],
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      url: issue.html_url
    };
  }

  /**
   * Validate event structure
   */
  validateEvent(event) {
    if (!event.id) {
      throw new Error('Event ID is required');
    }

    if (!event.type) {
      throw new Error('Event type is required');
    }

    if (!this.supportedEvents.has(event.type)) {
      throw new Error(`Unsupported event type: ${event.type}`);
    }

    if (!event.repository) {
      throw new Error('Repository information is required');
    }
  }

  /**
   * Process event through router
   */
  async processEvent(event) {
    try {
      await this.eventRouter.routeEvent(event);
      
      logger.info('Event routed successfully', {
        eventId: event.id,
        eventType: event.eventType
      });

    } catch (error) {
      logger.error('Event routing failed', {
        eventId: event.id,
        eventType: event.eventType,
        error: error.message
      });

      // Attempt retry if configured
      if (this.config.retryAttempts > 0) {
        await this.retryEvent(event, error);
      } else {
        throw error;
      }
    }
  }

  /**
   * Retry failed event processing
   */
  async retryEvent(event, originalError, attempt = 1) {
    if (attempt > this.config.retryAttempts) {
      logger.error('Event processing failed after all retries', {
        eventId: event.id,
        attempts: attempt - 1,
        originalError: originalError.message
      });
      throw originalError;
    }

    this.stats.retries++;
    
    logger.warn('Retrying event processing', {
      eventId: event.id,
      attempt,
      maxAttempts: this.config.retryAttempts
    });

    // Exponential backoff
    const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      await this.eventRouter.routeEvent(event);
      
      logger.info('Event retry successful', {
        eventId: event.id,
        attempt
      });

    } catch (error) {
      await this.retryEvent(event, originalError, attempt + 1);
    }
  }

  /**
   * Store event for audit trail
   */
  async storeEvent(event) {
    try {
      // Store in database or file system for audit trail
      // This is a placeholder - implement based on your storage needs
      logger.debug('Event stored for audit', {
        eventId: event.id,
        eventType: event.eventType
      });
      
    } catch (error) {
      logger.warn('Failed to store event for audit', {
        eventId: event.id,
        error: error.message
      });
      // Don't fail the webhook processing for audit storage failures
    }
  }

  /**
   * Replay a webhook by delivery ID
   */
  async replayWebhook(deliveryId) {
    // This would retrieve the stored event and reprocess it
    // Implementation depends on your storage mechanism
    throw new Error('Webhook replay not implemented yet');
  }

  /**
   * Generate unique event ID
   */
  generateEventId(metadata) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const delivery = metadata.delivery || 'unknown';
    
    return `${delivery}-${timestamp}-${random}`;
  }

  /**
   * Get processor status
   */
  getStatus() {
    const uptime = Date.now() - this.stats.startTime.getTime();
    
    return {
      stats: {
        ...this.stats,
        uptime: `${Math.floor(uptime / 1000)}s`,
        successRate: this.stats.processed > 0 
          ? ((this.stats.processed - this.stats.failed) / this.stats.processed * 100).toFixed(2) + '%'
          : '0%'
      },
      config: {
        hasSecret: !!this.config.secret,
        retryAttempts: this.config.retryAttempts,
        queueEnabled: !!this.eventQueue
      },
      supportedEvents: Array.from(this.supportedEvents)
    };
  }
}

export default WebhookProcessor;

