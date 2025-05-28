/**
 * Webhook Processor Service
 * Central processing engine for all webhook events
 */

import { LRUCache } from 'lru-cache';

/**
 * Webhook Processor Class
 * Handles the processing of webhook events and coordination with external services
 */
export class WebhookProcessor {
  constructor(database) {
    this.database = database;
    this.processingQueue = new LRUCache({
      max: 1000,
      ttl: 60 * 60 * 1000 // 1 hour
    });
    
    this.retryQueue = new LRUCache({
      max: 500,
      ttl: 24 * 60 * 60 * 1000 // 24 hours
    });
    
    this.isProcessing = false;
    this.maxRetries = 3;
    this.retryDelays = [1000, 5000, 15000]; // 1s, 5s, 15s
  }

  /**
   * Process a webhook event
   */
  async processWebhook(eventData) {
    const startTime = Date.now();
    let eventId = null;
    
    try {
      // Store the event in database
      eventId = await this.database.storeWebhookEvent(eventData);
      
      // Add to processing queue
      this.processingQueue.set(eventId, {
        eventId,
        eventData,
        attempts: 0,
        createdAt: new Date()
      });
      
      // Process the event
      const result = await this.processEvent(eventId, eventData);
      
      // Update status based on result
      await this.database.updateWebhookEventStatus(
        eventId,
        result.success ? 'processed' : 'failed',
        result.error,
        {
          processingTime: Date.now() - startTime,
          result: result.data
        }
      );
      
      console.log(`✅ Webhook processed successfully: ${eventId} (${Date.now() - startTime}ms)`);
      
      return {
        eventId,
        processed: result.success,
        processingTime: Date.now() - startTime,
        result: result.data
      };
      
    } catch (error) {
      console.error(`❌ Webhook processing failed: ${eventId}`, error);
      
      if (eventId) {
        await this.database.updateWebhookEventStatus(
          eventId,
          'failed',
          error.message,
          {
            processingTime: Date.now() - startTime,
            error: error.stack
          }
        );
        
        // Add to retry queue if retryable
        if (this.isRetryableError(error)) {
          await this.scheduleRetry(eventId, eventData);
        }
      }
      
      throw error;
    }
  }

  /**
   * Process individual event based on type and source
   */
  async processEvent(eventId, eventData) {
    try {
      console.log(`🔄 Processing ${eventData.source} webhook: ${eventData.type}`);
      
      switch (eventData.source) {
        case 'github':
          return await this.processGitHubEvent(eventId, eventData);
        
        case 'linear':
          return await this.processLinearEvent(eventId, eventData);
        
        case 'codegen':
          return await this.processCodegenEvent(eventId, eventData);
        
        default:
          throw new Error(`Unsupported webhook source: ${eventData.source}`);
      }
      
    } catch (error) {
      console.error(`❌ Event processing failed for ${eventId}:`, error);
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

  /**
   * Process GitHub webhook events
   */
  async processGitHubEvent(eventId, eventData) {
    const { type, payload } = eventData;
    
    try {
      switch (type) {
        case 'pull_request':
          return await this.handlePullRequestEvent(eventId, payload);
        
        case 'push':
          return await this.handlePushEvent(eventId, payload);
        
        case 'check_run':
        case 'check_suite':
          return await this.handleCheckEvent(eventId, payload);
        
        case 'ping':
          return { success: true, data: { message: 'Pong! GitHub webhook is working' } };
        
        default:
          console.log(`ℹ️ Ignoring GitHub event type: ${type}`);
          return { success: true, data: { message: `Event type ${type} ignored` } };
      }
      
    } catch (error) {
      console.error(`❌ GitHub event processing failed:`, error);
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

  /**
   * Handle GitHub Pull Request events
   */
  async handlePullRequestEvent(eventId, payload) {
    const action = payload.action;
    const pr = payload.pull_request;
    
    console.log(`🔀 GitHub PR ${action}: #${pr.number} - ${pr.title}`);
    
    try {
      switch (action) {
        case 'opened':
          return await this.triggerPRValidation(eventId, pr);
        
        case 'synchronize':
          return await this.triggerPRRevalidation(eventId, pr);
        
        case 'closed':
          if (pr.merged) {
            return await this.handlePRMerged(eventId, pr);
          } else {
            return await this.handlePRClosed(eventId, pr);
          }
        
        case 'reopened':
          return await this.triggerPRValidation(eventId, pr);
        
        default:
          return { success: true, data: { message: `PR action ${action} ignored` } };
      }
      
    } catch (error) {
      console.error(`❌ PR event handling failed:`, error);
      throw error;
    }
  }

  /**
   * Trigger PR validation workflow
   */
  async triggerPRValidation(eventId, pr) {
    try {
      console.log(`🚀 Triggering validation for PR #${pr.number}`);
      
      // Call agentapi to trigger validation
      const validationResult = await this.callAgentAPI('validate_pr', {
        repository: pr.base.repo.full_name,
        prNumber: pr.number,
        prUrl: pr.html_url,
        branch: pr.head.ref,
        baseBranch: pr.base.ref,
        author: pr.user.login,
        title: pr.title,
        description: pr.body
      });
      
      // Update Linear ticket if linked
      await this.updateLinearTicket(pr, 'validation_started');
      
      return {
        success: true,
        data: {
          message: 'PR validation triggered',
          validationId: validationResult.id,
          prNumber: pr.number
        }
      };
      
    } catch (error) {
      console.error(`❌ Failed to trigger PR validation:`, error);
      throw error;
    }
  }

  /**
   * Process Linear webhook events
   */
  async processLinearEvent(eventId, eventData) {
    const { type, payload } = eventData;
    
    try {
      switch (type) {
        case 'Issue':
          return await this.handleLinearIssueEvent(eventId, payload);
        
        case 'Comment':
          return await this.handleLinearCommentEvent(eventId, payload);
        
        default:
          console.log(`ℹ️ Ignoring Linear event type: ${type}`);
          return { success: true, data: { message: `Event type ${type} ignored` } };
      }
      
    } catch (error) {
      console.error(`❌ Linear event processing failed:`, error);
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

  /**
   * Process Codegen webhook events
   */
  async processCodegenEvent(eventId, eventData) {
    const { type, payload } = eventData;
    
    try {
      switch (type) {
        case 'agent_status':
          return await this.handleAgentStatusEvent(eventId, payload);
        
        case 'validation_complete':
          return await this.handleValidationCompleteEvent(eventId, payload);
        
        case 'error_escalation':
          return await this.handleErrorEscalationEvent(eventId, payload);
        
        default:
          console.log(`ℹ️ Ignoring Codegen event type: ${type}`);
          return { success: true, data: { message: `Event type ${type} ignored` } };
      }
      
    } catch (error) {
      console.error(`❌ Codegen event processing failed:`, error);
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

  /**
   * Call AgentAPI service
   */
  async callAgentAPI(operation, payload) {
    const agentApiUrl = process.env.AGENTAPI_URL;
    if (!agentApiUrl) {
      throw new Error('AGENTAPI_URL not configured');
    }
    
    try {
      console.log(`🔗 Calling AgentAPI: ${operation}`);
      
      // Mock implementation - replace with actual HTTP call
      const response = {
        id: `agent_${Date.now()}`,
        operation,
        status: 'initiated',
        payload
      };
      
      console.log(`✅ AgentAPI call successful: ${operation}`);
      return response;
      
    } catch (error) {
      console.error(`❌ AgentAPI call failed: ${operation}`, error);
      throw error;
    }
  }

  /**
   * Update Linear ticket status
   */
  async updateLinearTicket(pr, status) {
    try {
      // Extract Linear ticket ID from PR title or description
      const ticketMatch = pr.title.match(/([A-Z]+-\d+)/);
      if (!ticketMatch) {
        console.log('ℹ️ No Linear ticket found in PR title');
        return;
      }
      
      const ticketId = ticketMatch[1];
      console.log(`📋 Updating Linear ticket: ${ticketId} - ${status}`);
      
      // Mock implementation - replace with actual Linear API call
      const updateResult = {
        ticketId,
        status,
        updated: true
      };
      
      console.log(`✅ Linear ticket updated: ${ticketId}`);
      return updateResult;
      
    } catch (error) {
      console.error(`❌ Failed to update Linear ticket:`, error);
      // Don't throw - this is not critical
    }
  }

  /**
   * Schedule retry for failed event
   */
  async scheduleRetry(eventId, eventData) {
    try {
      const retryData = {
        eventId,
        eventData,
        attempts: 0,
        nextRetry: new Date(Date.now() + this.retryDelays[0]),
        createdAt: new Date()
      };
      
      this.retryQueue.set(eventId, retryData);
      console.log(`⏰ Scheduled retry for event: ${eventId}`);
      
    } catch (error) {
      console.error(`❌ Failed to schedule retry:`, error);
    }
  }

  /**
   * Process retry queue
   */
  async processRetryQueue() {
    if (this.isProcessing) {
      return;
    }
    
    this.isProcessing = true;
    
    try {
      const now = new Date();
      
      for (const [eventId, retryData] of this.retryQueue.entries()) {
        if (retryData.nextRetry <= now && retryData.attempts < this.maxRetries) {
          try {
            console.log(`🔄 Retrying event: ${eventId} (attempt ${retryData.attempts + 1})`);
            
            const result = await this.processEvent(eventId, retryData.eventData);
            
            if (result.success) {
              this.retryQueue.delete(eventId);
              await this.database.updateWebhookEventStatus(eventId, 'processed');
              console.log(`✅ Retry successful: ${eventId}`);
            } else {
              retryData.attempts++;
              if (retryData.attempts < this.maxRetries) {
                retryData.nextRetry = new Date(now.getTime() + this.retryDelays[retryData.attempts]);
                this.retryQueue.set(eventId, retryData);
              } else {
                this.retryQueue.delete(eventId);
                await this.database.updateWebhookEventStatus(eventId, 'failed_permanently');
                console.log(`❌ Max retries exceeded: ${eventId}`);
              }
            }
            
          } catch (error) {
            console.error(`❌ Retry failed for ${eventId}:`, error);
            retryData.attempts++;
            if (retryData.attempts < this.maxRetries) {
              retryData.nextRetry = new Date(now.getTime() + this.retryDelays[retryData.attempts]);
              this.retryQueue.set(eventId, retryData);
            } else {
              this.retryQueue.delete(eventId);
              await this.database.updateWebhookEventStatus(eventId, 'failed_permanently');
            }
          }
        }
      }
      
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error) {
    const retryableErrors = [
      'ECONNRESET',
      'ENOTFOUND',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'Network Error',
      'timeout'
    ];
    
    return retryableErrors.some(retryableError => 
      error.message.includes(retryableError) || 
      error.code === retryableError
    );
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      return {
        healthy: true,
        processingQueueSize: this.processingQueue.size,
        retryQueueSize: this.retryQueue.size,
        isProcessing: this.isProcessing,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get detailed status
   */
  async getDetailedStatus() {
    try {
      const retryItems = Array.from(this.retryQueue.values());
      
      return {
        processing: {
          isProcessing: this.isProcessing,
          queueSize: this.processingQueue.size,
          maxRetries: this.maxRetries
        },
        retries: {
          queueSize: this.retryQueue.size,
          pendingRetries: retryItems.filter(item => item.nextRetry <= new Date()).length,
          retryDelays: this.retryDelays
        },
        configuration: {
          agentApiUrl: process.env.AGENTAPI_URL ? '[CONFIGURED]' : '[NOT_CONFIGURED]',
          linearApiKey: process.env.LINEAR_API_KEY ? '[CONFIGURED]' : '[NOT_CONFIGURED]'
        }
      };
    } catch (error) {
      return {
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

