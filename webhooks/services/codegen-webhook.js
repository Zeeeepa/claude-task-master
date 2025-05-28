/**
 * Codegen Webhook Service
 * Handles Codegen-specific webhook processing and internal system events
 */

import { WebhookProcessor } from './webhook-processor.js';
import { DatabaseService } from './database.js';

/**
 * Codegen Webhook Service Class
 * Specialized service for processing Codegen internal webhook events
 */
export class CodegenWebhookService {
  constructor() {
    this.database = new DatabaseService();
    this.processor = new WebhookProcessor(this.database);
    this.supportedEvents = [
      'agent_status',
      'validation_complete',
      'validation_failed',
      'pr_created',
      'pr_updated',
      'error_escalation',
      'workflow_complete',
      'system_health'
    ];
  }

  /**
   * Process Codegen webhook
   */
  async processWebhook(webhookData) {
    try {
      const { eventType, payload, signature, timestamp } = webhookData;
      
      console.log(`🤖 Processing Codegen webhook: ${eventType}`);
      
      // Validate event type
      if (!this.supportedEvents.includes(eventType)) {
        console.log(`ℹ️ Unsupported Codegen event type: ${eventType}`);
        return {
          eventId: null,
          processed: false,
          message: `Event type '${eventType}' is not supported`
        };
      }
      
      // Prepare event data for processing
      const eventData = {
        type: eventType,
        source: 'codegen',
        payload,
        signature,
        timestamp,
        metadata: {
          agentId: payload.agentId,
          workflowId: payload.workflowId,
          version: payload.version
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
      console.error('❌ Codegen webhook processing error:', error);
      throw error;
    }
  }

  /**
   * Update agent status
   */
  async updateAgentStatus(statusData) {
    try {
      const { agentId, status, message, metadata, timestamp } = statusData;
      
      console.log(`📊 Updating agent status: ${agentId} -> ${status}`);
      
      // Store status update
      const statusId = await this.database.storeWebhookEvent({
        type: 'agent_status',
        source: 'codegen',
        payload: {
          agentId,
          status,
          message,
          metadata
        },
        timestamp
      });
      
      // Process status-specific actions
      await this.handleAgentStatusChange(agentId, status, message, metadata);
      
      return {
        statusId,
        agentId,
        status,
        timestamp
      };
      
    } catch (error) {
      console.error('❌ Failed to update agent status:', error);
      throw error;
    }
  }

  /**
   * Handle agent status change
   */
  async handleAgentStatusChange(agentId, status, message, metadata) {
    try {
      switch (status) {
        case 'started':
          await this.onAgentStarted(agentId, metadata);
          break;
        
        case 'working':
          await this.onAgentWorking(agentId, message, metadata);
          break;
        
        case 'completed':
          await this.onAgentCompleted(agentId, metadata);
          break;
        
        case 'failed':
          await this.onAgentFailed(agentId, message, metadata);
          break;
        
        case 'error':
          await this.onAgentError(agentId, message, metadata);
          break;
        
        default:
          console.log(`ℹ️ Unknown agent status: ${status}`);
      }
      
    } catch (error) {
      console.error(`❌ Failed to handle agent status change:`, error);
      // Don't throw - status handling is not critical
    }
  }

  /**
   * Handle agent started event
   */
  async onAgentStarted(agentId, metadata) {
    try {
      console.log(`🚀 Agent started: ${agentId}`);
      
      // Update Linear ticket if linked
      if (metadata.linearTicket) {
        await this.updateLinearTicketStatus(metadata.linearTicket, 'in_progress', {
          agentId,
          startedAt: new Date().toISOString()
        });
      }
      
      // Notify stakeholders
      await this.notifyStakeholders('agent_started', {
        agentId,
        linearTicket: metadata.linearTicket,
        repository: metadata.repository
      });
      
    } catch (error) {
      console.error(`❌ Failed to handle agent started:`, error);
    }
  }

  /**
   * Handle agent completed event
   */
  async onAgentCompleted(agentId, metadata) {
    try {
      console.log(`✅ Agent completed: ${agentId}`);
      
      // Update Linear ticket if linked
      if (metadata.linearTicket) {
        await this.updateLinearTicketStatus(metadata.linearTicket, 'completed', {
          agentId,
          completedAt: new Date().toISOString(),
          prUrl: metadata.prUrl,
          result: metadata.result
        });
      }
      
      // Trigger post-completion workflows
      await this.triggerPostCompletionWorkflow({
        agentId,
        linearTicket: metadata.linearTicket,
        prUrl: metadata.prUrl,
        result: metadata.result
      });
      
    } catch (error) {
      console.error(`❌ Failed to handle agent completion:`, error);
    }
  }

  /**
   * Handle agent failed event
   */
  async onAgentFailed(agentId, message, metadata) {
    try {
      console.log(`❌ Agent failed: ${agentId} - ${message}`);
      
      // Update Linear ticket if linked
      if (metadata.linearTicket) {
        await this.updateLinearTicketStatus(metadata.linearTicket, 'failed', {
          agentId,
          failedAt: new Date().toISOString(),
          error: message,
          retryable: metadata.retryable
        });
      }
      
      // Trigger error escalation if needed
      if (metadata.escalate) {
        await this.triggerErrorEscalation({
          agentId,
          error: message,
          linearTicket: metadata.linearTicket,
          metadata
        });
      }
      
    } catch (error) {
      console.error(`❌ Failed to handle agent failure:`, error);
    }
  }

  /**
   * Handle validation complete event
   */
  async handleValidationCompleteEvent(eventId, payload) {
    try {
      const { validationId, result, prNumber, repository, linearTicket } = payload;
      
      console.log(`✅ Validation completed: ${validationId} - ${result.status}`);
      
      if (result.status === 'passed') {
        // Update PR status
        await this.updatePRStatus(repository, prNumber, 'validation_passed', {
          validationId,
          checks: result.checks
        });
        
        // Update Linear ticket
        if (linearTicket) {
          await this.updateLinearTicketStatus(linearTicket, 'validation_passed', {
            validationId,
            prNumber,
            repository
          });
        }
      } else {
        // Handle validation failure
        await this.handleValidationFailure({
          validationId,
          result,
          prNumber,
          repository,
          linearTicket
        });
      }
      
      return {
        success: true,
        message: 'Validation result processed',
        data: {
          validationId,
          status: result.status,
          prNumber
        }
      };
      
    } catch (error) {
      console.error(`❌ Failed to handle validation complete:`, error);
      throw error;
    }
  }

  /**
   * Handle validation failure
   */
  async handleValidationFailure(failureData) {
    try {
      const { validationId, result, prNumber, repository, linearTicket } = failureData;
      
      console.log(`❌ Validation failed: ${validationId}`);
      
      // Update PR with failure status
      await this.updatePRStatus(repository, prNumber, 'validation_failed', {
        validationId,
        errors: result.errors,
        suggestions: result.suggestions
      });
      
      // Update Linear ticket
      if (linearTicket) {
        await this.updateLinearTicketStatus(linearTicket, 'validation_failed', {
          validationId,
          errors: result.errors,
          prNumber,
          repository
        });
      }
      
      // Trigger auto-fix if possible
      if (result.autoFixable) {
        await this.triggerAutoFix({
          validationId,
          prNumber,
          repository,
          errors: result.errors,
          linearTicket
        });
      }
      
    } catch (error) {
      console.error(`❌ Failed to handle validation failure:`, error);
    }
  }

  /**
   * Trigger workflow
   */
  async triggerWorkflow(workflowData) {
    try {
      const { workflowType, payload, priority, timestamp } = workflowData;
      
      console.log(`🎯 Triggering workflow: ${workflowType} (priority: ${priority})`);
      
      const workflowId = `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Store workflow trigger event
      await this.database.storeWebhookEvent({
        type: 'workflow_trigger',
        source: 'codegen',
        payload: {
          workflowId,
          workflowType,
          payload,
          priority
        },
        timestamp
      });
      
      // Mock workflow trigger - replace with actual implementation
      const workflowResult = {
        workflowId,
        workflowType,
        status: 'initiated',
        priority,
        timestamp: new Date().toISOString()
      };
      
      console.log(`✅ Workflow triggered: ${workflowId}`);
      
      return workflowResult;
      
    } catch (error) {
      console.error(`❌ Failed to trigger workflow:`, error);
      throw error;
    }
  }

  /**
   * Trigger error escalation
   */
  async triggerErrorEscalation(escalationData) {
    try {
      const { agentId, error, linearTicket, metadata } = escalationData;
      
      console.log(`🚨 Triggering error escalation for agent: ${agentId}`);
      
      // Create escalation ticket or update existing one
      const escalationResult = await this.createEscalationTicket({
        agentId,
        error,
        originalTicket: linearTicket,
        metadata
      });
      
      // Notify human operators
      await this.notifyHumanOperators({
        escalationType: 'agent_failure',
        agentId,
        error,
        escalationTicket: escalationResult.ticketId,
        originalTicket: linearTicket
      });
      
      return escalationResult;
      
    } catch (error) {
      console.error(`❌ Failed to trigger error escalation:`, error);
      throw error;
    }
  }

  /**
   * Update PR status
   */
  async updatePRStatus(repository, prNumber, status, metadata = {}) {
    try {
      console.log(`🔀 Updating PR status: ${repository}#${prNumber} -> ${status}`);
      
      // Mock implementation - replace with actual GitHub API call
      const updateResult = {
        repository,
        prNumber,
        status,
        metadata,
        timestamp: new Date().toISOString()
      };
      
      console.log(`✅ PR status updated: ${repository}#${prNumber}`);
      
      return updateResult;
      
    } catch (error) {
      console.error(`❌ Failed to update PR status:`, error);
      // Don't throw - PR updates are not critical
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
      
      console.log(`✅ Linear ticket updated: ${ticketId}`);
      
      return updateData;
      
    } catch (error) {
      console.error(`❌ Failed to update Linear ticket:`, error);
      // Don't throw - Linear updates are not critical
    }
  }

  /**
   * Notify stakeholders
   */
  async notifyStakeholders(eventType, data) {
    try {
      console.log(`📢 Notifying stakeholders: ${eventType}`);
      
      // Mock implementation - replace with actual notification system
      const notification = {
        eventType,
        data,
        timestamp: new Date().toISOString(),
        channels: ['slack', 'email', 'linear']
      };
      
      console.log(`✅ Stakeholders notified: ${eventType}`);
      
      return notification;
      
    } catch (error) {
      console.error(`❌ Failed to notify stakeholders:`, error);
      // Don't throw - notifications are not critical
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
        githubToken: process.env.GITHUB_TOKEN ? '[CONFIGURED]' : '[NOT_CONFIGURED]',
        codegenWebhookSecret: process.env.CODEGEN_WEBHOOK_SECRET ? '[CONFIGURED]' : '[NOT_CONFIGURED]',
        codegenInternalKey: process.env.CODEGEN_INTERNAL_KEY ? '[CONFIGURED]' : '[NOT_CONFIGURED]',
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
   * Get recent Codegen webhook events
   */
  async getRecentEvents(options = {}) {
    try {
      const filters = {
        source: 'codegen',
        ...options
      };
      
      return await this.database.getRecentWebhookEvents(options.limit || 50, filters);
      
    } catch (error) {
      console.error('❌ Failed to get recent Codegen events:', error);
      throw error;
    }
  }

  /**
   * Retry failed event processing
   */
  async retryEvent(eventId) {
    try {
      const event = await this.database.getWebhookEvent(eventId);
      
      if (event.source !== 'codegen') {
        throw new Error('Event is not a Codegen webhook event');
      }
      
      console.log(`🔄 Retrying Codegen event: ${eventId}`);
      
      const result = await this.processor.processEvent(eventId, event);
      
      return {
        eventId,
        retryResult: result,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error(`❌ Failed to retry Codegen event:`, error);
      throw error;
    }
  }
}

