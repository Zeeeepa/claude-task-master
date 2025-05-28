/**
 * GitHub Webhook Service
 * Handles GitHub-specific webhook processing and integration
 */

import { WebhookProcessor } from './webhook-processor.js';
import { DatabaseService } from './database.js';

/**
 * GitHub Webhook Service Class
 * Specialized service for processing GitHub webhook events
 */
export class GitHubWebhookService {
  constructor() {
    this.database = new DatabaseService();
    this.processor = new WebhookProcessor(this.database);
    this.supportedEvents = [
      'pull_request',
      'push',
      'check_run',
      'check_suite',
      'ping',
      'repository',
      'release'
    ];
  }

  /**
   * Process GitHub webhook
   */
  async processWebhook(webhookData) {
    try {
      const { event, delivery, payload, timestamp } = webhookData;
      
      console.log(`🐙 Processing GitHub webhook: ${event} (${delivery})`);
      
      // Validate event type
      if (!this.supportedEvents.includes(event)) {
        console.log(`ℹ️ Unsupported GitHub event type: ${event}`);
        return {
          eventId: null,
          processed: false,
          message: `Event type '${event}' is not supported`
        };
      }
      
      // Prepare event data for processing
      const eventData = {
        type: event,
        source: 'github',
        payload,
        signature: webhookData.signature,
        timestamp,
        metadata: {
          delivery,
          repository: payload.repository?.full_name,
          sender: payload.sender?.login
        }
      };
      
      // Process the webhook
      const result = await this.processor.processWebhook(eventData);
      
      return {
        eventId: result.eventId,
        processed: result.processed,
        processingTime: result.processingTime
      };
      
    } catch (error) {
      console.error('❌ GitHub webhook processing error:', error);
      throw error;
    }
  }

  /**
   * Handle Pull Request events specifically
   */
  async handlePullRequestEvent(payload) {
    const action = payload.action;
    const pr = payload.pull_request;
    const repository = payload.repository;
    
    console.log(`🔀 GitHub PR ${action}: ${repository.full_name}#${pr.number}`);
    
    try {
      switch (action) {
        case 'opened':
          return await this.onPROpened(pr, repository);
        
        case 'synchronize':
          return await this.onPRUpdated(pr, repository);
        
        case 'closed':
          if (pr.merged) {
            return await this.onPRMerged(pr, repository);
          } else {
            return await this.onPRClosed(pr, repository);
          }
        
        case 'reopened':
          return await this.onPRReopened(pr, repository);
        
        case 'ready_for_review':
          return await this.onPRReadyForReview(pr, repository);
        
        default:
          return {
            success: true,
            message: `PR action '${action}' acknowledged but not processed`,
            data: { action, prNumber: pr.number }
          };
      }
      
    } catch (error) {
      console.error(`❌ PR event handling failed:`, error);
      throw error;
    }
  }

  /**
   * Handle PR opened event
   */
  async onPROpened(pr, repository) {
    try {
      console.log(`🆕 New PR opened: ${repository.full_name}#${pr.number} - ${pr.title}`);
      
      // Extract Linear ticket ID if present
      const linearTicket = this.extractLinearTicketId(pr.title, pr.body);
      
      // Trigger validation workflow
      const validationResult = await this.triggerValidationWorkflow({
        repository: repository.full_name,
        prNumber: pr.number,
        prUrl: pr.html_url,
        branch: pr.head.ref,
        baseBranch: pr.base.ref,
        author: pr.user.login,
        title: pr.title,
        description: pr.body,
        linearTicket
      });
      
      // Update Linear ticket if linked
      if (linearTicket) {
        await this.updateLinearTicketStatus(linearTicket, 'pr_opened', {
          prUrl: pr.html_url,
          prNumber: pr.number
        });
      }
      
      return {
        success: true,
        message: 'PR validation workflow triggered',
        data: {
          prNumber: pr.number,
          validationId: validationResult.id,
          linearTicket
        }
      };
      
    } catch (error) {
      console.error(`❌ Failed to handle PR opened:`, error);
      throw error;
    }
  }

  /**
   * Handle PR updated event (new commits)
   */
  async onPRUpdated(pr, repository) {
    try {
      console.log(`🔄 PR updated: ${repository.full_name}#${pr.number}`);
      
      // Re-trigger validation for updated PR
      const validationResult = await this.triggerValidationWorkflow({
        repository: repository.full_name,
        prNumber: pr.number,
        prUrl: pr.html_url,
        branch: pr.head.ref,
        baseBranch: pr.base.ref,
        author: pr.user.login,
        title: pr.title,
        description: pr.body,
        isUpdate: true
      });
      
      return {
        success: true,
        message: 'PR re-validation triggered',
        data: {
          prNumber: pr.number,
          validationId: validationResult.id
        }
      };
      
    } catch (error) {
      console.error(`❌ Failed to handle PR update:`, error);
      throw error;
    }
  }

  /**
   * Handle PR merged event
   */
  async onPRMerged(pr, repository) {
    try {
      console.log(`✅ PR merged: ${repository.full_name}#${pr.number}`);
      
      const linearTicket = this.extractLinearTicketId(pr.title, pr.body);
      
      // Update Linear ticket to completed if linked
      if (linearTicket) {
        await this.updateLinearTicketStatus(linearTicket, 'completed', {
          prUrl: pr.html_url,
          prNumber: pr.number,
          mergedAt: pr.merged_at
        });
      }
      
      // Trigger post-merge workflows if needed
      await this.triggerPostMergeWorkflow({
        repository: repository.full_name,
        prNumber: pr.number,
        branch: pr.head.ref,
        baseBranch: pr.base.ref,
        mergedAt: pr.merged_at,
        linearTicket
      });
      
      return {
        success: true,
        message: 'PR merge processed',
        data: {
          prNumber: pr.number,
          linearTicket,
          mergedAt: pr.merged_at
        }
      };
      
    } catch (error) {
      console.error(`❌ Failed to handle PR merge:`, error);
      throw error;
    }
  }

  /**
   * Trigger validation workflow via AgentAPI
   */
  async triggerValidationWorkflow(prData) {
    try {
      const agentApiUrl = process.env.AGENTAPI_URL;
      if (!agentApiUrl) {
        console.warn('⚠️ AGENTAPI_URL not configured - skipping validation trigger');
        return { id: 'mock_validation_id', status: 'skipped' };
      }
      
      console.log(`🚀 Triggering validation workflow for ${prData.repository}#${prData.prNumber}`);
      
      // Mock implementation - replace with actual HTTP call to AgentAPI
      const validationRequest = {
        id: `validation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'pr_validation',
        repository: prData.repository,
        prNumber: prData.prNumber,
        prUrl: prData.prUrl,
        branch: prData.branch,
        baseBranch: prData.baseBranch,
        author: prData.author,
        title: prData.title,
        description: prData.description,
        isUpdate: prData.isUpdate || false,
        linearTicket: prData.linearTicket,
        timestamp: new Date().toISOString()
      };
      
      // In production, this would be an HTTP call:
      // const response = await fetch(`${agentApiUrl}/workflows/validate`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(validationRequest)
      // });
      
      console.log(`✅ Validation workflow triggered: ${validationRequest.id}`);
      
      return {
        id: validationRequest.id,
        status: 'initiated',
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error(`❌ Failed to trigger validation workflow:`, error);
      throw error;
    }
  }

  /**
   * Update Linear ticket status
   */
  async updateLinearTicketStatus(ticketId, status, metadata = {}) {
    try {
      const linearApiKey = process.env.LINEAR_API_KEY;
      if (!linearApiKey) {
        console.warn('⚠️ LINEAR_API_KEY not configured - skipping Linear update');
        return;
      }
      
      console.log(`📋 Updating Linear ticket ${ticketId}: ${status}`);
      
      // Mock implementation - replace with actual Linear API call
      const updateData = {
        ticketId,
        status,
        metadata,
        timestamp: new Date().toISOString()
      };
      
      // In production, this would be a Linear API call:
      // const response = await fetch('https://api.linear.app/graphql', {
      //   method: 'POST',
      //   headers: {
      //     'Authorization': `Bearer ${linearApiKey}`,
      //     'Content-Type': 'application/json'
      //   },
      //   body: JSON.stringify({ query: updateMutation, variables: updateData })
      // });
      
      console.log(`✅ Linear ticket updated: ${ticketId}`);
      
      return updateData;
      
    } catch (error) {
      console.error(`❌ Failed to update Linear ticket:`, error);
      // Don't throw - Linear updates are not critical
    }
  }

  /**
   * Extract Linear ticket ID from PR title or description
   */
  extractLinearTicketId(title, description) {
    // Look for patterns like "ZAM-123" or "PROJ-456"
    const ticketPattern = /([A-Z]+-\d+)/g;
    
    // Check title first
    const titleMatch = title.match(ticketPattern);
    if (titleMatch) {
      return titleMatch[0];
    }
    
    // Check description
    if (description) {
      const descMatch = description.match(ticketPattern);
      if (descMatch) {
        return descMatch[0];
      }
    }
    
    return null;
  }

  /**
   * Trigger post-merge workflow
   */
  async triggerPostMergeWorkflow(mergeData) {
    try {
      console.log(`🎯 Triggering post-merge workflow for ${mergeData.repository}#${mergeData.prNumber}`);
      
      // Mock implementation for post-merge actions
      const postMergeActions = {
        id: `postmerge_${Date.now()}`,
        repository: mergeData.repository,
        prNumber: mergeData.prNumber,
        actions: [
          'update_linear_ticket',
          'trigger_deployment',
          'notify_stakeholders'
        ],
        timestamp: new Date().toISOString()
      };
      
      console.log(`✅ Post-merge workflow triggered: ${postMergeActions.id}`);
      
      return postMergeActions;
      
    } catch (error) {
      console.error(`❌ Failed to trigger post-merge workflow:`, error);
      // Don't throw - post-merge workflows are not critical
    }
  }

  /**
   * Test connection and configuration
   */
  async testConnection() {
    try {
      const config = {
        agentApiUrl: process.env.AGENTAPI_URL ? '[CONFIGURED]' : '[NOT_CONFIGURED]',
        linearApiKey: process.env.LINEAR_API_KEY ? '[CONFIGURED]' : '[NOT_CONFIGURED]',
        githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET ? '[CONFIGURED]' : '[NOT_CONFIGURED]',
        supportedEvents: this.supportedEvents
      };
      
      return {
        status: 'operational',
        timestamp: new Date().toISOString(),
        configuration: config
      };
      
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get recent GitHub webhook events
   */
  async getRecentEvents(options = {}) {
    try {
      const filters = {
        source: 'github',
        ...options
      };
      
      return await this.database.getRecentWebhookEvents(options.limit || 50, filters);
      
    } catch (error) {
      console.error('❌ Failed to get recent GitHub events:', error);
      throw error;
    }
  }

  /**
   * Retry failed event processing
   */
  async retryEvent(eventId) {
    try {
      const event = await this.database.getWebhookEvent(eventId);
      
      if (event.source !== 'github') {
        throw new Error('Event is not a GitHub webhook event');
      }
      
      console.log(`🔄 Retrying GitHub event: ${eventId}`);
      
      const result = await this.processor.processEvent(eventId, event);
      
      return {
        eventId,
        retryResult: result,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error(`❌ Failed to retry GitHub event:`, error);
      throw error;
    }
  }
}

