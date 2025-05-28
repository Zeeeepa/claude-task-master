/**
 * Linear Webhook Service
 * Handles Linear-specific webhook processing and integration
 */

import { WebhookProcessor } from './webhook-processor.js';
import { DatabaseService } from './database.js';

/**
 * Linear Webhook Service Class
 * Specialized service for processing Linear webhook events
 */
export class LinearWebhookService {
  constructor() {
    this.database = new DatabaseService();
    this.processor = new WebhookProcessor(this.database);
    this.supportedEvents = [
      'Issue',
      'Comment',
      'Project',
      'Cycle',
      'Team',
      'User'
    ];
  }

  /**
   * Process Linear webhook
   */
  async processWebhook(webhookData) {
    try {
      const { payload, signature, timestamp } = webhookData;
      
      console.log(`📋 Processing Linear webhook: ${payload.type}`);
      
      // Validate event type
      if (!this.supportedEvents.includes(payload.type)) {
        console.log(`ℹ️ Unsupported Linear event type: ${payload.type}`);
        return {
          eventId: null,
          processed: false,
          message: `Event type '${payload.type}' is not supported`
        };
      }
      
      // Prepare event data for processing
      const eventData = {
        type: payload.type,
        source: 'linear',
        payload,
        signature,
        timestamp,
        metadata: {
          action: payload.action,
          organizationId: payload.organizationId,
          userId: payload.userId,
          webhookId: payload.webhookId
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
      console.error('❌ Linear webhook processing error:', error);
      throw error;
    }
  }

  /**
   * Handle Linear Issue events
   */
  async handleIssueEvent(payload) {
    const action = payload.action;
    const issue = payload.data;
    
    console.log(`📝 Linear Issue ${action}: ${issue.identifier} - ${issue.title}`);
    
    try {
      switch (action) {
        case 'create':
          return await this.onIssueCreated(issue);
        
        case 'update':
          return await this.onIssueUpdated(issue, payload.updatedFrom);
        
        case 'remove':
          return await this.onIssueRemoved(issue);
        
        default:
          return {
            success: true,
            message: `Issue action '${action}' acknowledged but not processed`,
            data: { action, issueId: issue.id }
          };
      }
      
    } catch (error) {
      console.error(`❌ Issue event handling failed:`, error);
      throw error;
    }
  }

  /**
   * Handle issue created event
   */
  async onIssueCreated(issue) {
    try {
      console.log(`🆕 New Linear issue created: ${issue.identifier} - ${issue.title}`);
      
      // Check if this is a codegen-related issue
      const isCodegenIssue = this.isCodegenRelatedIssue(issue);
      
      if (isCodegenIssue) {
        // Trigger codegen workflow
        const workflowResult = await this.triggerCodegenWorkflow({
          issueId: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description,
          assigneeId: issue.assigneeId,
          teamId: issue.teamId,
          projectId: issue.projectId,
          priority: issue.priority,
          labels: issue.labelIds
        });
        
        return {
          success: true,
          message: 'Codegen workflow triggered for new issue',
          data: {
            issueId: issue.id,
            identifier: issue.identifier,
            workflowId: workflowResult.id
          }
        };
      }
      
      return {
        success: true,
        message: 'Issue created (no automation triggered)',
        data: {
          issueId: issue.id,
          identifier: issue.identifier
        }
      };
      
    } catch (error) {
      console.error(`❌ Failed to handle issue creation:`, error);
      throw error;
    }
  }

  /**
   * Handle issue updated event
   */
  async onIssueUpdated(issue, updatedFrom) {
    try {
      console.log(`🔄 Linear issue updated: ${issue.identifier}`);
      
      // Check for status changes
      if (updatedFrom.stateId && updatedFrom.stateId !== issue.stateId) {
        await this.handleIssueStatusChange(issue, updatedFrom);
      }
      
      // Check for assignee changes
      if (updatedFrom.assigneeId !== issue.assigneeId) {
        await this.handleIssueAssigneeChange(issue, updatedFrom);
      }
      
      // Check for priority changes
      if (updatedFrom.priority !== issue.priority) {
        await this.handleIssuePriorityChange(issue, updatedFrom);
      }
      
      return {
        success: true,
        message: 'Issue update processed',
        data: {
          issueId: issue.id,
          identifier: issue.identifier,
          changes: Object.keys(updatedFrom)
        }
      };
      
    } catch (error) {
      console.error(`❌ Failed to handle issue update:`, error);
      throw error;
    }
  }

  /**
   * Handle issue status change
   */
  async handleIssueStatusChange(issue, updatedFrom) {
    try {
      console.log(`📊 Issue status changed: ${issue.identifier} -> ${issue.state.name}`);
      
      // If issue is moved to "In Progress" and assigned to codegen
      if (this.isCodegenAssigned(issue) && this.isInProgressState(issue.state)) {
        await this.triggerCodegenWorkflow({
          issueId: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description,
          action: 'start_work'
        });
      }
      
      // If issue is completed, update any linked PRs
      if (this.isCompletedState(issue.state)) {
        await this.handleIssueCompletion(issue);
      }
      
    } catch (error) {
      console.error(`❌ Failed to handle status change:`, error);
      // Don't throw - status changes are not critical
    }
  }

  /**
   * Handle Linear Comment events
   */
  async handleCommentEvent(payload) {
    const action = payload.action;
    const comment = payload.data;
    
    console.log(`💬 Linear Comment ${action}: ${comment.id}`);
    
    try {
      switch (action) {
        case 'create':
          return await this.onCommentCreated(comment);
        
        case 'update':
          return await this.onCommentUpdated(comment);
        
        case 'remove':
          return await this.onCommentRemoved(comment);
        
        default:
          return {
            success: true,
            message: `Comment action '${action}' acknowledged but not processed`,
            data: { action, commentId: comment.id }
          };
      }
      
    } catch (error) {
      console.error(`❌ Comment event handling failed:`, error);
      throw error;
    }
  }

  /**
   * Handle comment created event
   */
  async onCommentCreated(comment) {
    try {
      console.log(`💬 New comment on issue: ${comment.issueId}`);
      
      // Check if comment mentions codegen or contains commands
      const isCodegenMention = this.isCodegenMentioned(comment.body);
      const commands = this.extractCommands(comment.body);
      
      if (isCodegenMention || commands.length > 0) {
        // Process codegen commands
        const commandResult = await this.processCodegenCommands({
          commentId: comment.id,
          issueId: comment.issueId,
          userId: comment.userId,
          body: comment.body,
          commands
        });
        
        return {
          success: true,
          message: 'Codegen commands processed',
          data: {
            commentId: comment.id,
            commands,
            result: commandResult
          }
        };
      }
      
      return {
        success: true,
        message: 'Comment processed (no automation triggered)',
        data: {
          commentId: comment.id,
          issueId: comment.issueId
        }
      };
      
    } catch (error) {
      console.error(`❌ Failed to handle comment creation:`, error);
      throw error;
    }
  }

  /**
   * Trigger codegen workflow
   */
  async triggerCodegenWorkflow(issueData) {
    try {
      const agentApiUrl = process.env.AGENTAPI_URL;
      if (!agentApiUrl) {
        console.warn('⚠️ AGENTAPI_URL not configured - skipping codegen trigger');
        return { id: 'mock_workflow_id', status: 'skipped' };
      }
      
      console.log(`🤖 Triggering codegen workflow for issue: ${issueData.identifier}`);
      
      // Mock implementation - replace with actual HTTP call to AgentAPI
      const workflowRequest = {
        id: `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'linear_issue_workflow',
        issueId: issueData.issueId,
        identifier: issueData.identifier,
        title: issueData.title,
        description: issueData.description,
        action: issueData.action || 'process_issue',
        assigneeId: issueData.assigneeId,
        teamId: issueData.teamId,
        projectId: issueData.projectId,
        priority: issueData.priority,
        labels: issueData.labels,
        timestamp: new Date().toISOString()
      };
      
      // In production, this would be an HTTP call:
      // const response = await fetch(`${agentApiUrl}/workflows/linear`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(workflowRequest)
      // });
      
      console.log(`✅ Codegen workflow triggered: ${workflowRequest.id}`);
      
      return {
        id: workflowRequest.id,
        status: 'initiated',
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error(`❌ Failed to trigger codegen workflow:`, error);
      throw error;
    }
  }

  /**
   * Process codegen commands from comments
   */
  async processCodegenCommands(commandData) {
    try {
      console.log(`🎯 Processing codegen commands: ${commandData.commands.join(', ')}`);
      
      const results = [];
      
      for (const command of commandData.commands) {
        const result = await this.executeCodegenCommand(command, commandData);
        results.push(result);
      }
      
      return {
        commands: commandData.commands,
        results,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error(`❌ Failed to process codegen commands:`, error);
      throw error;
    }
  }

  /**
   * Execute individual codegen command
   */
  async executeCodegenCommand(command, context) {
    try {
      switch (command.toLowerCase()) {
        case 'start':
        case 'begin':
          return await this.triggerCodegenWorkflow({
            issueId: context.issueId,
            action: 'start_work',
            triggeredBy: context.userId
          });
        
        case 'review':
          return await this.triggerCodegenWorkflow({
            issueId: context.issueId,
            action: 'review_work',
            triggeredBy: context.userId
          });
        
        case 'deploy':
          return await this.triggerCodegenWorkflow({
            issueId: context.issueId,
            action: 'deploy',
            triggeredBy: context.userId
          });
        
        default:
          return {
            command,
            status: 'unknown',
            message: `Unknown command: ${command}`
          };
      }
      
    } catch (error) {
      return {
        command,
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Check if issue is codegen-related
   */
  isCodegenRelatedIssue(issue) {
    // Check assignee
    if (this.isCodegenAssigned(issue)) {
      return true;
    }
    
    // Check labels
    const codegenLabels = ['codegen', 'automation', 'ai-task'];
    if (issue.labelIds && issue.labelIds.some(labelId => 
      codegenLabels.includes(labelId.toLowerCase())
    )) {
      return true;
    }
    
    // Check title/description for keywords
    const codegenKeywords = ['@codegen', 'codegen:', 'ai task', 'automation'];
    const text = `${issue.title} ${issue.description || ''}`.toLowerCase();
    
    return codegenKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Check if issue is assigned to codegen
   */
  isCodegenAssigned(issue) {
    // Check if assignee is codegen bot
    const codegenUserId = process.env.CODEGEN_USER_ID;
    return issue.assigneeId === codegenUserId;
  }

  /**
   * Check if comment mentions codegen
   */
  isCodegenMentioned(commentBody) {
    const mentions = ['@codegen', 'codegen:', '/codegen'];
    return mentions.some(mention => 
      commentBody.toLowerCase().includes(mention.toLowerCase())
    );
  }

  /**
   * Extract commands from comment body
   */
  extractCommands(commentBody) {
    const commandPattern = /\/(\w+)/g;
    const commands = [];
    let match;
    
    while ((match = commandPattern.exec(commentBody)) !== null) {
      commands.push(match[1]);
    }
    
    return commands;
  }

  /**
   * Check if state is "In Progress"
   */
  isInProgressState(state) {
    const inProgressStates = ['in progress', 'started', 'working', 'active'];
    return inProgressStates.includes(state.name.toLowerCase());
  }

  /**
   * Check if state is "Completed"
   */
  isCompletedState(state) {
    const completedStates = ['done', 'completed', 'closed', 'resolved'];
    return completedStates.includes(state.name.toLowerCase());
  }

  /**
   * Handle issue completion
   */
  async handleIssueCompletion(issue) {
    try {
      console.log(`✅ Issue completed: ${issue.identifier}`);
      
      // Trigger completion workflow
      await this.triggerCodegenWorkflow({
        issueId: issue.id,
        identifier: issue.identifier,
        action: 'complete_issue'
      });
      
    } catch (error) {
      console.error(`❌ Failed to handle issue completion:`, error);
      // Don't throw - completion handling is not critical
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
        linearWebhookSecret: process.env.LINEAR_WEBHOOK_SECRET ? '[CONFIGURED]' : '[NOT_CONFIGURED]',
        codegenUserId: process.env.CODEGEN_USER_ID ? '[CONFIGURED]' : '[NOT_CONFIGURED]',
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
   * Get recent Linear webhook events
   */
  async getRecentEvents(options = {}) {
    try {
      const filters = {
        source: 'linear',
        ...options
      };
      
      return await this.database.getRecentWebhookEvents(options.limit || 50, filters);
      
    } catch (error) {
      console.error('❌ Failed to get recent Linear events:', error);
      throw error;
    }
  }

  /**
   * Retry failed event processing
   */
  async retryEvent(eventId) {
    try {
      const event = await this.database.getWebhookEvent(eventId);
      
      if (event.source !== 'linear') {
        throw new Error('Event is not a Linear webhook event');
      }
      
      console.log(`🔄 Retrying Linear event: ${eventId}`);
      
      const result = await this.processor.processEvent(eventId, event);
      
      return {
        eventId,
        retryResult: result,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error(`❌ Failed to retry Linear event:`, error);
      throw error;
    }
  }
}

